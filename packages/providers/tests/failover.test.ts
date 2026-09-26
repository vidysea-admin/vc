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
  LiteLlmProvider,
  MockProvider,
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

  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = assert.rejects(provider.generate(req), AiUnavailableError);
  await Promise.resolve(); // let attempt 1 run and schedule its backoff timer
  await Promise.resolve();
  assert.equal(calls, 1, "attempt 2 must NOT start before the backoff delay elapses");
  t.mock.timers.tick(50); // attempt 1's backoff (base*2^0 = 50)
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls, 2, "attempt 2 runs once its backoff timer fires");
  t.mock.timers.tick(100); // attempt 2's backoff (base*2^1 = 100)
  await Promise.resolve();
  await Promise.resolve();
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

test("isRetryableProviderError: whitelist — timeout/429/5xx/malformed/network are retryable, everything else (incl. auth/config, ZodError) is not", async () => {
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
  assert.equal(isRetryableProviderError(new z.ZodError([])), false);
  assert.equal(isRetryableProviderError(new Error("unknown")), false);
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
