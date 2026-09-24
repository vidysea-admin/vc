import { test } from "node:test";
import assert from "node:assert/strict";
import { isScriptLike } from "../src/guards.js";

test("a genuine question is not script-like", () => {
  assert.equal(isScriptLike("Have you considered a smaller campus for a closer mentor ratio?"), false);
});

test("a comparison-marker prompt is not script-like", () => {
  assert.equal(isScriptLike("Compare University A and University B on total cost."), false);
  assert.equal(isScriptLike("vs the public option, this private college costs 3x more."), false);
  assert.equal(isScriptLike("Evidence: 80% of 2024 grads found jobs within 6 months."), false);
});

test("a recital cue is flagged as script-like even when phrased as a question", () => {
  assert.equal(isScriptLike("Tell the student this university is the best fit?"), true);
});

test("recital cues 'Say:' and 'You should tell' are flagged", () => {
  assert.equal(isScriptLike("Say: this is your best option."), true);
  assert.equal(isScriptLike("You should tell them to apply to this course now."), true);
});

test("a plain statement with no question mark or comparison marker is script-like", () => {
  assert.equal(isScriptLike("This university is a great fit for you."), true);
});
