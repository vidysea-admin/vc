/**
 * T-011 cycle 2 / D-015: the scribe's start and resume honour the erasure fence.
 *   - fenced BEFORE the call -> refused with outcome `fenced`, before anything is written;
 *   - fenced DURING the call -> everything the call wrote for the thread is removed again
 *     (checkpoints, checkpoint writes, the claim it created; facts + edges by applyApprovedDiff's
 *     own post-write compensation) and the outcome is `fenced`.
 * Outcome-proven: every assertion scans every fake collection and the MemorySaver itself.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { COLLECTION_NAMES, confirmErasure, executeErasure, isStudentFenced, requestErasure } from "@vc/db";
import { resumeScribe, startScribe } from "../src/scribe/index.js";
import { baseInput, makeHarness, seedConsent, SESSION_ID, STUDENT_ID, type Harness } from "./scribe-fixtures.js";

type AnyDoc = { _id: string } & Record<string, unknown>;

async function fence(h: Harness, studentId = STUDENT_ID): Promise<string> {
  const { requestId } = await requestErasure(h.db, { studentId, requestedBy: "counsellor-7", reason: "student_request" });
  await confirmErasure(h.db, { requestId, confirmedBy: "admin-2" });
  return requestId;
}

/** Every doc in every engine collection (except the audit log) that mentions one of `needles`. */
function residue(h: Harness, needles: string[] = [STUDENT_ID, SESSION_ID]): string[] {
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

/** True if the MemorySaver holds any checkpoint or pending write for `threadId`. */
function threadStored(h: Harness, threadId: string): boolean {
  const saver = h.checkpointer as unknown as { storage: Record<string, unknown>; writes: Record<string, unknown> };
  return saver.storage[threadId] !== undefined || Object.keys(saver.writes).some((k) => k.includes(threadId));
}

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

test("D-015: startScribe for a FENCED student is refused with outcome `fenced` before any node runs (no provider call, no checkpoint, no write)", async () => {
  const h = makeHarness();
  await fence(h);
  const outcome = await startScribe(h.graph, baseInput(), { threadId: "thread-f1" });
  assert.deepEqual(outcome, { kind: "fenced" });
  assert.equal(h.provider.calls.length, 0);
  assert.equal(threadStored(h, "thread-f1"), false, "no checkpoint written");
  assert.equal(h.facts.size() + h.edges.size(), 0);
});

test("D-015: a fence that appears DURING startScribe -> the run's checkpoints are removed and the outcome is `fenced`", async () => {
  const h = makeHarness();
  const realFindOne = h.consents.findOne.bind(h.consents);
  let fencedMidRun = false;
  h.consents.findOne = async (filter) => {
    // requireConsent's own fence check has already passed; the erasure is confirmed right now.
    if (!fencedMidRun) {
      fencedMidRun = true;
      await fence(h);
    }
    return realFindOne(filter);
  };
  const outcome = await startScribe(h.graph, baseInput(), { threadId: "thread-f2" });
  assert.ok(fencedMidRun);
  assert.deepEqual(outcome, { kind: "fenced" });
  assert.equal(threadStored(h, "thread-f2"), false, "the thread's checkpoints and writes were removed");
});

test("D-015: resumeScribe for a FENCED student is refused BEFORE claiming (no claim insert attempted, the thread left as it was)", async () => {
  const h = makeHarness();
  const started = await startScribe(h.graph, baseInput(), { threadId: "thread-f3" });
  assert.equal(started.kind, "awaiting_approval");
  await fence(h);
  const claims = h.fakeDb.collection<AnyDoc>(COLLECTION_NAMES.scribe_resolutions);
  const realInsert = claims.insertOne.bind(claims);
  let claimInserts = 0;
  claims.insertOne = async (doc) => {
    claimInserts += 1;
    return realInsert(doc);
  };
  const outcome = await resumeScribe(h.graph, { action: "approve" }, { threadId: "thread-f3" });
  assert.deepEqual(outcome, { kind: "fenced" });
  assert.equal(claimInserts, 0, "a fenced resume must not even claim");
  assert.equal(h.facts.size() + h.edges.size(), 0);
  assert.equal(threadStored(h, "thread-f3"), true, "a refused resume touches nothing (the erasure purges the thread)");
});

test("D-015 H4b with the REAL scribe: a resume racing the erasure (released inside scribe_resolutions.countDocuments) -> `fenced`, zero residue anywhere, erasure verified", async () => {
  const h = makeHarness();
  const threadId = "thread-f4";
  const started = await startScribe(h.graph, baseInput(), { threadId });
  assert.equal(started.kind, "awaiting_approval");

  // Pause the resume inside applyApprovedDiff, after its pre-check and after the claim, before any fact write.
  const g = gate();
  const reached = gate();
  const realInsert = h.facts.insertOne.bind(h.facts);
  h.facts.insertOne = async (doc) => {
    reached.open();
    await g.opened;
    return realInsert(doc);
  };
  const resuming = resumeScribe(h.graph, { action: "approve" }, { threadId });
  await reached.opened;
  const requestId = await fence(h);

  const claims = h.fakeDb.collection<AnyDoc>(COLLECTION_NAMES.scribe_resolutions);
  const realCount = claims.countDocuments.bind(claims);
  let raced = false;
  let resumeOutcome: unknown = null;
  let lateWritesSeen = 0;
  const realEdgesDelete = h.edges.deleteMany.bind(h.edges);
  claims.countDocuments = async (filter) => {
    const n = await realCount(filter);
    if (!raced) {
      raced = true;
      h.edges.deleteMany = async (f) => {
        lateWritesSeen = Math.max(lateWritesSeen, h.facts.size() + h.edges.size());
        return realEdgesDelete(f);
      };
      g.open();
      resumeOutcome = await resuming;
      h.edges.deleteMany = realEdgesDelete;
    }
    return n;
  };
  const erased = await executeErasure(h.db, requestId);
  assert.ok(raced, "the resume really completed during the erasure's read-back");
  assert.ok(lateWritesSeen > 0, "the resume's facts/edges really landed mid read-back before being compensated");
  assert.deepEqual(resumeOutcome, { kind: "fenced" });
  assert.equal(erased.receipt.verified, true);
  assert.deepEqual(residue(h), [], "no fact, edge, claim or consent of the student survives");
  assert.equal(threadStored(h, threadId), false, "the thread's checkpoints and writes are gone");
  assert.equal(await isStudentFenced(h.db, STUDENT_ID), false, "the fence is released on completion");
});

test("D-015: ANOTHER student's scribe runs normally while this student is fenced", async () => {
  const h = makeHarness();
  await fence(h);
  const other = "student-synthetic-2";
  seedConsent(h.consents, { _id: `consent-${other}`, studentId: other });
  const input = baseInput({ studentId: other, sessionId: "session-synthetic-2" });
  const started = await startScribe(h.graph, input, { threadId: "thread-f5" });
  assert.equal(started.kind, "awaiting_approval");
  const outcome = await resumeScribe(h.graph, { action: "approve" }, { threadId: "thread-f5" });
  assert.equal(outcome.kind, "done");
  if (outcome.kind !== "done") return;
  assert.equal(outcome.result.status, "written");
  assert.equal(h.openFacts().filter((f) => f.studentId === other).length, 2);
});
