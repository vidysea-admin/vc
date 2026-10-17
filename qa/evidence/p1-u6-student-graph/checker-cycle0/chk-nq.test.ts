/**
 * Checker (independent) hostile outcome suite for P1 U6, cycle 0. Own fixtures, own stubs; only
 * runStudentTurn (the compiled-graph entry point) is exercised. Mock only, no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MockProvider, FailoverProvider, type GenerateRequest, type LlmProvider } from "@vc/providers";
import { TurnResponseSchema } from "@vc/schemas";
import {
  ANONYMOUS_CRISIS_MESSAGE,
  CRISIS_FORBIDDEN_PATTERNS,
  NO_SOURCED_ANSWER_TEXT,
  PROVIDER_APOLOGY_TEXT,
  STUDENT_CRISIS_MESSAGE,
  StudentAuthRequiredError,
  StudentInputInvalidError,
  runStudentTurn,
  type StudentGraphDeps,
} from "../src/student/graph.js";
import type { AskToolOutput, SearchHit, SearchToolOutput, SessionToolOutput, StudentKbPort } from "../src/student/claims.js";
import * as engineIndex from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(here, "..", "..", "..", "skills");
const NOW = new Date("2026-10-17T09:00:00.000Z");
const AUTH = { role: "student" as const, studentId: "syn-chk-1", tenantId: "sandbox" };

const SPEAKERS = {
  speakers: [
    { id: "s1", name: "Rohan Deshpande", aliases: ["Rohan Deshpande", "Rohan", "Deshpande", "रोहन देशपांडे", "रोहन", "Rohan Deshpaande"] },
    { id: "s2", name: "Meera Iyer", aliases: ["Meera Iyer", "Meera", "Iyer", "मीरा"], permission: { grantedBy: "Meera Iyer", grantedAt: "2026-09-01", documentRef: "doc-1", scope: "own seminar" } },
  ],
};

function hit(over: Partial<SearchHit> & { turnId: string; text: string }): SearchHit {
  return { sessionId: "sess-" + over.turnId, score: 2.5, sessionDate: "2026-06-01", sourceId: "src-" + over.turnId, sourceKind: "internal-seminar", ...over };
}
const ok = (hits: SearchHit[]): SearchToolOutput => ({ status: "ok", hits, dropped: 0 });

function kb(opts: { search?: SearchToolOutput | (() => never); ask?: AskToolOutput; sessions?: Record<string, SessionToolOutput>; sessionThrows?: boolean; anonymous?: boolean } = {}) {
  const calls: string[] = [];
  const port: StudentKbPort & { calls: string[] } = {
    calls,
    async searchKb() {
      calls.push("search");
      if (typeof opts.search === "function") return opts.search();
      return structuredClone(opts.search ?? ok([]));
    },
  };
  if (!opts.anonymous) {
    port.askKnowledgeBase = async () => {
      calls.push("ask");
      return structuredClone(opts.ask ?? { status: "no_sourced_answer", answer: "", citations: { internal: [], web: [] }, verdict: "incorrect", reason: "" });
    };
    port.getSession = async (id: string) => {
      calls.push("session:" + id);
      if (opts.sessionThrows) throw new Error("boom");
      return structuredClone((opts.sessions ?? {})[id] ?? { status: "unavailable", unavailableReason: "not_found" });
    };
  }
  return port;
}

class Recorder implements LlmProvider {
  readonly kind = "mock" as const;
  readonly model = "rec";
  calls = 0;
  constructor(private out: unknown | (() => unknown)) {}
  async generate<T>(req: GenerateRequest<T>): Promise<T> {
    this.calls++;
    const raw = typeof this.out === "function" ? (this.out as () => unknown)() : this.out;
    return req.outputSchema.parse(structuredClone(raw));
  }
}
const answer = (claims: { text: string; kind?: "fact" | "number" | "country"; sourceIds: string[] }[], followUp?: string) => ({
  claims: claims.map((c) => ({ kind: "fact", ...c })),
  ...(followUp ? { followUp } : {}),
});

function mk(over: Partial<StudentGraphDeps> & { provider: LlmProvider; kb: StudentKbPort }) {
  const gaps: unknown[] = [];
  const flags: unknown[] = [];
  const counter: string[] = [];
  const escal: unknown[] = [];
  const d: StudentGraphDeps = {
    skillsDir: SKILLS_DIR,
    speakers: SPEAKERS,
    now: () => NOW,
    recordGap: async (g) => void gaps.push(g),
    logFlag: async (r) => void flags.push(r),
    countAnonymous: async (k) => void counter.push(k),
    escalate: async (i) => void escal.push(i),
    ...over,
  };
  return { d, gaps, flags, counter, escal };
}
const turn = (text: string, extra: object = {}) => ({ mode: "authenticated" as const, auth: AUTH, threadId: "th-1", turnId: "tu-1", text, ...extra });
const Q = "What is the tuition at German public universities?";


const LONGQ = "What do the notes say about tuition and the agent in Germany?";
const expectOk = (out: { response: { state: string; message?: string } }, why: string) => assert.equal(out.response.state, "ok", why + " (vacuous: claim was dropped, so redaction was never exercised) " + JSON.stringify(out.response.message));

test("NQ whatsapp: evidence text itself carries the name/phone; every variant is redacted in a SHOWN answer", async () => {
  const wa = hit({ turnId: "w1", sourceKind: "whatsapp", speakerLabel: "Sanjay Kulkarni", text: "Dr Sanjay Kulkarni said you should apply early for the winter intake in Germany, call +91 98765 43210 for the agent" });
  const names = ["Sanjay Kulkarni", "SANJAY KULKARNI", "Sanjay\u200BKulkarni", "Sanjay\nKulkarni", "Sanjay\u00A0Kulkarni", "Dr. Sanjay Kulkarni"];
  for (const n of names) {
    const { d } = mk({ kb: kb({ search: ok([wa]) }), provider: new Recorder(answer([{ text: `${n} advises applying early for winter intake, Germany.`, sourceIds: ["w1"] }])) });
    const out = await runStudentTurn(d, turn(LONGQ));
    expectOk(out, "wa name " + JSON.stringify(n));
    const s = JSON.stringify(out.response).normalize("NFC").replace(/[\u200B-‍]/g, "");
    assert.ok(!/sanjay|kulkarni/i.test(s), "LEAK " + JSON.stringify(n) + " => " + s);
  }
  for (const ph of ["98765 43210", "+91-98765-43210", "+91 98765 43210", "9876543210"]) {
    const w2 = hit({ turnId: "w1", sourceKind: "whatsapp", text: "you should apply early for the winter intake in Germany, call +91 98765 43210 9876543210 for the agent" });
    const { d } = mk({ kb: kb({ search: ok([w2]) }), provider: new Recorder(answer([{ text: `Early application for winter intake in Germany is advised; call ${ph} now.`, sourceIds: ["w1"] }])) });
    const out = await runStudentTurn(d, turn(LONGQ));
    console.log("PROBE phone", JSON.stringify(ph), "->", out.response.state, JSON.stringify(out.response.message));
    expectOk(out, "phone " + ph);
    assert.ok(!/98765|43210|9876543210/.test((out.response.message ?? "").replace(/[\s-]/g, "")), ph + " => " + out.response.message);
  }
});
test("NQ unknown-kind: speakerLabel of an UNKNOWN hit is redacted in a shown answer", async () => {
  const unk = hit({ turnId: "u1", sourceKind: "unknown", speakerLabel: "Priya Menon", text: "Priya Menon explained that visa processing takes about six weeks in Germany." });
  const { d } = mk({ kb: kb({ search: ok([unk]) }), provider: new Recorder(answer([{ text: "Priya Menon noted that visa processing takes around six weeks in Germany.", sourceIds: ["u1"] }])) });
  const out = await runStudentTurn(d, turn(LONGQ));
  expectOk(out, "unknown label");
  assert.ok(!/priya|menon/i.test(JSON.stringify(out.response)), JSON.stringify(out.response));
});
test("NQ get_session turn label (via /ask) redacted in a shown answer", async () => {
  const ask: AskToolOutput = { status: "answered", answer: "Visa takes six weeks.", citations: { internal: [{ node_id: "session:s2", evidence: { sessionRef: "s2" } }], web: [] }, verdict: "correct", reason: "" };
  const sess: Record<string, SessionToolOutput> = { s2: { status: "ok", session: { id: "s2", date: "2026-05-01", sourceId: "a" }, turns: [{ turnId: "a", text: "Anita Rao said visa processing in Germany takes about six weeks.", speakerLabel: "Anita Rao" }] } };
  const { d } = mk({ kb: kb({ ask, sessions: sess }), provider: new Recorder(answer([{ text: "Anita Rao mentioned that Germany visa processing needs roughly six weeks.", sourceIds: ["session:s2"] }])) });
  const out = await runStudentTurn(d, turn(LONGQ));
  expectOk(out, "session label");
  assert.ok(!/anita|rao/i.test(JSON.stringify(out.response)), JSON.stringify(out.response));
});
test("NQ seminar: unpermitted listed speaker redacted in every variant (SHOWN answer); permitted may be named", async () => {
  const deny = ["Rohan Deshpande", "rohan", "ROHAN DESHPANDE", "Rohan\u200BDeshpande", "Rohan\u200CDeshpande", "Rohan\nDeshpande", "रोहन देशपांडे", "रोहन", "Rohan Deshpaande", "Dr. Deshpande", "Rohan\u00A0Deshpande", "Rohan\u00ADDeshpande", "Rohan\uFEFFDeshpande"];
  const ev = "Notes mention " + deny.join(" and ") + " in the Germany seminar. Public universities in Germany charge no tuition fees.";
  const sem = hit({ turnId: "s1", text: ev });
  const leaks: string[] = [];
  for (const n of deny) {
    const { d } = mk({ kb: kb({ search: ok([sem]) }), provider: new Recorder(answer([{ text: `${n} noted that public universities in Germany charge no tuition fees.`, sourceIds: ["s1"] }], "Which cities are you considering?")) });
    const out = await runStudentTurn(d, turn(LONGQ));
    if (out.response.state !== "ok") { leaks.push("VACUOUS " + JSON.stringify(n) + " " + out.response.state); continue; }
    const s = (out.response.message ?? "").normalize("NFC").replace(/[\u200B-‍\u00AD\uFEFF]/g, "");
    if (/rohan|deshpa|रोहन|देशपांडे/.test(s.toLowerCase())) leaks.push("LEAK " + JSON.stringify(n) + " => " + s);
  }
  console.log("PROBE seminar-name results:", JSON.stringify(leaks));
  assert.deepEqual(leaks, []);
  const ev2 = "Meera Iyer said public universities in Germany charge no tuition fees.";
  const { d } = mk({ kb: kb({ search: ok([hit({ turnId: "s1", text: ev2 })]) }), provider: new Recorder(answer([{ text: "Meera Iyer said public universities in Germany charge no tuition fees.", sourceIds: ["s1"] }])) });
  const out = await runStudentTurn(d, turn(LONGQ));
  assert.match(out.response.message ?? "", /Meera Iyer/);
});
test("NQ label diacritic/initial variants where the EVIDENCE carries the same variant (probe, alias-list-only limit)", async () => {
  const wa = hit({ turnId: "w1", sourceKind: "whatsapp", speakerLabel: "Sanjay Kulkarni", text: "Sanjáy Kulkarni and S. Kulkarni and Kulkarni Sanjay and Sanjay K. said apply early for the winter intake in Germany" });
  for (const v of ["Sanjáy Kulkarni", "S. Kulkarni", "Kulkarni Sanjay", "Sanjay K."]) {
    const { d } = mk({ kb: kb({ search: ok([wa]) }), provider: new Recorder(answer([{ text: `${v} advises applying early for winter intake, Germany.`, sourceIds: ["w1"] }])) });
    const out = await runStudentTurn(d, turn(LONGQ));
    const m = out.response.message ?? "";
    console.log("PROBE label-variant", JSON.stringify(v), "->", out.response.state, JSON.stringify(m));
  }
});
test("NQ coach + followUp + final message: name never present", async () => {
  const sem = hit({ turnId: "s1", text: "Public universities in Germany charge no tuition fees. Rohan Deshpande agrees." });
  const { d } = mk({ kb: kb({ search: ok([sem]) }), provider: new Recorder(answer([{ text: "Public universities in Germany charge no tuition fees.", sourceIds: ["s1"] }], "Would Rohan Deshpande be a good person to ask?")) });
  const out = await runStudentTurn(d, turn(LONGQ));
  assert.equal(out.response.state, "ok");
  assert.ok(!/rohan|deshpande/i.test(JSON.stringify(out.response)), JSON.stringify(out.response));
});
