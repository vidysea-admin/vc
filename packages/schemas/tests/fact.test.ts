import { test } from "node:test";
import assert from "node:assert/strict";
import { FactSchema } from "../src/schemas.js";

function validFact() {
  return {
    key: "targetCountry",
    value: "Canada",
    source: { type: "transcript" as const, id: "turn-42", quote: "I want to study in Canada", turnId: "42" },
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
