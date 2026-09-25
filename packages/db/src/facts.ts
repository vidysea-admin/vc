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
 *   - **"Open" means `active: true` (D-013).** An open fact carries an
 *     explicit `active: true`. Retiring it sets `validTo` (history) and
 *     `$unset`s `active` in the SAME single-document CAS update, so a doc is
 *     never half-retired. Every open-fact read filters on `{active: true}`.
 *     A doc with no `active` field is history, even if `validTo` is unset
 *     (e.g. a pre-D-013 legacy doc); it is never diffed against or retired.
 *     `{validTo: {$exists: false}}` can not be used: MongoDB rejects
 *     `$exists: false` in a partialFilterExpression.
 *   - **Duplicate open facts from a concurrent writer.** scripts/db-init.ts
 *     creates a UNIQUE partial index on `facts` — {studentId, key} unique
 *     among documents where `active: true` ("the open fact for this key"). Two callers racing to open a fact for the same key can only ever
 *     have one insert succeed; the loser's `insertOne` throws a Mongo
 *     duplicate-key error (code 11000).
 *   - **Sequential updates to the same key must never spuriously conflict
 *     (ISS-026).** The old fact is RETIRED FIRST, via a compare-and-swap
 *     `findOneAndUpdate` filtered on `{_id: existing._id, active: true}`
 *     (update: `$set validTo` + `$unset active`), and the new fact is
 *     inserted only after that.
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
 *   - **A write racing a DPDP erasure (D-015/D-016, T-011).** applyApprovedDiff
 *     is a fence-aware writer: it refuses a fenced student before writing
 *     (`StudentFencedError`, nothing written). It runs under an enforced
 *     deadline (FENCED_WRITER_DEADLINE_MS, D-016): every driver operation
 *     carries `timeoutMS` = the time left, and an application timer aborts it.
 *     After ALL of its writes, in a `finally` (so also after a partial failure
 *     or the deadline), it checks the fence again. If an erasure was confirmed
 *     meanwhile, it deletes the facts it inserted and the edges it CREATED, by
 *     id, and throws `StudentFencedError` (its own error, if any, as `cause`).
 *     A writer that ran past its deadline keeps nothing either and throws
 *     `FencedWriterDeadlineError`. See src/erasure.ts "The erasure fence" for
 *     why the pre-check, the deadline, the post-check and the fence's minimum
 *     hold together close the race.
 *   - **"The edges it CREATED" is enforced by ownership, not just by which ids
 *     were recorded (ISS-t-011-c3-rev-1).** Edge ids are deterministic
 *     (`deriveEdgeId`), so a `link()` call whose own outcome is AMBIGUOUS (it
 *     threw, e.g. after a timeout — the write may or may not have landed)
 *     can not tell "I just created this edge" from "a previous call already
 *     owns this deterministic id" by id alone. Such an outcome is still
 *     speculatively recorded (so a genuine creation is never left
 *     uncompensated), but every write in this call — fact or edge — carries a
 *     fresh per-call `writerToken`, stamped on an edge only via its own
 *     `$setOnInsert`. The undo's edge delete filters on `{_id, writerToken}`,
 *     so it can only ever remove a document THIS call's insert actually
 *     stamped; a pre-existing edge from a different call never matches,
 *     whatever the ambiguous outcome guessed.
 */
import { ObjectId, type Db, type Filter } from "mongodb";
import { createHash, randomUUID } from "node:crypto";
import {
  FactSchema,
  ProfileDiffSchema,
  type Fact,
  type FactSource,
  type ProfileDiff,
  type FactChange,
  type CounsellorDecision,
} from "@vc/schemas";
import { factsCollection, edgesCollection, sessionsCollection, type FactDoc } from "./collections.js";
import { deriveEdgeId, link, type EdgeRef, type EdgeDoc } from "./edges.js";
import {
  assertStudentNotFenced,
  compensateIfFenced,
  FencedWriterDeadlineError,
  StudentFencedError,
  WriterDeadline,
} from "./erasure.js";

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
  /** Currently stored facts for this student (active + superseded; only `active: true` ones are diffed against, D-013). */
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
    if (fact.active !== true) continue; // D-013: only active:true facts are diffed against
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

export interface ApplyApprovedDiffOptions {
  /**
   * D-016: a writer deadline SHORTER than FENCED_WRITER_DEADLINE_MS (the default). A longer one
   * throws RangeError: the fence's minimum hold would not cover it.
   */
  deadlineMs?: number;
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
  options: ApplyApprovedDiffOptions = {},
): Promise<ApplyApprovedDiffResult> {
  if (!decision.approve || !decision.edits || decision.edits.length === 0) {
    return { written: [], supersededKeys: [] };
  }

  // Validate every fact before writing any of them (B2), so a bad fact later
  // in the list can't leave earlier facts partially committed.
  const parsedFacts = decision.edits.map((edit) => FactSchema.parse(edit));

  // D-016: the writer deadline starts BEFORE the fence pre-check (the hold is measured from it).
  // A deadline longer than FENCED_WRITER_DEADLINE_MS throws RangeError here, before anything runs.
  const deadline = new WriterDeadline(options.deadlineMs);

  // D-015 pre-check: a student with an erasure in progress gets nothing written at all.
  try {
    await deadline.run(assertStudentNotFenced(db, diff.studentId, deadline.op()));
  } catch (err) {
    deadline.dispose();
    if (deadline.expired() && !(err instanceof StudentFencedError)) {
      throw new FencedWriterDeadlineError(Promise.resolve(), { cause: err });
    }
    throw err;
  }

  const facts = factsCollection(db);
  const edges = edgesCollection(db);
  // T-014 / ISS-t-011-c3-rev-1: this call's own ownership token, stamped on every edge it actually
  // inserts (edges.ts link()'s $setOnInsert). Edge ids are DETERMINISTIC (deriveEdgeId), so an
  // ambiguous linkTracked outcome (below) can not tell "I created this" from "a previous call
  // already owns this" by id alone — the writerToken lets `undo` tell them apart at delete time.
  const writerToken = randomUUID();
  // D-015: exactly what THIS call wrote, so the post-write fence check can undo it by id.
  // A fact id is recorded BEFORE its insert (deleting an id that never landed is harmless, and an
  // insert whose outcome is unknown after a timeout is still covered). An edge id is recorded only
  // when this call CREATED it (ISS-t-011-c2-rev-3), or when its upsert's outcome is unknown.
  const insertedFactIds: string[] = [];
  const createdEdgeIds: string[] = [];
  const undo = async () => {
    if (insertedFactIds.length > 0) {
      await facts.deleteMany({ studentId: diff.studentId, _id: { $in: [...insertedFactIds] } } as Filter<FactDoc>);
    }
    if (createdEdgeIds.length > 0) {
      // ISS-t-011-c3-rev-1: scoped to writerToken, not just _id. `createdEdgeIds` can contain an id
      // this call never actually created (an AMBIGUOUS linkTracked outcome speculatively records
      // it, see below) — the deterministic id may belong to an edge a PREVIOUS call already wrote.
      // Since writerToken is set only via $setOnInsert on THIS call's own insert, the delete only
      // ever removes a document this call actually created; a pre-existing edge (no writerToken, or
      // a different call's token) can never match, whatever the ambiguous guess was.
      await edges.deleteMany({ _id: { $in: [...createdEdgeIds] }, writerToken } as Filter<EdgeDoc>);
    }
  };
  const linkTracked = async (from: EdgeRef, to: EdgeRef, rel: string) => {
    const edgeId = deriveEdgeId(from, to, rel);
    const opts = deadline.op(); // throws before issuing anything once the deadline has passed
    let known = false;
    try {
      await link(edges, from, to, rel, { ...opts, writerToken, onCreated: (id) => createdEdgeIds.push(id) });
      known = true;
    } finally {
      // Ambiguous outcome (e.g. link() threw after a timeout: the write may or may not have
      // landed): speculatively record the id so a genuine creation is never left uncompensated.
      // Safe even when this id belongs to a pre-existing edge from another call — the writerToken
      // scope on the delete above means that edge is never touched (ISS-t-011-c3-rev-1).
      if (!known && !createdEdgeIds.includes(edgeId)) createdEdgeIds.push(edgeId);
    }
  };

  const writeAll = async (): Promise<ApplyApprovedDiffResult> => {
    const written: FactDoc[] = [];
    const supersededKeys: string[] = [];
    const now = new Date().toISOString();
    for (const fact of parsedFacts) {
      try {
        const activeFilter: Filter<FactDoc> = {
          studentId: diff.studentId,
          key: fact.key,
          active: true, // D-013: open == active:true (served by the partial unique index)
        };
        // D-012: identity (_id) and content (contentHash) are separate. The
        // hash decides "is this write already applied?"; the _id is always fresh.
        const contentHash = deriveContentHash(diff.studentId, fact.key, fact.value, sessionId);
        const existingBefore = await facts.findOne(activeFilter, deadline.op());

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
              { _id: existingBefore._id, active: true } as Filter<FactDoc>,
              // D-013: ONE atomic update closes the fact: validTo for history,
              // and `active` removed so it leaves the partial unique index.
              { $set: { validTo: now }, $unset: { active: "" } },
              deadline.op(),
            );
            if (retired) {
              supersededKeys.push(fact.key);
            } else {
              // ISS-t-003b-c1-2: another writer retired it between our read and
              // our CAS. Read the outcome back (B14) instead of assuming a
              // conflict: our own content already open means our write landed.
              const current = await facts.findOne(activeFilter, deadline.op());
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
              active: true, // D-013: enters the partial unique index as THE open fact
            };
            const insertOptions = deadline.op();
            insertedFactIds.push(candidate._id); // before the insert: see `undo` above
            try {
              await facts.insertOne(candidate, insertOptions);
              doc = candidate;
            } catch (err) {
              if ((err as { code?: number } | undefined)?.code !== 11000) throw err;
              // Someone else's open fact now exists for this key. Re-read: our
              // contentHash means an identical concurrent write already landed
              // (success); anything else is a genuine conflict (B14).
              const winner = await facts.findOne(activeFilter, deadline.op());
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
        const factRef: EdgeRef = { kind: "fact", id: doc._id };
        const studentRef: EdgeRef = { kind: "student", id: diff.studentId };
        await linkTracked(factRef, to, "sourced_from");
        await linkTracked(studentRef, factRef, "has");
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
  };

  const work = writeAll();
  let result: ApplyApprovedDiffResult | undefined;
  let failure: { err: unknown } | null = null;
  try {
    // D-016 application-level deadline: stop waiting at the deadline (each operation's driver
    // timeoutMS bounds whatever is still in flight).
    result = await deadline.run(work);
  } catch (err) {
    failure = { err };
  } finally {
    deadline.dispose();
  }
  const timedOut = failure !== null && deadline.expired();
  // D-016: an operation still in flight at the abort may land later; once it settles, undo again.
  const settled: Promise<void> = timedOut
    ? work.then(
        () => undo(),
        () => undo(),
      ).then(
        () => undefined,
        () => undefined,
      )
    : Promise.resolve();

  // D-015/D-016 post-write check, ALWAYS (after success, a partial failure, or the deadline). If an
  // erasure fenced the student meanwhile, delete what this call wrote, by id, and refuse, with the
  // original error as `cause`. A timed-out writer is undone even when not fenced. The previous
  // open fact this call may have retired is left as it is: the erasure deletes it, and a retry of
  // the same decision re-opens the key (D-012).
  await compensateIfFenced(db, diff.studentId, undo, {
    ...(failure ? { cause: failure.err } : {}),
    alwaysUndo: timedOut,
  });
  if (timedOut) throw new FencedWriterDeadlineError(settled, { cause: failure!.err });
  if (failure) throw failure.err;
  return result!;
}

// ---------------------------------------------------------------------------
// T-016: the scribe's session row (ISS-t-011-rev-5) and the approved summary (ISS-t-007-rev-7)
//
// Both live here, next to applyApprovedDiff, because they are the other two writes of the scribe's
// counsellor-approval path, and this module is on the D-016 fence-aware writer allowlist. They are
// NOT fence-aware on their own: their one caller is packages/engine scribe/graph.ts, which runs them
// under its writer deadline, after its fence pre-check, and removes a row it created when its
// post-check finds the student fenced (invokeFenceAware). recordApprovedSessionSummary never
// upserts, so a late summary write can never resurrect a row the erasure already purged.
// ---------------------------------------------------------------------------

export interface ScribeSessionRowInput {
  sessionId: string;
  studentId: string;
  /** The LangGraph thread this scribe run checkpoints under (any id, recorded so erasure finds it). */
  threadId: string;
  /** When the counselling session ended (the scribe input's sessionEndedAt). */
  endedAt?: string;
}

function requireNonEmpty(fields: Record<string, unknown>, caller: string): void {
  for (const [name, value] of Object.entries(fields)) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`${caller}: ${name} must be a non-empty string (a row without it is invisible to B15 erasure)`);
    }
  }
}

/**
 * ISS-t-011-rev-5: makes sure the session row exists and records `threadId` on it, BEFORE the
 * scribe writes its first checkpoint, so B15 erasure/export can reach every checkpoint of the run
 * (erasure.ts resolveSelectors reads `scribeThreadIds`), including a run that ends without an
 * interrupt. One upsert on `{_id: sessionId, studentId}`:
 *   - no row: inserts `{_id, sessionId, studentId, endedAt, scribeThreadIds: [threadId]}` -> created: true;
 *   - the student's row: adds the thread once ($addToSet, idempotent on replay) -> created: false;
 *   - a row with this sessionId owned by ANOTHER student: the upsert's insert collides on `_id`
 *     and the server throws 11000 — the other student's row is never touched or hijacked.
 * `created` lets the caller's fence compensation delete only a row IT created.
 */
export async function ensureScribeSessionRow(
  db: Db,
  input: ScribeSessionRowInput,
  options: { timeoutMS?: number } = {},
): Promise<{ created: boolean }> {
  requireNonEmpty({ sessionId: input.sessionId, studentId: input.studentId, threadId: input.threadId }, "ensureScribeSessionRow");
  const res = await sessionsCollection(db).updateOne(
    { _id: input.sessionId, studentId: input.studentId },
    {
      $setOnInsert: {
        sessionId: input.sessionId,
        ...(input.endedAt ? { endedAt: input.endedAt } : {}),
      },
      $addToSet: { scribeThreadIds: input.threadId },
    },
    { upsert: true, ...options },
  );
  return { created: res.upsertedCount === 1 };
}

/** ISS-t-007-rev-7: the approved summary's session row does not exist (never written, or erased). */
export class SessionRowMissingError extends Error {
  constructor() {
    super("recordApprovedSessionSummary: no session row for this session and student (it was never written, or it was erased)");
    this.name = "SessionRowMissingError";
  }
}

/**
 * ISS-t-007-rev-7: stores the counsellor-approved summary on the session row (B3: called only after
 * an approve/edit decision). `summary` is "" with `summaryWithheldReason` set when the model's text was
 * withheld (B1). Never upserts: a missing row throws SessionRowMissingError (the scribe's start wrote
 * it, so a missing row means it was erased, and nothing may be recreated). Idempotent on replay
 * (the same $set again).
 */
export async function recordApprovedSessionSummary(
  db: Db,
  input: { sessionId: string; studentId: string; summary: string; summaryWithheldReason?: string },
  options: { timeoutMS?: number } = {},
): Promise<void> {
  requireNonEmpty({ sessionId: input.sessionId, studentId: input.studentId }, "recordApprovedSessionSummary");
  const res = await sessionsCollection(db).updateOne(
    { _id: input.sessionId, studentId: input.studentId },
    {
      $set: {
        summary: input.summary,
        summaryApprovedAt: new Date().toISOString(),
        ...(input.summaryWithheldReason ? { summaryWithheldReason: input.summaryWithheldReason } : {}),
      },
    },
    options,
  );
  if (res.matchedCount === 0) throw new SessionRowMissingError();
}
