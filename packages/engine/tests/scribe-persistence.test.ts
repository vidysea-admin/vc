/**
 * T-016: scribe persistence prerequisites for T-008 (outcome-proven, B14). Every assertion reads
 * the fake collections back. "mongo" runs use the REAL LangGraph MongoDBSaver class
 * (createScribeCheckpointer) over the in-process fake db with every production unique index, so
 * checkpoints really land in scribe_checkpoints / scribe_checkpoint_writes.
 *
 *   - ISS-t-011-rev-5: a session row (with the thread id) is written BEFORE the first checkpoint, so a
 *     run that ends WITHOUT an interrupt is found by export and erased to zero residue.
 *   - ISS-t-007-rev-7: the approved summary is stored durably on the session row; export and
 *     erasure cover it.
 *   - ISS-t-007-rev-9: a claim is never written with an empty studentId.
 *   - ISS-t-007-rev-10: resumeScribe(null) recovery takes the claim's lease (D-014 claim doc), so two
 *     concurrent recoveries, or a recovery racing an in-flight winner, invoke the graph exactly once.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLLECTION_NAMES,
  confirmErasure,
  executeErasure,
  exportStudent,
  requestErasure,
  type ScribeResolutionDoc,
  type SessionDoc,
} from "@vc/db";
import { resumeScribe, startScribe, type ScribeOutcome } from "../src/scribe/index.js";
import {
  baseInput,
  DEFAULT_SUMMARY,
  makeHarness,
  mockProvider,
  SESSION_ID,
  STUDENT_ID,
  type Harness,
} from "./scribe-fixtures.js";

type AnyDoc = { _id: string } & Record<string, unknown>;
const SAVERS = ["memory", "mongo"] as const;

function sessions(h: Harness) {
  return h.fakeDb.collection<SessionDoc & AnyDoc>(COLLECTION_NAMES.sessions);
}
function claims(h: Harness) {
  return h.fakeDb.collection<ScribeResolutionDoc & AnyDoc>(COLLECTION_NAMES.scribe_resolutions);
}
function checkpointDocs(h: Harness, threadId: string): number {
  return (
    h.fakeDb.collection<AnyDoc>(COLLECTION_NAMES.scribe_checkpoints).all().filter((d) => d.thread_id === threadId).length +
    h.fakeDb.collection<AnyDoc>(COLLECTION_NAMES.scribe_checkpoint_writes).all().filter((d) => d.thread_id === threadId).length
  );
}

/** Every doc in every engine collection (except the audit log) that mentions one of `needles`. */
function residue(h: Harness, needles: string[]): string[] {
  const hits: string[] = [];
  for (const name of Object.values(COLLECTION_NAMES)) {
    if (name === COLLECTION_NAMES.erasure_requests) continue;
    for (const doc of h.fakeDb.collection<AnyDoc>(name).all()) {
      const json = JSON.stringify(doc);
      if (needles.some((n) => json.includes(n))) hits.push(`${name}:${doc._id}`);
    }
  }
  return hits;
}

async function erase(h: Harness) {
  const { requestId } = await requestErasure(h.db, { studentId: STUDENT_ID, requestedBy: "counsellor-7", reason: "student_request" });
  await confirmErasure(h.db, { requestId, confirmedBy: "admin-2" });
  return executeErasure(h.db, requestId, { fenceGraceMs: 0 });
}

/** Counts graph.invoke calls from now on (the unit ISS-t-007-rev-10 is about). */
function countInvokes(h: Harness): { count: () => number } {
  const real = h.graph.invoke.bind(h.graph);
  let n = 0;
  (h.graph as unknown as { invoke: unknown }).invoke = async (...args: Parameters<typeof real>) => {
    n += 1;
    return real(...args);
  };
  return { count: () => n };
}

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

// ---------------------------------------------------------------------------
// ISS-t-011-rev-5: session row before the first checkpoint
// ---------------------------------------------------------------------------

for (const saver of SAVERS) {
  test(`ISS-t-011-rev-5 [${saver}]: the session row (with its thread id) exists BEFORE the first checkpoint is written`, async () => {
    const h = makeHarness({ saver });
    const seenAtFirstPut: Array<SessionDoc | null> = [];
    const cp = h.checkpointer as unknown as { put: (...a: unknown[]) => Promise<unknown> };
    const realPut = cp.put.bind(cp);
    cp.put = async (...args: unknown[]) => {
      if (seenAtFirstPut.length === 0) seenAtFirstPut.push(await sessions(h).findOne({ _id: SESSION_ID }));
      return realPut(...args);
    };
    const outcome = await startScribe(h.graph, baseInput(), { threadId: "thread-order" });
    assert.equal(outcome.kind, "awaiting_approval");
    assert.equal(seenAtFirstPut.length, 1, "the checkpointer was called");
    const row = seenAtFirstPut[0];
    assert.ok(row, "a session row must exist before the first checkpoint");
    assert.equal(row.studentId, STUDENT_ID);
    assert.equal(row.sessionId, SESSION_ID);
    assert.deepEqual(row.scribeThreadIds, ["thread-order"]);
  });
}

for (const [label, harness] of [
  ["consent refused", () => makeHarness({ saver: "mongo", consent: false })],
  ["crisis escalated", () => makeHarness({ saver: "mongo" })],
] as const) {
  test(`ISS-t-011-rev-5 [mongo, ${label}]: a run that ends WITHOUT an interrupt is exported and erased to zero residue (checkpoints included)`, async () => {
    const h = harness();
    const threadId = "thread-no-interrupt"; // deliberately NOT scribeThreadId(sessionId)
    const input =
      label === "crisis escalated"
        ? baseInput({
            turns: [
              { turnId: "t1", speaker: "student", lang: "en", text: "I want to kill myself.", translatedText: "I want to kill myself.", ts: 1 },
            ],
          })
        : baseInput();
    const outcome = await startScribe(h.graph, input, { threadId });
    assert.equal(outcome.kind, "done", "the run ended without an interrupt");
    assert.ok(checkpointDocs(h, threadId) > 0, "the real MongoDBSaver wrote checkpoints for the thread");

    const exported = await exportStudent(h.db, STUDENT_ID);
    assert.ok(exported.checkpoints.threads.includes(threadId), "export finds the thread through the session row");
    assert.equal(
      exported.checkpoints.checkpointDocs + exported.checkpoints.writeDocs,
      checkpointDocs(h, threadId),
      "export counts every checkpoint doc of the thread",
    );
    assert.equal(exported.sessions.length, 1);

    const erased = await erase(h);
    assert.equal(erased.status, "completed");
    assert.deepEqual(residue(h, [STUDENT_ID, SESSION_ID, threadId]), [], "zero residue after erasure");
    assert.equal(checkpointDocs(h, threadId), 0);
  });
}

test("ISS-t-011-rev-5: a second run of the same session on a NEW thread adds that thread to the row (both erased)", async () => {
  const h = makeHarness({ saver: "mongo" });
  await startScribe(h.graph, baseInput(), { threadId: "thread-a" });
  await startScribe(h.graph, baseInput(), { threadId: "thread-b" });
  const row = await sessions(h).findOne({ _id: SESSION_ID });
  assert.deepEqual(row?.scribeThreadIds, ["thread-a", "thread-b"]);
  assert.equal(sessions(h).size(), 1, "one row per session");
  await erase(h);
  assert.deepEqual(residue(h, [STUDENT_ID, SESSION_ID, "thread-a", "thread-b"]), []);
});

test("ISS-t-011-rev-5 hostile: a sessionId already owned by ANOTHER student is refused before any checkpoint (no hijack of the row)", async () => {
  const h = makeHarness({ saver: "mongo" });
  sessions(h).seed({ _id: SESSION_ID, sessionId: SESSION_ID, studentId: "student-other" } as SessionDoc & AnyDoc);
  await assert.rejects(startScribe(h.graph, baseInput(), { threadId: "thread-hijack" }), (err: unknown) => (err as { code?: number }).code === 11000);
  assert.equal(checkpointDocs(h, "thread-hijack"), 0, "no checkpoint written");
  const row = await sessions(h).findOne({ _id: SESSION_ID });
  assert.equal(row?.studentId, "student-other", "the other student's row is untouched");
  assert.equal(row?.scribeThreadIds, undefined);
});

// ---------------------------------------------------------------------------
// ISS-t-007-rev-7: durable approved summary
// ---------------------------------------------------------------------------

for (const saver of SAVERS) {
  test(`ISS-t-007-rev-7 [${saver}]: approve stores the approved summary on the session row; export carries it; erasure removes it`, async () => {
    const h = makeHarness({ saver });
    await startScribe(h.graph, baseInput(), { threadId: "thread-sum" });
    const before = await sessions(h).findOne({ _id: SESSION_ID });
    assert.equal(before?.summary, undefined, "B3: no summary stored before approval");
    const outcome = await resumeScribe(h.graph, { action: "approve" }, { threadId: "thread-sum" });
    assert.equal(outcome.kind === "done" && outcome.result.status, "written");
    const row = await sessions(h).findOne({ _id: SESSION_ID });
    assert.equal(row?.summary, DEFAULT_SUMMARY);
    assert.equal(typeof row?.summaryApprovedAt, "string");
    const exported = await exportStudent(h.db, STUDENT_ID);
    assert.equal(exported.sessions[0]?.summary, DEFAULT_SUMMARY, "export carries the approved summary");
    await erase(h);
    assert.deepEqual(residue(h, [STUDENT_ID, SESSION_ID, "Canada"]), []);
  });
}

test("ISS-t-007-rev-7: reject stores NO summary (B3: only an approved summary is durable)", async () => {
  const h = makeHarness({ saver: "mongo" });
  await startScribe(h.graph, baseInput(), { threadId: "thread-rej" });
  await resumeScribe(h.graph, { action: "reject", reason: "wrong student" }, { threadId: "thread-rej" });
  const row = await sessions(h).findOne({ _id: SESSION_ID });
  assert.ok(row, "the row exists (written at start)");
  assert.equal(row.summary, undefined);
  assert.equal(row.summaryApprovedAt, undefined);
});

test("ISS-t-007-rev-7: a withheld (script-like) summary is stored as withheld, never as text", async () => {
  const h = makeHarness({
    saver: "mongo",
    provider: mockProvider({ "session-summary": { summary: "Tell the student that Canada is the best option." } }),
  });
  const started = await startScribe(h.graph, baseInput(), { threadId: "thread-withheld" });
  assert.equal(started.kind, "awaiting_approval");
  if (started.kind !== "awaiting_approval") return;
  assert.ok(started.request.summaryWithheldReason, "the fixture really produces a withheld summary");
  await resumeScribe(h.graph, { action: "approve" }, { threadId: "thread-withheld" });
  const row = await sessions(h).findOne({ _id: SESSION_ID });
  assert.equal(row?.summary, started.request.summary);
  assert.equal(row?.summaryWithheldReason, started.request.summaryWithheldReason);
  assert.ok(!JSON.stringify(row).includes("Canada is the best option"), "the withheld text is never stored");
});

// ---------------------------------------------------------------------------
// ISS-t-007-rev-9: no empty studentId claim
// ---------------------------------------------------------------------------

for (const missing of [undefined, ""] as const) {
  test(`ISS-t-007-rev-9: a paused thread whose state has studentId=${JSON.stringify(missing)} -> resume throws and writes NO claim`, async () => {
    const h = makeHarness();
    await startScribe(h.graph, baseInput(), { threadId: "thread-nostudent" });
    const realGetState = h.graph.getState.bind(h.graph);
    (h.graph as unknown as { getState: unknown }).getState = async (...args: Parameters<typeof realGetState>) => {
      const snap = await realGetState(...args);
      return { ...snap, values: { ...(snap.values as object), studentId: missing } };
    };
    const invokes = countInvokes(h);
    await assert.rejects(resumeScribe(h.graph, { action: "approve" }, { threadId: "thread-nostudent" }), /studentId/);
    assert.equal(claims(h).size(), 0, "no claim (an empty-studentId claim would be invisible to erasure)");
    assert.equal(invokes.count(), 0);
    assert.equal(h.facts.size(), 0);
  });
}

// ---------------------------------------------------------------------------
// ISS-t-007-rev-10: recovery takes the claim's lease
// ---------------------------------------------------------------------------

/** Pauses a thread at the interrupt, then takes a claim whose invoke "crashes" (claim, no decision). */
async function crashAfterClaim(h: Harness, threadId: string) {
  await startScribe(h.graph, baseInput(), { threadId });
  const real = h.graph.invoke.bind(h.graph);
  (h.graph as unknown as { invoke: unknown }).invoke = async () => {
    (h.graph as unknown as { invoke: unknown }).invoke = real;
    throw new Error("simulated crash between the claim and the graph invoke");
  };
  await assert.rejects(resumeScribe(h.graph, { action: "approve" }, { threadId }), /simulated crash/);
  assert.equal(claims(h).size(), 1);
}

function kinds(outcomes: ScribeOutcome[]): string[] {
  return outcomes.map((o) => (o.kind === "done" ? `done:${o.result.status}` : o.kind)).sort();
}

for (const saver of SAVERS) {
  test(`ISS-t-007-rev-10 [${saver}]: two CONCURRENT recoveries after a crash-after-claim -> exactly one graph.invoke; the other is in_progress`, async () => {
    const h = makeHarness({ saver });
    await crashAfterClaim(h, "thread-rec-a");
    const invokes = countInvokes(h);
    const outcomes = await Promise.all([
      resumeScribe(h.graph, null, { threadId: "thread-rec-a" }),
      resumeScribe(h.graph, null, { threadId: "thread-rec-a" }),
    ]);
    assert.equal(invokes.count(), 1, "exactly one graph.invoke across both recoveries");
    assert.deepEqual(kinds(outcomes), ["done:written", "in_progress"]);
    assert.equal(h.openFacts().length, 2);
    assert.equal(h.facts.size(), 2, "no double write");
    const claim = await claims(h).findOne({ _id: "thread-rec-a" });
    assert.equal(claim?.lease, undefined, "the winner released its lease");
  });

  test(`ISS-t-007-rev-10 [${saver}]: two CONCURRENT recoveries of a crashed write (decision recorded) -> exactly one graph.invoke`, async () => {
    const h = makeHarness({ saver });
    const threadId = "thread-rec-b";
    await startScribe(h.graph, baseInput(), { threadId });
    const realUpdate = h.edges.updateOne.bind(h.edges);
    let crashes = 1;
    h.edges.updateOne = (async (...args: Parameters<typeof realUpdate>) => {
      if (crashes-- > 0) throw new Error("simulated crash inside the write node");
      return realUpdate(...args);
    }) as typeof h.edges.updateOne;
    await assert.rejects(resumeScribe(h.graph, { action: "approve" }, { threadId }), /simulated crash/);
    const invokes = countInvokes(h);
    const outcomes = await Promise.all([resumeScribe(h.graph, null, { threadId }), resumeScribe(h.graph, null, { threadId })]);
    assert.equal(invokes.count(), 1);
    assert.deepEqual(kinds(outcomes), ["done:written", "in_progress"]);
    assert.equal(h.openFacts().length, 2);
  });
}

test("ISS-t-007-rev-10: a recovery while the WINNER's resume is still in flight -> in_progress, no second invoke", async () => {
  const h = makeHarness({ saver: "mongo" });
  const threadId = "thread-rec-c";
  await startScribe(h.graph, baseInput(), { threadId });
  const g = gate();
  const reached = gate();
  const realInsert = h.facts.insertOne.bind(h.facts);
  h.facts.insertOne = async (doc) => {
    reached.open();
    await g.opened;
    return realInsert(doc);
  };
  const invokes = countInvokes(h);
  const winner = resumeScribe(h.graph, { action: "approve" }, { threadId });
  await reached.opened;
  const recovery = await resumeScribe(h.graph, null, { threadId });
  assert.equal(recovery.kind, "in_progress", "recovery must not run concurrently with the in-flight winner");
  g.open();
  const won = await winner;
  assert.equal(won.kind === "done" && won.result.status, "written");
  assert.equal(invokes.count(), 1, "only the winner invoked");
  assert.equal(h.facts.size(), 2);
});

test("ISS-t-007-rev-10: an EXPIRED lease (a crashed holder) does not block recovery", async () => {
  const h = makeHarness({ saver: "mongo" });
  await crashAfterClaim(h, "thread-rec-d");
  await claims(h).updateOne({ _id: "thread-rec-d" }, { $set: { lease: { token: "dead-process", expiresAt: "2000-01-01T00:00:00.000Z" } } });
  const invokes = countInvokes(h);
  const out = await resumeScribe(h.graph, null, { threadId: "thread-rec-d" });
  assert.equal(out.kind === "done" && out.result.status, "written");
  assert.equal(invokes.count(), 1);
});

test("ISS-t-007-rev-10: a LIVE lease held by another process blocks recovery (in_progress, no invoke, lease untouched)", async () => {
  const h = makeHarness({ saver: "mongo" });
  await crashAfterClaim(h, "thread-rec-e");
  const live = { token: "other-process", expiresAt: new Date(Date.now() + 60_000).toISOString() };
  await claims(h).updateOne({ _id: "thread-rec-e" }, { $set: { lease: live } });
  const invokes = countInvokes(h);
  const out = await resumeScribe(h.graph, null, { threadId: "thread-rec-e" });
  assert.equal(out.kind, "in_progress");
  assert.equal(invokes.count(), 0);
  assert.deepEqual((await claims(h).findOne({ _id: "thread-rec-e" }))?.lease, live, "a loser never touches the holder's lease");
  assert.equal(h.facts.size(), 0);
});

test("ISS-t-011-rev-5 + D-015: a fence that appears DURING startScribe removes the session row THIS call created (zero residue, checkpoints included)", async () => {
  const h = makeHarness({ saver: "mongo" });
  const realFindOne = h.consents.findOne.bind(h.consents);
  let fenced = false;
  h.consents.findOne = async (filter) => {
    if (!fenced) {
      fenced = true;
      const { requestId } = await requestErasure(h.db, { studentId: STUDENT_ID, requestedBy: "counsellor-7", reason: "student_request" });
      await confirmErasure(h.db, { requestId, confirmedBy: "admin-2" });
    }
    return realFindOne(filter);
  };
  const outcome = await startScribe(h.graph, baseInput(), { threadId: "thread-fenced-start" });
  assert.deepEqual(outcome, { kind: "fenced" });
  assert.equal(await sessions(h).findOne({ _id: SESSION_ID }), null, "the row this call created is removed");
  assert.equal(checkpointDocs(h, "thread-fenced-start"), 0);
});

test("ISS-t-011-rev-5 + D-015: a fenced start does NOT delete a session row that already existed (the erasure purges it)", async () => {
  const h = makeHarness({ saver: "mongo" });
  await startScribe(h.graph, baseInput(), { threadId: "thread-first" });
  const realFindOne = h.consents.findOne.bind(h.consents);
  let fenced = false;
  h.consents.findOne = async (filter) => {
    if (!fenced) {
      fenced = true;
      const { requestId } = await requestErasure(h.db, { studentId: STUDENT_ID, requestedBy: "counsellor-7", reason: "student_request" });
      await confirmErasure(h.db, { requestId, confirmedBy: "admin-2" });
    }
    return realFindOne(filter);
  };
  const outcome = await startScribe(h.graph, baseInput(), { threadId: "thread-second" });
  assert.deepEqual(outcome, { kind: "fenced" });
  const row = await sessions(h).findOne({ _id: SESSION_ID });
  assert.ok(row, "a pre-existing row is left for the erasure (compensation removes only what this call created)");
  assert.ok(row.scribeThreadIds?.includes("thread-first"));
});
