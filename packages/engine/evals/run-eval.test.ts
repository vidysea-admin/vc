/** T-009: the eval:scribe CLI's argument parsing — in particular, that it refuses --provider=gemini
 *  (contract B13: the live run is a later, human-gated unit) rather than silently ignoring it. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "./run-eval.js";

test("defaults to the perfect provider with no args", () => {
  const { mode } = parseArgs([]);
  assert.equal(mode, "perfect");
});

test("accepts each scripted provider mode", () => {
  for (const mode of ["perfect", "fabricator", "case-drift", "lazy"] as const) {
    assert.equal(parseArgs([`--provider=${mode}`]).mode, mode);
  }
});

test("refuses --provider=gemini with a message naming the gate (B13), never runs it silently", () => {
  assert.throws(() => parseArgs(["--provider=gemini"]), /human-gated|real-transcripts-gemini|GEMINI_API_KEY/);
});

test("refuses an unknown provider name", () => {
  assert.throws(() => parseArgs(["--provider=nonsense"]), /must be one of/);
});

test("accepts a --dataset override", () => {
  const { dataset } = parseArgs(["--dataset=/tmp/custom.jsonl"]);
  assert.equal(dataset, "/tmp/custom.jsonl");
});
