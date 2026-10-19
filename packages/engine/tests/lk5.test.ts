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
  DEVANAGARI_MAGNITUDE,
  HELPLINE_GLOSS,
  createModelLanguageDetector,
  localizedClaimOk,
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

// ---- repair cycle 1 (ISS-383): a bad optional localized field is "show English", never the provider apology ----

for (const [label, claimOver, topOver] of [
  ["localized empty string", { localized: "" }, {}],
  ["localized null", { localized: null }, {}],
  ["localized over 2000 characters", { localized: "क".repeat(2001) }, {}],
  ["replyLang empty string", {}, { replyLang: "" }],
  ["replyLang null", {}, { replyLang: null }],
  ["replyLang over 16 characters", {}, { replyLang: "h".repeat(17) }],
] as const) {
  test(`K1 repair: ${label} -> the English reply, not the provider apology`, async () => {
    const a = build({}, answer(topOver as Record<string, unknown>, claimOver as Record<string, unknown>));
    const out = await runStudentTurn(a.d, authTurn(HI_Q));
    assert.equal(out.response.state, "ok");
    assert.ok(out.response.message!.includes(EN_CLAIM), out.response.message);
    assert.ok(!out.response.message!.includes("Sorry, I couldn't put an answer together"), out.response.message);
    assert.ok(!out.response.message!.includes(HI_LOCAL));
  });
}

for (const [label, fl] of [["empty", ""], ["null", null], ["over 500 characters", "क".repeat(501)]] as const) {
  test(`K1 repair: followUpLocalized ${label} -> the Hindi reply without a follow-up (never the apology)`, async () => {
    const a = build({}, answer({ followUp: "Which cities are you considering?", followUpLocalized: fl }));
    const out = await runStudentTurn(a.d, authTurn(HI_Q));
    assert.equal(out.response.state, "ok");
    assert.ok(out.response.message!.includes(HI_LOCAL), out.response.message);
    assert.ok(!out.response.message!.includes("Which cities"), out.response.message);
    assert.ok(!out.response.message!.includes("Sorry, I couldn't"));
  });
}

test("K1 repair: an English turn whose model emits localized empty or null still gets the English reply", async () => {
  for (const localized of ["", null]) {
    const a = build({ detectLanguage: EN }, answer({ replyLang: "en" }, { localized }));
    const out = await runStudentTurn(a.d, authTurn(EN_Q));
    assert.ok(out.response.message!.includes(EN_CLAIM), out.response.message);
    assert.ok(!out.response.message!.includes("Sorry, I couldn't"));
  }
});

test("K1 repair: text, kind and sourceIds stay strict (an empty English text is still the provider apology)", async () => {
  const a = build({}, answer({}, { text: "" }));
  const out = await runStudentTurn(a.d, authTurn(HI_Q));
  assert.ok(out.response.message!.includes("Sorry, I couldn't"), out.response.message);
});

// ---- repair cycle 1 (M1): the localized claim passes the same number, country and link guards as the English claim ----

test("M1 repair: a spelled-out figure the English claim does not carry is not shown (Devanagari magnitude word, Hinglish number words)", async () => {
  for (const [lang, replyLang, localized, q] of [
    [HI, "hi", `${HI_LOCAL} लगभग दो हज़ार यूरो का खर्च अलग से आता है।`, HI_Q],
    [HING, "hi-Latn", `${HING_LOCAL} Lagbhag do hazaar alag se lagte hain.`, HING_Q],
    [HING, "hi-Latn", `${HING_LOCAL} Lagbhag five thousand alag se lagte hain.`, HING_Q],
    [HING, "hi-Latn", `${HING_LOCAL} Lagbhag do hazaar euros alag se lagte hain.`, HING_Q],
  ] as const) {
    const a = build({ detectLanguage: lang }, answer({ replyLang }, { localized }));
    const m = (await runStudentTurn(a.d, authTurn(q))).response.message!;
    assert.ok(m.includes(EN_CLAIM), `English for: ${localized}`);
    assert.ok(!/हज़ार|hazaar|five thousand/.test(m), m);
  }
});

test("M1 repair: a spelled-out figure that DIFFERS from the English one is not shown", async () => {
  const num = { text: "Expect a semester contribution of about 300 euros.", kind: "number" };
  const swapped = build({ detectLanguage: HING }, answer({ replyLang: "hi-Latn" }, { ...num, localized: "Semester contribution lagbhag teen sau euros hai." }));
  const m = (await runStudentTurn(swapped.d, authTurn(HING_Q))).response.message!;
  assert.ok(m.includes("300 euros"), `English reply: ${m}`);
  assert.ok(!m.includes("teen sau"), m);
  const same = build({ detectLanguage: HING }, answer({ replyLang: "hi-Latn" }, { ...num, localized: "Semester contribution lagbhag 300 euros hai." }));
  assert.ok((await runStudentTurn(same.d, authTurn(HING_Q))).response.message!.includes("lagbhag 300 euros"), "control: the same figure passes");
});

test("M1 repair: a country the English claim does not name, or a swapped country, is not shown (Devanagari and Latin)", async () => {
  for (const [lang, replyLang, localized, q] of [
    [HI, "hi", HI_LOCAL.replace("जर्मनी", "फ्रांस"), HI_Q],
    [HI, "hi", `${HI_LOCAL} फ्रांस में भी यही नियम है।`, HI_Q],
    [HING, "hi-Latn", HING_LOCAL.replace("Germany", "France"), HING_Q],
    [HING, "hi-Latn", `${HING_LOCAL} Canada mein bhi aisa hi hai.`, HING_Q],
  ] as const) {
    const a = build({ detectLanguage: lang }, answer({ replyLang }, { localized }));
    const m = (await runStudentTurn(a.d, authTurn(q))).response.message!;
    assert.ok(m.includes(EN_CLAIM), `English for: ${localized}`);
    assert.ok(!/फ्रांस|France|Canada/.test(m), m);
  }
  // control: the same country as English passes
  const ok = build({}, answer());
  assert.ok((await runStudentTurn(ok.d, authTurn(HI_Q))).response.message!.includes(HI_LOCAL));
});

test("M1 repair: a scheme-less domain in the localized claim is not shown (evil.test), a www host or e-mail neither", async () => {
  for (const extra of ["अधिक जानकारी evil.test पर देखें।", "अधिक जानकारी www.evil.test पर देखें।", "संपर्क: help@evil.test", "अधिक जानकारी evil.test/fees पर देखें।"]) {
    const a = build({}, answer({}, { localized: `${HI_LOCAL} ${extra}` }));
    const m = (await runStudentTurn(a.d, authTurn(HI_Q))).response.message!;
    assert.ok(m.includes(EN_CLAIM), `English for: ${extra}`);
    assert.ok(!m.includes("evil.test"), m);
  }
});

test("M1 repair: localizedClaimOk - a link different from the English one fails even when English carries a link; the same link passes", () => {
  const en = "Details are on https://daad.de/en/fees today.";
  assert.equal(localizedClaimOk(en, "शुल्क के बारे में पूरा विवरण आज की तारीख में https://daad.de/en/fees पर हैं।", "hi", []), true);
  assert.equal(localizedClaimOk(en, "शुल्क के बारे में पूरा विवरण आज की तारीख में https://evil.test/fees पर हैं।", "hi", []), false);
  assert.equal(localizedClaimOk(en, "शुल्क के बारे में पूरा विवरण आज की तारीख में https://daad.de/en/fees और evil.test पर हैं।", "hi", []), false);
  assert.equal(localizedClaimOk(en, "शुल्क के बारे में पूरा विवरण आज की तारीख में https://daad.de/en/other पर हैं।", "hi", []), false);
  const plain = "यहाँ पर शुल्क के बारे में पूरी जानकारी उपलब्ध है और कोई लिंक नहीं है।";
  assert.equal(localizedClaimOk("No link here.", plain, "hi", []), true, "control: without the host it passes");
  assert.equal(localizedClaimOk("No link here.", `${plain} evil.test`, "hi", []), false);
  assert.equal(localizedClaimOk("It costs 3.5 lakh, e.g. in Berlin.", "यह 3.5 लाख लगता है, जैसे बर्लिन में।", "hi", []), true);
});

// ---- repair cycle 2: Devanagari number/unit words (ISS-386), the magnitude regex (ISS-387), IDN hosts and dot variants ----

const NUM_EN = "Expect a semester contribution of about 300 euros.";
const NUM_HI = "लगभग 300 यूरो का सेमेस्टर योगदान देना होगा।";

test("ISS-386: a Devanagari number word or currency/unit word the English claim does not carry gives the English reply (cycle-1 probes)", async () => {
  for (const [en, localized] of [
    [EN_CLAIM, `${HI_LOCAL} पर पचास यूरो लगते हैं।`],
    [NUM_EN, `${NUM_HI} और सालाना पाँच हज़ार यूरो।`],
    [NUM_EN, `${NUM_HI} और कुल दस लाख।`],
    [NUM_EN, "लगभग 300 रुपये का सेमेस्टर योगदान देना होगा।"],
    [NUM_EN, "लगभग 300 डॉलर का सेमेस्टर योगदान देना होगा।"],
    [NUM_EN, "हर महीने लगभग 300 यूरो देने होंगे।"],
    [EN_CLAIM, `${HI_LOCAL} पांच साल तक।`],
    [EN_CLAIM, `${HI_LOCAL} बीस प्रतिशत छात्र।`],
    [NUM_EN, `${NUM_HI} यह तीन सौ पचास भी हो सकता है।`],
  ] as const) {
    const a = build({}, answer({}, { text: en, localized, kind: en === NUM_EN ? "number" : "fact" }));
    const m = (await runStudentTurn(a.d, authTurn(HI_Q))).response.message!;
    assert.ok(m.includes(en), `English for: ${localized} -> ${m}`);
    assert.ok(!m.includes(localized), m);
  }
});

test("ISS-386 controls: the same figure in Devanagari digits, and a figure-free localized claim, are still shown", async () => {
  const digits = "लगभग ३०० यूरो का सेमेस्टर योगदान देना होगा।";
  const a = build({}, answer({}, { text: NUM_EN, localized: digits, kind: "number" }));
  assert.ok((await runStudentTurn(a.d, authTurn(HI_Q))).response.message!.includes(digits));
  const b = build({}, answer());
  assert.ok((await runStudentTurn(b.d, authTurn(HI_Q))).response.message!.includes(HI_LOCAL));
  assert.equal(localizedClaimOk(NUM_EN, NUM_HI, "hi", []), true, "the same figure and unit");
  assert.equal(localizedClaimOk("It costs 5000 euros.", "इसकी लागत पाँच हज़ार यूरो है।", "hi", []), true, "a word figure equal to the English figure");
  assert.equal(localizedClaimOk("It costs 5000 euros.", "इसकी लागत पाँच हज़ार रुपये है।", "hi", []), false, "same value, other currency");
  assert.equal(localizedClaimOk("It costs 5000 euros.", "इसकी लागत छह हज़ार यूरो है।", "hi", []), false, "a different word figure");
  assert.equal(localizedClaimOk("It costs 5000 euros.", "इसकी लागत डेढ़ हज़ार यूरो है।", "hi", []), false, "a fraction word is never mapped");
  assert.equal(localizedClaimOk("It is a good option.", "यह एक अच्छा विकल्प है।", "hi", []), true, "a bare एक (the article) is not a figure");
  assert.equal(localizedClaimOk("It is a good option.", "यह एक लाख का विकल्प है।", "hi", []), false);
});

test("ISS-387: DEVANAGARI_MAGNITUDE keeps its \p escapes; सौंदर्य does not match, सौ does", () => {
  assert.ok(DEVANAGARI_MAGNITUDE.source.includes(String.raw`\p{L}\p{M}`), DEVANAGARI_MAGNITUDE.source);
  assert.equal(DEVANAGARI_MAGNITUDE.test("सौंदर्य"), false);
  assert.equal(DEVANAGARI_MAGNITUDE.test("तीन सौ यूरो"), true);
  assert.equal(localizedClaimOk("Beauty courses are offered.", "सौंदर्य के कोर्स उपलब्ध हैं।", "hi", []), true);
});

test("review medium: a Devanagari IDN host with combining marks is detected as a link", () => {
  const plain = "यहाँ पर शुल्क के बारे में पूरी जानकारी उपलब्ध है और कोई लिंक नहीं है।";
  for (const host of ["शिक्षा.संस्थान", "example.शिक्षा", "सेवा.संस्थान/fees"]) {
    assert.equal(localizedClaimOk("No link here.", `${plain} ${host}`, "hi", []), false, host);
  }
});

test("review low: the dot variants 。．｡․ fold to '.' before the link check", () => {
  const plain = "यहाँ पर शुल्क के बारे में पूरी जानकारी उपलब्ध है और कोई लिंक नहीं है।";
  for (const host of ["evil。test", "evil．test", "evil｡test", "evil․test"]) {
    assert.equal(localizedClaimOk("No link here.", `${plain} ${host}`, "hi", []), false, host);
  }
});

// ---- repair cycle 1 (M2): the crisis-rule check runs on the text actually shown ----

test("M2 repair: a prior-flag student's LOCALIZED reply is checked against the forbidden crisis patterns (shown text, not the English one)", async () => {
  const bad = build(
    { detectLanguage: HING, hasPriorFlag: async () => true },
    answer({ replyLang: "hi-Latn" }, { localized: `${HING_LOCAL} Ye sab secret hai, between us.` }),
  );
  const out = await runStudentTurn(bad.d, authTurn(HING_Q));
  assert.ok(out.response.message!.startsWith(STUDENT_CRISIS_MESSAGE.slice(0, 40)), out.response.message);
  assert.ok(!/secret/i.test(out.response.message!));
  const good = build({ detectLanguage: HING, hasPriorFlag: async () => true }, answer({ replyLang: "hi-Latn" }, { localized: HING_LOCAL }));
  assert.ok((await runStudentTurn(good.d, authTurn(HING_Q))).response.message!.includes(HING_LOCAL));
});

// ---- repair cycle 1 (M3): the localized follow-up passes the English follow-up guards, else the English reply with the English follow-up ----

test("M3 repair: a localized follow-up that fails the English follow-up guards is not shown; the English follow-up is", async () => {
  const cases: [string, typeof HI, string, string, string][] = [
    ["country", HI, "hi", HI_Q, "आप फ्रांस के किन शहरों के बारे में सोच रहे हैं?"],
    ["personal name", HI, "hi", HI_Q, "काव्या किन शहरों के बारे में सोच रही हैं?"],
    ["digit", HI, "hi", HI_Q, "आप 3 किन शहरों के बारे में सोच रहे हैं?"],
    ["script-like (recital cue)", HING, "hi-Latn", HING_Q, "Aap convince karna chahte hain kya?"],
    ["second sentence", HI, "hi", HI_Q, "ठीक है। आप किन शहरों के बारे में सोच रहे हैं?"],
    ["not a question", HI, "hi", HI_Q, "आप किन शहरों के बारे में सोच रहे हैं।"],
  ];
  for (const [label, lang, replyLang, q, fl] of cases) {
    const localized = replyLang === "hi" ? HI_LOCAL : HING_LOCAL;
    const a = build({ detectLanguage: lang }, answer({ replyLang, followUp: "Which cities are you considering?", followUpLocalized: fl }, { localized }));
    const m = (await runStudentTurn(a.d, authTurn(q))).response.message!;
    assert.ok(m.includes("Which cities are you considering?"), `${label}: English follow-up shown: ${m}`);
    assert.ok(m.includes(EN_CLAIM), `${label}: English reply`);
    assert.ok(!m.includes(fl), `${label}: the unsafe localized follow-up is not shown`);
  }
});

test("M3 repair: a clean localized follow-up is still shown in the Hindi reply", async () => {
  const a = build({}, answer({ followUp: "Which cities are you considering?", followUpLocalized: "आप किन शहरों के बारे में सोच रहे हैं?" }));
  const m = (await runStudentTurn(a.d, authTurn(HI_Q))).response.message!;
  assert.ok(m.includes(HI_LOCAL) && m.includes("आप किन शहरों के बारे में सोच रहे हैं?"), m);
  assert.ok(!m.includes("Which cities"));
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
