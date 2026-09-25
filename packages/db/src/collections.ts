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
  // T-011 / B15: the erasure audit log (src/erasure.ts). Survives erasure; no personal data
  // once a request completes.
  erasure_requests: "erasure_requests",
  // T-011 cycle 2 / D-015: the erasure write fence, one doc per fenced student (src/erasure.ts).
  // Keyed by a hash of the studentId, never the clear id; set at confirm, removed after completion
  // once its D-016 minimum hold (createdAt + MINIMUM_FENCE_HOLD_MS) has passed.
  erasure_fences: "erasure_fences",
  // Name constants only — owned by the university-kb unit (ARCHITECTURE Q1).
  universities: "universities",
  courses: "courses",
} as const;

export interface StudentDoc {
  _id: string;
  studentId: string;
  createdAt: string;
}

export interface SessionDoc {
  _id: string;
  sessionId: string;
  studentId: string;
  consentId: string;
  startedAt: string;
  endedAt?: string;
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
