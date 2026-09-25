/**
 * T-018 / residual 3 (qa/manifests/t-008-approval-ui.md): the per-fact reject-reason audit trail.
 * When a counsellor's per_fact approval response rejects one or more proposed facts, this records
 * WHY, in the same `decisions` collection erasure and export already cover (COLLECTION_NAMES.decisions):
 * the thread id, the student id, the rejected keys with their (optional) reasons, and the decision
 * time. No transcript text and no proposed VALUE is stored — only the counsellor's own reason text
 * (never the model's citation), so this can never reproduce the "edit provenance" question gated
 * separately at qa/gates/edit-provenance.md.
 *
 * The `decisions` collection already holds a different, pre-existing document shape
 * (DecisionDoc: a course/university selection rationale, plan.md §4 step 1 — collections.ts).
 * Nothing in this codebase writes that shape yet (grep confirms `decisionsCollection`/
 * `validateDecisionForWrite` are unused outside their own definitions and this collection's erasure
 * plan), so sharing the collection with a second, discriminated shape (`kind: "per_fact_reject"`)
 * costs nothing today and gets erasure (ERASURE_PLAN already deletes `decisions` by studentId,
 * erasure.ts) and export (exportStudent already reads `decisions` back) for free, with zero changes
 * to either.
 *
 * Fence-aware the same way recordApprovedSessionSummary (facts.ts) is: a pre-check before writing
 * anything, a WriterDeadline-bounded insert, and a post-check (compensateIfFenced) that undoes
 * exactly what THIS call inserted if the student is fenced by the time the write finishes (D-015/
 * D-016). Unlike recordApprovedSessionSummary this is an INSERT of a new document, not an update to
 * an existing row, so `undo` is simply "delete the document this call created, by its own _id".
 *
 * Idempotent by construction (mirroring D-012's contentHash idea, at a coarser grain): `_id` is
 * DETERMINISTIC from `threadId` alone (rejectReasonAuditId), never a fresh ObjectId. A scribe
 * approval interrupt is one-shot per thread (ISS-t-007-c0-1: at most one recorded decision ever), so
 * at most one reject-reason record can ever legitimately exist per thread. A checkpoint replay that
 * re-runs the approval node (e.g. after a crash) calls this again with the SAME rejected set, which
 * collides on `_id` (11000) rather than creating a duplicate audit row — the duplicate is treated as
 * "already recorded", not an error, exactly like applyApprovedDiff's own content-hash replay rule.
 */
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { COLLECTION_NAMES } from "./collections.js";
import {
  assertStudentNotFenced,
  compensateIfFenced,
  FencedWriterDeadlineError,
  StudentFencedError,
  WriterDeadline,
} from "./erasure.js";

export interface RejectedFactRecord {
  key: string;
  /** The counsellor's own reason text (never a transcript quote or the model's citation). */
  reason?: string;
}

/** A per-fact reject-reason audit record, stored in the `decisions` collection. */
export interface RejectReasonAuditDoc {
  _id: string;
  kind: "per_fact_reject";
  threadId: string;
  studentId: string;
  rejected: RejectedFactRecord[];
  decidedAt: string;
}

export interface RecordRejectReasonsInput {
  threadId: string;
  studentId: string;
  rejected: RejectedFactRecord[];
}

export interface RecordRejectReasonsOptions {
  /** D-016: a writer deadline SHORTER than FENCED_WRITER_DEADLINE_MS (the default). */
  deadlineMs?: number;
}

export interface RecordRejectReasonsResult {
  /** False only when `rejected` was empty (nothing to record; no write attempted). */
  recorded: boolean;
  _id?: string;
}

function requireNonEmptyString(value: unknown, field: string, caller: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${caller}: ${field} must be a non-empty string`);
  }
  return value;
}

/** Deterministic `_id` for the (at most one) reject-reason record of a thread. */
export function rejectReasonAuditId(threadId: string): string {
  return createHash("sha256").update(`vc-reject-reasons-v1|${threadId}`).digest("hex");
}

function isDuplicateKey(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 11000;
}

/**
 * Writes the reject-reason audit record for one thread's per_fact response. A no-op (returns
 * `{recorded: false}`, writes nothing) when `rejected` is empty. See the module docstring for the
 * fencing, idempotency and collection-sharing design.
 */
export async function recordRejectReasons(
  db: Db,
  input: RecordRejectReasonsInput,
  options: RecordRejectReasonsOptions = {},
): Promise<RecordRejectReasonsResult> {
  requireNonEmptyString(input.threadId, "threadId", "recordRejectReasons");
  requireNonEmptyString(input.studentId, "studentId", "recordRejectReasons");
  if (input.rejected.length === 0) return { recorded: false };
  for (const r of input.rejected) requireNonEmptyString(r.key, "rejected[].key", "recordRejectReasons");

  // D-016: the writer deadline starts BEFORE the fence pre-check, exactly like the other writers.
  const deadline = new WriterDeadline(options.deadlineMs);

  // D-015 pre-check: a student with an erasure in progress gets nothing written at all.
  try {
    await deadline.run(assertStudentNotFenced(db, input.studentId, deadline.op()));
  } catch (err) {
    deadline.dispose();
    if (deadline.expired() && !(err instanceof StudentFencedError)) {
      throw new FencedWriterDeadlineError(Promise.resolve(), { cause: err });
    }
    throw err;
  }

  const _id = rejectReasonAuditId(input.threadId);
  const doc: RejectReasonAuditDoc = {
    _id,
    kind: "per_fact_reject",
    threadId: input.threadId,
    studentId: input.studentId,
    rejected: input.rejected.map((r) => ({ key: r.key, ...(r.reason ? { reason: r.reason } : {}) })),
    decidedAt: new Date().toISOString(),
  };
  const coll = db.collection<RejectReasonAuditDoc>(COLLECTION_NAMES.decisions);
  // deleteMany (not deleteOne), matching facts.ts's own undo — the fake driver in tests only
  // implements deleteMany, and a filter on this exact _id can only ever match zero or one document.
  const undo = async () => {
    await coll.deleteMany({ _id } as import("mongodb").Filter<RejectReasonAuditDoc>);
  };

  let failure: { err: unknown } | null = null;
  let alreadyRecorded = false;
  const work = coll.insertOne(doc, deadline.op());
  try {
    await deadline.run(work);
  } catch (err) {
    if (isDuplicateKey(err)) {
      // Same deterministic _id already recorded (a checkpoint replay): idempotent, not a failure.
      alreadyRecorded = true;
    } else {
      failure = { err };
    }
  } finally {
    deadline.dispose();
  }
  const timedOut = failure !== null && deadline.expired();
  const settled: Promise<void> = timedOut
    ? work.then(
        () => undo(),
        () => undo(),
      ).then(
        () => undefined,
        () => undefined,
      )
    : Promise.resolve();

  // D-015/D-016 post-write check, ALWAYS (after success, a duplicate no-op, a failure, or the
  // deadline). If an erasure fenced the student meanwhile, delete this call's own insert (by _id,
  // never the id of an existing record it did not create) and refuse.
  await compensateIfFenced(db, input.studentId, undo, {
    ...(failure ? { cause: failure.err } : {}),
    alwaysUndo: timedOut,
  });
  if (timedOut) throw new FencedWriterDeadlineError(settled, { cause: failure!.err });
  if (failure) throw failure.err;
  void alreadyRecorded; // recorded via the deterministic _id either way; kept for a future caller that wants to know
  return { recorded: true, _id };
}
