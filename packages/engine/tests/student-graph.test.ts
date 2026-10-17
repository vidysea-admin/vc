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
  StudentAuthRequiredError,
  runStudentTurn,
  type GapRecord,
  type StudentGraphDeps,
} from "../src/student/graph.js";
import type { AskToolOutput } from "../src/student/claims.js";
import { ASK_ANSWERED, HIT_LOW_SCORE, NOW, SEARCH_OK, SKILLS_DIR, SPEAKERS, fakeKb, studentProvider } from "./student-fixtures.js";

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
        { text: "Everyone gets a full scholarship.", kind: "fact", sourceIds: [] },
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
