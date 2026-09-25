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

const cfg = (threadId: string) => ({ threadId });

// ---------------------------------------------------------------------------
// B3: no write before approval
// ---------------------------------------------------------------------------

test("B3: the graph pauses at interrupt() with the diff and NOTHING is written before approval", async () => {
  const h = makeHarness();
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
  const h = makeHarness();
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
      edges.some((e) => e.rel === "sourced_from" && e.from.id === fact._id && e.to.kind === "session" && e.to.id === SESSION_ID),
      `fact ${fact.key} must be sourced_from the input session`,
    );
    assert.ok(
      edges.some((e) => e.rel === "has" && e.from.kind === "student" && e.from.id === STUDENT_ID && e.to.id === fact._id),
      `student must have fact ${fact.key}`,
    );
  }
  if (outcome.result.status === "written") {
    assert.deepEqual([...outcome.result.writtenFactIds].sort(), open.map((f) => f._id).sort());
  }
});

test("B3: reject writes nothing", async () => {
  const h = makeHarness();
  await startScribe(h.graph, baseInput(), cfg("thread-reject"));
  const outcome = await resumeScribe(h.graph, { action: "reject", reason: "not accurate" }, cfg("thread-reject"));

  assert.equal(outcome.kind, "done");
  if (outcome.kind !== "done") return;
  assert.equal(outcome.result.status, "rejected");
  assert.equal(h.facts.size(), 0);
  assert.equal(h.edges.size(), 0);
});

test("B3: edit writes the counsellor's edited values, not the model's", async () => {
  const h = makeHarness();
  await startScribe(h.graph, baseInput(), cfg("thread-edit"));
  const edited = {
    ...citedCandidate("budget_inr_per_year", 1800000, "around 20 lakh rupees a year", "t3"),
    validFrom: "2026-09-25T10:00:00.000Z",
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
  const h = makeHarness();
  await startScribe(h.graph, baseInput(), cfg("thread-edit-uncited"));
  const uncited = { key: "budget_inr_per_year", value: 1, confidence: 1, validFrom: "2026-09-25T10:00:00.000Z", purposeTags: ["x"], sensitivity: "low" };
  await assert.rejects(resumeScribe(h.graph, { action: "edit", facts: [uncited] } as never, cfg("thread-edit-uncited")));
  assert.equal(h.facts.size(), 0);
  assert.equal(h.edges.size(), 0);
});

test("B5: an unknown resume action is refused and writes nothing", async () => {
  const h = makeHarness();
  await startScribe(h.graph, baseInput(), cfg("thread-bad-action"));
  await assert.rejects(resumeScribe(h.graph, { action: "maybe" } as never, cfg("thread-bad-action")));
  assert.equal(h.facts.size(), 0);
});

// ---------------------------------------------------------------------------
// B9: crisis before any provider call
// ---------------------------------------------------------------------------

test("B9: a crisis transcript never calls the provider and returns an escalation", async () => {
  const h = makeHarness();
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
  const h = makeHarness();
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
  const h = makeHarness({ consent: false });
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
    const h = makeHarness({ consent: false });
    seedConsent(h.consents, overrides);
    const outcome = await startScribe(h.graph, baseInput(), cfg(`thread-consent-${label}`));
    assert.equal(h.provider.calls.length, 0, label);
    assert.equal(outcome.kind === "done" && outcome.result.status, "refused", label);
  }
});

test("B4: consent is checked before the crisis guard and the provider (a refused session produces no escalation either)", async () => {
  const h = makeHarness({ consent: false });
  const input = baseInput();
  input.turns[0]!.translatedText = "I want to kill myself";
  const outcome = await startScribe(h.graph, input, cfg("thread-consent-first"));
  assert.equal(outcome.kind === "done" && outcome.result.status, "refused");
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
  const h = makeHarness({ provider });
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
  const h = makeHarness();
  await startScribe(h.graph, baseInput(), cfg("thread-skills"));
  assert.deepEqual(h.provider.calls.map((c) => c.skillName), ["fact-extraction", "session-summary"]);
  assert.match(h.provider.calls[0]!.skillPrompt, /Turn a batch of transcript turns into typed `Fact\[\]`/);
  assert.match(h.provider.calls[1]!.skillPrompt, /post-session summary/);
});

test("B1: a script-like summary from the model is withheld, never shown as the summary", async () => {
  const provider = mockProvider({ "session-summary": { summary: "Tell the student that Canada is the best option." } });
  const h = makeHarness({ provider });
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
  const h = makeHarness();
  const bad = { ...baseInput(), sessionId: "" };
  await assert.rejects(startScribe(h.graph, bad, cfg("thread-bad-input")));
  assert.equal(h.provider.calls.length, 0);
});

// ---------------------------------------------------------------------------
// D-012: sessionId stable across checkpoint replay
// ---------------------------------------------------------------------------

test("D-012: a crash mid-write, resumed from the checkpoint, re-applies idempotently (one open fact per key, no duplicate history)", async () => {
  const h = makeHarness();
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

test("D-012: replaying the approval from the pre-approval checkpoint (fork) writes nothing new", async () => {
  const h = makeHarness();
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
  assert.equal(outcome.kind === "done" && outcome.result.status, "written");
  assert.deepEqual(h.facts.all().map((f) => f._id).sort(), factsBefore, "no new fact docs on replay");
  assert.equal(h.openFacts().length, 2);
  assert.equal(h.edges.size(), edgesBefore);
});

test("the second session re-confirming a changed value supersedes via the diff (update op) and keeps history", async () => {
  const h = makeHarness();
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
