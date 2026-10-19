/**
 * P1 LK5-lite (D-105): reply in the student's language (dual-text claims, English guards), the English search-query rewrite for
 * non-English turns, the model safety screen held in front of the answer, and the English+Hindi helpline line on replies in a
 * language outside the allow-list. Plus the two LK4 review fixes (detector robustness, dropped VC_REPLY_LANGS entries).
 * Every model call is a mock; nothing here touches a network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MockProvider, type GenerateRequest, type LlmProvider } from "@vc/providers";
import {
  ANONYMOUS_CRISIS_MESSAGE,
  ANONYMOUS_NO_ANSWER_TEXT,
  ANONYMOUS_SIGN_IN_TEXT,
  STUDENT_CRISIS_MESSAGE,
  runStudentTurn,
  type AnonymousCounterKind,
  type StudentGraphDeps,
} from "../src/student/graph.js";
import {
  HELPLINE_LINE_EN_HI,
  HELPLINE_GLOSS,
  createModelLanguageDetector,
  parseReplyLangs,
  type DetectedLanguage,
} from "../src/student/lang.js";
import { NOW, NO_PRIOR_FLAG, SKILLS_DIR, SPEAKERS, fakeKb, studentProvider } from "./student-fixtures.js";

const AUTH = { role: "student" as const, studentId: "syn-stu-lk5", tenantId: "sandbox" };
const authTurn = (text: string) => ({ mode: "authenticated" as const, auth: AUTH, threadId: "th-lk5", turnId: "tu-lk5", text });
const EN_Q = "What is the tuition at German public universities?";
const HI_Q = "जर्मनी की सरकारी यूनिवर्सिटी में फीस कितनी है";
const HING_Q = "germany mein fees kitni hai";
const TA_Q = "ஜெர்மனி பல்கலைக்கழகங்களில் கட்டணம் எவ்வளவு";
const CRISIS_EN = "I just want to kill myself, nothing matters anymore.";

const det = (lang: string, script: DetectedLanguage["script"]) => async (): Promise<DetectedLanguage> => ({ lang, script, confidence: 0.9, source: "model" });
const HI = det("hi", "devanagari");
const HING = det("hi-Latn", "latin");
const TA = det("ta", "tamil");
const EN = det("en", "latin");

const EN_CLAIM = "Public universities in Germany charge no tuition for most programmes.";
const HI_LOCAL = "जर्मनी के सरकारी विश्वविद्यालयों में ज़्यादातर कोर्स के लिए कोई ट्यूशन फीस नहीं लगती।";
const HING_LOCAL = "Germany ki sarkari universities mein zyada tar programmes ke liye koi tuition fees nahi lagti.";

function answer(over: Record<string, unknown> = {}, claimOver: Record<string, unknown> = {}) {
  return {
    replyLang: "hi",
    claims: [{ text: EN_CLAIM, localized: HI_LOCAL, kind: "fact", sourceIds: ["t-sem-1"], ...claimOver }],
    ...over,
  };
}

function build(over: Partial<StudentGraphDeps> = {}, kbAnswer?: unknown) {
  const escalations: unknown[] = [];
  const flags: unknown[] = [];
  const counters: AnonymousCounterKind[] = [];
  const kb = fakeKb();
  const provider = studentProvider({ kbAnswer: kbAnswer ?? answer() });
  const d: StudentGraphDeps = {
    kb,
    provider,
    skillsDir: SKILLS_DIR,
    speakers: SPEAKERS,
    now: () => NOW,
    hasPriorFlag: NO_PRIOR_FLAG,
    escalate: async (i) => void escalations.push(i),
    logFlag: async (r) => void flags.push(r),
    countAnonymous: async (k) => void counters.push(k),
    detectLanguage: HI,
    ...over,
  };
  return { d, kb, provider, escalations, flags, counters };
}

// ---------------------------------------------------------------------------
// R1: reply in the student's language, guards on the English claims
// ---------------------------------------------------------------------------

test("R1 the answer prompt input carries replyLang (the resolved reply language), and the Hindi reply is the localized text", async () => {
  const a = build();
  const out = await runStudentTurn(a.d, authTurn(HI_Q));
  const input = a.provider.calls.find((c) => c.skillName === "kb-answer")!.input as { replyLang: string };
  assert.equal(input.replyLang, "hi");
  assert.equal(out.response.state, "ok");
  assert.ok(out.response.message!.includes(HI_LOCAL), out.response.message);
  assert.ok(!out.response.message!.includes(EN_CLAIM));
  assert.equal(out.response.claims[0]!.text, EN_CLAIM, "the claims (audit trail) stay English");
  assert.equal(out.replyLang, "hi");
});

test("R1 an English turn is told replyLang en and shows the English claim even if the model sends a localized copy", async () => {
  const a = build({ detectLanguage: EN }, answer({ replyLang: "en" }));
  const out = await runStudentTurn(a.d, authTurn(EN_Q));
  assert.equal((a.provider.calls.find((c) => c.skillName === "kb-answer")!.input as { replyLang: string }).replyLang, "en");
  assert.ok(out.response.message!.includes(EN_CLAIM));
  assert.ok(!out.response.message!.includes(HI_LOCAL));
});

test("R1 Hinglish gets the Latin-script localized text", async () => {
  const a = build({ detectLanguage: HING }, answer({ replyLang: "hi-Latn" }, { localized: HING_LOCAL }));
  const out = await runStudentTurn(a.d, authTurn(HING_Q));
  assert.ok(out.response.message!.includes(HING_LOCAL), out.response.message);
  assert.equal(out.replyLang, "hi-Latn");
});

test("R1 the guards still run on the ENGLISH claim: an unsupported English claim is not shown even with a perfect localized copy", async () => {
  const a = build({}, answer({}, { text: "Public universities in Germany charge 9000 euros a year.", localized: "जर्मनी के सरकारी विश्वविद्यालयों में 9000 यूरो सालाना लगते हैं।", kind: "number" }));
  const out = await runStudentTurn(a.d, authTurn(HI_Q));
  assert.ok(!out.response.message!.includes("9000"), out.response.message);
  assert.ok(!out.response.message!.includes("सालाना"));
});

test("R1 drift: the model reports another language than the one asked -> the English reply", async () => {
  const a = build({}, answer({ replyLang: "ta" }));
  const out = await runStudentTurn(a.d, authTurn(HI_Q));
  assert.ok(out.response.message!.includes(EN_CLAIM));
  assert.ok(!out.response.message!.includes(HI_LOCAL));
});

test("R1 drift: no replyLang from the model, or localized in the wrong script -> the English reply", async () => {
  const none = build({}, { claims: [{ text: EN_CLAIM, localized: HI_LOCAL, kind: "fact", sourceIds: ["t-sem-1"] }] });
  assert.ok((await runStudentTurn(none.d, authTurn(HI_Q))).response.message!.includes(EN_CLAIM));
  const tamil = build({}, answer({}, { localized: "ஜெர்மனியில் பொது பல்கலைக்கழகங்களில் பெரும்பாலான படிப்புகளுக்கு கல்விக் கட்டணம் இல்லை." }));
  const out = await runStudentTurn(tamil.d, authTurn(HI_Q));
  assert.ok(out.response.message!.includes(EN_CLAIM));
  assert.ok(!out.response.message!.includes("ஜெர்மனி"));
  const latinForHi = build({}, answer({}, { localized: "Germany has no tuition for most programmes at public universities." }));
  assert.ok((await runStudentTurn(latinForHi.d, authTurn(HI_Q))).response.message!.includes(EN_CLAIM));
});

test("R1 number parity: a localized copy that changes, adds or drops a number is not shown (Devanagari digits count as the same number)", async () => {
  const num = { text: "Expect a semester contribution of about 300 euros.", kind: "number" };
  const ok = build({}, answer({}, { ...num, localized: "लगभग ३०० यूरो का सेमेस्टर योगदान देना होगा।" }));
  assert.ok((await runStudentTurn(ok.d, authTurn(HI_Q))).response.message!.includes("३००"));
  for (const bad of ["लगभग 400 यूरो का सेमेस्टर योगदान देना होगा।", "सेमेस्टर योगदान देना होगा।", "लगभग 300 यूरो और 12 महीने का योगदान देना होगा।"]) {
    const a = build({}, answer({}, { ...num, localized: bad }));
    const m = (await runStudentTurn(a.d, authTurn(HI_Q))).response.message!;
    assert.ok(m.includes("semester contribution of about 300 euros"), `fell back to English for: ${bad}`);
  }
});

test("R1 a verbatim 8-word run of restricted (WhatsApp) text inside the localized copy is not shown", async () => {
  // the WhatsApp hit text, quoted in the (Latin-script) Hinglish copy
  const a = build({ detectLanguage: HING }, answer({ replyLang: "hi-Latn" }, { localized: "Haan, my cousin got the DAAD scholarship last year, apply by October aur call karo." }));
  const out = await runStudentTurn(a.d, authTurn(HING_Q));
  assert.ok(!out.response.message!.includes("my cousin got the DAAD scholarship last year"), out.response.message);
});

test("R1 a URL or e-mail that the English claim does not carry is not shown", async () => {
  const a = build({}, answer({}, { localized: `${HI_LOCAL} अधिक जानकारी: https://example.test/fees` }));
  const out = await runStudentTurn(a.d, authTurn(HI_Q));
  assert.ok(!out.response.message!.includes("https://"));
  assert.ok(out.response.message!.includes(EN_CLAIM));
});

test("R1 narrowing VC_REPLY_LANGS to en gives an English reply even for a Hindi turn", async () => {
  const a = build({ replyLangs: ["en"] });
  const out = await runStudentTurn(a.d, authTurn(HI_Q));
  assert.equal((a.provider.calls.find((c) => c.skillName === "kb-answer")!.input as { replyLang: string }).replyLang, "en");
  assert.ok(out.response.message!.includes(EN_CLAIM));
});

test("R1 the follow-up: localized when it passes, omitted (never mixed in English) in a non-English reply when it does not", async () => {
  const withLocal = build({}, answer({ followUp: "Which cities are you considering?", followUpLocalized: "आप किन शहरों के बारे में सोच रहे हैं?" }));
  const m1 = (await runStudentTurn(withLocal.d, authTurn(HI_Q))).response.message!;
  assert.ok(m1.includes("आप किन शहरों के बारे में सोच रहे हैं?"), m1);
  assert.ok(!m1.includes("Which cities"));
  const noLocal = build({}, answer({ followUp: "Which cities are you considering?" }));
  const m2 = (await runStudentTurn(noLocal.d, authTurn(HI_Q))).response.message!;
  assert.ok(!m2.includes("Which cities"), m2);
  assert.ok(m2.includes(HI_LOCAL));
});

// ---------------------------------------------------------------------------
// R2: English search query for a non-English turn
// ---------------------------------------------------------------------------

function withRewrite(a: ReturnType<typeof build>, response: unknown) {
  (a.provider as MockProvider).setResponse("kb-query-rewrite", response as never);
}

test("R2 a non-English turn searches the KB with the English rewrite; the ask fallback and the answer prompt keep the original", async () => {
  const a = build();
  withRewrite(a, { query: "tuition fees german public universities" });
  const out = await runStudentTurn(a.d, authTurn(HI_Q));
  assert.equal(a.kb.calls[0]!.tool, "search_kb");
  assert.equal(a.kb.calls[0]!.arg, "tuition fees german public universities");
  assert.equal((a.provider.calls.find((c) => c.skillName === "kb-answer")!.input as { question: string }).question, HI_Q);
  assert.doesNotMatch(JSON.stringify(out), /tuition fees german public universities/, "the rewrite is not stored or shown");
});

test("R2 an English turn makes no rewrite call", async () => {
  const a = build({ detectLanguage: EN }, answer({ replyLang: "en" }));
  withRewrite(a, { query: "should not be used" });
  await runStudentTurn(a.d, authTurn(EN_Q));
  assert.ok(!a.provider.calls.some((c) => c.skillName === "kb-query-rewrite"));
  assert.equal(a.kb.calls[0]!.arg, EN_Q);
});

test("R2 a rewrite that fails (error, empty, hang) falls back to the original text and the turn is still answered", async () => {
  const none = build(); // no canned response: the mock throws
  const o1 = await runStudentTurn(none.d, authTurn(HI_Q));
  assert.equal(none.kb.calls[0]!.arg, HI_Q);
  assert.equal(o1.response.state, "ok");
  const empty = build();
  withRewrite(empty, { query: "   " });
  await runStudentTurn(empty.d, authTurn(HI_Q));
  assert.equal(empty.kb.calls[0]!.arg, HI_Q);
  const hang = build();
  const real = hang.d.provider;
  const slow: LlmProvider = {
    kind: "mock",
    model: "slow",
    generate: <T>(req: GenerateRequest<T>) => (req.skillName === "kb-query-rewrite" ? new Promise<T>(() => {}) : real.generate(req)),
  };
  hang.d.provider = slow;
  const o3 = await runStudentTurn({ ...hang.d, rewriteTimeoutMs: 50 }, authTurn(HI_Q));
  assert.equal(hang.kb.calls[0]!.arg, HI_Q);
  assert.equal(o3.response.state, "ok");
});

// ---------------------------------------------------------------------------
// R3: model safety screen
// ---------------------------------------------------------------------------

const screenOut = (severity: string) => ({ severity, likelyBenign: false, rationale: "test" });
const screenProvider = (response: unknown) => new MockProvider({ responses: { "concern-classifier": response as never } });

test("R3 a clear screen releases the normal answer; the screen sees the original text with guardLevel none", async () => {
  const sp = screenProvider(screenOut("none"));
  const a = build({ safetyScreen: { provider: sp } });
  const out = await runStudentTurn(a.d, authTurn(HI_Q));
  assert.equal(out.response.state, "ok");
  assert.ok(out.response.message!.includes(HI_LOCAL));
  assert.equal(sp.calls.length, 1);
  const input = sp.calls[0]!.input as { text: string; guardLevel: string };
  assert.equal(input.text, HI_Q);
  assert.equal(input.guardLevel, "none");
});

test("R3 'possible' (severity at or above the escalation threshold) returns the fixed crisis message and nothing of the answer; flag log and escalation run", async () => {
  const a = build({ safetyScreen: { provider: screenProvider(screenOut("high")) }, detectLanguage: EN }, answer({ replyLang: "en" }));
  const out = await runStudentTurn(a.d, authTurn(EN_Q));
  assert.equal(out.response.state, "escalated");
  assert.equal(out.response.message, STUDENT_CRISIS_MESSAGE);
  assert.deepEqual(out.response.claims, []);
  assert.equal(a.flags.length, 1);
  assert.equal(a.escalations.length, 1);
});

test("R3 low and moderate severities do not block the answer", async () => {
  for (const sev of ["low", "moderate"]) {
    const a = build({ safetyScreen: { provider: screenProvider(screenOut(sev)) } });
    assert.equal((await runStudentTurn(a.d, authTurn(HI_Q))).response.state, "ok", sev);
  }
});

test("R3 a screen error returns the fixed crisis message (fail closed), without a flag log or an escalation for an outage", async () => {
  const errors: string[] = [];
  const bad = new MockProvider({ responses: {} }); // no canned response: throws
  const a = build({ safetyScreen: { provider: bad }, onWriteError: (w) => void errors.push(w), detectLanguage: EN }, answer({ replyLang: "en" }));
  const out = await runStudentTurn(a.d, authTurn(EN_Q));
  assert.equal(out.response.state, "escalated");
  assert.equal(out.response.message, STUDENT_CRISIS_MESSAGE);
  assert.equal(a.flags.length, 0);
  assert.equal(a.escalations.length, 0);
  assert.deepEqual(errors, ["safety_screen"]);
});

test("R3 invalid screen output (schema) is an error too: fixed crisis message", async () => {
  const a = build({ safetyScreen: { provider: screenProvider({ nonsense: true }) }, detectLanguage: EN }, answer({ replyLang: "en" }));
  assert.equal((await runStudentTurn(a.d, authTurn(EN_Q))).response.message, STUDENT_CRISIS_MESSAGE);
});

test("R3 a screen that never answers times out to the fixed crisis message", async () => {
  const hang: LlmProvider = { kind: "mock", model: "hang", generate: () => new Promise<never>(() => {}) };
  const a = build({ safetyScreen: { provider: hang, timeoutMs: 50 }, detectLanguage: EN }, answer({ replyLang: "en" }));
  const out = await runStudentTurn(a.d, authTurn(EN_Q));
  assert.equal(out.response.message, STUDENT_CRISIS_MESSAGE);
});

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
const sleep = (ms: number) => new Promise<"slept">((r) => setTimeout(() => r("slept"), ms));

test("R3 the screen runs in PARALLEL with the answer call (the answer waits for the screen to have started)", async () => {
  const screenStarted = deferred();
  const screen: LlmProvider = {
    kind: "mock",
    model: "screen",
    generate: async <T>(req: GenerateRequest<T>) => {
      screenStarted.resolve();
      return req.outputSchema.parse(screenOut("none"));
    },
  };
  const real = studentProvider({ kbAnswer: answer({ replyLang: "en" }) });
  const answerer: LlmProvider = {
    kind: "mock",
    model: "answerer",
    generate: async <T>(req: GenerateRequest<T>) => {
      if (req.skillName === "kb-answer") {
        const r = await Promise.race([screenStarted.promise.then(() => "started"), sleep(1500)]);
        assert.equal(r, "started", "the screen had not started while the answer was being generated");
      }
      return real.generate(req);
    },
  };
  const a = build({ provider: answerer, safetyScreen: { provider: screen }, detectLanguage: EN });
  const out = await runStudentTurn(a.d, authTurn(EN_Q));
  assert.equal(out.response.state, "ok");
});

test("R3 the answer is HELD until the screen returns: a finished answer is not released while the screen is pending, and 'possible' replaces it", async () => {
  const release = deferred();
  const screen: LlmProvider = {
    kind: "mock",
    model: "screen",
    generate: async <T>(req: GenerateRequest<T>) => {
      await release.promise;
      return req.outputSchema.parse(screenOut("critical"));
    },
  };
  const a = build({ safetyScreen: { provider: screen }, detectLanguage: EN }, answer({ replyLang: "en" }));
  const turn = runStudentTurn(a.d, authTurn(EN_Q));
  const raced = await Promise.race([turn.then(() => "released"), sleep(300)]);
  assert.equal(raced, "slept", "the reply must not be released before the screen answered");
  assert.ok(a.provider.calls.some((c) => c.skillName === "kb-answer"), "the answer call itself had already completed");
  release.resolve();
  const out = await turn;
  assert.equal(out.response.state, "escalated");
  assert.ok(!out.response.message!.includes(EN_CLAIM));
});

test("R3 default ON for authenticated turns, OFF for anonymous turns; both switchable", async () => {
  const mk = (cfg: Partial<NonNullable<StudentGraphDeps["safetyScreen"]>>) => {
    const sp = screenProvider(screenOut("none"));
    return { sp, a: build({ safetyScreen: { provider: sp, ...cfg }, detectLanguage: EN, kb: fakeKb({ anonymous: true }) }, answer({ replyLang: "en" })) };
  };
  const anonTurn = { mode: "anonymous" as const, text: EN_Q };
  const x1 = mk({});
  await runStudentTurn(x1.a.d, anonTurn);
  assert.equal(x1.sp.calls.length, 0, "anonymous: off by default");
  const x2 = mk({});
  await runStudentTurn(x2.a.d, authTurn(EN_Q));
  assert.equal(x2.sp.calls.length, 1, "authenticated: on by default");
  const x3 = mk({ anonymous: true });
  await runStudentTurn(x3.a.d, anonTurn);
  assert.equal(x3.sp.calls.length, 1);
  const x4 = mk({ authenticated: false });
  await runStudentTurn(x4.a.d, authTurn(EN_Q));
  assert.equal(x4.sp.calls.length, 0);
});

test("R3 an anonymous 'possible' gives the anonymous crisis message and counts a crisis, not an answer", async () => {
  const a = build({ safetyScreen: { provider: screenProvider(screenOut("critical")), anonymous: true }, detectLanguage: EN, kb: fakeKb({ anonymous: true }) }, answer({ replyLang: "en" }));
  const out = await runStudentTurn(a.d, { mode: "anonymous", text: EN_Q });
  assert.equal(out.response.message, ANONYMOUS_CRISIS_MESSAGE);
  assert.ok(a.counters.includes("crisis"));
});

test("R3 a crisis turn never reaches the screen, the detector or the rewrite (crisisGuard first, no model call)", async () => {
  const sp = screenProvider(screenOut("none"));
  const a = build({ safetyScreen: { provider: sp } });
  const out = await runStudentTurn(a.d, authTurn(CRISIS_EN));
  assert.equal(out.response.message, STUDENT_CRISIS_MESSAGE);
  assert.equal(sp.calls.length, 0);
  assert.equal(a.provider.calls.length, 0);
});

test("R3 with no safetyScreen option nothing is screened (unchanged behaviour)", async () => {
  const a = build({ detectLanguage: EN }, answer({ replyLang: "en" }));
  assert.equal((await runStudentTurn(a.d, authTurn(EN_Q))).response.state, "ok");
});

// ---------------------------------------------------------------------------
// R4: helpline line outside the allow-list
// ---------------------------------------------------------------------------

test("R4 a Tamil turn (outside the allow-list) gets an English reply that carries the English+Hindi helpline line", async () => {
  const a = build({ detectLanguage: TA }, answer({ replyLang: "en" }));
  const out = await runStudentTurn(a.d, authTurn(TA_Q));
  assert.equal(out.replyLang, "en");
  assert.ok(out.response.message!.includes(EN_CLAIM));
  assert.ok(out.response.message!.endsWith(HELPLINE_LINE_EN_HI), out.response.message);
});

test("R4 a no-answer and a provider failure in an uncovered language carry it too; an anonymous non-answer gets the Hindi gloss added once", async () => {
  const empty = build({ detectLanguage: TA, kb: fakeKb({ search: { status: "ok", hits: [], dropped: 0 }, anonymous: true }) });
  const anon = await runStudentTurn(empty.d, { mode: "anonymous", text: EN_Q }); // detector says ta; the rule classifier reads the English question as generic
  assert.equal(anon.response.message, `${ANONYMOUS_NO_ANSWER_TEXT} ${HELPLINE_GLOSS}`);
  const signIn = await runStudentTurn(build({ detectLanguage: TA, kb: fakeKb({ anonymous: true }) }).d, { mode: "anonymous", text: TA_Q });
  assert.equal(signIn.response.state, "sign_in_required");
  assert.equal(signIn.response.message, `${ANONYMOUS_SIGN_IN_TEXT} ${HELPLINE_GLOSS}`);
  const auth = build({ detectLanguage: TA, kb: fakeKb({ search: { status: "ok", hits: [], dropped: 0 } }) });
  auth.d.kb.askKnowledgeBase = async () => { throw new Error("down"); };
  const out = await runStudentTurn(auth.d, authTurn(TA_Q));
  assert.equal(out.response.state, "no_sourced_answer");
  assert.ok(out.response.message!.endsWith(HELPLINE_LINE_EN_HI));
  const broken = build({ detectLanguage: TA, provider: new MockProvider({ responses: {} }) });
  const f = await runStudentTurn(broken.d, authTurn(TA_Q));
  assert.equal(f.retryable, true);
  assert.ok(f.response.message!.endsWith(HELPLINE_LINE_EN_HI));
});

test("R4 allow-listed languages and English do not get the extra line; an unlisted-by-narrowing language does", async () => {
  const hi = await runStudentTurn(build().d, authTurn(HI_Q));
  assert.ok(!hi.response.message!.includes(HELPLINE_GLOSS));
  const en = await runStudentTurn(build({ detectLanguage: EN }, answer({ replyLang: "en" })).d, authTurn(EN_Q));
  assert.ok(!en.response.message!.includes(HELPLINE_GLOSS));
  const narrowed = await runStudentTurn(build({ replyLangs: ["en"] }).d, authTurn(HI_Q));
  assert.ok(narrowed.response.message!.endsWith(HELPLINE_LINE_EN_HI));
});

test("R4 the crisis messages are untouched (they already carry the gloss; no double line)", async () => {
  const out = await runStudentTurn(build({ detectLanguage: TA }).d, authTurn(CRISIS_EN));
  assert.equal(out.response.message, STUDENT_CRISIS_MESSAGE);
});

// ---------------------------------------------------------------------------
// LK4 review fixes: detector robustness, dropped VC_REPLY_LANGS entries
// ---------------------------------------------------------------------------

test("D a provider that throws synchronously falls back to the offline result", async () => {
  const reasons: string[] = [];
  const sync: LlmProvider = { kind: "mock", model: "sync", generate: (() => { throw new Error("sync boom"); }) as never };
  const detect = createModelLanguageDetector(sync, { onFallback: (r) => void reasons.push(r) });
  const out = await detect("जर्मनी की सरकारी यूनिवर्सिटी में फीस कितनी है");
  assert.equal(out.source, "script");
  assert.equal(out.lang, "hi");
  assert.deepEqual(reasons, ["error"]);
});

test("D a provider that resolves null falls back to the offline result", async () => {
  const reasons: string[] = [];
  const nul: LlmProvider = { kind: "mock", model: "null", generate: (async () => null) as never };
  const detect = createModelLanguageDetector(nul, { onFallback: (r) => void reasons.push(r) });
  const out = await detect(EN_Q);
  assert.equal(out.source, "script");
  assert.equal(out.lang, "en");
  assert.deepEqual(reasons, ["invalid"]);
});

test("D dropped VC_REPLY_LANGS entries are reported by tag only; supported ones are kept; nothing is reported when all are valid", () => {
  const seen: string[][] = [];
  assert.deepEqual(parseReplyLangs("hi, ta, xx-YY,en", (d) => void seen.push(d)), ["en", "hi"]);
  assert.deepEqual(seen, [["ta", "xx-YY"]]);
  const none: string[][] = [];
  parseReplyLangs("en,hi,hi-Latn", (d) => void none.push(d));
  parseReplyLangs(undefined, (d) => void none.push(d));
  parseReplyLangs("", (d) => void none.push(d));
  assert.deepEqual(none, []);
});

test("D the default dropped-entry logger writes the tags, never anything else, to the console", () => {
  const lines: string[] = [];
  const orig = console.warn;
  console.warn = (m: unknown) => void lines.push(String(m));
  try {
    parseReplyLangs("hi,ta");
  } finally {
    console.warn = orig;
  }
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /VC_REPLY_LANGS/);
  assert.match(lines[0]!, /\bta\b/);
});
