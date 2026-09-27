#!/usr/bin/env tsx
/**
 * LIVE DB init script for `virtual_counsellor` on the production Mongo server
 * (contract B12, D-008/D-009, qa/gates/mongo-host.md).
 *
 * THIS SCRIPT IS WRITTEN BUT NOT RUN BY T-003/T-003b. It connects to a real
 * server — running it is an explicit, separate, human-invoked action. See
 * packages/db/README.md for the documented command.
 *
 * `INDEX_PLAN` below is a plain data array (no Mongo, no side effects) so
 * offline tests (tests/db-init.test.ts, ISS-027) can import and introspect it
 * without connecting to anything (contract B8). `main()` only runs when this
 * file is executed directly (the entrypoint check at the bottom) — importing
 * it for `INDEX_PLAN` never triggers a connection attempt.
 *
 * The plan creates the engine's collections (if missing) and this index set:
 *   - facts:    UNIQUE partial index on { tenantId, studentId, key } where
 *               `active: true` — at most one open fact per (studentId, key)
 *               (ISS-019, D-013: an open fact carries `active: true`; retiring
 *               it sets validTo and unsets `active` in one CAS update. A
 *               `{validTo: {$exists: false}}` filter is NOT allowed in a
 *               partial index by the server, so it can not be the filter). This is what makes a concurrent-writer race a real
 *               Mongo duplicate-key error (code 11000) instead of silently
 *               producing two open facts; src/facts.ts's applyApprovedDiff
 *               handles that error deterministically (see its docstring).
 *               PLUS a plain (non-partial) { studentId } index (ISS-027) —
 *               the unique partial index above only covers OPEN facts, so a
 *               query across a student's full fact history (including
 *               superseded ones) needs its own, unrestricted index.
 *               NO index on { studentId, key, contentHash } (D-012): no query
 *               filters on `contentHash`. applyApprovedDiff reads the ACTIVE
 *               fact by { studentId, key, active: true } (served by the
 *               unique partial index above) and compares its contentHash in
 *               memory, so such an index would only cost writes. Add it if a
 *               future reader ever queries history by content.
 *   - sessions, decisions, students: plain { studentId } index each
 *               (ISS-027) — every studentId-bearing collection gets a lookup
 *               index; consents already had one.
 *   - consents: { studentId } — fast lookup for requireConsent().
 *   - scribe_resolutions: UNIQUE { tenantId, threadId } (ISS-t-007-rev-8, T-025) -- the atomic
 *               approval claim for a scribe thread; plus a plain { studentId }.
 *   - scribe_checkpoints / scribe_checkpoint_writes: the MongoDBSaver.setup()
 *               indexes, verbatim (T-011: erasure deletes by thread_id).
 *   - erasure_requests: { studentId } (open requests only) and
 *               { status, requestedAt } (T-011 audit log).
 *   - erasure_requests: UNIQUE { tenantId, studentKey } among open statuses (D-016: one open request per tenant+student).
 *   - erasure_fences: no secondary index (its _id is the hashed student key; D-015/D-016).
 *   - edges:    relies on Mongo's built-in unique _id index for idempotent
 *               link() upserts, PLUS { "from.kind", "from.id" } and
 *               { "to.kind", "to.id" } (ISS-021) so a lookup of "everything
 *               sourced from X" or "everything pointing at Y" isn't a full
 *               collection scan.
 *               ERASURE NOTE (B15, for T-011): edge docs carry no studentId.
 *               Erasing a student's edges resolves in TWO hops: first collect
 *               the student's fact _ids (facts by studentId, full history)
 *               and session ids (sessions by studentId), then delete edges
 *               whose from.id or to.id is one of those ids, plus the
 *               student --has--> edges ({ "from.kind": "student",
 *               "from.id": studentId }). The edges_from / edges_to indexes
 *               below serve both hops.
 *
 * It never calls db.dropDatabase() (D-009: that stays human-gated) and never
 * touches any database other than virtual_counsellor (getVcDb enforces this).
 */
import { fileURLToPath } from "node:url";
import { connectFromEnv } from "../src/client.js";
import { COLLECTION_NAMES } from "../src/collections.js";

export interface IndexSpec {
  collection: string;
  keys: Record<string, 1 | -1>;
  name: string;
  unique?: boolean;
  partialFilterExpression?: Record<string, unknown>;
}

/**
 * The full index plan as data, so it can be introspected offline
 * (tests/db-init.test.ts, ISS-027) and executed for real by `main()` below —
 * a single source of truth for both.
 */
export const INDEX_PLAN: IndexSpec[] = [
  // ISS-019 + D-013: unique among docs with `active: true` — at most one
  // open fact per (studentId, key). NOT `{validTo: {$exists: false}}`: the
  // server rejects `$exists: false` in a partialFilterExpression (it becomes
  // `$not`), so that index could never be created.
  // T-025 (B21 tenancy): every UNIQUE index leads with tenantId, so two tenants' documents never
  // collide (a cross-tenant 11000 would be an existence oracle). The names changed with the keys:
  // a live database built from the old plan must have the old unique indexes dropped before these
  // are created. That drop is a human-gated step (not run by any test or by this unit).
  {
    collection: COLLECTION_NAMES.facts,
    keys: { tenantId: 1, studentId: 1, key: 1 },
    name: "facts_tenantId_studentId_key_active_true_unique",
    unique: true,
    partialFilterExpression: { active: true },
  },
  // ISS-027: plain studentId indexes on every studentId-bearing collection
  // (consents already had one).
  { collection: COLLECTION_NAMES.facts, keys: { studentId: 1 }, name: "facts_studentId" },
  { collection: COLLECTION_NAMES.sessions, keys: { studentId: 1 }, name: "sessions_studentId" },
  { collection: COLLECTION_NAMES.decisions, keys: { studentId: 1 }, name: "decisions_studentId" },
  { collection: COLLECTION_NAMES.students, keys: { studentId: 1 }, name: "students_studentId" },
  { collection: COLLECTION_NAMES.consents, keys: { studentId: 1 }, name: "consents_studentId" },
  // ISS-t-007-rev-8: the scribe approval claim. UNIQUE on threadId (no partial filter: every
  // claim counts), so a concurrent second resume of the same thread gets 11000 and loses.
  // Plus the ISS-027 plain studentId index (B15/T-011 erasure finds a student's claims).
  {
    collection: COLLECTION_NAMES.scribe_resolutions,
    keys: { tenantId: 1, threadId: 1 },
    name: "scribe_resolutions_tenantId_threadId_unique",
    unique: true,
  },
  { collection: COLLECTION_NAMES.scribe_resolutions, keys: { studentId: 1 }, name: "scribe_resolutions_studentId" },
  // T-011 / ISS-t-007-rev-6: EXACTLY the indexes LangGraph's MongoDBSaver.setup() creates
  // (@langchain/langgraph-checkpoint-mongodb dist/checkpoint.js, same keys and names), so a later
  // setup() is a no-op and B15 erasure's {thread_id: {$in: [...]}} read/delete is index-served
  // even if setup() is never called (the index leads with thread_id).
  {
    collection: COLLECTION_NAMES.scribe_checkpoints,
    keys: { thread_id: 1, checkpoint_ns: 1, checkpoint_id: -1 },
    name: "thread_ns_checkpoint_idx",
  },
  {
    collection: COLLECTION_NAMES.scribe_checkpoint_writes,
    keys: { thread_id: 1, checkpoint_ns: 1, checkpoint_id: 1, task_id: 1, idx: 1 },
    name: "thread_ns_checkpoint_task_idx",
  },
  // T-011 / B15: the erasure audit log. studentId is present only while a request is open
  // (unset on verified completion), so this index only ever holds open requests' ids.
  { collection: COLLECTION_NAMES.erasure_requests, keys: { studentId: 1 }, name: "erasure_requests_studentId" },
  { collection: COLLECTION_NAMES.erasure_requests, keys: { status: 1, requestedAt: 1 }, name: "erasure_requests_status" },
  // D-016 / ISS-t-011-c2-rev-4: ONE open request per student. UNIQUE on the fence key among open
  // statuses; a completed row leaves the index (and has studentKey unset). `$in` is a supported
  // partialFilterExpression operator (D-013; MongoDB 6.0+), `$ne`/`$nin`/`$exists:false` are not.
  {
    collection: COLLECTION_NAMES.erasure_requests,
    keys: { tenantId: 1, studentKey: 1 },
    name: "erasure_requests_open_tenantId_studentKey_unique",
    unique: true,
    // T-029: every OPEN status of the approver workflow (rejected / expired / completed leave it).
    partialFilterExpression: { status: { $in: ["pending", "confirmed", "awaiting_approval", "approved", "failed"] } },
  },
  // T-011 cycle 2 / D-015: the erasure write fence has NO secondary index: its _id IS the hashed
  // student key, so every fence read is an _id point read (ISS-t-011-c2-rev-3 removed the redundant
  // unique studentKey index).
  // ISS-t-011-c1-rev-3 (index note): `sessions` has NO sessionId index, deliberately. Every
  // erasure/export query on sessions carries studentId ({studentId} to resolve, {studentId, $or:
  // [_id $in, sessionId $in]} to delete), so sessions_studentId serves them; the _id arm is the
  // built-in _id index. Add {sessionId: 1} only if a query ever filters on sessionId alone.
  // ISS-021: edges had no from/to index.
  // T-024 / ISS-t-013r-c0-3: the readable transcript. { studentId } serves B15 erasure/export and the
  // read-back; { studentId, sessionId, ts } serves readSessionTranscript's ordered read. NEVER an auto-expiry
  // (TTL) index here or on the checkpoint collections — tests/db-init.test.ts fails
  // if one is ever added (D-020: the full chat is kept until an erasure deletes it).
  { collection: COLLECTION_NAMES.session_transcripts, keys: { studentId: 1 }, name: "session_transcripts_studentId" },
  {
    collection: COLLECTION_NAMES.session_transcripts,
    keys: { studentId: 1, sessionId: 1, ts: 1 },
    name: "session_transcripts_student_session_ts",
  },
  { collection: COLLECTION_NAMES.edges, keys: { "from.kind": 1, "from.id": 1 }, name: "edges_from" },
  { collection: COLLECTION_NAMES.edges, keys: { "to.kind": 1, "to.id": 1 }, name: "edges_to" },
  // T-034 (B21 Events, ISS-t-027-rev-3): the webhook delivery queue. `_id` is the event's own
  // idempotency key (unique via Mongo's built-in _id index, tenant-qualified by tenantScopedDb, so
  // no extra unique index is needed here). tenantId leads the plain index below because every query
  // through tenantScopedDb carries it — this serves the delivery worker's per-tenant "drain the
  // pending/failed rows" scan without a collection scan.
  {
    collection: COLLECTION_NAMES.webhook_outbox,
    keys: { tenantId: 1, status: 1 },
    name: "webhook_outbox_tenantId_status",
  },
  // B15 erasure (ERASURE_PLAN, packages/db/src/erasure.ts): the student is one level down at
  // `event.data.studentId`, not a top-level field, so the delete/residue filter is a dotted-path
  // query rather than the plain {studentId} shape most direct rows use; this index serves it.
  {
    collection: COLLECTION_NAMES.webhook_outbox,
    keys: { "event.data.studentId": 1 },
    name: "webhook_outbox_event_data_studentId",
  },
  // T-042 (ISS-085): the recoverable webhook-emit-gap ledger. `studentId` is a flat top-level field
  // here (see collections.ts's comment), so a plain {studentId:1} index serves both B15 erasure's
  // byStudent filter and an operator's own lookup, mirroring session_transcripts/consents. The
  // second index serves a reconciliation job's "everything still unresolved for this tenant, by
  // kind" scan, the same role webhook_outbox_tenantId_status serves for delivery.
  { collection: COLLECTION_NAMES.webhook_emit_gaps, keys: { studentId: 1 }, name: "webhook_emit_gaps_studentId" },
  { collection: COLLECTION_NAMES.webhook_emit_gaps, keys: { tenantId: 1, kind: 1 }, name: "webhook_emit_gaps_tenantId_kind" },
];

async function ensureCollection(db: import("mongodb").Db, name: string): Promise<void> {
  try {
    await db.createCollection(name);
  } catch (err) {
    const codeName = (err as { codeName?: string } | undefined)?.codeName;
    if (codeName !== "NamespaceExists") throw err;
  }
}

/**
 * T-014 / ISS-t-011-c3-rev-4: the lowest server version this plan is known to run on. The
 * `erasure_requests_open_tenantId_studentKey_unique` index's partial filter uses `$in`, which the MongoDB
 * manual (core/index-partial, checked 2026-09-25, D-013) documents as supported only from
 * MongoDB 6.0. Below that, `createIndex` for that one index fails at the bottom of the loop below,
 * after every earlier collection/index in the plan has already been created — a confusing partial
 * state to debug from. Checking buildInfo first fails loudly, up front, naming the real cause.
 */
export const MIN_SERVER_VERSION = "6.0.0";

export class UnsupportedServerVersionError extends Error {
  constructor(
    readonly version: string,
    readonly required: string = MIN_SERVER_VERSION,
  ) {
    super(
      `db-init: server version "${version}" is below the required ${required} — the ` +
        `erasure_requests_open_tenantId_studentKey_unique partial index uses "$in", which MongoDB only ` +
        `supports in a partialFilterExpression from 6.0 (D-013). Refusing to run against this server.`,
    );
    this.name = "UnsupportedServerVersionError";
  }
}

/**
 * Numeric (not lexicographic) major.minor.patch comparison — `"6.10.0" >= "6.9.0"` must be true,
 * which plain string comparison would get backwards. A missing/non-numeric component is treated
 * as 0.
 */
export function isServerVersionAtLeast(version: string, required: string = MIN_SERVER_VERSION): boolean {
  const parse = (v: string): [number, number, number] => {
    const [maj = 0, min = 0, patch = 0] = v.split(".").map((part) => Number.parseInt(part, 10) || 0);
    return [maj, min, patch];
  };
  const [vMaj, vMin, vPatch] = parse(version);
  const [rMaj, rMin, rPatch] = parse(required);
  if (vMaj !== rMaj) return vMaj > rMaj;
  if (vMin !== rMin) return vMin > rMin;
  return vPatch >= rPatch;
}

/**
 * Reads the connected server's version via `db.admin().buildInfo()` (no side effects — a plain
 * read) and throws UnsupportedServerVersionError if it is below MIN_SERVER_VERSION. Takes the
 * driver's own `Db` shape (`{admin(): {buildInfo(): Promise<{version?: unknown}>}}`) so an offline
 * test can exercise it against `@vc/db/testing`'s FakeDb (its `admin().buildInfo()` stub) without
 * ever touching a real server.
 */
export async function assertServerVersionSupportsPartialIn(
  db: Pick<import("mongodb").Db, "admin">,
): Promise<void> {
  const info: unknown = await db.admin().buildInfo();
  const version = typeof (info as { version?: unknown } | null)?.version === "string" ? (info as { version: string }).version : "0.0.0";
  if (!isServerVersionAtLeast(version)) {
    throw new UnsupportedServerVersionError(version);
  }
}

/**
 * T-015 / ISS-t-014-rev-1: an explicit per-op timeoutMS for createIndex, larger than the client's
 * own DEFAULT_MONGO_CLIENT_TIMEOUT_MS (client.ts, 30s — D-016's fence margin, sized for a fenced
 * writer's post-check, not an index build). Building a unique/partial index on a collection that
 * already holds data can take meaningfully longer than that. This script is never run
 * automatically (only by a human, per the file banner and README) and only ever builds indexes
 * once per shape change, so generous headroom here costs nothing in the steady state and avoids a
 * spurious timeout aborting an otherwise-healthy (if slow) index build.
 */
export const DB_INIT_CREATE_INDEX_TIMEOUT_MS = 120_000;

/**
 * The createIndex loop, split out from main() so it is importable and testable offline against
 * `@vc/db/testing`'s FakeDb (ISS-t-014-rev-1) without ever connecting to a real server — `db` only
 * needs the driver's `collection(name).createIndex(...)` shape. `main()` below is the only caller
 * that passes a real, connected Db.
 */
export async function createPlannedIndexes(
  db: Pick<import("mongodb").Db, "collection">,
  plan: readonly IndexSpec[] = INDEX_PLAN,
): Promise<void> {
  for (const spec of plan) {
    await db.collection(spec.collection).createIndex(spec.keys, {
      name: spec.name,
      unique: spec.unique,
      partialFilterExpression: spec.partialFilterExpression,
      timeoutMS: DB_INIT_CREATE_INDEX_TIMEOUT_MS,
    });
  }
}

async function main(): Promise<void> {
  const { client, db } = connectFromEnv(process.env);
  await client.connect();
  try {
    // ISS-t-011-c3-rev-4: fail loudly, up front — before touching any collection or index — if the
    // server can not support the plan's one $in partial index.
    await assertServerVersionSupportsPartialIn(db);
    for (const name of Object.values(COLLECTION_NAMES)) {
      await ensureCollection(db, name);
    }

    await createPlannedIndexes(db);

    // eslint-disable-next-line no-console
    console.log(`db-init: "${COLLECTION_NAMES.facts}", "${COLLECTION_NAMES.consents}" and sibling collections ready in virtual_counsellor`);
  } finally {
    await client.close();
  }
}

// Only run against a real server when this file is executed directly (e.g.
// `pnpm db:init`) — never as a side effect of importing it, so offline tests
// can read `INDEX_PLAN` without connecting to anything (contract B8).
const isMainModule = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("db-init failed:", err);
    process.exit(1);
  });
}
