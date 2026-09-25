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
import { test } from "node:test";
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
  type ErasureRequestDoc,
} from "../src/erasure.js";
import { applyApprovedDiff } from "../src/facts.js";
import { COLLECTION_NAMES, type FactDoc } from "../src/collections.js";
import { INDEX_PLAN } from "../scripts/db-init.js";
import { createFakeDb, type FakeDb, type FakeCollection } from "./fakes.js";
import { ErasureReceiptSchema, type Fact } from "@vc/schemas";

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
    [COLLECTION_NAMES.edges]: 6, // 3 facts x (sourced_from + has)
  };
  assert.equal(a.factIds.length, 3);
  const requestId = await confirmedRequest(db, a.studentId);
  const { receipt } = await executeErasure(db, requestId);
  const byName = Object.fromEntries(receipt.collections.map((l) => [l.collection, l.deleted]));
  assert.deepEqual(byName, expected);
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
