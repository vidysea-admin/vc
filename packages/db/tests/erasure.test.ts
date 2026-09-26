/**
 * T-011 / contract B15: DPDP erasure (confirm -> hard delete -> read-back verify -> receipt)
 * and the per-student export. Every assertion reads the fake collections back (B14: outcome,
 * not construction), and the fake carries every unique index from the production INDEX_PLAN.
 *
 * The "nothing left" checks do NOT reuse the implementation's selectors: they scan every
 * document of every fake collection for the erased student's identifiers (studentId, session
 * ids, fact ids, thread ids, and a marker string planted in every value), so a selector bug in
 * src/erasure.ts can not hide behind a matching bug in the test.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  requestErasure,
  confirmErasure,
  executeErasure,
  exportStudent,
  erasureRequestMatchesStudent,
  scribeCheckpointThreadId,
  ERASURE_PLAN,
  ERASURE_EXEMPT_COLLECTIONS,
  ErasureNotConfirmedError,
  ErasureSelfConfirmError,
  ErasureIncompleteError,
  ErasureRequestNotFoundError,
  ErasureStateError,
  StudentFencedError,
  isStudentFenced,
  assertStudentNotFenced,
  compensateIfFenced,
  erasureFenceKey,
  releaseExpiredErasureFences,
  startErasureFenceSweep,
  ERASURE_FENCE_GRACE_MS,
  FENCED_WRITER_DEADLINE_MS,
  FENCE_MARGIN_MS,
  MINIMUM_FENCE_HOLD_MS,
  FencedWriterDeadlineError,
  ErasureRequestAlreadyOpenError,
  ERASURE_PURGE_OP_TIMEOUT_MS,
  type ErasureRequestDoc,
} from "../src/erasure.js";
import { applyApprovedDiff, recordSessionTranscript, readSessionTranscript, resolveCitationSpan } from "../src/facts.js";
import { DEFAULT_MONGO_CLIENT_TIMEOUT_MS } from "../src/client.js";
import { COLLECTION_NAMES, type FactDoc } from "../src/collections.js";
import { INDEX_PLAN } from "../scripts/db-init.js";
import { createFakeDb, type FakeDb, type FakeCollection } from "./fakes.js";
import { ErasureCarriedSelectorsSchema, ErasureReceiptSchema, type Fact } from "@vc/schemas";

type AnyDoc = { _id: string } & Record<string, unknown>;

const ALL_FAKE_COLLECTIONS = [
  ...Object.values(COLLECTION_NAMES),
  "scribe_checkpoints",
  "scribe_checkpoint_writes",
];

function setup() {
  const { db, fakeDb } = createFakeDb();
  for (const spec of INDEX_PLAN) {
    if (!spec.unique) continue;
    fakeDb
      .collection<{ _id: string }>(spec.collection)
      .declareUniqueIndex(Object.keys(spec.keys), { partialFilterExpression: spec.partialFilterExpression });
  }
  return { db, fakeDb };
}

function coll(fakeDb: FakeDb, name: string): FakeCollection<AnyDoc> {
  return fakeDb.collection<AnyDoc>(name);
}

function fact(key: string, value: unknown, turnId: string): Fact {
  return {
    key,
    value,
    source: { type: "transcript", quote: `quote ${String(value)}`, turnId },
    confidence: 0.9,
    validFrom: "2026-09-25T00:00:00.000Z",
    purposeTags: ["profile_synthesis"],
    sensitivity: "medium",
  };
}

interface Seeded {
  studentId: string;
  marker: string;
  sessionIds: string[];
  factIds: string[];
  threadIds: string[];
}

/**
 * Seeds one student across EVERY engine collection: a students row, 2 sessions, a consent, a
 * decision, facts through the real write path (applyApprovedDiff) so edges are real, with one
 * key superseded in session 2 (a RETIRED fact), an approval claim per session, and scribe
 * checkpoints + checkpoint writes per session thread. Every free-text value carries `marker`.
 */
async function seedStudent(db: import("mongodb").Db, fakeDb: FakeDb, studentId: string): Promise<Seeded> {
  const marker = `MARK-${studentId}`;
  const sessionIds = [`${studentId}-sess-1`, `${studentId}-sess-2`];
  const now = "2026-09-25T10:00:00.000Z";
  coll(fakeDb, COLLECTION_NAMES.students).seed({ _id: studentId, studentId, createdAt: now });
  for (const sessionId of sessionIds) {
    coll(fakeDb, COLLECTION_NAMES.sessions).seed({
      _id: sessionId,
      sessionId,
      studentId,
      consentId: `consent-${studentId}`,
      startedAt: now,
    });
  }
  coll(fakeDb, COLLECTION_NAMES.consents).seed({
    _id: `consent-${studentId}`,
    studentId,
    guardianConsent: true,
    purposes: ["profile_synthesis"],
    recordedAt: now,
    minor: true,
  });
  coll(fakeDb, COLLECTION_NAMES.decisions).seed({
    _id: `decision-${studentId}`,
    studentId,
    universityId: "uni-1",
    courseId: "course-1",
    rationale: `${marker} chose it`,
    alternativesConsidered: [],
    decidedAt: now,
  });
  const diff = { studentId, summary: marker, changes: [], citedFactIds: [] };
  await applyApprovedDiff(
    db,
    diff,
    { approve: true, edits: [fact("targetCountry", `${marker}-Canada`, "t1"), fact("budget", `${marker}-20L`, "t2")] },
    sessionIds[0],
  );
  // Session 2 changes targetCountry: the Canada fact is RETIRED (validTo set, active unset).
  await applyApprovedDiff(db, diff, { approve: true, edits: [fact("targetCountry", `${marker}-Germany`, "t3")] }, sessionIds[1]);

  // T-024 / ISS-t-013r-c0-3: the readable transcript, through the real write path (2 turns per session).
  for (const sessionId of sessionIds) {
    await recordSessionTranscript(db, {
      sessionId,
      studentId,
      turns: [
        { turnId: "t1", speaker: "student", lang: "en", text: `I want Canada ${marker}`, translatedText: `I want Canada ${marker}`, ts: 1 },
        { turnId: "t2", speaker: "counsellor", lang: "en", text: `Noted ${marker}`, translatedText: `Noted ${marker}`, ts: 2 },
      ],
    });
  }

  const threadIds = sessionIds.map((s) => `scribe:${s}`);
  for (const threadId of threadIds) {
    coll(fakeDb, COLLECTION_NAMES.scribe_resolutions).seed({
      _id: threadId,
      threadId,
      studentId,
      decision: { approve: true, edits: [fact("budget", `${marker}-claim`, "t9")] },
      response: { action: "approve", note: marker },
      responseHash: `hash-${threadId}`,
      claimedAt: now,
    });
    for (const checkpointId of ["c1", "c2"]) {
      coll(fakeDb, "scribe_checkpoints").seed({
        _id: `${threadId}|${checkpointId}`,
        thread_id: threadId,
        checkpoint_ns: "",
        checkpoint_id: checkpointId,
        checkpoint: `transcript ${marker}`,
      });
      coll(fakeDb, "scribe_checkpoint_writes").seed({
        _id: `${threadId}|${checkpointId}|w`,
        thread_id: threadId,
        checkpoint_ns: "",
        checkpoint_id: checkpointId,
        task_id: "task",
        idx: 0,
        value: `write ${marker}`,
      });
    }
  }
  const factIds = coll(fakeDb, COLLECTION_NAMES.facts)
    .all()
    .filter((f) => f.studentId === studentId)
    .map((f) => f._id);
  return { studentId, marker, sessionIds, factIds, threadIds };
}

/** Identifiers of a student that must not survive erasure, anywhere. */
function identifiers(s: Seeded): string[] {
  return [s.studentId, s.marker, ...s.sessionIds, ...s.factIds, ...s.threadIds];
}

/** Every doc in every fake collection (except the audit log) that mentions any of `needles`. */
function docsMentioning(fakeDb: FakeDb, needles: string[], skip: string[] = [COLLECTION_NAMES.erasure_requests]) {
  const hits: string[] = [];
  for (const name of ALL_FAKE_COLLECTIONS) {
    if (skip.includes(name)) continue;
    for (const doc of coll(fakeDb, name).all()) {
      const json = JSON.stringify(doc);
      if (needles.some((n) => json.includes(n))) hits.push(`${name}:${doc._id}`);
    }
  }
  return hits;
}

function snapshot(fakeDb: FakeDb): string {
  return JSON.stringify(
    ALL_FAKE_COLLECTIONS.filter((n) => n !== COLLECTION_NAMES.erasure_requests).map((n) => [
      n,
      coll(fakeDb, n)
        .all()
        .map((d) => JSON.stringify(d))
        .sort(),
    ]),
  );
}

async function seedTwo() {
  const { db, fakeDb } = setup();
  const a = await seedStudent(db, fakeDb, "stu-A");
  const b = await seedStudent(db, fakeDb, "stu-B");
  return { db, fakeDb, a, b };
}

async function confirmedRequest(db: import("mongodb").Db, studentId: string) {
  const { requestId } = await requestErasure(db, { studentId, requestedBy: "counsellor-7", reason: "student_request" });
  await confirmErasure(db, { requestId, confirmedBy: "admin-2" });
  return requestId;
}

// ---------------------------------------------------------------------------
// Seed sanity: the fixture really has what the purge claims to remove.
// ---------------------------------------------------------------------------

test("fixture: student A has retired AND active facts, edges, claims, checkpoints and checkpoint writes", async () => {
  const { fakeDb, a } = await seedTwo();
  const facts = coll(fakeDb, COLLECTION_NAMES.facts).all().filter((f) => f.studentId === a.studentId) as FactDoc[];
  assert.ok(facts.some((f) => f.active === true));
  assert.ok(facts.some((f) => f.active === undefined && f.validTo), "expected at least one retired fact");
  assert.ok(docsMentioning(fakeDb, a.factIds).some((h) => h.startsWith("edges:")));
  for (const name of ["scribe_checkpoints", "scribe_checkpoint_writes", COLLECTION_NAMES.scribe_resolutions]) {
    assert.ok(docsMentioning(fakeDb, [a.studentId, ...a.threadIds]).some((h) => h.startsWith(`${name}:`)), name);
  }
});

// ---------------------------------------------------------------------------
// Confirmation gate
// ---------------------------------------------------------------------------

test("B15: an unconfirmed request deletes NOTHING (every collection byte-identical)", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const before = snapshot(fakeDb);
  const { requestId } = await requestErasure(db, {
    studentId: a.studentId,
    requestedBy: "counsellor-7",
    reason: "student_request",
  });
  await assert.rejects(() => executeErasure(db, requestId), ErasureNotConfirmedError);
  assert.equal(snapshot(fakeDb), before);
  const row = (await coll(fakeDb, COLLECTION_NAMES.erasure_requests).findOne({ _id: requestId })) as unknown as ErasureRequestDoc;
  assert.equal(row.status, "pending");
});

test("B15: a self-confirm is refused (incl. case/whitespace variants) and the request stays unexecutable", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const before = snapshot(fakeDb);
  const { requestId } = await requestErasure(db, {
    studentId: a.studentId,
    requestedBy: "counsellor-7",
    reason: "student_request",
  });
  for (const confirmedBy of ["counsellor-7", " Counsellor-7 ", "COUNSELLOR-7"]) {
    await assert.rejects(() => confirmErasure(db, { requestId, confirmedBy }), ErasureSelfConfirmError);
  }
  const row = (await coll(fakeDb, COLLECTION_NAMES.erasure_requests).findOne({ _id: requestId })) as unknown as ErasureRequestDoc;
  assert.equal(row.status, "pending");
  assert.equal(row.confirmedBy, undefined);
  await assert.rejects(() => executeErasure(db, requestId), ErasureNotConfirmedError);
  assert.equal(snapshot(fakeDb), before);
});

test("B15: confirm records requester, confirmer and times in the audit row; a second confirm is refused", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const { requestId } = await requestErasure(db, {
    studentId: a.studentId,
    requestedBy: "counsellor-7",
    reason: "guardian_request",
  });
  await confirmErasure(db, { requestId, confirmedBy: "admin-2" });
  const row = (await coll(fakeDb, COLLECTION_NAMES.erasure_requests).findOne({ _id: requestId })) as unknown as ErasureRequestDoc;
  assert.equal(row.status, "confirmed");
  assert.equal(row.requestedBy, "counsellor-7");
  assert.equal(row.confirmedBy, "admin-2");
  assert.equal(row.reason, "guardian_request");
  assert.ok(!Number.isNaN(Date.parse(row.requestedAt)));
  assert.ok(!Number.isNaN(Date.parse(row.confirmedAt ?? "")));
  await assert.rejects(() => confirmErasure(db, { requestId, confirmedBy: "admin-3" }), ErasureStateError);
});

test("B15: request validation — free-text reason, the student as actor, blank actors, unknown ids are refused", async () => {
  const { db, fakeDb, a } = await seedTwo();
  await assert.rejects(() =>
    requestErasure(db, { studentId: a.studentId, requestedBy: "c-1", reason: "she asked, phone 98xxxx" as never }),
  );
  await assert.rejects(() => requestErasure(db, { studentId: a.studentId, requestedBy: a.studentId, reason: "student_request" }));
  await assert.rejects(() => requestErasure(db, { studentId: a.studentId, requestedBy: "  ", reason: "student_request" }));
  await assert.rejects(() => requestErasure(db, { studentId: "", requestedBy: "c-1", reason: "student_request" }));
  assert.equal(coll(fakeDb, COLLECTION_NAMES.erasure_requests).size(), 0);
  await assert.rejects(() => confirmErasure(db, { requestId: "nope", confirmedBy: "admin-2" }), ErasureRequestNotFoundError);
  await assert.rejects(() => executeErasure(db, "nope"), ErasureRequestNotFoundError);
  const { requestId } = await requestErasure(db, { studentId: a.studentId, requestedBy: "c-1", reason: "student_request" });
  await assert.rejects(() => confirmErasure(db, { requestId, confirmedBy: a.studentId }));
});

// ---------------------------------------------------------------------------
// Full purge + verification + isolation
// ---------------------------------------------------------------------------

test("B15: the full purge leaves ZERO documents for the student in every collection (retired facts, edges, claims, checkpoints)", async () => {
  const { db, fakeDb, a } = await seedTwo();
  assert.ok(docsMentioning(fakeDb, identifiers(a)).length > 20, "fixture sanity: A is everywhere before");
  const requestId = await confirmedRequest(db, a.studentId);
  const outcome = await executeErasure(db, requestId);
  assert.equal(outcome.status, "completed");
  assert.deepEqual(docsMentioning(fakeDb, identifiers(a)), []);
  assert.equal(outcome.receipt.verified, true);
  assert.equal(outcome.receipt.totalRemaining, 0);
  for (const line of outcome.receipt.collections) {
    assert.equal(line.outcome, "purged", line.collection);
    assert.equal(line.remaining, 0, line.collection);
  }
});

test("B15: the receipt counts match what was actually there (read back, per collection)", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const expected: Record<string, number> = {
    [COLLECTION_NAMES.facts]: 3, // 2 active + 1 retired
    [COLLECTION_NAMES.sessions]: 2,
    [COLLECTION_NAMES.consents]: 1,
    [COLLECTION_NAMES.decisions]: 1,
    [COLLECTION_NAMES.students]: 1,
    [COLLECTION_NAMES.scribe_resolutions]: 2,
    scribe_checkpoints: 4,
    scribe_checkpoint_writes: 4,
    [COLLECTION_NAMES.session_transcripts]: 4, // T-024: 2 sessions x 2 turns
    [COLLECTION_NAMES.edges]: 6, // 3 facts x (sourced_from + has)
  };
  assert.equal(a.factIds.length, 3);
  const requestId = await confirmedRequest(db, a.studentId);
  const { receipt } = await executeErasure(db, requestId);
  const byName = Object.fromEntries(receipt.collections.map((l) => [l.collection, l.deleted]));
  assert.deepEqual(byName, expected);
});

// ---------------------------------------------------------------------------
// T-015 / ISS-t-014-rev-1: executeErasure's deleteMany/countDocuments carry an explicit per-op
// timeoutMS, larger than the client-level default (which is capped at FENCE_MARGIN_MS, D-016 —
// sized for a fenced writer's post-check margin, not a multi-collection bulk purge).
// ---------------------------------------------------------------------------

test("ISS-t-014-rev-1: ERASURE_PURGE_OP_TIMEOUT_MS is larger than the client-level default (D-016's fence margin)", () => {
  assert.ok(
    ERASURE_PURGE_OP_TIMEOUT_MS > DEFAULT_MONGO_CLIENT_TIMEOUT_MS,
    `expected ${ERASURE_PURGE_OP_TIMEOUT_MS} > ${DEFAULT_MONGO_CLIENT_TIMEOUT_MS}`,
  );
});

test("ISS-t-014-rev-1: every executeErasure deleteMany/countDocuments call REALLY CARRIES {timeoutMS: ERASURE_PURGE_OP_TIMEOUT_MS} (the fake records the options it received)", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const requestId = await confirmedRequest(db, a.studentId);
  const outcome = await executeErasure(db, requestId);
  assert.equal(outcome.status, "completed"); // fixture sanity: the purge really ran end to end

  let deleteManyCallsSeen = 0;
  let countDocumentsCallsSeen = 0;
  for (const step of ERASURE_PLAN) {
    const collection = coll(fakeDb, step.collection);
    assert.ok(collection.deleteManyCalls.length > 0, `expected at least one deleteMany call for ${step.collection}`);
    assert.ok(collection.countDocumentsCalls.length > 0, `expected at least one countDocuments call for ${step.collection}`);
    for (const call of collection.deleteManyCalls) {
      assert.equal(call.options?.timeoutMS, ERASURE_PURGE_OP_TIMEOUT_MS, `deleteMany on ${step.collection}`);
      deleteManyCallsSeen += 1;
    }
    for (const call of collection.countDocumentsCalls) {
      assert.equal(call.options?.timeoutMS, ERASURE_PURGE_OP_TIMEOUT_MS, `countDocuments on ${step.collection}`);
      countDocumentsCallsSeen += 1;
    }
  }
  assert.ok(deleteManyCallsSeen >= ERASURE_PLAN.length, "at least one deleteMany per plan step");
  assert.ok(countDocumentsCallsSeen >= ERASURE_PLAN.length, "at least one countDocuments per plan step");
});

test("B15: ANOTHER student's data is untouched, byte for byte", async () => {
  const { db, fakeDb, a, b } = await seedTwo();
  const bDocsBefore = docsMentioning(fakeDb, identifiers(b)).sort();
  const bJsonBefore = ALL_FAKE_COLLECTIONS.map((n) =>
    coll(fakeDb, n)
      .all()
      .filter((d) => identifiers(b).some((id) => JSON.stringify(d).includes(id)))
      .map((d) => JSON.stringify(d))
      .sort(),
  );
  const requestId = await confirmedRequest(db, a.studentId);
  await executeErasure(db, requestId);
  assert.deepEqual(docsMentioning(fakeDb, identifiers(b)).sort(), bDocsBefore);
  const bJsonAfter = ALL_FAKE_COLLECTIONS.map((n) =>
    coll(fakeDb, n)
      .all()
      .filter((d) => identifiers(b).some((id) => JSON.stringify(d).includes(id)))
      .map((d) => JSON.stringify(d))
      .sort(),
  );
  assert.deepEqual(bJsonAfter, bJsonBefore);
  assert.ok(bDocsBefore.length > 20);
});

test("B15: an unrelated global edge (kb_record -> kb_record) survives", async () => {
  const { db, fakeDb, a } = await seedTwo();
  coll(fakeDb, COLLECTION_NAMES.edges).seed({
    _id: "kb:1->rel->kb:2",
    from: { kind: "kb_record", id: "1" },
    to: { kind: "kb_record", id: "2" },
    rel: "related",
    createdAt: "2026-09-25T00:00:00.000Z",
  });
  await executeErasure(db, await confirmedRequest(db, a.studentId));
  assert.ok(await coll(fakeDb, COLLECTION_NAMES.edges).findOne({ _id: "kb:1->rel->kb:2" }));
});

test("B15: the receipt and the surviving audit row carry NO personal data (searched for every identifier)", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const requestId = await confirmedRequest(db, a.studentId);
  const { receipt } = await executeErasure(db, requestId);
  ErasureReceiptSchema.parse(receipt);
  const receiptJson = JSON.stringify(receipt);
  const rowJson = JSON.stringify(await coll(fakeDb, COLLECTION_NAMES.erasure_requests).findOne({ _id: requestId }));
  for (const needle of identifiers(a)) {
    assert.ok(!receiptJson.includes(needle), `receipt leaks ${needle}`);
    assert.ok(!rowJson.includes(needle), `audit row leaks ${needle}`);
  }
  // The audit row survives, and still proves which student it was for (to someone who already knows the id).
  const row = (await coll(fakeDb, COLLECTION_NAMES.erasure_requests).findOne({ _id: requestId })) as unknown as ErasureRequestDoc;
  assert.equal(row.status, "completed");
  assert.equal(row.studentId, undefined);
  assert.equal(erasureRequestMatchesStudent(row, a.studentId), true);
  assert.equal(erasureRequestMatchesStudent(row, "stu-B"), false);
});

test("B15: the audit hash is salted per request (two requests for one student do not share a hash)", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const r1 = await requestErasure(db, { studentId: a.studentId, requestedBy: "c-1", reason: "student_request" });
  // D-016: one OPEN request per student, so the first completes before the second is opened.
  await confirmErasure(db, { requestId: r1.requestId, confirmedBy: "admin-2" });
  await executeErasure(db, r1.requestId);
  const r2 = await requestErasure(db, { studentId: a.studentId, requestedBy: "c-1", reason: "student_request" });
  const rows = coll(fakeDb, COLLECTION_NAMES.erasure_requests).all() as unknown as ErasureRequestDoc[];
  const [h1, h2] = [r1, r2].map((r) => rows.find((x) => x._id === r.requestId)?.studentHash);
  assert.ok(h1 && h2 && h1 !== h2);
});

// ---------------------------------------------------------------------------
// Partial failure: reported, retryable, idempotent
// ---------------------------------------------------------------------------

test("B15: a deleteMany failure on edges is REPORTED (thrown with a receipt), anchors are deferred, and the retry completes", async () => {
  const { db, fakeDb, a, b } = await seedTwo();
  const requestId = await confirmedRequest(db, a.studentId);
  const edges = coll(fakeDb, COLLECTION_NAMES.edges);
  const realDeleteMany = edges.deleteMany.bind(edges);
  edges.deleteMany = async () => {
    throw Object.assign(new Error(`E11000 something about ${a.studentId}`), { code: 91, codeName: "ShutdownInProgress" });
  };

  const err = await executeErasure(db, requestId).then(
    () => assert.fail("expected ErasureIncompleteError"),
    (e: unknown) => e,
  );
  assert.ok(err instanceof ErasureIncompleteError);
  const lines = Object.fromEntries(err.receipt.collections.map((l) => [l.collection, l]));
  assert.equal(lines[COLLECTION_NAMES.edges]?.outcome, "failed");
  assert.ok((lines[COLLECTION_NAMES.edges]?.remaining ?? 0) > 0);
  assert.ok(!JSON.stringify(err.receipt).includes(a.studentId), "the failure receipt must not echo the driver message");
  for (const purged of ["scribe_checkpoints", "scribe_checkpoint_writes", COLLECTION_NAMES.consents, COLLECTION_NAMES.decisions]) {
    assert.equal(lines[purged]?.outcome, "purged", purged);
    assert.equal(lines[purged]?.remaining, 0, purged);
  }
  for (const anchor of [COLLECTION_NAMES.facts, COLLECTION_NAMES.sessions, COLLECTION_NAMES.scribe_resolutions, COLLECTION_NAMES.students]) {
    assert.equal(lines[anchor]?.outcome, "deferred", anchor);
    assert.ok((lines[anchor]?.remaining ?? 0) > 0, anchor);
  }
  assert.equal(err.receipt.verified, false);
  const failedRow = (await coll(fakeDb, COLLECTION_NAMES.erasure_requests).findOne({ _id: requestId })) as unknown as ErasureRequestDoc;
  assert.equal(failedRow.status, "failed");
  assert.equal(failedRow.attempts, 1);
  assert.equal(failedRow.receipt?.verified, false);

  // Retry after the fault clears: completes, idempotent over what was already purged.
  edges.deleteMany = realDeleteMany;
  const retry = await executeErasure(db, requestId);
  assert.equal(retry.status, "completed");
  assert.equal(retry.receipt.attempt, 2);
  assert.deepEqual(docsMentioning(fakeDb, identifiers(a)), []);
  assert.ok(docsMentioning(fakeDb, identifiers(b)).length > 20, "B untouched across both attempts");

  // A third call is a no-op returning the stored receipt.
  const again = await executeErasure(db, requestId);
  assert.equal(again.status, "completed");
  assert.equal(again.alreadyCompleted, true);
  assert.deepEqual(again.receipt, retry.receipt);
});

test("B15: a failure on an anchor collection (sessions) is reported and the retry still finds every dependent", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const requestId = await confirmedRequest(db, a.studentId);
  const sessions = coll(fakeDb, COLLECTION_NAMES.sessions);
  const real = sessions.deleteMany.bind(sessions);
  sessions.deleteMany = async () => {
    throw new Error("network blip");
  };
  const err = await executeErasure(db, requestId).then(
    () => assert.fail("expected ErasureIncompleteError"),
    (e: unknown) => e,
  );
  assert.ok(err instanceof ErasureIncompleteError);
  const line = err.receipt.collections.find((l) => l.collection === COLLECTION_NAMES.sessions);
  assert.equal(line?.outcome, "failed");
  assert.equal(line?.remaining, 2);
  sessions.deleteMany = real;
  const retry = await executeErasure(db, requestId);
  assert.equal(retry.status, "completed");
  assert.deepEqual(docsMentioning(fakeDb, identifiers(a)), []);
});

test("B15: the verification pass catches a delete that reports success but leaves documents", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const requestId = await confirmedRequest(db, a.studentId);
  const cps = coll(fakeDb, "scribe_checkpoints");
  cps.deleteMany = async () => ({ acknowledged: true, deletedCount: 0 });
  const err = await executeErasure(db, requestId).then(
    () => assert.fail("expected ErasureIncompleteError"),
    (e: unknown) => e,
  );
  assert.ok(err instanceof ErasureIncompleteError);
  const line = err.receipt.collections.find((l) => l.collection === "scribe_checkpoints");
  assert.equal(line?.outcome, "purged");
  assert.equal(line?.remaining, 4);
  assert.equal(err.receipt.verified, false);
  assert.equal(err.receipt.totalRemaining, 4);
  const row = (await coll(fakeDb, COLLECTION_NAMES.erasure_requests).findOne({ _id: requestId })) as unknown as ErasureRequestDoc;
  assert.equal(row.status, "failed");
  assert.equal(row.studentId, a.studentId, "a failed request keeps what it needs to retry");
});

// ---------------------------------------------------------------------------
// Coverage: every engine collection is erased or explicitly exempt
// ---------------------------------------------------------------------------

test("B15: every COLLECTION_NAMES entry is in ERASURE_PLAN or explicitly exempt with a reason (a new cards/feedback collection can not be missed)", () => {
  const planned = new Set(ERASURE_PLAN.map((s) => s.collection));
  for (const name of Object.values(COLLECTION_NAMES)) {
    const exempt = ERASURE_EXEMPT_COLLECTIONS[name as keyof typeof ERASURE_EXEMPT_COLLECTIONS];
    assert.ok(planned.has(name) || (typeof exempt === "string" && exempt.length > 10), `collection "${name}" is neither erased nor exempt`);
    assert.ok(!(planned.has(name) && exempt), `collection "${name}" is both erased and exempt`);
  }
  assert.ok(planned.has("scribe_checkpoints") && planned.has("scribe_checkpoint_writes"));
});

test("B15 drift guard: checkpoint collection names and the scribe thread-id format match packages/engine", () => {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const checkpointer = readFileSync(`${here}../../engine/src/scribe/checkpointer.ts`, "utf8");
  const graph = readFileSync(`${here}../../engine/src/scribe/graph.ts`, "utf8");
  assert.match(checkpointer, /checkpoints:\s*"scribe_checkpoints"/);
  assert.match(checkpointer, /writes:\s*"scribe_checkpoint_writes"/);
  assert.equal(COLLECTION_NAMES.scribe_checkpoints, "scribe_checkpoints");
  assert.equal(COLLECTION_NAMES.scribe_checkpoint_writes, "scribe_checkpoint_writes");
  assert.match(graph, /return `scribe:\$\{sessionId\}`;/);
  assert.equal(scribeCheckpointThreadId("s-1"), "scribe:s-1");
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

test("B15 export: the bundle holds all of A's facts (with history), sessions, decisions, consents, edges and claims, and nothing of B", async () => {
  const { db, fakeDb, a, b } = await seedTwo();
  const before = snapshot(fakeDb);
  const bundle = await exportStudent(db, a.studentId);
  assert.equal(snapshot(fakeDb), before, "export writes nothing");
  assert.equal(bundle.studentId, a.studentId);
  assert.equal(bundle.purpose, "data_subject_access");
  assert.deepEqual(bundle.facts.map((f) => f._id).sort(), [...a.factIds].sort());
  assert.equal(bundle.facts.filter((f) => f.active === true).length, 2);
  assert.equal(bundle.facts.filter((f) => f.active !== true).length, 1, "retired history included");
  assert.deepEqual(bundle.sessions.map((s) => s.sessionId).sort(), [...a.sessionIds].sort());
  assert.equal(bundle.decisions.length, 1);
  assert.equal(bundle.consents.length, 1);
  assert.equal(bundle.student?.studentId, a.studentId);
  assert.equal(bundle.edges.length, 6);
  assert.equal(bundle.approvalClaims.length, 2);
  assert.deepEqual(bundle.checkpoints, { threads: [...a.threadIds].sort(), checkpointDocs: 4, writeDocs: 4 });
  const json = JSON.stringify(bundle);
  for (const needle of identifiers(b)) assert.ok(!json.includes(needle), `export leaks B identifier ${needle}`);
});

// ---------------------------------------------------------------------------
// T-024 / ISS-t-013r-c0-3 (D-020 "puri chat bhi save rehegi"): the transcript is a first-class record.
// ---------------------------------------------------------------------------

test("ISS-t-013r-c0-3: exportStudent includes the full transcript VERBATIM (every turn, text + translation), and none of B's", async () => {
  const { db, a, b } = await seedTwo();
  const bundle = await exportStudent(db, a.studentId);
  assert.equal(bundle.transcripts.length, 4);
  assert.deepEqual(
    bundle.transcripts.map((t) => [t.sessionId, t.turnId, t.speaker, t.text, t.translatedText]),
    [
      [a.sessionIds[0], "t1", "student", `I want Canada ${a.marker}`, `I want Canada ${a.marker}`],
      [a.sessionIds[0], "t2", "counsellor", `Noted ${a.marker}`, `Noted ${a.marker}`],
      [a.sessionIds[1], "t1", "student", `I want Canada ${a.marker}`, `I want Canada ${a.marker}`],
      [a.sessionIds[1], "t2", "counsellor", `Noted ${a.marker}`, `Noted ${a.marker}`],
    ],
  );
  for (const t of bundle.transcripts) assert.equal(t.studentId, a.studentId);
  const json = JSON.stringify(bundle.transcripts);
  for (const needle of identifiers(b)) assert.ok(!json.includes(needle), `transcript export leaks B identifier ${needle}`);
  assert.deepEqual((await exportStudent(db, "stu-nobody")).transcripts, []);
});

test("ISS-t-013r-c0-3: erasure hard-deletes A's transcript with read-back ZERO, and B's transcript is untouched", async () => {
  const { db, fakeDb, a, b } = await seedTwo();
  const transcripts = coll(fakeDb, COLLECTION_NAMES.session_transcripts);
  assert.equal(transcripts.all().filter((d) => d.studentId === a.studentId).length, 4);
  const bBefore = JSON.stringify(transcripts.all().filter((d) => d.studentId === b.studentId));
  const requestId = await confirmedRequest(db, a.studentId);
  const outcome = await executeErasure(db, requestId);
  assert.equal(outcome.status, "completed");
  const line = outcome.receipt.collections.find((l) => l.collection === COLLECTION_NAMES.session_transcripts);
  assert.deepEqual([line?.outcome, line?.deleted, line?.remaining], ["purged", 4, 0]);
  // Read-back through the driver and through the counsellor's reader: zero.
  assert.equal(await db.collection(COLLECTION_NAMES.session_transcripts).countDocuments({ studentId: a.studentId }), 0);
  for (const sessionId of a.sessionIds) {
    assert.deepEqual(await readSessionTranscript(db, { studentId: a.studentId, sessionId }), []);
  }
  assert.equal(JSON.stringify(transcripts.all().filter((d) => d.studentId === b.studentId)), bBefore);
});

test("ISS-t-013r-c0-3: the counsellor reads a session's chat back verbatim, in speaking order, scoped to the student", async () => {
  const { db, a, b } = await seedTwo();
  const turns = await readSessionTranscript(db, { studentId: a.studentId, sessionId: a.sessionIds[0]! });
  assert.deepEqual(turns.map((t) => [t.turnId, t.text]), [["t1", `I want Canada ${a.marker}`], ["t2", `Noted ${a.marker}`]]);
  // Another student's session id returns nothing, never B's chat.
  assert.deepEqual(await readSessionTranscript(db, { studentId: a.studentId, sessionId: b.sessionIds[0]! }), []);
  // A citation {turnId, quote} resolves to a span in the PERSISTED text.
  const span = resolveCitationSpan(turns, { turnId: "t1", quote: "want Canada" });
  assert.ok(span);
  assert.equal(turns[0]!.text.slice(span!.start, span!.end), "want Canada");
  assert.equal(span!.transcriptTurnId, `${a.sessionIds[0]}:t1`);
  assert.equal(resolveCitationSpan(turns, { turnId: "t1", quote: "want Germany" }), null, "a quote not in the chat resolves to nothing");
  assert.equal(resolveCitationSpan(turns, { turnId: "t9", quote: "want Canada" }), null, "a turn not in the chat resolves to nothing");
});

test("B15 export: an unknown student yields an empty bundle, not someone else's data", async () => {
  const { db, a, b } = await seedTwo();
  const bundle = await exportStudent(db, "stu-nobody");
  assert.equal(bundle.student, null);
  assert.deepEqual(
    [bundle.facts, bundle.sessions, bundle.decisions, bundle.consents, bundle.edges, bundle.approvalClaims].map((x) => x.length),
    [0, 0, 0, 0, 0, 0],
  );
  const json = JSON.stringify(bundle);
  for (const needle of [...identifiers(a), ...identifiers(b)]) assert.ok(!json.includes(needle));
});

// ---------------------------------------------------------------------------
// Cycle 1 — ISS-t-011-rev-3: concurrent writers mid-erasure must never leave an orphan
// (an edge / checkpoint whose anchor was deleted, so no later selector can find it).
// ---------------------------------------------------------------------------

/** Edges that reference a fact id no longer present in `facts` (unfindable by any future erasure). */
function orphanFactEdges(fakeDb: FakeDb): string[] {
  const live = new Set(coll(fakeDb, COLLECTION_NAMES.facts).all().map((f) => f._id));
  return coll(fakeDb, COLLECTION_NAMES.edges)
    .all()
    .filter((e) => {
      const ends = [e.from, e.to] as Array<{ kind: string; id: string }>;
      return ends.some((r) => (r.kind === "fact" || r.kind === "profile_fact") && !live.has(r.id));
    })
    .map((e) => e._id);
}

/**
 * Runs the request until it completes (a failed attempt must be retryable), at most `max` calls.
 * Every unverified attempt must leave the row `failed`, never `completed`.
 */
async function runUntilCompleted(db: import("mongodb").Db, fakeDb: FakeDb, requestId: string, max = 3) {
  const attempts: Array<{ ok: boolean; verified: boolean }> = [];
  for (let i = 0; i < max; i += 1) {
    try {
      const out = await executeErasure(db, requestId);
      attempts.push({ ok: true, verified: out.receipt.verified });
      return attempts;
    } catch (err) {
      assert.ok(err instanceof ErasureIncompleteError, `unexpected error ${String(err)}`);
      assert.equal(err.receipt.verified, false);
      const row = (await coll(fakeDb, COLLECTION_NAMES.erasure_requests).findOne({ _id: requestId })) as unknown as ErasureRequestDoc;
      assert.equal(row.status, "failed", "an unverified run must leave the request retryable, never completed");
      attempts.push({ ok: false, verified: false });
    }
  }
  return attempts;
}

test("rev-3: a fact (with edges, via the real applyApprovedDiff) written at the START of phase 2 leaves no orphan edge and nothing of A", async () => {
  const { db, fakeDb, a, b } = await seedTwo();
  const requestId = await confirmedRequest(db, a.studentId);
  const facts = coll(fakeDb, COLLECTION_NAMES.facts);
  const realDeleteMany = facts.deleteMany.bind(facts);
  const lateFactIds: string[] = [];
  let injected = false;
  facts.deleteMany = async (filter) => {
    if (!injected) {
      injected = true;
      // Cycle 2 (D-015): applyApprovedDiff is now fence-aware and would refuse here. This test
      // targets the round loop itself, so the fence is lifted around the late writes: they model a
      // writer that does NOT check the fence (the loop must still leave no orphan). The fence
      // paths are covered by the D-015 tests below.
      const fences = coll(fakeDb, "erasure_fences");
      const lifted = fences.all();
      await fences.deleteMany({});
      const diff = { studentId: a.studentId, summary: a.marker, changes: [], citedFactIds: [] };
      await applyApprovedDiff(db, diff, { approve: true, edits: [fact("intake", `${a.marker}-late`, "t-late")] }, a.sessionIds[0]);
      // The data-engineer's exact shape: a fact whose sourced_from edge points at NOTHING the
      // erasure resolves (a session with no session row), so only the fact id can find that edge.
      await applyApprovedDiff(db, diff, { approve: true, edits: [fact("scholarship", `${a.marker}-late2`, "t-late2")] }, "sess-unrecorded");
      for (const doc of lifted) fences.seed(doc);
      for (const f of facts.all()) if ((f.key === "intake" || f.key === "scholarship") && f.studentId === a.studentId) lateFactIds.push(f._id);
    }
    return realDeleteMany(filter);
  };
  const attempts = await runUntilCompleted(db, fakeDb, requestId);
  assert.ok(injected && lateFactIds.length === 2, "the concurrent writes really happened mid-erasure");
  assert.ok(attempts.at(-1)?.ok, `never completed: ${JSON.stringify(attempts)}`);
  assert.deepEqual(orphanFactEdges(fakeDb), [], "an edge survives for a deleted fact");
  assert.deepEqual(docsMentioning(fakeDb, [...identifiers(a), ...lateFactIds]), []);
  assert.ok(docsMentioning(fakeDb, identifiers(b)).length > 20, "B untouched");
});

test("rev-3: a SESSION (row, checkpoints, checkpoint writes, a session edge) inserted mid-erasure is erased too, never orphaned", async () => {
  const { db, fakeDb, a, b } = await seedTwo();
  const requestId = await confirmedRequest(db, a.studentId);
  const lateSession = `${a.studentId}-sess-late`;
  const lateThread = `scribe:${lateSession}`;
  const facts = coll(fakeDb, COLLECTION_NAMES.facts);
  const realDeleteMany = facts.deleteMany.bind(facts);
  let injected = false;
  facts.deleteMany = async (filter) => {
    if (!injected) {
      injected = true;
      const now = "2026-09-25T11:00:00.000Z";
      coll(fakeDb, COLLECTION_NAMES.sessions).seed({ _id: lateSession, sessionId: lateSession, studentId: a.studentId, startedAt: now });
      coll(fakeDb, "scribe_checkpoints").seed({ _id: `${lateThread}|c1`, thread_id: lateThread, checkpoint_ns: "", checkpoint_id: "c1", checkpoint: "x" });
      coll(fakeDb, "scribe_checkpoint_writes").seed({
        _id: `${lateThread}|c1|w`,
        thread_id: lateThread,
        checkpoint_ns: "",
        checkpoint_id: "c1",
        task_id: "t",
        idx: 0,
        value: "y",
      });
      coll(fakeDb, COLLECTION_NAMES.edges).seed({
        _id: `session:${lateSession}->discussed->kb_record:uni-9`,
        from: { kind: "session", id: lateSession },
        to: { kind: "kb_record", id: "uni-9" },
        rel: "discussed",
        createdAt: now,
      });
    }
    return realDeleteMany(filter);
  };
  const attempts = await runUntilCompleted(db, fakeDb, requestId);
  assert.ok(injected);
  assert.ok(attempts.at(-1)?.ok, `never completed: ${JSON.stringify(attempts)}`);
  assert.deepEqual(docsMentioning(fakeDb, [...identifiers(a), lateSession, lateThread]), []);
  assert.deepEqual(orphanFactEdges(fakeDb), []);
  assert.ok(docsMentioning(fakeDb, identifiers(b)).length > 20, "B untouched");
});

test("rev-3: a writer that never stops exhausts the bounded loop -> verified:false + failed (retryable); the retry still finds edges of facts deleted in the failed run", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const requestId = await confirmedRequest(db, a.studentId);
  const facts = coll(fakeDb, COLLECTION_NAMES.facts);
  const realDeleteMany = facts.deleteMany.bind(facts);
  const deletedFactId = a.factIds[0] as string;
  let writerOn = true;
  let n = 0;
  facts.deleteMany = async (filter) => {
    const res = await realDeleteMany(filter);
    if (writerOn) {
      // A late provenance edge for a fact this erasure has ALREADY deleted (a writer finishing its link()).
      n += 1;
      coll(fakeDb, COLLECTION_NAMES.edges).seed({
        _id: `fact:${deletedFactId}->sourced_from->transcript_turn:late-${n}`,
        from: { kind: "fact", id: deletedFactId },
        to: { kind: "transcript_turn", id: `late-${n}` },
        rel: "sourced_from",
        createdAt: "2026-09-25T11:00:00.000Z",
      });
    }
    return res;
  };
  const err = await executeErasure(db, requestId).then(
    () => assert.fail("a never-stable run must not complete"),
    (e: unknown) => e,
  );
  assert.ok(err instanceof ErasureIncompleteError);
  assert.equal(err.receipt.verified, false);
  assert.ok(err.receipt.totalRemaining > 0);
  assert.ok(n >= 2 && n <= 10, `the loop is bounded and re-purges (writer ran ${n} times)`);
  const row = (await coll(fakeDb, COLLECTION_NAMES.erasure_requests).findOne({ _id: requestId })) as unknown as ErasureRequestDoc;
  assert.equal(row.status, "failed");
  assert.equal(row.studentId, a.studentId);

  writerOn = false;
  const retry = await executeErasure(db, requestId);
  assert.equal(retry.status, "completed");
  assert.deepEqual(orphanFactEdges(fakeDb), [], "the retry must still find the late edge of an already-deleted fact");
  assert.deepEqual(docsMentioning(fakeDb, identifiers(a)), []);
  const doneJson = JSON.stringify(await coll(fakeDb, COLLECTION_NAMES.erasure_requests).findOne({ _id: requestId }));
  for (const needle of identifiers(a)) assert.ok(!doneJson.includes(needle), `completed audit row leaks ${needle}`);
});

// ---------------------------------------------------------------------------
// Cycle 1 — ISS-t-011-c0-1 / ISS-t-011-rev-1: the final CAS is checked
// ---------------------------------------------------------------------------

test("c0-1: two concurrent executeErasure calls on one confirmed request both return the STORED receipt; attempts counted once", async () => {
  const { db, fakeDb, a, b } = await seedTwo();
  const requestId = await confirmedRequest(db, a.studentId);
  const results = await Promise.all([executeErasure(db, requestId), executeErasure(db, requestId)]);
  const row = (await coll(fakeDb, COLLECTION_NAMES.erasure_requests).findOne({ _id: requestId })) as unknown as ErasureRequestDoc;
  assert.equal(row.status, "completed");
  assert.equal(row.attempts, 1, "a concurrent loser that finds the request completed records no attempt");
  for (const r of results) {
    assert.equal(r.status, "completed");
    assert.deepEqual(r.receipt, row.receipt, "every returned receipt IS the persisted audit record");
  }
  assert.deepEqual(results.map((r) => r.alreadyCompleted).sort(), [false, true], "exactly one caller performed the completion");
  assert.deepEqual(docsMentioning(fakeDb, identifiers(a)), []);
  assert.ok(docsMentioning(fakeDb, identifiers(b)).length > 20);
});

test("c0-1: two concurrent FAILING runs each record their own attempt (1 and 2); the stored receipt is the last one recorded", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const requestId = await confirmedRequest(db, a.studentId);
  coll(fakeDb, "scribe_checkpoints").deleteMany = async () => ({ acknowledged: true, deletedCount: 0 });
  const settled = await Promise.allSettled([executeErasure(db, requestId), executeErasure(db, requestId)]);
  const receipts = settled.map((s) => {
    assert.equal(s.status, "rejected");
    const reason = (s as PromiseRejectedResult).reason as unknown;
    assert.ok(reason instanceof ErasureIncompleteError);
    return reason.receipt;
  });
  assert.deepEqual(receipts.map((r) => r.attempt).sort(), [1, 2]);
  const row = (await coll(fakeDb, COLLECTION_NAMES.erasure_requests).findOne({ _id: requestId })) as unknown as ErasureRequestDoc;
  assert.equal(row.status, "failed");
  assert.equal(row.attempts, 2);
  assert.deepEqual(row.receipt, receipts.find((r) => r.attempt === 2));
});

// ---------------------------------------------------------------------------
// Cycle 2 — D-015: the erasure fence + post-write compensation
// (ISS-t-011-c1-1: a write landing after its collection's read-back count;
//  ISS-t-011-c1-rev-1: a write landing between the final read-back and the completion CAS).
// Every "nothing left" check is a full scan of every fake collection, never the implementation's
// selectors. Late writers are the REAL fence-aware writers (applyApprovedDiff, or a writer built
// on compensateIfFenced), because the fence can only bind writers that check it.
// ---------------------------------------------------------------------------

const FENCES = "erasure_fences";

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

type WriterResult = { ok: true } | { ok: false; err: unknown };

/**
 * Starts the REAL applyApprovedDiff for `s`, and pauses it at its first facts.insertOne (i.e. AFTER
 * its fence pre-check, BEFORE any write). `release()` lets it write its fact + 2 edges and run its
 * post-write fence check. `lateFactIds` collects the ids it inserted.
 */
function pausedWriter(db: import("mongodb").Db, fakeDb: FakeDb, s: Seeded, key: string) {
  const facts = coll(fakeDb, COLLECTION_NAMES.facts);
  const realInsert = facts.insertOne.bind(facts);
  const g = gate();
  const reached = gate();
  const lateFactIds: string[] = [];
  facts.insertOne = async (doc) => {
    if (doc.studentId === s.studentId && doc.key === key) {
      lateFactIds.push(doc._id);
      reached.open();
      await g.opened;
    }
    return realInsert(doc);
  };
  const diff = { studentId: s.studentId, summary: s.marker, changes: [], citedFactIds: [] };
  const done: Promise<WriterResult> = applyApprovedDiff(
    db,
    diff,
    { approve: true, edits: [fact(key, `${s.marker}-late-${key}`, `t-${key}`)] },
    s.sessionIds[0],
  ).then(
    () => ({ ok: true as const }),
    (err: unknown) => ({ ok: false as const, err }),
  );
  return { atGate: reached.opened, release: g.open, done, lateFactIds };
}

async function requestRow(fakeDb: FakeDb, requestId: string) {
  return (await coll(fakeDb, COLLECTION_NAMES.erasure_requests).findOne({ _id: requestId })) as unknown as ErasureRequestDoc;
}

/** Full-scan residue for A: every identifier, plus the late ids the test injected. */
function residue(fakeDb: FakeDb, a: Seeded, extra: string[] = []) {
  return docsMentioning(fakeDb, [...identifiers(a), ...extra]);
}

test("D-015 fence: confirm sets a fence that holds NO clear studentId (hashed key), unique per student; pending sets none", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const { requestId } = await requestErasure(db, { studentId: a.studentId, requestedBy: "counsellor-7", reason: "student_request" });
  assert.equal(coll(fakeDb, FENCES).size(), 0, "a pending request fences nothing");
  assert.equal(await isStudentFenced(db, a.studentId), false);
  await confirmErasure(db, { requestId, confirmedBy: "admin-2" });
  const fences = coll(fakeDb, FENCES).all();
  assert.equal(fences.length, 1);
  assert.equal(fences[0]!._id, erasureFenceKey(a.studentId));
  assert.equal(fences[0]!.requestId, requestId);
  assert.ok(typeof fences[0]!.createdAt === "string");
  assert.ok(!JSON.stringify(fences).includes(a.studentId), "the fence holds no clear studentId");
  assert.equal(await isStudentFenced(db, a.studentId), true);
  assert.equal(await isStudentFenced(db, "stu-B"), false, "the fence is per student");
  assert.equal(COLLECTION_NAMES.erasure_fences, FENCES);
});

test("D-015 fence: a writer that STARTS after confirm is refused and writes nothing (every collection unchanged)", async () => {
  const { db, fakeDb, a } = await seedTwo();
  await confirmedRequest(db, a.studentId);
  const before = snapshot(fakeDb);
  const diff = { studentId: a.studentId, summary: a.marker, changes: [], citedFactIds: [] };
  await assert.rejects(
    applyApprovedDiff(db, diff, { approve: true, edits: [fact("intake", `${a.marker}-after`, "t-after")] }, a.sessionIds[0]),
    StudentFencedError,
  );
  assert.equal(snapshot(fakeDb), before, "a fenced writer must write nothing");
  await assert.rejects(assertStudentNotFenced(db, a.studentId), StudentFencedError);
});

test("D-015 H4 (checker probe, fact + edge): a writer started BEFORE confirm and landing inside students.countDocuments (the LAST read-back) is compensated -> zero residue, fenced error", async () => {
  const { db, fakeDb, a, b } = await seedTwo();
  const w = pausedWriter(db, fakeDb, a, "intake");
  await w.atGate; // passed its pre-check, nothing written yet
  const requestId = await confirmedRequest(db, a.studentId);
  const students = coll(fakeDb, COLLECTION_NAMES.students);
  const realCount = students.countDocuments.bind(students);
  const facts = coll(fakeDb, COLLECTION_NAMES.facts);
  const realFactsDelete = facts.deleteMany.bind(facts);
  let injected = false;
  let lateDocsSeenMidReadBack = 0;
  students.countDocuments = async (filter) => {
    const n = await realCount(filter); // the real count FIRST, exactly like the checker's H4
    if (!injected) {
      injected = true;
      // Observe the late write really landing mid read-back: the writer's compensation starts by
      // deleting its fact; count its fact + edges at that moment.
      facts.deleteMany = async (f) => {
        lateDocsSeenMidReadBack = docsMentioning(fakeDb, w.lateFactIds).length;
        return realFactsDelete(f);
      };
      w.release();
      const r = await w.done;
      facts.deleteMany = realFactsDelete;
      assert.ok(!r.ok && r.err instanceof StudentFencedError, `the late writer must be told it was fenced, got ${JSON.stringify(r)}`);
    }
    return n;
  };
  const out = await executeErasure(db, requestId);
  assert.ok(injected, "the write really happened during the read-back");
  assert.equal(w.lateFactIds.length, 1);
  assert.equal(lateDocsSeenMidReadBack, 3, "the late fact + 2 edges existed mid read-back (then were compensated)");
  assert.equal(out.status, "completed");
  assert.equal(out.receipt.verified, true);
  assert.deepEqual(residue(fakeDb, a, w.lateFactIds), [], "the late fact and its edges must not survive");
  assert.deepEqual(orphanFactEdges(fakeDb), []);
  assert.ok(docsMentioning(fakeDb, identifiers(b)).length > 20, "B untouched");
});

test("D-015 H4 variant: a writer that STARTS inside students.countDocuments (after confirm) is refused by its pre-check -> zero residue", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const requestId = await confirmedRequest(db, a.studentId);
  const students = coll(fakeDb, COLLECTION_NAMES.students);
  const realCount = students.countDocuments.bind(students);
  let refused: unknown = null;
  students.countDocuments = async (filter) => {
    const n = await realCount(filter);
    if (refused === null) {
      const diff = { studentId: a.studentId, summary: a.marker, changes: [], citedFactIds: [] };
      refused = await applyApprovedDiff(db, diff, { approve: true, edits: [fact("intake", `${a.marker}-h4`, "t-h4")] }, "sess-h4").then(
        () => "WROTE",
        (e: unknown) => e,
      );
    }
    return n;
  };
  const out = await executeErasure(db, requestId);
  assert.ok(refused instanceof StudentFencedError, `the late writer must be refused, got ${String(refused)}`);
  assert.equal(out.receipt.verified, true);
  assert.deepEqual(residue(fakeDb, a, ["sess-h4", `${a.marker}-h4`]), []);
});

test("D-015 H4b (checker probe, session + checkpoint + edge): a fence-aware writer landing inside scribe_resolutions.countDocuments leaves zero residue", async () => {
  const { db, fakeDb, a, b } = await seedTwo();
  const lateSession = `${a.studentId}-sess-h4b`;
  const lateThread = `scribe:${lateSession}`;
  const g = gate();
  const now = "2026-09-25T12:00:00.000Z";
  let wrote = false;
  // A writer shaped like a session start: pre-check, write a session row + checkpoint + checkpoint
  // write + a session edge, then the post-write fence check with an undo by the ids it wrote.
  const writer = (async () => {
    await assertStudentNotFenced(db, a.studentId);
    await g.opened;
    const edgeId = `session:${lateSession}->discussed->kb_record:uni-9`;
    coll(fakeDb, COLLECTION_NAMES.sessions).seed({ _id: lateSession, sessionId: lateSession, studentId: a.studentId, startedAt: now });
    coll(fakeDb, "scribe_checkpoints").seed({ _id: `${lateThread}|c1`, thread_id: lateThread, checkpoint_ns: "", checkpoint_id: "c1", checkpoint: "x" });
    coll(fakeDb, "scribe_checkpoint_writes").seed({
      _id: `${lateThread}|c1|w`,
      thread_id: lateThread,
      checkpoint_ns: "",
      checkpoint_id: "c1",
      task_id: "t",
      idx: 0,
      value: "y",
    });
    coll(fakeDb, COLLECTION_NAMES.edges).seed({
      _id: edgeId,
      from: { kind: "session", id: lateSession },
      to: { kind: "kb_record", id: "uni-9" },
      rel: "discussed",
      createdAt: now,
    });
    wrote = true;
    await compensateIfFenced(db, a.studentId, async () => {
      await coll(fakeDb, COLLECTION_NAMES.sessions).deleteMany({ _id: lateSession });
      await coll(fakeDb, "scribe_checkpoints").deleteMany({ thread_id: lateThread });
      await coll(fakeDb, "scribe_checkpoint_writes").deleteMany({ thread_id: lateThread });
      await coll(fakeDb, COLLECTION_NAMES.edges).deleteMany({ _id: edgeId });
    });
  })().then(
    () => ({ ok: true as const }),
    (err: unknown) => ({ ok: false as const, err }),
  );
  const requestId = await confirmedRequest(db, a.studentId);
  const claims = coll(fakeDb, COLLECTION_NAMES.scribe_resolutions);
  const realCount = claims.countDocuments.bind(claims);
  let injected = false;
  claims.countDocuments = async (filter) => {
    const n = await realCount(filter);
    if (!injected) {
      injected = true;
      g.open();
      const r = await writer;
      assert.ok(!r.ok && r.err instanceof StudentFencedError, `expected a fenced writer, got ${JSON.stringify(r)}`);
    }
    return n;
  };
  const out = await executeErasure(db, requestId);
  assert.ok(injected && wrote, "the session writer really wrote during the read-back");
  assert.equal(out.receipt.verified, true);
  assert.deepEqual(residue(fakeDb, a, [lateSession, lateThread]), []);
  assert.ok(docsMentioning(fakeDb, identifiers(b)).length > 20, "B untouched");
});

test("D-015: a writer that starts BEFORE confirm and finishes AFTER it (before execute) compensates; the erasure then completes with zero residue", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const w = pausedWriter(db, fakeDb, a, "intake");
  await w.atGate;
  const requestId = await confirmedRequest(db, a.studentId);
  w.release();
  const r = await w.done;
  assert.ok(!r.ok && r.err instanceof StudentFencedError, `expected a fenced writer, got ${JSON.stringify(r)}`);
  assert.deepEqual(docsMentioning(fakeDb, w.lateFactIds), [], "the writer removed its own fact and edges");
  const out = await executeErasure(db, requestId);
  assert.equal(out.receipt.verified, true);
  assert.deepEqual(residue(fakeDb, a, w.lateFactIds), []);
});

test("D-015 (ISS-t-011-c1-rev-1): a writer landing between the final read-back and the completion CAS is compensated -> zero residue", async () => {
  const { db, fakeDb, a, b } = await seedTwo();
  const w = pausedWriter(db, fakeDb, a, "intake");
  await w.atGate;
  const requestId = await confirmedRequest(db, a.studentId);
  const rows = coll(fakeDb, COLLECTION_NAMES.erasure_requests);
  const realCas = rows.findOneAndUpdate.bind(rows);
  let raced = false;
  rows.findOneAndUpdate = async (filter, update, options) => {
    if (!raced && (update.$set as { status?: string } | undefined)?.status === "completed") {
      raced = true;
      w.release();
      const r = await w.done;
      assert.ok(!r.ok && r.err instanceof StudentFencedError, `the racing writer must be fenced, got ${JSON.stringify(r)}`);
    }
    return realCas(filter, update, options);
  };
  const out = await executeErasure(db, requestId);
  assert.ok(raced, "the writer really ran between the read-back and the CAS");
  assert.equal(out.receipt.verified, true);
  assert.deepEqual(residue(fakeDb, a, w.lateFactIds), []);
  assert.deepEqual(orphanFactEdges(fakeDb), []);
  assert.ok(docsMentioning(fakeDb, identifiers(b)).length > 20, "B untouched");
});

test("D-015: ANOTHER student is unaffected by A's fence (B writes while A is fenced; B intact after A's erasure)", async () => {
  const { db, fakeDb, a, b } = await seedTwo();
  const requestId = await confirmedRequest(db, a.studentId);
  assert.equal(await isStudentFenced(db, b.studentId), false);
  const diffB = { studentId: b.studentId, summary: b.marker, changes: [], citedFactIds: [] };
  const res = await applyApprovedDiff(db, diffB, { approve: true, edits: [fact("intake", `${b.marker}-while-A-fenced`, "t-b")] }, b.sessionIds[0]);
  assert.equal(res.written.length, 1);
  const bFactId = res.written[0]!._id;
  await executeErasure(db, requestId);
  assert.ok(coll(fakeDb, COLLECTION_NAMES.facts).all().some((f) => f._id === bFactId), "B's write survives A's erasure");
  assert.equal(docsMentioning(fakeDb, [bFactId]).length, 3, "B's fact and both its edges survive");
  assert.deepEqual(residue(fakeDb, a), []);
});

test("D-016: on completion the fence is HELD until createdAt + MINIMUM_FENCE_HOLD_MS (grace 0 by default); after the hold the sweep removes it and the student can be written again", async () => {
  const { db, fakeDb, a } = await seedTwo();
  assert.equal(ERASURE_FENCE_GRACE_MS, 0, "the re-enrolment grace (gate Q1 policy) stays 0; the technical hold is separate");
  const requestId = await confirmedRequest(db, a.studentId);
  let fencedDuringExecute = false;
  const consents = coll(fakeDb, COLLECTION_NAMES.consents);
  const realDelete = consents.deleteMany.bind(consents);
  consents.deleteMany = async (f) => {
    fencedDuringExecute ||= await isStudentFenced(db, a.studentId);
    return realDelete(f);
  };
  await executeErasure(db, requestId);
  assert.ok(fencedDuringExecute, "the fence exists while the purge runs");
  const [fence] = coll(fakeDb, FENCES).all();
  assert.ok(fence, "the fence outlives the completion (minimum hold)");
  const holdEnd = Date.parse(fence.createdAt as string) + MINIMUM_FENCE_HOLD_MS;
  assert.equal(fence.releaseAfter, new Date(holdEnd).toISOString(), "releaseAfter = createdAt + hold (grace 0)");
  assert.equal(await isStudentFenced(db, a.studentId), true, "still fenced inside the hold");
  assert.equal(await releaseExpiredErasureFences(db, new Date(holdEnd - 1)), 0, "never removed before the hold ends");
  assert.equal(await releaseExpiredErasureFences(db, new Date(holdEnd)), 1);
  assert.equal(coll(fakeDb, FENCES).size(), 0);
  const diff = { studentId: a.studentId, summary: "re-enrolled", changes: [], citedFactIds: [] };
  const res = await applyApprovedDiff(db, diff, { approve: true, edits: [fact("intake", "re-enrolled", "t-new")] }, "sess-new");
  assert.equal(res.written.length, 1, "re-enrolment after the hold is allowed");
});

test("D-015: a FAILED attempt keeps the fence (writes still refused) until the retry completes", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const requestId = await confirmedRequest(db, a.studentId);
  const edges = coll(fakeDb, COLLECTION_NAMES.edges);
  const realDelete = edges.deleteMany.bind(edges);
  edges.deleteMany = async () => {
    throw Object.assign(new Error("boom"), { name: "MongoNetworkError" });
  };
  await assert.rejects(executeErasure(db, requestId), ErasureIncompleteError);
  assert.equal(await isStudentFenced(db, a.studentId), true, "a failed (open) request keeps its fence");
  edges.deleteMany = realDelete;
  await executeErasure(db, requestId);
  const [fence] = coll(fakeDb, FENCES).all();
  assert.ok(typeof fence?.releaseAfter === "string", "after the retry completes the fence is stamped for release (D-016 hold)");
  assert.equal(await isStudentFenced(db, a.studentId, new Date(Date.parse(fence.releaseAfter as string))), false);
});

test("D-015: executeErasure re-creates a missing fence BEFORE resolving any selector", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const requestId = await confirmedRequest(db, a.studentId);
  await coll(fakeDb, FENCES).deleteMany({}); // e.g. removed by hand, or a row confirmed before cycle 2
  const facts = coll(fakeDb, COLLECTION_NAMES.facts);
  const realFind = facts.find.bind(facts);
  let fencedAtFirstResolve: boolean | null = null;
  facts.find = (filter) => {
    if (fencedAtFirstResolve === null) fencedAtFirstResolve = coll(fakeDb, FENCES).size() === 1;
    return realFind(filter);
  };
  await executeErasure(db, requestId);
  assert.equal(fencedAtFirstResolve, true, "the fence must exist before the first selector is resolved");
});

test("D-015/D-016: two concurrent executes leave no fence beyond the hold (one fence, stamped; the sweep removes it after the hold)", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const requestId = await confirmedRequest(db, a.studentId);
  await Promise.all([executeErasure(db, requestId), executeErasure(db, requestId)]);
  const fences = coll(fakeDb, FENCES).all();
  assert.equal(fences.length, 1);
  assert.ok(typeof fences[0]!.releaseAfter === "string", "stamped, never left un-releasable");
  assert.equal(await releaseExpiredErasureFences(db, new Date(Date.parse(fences[0]!.releaseAfter as string))), 1);
  assert.equal(coll(fakeDb, FENCES).size(), 0);
});

test("D-015: with a grace period the fence lingers after completion (writes refused), and releaseExpiredErasureFences releases it once expired", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const requestId = await confirmedRequest(db, a.studentId);
  const graceMs = 24 * 3600 * 1000;
  await executeErasure(db, requestId, { fenceGraceMs: graceMs });
  assert.equal(await isStudentFenced(db, a.studentId), true, "fenced during the grace period");
  const [fence] = coll(fakeDb, FENCES).all();
  assert.ok(typeof fence?.releaseAfter === "string");
  assert.equal(await releaseExpiredErasureFences(db, new Date()), 0, "not expired yet");
  const later = new Date(Date.now() + graceMs + 1000);
  assert.equal(await isStudentFenced(db, a.studentId, later), false, "an expired fence no longer fences");
  assert.equal(await releaseExpiredErasureFences(db, later), 1);
  assert.equal(coll(fakeDb, FENCES).size(), 0);
});

test("D-015: a failed fence release never fails a verified erasure, and releaseExpiredErasureFences clears the leftover fence after the hold", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const requestId = await confirmedRequest(db, a.studentId);
  const fences = coll(fakeDb, FENCES);
  const realDelete = fences.deleteMany.bind(fences);
  const realUpdate = fences.updateOne.bind(fences);
  const crash = async (): Promise<never> => {
    throw Object.assign(new Error("crash"), { name: "MongoNetworkError" });
  };
  let armed = false;
  fences.deleteMany = async (f) => (armed ? crash() : realDelete(f));
  fences.updateOne = async (f, u, o) => (armed && u.$set && "releaseAfter" in u.$set ? crash() : realUpdate(f, u, o));
  armed = true;
  const out = await executeErasure(db, requestId);
  armed = false;
  fences.deleteMany = realDelete;
  fences.updateOne = realUpdate;
  assert.equal(out.receipt.verified, true);
  assert.equal((await requestRow(fakeDb, requestId)).status, "completed");
  assert.equal(fences.size(), 1, "the fence lingered (fail-safe: writes stay refused)");
  assert.equal(await releaseExpiredErasureFences(db), 0, "not before the hold");
  const holdEnd = Date.parse(fences.all()[0]!.createdAt as string) + MINIMUM_FENCE_HOLD_MS;
  assert.equal(await releaseExpiredErasureFences(db, new Date(holdEnd)), 1);
  assert.equal(fences.size(), 0);
});

// ---------------------------------------------------------------------------
// Cycle 2 — the lows: ISS-t-011-c1-rev-2 (cap + zod), ISS-t-011-c1-rev-3 (CAS exhaustion, labels)
// ---------------------------------------------------------------------------

test("rev-2: ids over MAX_CARRIED_IDS -> failed with the distinct 'selectors:over_cap' label, no anchor deleted past the cap, the carried ids stay within the cap and parse", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const requestId = await confirmedRequest(db, a.studentId);
  const beforeFacts = coll(fakeDb, COLLECTION_NAMES.facts).size();
  const err = await executeErasure(db, requestId, { maxCarriedIds: 2 }).catch((e: unknown) => e);
  assert.ok(err instanceof ErasureIncompleteError, `expected ErasureIncompleteError, got ${String(err)}`);
  const factsLine = err.receipt.collections.find((l) => l.collection === COLLECTION_NAMES.facts);
  assert.equal(factsLine?.outcome, "failed");
  assert.equal(factsLine?.error, "selectors:over_cap");
  assert.equal(coll(fakeDb, COLLECTION_NAMES.facts).size(), beforeFacts, "no anchor deleted past the cap");
  const row = await requestRow(fakeDb, requestId);
  assert.equal(row.status, "failed");
  const carried = ErasureCarriedSelectorsSchema.parse(row.carriedSelectors ?? { factIds: [], sessionIds: [], threadIds: [] });
  for (const list of [carried.factIds, carried.sessionIds, carried.threadIds]) assert.ok(list.length <= 2);
  const retry = await executeErasure(db, requestId);
  assert.equal(retry.receipt.verified, true);
  assert.deepEqual(residue(fakeDb, a), []);
});

test("rev-2: a corrupted carriedSelectors on the row is refused (zod) before anything is deleted", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const requestId = await confirmedRequest(db, a.studentId);
  const rows = coll(fakeDb, COLLECTION_NAMES.erasure_requests);
  await rows.findOneAndUpdate({ _id: requestId }, { $set: { carriedSelectors: { factIds: [42], sessionIds: [], threadIds: [], extra: 1 } } });
  const before = snapshot(fakeDb);
  await assert.rejects(executeErasure(db, requestId), ErasureStateError);
  assert.equal(snapshot(fakeDb), before);
});

test("rev-3: CAS retries exhausted -> the attempt is STILL recorded (attempts+1, failed, receipt stored) and the call throws", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const requestId = await confirmedRequest(db, a.studentId);
  const rows = coll(fakeDb, COLLECTION_NAMES.erasure_requests);
  const realCas = rows.findOneAndUpdate.bind(rows);
  rows.findOneAndUpdate = async (filter, update, options) => {
    if ("attempts" in filter) return null; // every checked CAS misses while the row never changes
    return realCas(filter, update, options);
  };
  await assert.rejects(executeErasure(db, requestId), ErasureStateError);
  const row = await requestRow(fakeDb, requestId);
  assert.equal(row.attempts, 1, "the exhausted attempt is recorded, not dropped from the audit");
  assert.equal(row.status, "failed");
  assert.ok(row.receipt, "its receipt is stored");
  assert.equal(row.studentId, a.studentId, "still retryable");
  assert.equal(await isStudentFenced(db, a.studentId), true, "an unrecorded completion keeps the fence");
});

test("rev-3: a resolve failure in a later round is labelled with the collection that failed (sessions), not always facts", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const requestId = await confirmedRequest(db, a.studentId);
  const facts = coll(fakeDb, COLLECTION_NAMES.facts);
  const realFactsDelete = facts.deleteMany.bind(facts);
  let seeded = false;
  facts.deleteMany = async (f) => {
    if (!seeded) {
      seeded = true; // force a second round: a raw late session row
      coll(fakeDb, COLLECTION_NAMES.sessions).seed({ _id: "late-s", sessionId: "late-s", studentId: a.studentId, startedAt: "2026-09-25T00:00:00.000Z" });
    }
    return realFactsDelete(f);
  };
  const sessions = coll(fakeDb, COLLECTION_NAMES.sessions);
  const realFind = sessions.find.bind(sessions);
  let calls = 0;
  sessions.find = (filter) => {
    calls += 1;
    if (calls === 2) {
      return {
        toArray: async () => {
          throw Object.assign(new Error("x"), { name: "MongoNetworkError" });
        },
      };
    }
    return realFind(filter);
  };
  const err = await executeErasure(db, requestId).catch((e: unknown) => e);
  assert.ok(err instanceof ErasureIncompleteError, `expected ErasureIncompleteError, got ${String(err)}`);
  const line = (c: string) => err.receipt.collections.find((l) => l.collection === c);
  assert.equal(line(COLLECTION_NAMES.sessions)?.error, "resolve:MongoNetworkError");
  assert.notEqual(line(COLLECTION_NAMES.facts)?.error?.startsWith("resolve:"), true, "facts did not fail to resolve");
});

// ---------------------------------------------------------------------------
// Cycle 3 — D-016: writer deadline + minimum fence hold (ISS-t-011-c2-1, ISS-t-011-c2-rev-1),
// one open request per student (ISS-t-011-c2-rev-4), lows (ISS-t-011-c2-rev-3).
// ---------------------------------------------------------------------------

test("D-016 KEY PROBE (ISS-t-011-c2-1): a real writer paused before its insert and released only AFTER completion AND the fence-release call is still fenced -> compensated, zero residue; the sweep removes the fence only after the hold", async () => {
  const { db, fakeDb, a, b } = await seedTwo();
  const w = pausedWriter(db, fakeDb, a, "intake");
  await w.atGate; // its pre-check passed before the fence existed
  const requestId = await confirmedRequest(db, a.studentId);
  const fences = coll(fakeDb, FENCES);
  const realDelete = fences.deleteMany.bind(fences);
  const realUpdate = fences.updateOne.bind(fences);
  let releaseCalls = 0;
  let writer: WriterResult | null = null;
  let statusWhenReleased: string | undefined;
  const releaseWriterAfter = async () => {
    releaseCalls += 1;
    if (writer !== null) return;
    statusWhenReleased = (await requestRow(fakeDb, requestId)).status;
    w.release(); // exactly the checker's probe: the write + post-check run after the release attempt
    writer = await w.done;
  };
  fences.deleteMany = async (f) => {
    const res = await realDelete(f);
    await releaseWriterAfter();
    return res;
  };
  fences.updateOne = async (f, u, o) => {
    const res = await realUpdate(f, u, o);
    if (u.$set && "releaseAfter" in u.$set) await releaseWriterAfter();
    return res;
  };
  const out = await executeErasure(db, requestId);
  fences.deleteMany = realDelete;
  fences.updateOne = realUpdate;
  assert.ok(releaseCalls > 0, "the fence release was attempted");
  assert.equal(statusWhenReleased, "completed", "the writer ran only after the completion was recorded");
  assert.equal(out.status, "completed");
  assert.equal(out.receipt.verified, true);
  const result = writer as WriterResult | null;
  assert.ok(result && !result.ok && result.err instanceof StudentFencedError, `the late writer must be fenced, got ${JSON.stringify(result)}`);
  assert.equal(w.lateFactIds.length, 1, "its insert really ran");
  assert.deepEqual(residue(fakeDb, a, w.lateFactIds), [], "zero residue: the late fact and its edges were compensated");
  assert.deepEqual(orphanFactEdges(fakeDb), []);
  assert.ok(docsMentioning(fakeDb, identifiers(b)).length > 20, "B untouched");
  // The fence is removed only after createdAt + hold (fake clock).
  const [fence] = fences.all();
  assert.ok(fence, "fence still present after completion");
  const holdEnd = Date.parse(fence.createdAt as string) + MINIMUM_FENCE_HOLD_MS;
  assert.equal(await releaseExpiredErasureFences(db, new Date(holdEnd - 1)), 0);
  assert.equal(await releaseExpiredErasureFences(db, new Date(holdEnd + 1)), 1);
  assert.equal(fences.size(), 0);
});

test("D-016 minimum hold: releaseAfter = max(createdAt + hold, completion + grace); createdAt is NOT reset on re-arm; an old fence past its hold is deleted at completion", async () => {
  assert.equal(MINIMUM_FENCE_HOLD_MS, FENCED_WRITER_DEADLINE_MS + FENCE_MARGIN_MS);
  assert.ok(FENCED_WRITER_DEADLINE_MS > 0 && FENCE_MARGIN_MS > 0);
  // (1) grace larger than the hold -> completion + grace.
  {
    const { db, fakeDb, a } = await seedTwo();
    const requestId = await confirmedRequest(db, a.studentId);
    const graceMs = 24 * 3600 * 1000;
    await executeErasure(db, requestId, { fenceGraceMs: graceMs });
    const [fence] = coll(fakeDb, FENCES).all();
    const row = await requestRow(fakeDb, requestId);
    assert.equal(fence!.releaseAfter, new Date(Date.parse(row.completedAt!) + graceMs).toISOString());
  }
  // (2) re-arm keeps the original createdAt (a failed attempt, then execute re-sets the fence).
  {
    const { db, fakeDb, a } = await seedTwo();
    const requestId = await confirmedRequest(db, a.studentId);
    const original = coll(fakeDb, FENCES).all()[0]!.createdAt;
    const edges = coll(fakeDb, COLLECTION_NAMES.edges);
    const realDelete = edges.deleteMany.bind(edges);
    edges.deleteMany = async () => {
      throw Object.assign(new Error("boom"), { name: "MongoNetworkError" });
    };
    await new Promise((r) => setTimeout(r, 5));
    await assert.rejects(executeErasure(db, requestId), ErasureIncompleteError);
    edges.deleteMany = realDelete;
    await executeErasure(db, requestId);
    const [fence] = coll(fakeDb, FENCES).all();
    assert.equal(fence!.createdAt, original, "re-arming never resets createdAt");
    assert.equal(fence!.releaseAfter, new Date(Date.parse(original as string) + MINIMUM_FENCE_HOLD_MS).toISOString());
  }
  // (3) a fence created longer ago than the hold is deleted at completion (grace 0).
  {
    const { db, fakeDb, a } = await seedTwo();
    const requestId = await confirmedRequest(db, a.studentId);
    const fences = coll(fakeDb, FENCES);
    const old = new Date(Date.now() - 2 * MINIMUM_FENCE_HOLD_MS).toISOString();
    await fences.updateOne({ _id: erasureFenceKey(a.studentId) }, { $set: { createdAt: old } });
    await executeErasure(db, requestId);
    assert.equal(fences.size(), 0, "hold already over: released immediately");
  }
});

test("D-016 deadline: a writer that exceeds its deadline is ABORTED and COMPENSATED (typed error; its in-flight insert is undone when it lands; every op carried a driver timeoutMS)", { timeout: 5000 }, async () => {
  const { db, fakeDb, a } = await seedTwo();
  const facts = coll(fakeDb, COLLECTION_NAMES.facts);
  const realInsert = facts.insertOne.bind(facts);
  const g = gate();
  const lateIds: string[] = [];
  const seenTimeouts: unknown[] = [];
  facts.insertOne = (async (doc: AnyDoc, options?: { timeoutMS?: number }) => {
    seenTimeouts.push(options?.timeoutMS);
    if (doc.key === "slow") {
      lateIds.push(doc._id);
      await g.opened; // a stuck write: the deadline must fire first
    }
    return realInsert(doc);
  }) as typeof facts.insertOne;
  const diff = { studentId: a.studentId, summary: a.marker, changes: [], citedFactIds: [] };
  const started = Date.now();
  const err = await applyApprovedDiff(
    db,
    diff,
    { approve: true, edits: [fact("slow", `${a.marker}-slow`, "t-slow")] },
    a.sessionIds[0],
    { deadlineMs: 40 },
  ).catch((e: unknown) => e);
  assert.ok(err instanceof FencedWriterDeadlineError, `expected FencedWriterDeadlineError, got ${String(err)}`);
  assert.ok(Date.now() - started < 2000, "aborted at the deadline, not when the stuck write finished");
  assert.ok(
    seenTimeouts.length > 0 && seenTimeouts.every((t) => typeof t === "number" && t > 0 && t <= 40),
    `every insert carried timeoutMS <= deadline, got ${JSON.stringify(seenTimeouts)}`,
  );
  g.open(); // the stuck insert lands after the abort
  await err.settled;
  assert.equal(lateIds.length, 1);
  assert.deepEqual(docsMentioning(fakeDb, [...lateIds, `${a.marker}-slow`]), [], "the late-landing write was compensated");
  await assert.rejects(
    applyApprovedDiff(db, diff, { approve: true, edits: [fact("x", 1, "t-x")] }, undefined, { deadlineMs: FENCED_WRITER_DEADLINE_MS + 1 }),
    RangeError,
    "a writer can not opt into a deadline longer than the fence hold covers",
  );
});

test("D-016 finally post-check: an unrelated error mid-write still runs the post-check; when fenced it compensates and StudentFencedError carries the original error as `cause` (ISS-t-011-c2-rev-3)", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const edges = coll(fakeDb, COLLECTION_NAMES.edges);
  const realUpdate = edges.updateOne.bind(edges);
  const boom = Object.assign(new Error("network"), { name: "MongoNetworkError" });
  let factId = "";
  edges.updateOne = async () => {
    // the fact is inserted; the erasure is confirmed now; then the edge write fails
    factId = coll(fakeDb, COLLECTION_NAMES.facts).all().find((f) => f.key === "mid")!._id;
    await confirmedRequest(db, a.studentId);
    throw boom;
  };
  const diff = { studentId: a.studentId, summary: a.marker, changes: [], citedFactIds: [] };
  const err = await applyApprovedDiff(db, diff, { approve: true, edits: [fact("mid", `${a.marker}-mid`, "t-mid")] }, a.sessionIds[0]).catch(
    (e: unknown) => e,
  );
  edges.updateOne = realUpdate;
  assert.ok(err instanceof StudentFencedError, `expected StudentFencedError, got ${String(err)}`);
  const chain: unknown[] = [];
  for (let c: unknown = (err as Error & { cause?: unknown }).cause; c !== undefined; c = (c as { cause?: unknown }).cause) chain.push(c);
  assert.ok(chain.includes(boom), "the original error is chained as `cause` (here wrapped in PartialApplyError), not masked");
  assert.ok(factId);
  assert.deepEqual(docsMentioning(fakeDb, [factId]), [], "the inserted fact was compensated");
});

test("D-016 lows (ISS-t-011-c2-rev-3): the fenced undo removes ONLY edges this call created, never pre-existing deterministic edges (idempotent replay)", async () => {
  const { db, fakeDb, a } = await seedTwo();
  // Replay the exact session-1 budget write: the fact is already open, its edges already exist.
  const diff = { studentId: a.studentId, summary: a.marker, changes: [], citedFactIds: [] };
  const edges = coll(fakeDb, COLLECTION_NAMES.edges);
  const before = edges.all().map((e) => e._id).sort();
  const realUpdate = edges.updateOne.bind(edges);
  let fenced = false;
  edges.updateOne = async (f, u, o) => {
    if (!fenced) {
      fenced = true;
      await confirmedRequest(db, a.studentId); // the fence appears mid-write
    }
    return realUpdate(f, u, o);
  };
  const err = await applyApprovedDiff(db, diff, { approve: true, edits: [fact("budget", `${a.marker}-20L`, "t2")] }, a.sessionIds[0]).catch(
    (e: unknown) => e,
  );
  edges.updateOne = realUpdate;
  assert.ok(err instanceof StudentFencedError, `expected StudentFencedError, got ${String(err)}`);
  assert.deepEqual(edges.all().map((e) => e._id).sort(), before, "no pre-existing edge was deleted by the undo");
});

// ---------------------------------------------------------------------------
// T-014 / ISS-t-011-c3-rev-1: an AMBIGUOUS linkTracked outcome (link() itself throws — e.g. a
// timeout where the write may or may not have landed) must never let the fenced undo delete a
// pre-existing edge this call did not create. The sibling test above ("D-016 lows") only covers
// link() completing NORMALLY on a replay (onCreated correctly never fires); these two cover the
// case the c3 review actually flagged: link() throwing, which unconditionally added the
// deterministic id to createdEdgeIds before the writerToken fix.
// ---------------------------------------------------------------------------

test("T-014/ISS-t-011-c3-rev-1: a PRE-EXISTING edge survives even when THIS call's link() to it throws (ambiguous outcome), because it lacks this call's writerToken", async () => {
  const { db, fakeDb, a } = await seedTwo();
  // Replay the exact session-1 budget write: the fact and its two edges already exist on disk
  // (written by seedStudent's earlier, DIFFERENT applyApprovedDiff call, with ITS OWN writerToken).
  const diff = { studentId: a.studentId, summary: a.marker, changes: [], citedFactIds: [] };
  const edges = coll(fakeDb, COLLECTION_NAMES.edges);
  const before = edges.all().map((e) => JSON.stringify(e)).sort();
  const realUpdate = edges.updateOne.bind(edges);
  let thrown = false;
  edges.updateOne = async (f, u, o) => {
    const res = await realUpdate(f, u, o); // the no-op update against the pre-existing doc really runs
    if (!thrown) {
      thrown = true;
      await confirmedRequest(db, a.studentId); // the fence appears mid-write, as in the sibling test
      // Simulate an ambiguous outcome: the server applied the (no-op) update, but the client never
      // saw the acknowledgement (e.g. a timeout). link() propagates this; linkTracked can not tell
      // "I just created this" from "someone else's edge, already there" by the deterministic id alone.
      throw Object.assign(new Error("simulated network timeout"), { name: "MongoServerSelectionError" });
    }
    return res;
  };
  const err = await applyApprovedDiff(db, diff, { approve: true, edits: [fact("budget", `${a.marker}-20L`, "t2")] }, a.sessionIds[0]).catch(
    (e: unknown) => e,
  );
  edges.updateOne = realUpdate;
  assert.ok(err instanceof StudentFencedError, `expected StudentFencedError, got ${String(err)}`);
  assert.deepEqual(
    edges.all().map((e) => JSON.stringify(e)).sort(),
    before,
    "a pre-existing edge must survive an ambiguous (thrown) link() outcome — the writerToken scope on the undo must exclude it",
  );
});

test("T-014/ISS-t-011-c3-rev-1: an edge THIS call actually created is still removed by the fenced undo, even though link()'s own outcome to it was ambiguous", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const diff = { studentId: a.studentId, summary: a.marker, changes: [], citedFactIds: [] };
  const edges = coll(fakeDb, COLLECTION_NAMES.edges);
  const before = edges.all().map((e) => e._id).sort();
  const realUpdate = edges.updateOne.bind(edges);
  let thrown = false;
  edges.updateOne = async (f, u, o) => {
    const res = await realUpdate(f, u, o); // the edge is genuinely CREATED here (writerToken stamped)
    if (!thrown) {
      thrown = true;
      await confirmedRequest(db, a.studentId);
      throw Object.assign(new Error("simulated network timeout"), { name: "MongoServerSelectionError" });
    }
    return res;
  };
  const err = await applyApprovedDiff(
    db,
    diff,
    { approve: true, edits: [fact("rev1-new-key", `${a.marker}-rev1-new`, "t-rev1")] },
    a.sessionIds[0],
  ).catch((e: unknown) => e);
  edges.updateOne = realUpdate;
  assert.ok(err instanceof StudentFencedError, `expected StudentFencedError, got ${String(err)}`);
  assert.deepEqual(
    edges.all().map((e) => e._id).sort(),
    before,
    "the edge this call actually created (with an ambiguous outcome) must still be removed by the undo",
  );
  assert.deepEqual(docsMentioning(fakeDb, [`${a.marker}-rev1-new`]), [], "the new fact was compensated too");
});

test("D-016 one open request (ISS-t-011-c2-rev-4): a second open request for the same student is refused with a typed error, also under concurrency; after completion a new one is allowed", async () => {
  const { db, fakeDb, a, b } = await seedTwo();
  const input = { studentId: a.studentId, requestedBy: "counsellor-7", reason: "student_request" as const };
  const settled = await Promise.allSettled([requestErasure(db, input), requestErasure(db, input)]);
  const ok = settled.filter((s) => s.status === "fulfilled");
  const refused = settled.filter((s) => s.status === "rejected") as PromiseRejectedResult[];
  assert.equal(ok.length, 1, "exactly one concurrent request wins");
  assert.equal(refused.length, 1);
  assert.ok(refused[0]!.reason instanceof ErasureRequestAlreadyOpenError, `typed refusal, got ${String(refused[0]!.reason)}`);
  const rows = coll(fakeDb, COLLECTION_NAMES.erasure_requests).all();
  assert.equal(rows.length, 1, "only one open row");
  assert.equal(rows[0]!.studentKey, erasureFenceKey(a.studentId));
  // Another student is independent.
  await requestErasure(db, { ...input, studentId: b.studentId });
  // confirmed stays open: still refused.
  const requestId = (ok[0] as PromiseFulfilledResult<{ requestId: string }>).value.requestId;
  await confirmErasure(db, { requestId, confirmedBy: "admin-2" });
  await assert.rejects(requestErasure(db, input), ErasureRequestAlreadyOpenError);
  await executeErasure(db, requestId);
  const done = await requestRow(fakeDb, requestId);
  assert.equal(done.status, "completed");
  assert.equal((done as unknown as { studentKey?: string }).studentKey, undefined, "the completed audit row keeps no unsalted key");
  const again = await requestErasure(db, input);
  assert.ok(again.requestId, "a completed request no longer blocks a new one");
});

test("D-016 no stuck fence (ISS-t-011-c2-rev-4): the fence is released only when no fencing request remains, and never left behind", async () => {
  const { db, fakeDb, a } = await seedTwo();
  const fences = coll(fakeDb, FENCES);
  const r1 = await confirmedRequest(db, a.studentId);
  await executeErasure(db, r1);
  const hold1 = Date.parse(fences.all()[0]!.releaseAfter as string);
  // A new request is confirmed inside R1's hold: it re-arms (takes over) the same fence.
  const r2 = await confirmedRequest(db, a.studentId);
  assert.equal(fences.all()[0]!.requestId, r2);
  assert.equal(fences.all()[0]!.releaseAfter, undefined, "re-armed: no release while R2 is open");
  assert.equal(await releaseExpiredErasureFences(db, new Date(hold1 + 1)), 0, "R2 is open: never swept");
  // Even a fence stamped for release is kept while the student still has an open request.
  await fences.updateOne({ _id: erasureFenceKey(a.studentId) }, { $set: { requestId: r1, releaseAfter: new Date(hold1).toISOString() } });
  assert.equal(await releaseExpiredErasureFences(db, new Date(hold1 + 1)), 0, "an open request for the student keeps the fence");
  await fences.updateOne({ _id: erasureFenceKey(a.studentId) }, { $set: { requestId: r2 }, $unset: { releaseAfter: "" } });
  await executeErasure(db, r2);
  const holdEnd = Date.parse(fences.all()[0]!.releaseAfter as string);
  assert.equal(await releaseExpiredErasureFences(db, new Date(holdEnd)), 1);
  assert.equal(fences.size(), 0, "no fence is stuck once no request is open");
});

// ---------------------------------------------------------------------------
// T-014 / ISS-t-011-c3-rev-3: releaseExpiredErasureFences finally gets a scheduled caller.
// ---------------------------------------------------------------------------

test("T-014/ISS-t-011-c3-rev-3: startErasureFenceSweep's timer actually releases an expired fence, and stop() actually stops it (fake timers)", async () => {
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    const { db, fakeDb, a } = await seedTwo();
    const fences = coll(fakeDb, FENCES);
    const errors: unknown[] = [];
    const sweep = startErasureFenceSweep(db, { intervalMs: 1000, onError: (err) => errors.push(err) });
    try {
      // Seed a fence that is already eligible for release: no erasure_requests row references it
      // (hasFencingRequest is false), createdAt is long past its minimum hold, and releaseAfter is
      // already in the past.
      const longAgo = new Date(Date.now() - MINIMUM_FENCE_HOLD_MS - 60_000).toISOString();
      fences.seed({ _id: erasureFenceKey(a.studentId), studentKey: erasureFenceKey(a.studentId), requestId: "r-gone", createdAt: longAgo, releaseAfter: longAgo });
      assert.equal(fences.size(), 1, "the fence is seeded before the first tick");

      mock.timers.tick(1000); // fires the first tick synchronously; the tick's own work is async
      await new Promise((resolve) => setTimeout(resolve, 0)); // let the tick's promise chain settle (real macrotask; setInterval alone is faked)
      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.equal(fences.size(), 0, "the scheduled sweep released the expired fence");
      assert.deepEqual(errors, [], "no errors from a clean tick");
    } finally {
      sweep.stop();
    }

    // stop() must actually stop it: reseed and advance well past several more intervals.
    const longAgo2 = new Date(Date.now() - MINIMUM_FENCE_HOLD_MS - 60_000).toISOString();
    fences.seed({ _id: erasureFenceKey(a.studentId), studentKey: erasureFenceKey(a.studentId), requestId: "r-gone-2", createdAt: longAgo2, releaseAfter: longAgo2 });
    mock.timers.tick(10_000);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(fences.size(), 1, "stop() must have cleared the interval: no further sweeps run");

    // Idempotent.
    assert.doesNotThrow(() => sweep.stop());
  } finally {
    mock.timers.reset();
  }
});

test("T-014/ISS-t-011-c3-rev-3: startErasureFenceSweep rejects a non-positive intervalMs", () => {
  const { db } = createFakeDb();
  assert.throws(() => startErasureFenceSweep(db, { intervalMs: 0 }), RangeError);
  assert.throws(() => startErasureFenceSweep(db, { intervalMs: -5 }), RangeError);
});

test("T-014/ISS-t-011-c3-rev-3: a failing tick is reported via onError, not thrown, and does not stop the interval", async () => {
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    const { db, fakeDb, a } = await seedTwo();
    const fences = coll(fakeDb, FENCES);
    const boom = new Error("simulated sweep read failure");
    const realFind = fences.find.bind(fences);
    let calls = 0;
    fences.find = (f?: Record<string, unknown>) => {
      calls += 1;
      if (calls === 1) throw boom;
      return realFind(f);
    };
    const errors: unknown[] = [];
    const sweep = startErasureFenceSweep(db, { intervalMs: 1000, onError: (err) => errors.push(err) });
    try {
      const longAgo = new Date(Date.now() - MINIMUM_FENCE_HOLD_MS - 60_000).toISOString();
      fences.seed({ _id: erasureFenceKey(a.studentId), studentKey: erasureFenceKey(a.studentId), requestId: "r-gone", createdAt: longAgo, releaseAfter: longAgo });

      mock.timers.tick(1000); // this tick's read throws synchronously inside releaseExpiredErasureFences's for-await
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(errors.length, 1, "the failing tick's error reached onError");
      assert.equal(errors[0], boom);
      assert.equal(fences.size(), 1, "nothing was released on the failing tick");

      mock.timers.tick(1000); // the NEXT tick still runs (a fake with no more scripted failures)
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(fences.size(), 0, "a later tick recovers and releases the fence — one bad tick did not kill the interval");
    } finally {
      sweep.stop();
    }
  } finally {
    mock.timers.reset();
  }
});

test("ISS-t-015-c0-3: an onError that itself throws does not produce an unhandledRejection, and the interval keeps running", async () => {
  mock.timers.enable({ apis: ["setInterval"] });
  const unhandled: unknown[] = [];
  const onUnhandledRejection = (err: unknown) => unhandled.push(err);
  process.on("unhandledRejection", onUnhandledRejection);
  try {
    const { db, fakeDb, a } = await seedTwo();
    const fences = coll(fakeDb, FENCES);
    const boom = new Error("simulated sweep read failure");
    const realFind = fences.find.bind(fences);
    let calls = 0;
    fences.find = (f?: Record<string, unknown>) => {
      calls += 1;
      if (calls === 1) throw boom;
      return realFind(f);
    };
    const sweep = startErasureFenceSweep(db, {
      intervalMs: 1000,
      onError: () => {
        throw new Error("onError itself is broken (must never happen per the docstring, but must not crash the process either)");
      },
    });
    try {
      const longAgo = new Date(Date.now() - MINIMUM_FENCE_HOLD_MS - 60_000).toISOString();
      fences.seed({ _id: erasureFenceKey(a.studentId), studentKey: erasureFenceKey(a.studentId), requestId: "r-gone", createdAt: longAgo, releaseAfter: longAgo });

      mock.timers.tick(1000); // the failing tick; its onError throws
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      // A real unhandledRejection fires on a later turn of the microtask/macrotask queue; give it a
      // chance to surface before asserting it did not.
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(unhandled.length, 0, "a broken onError must not produce a process-level unhandledRejection");
      assert.equal(fences.size(), 1, "nothing released on the failing tick");

      mock.timers.tick(1000); // the interval must still be alive despite the broken onError
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(fences.size(), 0, "a later, non-failing tick still recovers — the broken onError did not kill the interval");
    } finally {
      sweep.stop();
    }
  } finally {
    process.off("unhandledRejection", onUnhandledRejection);
    mock.timers.reset();
  }
});

test("ISS-t-017-rev-2: an ASYNC onError whose returned promise rejects (not a synchronous throw) does not produce an unhandledRejection, and the interval keeps running", async () => {
  mock.timers.enable({ apis: ["setInterval"] });
  const unhandled: unknown[] = [];
  const onUnhandledRejection = (err: unknown) => unhandled.push(err);
  process.on("unhandledRejection", onUnhandledRejection);
  try {
    const { db, fakeDb, a } = await seedTwo();
    const fences = coll(fakeDb, FENCES);
    const boom = new Error("simulated sweep read failure");
    const realFind = fences.find.bind(fences);
    let calls = 0;
    fences.find = (f?: Record<string, unknown>) => {
      calls += 1;
      if (calls === 1) throw boom;
      return realFind(f);
    };
    const sweep = startErasureFenceSweep(db, {
      intervalMs: 1000,
      // ISS-t-017-rev-2: rejects on a LATER microtask, not synchronously — the realistic shape of an
      // onError that awaits its own logging call (e.g. `await logToService(err)`). A plain
      // `try { onError(err) } catch {}` (the ISS-t-015-c0-3 fix) can not catch this: the call itself
      // returns a promise without throwing, and the rejection surfaces afterwards.
      onError: async () => {
        await Promise.resolve();
        throw new Error("async onError's own promise rejects (must never happen per the docstring, but must not crash the process either)");
      },
    });
    try {
      const longAgo = new Date(Date.now() - MINIMUM_FENCE_HOLD_MS - 60_000).toISOString();
      fences.seed({ _id: erasureFenceKey(a.studentId), studentKey: erasureFenceKey(a.studentId), requestId: "r-gone", createdAt: longAgo, releaseAfter: longAgo });

      mock.timers.tick(1000); // the failing tick; its async onError's returned promise rejects later
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      // A real unhandledRejection fires on a later turn of the microtask/macrotask queue; give it a
      // chance to surface before asserting it did not.
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(unhandled.length, 0, "an async onError's rejection must not produce a process-level unhandledRejection");
      assert.equal(fences.size(), 1, "nothing released on the failing tick");

      mock.timers.tick(1000); // the interval must still be alive despite the broken async onError
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(fences.size(), 0, "a later, non-failing tick still recovers — the broken async onError did not kill the interval");
    } finally {
      sweep.stop();
    }
  } finally {
    process.off("unhandledRejection", onUnhandledRejection);
    mock.timers.reset();
  }
});

test("ISS-t-017-rev-3: an onError that returns a NEVER-SETTLING promise does not stall the sweep — a LATER tick still runs and releases an expired fence", async () => {
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    const { db, fakeDb, a } = await seedTwo();
    const fences = coll(fakeDb, FENCES);
    const boom = new Error("simulated sweep read failure");
    const realFind = fences.find.bind(fences);
    let calls = 0;
    fences.find = (f?: Record<string, unknown>) => {
      calls += 1;
      if (calls === 1) throw boom;
      return realFind(f);
    };
    let onErrorCalls = 0;
    const sweep = startErasureFenceSweep(db, {
      intervalMs: 1000,
      // ISS-t-017-rev-3: never resolves NOR rejects — the realistic shape of an onError that awaits
      // an unbounded fetch/HTTP call to a logging/alerting endpoint with no internal timeout. A fix
      // that ADOPTS this promise into tick()'s own chain (so `.finally` waits for it) makes `inFlight`
      // never reset, silently no-op'ing every later tick forever — the exact bug this test targets.
      onError: () => {
        onErrorCalls += 1;
        return new Promise<void>(() => {
          /* never settles */
        });
      },
    });
    try {
      const longAgo = new Date(Date.now() - MINIMUM_FENCE_HOLD_MS - 60_000).toISOString();
      fences.seed({ _id: erasureFenceKey(a.studentId), studentKey: erasureFenceKey(a.studentId), requestId: "r-gone", createdAt: longAgo, releaseAfter: longAgo });

      mock.timers.tick(1000); // the failing tick; its onError never settles
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(onErrorCalls, 1, "onError was called once for the failing tick");
      assert.equal(fences.size(), 1, "nothing released on the failing tick");

      // Several LATER ticks must still run — the in-flight guard must have reset even though the
      // first tick's onError promise is still pending and will NEVER settle.
      for (let i = 0; i < 4; i += 1) {
        mock.timers.tick(1000);
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      assert.equal(fences.size(), 0, "a later tick recovered and released the expired fence — the never-settling onError did not stall the sweep");
      assert.equal(onErrorCalls, 1, "the never-settling onError is not re-invoked by later, non-failing ticks");
    } finally {
      sweep.stop();
    }
  } finally {
    mock.timers.reset();
  }
});

test("ISS-t-017-rev-3: onError returning a THENABLE (not a native Promise) that never resolves does not stall the sweep either", async () => {
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    const { db, fakeDb, a } = await seedTwo();
    const fences = coll(fakeDb, FENCES);
    const boom = new Error("simulated sweep read failure");
    const realFind = fences.find.bind(fences);
    let calls = 0;
    fences.find = (f?: Record<string, unknown>) => {
      calls += 1;
      if (calls === 1) throw boom;
      return realFind(f);
    };
    const sweep = startErasureFenceSweep(db, {
      intervalMs: 1000,
      // A thenable, not a native Promise: `.then` is called by the runtime's own promise machinery
      // if this value is adopted, but here `onError`'s own return value is never adopted by tick()'s
      // chain at all, so it makes no difference whether `then` is ever invoked.
      onError: () => ({ then: () => undefined }) as unknown as Promise<void>,
    });
    try {
      const longAgo = new Date(Date.now() - MINIMUM_FENCE_HOLD_MS - 60_000).toISOString();
      fences.seed({ _id: erasureFenceKey(a.studentId), studentKey: erasureFenceKey(a.studentId), requestId: "r-gone", createdAt: longAgo, releaseAfter: longAgo });

      mock.timers.tick(1000);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(fences.size(), 1, "nothing released on the failing tick");

      mock.timers.tick(1000); // the next tick must not be silently skipped
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(fences.size(), 0, "a later tick recovered — a never-resolving thenable did not stall the sweep");
    } finally {
      sweep.stop();
    }
  } finally {
    mock.timers.reset();
  }
});

test("ISS-t-017-rev-3: a non-function onError does not crash tick() or stall the sweep", async () => {
  mock.timers.enable({ apis: ["setInterval"] });
  const unhandled: unknown[] = [];
  const onUnhandledRejection = (err: unknown) => unhandled.push(err);
  process.on("unhandledRejection", onUnhandledRejection);
  try {
    const { db, fakeDb, a } = await seedTwo();
    const fences = coll(fakeDb, FENCES);
    const boom = new Error("simulated sweep read failure");
    const realFind = fences.find.bind(fences);
    let calls = 0;
    fences.find = (f?: Record<string, unknown>) => {
      calls += 1;
      if (calls === 1) throw boom;
      return realFind(f);
    };
    const sweep = startErasureFenceSweep(db, {
      intervalMs: 1000,
      // A caller can defeat the static type at runtime (a plain object, JS, or a mis-typed value).
      // options.onError?.(err) throws a TypeError calling a non-function; that must be absorbed like
      // any other onError failure, not surface as an unhandledRejection or stall the interval.
      onError: "not-a-function" as unknown as (err: unknown) => void,
    });
    try {
      const longAgo = new Date(Date.now() - MINIMUM_FENCE_HOLD_MS - 60_000).toISOString();
      fences.seed({ _id: erasureFenceKey(a.studentId), studentKey: erasureFenceKey(a.studentId), requestId: "r-gone", createdAt: longAgo, releaseAfter: longAgo });

      mock.timers.tick(1000);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(unhandled.length, 0, "a non-function onError must not produce a process-level unhandledRejection");
      assert.equal(fences.size(), 1, "nothing released on the failing tick");

      mock.timers.tick(1000); // the next tick must not be silently skipped
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(fences.size(), 0, "a later tick recovered — a non-function onError did not stall the sweep");
    } finally {
      sweep.stop();
    }
  } finally {
    process.off("unhandledRejection", onUnhandledRejection);
    mock.timers.reset();
  }
});

test("T-015/ISS-t-014-rev-4: an in-flight tick is not overlapped by the next scheduled tick; a tick AFTER the previous one finished is not skipped", async () => {
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    const { db, fakeDb, a } = await seedTwo();
    const fences = coll(fakeDb, FENCES);
    const realFind = fences.find.bind(fences);
    const g = gate();
    let findCalls = 0;
    // Tick 1's read is stuck until the gate opens; every later call resolves immediately.
    fences.find = (f?: Record<string, unknown>) => {
      findCalls += 1;
      const isFirst = findCalls === 1;
      return {
        toArray: async () => {
          if (isFirst) await g.opened;
          return realFind(f).toArray();
        },
      };
    };
    const sweep = startErasureFenceSweep(db, { intervalMs: 1000 });
    try {
      mock.timers.tick(1000); // fires tick 1; its releaseExpiredErasureFences is now stuck on g.opened
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(findCalls, 1, "tick 1 started");

      mock.timers.tick(1000); // fires tick 2 WHILE tick 1 is still in flight
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(findCalls, 1, "tick 2 was skipped: tick 1 had not finished yet (no overlap)");

      g.open(); // let tick 1 finish
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      mock.timers.tick(1000); // fires tick 3, AFTER tick 1 has finished
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(findCalls, 2, "a tick scheduled after the previous one finished is NOT skipped");
    } finally {
      sweep.stop();
      fences.find = realFind;
    }
  } finally {
    mock.timers.reset();
  }
});

test("D-016 deadline: the post-check runs AT the abort (in the finally), not only when the stuck op settles: a fact that landed before the stuck edge write is already gone when the writer returns", { timeout: 5000 }, async () => {
  const { db, fakeDb, a } = await seedTwo();
  const edges = coll(fakeDb, COLLECTION_NAMES.edges);
  const realUpdate = edges.updateOne.bind(edges);
  const g = gate();
  edges.updateOne = async (f, u, o) => {
    await g.opened; // the first edge write is stuck; the fact insert already landed
    return realUpdate(f, u, o);
  };
  const diff = { studentId: a.studentId, summary: a.marker, changes: [], citedFactIds: [] };
  const err = await applyApprovedDiff(
    db,
    diff,
    { approve: true, edits: [fact("stuck-edge", `${a.marker}-stuck-edge`, "t-se")] },
    a.sessionIds[0],
    { deadlineMs: 40 },
  ).catch((e: unknown) => e);
  assert.ok(err instanceof FencedWriterDeadlineError, `expected FencedWriterDeadlineError, got ${String(err)}`);
  assert.deepEqual(
    docsMentioning(fakeDb, [`${a.marker}-stuck-edge`]),
    [],
    "the fact was undone by the post-check at the abort, before the stuck edge write settled",
  );
  g.open();
  await err.settled;
  edges.updateOne = realUpdate;
  assert.deepEqual(docsMentioning(fakeDb, [`${a.marker}-stuck-edge`]), []);
  assert.deepEqual(orphanFactEdges(fakeDb), [], "the edge that landed late was undone too");
});

// ---------------------------------------------------------------------------
// T-016 / ISS-t-011-rev-5: a session row's recorded scribe threads (any thread id, not only
// scribe:<sessionId>) are purged and exported.
// ---------------------------------------------------------------------------

test("ISS-t-011-rev-5: checkpoints of a thread recorded on the session row (NOT scribe:<sessionId>) are exported and purged to zero", async () => {
  const { db, fakeDb } = setup();
  const thread = "custom-thread-77";
  coll(fakeDb, COLLECTION_NAMES.sessions).seed({
    _id: "sess-x",
    sessionId: "sess-x",
    studentId: "stu-X",
    scribeThreadIds: [thread],
    summary: "approved summary marker-X",
  });
  coll(fakeDb, "scribe_checkpoints").seed({ _id: `${thread}|c1`, thread_id: thread, checkpoint_ns: "", checkpoint_id: "c1", checkpoint: "transcript" });
  coll(fakeDb, "scribe_checkpoint_writes").seed({
    _id: `${thread}|c1|w`,
    thread_id: thread,
    checkpoint_ns: "",
    checkpoint_id: "c1",
    task_id: "t",
    idx: 0,
    value: "w",
  });
  const exported = await exportStudent(db, "stu-X");
  assert.ok(exported.checkpoints.threads.includes(thread));
  assert.equal(exported.checkpoints.checkpointDocs, 1);
  assert.equal(exported.checkpoints.writeDocs, 1);
  assert.equal(exported.sessions[0]?.summary, "approved summary marker-X", "export carries the approved summary");
  const requestId = await confirmedRequest(db, "stu-X");
  const out = await executeErasure(db, requestId, { fenceGraceMs: 0 });
  assert.equal(out.status, "completed");
  assert.deepEqual(docsMentioning(fakeDb, ["stu-X", "sess-x", thread, "marker-X"]), []);
});
