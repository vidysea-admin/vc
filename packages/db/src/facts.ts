/**
 * The fact write path (plan.md §3 steps 8/9; contract B3).
 *
 * proposeFactChanges is a PURE function — it never touches the `facts`
 * collection. It only ever produces a ProfileDiff for the counsellor to
 * review (plan.md step 8). ISS-021: every stored fact it reads is
 * re-validated with `FactSchema.safeParse` before being treated as "active" —
 * a schema-drifted stored doc (e.g. from a migration) is skipped and reported
 * via `console.warn` rather than trusted as-is or thrown (this function's
 * return shape, ProfileDiff, is unchanged so downstream MCP tools built on it
 * keep working). Candidate-vs-existing value comparison is deep-equal via
 * canonical JSON, not `!==` — object/array values that are structurally equal
 * but different instances no longer register as spurious changes.
 *
 * applyApprovedDiff is the only function in this package that writes to
 * `facts`, and it only does so when `decision.approve === true` (B3: "a
 * profile change reaches the student graph only after the counsellor
 * approves it"). The facts it writes come from `decision.edits` — the
 * CounsellorDecision schema (packages/schemas) already carries the
 * counsellor-approved (possibly hand-edited) Fact objects there, so this is
 * the one place those become real documents. Writing facts supersedes the
 * previous active fact for the same (studentId, key) via `validTo` instead of
 * deleting it (D-003: the knowledge graph is longitudinal), and records two
 * edges per written fact: fact -> its source ("sourced_from") and
 * student -> fact ("has").
 *
 * Failure modes this package now guards against (ISS-019/ISS-020, D-008/D-009
 * — no multi-document transactions on this server, so each Mongo call below
 * is its own atomic single-document operation, never a batch):
 *   - **Duplicate open facts from a concurrent writer.** scripts/db-init.ts
 *     creates a UNIQUE partial index on `facts` — {studentId, key} unique
 *     among documents where `validTo` is unset ("the active fact for this
 *     key"). Two callers racing to open a fact for the same key can only ever
 *     have one insert succeed; the loser's `insertOne` throws a Mongo
 *     duplicate-key error (code 11000).
 *   - **A crash mid-write must never leave ZERO open facts for a key that had
 *     one.** The old order (supersede-then-insert: set the old fact's
 *     `validTo`, THEN insert the new one) had a crash window between those
 *     two calls where neither fact was open. This function inserts the new
 *     fact FIRST and retires the old one SECOND, so the worst a crash between
 *     those two steps can leave is the OLD fact still open (never zero) plus
 *     — once the new insert has landed — a transient state with BOTH old and
 *     new open, which a reader can detect and a retry (see below) resolves;
 *     it is never silently indistinguishable from "this student has no fact
 *     for this key".
 *   - **A duplicate-key error is resolved deterministically, never silently.**
 *     On code 11000 this function re-reads the now-active fact for the key.
 *     If its _id matches the _id we were about to write (see ISS-020 below),
 *     the concurrent writer inserted byte-for-byte the same fact — an
 *     idempotent race, not a conflict, and this function proceeds as if its
 *     own insert had succeeded. Otherwise a different writer's fact won, and
 *     this function throws `FactConflictError` rather than overwriting it;
 *     the caller (the LangGraph node) is expected to re-derive its diff
 *     against the now-current state and retry (contract B14: outcome read
 *     back, not assumed).
 *   - **Replaying the same approved diff must be a no-op, not a duplicate.**
 *     ISS-020: a fact's Mongo `_id` is `deriveFactId(studentId, key, value,
 *     sessionId)` — a deterministic sha256 hash, not a wall-clock timestamp.
 *     Applying the identical decision twice (e.g. a LangGraph node re-running
 *     after a checkpoint restore) resolves to the same `_id` both times: the
 *     second call finds its own fact already open and neither inserts nor
 *     supersedes anything, so there is exactly one open fact and no duplicate
 *     edges afterward (`link()` is independently idempotent via
 *     `deriveEdgeId`).
 */
import type { Db, Filter } from "mongodb";
import { createHash } from "node:crypto";
import {
  FactSchema,
  ProfileDiffSchema,
  type Fact,
  type FactSource,
  type ProfileDiff,
  type FactChange,
  type CounsellorDecision,
} from "@vc/schemas";
import { factsCollection, edgesCollection, type FactDoc } from "./collections.js";
import { link, type EdgeRef } from "./edges.js";

/**
 * Deterministically orders object keys (recursively) so two structurally
 * equal values serialize to the same string regardless of key insertion
 * order or array-of-object nesting. Used for both value-equality comparisons
 * (ISS-021) and the deterministic fact _id (ISS-020).
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/** Deep-equal by canonical JSON — object/array values compare by content, not reference (ISS-021). */
function deepEqualValue(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

/**
 * ISS-020: a fact's Mongo `_id`, derived from its identity (studentId, key,
 * canonical value JSON, sessionId) rather than wall-clock time. Replaying the
 * SAME approved diff (same student, key, value, session) always produces the
 * SAME `_id`, which is what makes applyApprovedDiff's replay a no-op instead
 * of a duplicate open fact.
 */
export function deriveFactId(studentId: string, key: string, value: unknown, sessionId: string | undefined): string {
  const material = `${studentId}|${key}|${canonicalJson(value)}|${sessionId ?? ""}`;
  return createHash("sha256").update(material).digest("hex");
}

/**
 * Thrown by applyApprovedDiff when a duplicate-key error (code 11000, the
 * unique partial index on `facts`) turns out to be a genuine conflict — a
 * different writer's fact is now the active one for this (studentId, key),
 * not a byte-for-byte replay of ours. This package never silently picks a
 * winner; the caller must re-read the student's current facts and retry.
 */
export class FactConflictError extends Error {
  constructor(
    public readonly studentId: string,
    public readonly key: string,
  ) {
    super(
      `FactConflictError: another writer already holds the open fact for student "${studentId}" key "${key}" ` +
        `(contract B14 — outcome read back, not assumed). Re-read the student's current facts and retry.`,
    );
    this.name = "FactConflictError";
  }
}

export interface ProposeFactChangesInput {
  studentId: string;
  summary: string;
  /** Currently stored facts for this student (active + superseded; only active ones — no validTo — are diffed against). */
  existingFacts: FactDoc[];
  /** Newly extracted facts from this session, each already carrying a citation (B2). */
  candidateFacts: Fact[];
}

/**
 * Diffs `candidateFacts` against the student's current active facts (facts
 * with no `validTo`) and returns a ProfileDiff. Writes nothing. Every
 * candidate fact is parsed with FactSchema first, so an uncited fact (no
 * `source`) throws here rather than silently entering the diff.
 */
export function proposeFactChanges(input: ProposeFactChangesInput): ProfileDiff {
  const activeByKey = new Map<string, FactDoc>();
  for (const fact of input.existingFacts) {
    if (fact.validTo !== undefined) continue; // only active facts are diffed against
    const parsed = FactSchema.safeParse(fact);
    if (!parsed.success) {
      // ISS-021: a stored fact that no longer matches FactSchema (schema
      // drift — e.g. a legacy doc from before a field was tightened) is
      // skipped rather than trusted as-is or thrown. Reported so an ops
      // surface can see it; this function's return shape stays ProfileDiff.
      // eslint-disable-next-line no-console
      console.warn(
        `proposeFactChanges: skipping schema-drifted stored fact studentId=${input.studentId} ` +
          `key="${fact.key}" (_id=${fact._id}): ${parsed.error.message}`,
      );
      continue;
    }
    activeByKey.set(fact.key, fact);
  }

  const changes: FactChange[] = [];
  const citedFactIds: string[] = [];

  for (const raw of input.candidateFacts) {
    const candidate = FactSchema.parse(raw); // B2: throws on an uncited fact
    const existing = activeByKey.get(candidate.key);
    if (!existing) {
      changes.push({ op: "add", key: candidate.key, after: candidate.value });
      citedFactIds.push(candidate.key);
    } else if (!deepEqualValue(existing.value, candidate.value)) {
      // ISS-021: canonical-JSON deep-equal, not `!==` — two different object
      // or array instances with identical content are NOT a change.
      changes.push({ op: "update", key: candidate.key, before: existing.value, after: candidate.value });
      citedFactIds.push(candidate.key);
    }
    // Unchanged values produce no FactChange — nothing to approve or write.
  }

  return ProfileDiffSchema.parse({
    studentId: input.studentId,
    summary: input.summary,
    changes,
    citedFactIds,
  });
}

export interface ApplyApprovedDiffResult {
  written: FactDoc[];
  supersededKeys: string[];
}

/** Maps a Fact's own citation into the edge target it was sourced from. */
function sourceEdgeRef(source: FactSource): EdgeRef {
  switch (source.type) {
    case "transcript":
      return { kind: "transcript_turn", id: source.turnId };
    case "kb":
      return { kind: "kb_record", id: source.id };
    case "profile":
      return { kind: "profile_fact", id: source.id };
    case "student-direct":
      return { kind: "student_direct_answer", id: source.id };
  }
}

/**
 * Writes facts ONLY when `decision.approve === true` AND `decision.edits` is
 * a non-empty array (B3: no approval, no edits, no write). The facts written
 * are exactly `decision.edits`, re-validated with FactSchema (so an uncited
 * fact throws here too, even if it slipped past proposeFactChanges some other
 * way). For each written fact (see the module docstring for the full
 * ISS-019/ISS-020 failure-mode reasoning):
 *   - its `_id` is deterministic (`deriveFactId`), so replaying the same
 *     approved diff is a no-op, not a duplicate;
 *   - the new fact is inserted BEFORE the old one (if any) is superseded, so
 *     a crash between the two never leaves zero open facts for the key;
 *   - a duplicate-key error (the unique partial index on `facts`) is resolved
 *     deterministically: an identical concurrent insert is treated as success,
 *     a genuinely different one throws `FactConflictError`;
 *   - an edge fact --sourced_from--> {session, if `sessionId` is given;
 *     otherwise the fact's own citation target} is recorded;
 *   - an edge student --has--> fact is recorded.
 */
export async function applyApprovedDiff(
  db: Db,
  diff: ProfileDiff,
  decision: CounsellorDecision,
  sessionId?: string,
): Promise<ApplyApprovedDiffResult> {
  if (!decision.approve || !decision.edits || decision.edits.length === 0) {
    return { written: [], supersededKeys: [] };
  }

  // Validate every fact before writing any of them (B2), so a bad fact later
  // in the list can't leave earlier facts partially committed.
  const parsedFacts = decision.edits.map((edit) => FactSchema.parse(edit));

  const facts = factsCollection(db);
  const edges = edgesCollection(db);
  const written: FactDoc[] = [];
  const supersededKeys: string[] = [];
  const now = new Date().toISOString();

  for (const fact of parsedFacts) {
    const activeFilter: Filter<FactDoc> = {
      studentId: diff.studentId,
      key: fact.key,
      validTo: { $exists: false },
    };
    const _id = deriveFactId(diff.studentId, fact.key, fact.value, sessionId);
    const existingBefore = await facts.findOne(activeFilter);

    let doc: FactDoc;

    if (existingBefore && existingBefore._id === _id) {
      // ISS-020: idempotent replay — the open fact for this key already IS
      // the one we're about to write. Nothing to insert or supersede.
      doc = existingBefore;
    } else {
      doc = { ...fact, _id, studentId: diff.studentId };
      try {
        // ISS-019: insert the new fact BEFORE retiring the old one. The
        // unique partial index on {studentId, key} (validTo unset) rejects a
        // concurrent writer's conflicting insert with code 11000, handled
        // below.
        await facts.insertOne(doc);
      } catch (err) {
        if ((err as { code?: number } | undefined)?.code !== 11000) throw err;
        // Someone else's open fact now exists for this key. Re-read to find
        // out whether it's byte-for-byte ours (idempotent race) or a real
        // conflict (contract B14: outcome read back, never assumed).
        const winner = await facts.findOne(activeFilter);
        if (winner && winner._id === _id) {
          doc = winner;
        } else {
          throw new FactConflictError(diff.studentId, fact.key);
        }
      }

      if (existingBefore && existingBefore._id !== doc._id) {
        // Retire the fact this write superseded. Guarded by validTo still
        // being unset so a retried caller's second attempt at this step is a
        // harmless no-op rather than clobbering someone else's retirement.
        await facts.updateOne(
          { _id: existingBefore._id, validTo: { $exists: false } },
          { $set: { validTo: now } },
        );
        supersededKeys.push(fact.key);
      }
    }

    written.push(doc);

    const to: EdgeRef = sessionId ? { kind: "session", id: sessionId } : sourceEdgeRef(fact.source);
    await link(edges, { kind: "fact", id: doc._id }, to, "sourced_from");
    await link(edges, { kind: "student", id: diff.studentId }, { kind: "fact", id: doc._id }, "has");
  }

  return { written, supersededKeys };
}
