/**
 * T-012 (B16, D-020) unit tests for the concern classifier layer: config, stratified selection, the
 * fail-open call, and the "downgrade, never hide" rule. Offline: MockProvider / hand-rolled fakes
 * only, synthetic text only (B8/B13).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { ProviderAuthorizationRefusedError, MockProvider, LiteLlmProvider, type GenerateRequest, type LlmProvider, type ProviderConfig } from "@vc/providers";
import {
  CONCERN_CLASSIFIER_DEFAULT_MODEL,
  CONCERN_CLASSIFIER_SKILL,
  DEFAULT_SAMPLE_RATES,
  LIKELY_BENIGN_LABEL,
  classifyConcern,
  concernClassifierProviderConfig,
  escalationDecision,
  loadConcernClassifierConfig,
  reviewedFlagView,
  sampleStratum,
  selectForReview,
  type ClassifierAnnotation,
} from "../src/guards/concern-classifier.js";

const AT = "2026-09-27T10:00:00.000Z";
const now = () => new Date(AT);

function classified(severity: "none" | "low" | "moderate" | "high" | "critical", likelyBenign: boolean): ClassifierAnnotation {
  return { status: "classified", model: "flash-lite", severity, likelyBenign, rationale: "synthetic", classifiedAt: AT };
}
const UNAVAILABLE: ClassifierAnnotation = { status: "unavailable", model: "flash-lite", reason: "error", errorName: "Error", attemptedAt: AT };

/** A provider whose generate never settles (a hung model). */
class HangingProvider implements LlmProvider {
  readonly kind = "mock" as const;
  readonly model = "flash-lite";
  calls = 0;
  generate<T>(_request: GenerateRequest<T>): Promise<T> {
    this.calls++;
    return new Promise<T>(() => {});
  }
}

/**
 * T-041 (ISS-t-037-2): a hung provider that RECORDS the signal it was handed, so a test can prove
 * classifyConcern actually aborts the abandoned call (not merely its own Promise.race), mirroring
 * T-037's `hangsForeverButRecordsSignal` fixture in packages/providers/tests/failover.test.ts.
 */
class SignalRecordingHangingProvider implements LlmProvider {
  readonly kind = "mock" as const;
  readonly model = "flash-lite";
  observedSignal: AbortSignal | undefined;
  generate<T>(request: GenerateRequest<T>): Promise<T> {
    this.observedSignal = request.signal;
    return new Promise<T>(() => {});
  }
}

/**
 * T-041 (ISS-t-037-2): simulates a REAL provider's own abort behaviour — the call does not resolve
 * immediately when the signal fires, it rejects asynchronously afterwards (a real `fetch` AbortError
 * needs a tick), the way `LiteLlmProvider` really behaves. Used to prove the LATE rejection from an
 * aborted call can never surface as anything other than the pre-existing unavailable/timeout outcome,
 * and never becomes an unhandled rejection.
 */
class AsyncAbortingProvider implements LlmProvider {
  readonly kind = "mock" as const;
  readonly model = "flash-lite";
  generate<T>(request: GenerateRequest<T>): Promise<T> {
    return new Promise<T>((_, reject) => {
      request.signal?.addEventListener(
        "abort",
        () => {
          setTimeout(() => {
            const err = new Error("simulated aborted fetch");
            err.name = "LiteLlmAbortedError";
            reject(err);
          }, 5);
        },
        { once: true },
      );
    });
  }
}

/** A provider that throws an error whose message carries a would-be secret. */
class ThrowingProvider implements LlmProvider {
  readonly kind = "mock" as const;
  readonly model = "flash-lite";
  async generate<T>(_request: GenerateRequest<T>): Promise<T> {
    const err = new Error("upstream said: key=sk-SYNTHETIC-DO-NOT-LEAK and text 'I want to die'");
    err.name = "LiteLlmHttpError";
    throw err;
  }
}

const INPUT = { text: "This exam is killing me.", translatedText: "This exam is killing me.", lang: "en", guardLevel: "none" as const, guardMatched: [] };

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

test("T-012 config: defaults are the flash-lite tier, an 8s timeout and the default strata rates", () => {
  const cfg = loadConcernClassifierConfig({});
  assert.equal(cfg.model, CONCERN_CLASSIFIER_DEFAULT_MODEL);
  assert.equal(cfg.model, "flash-lite");
  assert.equal(cfg.timeoutMs, 8000);
  assert.deepEqual(cfg.sampleRates, DEFAULT_SAMPLE_RATES);
});

test("T-012 config: env overrides are read; malformed values throw naming the key", () => {
  const cfg = loadConcernClassifierConfig({ VC_CONCERN_MODEL: "tier-x", VC_CONCERN_TIMEOUT_MS: "1500", VC_CONCERN_SAMPLE_RATES: "latin=0,devanagari=1" });
  assert.equal(cfg.model, "tier-x");
  assert.equal(cfg.timeoutMs, 1500);
  assert.deepEqual(cfg.sampleRates, { ...DEFAULT_SAMPLE_RATES, latin: 0, devanagari: 1 });
  assert.throws(() => loadConcernClassifierConfig({ VC_CONCERN_TIMEOUT_MS: "-5" }), /VC_CONCERN_TIMEOUT_MS/);
  assert.throws(() => loadConcernClassifierConfig({ VC_CONCERN_SAMPLE_RATES: "latin=2" }), /VC_CONCERN_SAMPLE_RATES/);
  assert.throws(() => loadConcernClassifierConfig({ VC_CONCERN_SAMPLE_RATES: "klingon=0.5" }), /VC_CONCERN_SAMPLE_RATES/);
});

test("T-012 config: the classifier's provider config swaps in the tier model and drops a litellm failover chain", () => {
  const base: ProviderConfig = { provider: "litellm", model: "balanced", baseUrl: "http://127.0.0.1:1", models: ["a", "b", "c"], maxAttempts: 10 };
  const out = concernClassifierProviderConfig(base, { model: "flash-lite" });
  assert.equal(out.model, "flash-lite");
  assert.equal(out.provider, "litellm");
  assert.equal("models" in out, false);
  assert.equal("maxAttempts" in out, false);
  const mock = concernClassifierProviderConfig({ provider: "mock", model: "mock" }, { model: "flash-lite" });
  assert.deepEqual(mock, { provider: "mock", model: "flash-lite" });
});

// ---------------------------------------------------------------------------
// selection
// ---------------------------------------------------------------------------

test("T-012 selection: every guard flag is reviewed (any speaker); an unflagged counsellor turn never is", () => {
  const rates = { latin: 0, devanagari: 0, other: 0 };
  for (const level of ["concern", "crisis"] as const) {
    for (const speaker of ["student", "counsellor"]) {
      const r = selectForReview({ sessionId: "s", turnId: "t", speaker, text: "x" }, level, rates);
      assert.deepEqual([r.selected, r.selection], [true, "guard_flag"]);
    }
  }
  const all = { latin: 1, devanagari: 1, other: 1 };
  assert.equal(selectForReview({ sessionId: "s", turnId: "t", speaker: "counsellor", text: "hello" }, "none", all).selected, false);
});

test("T-012 selection: the unflagged sample is stratified by script and deterministic", () => {
  assert.equal(sampleStratum("I am fine"), "latin");
  assert.equal(sampleStratum("मैं ठीक हूँ"), "devanagari");
  assert.equal(sampleStratum("Main theek hoon, पर थोड़ा"), "devanagari");
  assert.equal(sampleStratum("12345 ???"), "other");

  const rates = { latin: 0, devanagari: 1, other: 0 };
  const turns = Array.from({ length: 40 }, (_, i) => ({
    sessionId: "session-strata",
    turnId: `t${i}`,
    speaker: "student",
    text: i % 2 === 0 ? "sab theek hai" : "सब ठीक है",
  }));
  const picked = turns.filter((t) => selectForReview(t, "none", rates).selected);
  assert.equal(picked.length, 20, "exactly the Devanagari stratum is sampled at rate 1, the Latin one at rate 0");
  assert.ok(picked.every((t) => sampleStratum(t.text) === "devanagari"));

  const half = { latin: 0.5, devanagari: 0.5, other: 0.5 };
  const first = turns.map((t) => selectForReview(t, "none", half).selected);
  const again = turns.map((t) => selectForReview(t, "none", half).selected);
  assert.deepEqual(first, again, "a replay samples the same turns");
  const n = first.filter(Boolean).length;
  assert.ok(n > 5 && n < 35, `rate 0.5 over 40 turns should pick some but not all (got ${n})`);
});

// ---------------------------------------------------------------------------
// the call: fail-open, never throws
// ---------------------------------------------------------------------------

test("T-012 classify: a valid answer comes back as a classified annotation carrying the model name", async () => {
  const provider = new MockProvider({
    model: "flash-lite",
    responses: { [CONCERN_CLASSIFIER_SKILL]: { severity: "low", likelyBenign: true, rationale: "exam idiom" } },
  });
  const out = await classifyConcern(INPUT, { provider, skillPrompt: "prompt", timeoutMs: 1000, now });
  assert.deepEqual(out, { status: "classified", model: "flash-lite", severity: "low", likelyBenign: true, rationale: "exam idiom", classifiedAt: AT });
  assert.equal(provider.calls.length, 1);
  assert.equal(provider.calls[0]!.skillName, "concern-classifier");
});

test("T-012 classify: a hung provider resolves to unavailable/timeout within the timeout (never blocks)", async () => {
  const started = Date.now();
  const out = await classifyConcern(INPUT, { provider: new HangingProvider(), skillPrompt: "p", timeoutMs: 30, now });
  assert.equal(out.status, "unavailable");
  assert.equal(out.status === "unavailable" && out.reason, "timeout");
  assert.ok(Date.now() - started < 2000);
});

// ---------------------------------------------------------------------------
// T-041 (ISS-t-037-2): the abandoned request is actually cancelled, not merely abandoned
// (same bug class T-037 fixed for FailoverProvider.raceDeadline, now fixed at this call site)
// ---------------------------------------------------------------------------

test("T-041 (ISS-t-037-2): a timeout aborts the abandoned provider call's own AbortSignal — not merely classifyConcern's own race", async () => {
  const provider = new SignalRecordingHangingProvider();
  const out = await classifyConcern(INPUT, { provider, skillPrompt: "p", timeoutMs: 30, now });
  assert.equal(out.status, "unavailable");
  assert.equal(out.status === "unavailable" && out.reason, "timeout");
  assert.ok(provider.observedSignal !== undefined, "the provider must have been handed a signal");
  assert.equal(provider.observedSignal?.aborted, true, "the signal must be aborted once the timeout has fired");
});

test("T-041 (ISS-t-037-2): a real in-flight LiteLLM HTTP request is actually cancelled (the stub server observes the connection close), and the outcome is still unavailable/timeout — unchanged safety behaviour", async () => {
  let requestedAt: number | null = null;
  let closedAt: number | null = null;
  const stub = createServer((req, res) => {
    requestedAt = Date.now();
    req.on("close", () => {
      if (!res.writableEnded) closedAt = Date.now();
    });
    // never respond — the provider's own timeoutMs is far longer than classifyConcern's, so ONLY
    // classifyConcern's own timeout-driven abort can end this call.
  });
  await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve));
  const address = stub.address();
  if (address === null || typeof address === "string") throw new Error("stub has no port");
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  try {
    const provider = new LiteLlmProvider({ model: "flash-lite", baseUrl, timeoutMs: 5_000 });
    const out = await classifyConcern(INPUT, { provider, skillPrompt: "p", timeoutMs: 50, now });
    assert.equal(out.status, "unavailable");
    assert.equal(out.status === "unavailable" && out.reason, "timeout");
    assert.ok(requestedAt !== null, "the stub must have received the request before the timeout fires");
    // The client-side classifyConcern promise settles the instant the abort fires; the server only
    // learns the socket closed once the FIN actually arrives over the loopback connection.
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.ok(closedAt !== null, "the stub server must observe the connection actually close — the request was really cancelled, not merely abandoned client-side");
  } finally {
    await new Promise<void>((resolve, reject) => stub.close((err) => (err ? reject(err) : resolve())));
  }
});

test("T-041 (ISS-t-037-2): a real provider's LATE rejection after an abort never turns into anything but the pre-existing unavailable/timeout outcome, and never becomes an unhandled rejection", async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    const out = await classifyConcern(INPUT, { provider: new AsyncAbortingProvider(), skillPrompt: "p", timeoutMs: 30, now });
    assert.equal(out.status, "unavailable");
    assert.equal(out.status === "unavailable" && out.reason, "timeout", "must never be misread as an 'error' reason, and never as a classified/benign outcome");
    // Give the provider's own deliberately-late (setTimeout-delayed) rejection time to actually fire
    // before checking for an unhandled rejection.
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.deepEqual(unhandled, [], "the abandoned call's own late rejection must never surface as an unhandled rejection");
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("T-012 classify: a provider error resolves to unavailable/error with the class name only (no message leak)", async () => {
  const out = await classifyConcern(INPUT, { provider: new ThrowingProvider(), skillPrompt: "p", timeoutMs: 1000, now });
  assert.deepEqual(out, { status: "unavailable", model: "flash-lite", reason: "error", errorName: "LiteLlmHttpError", attemptedAt: AT });
  assert.doesNotMatch(JSON.stringify(out), /sk-SYNTHETIC|want to die/);
});

test("T-012 classify: a schema-invalid answer resolves to unavailable, never to a made-up severity", async () => {
  const provider = new MockProvider({ model: "flash-lite", responses: { [CONCERN_CLASSIFIER_SKILL]: { severity: "apocalyptic", likelyBenign: "yes" } } });
  const out = await classifyConcern(INPUT, { provider, skillPrompt: "p", timeoutMs: 1000, now });
  assert.equal(out.status, "unavailable");
});

// ---------------------------------------------------------------------------
// downgrade, never hide
// ---------------------------------------------------------------------------

test("T-012 never-hide: a 'likely benign / none' answer on a guard CRISIS keeps the flag visible, critical, and escalating", () => {
  const guard = { level: "crisis" as const, matched: ["p1", "p2"] };
  const view = reviewedFlagView(guard, classified("none", true));
  assert.equal(view.visible, true);
  assert.equal(view.guardLevel, "crisis");
  assert.deepEqual(view.guardMatched, ["p1", "p2"]);
  assert.equal(view.effectiveSeverity, "critical");
  assert.equal(view.annotation, LIKELY_BENIGN_LABEL);
  assert.deepEqual(escalationDecision(guard, classified("none", true)), { escalate: true, reason: "guard_crisis", severity: "critical" });
});

test("T-012 never-hide: a classifier can not lower a guard CONCERN below its floor, but can raise it", () => {
  const guard = { level: "concern" as const, matched: ["c1"] };
  assert.equal(reviewedFlagView(guard, classified("none", true)).effectiveSeverity, "moderate");
  assert.equal(reviewedFlagView(guard, classified("none", true)).visible, true);
  assert.equal(reviewedFlagView(guard, classified("critical", false)).effectiveSeverity, "critical");
  assert.deepEqual(escalationDecision(guard, classified("low", true)), { escalate: false });
  assert.deepEqual(escalationDecision(guard, classified("high", false)), { escalate: true, reason: "classifier_severity", severity: "high" });
});

test("T-012 fail-open: an unreviewable guard flag escalates on the flag alone; an unflagged sampled turn does not", () => {
  assert.deepEqual(escalationDecision({ level: "concern", matched: ["c1"] }, UNAVAILABLE), {
    escalate: true,
    reason: "classifier_unavailable",
    severity: "moderate",
  });
  assert.deepEqual(escalationDecision({ level: "crisis", matched: ["p"] }, UNAVAILABLE), { escalate: true, reason: "guard_crisis", severity: "critical" });
  assert.deepEqual(escalationDecision({ level: "none", matched: [] }, UNAVAILABLE), { escalate: false });
});

test("T-012 raise: a sampled unflagged turn the classifier rates high becomes visible and escalates", () => {
  const guard = { level: "none" as const, matched: [] };
  assert.equal(reviewedFlagView(guard, classified("moderate", false)).visible, false);
  assert.equal(reviewedFlagView(guard, classified("critical", false)).visible, true);
  assert.equal(reviewedFlagView(guard, classified("critical", false)).annotation, null);
  assert.deepEqual(escalationDecision(guard, classified("critical", false)), { escalate: true, reason: "classifier_severity", severity: "critical" });
});

test("T047 RED: classifier authorization preflight prevents actual model execution", async () => {
  let executions = 0;
  let authorizations = 0;
  const provider = new MockProvider({ model: "flash-lite", responses: { [CONCERN_CLASSIFIER_SKILL]: () => { executions++; return { severity: "low", likelyBenign: true, rationale: "synthetic" }; } } });
  await assert.rejects(classifyConcern(INPUT, { provider, skillPrompt: "synthetic", timeoutMs: 30, now,
    preflight: async () => { authorizations++; throw new Error("synthetic-authority-refusal"); },
  }), ProviderAuthorizationRefusedError);
  assert.deepEqual({ authorizations, executions }, { authorizations: 1, executions: 0 });
});

test("T047 RED: classifier unavailable annotation never exposes arbitrary provider error names", async () => {
  const marker = "SYNTHETIC_PRIVATE_CLASSIFIER_ERROR_NAME";
  const provider: LlmProvider = { kind: "mock", model: "flash-lite", generate: async () => { const error = new Error(marker); error.name = marker; throw error; } };
  const annotation = await classifyConcern(INPUT, { provider, skillPrompt: "synthetic", timeoutMs: 30, now });
  assert.equal(annotation.status, "unavailable");
  assert.equal(JSON.stringify(annotation).includes(marker), false);
});
test("T047 held classifier authority consumes original timeout and executes no late model", async () => {
  let release!: () => void;
  let entered = false;
  let executions = 0;
  const held = new Promise<void>(resolve => { release = resolve; });
  const provider = new MockProvider({ model: "flash-lite", responses: { [CONCERN_CLASSIFIER_SKILL]: () => { executions++; return { severity: "low", likelyBenign: true, rationale: "synthetic" }; } } });
  const annotation = await classifyConcern(INPUT, { provider, skillPrompt: "synthetic", timeoutMs: 15, now, preflight: async () => { entered = true; await held; } });
  assert.equal(entered, true);
  assert.equal(annotation.status, "unavailable");
  assert.equal(annotation.status === "unavailable" && annotation.reason, "timeout");
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(executions, 0);
});
test("T047 repair RED: a classifier leaf authorization refusal is terminal, never unavailable", async () => {
  const provider: LlmProvider = { kind: "mock", model: "flash-lite", generate: async () => { throw new ProviderAuthorizationRefusedError(); } };
  await assert.rejects(classifyConcern(INPUT, { provider, skillPrompt: "synthetic", timeoutMs: 100, now }), ProviderAuthorizationRefusedError);
});