/**
 * Typed accessors for the `virtual_counsellor` collections (ARCHITECTURE.md
 * H3). Every accessor takes the `Db` returned by getVcDb/connectFromEnv, so
 * there is no way to reach a collection without first passing the B12 guard.
 *
 * `universities` and `courses` are declared here as name constants only —
 * their document shapes and accessors belong to the university-kb unit
 * (ARCHITECTURE.md Q1). Nothing in this package reads or writes them.
 */
import type { Collection, Db } from "mongodb";
import {
  FactSchema,
  ConsentSchema,
  DecisionSchema,
  type CounsellorDecision,
  type Fact,
  type Consent,
  type Decision,
} from "@vc/schemas";
import type { EdgeDoc } from "./edges.js";

export type { EdgeDoc };

export const COLLECTION_NAMES = {
  students: "students",
  sessions: "sessions",
  facts: "facts",
  decisions: "decisions",
  consents: "consents",
  edges: "edges",
  // ISS-t-007-rev-8: one approval claim per scribe thread (unique threadId, see INDEX_PLAN).
  scribe_resolutions: "scribe_resolutions",
  // ISS-t-007-rev-6 / T-011: LangGraph MongoDBSaver's collections for the scribe graph
  // (packages/engine/src/scribe/checkpointer.ts SCRIBE_CHECKPOINT_COLLECTIONS; the erasure test's
  // drift guard reads that file). Owned by the saver; named here so db-init creates them with
  // their indexes and B15 erasure covers them (they hold transcripts). Keyed by `thread_id`.
  scribe_checkpoints: "scribe_checkpoints",
  scribe_checkpoint_writes: "scribe_checkpoint_writes",
  // T-024 / ISS-t-013r-c0-3 (D-020 "puri chat bhi save rehegi"): the session transcript as a
  // first-class, readable record, one document per turn (facts.ts recordSessionTranscript). The
  // counsellor reads it (readSessionTranscript), exportStudent dumps it verbatim, B15 erasure
  // hard-deletes it by studentId. Never TTL-indexed (tests/db-init.test.ts guards that): the chat is
  // the ground truth every fact's citation points into.
  session_transcripts: "session_transcripts",
  // T-011 / B15: the erasure audit log (src/erasure.ts). Survives erasure; no personal data
  // once a request completes.
  erasure_requests: "erasure_requests",
  // T-011 cycle 2 / D-015: the erasure write fence, one doc per fenced student (src/erasure.ts).
  // Keyed by a hash of the studentId, never the clear id; set at confirm, removed after completion
  // once its D-016 minimum hold (createdAt + MINIMUM_FENCE_HOLD_MS) has passed.
  erasure_fences: "erasure_fences",
  // T-029 / B15 approver workflow: the email OUTBOX. A record only: nothing in this repo sends it
  // (no SMTP, no network). Holds the approval request addressed to the configured approver, with the
  // request id, reason code and staff actor ids, never the studentId (src/erasure.ts).
  email_outbox: "email_outbox",
  // T-034 / B21 Events: the signed-webhook delivery queue (packages/engine/src/webhooks/outbox.ts
  // MongoWebhookOutbox). One document per event (`_id` == the event's own idempotency key, tenant-
  // qualified by tenantScopedDb); `event.data.studentId` carries the student the event is about, so
  // B15 erasure covers it as a direct row (ERASURE_PLAN, packages/db/src/erasure.ts) even though the
  // studentId itself sits one level down, not at the document's top level.
  webhook_outbox: "webhook_outbox",
  // Name constants only — owned by the university-kb unit (ARCHITECTURE Q1).
  universities: "universities",
  courses: "courses",
} as const;

export interface StudentDoc {
  _id: string;
  studentId: string;
  createdAt: string;
}

/**
 * One counselling session. `_id` is the sessionId.
 *
 * T-016 / ISS-t-011-rev-5: the scribe writes this row (facts.ts ensureScribeSessionRow) BEFORE its
 * first checkpoint, so every scribe thread is discoverable by B15 erasure/export through
 * `scribeThreadIds`, even a run that ends without an interrupt and even a thread id that is not
 * scribeThreadId(sessionId). A scribe-created row has no `consentId`/`startedAt` yet (the consent
 * gate runs inside the graph, after the row exists), so both are optional; the session-writer that
 * owns the live session (T-008) fills them.
 *
 * T-016 / ISS-t-007-rev-7: `summary` is the COUNSELLOR-APPROVED session summary, written only on an
 * approve/edit decision (facts.ts recordApprovedSessionSummary; B3). `summaryWithheldReason` is set
 * when the model's summary was withheld (B1), in which case `summary` is "" and the withheld text is
 * never stored.
 */
export interface SessionDoc {
  _id: string;
  sessionId: string;
  studentId: string;
  consentId?: string;
  startedAt?: string;
  endedAt?: string;
  /** Every scribe thread run for this session (each added once). */
  scribeThreadIds?: string[];
  summary?: string;
  summaryWithheldReason?: string;
  summaryApprovedAt?: string;
}

/**
 * T-024 / ISS-t-013r-c0-3: one persisted transcript turn (the ScribeTurn the scribe was given,
 * verbatim). `_id` is `${sessionId}:${turnId}` (transcriptTurnDocId), so a fact's citation
 * `{turnId, quote}` plus the session it is sourced_from names exactly one document, and the quote is
 * a span inside its `text` (or `translatedText`) — resolveCitationSpan (facts.ts). Written once,
 * never overwritten ($setOnInsert): the first recorded text is the ground truth.
 */
export interface TranscriptTurnDoc {
  _id: string;
  sessionId: string;
  studentId: string;
  turnId: string;
  speaker: "student" | "counsellor";
  lang: string;
  text: string;
  translatedText: string;
  ts: number;
  recordedAt: string;
}

export function transcriptTurnDocId(sessionId: string, turnId: string): string {
  return `${sessionId}:${turnId}`;
}

/**
 * A stored Fact: the Zod-validated shape plus its Mongo identity fields.
 * D-012: `_id` is a fresh ObjectId hex string per write (identity), and
 * `contentHash` (facts.ts deriveContentHash) is the content used for
 * idempotent-replay detection. `contentHash` is optional only so a legacy doc
 * written before D-012 still types; such a doc never matches a replay and is
 * simply superseded by the next approved write.
 * D-013: `active` is `true` on the open fact for a (studentId, key) and
 * ABSENT on every retired one (never `false`), because the unique partial
 * index filters on `{active: true}`. Optional so legacy docs still type.
 */
export type FactDoc = Fact & { _id: string; studentId: string; contentHash?: string; active?: true };

/** A stored Consent row: the Zod-validated shape plus its Mongo identity field. */
export type ConsentDoc = Consent & { _id: string };

/** A stored Decision (plan.md §4 step 1): the Zod-validated shape plus identity + timestamp. */
export type DecisionDoc = Decision & { _id: string; decidedAt: string };

/**
 * ISS-t-007-rev-8: the atomic, cross-process claim on a scribe thread's approval interrupt.
 * resumeScribe inserts one of these BEFORE resuming the graph; the unique index on `threadId`
 * (INDEX_PLAN) makes a second, concurrent claim fail with 11000, so exactly one counsellor
 * decision can ever be applied per thread. `_id` is the threadId as well.
 * - `decision`: the CounsellorDecision the winner's response resolves to (what a loser is told).
 * - `response`: the winner's validated approval response, kept so crash recovery
 *   (resumeScribe(null)) can apply the claimed decision if the process died after the claim but
 *   before the graph recorded it.
 * - `responseHash`: sha256 of the canonical JSON of `response`; equal hash = the same request.
 * - `studentId`: for B15/T-011 erasure (the doc holds the decision's fact values).
 */
export interface ScribeResolutionDoc {
  _id: string;
  threadId: string;
  studentId: string;
  decision: CounsellorDecision;
  response: Record<string, unknown>;
  responseHash: string;
  claimedAt: string;
  /**
   * T-016 / ISS-t-007-rev-10: the run lease on this thread. Present while a process is invoking the
   * graph for this claim (the winning resume from the moment it inserts the claim, or a
   * resumeScribe(null) recovery that took it with a CAS). A recovery takes it only when it is absent
   * or `expiresAt` has passed, so two recoveries, or a recovery and the in-flight winner, never
   * invoke the same thread concurrently. `expiresAt` = the holder's writer deadline + FENCE_MARGIN_MS
   * (D-016), so a holder that crashed releases it by expiry. ISO-8601 UTC, compared as a string.
   */
  lease?: { token: string; expiresAt: string };
}

export function studentsCollection(db: Db): Collection<StudentDoc> {
  return db.collection<StudentDoc>(COLLECTION_NAMES.students);
}

export function sessionsCollection(db: Db): Collection<SessionDoc> {
  return db.collection<SessionDoc>(COLLECTION_NAMES.sessions);
}

export function factsCollection(db: Db): Collection<FactDoc> {
  return db.collection<FactDoc>(COLLECTION_NAMES.facts);
}

export function decisionsCollection(db: Db): Collection<DecisionDoc> {
  return db.collection<DecisionDoc>(COLLECTION_NAMES.decisions);
}

export function consentsCollection(db: Db): Collection<ConsentDoc> {
  return db.collection<ConsentDoc>(COLLECTION_NAMES.consents);
}

export function edgesCollection(db: Db): Collection<EdgeDoc> {
  return db.collection<EdgeDoc>(COLLECTION_NAMES.edges);
}

export function scribeResolutionsCollection(db: Db): Collection<ScribeResolutionDoc> {
  return db.collection<ScribeResolutionDoc>(COLLECTION_NAMES.scribe_resolutions);
}

export function sessionTranscriptsCollection(db: Db): Collection<TranscriptTurnDoc> {
  return db.collection<TranscriptTurnDoc>(COLLECTION_NAMES.session_transcripts);
}

/** Validates a candidate Fact against the shared Zod schema before any write. */
export function validateFactForWrite(fact: unknown): Fact {
  return FactSchema.parse(fact);
}

/** Validates a candidate Consent row against the shared Zod schema before any write. */
export function validateConsentForWrite(consent: unknown): Consent {
  return ConsentSchema.parse(consent);
}

/** Validates a candidate Decision against the shared Zod schema before any write. */
export function validateDecisionForWrite(decision: unknown): Decision {
  return DecisionSchema.parse(decision);
}
