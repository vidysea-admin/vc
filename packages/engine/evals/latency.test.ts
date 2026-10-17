/** P1 U4 / A8 harness: latency percentile maths and the A8 bar (p95 first token <= 3 s, full <= 10 s). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { percentile, summarizeLatency, evaluateA8, measureOnce, A8_FIRST_TOKEN_P95_MS, A8_FULL_P95_MS } from "./latency.js";

test("percentile uses nearest-rank and rejects empty input / bad p", () => {
  const xs = Array.from({ length: 20 }, (_, i) => i + 1); // 1..20
  assert.equal(percentile(xs, 50), 10);
  assert.equal(percentile(xs, 95), 19);
  assert.equal(percentile(xs, 100), 20);
  assert.equal(percentile([5], 95), 5);
  assert.equal(percentile([3, 1, 2], 100), 3, "does not require pre-sorted input");
  assert.throws(() => percentile([], 95), /empty/);
  assert.throws(() => percentile([1], 0), RangeError);
  assert.throws(() => percentile([1], 101), RangeError);
});

test("A8 bar constants are 3000 ms first token and 10000 ms full (ASSUMPTION in spec)", () => {
  assert.equal(A8_FIRST_TOKEN_P95_MS, 3000);
  assert.equal(A8_FULL_P95_MS, 10_000);
});

test("evaluateA8 PASS only when BOTH p95s are within bar; boundary is inclusive", () => {
  const ok = Array.from({ length: 20 }, () => ({ firstTokenMs: 3000, fullMs: 10_000 }));
  assert.equal(evaluateA8(summarizeLatency(ok), { real: true }).verdict, "PASS");
  const slowFirst = Array.from({ length: 20 }, () => ({ firstTokenMs: 3001, fullMs: 100 }));
  assert.equal(evaluateA8(summarizeLatency(slowFirst), { real: true }).verdict, "FAIL");
  const slowFull = Array.from({ length: 20 }, () => ({ firstTokenMs: 100, fullMs: 10_001 }));
  const r = evaluateA8(summarizeLatency(slowFull), { real: true });
  assert.equal(r.verdict, "FAIL");
  assert.match(r.reasons.join(" "), /full/);
});

test("a mock run can never PROVE A8: plumbing verdict is NOT PROVEN even when fast", () => {
  const fast = Array.from({ length: 20 }, () => ({ firstTokenMs: 1, fullMs: 2 }));
  assert.equal(evaluateA8(summarizeLatency(fast), { real: false }).verdict, "NOT PROVEN");
});

test("too few samples (< 20) is NOT PROVEN for a real run", () => {
  const few = Array.from({ length: 5 }, () => ({ firstTokenMs: 1, fullMs: 2 }));
  assert.equal(evaluateA8(summarizeLatency(few), { real: true }).verdict, "NOT PROVEN");
});

test("a single outlier above p95 does not fail a 20-sample run, but two do (p95 is nearest-rank)", () => {
  const base = Array.from({ length: 20 }, () => ({ firstTokenMs: 100, fullMs: 200 }));
  base[0] = { firstTokenMs: 9000, fullMs: 200 };
  assert.equal(evaluateA8(summarizeLatency(base), { real: true }).verdict, "PASS");
  base[1] = { firstTokenMs: 9000, fullMs: 200 };
  assert.equal(evaluateA8(summarizeLatency(base), { real: true }).verdict, "FAIL");
});

test("measureOnce times first token and full answer from an injected clock", async () => {
  let t = 1000;
  const clock = () => t;
  const sample = await measureOnce(async (hooks) => {
    t += 120;
    hooks.firstToken();
    t += 800;
  }, clock);
  assert.deepEqual(sample, { firstTokenMs: 120, fullMs: 920 });
});

test("measureOnce rejects a run that never emits a first token (a silent answer is not a latency sample)", async () => {
  await assert.rejects(measureOnce(async () => {}, () => 0), /first token/);
});
