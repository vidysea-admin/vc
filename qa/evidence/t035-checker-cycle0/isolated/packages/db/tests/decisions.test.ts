/**
 * T-018 / residual 3 (qa/manifests/t-008-approval-ui.md): recordRejectReasons — the per-fact
 * reject-reason audit record written to the `decisions` collection, its fence-awareness (pre-check,
 * post-check, compensation, mirroring facts.ts's recordApprovedSessionSummary tests), its
 * idempotency under a duplicate deterministic `_id`, and its coverage by erasure and export (B15).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { recordRejectReasons, rejectReasonAuditId, type RejectReasonAuditDoc } from "../src/decisions.js";
import { requestErasure, confirmErasure, executeErasure, exportStudent, StudentFencedError, FencedWriterDeadlineError, FENCED_WRITER_DEADLINE_MS } from "../src/erasure.js";
import { COLLECTION_NAMES } from "../src/collections.js";
import { INDEX_PLAN } from "../scripts/db-init.js";
import { createFakeDb } from "./fakes.js";
import { confirmTwiceAndApprove } from "../src/testing.js";

function setup() {
  const { db, fakeDb } = createFakeDb();
  for (const spec of INDEX_PLAN) {
    if (!spec.unique) continue;
    fakeDb
      .collection<{ _id: string }>(spec.collection)
      .declareUniqueIndex(Object.keys(spec.keys), { partialFilterExpression: spec.partialFilterExpression });
  }
  const decisions = fakeDb.collection<RejectReasonAuditDoc>(COLLECTION_NAMES.decisions);
  return { db, fakeDb, decisions };
}

async function fenceStudent(db: ReturnType<typeof setup>["db"], studentId: string): Promise<void> {
  const { requestId } = await requestErasure(db, { studentId, requestedBy: "counsellor-7", reason: "student_request" });
  await confirmErasure(db, { requestId, confirmedBy: "admin-2" });
}

// ---------------------------------------------------------------------------
// Basic write
// ---------------------------------------------------------------------------

test("recordRejectReasons: writes the thread id, student id, rejected keys/reasons and a decision time; no transcript text", async () => {
  const { db, decisions } = setup();
  const res = await recordRejectReasons(db, {
    threadId: "scribe:sess-1",
    studentId: "stu-1",
    rejected: [
      { key: "targetCountry", reason: "student changed their mind" },
      { key: "budget_inr_per_year" },
    ],
  });
  assert.equal(res.recorded, true);
  const doc = await decisions.findOne({ _id: rejectReasonAuditId("scribe:sess-1") });
  assert.equal(doc?.kind, "per_fact_reject");
  assert.equal(doc?.threadId, "scribe:sess-1");
  assert.equal(doc?.studentId, "stu-1");
  assert.deepEqual(doc?.rejected, [
    { key: "targetCountry", reason: "student changed their mind" },
    { key: "budget_inr_per_year" },
  ]);
  assert.equal(typeof doc?.decidedAt, "string");
  assert.equal(Object.keys(doc ?? {}).sort().join(","), "_id,decidedAt,kind,rejected,studentId,threadId");
});

test("recordRejectReasons: an empty rejected list is a no-op — nothing is written", async () => {
  const { db, decisions } = setup();
  const res = await recordRejectReasons(db, { threadId: "scribe:sess-2", studentId: "stu-2", rejected: [] });
  assert.equal(res.recorded, false);
  assert.equal(decisions.all().length, 0);
});

test("recordRejectReasons: rejects an empty threadId or studentId before writing anything", async () => {
  const { db, decisions } = setup();
  await assert.rejects(recordRejectReasons(db, { threadId: "", studentId: "stu-3", rejected: [{ key: "x" }] }), /threadId/);
  await assert.rejects(recordRejectReasons(db, { threadId: "t", studentId: "  ", rejected: [{ key: "x" }] }), /studentId/);
  assert.equal(decisions.all().length, 0);
});

test("recordRejectReasons: idempotent under the SAME threadId (deterministic _id) — a second call does not duplicate or error", async () => {
  const { db, decisions } = setup();
  await recordRejectReasons(db, { threadId: "scribe:sess-4", studentId: "stu-4", rejected: [{ key: "a" }] });
  const again = await recordRejectReasons(db, { threadId: "scribe:sess-4", studentId: "stu-4", rejected: [{ key: "a" }] });
  assert.equal(again.recorded, true, "a duplicate is reported as recorded (already present), not an error");
  assert.equal(decisions.all().filter((d) => d._id === rejectReasonAuditId("scribe:sess-4")).length, 1);
});

// ---------------------------------------------------------------------------
// Fencing (D-015/D-016), mirroring facts.test.ts's recordApprovedSessionSummary tests
// ---------------------------------------------------------------------------

test("recordRejectReasons: a student already fenced BEFORE the call is refused; nothing is written", async () => {
  const { db, decisions } = setup();
  await fenceStudent(db, "stu-fence-1");
  await assert.rejects(
    recordRejectReasons(db, { threadId: "scribe:sess-fence-1", studentId: "stu-fence-1", rejected: [{ key: "a" }] }),
    StudentFencedError,
  );
  assert.equal(decisions.all().length, 0, "the pre-check refused before any write");
});

test("recordRejectReasons: a fence that appears AFTER the insert is compensated — the record is deleted and StudentFencedError is thrown", async () => {
  const { db, decisions } = setup();
  const realInsert = decisions.insertOne.bind(decisions);
  let fenced = false;
  decisions.insertOne = (async (doc, opts) => {
    const res = await realInsert(doc, opts);
    if (!fenced) {
      fenced = true;
      await fenceStudent(db, "stu-fence-2");
    }
    return res;
  }) as typeof decisions.insertOne;

  await assert.rejects(
    recordRejectReasons(db, { threadId: "scribe:sess-fence-2", studentId: "stu-fence-2", rejected: [{ key: "a" }] }),
    StudentFencedError,
  );
  assert.equal(decisions.all().length, 0, "the write this call made is undone immediately, not left for executeErasure");
});

test("recordRejectReasons: compensation removes only the document THIS call inserted — a DIFFERENT student's record is untouched", async () => {
  const { db, decisions } = setup();
  await recordRejectReasons(db, { threadId: "scribe:sess-other", studentId: "stu-other", rejected: [{ key: "z" }] });
  assert.equal(decisions.all().length, 1);

  const realInsert = decisions.insertOne.bind(decisions);
  let fenced = false;
  decisions.insertOne = (async (doc, opts) => {
    const res = await realInsert(doc, opts);
    if (!fenced) {
      fenced = true;
      await fenceStudent(db, "stu-fence-3");
    }
    return res;
  }) as typeof decisions.insertOne;

  await assert.rejects(
    recordRejectReasons(db, { threadId: "scribe:sess-fence-3", studentId: "stu-fence-3", rejected: [{ key: "a" }] }),
    StudentFencedError,
  );
  const remaining = decisions.all();
  assert.equal(remaining.length, 1, "only the other student's pre-existing record remains");
  assert.equal(remaining[0]?.studentId, "stu-other");
});

test("recordRejectReasons: a call that runs past its writer deadline throws FencedWriterDeadlineError and is undone when it settles", { timeout: 5000 }, async () => {
  const { db, decisions } = setup();
  const realInsert = decisions.insertOne.bind(decisions);
  let gate!: () => void;
  const opened = new Promise<void>((resolve) => (gate = resolve));
  let calls = 0;
  decisions.insertOne = (async (doc, opts) => {
    calls += 1;
    if (calls === 1) await opened; // stuck past the (short) deadline
    return realInsert(doc, opts);
  }) as typeof decisions.insertOne;

  const call = recordRejectReasons(
    db,
    { threadId: "scribe:sess-fence-4", studentId: "stu-fence-4", rejected: [{ key: "a" }] },
    { deadlineMs: 20 },
  );
  const err = await call.catch((e: unknown) => e);
  assert.ok(err instanceof FencedWriterDeadlineError, `expected FencedWriterDeadlineError, got ${String(err)}`);
  gate(); // let the stuck write land
  await (err as FencedWriterDeadlineError).settled;
  assert.equal(decisions.all().length, 0, "a timed-out writer keeps nothing, even once its late write lands");
});

test("recordRejectReasons: RangeError on a deadline longer than FENCED_WRITER_DEADLINE_MS, before anything is written", async () => {
  const { db, decisions } = setup();
  await assert.rejects(
    recordRejectReasons(
      db,
      { threadId: "scribe:sess-fence-5", studentId: "stu-fence-5", rejected: [{ key: "a" }] },
      { deadlineMs: FENCED_WRITER_DEADLINE_MS + 1 },
    ),
    RangeError,
  );
  assert.equal(decisions.all().length, 0);
});

// ---------------------------------------------------------------------------
// B15: erasure (hard delete, read-back = 0) and export
// ---------------------------------------------------------------------------

test("B15: a reject-reason record is erased (read-back zero) and never re-created by a retry", async () => {
  const { db, decisions } = setup();
  await recordRejectReasons(db, {
    threadId: "scribe:sess-erase",
    studentId: "stu-erase",
    rejected: [{ key: "targetCountry", reason: "not sure yet" }],
  });
  assert.equal(decisions.all().length, 1);

  const { requestId } = await requestErasure(db, { studentId: "stu-erase", requestedBy: "counsellor-9", reason: "student_request" });
  await confirmTwiceAndApprove(db, { requestId, confirmedBy: "admin-3" });
  const outcome = await executeErasure(db, requestId);
  assert.equal(outcome.status, "completed");
  assert.equal(outcome.receipt.totalRemaining, 0);
  assert.equal(decisions.all().length, 0, "the reject-reason record is gone");

  // A late write attempt after the fence is refused and can not resurrect it.
  await assert.rejects(
    recordRejectReasons(db, { threadId: "scribe:sess-erase", studentId: "stu-erase", rejected: [{ key: "targetCountry" }] }),
    StudentFencedError,
  );
  assert.equal(decisions.all().length, 0);
});

test("B15 export: exportStudent's `decisions` array carries a reject-reason record for its student, and it disappears after erasure", async () => {
  const { db, decisions } = setup();
  await recordRejectReasons(db, { threadId: "scribe:sess-export", studentId: "stu-export", rejected: [{ key: "intendedMajor", reason: "wants to change it" }] });
  await recordRejectReasons(db, { threadId: "scribe:sess-export-other", studentId: "stu-export-other", rejected: [{ key: "x" }] });

  const before = await exportStudent(db, "stu-export");
  assert.equal(before.decisions.length, 1);
  const rec = before.decisions[0] as RejectReasonAuditDoc;
  assert.equal(rec.kind, "per_fact_reject");
  assert.deepEqual(rec.rejected, [{ key: "intendedMajor", reason: "wants to change it" }]);
  // Nothing of the other student leaks into this export.
  assert.equal(before.decisions.some((d) => d.studentId === "stu-export-other"), false);

  const { requestId } = await requestErasure(db, { studentId: "stu-export", requestedBy: "counsellor-10", reason: "student_request" });
  await confirmTwiceAndApprove(db, { requestId, confirmedBy: "admin-4" });
  await executeErasure(db, requestId);

  const after = await exportStudent(db, "stu-export");
  assert.equal(after.decisions.length, 0);
  // The other student's own record is untouched.
  assert.equal(decisions.all().some((d) => d.studentId === "stu-export-other"), true);
});
