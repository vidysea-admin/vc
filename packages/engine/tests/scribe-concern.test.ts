/**
 * T-022 outcome tests: a concern-level turn is FLAGGED and the session CONTINUES (D-020, contract
 * B20; gate qa/gates/scribe-concern-level.md; ISS-t-007-rev-3). Every assertion reads the fake
 * collections back — outcome, not construction. Synthetic transcript text only (B13), in-memory DB,
 * mock provider: nothing touches MONGODB_URL or a real model.
 *
 * - concern: facts are still extracted; the approval payload carries `concerns`; the concern is a
 *   cited edge in the Student KG (student --concern_flagged--> transcript_turn) whose citation
 *   resolves into the stored chat (B2); erasure removes it and export includes it (B15).
 * - crisis: unchanged — END "escalated", no provider call, never downgraded (B9/B16).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLLECTION_NAMES,
  confirmErasure,
  executeErasure,
  exportStudent,
  requestErasure,
  resolveCitationSpan,
  sessionTranscriptsCollection,
  type EdgeDoc,
} from "@vc/db";
import { ConcernRecordSchema, type ConcernRecord } from "@vc/schemas";
import { CONCERN_EDGE_REL, readStudentConcerns, resumeScribe, startScribe, type ScribeTurn } from "../src/scribe/index.js";
import { baseInput, makeHarness, SESSION_ID, STUDENT_ID, type Harness } from "./scribe-fixtures.js";

type AnyDoc = { _id: string } & Record<string, unknown>;
type ConcernEdge = EdgeDoc & { concern: ConcernRecord };

const CONCERN_TEXT = "Honestly, so much pressure I can't cope, everything feels like too much right now.";

function turn(turnId: string, text: string, translatedText = text, ts = 4): ScribeTurn {
  return { turnId, speaker: "student", lang: "en", text, translatedText, ts };
}

function concernInput(extra: ScribeTurn[] = [turn("t4", CONCERN_TEXT)]) {
  const input = baseInput();
  input.turns.push(...extra);
  return input;
}

function concernEdges(h: Harness): ConcernEdge[] {
  return (h.edges.all() as ConcernEdge[]).filter((e) => e.rel === CONCERN_EDGE_REL);
}

async function fence(h: Harness): Promise<string> {
  const { requestId } = await requestErasure(h.db, { studentId: STUDENT_ID, requestedBy: "counsellor-7", reason: "student_request" });
  await confirmErasure(h.db, { requestId, confirmedBy: "admin-2" });
  return requestId;
}

/** Every doc in every engine collection (except the erasure requests) that mentions the student or session. */
function residue(h: Harness): string[] {
  const hits: string[] = [];
  for (const name of Object.values(COLLECTION_NAMES)) {
    if (name === COLLECTION_NAMES.erasure_requests) continue;
    for (const doc of h.fakeDb.collection<AnyDoc>(name).all()) {
      const json = JSON.stringify(doc);
      if (json.includes(STUDENT_ID) || json.includes(SESSION_ID)) hits.push(`${name}:${doc._id}`);
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// flag and continue
// ---------------------------------------------------------------------------

test("T-022 concern-continue: a concern-level turn does NOT stop the scribe — facts are still extracted and the run pauses for approval", async () => {
  const h = makeHarness();
  const outcome = await startScribe(h.graph, concernInput(), { threadId: "thread-concern-1" });

  assert.equal(outcome.kind, "awaiting_approval", "a concern must not end the run (D-020: flag and continue)");
  if (outcome.kind !== "awaiting_approval") return;
  assert.equal(h.provider.calls.length, 2, "extraction + summary ran on a concern session");
  assert.deepEqual(
    outcome.request.diff.changes.map((c) => [c.op, c.key]),
    [
      ["add", "targetCountry"],
      ["add", "budget_inr_per_year"],
    ],
    "all facts are still extracted",
  );
});

test("T-022 concern-flag: the approval payload carries a visible, typed, cited concern flag", async () => {
  const h = makeHarness();
  const outcome = await startScribe(h.graph, concernInput(), { threadId: "thread-concern-2" });
  assert.equal(outcome.kind, "awaiting_approval");
  if (outcome.kind !== "awaiting_approval") return;
  const concerns = outcome.request.concerns ?? [];
  assert.equal(concerns.length, 1, "exactly one flagged turn");
  const c = ConcernRecordSchema.parse(concerns[0]);
  assert.equal(c.level, "concern");
  assert.equal(c.sessionId, SESSION_ID);
  assert.equal(c.studentId, STUDENT_ID);
  assert.equal(c.concernId, `${SESSION_ID}:t4`);
  assert.equal(c.detector, "crisis-guard");
  assert.ok(c.matched.length > 0);
  assert.ok(c.reason.length > 0);
  assert.deepEqual(c.citation, { type: "transcript", turnId: "t4", quote: CONCERN_TEXT });
});

test("T-022 no-concern: an ordinary session carries no concern flag and writes no concern edge", async () => {
  const h = makeHarness();
  const outcome = await startScribe(h.graph, baseInput(), { threadId: "thread-concern-none" });
  assert.equal(outcome.kind, "awaiting_approval");
  if (outcome.kind !== "awaiting_approval") return;
  assert.equal(outcome.request.concerns, undefined);
  assert.equal(concernEdges(h).length, 0);
});

test("T-022 original-language: a concern only in the original-language text (benign translation) is still flagged, cited to the original text", async () => {
  const h = makeHarness();
  const hinglish = turn("t4", "sach bolun toh bahut tension hai ghar pe", "Honestly things are a bit busy at home.");
  const outcome = await startScribe(h.graph, concernInput([hinglish]), { threadId: "thread-concern-hi" });
  assert.equal(outcome.kind, "awaiting_approval");
  if (outcome.kind !== "awaiting_approval") return;
  assert.equal(outcome.request.concerns?.[0]?.citation.quote, "sach bolun toh bahut tension hai ghar pe");
  assert.equal(concernEdges(h).length, 1);
});

// ---------------------------------------------------------------------------
// Student KG: a cited edge in the EXISTING edges collection
// ---------------------------------------------------------------------------

test("T-022 concern-kg: the concern is written to the Student KG as a cited edge whose citation resolves into the stored transcript (B2)", async () => {
  const h = makeHarness();
  await startScribe(h.graph, concernInput(), { threadId: "thread-concern-kg" });

  const edges = concernEdges(h);
  assert.equal(edges.length, 1);
  const edge = edges[0]!;
  assert.deepEqual(edge.from, { kind: "student", id: STUDENT_ID });
  assert.deepEqual(edge.to, { kind: "transcript_turn", id: `${SESSION_ID}:t4` });
  assert.equal(ConcernRecordSchema.parse(edge.concern).concernId, `${SESSION_ID}:t4`);
  assert.equal(h.facts.size(), 0, "no profile FACT is written before approval (B3); the concern is a safety record");

  const stored = await sessionTranscriptsCollection(h.db).find({ sessionId: SESSION_ID }).toArray();
  assert.ok(stored.some((t) => t._id === edge.to.id), "the edge points at a stored transcript turn");
  const span = resolveCitationSpan(stored, edge.concern.citation);
  assert.ok(span, "the concern citation resolves into the stored chat");
  assert.equal(span?.turnId, "t4");

  // T-012's typed read surface returns the same record.
  assert.deepEqual(await readStudentConcerns(h.db, { studentId: STUDENT_ID, sessionId: SESSION_ID }), [edge.concern]);
});

test("T-022 concern-kg: approving writes the facts AND keeps the concern edge; a replayed start writes no second edge", async () => {
  const h = makeHarness();
  await startScribe(h.graph, concernInput(), { threadId: "thread-concern-approve" });
  const outcome = await resumeScribe(h.graph, { action: "approve" }, { threadId: "thread-concern-approve" });
  assert.equal(outcome.kind === "done" && outcome.result.status, "written");
  assert.equal(h.openFacts().length, 2);
  assert.equal(concernEdges(h).length, 1);
  assert.equal(h.edges.size(), 5, "4 fact edges + 1 concern edge");

  await startScribe(h.graph, concernInput(), { threadId: "thread-concern-approve-2" });
  assert.equal(concernEdges(h).length, 1, "deterministic _id + $setOnInsert: a replay is idempotent");
});

test("T-022 multi-concern: two concern turns give two records, in turn order", async () => {
  const h = makeHarness();
  const outcome = await startScribe(
    h.graph,
    concernInput([turn("t4", CONCERN_TEXT), turn("t5", "I feel hopeless about all of this.", undefined, 5)]),
    { threadId: "thread-concern-multi" },
  );
  assert.equal(outcome.kind, "awaiting_approval");
  if (outcome.kind !== "awaiting_approval") return;
  assert.deepEqual(outcome.request.concerns?.map((c) => c.citation.turnId), ["t4", "t5"]);
  assert.equal(concernEdges(h).length, 2);
});

test("T-022 consent-first: a session refused by the consent gate writes no concern (B4)", async () => {
  const h = makeHarness({ consent: false });
  const outcome = await startScribe(h.graph, concernInput(), { threadId: "thread-concern-noconsent" });
  assert.equal(outcome.kind === "done" && outcome.result.status, "refused");
  assert.equal(concernEdges(h).length, 0);
  assert.equal(h.provider.calls.length, 0);
});

// ---------------------------------------------------------------------------
// crisis unchanged (B9/B16)
// ---------------------------------------------------------------------------

test("T-022 crisis-unchanged: a crisis turn still ends `escalated` with zero provider calls, and a concern elsewhere never downgrades it", async () => {
  const h = makeHarness();
  const input = concernInput([turn("t4", CONCERN_TEXT), turn("t5", "Honestly I just want to kill myself.", undefined, 5)]);
  const outcome = await startScribe(h.graph, input, { threadId: "thread-concern-crisis" });
  assert.equal(h.provider.calls.length, 0, "no generative call on a crisis session (B9)");
  assert.equal(outcome.kind, "done");
  if (outcome.kind !== "done") return;
  assert.equal(outcome.result.status, "escalated");
  if (outcome.result.status === "escalated") {
    assert.equal(outcome.result.escalation.level, "crisis");
    assert.equal(outcome.result.escalation.turnId, "t5");
  }
  assert.equal(h.facts.size(), 0);
  assert.equal(concernEdges(h).length, 0, "a crisis session writes no concern edge in this unit");
});

// ---------------------------------------------------------------------------
// B15: erasure removes it, export includes it; fence compensation removes what this call created
// ---------------------------------------------------------------------------

test("T-022 concern-export: exportStudent includes the concern edge with its record", async () => {
  const h = makeHarness();
  await startScribe(h.graph, concernInput(), { threadId: "thread-concern-export" });
  const bundle = await exportStudent(h.db, STUDENT_ID);
  const exported = (bundle.edges as ConcernEdge[]).filter((e) => e.rel === CONCERN_EDGE_REL);
  assert.equal(exported.length, 1);
  assert.equal(exported[0]?.concern.concernId, `${SESSION_ID}:t4`);
  assert.equal(exported[0]?.concern.citation.quote, CONCERN_TEXT);
});

test("T-022 concern-erasure: executeErasure removes the concern edge — read-back finds zero residue anywhere", async () => {
  const h = makeHarness();
  await startScribe(h.graph, concernInput(), { threadId: "thread-concern-erase" });
  await resumeScribe(h.graph, { action: "approve" }, { threadId: "thread-concern-erase" });
  assert.equal(concernEdges(h).length, 1);

  const requestId = await fence(h);
  const erased = await executeErasure(h.db, requestId);
  assert.equal(erased.status, "completed");
  assert.equal(concernEdges(h).length, 0, "the concern edge is erased");
  assert.deepEqual(residue(h), [], "no doc of the student or session survives");
  assert.deepEqual(await readStudentConcerns(h.db, { studentId: STUDENT_ID }), []);
});

test("T-022 concern-fence: a fence during startScribe removes the concern edges THIS call created, and keeps one an earlier run created", async () => {
  const h = makeHarness();
  // An earlier run already flagged t4 (no writerToken of this call).
  const earlier = {
    _id: `student:${STUDENT_ID}->${CONCERN_EDGE_REL}->transcript_turn:${SESSION_ID}:t4`,
    from: { kind: "student", id: STUDENT_ID },
    to: { kind: "transcript_turn", id: `${SESSION_ID}:t4` },
    rel: CONCERN_EDGE_REL,
    createdAt: "2026-09-25T09:00:00.000Z",
    writerToken: "earlier-run",
    concern: {
      concernId: `${SESSION_ID}:t4`,
      studentId: STUDENT_ID,
      sessionId: SESSION_ID,
      level: "concern",
      reason: "earlier",
      matched: ["so much pressure i can't cope"],
      detector: "crisis-guard",
      citation: { type: "transcript", quote: CONCERN_TEXT, turnId: "t4" },
    },
  } as ConcernEdge;
  h.edges.seed(earlier);

  const realUpdateOne = h.edges.updateOne.bind(h.edges);
  let fencedMidRun = false;
  h.edges.updateOne = (async (filter: unknown, update: unknown, options?: unknown) => {
    const res = await (realUpdateOne as (...a: unknown[]) => Promise<unknown>)(filter, update, options);
    // The erasure is confirmed right after THIS call's t5 concern edge landed.
    if (!fencedMidRun && JSON.stringify(filter).includes(":t5")) {
      fencedMidRun = true;
      await fence(h);
    }
    return res;
  }) as typeof h.edges.updateOne;

  const outcome = await startScribe(
    h.graph,
    concernInput([turn("t4", CONCERN_TEXT), turn("t5", "I feel hopeless about all of this.", undefined, 5)]),
    { threadId: "thread-concern-fence" },
  );
  assert.ok(fencedMidRun, "the fence landed after the t5 concern edge was written");
  assert.deepEqual(outcome, { kind: "fenced" });
  assert.deepEqual(
    concernEdges(h).map((e) => e.to.id),
    [`${SESSION_ID}:t4`],
    "t5 (created by the fenced call) is gone; the earlier t4 edge is not this call's to delete",
  );
});
