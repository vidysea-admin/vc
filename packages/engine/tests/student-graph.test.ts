/**
 * P1 U6 student turn graph: authenticated-student gate, answer_from_kb (search_kb first, ask only when
 * search is insufficient = 0 hits with score >= threshold), the /ask serve rule end to end (spec A4 MOCK
 * engine part, A18), one gap count per authenticated no-answer, provider failover with apology + retry
 * (A12), anonymous turns search-only (A15c engine side), and TurnResponse schema validity.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TurnResponseSchema } from "@vc/schemas";
import { FailoverProvider, MockProvider, LiteLlmHttpError, type GenerateRequest, type LlmProvider } from "@vc/providers";
import {
  DEFAULT_SEARCH_SCORE_THRESHOLD,
  NO_SOURCED_ANSWER_TEXT,
  PROVIDER_APOLOGY_TEXT,
  ANONYMOUS_CRISIS_MESSAGE,
  STUDENT_CRISIS_MESSAGE,
  StudentAuthRequiredError,
  StudentInputInvalidError,
  compileStudentGraph,
  runStudentTurn,
  type GapRecord,
  type StudentGraphDeps,
} from "../src/student/graph.js";
import type { AskToolOutput } from "../src/student/claims.js";
import { ASK_ANSWERED, HIT_LOW_SCORE, HIT_UNLISTED_RECORDING, NOW, SEARCH_OK, SESSION_SEM_2, SKILLS_DIR, SPEAKERS, fakeKb, studentProvider } from "./student-fixtures.js";

const AUTH = { role: "student" as const, studentId: "syn-stu-3", tenantId: "sandbox" };
const Q = "What is the tuition at German public universities?";

function deps(over: Partial<StudentGraphDeps> = {}) {
  const gaps: GapRecord[] = [];
  const counter: string[] = [];
  const d: StudentGraphDeps = {
    kb: fakeKb(),
    provider: studentProvider(),
    skillsDir: SKILLS_DIR,
    speakers: SPEAKERS,
    now: () => NOW,
    recordGap: async (g) => void gaps.push(g),
    countAnonymous: async (k) => void counter.push(k),
    ...over,
  };
  return { d, gaps, counter, kb: d.kb as ReturnType<typeof fakeKb> };
}
const turn = (text = Q) => ({ mode: "authenticated" as const, auth: AUTH, threadId: "th-g", turnId: "tu-g", text });

test("gate: a missing, non-student or incomplete identity is refused before any KB or model call (counsellor/admin tokens rejected)", async () => {
  for (const auth of [undefined, { role: "counsellor", studentId: "s", tenantId: "t" }, { role: "admin", studentId: "s", tenantId: "t" }, { role: "student", studentId: "", tenantId: "t" }, { role: "student", studentId: "s", tenantId: "" }]) {
    const { d, kb } = deps();
    await assert.rejects(runStudentTurn(d, { mode: "authenticated", auth: auth as never, threadId: "th", turnId: "tu", text: Q }), StudentAuthRequiredError);
    assert.equal(kb.calls.length, 0);
    assert.equal((d.provider as MockProvider).calls.length, 0);
  }
});

test("answer_from_kb: search_kb first; with >= 1 hit at or above the threshold, /ask is never called; reply is built from guarded claims", async () => {
  const { d, kb } = deps();
  const out = await runStudentTurn(d, turn());
  assert.deepEqual(kb.calls.map((c) => c.tool), ["search_kb"]);
  assert.equal(out.response.state, "ok");
  assert.equal(out.response.claims[0]!.status, "verified");
  assert.ok(TurnResponseSchema.safeParse(out.response).success, JSON.stringify(TurnResponseSchema.safeParse(out.response)));
  assert.equal(out.selectedTool, "search_kb");
});

test("answer_from_kb: insufficient = 0 hits with score >= threshold -> ask_knowledge_base; low-score hits are not used as evidence", async () => {
  assert.ok(DEFAULT_SEARCH_SCORE_THRESHOLD > HIT_LOW_SCORE.score);
  const provider = studentProvider({ kbAnswer: { claims: [{ text: "Living costs in Germany are about 11,000 euros a year.", kind: "number", sourceIds: ["session:sess-sem-2"] }] } });
  const { d, kb } = deps({ kb: fakeKb({ search: { status: "ok", hits: [HIT_LOW_SCORE], dropped: 0 } }), provider });
  const out = await runStudentTurn(d, turn());
  assert.deepEqual(kb.calls.map((c) => c.tool), ["search_kb", "ask_knowledge_base", "get_session"]);
  assert.equal(out.response.state, "ok");
  assert.equal(out.response.claims[0]!.status, "verified");
  const input = (provider.calls[0]!.input as { evidence: { id: string }[] }).evidence.map((e) => e.id);
  assert.ok(!input.includes(HIT_LOW_SCORE.turnId), "a below-threshold hit is not offered as evidence");
});

test("answer_from_kb: the threshold is configurable", async () => {
  const { d, kb } = deps({ kb: fakeKb({ search: { status: "ok", hits: [HIT_LOW_SCORE], dropped: 0 } }), config: { searchScoreThreshold: 0.3 } });
  await runStudentTurn(d, turn());
  assert.deepEqual(kb.calls.map((c) => c.tool), ["search_kb"]);
});

const NOT_SERVED: [string, AskToolOutput][] = [
  ["web_used", { status: "no_sourced_answer", answer: NO_SOURCED_ANSWER_TEXT, citations: { internal: [], web: [] }, verdict: "correct", reason: "", withheld: ["web_used"] }],
  ["fallback failed", { status: "no_sourced_answer", answer: NO_SOURCED_ANSWER_TEXT, citations: { internal: [], web: [] }, verdict: "incorrect", reason: "", withheld: ["verdict_not_correct", "insufficient_coverage"] }],
  ["ambiguous", { status: "no_sourced_answer", answer: NO_SOURCED_ANSWER_TEXT, citations: { internal: [], web: [] }, verdict: "ambiguous", reason: "", withheld: ["verdict_not_correct"] }],
  ["unavailable", { status: "unavailable", answer: NO_SOURCED_ANSWER_TEXT, citations: { internal: [], web: [] }, verdict: "unavailable", reason: "" }],
  // Defence in depth: even a mis-tagged "answered" with zero internal sources, or with web sources, is not served.
  ["answered but uncited", { ...ASK_ANSWERED, citations: { internal: [], web: [] } }],
  ["answered with web only", { ...ASK_ANSWERED, citations: { internal: [], web: [{ url: "https://example.invalid" }] } }],
  ["answered with internal AND web", { ...ASK_ANSWERED, citations: { internal: ASK_ANSWERED.citations.internal, web: [{ url: "https://example.invalid" }] } }],
];

for (const [name, ask] of NOT_SERVED) {
  test(`A4/A18 (${name}): a non-served /ask result is the fixed no-answer, no model call, one gap count`, async () => {
    const { d, gaps, kb } = deps({ kb: fakeKb({ search: { status: "ok", hits: [], dropped: 0 }, ask }) });
    const out = await runStudentTurn(d, turn());
    assert.equal(out.response.state, "no_sourced_answer");
    assert.equal(out.response.message, NO_SOURCED_ANSWER_TEXT);
    assert.deepEqual(out.response.claims, []);
    assert.deepEqual(out.response.sources, []);
    assert.equal((d.provider as MockProvider).calls.length, 0);
    assert.equal(gaps.length, 1);
    assert.deepEqual(Object.keys(gaps[0]!).sort(), ["at", "studentId", "tenantId", "threadId", "turnId"]);
    assert.ok(!kb.calls.some((c) => c.tool === "get_session"));
  });
}

test("A4: one passing correct /ask response IS served (sourced claims, no web)", async () => {
  const provider = studentProvider({ kbAnswer: { claims: [{ text: "Public universities there mostly charge no tuition.", kind: "fact", sourceIds: ["session:sess-sem-2"] }] } });
  const { d, gaps } = deps({ kb: fakeKb({ search: { status: "ok", hits: [], dropped: 0 } }), provider });
  const out = await runStudentTurn(d, turn());
  assert.equal(out.response.state, "ok");
  assert.equal(out.response.claims.length, 1);
  assert.equal(out.response.sources[0]!.id, "session:sess-sem-2");
  assert.equal(out.response.sources[0]!.kind, "unknown", "a served /ask source is restricted by default");
  assert.equal(gaps.length, 0);
  assert.ok(!JSON.stringify(out.response).includes("example.invalid"));
});

test("A18: a KB search outage with /ask also unavailable is the fixed no-answer, never an uncited answer", async () => {
  const { d } = deps({ kb: fakeKb({ search: { status: "unavailable", unavailableReason: "timeout" }, ask: NOT_SERVED[3]![1] }) });
  const out = await runStudentTurn(d, turn());
  assert.equal(out.response.state, "no_sourced_answer");
  assert.equal(out.response.message, NO_SOURCED_ANSWER_TEXT);
});

test("B2: when the guard leaves no sourced claim, the turn is the no-answer (never an answer made of unverified text only)", async () => {
  const provider = studentProvider({ kbAnswer: { claims: [{ text: "Everyone gets a full scholarship.", kind: "fact", sourceIds: ["invented-id"] }] } });
  const { d, gaps } = deps({ provider });
  const out = await runStudentTurn(d, turn());
  assert.equal(out.response.state, "no_sourced_answer");
  assert.equal(out.response.message, NO_SOURCED_ANSWER_TEXT);
  assert.equal(gaps.length, 1);
});

test("B2: an unverified claim next to a verified one is returned flagged, and the message marks it", async () => {
  const provider = studentProvider({
    kbAnswer: {
      claims: [
        { text: "German public universities charge no tuition for most programmes.", kind: "fact", sourceIds: ["t-sem-1"] },
        { text: "The semester contribution is about 900 euros.", kind: "number", sourceIds: ["t-sem-1"] },
      ],
    },
  });
  const { d } = deps({ provider });
  const out = await runStudentTurn(d, turn());
  assert.deepEqual(out.response.claims.map((c) => c.status), ["verified", "unverified"]);
  assert.match(out.response.message ?? "", /\(unverified\)/);
});

class Failing implements LlmProvider {
  readonly kind = "mock" as const;
  constructor(readonly model: string, private readonly status = 503) {}
  calls = 0;
  async generate<T>(_r: GenerateRequest<T>): Promise<T> {
    this.calls++;
    throw new LiteLlmHttpError(this.status, "synthetic outage");
  }
}

test("A12: provider failure fails over to the next chain member (FailoverProvider reused)", async () => {
  const first = new Failing("primary");
  const failover = new FailoverProvider({ chain: [first, studentProvider()], sleep: async () => {}, random: () => 0, onExhausted: () => {} });
  const { d } = deps({ provider: failover });
  const out = await runStudentTurn(d, turn());
  assert.equal(out.response.state, "ok");
  assert.ok(first.calls >= 1);
});

test("A12: every model failing gives the apology + Retry, never a guessed answer", async () => {
  const failover = new FailoverProvider({ chain: [new Failing("a"), new Failing("b")], maxAttempts: 3, sleep: async () => {}, random: () => 0, onExhausted: () => {} });
  const { d } = deps({ provider: failover });
  const out = await runStudentTurn(d, turn());
  assert.equal(out.retryable, true);
  assert.equal(out.response.message, PROVIDER_APOLOGY_TEXT);
  assert.deepEqual(out.response.claims, []);
  assert.ok(TurnResponseSchema.safeParse(out.response).success);
});

test("anonymous: personal or ambiguous questions are sign_in_required with no KB call; counter only", async () => {
  const { d, counter, kb } = deps({ kb: fakeKb({ anonymous: true }) });
  const out = await runStudentTurn(d, { mode: "anonymous", text: "Can I get into TU Munich with 72%?" });
  assert.equal(out.response.state, "sign_in_required");
  assert.equal(kb.calls.length, 0);
  assert.deepEqual(counter, ["sign_in_required"]);
});

test("anonymous: a generic question uses search_kb only (never /ask, never get_session), even when search finds nothing", async () => {
  for (const search of [SEARCH_OK, { status: "ok" as const, hits: [], dropped: 0 }]) {
    const kb = fakeKb({ search });
    const { d, counter } = deps({ kb });
    const out = await runStudentTurn(d, { mode: "anonymous", text: Q });
    assert.ok(kb.calls.every((c) => c.tool === "search_kb"), JSON.stringify(kb.calls));
    assert.equal(counter.length, 1);
    assert.ok(["answered", "no_answer"].includes(counter[0]!));
    assert.ok(["ok", "no_sourced_answer"].includes(out.response.state));
  }
});

test("anonymous: a turn is personal-gated before generation; no profile facts are ever used", async () => {
  const { d } = deps({ kb: fakeKb({ anonymous: true }) });
  const out = await runStudentTurn(d, { mode: "anonymous", text: Q });
  assert.deepEqual(out.response.profileFactsUsed, []);
});

test("B24.2: the engine no-answer text equals the U2 MCP NO_SOURCED_ANSWER_TEXT (text-level parity, no package dependency)", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const src = readFileSync(fileURLToPath(new URL("../../../mcp/university-kb/src/kb-client.ts", import.meta.url)), "utf8");
  const m = src.match(/export const NO_SOURCED_ANSWER_TEXT = "([^"]+)";/);
  assert.ok(m, "U2 constant not found");
  assert.equal(NO_SOURCED_ANSWER_TEXT, m![1]);
});

// ---------------------------------------------------------------------------
// Pre-check repair (review-driven, probe S/probe-u6-swe P1-P9). Each test failed on e6f64a1.
// ---------------------------------------------------------------------------

const CRISIS_TEXT = "I want to kill myself";
const throwing = async () => {
  throw new Error("store down");
};

test("R1 crisis-first: an anonymous crisis with the counter store down still returns the fixed message + Tele-MANAS 14416 (flagWriteFailed)", async () => {
  const { d } = deps({ kb: fakeKb({ anonymous: true }), countAnonymous: throwing });
  const out = await runStudentTurn(d, { mode: "anonymous", text: CRISIS_TEXT });
  assert.equal(out.response.state, "escalated");
  assert.equal(out.response.message, ANONYMOUS_CRISIS_MESSAGE);
  assert.match(out.response.message ?? "", /14416/);
  assert.equal(out.flagWriteFailed, true);
});

test("R1 crisis-first: an authenticated crisis with flag log AND escalation down still returns the fixed message + 14416", async () => {
  const { d } = deps({ logFlag: throwing, escalate: throwing, countAnonymous: throwing, recordGap: throwing });
  const out = await runStudentTurn(d, turn(CRISIS_TEXT));
  assert.equal(out.response.message, STUDENT_CRISIS_MESSAGE);
  assert.equal(out.flagWriteFailed, true);
});

test("R1: recordGap throwing on an authenticated no-answer still returns the fixed no-answer (logged, not thrown)", async () => {
  const errors: string[] = [];
  const { d } = deps({ kb: fakeKb({ search: { status: "ok", hits: [], dropped: 0 }, ask: NOT_SERVED[1]![1] }), recordGap: throwing, onWriteError: (w) => void errors.push(w) });
  const out = await runStudentTurn(d, turn("Is tuition free in Narnia?"));
  assert.equal(out.response.state, "no_sourced_answer");
  assert.equal(out.response.message, NO_SOURCED_ANSWER_TEXT);
  assert.deepEqual(errors, ["gap"]);
});

test("R1: the anonymous counter throwing on answered / no_answer / sign_in_required turns never fails the turn", async () => {
  const cases = [
    [Q, SEARCH_OK, "ok"],
    [Q, { status: "ok" as const, hits: [], dropped: 0 }, "no_sourced_answer"],
    ["Can I get into TU Munich with 72%?", SEARCH_OK, "sign_in_required"],
  ] as const;
  for (const [text, search, state] of cases) {
    const errors: string[] = [];
    const { d } = deps({ kb: fakeKb({ anonymous: true, search }), countAnonymous: throwing, onWriteError: (w) => void errors.push(w) });
    const out = await runStudentTurn(d, { mode: "anonymous", text });
    assert.equal(out.response.state, state, text);
    assert.equal(errors.length, 1, `${state}: one logged write error`);
  }
});

test("R2a: a claim with no resolvable sourceId is dropped (never shown), even when it carries WhatsApp text and a phone number", async () => {
  const provider = studentProvider({
    kbAnswer: {
      claims: [
        { text: "Public universities in Germany charge no tuition for most programmes.", kind: "fact", sourceIds: ["t-sem-1"] },
        { text: "my cousin got the DAAD scholarship last year, apply by October and call 98765 43210 for the agent", kind: "fact", sourceIds: [] },
        { text: "Everyone gets a full scholarship.", kind: "fact", sourceIds: ["invented-id"] },
      ],
    },
  });
  const { d } = deps({ provider });
  const out = await runStudentTurn(d, turn("How do scholarships work in Germany?"));
  assert.equal(out.response.claims.length, 1);
  assert.doesNotMatch(out.response.message ?? "", /cousin|98765|43210|scholarship|unverified/i);
});

test("R2a: a claim citing a seminar hit but quoting WhatsApp text verbatim is dropped (check over ALL restricted texts of the turn)", async () => {
  const provider = studentProvider({
    kbAnswer: {
      claims: [
        { text: "Public universities in Germany charge no tuition for most programmes.", kind: "fact", sourceIds: ["t-sem-1"] },
        { text: "Germany: my cousin got the DAAD scholarship last year, apply by October.", kind: "fact", sourceIds: ["t-sem-1"] },
      ],
    },
  });
  const { d } = deps({ provider });
  const out = await runStudentTurn(d, turn("How do scholarships work in Germany?"));
  assert.equal(out.response.state, "ok");
  assert.doesNotMatch(out.response.message ?? "", /cousin/);
});

test("R2a: the FINAL message is checked too - two claims that are each under the verbatim bar but join into an 8+ word WhatsApp run give the no-answer", async () => {
  const provider = studentProvider({
    kbAnswer: {
      claims: [
        { text: "My cousin got the", kind: "fact", sourceIds: ["t-wa-1"] },
        { text: "DAAD scholarship last year, apply by October.", kind: "fact", sourceIds: ["t-wa-1"] },
      ],
    },
  });
  const { d } = deps({ provider });
  const out = await runStudentTurn(d, turn("How do scholarships work in Germany?"));
  assert.equal(out.response.state, "no_sourced_answer");
  assert.doesNotMatch(out.response.message ?? "", /cousin/);
});

test("R2b: the speakerLabel of an 'unknown' (unlisted recording) hit is redacted", async () => {
  const hit = { ...HIT_UNLISTED_RECORDING, speakerLabel: "Rohit Kumar", text: "Rohit Kumar said blocked accounts of about 11,904 euros are required." };
  const kb = fakeKb({ search: { status: "ok", hits: [hit], dropped: 0 } });
  const provider = studentProvider({ kbAnswer: { claims: [{ text: "Rohit Kumar says blocked accounts of 11,904 euros are required for the visa.", kind: "number", sourceIds: [hit.turnId] }] } });
  const { d } = deps({ kb, provider });
  const out = await runStudentTurn(d, turn("How much is the blocked account for the German visa?"));
  assert.doesNotMatch(out.response.message ?? "", /Rohit|Kumar/);
});

test("R2b: the speakerLabel of a get_session turn fetched on the /ask path is redacted", async () => {
  const session = { ...SESSION_SEM_2, turns: [{ turnId: "t-x", text: "Living costs in Germany come to about 11,000 euros a year, says Meera Pillai.", speakerLabel: "Meera Pillai" }] };
  const kb = fakeKb({ search: { status: "ok", hits: [], dropped: 0 }, sessions: { "sess-sem-2": session } });
  const provider = studentProvider({ kbAnswer: { claims: [{ text: "Meera Pillai notes living costs in Germany are about 11,000 euros a year.", kind: "number", sourceIds: ["session:sess-sem-2"] }] } });
  const { d } = deps({ kb, provider });
  const out = await runStudentTurn(d, turn());
  assert.equal(out.response.state, "ok");
  assert.doesNotMatch(out.response.message ?? "", /Meera|Pillai/);
});

test("R3 followUp: kept only when it ends with '?', has no digits, no country, no personal identifier and no verbatim restricted run", async () => {
  const bad = [
    "Did you know the Berlin visa fee is 9999 euros?",
    "Which cities are you considering",
    "Are you also looking at Canada?",
    "Would you like to call our helper on the number from the group?".replace("the number", "98765 43210"),
    "Shall I ask Arjun sir about it?",
    "my cousin got the DAAD scholarship last year, apply by October and call?",
  ];
  for (const followUp of bad) {
    const provider = studentProvider({ kbAnswer: { claims: [{ text: "Public universities in Germany charge no tuition for most programmes.", kind: "fact", sourceIds: ["t-sem-1"] }], followUp } });
    const { d } = deps({ provider });
    const out = await runStudentTurn(d, turn("Is tuition free in Germany?"));
    assert.equal(out.response.message, "Public universities in Germany charge no tuition for most programmes.", followUp);
  }
  const { d } = deps();
  const ok = await runStudentTurn(d, turn("Is tuition free in Germany?"));
  assert.match(ok.response.message ?? "", /Which cities are you considering\?$/);
});

test("R4 (D-092): anonymous mode never shows unverified claims; authenticated mode flags them '(unverified)' next to a sourced claim", async () => {
  const claims = [
    { text: "German public universities charge no tuition for most programmes.", kind: "fact", sourceIds: ["t-sem-1"] },
    { text: "The semester contribution is about 900 euros.", kind: "number", sourceIds: ["t-sem-1"] },
  ];
  const anon = deps({ kb: fakeKb({ anonymous: true }), provider: studentProvider({ kbAnswer: { claims } }) });
  const a = await runStudentTurn(anon.d, { mode: "anonymous", text: Q });
  assert.deepEqual(a.response.claims.map((c) => c.status), ["verified"]);
  assert.doesNotMatch(a.response.message ?? "", /900|unverified/);
  const auth = deps({ provider: studentProvider({ kbAnswer: { claims } }) });
  const b = await runStudentTurn(auth.d, turn());
  assert.deepEqual(b.response.claims.map((c) => c.status), ["verified", "unverified"]);
  assert.match(b.response.message ?? "", /900 euros\. \(unverified\)/);
});

test("R7: the crisis guard runs on the raw text before schema validation: 4001 chars with a crisis phrase -> the crisis message", async () => {
  const long = `${CRISIS_TEXT} ${"x".repeat(4001)}`;
  const { d, kb } = deps();
  const out = await runStudentTurn(d, turn(long));
  assert.equal(out.response.message, STUDENT_CRISIS_MESSAGE);
  assert.equal(kb.calls.length, 0);
  const anon = deps({ kb: fakeKb({ anonymous: true }) });
  const a = await runStudentTurn(anon.d, { mode: "anonymous", text: long });
  assert.equal(a.response.message, ANONYMOUS_CRISIS_MESSAGE);
});

test("R7: an over-long text without a crisis phrase is StudentInputInvalidError, not StudentAuthRequiredError", async () => {
  const { d, kb } = deps();
  await assert.rejects(runStudentTurn(d, turn("x".repeat(4001))), StudentInputInvalidError);
  await assert.rejects(runStudentTurn(d, { mode: "anonymous", text: "" }), StudentInputInvalidError);
  assert.equal(kb.calls.length, 0);
});

test("R9: the compiled graph is cached per deps and itself enforces the TurnResponse schema + the prior-flag Tele-MANAS suffix", async () => {
  const { d } = deps();
  const g1 = compileStudentGraph(d);
  assert.equal(compileStudentGraph(d), g1, "one compiled graph per deps object");
  const out = await g1.invoke({ raw: { ...turn(), priorFlagInThread: true } });
  assert.ok(TurnResponseSchema.safeParse(out.result!.response).success);
  assert.match(out.result!.response.message ?? "", /14416/);
});

test("R9: the student module is re-exported from the @vc/engine entry point", async () => {
  const engine = await import("../src/index.js");
  assert.equal(typeof engine.runStudentTurn, "function");
  assert.equal(typeof engine.compileStudentGraph, "function");
  assert.equal(typeof engine.guardClaims, "function");
  assert.equal(typeof engine.classifyIntent, "function");
});
