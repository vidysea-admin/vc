/** T-009: unit tests for the scorer's independent citation classifier (citation.ts), separate from
 *  (and never delegating to) the engine's own verifyCandidateFact guard — see citation.ts's docstring
 *  for why the two must stay independent. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyCitation, collapseWhitespace, stripPunctuation } from "./citation.js";

const turnsById = new Map([
  ["t1", { turnId: "t1", text: "We can manage around 20 lakh rupees a year.", translatedText: "We can manage around 20 lakh rupees a year." }],
]);

test("classifyCitation: an exact substring is verbatim", () => {
  const v = classifyCitation({ key: "budget", source: { quote: "around 20 lakh rupees a year", turnId: "t1" } }, turnsById);
  assert.equal(v.class, "verbatim");
});

test("classifyCitation: a whitespace-only difference still counts as verbatim (collapseWhitespace)", () => {
  const v = classifyCitation({ key: "budget", source: { quote: "around  20   lakh rupees a year", turnId: "t1" } }, turnsById);
  assert.equal(v.class, "verbatim");
});

test("classifyCitation: a case-only difference is case-mismatch, not fabricated", () => {
  const v = classifyCitation({ key: "budget", source: { quote: "AROUND 20 LAKH RUPEES A YEAR", turnId: "t1" } }, turnsById);
  assert.equal(v.class, "case-mismatch");
});

test("classifyCitation: a trailing punctuation-only difference is punctuation-mismatch", () => {
  const v = classifyCitation({ key: "budget", source: { quote: "We can manage around 20 lakh rupees a year!", turnId: "t1" } }, turnsById);
  assert.equal(v.class, "punctuation-mismatch");
});

test("classifyCitation: both case AND punctuation drift is case-and-punctuation-mismatch", () => {
  const v = classifyCitation({ key: "budget", source: { quote: "WE CAN MANAGE AROUND 20 LAKH RUPEES A YEAR!", turnId: "t1" } }, turnsById);
  assert.equal(v.class, "case-and-punctuation-mismatch");
});

test("classifyCitation: a genuine paraphrase is fabricated", () => {
  const v = classifyCitation({ key: "budget", source: { quote: "roughly 20 lakh a year or so", turnId: "t1" } }, turnsById);
  assert.equal(v.class, "fabricated");
});

test("classifyCitation: a missing source or quote is malformed, not fabricated", () => {
  assert.equal(classifyCitation({ key: "budget" }, turnsById).class, "malformed");
  assert.equal(classifyCitation({ key: "budget", source: {} }, turnsById).class, "malformed");
  assert.equal(classifyCitation({ key: "budget", source: { quote: "x", turnId: "unknown-turn" } }, turnsById).class, "malformed");
});

test("collapseWhitespace / stripPunctuation are simple, predictable normalisations", () => {
  assert.equal(collapseWhitespace("  a   b\n c "), "a b c");
  assert.equal(stripPunctuation("Hello, world!"), "Hello world");
});
