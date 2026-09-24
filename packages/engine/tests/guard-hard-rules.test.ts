import { test } from "node:test";
import assert from "node:assert/strict";
import { applyHardRules } from "../src/guards/hard-rules.js";
import type { HardRuleInput } from "../src/guards/hard-rules.js";

function card(overrides: Partial<HardRuleInput> = {}): HardRuleInput {
  return {
    type: "evidence",
    prompt: "80% of 2024 grads found jobs within 6 months (source: careers office report).",
    sources: [{ type: "kb", id: "univ-123", quote: "80% placement" }],
    ...overrides,
  } as HardRuleInput;
}

test("a clean, cited, non-script card is kept", () => {
  const result = applyHardRules([card()]);
  assert.equal(result.kept.length, 1);
  assert.equal(result.dropped.length, 0);
});

test("a script-like card is dropped with a B1 reason", () => {
  const result = applyHardRules([card({ prompt: "Tell the student LSE is the best option." })]);
  assert.equal(result.kept.length, 0);
  assert.equal(result.dropped.length, 1);
  assert.match(result.dropped[0].reason, /script/i);
});

test("an uncited card is dropped with a B2 reason", () => {
  const result = applyHardRules([card({ sources: [] })]);
  assert.equal(result.kept.length, 0);
  assert.equal(result.dropped.length, 1);
  assert.match(result.dropped[0].reason, /source/i);
});

test("only the first 3 clean cards are kept — the rest are dropped for the cap", () => {
  const cards = [1, 2, 3, 4, 5].map((n) => card({ prompt: `${n === 1 ? "Compare" : "Evidence:"} option ${n} vs option ${n + 1}.` }));
  const result = applyHardRules(cards);
  assert.equal(result.kept.length, 3);
  assert.equal(result.dropped.length, 2);
  for (const d of result.dropped) {
    assert.match(d.reason, /at most 3 cards/);
  }
});

test("a script-like card among the first 3 slots does not consume a cap slot", () => {
  const cards = [
    card({ prompt: "Tell the student to pick option A." }), // dropped for B1, not the cap
    card({ prompt: "Compare option A and option B on tuition." }),
    card({ prompt: "Compare option C and option D on tuition." }),
    card({ prompt: "Compare option E and option F on tuition." }),
    card({ prompt: "Compare option G and option H on tuition." }),
  ];
  const result = applyHardRules(cards);
  assert.equal(result.kept.length, 3);
  assert.equal(result.dropped.length, 2);
  assert.match(result.dropped[0].reason, /script/i);
  assert.match(result.dropped[1].reason, /at most 3 cards/);
});
