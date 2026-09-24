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
