/**
 * P1 alerts (D-108 item 7, "go now"): two go-live engineering alerts on the EXISTING T-021 mechanism (a structured, text-free console.error line
 * plus a Langfuse-visible error span; no new transport).
 *   A1  the authenticated chat safety screen is down  -> alert_safety_screen_outage, at most once per 5 minutes per process
 *   A2  the text chain's monthly cap                   -> alert_chain_cap_80pct once, alert_chain_cap_exhausted once, each per UTC month per process
 * Fake providers, fake clocks, invented students (B8/B13).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MockProvider, type EngineeringAlert } from "@vc/providers";
import { STUDENT_CRISIS_MESSAGE } from "@vc/engine";
import { ChainBudgetExhaustedError, createChainSpendGuard } from "../src/index.js";
import { generateKeyPairSync } from "node:crypto";
import { createFakeMongoClient } from "@vc/db/testing";
import { startApi } from "../src/index.js";
import { createJwtVerifier, jwtConfigFromEnv } from "../src/auth.js";
import { GERMANY_QUESTION, SKILLS_DIR, SPEAKERS, adult, call, chatWorld, cleanupGates, gatesFixture, kbAnswerProvider, newThread, recordingKb, studentToken, studentVerifier, threadsPath, turnsPath } from "./chat-fixtures.js";

const MIN = 60_000;
const SCREEN_DOWN = () => ({ safetyScreen: { provider: new MockProvider({ responses: {} }) } }); // no canned response: the screen throws

type World = ReturnType<typeof chatWorld>;
async function ask(w: World, token: string, threadId: string, id: string) {
  const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: GERMANY_QUESTION, clientTurnId: id } });
  assert.equal(res.status, 200);
  return res;
}

// -- A1 ------------------------------------------------------------------------

test("A1: when the authenticated safety screen is down, the student still gets the fixed crisis message AND an engineering alert fires with no student text", async () => {
  const alerts: EngineeringAlert[] = [];
  const w = chatWorld({ deps: { graph: SCREEN_DOWN(), alert: (a) => alerts.push(a) } });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const res = await ask(w, token, threadId, "a1-1");
    assert.equal(res.json.message, STUDENT_CRISIS_MESSAGE, "fail closed is unchanged");
    assert.deepEqual(alerts.map((a) => a.event), ["alert_safety_screen_outage"]);
    assert.ok(!JSON.stringify(alerts).includes("Germany"), "text-free");
    assert.ok(w.logs.some((l) => (l as { event: string; write?: string }).event === "chat_write_failed" && (l as { write?: string }).write === "safety_screen"), "the existing log line is kept");
  } finally {
    w.cleanup();
  }
});

test("A1: an outage lasting many turns is one alert per 5 minutes per process, not one per turn; the next window alerts again", async () => {
  const alerts: EngineeringAlert[] = [];
  const w = chatWorld({ deps: { graph: SCREEN_DOWN(), alert: (a) => alerts.push(a) } });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    for (let i = 0; i < 4; i++) {
      await ask(w, token, threadId, `a1r-${i}`);
      w.clock.ms += 30_000; // 2 minutes over four turns
    }
    assert.equal(alerts.length, 1, "four failing turns inside 5 minutes -> one alert");
    w.clock.ms += 5 * MIN - 4 * 30_000 - 1; // 1 ms short of 5 minutes since the first alert
    await ask(w, token, threadId, "a1r-edge");
    assert.equal(alerts.length, 1, "still inside the window at 4:59.999");
    w.clock.ms += 1; // exactly 5 minutes
    await ask(w, token, threadId, "a1r-next");
    assert.equal(alerts.length, 2, "a new window alerts again");
    assert.ok(alerts.every((a) => a.event === "alert_safety_screen_outage"));
  } finally {
    w.cleanup();
  }
});

test("A1: a healthy screen (and a turn with no screen at all) raises no alert", async () => {
  const alerts: EngineeringAlert[] = [];
  const ok = new MockProvider({ responses: { "concern-classifier": { severity: "low", likelyBenign: true, rationale: "synthetic" } } });
  for (const graph of [{ safetyScreen: { provider: ok } }, undefined]) {
    const w = chatWorld({ deps: { ...(graph ? { graph } : {}), alert: (a) => alerts.push(a) } });
    try {
      const token = await studentToken(adult());
      const threadId = await newThread(w, token);
      await ask(w, token, threadId, "a1h-1");
    } finally {
      w.cleanup();
    }
  }
  assert.deepEqual(alerts, []);
});

test("A1: a throwing alert sink never fails the student's turn, and the failure is not retried on every later turn within the window", async () => {
  let calls = 0;
  const w = chatWorld({ deps: { graph: SCREEN_DOWN(), alert: () => { calls += 1; throw new Error("sink down"); } } });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const res = await ask(w, token, threadId, "a1t-1");
    assert.equal(res.json.message, STUDENT_CRISIS_MESSAGE);
    await ask(w, token, threadId, "a1t-2");
    assert.equal(calls, 1, "rate limited even when the sink throws");
  } finally {
    w.cleanup();
  }
});

test("A1: the default sink is the existing engineering-alert line on stderr (one JSON line, event name, no student text)", async () => {
  const lines: string[] = [];
  const orig = console.error;
  console.error = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  const w = chatWorld({ deps: { graph: SCREEN_DOWN() } }); // no `alert` dep: the real emitter
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    await ask(w, token, threadId, "a1d-1");
  } finally {
    console.error = orig;
    w.cleanup();
  }
  const alertLines = lines.filter((l) => l.includes("alert_safety_screen_outage"));
  assert.equal(alertLines.length, 1, lines.join("\n"));
  const parsed = JSON.parse(alertLines[0]!);
  assert.equal(parsed.event, "alert_safety_screen_outage");
  assert.ok(!alertLines[0]!.includes("Germany"));
});

// -- A2 ------------------------------------------------------------------------

const est = (usd: number) => ({ model: "m", estimatedInputTokens: 1, maxOutputTokens: 1, estimatedCostUsd: usd });
function guardWith(capUsd: number, start: string) {
  const clock = { d: new Date(start) };
  const alerts: EngineeringAlert[] = [];
  const lines: unknown[] = [];
  const g = createChainSpendGuard({ capUsd, now: () => clock.d, log: (l) => lines.push(l), alert: (a) => alerts.push(a) });
  return { g, clock, alerts, lines };
}
const events = (a: EngineeringAlert[]) => a.map((x) => x.event);

test("A2: crossing 80% of the monthly cap raises alert_chain_cap_80pct exactly once that month, naming the month, cap and spend (no text)", () => {
  const { g, alerts } = guardWith(10, "2026-11-03T10:00:00.000Z");
  g.beforeRequest(est(7.9));
  assert.deepEqual(alerts, [], "79% is below the line");
  g.beforeRequest(est(0.1)); // 8.0 = exactly 80%
  assert.deepEqual(events(alerts), ["alert_chain_cap_80pct"]);
  assert.deepEqual(alerts[0]!.attributes, { month: "2026-11", capUsd: 10, spentUsd: 8 });
  g.beforeRequest(est(0.5));
  g.beforeRequest(est(0.5));
  assert.deepEqual(events(alerts), ["alert_chain_cap_80pct"], "once per month, not once per request");
});

test("A2: a reported usage that settles spend UP across 80% also warns (the warning follows real spend, not only reservations)", () => {
  const { g, alerts } = guardWith(10, "2026-11-03T10:00:00.000Z");
  const a = est(1);
  g.beforeRequest(a);
  g.beforeRequest(est(6.5)); // 7.5
  assert.deepEqual(alerts, []);
  g.onUsage({ model: "m", estimate: a, actual: "reported", inputTokens: 1, outputTokens: 1, usd: 1.6 }); // 7.5 - 1 + 1.6 = 8.1
  assert.deepEqual(events(alerts), ["alert_chain_cap_80pct"]);
});

test("A2: a settle that brings spend back down does not clear the once-per-month latch (no flapping alert)", () => {
  const { g, alerts } = guardWith(10, "2026-11-03T10:00:00.000Z");
  const a = est(8.5);
  g.beforeRequest(a);
  assert.equal(alerts.length, 1);
  g.onUsage({ model: "m", estimate: a, actual: "reported", inputTokens: 1, outputTokens: 1, usd: 1 }); // down to 1
  g.beforeRequest(est(7.5)); // up to 8.5 again
  assert.equal(alerts.length, 1, "still the one warning for November");
});

test("A2: hitting the cap raises alert_chain_cap_exhausted once that month (after the 80% warning), and the refusal is unchanged", () => {
  const { g, alerts, lines } = guardWith(10, "2026-11-03T10:00:00.000Z");
  g.beforeRequest(est(9));
  for (let i = 0; i < 3; i++) assert.throws(() => g.beforeRequest(est(2)), ChainBudgetExhaustedError);
  assert.deepEqual(events(alerts), ["alert_chain_cap_80pct", "alert_chain_cap_exhausted"]);
  assert.deepEqual(alerts[1]!.attributes, { month: "2026-11", capUsd: 10, spentUsd: 9 });
  assert.equal(lines.filter((l) => (l as { event: string }).event === "chain_cap_exhausted").length, 1, "the existing log line is kept");
  assert.equal(g.snapshot().capRefusals, 3);
  assert.ok(!JSON.stringify(alerts).includes("Germany"));
});

test("A2: a request that jumps straight past the cap still raises the exhausted alert (not only after an 80% warning)", () => {
  const { g, alerts } = guardWith(10, "2026-11-03T10:00:00.000Z");
  assert.throws(() => g.beforeRequest(est(11)), ChainBudgetExhaustedError);
  assert.deepEqual(events(alerts), ["alert_chain_cap_exhausted"]);
});

test("A2: both alerts re-arm in a new UTC month, and only then", () => {
  const { g, clock, alerts } = guardWith(10, "2026-11-30T23:59:59.000Z");
  g.beforeRequest(est(9));
  assert.throws(() => g.beforeRequest(est(2)), ChainBudgetExhaustedError);
  assert.equal(alerts.length, 2);
  clock.d = new Date("2026-12-01T00:00:00.000Z");
  g.beforeRequest(est(9)); // December: 90% -> warns again
  assert.throws(() => g.beforeRequest(est(2)), ChainBudgetExhaustedError);
  assert.deepEqual(events(alerts), ["alert_chain_cap_80pct", "alert_chain_cap_exhausted", "alert_chain_cap_80pct", "alert_chain_cap_exhausted"]);
  assert.deepEqual(alerts[2]!.attributes, { month: "2026-12", capUsd: 10, spentUsd: 9 });
});

test("A2: a throwing alert sink never turns a reservation into a crash or hides the refusal", () => {
  const clock = new Date("2026-11-03T10:00:00.000Z");
  const g = createChainSpendGuard({ capUsd: 10, now: () => clock, log: () => undefined, alert: () => { throw new Error("sink down"); } });
  g.beforeRequest(est(9)); // crosses 80% with a throwing sink: still reserves
  assert.equal(g.spentUsd(), 9);
  assert.throws(() => g.beforeRequest(est(2)), ChainBudgetExhaustedError);
});

test("A2: the default sink is the existing engineering-alert line on stderr (event name, no student text)", () => {
  const lines: string[] = [];
  const orig = console.error;
  console.error = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  try {
    const g = createChainSpendGuard({ capUsd: 10, now: () => new Date("2026-11-03T10:00:00.000Z"), log: () => undefined });
    g.beforeRequest(est(9));
    assert.throws(() => g.beforeRequest(est(2)), ChainBudgetExhaustedError);
  } finally {
    console.error = orig;
  }
  const parsed = lines.map((l) => { try { return JSON.parse(l) as { event?: string }; } catch { return {}; } });
  assert.deepEqual(parsed.map((p) => p.event).filter((e) => e?.startsWith("alert_")), ["alert_chain_cap_80pct", "alert_chain_cap_exhausted"]);
});

// -- wiring through startApi -----------------------------------------------------

test("A1 wiring: startApi passes http.chat.alert to the chat routes, so an outage over real HTTP reaches the sink", async () => {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const counsellorVerifier = createJwtVerifier(jwtConfigFromEnv({ VC_JWT_ISSUER: "https://issuer.synthetic.test", VC_JWT_PUBLIC_KEY: keys.publicKey.export({ type: "spki", format: "pem" }).toString() }));
  const alerts: EngineeringAlert[] = [];
  const fake = createFakeMongoClient();
  const f = gatesFixture();
  const api = await startApi(
    { MONGODB_URL: "mongodb://fake-host/ignored", VC_GATE_APPROVER: "Umesh", VC_CHAT_ENABLED: "true" },
    {
      clientFactory: () => fake.client,
      http: {
        port: 0,
        verifier: counsellorVerifier,
        provider: kbAnswerProvider(),
        skillsDir: SKILLS_DIR,
        chat: { kb: recordingKb(), speakers: SPEAKERS, gatesDir: f.gates, verifier: studentVerifier(), safetyScreen: { provider: new MockProvider({ responses: {} }) }, alert: (a: EngineeringAlert) => void alerts.push(a) },
      },
    },
  );
  try {
    const base = `http://127.0.0.1:${api.port}`;
    const headers = { authorization: `Bearer ${await studentToken(adult())}`, "content-type": "application/json" };
    const { threadId } = (await (await fetch(`${base}${threadsPath("stu-1")}`, { method: "POST", headers })).json()) as { threadId: string };
    const res = await fetch(`${base}${turnsPath("stu-1", threadId)}`, { method: "POST", headers, body: JSON.stringify({ text: GERMANY_QUESTION, clientTurnId: "w-1" }) });
    assert.equal(res.status, 200);
    assert.deepEqual(alerts.map((a) => a.event), ["alert_safety_screen_outage"]);
  } finally {
    await api.stop();
    cleanupGates(f);
  }
});
