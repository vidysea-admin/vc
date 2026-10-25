/**
 * DPDP erasure and export (contract B15, T-011; design answer in qa/gates/dpdp-erase-design.md:
 * "hard delete with confirmation and verification").
 *
 * Flow (T-029, B15 approver workflow, gate erasure-fencing answered 2026-09-26):
 *   requestErasure (pending)
 *   -> confirmErasure: the FIRST confirmation (confirmed). Sets the write fence and returns a fresh,
 *      single-use confirm token (only its sha256 is stored; it expires after
 *      ERASURE_CONFIRM_TOKEN_TTL_MS);
 *   -> reconfirmErasure: the SECOND confirmation, by the same actor, presenting that token. Writes
 *      the HMAC audit pseudonym and then either
 *        - (autoDelete false, the default) writes an approval request to the email OUTBOX
 *          (`email_outbox`, a record only: nothing is sent, no SMTP, no network) addressed to the
 *          configured approver, and waits (awaiting_approval, expires after ERASURE_APPROVAL_TTL_MS), or
 *        - (autoDelete true, an operator's explicit opt-in) skips the approver (approved);
 *   -> approveErasure by the approver (approved) / rejectErasure (rejected: purges nothing);
 *   -> executeErasure: hard-delete every document for the student in every engine collection, read
 *      every collection back with the same selectors, and store a counts-only receipt.
 * No single call purges: executeErasure refuses anything that is not double-confirmed AND approved
 * (by the approver, or by autoDelete). A rejected or expired request purges nothing, and its fence
 * is dropped at once (nothing was deleted, so no write needs fencing).
 *
 * ## The audit row (`erasure_requests`) and why it holds no personal data after completion
 * The row is the audit log, so it must survive the erasure. It holds:
 *   - `_id`: an opaque request id (ObjectId hex), not derived from the student;
 *   - `studentHash` + `hashSalt` (T-029, gate erasure-fencing Q2): HMAC-SHA256 keyed by
 *     VC_AUDIT_HMAC_KEY (.env; the name only in .env.example) over a domain tag, a random
 *     per-request salt and the studentId. Written at the second confirmation (or when a request
 *     that never got that far is closed), so every row that can ever lose its clear studentId
 *     carries it. Someone holding the key AND a studentId can prove a closed row was for that
 *     student (`erasureRequestMatchesStudent`); without the key a list of candidate ids proves
 *     nothing (the salted-sha256 dictionary check of T-011 no longer works), and the per-request
 *     salt keeps two requests for one student unlinkable. A missing or short key is an
 *     ErasureConfigError; there is no fallback to an unkeyed hash;
 *   - `requestedBy` / `confirmedBy` / `secondConfirmedBy` / `approvedBy` / `rejectedBy`: staff
 *     actor ids (the student is never the actor id; a student's own request is logged by the
 *     staff member who took it, reason "student_request"). The two confirmations may come from the
 *     requester (B15: "the requester confirms twice"); the approver must be someone else;
 *   - `reason`: a closed code (ErasureReasonSchema), never free text;
 *   - timestamps, `status`, `attempts`, and the last `receipt` (counts only).
 *   - `studentId` in clear, ONLY while the request is open (pending / confirmed /
 *     awaiting_approval / approved / failed): the purge needs it, and the student's data still
 *     exists at that point anyway. It is `$unset` in the same update that marks the request
 *     completed, rejected or expired, together with `studentKey` (the fence key, which makes at
 *     most one request per student open: D-016, ISS-t-011-c2-rev-4) and the confirm-token hash.
 *
 * ## Ordering, partial failure and idempotent retry
 * Edges and scribe checkpoints carry no studentId: they are found through the student's fact
 * ids, session ids and scribe thread ids, which are read from facts / sessions /
 * scribe_resolutions. If those anchor collections were purged while a dependent delete failed,
 * a retry could no longer find the orphaned dependents. So the plan runs in two phases:
 *   1. dependents + direct rows: consents FIRST (so processing is blocked for the whole erasure,
 *      B4), decisions, edges, scribe_checkpoints, scribe_checkpoint_writes, session_transcripts
 *      (T-024: the readable chat, by studentId);
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
 *     (`carriedSelectors`, zod-validated, each list capped at MAX_CARRIED_IDS) and merged into the
 *     retry: a deleted anchor can not be re-resolved.
 * The read-back is NOT atomic (9 sequential counts), so a write landing in an already-counted
 * collection, or between the last count and the completion CAS, is invisible to it
 * (ISS-t-011-c1-1 / -rev-1). The erasure fence (D-015, section "The erasure fence" below) closes
 * that for every fence-aware writer: such a writer either landed before the fence (so the purge,
 * which resolves after the fence, deletes it) or sees the fence in its own post-write check and
 * removes itself. D-016 makes the second half hold at the release boundary too: every fence-aware
 * writer runs under FENCED_WRITER_DEADLINE_MS and the fence is never removed before
 * createdAt + MINIMUM_FENCE_HOLD_MS, so a writer's post-check always runs while the fence exists.
 * ERASURE_FENCE_GRACE_MS (default 0) is only the re-enrolment policy on top (gate Q1).
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
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { types as nativeTypes } from "node:util";
import {
  ErasureCarriedSelectorsSchema,
  ErasureReasonSchema,
  ErasureReceiptSchema,
  MAX_CARRIED_IDS,
  type ErasureCollectionLine,
  type ErasureReason,
  type ErasureReceipt,
  type ErasureStatus,
  type Fact,
  type ConcernRecord,
} from "@vc/schemas";
import {
  COLLECTION_NAMES,
  type ConsentDoc,
  type DecisionDoc,
  type FactDoc,
  type ScribeResolutionDoc,
  type SessionDoc,
  type StudentDoc,
  type TranscriptTurnDoc,
} from "./collections.js";
import type { RejectReasonAuditDoc } from "./decisions.js";
import type { EdgeDoc } from "./edges.js";
// T-025: the fence sweep runs per tenant. tenant.ts imports nothing at runtime, so this adds no cycle.
import { TENANT_FIELD, TENANT_ID_PATTERN, stripDocument, tenantIdOf, tenantScopedDb } from "./tenant.js";

// ---------------------------------------------------------------------------
// Audit row
// ---------------------------------------------------------------------------

export interface ErasureRequestDoc {
  _id: string;
  /**
   * T-029: HMAC-SHA256(VC_AUDIT_HMAC_KEY, "vc-erasure-v2|" + hashSalt + "|" + studentId), hex. Absent
   * while the request is pending / first-confirmed (the clear studentId is still on the row then, and
   * request + first confirm need no key); written at the second confirmation, or when a request is
   * closed rejected / expired, i.e. always before the clear studentId is unset.
   */
  studentHash?: string;
  hashSalt: string;
  hashScheme?: typeof HASH_SCHEME;
  /** Present only while the request is open; unset on completion. */
  studentId?: string;
  /**
   * D-016 / ISS-t-011-c2-rev-4: erasureFenceKey(studentId), present only while the request is
   * open (unset on completion, like studentId, so a completed row holds no unsalted, linkable key).
   * A unique partial index on it among open statuses allows ONE open request per student.
   */
  studentKey?: string;
  requestedBy: string;
  reason: ErasureReason;
  requestedAt: string;
  status: ErasureStatus;
  /** First confirmation (T-029 step 1). */
  confirmedBy?: string;
  confirmedAt?: string;
  /**
   * T-029: sha256 of the single-use confirm token handed out by the first confirmation (the token
   * itself is never stored), and when it stops working. Unset by the second confirmation.
   */
  confirmTokenHash?: string;
  confirmTokenExpiresAt?: string;
  /** Second confirmation (T-029 step 2); same actor as confirmedBy, with the token. */
  secondConfirmedBy?: string;
  secondConfirmedAt?: string;
  /** T-029: the approval request (email_outbox `_id`), and when it expires unanswered. */
  approvalRequestedAt?: string;
  approvalExpiresAt?: string;
  outboxId?: string;
  /** T-029: the approver's decision, or "system:auto-delete" when autoDelete skipped the approver. */
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  expiredAt?: string;
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

const HASH_SCHEME = "hmac-sha256(VC_AUDIT_HMAC_KEY, vc-erasure-v2|salt|studentId)" as const;

/** T-029: the minimum VC_AUDIT_HMAC_KEY length (characters). A shorter key is a config error. */
export const MIN_AUDIT_HMAC_KEY_LENGTH = 32;

/**
 * T-029 (gate erasure-fencing Q2): the keyed audit pseudonym. There is deliberately no unkeyed
 * variant: a missing or short key throws ErasureConfigError instead of falling back to sha256.
 */
export function auditPseudonym(auditHmacKey: string, salt: string, studentId: string): string {
  assertAuditKey(auditHmacKey);
  return createHmac("sha256", auditHmacKey).update(`vc-erasure-v2|${salt}|${studentId}`).digest("hex");
}

function assertAuditKey(key: unknown): asserts key is string {
  if (typeof key !== "string" || key.length < MIN_AUDIT_HMAC_KEY_LENGTH) {
    throw new ErasureConfigError(
      `VC_AUDIT_HMAC_KEY is missing or shorter than ${MIN_AUDIT_HMAC_KEY_LENGTH} characters; the erasure audit pseudonym is an HMAC and has no unkeyed fallback (T-029)`,
    );
  }
}

/**
 * True if `row` is a request for `studentId`: recomputes the HMAC pseudonym with the audit key (the
 * row holds no clear id once closed). Without the right key this can not be answered.
 */
export function erasureRequestMatchesStudent(
  row: Pick<ErasureRequestDoc, "studentHash" | "hashSalt">,
  studentId: string,
  auditHmacKey: string,
): boolean {
  if (typeof row.studentHash !== "string") return false;
  const candidate = Buffer.from(auditPseudonym(auditHmacKey, row.hashSalt, studentId), "hex");
  const stored = Buffer.from(row.studentHash, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

// ---------------------------------------------------------------------------
// Workflow configuration (T-029)
// ---------------------------------------------------------------------------

/**
 * T-029: the approver workflow's configuration, read from the environment by erasureConfigFromEnv.
 *   - auditHmacKey  (VC_AUDIT_HMAC_KEY): keys the audit pseudonym; required, >= 32 characters;
 *   - autoDelete    (VC_ERASURE_AUTO_DELETE, default false): true skips the approver after the
 *                   double confirmation (an operator's explicit opt-in);
 *   - approverEmail (VC_ERASURE_APPROVER_EMAIL): where the outbox approval request is addressed;
 *                   required unless autoDelete is true.
 */
export interface ErasureWorkflowConfig {
  auditHmacKey: string;
  autoDelete: boolean;
  approverEmail?: string;
}

export const ERASURE_CONFIG_ENV = {
  auditHmacKey: "VC_AUDIT_HMAC_KEY",
  approverEmail: "VC_ERASURE_APPROVER_EMAIL",
  autoDelete: "VC_ERASURE_AUTO_DELETE",
} as const;

/** T-029: the erasure workflow is misconfigured. Nothing was written. */
export class ErasureConfigError extends Error {
  constructor(message: string) {
    super(`ErasureConfigError: ${message}`);
    this.name = "ErasureConfigError";
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates a config object (also used on configs built in code). Throws ErasureConfigError. */
export function validateErasureConfig(config: ErasureWorkflowConfig): ErasureWorkflowConfig {
  if (config === null || typeof config !== "object") throw new ErasureConfigError("no erasure workflow config");
  assertAuditKey(config.auditHmacKey);
  if (typeof config.autoDelete !== "boolean") throw new ErasureConfigError("autoDelete must be a boolean");
  if (!config.autoDelete) {
    if (typeof config.approverEmail !== "string" || !EMAIL_PATTERN.test(config.approverEmail)) {
      throw new ErasureConfigError(
        `${ERASURE_CONFIG_ENV.approverEmail} is missing or not an email address; it is required while autoDelete is false (T-029)`,
      );
    }
  }
  return config;
}

/** Reads the workflow config from an env map (names only in .env.example). Throws ErasureConfigError. */
export function erasureConfigFromEnv(env: Record<string, string | undefined>): ErasureWorkflowConfig {
  const rawAuto = (env[ERASURE_CONFIG_ENV.autoDelete] ?? "").trim().toLowerCase();
  if (rawAuto !== "" && rawAuto !== "true" && rawAuto !== "false") {
    throw new ErasureConfigError(`${ERASURE_CONFIG_ENV.autoDelete} must be "true" or "false" (default false)`);
  }
  const approverEmail = (env[ERASURE_CONFIG_ENV.approverEmail] ?? "").trim();
  return validateErasureConfig({
    auditHmacKey: env[ERASURE_CONFIG_ENV.auditHmacKey] ?? "",
    autoDelete: rawAuto === "true",
    ...(approverEmail ? { approverEmail } : {}),
  });
}

/** T-029: the single-use confirm token's lifetime (first confirmation -> second). */
export const ERASURE_CONFIRM_TOKEN_TTL_MS = 15 * 60 * 1000;

/** T-029: how long an approval request waits for the approver before it expires (purging nothing). */
export const ERASURE_APPROVAL_TTL_MS = 7 * 24 * 3600 * 1000;

/** The actor recorded as approver when autoDelete skipped the approval step. */
export const AUTO_DELETE_APPROVER = "system:auto-delete";

function hashToken(token: string): string {
  return createHash("sha256").update(`vc-erasure-confirm-token-v1|${token}`).digest("hex");
}

function tokenMatches(token: unknown, storedHash: string | undefined): boolean {
  if (typeof token !== "string" || token.length === 0 || typeof storedHash !== "string") return false;
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Email outbox (T-029): a record only; nothing in this repo sends it
// ---------------------------------------------------------------------------

export interface EmailOutboxDoc {
  _id: string;
  kind: "erasure_approval_request";
  to: string;
  subject: string;
  body: string;
  /** The erasure request the approver is asked to approve or reject (opaque id, no student data). */
  requestId: string;
  reason: ErasureReason;
  requestedBy: string;
  confirmedBy: string;
  createdAt: string;
  expiresAt: string;
  /** "queued": waiting for an out-of-band sender (none exists yet); nothing here ever sends it. */
  status: "queued";
}

export function erasureOutboxId(requestId: string): string {
  return `erasure-approval:${requestId}`;
}

function emailOutbox(db: Db) {
  return db.collection<EmailOutboxDoc>(COLLECTION_NAMES.email_outbox);
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

/**
 * T-029: the approver must be a different actor from the requester and both confirmers (B15:
 * the counsellor confirms twice, a separate approver decides).
 */
export class ErasureSelfApproveError extends Error {
  constructor() {
    super("ErasureSelfApproveError: the approver must be a different actor from the requester and the confirmer (B15)");
    this.name = "ErasureSelfApproveError";
  }
}

/** T-029: the second confirmation's token is wrong, already used, or presented by another actor. */
export class ErasureConfirmTokenError extends Error {
  constructor() {
    super("ErasureConfirmTokenError: the second confirmation needs the first confirmer and their valid, unused confirm token (T-029)");
    this.name = "ErasureConfirmTokenError";
  }
}

/** T-029: double-confirmed, but the approver has not approved yet; nothing was deleted. */
export class ErasureNotApprovedError extends Error {
  constructor() {
    super("ErasureNotApprovedError: the erasure request is waiting for the approver; nothing was deleted (B15)");
    this.name = "ErasureNotApprovedError";
  }
}

/** T-029: the confirm token or the approval request expired; the request is closed and purged nothing. */
export class ErasureExpiredError extends Error {
  constructor(what: "confirm_token" | "approval") {
    super(
      `ErasureExpiredError: the ${what === "confirm_token" ? "confirm token" : "approval request"} expired; ` +
        `the request is closed (expired) and nothing was deleted. Open a new request.`,
    );
    this.name = "ErasureExpiredError";
  }
}

export class ErasureStateError extends Error {
  constructor(status: string, action: string) {
    super(`ErasureStateError: can not ${action} a request in status "${status}"`);
    this.name = "ErasureStateError";
  }
}

/**
 * D-016 / ISS-t-011-c2-rev-4: the student already has an open (pending / confirmed / awaiting_approval / approved / failed)
 * erasure request; at most one may be open (unique partial index on `studentKey`). Continue that
 * request instead of opening another.
 */
export class ErasureRequestAlreadyOpenError extends Error {
  constructor() {
    super("ErasureRequestAlreadyOpenError: this student already has an open erasure request; continue that one (D-016)");
    this.name = "ErasureRequestAlreadyOpenError";
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
// The erasure fence (D-015, T-011 cycle 2; liveness bound D-016, cycle 3)
// ---------------------------------------------------------------------------
//
// There are no multi-document transactions (D-008/D-009), so the purge can never atomically prove
// "nothing is left": a writer can land a document in a collection right after that collection's
// read-back count ran, or between the last read-back and the completion CAS (ISS-t-011-c1-1,
// ISS-t-011-c1-rev-1). The fence closes that with single-document operations only:
//   - confirmErasure sets the fence BEFORE its confirm CAS, and executeErasure (re)sets it before
//     it resolves any selector. So every confirmed request is fenced, and the purge's first resolve
//     happens strictly after the fence exists.
//   - Every student-data writer checks the fence before writing (refuse early) and AGAIN AFTER its
//     own writes (compensateIfFenced), in a `finally`, so also after an error or its deadline. If
//     fenced, it deletes exactly what it wrote, by id, and throws StudentFencedError.
//
// D-016 (why that is enough, and what D-015 missed). Take a fence-aware writer W whose pre-check
// ran at time t0:
//   - the fence already existed at t0 -> W is refused and writes nothing;
//   - the fence did not exist at t0 -> the fence's createdAt is after t0. W runs under an enforced
//     deadline (FENCED_WRITER_DEADLINE_MS from t0): every driver operation carries timeoutMS = the
//     time left (mongodb@6 CSOT, which also sends maxTimeMS to the server) and an application timer
//     aborts W at t0 + deadline. W's post-check read is bounded by FENCE_POSTCHECK_TIMEOUT_MS. The
//     fence is never removed before createdAt + MINIMUM_FENCE_HOLD_MS (= deadline + margin), which
//     is later than t0 + deadline + margin. So:
//       - W's writes all landed before the fence -> the purge (which resolves after the fence) sees
//         and deletes them;
//       - otherwise W's post-check runs while the fence still exists -> W removes its own writes.
//   D-015 said this "closes" the race with a grace of 0; the cycle-2 checker (ISS-t-011-c2-1)
//   showed a writer whose post-check ran after an immediate release. The minimum hold is the
//   missing liveness bound.
// Honest caveats (not closed by construction, bounded by configuration):
//   - A write the server applies AFTER the client timed out is bounded server-side by the same
//     timeoutMS (the driver sends maxTimeMS); a request that sits on the network longer than the
//     margin is not. FENCE_MARGIN_MS is the budget for that plus clock skew between app servers
//     (createdAt is stamped by the confirming process, release is decided by the executing one).
//   - Writes the scribe's LangGraph checkpointer (MongoDBSaver) makes are not given our per-op
//     timeoutMS; they are bounded by the graph's AbortSignal plus the MongoClient's own timeoutMS.
//     T-014 / ISS-t-011-c3-rev-2: that backstop is no longer conditional — client.ts's
//     connectFromEnv always builds its MongoClient with `timeoutMS: DEFAULT_MONGO_CLIENT_TIMEOUT_MS`
//     (= FENCE_MARGIN_MS, overridable via MONGO_CLIENT_TIMEOUT_MS), so every client this package
//     hands out already carries it — "where one is configured" no longer means "maybe none is".
//     graph.ts re-runs the post-check when an aborted run finally settles.
//   - A writer that does not check the fence is not covered; the scanner in
//     tests/db-scope.test.ts fails the build if a new module writes student data outside the
//     fence-aware allowlist (ISS-t-011-c2-rev-2).
// Writers: applyApprovedDiff (facts + edges), requireConsent (refuses), and the engine's
// startScribe / resumeScribe (checkpoints + the approval claim; packages/engine scribe/graph.ts).
//
// Key (decided in cycle 2): the fence stores NO clear studentId. `_id` = `studentKey` =
// sha256("vc-erasure-fence-v1|" + studentId), unsalted, so any writer can compute its lookup key
// from the studentId it already holds (one _id point read; no separate index, ISS-t-011-c2-rev-3).
// Residual: an unsalted hash is dictionary-checkable against a list of candidate ids, like the
// audit row's hash; gate erasure-fencing Q2 (HMAC keyed from .env) covers both.
//
// Lifetime: from confirm until BOTH (a) no fencing (confirmed / awaiting_approval / approved / failed) request for the student remains (one
// open request per student is enforced by a unique partial index, ISS-t-011-c2-rev-4) and (b)
// max(createdAt + MINIMUM_FENCE_HOLD_MS, completedAt + ERASURE_FENCE_GRACE_MS) has passed. On
// completion the fence is deleted if that time has already passed, otherwise stamped with
// `releaseAfter` and removed by releaseExpiredErasureFences. createdAt is set once and never reset
// when a request re-arms (takes over) the fence. ERASURE_FENCE_GRACE_MS stays the separate
// re-enrolment policy knob (gate erasure-fencing Q1); the technical hold does not depend on it.

/**
 * How long the fence outlives a verified completion, in ms, as RE-ENROLMENT POLICY (gate
 * erasure-fencing Q1, answered 2026-09-26: 24h). T-029: the default is now 24h, so writes for the
 * student are refused from the first confirmation until completion + 24h; re-enrolment works after.
 * Correctness does not depend on it: MINIMUM_FENCE_HOLD_MS always applies (D-016). Callers may pass
 * a different `fenceGraceMs` / `graceMs` explicitly (tests of the technical hold pass 0).
 */
export const ERASURE_FENCE_GRACE_MS = 24 * 3600 * 1000;

/**
 * D-016: the enforced deadline of every fence-aware writer, from its fence pre-check to its last
 * write. Enforced at the driver (each operation gets `timeoutMS` = the time left) and in the
 * application (a timer aborts the writer; see WriterDeadline). A writer may use a SHORTER deadline,
 * never a longer one. Raising this raises MINIMUM_FENCE_HOLD_MS with it. 60 s covers an
 * applyApprovedDiff and one scribe run (two provider calls) with room to spare.
 */
export const FENCED_WRITER_DEADLINE_MS = 60_000;

/**
 * D-016: the fence hold's margin on top of the writer deadline: the post-check read
 * (FENCE_POSTCHECK_TIMEOUT_MS), network latency, and clock skew between app servers.
 */
export const FENCE_MARGIN_MS = 30_000;

/** D-016: the post-check read's own timeout (must stay below FENCE_MARGIN_MS). */
export const FENCE_POSTCHECK_TIMEOUT_MS = 10_000;

/** D-016: a fence is never removed before `createdAt + MINIMUM_FENCE_HOLD_MS`. */
export const MINIMUM_FENCE_HOLD_MS = FENCED_WRITER_DEADLINE_MS + FENCE_MARGIN_MS;

/** One fence per fenced student (collection `erasure_fences`). Holds no clear studentId. */
export interface ErasureFenceDoc {
  /** = studentKey (the lookup key; the _id index serves every fence read). */
  _id: string;
  /** erasureFenceKey(studentId); equal to _id. */
  studentKey: string;
  /** The request that last (re)set the fence; only that request's completion releases it. */
  requestId: string;
  /** When the fence was FIRST created; never reset on re-arm (D-016 minimum hold is measured from it). */
  createdAt: string;
  /** Set on completion: the fence stops fencing at this instant, and the sweep may remove it. */
  releaseAfter?: string;
  /**
   * T-029: when a new request re-arms a fence that was still counting down a PREVIOUS completion's
   * hold / 24h re-enrolment grace, that releaseAfter is kept here, so closing the new request
   * (rejected / expired, or completed with a shorter grace) never ends the earlier grace early.
   */
  priorReleaseAfter?: string;
}

/** Thrown by a fence-aware writer: an erasure is in progress for the student, nothing it wrote remains. */
export class StudentFencedError extends Error {
  /** `cause`: the writer's own error, when it failed or timed out before the post-check found the fence (ISS-t-011-c2-rev-3). */
  constructor(options?: { cause?: unknown }) {
    super(
      "StudentFencedError: this student has an erasure in progress; the write was refused and nothing was kept (D-015, B15)",
      options,
    );
    this.name = "StudentFencedError";
  }
}

/**
 * D-016: a fence-aware writer ran past its deadline and was aborted. Everything it wrote has been
 * removed (the post-check always undoes a timed-out writer). `settled` resolves once an operation
 * that was still in flight at the abort has settled and been undone too.
 */
export class FencedWriterDeadlineError extends Error {
  readonly settled: Promise<void>;
  constructor(settled: Promise<void> = Promise.resolve(), options?: { cause?: unknown }) {
    super(
      "FencedWriterDeadlineError: the write did not finish within the fenced-writer deadline (D-016); it was aborted and nothing it wrote was kept",
      options,
    );
    this.name = "FencedWriterDeadlineError";
    this.settled = settled;
  }
}

// T-052 (plan-v2 3.8, H-002): method references captured at module initialization. They are inert
// lexical bindings for WriterDeadline's causal inspector, not exposed registry/capability functions.
const causalOwn = Object.getOwnPropertyDescriptor;
const causalProto = Object.getPrototypeOf;
const causalKeys = Reflect.ownKeys;
const causalFreeze = Object.freeze;
const causalDefine = Object.defineProperty;
const causalHasOwn = Object.hasOwn;
const causalSame = Object.is;
const causalApply = Reflect.apply;
const causalArray = Array.isArray;
const causalNumber = Number;
const causalInteger = Number.isInteger;
const causalString = String;
const causalPromise = nativeTypes.isPromise;
const causalProxy = nativeTypes.isProxy;
const causalBirthGet = WeakMap.prototype.get;
const causalBirthSet = WeakMap.prototype.set;
const causalFrameHas = WeakSet.prototype.has;
const causalFrameAdd = WeakSet.prototype.add;
const causalSetHas = Set.prototype.has;
const causalSetAdd = Set.prototype.add;

type CausalDescriptor = Readonly<PropertyDescriptor> | undefined;
type CausalTuple = readonly [
  CausalDescriptor, CausalDescriptor, CausalDescriptor,
];
interface CausalRow {
  readonly node: object;
  readonly prototype: object | null;
  readonly descriptors: CausalTuple;
}
export interface WriterCausalFrame extends CausalRow {
  readonly chain: readonly CausalRow[];
  readonly effective: CausalTuple;
  readonly children: readonly unknown[];
  readonly settlements: readonly Promise<unknown>[];
  readonly vector?: Readonly<{
    node: unknown[];
    prototype: object | null;
    keys: readonly PropertyKey[];
    descriptors: readonly (readonly [PropertyKey, CausalDescriptor])[];
  }>;
  readonly unsafe: boolean;
  readonly failed: boolean;
  readonly failure?: unknown;
  readonly unchanged: boolean;
}

/**
 * D-016: the deadline of one fence-aware writer. Construct it right before the fence pre-check.
 *   - `op()` returns the driver options for the next operation (`timeoutMS` = the time left) and
 *     throws FencedWriterDeadlineError once the deadline has passed, so no new write starts after it;
 *   - `run(p)` races `p` against the deadline (the application-level abort);
 *   - `signal` aborts at the deadline (LangGraph invoke, provider calls);
 *   - `dispose()` clears the timer; call it in a `finally`.
 * A deadline longer than FENCED_WRITER_DEADLINE_MS is refused: the fence hold would not cover it.
 */
export class WriterDeadline {
  static #expiryConstructions =
    new WeakMap<object, readonly WriterCausalFrame[]>();
  static #causalFrames = new WeakSet<WriterCausalFrame>();

  static {
    const names = ["inspectCausal", "expiryConstruction"] as const;
    for (let index = 0; index < names.length; index++) {
      const key = names[index]!;
      const descriptor = causalOwn(WriterDeadline, key)!;
      causalDefine(WriterDeadline, key, {
        ...descriptor, writable: false, configurable: false,
      });
    }
  }

  static expiryConstruction(root: unknown): Readonly<{
    nativeShape: readonly WriterCausalFrame[];
    unchanged: boolean;
  }> | undefined {
    if ((typeof root !== "object" || root === null) &&
        typeof root !== "function") return undefined;
    const nativeShape = causalApply(
      causalBirthGet, WriterDeadline.#expiryConstructions, [root],
    ) as readonly WriterCausalFrame[] | undefined;
    if (!nativeShape) return undefined;
    const current = WriterDeadline.inspectCausal(root, nativeShape[0]);
    return causalFreeze({
      nativeShape,
      unchanged: current !== undefined && current.unchanged &&
        !current.unsafe && !current.failed,
    });
  }

  static inspectCausal(
    root: unknown, previous?: WriterCausalFrame,
  ): WriterCausalFrame | undefined {
    if ((typeof root !== "object" || root === null) &&
        typeof root !== "function") return undefined;
    const node = root as object;
    const rows: CausalRow[] = [];
    const effective: [
      CausalDescriptor, CausalDescriptor, CausalDescriptor,
    ] = [undefined, undefined, undefined];
    const children: unknown[] = [];
    const settlements: Promise<unknown>[] = [];
    let unsafe = false, failed = false;
    let failure: unknown;
    let vector: WriterCausalFrame["vector"];

    const descriptor = (
      d: PropertyDescriptor | undefined,
    ): CausalDescriptor =>
      d === undefined ? undefined : causalFreeze({ ...d });
    const sameDescriptor = (
      a: CausalDescriptor, b: CausalDescriptor,
    ): boolean => {
      if (a === undefined || b === undefined) return a === b;
      const dataA = causalHasOwn(a, "value");
      const dataB = causalHasOwn(b, "value");
      return dataA === dataB &&
        a.enumerable === b.enumerable &&
        a.configurable === b.configurable &&
        (dataA
          ? a.writable === b.writable && causalSame(a.value, b.value)
          : a.get === b.get && a.set === b.set);
    };

    try {
      const seen = new Set<object>();
      for (let current: object | null = node; current !== null;) {
        if (causalApply(causalSetHas, seen, [current]) ||
            causalProxy(current)) {
          unsafe = true;
          break;
        }
        causalApply(causalSetAdd, seen, [current]);
        const prototype = causalProto(current);
        const own: [
          CausalDescriptor, CausalDescriptor, CausalDescriptor,
        ] = [
          descriptor(causalOwn(current, "cause")),
          descriptor(causalOwn(current, "errors")),
          descriptor(causalOwn(current, "settled")),
        ];
        rows[rows.length] = causalFreeze({
          node: current, prototype, descriptors: causalFreeze(own),
        });
        for (let index = 0; index < 3; index++) {
          if (effective[index] === undefined && own[index] !== undefined) {
            effective[index] = own[index];
          }
        }
        current = prototype;
      }
      for (let index = 0; index < 3; index++) {
        const field = effective[index];
        if (field !== undefined && !causalHasOwn(field, "value")) {
          unsafe = true;
        }
      }
      const cause = effective[0];
      if (cause !== undefined && causalHasOwn(cause, "value")) {
        children[children.length] = cause.value;
      }
      const errors = effective[1];
      if (errors !== undefined && causalHasOwn(errors, "value")) {
        if (causalProxy(errors.value) || !causalArray(errors.value)) {
          unsafe = true;
        } else {
          const array = errors.value as unknown[];
          const prototype = causalProto(array);
          if (prototype !== null && causalProxy(prototype)) unsafe = true;
          const keys = causalKeys(array);
          const entries: (readonly [PropertyKey, CausalDescriptor])[] = [];
          for (let index = 0; index < keys.length; index++) {
            const key = keys[index]!;
            entries[entries.length] = causalFreeze([
              key, descriptor(causalOwn(array, key)),
            ] as const);
          }
          vector = causalFreeze({
            node: array, prototype,
            keys: causalFreeze(keys),
            descriptors: causalFreeze(entries),
          });
          const length = causalOwn(array, "length");
          if (length === undefined || !causalHasOwn(length, "value") ||
              typeof length.value !== "number" ||
              !causalInteger(length.value) || length.value < 0) {
            unsafe = true;
          } else {
            let memberCount = 0;
            for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
              const entry = entries[entryIndex]!;
              const key = entry[0], member = entry[1];
              if (typeof key !== "string") continue;
              const index = causalNumber(key);
              if (!causalInteger(index) || index < 0 ||
                  index >= length.value || causalString(index) !== key) continue;
              memberCount++;
              if (member === undefined || !causalHasOwn(member, "value")) {
                unsafe = true;
              } else {
                children[children.length] = member.value;
              }
            }
            if (memberCount !== length.value) unsafe = true;
          }
        }
      }
      const settled = effective[2];
      if (settled !== undefined && causalHasOwn(settled, "value")) {
        if (causalPromise(settled.value)) {
          settlements[settlements.length] = settled.value;
        } else unsafe = true;
      }
    } catch (error) {
      failed = true; unsafe = true; failure = error;
    }

    const first = rows[0];
    const frame: WriterCausalFrame = {
      node, prototype: first?.prototype ?? null,
      descriptors: first?.descriptors ??
        causalFreeze([undefined, undefined, undefined] as const),
      chain: causalFreeze(rows),
      effective: causalFreeze(effective),
      children: causalFreeze(children),
      settlements: causalFreeze(settlements),
      vector, unsafe, failed, failure, unchanged: false,
    };
    let unchanged = previous === undefined && !unsafe && !failed;
    if (previous !== undefined && causalApply(
      causalFrameHas, WriterDeadline.#causalFrames, [previous],
    )) {
      unchanged = !unsafe && !failed &&
        !previous.unsafe && !previous.failed &&
        node === previous.node && rows.length === previous.chain.length;
      if (unchanged) for (let row = 0; row < rows.length; row++) {
        const a = rows[row]!, b = previous.chain[row]!;
        if (a.node !== b.node || a.prototype !== b.prototype) {
          unchanged = false; break;
        }
        for (let index = 0; index < 3; index++) {
          if (!sameDescriptor(a.descriptors[index], b.descriptors[index])) {
            unchanged = false; break;
          }
        }
        if (!unchanged) break;
      }
      if (unchanged) {
        const a = vector, b = previous.vector;
        if (a === undefined || b === undefined) unchanged = a === b;
        else {
          unchanged = a.node === b.node && a.prototype === b.prototype &&
            a.keys.length === b.keys.length &&
            a.descriptors.length === b.descriptors.length;
          if (unchanged) for (let index = 0; index < a.keys.length; index++) {
            if (a.keys[index] !== b.keys[index] ||
                a.descriptors[index]![0] !== b.descriptors[index]![0] ||
                !sameDescriptor(
                  a.descriptors[index]![1], b.descriptors[index]![1],
                )) {
              unchanged = false; break;
            }
          }
        }
      }
    }
    const result = causalFreeze({ ...frame, unchanged });
    causalApply(causalFrameAdd, WriterDeadline.#causalFrames, [result]);
    return result;
  }


  readonly expiresAt: number;
  private readonly controller = new AbortController();
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly expiry: Promise<never>;
  // T-052 (plan-v2 3.9, C1): the ONE expiry path shared by the timer and an op()-declared expiry. It
  // mints E, registers E's birth frame, aborts the signal WITH E as its reason and rejects run() with E.
  readonly #expire: () => FencedWriterDeadlineError;

  /**
   * `expiresAtCap` (T-052 delta-c2 H-D02) is an optional absolute expiry (epoch ms): a child writer
   * that runs inside an outer deadline passes the outer `expiresAt`, so the child can not end later
   * than the one original invocation budget. It is read against the SAME clock read as `ms`.
   */
  constructor(ms: number = FENCED_WRITER_DEADLINE_MS, expiresAtCap?: number) {
    if (!Number.isFinite(ms) || ms <= 0 || ms > FENCED_WRITER_DEADLINE_MS) {
      throw new RangeError(
        `WriterDeadline: a fenced writer's deadline must be in (0, ${FENCED_WRITER_DEADLINE_MS}] ms (D-016: the fence hold covers no longer), got ${ms}`,
      );
    }
    if (expiresAtCap !== undefined && !Number.isFinite(expiresAtCap)) {
      throw new RangeError(
        `WriterDeadline: an absolute expiry cap must be a finite epoch-ms time, got ${expiresAtCap}`,
      );
    }
    const now = Date.now();
    this.expiresAt = expiresAtCap === undefined ? now + ms : Math.min(now + ms, expiresAtCap);
    let fire!: (err: Error) => void;
    this.expiry = new Promise<never>((_resolve, reject) => (fire = reject));
    this.expiry.catch(() => undefined); // observed through run() only
    this.#expire = () => {
      const expired = new FencedWriterDeadlineError();
      const birth = WriterDeadline.inspectCausal(expired)!;
      causalApply(causalBirthSet, WriterDeadline.#expiryConstructions, [
        expired, causalFreeze([birth]),
      ]);
      this.controller.abort(expired);
      fire(expired);
      return expired;
    };
    this.timer = setTimeout(() => {
      this.#expire();
    }, Math.max(0, this.expiresAt - now));
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  expired(): boolean {
    return this.controller.signal.aborted || Date.now() >= this.expiresAt;
  }

  op(): { timeoutMS: number } {
    const left = this.expiresAt - Date.now();
    if (left <= 0 || this.controller.signal.aborted) {
      if (!this.controller.signal.aborted) {
        // plan-v2 3.9: expiry declared here, before the timer ran. Abort now, with the E thrown.
        clearTimeout(this.timer);
        this.#expire(); // OPTION-1a probe: abort with the timer E, throw a fresh E below
      }
      const expired = new FencedWriterDeadlineError();
      const birth = WriterDeadline.inspectCausal(expired)!;
      causalApply(causalBirthSet, WriterDeadline.#expiryConstructions, [
        expired, causalFreeze([birth]),
      ]);
      throw expired;
    }
    return { timeoutMS: left };
  }

  run<T>(work: Promise<T>): Promise<T> {
    return Promise.race([work, this.expiry]);
  }

  dispose(): void {
    clearTimeout(this.timer);
  }
}

/** The fence's lookup key for a student (see the section comment: unsalted on purpose). */
export function erasureFenceKey(studentId: string): string {
  return createHash("sha256").update(`vc-erasure-fence-v1|${studentId}`).digest("hex");
}

function erasureFences(db: Db) {
  return db.collection<ErasureFenceDoc>(COLLECTION_NAMES.erasure_fences);
}

function parseTime(iso: string | undefined, fallback: number): number {
  const t = iso === undefined ? Number.NaN : Date.parse(iso);
  return Number.isFinite(t) ? t : fallback;
}

/** D-016: the earliest instant a fence may be removed after `completedAt`. */
function fenceReleaseTime(fence: Pick<ErasureFenceDoc, "createdAt" | "priorReleaseAfter">, completedAt: string, graceMs: number): number {
  const completed = parseTime(completedAt, Date.now());
  // An unreadable createdAt is treated as "created at completion" (the longer hold).
  const created = parseTime(fence.createdAt, completed);
  return Math.max(created + MINIMUM_FENCE_HOLD_MS, completed + Math.max(0, graceMs), priorRelease(fence));
}

/** T-029: a previous completion's release time carried on the fence (0 if none). */
function priorRelease(fence: Pick<ErasureFenceDoc, "priorReleaseAfter">): number {
  return fence.priorReleaseAfter === undefined ? 0 : parseTime(fence.priorReleaseAfter, Number.POSITIVE_INFINITY);
}

/**
 * T-029: when a request that purged NOTHING (rejected / expired) closes, its fence has nothing to
 * protect, so it may go at once, unless it inherited an earlier completion's hold / grace
 * (priorReleaseAfter), which it keeps.
 */
function unpurgedReleaseTime(fence: Pick<ErasureFenceDoc, "createdAt" | "priorReleaseAfter">): number {
  if (fence.priorReleaseAfter === undefined) return 0;
  return Math.max(priorRelease(fence), parseTime(fence.createdAt, Number.POSITIVE_INFINITY) + MINIMUM_FENCE_HOLD_MS);
}

/**
 * True while an erasure fence is in force for the student. A fence inside its minimum hold always
 * fences; after that, one past its releaseAfter does not.
 */
export async function isStudentFenced(
  db: Db,
  studentId: string,
  now: Date = new Date(),
  options: { timeoutMS?: number; onOriginalOperation?: (original: Promise<unknown>) => void } = {},
): Promise<boolean> {
  const { onOriginalOperation, ...mongoOptions } = options;
  const reading = erasureFences(db).findOne({ _id: erasureFenceKey(studentId) }, mongoOptions);
  onOriginalOperation?.(reading);
  const fence = await reading;
  if (!fence) return false;
  if (now.getTime() < parseTime(fence.createdAt, now.getTime()) + MINIMUM_FENCE_HOLD_MS) return true;
  return fence.releaseAfter === undefined || Date.parse(fence.releaseAfter) > now.getTime();
}

/** The writer's pre-check: throws StudentFencedError (before anything is written) if fenced. */
export async function assertStudentNotFenced(db: Db, studentId: string, options: { timeoutMS?: number } = {}): Promise<void> {
  if (await isStudentFenced(db, studentId, new Date(), options)) throw new StudentFencedError();
}

export interface CompensateOptions {
  /** The writer's own error (if it failed), chained as StudentFencedError's `cause`. */
  cause?: unknown;
  /** Undo even when not fenced (D-016: a writer that ran past its deadline keeps nothing). */
  alwaysUndo?: boolean;
}

/**
 * The writer's post-check. Call it in a `finally`, AFTER all of the writer's own writes, also after
 * an error or its deadline. If the student is fenced now, runs `undo` (delete exactly what this
 * writer wrote, by id) and throws StudentFencedError (with `cause`). If the fence state can not be
 * read (the read failed or timed out), it fails safe: `undo`, then the read error propagates. An
 * error from `undo` itself propagates (never masked as a clean refusal).
 */
export async function compensateIfFenced(
  db: Db,
  studentId: string,
  undo: () => Promise<unknown>,
  options: CompensateOptions = {},
): Promise<void> {
  let fenced: boolean;
  try {
    fenced = await isStudentFenced(db, studentId, new Date(), { timeoutMS: FENCE_POSTCHECK_TIMEOUT_MS });
  } catch (readErr) {
    await undo();
    throw readErr;
  }
  if (fenced) {
    await undo();
    throw new StudentFencedError(options.cause === undefined ? undefined : { cause: options.cause });
  }
  if (options.alwaysUndo) await undo();
}

/** Sets (or takes over, and re-arms) the student's fence for `requestId`. Idempotent; createdAt is set once. */
async function setErasureFence(db: Db, studentId: string, requestId: string): Promise<void> {
  const studentKey = erasureFenceKey(studentId);
  // T-029: keep a previous completion's countdown (see priorReleaseAfter) before clearing it.
  const existing = await erasureFences(db).findOne({ _id: studentKey });
  const carried = existing?.releaseAfter === undefined ? undefined : Math.max(priorRelease(existing), parseTime(existing.releaseAfter, 0));
  await erasureFences(db).updateOne(
    { _id: studentKey },
    {
      $set: { requestId, ...(carried !== undefined && carried > 0 ? { priorReleaseAfter: new Date(carried).toISOString() } : {}) },
      $setOnInsert: { _id: studentKey, studentKey, createdAt: new Date().toISOString() } as ErasureFenceDoc,
      // A fence re-set during a previous request's hold / grace must not expire mid-erasure.
      $unset: { releaseAfter: "" },
    },
    { upsert: true },
  );
}

/**
 * Statuses of a request that fences (a pending request does not: the first confirmation sets the
 * fence). T-029: confirmed (first confirmation), awaiting_approval (double-confirmed, waiting for
 * the approver), approved (about to purge) and failed (retryable) all fence, so writes are refused
 * from the first confirmation until the purge completes (and then for the grace).
 */
const FENCING_STATUSES: ErasureStatus[] = ["confirmed", "awaiting_approval", "approved", "failed"];

/**
 * True if the student (by fence key) still has a fencing request (FENCING_STATUSES). Such a request
 * owns (or will re-arm) the fence, so it must not be removed. A PENDING request does not count: it
 * never fences until confirmed, and holding a fence for a request nobody confirms would recreate
 * the stuck-fence DoS of ISS-t-011-c2-rev-4.
 */
async function hasFencingRequest(db: Db, studentKey: string, scope: Filter<Document> = {}): Promise<boolean> {
  return (
    (await erasureRequests(db).countDocuments({ studentKey, status: { $in: FENCING_STATUSES }, ...scope } as Filter<ErasureRequestDoc>)) > 0
  );
}

/**
 * D-016: after a verified completion, removes the fence if its release time (fenceReleaseTime) has
 * already passed and no other request fences the student; otherwise stamps `releaseAfter` for the
 * sweep. Only the request that owns the fence acts on it. Best effort: a failure leaves the fence
 * in place (fail-safe: writes stay refused) for releaseExpiredErasureFences, and never turns a
 * verified, recorded erasure into an error.
 */
async function releaseErasureFence(db: Db, studentId: string, requestId: string, graceMs: number, completedAt: string): Promise<void> {
  const _id = erasureFenceKey(studentId);
  try {
    const fence = await erasureFences(db).findOne({ _id, requestId });
    if (!fence) return; // gone, or taken over by another request
    if (await hasFencingRequest(db, _id)) return; // another open request relies on it
    const releaseAt = fenceReleaseTime(fence, completedAt, graceMs);
    if (releaseAt <= Date.now()) {
      await erasureFences(db).deleteMany({ _id, requestId });
    } else {
      await erasureFences(db).updateOne({ _id, requestId }, { $set: { releaseAfter: new Date(releaseAt).toISOString() } });
    }
  } catch {
    // Left for releaseExpiredErasureFences (see above).
  }
}

/**
 * T-029: releases the fence of a request that closed WITHOUT purging (rejected / expired). Nothing
 * was deleted, so no write needs fencing any more: the fence goes at once, unless it carries an
 * earlier completion's countdown (unpurgedReleaseTime). Best effort, like releaseErasureFence; the
 * sweep covers a failure.
 */
async function releaseUnpurgedFence(db: Db, studentKey: string, requestId: string, now: Date): Promise<void> {
  try {
    const fence = await erasureFences(db).findOne({ _id: studentKey, requestId });
    if (!fence) return;
    if (await hasFencingRequest(db, studentKey)) return;
    const releaseAt = unpurgedReleaseTime(fence);
    if (releaseAt <= now.getTime()) {
      await erasureFences(db).deleteMany({ _id: studentKey, requestId });
    } else {
      await erasureFences(db).updateOne({ _id: studentKey, requestId }, { $set: { releaseAfter: new Date(releaseAt).toISOString() } });
    }
  } catch {
    // Left for releaseExpiredErasureFences.
  }
}

/**
 * The fence sweep (run from the scheduled job that will own erasure housekeeping). Removes a fence
 * only when no fencing request for its student remains AND its release time has passed:
 * `releaseAfter` if stamped (never earlier than createdAt + MINIMUM_FENCE_HOLD_MS), or, for a fence
 * left behind by a completed request whose own release did not happen (crash after the completion
 * CAS), max(createdAt + hold, completedAt + graceMs). Returns the number removed.
 *
 * T-025 (B21 tenancy): a tenant's fence and request rows carry `tenantId` and a tenant-prefixed
 * `_id`, so one unscoped pass would miss them (its `_id: requestId` read can not match
 * `<tenant>:<requestId>`) and could let one tenant's open request hold another tenant's fence.
 * So: given a tenant-scoped Db, the sweep runs inside that tenant only. Given the unscoped system
 * Db (startApi's), it runs once over the pre-tenancy (unstamped) rows, restricted to unstamped
 * rows on both sides, then once per tenant that has a fence, through tenantScopedDb. A stored
 * tenantId that is not a well-formed tenant id can not have been written through a scope and is
 * skipped (its fence stays: fail safe, writes stay refused).
 */
export async function releaseExpiredErasureFences(
  db: Db,
  now: Date = new Date(),
  graceMs: number = ERASURE_FENCE_GRACE_MS,
  options: ReleaseExpiredOptions = {},
): Promise<number> {
  if (tenantIdOf(db) !== undefined) {
    return releaseExpiredFencesIn(db, {}, await erasureFences(db).find({}).toArray(), now, graceMs, options);
  }
  // ONE read of every fence per tick (the in-flight guard's tests count reads per tick), then
  // partitioned in memory: unstamped rows, and each well-formed tenant's rows as that tenant sees them.
  const legacy: ErasureFenceDoc[] = [];
  const byTenant = new Map<string, ErasureFenceDoc[]>();
  for (const fence of await erasureFences(db).find({}).toArray()) {
    const tenant = (fence as { [TENANT_FIELD]?: unknown })[TENANT_FIELD];
    if (tenant === undefined) legacy.push(fence);
    else if (typeof tenant === "string" && TENANT_ID_PATTERN.test(tenant)) {
      const list = byTenant.get(tenant) ?? [];
      list.push(stripDocument(tenant, fence));
      byTenant.set(tenant, list);
    }
  }
  let released = await releaseExpiredFencesIn(db, { [TENANT_FIELD]: { $exists: false } }, legacy, now, graceMs, options);
  for (const tenant of [...byTenant.keys()].sort()) {
    released += await releaseExpiredFencesIn(tenantScopedDb(db, tenant), {}, byTenant.get(tenant)!, now, graceMs, options);
  }
  return released;
}

export interface ReleaseExpiredOptions {
  /**
   * T-029: with the audit key, the sweep also closes (as `expired`, purging nothing) a fence's
   * request whose confirm token or approval request has expired, so an abandoned request does not
   * hold the student's fence forever. Without it such a request keeps its fence (fail safe) until
   * a reconfirm / approve call expires it.
   */
  auditHmacKey?: string;
}

/** One sweep pass over `fences` (already read, all matching `scope`) and the requests they depend on. */
async function releaseExpiredFencesIn(
  db: Db,
  scope: Filter<Document>,
  fences: ErasureFenceDoc[],
  now: Date,
  graceMs: number,
  options: ReleaseExpiredOptions = {},
): Promise<number> {
  let released = 0;
  for (const fence of fences) {
    if (options.auditHmacKey !== undefined) {
      const owner = await erasureRequests(db).findOne({ _id: fence.requestId, ...scope } as Filter<ErasureRequestDoc>);
      if (owner && staleness(owner, now) !== undefined) {
        try {
          await closeUnpurged(db, owner, "expired", "system:expiry-sweep", options.auditHmacKey, now, scope, false);
        } catch {
          // Lost a race with a reconfirm / approve, or the key is unusable: the fence stays (fail safe).
        }
      }
    }
    if (await hasFencingRequest(db, fence.studentKey ?? fence._id, scope)) continue;
    let releaseAt: number;
    const holdEnd = parseTime(fence.createdAt, now.getTime()) + MINIMUM_FENCE_HOLD_MS;
    if (fence.releaseAfter !== undefined) {
      releaseAt = Math.max(parseTime(fence.releaseAfter, Number.POSITIVE_INFINITY), holdEnd);
    } else {
      const row = await erasureRequests(db).findOne({ _id: fence.requestId, ...scope } as Filter<ErasureRequestDoc>);
      if (row?.status === "completed" && row.completedAt) {
        releaseAt = fenceReleaseTime(fence, row.completedAt, graceMs);
      } else if (row?.status === "rejected" || row?.status === "expired") {
        // T-029: closed without purging; its own release did not happen (crash / best-effort failure).
        releaseAt = unpurgedReleaseTime(fence);
      } else {
        continue;
      }
    }
    if (releaseAt > now.getTime()) continue;
    const res = await erasureFences(db).deleteMany({ _id: fence._id, requestId: fence.requestId, ...scope } as Filter<ErasureFenceDoc>);
    released += res.deletedCount ?? 0;
  }
  return released;
}

export interface ErasureFenceSweepOptions {
  /**
   * How often to sweep. Default: MINIMUM_FENCE_HOLD_MS — a fence can not be eligible for release
   * any sooner than that after it was created, so sweeping faster only spends cycles on no-ops.
   */
  intervalMs?: number;
  /** Injected clock (tests only); defaults to `() => new Date()`. */
  now?: () => Date;
  /** Overrides ERASURE_FENCE_GRACE_MS (tests; the Q1 policy belongs in the constant). */
  graceMs?: number;
  /** T-029: see ReleaseExpiredOptions.auditHmacKey (startApi passes VC_AUDIT_HMAC_KEY when configured). */
  auditHmacKey?: string;
  /**
   * Called with a tick's error instead of throwing it. releaseExpiredErasureFences is already
   * best-effort per fence (releaseErasureFence's own try/catch); this covers a failure in the sweep
   * loop itself (e.g. the whole read fails), so one bad tick never kills the interval — the next
   * tick simply tries again. Defaults to a no-op; a caller SHOULD pass one wired to its logging.
   * ISS-t-015-c0-3 / ISS-t-017-rev-2 / ISS-t-017-rev-3: SHOULD never throw, return a promise that
   * rejects, or return a promise that never settles — but it may do any of the three, and `tick()`
   * is safe against all of them: it is invoked fire-and-forget (its own outcome is never awaited or
   * adopted by `tick()`'s chain), so a synchronous throw or an async rejection is silently absorbed
   * (the failure it was called to report is not re-escalated), and — because it is never awaited — a
   * promise that never settles at all (e.g. an unbounded logging call with no internal timeout) can
   * not block `tick()`'s own `.finally` from resetting the in-flight guard, so a hung `onError` can
   * not silently stall every later tick either. The type is widened to `void | Promise<void>` to
   * make an async `onError` (e.g. one that awaits a logging call) a documented, supported shape
   * rather than one that happens to compile via structural typing but silently loses its own
   * rejections.
   */
  onError?: (err: unknown) => void | Promise<void>;
}

export interface ErasureFenceSweep {
  /** Clears the interval. Idempotent; safe to call more than once (e.g. from a shutdown handler). */
  stop: () => void;
}

/**
 * T-014 / ISS-t-011-c3-rev-3: releaseExpiredErasureFences had no caller outside tests. A fence
 * whose owning request completed cleanly gets a `releaseAfter` stamp (or an immediate delete) from
 * executeErasure itself — but a fence left behind by a crash right after the completion CAS (before
 * releaseErasureFence ran), or one whose best-effort release attempt failed (see
 * releaseErasureFence's own catch), had NOTHING that would ever come back and clear it: every
 * future write for that student stayed refused forever (D-016's whole point — a stuck-open fence —
 * inverted into a stuck-CLOSED one).
 *
 * This starts a periodic sweep: an unref'd `setInterval` (per Node's own semantics, an unref'd
 * timer never by itself keeps the event loop alive, so this can not stall process shutdown) that
 * calls releaseExpiredErasureFences on a timer, plus a `stop()` to clear it. The caller — the
 * process that owns the live Mongo client (apps/api/src/index.ts's startApi; see also
 * scripts/db-init.ts for the other live-only entry point) — is responsible for calling `stop()` on
 * shutdown, matching client.close(). T-015 / ISS-t-014-rev-4: a tick is skipped (silently — see the
 * in-flight guard below) while the previous tick's own releaseExpiredErasureFences call is still
 * running, so overlapping sweeps can not run concurrently against the same db.
 */
export function startErasureFenceSweep(db: Db, options: ErasureFenceSweepOptions = {}): ErasureFenceSweep {
  const intervalMs = options.intervalMs ?? MINIMUM_FENCE_HOLD_MS;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new RangeError(`startErasureFenceSweep: intervalMs must be a positive number of ms, got ${intervalMs}`);
  }
  // T-015 / ISS-t-014-rev-4: an in-flight guard. releaseExpiredErasureFences reads every fence and
  // (for each) may read erasure_requests too — on a slow tick (a large fence backlog, or a slow
  // server), a fixed setInterval keeps firing regardless, so without this guard two ticks' reads
  // and best-effort releases could interleave concurrently. Nothing about that was known to be
  // UNSAFE (releaseErasureFence's own CAS-by-{_id, requestId} + hasFencingRequest check make a
  // single fence's release idempotent either way), but it was untested and wasteful — this makes
  // "at most one sweep runs at a time" an explicit guarantee instead of an inferred one. A skipped
  // tick is silent (by design: the NEXT tick, at most `intervalMs` later, covers the same ground —
  // this is not a lost unit of work, unlike a sweep failure, which is why only failures go through
  // onError).
  let inFlight = false;
  const tick = (): void => {
    if (inFlight) return;
    inFlight = true;
    const now = options.now?.() ?? new Date();
    releaseExpiredErasureFences(
      db,
      now,
      options.graceMs ?? ERASURE_FENCE_GRACE_MS,
      options.auditHmacKey === undefined ? {} : { auditHmacKey: options.auditHmacKey },
    )
      .catch((err) => {
        // ISS-t-015-c0-3 / ISS-t-017-rev-2 / ISS-t-017-rev-3: onError is caller-supplied and
        // documented to report, never throw, reject, or hang — but it may do any of the three: a
        // SYNCHRONOUS throw from the call itself, an ASYNC onError whose returned promise rejects on
        // a later microtask (the realistic shape for an onError that awaits its own logging call), or
        // an onError whose returned promise never settles at all (the realistic shape for an
        // unbounded fetch/HTTP call to a logging or alerting endpoint, with no internal timeout).
        // `Promise.resolve().then(() => options.onError?.(err))` absorbs a synchronous throw (it
        // rejects the `.then`); `.catch(() => undefined)` right after absorbs an async rejection too.
        // Crucially, this whole chain is FIRE-AND-FORGET: it is invoked here but never returned to,
        // or awaited by, this `.catch` callback, so the OUTER `.catch(...)`'s own returned promise
        // settles immediately regardless of what `onError` does. A cycle-1 fix that instead RETURNED
        // this chain (so the outer `.catch`, and therefore `.finally`, would wait for it) closed the
        // async-rejection case but introduced a worse one: a never-settling `onError` made the outer
        // chain never settle either, so `.finally` never ran, `inFlight` was never reset, and every
        // later tick silently no-op'd forever (ISS-t-017-rev-3) — the sweep died silently instead of
        // crashing loudly, still failing the same B15 "one bad tick never kills the interval or the
        // process" guarantee. Not adopting the promise here means `.finally` below always runs as
        // soon as THIS sweep's own work settles, whatever `onError` ends up doing on its own time.
        Promise.resolve()
          .then(() => options.onError?.(err))
          .catch(() => undefined);
      })
      .finally(() => {
        inFlight = false;
      });
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
    },
  };
}

export interface ExecuteErasureOptions {
  /** Overrides ERASURE_FENCE_GRACE_MS (tests; the Q1 policy belongs in the constant). Never shortens the D-016 minimum hold. */
  fenceGraceMs?: number;
  /** Overrides MAX_CARRIED_IDS (tests only). */
  maxCarriedIds?: number;
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

/**
 * Creates a PENDING erasure request. Deletes nothing and fences nothing. Throws
 * ErasureRequestAlreadyOpenError if the student already has an open (pending / confirmed /
 * awaiting_approval / approved / failed) request: the unique partial index
 * `erasure_requests_open_tenantId_studentKey_unique` makes that atomic across processes (D-016; per tenant since T-025).
 * T-029: needs no audit key; the HMAC pseudonym is written at the second confirmation.
 */
export async function requestErasure(db: Db, input: RequestErasureInput): Promise<{ requestId: string }> {
  if (typeof input.studentId !== "string" || input.studentId.trim() === "") {
    throw new Error("requestErasure: studentId must be a non-empty string");
  }
  const requestedBy = requireActor(input.requestedBy, "requestedBy", input.studentId);
  const reason = ErasureReasonSchema.parse(input.reason);
  const hashSalt = randomBytes(16).toString("hex");
  const requestId = new ObjectId().toHexString();
  try {
    await erasureRequests(db).insertOne({
      _id: requestId,
      hashSalt,
      studentId: input.studentId,
      studentKey: erasureFenceKey(input.studentId),
      requestedBy,
      reason,
      requestedAt: new Date().toISOString(),
      status: "pending",
      attempts: 0,
    });
  } catch (err) {
    // The _id is a fresh ObjectId, so a duplicate key here is the one-open-request index.
    if ((err as { code?: unknown } | null)?.code === 11000) throw new ErasureRequestAlreadyOpenError();
    throw err;
  }
  return { requestId };
}

/**
 * T-034 (B21 Events): read-only lookup of one erasure request row, for the confirm call site that
 * needs the `reason` and `requestedAt` this request was opened with to build the erasure.requested
 * webhook event (neither confirmErasure nor reconfirmErasure returns them). Never used by the
 * erasure workflow itself, and never called after the second confirmation: from there on the row's
 * clear `studentId` is redacted (see ErasureRequestDoc's docstring), so a caller must read this
 * BEFORE that point or `studentId` on the result may already be gone.
 */
export async function getErasureRequest(db: Db, requestId: string): Promise<ErasureRequestDoc | null> {
  return erasureRequests(db).findOne({ _id: requestId });
}

export interface ConfirmErasureResult {
  /**
   * T-029: the single-use token the SAME actor must present to reconfirmErasure (the second
   * confirmation). Only its sha256 is stored. Hand it back to the confirming counsellor only.
   */
  confirmToken: string;
  confirmTokenExpiresAt: string;
}

/**
 * The FIRST confirmation of a pending request (T-029 step 1). Deletes nothing. Sets the write fence
 * (so writes for the student are refused from here on) and returns a fresh confirm token for the
 * second confirmation. The confirmer may be the requester or another staff member, never the
 * student. A CAS on `status: "pending"` makes a double confirm (or a confirm racing another) resolve
 * to exactly one recorded confirmer.
 */
export async function confirmErasure(
  db: Db,
  input: { requestId: string; confirmedBy: string },
  options: { now?: Date } = {},
): Promise<ConfirmErasureResult> {
  const row = await erasureRequests(db).findOne({ _id: input.requestId });
  if (!row) throw new ErasureRequestNotFoundError();
  const confirmedBy = requireActor(input.confirmedBy, "confirmedBy", row.studentId);
  if (row.status !== "pending") throw new ErasureStateError(row.status, "confirm");
  if (!row.studentId) throw new ErasureStateError(row.status, "confirm (studentId missing)");
  const now = options.now ?? new Date();
  const confirmToken = randomBytes(32).toString("base64url");
  const confirmTokenExpiresAt = new Date(now.getTime() + ERASURE_CONFIRM_TOKEN_TTL_MS).toISOString();
  // D-015 order: the fence FIRST, then the confirm CAS. So no request is ever confirmed without a
  // fence. If the CAS then loses, the only way out of "pending" is a concurrent confirm, so the
  // request is confirmed anyway and the fence is correct.
  await setErasureFence(db, row.studentId, input.requestId);
  const updated = await erasureRequests(db).findOneAndUpdate(
    { _id: input.requestId, status: "pending" },
    {
      $set: {
        status: "confirmed",
        confirmedBy,
        confirmedAt: now.toISOString(),
        confirmTokenHash: hashToken(confirmToken),
        confirmTokenExpiresAt,
      },
    },
  );
  if (!updated) {
    const current = await erasureRequests(db).findOne({ _id: input.requestId });
    throw new ErasureStateError(current?.status ?? "unknown", "confirm");
  }
  return { confirmToken, confirmTokenExpiresAt };
}

export interface ReconfirmErasureInput {
  requestId: string;
  /** Must be the actor who made the first confirmation. */
  confirmedBy: string;
  /** The token confirmErasure returned. Single use. */
  confirmToken: string;
}

export interface ReconfirmErasureResult {
  /** "awaiting_approval" (the default) or "approved" (autoDelete: the approver step was skipped). */
  status: "awaiting_approval" | "approved";
  /** The email_outbox record addressed to the approver (absent under autoDelete). */
  outboxId?: string;
  approvalExpiresAt?: string;
}

/**
 * The SECOND confirmation (T-029 step 2). Deletes nothing. The first confirmer presents the fresh
 * token from confirmErasure; a wrong / reused token, or another actor, is ErasureConfirmTokenError
 * and changes nothing. An expired token closes the request as `expired` (purging nothing, fence
 * released) and throws ErasureExpiredError. On success writes the HMAC audit pseudonym and then:
 *   - autoDelete false (default): writes the approval request to the email OUTBOX (a record only,
 *     nothing is sent) addressed to config.approverEmail, and moves to `awaiting_approval`;
 *   - autoDelete true: moves straight to `approved` (approvedBy AUTO_DELETE_APPROVER); the caller
 *     runs executeErasure.
 * An invalid config is ErasureConfigError before anything is read or written.
 */
export async function reconfirmErasure(
  db: Db,
  input: ReconfirmErasureInput,
  config: ErasureWorkflowConfig,
  options: { now?: Date } = {},
): Promise<ReconfirmErasureResult> {
  validateErasureConfig(config);
  const now = options.now ?? new Date();
  const row = await erasureRequests(db).findOne({ _id: input.requestId });
  if (!row) throw new ErasureRequestNotFoundError();
  const actor = requireActor(input.confirmedBy, "confirmedBy", row.studentId);
  if (row.status !== "confirmed") throw new ErasureStateError(row.status, "reconfirm");
  if (
    row.confirmedBy === undefined ||
    normaliseActor(actor) !== normaliseActor(row.confirmedBy) ||
    !tokenMatches(input.confirmToken, row.confirmTokenHash)
  ) {
    throw new ErasureConfirmTokenError();
  }
  if (parseTime(row.confirmTokenExpiresAt, 0) <= now.getTime()) {
    await closeUnpurged(db, row, "expired", "system:confirm-token-expired", config.auditHmacKey, now, {}, true);
    throw new ErasureExpiredError("confirm_token");
  }
  if (!row.studentId) throw new ErasureStateError(row.status, "reconfirm (studentId missing)");
  const common = {
    studentHash: auditPseudonym(config.auditHmacKey, row.hashSalt, row.studentId),
    hashScheme: HASH_SCHEME,
    secondConfirmedBy: actor,
    secondConfirmedAt: now.toISOString(),
  };
  // The CAS includes the token hash: the token is single-use even against a concurrent reconfirm.
  const casFilter = { _id: input.requestId, status: "confirmed", confirmTokenHash: row.confirmTokenHash } as Filter<ErasureRequestDoc>;
  const clearToken = { confirmTokenHash: "", confirmTokenExpiresAt: "" } as const;

  if (config.autoDelete) {
    const updated = await erasureRequests(db).findOneAndUpdate(casFilter, {
      $set: { ...common, status: "approved", approvedBy: AUTO_DELETE_APPROVER, approvedAt: now.toISOString() },
      $unset: clearToken,
    });
    if (!updated) throw new ErasureConfirmTokenError();
    return { status: "approved" };
  }

  const outboxId = erasureOutboxId(input.requestId);
  const approvalExpiresAt = new Date(now.getTime() + ERASURE_APPROVAL_TTL_MS).toISOString();
  // The outbox record first (idempotent by _id), then the CAS: an awaiting_approval row always has
  // its approval request on record. A lost CAS leaves an orphan outbox record for a request that is
  // not awaiting approval; approving it is refused by the status check.
  const outboxDoc: EmailOutboxDoc = {
    _id: outboxId,
    kind: "erasure_approval_request",
    to: config.approverEmail!,
    subject: `Approval needed: data erasure request ${input.requestId}`,
    body:
      `A data erasure (B15, DPDP) has been requested and confirmed twice by a counsellor.\n` +
      `Request id: ${input.requestId}\nReason: ${row.reason}\nRequested by: ${row.requestedBy}\n` +
      `Confirmed by: ${actor}\nThis request expires unanswered at ${approvalExpiresAt}; nothing is deleted until you approve it.\n` +
      `Approve: POST /v1/erasure-requests/${input.requestId}/approve   Reject: POST /v1/erasure-requests/${input.requestId}/reject`,
    requestId: input.requestId,
    reason: row.reason,
    requestedBy: row.requestedBy,
    confirmedBy: actor,
    createdAt: now.toISOString(),
    expiresAt: approvalExpiresAt,
    status: "queued",
  };
  await emailOutbox(db).updateOne({ _id: outboxId }, { $setOnInsert: outboxDoc }, { upsert: true });
  const updated = await erasureRequests(db).findOneAndUpdate(casFilter, {
    $set: { ...common, status: "awaiting_approval", approvalRequestedAt: now.toISOString(), approvalExpiresAt, outboxId },
    $unset: clearToken,
  });
  if (!updated) throw new ErasureConfirmTokenError();
  return { status: "awaiting_approval", outboxId, approvalExpiresAt };
}

/**
 * The approver approves a double-confirmed request (T-029 step 3). Deletes nothing itself: the
 * caller then runs executeErasure (apps/api does both in one route). The approver must differ from
 * the requester and the confirmer (ErasureSelfApproveError). An expired approval request is closed
 * as `expired` (purging nothing) and throws ErasureExpiredError.
 */
export async function approveErasure(
  db: Db,
  input: { requestId: string; approvedBy: string },
  options: { now?: Date } = {},
): Promise<void> {
  const now = options.now ?? new Date();
  const row = await erasureRequests(db).findOne({ _id: input.requestId });
  if (!row) throw new ErasureRequestNotFoundError();
  const approvedBy = requireActor(input.approvedBy, "approvedBy", row.studentId);
  if (row.status !== "awaiting_approval") throw new ErasureStateError(row.status, "approve");
  const others = [row.requestedBy, row.confirmedBy, row.secondConfirmedBy].filter((a): a is string => typeof a === "string");
  if (others.some((a) => normaliseActor(a) === normaliseActor(approvedBy))) throw new ErasureSelfApproveError();
  if (parseTime(row.approvalExpiresAt, 0) <= now.getTime()) {
    await closeUnpurged(db, row, "expired", "system:approval-expired", undefined, now, {}, true);
    throw new ErasureExpiredError("approval");
  }
  const updated = await erasureRequests(db).findOneAndUpdate(
    { _id: input.requestId, status: "awaiting_approval" },
    { $set: { status: "approved", approvedBy, approvedAt: now.toISOString() } },
  );
  if (!updated) {
    const current = await erasureRequests(db).findOne({ _id: input.requestId });
    throw new ErasureStateError(current?.status ?? "unknown", "approve");
  }
}

/**
 * The approver rejects a double-confirmed request (T-029). Purges nothing: the row is closed as
 * `rejected`, its clear studentId is unset (the HMAC pseudonym written at the second confirmation
 * stays for the audit), and the fence is released (nothing was deleted, so nothing needs fencing).
 */
export async function rejectErasure(
  db: Db,
  input: { requestId: string; rejectedBy: string },
  options: { now?: Date } = {},
): Promise<void> {
  const now = options.now ?? new Date();
  const row = await erasureRequests(db).findOne({ _id: input.requestId });
  if (!row) throw new ErasureRequestNotFoundError();
  const rejectedBy = requireActor(input.rejectedBy, "rejectedBy", row.studentId);
  if (row.status !== "awaiting_approval") throw new ErasureStateError(row.status, "reject");
  await closeUnpurged(db, row, "rejected", rejectedBy, undefined, now, {}, true);
}

/** T-029: why an open request has gone stale, if it has (its token or its approval request expired). */
function staleness(row: ErasureRequestDoc, now: Date): "confirm_token" | "approval" | undefined {
  if (row.status === "confirmed" && row.confirmTokenExpiresAt !== undefined && parseTime(row.confirmTokenExpiresAt, 0) <= now.getTime()) {
    return "confirm_token";
  }
  if (row.status === "awaiting_approval" && parseTime(row.approvalExpiresAt, 0) <= now.getTime()) return "approval";
  return undefined;
}

/**
 * T-029: closes a request that purged nothing, as `rejected` or `expired`. One CAS on the row's
 * current status sets the terminal status, writes the HMAC pseudonym if the row does not carry it
 * yet (needs the key then; ErasureConfigError otherwise, and nothing changes), and unsets the clear
 * studentId, the fence key and the token hash. Then (releaseFence) drops the fence.
 */
async function closeUnpurged(
  db: Db,
  row: ErasureRequestDoc,
  status: "rejected" | "expired",
  actor: string,
  auditHmacKey: string | undefined,
  now: Date,
  scope: Filter<Document>,
  releaseFence: boolean,
): Promise<void> {
  const studentKey = row.studentKey ?? (row.studentId ? erasureFenceKey(row.studentId) : undefined);
  let pseudonym: Record<string, string> = {};
  if (typeof row.studentHash !== "string") {
    if (!row.studentId) throw new ErasureStateError(row.status, `close as ${status} (studentId missing)`);
    pseudonym = { studentHash: auditPseudonym(auditHmacKey as string, row.hashSalt, row.studentId), hashScheme: HASH_SCHEME };
  }
  const stamp = status === "rejected" ? { rejectedBy: actor, rejectedAt: now.toISOString() } : { expiredAt: now.toISOString() };
  const updated = await erasureRequests(db).findOneAndUpdate(
    { _id: row._id, status: row.status, ...scope } as Filter<ErasureRequestDoc>,
    {
      $set: { status, ...stamp, ...pseudonym },
      $unset: { studentId: "", studentKey: "", confirmTokenHash: "", confirmTokenExpiresAt: "" },
    },
  );
  if (!updated) {
    const current = await erasureRequests(db).findOne({ _id: row._id, ...scope } as Filter<ErasureRequestDoc>);
    throw new ErasureStateError(current?.status ?? "unknown", status === "rejected" ? "reject" : "expire");
  }
  if (releaseFence && studentKey !== undefined) await releaseUnpurgedFence(db, studentKey, row._id, now);
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
// T-034 (B21 Events, ISS-t-027-rev-3): a webhook_outbox document's student lives one level down at
// `event.data.studentId` (the WebhookEvent envelope), not at the document's own top level, so it
// needs its own dotted-path filter rather than the plain `byStudent` shape.
const byEventStudent = (s: ErasureSelectors): Filter<Document> => ({ "event.data.studentId": s.studentId });

/** Ordered: consents first (blocks processing, B4), anchors last (see the module docstring). */
export const ERASURE_PLAN: readonly ErasureStep[] = [
  { collection: COLLECTION_NAMES.consents, phase: 1, filter: byStudent, residue: byStudent },
  { collection: COLLECTION_NAMES.escalation_notifications, phase: 1, filter: byStudent, residue: byStudent },
  { collection: COLLECTION_NAMES.crisis_flag_reviews, phase: 1, filter: byStudent, residue: byStudent },
  { collection: COLLECTION_NAMES.decisions, phase: 1, filter: byStudent, residue: byStudent },
  { collection: COLLECTION_NAMES.edges, phase: 1, filter: edgeFilter, residue: edgeFilter },
  { collection: COLLECTION_NAMES.scribe_checkpoints, phase: 1, filter: byThread, residue: byThread },
  { collection: COLLECTION_NAMES.scribe_checkpoint_writes, phase: 1, filter: byThread, residue: byThread },
  // T-024 / ISS-t-013r-c0-3: the readable transcript carries studentId on every turn document, so it
  // is a direct row (like consents/decisions): deleted and read back by studentId.
  { collection: COLLECTION_NAMES.session_transcripts, phase: 1, filter: byStudent, residue: byStudent },
  // T-034: queued fact-approved / erasure-requested / concern-flagged webhook events. A direct row
  // (not an anchor: nothing else resolves ids FROM it), deleted and read back by the nested
  // studentId regardless of delivery status (pending/delivered/failed/dead) — an undelivered event
  // referencing an erased student is exactly the residue B15 must not leave behind.
  { collection: COLLECTION_NAMES.webhook_outbox, phase: 1, filter: byEventStudent, residue: byEventStudent },
  // T-042 (ISS-085): the recoverable webhook-emit-gap ledger. Unlike webhook_outbox, `studentId` is
  // a flat top-level field here (packages/engine/src/webhooks/gaps.ts), so the plain `byStudent`
  // filter applies directly -- a direct row, deleted and read back by studentId regardless of kind
  // (readback-gap or enqueue-failed): an unresolved gap entry naming an erased student is exactly
  // the residue B15 must not leave behind.
  { collection: COLLECTION_NAMES.webhook_emit_gaps, phase: 1, filter: byStudent, residue: byStudent },
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

/**
 * T-015 / ISS-t-014-rev-1: every real client this package hands out now always carries a
 * client-level `timeoutMS` backstop (client.ts's `connectFromEnv`, capped at `FENCE_MARGIN_MS` =
 * 30s, D-016) — but that cap was SIZED for a single fenced writer's post-check margin, not for
 * `executeErasure`'s own `deleteMany`/`countDocuments` calls, which can span up to
 * `ERASURE_PLAN.length` (9) collections per round, up to `ERASURE_MAX_ROUNDS` (5) rounds, for a
 * student with an arbitrarily large document count. Racing that against a 30s budget risks a
 * spurious timeout on an otherwise-healthy purge. Per the module docstring ("Ordering, partial
 * failure and idempotent retry"), a step that times out is recorded as `failed` (or an unverifiable
 * read-back is treated as non-zero) and the whole request is marked `failed`/retryable — so a
 * spurious per-op timeout here degrades to "retry", never silent data loss. An explicit per-op
 * `timeoutMS` always overrides the client default for that one call (mongodb@6 CSOT: an
 * operation-level option wins over the client-level one), so this does not touch, and is not
 * bounded by, the fence's own liveness guarantee (D-016) for OTHER operations. Deliberately still
 * finite, not unbounded: a purge step that is genuinely stuck must still fail and retry rather
 * than block the caller forever. 120s (4x the client default) is chosen as headroom generous
 * enough for a large multi-round purge while still failing well inside a human-observable timeframe.
 */
export const ERASURE_PURGE_OP_TIMEOUT_MS = 120_000;

/** The ids carried on a failed row: validated by ErasureCarriedSelectorsSchema, each list capped at MAX_CARRIED_IDS. */
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
  [COLLECTION_NAMES.erasure_fences]:
    "the erasure write fence (D-015/D-016): it must outlive the purge it protects; it holds only a hash of the studentId, a request id and timestamps, and is removed after completion once its minimum hold (and grace, if any) has passed",
  [COLLECTION_NAMES.email_outbox]:
    "T-029: the approver's approval-request record; it holds the opaque request id, reason code and staff actor ids, never the studentId or any student data, and is kept as part of the erasure audit trail",
} as const;

/** A resolve read failed; carries WHICH anchor collection, so the receipt labels it accurately (ISS-t-011-c1-rev-3). */
class SelectorResolveError extends Error {
  constructor(
    readonly collection: string,
    readonly cause: unknown,
  ) {
    super(`SelectorResolveError: resolving ${collection} failed`);
    this.name = "SelectorResolveError";
  }
}

async function resolveFrom<T>(collection: string, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (err) {
    throw new SelectorResolveError(collection, err);
  }
}

async function resolveSelectors(db: Db, studentId: string): Promise<ErasureSelectors> {
  const facts = await resolveFrom(COLLECTION_NAMES.facts, () =>
    db.collection<FactDoc>(COLLECTION_NAMES.facts).find({ studentId }, { projection: { _id: 1 } }).toArray(),
  );
  const sessions = await resolveFrom(COLLECTION_NAMES.sessions, () =>
    db
      .collection<SessionDoc>(COLLECTION_NAMES.sessions)
      .find({ studentId }, { projection: { _id: 1, sessionId: 1, scribeThreadIds: 1 } })
      .toArray(),
  );
  const claims = await resolveFrom(COLLECTION_NAMES.scribe_resolutions, () =>
    db
      .collection<ScribeResolutionDoc>(COLLECTION_NAMES.scribe_resolutions)
      .find({ studentId }, { projection: { threadId: 1 } })
      .toArray(),
  );
  const sessionIds = [...new Set(sessions.flatMap((s) => [s.sessionId, s._id]).filter((x): x is string => !!x))];
  // Threads from the student's sessions AND from their approval claims (covers a claim whose
  // session row is already gone or was never written). T-016 / ISS-t-011-rev-5: plus every thread
  // the scribe recorded on the session row before its first checkpoint (`scribeThreadIds`), which
  // covers a run that ended without an interrupt (no claim) on a thread id that is not
  // scribeThreadId(sessionId).
  const recorded = sessions.flatMap((s) => (Array.isArray(s.scribeThreadIds) ? s.scribeThreadIds : []));
  const threadIds = [
    ...new Set(
      [...sessionIds.map(scribeCheckpointThreadId), ...recorded, ...claims.map((c) => c.threadId)].filter(
        (x): x is string => typeof x === "string" && x !== "",
      ),
    ),
  ];
  return { studentId, factIds: facts.map((f) => f._id), sessionIds, threadIds };
}

/** Which receipt line an over-cap id list is reported on (ISS-t-011-c1-rev-2). */
const CAP_LINE: Record<keyof CarriedSelectors, string> = {
  factIds: COLLECTION_NAMES.facts,
  sessionIds: COLLECTION_NAMES.sessions,
  threadIds: COLLECTION_NAMES.scribe_resolutions,
};

/** The id lists of `s` that exceed `cap`. */
function overCap(s: ErasureSelectors, cap: number): Array<keyof CarriedSelectors> {
  return (["factIds", "sessionIds", "threadIds"] as const).filter((k) => s[k].length > cap);
}

function carried(s: ErasureSelectors): CarriedSelectors {
  return { factIds: s.factIds, sessionIds: s.sessionIds, threadIds: s.threadIds };
}

/**
 * Name and code only: a driver message can echo the filter (ids), and (ISS-t-015-c0-1) a
 * Mongo-shaped error's message can embed a document field value (e.g. an E11000 duplicate-key
 * line). Exported so other loggers of driver/writer errors (apps/api's defaultSweepErrorLogger)
 * get the same redaction instead of reinventing it.
 */
export function errorLabel(err: unknown): string {
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
 * Runs an APPROVED (or previously failed) erasure request. Returns the verified receipt, or throws
 * ErasureIncompleteError (request left `failed`, retryable). T-029: before touching any student
 * collection, throws ErasureNotConfirmedError for a pending or only-once-confirmed request,
 * ErasureNotApprovedError for one still waiting for the approver, and ErasureStateError for a
 * rejected / expired one. So no single call, and no confirmation without approval (or the
 * operator's autoDelete opt-in), ever purges.
 */
export async function executeErasure(db: Db, requestId: string, options: ExecuteErasureOptions = {}): Promise<ErasureOutcome> {
  const fenceGraceMs = options.fenceGraceMs ?? ERASURE_FENCE_GRACE_MS;
  const maxCarriedIds = options.maxCarriedIds ?? MAX_CARRIED_IDS;
  const row = await erasureRequests(db).findOne({ _id: requestId });
  if (!row) throw new ErasureRequestNotFoundError();
  if (row.status === "completed" && row.receipt) {
    return { status: "completed", receipt: row.receipt, alreadyCompleted: true };
  }
  if (row.status === "pending" || row.status === "confirmed" || !row.confirmedBy || !row.secondConfirmedBy) {
    throw new ErasureNotConfirmedError();
  }
  if (row.status === "awaiting_approval") throw new ErasureNotApprovedError();
  if (row.status !== "approved" && row.status !== "failed") throw new ErasureStateError(row.status, "execute");
  // T-029: a failed row is only ever reached from an approved one; never purge without an approval.
  if (!row.approvedBy) throw new ErasureNotApprovedError();
  const studentId = row.studentId;
  // Integrity: the clear id still matches the fence key the request was opened with, and the HMAC
  // pseudonym that will outlive it is on the row.
  if (!studentId || row.studentKey !== erasureFenceKey(studentId) || typeof row.studentHash !== "string") {
    throw new ErasureStateError(row.status, "execute (studentId missing or does not match its key)");
  }
  // ISS-t-011-c1-rev-2: the carried ids are validated (shape + cap) before anything is touched.
  let carriedFromRow: CarriedSelectors | undefined;
  if (row.carriedSelectors !== undefined) {
    const parsed = ErasureCarriedSelectorsSchema.safeParse(row.carriedSelectors);
    if (!parsed.success) throw new ErasureStateError(row.status, "execute (carriedSelectors failed validation)");
    carriedFromRow = parsed.data;
  }

  // D-015: the fence exists before the first selector is resolved. confirmErasure set it; this
  // re-sets it (in case it was lost) and takes it over for this request.
  await setErasureFence(db, studentId, requestId);

  // The CAS keys, snapshotted at the read (never a live object that could change under us).
  const readState = { status: row.status, attempts: row.attempts };
  const startedAt = new Date().toISOString();
  // Ids a previous failed attempt resolved: their anchors may already be gone.
  let selectors: ErasureSelectors = mergeSelectors({ studentId, factIds: [], sessionIds: [], threadIds: [] }, carriedFromRow);

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
    // Set when this round must not delete anything (a later-round resolve failure, or the id cap).
    let halt = false;
    try {
      const merged = mergeSelectors(selectors, await resolveSelectors(db, studentId));
      const over = overCap(merged, maxCarriedIds);
      if (over.length > 0) {
        // ISS-t-011-c1-rev-2: keep the within-cap ids we had and delete nothing more. The anchors
        // behind the new ids are untouched, so a retry can resolve them again.
        for (const k of over) failed.set(CAP_LINE[k], "selectors:over_cap");
        halt = true;
      } else {
        selectors = merged;
      }
    } catch (err) {
      const cause = err instanceof SelectorResolveError ? err.cause : err;
      // Round 1: nothing deleted yet and the row is untouched (the fence stays: the request is open).
      if (rounds === 1) throw cause;
      // ISS-t-011-c1-rev-3: labelled with the collection whose read failed, not always facts.
      failed.set(err instanceof SelectorResolveError ? err.collection : COLLECTION_NAMES.facts, `resolve:${errorLabel(cause)}`);
      halt = true;
    }
    for (const phase of [1, 2] as const) {
      const steps = ERASURE_PLAN.filter((s) => s.phase === phase);
      if (halt || (failed.size > 0 && (phase === 2 || rounds > 1))) {
        if (phase === 2) for (const step of steps) if (!failed.has(step.collection)) deferred.add(step.collection);
        continue;
      }
      for (const step of steps) {
        try {
          // ISS-t-014-rev-1: an explicit per-op timeoutMS, larger than the client-level default
          // (D-016's fence margin, sized for a different purpose) — see ERASURE_PURGE_OP_TIMEOUT_MS.
          const res = await db.collection(step.collection).deleteMany(step.filter(selectors), { timeoutMS: ERASURE_PURGE_OP_TIMEOUT_MS });
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
        // ISS-t-014-rev-1: same explicit per-op timeoutMS as the deletes above.
        remaining = await db.collection(step.collection).countDocuments(step.residue(selectors), { timeoutMS: ERASURE_PURGE_OP_TIMEOUT_MS });
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
  const buildReceipt = (attempt: number, isVerified = verified): ErasureReceipt =>
    ErasureReceiptSchema.parse({ requestId, attempt, verified: isVerified, totalRemaining, collections, rounds, startedAt, verifiedAt });

  // Checked CAS (ISS-t-011-c0-1 / rev-1), like confirmErasure. The filter pins status AND attempts,
  // so only one of several concurrent runs records against a given row state. On a miss, re-read:
  //   - completed by a concurrent run -> return ITS stored receipt, alreadyCompleted: true (this
  //     run records nothing, so `attempts` counts recorded attempts only);
  //   - still approved / failed (a concurrent run recorded a failure) -> record this run as the
  //     next attempt against the fresh row.
  let current = readState;
  for (let tries = 0; tries < ERASURE_CAS_TRIES; tries += 1) {
    const attempt = current.attempts + 1;
    const receipt = buildReceipt(attempt);
    const cas = { _id: requestId, status: current.status, attempts: current.attempts };
    const updated = verified
      ? await erasureRequests(db).findOneAndUpdate(cas, {
          $set: { status: "completed", attempts: attempt, lastAttemptAt: startedAt, completedAt: verifiedAt, receipt },
          $unset: { studentId: "", studentKey: "", carriedSelectors: "" },
        })
      : await erasureRequests(db).findOneAndUpdate(cas, {
          $set: { status: "failed", attempts: attempt, lastAttemptAt: startedAt, receipt, carriedSelectors: carried(selectors) },
        });
    if (updated) {
      if (verified) {
        // D-015/D-016: released only AFTER the completion is recorded, and never before the minimum
        // hold (createdAt + MINIMUM_FENCE_HOLD_MS): until then every writer stays fenced.
        await releaseErasureFence(db, studentId, requestId, fenceGraceMs, verifiedAt);
        return { status: "completed", receipt, alreadyCompleted: false };
      }
      throw new ErasureIncompleteError(receipt);
    }
    const now = await erasureRequests(db).findOne({ _id: requestId });
    if (!now) throw new ErasureRequestNotFoundError();
    if (now.status === "completed" && now.receipt) {
      // This run may have re-set the fence after the winner released it: release it again.
      await releaseErasureFence(db, studentId, requestId, fenceGraceMs, now.completedAt ?? verifiedAt);
      return { status: "completed", receipt: now.receipt, alreadyCompleted: true };
    }
    if (now.status !== "approved" && now.status !== "failed") throw new ErasureStateError(now.status, "record");
    // A concurrent failed run may have carried ids this run did not see; keep them for the retry.
    // Only a valid carry that keeps every list within the cap is merged (ISS-t-011-c1-rev-2).
    const theirs = ErasureCarriedSelectorsSchema.safeParse(now.carriedSelectors);
    if (theirs.success) {
      const merged = mergeSelectors(selectors, theirs.data);
      if (overCap(merged, maxCarriedIds).length === 0) selectors = merged;
    }
    current = { status: now.status, attempts: now.attempts };
  }
  // ISS-t-011-c1-rev-3: the checked CAS kept missing. The attempt is still recorded, never dropped
  // from the audit: as failed and unverified, so it stays retryable with studentId and the fence
  // kept. The filter does not pin `attempts` (the checked path is exhausted) but never matches a
  // completed row.
  const attempt = current.attempts + 1;
  await erasureRequests(db).updateOne(
    { _id: requestId, status: { $in: ["approved", "failed"] } },
    {
      $set: {
        status: "failed",
        attempts: attempt,
        lastAttemptAt: startedAt,
        receipt: buildReceipt(attempt, false),
        carriedSelectors: carried(selectors),
      },
    },
  );
  throw new ErasureStateError(
    current.status,
    `record (the row kept changing under concurrent runs; attempt ${attempt} was recorded as failed and can be retried)`,
  );
}

/** Checked-CAS tries before the attempt is recorded unchecked as failed (ISS-t-011-c1-rev-3). */
const ERASURE_CAS_TRIES = 5;

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Student access projection; staff, provider and write ownership fields never leave the service. */
interface SafetyExportBase {
  sessionId: string; studentId: string; turnId: string; guardLevel: "none" | "concern" | "crisis"; matched: string[]; flaggedAt: string;
}
type SafetySeverity = "none" | "low" | "moderate" | "high" | "critical";
type SafetyClassifierExport =
  | { status: "classified"; severity: SafetySeverity; likelyBenign: boolean; rationale: string; classifiedAt: string }
  | { status: "unavailable"; reason: "timeout" | "error"; attemptedAt: string };
interface SafetyNotificationExport extends SafetyExportBase {
  escalationId: string; severity: SafetySeverity; reason: "guard_crisis" | "classifier_severity" | "classifier_unavailable";
  channel: "record_only"; status: "queued"; notifiedAt: string; acknowledgedAt: string | null;
}
interface SafetyReviewExport extends SafetyExportBase { classifier?: SafetyClassifierExport }
interface SafetyAccessRow extends SafetyNotificationExport {
  _id: string; guard?: { level: SafetyExportBase["guardLevel"]; matched: string[] };
  classifier?: SafetyClassifierExport;
}

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
  facts: Array<Omit<FactDoc, "writerToken" | "retirementWriterToken">>;
  sessions: SessionDoc[];
  /** Stored personal history for access only; a pending version is not final graph publication. */
  summaryHistory?: Array<Pick<SessionDoc, "sessionId" | "summary" | "summaryApprovedAt" | "summaryWithheldReason">>;
  /**
   * T-018: the `decisions` collection holds two discriminated shapes — pre-existing course/
   * university selection rows (DecisionDoc, `kind` absent) and per-fact reject-reason audit
   * records (RejectReasonAuditDoc, `kind: "per_fact_reject"`, decisions.ts). Both are the
   * student's own data and both belong in their access copy.
   */
  decisions: Array<Exclude<DecisionDoc, { kind: string }> | RejectReasonAuditDoc>;
  consents: ConsentDoc[];
  edges: Array<Omit<EdgeDoc, "writerToken"> & { concern?: ConcernRecord }>;
  /** Scribe approval claims (they hold the approved fact values). */
  approvalClaims: Array<Pick<ScribeResolutionDoc, "_id" | "threadId" | "studentId"> & Partial<Omit<ScribeResolutionDoc, "_id" | "threadId" | "studentId" | "lease" | "leaseOwnershipToken">>>;
  /**
   * T-024 / ISS-t-013r-c0-3 (D-020): the full chat, VERBATIM — every persisted transcript turn of
   * every session, in speaking order (sessionId, ts, turnId). This is the readable copy the
   * checkpoints below duplicate as serialized state.
   */
  transcripts: TranscriptTurnDoc[];
  escalations: SafetyNotificationExport[];
  crisisReviews: SafetyReviewExport[];
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
  const transcripts = await db.collection<TranscriptTurnDoc>(COLLECTION_NAMES.session_transcripts).find({ studentId }).toArray();
  transcripts.sort((a, b) => a.sessionId.localeCompare(b.sessionId) || a.ts - b.ts || a.turnId.localeCompare(b.turnId));
  const escalations = await db.collection<SafetyAccessRow>(COLLECTION_NAMES.escalation_notifications).find({ studentId }).toArray();
  escalations.sort((a, b) => a._id.localeCompare(b._id));
  const crisisReviews = await db.collection<SafetyAccessRow>(COLLECTION_NAMES.crisis_flag_reviews).find({ studentId }).toArray();
  crisisReviews.sort((a, b) => a._id.localeCompare(b._id));
  const decisionRows = await db.collection<DecisionDoc | RejectReasonAuditDoc>(COLLECTION_NAMES.decisions).find({ studentId }).toArray();
  const summaryKinds = new Set(["session_summary_verification", "session_summary_baseline", "session_summary_write"]);
  const ledgerRows = decisionRows.filter(row => "kind" in row && summaryKinds.has(row.kind)).map(row => row as unknown as Document);
  const ledgerById = new Map<string, Document>();
  const historyKeys = ["summary", "summaryApprovedAt", "summaryWithheldReason"] as const;
  const markerKeys = ["summaryWriterToken", "summaryLineageId", "summaryRestoreToken", "summaryBaselineId", "summaryVerificationId", "summaryProofCreatorToken"] as const;
  const associationKeys = ["summaryBaselineId", "summaryVerificationId", "summaryProofCreatorToken"] as const;
  const snapshotKeys = [...historyKeys, ...markerKeys];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const historyEntries: Array<{ id: string; entry: NonNullable<StudentExport["summaryHistory"]>[number] }> = [];
  for (const row of ledgerRows) {
    if (typeof row._id !== "string" || ledgerById.has(row._id) || row.version !== 1 || row.studentId !== studentId ||
        typeof row.sessionId !== "string" || !row.sessionId || !row.binding || typeof row.binding !== "object" || Array.isArray(row.binding) ||
        Object.keys(row.binding).length !== 2 || !Object.hasOwn(row.binding, "lifecycleGeneration") || !Object.hasOwn(row.binding, "creationAttempt")) {
      throw new Error("exportStudent: corrupt session summary history");
    }
    for (const key of ["lifecycleGeneration", "creationAttempt"] as const) {
      const field = row.binding[key];
      if (!field || typeof field !== "object" || Array.isArray(field) ||
          !((field.present === false && Object.keys(field).length === 1 && Object.hasOwn(field, "present")) ||
            (field.present === true && Object.keys(field).length === 2 && Object.hasOwn(field, "present") && Object.hasOwn(field, "value") && typeof field.value === "string" && field.value.length > 0))) {
        throw new Error("exportStudent: corrupt session summary history");
      }
    }
    if (row.kind === "session_summary_verification") {
      if (row.state !== "verified" || typeof row.creatorToken !== "string" || !uuid.test(row.creatorToken) ||
          typeof row.snapshotDigest !== "string" || !/^[0-9a-f]{64}$/.test(row.snapshotDigest) || row._id !== `summary-proof:${row.snapshotDigest}` ||
          !["fresh_session_creation", "verified_migration"].includes(row.source) || typeof row.evidenceRef !== "string" || !row.evidenceRef || Object.hasOwn(row, "payload")) {
        throw new Error("exportStudent: corrupt session summary history");
      }
      if (row.source === "fresh_session_creation") {
        const receipt = row.creationReceipt;
        if (!receipt || typeof receipt !== "object" || Array.isArray(receipt) ||
            Object.keys(receipt).length !== 5 || !["lifecycle_open", "scribe_create"].includes(receipt.operation) ||
            !row.binding.lifecycleGeneration.present || !row.binding.creationAttempt.present ||
            receipt.generation !== row.binding.lifecycleGeneration.value || receipt.creationAttempt !== row.binding.creationAttempt.value ||
            typeof receipt.consentId !== "string" || !receipt.consentId || typeof receipt.lifecycleIncarnation !== "string" || !uuid.test(receipt.lifecycleIncarnation)) {
          throw new Error("exportStudent: corrupt session summary history");
        }
      } else if (Object.hasOwn(row, "creationReceipt")) {
        throw new Error("exportStudent: corrupt session summary history");
      }
    } else {
      if ((row.kind === "session_summary_baseline" && row.state !== "verified") ||
          (row.kind === "session_summary_write" && !["pending", "committed", "invalid"].includes(row.state))) {
        throw new Error("exportStudent: corrupt session summary history");
      }
      const markers = row.kind === "session_summary_baseline" ? row.baselineMarkers : row.materializationMarkers;
      if (!markers || typeof markers !== "object" || Array.isArray(markers) ||
          Object.keys(markers).some(key => !markerKeys.includes(key as typeof markerKeys[number]) || typeof markers[key] !== "string")) {
        throw new Error("exportStudent: corrupt session summary history");
      }
      if (row.state === "invalid") {
        if (Object.hasOwn(row, "payload")) throw new Error("exportStudent: corrupt session summary history");
      } else {
        const payload = row.payload;
        if (!Object.hasOwn(row, "payload") || !payload || typeof payload !== "object" || Array.isArray(payload) ||
            Object.keys(payload).some(key => !historyKeys.includes(key as typeof historyKeys[number]) || typeof payload[key] !== "string") ||
            (row.kind === "session_summary_write" && (!Object.hasOwn(payload, "summary") || !Object.hasOwn(payload, "summaryApprovedAt")))) {
          throw new Error("exportStudent: corrupt session summary history");
        }
      }
      if (row.kind === "session_summary_baseline") {
        if (typeof row.creatorToken !== "string" || !uuid.test(row.creatorToken) || typeof row.proofCreatorToken !== "string" || !uuid.test(row.proofCreatorToken) ||
            typeof row.proofId !== "string" || typeof row.snapshotDigest !== "string" || !/^[0-9a-f]{64}$/.test(row.snapshotDigest)) {
          throw new Error("exportStudent: corrupt session summary history");
        }
      } else if (typeof row.writerToken !== "string" || !uuid.test(row.writerToken) || typeof row.restoreToken !== "string" || !uuid.test(row.restoreToken) ||
          row.restoreToken === row.writerToken || row._id !== `summary-write:${row.writerToken}` || typeof row.parentId !== "string" || typeof row.rootId !== "string" ||
          typeof row.decidedAt !== "string" || markers.summaryWriterToken !== row.writerToken || markers.summaryLineageId !== row._id || Object.hasOwn(markers, "summaryRestoreToken")) {
        throw new Error("exportStudent: corrupt session summary history");
      }
    }
    ledgerById.set(row._id, row);
  }
  for (const row of ledgerRows) {
    if (row.kind === "session_summary_baseline") {
      const proof = ledgerById.get(row.proofId);
      if (!proof || proof.kind !== "session_summary_verification" || proof.studentId !== row.studentId || proof.sessionId !== row.sessionId ||
          JSON.stringify(proof.binding) !== JSON.stringify(row.binding) || proof.creatorToken !== row.proofCreatorToken || proof.snapshotDigest !== row.snapshotDigest ||
          row._id !== `summary-baseline:${createHash("sha256").update(JSON.stringify([row.snapshotDigest, proof.creatorToken])).digest("hex")}`) {
        throw new Error("exportStudent: corrupt session summary history");
      }
      const snapshot: Record<string, string> = { ...row.payload, ...row.baselineMarkers };
      if (proof.source === "fresh_session_creation") {
        // The immutable creation receipt admits an empty PRE-association nine-field tuple.
        // Its derived readiness association is checked separately, never hashed recursively.
        if (historyKeys.some(key => Object.hasOwn(row.payload, key)) ||
            markerKeys.slice(0, 3).some(key => Object.hasOwn(row.baselineMarkers, key)) ||
            row.baselineMarkers.summaryBaselineId !== row._id || row.baselineMarkers.summaryVerificationId !== proof._id ||
            row.baselineMarkers.summaryProofCreatorToken !== proof.creatorToken) {
          throw new Error("exportStudent: corrupt session summary history");
        }
        for (const key of associationKeys) delete snapshot[key];
      }
      const digest = createHash("sha256").update(JSON.stringify([tenantIdOf(db) ?? null, row.studentId, row.sessionId, row.binding,
        snapshotKeys.map(key => [key, Object.hasOwn(snapshot, key) ? { present: true, value: snapshot[key] } : { present: false }])])).digest("hex");
      if (digest !== row.snapshotDigest) throw new Error("exportStudent: corrupt session summary history");
    } else if (row.kind === "session_summary_write") {
      const root = ledgerById.get(row.rootId);
      if (!root || root.kind !== "session_summary_baseline" || root.studentId !== row.studentId || root.sessionId !== row.sessionId ||
          JSON.stringify(root.binding) !== JSON.stringify(row.binding)) throw new Error("exportStudent: corrupt session summary history");
      for (const key of associationKeys) {
        if (Object.hasOwn(row.materializationMarkers, key) !== Object.hasOwn(root.baselineMarkers, key) ||
            (Object.hasOwn(root.baselineMarkers, key) && row.materializationMarkers[key] !== root.baselineMarkers[key])) {
          throw new Error("exportStudent: corrupt session summary history");
        }
      }
      const visited = new Set<string>([row._id]);
      let parent = ledgerById.get(row.parentId);
      while (parent) {
        if (visited.has(parent._id) || parent.studentId !== row.studentId || parent.sessionId !== row.sessionId ||
            JSON.stringify(parent.binding) !== JSON.stringify(row.binding) ||
            (parent.kind !== "session_summary_baseline" && parent.kind !== "session_summary_write")) {
          throw new Error("exportStudent: corrupt session summary history");
        }
        visited.add(parent._id);
        if (parent.kind === "session_summary_baseline") {
          if (parent._id !== row.rootId) throw new Error("exportStudent: corrupt session summary history");
          break;
        }
        if (parent.rootId !== row.rootId) throw new Error("exportStudent: corrupt session summary history");
        parent = ledgerById.get(parent.parentId);
      }
      if (!parent) throw new Error("exportStudent: corrupt session summary history");
    }
    if (row.kind !== "session_summary_verification" && row.state !== "invalid" && Object.keys(row.payload).length > 0) {
      const entry: NonNullable<StudentExport["summaryHistory"]>[number] = { sessionId: row.sessionId };
      for (const key of historyKeys) if (Object.hasOwn(row.payload, key)) entry[key] = row.payload[key];
      historyEntries.push({ id: row._id, entry });
    }
  }
  historyEntries.sort((a, b) => a.entry.sessionId.localeCompare(b.entry.sessionId) ||
    (Object.hasOwn(a.entry, "summaryApprovedAt") === Object.hasOwn(b.entry, "summaryApprovedAt")
      ? (a.entry.summaryApprovedAt ?? "").localeCompare(b.entry.summaryApprovedAt ?? "")
      : Object.hasOwn(a.entry, "summaryApprovedAt") ? 1 : -1) || a.id.localeCompare(b.id));
  return {
    format: "vc-student-export/v1",
    purpose: "data_subject_access",
    exportedAt: new Date().toISOString(),
    studentId,
    student: await db.collection<StudentDoc>(COLLECTION_NAMES.students).findOne({ studentId }),
    facts: facts.map(({ writerToken, retirementWriterToken, ...publicFact }) => publicFact),
    sessions: (await db.collection<SessionDoc>(COLLECTION_NAMES.sessions).find({ studentId }).toArray()).map(row => ({
      _id: row._id, sessionId: row.sessionId, studentId: row.studentId,
      ...(row.consentId === undefined ? {} : { consentId: row.consentId }),
      ...(row.startedAt === undefined ? {} : { startedAt: row.startedAt }),
      ...(row.endedAt === undefined ? {} : { endedAt: row.endedAt }),
      ...(row.scribeThreadIds === undefined ? {} : { scribeThreadIds: row.scribeThreadIds }),
      ...(row.summary === undefined ? {} : { summary: row.summary }),
      ...(row.summaryApprovedAt === undefined ? {} : { summaryApprovedAt: row.summaryApprovedAt }),
      ...(row.summaryWithheldReason === undefined ? {} : { summaryWithheldReason: row.summaryWithheldReason }),
    })),
    ...(historyEntries.length ? { summaryHistory: historyEntries.map(({ entry }) => entry) } : {}),
    decisions: decisionRows
      .filter(row => !("kind" in row) || (row.kind !== "session_opening_capability" && !summaryKinds.has(row.kind)))
      .map(row => "kind" in row && row.kind === "per_fact_reject" ? {
        _id: row._id, kind: row.kind, threadId: row.threadId, studentId: row.studentId, decidedAt: row.decidedAt,
        rejected: row.rejected.map(item => ({ key: item.key, ...(item.reason === undefined ? {} : { reason: item.reason }) })),
      } : (() => {
        const decision = row as Exclude<DecisionDoc, { kind: string }>;
        return { _id: decision._id, studentId: decision.studentId, universityId: decision.universityId,
          courseId: decision.courseId, rationale: decision.rationale, alternativesConsidered: decision.alternativesConsidered,
          decidedAt: decision.decidedAt };
      })()),
    consents: (await db.collection<ConsentDoc>(COLLECTION_NAMES.consents).find({ studentId }).toArray()).map(row => ({
      _id: row._id, studentId: row.studentId, guardianConsent: row.guardianConsent, purposes: row.purposes,
      recordedAt: row.recordedAt, minor: row.minor,
    })),
    edges: (await db.collection<EdgeDoc & { concern?: ConcernRecord }>(COLLECTION_NAMES.edges).find(edgeFilter(s) as Filter<EdgeDoc & { concern?: ConcernRecord }>).toArray()).map(edge => ({
      _id: edge._id, from: { kind: edge.from.kind, id: edge.from.id }, to: { kind: edge.to.kind, id: edge.to.id },
      rel: edge.rel, createdAt: edge.createdAt,
      ...(edge.concern === undefined ? {} : { concern: {
        ...(edge.concern.concernId === undefined ? {} : { concernId: edge.concern.concernId }),
        ...(edge.concern.studentId === undefined ? {} : { studentId: edge.concern.studentId }),
        ...(edge.concern.sessionId === undefined ? {} : { sessionId: edge.concern.sessionId }),
        ...(edge.concern.level === undefined ? {} : { level: edge.concern.level }),
        ...(edge.concern.reason === undefined ? {} : { reason: edge.concern.reason }),
        ...(edge.concern.matched === undefined ? {} : { matched: edge.concern.matched }),
        ...(edge.concern.detector === undefined ? {} : { detector: edge.concern.detector }),
        ...(edge.concern.citation === undefined ? {} : { citation: {
          ...(edge.concern.citation.type === undefined ? {} : { type: edge.concern.citation.type }),
          ...(edge.concern.citation.quote === undefined ? {} : { quote: edge.concern.citation.quote }),
          ...(edge.concern.citation.turnId === undefined ? {} : { turnId: edge.concern.citation.turnId }),
        } }),
      } as ConcernRecord }),
    })),
    approvalClaims: (await db
      .collection<ScribeResolutionDoc>(COLLECTION_NAMES.scribe_resolutions)
      .find({ studentId })
      .toArray()).map(row => {
        // Project typed public containers; opaque fact values remain personal data, not authority.
        const [decisionEdits, responseFacts] = [row.decision?.edits, row.response?.action === "edit" && Array.isArray(row.response.facts) ? row.response.facts as Fact[] : undefined]
          .map(facts => facts?.map((fact): Fact => {
            const original = fact.source.type === "counsellor-edit" ? fact.source.editedFrom : fact.source;
            const source = original.type === "transcript" ? { type: original.type, quote: original.quote, turnId: original.turnId }
              : original.type === "kb" ? { type: original.type, id: original.id, fetchedAt: original.fetchedAt }
              : { type: original.type, id: original.id };
            return { key: fact.key, value: fact.value, source: fact.source.type === "counsellor-edit"
              ? { type: fact.source.type, counsellorId: fact.source.counsellorId, editedAt: fact.source.editedAt, editedFrom: source } : source,
              confidence: fact.confidence, validFrom: fact.validFrom, purposeTags: fact.purposeTags, sensitivity: fact.sensitivity,
              ...(fact.validTo === undefined ? {} : { validTo: fact.validTo }),
              ...(fact.kind === undefined ? {} : { kind: fact.kind }),
              ...(fact.explains === undefined ? {} : { explains: fact.explains }),
              ...(fact.citationMatch === undefined ? {} : { citationMatch: fact.citationMatch }),
              ...(fact.needsReview === undefined ? {} : { needsReview: fact.needsReview }),
              ...(fact.reviewReasons === undefined ? {} : { reviewReasons: fact.reviewReasons }) };
          }));
        const response = row.response?.action === "approve" ? { action: "approve" }
          : row.response?.action === "reject" ? { action: "reject", ...(row.response.reason === undefined ? {} : { reason: row.response.reason }) }
          : row.response?.action === "edit" ? { action: "edit", facts: responseFacts }
          : row.response?.action === "per_fact" ? { action: "per_fact", summary: row.response.summary,
            facts: (Array.isArray(row.response.facts) ? row.response.facts as { key: string; decision: string; reason?: string; value?: unknown }[] : [])
              .map(item => ({ key: item.key, decision: item.decision,
                ...(item.decision === "reject" && item.reason !== undefined ? { reason: item.reason } : {}),
                ...(item.decision === "edit" ? { value: item.value } : {}) })) }
          : typeof row.response?.action === "string" ? { action: row.response.action } : {};
        return { _id: row._id, threadId: row.threadId, studentId: row.studentId,
          ...(row.decision === undefined ? {} : { decision: { approve: row.decision.approve, ...(decisionEdits === undefined ? {} : { edits: decisionEdits }) } }),
          ...(row.response === undefined ? {} : { response }),
          ...(row.responseHash === undefined ? {} : { responseHash: row.responseHash }),
          ...(row.claimedAt === undefined ? {} : { claimedAt: row.claimedAt }),
          ...(row.approvalMetadata === undefined ? {} : { approvalMetadata: { counsellorId: row.approvalMetadata.counsellorId, editedAt: row.approvalMetadata.editedAt } }) };
      }),
    transcripts: transcripts.map(turn => ({ _id: turn._id, sessionId: turn.sessionId, studentId: turn.studentId, turnId: turn.turnId,
      speaker: turn.speaker, lang: turn.lang, text: turn.text, translatedText: turn.translatedText, ts: turn.ts, recordedAt: turn.recordedAt })),
    escalations: escalations.map((d) => ({
      escalationId: d.escalationId, sessionId: d.sessionId, studentId: d.studentId, turnId: d.turnId,
      guardLevel: d.guardLevel, matched: d.matched, severity: d.severity, reason: d.reason,
      channel: d.channel, status: d.status, flaggedAt: d.flaggedAt, notifiedAt: d.notifiedAt, acknowledgedAt: d.acknowledgedAt,
    })),
    crisisReviews: crisisReviews.map((d) => ({
      sessionId: d.sessionId, studentId: d.studentId, turnId: d.turnId,
      guardLevel: d.guard!.level, matched: d.guard!.matched, flaggedAt: d.flaggedAt,
      ...(d.classifier === undefined ? {} : { classifier: d.classifier.status === "classified"
        ? { status: d.classifier.status, severity: d.classifier.severity, likelyBenign: d.classifier.likelyBenign, rationale: d.classifier.rationale, classifiedAt: d.classifier.classifiedAt }
        : { status: d.classifier.status, reason: d.classifier.reason, attemptedAt: d.classifier.attemptedAt } }),
    })),
    checkpoints: {
      threads: [...s.threadIds].sort(),
      checkpointDocs: await db.collection(COLLECTION_NAMES.scribe_checkpoints).countDocuments(byThread(s)),
      writeDocs: await db.collection(COLLECTION_NAMES.scribe_checkpoint_writes).countDocuments(byThread(s)),
    },
  };
}
