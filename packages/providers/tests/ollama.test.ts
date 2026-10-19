/**
 * P1 U13b prep (D-100): OllamaProvider + VC_REAL_MODEL selection. MOCKED fetch only: no network
 * call, no paid call (B13). Asserts on what the adapter put on the wire and what it did with the
 * response, not just that the object constructs (B14).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import { z } from "zod";
import {
  GeminiProvider,
  ModelOutputSchemaError,
  OllamaAbortedError,
  OllamaHttpError,
  OllamaMalformedResponseError,
  OllamaNetworkError,
  OllamaProvider,
  OllamaRefusedError,
  OllamaTimeoutError,
  OLLAMA_DEFAULT_BASE_URL,
  OLLAMA_PRICE_TABLE_USD_PER_MTOK,
  createProvider,
  loadProviderConfig,
  parseRealModel,
  prepareOllamaProvider,
  type OllamaRequestEstimate,
} from "../src/index.js";

const OutSchema = z.object({ answer: z.string().min(1) });
const SECRET = "ollama-secret-key-xyz";
const PRICE = { inputUsdPerMTok: 1, outputUsdPerMTok: 4 };

interface Captured {
  url: string;
  init: RequestInit;
}

function mockFetch(respond: (cap: Captured) => Response | Promise<Response>): { fetchImpl: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const cap = { url: String(url), init: init ?? {} };
    calls.push(cap);
    return respond(cap);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const okChat = (content: unknown) =>
  new Response(JSON.stringify({ message: { role: "assistant", content: typeof content === "string" ? content : JSON.stringify(content) }, done: true }), { status: 200 });

function provider(fetchImpl: typeof fetch, extra: Partial<ConstructorParameters<typeof OllamaProvider>[0]> = {}): OllamaProvider {
  return new OllamaProvider({ model: "glm-5.3-flash", apiKey: SECRET, price: PRICE, fetchImpl, ...extra });
}
const req = (extra: Record<string, unknown> = {}) => ({
  skillName: "s",
  skillPrompt: "SYSTEM PROMPT",
  outputSchema: OutSchema,
  input: { q: "hello" },
  ...extra,
});

test("request shape: POST {base}/api/chat, Bearer key, model, system+user messages, stream off, JSON format", async () => {
  const { fetchImpl, calls } = mockFetch(() => okChat({ answer: "hi" }));
  const out = await provider(fetchImpl).generate(req());
  assert.deepEqual(out, { answer: "hi" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, `${OLLAMA_DEFAULT_BASE_URL}/api/chat`);
  assert.equal(calls[0]!.init.method, "POST");
  const headers = calls[0]!.init.headers as Record<string, string>;
  assert.equal(headers["authorization"], `Bearer ${SECRET}`);
  const body = JSON.parse(String(calls[0]!.init.body));
  assert.equal(body.model, "glm-5.3-flash");
  assert.equal(body.stream, false);
  assert.equal(body.format, "json");
  assert.equal(typeof body.options.num_predict, "number");
  assert.deepEqual(body.messages, [
    { role: "system", content: "SYSTEM PROMPT" },
    { role: "user", content: JSON.stringify({ q: "hello" }) },
  ]);
});

test("custom base URL is used and a trailing slash is tolerated", async () => {
  const { fetchImpl, calls } = mockFetch(() => okChat({ answer: "x" }));
  await provider(fetchImpl, { baseUrl: "https://proxy.example/" }).generate(req());
  assert.equal(calls[0]!.url, "https://proxy.example/api/chat");
});

test("response parsing: schema-invalid output -> ModelOutputSchemaError; non-JSON content / empty / bad body -> malformed", async () => {
  await assert.rejects(provider(mockFetch(() => okChat({ answer: "" })).fetchImpl).generate(req()), ModelOutputSchemaError);
  await assert.rejects(provider(mockFetch(() => okChat("not json at all")).fetchImpl).generate(req()), OllamaMalformedResponseError);
  await assert.rejects(provider(mockFetch(() => new Response(JSON.stringify({ message: {} }), { status: 200 })).fetchImpl).generate(req()), OllamaMalformedResponseError);
  await assert.rejects(provider(mockFetch(() => new Response("<html>", { status: 200 })).fetchImpl).generate(req()), OllamaMalformedResponseError);
});

test("error path: non-2xx -> OllamaHttpError carrying the status; network failure -> OllamaNetworkError; neither leaks the key", async () => {
  const http = await provider(mockFetch(() => new Response("nope", { status: 429 })).fetchImpl)
    .generate(req())
    .then(
      () => assert.fail("must reject"),
      (e: unknown) => e,
    );
  assert.ok(http instanceof OllamaHttpError);
  assert.equal((http as OllamaHttpError).status, 429);
  assert.ok(!String((http as Error).message).includes(SECRET));

  const net = await provider(
    mockFetch(() => {
      throw new TypeError("fetch failed");
    }).fetchImpl,
  )
    .generate(req())
    .then(
      () => assert.fail("must reject"),
      (e: unknown) => e,
    );
  assert.ok(net instanceof OllamaNetworkError);
  assert.ok(!String((net as Error).message).includes(SECRET));
});

test("timeout path: a hung request is aborted and reported as OllamaTimeoutError", async () => {
  const { fetchImpl } = mockFetch(
    (cap) =>
      new Promise<Response>((_, reject) => {
        (cap.init.signal as AbortSignal).addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      }),
  );
  await assert.rejects(provider(fetchImpl, { timeoutMs: 20 }).generate(req()), OllamaTimeoutError);
});

test("caller signal: already-aborted sends nothing; mid-flight abort is OllamaAbortedError, not a timeout", async () => {
  const pre = new AbortController();
  pre.abort();
  const a = mockFetch(() => okChat({ answer: "x" }));
  await assert.rejects(provider(a.fetchImpl).generate(req({ signal: pre.signal })), OllamaAbortedError);
  assert.equal(a.calls.length, 0);

  const mid = new AbortController();
  const b = mockFetch(
    (cap) =>
      new Promise<Response>((_, reject) => {
        (cap.init.signal as AbortSignal).addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        setTimeout(() => mid.abort(), 5);
      }),
  );
  await assert.rejects(provider(b.fetchImpl, { timeoutMs: 5_000 }).generate(req({ signal: mid.signal })), OllamaAbortedError);
});

test("the key never appears in toString / JSON / inspect output", () => {
  const p = provider(mockFetch(() => okChat({ answer: "x" })).fetchImpl);
  for (const text of [p.toString(), JSON.stringify(p), inspect(p, { depth: 5 })]) assert.ok(!text.includes(SECRET), text);
});

test("constructor refuses a missing key and a non-positive or non-finite price (never assumes zero)", () => {
  const f = mockFetch(() => okChat({})).fetchImpl;
  assert.throws(() => new OllamaProvider({ model: "m", apiKey: "", price: PRICE, fetchImpl: f }), OllamaRefusedError);
  for (const bad of [{ inputUsdPerMTok: 0, outputUsdPerMTok: 1 }, { inputUsdPerMTok: 1, outputUsdPerMTok: 0 }, { inputUsdPerMTok: NaN, outputUsdPerMTok: 1 }, { inputUsdPerMTok: -1, outputUsdPerMTok: 1 }]) {
    assert.throws(() => new OllamaProvider({ model: "m", apiKey: "k", price: bad, fetchImpl: f }), OllamaRefusedError);
  }
});

test("budget: beforeRequest gets an upper-bound estimate BEFORE fetch; a throw there means NO request is sent", async () => {
  const seen: OllamaRequestEstimate[] = [];
  const ok = mockFetch(() => okChat({ answer: "x" }));
  await provider(ok.fetchImpl, {
    maxOutputTokens: 1000,
    beforeRequest: (e) => {
      assert.equal(ok.calls.length, 0, "charged before the request is sent");
      seen.push(e);
    },
  }).generate(req());
  const promptChars = "SYSTEM PROMPT".length + JSON.stringify({ q: "hello" }).length;
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.estimatedInputTokens, promptChars);
  assert.equal(seen[0]!.maxOutputTokens, 1000);
  assert.ok(Math.abs(seen[0]!.estimatedCostUsd - (promptChars * 1 + 1000 * 4) / 1e6) < 1e-12);

  class Stop extends Error {}
  const blocked = mockFetch(() => okChat({ answer: "x" }));
  await assert.rejects(
    provider(blocked.fetchImpl, {
      beforeRequest: () => {
        throw new Stop("budget");
      },
    }).generate(req()),
    Stop,
  );
  assert.equal(blocked.calls.length, 0);
});

test("authorization preflight refusal sends nothing and charges nothing", async () => {
  let charged = 0;
  const f = mockFetch(() => okChat({ answer: "x" }));
  await assert.rejects(
    provider(f.fetchImpl, { beforeRequest: () => void charged++ }).generate(
      req({
        preflight: async () => {
          throw new Error("denied");
        },
      }),
    ),
    /authorization/i,
  );
  assert.equal(f.calls.length, 0);
  assert.equal(charged, 0);
});

test("selection: unset / empty / gemini keep the default (no ollama provider); ollama:<id> selects it; junk is refused", () => {
  assert.deepEqual(parseRealModel({}), { backend: "gemini" });
  assert.deepEqual(parseRealModel({ VC_REAL_MODEL: "" }), { backend: "gemini" });
  assert.deepEqual(parseRealModel({ VC_REAL_MODEL: "gemini" }), { backend: "gemini" });
  assert.deepEqual(parseRealModel({ VC_REAL_MODEL: "ollama:glm-5.3-flash" }), { backend: "ollama", model: "glm-5.3-flash" });
  for (const bad of ["ollama:", "openai:gpt", "glm-5.3-flash"]) assert.throws(() => parseRealModel({ VC_REAL_MODEL: bad }), OllamaRefusedError);

  assert.equal(prepareOllamaProvider({}), undefined);
  assert.equal(prepareOllamaProvider({ VC_REAL_MODEL: "gemini", OLLAMA_API_KEY: SECRET }), undefined);
  // The default path is the existing factory, untouched.
  const gem = createProvider(loadProviderConfig({ VC_LLM_PROVIDER: "gemini", VC_LLM_MODEL: "gemini-x", GEMINI_API_KEY: "g" }));
  assert.ok(gem instanceof GeminiProvider);
});

test("prepareOllamaProvider: missing OLLAMA_API_KEY and unknown-price models are refused before any provider exists; key never in the message", () => {
  assert.throws(() => prepareOllamaProvider({ VC_REAL_MODEL: "ollama:glm-5.3-flash" }), /OLLAMA_API_KEY/);
  assert.throws(() => prepareOllamaProvider({ VC_REAL_MODEL: "ollama:mystery-model", OLLAMA_API_KEY: SECRET }), (e: unknown) => {
    assert.ok(e instanceof OllamaRefusedError);
    assert.match((e as Error).message, /no price/);
    assert.ok(!(e as Error).message.includes(SECRET));
    return true;
  });
  // __proto__-style ids are not "known" through the prototype chain.
  assert.throws(() => prepareOllamaProvider({ VC_REAL_MODEL: "ollama:constructor", OLLAMA_API_KEY: SECRET }), /no price/);
});

test("prepareOllamaProvider: price override env works, bad overrides are refused; table entries resolve; base URL env is honoured", async () => {
  for (const bad of ["", "1", "1,2,3", "0,1", "a,b", "-1,2", "1,Infinity"]) {
    assert.throws(() => prepareOllamaProvider({ VC_REAL_MODEL: "ollama:mystery-model", OLLAMA_API_KEY: SECRET, OLLAMA_PRICE_USD_PER_MTOK: bad }), OllamaRefusedError, bad);
  }
  for (const id of Object.keys(OLLAMA_PRICE_TABLE_USD_PER_MTOK)) {
    assert.ok(prepareOllamaProvider({ VC_REAL_MODEL: `ollama:${id}`, OLLAMA_API_KEY: SECRET }));
  }
  const { fetchImpl, calls } = mockFetch(() => okChat({ answer: "x" }));
  const make = prepareOllamaProvider(
    { VC_REAL_MODEL: "ollama:mystery-model", OLLAMA_API_KEY: SECRET, OLLAMA_PRICE_USD_PER_MTOK: "2, 8", OLLAMA_BASE_URL: "https://alt.example" },
    { fetchImpl },
  )!;
  const seen: OllamaRequestEstimate[] = [];
  const p = make((e) => void seen.push(e));
  assert.equal(p.kind, "ollama");
  assert.equal(p.model, "mystery-model");
  await p.generate(req());
  assert.equal(calls[0]!.url, "https://alt.example/api/chat");
  assert.ok(seen[0]!.estimatedCostUsd > 2048 * 8 / 1e6 - 1e-12, "uses the overridden 8 USD/MTok output price");
});
