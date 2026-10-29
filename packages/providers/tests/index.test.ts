import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  ModelOutputSchemaError,
  MockProvider,
  GEMINI_DEFAULT_TIMEOUT_MS,
  GeminiProvider,
  LiteLlmProvider,
  RulesProvider,
  createProvider,
  geminiThinkingConfig,
  loadProviderConfig,
  providersStatus,
} from "../src/index.js";

const OutSchema = z.object({ answer: z.string().min(1) });

test("providersStatus no longer reports a scaffold placeholder", () => {
  assert.doesNotMatch(providersStatus(), /not yet implemented/);
});

test("MockProvider returns the canned output parsed by the caller's Zod schema (typed output)", async () => {
  const provider = new MockProvider({ responses: { "demo-skill": { answer: "42" } } });
  const out = await provider.generate({
    skillName: "demo-skill",
    skillPrompt: "## Purpose\nanswer things",
    outputSchema: OutSchema,
    input: { q: "life" },
  });
  assert.deepEqual(out, { answer: "42" });
});

test("MockProvider records every call (skill name, prompt, input) so tests can prove zero calls", async () => {
  const provider = new MockProvider({ responses: { "demo-skill": (input: unknown) => ({ answer: JSON.stringify(input) }) } });
  assert.equal(provider.calls.length, 0);
  const out = await provider.generate({ skillName: "demo-skill", skillPrompt: "P", outputSchema: OutSchema, input: { a: 1 } });
  assert.equal(out.answer, '{"a":1}');
  assert.equal(provider.calls.length, 1);
  assert.equal(provider.calls[0]?.skillName, "demo-skill");
  assert.equal(provider.calls[0]?.skillPrompt, "P");
  assert.deepEqual(provider.calls[0]?.input, { a: 1 });
});

test("MockProvider refuses an output that does not match the schema (no free text crosses the seam, B5)", async () => {
  const provider = new MockProvider({ responses: { "demo-skill": { answer: "" } } });
  await assert.rejects(
    provider.generate({ skillName: "demo-skill", skillPrompt: "P", outputSchema: OutSchema, input: {} }),
    (error: unknown) => {
      assert.ok(error instanceof z.ZodError && error instanceof ModelOutputSchemaError);
      assert.deepEqual(error.issues, [{ code: "custom", path: [], message: "Provider output did not match the required schema." }]);
      for (const value of [String(error), JSON.stringify(error)]) assert.doesNotMatch(value, /answer/);
      return true;
    },
  );
});

test("MockProvider throws for a skill with no canned response (never invents output)", async () => {
  const provider = new MockProvider({ responses: {} });
  await assert.rejects(
    provider.generate({ skillName: "unknown", skillPrompt: "P", outputSchema: OutSchema, input: {} }),
    /no canned response/,
  );
});

test("B6: loadProviderConfig reads the provider and model from config, and requires both for gemini", () => {
  assert.deepEqual(loadProviderConfig({ VC_LLM_PROVIDER: "mock" }), { provider: "mock", model: "mock" });
  assert.deepEqual(
    loadProviderConfig({ VC_LLM_PROVIDER: "gemini", VC_LLM_MODEL: "gemini-x-flash", GEMINI_API_KEY: "k" }),
    { provider: "gemini", model: "gemini-x-flash", apiKey: "k" },
  );
  assert.throws(() => loadProviderConfig({}), /VC_LLM_PROVIDER/);
  assert.throws(() => loadProviderConfig({ VC_LLM_PROVIDER: "openai" }), /VC_LLM_PROVIDER/);
  assert.throws(() => loadProviderConfig({ VC_LLM_PROVIDER: "gemini", GEMINI_API_KEY: "k" }), /VC_LLM_MODEL/);
  assert.throws(() => loadProviderConfig({ VC_LLM_PROVIDER: "gemini", VC_LLM_MODEL: "m" }), /GEMINI_API_KEY/);
});

test("T-019 B6: loadProviderConfig reads litellm (base URL + optional key) and rules (no model needed) config", () => {
  assert.deepEqual(
    loadProviderConfig({ VC_LLM_PROVIDER: "litellm", VC_LLM_MODEL: "balanced", VC_LLM_BASE_URL: "http://127.0.0.1:4000/v1" }),
    { provider: "litellm", model: "balanced", baseUrl: "http://127.0.0.1:4000/v1" },
  );
  assert.deepEqual(
    loadProviderConfig({
      VC_LLM_PROVIDER: "litellm",
      VC_LLM_MODEL: "balanced",
      VC_LLM_BASE_URL: "http://127.0.0.1:4000/v1",
      VC_LLM_API_KEY: "k",
    }),
    { provider: "litellm", model: "balanced", baseUrl: "http://127.0.0.1:4000/v1", apiKey: "k" },
  );
  assert.throws(() => loadProviderConfig({ VC_LLM_PROVIDER: "litellm", VC_LLM_BASE_URL: "http://x" }), /VC_LLM_MODEL/);
  assert.throws(() => loadProviderConfig({ VC_LLM_PROVIDER: "litellm", VC_LLM_MODEL: "m" }), /VC_LLM_BASE_URL/);

  assert.deepEqual(loadProviderConfig({ VC_LLM_PROVIDER: "rules" }), { provider: "rules", model: "rules" });
  assert.deepEqual(loadProviderConfig({ VC_LLM_PROVIDER: "rules", VC_LLM_MODEL: "rules-v1" }), { provider: "rules", model: "rules-v1" });
});

test("T-019 B6: createProvider builds LiteLlmProvider and RulesProvider from config; still no default provider", () => {
  const litellm = createProvider({ provider: "litellm", model: "balanced", baseUrl: "http://127.0.0.1:4000/v1" });
  assert.ok(litellm instanceof LiteLlmProvider);
  assert.equal(litellm.kind, "litellm");
  assert.equal(litellm.model, "balanced");

  const rules = createProvider({ provider: "rules", model: "rules" });
  assert.ok(rules instanceof RulesProvider);
  assert.equal(rules.kind, "rules");
});

test("B6: createProvider selects the implementation by config; the Gemini stub is constructed, never called", () => {
  const gemini = createProvider({ provider: "gemini", model: "gemini-x-flash", apiKey: "k" });
  assert.ok(gemini instanceof GeminiProvider);
  assert.equal(gemini.kind, "gemini");
  assert.equal(gemini.model, "gemini-x-flash");

  const mock = createProvider({ provider: "mock", model: "mock" }, { mockResponses: { s: { answer: "x" } } });
  assert.ok(mock instanceof MockProvider);
  assert.equal(mock.kind, "mock");
});

test("B11: the Gemini stub never exposes its key through JSON or string conversion", () => {
  const gemini = new GeminiProvider({ model: "m", apiKey: "super-secret-value" });
  assert.doesNotMatch(JSON.stringify(gemini), /super-secret-value/);
  assert.doesNotMatch(String(gemini), /super-secret-value/);
});

test("T-045 leaf authorization refuses before mock execution and does not disclose its input", async () => {
  let executions = 0;
  const p = new MockProvider({ responses: { demo: () => { executions++; return { answer: "42" }; } } });
  let checks = 0;
  const request = { skillName: "demo", skillPrompt: "demo", outputSchema: OutSchema, input: { secretSynthetic: "fixture" },
    preflight: async () => { checks++; throw new Error("synthetic refusal"); } };
  await assert.rejects(p.generate(request), (err: any) => {
    assert.equal(err.name, "ProviderAuthorizationRefusedError");
    for (const rendering of [err.message, String(err), JSON.stringify(err)]) assert.doesNotMatch(rendering, /synthetic refusal|secretSynthetic|fixture/);
    return true;
  });
  assert.equal(checks, 1);
  assert.equal(executions, 0);
  assert.equal(p.calls.length, 0);
});

test("T-045 leaf authorization cannot execute after an abort during preflight", async () => {
  let executions = 0;
  let checks = 0;
  const p = new MockProvider({ responses: { demo: () => { executions++; return { answer: "42" }; } } });
  const controller = new AbortController();
  await assert.rejects(p.generate({ skillName: "demo", skillPrompt: "demo", outputSchema: OutSchema, input: {}, signal: controller.signal,
    preflight: async () => { checks++; controller.abort(); } } as any));
  assert.equal(checks, 1);
  assert.equal(executions, 0);
  assert.equal(p.calls.length, 0);
});

import { FailoverProvider as HistoryFailover, LiteLlmHttpError as HistoryHttpError } from "../src/index.js";

test("T-045 failover rechecks authorization at each leaf and refuses without spending another execution", async () => {
  const first = new MockProvider({ responses: { demo: () => { throw new HistoryHttpError(503, "first"); } } });
  const second = new MockProvider({ responses: { demo: { answer: "42" } } });
  const chain = new HistoryFailover({ chain: [first, second], maxAttempts: 10, sleep: async () => {}, onExhausted: () => { throw new Error("authorization must never exhaust AI"); } });
  let checks = 0;
  await assert.rejects(chain.generate({ skillName: "demo", skillPrompt: "fixture", outputSchema: OutSchema, input: {},
    preflight: async () => { checks++; if (checks === 2) throw new Error("revoked fixture"); } } as any), (err: any) => err.name === "ProviderAuthorizationRefusedError");
  assert.equal(checks, 2);
  assert.equal(first.calls.length, 1);
  assert.equal(second.calls.length, 0);
});

test("T-045 failover deadline includes held preflight and never executes after late authorization", async () => {
  const leaf = new MockProvider({ responses: { demo: { answer: "42" } } });
  const chain = new HistoryFailover({ chain: [leaf], maxAttempts: 10, deadlineMs: 20, onExhausted: () => {} });
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await assert.rejects(chain.generate({ skillName: "demo", skillPrompt: "fixture", outputSchema: OutSchema, input: {}, preflight: () => held } as any), (err: any) => err.name === "AiUnavailableError");
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(leaf.calls.length, 0, "expired leaf attempt cannot execute when hook eventually settles");
});

import { ModelOutputSchemaError as HistorySchemaError } from "../src/index.js";

test("T-045 raw schema failures preserve typed retry eligibility without exposing hostile provider markers", async () => {
  const marker = "HOSTILE_MODEL_RAW_MARKER";
  const p = new MockProvider({ responses: { demo: { verdict: marker, [marker]: { secret: marker } } } });
  const schema = z.object({ verdict: z.enum(["clear", "uncertain"]) }).strict();
  await assert.rejects(p.generate({ skillName: "demo", skillPrompt: "fixture", outputSchema: schema, input: {} }), (err: any) => {
    assert.ok(err instanceof z.ZodError);
    assert.ok(err instanceof HistorySchemaError);
    for (const value of [err.message, String(err), JSON.stringify(err), JSON.stringify(err.issues)]) assert.doesNotMatch(value, /HOSTILE_MODEL_RAW_MARKER/);
    return true;
  });
  const exhausted: any[] = [];
  const chain = new HistoryFailover({ chain: [p], maxAttempts: 2, sleep: async () => {}, onExhausted: (info) => exhausted.push(info) });
  await assert.rejects(chain.generate({ skillName: "demo", skillPrompt: "fixture", outputSchema: schema, input: {} }), (err: any) => err.name === "AiUnavailableError");
  assert.equal(exhausted.length, 1);
  assert.equal(exhausted[0].attempts, 2);
  assert.doesNotMatch(JSON.stringify(exhausted), /HOSTILE_MODEL_RAW_MARKER/);
});

// ---------------------------------------------------------------------------
// p1-nosource-grounded: the Gemini grounded answerer (fake fetch only; no network)
// ---------------------------------------------------------------------------

import {
  GeminiGroundedAnswerer,
  MockGroundedAnswerer,
  GroundingBudget,
  GroundingBudgetError,
  GroundingConfigError,
  GroundingFailedError,
  GroundingHttpError,
  GROUNDING_MAX_SOURCES,
  loadGroundedAnswerer,
  loadGroundingBudget,
  sanitizeGroundingSources,
} from "../src/index.js";

const GKEY = "AIza-FAKE-KEY-FOR-TESTS-0000";
const okBody = (over: Record<string, unknown> = {}) => ({
  candidates: [
    {
      content: { parts: [{ text: "Most public universities charge no tuition." }, { text: " A semester fee applies." }] },
      groundingMetadata: {
        groundingChunks: [
          { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AAA", title: "daad.de" } },
          { web: { uri: "http://insecure.example.test/x", title: "plain http" } },
          { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AAA", title: "duplicate" } },
          { web: { uri: "javascript:alert(1)", title: "script" } },
          { web: { uri: "https://u:p@creds.example.test/x", title: "creds" } },
          { web: { uri: "https://b.example.test/path?q=1", title: "  B\n\tsite <b> " } },
          { web: { uri: "https://c.example.test/" } },
        ],
      },
      ...over,
    },
  ],
});
const fakeFetch = (body: unknown, init: { status?: number; capture?: { url?: string; init?: RequestInit } } = {}): typeof fetch =>
  (async (url: unknown, req: RequestInit | undefined) => {
    if (init.capture) {
      init.capture.url = String(url);
      init.capture.init = req;
    }
    return new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

test("grounded Gemini: one POST with the google_search tool, the key in a header (never the URL), the question as the only user content; text joined, sources sanitised", async () => {
  const capture: { url?: string; init?: RequestInit } = {};
  const a = new GeminiGroundedAnswerer({ model: "gemini-test", apiKey: GKEY, fetchImpl: fakeFetch(okBody(), { capture }) });
  const out = await a.answer({ question: "What is the tuition in Germany?", systemPrompt: "SYS" });
  assert.equal(out.text, "Most public universities charge no tuition. A semester fee applies.");
  assert.deepEqual(out.sources, [
    { title: "daad.de", url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AAA" },
    { title: "B site b", url: "https://b.example.test/path?q=1" },
    { title: "c.example.test", url: "https://c.example.test/" },
  ]);
  assert.equal(capture.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
  assert.ok(!capture.url!.includes(GKEY), "the key is not in the URL");
  const headers = capture.init!.headers as Record<string, string>;
  assert.equal(headers["x-goog-api-key"], GKEY);
  const sent = JSON.parse(String(capture.init!.body));
  assert.deepEqual(sent.tools, [{ google_search: {} }]);
  assert.deepEqual(sent.contents, [{ role: "user", parts: [{ text: "What is the tuition in Germany?" }] }]);
  assert.deepEqual(sent.systemInstruction, { parts: [{ text: "SYS" }] });
  assert.ok(!JSON.stringify(sent).includes(GKEY));
  assert.ok(!String(a).includes(GKEY) && !JSON.stringify(a).includes(GKEY), "the key never shows in toString or JSON");
});

test("grounded Gemini: at most 5 sources; https only; titles bounded", () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ web: { uri: `https://s${i}.example.test/`, title: "t".repeat(500) } }));
  const out = sanitizeGroundingSources(many);
  assert.equal(out.length, GROUNDING_MAX_SOURCES);
  assert.ok(out.every((s) => s.url.startsWith("https://") && s.title.length <= 200));
  assert.deepEqual(sanitizeGroundingSources("nope"), []);
  assert.deepEqual(sanitizeGroundingSources([null, {}, { web: {} }, { web: { uri: 5 } }]), []);
});

test("grounded Gemini: HTTP errors, empty text, bad JSON and network failures are typed key-free errors; a pre-aborted signal makes no request", async () => {
  let calls = 0;
  const counting = (inner: typeof fetch): typeof fetch => ((...args: Parameters<typeof fetch>) => (calls++, inner(...args))) as typeof fetch;
  const mk = (f: typeof fetch) => new GeminiGroundedAnswerer({ model: "m", apiKey: GKEY, fetchImpl: counting(f) });
  await assert.rejects(mk(fakeFetch({}, { status: 429 })).answer({ question: "q", systemPrompt: "s" }), (e: unknown) => e instanceof GroundingHttpError && e.status === 429 && !String(e.message).includes(GKEY));
  await assert.rejects(mk(fakeFetch({ candidates: [{ content: { parts: [{ text: "  " }] } }] })).answer({ question: "q", systemPrompt: "s" }), GroundingFailedError);
  await assert.rejects(mk(fakeFetch({ candidates: [] })).answer({ question: "q", systemPrompt: "s" }), GroundingFailedError);
  await assert.rejects(mk((async () => new Response("<html>", { status: 200 })) as typeof fetch).answer({ question: "q", systemPrompt: "s" }), GroundingFailedError);
  await assert.rejects(mk((async () => { throw new Error(`boom ${GKEY}`); }) as typeof fetch).answer({ question: "q", systemPrompt: "s" }), (e: unknown) => e instanceof GroundingFailedError && !String((e as Error).message).includes(GKEY));
  const before = calls;
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(mk(fakeFetch(okBody())).answer({ question: "q", systemPrompt: "s", signal: ac.signal }), GroundingFailedError);
  assert.equal(calls, before, "no request was made for an already-cancelled call");
});

test("grounded Gemini: its own timeout aborts the in-flight request; the preflight gate can refuse before any request", async () => {
  let aborted = false;
  const hang = ((_u: unknown, req: RequestInit | undefined) =>
    new Promise<Response>((_res, rej) => {
      req?.signal?.addEventListener("abort", () => {
        aborted = true;
        rej(Object.assign(new Error("aborted"), { name: "AbortError" }));
      });
    })) as typeof fetch;
  const slow = new GeminiGroundedAnswerer({ model: "m", apiKey: GKEY, fetchImpl: hang, timeoutMs: 30 });
  await assert.rejects(slow.answer({ question: "q", systemPrompt: "s" }), GroundingFailedError);
  assert.ok(aborted, "the real request was aborted, not just abandoned");
  let fetched = false;
  const gated = new GeminiGroundedAnswerer({ model: "m", apiKey: GKEY, fetchImpl: (async () => ((fetched = true), new Response("{}"))) as typeof fetch });
  await assert.rejects(gated.answer({ question: "q", systemPrompt: "s", preflight: () => { throw new Error("spend cap"); } }));
  assert.equal(fetched, false);
});

test("VC_GROUNDING: unset, empty and off are off; gemini needs a key; any other value is a startup error", () => {
  assert.equal(loadGroundedAnswerer({}), undefined);
  assert.equal(loadGroundedAnswerer({ VC_GROUNDING: "" }), undefined);
  assert.equal(loadGroundedAnswerer({ VC_GROUNDING: "off", GEMINI_API_KEY: GKEY }), undefined);
  assert.throws(() => loadGroundedAnswerer({ VC_GROUNDING: "gemini" }), GroundingConfigError);
  assert.throws(() => loadGroundedAnswerer({ VC_GROUNDING: "true", GEMINI_API_KEY: GKEY }), GroundingConfigError);
  const on = loadGroundedAnswerer({ VC_GROUNDING: "gemini", GEMINI_API_KEY: GKEY });
  assert.equal(on?.kind, "gemini");
  assert.equal(on?.model, "gemini-2.5-flash");
  assert.equal(loadGroundedAnswerer({ VC_GROUNDING: "gemini", GEMINI_API_KEY: GKEY, VC_GROUNDING_MODEL: "gemini-3-flash" })?.model, "gemini-3-flash");
  assert.equal(loadGroundedAnswerer({ VC_GROUNDING: "gemini", GEMINI_API_KEY: GKEY, VC_GROUNDING_MODEL: "gemini-2.5-flash-lite" })?.model, "gemini-2.5-flash-lite");
});

test("H6: a non-flash VC_GROUNDING_MODEL is a startup error (thinkingBudget is only set and proven for flash models); the message never carries the key", () => {
  for (const model of ["gemini-2.5-pro", "gemini-x", "gemini-3-pro"]) {
    assert.throws(
      () => loadGroundedAnswerer({ VC_GROUNDING: "gemini", GEMINI_API_KEY: GKEY, VC_GROUNDING_MODEL: model }),
      (e: unknown) => e instanceof GroundingConfigError && !String((e as Error).message).includes(GKEY),
      model,
    );
  }
});

const okAnswer = { text: "t", sources: [] };

test("H6: GroundingBudget caps grounded calls per session key and per UTC day; the cap error is typed and the inner answerer is not called over the cap", async () => {
  const inner = new MockGroundedAnswerer(okAnswer);
  const budget = new GroundingBudget({ maxPerSession: 2, maxPerDay: 3 });
  const a = budget.bind(inner, "a");
  const b = budget.bind(inner, "b");
  await a.answer({ question: "q", systemPrompt: "s" });
  await a.answer({ question: "q", systemPrompt: "s" });
  await assert.rejects(a.answer({ question: "q", systemPrompt: "s" }), (e: unknown) => e instanceof GroundingBudgetError && e.scope === "session");
  await b.answer({ question: "q", systemPrompt: "s" });
  await assert.rejects(b.answer({ question: "q", systemPrompt: "s" }), (e: unknown) => e instanceof GroundingBudgetError && e.scope === "day");
  assert.equal(inner.calls.length, 3, "only allowed calls reach the answerer");
  assert.equal(a.kind, inner.kind);
  assert.equal(a.model, inner.model);
});

test("H6: the budget rolls over at the UTC day, and a failing spend guard refuses the call without counting it", async () => {
  let now = new Date("2026-10-22T23:59:00Z");
  let spendOk = true;
  let spent = 0;
  const inner = new MockGroundedAnswerer(okAnswer);
  const budget = new GroundingBudget({ maxPerSession: 1, maxPerDay: 1, now: () => now, spend: () => { if (!spendOk) throw new Error("monthly cap"); spent += 1; } });
  const g = budget.bind(inner, "k");
  spendOk = false;
  await assert.rejects(g.answer({ question: "q", systemPrompt: "s" }), (e: unknown) => e instanceof GroundingBudgetError && e.scope === "spend");
  assert.equal(inner.calls.length, 0);
  spendOk = true;
  await g.answer({ question: "q", systemPrompt: "s" });
  await assert.rejects(g.answer({ question: "q", systemPrompt: "s" }), GroundingBudgetError);
  now = new Date("2026-10-23T00:00:01Z");
  await g.answer({ question: "q", systemPrompt: "s" });
  assert.equal(inner.calls.length, 2);
  assert.equal(spent, 2);
});

test("H6: loadGroundingBudget defaults to 5 per session and 500 per day, reads the env, and rejects malformed values at startup", () => {
  const d = loadGroundingBudget({});
  assert.equal(d.maxPerSession, 5);
  assert.equal(d.maxPerDay, 500);
  const e = loadGroundingBudget({ VC_GROUNDING_MAX_PER_SESSION: "3", VC_GROUNDING_MAX_PER_DAY: "40" });
  assert.equal(e.maxPerSession, 3);
  assert.equal(e.maxPerDay, 40);
  for (const bad of ["0", "-1", "abc", "1.5", "1e3"]) {
    assert.throws(() => loadGroundingBudget({ VC_GROUNDING_MAX_PER_SESSION: bad }), GroundingConfigError, bad);
    assert.throws(() => loadGroundingBudget({ VC_GROUNDING_MAX_PER_DAY: bad }), GroundingConfigError, bad);
  }
});

test("grounded Gemini: a MAX_TOKENS reply is a typed failure (never shown cut off); a flash model is sent thinkingBudget 0, another model is not; the output limit leaves room for the answer", async () => {
  const cut = new GeminiGroundedAnswerer({ model: "gemini-test", apiKey: GKEY, fetchImpl: fakeFetch(okBody({ finishReason: "MAX_TOKENS" })) });
  await assert.rejects(cut.answer({ question: "q", systemPrompt: "SYS" }), (e: unknown) => e instanceof GroundingFailedError && !String((e as Error).message).includes(GKEY));
  const done = new GeminiGroundedAnswerer({ model: "gemini-test", apiKey: GKEY, fetchImpl: fakeFetch(okBody({ finishReason: "STOP" })) });
  assert.match((await done.answer({ question: "q", systemPrompt: "SYS" })).text, /^Most public/);
  const sentFor = async (model: string) => {
    const capture: { url?: string; init?: RequestInit } = {};
    await new GeminiGroundedAnswerer({ model, apiKey: GKEY, fetchImpl: fakeFetch(okBody(), { capture }) }).answer({ question: "q", systemPrompt: "SYS" });
    return JSON.parse(String(capture.init!.body)).generationConfig as { maxOutputTokens: number; thinkingConfig?: unknown };
  };
  const flash = await sentFor("gemini-2.5-flash");
  assert.deepEqual(flash.thinkingConfig, { thinkingBudget: 0 });
  assert.ok(flash.maxOutputTokens >= 2000);
  assert.equal((await sentFor("gemini-2.5-pro")).thinkingConfig, undefined);
});

test("grounded Gemini: only a normal STOP finish is accepted (SAFETY, RECITATION, OTHER and MAX_TOKENS are typed failures); a stalled body is cut off by the timeout", async () => {
  for (const finishReason of ["SAFETY", "RECITATION", "OTHER", "MAX_TOKENS"]) {
    const a = new GeminiGroundedAnswerer({ model: "gemini-test", apiKey: GKEY, fetchImpl: fakeFetch(okBody({ finishReason })) });
    await assert.rejects(a.answer({ question: "q", systemPrompt: "SYS" }), (e: unknown) => e instanceof GroundingFailedError && !String((e as Error).message).includes(GKEY), finishReason);
  }
  const stalled = (async (_url: unknown, req: RequestInit | undefined) => {
    const body = new ReadableStream({ start(c) { req?.signal?.addEventListener("abort", () => c.error(Object.assign(new Error("aborted"), { name: "AbortError" }))); } });
    return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  const a = new GeminiGroundedAnswerer({ model: "gemini-test", apiKey: GKEY, fetchImpl: stalled, timeoutMs: 50 });
  await assert.rejects(a.answer({ question: "q", systemPrompt: "SYS" }), (e: unknown) => e instanceof GroundingFailedError);
});

// p1-grounding-hardening fix cycle 1, F2 (H6): the counters are reserved BEFORE the async spend is awaited, so parallel calls cannot all pass the check.
test("H6 F2: 10 parallel answer() calls with an async spend and a cap of 5 allow exactly 5 (per session key and per day)", async () => {
  const slowSpend = () => new Promise<void>((resolve) => setTimeout(resolve, 15));
  const inner = new MockGroundedAnswerer(okAnswer);
  const budget = new GroundingBudget({ maxPerSession: 5, maxPerDay: 100, spend: slowSpend });
  const g = budget.bind(inner, "same-client");
  const res = await Promise.allSettled(Array.from({ length: 10 }, () => g.answer({ question: "q", systemPrompt: "s" })));
  assert.equal(res.filter((r) => r.status === "fulfilled").length, 5);
  assert.equal(res.filter((r) => r.status === "rejected" && r.reason instanceof GroundingBudgetError && r.reason.scope === "session").length, 5);
  assert.equal(inner.calls.length, 5);

  const inner2 = new MockGroundedAnswerer(okAnswer);
  const dayBudget = new GroundingBudget({ maxPerSession: 100, maxPerDay: 5, spend: slowSpend });
  const res2 = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => dayBudget.bind(inner2, `client-${i}`).answer({ question: "q", systemPrompt: "s" })));
  assert.equal(res2.filter((r) => r.status === "fulfilled").length, 5);
  assert.equal(res2.filter((r) => r.status === "rejected" && r.reason instanceof GroundingBudgetError && r.reason.scope === "day").length, 5);
  assert.equal(inner2.calls.length, 5);
});

test("H6 F2: a spend that throws (async) rolls the reserved day and per-key counts back, so refused calls do not eat the cap", async () => {
  let deny = true;
  const inner = new MockGroundedAnswerer(okAnswer);
  const budget = new GroundingBudget({ maxPerSession: 2, maxPerDay: 2, spend: async () => { await new Promise((r) => setTimeout(r, 5)); if (deny) throw new Error("monthly cap"); } });
  const g = budget.bind(inner, "k");
  const refused = await Promise.allSettled(Array.from({ length: 6 }, () => g.answer({ question: "q", systemPrompt: "s" })));
  assert.ok(refused.every((r) => r.status === "rejected" && r.reason instanceof GroundingBudgetError));
  assert.equal(inner.calls.length, 0);
  deny = false;
  await g.answer({ question: "q", systemPrompt: "s" });
  await g.answer({ question: "q", systemPrompt: "s" });
  await assert.rejects(g.answer({ question: "q", systemPrompt: "s" }), GroundingBudgetError);
  assert.equal(inner.calls.length, 2, "both caps were fully intact after the refused spends");
});

// ---------------------------------------------------------------------------
// T-057 (gemini-safety-extract): GeminiProvider is a real text provider (it was a stub that threw), so VC_LLM_PROVIDER=gemini can serve
// the safety screen and fact extraction. Offline: every request goes to an injected fetch.
// ---------------------------------------------------------------------------

const geminiReply = (text: unknown, finishReason = "STOP") =>
  new Response(JSON.stringify({ candidates: [{ finishReason, content: { parts: [{ text: typeof text === "string" ? text : JSON.stringify(text) }] } }] }), { status: 200 });

test("T-057 G1: GeminiProvider.generate posts the skill prompt and input to generateContent in JSON mode, key in a header only, and returns the schema-parsed output", async () => {
  const calls: { url: string; headers: Record<string, string>; body: any }[] = [];
  const gemini = new GeminiProvider({
    model: "gemini-synth-flash",
    apiKey: "super-secret-value",
    fetchImpl: (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
      return geminiReply({ answer: "ok" });
    }) as unknown as typeof fetch,
  });
  const out = await gemini.generate({ skillName: "demo", skillPrompt: "SKILL BODY", outputSchema: OutSchema, input: { q: "x" } });
  assert.deepEqual(out, { answer: "ok" });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-synth-flash:generateContent$/);
  assert.doesNotMatch(calls[0]!.url, /super-secret-value/);
  assert.equal(calls[0]!.headers["x-goog-api-key"], "super-secret-value");
  assert.equal(calls[0]!.body.systemInstruction.parts[0].text, "SKILL BODY");
  assert.equal(calls[0]!.body.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(JSON.parse(calls[0]!.body.contents[0].parts[0].text), { q: "x" });
});

// t057-gemini-thinking-config: gemini-3.5-flash-lite rejects thinkingBudget:0 (HTTP 400) and accepts thinkingLevel:"minimal"; the 2.5 family and
// gemini-3.1-flash-lite / gemini-3.5-flash accept thinkingBudget:0 (probed live 2026-10-29). A model not proven here gets no thinkingConfig at all.
test("t057 thinking config: each model family is sent the config it accepts, on the text path and the grounded path; an unknown model gets none", async () => {
  const expected: [string, unknown][] = [
    ["gemini-2.5-flash", { thinkingBudget: 0 }],
    ["gemini-2.5-flash-lite", { thinkingBudget: 0 }],
    ["gemini-3.1-flash-lite", { thinkingBudget: 0 }],
    ["gemini-3.5-flash", { thinkingBudget: 0 }],
    ["gemini-3.5-flash-lite", { thinkingLevel: "minimal" }],
    ["gemini-2.5-pro", undefined],
    ["gemini-9.9-flash-lite", undefined],
    ["gemini-test", undefined],
  ];
  for (const [model, want] of expected) {
    assert.deepEqual(geminiThinkingConfig(model), want, `helper: ${model}`);
    const text: { init?: RequestInit } = {};
    await new GeminiProvider({
      model,
      apiKey: "k",
      fetchImpl: (async (_u: string, init: RequestInit) => { text.init = init; return geminiReply({ answer: "ok" }); }) as unknown as typeof fetch,
    }).generate({ skillName: "d", skillPrompt: "P", outputSchema: OutSchema, input: {} });
    assert.deepEqual(JSON.parse(String(text.init!.body)).generationConfig.thinkingConfig, want, `text path: ${model}`);
    const grounded: { url?: string; init?: RequestInit } = {};
    await new GeminiGroundedAnswerer({ model, apiKey: GKEY, fetchImpl: fakeFetch(okBody(), { capture: grounded }) }).answer({ question: "q", systemPrompt: "SYS" });
    assert.deepEqual(JSON.parse(String(grounded.init!.body)).generationConfig.thinkingConfig, want, `grounded path: ${model}`);
  }
});

test("T-057 G2: a Gemini failure is typed and key-free: HTTP status, cut-off reply, non-JSON, schema mismatch, timeout and caller abort", async () => {
  const mk = (impl: (url: string, init: RequestInit) => Promise<Response>, timeoutMs?: number) =>
    new GeminiProvider({ model: "m", apiKey: "super-secret-value", fetchImpl: impl as unknown as typeof fetch, ...(timeoutMs ? { timeoutMs } : {}) });
  const req = { skillName: "d", skillPrompt: "P", outputSchema: OutSchema, input: {} };
  const rejects = async (p: Promise<unknown>, name: string) =>
    assert.rejects(p, (e: Error) => {
      assert.equal(e.name, name);
      assert.doesNotMatch(`${e.message} ${String(e)}`, /super-secret-value/);
      return true;
    });
  await rejects(mk(async () => new Response("{}", { status: 503 })).generate(req), "GeminiHttpError");
  await rejects(mk(async () => geminiReply('{"answer":"cut', "MAX_TOKENS")).generate(req), "GeminiMalformedResponseError");
  await rejects(mk(async () => geminiReply("not json at all")).generate(req), "GeminiMalformedResponseError");
  await rejects(mk(async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 })).generate(req), "GeminiMalformedResponseError");
  await rejects(mk(async () => geminiReply({ wrong: 1 })).generate(req), "ModelOutputSchemaError");
  const hang = (_u: string, init: RequestInit) => new Promise<Response>((_res, rej) => init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  await rejects(mk(hang, 20).generate(req), "GeminiTimeoutError");
  const ctl = new AbortController();
  const aborted = mk(hang);
  const pending = aborted.generate({ ...req, signal: ctl.signal });
  ctl.abort();
  await rejects(pending, "GeminiAbortedError");
  let fetched = 0;
  const pre = new AbortController();
  pre.abort();
  await rejects(mk(async () => { fetched++; return geminiReply({ answer: "x" }); }).generate({ ...req, signal: pre.signal }), "GeminiAbortedError");
  assert.equal(fetched, 0, "an already-cancelled request never reaches the network");
});

test("T-057 G3: the Gemini default timeout is well under the 30 s demo budget, and a leaf preflight refusal stops before any request", async () => {
  assert.ok(GEMINI_DEFAULT_TIMEOUT_MS > 0 && GEMINI_DEFAULT_TIMEOUT_MS <= 15_000);
  let fetched = 0;
  const gemini = new GeminiProvider({ model: "m", apiKey: "k", fetchImpl: (async () => { fetched++; return geminiReply({ answer: "x" }); }) as unknown as typeof fetch });
  await assert.rejects(
    gemini.generate({ skillName: "d", skillPrompt: "P", outputSchema: OutSchema, input: {}, preflight: async () => { throw new Error("no"); } }),
    (e: Error) => e.name === "ProviderAuthorizationRefusedError",
  );
  assert.equal(fetched, 0);
});

// ---------------------------------------------------------------------------
// tool-first T3 (spec (f), S10; TF-13 + the grounding half of TF-14): per-role models and the thinking-config edge rows
// ---------------------------------------------------------------------------

import { loadRoleProviderConfig, resolveRoleModel, ROLE_MODEL_ENV, SUMMARY_DEFAULT_MODEL } from "../src/index.js";

const GEM_ENV = { VC_LLM_PROVIDER: "gemini", VC_LLM_MODEL: "gemini-2.5-flash", GEMINI_API_KEY: GKEY };
const LLM_ENV = { VC_LLM_PROVIDER: "litellm", VC_LLM_MODEL: "balanced", VC_LLM_BASE_URL: "http://127.0.0.1:4000/v1" };

test("TF-13: the summary default is the probed gemini-3.5-flash-lite, and the role env names are fixed", () => {
  assert.equal(SUMMARY_DEFAULT_MODEL, "gemini-3.5-flash-lite");
  assert.deepEqual(ROLE_MODEL_ENV, { summary: "VC_MODEL_SUMMARY", answer: "VC_MODEL_ANSWER", router: "VC_MODEL_ROUTER" });
  assert.notEqual(geminiThinkingConfig(SUMMARY_DEFAULT_MODEL), undefined, "the default must be an id the thinking helper has proven");
});

test("TF-13: per-role model env resolves, trimmed, and falls back to VC_LLM_MODEL when unset", () => {
  assert.equal(resolveRoleModel({ ...GEM_ENV, VC_MODEL_SUMMARY: "  gemini-3.1-flash-lite " }, "summary"), "gemini-3.1-flash-lite");
  assert.equal(resolveRoleModel({ ...GEM_ENV, VC_MODEL_ANSWER: "gemini-3.5-flash" }, "answer"), "gemini-3.5-flash");
  assert.equal(resolveRoleModel({ ...GEM_ENV, VC_MODEL_ROUTER: "gemini-2.5-flash-lite" }, "router"), "gemini-2.5-flash-lite");
  // unset: answer and router fall back to VC_LLM_MODEL; one role's override never leaks into another
  assert.equal(resolveRoleModel({ ...GEM_ENV, VC_MODEL_SUMMARY: "gemini-3.5-flash" }, "answer"), "gemini-2.5-flash");
  assert.equal(resolveRoleModel(GEM_ENV, "router"), "gemini-2.5-flash");
  assert.equal(resolveRoleModel(LLM_ENV, "answer"), "balanced");
  // summary: the gemini provider defaults to the probed fast model; any other provider keeps VC_LLM_MODEL
  assert.equal(resolveRoleModel(GEM_ENV, "summary"), "gemini-3.5-flash-lite");
  assert.equal(resolveRoleModel(LLM_ENV, "summary"), "balanced");
  assert.equal(resolveRoleModel({ ...LLM_ENV, VC_MODEL_SUMMARY: "fast-cheap" }, "summary"), "fast-cheap");
  // an empty value is "unset", the same as the other VC_* keys in .env files
  assert.equal(resolveRoleModel({ ...LLM_ENV, VC_MODEL_SUMMARY: "" }, "summary"), "balanced");
});

test("TF-13: a bad per-role value is a config error that names the key, never the value", () => {
  for (const bad of ["   ", "two words", "m;rm -rf", "m\nx", "$(whoami)", "-leading-dash", "a".repeat(129), "http://evil.example/x"]) {
    assert.throws(
      () => resolveRoleModel({ ...GEM_ENV, VC_MODEL_SUMMARY: bad }, "summary"),
      (e: Error) => /VC_MODEL_SUMMARY/.test(e.message) && (bad.trim() === "" || !e.message.includes(bad.trim())),
      `rejects ${JSON.stringify(bad.slice(0, 20))}`,
    );
  }
  assert.throws(() => resolveRoleModel({ ...GEM_ENV, VC_MODEL_ROUTER: "bad value" }, "router"), /VC_MODEL_ROUTER/);
  assert.throws(() => resolveRoleModel({ ...GEM_ENV, VC_MODEL_ANSWER: "bad value" }, "answer"), /VC_MODEL_ANSWER/);
  assert.throws(() => loadRoleProviderConfig({ ...LLM_ENV, VC_MODEL_SUMMARY: "bad value" }, "summary"), /VC_MODEL_SUMMARY/);
});

test("TF-13: the role-model validator is ReDoS-safe on hostile input (300 repeats < 100 ms)", () => {
  const hostile = "a".repeat(20_000) + "!";
  const start = performance.now();
  for (let i = 0; i < 300; i++) {
    assert.throws(() => resolveRoleModel({ ...GEM_ENV, VC_MODEL_SUMMARY: hostile }, "summary"), /VC_MODEL_SUMMARY/);
  }
  assert.ok(performance.now() - start < 100, `took ${performance.now() - start} ms`);
});

test("TF-13: loadProviderConfig is byte-for-byte unchanged by the role keys (they are not part of the base config)", () => {
  assert.deepEqual(loadProviderConfig({ ...GEM_ENV, VC_MODEL_SUMMARY: "gemini-3.5-flash-lite" }), { provider: "gemini", model: "gemini-2.5-flash", apiKey: GKEY });
});

test("TF-13: loadRoleProviderConfig swaps only the model; a litellm failover chain is dropped for an overridden role, kept otherwise", () => {
  const chain = { ...LLM_ENV, VC_LLM_MODELS: "balanced,smart-coding" };
  assert.deepEqual(loadRoleProviderConfig({ ...chain, VC_MODEL_SUMMARY: "fast-cheap" }, "summary"), { provider: "litellm", model: "fast-cheap", baseUrl: "http://127.0.0.1:4000/v1" });
  assert.deepEqual(loadRoleProviderConfig(chain, "answer"), loadProviderConfig(chain));
  assert.deepEqual(loadRoleProviderConfig(GEM_ENV, "summary"), { provider: "gemini", model: "gemini-3.5-flash-lite", apiKey: GKEY });
  assert.deepEqual(loadRoleProviderConfig({ VC_LLM_PROVIDER: "mock" }, "summary"), { provider: "mock", model: "mock" });
  assert.deepEqual(loadRoleProviderConfig({ VC_LLM_PROVIDER: "rules" }, "router"), { provider: "rules", model: "rules" });
});

test("TF-13: a role model built through the gemini provider is routed through geminiThinkingConfig", async () => {
  const seen: Array<{ model: string; thinking: unknown }> = [];
  const cases: Array<[("summary" | "answer" | "router"), Record<string, string>, string, unknown]> = [
    ["summary", GEM_ENV, "gemini-3.5-flash-lite", { thinkingLevel: "minimal" }],
    ["answer", { ...GEM_ENV, VC_MODEL_ANSWER: "gemini-3.5-flash" }, "gemini-3.5-flash", { thinkingBudget: 0 }],
    ["router", { ...GEM_ENV, VC_MODEL_ROUTER: "gemini-9.9-flash-lite" }, "gemini-9.9-flash-lite", undefined],
  ];
  for (const [role, env, model, want] of cases) {
    const provider = createProvider(loadRoleProviderConfig(env, role), {
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen.push({ model: decodeURIComponent(String(url).split("/models/")[1]!.split(":")[0]!), thinking: JSON.parse(String(init.body)).generationConfig.thinkingConfig });
        return geminiReply({ answer: "ok" });
      }) as unknown as typeof fetch,
    });
    await provider.generate({ skillName: "d", skillPrompt: "P", outputSchema: OutSchema, input: {} });
    const got = seen.pop()!;
    assert.equal(got.model, model, `${role}: model on the wire`);
    assert.deepEqual(got.thinking, want, `${role}: thinking config`);
  }
});

test("TF-14 (grounding half): the grounded call carries only the general question and the fixed system prompt, never student fields", async () => {
  const cap: { url?: string; init?: RequestInit } = {};
  const answerer = new GeminiGroundedAnswerer({ model: "gemini-3.5-flash-lite", apiKey: GKEY, fetchImpl: fakeFetch(okBody(), { capture: cap }) });
  // a caller that (wrongly) passes extra student-shaped fields at runtime: the seam must not forward them
  const hostile = { question: "What is the IELTS test format?", systemPrompt: "SYS", studentId: "S-123", name: "Asha", rows: [{ university: "X" }], summary: "2 applications" } as unknown as Parameters<typeof answerer.answer>[0];
  await answerer.answer(hostile);
  const body = JSON.parse(String(cap.init!.body));
  assert.deepEqual(Object.keys(body).sort(), ["contents", "generationConfig", "systemInstruction", "tools"]);
  assert.deepEqual(body.contents, [{ role: "user", parts: [{ text: "What is the IELTS test format?" }] }]);
  const wire = String(cap.init!.body) + String(cap.url);
  for (const leak of ["S-123", "Asha", "2 applications", "university"]) assert.ok(!wire.includes(leak), `leaked ${leak}`);
  assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingLevel: "minimal" });
});

test("TF-14 (grounding half): VC_GROUNDING stays off by default; the grounded model does not follow the role keys", () => {
  assert.equal(loadGroundedAnswerer({ GEMINI_API_KEY: GKEY, VC_MODEL_SUMMARY: "gemini-3.5-flash-lite" } as never), undefined);
  assert.equal(loadGroundedAnswerer({ VC_GROUNDING: "off", GEMINI_API_KEY: GKEY }), undefined);
  assert.equal(loadGroundedAnswerer({ VC_GROUNDING: "gemini", GEMINI_API_KEY: GKEY, VC_MODEL_SUMMARY: "gemini-3.5-flash", VC_MODEL_ANSWER: "gemini-3.1-flash-lite" } as never)?.model, "gemini-2.5-flash");
});

test("t057 thinking config edge rows: -preview suffix, flash2, 3.6, flash-latest, uppercase", () => {
  // `(?![\w.])` ends the match at a hyphen, so a "-preview" suffix is read as the base id (same config); anything glued on with a digit, letter or dot is not.
  assert.deepEqual(geminiThinkingConfig("gemini-3.5-flash-lite-preview"), { thinkingLevel: "minimal" });
  assert.deepEqual(geminiThinkingConfig("gemini-3.5-flash-preview"), { thinkingBudget: 0 });
  assert.equal(geminiThinkingConfig("gemini-3.5-flash2"), undefined);
  assert.equal(geminiThinkingConfig("gemini-3.5-flash-lite2"), undefined);
  assert.equal(geminiThinkingConfig("gemini-3.6-flash"), undefined);
  assert.equal(geminiThinkingConfig("gemini-3.6-flash-lite"), undefined);
  assert.equal(geminiThinkingConfig("gemini-flash-latest"), undefined);
  assert.equal(geminiThinkingConfig("gemini-flash-lite-latest"), undefined);
  assert.deepEqual(geminiThinkingConfig("GEMINI-3.5-FLASH-LITE"), { thinkingLevel: "minimal" });
  assert.deepEqual(geminiThinkingConfig("Gemini-2.5-Flash"), { thinkingBudget: 0 });
  assert.equal(geminiThinkingConfig(""), undefined);
});

// ---------------------------------------------------------------------------
// S13 fix-b item 3: Gemini usage metering (usageMetadata -> the same onUsage path Ollama uses)
// ---------------------------------------------------------------------------

import { GeminiGroundedAnswerer as MeteredGrounded, GeminiProvider as MeteredGemini, loadGeminiPrice, loadGroundedAnswerer as loadMeteredGrounded, type OllamaActualUsage } from "../src/index.js";

const usageBody = (usage: unknown, text: unknown = { answer: "ok" }) => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: typeof text === "string" ? text : JSON.stringify(text) }] } }], ...(usage === undefined ? {} : { usageMetadata: usage }) }), { status: 200 });

test("S13 fix-b: GeminiProvider reports usageMetadata through onUsage (tokens, thoughts counted as output, usd only with a configured price)", async () => {
  const seen: OllamaActualUsage[] = [];
  const g = new MeteredGemini({
    model: "gemini-synth-flash", apiKey: "k",
    fetchImpl: (async () => usageBody({ promptTokenCount: 1000, candidatesTokenCount: 200, thoughtsTokenCount: 50 })) as unknown as typeof fetch,
    onUsage: (u) => seen.push(u),
    price: { inputUsdPerMTok: 0.5, outputUsdPerMTok: 2 },
  });
  assert.deepEqual(await g.generate({ skillName: "d", skillPrompt: "P", outputSchema: OutSchema, input: { q: 1 } }), { answer: "ok" });
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.actual, "reported"); assert.equal(seen[0]!.inputTokens, 1000); assert.equal(seen[0]!.outputTokens, 250);
  assert.ok(Math.abs(seen[0]!.usd! - (1000 * 0.5 + 250 * 2) / 1e6) < 1e-12);
  assert.equal(seen[0]!.model, "gemini-synth-flash");
  // No price configured: tokens still reported, no invented dollar figure.
  const free: OllamaActualUsage[] = [];
  await new MeteredGemini({ model: "m", apiKey: "k", fetchImpl: (async () => usageBody({ promptTokenCount: 3, candidatesTokenCount: 4 })) as unknown as typeof fetch, onUsage: (u) => free.push(u) })
    .generate({ skillName: "d", skillPrompt: "P", outputSchema: OutSchema, input: {} });
  assert.equal(free[0]!.actual, "reported"); assert.equal(free[0]!.usd, undefined);
});

test("S13 fix-b: missing, malformed or half usageMetadata is 'unreported'; a throwing hook never fails the call; usage is reported even when the reply is unusable", async () => {
  for (const bad of [undefined, {}, { promptTokenCount: 5 }, { promptTokenCount: -1, candidatesTokenCount: 2 }, { promptTokenCount: "5", candidatesTokenCount: 2 }, { promptTokenCount: 1.5, candidatesTokenCount: 2 }]) {
    const seen: OllamaActualUsage[] = [];
    await new MeteredGemini({ model: "m", apiKey: "k", fetchImpl: (async () => usageBody(bad)) as unknown as typeof fetch, onUsage: (u) => seen.push(u) })
      .generate({ skillName: "d", skillPrompt: "P", outputSchema: OutSchema, input: {} });
    assert.equal(seen.length, 1); assert.equal(seen[0]!.actual, "unreported"); assert.equal(seen[0]!.inputTokens, undefined);
  }
  const ok = await new MeteredGemini({ model: "m", apiKey: "k", fetchImpl: (async () => usageBody({ promptTokenCount: 1, candidatesTokenCount: 1 })) as unknown as typeof fetch, onUsage: () => { throw new Error("ledger down"); } })
    .generate({ skillName: "d", skillPrompt: "P", outputSchema: OutSchema, input: {} });
  assert.deepEqual(ok, { answer: "ok" });
  const spent: OllamaActualUsage[] = [];
  await assert.rejects(new MeteredGemini({ model: "m", apiKey: "k", fetchImpl: (async () => usageBody({ promptTokenCount: 9, candidatesTokenCount: 9 }, "not json")) as unknown as typeof fetch, onUsage: (u) => spent.push(u) })
    .generate({ skillName: "d", skillPrompt: "P", outputSchema: OutSchema, input: {} }));
  assert.equal(spent.length, 1, "tokens were spent even though the reply was unusable");
});

test("S13 fix-b: the grounded Gemini answerer reports usageMetadata through onUsage too", async () => {
  const seen: OllamaActualUsage[] = [];
  const a = new MeteredGrounded({
    model: "gemini-test", apiKey: GKEY,
    fetchImpl: fakeFetch({ ...okBody(), usageMetadata: { promptTokenCount: 700, candidatesTokenCount: 120 } }),
    onUsage: (u) => seen.push(u), price: { inputUsdPerMTok: 1, outputUsdPerMTok: 4 },
  });
  await a.answer({ question: "q", systemPrompt: "SYS" });
  assert.equal(seen.length, 1);
  assert.deepEqual([seen[0]!.actual, seen[0]!.inputTokens, seen[0]!.outputTokens], ["reported", 700, 120]);
  assert.ok(Math.abs(seen[0]!.usd! - (700 + 480) / 1e6) < 1e-12);
  const viaLoader: OllamaActualUsage[] = [];
  const loaded = loadMeteredGrounded({ VC_GROUNDING: "gemini", GEMINI_API_KEY: GKEY }, { fetchImpl: fakeFetch({ ...okBody(), usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 } }), onUsage: (u) => viaLoader.push(u) })!;
  await loaded.answer({ question: "q", systemPrompt: "SYS" });
  assert.equal(viaLoader.length, 1);
});

test("S13 fix-b: createProvider hands deps.onUsage to a gemini provider; loadGeminiPrice parses an optional price and refuses a bad one", async () => {
  const seen: OllamaActualUsage[] = [];
  const p = createProvider({ provider: "gemini", model: "gemini-synth-flash", apiKey: "k" }, { onUsage: (u) => seen.push(u), fetchImpl: (async () => usageBody({ promptTokenCount: 2, candidatesTokenCount: 3 })) as unknown as typeof fetch });
  await p.generate({ skillName: "d", skillPrompt: "P", outputSchema: OutSchema, input: {} });
  assert.equal(seen.length, 1);
  assert.equal(loadGeminiPrice({}), undefined);
  assert.deepEqual(loadGeminiPrice({ GEMINI_PRICE_USD_PER_MTOK: "0.3, 2.5" }), { inputUsdPerMTok: 0.3, outputUsdPerMTok: 2.5 });
  for (const bad of ["x", "1", "1,2,3", "0,1", "-1,2", "a,b"]) assert.throws(() => loadGeminiPrice({ GEMINI_PRICE_USD_PER_MTOK: bad }), /GEMINI_PRICE_USD_PER_MTOK/);
});

// ---------------------------------------------------------------------------
// S13 fix-b item 3: per-role models are wired (withRoleModels / RoleRoutedProvider)
// ---------------------------------------------------------------------------

import { RoleRoutedProvider, ROLE_SKILLS, withRoleModels } from "../src/index.js";

test("S13 fix-b: withRoleModels returns the base provider itself when no listed role key is set (behaviour unchanged, blank keys count as unset)", () => {
  const base = new MockProvider({ model: "base-model", responses: {} });
  const env = { VC_LLM_PROVIDER: "mock", VC_LLM_MODEL: "base-model" };
  assert.equal(withRoleModels(env, base, ["summary", "answer", "router"]), base);
  assert.equal(withRoleModels({ ...env, VC_MODEL_ANSWER: "" }, base, ["answer"]), base);
  // a key for a role that is not listed does not switch anything
  assert.equal(withRoleModels({ ...env, VC_MODEL_SUMMARY: "sum-model" }, base, ["answer", "router"]), base);
});

test("S13 fix-b: withRoleModels sends only the keyed role's skills to its own model; everything else stays on the base", async () => {
  const base = new MockProvider({ model: "base-model", responses: { "lang-detect": { answer: "base" }, "kb-answer": { answer: "from-role" } } });
  const env = { VC_LLM_PROVIDER: "mock", VC_LLM_MODEL: "base-model", VC_MODEL_ANSWER: "ans-model" };
  const routed = withRoleModels(env, base, ["answer", "router"], { mockResponses: { "kb-answer": { answer: "from-role" } } });
  assert.ok(routed instanceof RoleRoutedProvider);
  for (const skill of ROLE_SKILLS.answer) assert.equal((routed as RoleRoutedProvider).providerFor(skill).model, "ans-model");
  for (const skill of [...ROLE_SKILLS.router, ...ROLE_SKILLS.summary, "concern-classifier", "something-else"]) assert.equal((routed as RoleRoutedProvider).providerFor(skill), base);
  assert.deepEqual(await routed.generate({ skillName: "kb-answer", skillPrompt: "P", outputSchema: OutSchema, input: {} }), { answer: "from-role" });
  assert.deepEqual(await routed.generate({ skillName: "lang-detect", skillPrompt: "P", outputSchema: OutSchema, input: {} }), { answer: "base" });
  assert.equal(routed.model, "base-model");
});

test("S13 fix-b: withRoleModels refuses a bad role model id naming the key, never the value", () => {
  const base = new MockProvider({ model: "base-model", responses: {} });
  assert.throws(() => withRoleModels({ VC_LLM_PROVIDER: "mock", VC_MODEL_ROUTER: "bad id//x" }, base, ["router"]), (e: unknown) => /VC_MODEL_ROUTER/.test(String(e)) && !/bad id/.test(String(e)));
  assert.throws(() => withRoleModels({ VC_MODEL_ROUTER: "ok-model" }, base, ["router"]), /VC_LLM_PROVIDER/);
});
