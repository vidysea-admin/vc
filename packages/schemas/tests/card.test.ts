import { test } from "node:test";
import assert from "node:assert/strict";
import { CardSchema } from "../src/schemas.js";

function validCard() {
  return {
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
