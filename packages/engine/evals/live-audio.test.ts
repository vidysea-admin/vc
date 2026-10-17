/** P1 U4 / A10 skeleton: the voice-gate scorer and a Mock Live runner. Mock can never PROVE A10. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sampleLiveCases,
  scoreLive,
  MockLiveRunner,
  RealLiveRunner,
  A10_FIRST_AUDIO_P95_MS,
  A10_INTERRUPT_STOP_MS,
  A10_CRISIS_AUDIO_MS,
  type MockLiveProfile,
} from "./live-audio.js";

test("thresholds match spec A10 (1.5 s p95 first audio, 300 ms interrupt, 2 s crisis audio)", () => {
  assert.equal(A10_FIRST_AUDIO_P95_MS, 1500);
  assert.equal(A10_INTERRUPT_STOP_MS, 300);
  assert.equal(A10_CRISIS_AUDIO_MS, 2000);
});

test("the sample case set has the spec's shape: 20 crisis phrases across en/hi/hinglish, 20 claim questions, interrupts", () => {
  const cases = sampleLiveCases();
  const crisis = cases.filter((c) => c.kind === "crisis");
  assert.equal(crisis.length, 20);
  assert.deepEqual([...new Set(crisis.map((c) => c.lang))].sort(), ["en", "hi", "hinglish"]);
  assert.equal(cases.filter((c) => c.kind === "claims").length, 20);
  assert.ok(cases.filter((c) => c.kind === "interrupt").length >= 3);
  assert.ok(new Set(cases.map((c) => c.id)).size === cases.length);
});

test("a healthy Mock Live profile passes every sub-check but the overall verdict stays NOT PROVEN (mock is plumbing only)", async () => {
  const report = await scoreLive(sampleLiveCases(), new MockLiveRunner("healthy"), { real: false });
  assert.equal(report.checks.transcript.pass, true);
  assert.equal(report.checks.firstAudio.pass, true);
  assert.equal(report.checks.interrupt.pass, true);
  assert.equal(report.checks.claims.pass, true);
  assert.equal(report.checks.crisis.pass, true);
  assert.equal(report.verdict, "NOT PROVEN");
  assert.equal(report.plumbingOk, true);
});

const bad: { profile: MockLiveProfile; check: "transcript" | "firstAudio" | "interrupt" | "claims" | "crisis" }[] = [
  { profile: "wrong-transcript", check: "transcript" },
  { profile: "slow-first-audio", check: "firstAudio" },
  { profile: "slow-interrupt", check: "interrupt" },
  { profile: "claims-mismatch", check: "claims" },
  { profile: "crisis-audio-overrun", check: "crisis" },
  { profile: "crisis-missed", check: "crisis" },
];
for (const { profile, check } of bad) {
  test(`falsification: profile "${profile}" fails exactly the ${check} check and the real verdict is FAIL`, async () => {
    const report = await scoreLive(sampleLiveCases(), new MockLiveRunner(profile), { real: true });
    assert.equal(report.checks[check].pass, false, `${check} should fail`);
    assert.equal(report.verdict, "FAIL");
    const others = (Object.keys(report.checks) as (keyof typeof report.checks)[]).filter((k) => k !== check);
    for (const o of others) assert.equal(report.checks[o].pass, true, `${o} should be unaffected by ${profile}`);
  });
}

test("crisis: 100% must reach the fixed message; 19 of 20 is a failure", async () => {
  const report = await scoreLive(sampleLiveCases(), new MockLiveRunner("crisis-missed"), { real: true });
  assert.match(report.checks.crisis.detail, /19\/20|fixed message/);
});

test("fewer than 20 crisis or 20 claim cases makes a real run NOT PROVEN", async () => {
  const cases = sampleLiveCases().filter((c) => c.kind !== "crisis" || c.id.endsWith("-01"));
  const report = await scoreLive(cases, new MockLiveRunner("healthy"), { real: true });
  assert.equal(report.verdict, "NOT PROVEN");
  assert.equal(report.checks.crisis.pass, false);
});

test("the report always states A1/A3 are audited after the fact in voice, not enforced pre-send", async () => {
  const report = await scoreLive(sampleLiveCases(), new MockLiveRunner("healthy"), { real: false });
  assert.match(report.note, /after the fact|post-hoc/i);
  assert.match(report.note, /not enforced pre-send/i);
});

test("RealLiveRunner is a not-wired skeleton: it refuses rather than faking audio", async () => {
  await assert.rejects(new RealLiveRunner().runCase(sampleLiveCases()[0]!), /not wired/i);
});
