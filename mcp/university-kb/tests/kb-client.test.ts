/**
 * T-026 (B21 KB client, B2 citations). Tests exercise `createKnowledgeBaseClient` against a REAL
 * local HTTP server (`fakeKb.ts`), never a mocked `fetch` and never the real D:/KnowledgeBase
 * (contract B8/B14: offline, real round trip, no fabricated pass). Every falsifiable claim below
 * is exercised by falsification in the manifest (qa/manifests/t-026-kb-client.md).
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  createKnowledgeBaseClient,
  createAnonymousKbClient,
  loadKbConfigFromEnv,
  resetKbBreakers,
  KB_ASK_TIMEOUT_CAP_MS,
  KB_SEARCH_TIMEOUT_CAP_MS,
  KB_ROUTE_TIMEOUT_CAP_MS,
  KB_ROUTE_SOFT_SKIP_MS,
  KB_BREAKER_DEFAULT_FAILS,
  KB_BREAKER_DEFAULT_COOLDOWN_MS,
  KB_DEFAULT_TIMEOUT_MS,
  type KbBreakerEvent,
} from "../src/kb-client.js";
import { startFakeKb, validAskResponseWithCitations, validAskResponseWithoutCitations } from "./fakeKb.js";
import { readFixture } from "./kb-fixture.js";

// The breaker is process-wide per base URL: every test starts closed.
beforeEach(() => resetKbBreakers());

test("ok: a valid response with internal citations is carried through verbatim, answer + citations + verdict/reason/scored all present", async () => {
  const server = await startFakeKb(() => ({ status: 200, body: JSON.stringify(validAskResponseWithCitations()) }));
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "test-key-1" });
    const result = await client.ask("what courses does Testland offer?");
    assert.equal(result.status, "ok");
    if (result.status !== "ok") throw new Error("unreachable");
    assert.equal(result.answer, "The University of Testland offers a 4-year BSc in Computer Science.");
    assert.deepEqual(result.citations, {
      internal: [{ node_id: "course:testland-cs", evidence: { sessionRef: "session-1" } }],
      web: [],
    });
    assert.equal(result.verdict, "answered");
    assert.equal(result.reason, "found a matching course node in the tree index");
    assert.deepEqual(result.scored, [{ node_id: "course:testland-cs", score: 0.92, reason: "direct name match" }]);
    assert.equal(result.webUsed, false);
    assert.equal(result.insufficientCoverage, false);
    assert.equal(result.auditLog.length, 1);
  } finally {
    await server.close();
  }
});

test("ok: web-only citations (empty internal, non-empty web) still count as cited", async () => {
  const server = await startFakeKb(() => ({
    status: 200,
    body: JSON.stringify(
      validAskResponseWithCitations({ sources: { internal: [], web: [{ url: "https://example.edu/cs" }] } }),
    ),
  }));
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "test-key-1" });
    const result = await client.ask("q");
    assert.equal(result.status, "ok");
  } finally {
    await server.close();
  }
});

test("request shape: POST /ask, Bearer <key> header, JSON body { query }", async () => {
  let capturedMethod: string | undefined;
  let capturedUrl: string | undefined;
  let capturedAuth: string | undefined;
  let capturedBody: unknown;
  const server = await startFakeKb((req) => {
    capturedMethod = req.method;
    capturedUrl = req.url;
    capturedAuth = req.headers["authorization"] as string | undefined;
    capturedBody = JSON.parse(req.body);
    return { status: 200, body: JSON.stringify(validAskResponseWithCitations()) };
  });
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "test-key-shape" });
    await client.ask("hello");
    assert.equal(capturedMethod, "POST");
    assert.equal(capturedUrl, "/ask");
    assert.equal(capturedAuth, "Bearer test-key-shape");
    assert.deepEqual(capturedBody, { query: "hello" });
  } finally {
    await server.close();
  }
});

test("uncited: a verdict-correct answer with zero citations in BOTH sources.internal and sources.web is treated as unavailable, never passed on as an answer", async () => {
  const server = await startFakeKb(() => ({
    status: 200,
    body: JSON.stringify(validAskResponseWithoutCitations({ verdict: "correct" })),
  }));
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "test-key-1" });
    const result = await client.ask("q");
    assert.equal(result.status, "unavailable");
    if (result.status !== "unavailable") throw new Error("unreachable");
    assert.equal(result.reason, "uncited");
  } finally {
    await server.close();
  }
});

test("outage: HTTP 401 is unavailable/unauthorized", async () => {
  const server = await startFakeKb(() => ({ status: 401, body: JSON.stringify({ error: "unauthorized" }) }));
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "bad-key" });
    const result = await client.ask("q");
    assert.equal(result.status, "unavailable");
    if (result.status !== "unavailable") throw new Error("unreachable");
    assert.equal(result.reason, "unauthorized");
  } finally {
    await server.close();
  }
});

test("outage: HTTP 403 is unavailable/unauthorized", async () => {
  const server = await startFakeKb(() => ({ status: 403, body: JSON.stringify({ error: "forbidden" }) }));
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "no-scope-key" });
    const result = await client.ask("q");
    assert.equal(result.status, "unavailable");
    if (result.status !== "unavailable") throw new Error("unreachable");
    assert.equal(result.reason, "unauthorized");
  } finally {
    await server.close();
  }
});

test("outage: HTTP 503 (5xx) is unavailable/http_error", async () => {
  const server = await startFakeKb(() => ({ status: 503, body: JSON.stringify({ error: "unavailable" }) }));
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "test-key-1" });
    const result = await client.ask("q");
    assert.equal(result.status, "unavailable");
    if (result.status !== "unavailable") throw new Error("unreachable");
    assert.equal(result.reason, "http_error");
  } finally {
    await server.close();
  }
});

test("outage: malformed (non-JSON) response body is unavailable/malformed_response", async () => {
  const server = await startFakeKb(() => ({ status: 200, body: "this is not json {{{" }));
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "test-key-1" });
    const result = await client.ask("q");
    assert.equal(result.status, "unavailable");
    if (result.status !== "unavailable") throw new Error("unreachable");
    assert.equal(result.reason, "malformed_response");
  } finally {
    await server.close();
  }
});

test("outage: schema-invalid response (valid JSON, wrong shape -- missing required fields) is unavailable/invalid_schema", async () => {
  const server = await startFakeKb(() => ({ status: 200, body: JSON.stringify({ hello: "world" }) }));
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "test-key-1" });
    const result = await client.ask("q");
    assert.equal(result.status, "unavailable");
    if (result.status !== "unavailable") throw new Error("unreachable");
    assert.equal(result.reason, "invalid_schema");
  } finally {
    await server.close();
  }
});

test("outage: a real network error (nothing listening) is unavailable/network_error", async () => {
  // Port 1 -- a client may attempt to connect to any port; nothing listens here, so the OS refuses the connection (a real network failure, not a mock).
  const client = createKnowledgeBaseClient({ baseUrl: "http://127.0.0.1:1", apiKey: "test-key-1", timeoutMs: 2000 });
  const result = await client.ask("q");
  assert.equal(result.status, "unavailable");
  if (result.status !== "unavailable") throw new Error("unreachable");
  assert.equal(result.reason, "network_error");
});

test("outage: the server hangs past the client's configured timeout -- unavailable/timeout", async () => {
  const server = await startFakeKb(() => ({
    status: 200,
    body: JSON.stringify(validAskResponseWithCitations()),
    delayMs: 300,
  }));
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "test-key-1", timeoutMs: 50 });
    const start = Date.now();
    const result = await client.ask("q");
    const elapsed = Date.now() - start;
    assert.equal(result.status, "unavailable");
    if (result.status !== "unavailable") throw new Error("unreachable");
    assert.equal(result.reason, "timeout");
    assert.ok(elapsed < 300, `expected the client to abort near its 50ms timeout, not wait out the 300ms server delay (took ${elapsed}ms)`);
  } finally {
    await server.close();
  }
});

test("default timeout constant is exported and positive", () => {
  assert.ok(KB_DEFAULT_TIMEOUT_MS > 0);
});

test("T-057: the default KB timeout is 8000 ms; /ask, /search and /route are capped at 4000 ms (route 3500 ms)", () => {
  assert.equal(KB_DEFAULT_TIMEOUT_MS, 8_000);
  assert.equal(KB_ASK_TIMEOUT_CAP_MS, 4_000);
  assert.equal(KB_SEARCH_TIMEOUT_CAP_MS, 4_000);
  assert.equal(KB_ROUTE_TIMEOUT_CAP_MS, 3_500);
});

test("T-057: the timeout covers the body read -- headers arrive at once, the body never finishes -> unavailable/timeout near the limit", async () => {
  const fetchImpl = (async (_url: string, init: { signal: AbortSignal }) => ({
    ok: true,
    status: 200,
    json: () => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))),
  })) as unknown as typeof fetch;
  const client = createKnowledgeBaseClient({ baseUrl: "http://kb.invalid", apiKey: "k", timeoutMs: 60, fetchImpl });
  const start = Date.now();
  const result = await client.search("q");
  assert.equal(result.status, "unavailable");
  if (result.status !== "unavailable") throw new Error("unreachable");
  assert.equal(result.reason, "timeout");
  assert.ok(Date.now() - start < 1000);
});

test("T-057: a body read that ignores the abort signal is still cut at the timeout", async () => {
  const fetchImpl = (async () => ({ ok: true, status: 200, json: () => new Promise(() => undefined) })) as unknown as typeof fetch;
  const client = createKnowledgeBaseClient({ baseUrl: "http://kb.invalid", apiKey: "k", timeoutMs: 60, fetchImpl });
  const result = await client.search("q");
  assert.equal(result.status, "unavailable");
  if (result.status !== "unavailable") throw new Error("unreachable");
  assert.equal(result.reason, "timeout");
});

test("T-057 r2: /search, /ask and /route are all capped below a larger configured timeout; a smaller configured one is kept", async () => {
  const fetchImpl = (async (_url: string, init: { signal: AbortSignal }) =>
    new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))))) as unknown as typeof fetch;
  const realSetTimeout = globalThis.setTimeout;
  const delays: number[] = [];
  globalThis.setTimeout = ((fn: () => void, ms?: number) => { delays.push(ms ?? 0); return realSetTimeout(fn, 5); }) as unknown as typeof setTimeout;
  try {
    const client = createKnowledgeBaseClient({ baseUrl: "http://kb.invalid", apiKey: "k", timeoutMs: 25_000, fetchImpl, breaker: { failThreshold: 100 } });
    await client.search("q");
    await client.ask("q");
    await client.route("q");
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
  assert.deepEqual(delays, [KB_SEARCH_TIMEOUT_CAP_MS, KB_ASK_TIMEOUT_CAP_MS, KB_ROUTE_TIMEOUT_CAP_MS]);
  assert.deepEqual(delays, [4_000, 4_000, 3_500]);
});

test("T-057 r2: a configured timeout below the cap is kept for both /search and /ask", async () => {
  const fetchImpl = (async (_url: string, init: { signal: AbortSignal }) =>
    new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))))) as unknown as typeof fetch;
  const realSetTimeout = globalThis.setTimeout;
  const delays: number[] = [];
  globalThis.setTimeout = ((fn: () => void, ms?: number) => { delays.push(ms ?? 0); return realSetTimeout(fn, 5); }) as unknown as typeof setTimeout;
  try {
    const client = createKnowledgeBaseClient({ baseUrl: "http://kb.invalid", apiKey: "k", timeoutMs: 3_000, fetchImpl, breaker: { failThreshold: 100 } });
    await client.search("q");
    await client.ask("q");
    await client.route("q");
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
  assert.deepEqual(delays, [3_000, 3_000, 3_000]);
});

test("loadKbConfigFromEnv: VC_KB_BASE_URL unset -> null (feature off, no client built)", () => {
  const config = loadKbConfigFromEnv({});
  assert.equal(config, null);
});

test("loadKbConfigFromEnv: VC_KB_BASE_URL set, VC_KB_API_KEY set -> a config object (never real values -- synthetic test strings only)", () => {
  const config = loadKbConfigFromEnv({ VC_KB_BASE_URL: "http://fake-kb.invalid", VC_KB_API_KEY: "synthetic-test-key" });
  assert.deepEqual(config, { baseUrl: "http://fake-kb.invalid", apiKey: "synthetic-test-key" });
});

test("loadKbConfigFromEnv: VC_KB_BASE_URL set but VC_KB_API_KEY missing -> throws rather than silently defaulting the key (B11)", () => {
  assert.throws(() => loadKbConfigFromEnv({ VC_KB_BASE_URL: "http://fake-kb.invalid" }), /VC_KB_API_KEY/);
});

// ---------------------------------------------------------------------------
// kb-breaker-route-build: circuit breaker (per base URL, in memory)
// ---------------------------------------------------------------------------
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const okSearch = () => ({ status: 200, body: JSON.stringify(readFixture("search.json")) });
const reasonOf = (r: { status: string; reason?: string }) => (r.status === "ok" ? "ok" : r.reason);

test("breaker: opens after N consecutive 5xx; while open /search, /ask and /route fail fast with circuit_open and make NO network call", async () => {
  let served = 0;
  const server = await startFakeKb(() => { served += 1; return { status: 503, body: "{}" }; });
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k", breaker: { failThreshold: 2, cooldownMs: 60_000 } });
    assert.equal(reasonOf(await client.search("q")), "http_error");
    assert.equal(reasonOf(await client.search("q")), "http_error");
    assert.equal(served, 2);
    assert.equal(reasonOf(await client.search("q")), "circuit_open");
    assert.equal(reasonOf(await client.ask("q")), "circuit_open");
    assert.equal(reasonOf(await client.route("q")), "circuit_open");
    assert.equal(served, 2, "no request reached the server while the breaker was open");
  } finally {
    await server.close();
  }
});

test("breaker: consecutive timeouts open it, and the next call returns at once instead of waiting out another timeout", async () => {
  let served = 0;
  const server = await startFakeKb(() => { served += 1; return { ...okSearch(), delayMs: 400 }; });
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k", timeoutMs: 40, breaker: { failThreshold: 2, cooldownMs: 60_000 } });
    assert.equal(reasonOf(await client.search("q")), "timeout");
    assert.equal(reasonOf(await client.search("q")), "timeout");
    const start = Date.now();
    assert.equal(reasonOf(await client.search("q")), "circuit_open");
    assert.ok(Date.now() - start < 30, `fail-fast took ${Date.now() - start}ms`);
    assert.equal(served, 2);
  } finally {
    await server.close();
  }
});

test("breaker: only CONSECUTIVE failures count -- a success in between resets the count; a 4xx is not a breaker failure", async () => {
  const script = [503, 200, 503, 400, 503];
  const server = await startFakeKb(() => {
    const status = script.shift() ?? 200;
    return status === 200 ? okSearch() : { status, body: "{}" };
  });
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k", breaker: { failThreshold: 2, cooldownMs: 60_000 } });
    for (let i = 0; i < 5; i += 1) {
      assert.notEqual(reasonOf(await client.search("q")), "circuit_open", `call ${i + 1} must still reach the network`);
    }
  } finally {
    await server.close();
  }
});

test("breaker: half-open lets exactly ONE probe through after the cooldown; success closes it", async () => {
  let healthy = false;
  let served = 0;
  const server = await startFakeKb(() => { served += 1; return healthy ? { ...okSearch(), delayMs: 100 } : { status: 503, body: "{}" }; });
  try {
    const events: KbBreakerEvent[] = [];
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k", breaker: { failThreshold: 2, cooldownMs: 80 }, onBreakerEvent: (e) => events.push(e) });
    await client.search("q");
    await client.search("q");
    assert.equal(served, 2);
    assert.equal(reasonOf(await client.search("q")), "circuit_open");
    assert.equal(served, 2, "still open inside the cooldown");

    await sleep(120);
    healthy = true;
    // Two concurrent calls after the cooldown: one is the probe, the other fails fast.
    const [p, q] = await Promise.all([client.search("q"), client.search("q")]);
    assert.deepEqual([reasonOf(p), reasonOf(q)].sort(), ["circuit_open", "ok"]);
    assert.equal(served, 3, "exactly one probe reached the server");

    // Closed again: traffic flows.
    assert.equal((await client.search("q")).status, "ok");
    assert.equal((await client.search("q")).status, "ok");
    assert.equal(served, 5);
    assert.deepEqual(events.map((e) => e.event), ["kb_breaker_open", "kb_breaker_half_open", "kb_breaker_closed"]);
  } finally {
    await server.close();
  }
});

test("breaker: a failed half-open probe re-opens it for another full cooldown (one request, then no network)", async () => {
  let served = 0;
  const server = await startFakeKb(() => { served += 1; return { status: 500, body: "{}" }; });
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k", breaker: { failThreshold: 2, cooldownMs: 80 } });
    await client.search("q");
    await client.search("q");
    await sleep(120);
    assert.equal(reasonOf(await client.search("q")), "http_error");
    assert.equal(served, 3);
    assert.equal(reasonOf(await client.search("q")), "circuit_open");
    assert.equal(served, 3);
  } finally {
    await server.close();
  }
});

test("breaker: state is per base URL and shared by every client built for that URL", async () => {
  const bad = await startFakeKb(() => ({ status: 502, body: "{}" }));
  const good = await startFakeKb(okSearch);
  try {
    const opts = { apiKey: "k", breaker: { failThreshold: 2, cooldownMs: 60_000 } };
    const one = createKnowledgeBaseClient({ baseUrl: bad.url, ...opts });
    const two = createAnonymousKbClient({ baseUrl: bad.url, ...opts });
    await one.search("q");
    await one.search("q");
    assert.equal(reasonOf(await two.search("q")), "circuit_open", "the anonymous client sees the breaker the full client opened");
    assert.equal((await createKnowledgeBaseClient({ baseUrl: good.url, ...opts }).search("q")).status, "ok", "a different KB URL is unaffected");
  } finally {
    await bad.close();
    await good.close();
  }
});

test("breaker: thresholds come from VC_KB_BREAKER_FAILS / VC_KB_BREAKER_COOLDOWN_MS when no option is given (defaults 2 / 120000)", async () => {
  const saved = { f: process.env.VC_KB_BREAKER_FAILS, c: process.env.VC_KB_BREAKER_COOLDOWN_MS };
  let served = 0;
  const server = await startFakeKb(() => { served += 1; return { status: 500, body: "{}" }; });
  try {
    process.env.VC_KB_BREAKER_FAILS = "1";
    process.env.VC_KB_BREAKER_COOLDOWN_MS = "60";
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k" });
    await client.search("q");
    assert.equal(reasonOf(await client.search("q")), "circuit_open");
    assert.equal(served, 1, "opened after ONE failure (env VC_KB_BREAKER_FAILS=1)");
    await sleep(100);
    await client.search("q");
    assert.equal(served, 2, "env cooldown of 60 ms elapsed, so a probe went through");

    delete process.env.VC_KB_BREAKER_FAILS;
    delete process.env.VC_KB_BREAKER_COOLDOWN_MS;
    resetKbBreakers();
    served = 0;
    const defaults = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k" });
    await defaults.search("q");
    await defaults.search("q");
    await defaults.search("q");
    assert.equal(served, 2, "default threshold is 2");
    assert.equal(KB_BREAKER_DEFAULT_FAILS, 2);
    assert.equal(KB_BREAKER_DEFAULT_COOLDOWN_MS, 120_000);
  } finally {
    if (saved.f === undefined) delete process.env.VC_KB_BREAKER_FAILS; else process.env.VC_KB_BREAKER_FAILS = saved.f;
    if (saved.c === undefined) delete process.env.VC_KB_BREAKER_COOLDOWN_MS; else process.env.VC_KB_BREAKER_COOLDOWN_MS = saved.c;
    await server.close();
  }
});

test("breaker: log lines carry only the event name, the endpoint path and a count -- never the query or any student text", async () => {
  const server = await startFakeKb(() => ({ status: 503, body: "{}" }));
  const lines: string[] = [];
  const realWarn = console.warn;
  console.warn = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  try {
    const secret = "my GPA is 3.1 and I live in Pune";
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "secret-api-key", breaker: { failThreshold: 2, cooldownMs: 60_000 } });
    await client.search(secret);
    await client.search(secret);
    await client.search(secret);
    assert.ok(lines.length >= 1, "an open event was logged");
    for (const line of lines) {
      assert.deepEqual(Object.keys(JSON.parse(line)).sort(), ["endpoint", "event", "failures"]);
      assert.ok(!line.includes("GPA") && !line.includes("Pune") && !line.includes("secret-api-key") && !line.includes("?q="), line);
    }
    assert.deepEqual(JSON.parse(lines[0]!), { event: "kb_breaker_open", endpoint: "/search", failures: 2 });
  } finally {
    console.warn = realWarn;
    await server.close();
  }
});

// ---------------------------------------------------------------------------
// kb-breaker-route-build + t057-kb-route-contract: GET /route (same hit shape, shared parser)
// ---------------------------------------------------------------------------
test("route: GET /route?q=&k= with Bearer auth, the query URL-encoded, no body", async () => {
  let seen: { method?: string; url?: string; auth?: string; body?: string } = {};
  const server = await startFakeKb((req) => {
    seen = { method: req.method, url: req.url, auth: req.headers.authorization as string, body: req.body };
    return okSearch();
  });
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "route-key" });
    const r = await client.route("scholarships in germany & fees=?", 7);
    assert.equal(r.status, "ok");
    assert.equal(seen.method, "GET");
    assert.equal(seen.auth, "Bearer route-key");
    assert.ok(!seen.body, "a GET carries no body");
    const u = new URL(seen.url ?? "", "http://x");
    assert.equal(u.pathname, "/route");
    assert.equal(u.searchParams.get("q"), "scholarships in germany & fees=?");
    assert.equal(u.searchParams.get("k"), "7");
    assert.ok(!(seen.url ?? "").includes(" "), "the query is percent/plus encoded, not raw");
  } finally {
    await server.close();
  }
});

test("route: k defaults to 5 and is clamped to 1..20", async () => {
  const ks: (string | null)[] = [];
  const server = await startFakeKb((req) => { ks.push(new URL(req.url ?? "", "http://x").searchParams.get("k")); return okSearch(); });
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k" });
    await client.route("q");
    await client.route("q", 50);
    await client.route("q", 0);
    await client.route("q", 12);
    assert.deepEqual(ks, ["5", "20", "1", "12"]);
  } finally {
    await server.close();
  }
});

test("route: 503 {error:route_timeout} is a route-only miss -- never counts toward the shared breaker, /search keeps working, /route is skipped only for the short skip", async () => {
  const seen: string[] = [];
  const server = await startFakeKb((req) => {
    seen.push(`${req.method} ${req.url?.split("?")[0]}`);
    return req.url?.startsWith("/route") ? { status: 503, body: JSON.stringify({ error: "route_timeout" }) } : okSearch();
  });
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k", breaker: { failThreshold: 1, cooldownMs: 60_000, routeSkipMs: 80 } });
    assert.equal(reasonOf(await client.route("q")), "timeout");
    assert.equal(reasonOf(await client.route("q")), "not_found", "skipped for the short skip: no network");
    assert.deepEqual(seen, ["GET /route"]);
    assert.equal((await client.search("q")).status, "ok", "failThreshold is 1: had the 503 counted, the breaker would be open now");
    await sleep(120);
    await client.route("q");
    assert.equal(seen.filter((s) => s === "GET /route").length, 2, "after the SHORT skip (not the 60 s cooldown) /route is tried again");
  } finally {
    await server.close();
  }
});

test("route: the short route-timeout skip defaults to 10 s and a route_timeout never trips the breaker over many calls", async () => {
  assert.equal(KB_ROUTE_SOFT_SKIP_MS, 10_000);
  const server = await startFakeKb((req) => (req.url?.startsWith("/route") ? { status: 503, body: JSON.stringify({ error: "route_timeout" }) } : okSearch()));
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k", breaker: { failThreshold: 1, cooldownMs: 60_000, routeSkipMs: 1 } });
    for (let i = 0; i < 4; i += 1) { await client.route("q"); await sleep(5); }
    assert.equal((await client.search("q")).status, "ok");
  } finally {
    await server.close();
  }
});

test("route: any OTHER 503 (no route_timeout body) still counts as a real 5xx failure toward the breaker", async () => {
  const server = await startFakeKb((req) => (req.url?.startsWith("/route") ? { status: 503, body: JSON.stringify({ error: "overloaded" }) } : okSearch()));
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k", breaker: { failThreshold: 1, cooldownMs: 60_000 } });
    assert.equal(reasonOf(await client.route("q")), "http_error");
    assert.equal(reasonOf(await client.search("q")), "circuit_open");
  } finally {
    await server.close();
  }
});

test("route: a /route body goes through the SAME hit parser as /search -- null turn/session and mismatched ids are dropped identically", async () => {
  const server = await startFakeKb((req) => (req.url?.startsWith("/route") || req.url?.startsWith("/search") ? okSearch() : { status: 404, body: "{}" }));
  const bad = await startFakeKb(() => ({ status: 200, body: JSON.stringify({ nope: true }) }));
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k" });
    const viaSearch = await client.search("q");
    const viaRoute = await client.route("q");
    assert.equal(viaRoute.status, "ok");
    assert.deepEqual(viaRoute, viaSearch, "identical parse result");
    if (viaRoute.status === "ok") {
      assert.deepEqual(viaRoute.hits.map((h) => h.turnId), ["t-sem-1", "t-wa-1", "t-rec-9"]);
      assert.equal(viaRoute.dropped, 2, "the null-turn hit and the null-session hit are dropped, as for /search");
    }
    assert.equal(reasonOf(await createKnowledgeBaseClient({ baseUrl: bad.url, apiKey: "k" }).route("q")), "invalid_schema");
  } finally {
    await server.close();
    await bad.close();
  }
});

for (const status of [404, 405, 501]) {
  test(`route: HTTP ${status} is not_found and marks /route unsupported for the cooldown (no network on the next call); /search is unaffected`, async () => {
    const seen: string[] = [];
    const server = await startFakeKb((req) => {
      seen.push(`${req.method} ${req.url?.split("?")[0]}`);
      return req.url?.startsWith("/route") ? { status, body: "{}" } : okSearch();
    });
    try {
      const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k", breaker: { failThreshold: 2, cooldownMs: 100 } });
      assert.equal(reasonOf(await client.route("q")), "not_found");
      assert.equal(reasonOf(await client.route("q")), "not_found");
      assert.deepEqual(seen, ["GET /route"], "the second route call made no request");
      assert.equal((await client.search("q")).status, "ok");
      await sleep(140);
      await client.route("q");
      assert.equal(seen.filter((s) => s === "GET /route").length, 2, "after the cooldown /route is tried again");
    } finally {
      await server.close();
    }
  });
}

test("route: a 404 does not count toward the breaker (the server is alive); repeated route 404s never open it", async () => {
  const server = await startFakeKb((req) => (req.url?.startsWith("/route") ? { status: 404, body: "{}" } : okSearch()));
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k", breaker: { failThreshold: 1, cooldownMs: 30 } });
    for (let i = 0; i < 4; i += 1) {
      await client.route("q");
      await sleep(40);
    }
    assert.equal((await client.search("q")).status, "ok");
  } finally {
    await server.close();
  }
});

test("route: a timeout is cut at the configured/capped limit and /route is then skipped for the cooldown", async () => {
  let routeCalls = 0;
  const server = await startFakeKb((req) => {
    if (req.url?.startsWith("/route")) { routeCalls += 1; return { ...okSearch(), delayMs: 400 }; }
    return okSearch();
  });
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k", timeoutMs: 40, breaker: { failThreshold: 5, cooldownMs: 60_000 } });
    assert.equal(reasonOf(await client.route("q")), "timeout");
    assert.equal(reasonOf(await client.route("q")), "not_found");
    assert.equal(routeCalls, 1);
  } finally {
    await server.close();
  }
});

test("route: 401/403 (a key without the route scope) is skipped for the cooldown too, not paid every turn", async () => {
  let routeCalls = 0;
  const server = await startFakeKb(() => { routeCalls += 1; return { status: 403, body: "{}" }; });
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k" });
    assert.equal(reasonOf(await client.route("q")), "unauthorized");
    await client.route("q");
    assert.equal(routeCalls, 1);
  } finally {
    await server.close();
  }
});

test("route: with the breaker open /route fails fast with circuit_open and no network", async () => {
  let served = 0;
  const server = await startFakeKb(() => { served += 1; return { status: 500, body: "{}" }; });
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k", breaker: { failThreshold: 1, cooldownMs: 60_000 } });
    await client.search("q");
    assert.equal(reasonOf(await client.route("q")), "circuit_open");
    assert.equal(served, 1);
  } finally {
    await server.close();
  }
});
