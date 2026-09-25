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
import { FactSchema, ConsentSchema, DecisionSchema, type Fact, type Consent, type Decision } from "@vc/schemas";
import type { EdgeDoc } from "./edges.js";

export type { EdgeDoc };

export const COLLECTION_NAMES = {
  students: "students",
  sessions: "sessions",
  facts: "facts",
  decisions: "decisions",
  consents: "consents",
  edges: "edges",
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
