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
  ensureScribeSessionRow,
  executeErasure,
  exportStudent,
  FencedWriterDeadlineError,
  requestErasure,
  type ScribeResolutionDoc,
  type SessionDoc,
} from "@vc/db";
import { readSessionTranscript, resolveCitationSpan } from "@vc/db";
import { resumeScribe, startScribe, writeApproved, type ScribeOutcome } from "../src/scribe/index.js";
import type { Fact } from "@vc/schemas";
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

for (const missing of [undefined, "", "  "] as const) {
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

// ---------------------------------------------------------------------------
// ISS-t-016-c0-2: a student with TWO DISTINCT sessions (not just one session with two threads),
// each with their own scribe thread, end-to-end through erasure.
// ---------------------------------------------------------------------------

test("ISS-t-016-c0-2: a student with TWO DISTINCT sessions (each its own thread) is exported and erased to zero residue for BOTH", async () => {
  const h = makeHarness({ saver: "mongo" });
  const SESSION_2 = "session-synthetic-2";
  await startScribe(h.graph, baseInput(), { threadId: "thread-multi-a" });
  await startScribe(h.graph, baseInput({ sessionId: SESSION_2 }), { threadId: "thread-multi-b" });

  assert.equal(sessions(h).size(), 2, "two distinct session rows, not one row with two threads");
  const rowA = await sessions(h).findOne({ _id: SESSION_ID });
  const rowB = await sessions(h).findOne({ _id: SESSION_2 });
  assert.deepEqual(rowA?.scribeThreadIds, ["thread-multi-a"]);
  assert.deepEqual(rowB?.scribeThreadIds, ["thread-multi-b"]);

  const exported = await exportStudent(h.db, STUDENT_ID);
  assert.equal(exported.sessions.length, 2);
  // resolveSelectors also derives scribe:<sessionId> per session (unused here, since each run used
  // its own explicit threadId) alongside the actually-recorded threads; both real threads must
  // still be found through their OWN session's scribeThreadIds (ISS-t-016-c0-2's point: a second
  // DISTINCT session, not just a second thread on the same session).
  assert.ok(exported.checkpoints.threads.includes("thread-multi-a"));
  assert.ok(exported.checkpoints.threads.includes("thread-multi-b"));

  const erased = await erase(h);
  assert.equal(erased.status, "completed");
  assert.deepEqual(residue(h, [STUDENT_ID, SESSION_ID, SESSION_2, "thread-multi-a", "thread-multi-b"]), [], "zero residue across BOTH sessions");
});

// ---------------------------------------------------------------------------
// ISS-t-016-rev-1: recordApprovedSessionSummary is fence-aware, matching applyApprovedDiff's own
// pre-check/post-check. A fence landing BETWEEN the summary write and applyApprovedDiff must not
// leave the approved summary on the row until executeErasure eventually purges it.
// ---------------------------------------------------------------------------

test("ISS-t-016-rev-1: a fence that appears BETWEEN the summary write and applyApprovedDiff removes the summary too, IMMEDIATELY (not just facts/checkpoints, and not only once executeErasure runs)", async () => {
  const h = makeHarness({ saver: "mongo" });
  await startScribe(h.graph, baseInput(), { threadId: "thread-sum-fence" });

  const sessionsColl = sessions(h);
  const realUpdate = sessionsColl.updateOne.bind(sessionsColl);
  let fenced = false;
  (sessionsColl as unknown as { updateOne: typeof sessionsColl.updateOne }).updateOne = (async (
    filter: Parameters<typeof realUpdate>[0],
    update: Parameters<typeof realUpdate>[1],
    opts: Parameters<typeof realUpdate>[2],
  ) => {
    const res = await realUpdate(filter, update, opts);
    const set = (update as { $set?: { summary?: unknown } } | undefined)?.$set;
    if (!fenced && set && set.summary !== undefined) {
      fenced = true;
      const { requestId } = await requestErasure(h.db, { studentId: STUDENT_ID, requestedBy: "counsellor-7", reason: "student_request" });
      await confirmErasure(h.db, { requestId, confirmedBy: "admin-2" });
    }
    return res;
  }) as typeof sessionsColl.updateOne;

  const outcome = await resumeScribe(h.graph, { action: "approve" }, { threadId: "thread-sum-fence" });
  assert.deepEqual(outcome, { kind: "fenced" });

  // IMMEDIATELY after the fenced outcome, BEFORE executeErasure runs: the summary fields this call
  // wrote must already be gone.
  const row = await sessions(h).findOne({ _id: SESSION_ID });
  assert.equal(row?.summary, undefined, "ISS-t-016-rev-1: the summary this call wrote must be compensated, not left for the purge");
  assert.equal(row?.summaryApprovedAt, undefined);
  assert.equal(row?.summaryWithheldReason, undefined);
  assert.equal(h.facts.size(), 0, "applyApprovedDiff never ran (its own pre-check, or this call's, refused first)");
});

// ---------------------------------------------------------------------------
// ISS-t-017-rev-1: recordApprovedSessionSummary's OWN pre/post-check can only see a fence that
// exists by the time ITS post-check runs. A fence confirmed strictly AFTER that — during the
// applyApprovedDiff call right after it — is invisible to either write taken alone; writeApproved
// (nodes.ts) must close that window itself.
// ---------------------------------------------------------------------------

test("ISS-t-017-rev-1: a fence that appears DURING applyApprovedDiff (after recordApprovedSessionSummary's own post-check already ran clean) also removes the summary, IMMEDIATELY (not just facts/edges, and not only once executeErasure runs)", async () => {
  const h = makeHarness({ saver: "mongo" });
  await startScribe(h.graph, baseInput(), { threadId: "thread-sum-fence-2" });

  // Intercept applyApprovedDiff's FIRST fact write. By construction this runs strictly after
  // recordApprovedSessionSummary has fully returned (writeApproved awaits it first) — including its
  // own post-check, which by then found no fence at all (the fence does not exist yet). Confirming
  // an erasure right here lands the fence exactly inside the window this issue is about: after the
  // summary write's own compensation already ran clean, before/during applyApprovedDiff.
  const realInsertOne = h.facts.insertOne.bind(h.facts);
  let fenced = false;
  (h.facts as unknown as { insertOne: typeof h.facts.insertOne }).insertOne = (async (
    doc: Parameters<typeof realInsertOne>[0],
    options?: Parameters<typeof realInsertOne>[1],
  ) => {
    if (!fenced) {
      fenced = true;
      const { requestId } = await requestErasure(h.db, { studentId: STUDENT_ID, requestedBy: "counsellor-7", reason: "student_request" });
      await confirmErasure(h.db, { requestId, confirmedBy: "admin-2" });
    }
    return realInsertOne(doc, options);
  }) as typeof h.facts.insertOne;

  const outcome = await resumeScribe(h.graph, { action: "approve" }, { threadId: "thread-sum-fence-2" });
  assert.deepEqual(outcome, { kind: "fenced" });

  // IMMEDIATELY after the fenced outcome, BEFORE executeErasure runs: the summary
  // recordApprovedSessionSummary wrote (and whose OWN post-check found clean) must already be gone
  // too — undone by writeApproved, not left on the row for the eventual purge.
  const row = await sessions(h).findOne({ _id: SESSION_ID });
  assert.equal(row?.summary, undefined, "ISS-t-017-rev-1: the summary must be compensated by writeApproved, not left for the purge");
  assert.equal(row?.summaryApprovedAt, undefined);
  assert.equal(row?.summaryWithheldReason, undefined);
  assert.equal(h.facts.size(), 0, "applyApprovedDiff's own post-check compensated the facts it inserted, as before");
});

// ---------------------------------------------------------------------------
// ISS-t-017-c1-2: applyApprovedDiff can ALSO end FencedWriterDeadlineError instead of
// StudentFencedError — thrown only when its OWN post-check found the student NOT fenced at that
// exact instant. A fence confirmed strictly AFTER that read (but before writeApproved's catch runs)
// is invisible to applyApprovedDiff, so writeApproved must re-check the fence itself before deciding
// whether to compensate the summary.
// ---------------------------------------------------------------------------

/** A minimal, schema-valid Fact for a writeApproved decision.edits entry (facts.test.ts's own shape). */
function citedFact(overrides: Partial<Fact> = {}): Fact {
  return {
    key: "targetCountry",
    value: "Canada",
    source: { type: "transcript", quote: "I want to study in Canada", turnId: "t1" },
    confidence: 0.8,
    validFrom: "2026-09-25T00:00:00.000Z",
    purposeTags: ["counselling"],
    sensitivity: "low",
    ...overrides,
  };
}

/**
 * These two tests call `writeApproved` directly (not through startScribe/resumeScribe and its own
 * outer LangGraph invoke + invokeFenceAware deadline/AbortController), so the ONLY deadline racing
 * against the stalled write is applyApprovedDiff's own inner one — the exact mechanism ISS-t-017-c1-2
 * is about, isolated from the outer graph's competing timing.
 */
test("ISS-t-017-c1-2: an erasure confirmed strictly AFTER applyApprovedDiff's own post-check ran clean, surfacing as FencedWriterDeadlineError, still removes the summary IMMEDIATELY", async () => {
  const h = makeHarness({ saver: "mongo" });
  await ensureScribeSessionRow(h.db, { sessionId: "sess-c1-2-fenced", studentId: STUDENT_ID, threadId: "thread-c1-2-fenced" });

  // Stall applyApprovedDiff's first fact write so its own WriterDeadline (bound to the short
  // writerDeadlineExpiresAt below) actually expires — a genuine timeout, not a fence caught mid-write.
  let releaseInsert!: () => void;
  const insertGate = new Promise<void>((resolve) => (releaseInsert = resolve));
  const realInsertOne = h.facts.insertOne.bind(h.facts);
  (h.facts as unknown as { insertOne: typeof h.facts.insertOne }).insertOne = (async (
    doc: Parameters<typeof realInsertOne>[0],
    options?: Parameters<typeof realInsertOne>[1],
  ) => {
    await insertGate;
    return realInsertOne(doc, options);
  }) as typeof h.facts.insertOne;

  // Intercept the erasure-fence reads (isStudentFenced -> erasure_fences.findOne). In writeApproved's
  // own sequence, four such reads happen before applyApprovedDiff's OWN post-check returns:
  //   1. recordApprovedSessionSummary's pre-check
  //   2. recordApprovedSessionSummary's post-check
  //   3. applyApprovedDiff's pre-check
  //   4. applyApprovedDiff's post-check (compensateIfFenced, run after the deadline fires) — this
  //      MUST see "not fenced" (a genuine fence there throws StudentFencedError instead, a
  //      different, already-handled path).
  // On read #4, confirm a real erasure AFTER capturing its (not-fenced) result but BEFORE returning
  // it, so the fence document genuinely exists in the collection by the time writeApproved's own
  // re-check (read #5) runs — reproducing the checker's exact race deterministically, without
  // relying on wall-clock timing for the fence side of it.
  const fencesColl = h.fakeDb.collection(COLLECTION_NAMES.erasure_fences);
  const realFencesFindOne = fencesColl.findOne.bind(fencesColl);
  let fenceChecks = 0;
  (fencesColl as unknown as { findOne: typeof fencesColl.findOne }).findOne = (async (
    filter: Parameters<typeof realFencesFindOne>[0],
    options?: Parameters<typeof realFencesFindOne>[1],
  ) => {
    fenceChecks += 1;
    const result = await realFencesFindOne(filter, options);
    if (fenceChecks === 4) {
      const { requestId } = await requestErasure(h.db, { studentId: STUDENT_ID, requestedBy: "counsellor-7", reason: "student_request" });
      await confirmErasure(h.db, { requestId, confirmedBy: "admin-2" });
    }
    return result; // the ORIGINAL (pre-confirm) result: applyApprovedDiff's own post-check sees "not fenced"
  }) as typeof fencesColl.findOne;

  const rawInput = {
    sessionId: "sess-c1-2-fenced",
    studentId: STUDENT_ID,
    diff: { studentId: STUDENT_ID, summary: DEFAULT_SUMMARY, changes: [], citedFactIds: [] },
    decision: { approve: true, edits: [citedFact()] },
    summary: DEFAULT_SUMMARY,
  };

  const callPromise = writeApproved(rawInput, { db: h.db }, { writerDeadlineExpiresAt: Date.now() + 20 });
  callPromise.catch(() => undefined); // observed below; suppress a premature unhandledRejection warning
  await new Promise((resolve) => setTimeout(resolve, 60)); // let the 20ms deadline actually fire
  releaseInsert(); // let the stuck insert land afterwards (harmless; undone regardless)

  const err = await callPromise.catch((e: unknown) => e);
  assert.ok(err instanceof FencedWriterDeadlineError, `expected FencedWriterDeadlineError, got ${String(err)}`);
  assert.ok(fenceChecks >= 5, `expected at least 5 fence reads (4 pre-existing + writeApproved's own re-check), got ${fenceChecks}`);

  // IMMEDIATELY after the call rejects: the summary recordApprovedSessionSummary wrote (and whose
  // OWN post-check found clean) must already be gone too — undone by writeApproved's own re-check on
  // the FencedWriterDeadlineError, not left on the row for the eventual purge.
  const row = await sessions(h).findOne({ _id: "sess-c1-2-fenced" });
  assert.equal(row?.summary, undefined, "ISS-t-017-c1-2: the summary must be compensated on a FencedWriterDeadlineError too, when the student is genuinely fenced by the time writeApproved re-checks");
  assert.equal(row?.summaryApprovedAt, undefined);
  assert.equal(row?.summaryWithheldReason, undefined);
});

test("ISS-t-017-c1-2: an UNFENCED FencedWriterDeadlineError (a plain slow write) keeps the summary — legitimate, idempotent under D-012", async () => {
  const h = makeHarness({ saver: "mongo" });
  await ensureScribeSessionRow(h.db, { sessionId: "sess-c1-2-clean", studentId: STUDENT_ID, threadId: "thread-c1-2-clean" });

  // Stall applyApprovedDiff's first fact write past a short writer deadline; never confirm any
  // erasure. This is a plain slow write timing out — nothing to do with fencing.
  let releaseInsert!: () => void;
  const insertGate = new Promise<void>((resolve) => (releaseInsert = resolve));
  const realInsertOne = h.facts.insertOne.bind(h.facts);
  (h.facts as unknown as { insertOne: typeof h.facts.insertOne }).insertOne = (async (
    doc: Parameters<typeof realInsertOne>[0],
    options?: Parameters<typeof realInsertOne>[1],
  ) => {
    await insertGate;
    return realInsertOne(doc, options);
  }) as typeof h.facts.insertOne;

  const rawInput = {
    sessionId: "sess-c1-2-clean",
    studentId: STUDENT_ID,
    diff: { studentId: STUDENT_ID, summary: DEFAULT_SUMMARY, changes: [], citedFactIds: [] },
    decision: { approve: true, edits: [citedFact()] },
    summary: DEFAULT_SUMMARY,
  };

  const callPromise = writeApproved(rawInput, { db: h.db }, { writerDeadlineExpiresAt: Date.now() + 20 });
  callPromise.catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 60));
  releaseInsert();

  const err = await callPromise.catch((e: unknown) => e);
  assert.ok(err instanceof FencedWriterDeadlineError, `expected FencedWriterDeadlineError, got ${String(err)}`);

  const row = await sessions(h).findOne({ _id: "sess-c1-2-clean" });
  assert.equal(row?.summary, DEFAULT_SUMMARY, "an UNFENCED deadline error must leave the legitimately-written summary alone (D-012: the retry is idempotent)");
});

// ---------------------------------------------------------------------------
// ISS-t-016-c0-1: the run lease's window (newLease, derived from the outer writerDeadlineMs) must
// bound the INNER write's own deadline too — a caller-shortened writerDeadlineMs must shorten the
// driver-level timeoutMS the write's own operations receive, not just the lease's window.
// ---------------------------------------------------------------------------

test("ISS-t-016-c0-1: recordApprovedSessionSummary's and applyApprovedDiff's own writes are bound to the SAME (short) outer writerDeadlineMs, not the package's full 60s default", async () => {
  const h = makeHarness({ saver: "mongo" });
  await startScribe(h.graph, baseInput(), { threadId: "thread-bound" });

  const sessionsColl = sessions(h);
  const summaryTimeouts: number[] = [];
  const realSessionsUpdate = sessionsColl.updateOne.bind(sessionsColl);
  (sessionsColl as unknown as { updateOne: typeof sessionsColl.updateOne }).updateOne = (async (
    filter: Parameters<typeof realSessionsUpdate>[0],
    update: Parameters<typeof realSessionsUpdate>[1],
    options?: { timeoutMS?: number },
  ) => {
    const set = (update as { $set?: { summary?: unknown } } | undefined)?.$set;
    if (set && set.summary !== undefined && options?.timeoutMS !== undefined) summaryTimeouts.push(options.timeoutMS);
    return realSessionsUpdate(filter, update, options as Parameters<typeof realSessionsUpdate>[2]);
  }) as typeof sessionsColl.updateOne;

  const factTimeouts: number[] = [];
  const realFactsInsert = h.facts.insertOne.bind(h.facts);
  (h.facts as unknown as { insertOne: typeof h.facts.insertOne }).insertOne = (async (
    doc: Parameters<typeof realFactsInsert>[0],
    options?: { timeoutMS?: number },
  ) => {
    if (options?.timeoutMS !== undefined) factTimeouts.push(options.timeoutMS);
    return realFactsInsert(doc, options as Parameters<typeof realFactsInsert>[1]);
  }) as typeof h.facts.insertOne;

  const SHORT_MS = 200; // well below FENCED_WRITER_DEADLINE_MS (60_000) but a legal (0, 60_000] value
  const outcome = await resumeScribe(h.graph, { action: "approve" }, { threadId: "thread-bound", writerDeadlineMs: SHORT_MS });
  assert.equal(outcome.kind === "done" && outcome.result.status, "written");

  assert.ok(summaryTimeouts.length > 0, "the summary write carried an explicit timeoutMS at all");
  assert.ok(factTimeouts.length > 0, "the fact insert carried an explicit timeoutMS at all");
  for (const t of [...summaryTimeouts, ...factTimeouts]) {
    assert.ok(
      t <= SHORT_MS,
      `ISS-t-016-c0-1: every inner write's timeoutMS must be bound to the outer writerDeadlineMs (${SHORT_MS}ms), got ${t}ms — ` +
        `a value close to 60000 means the inner write is STILL using the package default, independent of the outer deadline`,
    );
  }
});

// ---------------------------------------------------------------------------
// T-024 / ISS-t-013r-c0-3 (D-020 "puri chat bhi save rehegi"): startScribe persists the full chat
// verbatim, the counsellor reads it back, and every citation the scribe proposes points at a span
// inside the PERSISTED transcript (not only inside the transient graph input).
// ---------------------------------------------------------------------------

test("ISS-t-013r-c0-3: startScribe persists every input turn verbatim, and every proposed fact's citation resolves to a span in the stored chat", async () => {
  const h = makeHarness();
  const input = baseInput();
  const outcome = await startScribe(h.graph, input, { threadId: "thread-transcript-1" });
  assert.equal(outcome.kind, "awaiting_approval");
  const stored = await readSessionTranscript(h.db, { studentId: STUDENT_ID, sessionId: SESSION_ID });
  assert.deepEqual(
    stored.map((t) => ({ turnId: t.turnId, speaker: t.speaker, lang: t.lang, text: t.text, translatedText: t.translatedText, ts: t.ts })),
    input.turns,
    "the full chat, verbatim and in order",
  );
  if (outcome.kind !== "awaiting_approval") return;
  assert.ok(outcome.request.facts.length >= 2, "the default fixture proposes facts");
  for (const fact of outcome.request.facts) {
    assert.equal(fact.source.type, "transcript");
    const span = resolveCitationSpan(stored, { turnId: fact.source.turnId!, quote: fact.source.quote });
    assert.ok(span, `citation of ${fact.key} must resolve inside the persisted transcript`);
    const doc = stored.find((t) => t.turnId === fact.source.turnId)!;
    assert.equal(doc[span!.field].slice(span!.start, span!.end).toLowerCase(), fact.source.quote.toLowerCase());
  }
});

test("ISS-t-013r-c0-3: a second scribe run over the same session adds only NEW turns and never rewrites the first record; the export carries them all", async () => {
  const h = makeHarness();
  await startScribe(h.graph, baseInput(), { threadId: "thread-transcript-2a" });
  const more = baseInput();
  more.turns = [
    ...more.turns.map((t) => (t.turnId === "t1" ? { ...t, text: "REWRITTEN" } : t)),
    { turnId: "t4", speaker: "student", lang: "en", text: "I also like Germany.", translatedText: "I also like Germany.", ts: 4 },
  ];
  await startScribe(h.graph, more, { threadId: "thread-transcript-2b" });
  const stored = await readSessionTranscript(h.db, { studentId: STUDENT_ID, sessionId: SESSION_ID });
  assert.deepEqual(stored.map((t) => t.turnId), ["t1", "t2", "t3", "t4"]);
  assert.equal(stored[0]!.text, baseInput().turns[0]!.text, "the first recorded text stands");
  const bundle = await exportStudent(h.db, STUDENT_ID);
  assert.deepEqual(bundle.transcripts.map((t) => [t.turnId, t.text]), stored.map((t) => [t.turnId, t.text]));
});
