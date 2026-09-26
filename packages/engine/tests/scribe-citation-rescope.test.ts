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
  const turns = turnsById(turn({ turnId: "t3", text: "We can manage around 20000 rupees a year." }));
  const raw = candidate({ key: "budget_inr_per_year", value: 20000, source: { type: "transcript", quote: "around 20000 rupees a year", turnId: "t3" } });
  const result = verifyCandidateFact(raw, turns, SESSION_ENDED);
  assert.ok("fact" in result);
  if ("fact" in result) {
    assert.equal(result.fact.needsReview, false);
    assert.equal(result.fact.reviewReasons, undefined);
  }
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
  const turns = turnsById(turn({ turnId: "t1", text: "I want to move to the USA for my masters." }));
  const raw = candidate({ key: "targetCountry", value: "USA", source: { type: "transcript", quote: "move to the USA for my masters", turnId: "t1" } });
  const result = verifyCandidateFact(raw, turns, SESSION_ENDED);
  assert.ok("fact" in result);
  if ("fact" in result) assert.equal(result.fact.needsReview, false);
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
  const verified = assessFactForReview({ kind: "value", value: 42 }, "we discussed all 42 of them");
  assert.deepEqual(verified, { needsReview: false, reviewReasons: [] });

  const reasoning = assessFactForReview({ kind: "reasoning", value: "Canada" }, "because Canada has good universities");
  assert.equal(reasoning.needsReview, true);
});
