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
 * Failure modes this package guards against (ISS-019/ISS-020/ISS-026/
 * ISS-028, D-008/D-009 — no multi-document transactions on this server, so
 * each Mongo call below is its own atomic single-document operation, never a
 * batch; D-012 — a fact's identity is separate from its content):
 *   - **Identity vs content (D-012, ISS-t-003b-c1-1).** Every fact write gets
 *     a FRESH `_id` (a driver ObjectId, hex string), never one derived from
 *     content. The content is recorded separately as `contentHash`
 *     (`deriveContentHash`: sha256 of the JSON array [studentId, key,
 *     canonical value, sessionId ?? null]). A content-addressed `_id` used to
 *     collide with the retired historical doc when a student reverted a value
 *     (A -> B -> A): the insert failed with 11000 on `_id` and the key was
 *     left at zero open facts for good. With fresh ids, history simply grows
 *     (A retired, B retired, A open) and the old A stays retired.
 *   - **Duplicate open facts from a concurrent writer.** scripts/db-init.ts
 *     creates a UNIQUE partial index on `facts` — {studentId, key} unique
 *     among documents where `validTo` is unset ("the active fact for this
 *     key"). Two callers racing to open a fact for the same key can only ever
 *     have one insert succeed; the loser's `insertOne` throws a Mongo
 *     duplicate-key error (code 11000).
 *   - **Sequential updates to the same key must never spuriously conflict
 *     (ISS-026).** The old fact is RETIRED FIRST, via a compare-and-swap
 *     `findOneAndUpdate` filtered on `{_id: existing._id, validTo:
 *     {$exists:false}}`, and the new fact is inserted only after that.
 *     Inserting first would be rejected by the unique partial index, because
 *     for a moment two facts would be open for the key.
 *   - **A lost race is read back, never assumed (ISS-t-003b-c1-2, B14).** On
 *     a CAS miss AND on an 11000 from the insert, this function re-reads the
 *     active fact for the key. If its `contentHash` equals ours, an identical
 *     write (e.g. a concurrent replay of the same decision) already landed:
 *     that is success, and the landed doc is reported as written. If a
 *     DIFFERENT fact is open, it throws `FactConflictError`; the caller (the
 *     LangGraph node) re-derives its diff against the current state. If the
 *     CAS missed and NO fact is open, the other writer is inside its own
 *     retire->insert window (or crashed there), so this function goes on to
 *     insert and lets the unique partial index pick exactly one winner; the
 *     11000 rule above then settles the loser. A writer whose CAS retired the
 *     old fact but whose insert then lost to a different value gets
 *     `FactConflictError`; the old fact stays retired (both writers were
 *     superseding it) and exactly one fact is open.
 *   - **The live retire->insert window (for T-007 readers).** Between the CAS
 *     retire and the insert, a concurrent reader sees ZERO open facts for the
 *     key. This is inherent to retire-then-insert without transactions.
 *     Readers must treat "no open fact" as "unknown / being updated", never as
 *     "the student has no value", and must not write on the strength of it;
 *     the window is one round trip long in normal operation.
 *   - **A crash mid-write must never leave a key permanently stuck at zero
 *     open facts.** A real process crash inside that window leaves zero open
 *     facts. The caller is expected to retry the SAME approved decision
 *     (LangGraph checkpoint replay): the retry finds no active fact, skips
 *     the CAS and inserts, so the key heals to exactly one open fact.
 *   - **Replaying the same approved diff is a no-op, not a duplicate
 *     (ISS-020).** A replay finds the active fact's `contentHash` equal to its
 *     own and neither inserts nor supersedes; `link()` is independently
 *     idempotent via `deriveEdgeId`, so no duplicate edges either. The hash
 *     is a JSON array, not a "|"-joined string (ISS-t-003b-db-hardening-1),
 *     so a delimiter inside a field can not collide two identities. A legacy
 *     doc with no `contentHash` never matches, so it is simply superseded.
 *   - **A retry under a DIFFERENT sessionId is a new write (ISS-t-003b-c1-4).**
 *     `sessionId` is part of the content hash, so re-approving the same value
 *     in a new session is NOT a replay: the open fact is retired and a new
 *     fact is opened with its own provenance edge (fact --sourced_from-->
 *     the new session). The old fact keeps its edge to the old session. This
 *     is deliberate: provenance is never silently re-pointed, and the history
 *     shows which session re-confirmed the value.
 *   - **A multi-fact diff that fails partway must not hide what already
 *     landed (ISS-028).** Each fact in `decision.edits` is its own atomic
 *     write; if fact N fails after facts `0..N-1` succeeded, those earlier
 *     facts are durably committed. This function wraps such a failure in
 *     `PartialApplyError`, carrying the ids already written and the key that
 *     failed, instead of letting the caller see only the last error and lose
 *     track of the partial state.
 */
import { ObjectId, type Db, type Filter } from "mongodb";
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
 * D-012: a fact's CONTENT hash (studentId, key, canonical value, sessionId),
 * stored on the doc as `contentHash`. It is NOT the `_id` (that is a fresh
 * ObjectId per write). Replaying the SAME approved diff always produces the
 * SAME hash, which is how applyApprovedDiff recognises a replay (or an
 * identical concurrent write) as already applied.
 *
 * ISS-t-003b-db-hardening-1: the four fields are combined via
 * `JSON.stringify([...])`, NOT string concatenation with a "|" separator. A
 * naive `${studentId}|${key}|...` join is ambiguous — ("alice|X","c") and
 * ("alice","X|c") both joined to "alice|X|c|...". JSON array encoding quotes
 * and escapes each element independently, so the boundary is never
 * confusable with a character inside a field.
 */
export function deriveContentHash(studentId: string, key: string, value: unknown, sessionId: string | undefined): string {
  const material = JSON.stringify([studentId, key, canonicalize(value), sessionId ?? null]);
  return createHash("sha256").update(material).digest("hex");
}

/**
 * Thrown by applyApprovedDiff when a lost race (a CAS miss, or a duplicate-key
 * error 11000 from the unique partial index on `facts`) turns out to be a
 * genuine conflict — after re-reading, a different writer's fact is the
 * active one for this (studentId, key), and its `contentHash` is not ours
 * (D-012). This package never silently picks a
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

/**
 * Thrown by applyApprovedDiff when a multi-fact diff fails partway through
 * (ISS-028). Because there are no multi-document transactions on this server
 * (D-008/D-009), each fact in `decision.edits` is written as its own atomic
 * Mongo operation — so when fact N of a multi-fact diff fails, facts
 * `0..N-1` are already durably committed. Silently letting the raw error
 * (e.g. `FactConflictError`, or any other write failure) propagate would hide
 * that partial outcome from the caller. This error carries it explicitly:
 * `writtenIds` are the ids of the facts that landed before the failure, and
 * `failingKey` is the key of the fact that was being written when it failed.
 * The original error is preserved as `cause` (contract B14: outcome read
 * back, not assumed — a caller must be able to see exactly what happened,
 * not just that something went wrong).
 *
 * A diff whose FIRST fact fails throws the raw underlying error instead of
 * this wrapper — there is no partial outcome to report when nothing was
 * written yet.
 */
export class PartialApplyError extends Error {
  constructor(
    public readonly writtenIds: string[],
    public readonly failingKey: string,
    public readonly cause: unknown,
  ) {
    super(
      `PartialApplyError: applyApprovedDiff failed on key "${failingKey}" after writing ${writtenIds.length} ` +
        `fact(s) already (ids: ${writtenIds.length > 0 ? writtenIds.join(", ") : "none"}). Those facts remain ` +
        `committed; this diff was not fully applied. Original error: ` +
        `${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = "PartialApplyError";
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
 * ISS-019/ISS-020/ISS-026/D-012 failure-mode reasoning):
 *   - its `_id` is fresh (ObjectId) and its `contentHash` records the
 *     content; an open fact with the same `contentHash` means a replay, which
 *     is a no-op;
 *   - if a different fact is currently open for this key, it is retired
 *     FIRST via a CAS `findOneAndUpdate`, then the new fact is inserted;
 *   - a CAS miss or a duplicate-key error re-reads the active fact: a
 *     matching `contentHash` is success, a different open fact throws
 *     `FactConflictError`;
 *   - an edge fact --sourced_from--> {session, if `sessionId` is given;
 *     otherwise the fact's own citation target} is recorded;
 *   - an edge student --has--> fact is recorded.
 * If one fact in a multi-fact `decision.edits` fails after earlier ones in
 * the same call already succeeded, the failure is raised as
 * `PartialApplyError` (ISS-028) carrying the ids already written and the
 * failing key, rather than losing track of the partial outcome.
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
    try {
      const activeFilter: Filter<FactDoc> = {
        studentId: diff.studentId,
        key: fact.key,
        validTo: { $exists: false },
      };
      // D-012: identity (_id) and content (contentHash) are separate. The
      // hash decides "is this write already applied?"; the _id is always fresh.
      const contentHash = deriveContentHash(diff.studentId, fact.key, fact.value, sessionId);
      const existingBefore = await facts.findOne(activeFilter);

      let doc: FactDoc | null = null;

      if (existingBefore && existingBefore.contentHash === contentHash) {
        // ISS-020 / D-012: idempotent replay. The open fact for this key
        // already carries our content. Nothing to insert or supersede.
        doc = existingBefore;
      } else {
        if (existingBefore) {
          // ISS-026: retire the OLD fact FIRST, guarded by a CAS on its own
          // _id with validTo still unset. Inserting first would collide with
          // the unique partial index (two open facts for a moment).
          const retired = await facts.findOneAndUpdate(
            { _id: existingBefore._id, validTo: { $exists: false } } as Filter<FactDoc>,
            { $set: { validTo: now } },
          );
          if (retired) {
            supersededKeys.push(fact.key);
          } else {
            // ISS-t-003b-c1-2: another writer retired it between our read and
            // our CAS. Read the outcome back (B14) instead of assuming a
            // conflict: our own content already open means our write landed.
            const current = await facts.findOne(activeFilter);
            if (current && current.contentHash === contentHash) {
              doc = current;
            } else if (current) {
              throw new FactConflictError(diff.studentId, fact.key);
            }
            // current === null: the other writer is inside its own
            // retire->insert window (or crashed there). Fall through to the
            // insert; the unique partial index picks exactly one winner and
            // the 11000 branch below applies the same contentHash rule.
          }
        }

        if (!doc) {
          const candidate: FactDoc = {
            ...fact,
            _id: new ObjectId().toHexString(),
            studentId: diff.studentId,
            contentHash,
          };
          try {
            await facts.insertOne(candidate);
            doc = candidate;
          } catch (err) {
            if ((err as { code?: number } | undefined)?.code !== 11000) throw err;
            // Someone else's open fact now exists for this key. Re-read: our
            // contentHash means an identical concurrent write already landed
            // (success); anything else is a genuine conflict (B14).
            const winner = await facts.findOne(activeFilter);
            if (winner && winner.contentHash === contentHash) {
              doc = winner;
            } else {
              throw new FactConflictError(diff.studentId, fact.key);
            }
          }
        }
      }

      written.push(doc);

      const to: EdgeRef = sessionId ? { kind: "session", id: sessionId } : sourceEdgeRef(fact.source);
      await link(edges, { kind: "fact", id: doc._id }, to, "sourced_from");
      await link(edges, { kind: "student", id: diff.studentId }, { kind: "fact", id: doc._id }, "has");
    } catch (err) {
      // ISS-028: earlier iterations of this same call already committed
      // their facts (no cross-document transaction spans the whole diff —
      // D-008/D-009). Wrap the failure with what already landed so the
      // caller doesn't lose track of the partial outcome. A diff whose FIRST
      // fact fails has nothing partial to report, so it throws the raw error.
      if (written.length > 0) {
        throw new PartialApplyError(
          written.map((d) => d._id),
          fact.key,
          err,
        );
      }
      throw err;
    }
  }

  return { written, supersededKeys };
}
