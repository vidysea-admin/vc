import { test } from "node:test";
import assert from "node:assert/strict";
import { FactSchema } from "../src/schemas.js";

function validFact() {
  return {
    key: "targetCountry",
    value: "Canada",
    source: { type: "transcript" as const, quote: "I want to study in Canada", turnId: "42" },
    confidence: 0.8,
    validFrom: "2026-09-25T00:00:00.000Z",
    purposeTags: ["counselling"],
    sensitivity: "low" as const,
  };
}

test("a well-formed fact parses", () => {
  assert.doesNotThrow(() => FactSchema.parse(validFact()));
});

test("B4: a fact with empty purposeTags is rejected", () => {
  const bad = { ...validFact(), purposeTags: [] };
  assert.throws(() => FactSchema.parse(bad));
});

test("B2: a fact with no source is rejected", () => {
  const { source, ...withoutSource } = validFact();
  assert.throws(() => FactSchema.parse(withoutSource));
});

// ISS-010: validFrom/validTo must be ISO-8601 datetime strings, not just any
// non-empty string.
test("ISS-010: a fact with validFrom: 'banana' is rejected", () => {
  const bad = { ...validFact(), validFrom: "banana" };
  assert.throws(() => FactSchema.parse(bad));
});

test("ISS-010: a fact with a non-datetime validTo is rejected", () => {
  const bad = { ...validFact(), validTo: "banana" };
  assert.throws(() => FactSchema.parse(bad));
});

test("ISS-010: a fact with a valid ISO datetime validTo parses", () => {
  const ok = { ...validFact(), validTo: "2026-12-31T00:00:00.000Z" };
  assert.doesNotThrow(() => FactSchema.parse(ok));
});

// ---------------------------------------------------------------------------
// T-013 (D-020, citation-guarantee-scope): kind/explains/citationMatch/needsReview/reviewReasons.
// All additive and optional — a legacy fact object with none of them still parses unchanged.
// ---------------------------------------------------------------------------

test("T-013: a fact with none of the new fields still parses, and `kind` reads as undefined (never silently defaulted)", () => {
  const parsed = FactSchema.parse(validFact());
  assert.equal(parsed.kind, undefined, "kind is optional, NOT .default() — see schemas.ts comment (avoids breaking every pre-T-013 Fact literal)");
  assert.equal(parsed.citationMatch, undefined);
  assert.equal(parsed.needsReview, undefined);
  assert.equal(parsed.reviewReasons, undefined);
});

test("T-013: a fact carrying citationMatch/needsReview/reviewReasons parses", () => {
  const fact = { ...validFact(), citationMatch: "normalised" as const, needsReview: true, reviewReasons: ["not on the auto-verify surface"] };
  const parsed = FactSchema.parse(fact);
  assert.equal(parsed.citationMatch, "normalised");
  assert.equal(parsed.needsReview, true);
  assert.deepEqual(parsed.reviewReasons, ["not on the auto-verify surface"]);
});

test("T-013: citationMatch only accepts 'verbatim' | 'normalised'", () => {
  const bad = { ...validFact(), citationMatch: "fuzzy" };
  assert.throws(() => FactSchema.parse(bad));
});

test("T-013: reviewReasons rejects an empty-string reason (an empty reason explains nothing)", () => {
  const bad = { ...validFact(), reviewReasons: [""] };
  assert.throws(() => FactSchema.parse(bad));
});

test("T-013: a `reasoning` fact with `explains` parses", () => {
  const fact = { ...validFact(), kind: "reasoning" as const, explains: "targetCountry", needsReview: true };
  const parsed = FactSchema.parse(fact);
  assert.equal(parsed.kind, "reasoning");
  assert.equal(parsed.explains, "targetCountry");
});

test("T-013: kind only accepts 'value' | 'reasoning'", () => {
  const bad = { ...validFact(), kind: "guess" };
  assert.throws(() => FactSchema.parse(bad));
});
