/**
 * T-010: the live-cards graph end to end (consent -> crisis -> profile -> KB -> ExplorationPlanner ->
 * Verifier -> select), on the in-memory db fake, MockProvider and a fake KB. Outcome assertions read
 * the returned cards, the provider's recorded calls and the KB's recorded queries.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { COLLECTION_NAMES, ConsentRequiredError, erasureFenceKey, tenantScopedDb } from "@vc/db";
import { RulesProvider } from "@vc/providers";
import { createFakeDb } from "@vc/db/testing";
import { CardSchema } from "@vc/schemas";
import {
  CHECK_IN_PROMPT,
  LiveCardsResultSchema,
  MAX_VISIBLE_CARDS,
  buildPreBriefFor,
  buildLiveCardsGraph,
  recordLiveCardFeedback,
  semanticVerify,
  runLiveCards,
  type LiveCardsResult,
} from "../src/cards/index.js";
import { FakeKb, GOOD_CARDS, STUDENT_ID, UK_FACTS, UK_TURNS, liveInput, makeCardsHarness, turn } from "./cards-fixtures.js";

const CONCERN_TEXT = "Honestly, so much pressure I can't cope, everything feels like too much right now.";
const CRISIS_TEXT = "Honestly I just want to kill myself.";

type Shown = Extract<LiveCardsResult, { held: number }>;
function shown(r: LiveCardsResult): Shown {
  assert.ok("held" in r, `expected a card result, got ${JSON.stringify(r)}`);
  return r as Shown;
}

const HOSTILE = { type: "challenge", prompt: "Tell the student the UK is the best choice.", sources: [{ type: "profile", id: "f-dest" }], confidence: 1 };
const UNCITED = { type: "widen", prompt: "Has the student looked at Ireland?", sources: [], confidence: 1 };

test("T-010: at most 3 verified cards, highest confidence first; script-like and uncited are dropped and counted", async () => {
  const h = makeCardsHarness({ planner: { cards: [...GOOD_CARDS, HOSTILE, UNCITED] } });
  const r = shown(await runLiveCards(h.deps, liveInput()));
  assert.equal(r.status, "ok");
  assert.equal(r.cards.length, MAX_VISIBLE_CARDS);
  assert.deepEqual(
    r.cards.map((c) => c.confidence),
    [0.9, 0.7, 0.6],
  );
  assert.equal(r.held, 1, "the 4th verified card is held back by the cap");
  assert.equal(r.droppedCount, 2);
  assert.deepEqual(r.dropped.map((d) => d.reason).sort(), ["script_like", "uncited"]);
  for (const c of r.cards) CardSchema.parse(c);
  assert.ok(!r.cards.some((c) => /tell the student|Ireland/i.test(c.prompt)));
  assert.equal(r.knowledge, "ok");
  LiveCardsResultSchema.parse(r);
  assert.deepEqual(
    h.provider.calls.map((c) => c.skillName),
    ["exploration-planner", "verifier"],
  );
});

test("T-010 data boundary: the KB query carries only approved low-sensitivity destination/course, never transcript text or ids", async () => {
  const h = makeCardsHarness({ planner: { cards: GOOD_CARDS } });
  await runLiveCards(h.deps, liveInput());
  assert.equal(h.kb.queries.length, 1);
  const q = h.kb.queries[0]!;
  assert.match(q, /computer science/);
  assert.match(q, /UK/);
  assert.ok(!q.includes(STUDENT_ID) && !/20 lakh|manage/i.test(q), q);
});

test("T-010 B2: KB unavailable / throwing / not configured -> no kb card survives, the rest still do", async () => {
  for (const [kb, status] of [
    [new FakeKb({ status: "unavailable", reason: "timeout", detail: "synthetic" }), "unavailable"],
    [new FakeKb(new Error("socket hang up")), "unavailable"],
    [null, "not_configured"],
  ] as const) {
    const h = makeCardsHarness({ planner: { cards: GOOD_CARDS }, kb });
    const r = shown(await runLiveCards(h.deps, liveInput()));
    assert.equal(r.knowledge, status);
    assert.ok(!r.cards.some((c) => c.sources.some((s) => s.type === "kb")), `kb card shown with knowledge=${status}`);
    assert.equal(r.cards.length, 2, "the two profile-cited cards remain");
    assert.deepEqual(r.dropped.map((d) => d.reason), ["unresolved_source", "unresolved_source"]);
  }
});

test("T-010: KB 'ok' with no citations is treated as unavailable (no uncited answer, B21)", async () => {
  const kb = new FakeKb({ status: "ok", answer: "x", citations: { internal: [], web: [] } });
  const r = shown(await runLiveCards(makeCardsHarness({ planner: { cards: GOOD_CARDS }, kb }).deps, liveInput()));
  assert.equal(r.knowledge, "unavailable");
});

test("T-010 quiet mode: no planner card is shown, only counted", async () => {
  const h = makeCardsHarness({ planner: { cards: GOOD_CARDS } });
  const r = shown(await runLiveCards(h.deps, liveInput({ quiet: true })));
  assert.equal(r.cards.length, 0);
  assert.equal(r.suppressedByQuiet, 4);
  assert.equal(r.quiet, true);
});

test("T-022 / B20: a concern-level turn adds ONE cited check-in card, shown first, even in quiet mode", async () => {
  const turns = [...UK_TURNS, turn("t4", "student", CONCERN_TEXT, 4)];
  for (const quiet of [false, true]) {
    const h = makeCardsHarness({ planner: { cards: GOOD_CARDS } });
    const r = shown(await runLiveCards(h.deps, liveInput({ turns, quiet })));
    const first = r.cards[0]!;
    assert.equal(first.type, "check-in");
    assert.equal(first.prompt, CHECK_IN_PROMPT);
    assert.ok(first.prompt.trim().endsWith("?"), "a question, never a script (B1)");
    assert.deepEqual(first.sources, [{ type: "transcript", id: "t4", quote: CONCERN_TEXT }]);
    assert.equal(r.cards.filter((c) => c.type === "check-in").length, 1);
    assert.equal(r.cards.length, quiet ? 1 : MAX_VISIBLE_CARDS);
  }
});

test("B9: a crisis turn ends 'escalated' with no card and NO provider or KB call", async () => {
  const h = makeCardsHarness({ planner: { cards: GOOD_CARDS } });
  const r = await runLiveCards(h.deps, liveInput({ turns: [...UK_TURNS, turn("t4", "student", CRISIS_TEXT, 4)] }));
  assert.equal(r.status, "escalated");
  assert.ok(r.status === "escalated" && r.cards.length === 0 && r.escalation.level === "crisis");
  assert.equal(h.provider.calls.length, 0);
  assert.equal(h.kb.queries.length, 0);
});

test("B4: no consent -> 'refused' before anything is read, no provider or KB call", async () => {
  const h = makeCardsHarness({ planner: { cards: GOOD_CARDS }, consent: false });
  const r = await runLiveCards(h.deps, liveInput());
  assert.equal(r.status, "refused");
  assert.equal(h.provider.calls.length, 0);
  assert.equal(h.kb.queries.length, 0);
  await assert.rejects(buildPreBriefFor(h.deps, { studentId: STUDENT_ID }), (e: unknown) => e instanceof ConsentRequiredError);
});

test("B6: AI unavailable (rules provider has no planner) -> 'ai_unavailable', no unverified card, check-in still shown", async () => {
  const h = makeCardsHarness({ provider: new RulesProvider() });
  const r = shown(await runLiveCards(h.deps, liveInput({ turns: [...UK_TURNS, turn("t4", "student", CONCERN_TEXT, 4)] })));
  assert.equal(r.status, "ai_unavailable");
  assert.deepEqual(r.cards.map((c) => c.type), ["check-in"]);
  assert.ok(r.preBrief.knownFacts.length > 0, "the pre-brief is still served");
});

test("B5: a schema-invalid planner output is re-asked once, then 'planner_failed' with no card", async () => {
  const h = makeCardsHarness({ planner: { notCards: true } });
  const r = shown(await runLiveCards(h.deps, liveInput()));
  assert.equal(r.status, "planner_failed");
  assert.equal(r.cards.length, 0);
  assert.equal(h.provider.calls.length, 2);
});

test("B5: invalid live-cards input is refused at the boundary", async () => {
  const h = makeCardsHarness();
  const bad: unknown[] = [
    { ...liveInput(), turns: [] },
    { ...liveInput(), extra: 1 },
    { ...liveInput(), turns: [turn("t1", "student", "a"), turn("t1", "student", "b")] },
    { ...liveInput(), studentId: "" },
    { ...liveInput(), quiet: "yes" },
  ];
  for (const input of bad) await assert.rejects(runLiveCards(h.deps, input), { name: "ZodError" });
  assert.equal(h.provider.calls.length, 0);
});

test("T049 semantic verifier is mandatory, can only drop, and fails closed on a bad verdict", async () => {
  const keepOne = (input: unknown) => ({ decisions: (input as { cards: { id: string; prompt: string }[] }).cards.map((card, index) => ({ cardId: card.id, noScript: index === 0 ? "clear" : "violation", citation: "clear", confidence: 1, offendingSpans: index === 0 ? [] : [{ start: 0, end: 1, text: card.prompt.slice(0, 1) }] })) });
  const h = makeCardsHarness({ planner: { cards: GOOD_CARDS }, verifier: keepOne, semanticVerifier: true });
  const r = shown(await runLiveCards(h.deps, liveInput()));
  assert.equal(r.cards.length, 1);
  assert.equal(r.dropped.filter((d) => d.reason === "verifier_rejected").length, 3);

  const addsNew = makeCardsHarness({ planner: { cards: GOOD_CARDS }, verifier: { keepIds: ["card_invented"] }, semanticVerifier: true });
  assert.equal(shown(await runLiveCards(addsNew.deps, liveInput())).cards.length, 0, "an unknown id never adds a card");

  const bad = makeCardsHarness({
    planner: { cards: GOOD_CARDS },
    verifier: { nope: 1 },
    semanticVerifier: true,
  });
  const turns = [...UK_TURNS, turn("t4", "student", CONCERN_TEXT, 4)];
  const failed = shown(await runLiveCards(bad.deps, liveInput({ turns })));
  assert.deepEqual(failed.cards.map((c) => c.type), ["check-in"], "fail closed: only the deterministic check-in survives");
});

test("T-010 pre-brief: known facts, open questions and do-not-ask from the approved profile (no provider call)", async () => {
  const h = makeCardsHarness();
  const brief = await buildPreBriefFor(h.deps, { studentId: STUDENT_ID });
  assert.equal(brief.knownFacts.length, 3);
  assert.ok(brief.doNotAsk.includes("budget"));
  assert.ok(!brief.openQuestions.some((q) => /budget/i.test(q)));
  assert.equal(h.provider.calls.length, 0);
});

test("B18 end to end: an India-only student's visa card and a known-fact re-ask never reach the panel", async () => {
  const cite = [{ type: "transcript", id: "t1", quote: "study in India" }];
  const h = makeCardsHarness({
    planner: {
      cards: [
        { type: "widen", prompt: "Has the student started the student visa paperwork?", sources: cite, confidence: 1 },
        { type: "clarify", prompt: "What is the student's budget?", sources: [{ type: "profile", id: "f-budget" }], confidence: 1 },
        { type: "widen", prompt: "Besides engineering, which other fields has the student enjoyed?", sources: cite, confidence: 0.5 },
      ],
    },
    facts: [UK_FACTS[1]!],
  });
  const r = shown(await runLiveCards(h.deps, liveInput({ turns: [turn("t1", "student", "I only want to study in India, near home.")] })));
  assert.deepEqual(r.dropped.map((d) => d.reason), ["not_applicable", "already_known"]);
  assert.deepEqual(r.cards.map((c) => c.prompt), ["Besides engineering, which other fields has the student enjoyed?"]);
});

test("SC-019 / B9: a Hindi (Devanagari) self-harm phrase mid-session escalates before any generative call", async () => {
  const h = makeCardsHarness({ planner: { cards: GOOD_CARDS } });
  const hindi = "मैं मरना चाहता हूं, अब कुछ अच्छा नहीं लगता";
  const r = await runLiveCards(h.deps, liveInput({ turns: [...UK_TURNS, { turnId: "t4", speaker: "student", lang: "hi", text: hindi, translatedText: "", ts: 4 }] }));
  assert.equal(r.status, "escalated");
  assert.equal(h.provider.calls.length, 0);
});


test("T049 mandatory semantic gate refuses missing verdict even with legacy flag false", async () => {
  const h = makeCardsHarness({ planner: { cards: GOOD_CARDS }, verifier: {}, semanticVerifier: false });
  const result = shown(await runLiveCards(h.deps, liveInput()));
  assert.deepEqual(result.cards, [], "unjudged model cards must never release");
});

test("T049 complete clear semantic judgments preserve exact card text and citations", async () => {
  const h = makeCardsHarness({ planner: { cards: GOOD_CARDS }, semanticVerifier: true,
    verifier: (input: unknown) => ({ decisions: (input as { cards: { id: string }[] }).cards.map(c => ({
      cardId: c.id, noScript: "clear", citation: "clear", confidence: 1, offendingSpans: [],
    })) }),
  });
  const result = shown(await runLiveCards(h.deps, liveInput()));
  assert.equal(result.cards.length, 3);
  for (const card of result.cards) {
    const original = GOOD_CARDS.find(candidate => candidate.prompt === card.prompt)!;
    assert.ok(original);
    assert.deepEqual(card.sources, original.sources);
  }
});


test("T049 malformed, incomplete, ambiguous and uncertain judgments withhold actual cards", async () => {
  const variants = ["missing", "duplicate", "unknown", "extra", "uncertain", "low", "nonfinite", "negativeSpan", "wrongSpan", "clearSpan", "violationWithoutSpan"];
  for (const variant of variants) {
    const h = makeCardsHarness({ planner: { cards: GOOD_CARDS }, verifier: (input: unknown) => {
      const cards = (input as { cards: { id: string; prompt: string }[] }).cards;
      const decisions = cards.map(card => ({ cardId: card.id, noScript: "clear", citation: "clear", confidence: 1, offendingSpans: [] as { start: number; end: number; text: string }[] }));
      if (variant === "missing") decisions.pop();
      if (variant === "duplicate") decisions[1] = { ...decisions[0]! };
      if (variant === "unknown") decisions[0]!.cardId = "invented";
      if (variant === "uncertain") for (const decision of decisions) decision.noScript = "uncertain";
      if (variant === "low") for (const decision of decisions) decision.confidence = 0.94;
      if (variant === "nonfinite") decisions[0]!.confidence = Infinity;
      if (["negativeSpan", "wrongSpan", "clearSpan"].includes(variant)) decisions[0]!.offendingSpans = [{ start: variant === "negativeSpan" ? -1 : 0, end: 1, text: variant === "wrongSpan" ? "forged" : cards[0]!.prompt.slice(0, 1) }];
      if (variant === "violationWithoutSpan") decisions[0]!.noScript = "violation";
      return variant === "extra" ? { decisions, keepAll: true } : { decisions };
    } });
    const result = shown(await runLiveCards(h.deps, liveInput()));
    assert.deepEqual(result.cards, [], variant);
    assert.equal(h.provider.calls.filter(call => call.skillName === "verifier").length, 1, "malformed verdict never re-asked");
  }
});

test("T049 semantic input preserves original-language cited evidence; missing source evidence cannot release", async () => {
  const original = { ...turn("hin", "student", "मुझे भारत में पढ़ना है"), lang: "hi", translatedText: "I want to study in India." };
  const h = makeCardsHarness({ facts: [], planner: { cards: [{ type: "widen", prompt: "Which other subjects has the student enjoyed?", sources: [{ type: "transcript", id: "hin", quote: original.text }], confidence: 1 }] } });
  const result = shown(await runLiveCards(h.deps, liveInput({ turns: [original] })));
  assert.equal(result.cards.length, 1);
  const verifier = h.provider.calls.find(call => call.skillName === "verifier")!;
  assert.deepEqual((verifier.input as { turns: unknown[] }).turns, [original]);
  const missing = await semanticVerify(result.cards, { knownFacts: [], knowledge: { status: "no_query", evidence: [] } }, h.deps);
  assert.deepEqual(missing.kept, []);
  assert.equal(h.provider.calls.filter(call => call.skillName === "verifier").length, 1);
});

test("T049 history changed during planner generation refuses before verifier disclosure", async () => {
  const h = makeCardsHarness({ planner: { cards: GOOD_CARDS } });
  h.provider.setResponse("exploration-planner", () => {
    h.fakeDb.collection(COLLECTION_NAMES.facts).seed({ ...UK_FACTS[0]!, _id: "cards-test:f-dest", tenantId: "cards-test", value: "Canada" });
    return { cards: GOOD_CARDS };
  });
  await assert.rejects(runLiveCards(h.deps, liveInput()), { name: "ProviderAuthorizationRefusedError" });
  assert.deepEqual(h.provider.calls.map(call => call.skillName), ["exploration-planner"]);
});

test("T049 history changed during semantic generation refuses final publication", async () => {
  const h = makeCardsHarness({ planner: { cards: GOOD_CARDS } });
  h.provider.setResponse("verifier", (input: unknown) => {
    h.fakeDb.collection(COLLECTION_NAMES.facts).seed({ ...UK_FACTS[0]!, _id: "cards-test:f-dest", tenantId: "cards-test", value: "Canada" });
    return { decisions: (input as { cards: { id: string }[] }).cards.map(card => ({ cardId: card.id, noScript: "clear", citation: "clear", confidence: 1, offendingSpans: [] })) };
  });
  await assert.rejects(runLiveCards(h.deps, liveInput()), { name: "ProviderAuthorizationRefusedError" });
});

test("T049 consent revoked during planner generation refuses verifier disclosure", async () => {
  const h = makeCardsHarness({ planner: { cards: GOOD_CARDS } });
  h.provider.setResponse("exploration-planner", () => {
    h.fakeDb.collection(COLLECTION_NAMES.consents).seed({ _id: `cards-test:consent-${STUDENT_ID}`, tenantId: "cards-test", studentId: STUDENT_ID, guardianConsent: false, purposes: [], recordedAt: "2026-09-01T00:00:00.000Z", minor: true });
    return { cards: GOOD_CARDS };
  });
  await assert.rejects(runLiveCards(h.deps, liveInput()), { name: "ProviderAuthorizationRefusedError" });
  assert.equal(h.provider.calls.filter(call => call.skillName === "verifier").length, 0);
});

test("T049 nested second compiled graph cannot inherit an outer invocation's approved snapshot", async () => {
  const outer = makeCardsHarness({ planner: { cards: GOOD_CARDS } });
  const other = makeCardsHarness({ consent: false, planner: { cards: GOOD_CARDS } });
  const second = buildLiveCardsGraph(other.deps).compile();
  const provider = outer.provider.generate.bind(outer.provider);
  let nested: LiveCardsResult | undefined;
  outer.provider.generate = async request => {
    if (request.skillName === "exploration-planner") nested = (await second.invoke(liveInput())).result;
    return provider(request);
  };
  const result = shown(await runLiveCards(outer.deps, liveInput()));
  assert.equal(result.cards.length, 3);
  assert.equal(nested?.status, "refused");
  assert.equal(other.provider.calls.length, 0);
});

test("T049 deadline aborts held planner and prevents late semantic execution", async () => {
  const h = makeCardsHarness({ planner: { cards: GOOD_CARDS } });
  const provider = h.provider.generate.bind(h.provider);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  h.provider.generate = async request => { if (request.skillName === "exploration-planner") await held; return provider(request); };
  await assert.rejects(runLiveCards({ ...h.deps, deadlineMs: 50 }, liveInput()), { name: "AbortError" });
  release();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(h.provider.calls.length, 0);
});

test("T050 scoped consented feedback reports unavailable without writing any registered collection", async () => {
  const h = makeCardsHarness();
  const snapshot = Object.fromEntries(Object.values(COLLECTION_NAMES).map(name => [name, h.fakeDb.collection(name).all()]));
  await assert.rejects(recordLiveCardFeedback(h.db, { studentId: STUDENT_ID, sessionId: "session", counsellorId: "staff", event: { cardId: "card_a", ts: 1788220800000, action: "up" } }), { name: "CardFeedbackUnavailableError" });
  assert.deepEqual(Object.fromEntries(Object.values(COLLECTION_NAMES).map(name => [name, h.fakeDb.collection(name).all()])), snapshot);
});

test("T050 unscoped feedback refuses before every collection read or write", async () => {
  const h = makeCardsHarness();
  let accesses = 0;
  const unscoped = new Proxy({} as typeof h.db, { get: (_target, key) => { if (key === "collection") { accesses += 1; throw new Error("unexpected collection access"); } return undefined; } });
  await assert.rejects(recordLiveCardFeedback(unscoped, { studentId: STUDENT_ID, sessionId: "session", counsellorId: "staff", event: { cardId: "card_a", ts: 1788220800000, action: "up" } }), { name: "ProviderAuthorizationRefusedError" });
  assert.equal(accesses, 0);
});

test("T050 other tenant and absent consent refuse without fabricating feedback", async () => {
  const h = makeCardsHarness();
  const { db } = createFakeDb();
  const other = tenantScopedDb(db, "other-tenant");
  for (const scoped of [other, makeCardsHarness({ consent: false }).db]) await assert.rejects(recordLiveCardFeedback(scoped, { studentId: STUDENT_ID, sessionId: "session", counsellorId: "staff", event: { cardId: "card_a", ts: 1788220800000, action: "up" } }), { name: "ConsentRequiredError" });
});


test("T050 active fence refuses feedback and leaves every collection unchanged", async () => {
  const h = makeCardsHarness();
  const key = erasureFenceKey(STUDENT_ID);
  h.fakeDb.collection(COLLECTION_NAMES.erasure_fences).seed({ _id: `cards-test:${key}`, tenantId: "cards-test", studentKey: key, requestId: "blocked", createdAt: new Date().toISOString() });
  const snapshot = Object.fromEntries(Object.values(COLLECTION_NAMES).map(name => [name, h.fakeDb.collection(name).all()]));
  await assert.rejects(recordLiveCardFeedback(h.db, { studentId: STUDENT_ID, sessionId: "session", counsellorId: "staff", event: { cardId: "card_a", ts: 1, action: "up" } }), { name: "ConsentRequiredError" });
  assert.deepEqual(Object.fromEntries(Object.values(COLLECTION_NAMES).map(name => [name, h.fakeDb.collection(name).all()])), snapshot);
});


test("T049 separate compilations of the same builder retain independent private identities", async () => {
  const h = makeCardsHarness({ planner: { cards: GOOD_CARDS } });
  const builder = buildLiveCardsGraph(h.deps);
  const first = builder.compile();
  const second = builder.compile();
  for (const graph of [first, second, first]) {
    const result = shown((await graph.invoke(liveInput())).result);
    assert.equal(result.cards.length, 3);
  }
});


test("T049 graph-tail history, consent and fence changes prevent final invocation publication", async () => {
  for (const change of ["history", "consent", "fence"]) {
    const h = makeCardsHarness({ planner: { cards: GOOD_CARDS } });
    const graph = buildLiveCardsGraph(h.deps).compile();
    let changed = false;
    await assert.rejects(graph.invoke(liveInput(), { callbacks: [{ handleChainEnd(_outputs, _runId, parentRunId) {
      if (parentRunId !== undefined) return;
      changed = true;
      if (change === "history") h.fakeDb.collection(COLLECTION_NAMES.facts).seed({ ...UK_FACTS[0]!, _id: "cards-test:f-dest", tenantId: "cards-test", value: "Canada" });
      if (change === "consent") h.fakeDb.collection(COLLECTION_NAMES.consents).seed({ _id: `cards-test:consent-${STUDENT_ID}`, tenantId: "cards-test", studentId: STUDENT_ID, guardianConsent: false, purposes: [], recordedAt: "2026-09-01T00:00:00.000Z", minor: true });
      if (change === "fence") { const key = erasureFenceKey(STUDENT_ID); h.fakeDb.collection(COLLECTION_NAMES.erasure_fences).seed({ _id: `cards-test:${key}`, tenantId: "cards-test", studentKey: key, requestId: "late", createdAt: new Date().toISOString() }); }
    } }] }), { name: "ProviderAuthorizationRefusedError" });
    assert.equal(changed, true, "graph-tail callback must actually be reached");
  }
});


test("T049 invalid deadline refuses before retaining caller signal handlers", async () => {
  for (const deadlineMs of [NaN, Infinity, 0, -1, 45001]) {
    const h = makeCardsHarness({ planner: { cards: GOOD_CARDS } });
    const controller = new AbortController();
    let additions = 0;
    const add = controller.signal.addEventListener.bind(controller.signal);
    controller.signal.addEventListener = (...args: Parameters<typeof add>) => { additions += 1; return add(...args); };
    await assert.rejects(runLiveCards({ ...h.deps, deadlineMs, signal: controller.signal }, liveInput()), { name: "RangeError" });
    assert.equal(additions, 0);
    assert.equal(h.provider.calls.length, 0);
  }
});


test("T049 prebrief preserves public consent refusal and unscoped zero-access boundary", async () => {
  const h = makeCardsHarness({ consent: false });
  const snapshot = Object.fromEntries(Object.values(COLLECTION_NAMES).map(name => [name, h.fakeDb.collection(name).all()]));
  const collection = h.fakeDb.collection.bind(h.fakeDb);
  let profileAccesses = 0;
  h.fakeDb.collection = ((name: string) => { if (name === COLLECTION_NAMES.facts) profileAccesses += 1; return collection(name); }) as typeof h.fakeDb.collection;
  await assert.rejects(buildPreBriefFor(h.deps, { studentId: STUDENT_ID }), { name: "ConsentRequiredError" });
  assert.equal(profileAccesses, 0);
  assert.equal(h.provider.calls.length, 0);
  assert.equal(h.kb.queries.length, 0);
  assert.deepEqual(Object.fromEntries(Object.values(COLLECTION_NAMES).map(name => [name, collection(name).all()])), snapshot);
  let allAccesses = 0;
  const unscoped = new Proxy({} as typeof h.db, { get: (_target, key) => { if (key === "collection") { allAccesses += 1; throw new Error("unexpected access"); } return undefined; } });
  await assert.rejects(buildPreBriefFor({ db: unscoped }, { studentId: STUDENT_ID }), { name: "ProviderAuthorizationRefusedError" });
  assert.equal(allAccesses, 0);
});

test("T049 prebrief refuses malformed canonical history and consent revoked after preliminary check", async () => {
  const malformed = makeCardsHarness();
  malformed.fakeDb.collection(COLLECTION_NAMES.facts).seed({ ...UK_FACTS[0]!, _id: "cards-test:f-dest", tenantId: "cards-test", source: { type: "transcript", quote: "missing turn" } });
  await assert.rejects(buildPreBriefFor(malformed.deps, { studentId: STUDENT_ID }), { name: "ProviderAuthorizationRefusedError" });
  const revoked = makeCardsHarness();
  const consents = revoked.fakeDb.collection(COLLECTION_NAMES.consents);
  const find = consents.findOne.bind(consents);
  let reads = 0;
  consents.findOne = async (...args: Parameters<typeof find>) => {
    const result = await find(...args);
    reads += 1;
    if (reads === 1) consents.seed({ _id: `cards-test:consent-${STUDENT_ID}`, tenantId: "cards-test", studentId: STUDENT_ID, guardianConsent: false, purposes: [], recordedAt: "2026-09-01T00:00:00.000Z", minor: true });
    return result;
  };
  await assert.rejects(buildPreBriefFor(revoked.deps, { studentId: STUDENT_ID }), { name: "ProviderAuthorizationRefusedError" });
  assert.equal(reads, 2);
  for (const h of [malformed, revoked]) { assert.equal(h.provider.calls.length, 0); assert.equal(h.kb.queries.length, 0); }
});

test("T049 reconciled canonical edit history preserves exact provenance and refuses forged source before disclosure", async () => {
  const source = { type: "counsellor-edit" as const, counsellorId: "synthetic exact actor", editedAt: "2026-09-26T12:00:00.000Z", editedFrom: UK_FACTS[0]!.source };
  const approved = { ...UK_FACTS[0]!, value: "Canada", source };
  const h = makeCardsHarness({ facts: [approved] });
  const brief = await buildPreBriefFor(h.deps, { studentId: STUDENT_ID });
  assert.equal(brief.knownFacts[0]!.value, "Canada");
  assert.deepEqual(brief.knownFacts[0]!.source, source);
  const result = shown(await runLiveCards(h.deps, liveInput()));
  assert.equal(result.status, "ok");
  assert.deepEqual(result.preBrief.knownFacts[0]!.source, source);
  assert.equal(result.preBrief.knownFacts[0]!.value, "Canada");
  for (const forgedSource of [
    { ...source, counsellorId: " " },
    { ...source, editedFrom: { ...UK_FACTS[0]!.source, forgedAuthority: true } },
    { ...source, forgedAuthority: true },
  ]) {
    const forged = makeCardsHarness();
    forged.fakeDb.collection(COLLECTION_NAMES.facts).seed({ ...approved, _id: "cards-test:f-dest", tenantId: "cards-test", source: forgedSource });
    await assert.rejects(buildPreBriefFor(forged.deps, { studentId: STUDENT_ID }), { name: "ProviderAuthorizationRefusedError" });
    await assert.rejects(runLiveCards(forged.deps, liveInput()), { name: "ProviderAuthorizationRefusedError" });
    assert.equal(forged.provider.calls.length, 0);
    assert.equal(forged.kb.queries.length, 0);
  }
});

test("T049 cycle1 postread authority refuses consent and fence changes before prebrief and final publication", async t => {
  for (const boundary of ["prebrief", "profile", "final"]) for (const change of ["consent", "fence"]) await t.test(`${boundary}/${change}`, async () => {
    const h = makeCardsHarness({ planner: { cards: GOOD_CARDS } });
    const facts = h.fakeDb.collection(COLLECTION_NAMES.facts);
    const find = facts.find.bind(facts);
    let tail = false;
    let changed = false;
    facts.find = (...args: Parameters<typeof find>) => {
      const cursor = find(...args);
      const toArray = cursor.toArray.bind(cursor);
      cursor.toArray = async () => {
        const rows = await toArray();
        if (!changed && (boundary !== "final" || tail)) {
          changed = true;
          if (change === "consent") h.fakeDb.collection(COLLECTION_NAMES.consents).seed({ _id: `cards-test:consent-${STUDENT_ID}`, tenantId: "cards-test", studentId: STUDENT_ID, guardianConsent: false, purposes: [], recordedAt: "2026-09-01T00:00:00.000Z", minor: true });
          else { const key = erasureFenceKey(STUDENT_ID); h.fakeDb.collection(COLLECTION_NAMES.erasure_fences).seed({ _id: `cards-test:${key}`, tenantId: "cards-test", studentKey: key, requestId: "cycle1-return", createdAt: new Date().toISOString() }); }
        }
        return rows;
      };
      return cursor;
    };
    if (boundary === "prebrief") await assert.rejects(buildPreBriefFor(h.deps, { studentId: STUDENT_ID }));
    else await assert.rejects(buildLiveCardsGraph(h.deps).compile().invoke(liveInput(), { callbacks: [{ handleChainEnd(_out, _id, parent) { if (parent === undefined) tail = true; } }] }), { name: "ProviderAuthorizationRefusedError" });
    assert.equal(changed, true, `${boundary}/${change}: actual facts return mutation reached`);
    if (boundary === "final") assert.equal(tail, true);
    else { assert.equal(h.provider.calls.length, 0); assert.equal(h.kb.queries.length, 0); }
  });
});

test("T049 cycle1 stream and iterator permits reject same-compiled reentry and second-compilation serialized result", async t => {
  for (const entry of ["same-stream", "same-iterator", "second-stream"]) await t.test(entry, async () => {
    const h = makeCardsHarness({ planner: { cards: GOOD_CARDS } });
    const builder = buildLiveCardsGraph(h.deps);
    const first = builder.compile();
    const second = builder.compile();
    let reached = false;
    let refused = false;
    let privateRows = 0;
    const generate = h.provider.generate.bind(h.provider);
    h.provider.generate = async req => {
      if (req.skillName === "exploration-planner" && !reached) {
        reached = true;
        const target = entry === "second-stream" ? second : first;
        const raw = { ...liveInput(), result: { status: "refused" as const, reason: "FORGED_SERIALIZED_RESULT" } };
        try {
          const stream = entry === "same-iterator" ? target._streamIterator(raw) : await target.stream(raw);
          for await (const row of stream) if (JSON.stringify(row).includes("FORGED_SERIALIZED_RESULT")) privateRows += 1;
        } catch (error) { refused = (error as Error).name === "ProviderAuthorizationRefusedError"; }
      }
      return generate(req);
    };
    const result = shown((await first.invoke(liveInput())).result);
    assert.equal(result.cards.length, 3, "legitimate invoke internal stream must remain available");
    assert.equal(reached, true);
    assert.equal(refused, true, entry);
    assert.equal(privateRows, 0, entry);
  });
});

test("T049 cycle1 iterator refusal is synchronous and inherited batch preserves concurrency and returnExceptions", async t => {
  const h = makeCardsHarness({ planner: { cards: GOOD_CARDS } });
  const graph = buildLiveCardsGraph(h.deps).compile();
  await t.test("synchronous iterator refusal", () => { assert.throws(() => graph._streamIterator(liveInput()), { name: "ProviderAuthorizationRefusedError" }); });
  await t.test("unsupported config clone refusal", () => { assert.throws(() => graph.withConfig({ tags: ["unsupported-clone"] }), { name: "ProviderAuthorizationRefusedError" }); });
  await t.test("unsupported event log and transform disclosure entries refuse", () => {
    assert.throws(() => graph.streamEvents(liveInput(), { version: "v2" }), { name: "ProviderAuthorizationRefusedError" });
    assert.throws(() => graph.streamLog(liveInput()), { name: "ProviderAuthorizationRefusedError" });
    assert.throws(() => graph.transform([liveInput()] as never), { name: "ProviderAuthorizationRefusedError" });
  });
  await t.test("iterator permit is already consumed before callback reentry and leaf receives combined signal", async () => {
    let reached = false;
    let refused = false;
    const caller = new AbortController();
    const generate = h.provider.generate.bind(h.provider);
    h.provider.generate = async req => {
      assert.ok(req.signal);
      assert.notEqual(req.signal, caller.signal, "leaf uses Pregel's actual combined execution signal");
      return generate(req);
    };
    const result = await graph.invoke(liveInput(), { signal: caller.signal, callbacks: [{ handleChainStart(_serialized, _input, _run, parent) {
      if (parent !== undefined || reached) return;
      reached = true;
      try { graph._streamIterator(liveInput()); } catch (error) { refused = (error as Error).name === "ProviderAuthorizationRefusedError"; }
    } }] });
    assert.equal(shown(result.result).cards.length, 3);
    assert.equal(reached, true);
    assert.equal(refused, true);
    h.provider.generate = generate;
  });
  for (const maxConcurrency of [1, 2]) await t.test(`inherited batch concurrency ${maxConcurrency}`, async () => {
    const results = await graph.batch([liveInput(), liveInput()], { maxConcurrency });
    assert.equal(results.length, 2);
    for (const result of results) assert.equal(shown(result.result).cards.length, 3);
    const raw = { ...liveInput(), result: { status: "refused" as const, reason: "forged batch" } };
    const mixed = await graph.batch([liveInput(), raw], { maxConcurrency }, { returnExceptions: true });
    assert.equal(shown((mixed[0] as typeof results[0]).result).cards.length, 3);
    assert.ok(mixed[1] instanceof Error);
    await assert.rejects(graph.batch([raw], { maxConcurrency }, { returnExceptions: false }));
  });
});

test("T049 cycle1 alternate invoke output options cannot return unvalidated personal output", async t => {
  const h = makeCardsHarness({ planner: { cards: GOOD_CARDS } });
  const graph = buildLiveCardsGraph(h.deps).compile();
  await t.test("compatible values and full output channels preserve authorized invocation", async () => {
    const result = await graph.invoke(liveInput(), { streamMode: "values", outputKeys: graph.outputChannels, tags: ["cycle1-options"], metadata: { synthetic: true } });
    assert.equal(shown(result.result).cards.length, 3);
  });
  for (const options of [
    { streamMode: "updates" as const },
    { streamMode: "debug" as const },
    { outputKeys: "preBrief" },
    { outputKeys: ["preBrief"] },
    { outputKeys: ["result"] },
  ]) await t.test(JSON.stringify(options), async () => {
    await assert.rejects(graph.invoke(liveInput(), options), "incompatible output selection must refuse instead of returning personal state without final authority");
  });
});
