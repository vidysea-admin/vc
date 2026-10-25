/**
 * B21 signed webhooks (D-021): a pluggable outbox interface. T-027 shipped the in-memory
 * implementation, for tests. T-034 adds the Mongo-backed one (MongoWebhookOutbox), through the
 * tenant-scoped Db from T-025 (packages/db/src/tenant.ts tenantScopedDb). Any implementation only
 * needs to store what delivery.ts's `deliverWebhookEvent` reads back: the event (never
 * re-serialized, so a Mongo implementation must round-trip it byte-identical too) and delivery
 * bookkeeping keyed by the event's own idempotency key (`event.id`).
 */
import type { Db, Document, Filter } from "mongodb";
import { TenantScopeError, tenantIdOf } from "@vc/db";
import type { WebhookEvent } from "./schemas.js";

export type OutboxRecordStatus = "pending" | "delivered" | "failed" | "dead";

export interface OutboxRecord {
  /** Always equal to `event.id` — the idempotency key (B21). */
  id: string;
  event: WebhookEvent;
  destinationUrl: string;
  status: OutboxRecordStatus;
  attempts: number;
  lastStatus?: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export type OutboxRecordInput = Pick<OutboxRecord, "id" | "event" | "destinationUrl">;

export type OutboxRecordPatch = Partial<
  Pick<OutboxRecord, "status" | "attempts" | "lastStatus" | "lastError">
>;

/** A pluggable delivery ledger. `enqueue` is idempotent by `id`: enqueuing the same id twice never
 * creates a second row or resets an in-flight record's bookkeeping — it returns the existing row. */
export interface WebhookOutbox {
  enqueue(record: OutboxRecordInput): Promise<OutboxRecord>;
  get(id: string): Promise<OutboxRecord | undefined>;
  update(id: string, patch: OutboxRecordPatch): Promise<OutboxRecord>;
  list(statuses?: readonly OutboxRecordStatus[]): Promise<OutboxRecord[]>;
}

/**
 * w1-erasure-outbox E2 (ISS-t-034-de-1): how long a SETTLED (delivered / dead) outbox row is kept
 * before purgeSettledWebhookOutbox removes it. Default 30 days. pending / failed rows are never
 * purged by age: they are undelivered work (and B15 erasure holds on them).
 */
export const WEBHOOK_OUTBOX_RETENTION_MS = 30 * 24 * 3600 * 1000;

/** An outbox that can drop settled rows last touched before an ISO cutoff; returns the count removed. */
export interface SettledPurgingOutbox {
  purgeSettled(beforeIso: string): Promise<number>;
}

/**
 * Purges delivered / dead rows whose `updatedAt` is older than the retention window, so history
 * stops growing with the all-time event count. One tenant per outbox (MongoWebhookOutbox is
 * tenant-scoped), so a scheduler calls this once per tenant. Returns the number removed.
 */
export async function purgeSettledWebhookOutbox(
  outbox: SettledPurgingOutbox,
  options: { now?: Date; retentionMs?: number } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const retentionMs = options.retentionMs ?? WEBHOOK_OUTBOX_RETENTION_MS;
  return outbox.purgeSettled(new Date(now.getTime() - retentionMs).toISOString());
}

/** In-memory WebhookOutbox for tests (B8/B13 — no real network, no real DB). */
export class InMemoryWebhookOutbox implements WebhookOutbox, SettledPurgingOutbox {
  private readonly records = new Map<string, OutboxRecord>();

  async enqueue(input: OutboxRecordInput): Promise<OutboxRecord> {
    const existing = this.records.get(input.id);
    if (existing) return existing;
    const now = new Date().toISOString();
    const record: OutboxRecord = {
      ...input,
      status: "pending",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(input.id, record);
    return record;
  }

  async get(id: string): Promise<OutboxRecord | undefined> {
    return this.records.get(id);
  }

  async update(id: string, patch: OutboxRecordPatch): Promise<OutboxRecord> {
    const existing = this.records.get(id);
    if (!existing) throw new Error(`InMemoryWebhookOutbox.update: no record for id "${id}"`);
    const updated: OutboxRecord = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.records.set(id, updated);
    return updated;
  }

  async list(statuses?: readonly OutboxRecordStatus[]): Promise<OutboxRecord[]> {
    return Array.from(this.records.values()).filter((record) => statuses === undefined || statuses.includes(record.status));
  }

  async purgeSettled(beforeIso: string): Promise<number> {
    let removed = 0;
    for (const [id, record] of this.records) {
      if ((record.status === "delivered" || record.status === "dead") && record.updatedAt < beforeIso) {
        this.records.delete(id);
        removed += 1;
      }
    }
    return removed;
  }
}

/** T-034: the collection name (also in packages/db COLLECTION_NAMES.webhook_outbox — kept as its
 * own string here too, deliberately: packages/db must never depend on packages/engine, so this
 * module cannot import the constant, only match it. tests/webhooks-outbox-mongo.test.ts's drift
 * guard proves the two stay equal. */
export const WEBHOOK_OUTBOX_COLLECTION = "webhook_outbox";

interface OutboxMongoDoc extends Document {
  _id: string;
  event: WebhookEvent;
  destinationUrl: string;
  status: OutboxRecordStatus;
  attempts: number;
  lastStatus?: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

function toRecord(doc: OutboxMongoDoc): OutboxRecord {
  const { _id, event, destinationUrl, status, attempts, lastStatus, lastError, createdAt, updatedAt } = doc;
  return { id: _id, event, destinationUrl, status, attempts, lastStatus, lastError, createdAt, updatedAt };
}

/**
 * Mongo-backed WebhookOutbox (T-034), over a Db already scoped to exactly one tenant
 * (tenantScopedDb — packages/db/src/tenant.ts). That wrapper is what actually gives every record a
 * top-level tenantId (ISS-t-027-rev-3): it stamps `tenantId` on every insert, folds it into every
 * filter, and qualifies the string `_id` with the tenant prefix — so this class does none of that
 * itself on purpose. Duplicating tenant-scoping logic here would be a second place to get it wrong;
 * `db` failing closed (tenant.ts's `failClosed`) on anything this class does not expect is the
 * safety net. Throws TenantScopeError up front if `db` is not tenant-scoped at all, so a caller can
 * never accidentally hand this an unscoped (cross-tenant) Db.
 */
export class MongoWebhookOutbox implements WebhookOutbox, SettledPurgingOutbox {
  private readonly db: Db;

  constructor(db: Db) {
    if (tenantIdOf(db) === undefined) {
      throw new TenantScopeError("MongoWebhookOutbox requires a tenant-scoped Db (tenantScopedDb)");
    }
    this.db = db;
  }

  private collection() {
    return this.db.collection<OutboxMongoDoc>(WEBHOOK_OUTBOX_COLLECTION);
  }

  /** Idempotent by `id` (B21): a duplicate enqueue never creates a second row or resets an
   * in-flight record's bookkeeping. A concurrent duplicate insert loses the unique `_id` index
   * (11000) and is read back as success, exactly like the in-memory implementation's read-before-
   * write, but race-free. */
  async enqueue(input: OutboxRecordInput): Promise<OutboxRecord> {
    const now = new Date().toISOString();
    const doc: OutboxMongoDoc = {
      _id: input.id,
      event: input.event,
      destinationUrl: input.destinationUrl,
      status: "pending",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await this.collection().insertOne(doc);
      return toRecord(doc);
    } catch (err) {
      if ((err as { code?: unknown } | null)?.code === 11000) {
        const existing = await this.get(input.id);
        if (existing) return existing;
      }
      throw err;
    }
  }

  async get(id: string): Promise<OutboxRecord | undefined> {
    const doc = await this.collection().findOne({ _id: id } as Filter<OutboxMongoDoc>);
    return doc ? toRecord(doc as OutboxMongoDoc) : undefined;
  }

  async update(id: string, patch: OutboxRecordPatch): Promise<OutboxRecord> {
    const updated = await this.collection().findOneAndUpdate(
      { _id: id } as Filter<OutboxMongoDoc>,
      { $set: { ...patch, updatedAt: new Date().toISOString() } },
      { returnDocument: "after" },
    );
    // The real driver's findOneAndUpdate (without includeResultMetadata) resolves the document
    // itself, or null — the tenant-scoped wrapper (tenant.ts) already unwraps to that shape, so
    // this matches both it and the raw driver.
    const doc = updated as OutboxMongoDoc | null;
    if (!doc) throw new Error(`MongoWebhookOutbox.update: no record for id "${id}"`);
    return toRecord(doc);
  }

  async list(statuses?: readonly OutboxRecordStatus[]): Promise<OutboxRecord[]> {
    const docs = (await this.collection().find(statuses === undefined ? {} : { status: { $in: [...statuses] } }).toArray()) as OutboxMongoDoc[];
    return docs.map(toRecord);
  }

  /** Deletes this tenant's delivered / dead rows with `updatedAt` before `beforeIso` (ISO strings sort chronologically). */
  async purgeSettled(beforeIso: string): Promise<number> {
    const res = await this.collection().deleteMany({
      status: { $in: ["delivered", "dead"] },
      updatedAt: { $lt: beforeIso },
    } as Filter<OutboxMongoDoc>);
    return res.deletedCount ?? 0;
  }
}
