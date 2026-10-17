/**
 * B21 signed webhooks (T-042 / ISS-085): a recoverable ledger for the two ways VC can durably
 * complete a write yet fail to notify the client about it, WITHOUT losing or silently degrading
 * anything already written:
 *
 *   1. "readback-gap" -- apps/api/src/server.ts's decideApproval reads back the facts
 *      applyApprovedDiff just wrote (@vc/db getFactsByIds) to build the fact.approved event from
 *      what was ACTUALLY persisted. getFactsByIds silently omits any id it can't find (its own
 *      docstring says so). Most of the time nothing is ever missing; on the rare occasions it is,
 *      the cause is either a legitimate B15 erasure fence racing the same request (correct
 *      behaviour, not a defect -- isStudentFenced tells the two apart, see server.ts's
 *      checkFactReadbackGap) or a real bug (replication lag, a concurrent write, an
 *      applyApprovedDiff defect). Only the second case is ever recorded here.
 *   2. "enqueue-failed" -- the outbox's OWN enqueue() call throws (a Mongo error, a full disk, a
 *      transient fault in the outbox's own store). The write the event describes already
 *      succeeded; losing the notification silently (the pre-T-042 behaviour) would violate B21
 *      ("the client keeps its own copy") with no trace anywhere. This ledger keeps the FULLY BUILT
 *      event so it can be replayed by hand, or by a future reconciliation job, without re-deriving
 *      anything.
 *
 * This is deliberately a SEPARATE collection from webhook_outbox, not a fallback write to the same
 * one: case 2 exists precisely because a write to webhook_outbox just failed, so retrying the exact
 * same write into the exact same collection is not a new failure mode, only the same one again. A
 * wholesale outage of the tenant's Mongo can still fail this ledger too -- there is no persistence
 * layer left once BOTH the primary outbox and this ledger are unreachable; that residual gap is
 * disclosed in qa/manifests/t-042-webhook-fact-loss.md's Open gaps, and the caller (server.ts) logs
 * a last-resort structured alert when it happens so it is at least never silent.
 *
 * Never delivers, retries or drains anything itself -- purely a durable, queryable record for a
 * human or a future reconciliation job to act on. `record` is idempotent by `id` (a retried request
 * hitting the same underlying failure twice, or a decideApproval replay, must not pile up duplicate
 * rows), the same discipline as WebhookOutbox.enqueue.
 */
import type { Db, Document, Filter } from "mongodb";
import { TenantScopeError, tenantIdOf } from "@vc/db";
import type { WebhookEvent } from "./schemas.js";

export type WebhookEmitGapKind = "readback-gap" | "enqueue-failed";

export interface WebhookEmitGapRecord {
  /** Idempotency key -- see module docstring. */
  id: string;
  kind: WebhookEmitGapKind;
  /** Flat, top-level field (unlike webhook_outbox's nested event.data.studentId) so B15 erasure
   * can purge this collection with the same plain `byStudent` filter consents/decisions use. */
  studentId: string;
  sessionId?: string;
  /** "readback-gap" only: the fact id that came back missing from getFactsByIds. */
  factId?: string;
  /** "enqueue-failed" only: the fully built event, so it can be replayed without rebuilding it. */
  event?: WebhookEvent;
  destinationUrl?: string;
  /** A short machine-readable label (e.g. `errorLabel(err)`-derived, or "missing-on-readback").
   * The erasure-fence-explained case never reaches this ledger at all (see module docstring). */
  detail: string;
  createdAt: string;
}

export type WebhookEmitGapInput = Omit<WebhookEmitGapRecord, "createdAt">;

export interface WebhookEmitGapLedger {
  record(input: WebhookEmitGapInput): Promise<void>;
  list(): Promise<WebhookEmitGapRecord[]>;
}

/** In-memory ledger for tests (B8/B13 -- no real network, no real DB). */
export class InMemoryWebhookEmitGapLedger implements WebhookEmitGapLedger {
  private readonly records = new Map<string, WebhookEmitGapRecord>();

  async record(input: WebhookEmitGapInput): Promise<void> {
    if (this.records.has(input.id)) return;
    this.records.set(input.id, { ...input, createdAt: new Date().toISOString() });
  }

  async list(): Promise<WebhookEmitGapRecord[]> {
    return Array.from(this.records.values());
  }
}

/** T-042: the collection name (also declared in packages/db COLLECTION_NAMES.webhook_emit_gaps --
 * kept as its own string here too, deliberately: packages/db must never depend on packages/engine,
 * the same reason WEBHOOK_OUTBOX_COLLECTION is duplicated rather than imported.
 * tests/webhooks-gaps-mongo.test.ts's drift guard proves the two stay equal. */
export const WEBHOOK_EMIT_GAPS_COLLECTION = "webhook_emit_gaps";

interface GapMongoDoc extends Document {
  _id: string;
  kind: WebhookEmitGapKind;
  studentId: string;
  sessionId?: string;
  factId?: string;
  event?: WebhookEvent;
  destinationUrl?: string;
  detail: string;
  createdAt: string;
}

function toRecord(doc: GapMongoDoc): WebhookEmitGapRecord {
  const { _id, kind, studentId, sessionId, factId, event, destinationUrl, detail, createdAt } = doc;
  return { id: _id, kind, studentId, sessionId, factId, event, destinationUrl, detail, createdAt };
}

/**
 * Mongo-backed WebhookEmitGapLedger (T-042), over a Db already scoped to exactly one tenant
 * (tenantScopedDb), mirroring MongoWebhookOutbox: the wrapper stamps tenantId and prefixes `_id`
 * itself, so this class does no tenant-scoping of its own on purpose. Throws TenantScopeError up
 * front if `db` is not tenant-scoped, so a caller can never accidentally hand this an unscoped
 * (cross-tenant) Db.
 */
export class MongoWebhookEmitGapLedger implements WebhookEmitGapLedger {
  private readonly db: Db;

  constructor(db: Db) {
    if (tenantIdOf(db) === undefined) {
      throw new TenantScopeError("MongoWebhookEmitGapLedger requires a tenant-scoped Db (tenantScopedDb)");
    }
    this.db = db;
  }

  private collection() {
    return this.db.collection<GapMongoDoc>(WEBHOOK_EMIT_GAPS_COLLECTION);
  }

  /** Idempotent by `id`: a duplicate record() call (the same underlying failure recorded twice)
   * never creates a second row. A concurrent duplicate insert loses the unique `_id` index (11000)
   * and is treated as already-recorded, race-free, exactly like MongoWebhookOutbox.enqueue. */
  async record(input: WebhookEmitGapInput): Promise<void> {
    const doc: GapMongoDoc = {
      _id: input.id,
      kind: input.kind,
      studentId: input.studentId,
      sessionId: input.sessionId,
      factId: input.factId,
      event: input.event,
      destinationUrl: input.destinationUrl,
      detail: input.detail,
      createdAt: new Date().toISOString(),
    };
    try {
      await this.collection().insertOne(doc);
    } catch (err) {
      if ((err as { code?: unknown } | null)?.code === 11000) return;
      throw err;
    }
  }

  async list(): Promise<WebhookEmitGapRecord[]> {
    const docs = (await this.collection().find({} as Filter<GapMongoDoc>).toArray()) as GapMongoDoc[];
    return docs.map(toRecord);
  }
}
