import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { MockProvider, type EngineeringAlert, type LlmProvider } from "@vc/providers";
import { STUDENT_CRISIS_MESSAGE } from "@vc/engine";
import { createFakeMongoClient } from "@vc/db/testing";
import { ChainBudgetExhaustedError, createChainSpendGuard, parseChainMonthlyCap, startApi } from "../src/index.js";
import { createJwtVerifier, jwtConfigFromEnv } from "../src/auth.js";
import { GERMANY_QUESTION, SKILLS_DIR, SPEAKERS, adult, cleanupGates, gatesFixture, kbAnswerProvider, recordingKb, studentToken, studentVerifier, threadsPath, turnsPath } from "./chat-fixtures.js";
import { CHAIN_ENV, stubOllamaRouted } from "./anonymous-fixtures.js";

const SECRET = `${GERMANY_QUESTION} ZEBRA-42-SECRET`;
const MIN = 60_000;

/** A screen provider that throws, and whose error message CONTAINS the student's input text. */
const leakyScreen = (): LlmProvider =>
  ({
    kind: "mock",
    model: "leaky",
    async generate(req: { input: unknown }) {
      throw new Error(`upstream 500 for input ${JSON.stringify(req.input)}`);
    },
  }) as unknown as LlmProvider;

function captureStderr() {
  const lines: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
  return { lines, restore: () => (console.error = orig) };
}

async function session(chatExtra: Record<string, unknown>, env: Record<string, string> = {}, extraHttp: Record<string, unknown> = {}) {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const verifier = createJwtVerifier(jwtConfigFromEnv({ VC_JWT_ISSUER: "https://issuer.synthetic.test", VC_JWT_PUBLIC_KEY: keys.publicKey.export({ type: "spki", format: "pem" }).toString() }));
  const fake = createFakeMongoClient();
  const f = gatesFixture();
  const clock = { ms: Date.parse("2026-11-01T10:00:00.000Z") };
  const api = await startApi(
    { MONGODB_URL: "mongodb://fake-host/ignored", VC_CHAT_ENABLED: "true", ...env },
    {
      clientFactory: () => fake.client,
      http: { port: 0, verifier, provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, ...extraHttp, chat: { kb: recordingKb(), speakers: SPEAKERS, gatesDir: f.gates, verifier: studentVerifier(), now: () => new Date(clock.ms), nowMs: () => clock.ms, ...chatExtra } },
    } as never,
  );
  const base = `http://127.0.0.1:${api.port}`;
  const headers = { authorization: `Bearer ${await studentToken(adult())}`, "content-type": "application/json" };
  const { threadId } = (await (await fetch(`${base}${threadsPath("stu-1")}`, { method: "POST", headers })).json()) as { threadId: string };
  let n = 0;
  return {
    api,
    clock,
    async ask(text = SECRET) {
      const res = await fetch(`${base}${turnsPath("stu-1", threadId)}`, { method: "POST", headers, body: JSON.stringify({ text, clientTurnId: `c-${++n}` }) });
      return { status: res.status, json: (await res.json()) as { state: string; message?: string } };
    },
    async close() {
      await api.stop();
      cleanupGates(f);
    },
  };
}

const outageCount = (lines: string[]) => lines.filter((l) => l.includes("alert_safety_screen_outage")).length;

test("CHK A1: PRODUCTION wiring (no alert injected), leaky screen error, 5-min window on fake clock, fail-closed reply", async () => {
  const cap = captureStderr();
  const s = await session({ safetyScreen: { provider: leakyScreen() } });
  try {
    const r1 = await s.ask();
    assert.equal(r1.status, 200);
    assert.equal(r1.json.message, STUDENT_CRISIS_MESSAGE, "fail closed");
    assert.equal(outageCount(cap.lines), 1, cap.lines.join("\n"));
    s.clock.ms += 2 * MIN;
    const r2 = await s.ask();
    assert.equal(r2.json.message, STUDENT_CRISIS_MESSAGE);
    assert.equal(outageCount(cap.lines), 1, "second failure within 5 min: none");
    s.clock.ms += 3 * MIN - 1; // 4:59.999 since first
    await s.ask();
    assert.equal(outageCount(cap.lines), 1);
    s.clock.ms += 1; // 5:00
    const r3 = await s.ask();
    assert.equal(r3.json.message, STUDENT_CRISIS_MESSAGE);
    assert.equal(outageCount(cap.lines), 2, "after 5 min: one more");
    const all = cap.lines.join("\n");
    assert.ok(!all.includes("ZEBRA-42-SECRET"), "no student text anywhere on stderr");
    assert.ok(!all.includes("upstream 500"), "no provider error message either");
    const parsed = JSON.parse(cap.lines.find((l) => l.includes("alert_safety_screen_outage"))!);
    assert.equal(parsed.event, "alert_safety_screen_outage");
    process.stdout.write(`ALERT LINE: ${JSON.stringify(parsed)}\n`);
  } finally {
    cap.restore();
    await s.close();
  }
});

test("CHK A1 hostile: sink throws -> student still fail-closed, 200", async () => {
  let calls = 0;
  const s = await session({
    safetyScreen: { provider: leakyScreen() },
    alert: () => {
      calls++;
      throw new Error(`sink exploded ${SECRET}`);
    },
  });
  try {
    const r = await s.ask();
    assert.equal(r.status, 200);
    assert.equal(r.json.message, STUDENT_CRISIS_MESSAGE);
    assert.equal(calls, 1);
  } finally {
    await s.close();
  }
});

test("CHK A1 control: healthy screen -> no alert line", async () => {
  const cap = captureStderr();
  const ok = new MockProvider({ responses: { "concern-classifier": { severity: "low", likelyBenign: true, rationale: "synthetic" } } });
  const s = await session({ safetyScreen: { provider: ok } });
  try {
    const r = await s.ask();
    assert.equal(r.status, 200);
    assert.notEqual(r.json.message, STUDENT_CRISIS_MESSAGE);
    assert.equal(cap.lines.filter((l) => l.includes("alert_")).length, 0);
  } finally {
    cap.restore();
    await s.close();
  }
});

// ---- A2
const est = (usd: number) => ({ model: "m", estimatedInputTokens: 1, maxOutputTokens: 1, estimatedCostUsd: usd });
function guard(start: string, capStr = "50") {
  const clock = { d: new Date(start) };
  const alerts: EngineeringAlert[] = [];
  const capUsd = parseChainMonthlyCap({ VC_CHAIN_MONTHLY_CAP_USD: capStr });
  const g = createChainSpendGuard({ capUsd, now: () => clock.d, log: () => undefined, alert: (a) => alerts.push(a) });
  return { g, clock, alerts };
}
const ev = (a: EngineeringAlert[]) => a.map((x) => x.event);

test("CHK A2: real cap parse (50); 80% once; same-month none; cap exhausted once", () => {
  const { g, alerts } = guard("2026-11-10T08:00:00.000Z");
  g.beforeRequest(est(39.99));
  assert.deepEqual(alerts, []);
  g.beforeRequest(est(0.01)); // 40.00 = 80%
  assert.deepEqual(ev(alerts), ["alert_chain_cap_80pct"]);
  for (let i = 0; i < 5; i++) g.beforeRequest(est(1)); // to 45
  assert.deepEqual(ev(alerts), ["alert_chain_cap_80pct"], "same month: none");
  g.beforeRequest(est(5)); // 50 exactly: allowed, not exhausted
  assert.deepEqual(ev(alerts), ["alert_chain_cap_80pct"]);
  for (let i = 0; i < 3; i++) assert.throws(() => g.beforeRequest(est(0.01)), ChainBudgetExhaustedError);
  assert.deepEqual(ev(alerts), ["alert_chain_cap_80pct", "alert_chain_cap_exhausted"]);
});

test("CHK A2 rollover: 23:59:59.999Z stays latched; 00:00:00.000Z re-arms both", () => {
  const { g, clock, alerts } = guard("2026-11-30T23:59:59.000Z");
  g.beforeRequest(est(45));
  assert.throws(() => g.beforeRequest(est(10)), ChainBudgetExhaustedError);
  assert.equal(alerts.length, 2);
  clock.d = new Date("2026-11-30T23:59:59.999Z");
  assert.throws(() => g.beforeRequest(est(10)), ChainBudgetExhaustedError);
  assert.equal(alerts.length, 2, "still November: latched");
  clock.d = new Date("2026-12-01T00:00:00.000Z");
  g.beforeRequest(est(45));
  assert.throws(() => g.beforeRequest(est(10)), ChainBudgetExhaustedError);
  assert.deepEqual(ev(alerts), ["alert_chain_cap_80pct", "alert_chain_cap_exhausted", "alert_chain_cap_80pct", "alert_chain_cap_exhausted"]);
  assert.equal(alerts[2]!.attributes!.month, "2026-12");
});

test("CHK A2 rollover IST: 05:29 IST (=23:59Z Nov) latched; 05:31 IST (=00:01Z Dec) re-arms", () => {
  const { g, clock, alerts } = guard("2026-12-01T05:29:00.000+05:30");
  assert.equal(clock.d.toISOString(), "2026-11-30T23:59:00.000Z");
  g.beforeRequest(est(45));
  assert.throws(() => g.beforeRequest(est(10)), ChainBudgetExhaustedError);
  assert.equal(alerts.length, 2);
  clock.d = new Date("2026-12-01T05:29:30.000+05:30");
  assert.throws(() => g.beforeRequest(est(10)), ChainBudgetExhaustedError);
  assert.equal(alerts.length, 2, "05:29:30 IST is still Nov UTC");
  clock.d = new Date("2026-12-01T05:31:00.000+05:30");
  assert.equal(clock.d.toISOString(), "2026-12-01T00:01:00.000Z");
  g.beforeRequest(est(45));
  assert.throws(() => g.beforeRequest(est(10)), ChainBudgetExhaustedError);
  assert.equal(alerts.length, 4, "re-armed in December");
});

test("CHK A2: a settle reserved in the old month, applied after rollover, raises nothing", () => {
  const { g, clock, alerts } = guard("2026-11-30T23:59:00.000Z");
  const a = est(1);
  g.beforeRequest(a);
  clock.d = new Date("2026-12-01T00:00:01.000Z");
  g.onUsage({ model: "m", estimate: a, actual: "reported", inputTokens: 1, outputTokens: 1, usd: 49 });
  assert.deepEqual(alerts, []);
  assert.equal(g.spentUsd(), 0);
});

test("CHK A2 hostile: under 80 straight past 100 in ONE beforeRequest -> record what fires", () => {
  const { g, alerts } = guard("2026-11-10T08:00:00.000Z");
  g.beforeRequest(est(30)); // 60%
  assert.deepEqual(alerts, []);
  assert.throws(() => g.beforeRequest(est(30)), ChainBudgetExhaustedError);
  process.stdout.write(`JUMP beforeRequest fired: ${JSON.stringify(ev(alerts))}\n`);
  assert.ok(ev(alerts).includes("alert_chain_cap_exhausted"), "exhausted must not be missed");
});

test("CHK A2 hostile: under 80 straight past 100 via ONE onUsage settle, then next request", () => {
  const { g, alerts } = guard("2026-11-10T08:00:00.000Z");
  const a = est(1);
  g.beforeRequest(a);
  g.onUsage({ model: "m", estimate: a, actual: "reported", inputTokens: 1, outputTokens: 1, usd: 70 });
  process.stdout.write(`JUMP onUsage fired: ${JSON.stringify(ev(alerts))} spent=${g.spentUsd()}\n`);
  assert.throws(() => g.beforeRequest(est(0.01)), ChainBudgetExhaustedError);
  process.stdout.write(`JUMP then refusal fired: ${JSON.stringify(ev(alerts))}\n`);
  assert.ok(ev(alerts).includes("alert_chain_cap_exhausted"));
});

test("CHK A2 PRODUCTION wiring: startApi with VC_TEXT_CHAIN + cap 0.03 and NO alert injected -> alert lines on stderr", async () => {
  const stub = stubOllamaRouted();
  const cap = captureStderr();
  const lines: unknown[] = [];
  const s = await session({}, { ...CHAIN_ENV, VC_CHAIN_MONTHLY_CAP_USD: process.env.CHK_CAP ?? "0.03" }, { chainSpend: { log: (l: unknown) => lines.push(l) } });
  try {
    for (let i = 0; i < 40; i++) await s.ask(GERMANY_QUESTION);
    const evs = cap.lines
      .map((l) => {
        try {
          return (JSON.parse(l) as { event?: string }).event;
        } catch {
          return undefined;
        }
      })
      .filter((e) => e?.startsWith("alert_"));
    process.stdout.write(`PROD A2 events: ${JSON.stringify(evs)}\n`);
    assert.deepEqual([...evs].sort(), ["alert_chain_cap_80pct", "alert_chain_cap_exhausted"]);
  } finally {
    cap.restore();
    await s.close();
    stub.restore();
  }
});
