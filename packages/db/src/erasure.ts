/**
 * DPDP erasure and export (contract B15, T-011; design answer in qa/gates/dpdp-erase-design.md:
 * "hard delete with confirmation and verification").
 *
 * Flow: requestErasure (pending) -> confirmErasure by a DIFFERENT actor (confirmed) ->
 * executeErasure: hard-delete every document for the student in every engine collection, read
 * every collection back with the same selectors, and store a counts-only receipt. An
 * unconfirmed request deletes nothing.
 *
 * ## The audit row (`erasure_requests`) and why it holds no personal data after completion
 * The row is the audit log, so it must survive the erasure. It holds:
 *   - `_id`: an opaque request id (ObjectId hex), not derived from the student;
 *   - `studentHash` + `hashSalt`: sha256 over a domain tag, a random per-request salt and the
 *     studentId. Someone who already knows a studentId can prove a completed row was for that
 *     student (`erasureRequestMatchesStudent`), but the row alone does not reveal it, and two
 *     requests for one student can not be linked to each other without the id. Residual risk:
 *     studentIds are internal, not secret, so an attacker holding a list of candidate ids can
 *     test each against a row (a dictionary check). A keyed hash (HMAC with a secret from .env)
 *     would close that and is a follow-up option, not a requirement of B15;
 *   - `requestedBy` / `confirmedBy`: staff actor ids (the student is never the actor id; a
 *     student's own request is logged by the staff member who took it, reason "student_request");
 *   - `reason`: a closed code (ErasureReasonSchema), never free text;
 *   - timestamps, `status`, `attempts`, and the last `receipt` (counts only).
 *   - `studentId` in clear, ONLY while the request is open (pending / confirmed / failed): the
 *     purge needs it, and the student's data still exists at that point anyway. It is `$unset`
 *     in the same update that marks the request completed.
 *
 * ## Ordering, partial failure and idempotent retry
 * Edges and scribe checkpoints carry no studentId: they are found through the student's fact
 * ids, session ids and scribe thread ids, which are read from facts / sessions /
 * scribe_resolutions. If those anchor collections were purged while a dependent delete failed,
 * a retry could no longer find the orphaned dependents. So the plan runs in two phases:
 *   1. dependents + direct rows: consents FIRST (so processing is blocked for the whole erasure,
 *      B4), decisions, edges, scribe_checkpoints, scribe_checkpoint_writes;
 *   2. anchors: facts, sessions, scribe_resolutions, students. Only if every phase-1 step
 *      succeeded; otherwise they are `deferred` and left intact for the retry.
 * Each step is attempted independently and its error is recorded (name/code only: driver
 * messages can echo filter values). Any failed or deferred step, or any non-zero read-back,
 * marks the request `failed` (retryable, studentId kept) and THROWS ErasureIncompleteError
 * carrying the receipt, so a caller can not ignore it. deleteMany is idempotent, so a retry
 * re-runs every step safely. A completed request returns its stored receipt on any later call.
 *
 * ## Concurrent writers: the stable loop (T-011 cycle 1, ISS-t-011-rev-3)
 * No multi-document transactions (D-008/D-009): each deleteMany is its own operation, and a
 * writer can add a fact / session / claim / edge / checkpoint for the student mid-erasure. If
 * anchors were deleted by studentId, a fact that arrived after the resolve would be deleted
 * while its edges (found only through its id) survived as permanent orphans. So:
 *   - anchors are deleted by the ids RESOLVED this round, never by studentId, so a late anchor
 *     survives the round together with its dependents;
 *   - ids accumulate across rounds (never re-resolved to a smaller set), so a dependent written
 *     after its anchor was deleted is still found;
 *   - the read-back uses the accumulated ids for dependents and studentId for anchors (so a late
 *     anchor shows); a non-zero read-back starts another round, up to ERASURE_MAX_ROUNDS;
 *   - if the attempt ends unclean, the accumulated ids are stored on the failed row
 *     (`carriedSelectors`) and merged into the retry: a deleted anchor can not be re-resolved.
 * Writes that land AFTER a verified completion (e.g. a scribe thread resumed later) are outside
 * any erasure; stopping them is the caller's job.
 *
 * ## Concurrent executeErasure calls (ISS-t-011-c0-1)
 * The final row update is a CAS on {status, attempts} and its result is checked (as in
 * confirmErasure). A run that loses to a concurrent completion returns the STORED receipt with
 * `alreadyCompleted: true` and records nothing; a run that loses to a concurrent failure records
 * itself as the next attempt. So `attempts` counts recorded attempts, and every receipt a caller
 * is handed as "completed" is the one persisted in the audit row.
 *
 * B12: this is ordinary CRUD inside virtual_counsellor (bulk delete included); nothing here calls
 * dropDatabase or drops a collection.
 */
import { ObjectId, type Db, type Document, type Filter } from "mongodb";
import { createHash, randomBytes } from "node:crypto";
import {
  ErasureReasonSchema,
  ErasureReceiptSchema,
  type ErasureCollectionLine,
  type ErasureReason,
  type ErasureReceipt,
  type ErasureStatus,
} from "@vc/schemas";
import {
  COLLECTION_NAMES,
  type ConsentDoc,
  type DecisionDoc,
  type FactDoc,
  type ScribeResolutionDoc,
  type SessionDoc,
  type StudentDoc,
} from "./collections.js";
import type { EdgeDoc } from "./edges.js";

// ---------------------------------------------------------------------------
// Audit row
// ---------------------------------------------------------------------------

export interface ErasureRequestDoc {
  _id: string;
  studentHash: string;
  hashSalt: string;
  hashScheme: typeof HASH_SCHEME;
  /** Present only while the request is open; unset on completion. */
  studentId?: string;
  requestedBy: string;
  reason: ErasureReason;
  requestedAt: string;
  status: ErasureStatus;
  confirmedBy?: string;
  confirmedAt?: string;
  attempts: number;
  lastAttemptAt?: string;
  completedAt?: string;
  receipt?: ErasureReceipt;
  /**
   * Present only while the request is `failed`: every fact / session / thread id the failed
   * attempt resolved. A deleted anchor can not be re-resolved from the database, so a retry
   * merges these in to still find a dependent written after its anchor was deleted
   * (ISS-t-011-rev-3). Unset on completion, together with studentId.
   */
  carriedSelectors?: CarriedSelectors;
}

const HASH_SCHEME = "sha256(vc-erasure-v1|salt|studentId)" as const;

function hashStudentId(studentId: string, salt: string): string {
  return createHash("sha256").update(`vc-erasure-v1|${salt}|${studentId}`).digest("hex");
}

/** True if `row` is a request for `studentId` (recomputes the salted hash; the row holds no clear id once done). */
export function erasureRequestMatchesStudent(row: Pick<ErasureRequestDoc, "studentHash" | "hashSalt">, studentId: string): boolean {
  return hashStudentId(studentId, row.hashSalt) === row.studentHash;
}

function erasureRequests(db: Db) {
  return db.collection<ErasureRequestDoc>(COLLECTION_NAMES.erasure_requests);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ErasureRequestNotFoundError extends Error {
  constructor() {
    super("ErasureRequestNotFoundError: no erasure request with that id");
    this.name = "ErasureRequestNotFoundError";
  }
}

/** The confirm gate: an unconfirmed request deletes nothing. */
export class ErasureNotConfirmedError extends Error {
  constructor() {
    super("ErasureNotConfirmedError: the erasure request has not been confirmed; nothing was deleted (B15)");
    this.name = "ErasureNotConfirmedError";
  }
}

export class ErasureSelfConfirmError extends Error {
  constructor() {
    super("ErasureSelfConfirmError: the confirmer must be a different actor from the requester (B15)");
    this.name = "ErasureSelfConfirmError";
  }
}

export class ErasureStateError extends Error {
  constructor(status: string, action: string) {
    super(`ErasureStateError: can not ${action} a request in status "${status}"`);
    this.name = "ErasureStateError";
  }
}

/** Partial failure or a non-zero read-back. Carries the counts-only receipt; the request stays retryable. */
export class ErasureIncompleteError extends Error {
  readonly receipt: ErasureReceipt;
  constructor(receipt: ErasureReceipt) {
    const failed = receipt.collections.filter((l) => l.outcome === "failed").map((l) => l.collection);
    const deferred = receipt.collections.filter((l) => l.outcome === "deferred").map((l) => l.collection);
    super(
      `ErasureIncompleteError: erasure attempt ${receipt.attempt} is incomplete ` +
        `(failed: [${failed.join(", ")}], deferred: [${deferred.join(", ")}], documents remaining: ${receipt.totalRemaining}). ` +
        `The request is marked failed and can be retried with executeErasure.`,
    );
    this.name = "ErasureIncompleteError";
    this.receipt = receipt;
  }
}

// ---------------------------------------------------------------------------
// Request + confirm
// ---------------------------------------------------------------------------

/** Actor ids compare case- and whitespace-insensitively, so "Admin-1 " can not confirm "admin-1"'s request. */
function normaliseActor(actor: string): string {
  return actor.trim().toLowerCase();
}

function requireActor(actor: unknown, field: string, studentId?: string): string {
  if (typeof actor !== "string" || actor.trim() === "") {
    throw new Error(`erasure: ${field} must be a non-empty staff actor id`);
  }
  if (studentId !== undefined && normaliseActor(actor) === normaliseActor(studentId)) {
    // The audit row outlives the erasure; the student's own id must never be stored as an actor.
    throw new Error(`erasure: ${field} must be a staff actor id, not the student's id`);
  }
  return actor.trim();
}

export interface RequestErasureInput {
  studentId: string;
  requestedBy: string;
  reason: ErasureReason;
}

/** Creates a PENDING erasure request. Deletes nothing. */
export async function requestErasure(db: Db, input: RequestErasureInput): Promise<{ requestId: string }> {
  if (typeof input.studentId !== "string" || input.studentId.trim() === "") {
    throw new Error("requestErasure: studentId must be a non-empty string");
  }
  const requestedBy = requireActor(input.requestedBy, "requestedBy", input.studentId);
  const reason = ErasureReasonSchema.parse(input.reason);
  const hashSalt = randomBytes(16).toString("hex");
  const requestId = new ObjectId().toHexString();
  await erasureRequests(db).insertOne({
    _id: requestId,
    studentHash: hashStudentId(input.studentId, hashSalt),
    hashSalt,
    hashScheme: HASH_SCHEME,
    studentId: input.studentId,
    requestedBy,
    reason,
    requestedAt: new Date().toISOString(),
    status: "pending",
    attempts: 0,
  });
  return { requestId };
}

/**
 * Confirms a pending request. The confirmer must differ from the requester and must not be the
 * student. A CAS on `status: "pending"` makes a double confirm (or a confirm racing another)
 * resolve to exactly one recorded confirmer.
 */
export async function confirmErasure(db: Db, input: { requestId: string; confirmedBy: string }): Promise<void> {
  const row = await erasureRequests(db).findOne({ _id: input.requestId });
  if (!row) throw new ErasureRequestNotFoundError();
  const confirmedBy = requireActor(input.confirmedBy, "confirmedBy", row.studentId);
  if (row.status !== "pending") throw new ErasureStateError(row.status, "confirm");
  if (normaliseActor(confirmedBy) === normaliseActor(row.requestedBy)) throw new ErasureSelfConfirmError();
  const updated = await erasureRequests(db).findOneAndUpdate(
    { _id: input.requestId, status: "pending" },
    { $set: { status: "confirmed", confirmedBy, confirmedAt: new Date().toISOString() } },
  );
  if (!updated) {
    const now = await erasureRequests(db).findOne({ _id: input.requestId });
    throw new ErasureStateError(now?.status ?? "unknown", "confirm");
  }
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

/** One scribe thread per session (packages/engine/src/scribe/graph.ts scribeThreadId; drift-guarded by a test). */
export function scribeCheckpointThreadId(sessionId: string): string {
  return `scribe:${sessionId}`;
}

/** Everything needed to find a student's documents; accumulated across purge rounds (and carried into a retry). */
export interface ErasureSelectors {
  studentId: string;
  factIds: string[];
  sessionIds: string[];
  threadIds: string[];
}

export interface ErasureStep {
  collection: string;
  /** 1 = dependent / direct rows; 2 = anchors, only run when every phase-1 step succeeded. */
  phase: 1 | 2;
  /**
   * The delete selector. Anchors (phase 2) delete ONLY the ids resolved for this round, never
   * "everything with this studentId": an anchor that arrived after the resolve still has
   * dependents nobody has deleted, so it must survive until the next round resolves it
   * (ISS-t-011-rev-3).
   */
  filter: (s: ErasureSelectors) => Filter<Document>;
  /** The read-back selector. Anchors are read back broadly (by studentId) so a late arrival is seen. */
  residue: (s: ErasureSelectors) => Filter<Document>;
}

function edgeFilter(s: ErasureSelectors): Filter<Document> {
  // Kind-qualified, so an id that happens to equal another kind's id never matches.
  return {
    $or: [
      { "from.kind": "student", "from.id": s.studentId },
      { "to.kind": "student", "to.id": s.studentId },
      { "from.kind": "fact", "from.id": { $in: s.factIds } },
      { "to.kind": "fact", "to.id": { $in: s.factIds } },
      { "to.kind": "profile_fact", "to.id": { $in: s.factIds } },
      { "from.kind": "session", "from.id": { $in: s.sessionIds } },
      { "to.kind": "session", "to.id": { $in: s.sessionIds } },
    ],
  };
}

const byStudent = (s: ErasureSelectors): Filter<Document> => ({ studentId: s.studentId });
const byThread = (s: ErasureSelectors): Filter<Document> => ({ thread_id: { $in: s.threadIds } });
// Anchor deletes: resolved ids only (still scoped to the student, defensively). These
// collections use string _ids (D-012 fact ids are ObjectId HEX strings), which the driver's
// generic Filter<Document> types as ObjectId, so they are typed as plain query Documents.
const factsById = (s: ErasureSelectors): Document =>
  ({ studentId: s.studentId, _id: { $in: s.factIds } });
const sessionsById = (s: ErasureSelectors): Document =>
  ({
    studentId: s.studentId,
    $or: [{ _id: { $in: s.sessionIds } }, { sessionId: { $in: s.sessionIds } }],
  });
const claimsByThread = (s: ErasureSelectors): Filter<Document> => ({ studentId: s.studentId, threadId: { $in: s.threadIds } });

/** Ordered: consents first (blocks processing, B4), anchors last (see the module docstring). */
export const ERASURE_PLAN: readonly ErasureStep[] = [
  { collection: COLLECTION_NAMES.consents, phase: 1, filter: byStudent, residue: byStudent },
  { collection: COLLECTION_NAMES.decisions, phase: 1, filter: byStudent, residue: byStudent },
  { collection: COLLECTION_NAMES.edges, phase: 1, filter: edgeFilter, residue: edgeFilter },
  { collection: COLLECTION_NAMES.scribe_checkpoints, phase: 1, filter: byThread, residue: byThread },
  { collection: COLLECTION_NAMES.scribe_checkpoint_writes, phase: 1, filter: byThread, residue: byThread },
  { collection: COLLECTION_NAMES.facts, phase: 2, filter: factsById, residue: byStudent }, // active AND retired
  { collection: COLLECTION_NAMES.sessions, phase: 2, filter: sessionsById, residue: byStudent },
  { collection: COLLECTION_NAMES.scribe_resolutions, phase: 2, filter: claimsByThread, residue: byStudent },
  { collection: COLLECTION_NAMES.students, phase: 2, filter: byStudent, residue: byStudent },
];

/**
 * Purge rounds per attempt (ISS-t-011-rev-3). A round = resolve (merged with every id seen so
 * far) -> phase 1 -> phase 2 -> read-back. The attempt stops at the first clean read-back; a
 * writer that keeps adding documents for longer than this leaves the request `failed`.
 */
export const ERASURE_MAX_ROUNDS = 5;

type CarriedSelectors = Omit<ErasureSelectors, "studentId">;

function mergeSelectors(base: ErasureSelectors, add: CarriedSelectors | undefined): ErasureSelectors {
  if (!add) return base;
  const union = (x: string[], y: string[] | undefined) => [...new Set([...x, ...(y ?? [])])];
  return {
    studentId: base.studentId,
    factIds: union(base.factIds, add.factIds),
    sessionIds: union(base.sessionIds, add.sessionIds),
    threadIds: union(base.threadIds, add.threadIds),
  };
}

/**
 * Collections deliberately NOT erased, with the reason. A test requires every COLLECTION_NAMES
 * entry to be in ERASURE_PLAN or here, so a future cards/feedback collection (none exists yet)
 * fails that test until it is added to the plan.
 */
export const ERASURE_EXEMPT_COLLECTIONS = {
  [COLLECTION_NAMES.universities]: "public university KB data; holds no student documents",
  [COLLECTION_NAMES.courses]: "public course KB data; holds no student documents",
  [COLLECTION_NAMES.erasure_requests]:
    "the erasure audit log itself; must survive the erasure and holds no personal data once completed",
} as const;

async function resolveSelectors(db: Db, studentId: string): Promise<ErasureSelectors> {
  const facts = await db
    .collection<FactDoc>(COLLECTION_NAMES.facts)
    .find({ studentId }, { projection: { _id: 1 } })
    .toArray();
  const sessions = await db
    .collection<SessionDoc>(COLLECTION_NAMES.sessions)
    .find({ studentId }, { projection: { _id: 1, sessionId: 1 } })
    .toArray();
  const claims = await db
    .collection<ScribeResolutionDoc>(COLLECTION_NAMES.scribe_resolutions)
    .find({ studentId }, { projection: { threadId: 1 } })
    .toArray();
  const sessionIds = [...new Set(sessions.flatMap((s) => [s.sessionId, s._id]).filter((x): x is string => !!x))];
  // Threads from the student's sessions AND from their approval claims (covers a claim whose
  // session row is already gone or was never written).
  const threadIds = [...new Set([...sessionIds.map(scribeCheckpointThreadId), ...claims.map((c) => c.threadId)])];
  return { studentId, factIds: facts.map((f) => f._id), sessionIds, threadIds };
}

function errorLabel(err: unknown): string {
  // Name and code only: a driver message can echo the filter (ids).
  const e = err as { name?: unknown; code?: unknown; codeName?: unknown } | undefined;
  const name = typeof e?.name === "string" ? e.name : "Error";
  const code = typeof e?.codeName === "string" ? e.codeName : typeof e?.code === "number" ? String(e.code) : "";
  return code ? `${name}:${code}` : name;
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

export interface ErasureOutcome {
  status: "completed";
  receipt: ErasureReceipt;
  /** True when the request had already completed and this call changed nothing. */
  alreadyCompleted: boolean;
}

/**
 * Runs a CONFIRMED (or previously failed) erasure request. Returns the verified receipt, or throws
 * ErasureIncompleteError (request left `failed`, retryable). Throws ErasureNotConfirmedError for a
 * pending request, before touching any student collection.
 */
export async function executeErasure(db: Db, requestId: string): Promise<ErasureOutcome> {
  const row = await erasureRequests(db).findOne({ _id: requestId });
  if (!row) throw new ErasureRequestNotFoundError();
  if (row.status === "completed" && row.receipt) {
    return { status: "completed", receipt: row.receipt, alreadyCompleted: true };
  }
  if (row.status === "pending" || !row.confirmedBy) throw new ErasureNotConfirmedError();
  if (row.status !== "confirmed" && row.status !== "failed") throw new ErasureStateError(row.status, "execute");
  const studentId = row.studentId;
  if (!studentId || !erasureRequestMatchesStudent(row, studentId)) {
    throw new ErasureStateError(row.status, "execute (studentId missing or does not match its hash)");
  }

  // The CAS keys, snapshotted at the read (never a live object that could change under us).
  const readState = { status: row.status, attempts: row.attempts };
  const startedAt = new Date().toISOString();
  // Ids a previous failed attempt resolved: their anchors may already be gone.
  let selectors: ErasureSelectors = mergeSelectors(
    { studentId, factIds: [], sessionIds: [], threadIds: [] },
    row.carriedSelectors,
  );

  const deleted = new Map<string, number>();
  const failed = new Map<string, string>();
  const deferred = new Set<string>();
  let collections: ErasureCollectionLine[] = [];
  let totalRemaining = 0;
  let rounds = 0;
  // Stable loop (ISS-t-011-rev-3): a writer may add a fact / session / claim / edge / checkpoint
  // for the student while this runs. Anchors are deleted by resolved id only, so a late anchor
  // survives the round and is resolved (with its dependents) by the next one; ids accumulate, so
  // a dependent written after its anchor was deleted is still found. Stop at the first clean
  // read-back, at any failure, or after ERASURE_MAX_ROUNDS.
  while (rounds < ERASURE_MAX_ROUNDS) {
    rounds += 1;
    try {
      selectors = mergeSelectors(selectors, await resolveSelectors(db, studentId));
    } catch (err) {
      if (rounds === 1) throw err; // nothing deleted yet; the row is untouched
      failed.set(COLLECTION_NAMES.facts, `resolve:${errorLabel(err)}`);
    }
    for (const phase of [1, 2] as const) {
      const steps = ERASURE_PLAN.filter((s) => s.phase === phase);
      if (failed.size > 0 && (phase === 2 || rounds > 1)) {
        if (phase === 2) for (const step of steps) if (!failed.has(step.collection)) deferred.add(step.collection);
        continue;
      }
      for (const step of steps) {
        try {
          const res = await db.collection(step.collection).deleteMany(step.filter(selectors));
          deleted.set(step.collection, (deleted.get(step.collection) ?? 0) + (res.deletedCount ?? 0));
        } catch (err) {
          failed.set(step.collection, errorLabel(err));
        }
      }
    }

    // Read-back: dependents with every id seen so far; anchors broadly, so a late arrival shows.
    collections = [];
    for (const step of ERASURE_PLAN) {
      let remaining: number;
      try {
        remaining = await db.collection(step.collection).countDocuments(step.residue(selectors));
      } catch (err) {
        // An unverifiable collection is never reported as clean.
        failed.set(step.collection, failed.get(step.collection) ?? `verify:${errorLabel(err)}`);
        remaining = Number.MAX_SAFE_INTEGER;
      }
      const outcome = failed.has(step.collection) ? "failed" : deferred.has(step.collection) ? "deferred" : "purged";
      const line: ErasureCollectionLine = {
        collection: step.collection,
        outcome,
        deleted: deleted.get(step.collection) ?? 0,
        remaining,
      };
      const error = failed.get(step.collection);
      if (error) line.error = error;
      collections.push(line);
    }
    totalRemaining = Math.min(
      Number.MAX_SAFE_INTEGER,
      collections.reduce((sum, l) => sum + l.remaining, 0),
    );
    if (failed.size > 0 || deferred.size > 0 || totalRemaining === 0) break;
  }
  const verified = failed.size === 0 && deferred.size === 0 && totalRemaining === 0;
  const verifiedAt = new Date().toISOString();
  const buildReceipt = (attempt: number): ErasureReceipt =>
    ErasureReceiptSchema.parse({ requestId, attempt, verified, totalRemaining, collections, rounds, startedAt, verifiedAt });

  // Checked CAS (ISS-t-011-c0-1 / rev-1), like confirmErasure. The filter pins status AND attempts,
  // so only one of several concurrent runs records against a given row state. On a miss, re-read:
  //   - completed by a concurrent run -> return ITS stored receipt, alreadyCompleted: true (this
  //     run records nothing, so `attempts` counts recorded attempts only);
  //   - still confirmed / failed (a concurrent run recorded a failure) -> record this run as the
  //     next attempt against the fresh row.
  let current = readState;
  for (let tries = 0; tries < 5; tries += 1) {
    const attempt = current.attempts + 1;
    const receipt = buildReceipt(attempt);
    const cas = { _id: requestId, status: current.status, attempts: current.attempts };
    const updated = verified
      ? await erasureRequests(db).findOneAndUpdate(cas, {
          $set: { status: "completed", attempts: attempt, lastAttemptAt: startedAt, completedAt: verifiedAt, receipt },
          $unset: { studentId: "", carriedSelectors: "" },
        })
      : await erasureRequests(db).findOneAndUpdate(cas, {
          $set: {
            status: "failed",
            attempts: attempt,
            lastAttemptAt: startedAt,
            receipt,
            carriedSelectors: { factIds: selectors.factIds, sessionIds: selectors.sessionIds, threadIds: selectors.threadIds },
          },
        });
    if (updated) {
      if (verified) return { status: "completed", receipt, alreadyCompleted: false };
      throw new ErasureIncompleteError(receipt);
    }
    const now = await erasureRequests(db).findOne({ _id: requestId });
    if (!now) throw new ErasureRequestNotFoundError();
    if (now.status === "completed" && now.receipt) {
      return { status: "completed", receipt: now.receipt, alreadyCompleted: true };
    }
    if (now.status !== "confirmed" && now.status !== "failed") throw new ErasureStateError(now.status, "record");
    // A concurrent failed run may have carried ids this run did not see; keep them for the retry.
    selectors = mergeSelectors(selectors, now.carriedSelectors);
    current = { status: now.status, attempts: now.attempts };
  }
  throw new ErasureStateError(current.status, "record (the request row kept changing under concurrent runs)");
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export interface StudentExport {
  format: "vc-student-export/v1";
  /**
   * Purpose-safe by construction: this bundle is the data subject's own access copy (DPDP right
   * to access), so it is NOT filtered by purposeTags; every purpose's facts belong to the
   * student. It must only be released to the authenticated student (or guardian, for a minor);
   * that authorisation is the caller's job. It must never feed profiling, analytics or a model.
   */
  purpose: "data_subject_access";
  exportedAt: string;
  studentId: string;
  student: StudentDoc | null;
  /** Full history: active facts (`active: true`) and retired ones (`validTo` set). */
  facts: FactDoc[];
  sessions: SessionDoc[];
  decisions: DecisionDoc[];
  consents: ConsentDoc[];
  edges: EdgeDoc[];
  /** Scribe approval claims (they hold the approved fact values). */
  approvalClaims: ScribeResolutionDoc[];
  /**
   * Scribe checkpoints are serialized LangGraph state (they duplicate the transcript and the
   * extracted facts, both of which are exported above in readable form). Counted, not dumped.
   */
  checkpoints: { threads: string[]; checkpointDocs: number; writeDocs: number };
}

/** Read-only per-student JSON bundle. Uses the same selectors as the erasure, so it covers what erasure deletes. */
export async function exportStudent(db: Db, studentId: string): Promise<StudentExport> {
  if (typeof studentId !== "string" || studentId.trim() === "") {
    throw new Error("exportStudent: studentId must be a non-empty string");
  }
  const s = await resolveSelectors(db, studentId);
  const facts = await db.collection<FactDoc>(COLLECTION_NAMES.facts).find({ studentId }).toArray();
  facts.sort((a, b) => a.key.localeCompare(b.key) || a.validFrom.localeCompare(b.validFrom) || a._id.localeCompare(b._id));
  return {
    format: "vc-student-export/v1",
    purpose: "data_subject_access",
    exportedAt: new Date().toISOString(),
    studentId,
    student: await db.collection<StudentDoc>(COLLECTION_NAMES.students).findOne({ studentId }),
    facts,
    sessions: await db.collection<SessionDoc>(COLLECTION_NAMES.sessions).find({ studentId }).toArray(),
    decisions: await db.collection<DecisionDoc>(COLLECTION_NAMES.decisions).find({ studentId }).toArray(),
    consents: await db.collection<ConsentDoc>(COLLECTION_NAMES.consents).find({ studentId }).toArray(),
    edges: (await db.collection(COLLECTION_NAMES.edges).find(edgeFilter(s)).toArray()) as unknown as EdgeDoc[],
    approvalClaims: await db
      .collection<ScribeResolutionDoc>(COLLECTION_NAMES.scribe_resolutions)
      .find({ studentId })
      .toArray(),
    checkpoints: {
      threads: [...s.threadIds].sort(),
      checkpointDocs: await db.collection(COLLECTION_NAMES.scribe_checkpoints).countDocuments(byThread(s)),
      writeDocs: await db.collection(COLLECTION_NAMES.scribe_checkpoint_writes).countDocuments(byThread(s)),
    },
  };
}
