/**
 * The fact write path (plan.md §3 steps 8/9; contract B3).
 *
 * proposeFactChanges is a PURE function — it never touches the `facts`
 * collection. It only ever produces a ProfileDiff for the counsellor to
 * review (plan.md step 8).
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
 */
import type { Db, Filter } from "mongodb";
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
  const activeByKey = new Map(
    input.existingFacts.filter((fact) => fact.validTo === undefined).map((fact) => [fact.key, fact]),
  );

  const changes: FactChange[] = [];
  const citedFactIds: string[] = [];

  for (const raw of input.candidateFacts) {
    const candidate = FactSchema.parse(raw); // B2: throws on an uncited fact
    const existing = activeByKey.get(candidate.key);
    if (!existing) {
      changes.push({ op: "add", key: candidate.key, after: candidate.value });
      citedFactIds.push(candidate.key);
    } else if (existing.value !== candidate.value) {
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
 * way). For each written fact:
 *   - if an active fact with the same (studentId, key) already exists, it is
 *     superseded via `validTo` (set, never deleted) before the new one is
 *     inserted;
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
    const existing = await facts.findOne(activeFilter);

    if (existing) {
      await facts.updateOne({ _id: existing._id }, { $set: { validTo: now } });
      supersededKeys.push(fact.key);
    }

    const _id = `${diff.studentId}:${fact.key}:${now}:${written.length}`;
    const doc: FactDoc = { ...fact, _id, studentId: diff.studentId };
    await facts.insertOne(doc);
    written.push(doc);

    const to: EdgeRef = sessionId ? { kind: "session", id: sessionId } : sourceEdgeRef(fact.source);
    await link(edges, { kind: "fact", id: _id }, to, "sourced_from");
    await link(edges, { kind: "student", id: diff.studentId }, { kind: "fact", id: _id }, "has");
  }

  return { written, supersededKeys };
}
