/**
 * T-026 (B21 KB client, B2 citations). Tests exercise `createKnowledgeBaseClient` against a REAL
 * local HTTP server (`fakeKb.ts`), never a mocked `fetch` and never the real D:/KnowledgeBase
 * (contract B8/B14: offline, real round trip, no fabricated pass). Every falsifiable claim below
 * is exercised by falsification in the manifest (qa/manifests/t-026-kb-client.md).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createKnowledgeBaseClient,
  loadKbConfigFromEnv,
  KB_DEFAULT_TIMEOUT_MS,
} from "../src/kb-client.js";
import { startFakeKb, validAskResponseWithCitations, validAskResponseWithoutCitations } from "./fakeKb.js";

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

test("uncited: an answer with zero citations in BOTH sources.internal and sources.web is treated as unavailable, never passed on as an answer", async () => {
  const server = await startFakeKb(() => ({
    status: 200,
    body: JSON.stringify(validAskResponseWithoutCitations()),
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
