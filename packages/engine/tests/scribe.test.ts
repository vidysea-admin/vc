import type { Fact } from "@vc/schemas";
/**
 * T-007 outcome tests for the post-session scribe graph (contract B2, B3, B4,
 * B5, B6, B9, B14; D-012 sessionId-stable idempotency). Every assertion reads
 * the fake collections back — outcome, not construction.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveContentHash } from "@vc/db";
import { startScribe, resumeScribe, SCRIBE_PURPOSE } from "../src/scribe/index.js";
import {
  makeHarness,
  mockProvider,
  baseInput,
  citedCandidate,
  seedConsent,
  STUDENT_ID,
  SESSION_ID,
} from "./scribe-fixtures.js";

const cfg = (threadId: string) => ({ threadId, counsellorId: "synthetic-test-counsellor" });

// ---------------------------------------------------------------------------
// B3: no write before approval
// ---------------------------------------------------------------------------

test("B3: the graph pauses at interrupt() with the diff and NOTHING is written before approval", async () => {
  const h = makeHarness({ tenantId: "scribe-test" });
  const outcome = await startScribe(h.graph, baseInput(), cfg("thread-b3"));

  assert.equal(outcome.kind, "awaiting_approval");
  if (outcome.kind !== "awaiting_approval") return;
  assert.equal(outcome.request.sessionId, SESSION_ID);
  assert.equal(outcome.request.studentId, STUDENT_ID);
  assert.deepEqual(
    outcome.request.diff.changes.map((c) => [c.op, c.key]),
    [
      ["add", "targetCountry"],
      ["add", "budget_inr_per_year"],
    ],
  );
  assert.match(outcome.request.summary, /Canada/);

  // Read the collections back: zero facts, zero edges.
  assert.equal(h.facts.size(), 0, "no fact may be written before the counsellor approves (B3)");
  assert.equal(h.edges.size(), 0, "no edge may be written before the counsellor approves (B3)");
  assert.equal(h.provider.calls.length, 2, "extraction + summary ran before the pause");
});

test("B3: approve writes the facts and their edges (read back)", async () => {
  const h = makeHarness({ tenantId: "scribe-test" });
  await startScribe(h.graph, baseInput(), cfg("thread-approve"));
  const outcome = await resumeScribe(h.graph, { action: "approve" }, cfg("thread-approve"));

  assert.equal(outcome.kind, "done");
  if (outcome.kind !== "done") return;
  assert.equal(outcome.result.status, "written");

  const open = h.openFacts();
  assert.equal(open.length, 2);
  const byKey = new Map(open.map((f) => [f.key, f]));
  assert.equal(byKey.get("targetCountry")?.value, "Canada");
  assert.equal(byKey.get("budget_inr_per_year")?.value, 2000000);
  for (const fact of open) {
    assert.equal(fact.studentId, STUDENT_ID);
    assert.equal(fact.source.type, "transcript");
    assert.ok(fact.purposeTags.includes(SCRIBE_PURPOSE));
    assert.equal(fact.validFrom, "2026-09-25T10:00:00.000Z", "validFrom comes from the session, never the model");
  }

  const edges = h.edges.all();
  assert.equal(edges.length, 4, "two edges per written fact: sourced_from + has");
  for (const fact of open) {
    assert.ok(
      edges.some((e) => e.rel === "sourced_from" && `scribe-test:${e.from.id}` === fact._id && e.to.kind === "session" && e.to.id === SESSION_ID),
      `fact ${fact.key} must be sourced_from the input session`,
    );
    assert.ok(
      edges.some((e) => e.rel === "has" && e.from.kind === "student" && e.from.id === STUDENT_ID && `scribe-test:${e.to.id}` === fact._id),
      `student must have fact ${fact.key}`,
    );
  }
  if (outcome.result.status === "written") {
    assert.deepEqual(outcome.result.writtenFactIds.map((id) => `scribe-test:${id}`).sort(), open.map((f) => f._id).sort());
  }
});

test("B3: reject writes nothing", async () => {
  const h = makeHarness({ tenantId: "scribe-test" });
  await startScribe(h.graph, baseInput(), cfg("thread-reject"));
  const outcome = await resumeScribe(h.graph, { action: "reject", reason: "not accurate" }, cfg("thread-reject"));

  assert.equal(outcome.kind, "done");
  if (outcome.kind !== "done") return;
  assert.equal(outcome.result.status, "rejected");
  assert.equal(h.facts.size(), 0);
  assert.equal(h.edges.size(), 0);
});

test("B3: edit writes the counsellor's edited values, not the model's", async () => {
  const h = makeHarness({ tenantId: "scribe-test" });
  const paused = await startScribe(h.graph, baseInput(), cfg("thread-edit")); assert.equal(paused.kind, "awaiting_approval"); if (paused.kind !== "awaiting_approval") return;
  const edited = {
    ...paused.request.facts.find(f => f.key === "budget_inr_per_year")!, value: 1800000,
  };
  const outcome = await resumeScribe(h.graph, { action: "edit", facts: [edited] }, cfg("thread-edit"));

  assert.equal(outcome.kind, "done");
  if (outcome.kind !== "done") return;
  assert.equal(outcome.result.status, "written");
  const open = h.openFacts();
  assert.equal(open.length, 1, "only the counsellor's edited list is written");
  assert.equal(open[0]?.key, "budget_inr_per_year");
  assert.equal(open[0]?.value, 1800000);
});

test("B2/B5: an edit carrying an uncited fact is refused and writes nothing", async () => {
  const h = makeHarness({ tenantId: "scribe-test" });
  await startScribe(h.graph, baseInput(), cfg("thread-edit-uncited"));
  const uncited = { key: "budget_inr_per_year", value: 1, confidence: 1, validFrom: "2026-09-25T10:00:00.000Z", purposeTags: ["x"], sensitivity: "low" };
  await assert.rejects(resumeScribe(h.graph, { action: "edit", facts: [uncited] } as never, cfg("thread-edit-uncited")));
  assert.equal(h.facts.size(), 0);
  assert.equal(h.edges.size(), 0);
});

test("B5: an unknown resume action is refused and writes nothing", async () => {
  const h = makeHarness({ tenantId: "scribe-test" });
  await startScribe(h.graph, baseInput(), cfg("thread-bad-action"));
  await assert.rejects(resumeScribe(h.graph, { action: "maybe" } as never, cfg("thread-bad-action")));
  assert.equal(h.facts.size(), 0);
});

// ---------------------------------------------------------------------------
// B9: crisis before any provider call
// ---------------------------------------------------------------------------

test("B9: a crisis transcript never calls the provider and returns an escalation", async () => {
  const h = makeHarness({ tenantId: "scribe-test" });
  const input = baseInput();
  input.turns.push({
    turnId: "t4",
    speaker: "student",
    lang: "en",
    text: "Honestly I just want to kill myself.",
    translatedText: "Honestly I just want to kill myself.",
    ts: 4,
  });
  const outcome = await startScribe(h.graph, input, cfg("thread-crisis"));

  assert.equal(h.provider.calls.length, 0, "no generative call may happen on a crisis transcript (B9)");
  assert.equal(outcome.kind, "done");
  if (outcome.kind !== "done") return;
  assert.equal(outcome.result.status, "escalated");
  if (outcome.result.status === "escalated") {
    assert.equal(outcome.result.escalation.level, "crisis");
    assert.equal(outcome.result.escalation.turnId, "t4");
  }
  assert.equal(h.facts.size(), 0);
});

test("B9 hostile variant: a crisis signal only in the ORIGINAL-language text (benign translation) still escalates", async () => {
  const h = makeHarness({ tenantId: "scribe-test" });
  const input = baseInput();
  input.turns.push({
    turnId: "t4",
    speaker: "student",
    lang: "hi-Latn",
    text: "kabhi kabhi lagta hai khud ko khatam kar doon",
    translatedText: "Sometimes I feel tired of everything.",
    ts: 4,
  });
  const outcome = await startScribe(h.graph, input, cfg("thread-crisis-orig"));
  assert.equal(h.provider.calls.length, 0);
  assert.equal(outcome.kind, "done");
  if (outcome.kind === "done") assert.equal(outcome.result.status, "escalated");
});

// ---------------------------------------------------------------------------
// B4: consent first
// ---------------------------------------------------------------------------

test("B4: no consent row -> refusal with zero provider calls and zero writes", async () => {
  const h = makeHarness({ tenantId: "scribe-test", consent: false });
  const outcome = await startScribe(h.graph, baseInput(), cfg("thread-no-consent"));
  assert.equal(h.provider.calls.length, 0);
  assert.equal(outcome.kind, "done");
  if (outcome.kind !== "done") return;
  assert.equal(outcome.result.status, "refused");
  assert.equal(h.facts.size(), 0);
});

test("B4 variants: consent for another purpose, or a minor without guardian consent, is refused before any provider call", async () => {
  for (const [label, overrides] of [
    ["wrong purpose", { purposes: ["application_filling"] }],
    ["minor without guardian", { guardianConsent: false }],
  ] as const) {
    const h = makeHarness({ tenantId: "scribe-test", consent: false });
    seedConsent(h.consents, { ...overrides, _id: `scribe-test:consent-${STUDENT_ID}`, tenantId: "scribe-test" } as never);
    const outcome = await startScribe(h.graph, baseInput(), cfg(`thread-consent-${label}`));
    assert.equal(h.provider.calls.length, 0, label);
    assert.equal(outcome.kind === "done" && outcome.result.status, "refused", label);
  }
});

test("B4/D027: no-consent deterministic crisis returns only minimal guard-only outcome with no provider call", async () => {
  const h = makeHarness({ tenantId: "scribe-test", consent: false });
  const input = baseInput();
  input.turns[0]!.translatedText = "I want to kill myself";
  const outcome = await startScribe(h.graph, input, cfg("thread-consent-first"));
  assert.equal(outcome.kind === "done" && outcome.result.status, "escalated");
  assert.equal(outcome.kind === "done" && outcome.result.status === "escalated" && outcome.result.escalation.type, "guard_only");
  assert.equal(h.provider.calls.length, 0);
});

// ---------------------------------------------------------------------------
// B2: uncited facts dropped
// ---------------------------------------------------------------------------

test("B2: uncited, fabricated-quote and unknown-turn facts from the model are dropped; only cited ones reach the diff", async () => {
  const provider = mockProvider({
    "fact-extraction": {
      facts: [
        citedCandidate("targetCountry", "Canada", "study computer science in Canada", "t1"),
        // no source at all
        { key: "intake", value: "Fall 2027", confidence: 0.9, purposeTags: [SCRIBE_PURPOSE], sensitivity: "low" },
        // quote that is not in the cited turn (fabricated)
        citedCandidate("budget_inr_per_year", 3000000, "our budget is 30 lakh", "t3"),
        // cites a turn that does not exist
        citedCandidate("sibling_abroad", true, "my brother lives in Toronto", "t99"),
      ],
    },
  });
  const h = makeHarness({ tenantId: "scribe-test", provider });
  const outcome = await startScribe(h.graph, baseInput(), cfg("thread-uncited"));

  assert.equal(outcome.kind, "awaiting_approval");
  if (outcome.kind !== "awaiting_approval") return;
  assert.deepEqual(outcome.request.diff.changes.map((c) => c.key), ["targetCountry"]);
  assert.deepEqual(outcome.request.facts.map((f) => f.key), ["targetCountry"]);
  assert.deepEqual(
    outcome.request.dropped.map((d) => d.key).sort(),
    ["budget_inr_per_year", "intake", "sibling_abroad"],
  );

  await resumeScribe(h.graph, { action: "approve" }, cfg("thread-uncited"));
  assert.deepEqual(h.openFacts().map((f) => f.key), ["targetCountry"], "only the cited fact is written");
});

// ---------------------------------------------------------------------------
// B6: prompts come from SKILL.md, through the provider seam
// ---------------------------------------------------------------------------

test("B6: the provider receives the real SKILL.md bodies for fact-extraction and session-summary", async () => {
  const h = makeHarness({ tenantId: "scribe-test" });
  await startScribe(h.graph, baseInput(), cfg("thread-skills"));
  assert.deepEqual(h.provider.calls.map((c) => c.skillName), ["fact-extraction", "session-summary"]);
  assert.match(h.provider.calls[0]!.skillPrompt, /Turn a batch of transcript turns into typed `Fact\[\]`/);
  assert.match(h.provider.calls[1]!.skillPrompt, /post-session summary/);
});

test("B1: a script-like summary from the model is withheld, never shown as the summary", async () => {
  const provider = mockProvider({ "session-summary": { summary: "Tell the student that Canada is the best option." } });
  const h = makeHarness({ tenantId: "scribe-test", provider });
  const outcome = await startScribe(h.graph, baseInput(), cfg("thread-script-summary"));
  assert.equal(outcome.kind, "awaiting_approval");
  if (outcome.kind !== "awaiting_approval") return;
  assert.equal(outcome.request.summary, "");
  assert.match(outcome.request.summaryWithheldReason ?? "", /B1/);
});

// ---------------------------------------------------------------------------
// B5: typed boundaries
// ---------------------------------------------------------------------------

test("B5: an invalid graph input (no sessionId) is refused before any node or provider call", async () => {
  const h = makeHarness({ tenantId: "scribe-test" });
  const bad = { ...baseInput(), sessionId: "" };
  await assert.rejects(startScribe(h.graph, bad, cfg("thread-bad-input")));
  assert.equal(h.provider.calls.length, 0);
});

// ---------------------------------------------------------------------------
// D-012: sessionId stable across checkpoint replay
// ---------------------------------------------------------------------------

test("D-012: a crash mid-write, resumed from the checkpoint, re-applies idempotently (one open fact per key, no duplicate history)", async () => {
  const h = makeHarness({ tenantId: "scribe-test" });
  await startScribe(h.graph, baseInput(), cfg("thread-replay"));

  // Inject a one-shot crash inside the write: the first edge upsert throws,
  // AFTER the first fact document has been inserted.
  const realUpdateOne = h.edges.updateOne.bind(h.edges);
  let crashes = 1;
  h.edges.updateOne = (async (...args: Parameters<typeof realUpdateOne>) => {
    if (crashes > 0) {
      crashes -= 1;
      throw new Error("simulated process crash inside the write node");
    }
    return realUpdateOne(...args);
  }) as typeof h.edges.updateOne;

  await assert.rejects(resumeScribe(h.graph, { action: "approve" }, cfg("thread-replay")), /simulated process crash/);
  assert.equal(h.facts.size(), 1, "the crash landed after the first fact insert");

  // Resume from the last checkpoint: LangGraph re-runs the failed write node.
  const outcome = await resumeScribe(h.graph, null, cfg("thread-replay"));
  assert.equal(outcome.kind === "done" && outcome.result.status, "written");

  const all = h.facts.all();
  assert.equal(all.length, 2, "no duplicate history: exactly one doc per key after replay");
  assert.equal(h.openFacts().length, 2, "exactly one open fact per key");
  for (const fact of all) {
    assert.equal(
      fact.contentHash,
      deriveContentHash(STUDENT_ID, fact.key, fact.value, SESSION_ID),
      "the contentHash is keyed on the INPUT sessionId",
    );
  }
  assert.equal(h.edges.size(), 4, "edges healed, none duplicated");
});

test("D-012 / ISS-t-007-c0-1: replaying the approval from the pre-approval checkpoint (fork) writes nothing new and is reported as already_resolved", async () => {
  const h = makeHarness({ tenantId: "scribe-test" });
  await startScribe(h.graph, baseInput(), cfg("thread-fork"));
  await resumeScribe(h.graph, { action: "approve" }, cfg("thread-fork"));
  const factsBefore = h.facts.all().map((f) => f._id).sort();
  const edgesBefore = h.edges.size();
  assert.equal(factsBefore.length, 2);

  // Find the checkpoint where the graph was paused at the approval interrupt, and resume from it again.
  let pausedCheckpointId: string | undefined;
  for await (const snap of h.graph.getStateHistory({ configurable: { thread_id: "thread-fork" } })) {
    if (snap.tasks.some((t) => t.interrupts.length > 0)) {
      pausedCheckpointId = snap.config.configurable?.checkpoint_id as string | undefined;
      break;
    }
  }
  assert.ok(pausedCheckpointId, "the paused checkpoint must be in the thread history");

  const outcome = await resumeScribe(h.graph, { action: "approve" }, { threadId: "thread-fork", checkpointId: pausedCheckpointId });
  assert.equal(outcome.kind, "already_resolved");
  assert.equal(outcome.kind === "already_resolved" && outcome.result?.status, "written");
  assert.deepEqual(h.facts.all().map((f) => f._id).sort(), factsBefore, "no new fact docs on replay");
  assert.equal(h.openFacts().length, 2);
  assert.equal(h.edges.size(), edgesBefore);
});

test("the second session re-confirming a changed value supersedes via the diff (update op) and keeps history", async () => {
  const h = makeHarness({ tenantId: "scribe-test" });
  await startScribe(h.graph, baseInput(), cfg("thread-s1"));
  await resumeScribe(h.graph, { action: "approve" }, cfg("thread-s1"));

  const provider2Facts = [citedCandidate("targetCountry", "Germany", "maybe Germany instead", "t1")];
  const input2 = baseInput({
    sessionId: "session-synthetic-2",
    turns: [{ turnId: "t1", speaker: "student", lang: "en", text: "maybe Germany instead", translatedText: "maybe Germany instead", ts: 1 }],
  });
  h.provider.setResponse("fact-extraction", { facts: provider2Facts });
  const outcome = await startScribe(h.graph, input2, cfg("thread-s2"));
  assert.equal(outcome.kind, "awaiting_approval");
  if (outcome.kind !== "awaiting_approval") return;
  assert.deepEqual(outcome.request.diff.changes, [{ op: "update", key: "targetCountry", before: "Canada", after: "Germany" }]);

  await resumeScribe(h.graph, { action: "approve" }, cfg("thread-s2"));
  const country = h.facts.all().filter((f) => f.key === "targetCountry");
  assert.equal(country.length, 2, "history kept (supersede, not delete)");
  assert.deepEqual(h.openFacts().filter((f) => f.key === "targetCountry").map((f) => f.value), ["Germany"]);
});

// ---------------------------------------------------------------------------
// T-007 fix cycle 1
// ---------------------------------------------------------------------------

test("ISS-t-007-rev-4: a genuine conflict on fact 2 (another writer holds the key with a different value) is a TERMINAL partial_conflict; fact 1 stays committed and is reported", async () => {
  const h = makeHarness({ tenantId: "scribe-test" });
  await startScribe(h.graph, baseInput(), cfg("thread-partial-conflict"));

  // A different writer opens budget_inr_per_year with a different value between our read and our
  // insert. The production partial unique index (INDEX_PLAN) makes our insert fail with 11000; the
  // re-read shows a foreign contentHash -> FactConflictError on fact #2 -> PartialApplyError.
  const realInsert = h.facts.insertOne.bind(h.facts);
  let raced = false;
  h.facts.insertOne = (async (doc: Parameters<typeof realInsert>[0]) => {
    if (!raced && doc.key === "budget_inr_per_year") {
      raced = true;
      await realInsert({ ...doc, _id: "rival-budget-fact", value: 999, contentHash: "rival-writer-hash", active: true });
    }
    return realInsert(doc);
  }) as typeof h.facts.insertOne;

  const outcome = await resumeScribe(h.graph, { action: "approve" }, cfg("thread-partial-conflict"));
  assert.equal(outcome.kind, "done");
  if (outcome.kind !== "done") return;
  assert.equal(outcome.result.status, "partial_conflict");
  if (outcome.result.status !== "partial_conflict") return;
  assert.equal(outcome.result.key, "budget_inr_per_year");

  // Read back: fact 1 committed with the approved value, and it is the one reported as written.
  const open = h.openFacts();
  const country = open.find((f) => f.key === "targetCountry");
  assert.equal(country?.value, "Canada");
  assert.deepEqual(outcome.result.writtenFactIds.map((id) => `scribe-test:${id}`), [country!._id]);
  // The rival writer's fact is untouched: no silent overwrite.
  const budget = open.find((f) => f.key === "budget_inr_per_year");
  assert.equal(budget?._id, "rival-budget-fact");
  assert.equal(budget?.value, 999);

  // Terminal: a checkpoint retry does not re-run the write or throw; the same result is reported.
  const again = await resumeScribe(h.graph, null, cfg("thread-partial-conflict"));
  assert.equal(again.kind === "done" && again.result.status, "partial_conflict");
  assert.equal(h.facts.size(), 2, "no further writes after the terminal result");
});

test("ISS-t-007-rev-5: scribe-extracted facts carry EXACTLY [profile_synthesis]; model-supplied purposeTags are stripped (diff and read-back)", async () => {
  const provider = mockProvider({
    "fact-extraction": {
      facts: [
        { ...citedCandidate("targetCountry", "Canada", "study computer science in Canada", "t1"), purposeTags: ["application_filling", SCRIBE_PURPOSE] },
        { ...citedCandidate("budget_inr_per_year", 2000000, "around 20 lakh rupees a year", "t3"), purposeTags: ["marketing"] },
      ],
    },
  });
  const h = makeHarness({ tenantId: "scribe-test", provider });
  const outcome = await startScribe(h.graph, baseInput(), cfg("thread-purpose-extract"));
  assert.equal(outcome.kind, "awaiting_approval");
  if (outcome.kind !== "awaiting_approval") return;
  for (const f of outcome.request.facts) assert.deepEqual(f.purposeTags, [SCRIBE_PURPOSE], f.key);

  await resumeScribe(h.graph, { action: "approve" }, cfg("thread-purpose-extract"));
  const open = h.openFacts();
  assert.equal(open.length, 2);
  for (const f of open) assert.deepEqual(f.purposeTags, [SCRIBE_PURPOSE], `read back ${f.key}`);
});

test("ISS-t-007-rev-5: the counsellor edit path cannot add purposes beyond profile_synthesis", async () => {
  const h = makeHarness({ tenantId: "scribe-test" });
  const paused = await startScribe(h.graph, baseInput(), cfg("thread-purpose-edit")); assert.equal(paused.kind, "awaiting_approval"); if (paused.kind !== "awaiting_approval") return;
  const edited = {
    ...paused.request.facts.find(f => f.key === "budget_inr_per_year")!, value: 1800000,
    purposeTags: ["application_filling", "counselling_session"],
  };
  const outcome = await resumeScribe(h.graph, { action: "edit", facts: [edited] }, cfg("thread-purpose-edit"));
  assert.equal(outcome.kind === "done" && outcome.result.status, "written");
  const open = h.openFacts();
  assert.equal(open.length, 1);
  assert.deepEqual(open[0]?.purposeTags, [SCRIBE_PURPOSE]);
});

async function pausedCheckpointOf(h: ReturnType<typeof makeHarness>, threadId: string): Promise<string> {
  for await (const snap of h.graph.getStateHistory({ configurable: { thread_id: threadId } })) {
    if (snap.tasks.some((t) => t.interrupts.length > 0)) return snap.config.configurable?.checkpoint_id as string;
  }
  throw new Error("no paused checkpoint in the thread history");
}

test("ISS-t-007-c0-1: approve, then fork-resume the SAME pre-approval checkpoint with reject -> already_resolved carrying the original decision; nothing claims the reject was applied", async () => {
  const h = makeHarness({ tenantId: "scribe-test" });
  await startScribe(h.graph, baseInput(), cfg("thread-resolved-fork"));
  await resumeScribe(h.graph, { action: "approve" }, cfg("thread-resolved-fork"));
  const factsBefore = h.facts.all().map((f) => f._id).sort();
  const paused = await pausedCheckpointOf(h, "thread-resolved-fork");

  const outcome = await resumeScribe(h.graph, { action: "reject", reason: "changed my mind" }, {
    threadId: "thread-resolved-fork",
    checkpointId: paused,
  });
  assert.equal(outcome.kind, "already_resolved", "a second, different decision must not be reported as done");
  if (outcome.kind !== "already_resolved") return;
  assert.equal(outcome.decision.approve, true, "carries the ORIGINAL decision");
  assert.equal(outcome.attempted.action, "reject", "echoes what was attempted, so the caller can see it was not applied");
  assert.equal(outcome.result?.status, "written", "the original, still-effective result");
  assert.deepEqual(h.facts.all().map((f) => f._id).sort(), factsBefore, "nothing new written");
  assert.equal(h.openFacts().length, 2, "the reject was not applied: the approved facts are still open");
});

test("ISS-t-007-c0-1: resuming an already-completed thread (no checkpointId) with a different decision is also already_resolved", async () => {
  const h = makeHarness({ tenantId: "scribe-test" });
  await startScribe(h.graph, baseInput(), cfg("thread-resolved-latest"));
  await resumeScribe(h.graph, { action: "reject" }, cfg("thread-resolved-latest"));
  const outcome = await resumeScribe(h.graph, { action: "approve" }, cfg("thread-resolved-latest"));
  assert.equal(outcome.kind, "already_resolved");
  if (outcome.kind === "already_resolved") assert.equal(outcome.decision.approve, false);
  assert.equal(h.facts.size(), 0, "the late approve wrote nothing");
});

test("ISS-t-007-rev-1: a schema-invalid extraction output is retried ONCE with the validation error appended, then succeeds", async () => {
  let n = 0;
  const provider = mockProvider({
    "fact-extraction": () =>
      n++ === 0 ? { notFacts: "oops" } : { facts: [citedCandidate("targetCountry", "Canada", "study computer science in Canada", "t1")] },
  });
  const h = makeHarness({ tenantId: "scribe-test", provider });
  const outcome = await startScribe(h.graph, baseInput(), cfg("thread-extract-retry"));
  assert.equal(outcome.kind, "awaiting_approval");
  const extractCalls = h.provider.calls.filter((c) => c.skillName === "fact-extraction");
  assert.equal(extractCalls.length, 2, "exactly one retry");
  const retryInput = extractCalls[1]!.input as { previousAttemptError?: string };
  assert.equal(retryInput.previousAttemptError, "Provider output did not match the required schema.", "fixed schema feedback is appended without raw provider paths");
});

test("ISS-t-007-rev-1: an always-malformed extraction output ends in a terminal extraction_failed result and writes nothing", async () => {
  const provider = mockProvider({ "fact-extraction": { notFacts: "never valid" } });
  const h = makeHarness({ tenantId: "scribe-test", provider });
  const outcome = await startScribe(h.graph, baseInput(), cfg("thread-extract-failed"));
  assert.equal(outcome.kind, "done");
  if (outcome.kind !== "done") return;
  assert.equal(outcome.result.status, "extraction_failed");
  assert.equal(h.provider.calls.filter((c) => c.skillName === "fact-extraction").length, 2, "bounded: 1 try + 1 retry");
  assert.equal(h.provider.calls.filter((c) => c.skillName === "session-summary").length, 0);
  assert.equal(h.facts.size(), 0);
  assert.equal(h.edges.size(), 0);
});

test("ISS-t-007-rev-1: a malformed summary is retried once; always-malformed ends in summary_failed and writes nothing", async () => {
  let n = 0;
  const once = mockProvider({ "session-summary": () => (n++ === 0 ? { summary: 12345 } : { summary: "Student wants Canada." }) });
  const h1 = makeHarness({ tenantId: "scribe-test", provider: once });
  const ok = await startScribe(h1.graph, baseInput(), cfg("thread-summary-retry"));
  assert.equal(ok.kind, "awaiting_approval");
  const summaryCalls = h1.provider.calls.filter((c) => c.skillName === "session-summary");
  assert.equal(summaryCalls.length, 2);
  assert.equal((summaryCalls[1]!.input as { previousAttemptError?: string }).previousAttemptError, "Provider output did not match the required schema.", "retry feedback exposes no raw provider field paths");

  const always = mockProvider({ "session-summary": { summary: 12345 } });
  const h2 = makeHarness({ tenantId: "scribe-test", provider: always });
  const failed = await startScribe(h2.graph, baseInput(), cfg("thread-summary-failed"));
  assert.equal(failed.kind === "done" && failed.result.status, "summary_failed");
  assert.equal(h2.provider.calls.filter((c) => c.skillName === "session-summary").length, 2);
  assert.equal(h2.facts.size(), 0);
  assert.equal(h2.edges.size(), 0);
});

// ---------------------------------------------------------------------------
// ISS-t-007-rev-8 / ISS-t-007-c1-2: concurrent resumes of ONE paused thread.
// The approval claim is an atomic insert into scribe_resolutions (unique
// threadId): exactly one caller wins; every loser gets already_resolved with
// the WINNER's decision and is never told "written" for its own response.
// ---------------------------------------------------------------------------

type Outcome = Awaited<ReturnType<typeof resumeScribe>>;
type Resp = Exclude<Parameters<typeof resumeScribe>[1], null>;

function editBudget(value: number, proposal: Fact): Resp {
  return {
    action: "edit",
    facts: [{ ...proposal, value }],
  } as Resp;
}

/** Settles every resume concurrently and pairs each outcome with what that caller submitted. */
async function raceResumes(h: ReturnType<typeof makeHarness>, threadId: string, responses: Resp[]) {
  const settled = await Promise.allSettled(responses.map((r, i) => resumeScribe(h.graph, r, { threadId, counsellorId: `race-actor-${i}` })));
  for (const s of settled) assert.equal(s.status, "fulfilled", s.status === "rejected" ? String(s.reason) : "");
  return settled.map((s, i) => ({ submitted: responses[i]!, outcome: (s as PromiseFulfilledResult<Outcome>).value }));
}

/** The persisted outcome must be exactly the winner's decision (read back). */
function assertPersistedMatches(h: ReturnType<typeof makeHarness>, winner: Resp) {
  const open = h.openFacts();
  if (winner.action === "reject") {
    assert.equal(h.facts.size(), 0, "winner rejected: nothing may be written");
    assert.equal(h.edges.size(), 0);
  } else if (winner.action === "approve") {
    assert.deepEqual(
      open.map((f) => [f.key, f.value]).sort(),
      [
        ["budget_inr_per_year", 2000000],
        ["targetCountry", "Canada"],
      ],
    );
    assert.equal(h.facts.size(), 2, "no double write");
    assert.equal(h.edges.size(), 4);
  } else {
    assert.deepEqual(open.map((f) => [f.key, f.value]), winner.facts.map((f) => [f.key, f.value]));
    assert.equal(h.facts.size(), winner.facts.length, "no double write");
    const claim = h.fakeDb.collection<any>("scribe_resolutions").all()[0];
    for (const f of open) { assert.equal(f.source.type, "counsellor-edit"); assert.deepEqual({ counsellorId: (f.source as any).counsellorId, editedAt: (f.source as any).editedAt }, claim.approvalMetadata); assert.deepEqual((f.source as any).editedFrom, winner.facts.find(p => p.key === f.key)!.source); }
  }
}

/**
 * Exactly one caller is told "done"; every other caller is already_resolved with the WINNER's
 * decision and its own attempted response echoed. Returns the winner.
 */
function assertOneWinner(results: Array<{ submitted: Resp; outcome: Outcome }>) {
  const done = results.filter((r) => r.outcome.kind === "done");
  assert.equal(done.length, 1, `exactly one caller may be told its decision was applied, got ${results.map((r) => r.outcome.kind)}`);
  const winner = done[0]!;
  for (const loser of results.filter((r) => r !== winner)) {
    assert.equal(loser.outcome.kind, "already_resolved", "a losing caller must get already_resolved, never done");
    if (loser.outcome.kind !== "already_resolved") continue;
    assert.equal(loser.outcome.decision.approve, winner.submitted.action !== "reject", "already_resolved carries the WINNER's decision");
    if (winner.submitted.action === "edit") {
      assert.deepEqual(loser.outcome.decision.edits?.map((f) => f.value), winner.submitted.facts.map((f) => f.value));
    }
    assert.deepEqual(loser.outcome.attempted, loser.submitted, "echoes the loser's own (unapplied) response");
    const sameAsWinner = JSON.stringify(loser.submitted) === JSON.stringify(winner.submitted);
    assert.equal(loser.outcome.sameAsWinner, sameAsWinner, "sameAsWinner is true only for an identical request");
  }
  return winner;
}

test("ISS-t-007-rev-8 (a): two DIFFERENT concurrent edits -> exactly one done, the other already_resolved with the winner's decision; persisted = winner", async () => {
  const h = makeHarness({ tenantId: "scribe-test" });
  const paused = await startScribe(h.graph, baseInput(), cfg("thread-race-edits")); assert.equal(paused.kind, "awaiting_approval"); if (paused.kind !== "awaiting_approval") return; const proposal = paused.request.facts.find(f => f.key === "budget_inr_per_year")!;
  const results = await raceResumes(h, "thread-race-edits", [editBudget(1800000, proposal), editBudget(1500000, proposal)]);
  const winner = assertOneWinner(results);
  assert.equal(winner.outcome.kind === "done" && winner.outcome.result.status, "written");
  assertPersistedMatches(h, winner.submitted);
});

test("ISS-t-007-rev-8 (b): approve racing reject (both orders) -> exactly one done; the loser is already_resolved with the winner's decision; persisted = winner", async () => {
  for (const order of [
    ["approve", "reject"],
    ["reject", "approve"],
  ] as const) {
    const h = makeHarness({ tenantId: "scribe-test" });
    const thread = `thread-race-ar-${order[0]}`;
    await startScribe(h.graph, baseInput(), cfg(thread));
    const responses = order.map((a) => (a === "approve" ? { action: "approve" } : { action: "reject", reason: "no" })) as Resp[];
    const winner = assertOneWinner(await raceResumes(h, thread, responses));
    assertPersistedMatches(h, winner.submitted);
  }
});

test("ISS-t-007-rev-8 (c): two IDENTICAL concurrent approves -> one done + one already_resolved(sameAsWinner), no double write", async () => {
  const h = makeHarness({ tenantId: "scribe-test" });
  await startScribe(h.graph, baseInput(), cfg("thread-race-same"));
  const results = await raceResumes(h, "thread-race-same", [{ action: "approve" }, { action: "approve" }]);
  assert.ok(results.some((r) => r.outcome.kind === "done"), "the identical request succeeds");
  for (const r of results) {
    if (r.outcome.kind === "done") {
      assert.equal(r.outcome.result.status, "written");
    } else {
      assert.equal(r.outcome.kind, "already_resolved");
      if (r.outcome.kind === "already_resolved") {
        assert.equal(r.outcome.sameAsWinner, true, "an identical request is flagged as the same as the winner");
        assert.equal(r.outcome.decision.approve, true);
      }
    }
  }
  assertPersistedMatches(h, { action: "approve" });
});

test("ISS-t-007-rev-8 (d): 5 concurrent mixed resumes -> exactly one winner, every loser carries its decision, persisted = winner", async () => {
  const h = makeHarness({ tenantId: "scribe-test" });
  const paused = await startScribe(h.graph, baseInput(), cfg("thread-race-5")); assert.equal(paused.kind, "awaiting_approval"); if (paused.kind !== "awaiting_approval") return; const proposal = paused.request.facts.find(f => f.key === "budget_inr_per_year")!;
  const responses: Resp[] = [
    editBudget(1700000, proposal),
    { action: "reject", reason: "no" },
    { action: "approve" },
    editBudget(1600000, proposal),
    { action: "reject", reason: "second opinion" },
  ];
  const winner = assertOneWinner(await raceResumes(h, "thread-race-5", responses));
  assertPersistedMatches(h, winner.submitted);
  // A later resume after the race is also already_resolved with the same winner, and changes nothing.
  const late = await resumeScribe(h.graph, { action: "approve" }, cfg("thread-race-5"));
  assert.equal(late.kind, "already_resolved");
  if (late.kind === "already_resolved") assert.equal(late.decision.approve, winner.submitted.action !== "reject");
  assertPersistedMatches(h, winner.submitted);
});

test("ISS-t-007-rev-8: a crash AFTER the claim but BEFORE graph.invoke -> a rival decision is already_resolved; resumeScribe(null) completes the CLAIMED decision", async () => {
  const h = makeHarness({ tenantId: "scribe-test" });
  const paused = await startScribe(h.graph, baseInput(), cfg("thread-claim-crash")); assert.equal(paused.kind, "awaiting_approval"); if (paused.kind !== "awaiting_approval") return; const proposal = paused.request.facts.find(f => f.key === "budget_inr_per_year")!;
  const realInvoke = h.graph.invoke.bind(h.graph);
  let crashes = 1;
  (h.graph as unknown as { invoke: unknown }).invoke = async (...args: Parameters<typeof realInvoke>) => {
    if (crashes > 0) {
      crashes -= 1;
      throw new Error("simulated crash between the claim and the graph invoke");
    }
    return realInvoke(...args);
  };

  await assert.rejects(resumeScribe(h.graph, editBudget(1800000, proposal), cfg("thread-claim-crash")), /simulated crash/);
  assert.equal(h.facts.size(), 0, "nothing written yet");

  // A different decision cannot steal the claim.
  const rival = await resumeScribe(h.graph, { action: "approve" }, cfg("thread-claim-crash"));
  assert.equal(rival.kind, "already_resolved");
  if (rival.kind === "already_resolved") {
    assert.equal(rival.result, null, "the claimed decision is not applied yet");
    assert.deepEqual(rival.decision.edits?.map((f) => f.value), [1800000], "carries the CLAIMED decision");
    assert.equal(rival.sameAsWinner, false);
  }
  assert.equal(h.facts.size(), 0);

  // Crash recovery: a null resume applies the claimed decision, and only it.
  const recovered = await resumeScribe(h.graph, null, { threadId: "thread-claim-crash", counsellorId: "different-recovery-actor" });
  assert.equal(recovered.kind, "done");
  assert.equal(recovered.kind === "done" && recovered.result.status, "written");
  assertPersistedMatches(h, editBudget(1800000, proposal));
});

test("ISS-t-007-c1-1: the scribe's written facts are found by a purpose-filtered find() on the shared fake (profile_synthesis -> 2, application_filling -> 0)", async () => {
  const h = makeHarness({ tenantId: "scribe-test" });
  await startScribe(h.graph, baseInput(), cfg("thread-purpose-read"));
  await resumeScribe(h.graph, { action: "approve" }, cfg("thread-purpose-read"));
  const synth = await h.facts.find({ studentId: STUDENT_ID, active: true, purposeTags: SCRIBE_PURPOSE }).toArray();
  assert.equal(synth.length, 2, "the consented purpose must not silently return zero");
  const app = await h.facts.find({ studentId: STUDENT_ID, active: true, purposeTags: "application_filling" }).toArray();
  assert.equal(app.length, 0);
});
