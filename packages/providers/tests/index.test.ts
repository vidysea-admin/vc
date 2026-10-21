import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  ModelOutputSchemaError,
  MockProvider,
  GeminiProvider,
  LiteLlmProvider,
  RulesProvider,
  createProvider,
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
  GroundingConfigError,
  GroundingFailedError,
  GroundingHttpError,
  GROUNDING_MAX_SOURCES,
  loadGroundedAnswerer,
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
  assert.equal(loadGroundedAnswerer({ VC_GROUNDING: "gemini", GEMINI_API_KEY: GKEY, VC_GROUNDING_MODEL: "gemini-x" })?.model, "gemini-x");
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
