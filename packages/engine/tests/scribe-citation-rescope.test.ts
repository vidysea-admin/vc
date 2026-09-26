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
import { verifyCandidateFact, assessFactForReview } from "../src/scribe/nodes.js";
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
  const verified = assessFactForReview({ kind: "value", value: 42 }, "I scored 42 in the exam");
  assert.deepEqual(verified, { needsReview: false, reviewReasons: [] });
  const credits = assessFactForReview({ kind: "value", value: 42 }, "I have finished 42 credits so far");
  assert.equal(credits.needsReview, true);
  assert.ok(credits.reviewReasons.some((r) => r.startsWith("unrecognised-form:")));
  assert.equal(assessFactForReview({ kind: "value", value: 42 }, "we discussed all 42 of them").needsReview, true);

  const reasoning = assessFactForReview({ kind: "reasoning", value: "Canada" }, "because Canada has good universities");
  assert.equal(reasoning.needsReview, true);
});

// ---------------------------------------------------------------------------
// Fix cycle 1 (ISS-t-013r-c0-1, -c0-2, -rev-2): the fail-safe auto-verify rule. Auto-verify only when
// the quote is first-person AND the turn has no negation/contrast, no third-party marker and (numbers)
// no unit multiplier or currency. Every other case is KEPT with a named reviewReason, never dropped.
// ---------------------------------------------------------------------------

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
    ["My score was 92 in boards.", "My score was 92 in boards", 92],
    ["I got 7.5 in IELTS.", "I got 7.5 in IELTS", 7.5],
  ];
  for (const [text, quote, value] of cases) {
    const fact = verifyOne(text, quote, value, typeof value === "number" ? "score" : "targetCountry");
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
    const fact = verifyOne(text, quote, value, "budget");
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
    const fact = verifyOne(`${quote}.`, quote, value, "score");
    assert.equal(fact?.needsReview, true, `${value} must not auto-verify from "${quote}"`);
  }
});

test("fail-safe: every flagged fact is KEPT with its value and citation intact, all failing conditions named (D-020: nothing is dropped)", () => {
  const fact = verifyOne("Meri behen UK nahi, Canada gayi, uska budget 20 lakh tha.", "uska budget 20 lakh tha", 20, "budget");
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
    ["Mere boards mein 92 percent aaye.", "Mere boards mein 92 percent aaye", 92],
    ["मेरा बजट 1500000 है।", "मेरा बजट 1500000 है", 1500000],
    ["मैंने IELTS में 7.5 स्कोर किया।", "मैंने IELTS में 7.5 स्कोर किया", 7.5],
  ];
  for (const [text, quote, value] of cases) {
    const fact = verifyIn(text, quote, value, typeof value === "number" ? "score" : "targetCountry");
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
    const fact = verifyIn(text, quote, value, typeof value === "number" ? "score" : "targetCountry");
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
    const fact = verifyIn(text, quote, value, "score");
    assert.equal(fact?.needsReview, true, `${value} must not auto-verify from "${quote}"`);
    assert.ok(reasonsStartWith(fact?.reviewReasons, "unrecognised-form:"), `named reason: ${quote}`);
  }
});
