import { test } from "node:test";
import assert from "node:assert/strict";
import { CardSchema } from "../src/schemas.js";

function validCard() {
  return {
    id: "card-1",
    type: "widen" as const,
    prompt: "Have you thought about universities outside the top 10 rankings?",
    sources: [{ type: "kb", id: "univ-123", quote: "ranked #45, strong placement record" }],
    confidence: 0.7,
  };
}

test("a well-formed card parses", () => {
  assert.doesNotThrow(() => CardSchema.parse(validCard()));
});

test("B2: a card with empty sources is rejected", () => {
  const bad = { ...validCard(), sources: [] };
  assert.throws(() => CardSchema.parse(bad));
});

test("B1: a card whose prompt is a script (recital) is rejected", () => {
  const bad = { ...validCard(), prompt: "Tell the student to apply to this university." };
  assert.throws(() => CardSchema.parse(bad));
});

// ISS-011: every card needs a stable, non-empty id.
test("ISS-011: a card with no id is rejected", () => {
  const { id, ...withoutId } = validCard();
  assert.throws(() => CardSchema.parse(withoutId));
});

test("ISS-011: a card with an empty id is rejected", () => {
  const bad = { ...validCard(), id: "" };
  assert.throws(() => CardSchema.parse(bad));
});

// ISS-008: isScriptLike is now type-aware via the Card schema's refine(),
// which passes `type`. These are the reviewer's three exact strings.
test("ISS-008: an evidence card citing a ranking is NOT script-like", () => {
  const card = {
    ...validCard(),
    type: "evidence" as const,
    prompt: "According to the 2024 QS ranking, University A ranks 15 spots higher than University B.",
  };
  assert.doesNotThrow(() => CardSchema.parse(card));
});

test("ISS-008: a challenge card about a budget gap is NOT script-like", () => {
  const card = {
    ...validCard(),
    type: "challenge" as const,
    prompt: "Your budget of $20k does not cover tuition plus living costs at University A, which run $35k a year.",
  };
  assert.doesNotThrow(() => CardSchema.parse(card));
});

test("ISS-008: a definitive assertion closed with a tag question IS script-like, for any type", () => {
  const prompt = "This university is definitely your best option, right?";
  for (const type of ["widen", "challenge", "clarify", "compare", "evidence"] as const) {
    const bad = { ...validCard(), type, prompt };
    assert.throws(() => CardSchema.parse(bad), `expected type=${type} to be rejected`);
  }
});

// widen/clarify cards must be genuine questions (contract B1 + ISS-008 rule b).
test("ISS-008: a widen card that is a statement (no '?') is rejected", () => {
  const bad = { ...validCard(), type: "widen" as const, prompt: "Consider universities outside the top 10." };
  assert.throws(() => CardSchema.parse(bad));
});

test("ISS-008: a clarify card that is a statement (no '?') is rejected", () => {
  const bad = {
    ...validCard(),
    type: "clarify" as const,
    prompt: "You have not said which budget range you are considering.",
  };
  assert.throws(() => CardSchema.parse(bad));
});

// compare/challenge/evidence cards may be statements — B2's sources
// requirement carries the "cited, not invented" guarantee.
test("ISS-008: a compare card that is a statement (no '?') parses", () => {
  const ok = {
    ...validCard(),
    type: "compare" as const,
    prompt: "University A costs $20k a year; University B costs $28k a year for the same program.",
  };
  assert.doesNotThrow(() => CardSchema.parse(ok));
});
