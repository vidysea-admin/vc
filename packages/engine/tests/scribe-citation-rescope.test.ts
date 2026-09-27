/**
 * T-013 rescope (D-020, gate qa/gates/citation-guarantee-scope.md, contract B2 amendment
 * 2026-09-26): direct unit coverage of `verifyCandidateFact`'s citation-location (verbatim/
 * normalised tiers) and auto-verify surface (typed numbers + the fixed country/alias vocabulary,
 * whole-word). Ported from the stalled `wave/t-013-citation-robustness` branch: the normaliser and
 * match-tier concept (NFC Devanagari, smart-quote, negation-adjacent hostile probes), NOT its
 * entity-glue/aboutness heuristics (qa/debug/t-013-citation-robustness-cycle3.md: that approach is a
 * structurally unbounded NL-judgment problem and stalled 3 fix cycles running). Per the rescoped B2,
 * every non-auto-verified text/reasoning fact is KEPT and flagged `needsReview`, never dropped.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { verifyCandidateFact, assessFactForReview } from "../src/scribe/nodes.js";
// A namespace import (not a named one) for the T-030 audit export, so a build without it fails only the
// audit tests (undefined), not the whole file at ESM link time.
import * as scribeNodes from "../src/scribe/nodes.js";
import type { ScribeTurn } from "../src/scribe/schemas.js";

function turn(overrides: Partial<ScribeTurn> & { turnId: string; text: string }): ScribeTurn {
  return {
    speaker: "student",
    lang: "en",
    translatedText: overrides.text,
    ts: 1,
    ...overrides,
  };
}

function turnsById(...turns: ScribeTurn[]): ReadonlyMap<string, ScribeTurn> {
  return new Map(turns.map((t) => [t.turnId, t]));
}

function candidate(overrides: Record<string, unknown>) {
  return {
    key: "k",
    value: "v",
    source: { type: "transcript", quote: "q", turnId: "t1" },
    confidence: 0.9,
    sensitivity: "low",
    ...overrides,
  };
}

const SESSION_ENDED = "2026-09-26T00:00:00.000Z";

// ---------------------------------------------------------------------------
// 1. Citation location: strict two-tier matching, never fuzzy (requirement 1)
// ---------------------------------------------------------------------------

test("citation location: an exact quote matches at the verbatim tier", () => {
  const turns = turnsById(turn({ turnId: "t1", text: "I want to study in Canada." }));
  const raw = candidate({ key: "targetCountry", value: "Canada", source: { type: "transcript", quote: "study in Canada", turnId: "t1" } });
  const result = verifyCandidateFact(raw, turns, SESSION_ENDED);
  assert.ok("fact" in result, "expected the fact to be kept");
  if ("fact" in result) assert.equal(result.fact.citationMatch, "verbatim");
});

test("citation location: a re-cased quote (case drift) matches at the normalised tier and is KEPT, not dropped (T-009 regression)", () => {
  const turns = turnsById(turn({ turnId: "t1", text: "I want to study in Canada." }));
  const raw = candidate({ key: "targetCountry", value: "Canada", source: { type: "transcript", quote: "STUDY IN CANADA", turnId: "t1" } });
  const result = verifyCandidateFact(raw, turns, SESSION_ENDED);
  assert.ok("fact" in result, "a re-cased but genuine quote must be kept, never dropped as fabricated");
  if ("fact" in result) assert.equal(result.fact.citationMatch, "normalised");
});

test("citation location: an NFD-decomposed Devanagari nukta letter in the quote matches an NFC-precomposed transcript (composition-exclusion trap named in qa/debug/t-013-citation-robustness-cycle3.md)", () => {
  // ज़ (ZA) is a Unicode canonical-composition EXCLUSION: it can be written as one precomposed
  // codepoint (U+095B) or as the decomposed base+nukta sequence (U+091C U+093C) — two different
  // encodings a transcription tool can emit for the exact same word. Built via fromCodePoint so the
  // source file's own on-disk encoding never silently normalises the fixture for us.
  const zaPrecomposed = String.fromCodePoint(0x095b); // ज़ as ONE codepoint
  const zaDecomposed = String.fromCodePoint(0x091c, 0x093c); // ज + ़ (nukta) as TWO codepoints
  const rest = String.fromCodePoint(0x94b, 0x930, 0x942, 0x930); // ोरूर ("...roor" of "zaroor")
  const turnText = `कनाडा ${zaPrecomposed}${rest} जाना`; // "कनाडा ज़रूर जाना"
  const quote = `${zaDecomposed}${rest}`; // the decomposed spelling of "ज़रूर" alone
  assert.notEqual(turnText, quote.padStart(0), "sanity: this is exercising two distinct raw encodings");
  const turns = turnsById(turn({ turnId: "t1", text: turnText }));
  const raw = candidate({ key: "targetCountry", value: "Canada", source: { type: "transcript", quote, turnId: "t1" } });
  const result = verifyCandidateFact(raw, turns, SESSION_ENDED);
  assert.ok("fact" in result, "an NFD-vs-NFC nukta encoding drift must not fabricate-drop a genuine quote");
  // NFC actually recovers this one at the STRONGEST tier: composition exclusion means both encodings
  // normalise down to the same decomposed form under NFC, so no casefold/punctuation-strip is needed.
  if ("fact" in result) assert.equal(result.fact.citationMatch, "verbatim");
});

test("citation location: smart (curly) quotes in the transcript match a straight-quote citation at the normalised tier", () => {
  const turns = turnsById(turn({ turnId: "t1", text: "My dad said “twenty lakh is the max” for this." }));
  const raw = candidate({
    key: "budget_inr_per_year",
    value: 2000000,
    // The quote marks are PART of the cited span here (unlike the transcript's curly ones), so this
    // can only match after punctuation-stripping normalises both to the same token break.
    source: { type: "transcript", quote: '"twenty lakh is the max"', turnId: "t1" },
  });
  const result = verifyCandidateFact(raw, turns, SESSION_ENDED);
  assert.ok("fact" in result);
  if ("fact" in result) assert.equal(result.fact.citationMatch, "normalised");
});

test("citation location NEGATIVE: a quote with a genuinely inserted word is fabricated and dropped (normalisation never becomes fuzzy matching)", () => {
  const turns = turnsById(turn({ turnId: "t1", text: "I want to study in Canada." }));
  const raw = candidate({
    key: "targetCountry",
    value: "Canada",
    source: { type: "transcript", quote: "study definitely in Canada", turnId: "t1" },
  });
  const result = verifyCandidateFact(raw, turns, SESSION_ENDED);
  assert.ok("dropped" in result, "an inserted word is a real fabrication, not a normalisation gap");
  if ("dropped" in result) assert.match(result.dropped.reason, /fabricated citation/);
});

// ---------------------------------------------------------------------------
// 2 & 3. Auto-verify surface: typed numbers + fixed vocabulary, whole word; everything else KEPT as
// needsReview, never dropped (requirements 2 and 3)
// ---------------------------------------------------------------------------

test("auto-verify: a typed number present as a whole token in the quote is verified (needsReview: false)", () => {
  // fix cycle 1 (D-020 fail-safe rule): the positive fixture is first-person with no currency or
  // multiplier. The cycle-0 fixture ("around 20000 rupees a year": no first person in the quote, a
  // currency word in the turn) is kept below as the matching negative.
  const turns = turnsById(turn({ turnId: "t3", text: "I scored 92 in my class 12 boards." }));
  const raw = candidate({ key: "class12_percentage", value: 92, source: { type: "transcript", quote: "I scored 92 in my class 12 boards", turnId: "t3" } });
  const result = verifyCandidateFact(raw, turns, SESSION_ENDED);
  assert.ok("fact" in result);
  if ("fact" in result) {
    assert.equal(result.fact.needsReview, false);
    assert.equal(result.fact.reviewReasons, undefined);
  }

  const oldTurns = turnsById(turn({ turnId: "t3", text: "We can manage around 20000 rupees a year." }));
  const oldRaw = candidate({ key: "budget_inr_per_year", value: 20000, source: { type: "transcript", quote: "around 20000 rupees a year", turnId: "t3" } });
  const oldResult = verifyCandidateFact(oldRaw, oldTurns, SESSION_ENDED);
  assert.ok("fact" in oldResult, "kept, never dropped");
  if ("fact" in oldResult) assert.equal(oldResult.fact.needsReview, true, "a currency word in the turn now forces review");
});

test("auto-verify NEGATIVE: a number embedded inside a LARGER digit run never auto-verifies (no false positive from substring matching, e.g. 15 inside 115)", () => {
  const turns = turnsById(turn({ turnId: "t1", text: "115 students applied from that batch." }));
  const raw = candidate({ key: "siblingCount", value: 15, source: { type: "transcript", quote: "115 students applied from that batch", turnId: "t1" } });
  const result = verifyCandidateFact(raw, turns, SESSION_ENDED);
  assert.ok("fact" in result, "the quote itself is genuine, so the fact is kept");
  if ("fact" in result) {
    assert.equal(result.fact.needsReview, true, "15 must never auto-verify by matching inside 115");
  }
});

test("auto-verify NEGATIVE: a word-form amount (e.g. spelled-out lakh figure) never auto-verifies just because the TYPED value happens to be a number", () => {
  const turns = turnsById(turn({ turnId: "t1", text: "I have twenty-five lakh saved up for this." }));
  const raw = candidate({
    key: "budget_inr_per_year",
    value: 2500000,
    source: { type: "transcript", quote: "twenty-five lakh saved up for this", turnId: "t1" },
  });
  const result = verifyCandidateFact(raw, turns, SESSION_ENDED);
  assert.ok("fact" in result);
  if ("fact" in result) assert.equal(result.fact.needsReview, true, "no digit string of the value appears verbatim, so it must stay needsReview");
});

test("auto-verify: a closed-vocabulary country value, whole-word matched, is verified", () => {
  // fix cycle 2 (ISS-t-013r-rev-6 allow-list): the positive quote is the WHOLE clause. The cycle-1
  // fixture (a cropped quote without the "I want to") is kept below as an unrecognised-form negative.
  const turns = turnsById(turn({ turnId: "t1", text: "I want to move to the USA for my masters." }));
  const raw = candidate({ key: "targetCountry", value: "USA", source: { type: "transcript", quote: "I want to move to the USA for my masters", turnId: "t1" } });
  const result = verifyCandidateFact(raw, turns, SESSION_ENDED);
  assert.ok("fact" in result);
  if ("fact" in result) assert.equal(result.fact.needsReview, false);

  const cropped = candidate({ key: "targetCountry", value: "USA", source: { type: "transcript", quote: "move to the USA for my masters", turnId: "t1" } });
  const croppedResult = verifyCandidateFact(cropped, turns, SESSION_ENDED);
  assert.ok("fact" in croppedResult, "kept, never dropped");
  if ("fact" in croppedResult) {
    assert.equal(croppedResult.fact.needsReview, true, "a cropped quote is not a whole clause");
    assert.ok((croppedResult.fact.reviewReasons ?? []).some((r) => r.startsWith("unrecognised-form:")));
  }
});

test("auto-verify NEGATIVE (hostile, sibling of ISS-t-013-c3-1): 'new britain' (a distractor place) never verifies as UK", () => {
  const turns = turnsById(turn({ turnId: "t1", text: "My uncle used to live in new britain for a while." }));
  const raw = candidate({ key: "targetCountry", value: "UK", source: { type: "transcript", quote: "used to live in new britain for a while", turnId: "t1" } });
  const result = verifyCandidateFact(raw, turns, SESSION_ENDED);
  assert.ok("fact" in result, "the quote is genuine (not fabricated) — it just doesn't support the value");
  if ("fact" in result) {
    assert.equal(result.fact.needsReview, true, "'new britain' must not be read as the UK");
  }
});

test("auto-verify NEGATIVE (hostile, sibling of ISS-t-013-c3-1): 'bank of america' never verifies as USA", () => {
  const turns = turnsById(turn({ turnId: "t1", text: "My scholarship is paid through bank of america." }));
  const raw = candidate({ key: "targetCountry", value: "USA", source: { type: "transcript", quote: "paid through bank of america", turnId: "t1" } });
  const result = verifyCandidateFact(raw, turns, SESSION_ENDED);
  assert.ok("fact" in result);
  if ("fact" in result) assert.equal(result.fact.needsReview, true, "'bank of america' must not be read as the USA");
});

test("auto-verify NEGATIVE (D-020 named case): a third-party referent ('my cousin is in the UK') is never verified, even though the vocabulary literally matches", () => {
  const turns = turnsById(turn({ turnId: "t1", text: "My cousin is in the UK right now." }));
  const raw = candidate({ key: "relativeLocation", value: "UK", source: { type: "transcript", quote: "my cousin is in the UK right now", turnId: "t1" } });
  const result = verifyCandidateFact(raw, turns, SESSION_ENDED);
  assert.ok("fact" in result);
  if ("fact" in result) {
    assert.equal(result.fact.needsReview, true, "at minimum, a third-party-grounded value must not be verified (D-020)");
  }
});

test("every other text fact is KEPT (never dropped) as needsReview — e.g. a free-text course name outside the closed vocabulary", () => {
  const turns = turnsById(turn({ turnId: "t1", text: "I'm interested in the robotics engineering program." }));
  const raw = candidate({
    key: "intendedMajor",
    value: "robotics engineering",
    source: { type: "transcript", quote: "interested in the robotics engineering program", turnId: "t1" },
  });
  const result = verifyCandidateFact(raw, turns, SESSION_ENDED);
  assert.ok("fact" in result, "a free-text course name is a genuine citation and must be kept, not dropped");
  if ("fact" in result) {
    assert.equal(result.fact.needsReview, true);
    assert.ok(result.fact.reviewReasons && result.fact.reviewReasons.length > 0);
  }
});

// ---------------------------------------------------------------------------
// 4. reasoning fact kind
// ---------------------------------------------------------------------------

test("reasoning fact: always needsReview, requires `explains`, and is kept when cited", () => {
  const turns = turnsById(turn({ turnId: "t1", text: "I picked the UK because my sister lives there." }));
  const raw = candidate({
    key: "why_targetCountry",
    value: "sister lives there",
    kind: "reasoning",
    explains: "targetCountry",
    source: { type: "transcript", quote: "because my sister lives there", turnId: "t1" },
  });
  const result = verifyCandidateFact(raw, turns, SESSION_ENDED);
  assert.ok("fact" in result);
  if ("fact" in result) {
    assert.equal(result.fact.kind, "reasoning");
    assert.equal(result.fact.explains, "targetCountry");
    assert.equal(result.fact.needsReview, true, "a reasoning fact is ALWAYS needsReview, regardless of its value");
  }
});

test("reasoning fact NEGATIVE: missing `explains` is dropped with a clear reason (not silently accepted, not silently defaulted)", () => {
  const turns = turnsById(turn({ turnId: "t1", text: "I picked the UK because my sister lives there." }));
  const raw = candidate({
    key: "why_targetCountry",
    value: "sister lives there",
    kind: "reasoning",
    source: { type: "transcript", quote: "because my sister lives there", turnId: "t1" },
  });
  const result = verifyCandidateFact(raw, turns, SESSION_ENDED);
  assert.ok("dropped" in result);
  if ("dropped" in result) assert.match(result.dropped.reason, /explains/);
});

test("assessFactForReview: a typed number auto-verifies with empty reasons; a reasoning fact never does, even with a vocabulary-shaped value", () => {
  // fix cycle 1: first-person, no pronoun/negation/currency (the cycle-0 fixture "we discussed all 42
  // of them" now carries the third-party pronoun "them" and correctly stays in review).
  // fix cycle 2 (ISS-t-013r-rev-6 allow-list): a score template is the positive; the cycle-1 fixture
  // ("I have finished 42 credits so far", no template) now stays in review as unrecognised-form.
  // T-030 (D-025): the key and the student provenance are part of the evidence; "in the exam" names no
  // exam family, so the positive now names its class-12 board and its key.
  const student = (text: string) => ({ speaker: "student" as const, originalText: text });
  const quote = "I scored 42 in my class 12 boards";
  const verified = assessFactForReview({ kind: "value", value: 42, key: "class12_percentage" }, quote, [quote], student(quote));
  assert.deepEqual(verified, { needsReview: false, reviewReasons: [] });
  const credits = assessFactForReview({ kind: "value", value: 42, key: "class12_percentage" }, "I have finished 42 credits so far", [], student("I have finished 42 credits so far"));
  assert.equal(credits.needsReview, true);
  assert.ok(credits.reviewReasons.some((r) => r.startsWith("unrecognised-form:")));
  assert.equal(assessFactForReview({ kind: "value", value: 42, key: "class12_percentage" }, "we discussed all 42 of them").needsReview, true);
  // no provenance at all = an unknown speaker: never auto-verified
  const noProvenance = assessFactForReview({ kind: "value", value: 42, key: "class12_percentage" }, quote, [quote]);
  assert.equal(noProvenance.needsReview, true);
  assert.deepEqual(noProvenance.reviewReasons.map((r) => r.split(":")[0]), ["speaker"]);

  const reasoning = assessFactForReview({ kind: "reasoning", value: "Canada", key: "why_targetCountry" }, "because Canada has good universities");
  assert.equal(reasoning.needsReview, true);
});

// ---------------------------------------------------------------------------
// Fix cycle 1 (ISS-t-013r-c0-1, -c0-2, -rev-2): the fail-safe auto-verify rule. Auto-verify only when
// the quote is first-person AND the turn has no negation/contrast, no third-party marker and (numbers)
// no unit multiplier or currency. Every other case is KEPT with a named reviewReason, never dropped.
// ---------------------------------------------------------------------------

/**
 * T-030 (D-025): the key a template declares for this quote (country -> targetCountry; a budget ->
 * budget_inr_per_year; IELTS -> ielts_overall; a class-12 board -> class12_percentage), so a positive is
 * judged with the key its clause names and a negative is not rescued or condemned by the key alone.
 */
function declaredKeyFor(quote: string, value: unknown): string {
  if (typeof value !== "number") return "targetCountry";
  const q = quote.toLowerCase();
  if (q.includes("budget") || q.includes("बजट")) return "budget_inr_per_year";
  if (q.includes("ielts")) return "ielts_overall";
  return "class12_percentage";
}

function verifyOne(text: string, quote: string, value: unknown, key = "targetCountry") {
  const turns = turnsById(turn({ turnId: "h1", text }));
  const result = verifyCandidateFact(candidate({ key, value, source: { type: "transcript", quote, turnId: "h1" } }), turns, SESSION_ENDED);
  assert.ok("fact" in result, `kept, never dropped: ${quote}`);
  return "fact" in result ? result.fact : undefined;
}

const reasonsStartWith = (reasons: readonly string[] | undefined, prefix: string) =>
  (reasons ?? []).some((r) => r.startsWith(prefix));

test("fail-safe POSITIVES: first-person, un-negated, own, unscaled values still auto-verify (English, Hinglish, Devanagari)", () => {
  const cases: Array<[string, string, unknown]> = [
    ["I want to go to the UK.", "I want to go to the UK", "UK"],
    ["Mujhe Canada jaana hai.", "Mujhe Canada jaana hai", "Canada"],
    ["Main Australia mein padhna chahta hu.", "Main Australia mein padhna chahta hu", "Australia"],
    ["मुझे Canada जाना है।", "मुझे Canada जाना है", "Canada"],
    ["My score was 92 in class 12 boards.", "My score was 92 in class 12 boards", 92],
    ["I got 7.5 in IELTS.", "I got 7.5 in IELTS", 7.5],
  ];
  for (const [text, quote, value] of cases) {
    const fact = verifyOne(text, quote, value, declaredKeyFor(quote, value));
    assert.equal(fact?.needsReview, false, `should auto-verify: ${quote}`);
  }
});

test("ISS-t-013r-c0-1: a value the turn NEGATES or contrasts away never auto-verifies (reason: negation)", () => {
  const cases: Array<[string, string, string]> = [
    ["UK nahi, Canada jaana hai.", "UK nahi", "UK"],
    ["Not united states, I want Canada.", "Not united states, I want Canada", "USA"],
    ["I don't want the UK, I'd rather go to Canada.", "I don't want the UK", "UK"],
    ["I don’t want the UK.", "I don’t want the UK", "UK"],
    ["I do not want the UK.", "I do not want the UK", "UK"],
    ["I never wanted the UK.", "I never wanted the UK", "UK"],
    ["I want Canada instead of the UK.", "I want Canada instead of the UK", "UK"],
    ["Main UK nahin jaunga.", "Main UK nahin jaunga", "UK"],
    ["Mujhe UK mat bhejo.", "Mujhe UK mat bhejo", "UK"],
    ["मुझे UK नहीं जाना है।", "मुझे UK नहीं जाना है", "UK"],
    // cropped quote: the model cut the negation off, the turn still carries it
    ["I dont want to go to the UK at all.", "go to the UK", "UK"],
    ["Honestly I would not pick it. I want the UK? No.", "I want the UK", "UK"],
  ];
  for (const [text, quote, value] of cases) {
    const fact = verifyOne(text, quote, value);
    assert.equal(fact?.needsReview, true, `negated value must not auto-verify: ${text}`);
    assert.ok(reasonsStartWith(fact?.reviewReasons, "negation:"), `named negation reason: ${text}`);
  }
});

test("ISS-t-013r-c0-2: a third-party referent (pronoun, English/Hinglish/Devanagari kinship) never auto-verifies (reason: third-party)", () => {
  const cases: Array<[string, string]> = [
    ["He is in the UK and I miss him.", "He is in the UK"],
    ["She wants the UK for my sake.", "She wants the UK"],
    ["Their plan is the UK, I am fine with it.", "Their plan is the UK"],
    ["Meri behen UK mein hai abhi.", "Meri behen UK mein hai abhi"],
    ["Mera bhai UK mein padhta hai.", "Mera bhai UK mein padhta hai"],
    ["Didi ke saath main UK jaungi.", "Didi ke saath main UK jaungi"],
    ["Papa chahte hain main UK jaun.", "Papa chahte hain main UK jaun"],
    ["Mummy bolti hai mujhe UK jaana chahiye.", "Mummy bolti hai mujhe UK jaana chahiye"],
    ["Chacha ji UK mein rehte hain, main bhi UK jaunga.", "main bhi UK jaunga"],
    ["मेरी बहन UK में है।", "मेरी बहन UK में है"],
    ["मेरा भाई UK में पढ़ता है।", "मेरा भाई UK में पढ़ता है"],
    ["Uska plan UK hai, mera bhi.", "Uska plan UK hai"],
  ];
  for (const [text, quote] of cases) {
    const fact = verifyOne(text, quote, "UK");
    assert.equal(fact?.needsReview, true, `third-party value must not auto-verify: ${text}`);
    assert.ok(reasonsStartWith(fact?.reviewReasons, "third-party:"), `named third-party reason: ${text}`);
  }
});

test("fail-safe: no first-person marker in the quote -> never auto-verifies (reason: no-first-person)", () => {
  const cases: Array<[string, string, string]> = [
    ["The UK is expensive.", "The UK is expensive", "UK"],
    ["Canada jaana hai.", "Canada jaana hai", "Canada"],
    ["UK mein bahut scope hai.", "UK mein bahut scope hai", "UK"],
  ];
  for (const [text, quote, value] of cases) {
    const fact = verifyOne(text, quote, value);
    assert.equal(fact?.needsReview, true, text);
    assert.ok(reasonsStartWith(fact?.reviewReasons, "no-first-person:"), `named reason: ${text}`);
  }
});

test("ISS-t-013r-rev-2: a number next to a unit multiplier or currency never auto-verifies, scaled or unscaled (reason: unit-multiplier)", () => {
  const cases: Array<[string, string, number]> = [
    ["My budget is 20 lakh.", "My budget is 20 lakh", 20],
    ["My budget is 20 lakh.", "My budget is 20 lakh", 2000000],
    ["My budget is 2 crore.", "My budget is 2 crore", 2],
    ["My budget is 2 cr.", "My budget is 2 cr", 2],
    ["My budget is 50k.", "My budget is 50k", 50],
    ["My budget is 50 k.", "My budget is 50 k", 50],
    ["My budget is 20 thousand.", "My budget is 20 thousand", 20],
    ["My budget is 1.5 million.", "My budget is 1.5 million", 1.5],
    ["My budget is ₹20 per month.", "My budget is ₹20", 20],
    ["My budget is Rs 20.", "My budget is Rs 20", 20],
    ["My budget is rs.20 only.", "My budget is rs.20", 20],
    ["My budget is INR 20.", "My budget is INR 20", 20],
    ["My budget is $20.", "My budget is $20", 20],
    ["My budget is 20 USD.", "My budget is 20 USD", 20],
    ["My budget is £20.", "My budget is £20", 20],
    ["My budget is €20.", "My budget is €20", 20],
    ["Mera budget 20 lac hai.", "Mera budget 20 lac hai", 20],
    ["मेरा बजट 20 लाख है।", "मेरा बजट 20 लाख है", 20],
    ["My budget is 20 lakh.", "My budget is 20", 20], // cropped quote: the turn still carries "lakh"
  ];
  for (const [text, quote, value] of cases) {
    const fact = verifyOne(text, quote, value, "budget_inr_per_year");
    assert.equal(fact?.needsReview, true, `scaled/currency amount must not auto-verify: ${text} -> ${value}`);
    assert.ok(reasonsStartWith(fact?.reviewReasons, "unit-multiplier:"), `named multiplier reason: ${text} -> ${value}`);
  }
});

test("ISS-t-013r-rev-2: a number glued into a larger numeric form never auto-verifies (Indian grouping, decimals, ranges)", () => {
  const cases: Array<[string, number]> = [
    ["My budget is 20,00,000 total", 20],
    ["I got 1.5 in the test", 1],
    ["I got 1.5 in the test", 5],
    ["I scored 20-25 marks", 20],
    ["I scored 20/40 marks", 20],
  ];
  for (const [quote, value] of cases) {
    const fact = verifyOne(`${quote}.`, quote, value, declaredKeyFor(quote, value));
    assert.equal(fact?.needsReview, true, `${value} must not auto-verify from "${quote}"`);
  }
});

test("fail-safe: every flagged fact is KEPT with its value and citation intact, all failing conditions named (D-020: nothing is dropped)", () => {
  const fact = verifyOne("Meri behen UK nahi, Canada gayi, uska budget 20 lakh tha.", "uska budget 20 lakh tha", 20, "budget_inr_per_year");
  assert.equal(fact?.value, 20);
  assert.equal(fact?.source.quote, "uska budget 20 lakh tha");
  assert.equal(fact?.needsReview, true);
  for (const prefix of ["third-party:", "negation:", "no-first-person:", "unit-multiplier:"]) {
    assert.ok(reasonsStartWith(fact?.reviewReasons, prefix), `every failing condition is named: ${prefix}`);
  }
});

// ---------------------------------------------------------------------------
// Fix cycle 2 (ISS-t-013r-rev-4, -rev-5, -rev-6, -c1-1): the ALLOW-LIST gate. Auto-verify only when the
// quote is one whole declarative first-person clause matching a template whose slot is the value, AND
// no deny marker (negation, third-party, multiplier/currency, interrogative, conditional) fires in the
// cited turn. Every other shape is KEPT with a named reason, never dropped.
// ---------------------------------------------------------------------------

function verifyIn(text: string, quote: string, value: unknown, key = "targetCountry") {
  return verifyOne(text, quote, value, key);
}

test("ISS-t-013r-rev-6 allow-list POSITIVES: every template auto-verifies its own value, English / Hinglish / Devanagari", () => {
  const cases: Array<[string, string, unknown]> = [
    // country templates
    ["I want to study in Canada.", "I want to study in Canada", "Canada"],
    ["I'd like to go to the UK.", "I'd like to go to the UK", "UK"],
    ["I would like to study in Germany.", "I would like to study in Germany", "Germany"],
    ["I am planning to move to Australia for my masters.", "I am planning to move to Australia for my masters", "Australia"],
    ["I want to study computer science in Canada.", "I want to study computer science in Canada", "Canada"],
    ["My first choice is the USA.", "My first choice is the USA", "USA"],
    ["I prefer Ireland.", "I prefer Ireland", "Ireland"],
    ["Main Canada jaana chahta hoon.", "Main Canada jaana chahta hoon", "Canada"],
    ["Main UK jaana chahti hoon.", "Main UK jaana chahti hoon", "UK"],
    ["Mujhe Germany jaana hai.", "Mujhe Germany jaana hai", "Germany"],
    ["Meri pehli choice Singapore hai.", "Meri pehli choice Singapore hai", "Singapore"],
    ["मैं Canada जाना चाहता हूँ।", "मैं Canada जाना चाहता हूँ", "Canada"],
    ["मुझे UK में पढ़ना है।", "मुझे UK में पढ़ना है", "UK"],
    ["मेरी पहली पसंद France है।", "मेरी पहली पसंद France है", "France"],
    // number templates
    ["My budget is 1500000.", "My budget is 1500000", 1500000],
    ["I scored 92 in my class 12 boards.", "I scored 92 in my class 12 boards", 92],
    ["I got 7.5 in IELTS.", "I got 7.5 in IELTS", 7.5],
    ["My IELTS score is 7.5.", "My IELTS score is 7.5", 7.5],
    ["Mera budget 1500000 hai.", "Mera budget 1500000 hai", 1500000],
    ["Maine IELTS mein 7.5 score kiya.", "Maine IELTS mein 7.5 score kiya", 7.5],
    ["Mere class 12 boards mein 92 percent aaye.", "Mere class 12 boards mein 92 percent aaye", 92],
    ["मेरा बजट 1500000 है।", "मेरा बजट 1500000 है", 1500000],
    ["मैंने IELTS में 7.5 स्कोर किया।", "मैंने IELTS में 7.5 स्कोर किया", 7.5],
  ];
  for (const [text, quote, value] of cases) {
    const fact = verifyIn(text, quote, value, declaredKeyFor(quote, value));
    assert.equal(fact?.needsReview, false, `template should auto-verify: ${quote} -> ${String(value)}`);
    assert.equal(fact?.reviewReasons, undefined, `no reasons on a verified fact: ${quote}`);
  }
});

test("ISS-t-013r-rev-4: a question never auto-verifies (reason: interrogative), English / Hinglish / Devanagari", () => {
  const cases: Array<[string, string, string]> = [
    ["kya mujhe UK jana chahiye?", "kya mujhe UK jana chahiye?", "UK"],
    ["should I go to the UK?", "should I go to the UK?", "UK"],
    ["Kya main Canada jaana chahta hoon", "main Canada jaana chahta hoon", "Canada"], // no "?" at all
    ["Should I study in Canada", "I study in Canada", "Canada"],
    ["Can I want to go to the UK, or not", "I want to go to the UK", "UK"],
    ["I want to study in Canada?", "I want to study in Canada", "Canada"],
    ["Main Canada jaana chahta hoon?", "Main Canada jaana chahta hoon", "Canada"],
    ["क्या मुझे UK जाना है", "मुझे UK जाना है", "UK"],
    ["Whether I want to study in Canada is unclear.", "I want to study in Canada", "Canada"],
  ];
  for (const [text, quote, value] of cases) {
    const fact = verifyIn(text, quote, value);
    assert.equal(fact?.needsReview, true, `a question must not auto-verify: ${text}`);
    assert.ok(reasonsStartWith(fact?.reviewReasons, "interrogative:"), `named interrogative reason: ${text}`);
  }
});

test("ISS-t-013r-rev-5: conditional / hypothetical phrasing never auto-verifies (reason: conditional)", () => {
  const cases: Array<[string, string, string]> = [
    ["if I get admission I will go to Canada", "if I get admission I will go to Canada", "Canada"],
    ["agar mujhe scholarship milti hai to main UK jaunga", "agar mujhe scholarship milti hai to main UK jaunga", "UK"],
    ["in an ideal world I would study in the UK", "in an ideal world I would study in the UK", "UK"],
    ["maybe I will go to Canada", "maybe I will go to Canada", "Canada"],
    // a template-shaped clause inside a conditional turn still goes to review
    ["If the fees are low, I want to study in Canada.", "I want to study in Canada", "Canada"],
    ["Agar visa mil gaya, main Canada jaana chahta hoon.", "main Canada jaana chahta hoon", "Canada"],
    ["Perhaps. I want to study in Germany.", "I want to study in Germany", "Germany"],
    ["Kaash! Mujhe UK jaana hai.", "Mujhe UK jaana hai", "UK"],
    ["अगर पैसे हुए तो मुझे UK जाना है।", "मुझे UK जाना है", "UK"],
    ["शायद मैं Canada जाना चाहता हूँ।", "मैं Canada जाना चाहता हूँ", "Canada"],
    ["I might want to study in Canada.", "I might want to study in Canada", "Canada"],
  ];
  for (const [text, quote, value] of cases) {
    const fact = verifyIn(text, quote, value);
    assert.equal(fact?.needsReview, true, `a conditional must not auto-verify: ${text}`);
    assert.ok(reasonsStartWith(fact?.reviewReasons, "conditional:"), `named conditional reason: ${text}`);
  }
});

test("ISS-t-013r-rev-6: in-law kinship (Hinglish, Devanagari, English in-law) in the turn forces review even when the clause matches a template (reason: third-party)", () => {
  const words = ["devar", "saali", "saala", "nanad", "jeth", "jethani", "sasur", "saas", "sasural", "behnoi", "bahnoi"];
  const cases: Array<[string, string]> = words.map((w) => [
    `Mere ${w} Canada mein hain. Main Canada jaana chahta hoon.`,
    "Main Canada jaana chahta hoon",
  ]);
  cases.push(["मेरे ससुराल वाले Canada में हैं। मैं Canada जाना चाहता हूँ।", "मैं Canada जाना चाहता हूँ"]);
  cases.push(["मेरे बहनोई Canada में हैं। मैं Canada जाना चाहता हूँ।", "मैं Canada जाना चाहता हूँ"]);
  cases.push(["My in-laws live there. I want to study in Canada.", "I want to study in Canada"]);
  for (const [text, quote] of cases) {
    const fact = verifyIn(text, quote, "Canada");
    assert.equal(fact?.needsReview, true, `in-law referent must not auto-verify: ${text}`);
    assert.ok(reasonsStartWith(fact?.reviewReasons, "third-party:"), `named third-party reason: ${text}`);
  }
});

test("ISS-t-013r-rev-6 allow-list: a first-person, un-negated, own, unscaled value in an UNRECOGNISED shape never auto-verifies (reason: unrecognised-form ONLY — no deny marker fires)", () => {
  const cases: Array<[string, string, unknown]> = [
    ["I heard great things about the UK.", "I heard great things about the UK", "UK"],
    ["I was in Canada last year.", "I was in Canada last year", "Canada"],
    ["I will go to Canada.", "I will go to Canada", "Canada"],
    ["I want to study in the UK next year.", "I want to study in the UK", "UK"], // not the whole clause
    ["My uni is in Canada.", "My uni is in Canada", "Canada"],
    ["I have finished 42 credits so far.", "I have finished 42 credits so far", 42],
    ["Mujhe Canada pasand aaya.", "Mujhe Canada pasand aaya", "Canada"],
    ["मुझे Canada अच्छा लगा।", "मुझे Canada अच्छा लगा", "Canada"],
  ];
  for (const [text, quote, value] of cases) {
    const fact = verifyIn(text, quote, value, declaredKeyFor(quote, value));
    assert.equal(fact?.needsReview, true, `unrecognised shape must not auto-verify: ${quote}`);
    assert.deepEqual(
      (fact?.reviewReasons ?? []).map((r) => r.split(":")[0]),
      ["unrecognised-form"],
      `the allow-list alone keeps it in review: ${quote}`,
    );
  }
});

test("ISS-t-013r-c1-1: a first-person number in a date / year / ordinal context never auto-verifies (reason: unrecognised-form)", () => {
  const cases: Array<[string, string, number]> = [
    ["I am flying on 20 September for my visa interview.", "I am flying on 20 September for my visa interview", 20],
    ["I plan to join in 2026 for my masters.", "I plan to join in 2026 for my masters", 2026],
    ["I was born in 2007.", "I was born in 2007", 2007],
    ["My exam is on 12 March.", "My exam is on 12 March", 12],
    ["I scored 92 in my class 12 boards.", "I scored 92 in my class 12 boards", 12], // the 12 is the class, not the score
    ["I am in my 3rd year.", "I am in my 3rd year", 3],
  ];
  for (const [text, quote, value] of cases) {
    const fact = verifyIn(text, quote, value, declaredKeyFor(quote, value));
    assert.equal(fact?.needsReview, true, `${value} must not auto-verify from "${quote}"`);
    assert.ok(reasonsStartWith(fact?.reviewReasons, "unrecognised-form:"), `named reason: ${quote}`);
  }
});

// ---------------------------------------------------------------------------
// Fix cycle 3 (ISS-t-013r-c2-1 / -rev-9 / -rev-10): another clause of the same cited turn attributes or
// retracts the fact; invisible format characters hide a cue.
// ---------------------------------------------------------------------------

function reasonPrefixes(fact: { reviewReasons?: string[] } | null | undefined): string[] {
  return (fact?.reviewReasons ?? []).map((r) => r.split(":")[0]!);
}

test("ISS-t-013r-c2-1/rev-9 STRUCTURAL: a template clause in a MULTI-CLAUSE turn never auto-verifies (reason: multi-clause), even with no deny word at all", () => {
  const cases: Array<[string, string, unknown]> = [
    // retraction in a second sentence (the reviewer's repros)
    ["I want to study in UK. Scratch that, Canada.", "I want to study in UK", "UK"],
    ["I want to study in UK. Nope, forget it, Canada it is.", "I want to study in UK", "UK"],
    // attribution by an unlisted subject, with NO reporting verb the deny layer knows
    ["Rahul's version: I want to study in UK", "I want to study in UK", "UK"],
    ["My landlord, I want to study in the UK", "I want to study in the UK", "UK"],
    ["Main Canada jaana chahta hoon. Pakka nahi hai.", "Main Canada jaana chahta hoon", "Canada"],
    ["मैं Canada जाना चाहता हूँ। पर देखते हैं।", "मैं Canada जाना चाहता हूँ", "Canada"],
    ["My budget is 1500000. Papa decides.", "My budget is 1500000", 1500000],
    ["I got 7.5 in IELTS; that was the mock.", "I got 7.5 in IELTS", 7.5],
    ["I want to go to Canada because the fees are low.", "I want to go to Canada", "Canada"],
  ];
  for (const [text, quote, value] of cases) {
    const fact = verifyOne(text, quote, value, declaredKeyFor(quote, value));
    assert.equal(fact?.needsReview, true, `multi-clause turn must not auto-verify: ${text}`);
    assert.ok(reasonPrefixes(fact).includes("multi-clause"), `named multi-clause reason: ${text}`);
  }
});

test("ISS-t-013r-c2-1/rev-9: the only surviving two-clause shape is a bare acknowledgement (yes / haan ji / हाँ) — it still auto-verifies", () => {
  const cases: Array<[string, string, string]> = [
    ["Yes, I want to study in Canada.", "I want to study in Canada", "Canada"],
    ["Haan ji. Main Canada jaana chahta hoon.", "Main Canada jaana chahta hoon", "Canada"],
    ["हाँ, मैं Canada जाना चाहता हूँ।", "मैं Canada जाना चाहता हूँ", "Canada"],
  ];
  for (const [text, quote, value] of cases) {
    const fact = verifyOne(text, quote, value);
    assert.equal(fact?.needsReview, false, `acknowledgement + template should verify: ${text}`);
  }
});

test("ISS-t-013r-c2-1/rev-9 second layer: a reporting / attribution cue forces review (reason: reported-speech), English / Hinglish / Devanagari", () => {
  const cases: Array<[string, string]> = [
    ["Rahul said, I want to study in UK", "I want to study in UK"],
    ["Rahul said: I want to study in UK", "I want to study in UK"],
    ["Rahul said I want to study in UK", "I want to study in UK"], // no clause break at all
    ["Priya says, I want to study in UK", "I want to study in UK"],
    ["My landlord says, I want to study in the UK", "I want to study in the UK"],
    ["According to Rahul I want to study in UK", "I want to study in UK"],
    ["Rahul kehta hai main UK jaana chahta hoon", "main UK jaana chahta hoon"],
    ["Rahul ne kaha main UK jaana chahta hoon", "main UK jaana chahta hoon"],
    ["Sir ke mutabik main UK jaana chahta hoon", "main UK jaana chahta hoon"],
    ["मेरे समधी कहते हैं, मैं UK जाना चाहता हूं", "मैं UK जाना चाहता हूं"],
    ["राहुल ने कहा मैं UK जाना चाहता हूँ", "मैं UK जाना चाहता हूँ"],
    ["सर के मुताबिक मैं UK जाना चाहता हूँ", "मैं UK जाना चाहता हूँ"],
  ];
  for (const [text, quote] of cases) {
    const fact = verifyOne(text, quote, "UK");
    assert.equal(fact?.needsReview, true, `reported speech must not auto-verify: ${text}`);
    assert.ok(reasonPrefixes(fact).includes("reported-speech"), `named reported-speech reason: ${text}`);
  }
});

test("ISS-t-013r-rev-10: invisible format characters (ZWSP, WJ, BOM, soft hyphen, LRM/RLM) cannot hide a cue — stripped before tokenising; ZWJ/ZWNJ kept", () => {
  const hidden: Array<[string, string]> = [
    ["I do n\u200Bot want to study in UK", "negation"],
    ["I do n\u2060ot want to study in UK", "negation"],
    ["I do n\uFEFFot want to study in UK", "negation"],
    ["I do n\u00ADot want to study in UK", "negation"],
    ["I do\u200E not\u200F want to study in UK", "negation"],
    ["May\u200Bbe I want to study in UK", "conditional"],
    ["Rahul sa\u200Bid I want to study in UK", "reported-speech"],
  ];
  for (const [text, reason] of hidden) {
    const fact = verifyOne(text, text, "UK");
    assert.equal(fact?.needsReview, true, `hidden cue must not auto-verify: ${JSON.stringify(text)}`);
    assert.ok(reasonPrefixes(fact).includes(reason), `named ${reason} reason: ${JSON.stringify(text)}`);
  }
  // the reviewer's two-clause repro also lands in review
  const repro = verifyOne("I want to study in UK. Kidding, I do n\u200Bot mean it.", "I want to study in UK", "UK");
  assert.equal(repro?.needsReview, true);
  // stripping is deletion, never a break: a ZWSP inside the template clause still verifies
  assert.equal(verifyOne("I want to st\u200Budy in Canada", "I want to st\u200Budy in Canada", "Canada")?.needsReview, false);
  // ZWJ / ZWNJ are part of Devanagari words and are NOT stripped
  const zwj = "\u200D";
  assert.equal(verifyOne(`मैं Canada जाना चाहता हूँ${zwj}`, `मैं Canada जाना चाहता हूँ${zwj}`, "Canada")?.needsReview, true,
    "ZWJ is kept, so the clause no longer equals the template (fail-safe), proving it is not stripped");
});

// ---------------------------------------------------------------------------
// T-030 (ISS-t-013r-rev-14, the ai-engineer BLOCK on T-013 cycle 3): COUNTRY_TEMPLATES[0] had an OPEN
// gap `(?: [\p{L}]+){0,4}?` between the verb and "in/to <country>", so a single-clause attribution with
// an unlisted verb ("as landlord suggested", "as consultant recommended", "as advised") auto-verified.
// The gap is now a CLOSED connector set; any other word there is `unrecognised-form` (kept, reviewed).
// ---------------------------------------------------------------------------

/** Every case is first-person, un-negated, own and unscaled, so ONLY the closed template decides. */
function assertOnlyUnrecognisedForm(cases: ReadonlyArray<readonly [string, string, string]>, label: string) {
  for (const [text, quote, value] of cases) {
    const fact = verifyOne(text, quote, value);
    assert.equal(fact?.needsReview, true, `${label}: must not auto-verify: ${text}`);
    assert.deepEqual(reasonPrefixes(fact), ["unrecognised-form"], `${label}: the closed template alone keeps it in review: ${text}`);
  }
}

test("ISS-t-013r-rev-14 (T-030): an attributed or unlisted filler between the verb and the destination never auto-verifies, English (reason: unrecognised-form ONLY)", () => {
  assertOnlyUnrecognisedForm(
    [
      // the reviewer's five repros
      ["I want to study as landlord suggested in the UK.", "I want to study as landlord suggested in the UK", "UK"],
      ["I want to study as consultant recommended in Canada.", "I want to study as consultant recommended in Canada", "Canada"],
      ["I want to study as agent advised in Australia.", "I want to study as agent advised in Australia", "Australia"],
      ["I want to study as suggested in the UK.", "I want to study as suggested in the UK", "UK"],
      ["I want to study as advised in the UK.", "I want to study as advised in the UK", "UK"],
      // more unlisted attribution / hedge words, 1 to 4 of them (the old gap's whole range)
      ["I want to study allegedly in the UK.", "I want to study allegedly in the UK", "UK"],
      ["I want to move per agent to Canada.", "I want to move per agent to Canada", "Canada"],
      ["I want to apply as recommended to Canada.", "I want to apply as recommended to Canada", "Canada"],
      ["I want to study as per consultant in the UK.", "I want to study as per consultant in the UK", "UK"],
      ["I want to study as my agent suggested in the UK.", "I want to study as my agent suggested in the UK", "UK"],
      ["I want to go as planned to the UK.", "I want to go as planned to the UK", "UK"],
      // Hinglish filler inside the English template (4 words: the old gap admitted it)
      ["I want to study agent ke hisaab se in the UK.", "I want to study agent ke hisaab se in the UK", "UK"],
      // a connector cannot carry a filler with it
      ["I want to study abroad as suggested in the UK.", "I want to study abroad as suggested in the UK", "UK"],
      ["I want to do my masters as advised in the UK.", "I want to do my masters as advised in the UK", "UK"],
      // a legitimate but unlisted subject also stays in review (fail-safe; widening is ISS-t-013r-rev-11's product call)
      ["I want to study data science in Germany.", "I want to study data science in Germany", "Germany"],
    ],
    "English",
  );
});

test("ISS-t-013r-rev-14 (T-030): an attributed filler in a Hinglish or Devanagari template clause never auto-verifies (reason: unrecognised-form ONLY)", () => {
  assertOnlyUnrecognisedForm(
    [
      ["Main agent ke suggestion par Canada jaana chahta hoon.", "Main agent ke suggestion par Canada jaana chahta hoon", "Canada"],
      ["Main as suggested UK jaana chahta hoon.", "Main as suggested UK jaana chahta hoon", "UK"],
      ["Mujhe consultant ki salah pe UK jaana hai.", "Mujhe consultant ki salah pe UK jaana hai", "UK"],
      ["Meri consultant wali choice Canada hai.", "Meri consultant wali choice Canada hai", "Canada"],
      ["मैं एजेंट की सलाह पर UK जाना चाहता हूँ।", "मैं एजेंट की सलाह पर UK जाना चाहता हूँ", "UK"],
      ["मुझे सलाहकार के कहने पर Canada जाना है।", "मुझे सलाहकार के कहने पर Canada जाना है", "Canada"],
      ["मेरी सलाहकार वाली पसंद UK है।", "मेरी सलाहकार वाली पसंद UK है", "UK"],
    ],
    "Hinglish/Devanagari",
  );
});

test("T-030: the closed connector set still auto-verifies (computer science / abroad / further / further studies / [my|a|an] <degree>)", () => {
  const cases: Array<[string, string, string]> = [
    ["I want to study computer science in Canada.", "I want to study computer science in Canada", "Canada"],
    ["I want to study abroad in Australia.", "I want to study abroad in Australia", "Australia"],
    ["I want to go abroad to Canada.", "I want to go abroad to Canada", "Canada"],
    ["I want to study further in Ireland.", "I want to study further in Ireland", "Ireland"],
    ["I want to pursue further studies in Germany.", "I want to pursue further studies in Germany", "Germany"],
    ["I want to pursue higher studies in Germany.", "I want to pursue higher studies in Germany", "Germany"],
    ["I want to do my masters in the UK.", "I want to do my masters in the UK", "UK"],
    ["I want to do my master's in the UK.", "I want to do my master's in the UK", "UK"],
    ["I want to do an MBA in Canada.", "I want to do an MBA in Canada", "Canada"],
    ["I want to do masters in Australia.", "I want to do masters in Australia", "Australia"],
    ["I am planning to study abroad in New Zealand for my masters.", "I am planning to study abroad in New Zealand for my masters", "New Zealand"],
  ];
  for (const [text, quote, value] of cases) {
    const fact = verifyOne(text, quote, value);
    assert.equal(fact?.needsReview, false, `connector should auto-verify: ${quote}`);
    assert.equal(fact?.reviewReasons, undefined, `no reasons on a verified fact: ${quote}`);
  }
});

test("T-030 no widening: the connector's whole (finite) language was already admitted by the old open gap (1-4 letter-only words), and every phrase of it verifies", () => {
  const sources = scribeNodes.AUTO_VERIFY_TEMPLATE_SOURCES;
  assert.ok(sources, "AUTO_VERIFY_TEMPLATE_SOURCES is exported");
  const { countryConnectorPhrases, degree, country } = sources;
  const inner = /^\(\?:(.*)\)$/u.exec(degree)?.[1];
  assert.ok(inner !== undefined && !/[()[\]\\?*+{}.]/u.test(inner), "DEGREE is one flat alternation of literal phrases");
  const degreeWords = inner.split("|");
  // Pin the template to exactly this language: the connector slot is these phrases or [my|a|an] + DEGREE, nothing else.
  assert.ok(
    country[0]!.source.includes(`(?: (?:${countryConnectorPhrases.join("|")}|(?:(?:my|a|an) )?${degree}))? (?:in|to) `),
    "COUNTRY_TEMPLATES[0]'s connector slot is exactly the enumerated closed set",
  );
  const language = [...countryConnectorPhrases, ...["", "my ", "a ", "an "].flatMap((det) => degreeWords.map((d) => `${det}${d}`))];
  const OLD_GAP = /^\p{L}+(?: \p{L}+){0,3}$/u; // what the old `(?: [\p{L}]+){0,4}?` admitted there
  for (const phrase of language) {
    assert.match(phrase, OLD_GAP, `"${phrase}" is 1-4 letter-only words, so the old gap admitted it too (no widening)`);
    const clause = `I want to study ${phrase} in Canada`;
    assert.deepEqual(
      assessFactForReview({ kind: "value", value: "Canada", key: "targetCountry" }, clause, [clause], { speaker: "student", originalText: clause }),
      { needsReview: false, reviewReasons: [] },
      clause,
    );
  }
  assert.ok(countryConnectorPhrases.length <= 8, "the connector set stays small");
});

test("T-030 audit: none of the 9 country + 34 number templates has an open wildcard or an unbounded repetition (the number value slot is pinned by exact equality); each declares its keys", () => {
  const sources = scribeNodes.AUTO_VERIFY_TEMPLATE_SOURCES;
  assert.ok(sources, "AUTO_VERIFY_TEMPLATE_SOURCES is exported");
  const { numberSlot } = sources;
  const country = sources.country.map((t) => t.source);
  const number = sources.number.map((t) => t.source);
  assert.equal(country.length, 9);
  assert.equal(number.length, 7 + 3 * 9, "7 budget templates + 9 score shapes x 3 exam families");
  assert.ok(
    Object.isFrozen(sources) && Object.isFrozen(sources.country) && Object.isFrozen(sources.number) &&
      [...sources.country, ...sources.number].every((t) => Object.isFrozen(t) && Object.isFrozen(t.keys)),
    "the template lists and their key sets cannot be widened at runtime",
  );
  // D-025: every template declares a non-empty key set; country templates declare exactly targetCountry.
  for (const t of sources.country) assert.deepEqual([...t.keys], ["targetCountry"]);
  const numberKeys = new Set(sources.number.flatMap((t) => [...t.keys]));
  assert.deepEqual([...numberKeys].sort(), ["budget_inr_per_year", "budget_inr_total", "class10_percentage", "class12_percentage", "ielts_overall"]);
  for (const t of sources.number) assert.equal(t.keys.length, 1, "each number template declares exactly one key");
  const OPEN: Array<[RegExp, string]> = [
    [/\\[pP]\{(?!Nd\})/u, "a Unicode property class other than \\p{Nd} (letters, marks ...)"],
    [/\\[wWsSdD]/u, "a \\w / \\s / \\S / \\d class"],
    [/\[\^/u, "a negated character class"],
    [/(?<!\\)\./u, "an unescaped '.'"],
    [/(?<!\\)[*+]/u, "an unbounded * or +"],
    [/\{\d+,\}/u, "an unbounded {n,}"],
  ];
  const all: Array<[string, string]> = [
    ...country.map((t, i): [string, string] => [`country[${i}]`, t]),
    ...number.map((t, i): [string, string] => [`number[${i}]`, t]),
  ];
  for (const [id, source] of all) {
    const withoutSlot = source.split(numberSlot).join("<N>");
    for (const [re, what] of OPEN) assert.doesNotMatch(withoutSlot, re, `${id} contains ${what}: ${source}`);
  }
  // The one unbounded run left is the number value slot: digits and [.,] only, never a letter, and
  // clauseMatchesTemplate requires its capture to equal String(value) exactly.
  assert.equal(numberSlot, "(?<n>\\p{Nd}+(?:[.,]\\p{Nd}+)*)");
  for (const t of number) assert.ok(t.includes(numberSlot), "every number template's value sits in the pinned slot");
  for (const t of country) assert.ok(!t.includes(numberSlot), "no country template has a number slot");
});

test("T-030 audit: the 'my <modifiers> choice is <country>' template takes at most two modifiers (was an unbounded run)", () => {
  assert.equal(verifyOne("My first preferred choice is the UK.", "My first preferred choice is the UK", "UK")?.needsReview, false);
  assert.equal(verifyOne("My top dream destination is Canada.", "My top dream destination is Canada", "Canada")?.needsReview, false);
  const three = verifyOne("My first top preferred choice is the UK.", "My first top preferred choice is the UK", "UK");
  assert.equal(three?.needsReview, true, "three modifiers is outside the bounded template");
  assert.deepEqual(reasonPrefixes(three), ["unrecognised-form"]);
});

const DATASET_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "qa", "evals", "scribe", "sessions.jsonl");
const ORIGINAL_TEMPLATE_POSITIVE_IDS = [
  "p01-template-en-study-in",
  "p02-template-en-id-like",
  "p03-template-en-first-choice",
  "p04-template-hinglish-chahti",
  "p05-template-hinglish-mujhe",
  "p06-template-devanagari-country",
  "p07-template-en-budget",
  "p08-template-en-scored",
  "p09-template-en-got-ielts",
  "p10-template-hinglish-budget",
  "p11-template-hinglish-score",
  "p12-template-devanagari-budget",
];

interface GoldRow {
  id: string;
  input: { turns: ScribeTurn[] };
  goldFacts: Array<{ key: string; value: unknown; turnId: string; quote: string }>;
}

test("T-030: the 12 original template-positive eval rows (p01..p12) still auto-verify, verbatim and case-drifted", () => {
  const rows = readFileSync(DATASET_PATH, "utf-8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as GoldRow);
  const positives = ORIGINAL_TEMPLATE_POSITIVE_IDS.map((id) => rows.find((r) => r.id === id));
  assert.equal(positives.filter((r) => r !== undefined).length, 12, "all 12 original template-positive rows are present");
  for (const row of positives) {
    const turns = turnsById(...row!.input.turns);
    for (const gf of row!.goldFacts) {
      for (const quote of [gf.quote, gf.quote.toUpperCase()]) {
        const raw = candidate({ key: gf.key, value: gf.value, source: { type: "transcript", quote, turnId: gf.turnId } });
        const result = verifyCandidateFact(raw, turns, SESSION_ENDED);
        assert.ok("fact" in result, `${row!.id}: kept`);
        if ("fact" in result) assert.equal(result.fact.needsReview, false, `${row!.id}: must still auto-verify (${quote})`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// T-030 (D-025): key binding narrows the score surface. A score clause must name an exam family whose
// key it declares; a board with no class, an exam with no family, or a unit that does not fit the key is
// kept for review (unrecognised-form). These verified under any key before T-030.
// ---------------------------------------------------------------------------

test("T-030 (D-025): a score whose exam names no family, or whose unit does not fit the key, needs review (reason: unrecognised-form ONLY)", () => {
  const cases: Array<[string, number, string]> = [
    ["My score was 92 in boards", 92, "class12_percentage"], // which board? class 10 or 12 is not said
    ["Mere boards mein 92 percent aaye", 92, "class12_percentage"],
    ["I got 110 in TOEFL", 110, "toefl_total"],
    ["I scored 42 in the exam", 42, "class12_percentage"],
    ["I scored 450 marks in my class 12 boards", 450, "class12_percentage"], // marks are not a percentage
    ["My score is 92", 92, "class12_percentage"], // no exam named at all
  ];
  for (const [quote, value, key] of cases) {
    const fact = verifyOne(`${quote}.`, quote, value, key);
    assert.equal(fact?.needsReview, true, `must not auto-verify: ${quote}`);
    assert.deepEqual(reasonPrefixes(fact), ["unrecognised-form"], quote);
  }
  // the same statements with the class named (and its key) still verify
  assert.equal(verifyOne("My score was 92 in class 12 boards.", "My score was 92 in class 12 boards", 92, "class12_percentage")?.needsReview, false);
  assert.equal(verifyOne("Mere class 12 boards mein 92 percent aaye.", "Mere class 12 boards mein 92 percent aaye", 92, "class12_percentage")?.needsReview, false);
});

test("T-030 (D-025): the key is bound to the clause: a budget's period and a score's exam pick the one key that verifies", () => {
  const cases: Array<[string, number, string, boolean]> = [
    ["My budget is 1500000", 1500000, "budget_inr_per_year", false],
    ["My budget is 1500000", 1500000, "budget_inr_total", true],
    ["My budget is 2500000 per year", 2500000, "budget_inr_per_year", false],
    ["My budget is 2500000 per year", 2500000, "budget_inr_total", true],
    ["My total budget is 4000000", 4000000, "budget_inr_total", false],
    ["My total budget is 4000000", 4000000, "budget_inr_per_year", true],
    ["My budget is 4000000 in total", 4000000, "budget_inr_total", false],
    ["My total budget is 4000000 per year", 4000000, "budget_inr_total", true], // mixed period: neither template
    ["My total budget is 4000000 per year", 4000000, "budget_inr_per_year", true],
    ["I got 7.5 in IELTS", 7.5, "ielts_overall", false],
    ["I got 7.5 in IELTS", 7.5, "class12_percentage", true],
    ["I scored 92 in my class 12 boards", 92, "class12_percentage", false],
    ["I scored 92 in my class 12 boards", 92, "class10_percentage", true],
    ["I scored 88 in my class 10 boards", 88, "class10_percentage", false],
  ];
  for (const [quote, value, key, review] of cases) {
    const fact = verifyOne(`${quote}.`, quote, value, key);
    assert.equal(fact?.needsReview, review, `${quote} -> ${key}`);
  }
});
