import { test } from "node:test";
import assert from "node:assert/strict";
import { noScriptGuard } from "../src/guards/no-script.js";

test("a genuine widen question passes", () => {
  const result = noScriptGuard({
    type: "widen",
    prompt: "Have you considered a smaller campus for a closer mentor ratio?",
  });
  assert.equal(result.ok, true);
});

test("a cited evidence statement passes (no '?' fallback needed for statement types)", () => {
  const result = noScriptGuard({
    type: "evidence",
    prompt: "80% of 2024 grads found jobs within 6 months (source: careers office report).",
  });
  assert.equal(result.ok, true);
});

test("a recital cue fails with a reason", () => {
  const result = noScriptGuard({
    type: "evidence",
    prompt: "Tell the student University A is better.",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.reason && result.reason.length > 0);
  }
});

test("a widen card that is a bare statement fails", () => {
  const result = noScriptGuard({
    type: "widen",
    prompt: "Consider universities outside the top 10.",
  });
  assert.equal(result.ok, false);
});
