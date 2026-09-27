/**
 * T-021 (D-020, contract B6 "runtime failover"): FailoverProvider against REAL in-process stub
 * HTTP servers, one per "model" in the chain (B14 — outcome, not construction; same pattern as
 * litellm.test.ts). No live network, no live Gemini/LiteLLM gateway (B8/B13).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { z } from "zod";
import {
  AiUnavailableError,
  FailoverProvider,
  FAILOVER_DEFAULT_DEADLINE_MS,
  LiteLlmProvider,
  MockProvider,
  ModelOutputSchemaError,
  computeBackoffMs,
  createProvider,
  isRetryableProviderError,
  loadProviderConfig,
  LiteLlmHttpError,
  LiteLlmTimeoutError,
  LiteLlmMalformedResponseError,
  LiteLlmNetworkError,
  type LlmProvider,
  type GenerateRequest,
} from "../src/index.js";

const OutSchema = z.object({ answer: z.string().min(1) });

interface StubRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/** Starts a stub OpenAI-compatible server; `handle` decides the response for each request. */
async function startStub(
  handle: (req: StubRequest) => { status: number; body: unknown } | "hang",
): Promise<{ baseUrl: string; server: Server; requests: StubRequest[] }> {
  const requests: StubRequest[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const stubReq: StubRequest = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString("utf-8") };
      requests.push(stubReq);
      const outcome = handle(stubReq);
      if (outcome === "hang") return;
      res.writeHead(outcome.status, { "content-type": "application/json" });
      res.end(typeof outcome.body === "string" ? outcome.body : JSON.stringify(outcome.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("stub server has no port");
  return { baseUrl: `http://127.0.0.1:${address.port}/v1`, server, requests };
}

async function stop(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

function chatCompletion(contentObj: unknown) {
  return { id: "chatcmpl-stub", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(contentObj) }, finish_reason: "stop" }] };
}

const req = { skillName: "s", skillPrompt: "p", outputSchema: OutSchema, input: {} };

const noopSleep = async () => {};

test("first model fails (500), second succeeds — the failover moves to the next chain model in config order", async () => {
  const model1 = await startStub(() => ({ status: 500, body: { error: "boom" } }));
  const model2 = await startStub(() => ({ status: 200, body: chatCompletion({ answer: "ok" }) }));
  try {
    const provider = new FailoverProvider({
      chain: [new LiteLlmProvider({ model: "m1", baseUrl: model1.baseUrl }), new LiteLlmProvider({ model: "m2", baseUrl: model2.baseUrl })],
      sleep: noopSleep,
      onExhausted: () => assert.fail("must not exhaust — the second model succeeds"),
    });
    const out = await provider.generate(req);
    assert.deepEqual(out, { answer: "ok" });
    assert.equal(model1.requests.length, 1, "model 1 was tried exactly once before failover");
    assert.equal(model2.requests.length, 1, "model 2 was tried exactly once and succeeded");
  } finally {
    await stop(model1.server);
    await stop(model2.server);
  }
});

test("all models fail within the budget: attempt count never exceeds the budget, and backoff+jitter is applied between attempts", async () => {
  const model1 = await startStub(() => ({ status: 503, body: { error: "down" } }));
  const model2 = await startStub(() => ({ status: 429, body: { error: "rate limited" } }));
  try {
    const budget = 5;
    let onExhaustedCalls = 0;
    const delays: number[] = [];
    const provider = new FailoverProvider({
      chain: [new LiteLlmProvider({ model: "m1", baseUrl: model1.baseUrl }), new LiteLlmProvider({ model: "m2", baseUrl: model2.baseUrl })],
      maxAttempts: budget,
      baseDelayMs: 100,
      maxDelayMs: 1_000,
      random: () => 1, // full jitter, pinned to its own upper bound so the expected delay is exact
      sleep: async (ms) => {
        delays.push(ms);
      },
      onExhausted: (info) => {
        onExhaustedCalls += 1;
        assert.equal(info.attempts, budget, "the alert reports exactly the number of attempts actually made");
        assert.deepEqual(info.models, ["m1", "m2"]);
        assert.equal(info.lastErrorName, "LiteLlmHttpError");
      },
    });

    await assert.rejects(provider.generate(req), AiUnavailableError);

    assert.equal(onExhaustedCalls, 1, "the exhaustion alert fires exactly once");
    const totalAttempts = model1.requests.length + model2.requests.length;
    assert.ok(totalAttempts <= budget, `expected attempts <= budget (${budget}), got ${totalAttempts}`);
    assert.equal(totalAttempts, budget, "every attempt in the budget was actually spent (both models kept failing)");
    // budget-1 backoff waits happen strictly BETWEEN the budget attempts (never after the last one).
    assert.equal(delays.length, budget - 1);
    assert.deepEqual(delays, [100, 200, 400, 800], "exponential backoff (base*2^(attempt-1)), capped at maxDelayMs, full jitter pinned to 1");
  } finally {
    await stop(model1.server);
    await stop(model2.server);
  }
});

test("backoff is genuinely applied between attempts — proven with the DEFAULT sleep (real global setTimeout) and node:test fake timers", async (t) => {
  // Pure in-memory providers (no real network), so faking the global timer can never race real I/O.
  let calls = 0;
  const alwaysTimesOut: LlmProvider = {
    kind: "litellm",
    model: "m",
    async generate<T>(_request: GenerateRequest<T>): Promise<T> {
      calls += 1;
      throw new LiteLlmTimeoutError("m", 1);
    },
  };
  const provider = new FailoverProvider({ chain: [alwaysTimesOut], maxAttempts: 3, baseDelayMs: 50, maxDelayMs: 200, random: () => 1, onExhausted: () => {} });

  // T-021 fix cycle 1: FailoverProvider.generate now races every attempt against the wall-clock
  // deadline (raceDeadline, an async function wrapping Promise.race + try/finally), which adds a
  // few more microtask hops per attempt than a bare `await provider.generate()` did. `flush()`
  // drains enough microtask turns to be robust to that, without depending on an exact hop count.
  const flush = async (turns = 6) => {
    for (let i = 0; i < turns; i += 1) await Promise.resolve();
  };

  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = assert.rejects(provider.generate(req), AiUnavailableError);
  await flush(); // let attempt 1 run and schedule its backoff timer
  assert.equal(calls, 1, "attempt 2 must NOT start before the backoff delay elapses");
  t.mock.timers.tick(50); // attempt 1's backoff (base*2^0 = 50)
  await flush();
  assert.equal(calls, 2, "attempt 2 runs once its backoff timer fires");
  t.mock.timers.tick(100); // attempt 2's backoff (base*2^1 = 100)
  await flush();
  assert.equal(calls, 3);
  await pending;
  t.mock.timers.reset();
});

test("a non-retryable error (HTTP 401, an auth/config error) stops immediately: no retry, no failover to the next model", async () => {
  const model1 = await startStub(() => ({ status: 401, body: { error: "bad key" } }));
  const model2 = await startStub(() => ({ status: 200, body: chatCompletion({ answer: "should never be reached" }) }));
  try {
    const provider = new FailoverProvider({
      chain: [new LiteLlmProvider({ model: "m1", baseUrl: model1.baseUrl, apiKey: "super-secret-key" }), new LiteLlmProvider({ model: "m2", baseUrl: model2.baseUrl })],
      sleep: noopSleep,
      onExhausted: () => assert.fail("a non-retryable error must never reach exhaustion — it stops immediately"),
    });
    await assert.rejects(provider.generate(req), (err: unknown) => {
      assert.ok(err instanceof LiteLlmHttpError);
      assert.equal(err.status, 401);
      assert.doesNotMatch(err.message, /super-secret-key/);
      return true;
    });
    assert.equal(model1.requests.length, 1, "exactly one attempt on model 1 — no retry");
    assert.equal(model2.requests.length, 0, "model 2 was never tried — no failover on a non-retryable error");
  } finally {
    await stop(model1.server);
    await stop(model2.server);
  }
});

test("the exhaustion alert is emitted exactly once and carries no secret value", async () => {
  const model1 = await startStub(() => ({ status: 500, body: { error: "down" } }));
  try {
    const alerts: unknown[] = [];
    const provider = new FailoverProvider({
      chain: [new LiteLlmProvider({ model: "m1", baseUrl: model1.baseUrl, apiKey: "super-secret-gateway-key" })],
      maxAttempts: 3,
      sleep: noopSleep,
      onExhausted: (info) => alerts.push(info),
    });
    await assert.rejects(provider.generate(req), AiUnavailableError);
    assert.equal(alerts.length, 1, "the alert must fire exactly once, not once per attempt");
    const serialized = JSON.stringify(alerts[0]);
    assert.doesNotMatch(serialized, /super-secret-gateway-key/, "no key value in the alert payload (B11)");
    assert.doesNotMatch(serialized, /"input"|"turns"|"transcript"/, "no transcript/input content in the alert payload (B13)");
  } finally {
    await stop(model1.server);
  }
});

test("T-021 fix cycle 1 (ISS-t-021-rev-1): worst case — every attempt hangs forever — still ends in AiUnavailableError within the wall-clock deadline, and the alert fires exactly once", async (t) => {
  // No LiteLlmProvider, no HTTP, no per-attempt timeout at all — a provider whose generate() NEVER
  // settles is the strictest possible "every attempt hangs" case: it proves the deadline is a real
  // outer safety net, not merely a consequence of a well-behaved per-attempt timeout. A chain of 3
  // (matching D-020's "3-model chain") shows the deadline holds regardless of chain length too.
  let generateCalls = 0;
  const hangsForever: LlmProvider = {
    kind: "litellm",
    model: "m",
    generate<T>(): Promise<T> {
      generateCalls += 1;
      return new Promise<T>(() => {}); // never resolves, never rejects
    },
  };
  const alerts: unknown[] = [];
  // Deliberately NO overrides for maxAttempts/deadlineMs/baseDelayMs — this proves the SHIPPED
  // defaults (FAILOVER_DEFAULT_MAX_ATTEMPTS=10, FAILOVER_DEFAULT_DEADLINE_MS=45000), not a
  // test-only shortcut.
  const provider = new FailoverProvider({
    chain: [hangsForever, hangsForever, hangsForever],
    onExhausted: (info) => alerts.push(info),
  });

  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = assert.rejects(provider.generate(req), (err: unknown) => {
    assert.ok(err instanceof AiUnavailableError);
    return true;
  });

  // Advancing fake time by EXACTLY the default deadline is enough to settle the call, no matter how
  // large the (unbounded, since every attempt hangs) attempt budget would otherwise allow — this is
  // the actual bound now, replacing the pre-fix ~5.4 minute unbounded worst case.
  t.mock.timers.tick(FAILOVER_DEFAULT_DEADLINE_MS);
  await pending;

  assert.equal(alerts.length, 1, "the exhaustion alert fires exactly once, even though every attempt hung forever");
  assert.equal((alerts[0] as { lastErrorName: string }).lastErrorName, "FailoverDeadlineExceededError");
  assert.equal(generateCalls, 1, "the deadline is hit inside the very first hung attempt — it never gets a chance to even try a second model");
  t.mock.timers.reset();
});

test("T-032 (ISS-t-021-rev-3): the deadline expires BETWEEN attempts (during backoff) — the reported error is the deadline, not a stale earlier retryable failure", async (t) => {
  // Attempt 1 fails with an ordinary retryable error (a timeout), which sets `lastError`. The budget
  // (maxAttempts) is generous — attempt 2 would still be allowed by the attempt counter — but the
  // wall-clock deadline runs out WHILE waiting for backoff, before attempt 2 ever starts. Before the
  // fix, `lastError = lastError ?? new FailoverDeadlineExceededError(...)` kept the stale
  // LiteLlmTimeoutError instead of attributing the stop to the deadline that actually caused it.
  let calls = 0;
  const alwaysTimesOut: LlmProvider = {
    kind: "litellm",
    model: "m",
    async generate<T>(_request: GenerateRequest<T>): Promise<T> {
      calls += 1;
      throw new LiteLlmTimeoutError("m", 1);
    },
  };
  const alerts: unknown[] = [];
  const provider = new FailoverProvider({
    chain: [alwaysTimesOut],
    maxAttempts: 5, // plenty of budget left — the deadline, not the counter, must be what stops it
    deadlineMs: 100,
    baseDelayMs: 50,
    maxDelayMs: 50,
    random: () => 1,
    onExhausted: (info) => alerts.push(info),
  });

  const flush = async (turns = 6) => {
    for (let i = 0; i < turns; i += 1) await Promise.resolve();
  };

  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const pending = assert.rejects(provider.generate(req), (err: unknown) => {
    assert.ok(err instanceof AiUnavailableError);
    assert.equal(
      err.lastErrorName,
      "FailoverDeadlineExceededError",
      "the deadline, not the earlier retryable failure that preceded it, must be the reported cause",
    );
    return true;
  });

  await flush(); // attempt 1 runs, fails, and schedules a 50ms backoff wait
  assert.equal(calls, 1, "attempt 1 ran exactly once before backoff");

  // Advance the fake clock (Date + setTimeout both mocked) well past the 100ms deadline while the
  // backoff wait is pending — this IS the deadline expiring BETWEEN attempts, during backoff.
  t.mock.timers.tick(150);
  await flush();

  assert.equal(calls, 1, "attempt 2 must never start — the deadline was already gone once backoff would have fired");
  assert.equal(alerts.length, 1, "the exhaustion alert still fires exactly once");
  assert.equal((alerts[0] as { lastErrorName: string }).lastErrorName, "FailoverDeadlineExceededError");

  await pending;
  t.mock.timers.reset();
});

test("T-021 fix cycle 1 (ISS-t-021-rev-1): VC_LLM_DEADLINE_MS / VC_LLM_ATTEMPT_TIMEOUT_MS reach the built FailoverProvider chain (real hung stub server, real small timers)", async () => {
  const hung = await startStub(() => "hang");
  try {
    const config = loadProviderConfig({
      VC_LLM_PROVIDER: "litellm",
      VC_LLM_MODEL: "m1",
      VC_LLM_MODELS: "m1,m2",
      VC_LLM_BASE_URL: hung.baseUrl,
      VC_LLM_RETRY_BUDGET: "10",
      VC_LLM_DEADLINE_MS: "150",
      VC_LLM_ATTEMPT_TIMEOUT_MS: "40",
    });
    assert.equal(config.provider === "litellm" && config.deadlineMs, 150, "VC_LLM_DEADLINE_MS parsed onto the config");
    assert.equal(config.provider === "litellm" && config.attemptTimeoutMs, 40, "VC_LLM_ATTEMPT_TIMEOUT_MS parsed onto the config");
    const provider = createProvider(config);
    assert.ok(provider instanceof FailoverProvider);

    const startedAt = Date.now();
    await assert.rejects(provider.generate(req), AiUnavailableError);
    const elapsed = Date.now() - startedAt;
    // If the 8s/30s pre-fix defaults were still in effect instead of the tiny env overrides above,
    // even a single attempt alone would already exceed this bound — so this is a real, discriminating
    // proof that the env values actually reached the constructed LiteLlmProvider/FailoverProvider,
    // not just that loadProviderConfig parsed them.
    assert.ok(elapsed < 2_000, `expected well under 2s (deadline 150ms + scheduling jitter), got ${elapsed}ms`);
  } finally {
    await stop(hung.server);
  }
});

test("isRetryableProviderError: whitelist — timeout/429/5xx/malformed/network/ModelOutputSchemaError are retryable, everything else (auth/config, a bare unrelated ZodError) is not", async () => {
  assert.equal(isRetryableProviderError(new LiteLlmTimeoutError("m", 30_000)), true);
  assert.equal(isRetryableProviderError(new LiteLlmMalformedResponseError("m", "bad json")), true);
  assert.equal(isRetryableProviderError(new LiteLlmNetworkError("m", "ECONNREFUSED")), true);
  assert.equal(isRetryableProviderError(new LiteLlmHttpError(429, "m")), true);
  assert.equal(isRetryableProviderError(new LiteLlmHttpError(500, "m")), true);
  assert.equal(isRetryableProviderError(new LiteLlmHttpError(503, "m")), true);
  assert.equal(isRetryableProviderError(new LiteLlmHttpError(400, "m")), false);
  assert.equal(isRetryableProviderError(new LiteLlmHttpError(401, "m")), false);
  assert.equal(isRetryableProviderError(new LiteLlmHttpError(403, "m")), false);
  assert.equal(isRetryableProviderError(new LiteLlmHttpError(404, "m")), false);
  // T-021 fix cycle 1 (ISS-t-021-rev-2, gate failover-scope Q2 A): a schema-invalid MODEL output
  // (wrong shape, not an outage) is retryable at the failover-chain layer, so it fails over to the
  // next model within the same budget/deadline instead of only being handled by generateWithRetry's
  // own same-provider retry.
  // T-032 (ISS-t-021-rev-3): but that scope is narrowed to the tagged ModelOutputSchemaError raised
  // specifically where a provider validates the MODEL's output — a bare/unrelated z.ZodError (e.g.
  // an internal bug inside a chain member's own code, unrelated to the model's answer) is NOT
  // retryable and must propagate unchanged, so it is never silently retried as if it were an outage.
  assert.equal(
    isRetryableProviderError(new z.ZodError([])),
    false,
    "a raw/unrelated ZodError is not retryable — only the tagged ModelOutputSchemaError is (T-032, ISS-t-021-rev-3)",
  );
  assert.equal(
    isRetryableProviderError(new ModelOutputSchemaError([])),
    true,
    "ModelOutputSchemaError (raised only at the model-output-validation boundary) IS retryable",
  );
  assert.equal(isRetryableProviderError(new Error("unknown")), false);
});

test("T-032 (ISS-t-021-rev-3): isRetryableProviderError scopes ZodError to MODEL-OUTPUT validation only — an output-schema failure fails over, an unrelated internal ZodError propagates unchanged", async () => {
  // Direction 1: a real MockProvider's own output-validation failure (ModelOutputSchemaError, raised
  // at the exact boundary where a provider checks the model's raw output against outputSchema) fails
  // over to the next chain member, exactly like any other retryable failure.
  const wrongShape = new MockProvider({ model: "m1", responses: { s: { nope: 1 } } }); // fails OutSchema
  const valid = new MockProvider({ model: "m2", responses: { s: { answer: "ok" } } });
  const failoverProvider = new FailoverProvider({ chain: [wrongShape, valid], sleep: noopSleep });
  const out = await failoverProvider.generate(req);
  assert.deepEqual(out, { answer: "ok" }, "the output-schema failure on model 1 failed over to model 2");

  // Direction 2: an UNRELATED internal ZodError raised by a chain member's own bug — NOT at the
  // model-output-validation boundary — must propagate unchanged: no retry, no failover, no silent
  // "AI unavailable" masking of what is actually a bug inside that provider's own code.
  const buggyInternalZod: LlmProvider = {
    kind: "mock",
    model: "buggy",
    async generate<T>(): Promise<T> {
      throw new z.ZodError([{ code: "custom", path: [], message: "an internal bug, not a model-output mismatch" }]);
    },
  };
  const nextInChain = new MockProvider({ model: "m2", responses: { s: { answer: "should never be reached" } } });
  const guardedProvider = new FailoverProvider({
    chain: [buggyInternalZod, nextInChain],
    sleep: noopSleep,
    onExhausted: () => assert.fail("must not exhaust — the error propagates immediately, it is never retried"),
  });
  await assert.rejects(guardedProvider.generate(req), (err: unknown) => {
    assert.ok(err instanceof z.ZodError);
    assert.ok(!(err instanceof ModelOutputSchemaError), "must be the raw internal ZodError, not the tagged output-validation subclass");
    return true;
  });
  assert.equal(nextInChain.calls.length, 0, "no failover to the next model — a non-model-output ZodError is not retryable");
});

test("computeBackoffMs: full jitter, bounded by baseDelayMs * 2^(attempt-1), capped at maxDelayMs", () => {
  assert.equal(computeBackoffMs(1, 100, 10_000, () => 0), 0);
  assert.equal(computeBackoffMs(1, 100, 10_000, () => 1), 100);
  assert.equal(computeBackoffMs(2, 100, 10_000, () => 1), 200);
  assert.equal(computeBackoffMs(3, 100, 10_000, () => 1), 400);
  assert.equal(computeBackoffMs(10, 100, 1_000, () => 1), 1_000, "capped at maxDelayMs however large the exponent grows");
});

// ---------------------------------------------------------------------------
// B6/D-020 wiring: loadProviderConfig / createProvider — backward compatibility + new chain config.
// ---------------------------------------------------------------------------

test("T-021: VC_LLM_MODELS absent — loadProviderConfig/createProvider are BYTE-FOR-BYTE unchanged (backward compatibility)", () => {
  const config = loadProviderConfig({ VC_LLM_PROVIDER: "litellm", VC_LLM_MODEL: "balanced", VC_LLM_BASE_URL: "http://127.0.0.1:4000/v1" });
  assert.deepEqual(config, { provider: "litellm", model: "balanced", baseUrl: "http://127.0.0.1:4000/v1" });
  const provider = createProvider(config);
  assert.ok(provider instanceof LiteLlmProvider, "no VC_LLM_MODELS -> still a bare LiteLlmProvider, not a FailoverProvider");
  assert.ok(!(provider instanceof FailoverProvider));
});

test("T-021/D-020: VC_LLM_MODELS + VC_LLM_RETRY_BUDGET build a FailoverProvider chain in config order", () => {
  const config = loadProviderConfig({
    VC_LLM_PROVIDER: "litellm",
    VC_LLM_MODEL: "fast-cheap",
    VC_LLM_MODELS: "fast-cheap, balanced ,smart-coding",
    VC_LLM_BASE_URL: "http://127.0.0.1:4000/v1",
    VC_LLM_RETRY_BUDGET: "7",
  });
  assert.deepEqual(config, {
    provider: "litellm",
    model: "fast-cheap",
    baseUrl: "http://127.0.0.1:4000/v1",
    models: ["fast-cheap", "balanced", "smart-coding"],
    maxAttempts: 7,
  });
  const provider = createProvider(config);
  assert.ok(provider instanceof FailoverProvider);
  assert.equal(provider.model, "fast-cheap -> balanced -> smart-coding");
});

test("T-021: VC_LLM_RETRY_BUDGET must be a positive integer", () => {
  assert.throws(
    () => loadProviderConfig({ VC_LLM_PROVIDER: "litellm", VC_LLM_MODEL: "m", VC_LLM_BASE_URL: "http://x", VC_LLM_RETRY_BUDGET: "0" }),
    /VC_LLM_RETRY_BUDGET/,
  );
  assert.throws(
    () => loadProviderConfig({ VC_LLM_PROVIDER: "litellm", VC_LLM_MODEL: "m", VC_LLM_BASE_URL: "http://x", VC_LLM_RETRY_BUDGET: "not-a-number" }),
    /VC_LLM_RETRY_BUDGET/,
  );
});

test("T-021: FailoverProvider refuses an empty chain", () => {
  assert.throws(() => new FailoverProvider({ chain: [] }), /chain must have at least one provider/);
});

test("T-021: MockProvider works as a chain member too (FailoverProvider is provider-agnostic)", async () => {
  const flaky = new MockProvider({
    responses: {
      s: () => {
        throw new LiteLlmTimeoutError("flaky", 1_000);
      },
    },
  });
  const stable = new MockProvider({ responses: { s: { answer: "ok" } } });
  const provider = new FailoverProvider({ chain: [flaky, stable], sleep: noopSleep });
  const out = await provider.generate({ skillName: "s", skillPrompt: "p", outputSchema: OutSchema, input: {} });
  assert.deepEqual(out, { answer: "ok" });
});

test("T-021 fix cycle 1 (ISS-t-021-rev-2, gate failover-scope Q2 A): a wrong-shape (schema-invalid) response from model 1 fails over to model 2 WITHIN THE SAME call — model 2's valid answer is returned, no exception escapes", async () => {
  const wrongShape = new MockProvider({ model: "m1", responses: { s: { totallyWrongField: 123 } } }); // fails OutSchema (answer: string)
  const valid = new MockProvider({ model: "m2", responses: { s: { answer: "ok" } } });
  const provider = new FailoverProvider({
    chain: [wrongShape, valid],
    sleep: noopSleep,
    onExhausted: () => assert.fail("must not exhaust — model 2's output is valid"),
  });
  const out = await provider.generate(req);
  assert.deepEqual(out, { answer: "ok" });
  assert.equal(wrongShape.calls.length, 1, "model 1 was tried exactly once before failing over on its schema-invalid output");
  assert.equal(valid.calls.length, 1, "model 2 was tried exactly once and succeeded");
});

test("T-021 fix cycle 1 (ISS-t-021-rev-2, gate failover-scope Q2 A): all 3 models return wrong-shape output — the SAME single alert fires and AiUnavailableError is thrown (never a silent failedReason)", async () => {
  const chain = [
    new MockProvider({ model: "m1", responses: { s: { nope: 1 } } }),
    new MockProvider({ model: "m2", responses: { s: { nope: 2 } } }),
    new MockProvider({ model: "m3", responses: { s: { nope: 3 } } }),
  ];
  const alerts: unknown[] = [];
  const provider = new FailoverProvider({ chain, maxAttempts: 6, sleep: noopSleep, onExhausted: (info) => alerts.push(info) });
  await assert.rejects(provider.generate(req), (err: unknown) => {
    assert.ok(err instanceof AiUnavailableError);
    // T-032 (ISS-t-021-rev-3): the failure is now the tagged ModelOutputSchemaError, not a bare
    // "ZodError" — isRetryableProviderError is scoped to that specific model-output-validation
    // boundary (same test id as before; the expected name changed with the intentional narrowing).
    assert.equal(err.lastErrorName, "ModelOutputSchemaError");
    assert.deepEqual(err.modelsAttempted, ["m1", "m2", "m3"]);
    return true;
  });
  assert.equal(alerts.length, 1, "the exhaustion alert fires exactly once, even though every failure was a wrong-shape output, not an outage");
  const serialized = JSON.stringify(alerts[0]);
  assert.doesNotMatch(serialized, /"input"|"turns"|"transcript"/, "no transcript/input content in the alert payload even for a schema-error exhaustion (B13)");
});
