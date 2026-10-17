/**
 * P1/U2 (plan.md U2). Criteria: spec A4 (/ask serve-rule fixtures), A15c (anonymous egress is
 * search-only and identity-free), A18 (no web answer, outage = fixed no-answer text, no KB content
 * copies), A22 tagger part (see source-kind.test.ts). Every test drives a REAL local HTTP server
 * (fakeKb.ts) and the real client; fixtures are in `kb-fixture/` (contract-shaped, derived from the
 * KnowledgeBase route code; the KB server itself is never started or called).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createUniversityKbServer } from "../src/index.js";
import {
  NO_SOURCED_ANSWER_TEXT,
  applyServeRule,
  createAnonymousKbClient,
  createKnowledgeBaseClient,
  loadAnonymousKbConfigFromEnv,
  type KbAskOk,
  type KbAskResult,
} from "../src/kb-client.js";
import { SourceKindConfigSchema } from "../src/source-kind.js";
import { createFakeDb } from "./fakes.js";
import { startFakeKb, type FakeKbRequest, type FakeKbResponse } from "./fakeKb.js";
import { FIXTURE_DIR, readFixture } from "./kb-fixture.js";

const SOURCE_KINDS = SourceKindConfigSchema.parse({
  internalSeminar: { sourceIds: ["src-sem-1"] },
  toc: { sourceIds: ["src-toc-1"] },
});

async function connectedClient(server: McpServer): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}

/** A recording fake KB serving the fixtures by route. `askFixture` picks the /ask body. */
function kbRouter(askFixture = "ask-correct.json") {
  const requests: FakeKbRequest[] = [];
  const handler = (req: FakeKbRequest): FakeKbResponse => {
    requests.push(req);
    const url = new URL(req.url ?? "/", "http://kb.local");
    const json = (body: unknown): FakeKbResponse => ({ status: 200, body: JSON.stringify(body) });
    if (req.method === "GET" && url.pathname === "/search") return json(readFixture("search.json"));
    if (req.method === "GET" && url.pathname === "/sources") return json(readFixture("sources.json"));
    if (req.method === "GET" && url.pathname === "/gaps") return json(readFixture("gaps.json"));
    if (req.method === "GET" && url.pathname === "/sessions/sess-sem-1") return json(readFixture("sessions/sess-sem-1.json"));
    if (req.method === "GET" && url.pathname.startsWith("/sessions/")) return { status: 404, body: "{}" };
    if (req.method === "POST" && url.pathname === "/ask") return json(readFixture(askFixture));
    return { status: 404, body: "{}" };
  };
  return { requests, handler };
}

function structured(result: unknown): Record<string, any> {
  return (result as { structuredContent: Record<string, any> }).structuredContent;
}

// ---------------------------------------------------------------------------
// A4 / A18: the /ask serve rule
// ---------------------------------------------------------------------------
const SERVE_CASES: Array<{ fixture: string; served: boolean; withheld?: string[] }> = [
  { fixture: "ask-correct.json", served: true },
  { fixture: "ask-web-used.json", served: false, withheld: ["verdict_not_correct", "web_used"] },
  { fixture: "ask-web-only.json", served: false, withheld: ["no_internal_sources"] },
  { fixture: "ask-fallback-failed.json", served: false, withheld: ["verdict_not_correct", "insufficient_coverage"] },
  { fixture: "ask-ambiguous.json", served: false, withheld: ["verdict_not_correct"] },
];

for (const c of SERVE_CASES) {
  test(`A4 serve rule over the real client + MCP tool: ${c.fixture} -> ${c.served ? "served" : "no_sourced_answer"}`, async () => {
    const { handler } = kbRouter(c.fixture);
    const server = await startFakeKb(handler);
    try {
      const kb = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k" });
      const mcp = createUniversityKbServer({ db: createFakeDb().db, kb });
      const { client, cleanup } = await connectedClient(mcp);
      try {
        const result = await client.callTool({ name: "ask_knowledge_base", arguments: { query: "tuition in germany?" } });
        assert.notEqual(result.isError, true);
        const out = structured(result);
        const raw = readFixture(c.fixture) as { answer: string; reason: string };
        if (c.served) {
          assert.equal(out.status, "answered");
          assert.equal(out.answer, raw.answer);
          assert.deepEqual(out.citations.web, []);
          assert.ok(out.citations.internal.length > 0);
        } else {
          assert.equal(out.status, "no_sourced_answer");
          assert.equal(out.answer, NO_SOURCED_ANSWER_TEXT);
          assert.deepEqual(out.withheld, c.withheld);
          assert.deepEqual(out.citations, { internal: [], web: [] });
          // the generated answer and reason must not leak anywhere in the payload
          assert.equal(JSON.stringify(result).includes(raw.answer), false);
          assert.equal(JSON.stringify(result).includes(raw.reason), false);
        }
      } finally {
        await cleanup();
      }
    } finally {
      await server.close();
    }
  });
}

test("A18: sources.web never reaches a served response (stray web source on an otherwise correct answer is dropped)", async () => {
  const { handler } = kbRouter("ask-correct-with-stray-web.json");
  const server = await startFakeKb(handler);
  try {
    const kb = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k" });
    const mcp = createUniversityKbServer({ db: createFakeDb().db, kb });
    const { client, cleanup } = await connectedClient(mcp);
    try {
      const result = await client.callTool({ name: "ask_knowledge_base", arguments: { query: "q" } });
      assert.equal(structured(result).status, "answered");
      assert.deepEqual(structured(result).citations.web, []);
      assert.equal(JSON.stringify(result).includes("example.invalid"), false);
    } finally {
      await cleanup();
    }
  } finally {
    await server.close();
  }
});

function okAsk(over: Partial<KbAskOk>): KbAskOk {
  return {
    status: "ok",
    answer: "generated",
    citations: { internal: [{ node_id: "n1" }], web: [] },
    verdict: "correct",
    reason: "r",
    scored: [],
    webUsed: false,
    insufficientCoverage: false,
    auditLog: [],
    raw: {} as never,
    ...over,
  };
}

test("A4 applyServeRule matrix: only (correct, coverage ok, no web, >=1 internal source) is served", () => {
  assert.equal(applyServeRule(okAsk({})).status, "answered");
  assert.equal(applyServeRule(okAsk({ webUsed: true })).status, "no_sourced_answer");
  assert.equal(applyServeRule(okAsk({ insufficientCoverage: true })).status, "no_sourced_answer");
  assert.equal(applyServeRule(okAsk({ verdict: "ambiguous" })).status, "no_sourced_answer");
  assert.equal(applyServeRule(okAsk({ verdict: "incorrect" })).status, "no_sourced_answer");
  assert.equal(applyServeRule(okAsk({ verdict: "answered" })).status, "no_sourced_answer", "only the exact word 'correct' serves");
  assert.equal(applyServeRule(okAsk({ verdict: "Correct" })).status, "no_sourced_answer");
  assert.equal(applyServeRule(okAsk({ citations: { internal: [], web: [{ url: "https://x.invalid" }] } })).status, "no_sourced_answer");
});

test("A18: a KB outage yields the fixed no-answer text, typed unavailable, never an error payload with an answer", async () => {
  const unavailable: KbAskResult = { status: "unavailable", reason: "http_error", detail: "KbHttpError: HTTP 503" };
  const served = applyServeRule(unavailable);
  assert.equal(served.status, "unavailable");
  assert.equal(served.answer, NO_SOURCED_ANSWER_TEXT);
  assert.deepEqual(served.citations, { internal: [], web: [] });

  const kb = { ask: async () => unavailable };
  const mcp = createUniversityKbServer({ db: createFakeDb().db, kb });
  const { client, cleanup } = await connectedClient(mcp);
  try {
    const result = await client.callTool({ name: "ask_knowledge_base", arguments: { query: "q" } });
    assert.notEqual(result.isError, true);
    assert.equal(structured(result).status, "unavailable");
    assert.equal(structured(result).answer, NO_SOURCED_ANSWER_TEXT);
    assert.equal(structured(result).unavailableReason, "http_error");
  } finally {
    await cleanup();
  }
});

test("A18: no KB content copies in the repo -- every file under kb-fixture/ is a declared synthetic fixture", () => {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(FIXTURE_DIR);
  assert.ok(files.length >= 10);
  for (const f of files) {
    const parsed = JSON.parse(fs.readFileSync(f, "utf8")) as { _fixture?: string };
    assert.match(String(parsed._fixture), /^synthetic contract-shaped fixture/, `${f} must carry the synthetic marker`);
  }
});

// ---------------------------------------------------------------------------
// search_kb / get_session / kb_gaps / kb_sources over the real client
// ---------------------------------------------------------------------------
test("search_kb: GET /search?q&k with Bearer; hits with null turn/session are dropped and counted; each hit is source-kind tagged; unknown = restricted", async () => {
  const { requests, handler } = kbRouter();
  const server = await startFakeKb(handler);
  try {
    const kb = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "secret-key-1" });
    const mcp = createUniversityKbServer({ db: createFakeDb().db, kb, sourceKinds: SOURCE_KINDS });
    const { client, cleanup } = await connectedClient(mcp);
    try {
      const result = await client.callTool({ name: "search_kb", arguments: { query: "scholarships germany", k: 5 } });
      assert.notEqual(result.isError, true);
      const out = structured(result);
      assert.equal(out.status, "ok");
      assert.equal(out.dropped, 2);
      assert.deepEqual(
        out.hits.map((h: any) => [h.turnId, h.sourceKind]),
        [
          ["t-sem-1", "internal-seminar"],
          ["t-wa-1", "whatsapp"],
          ["t-rec-9", "unknown"],
        ],
      );
      const wa = out.hits[1];
      assert.equal(wa.speakerLabel, "Fixture Person A");
      assert.equal(wa.sourceId, "src-wa-1");
      assert.equal(typeof wa.text, "string");
      assert.equal(wa.sessionDate, "2026-02-01");
      const search = requests.find((r) => r.url?.startsWith("/search"));
      assert.equal(search?.method, "GET");
      assert.equal(search?.headers.authorization, "Bearer secret-key-1");
      const params = new URL(search?.url ?? "", "http://kb.local").searchParams;
      assert.equal(params.get("q"), "scholarships germany");
      assert.equal(params.get("k"), "5");
    } finally {
      await cleanup();
    }
  } finally {
    await server.close();
  }
});

test("search_kb: /sources is fetched once across calls; its path/hash/consent never appear in any tool output", async () => {
  const { requests, handler } = kbRouter();
  const server = await startFakeKb(handler);
  try {
    const kb = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k" });
    const mcp = createUniversityKbServer({ db: createFakeDb().db, kb, sourceKinds: SOURCE_KINDS });
    const { client, cleanup } = await connectedClient(mcp);
    try {
      const a = await client.callTool({ name: "search_kb", arguments: { query: "one" } });
      const b = await client.callTool({ name: "search_kb", arguments: { query: "two" } });
      const s = await client.callTool({ name: "kb_sources", arguments: {} });
      assert.equal(requests.filter((r) => r.url === "/sources").length, 2, "one for the resolver, one for the explicit kb_sources call");
      for (const r of [a, b, s]) {
        const text = JSON.stringify(r);
        assert.equal(text.includes("/private/data"), false);
        assert.equal(text.includes("h-wa-1"), false);
        assert.equal(text.includes("recordedBy"), false);
      }
      assert.deepEqual(structured(s).sources[2], { id: "src-wa-1", kind: "whatsapp-batch" });
      assert.equal(structured(s).dropped, 1);
    } finally {
      await cleanup();
    }
  } finally {
    await server.close();
  }
});

test("search_kb: with /sources down, every hit is unknown (restricted), not an error", async () => {
  const server = await startFakeKb((req) => {
    if (req.url === "/sources") return { status: 503, body: "{}" };
    return { status: 200, body: JSON.stringify(readFixture("search.json")) };
  });
  try {
    const kb = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k" });
    const mcp = createUniversityKbServer({ db: createFakeDb().db, kb, sourceKinds: SOURCE_KINDS });
    const { client, cleanup } = await connectedClient(mcp);
    try {
      const out = structured(await client.callTool({ name: "search_kb", arguments: { query: "q" } }));
      assert.equal(out.status, "ok");
      assert.deepEqual([...new Set(out.hits.map((h: any) => h.sourceKind))], ["unknown"]);
    } finally {
      await cleanup();
    }
  } finally {
    await server.close();
  }
});

const OUTAGES: Array<[string, FakeKbResponse, string]> = [
  ["HTTP 500", { status: 500, body: "{}" }, "http_error"],
  ["HTTP 401", { status: 401, body: "{}" }, "unauthorized"],
  ["HTTP 403", { status: 403, body: "{}" }, "unauthorized"],
  ["non-JSON body", { status: 200, body: "<html>" }, "malformed_response"],
  ["schema-invalid body", { status: 200, body: JSON.stringify({ nothits: 1 }) }, "invalid_schema"],
];
for (const [label, resp, reason] of OUTAGES) {
  test(`typed unavailable: search_kb on ${label} -> status unavailable (${reason}), not a thrown tool error`, async () => {
    const server = await startFakeKb(() => resp);
    try {
      const kb = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k" });
      const mcp = createUniversityKbServer({ db: createFakeDb().db, kb });
      const { client, cleanup } = await connectedClient(mcp);
      try {
        const result = await client.callTool({ name: "search_kb", arguments: { query: "q" } });
        assert.notEqual(result.isError, true);
        assert.equal(structured(result).status, "unavailable");
        assert.equal(structured(result).unavailableReason, reason);
        assert.equal(structured(result).hits, undefined);
      } finally {
        await cleanup();
      }
    } finally {
      await server.close();
    }
  });
}

test("typed unavailable: timeout and network error on every read method; the network detail never echoes the query text", async () => {
  const slow = await startFakeKb(() => ({ status: 200, body: "{}", delayMs: 300 }));
  try {
    const kb = createKnowledgeBaseClient({ baseUrl: slow.url, apiKey: "k", timeoutMs: 40 });
    for (const result of [await kb.search("q"), await kb.getSession("s"), await kb.gaps(), await kb.sources()]) {
      assert.equal(result.status, "unavailable");
      assert.equal(result.status === "unavailable" && result.reason, "timeout");
    }
  } finally {
    await slow.close();
  }
  const secret = "my-name-is-private-student-42";
  const kb = createKnowledgeBaseClient({
    baseUrl: "http://127.0.0.1:1",
    apiKey: "k",
    fetchImpl: (async (input: unknown) => {
      throw new Error(`connect ECONNREFUSED ${String(input)}`);
    }) as unknown as typeof fetch,
  });
  const r = await kb.search(secret);
  assert.equal(r.status, "unavailable");
  assert.equal(r.status === "unavailable" && r.reason, "network_error");
  assert.equal(JSON.stringify(r).includes(secret), false, "error payload must not contain user text");
});

test("get_session: GET /sessions/:id, tagged, bad turns dropped; 404 -> typed not_found (cannot be re-read, never served as sourced)", async () => {
  const { requests, handler } = kbRouter();
  const server = await startFakeKb(handler);
  try {
    const kb = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k" });
    const mcp = createUniversityKbServer({ db: createFakeDb().db, kb, sourceKinds: SOURCE_KINDS });
    const { client, cleanup } = await connectedClient(mcp);
    try {
      const ok = structured(await client.callTool({ name: "get_session", arguments: { sessionId: "sess-sem-1" } }));
      assert.equal(ok.status, "ok");
      assert.equal(ok.session.date, "2026-03-04");
      assert.equal(ok.sourceKind, "internal-seminar");
      assert.equal(ok.turns.length, 2);
      assert.equal(ok.dropped, 1);
      assert.equal(requests.find((r) => r.url === "/sessions/sess-sem-1")?.method, "GET");

      const missing = structured(await client.callTool({ name: "get_session", arguments: { sessionId: "sess-nope" } }));
      assert.equal(missing.status, "unavailable");
      assert.equal(missing.unavailableReason, "not_found");
    } finally {
      await cleanup();
    }
  } finally {
    await server.close();
  }
});

test("hostile: get_session rejects path-traversal and query-injection ids via Zod, and never calls the KB", async () => {
  const { requests, handler } = kbRouter();
  const server = await startFakeKb(handler);
  try {
    const kb = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k" });
    const mcp = createUniversityKbServer({ db: createFakeDb().db, kb });
    const { client, cleanup } = await connectedClient(mcp);
    try {
      for (const bad of ["../keys", "sess-sem-1/media", "a?b=c", "", "x y", "sess-sem-1#frag"]) {
        const result = await client.callTool({ name: "get_session", arguments: { sessionId: bad } });
        assert.equal(result.isError, true, `id ${JSON.stringify(bad)} must be rejected`);
      }
      assert.equal(requests.length, 0);
    } finally {
      await cleanup();
    }
  } finally {
    await server.close();
  }
});

test("client: a session whose returned id differs from the requested id is invalid_schema, never passed on as the requested one", async () => {
  const server = await startFakeKb(() => ({ status: 200, body: JSON.stringify(readFixture("sessions/sess-sem-1.json")) }));
  try {
    const kb = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k" });
    const r = await kb.getSession("sess-other");
    assert.equal(r.status, "unavailable");
    assert.equal(r.status === "unavailable" && r.reason, "invalid_schema");
  } finally {
    await server.close();
  }
});

test("kb_gaps: GET /gaps, rows reduced to id/kind/status/description/requestedAt/dueAt (no requestedFrom), malformed row dropped", async () => {
  const { handler } = kbRouter();
  const server = await startFakeKb(handler);
  try {
    const kb = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k" });
    const mcp = createUniversityKbServer({ db: createFakeDb().db, kb });
    const { client, cleanup } = await connectedClient(mcp);
    try {
      const out = structured(await client.callTool({ name: "kb_gaps", arguments: {} }));
      assert.equal(out.status, "ok");
      assert.equal(out.gaps.length, 2);
      assert.equal(out.dropped, 1);
      assert.deepEqual(out.gaps[0], {
        id: "gap-1",
        kind: "source-pending",
        status: "open",
        description: "Japan scholarship webinar recording not received",
        requestedAt: "2026-09-01T00:00:00Z",
        dueAt: "2026-10-01T00:00:00Z",
      });
      assert.equal(JSON.stringify(out).includes("requestedFrom"), false);
    } finally {
      await cleanup();
    }
  } finally {
    await server.close();
  }
});

test("tools/list: the read tools register only when the client has them; an ask-only client keeps the old three tools", async () => {
  const { handler } = kbRouter();
  const server = await startFakeKb(handler);
  try {
    const full = createUniversityKbServer({ db: createFakeDb().db, kb: createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k" }) });
    const a = await connectedClient(full);
    try {
      assert.deepEqual(
        (await a.client.listTools()).tools.map((t) => t.name).sort(),
        ["ask_knowledge_base", "get_course", "get_session", "kb_gaps", "kb_sources", "search_courses", "search_kb"],
      );
    } finally {
      await a.cleanup();
    }
    const askOnly = createUniversityKbServer({ db: createFakeDb().db, kb: { ask: async () => ({ status: "unavailable", reason: "timeout", detail: "x" }) } });
    const b = await connectedClient(askOnly);
    try {
      assert.deepEqual(
        (await b.client.listTools()).tools.map((t) => t.name).sort(),
        ["ask_knowledge_base", "get_course", "search_courses"],
      );
    } finally {
      await b.cleanup();
    }
  } finally {
    await server.close();
  }
});

// ---------------------------------------------------------------------------
// A15c: anonymous egress is search-only and identity-free
// ---------------------------------------------------------------------------
test("A15c: anonymous profile exposes ONLY search_kb and kb_sources, needs no Db, and the anonymous client has no ask/getSession/gaps", async () => {
  const anon = createAnonymousKbClient({ baseUrl: "http://127.0.0.1:1", apiKey: "anon" });
  assert.deepEqual(Object.keys(anon).sort(), ["search", "sources"]);
  const mcp = createUniversityKbServer({ kb: anon, profile: "anonymous" });
  const { client, cleanup } = await connectedClient(mcp);
  try {
    assert.deepEqual((await client.listTools()).tools.map((t) => t.name).sort(), ["kb_sources", "search_kb"]);
    for (const name of ["ask_knowledge_base", "get_session", "kb_gaps", "search_courses", "get_course"]) {
      const r = await client.callTool({ name, arguments: { query: "x", sessionId: "s", courseId: "c" } }).catch(() => ({ isError: true }));
      assert.equal(r.isError, true, `${name} must not be callable in anonymous profile`);
    }
  } finally {
    await cleanup();
  }
});

test("A15c: even handed a FULL client, the anonymous profile registers only search_kb and kb_sources (profile guard, not client shape)", async () => {
  const full = createKnowledgeBaseClient({ baseUrl: "http://127.0.0.1:1", apiKey: "k" });
  const mcp = createUniversityKbServer({ kb: full, profile: "anonymous" });
  const { client, cleanup } = await connectedClient(mcp);
  try {
    assert.deepEqual((await client.listTools()).tools.map((t) => t.name).sort(), ["kb_sources", "search_kb"]);
  } finally {
    await cleanup();
  }
});

test("A15c: 12 anonymous turns (hostile text included) put only GET /search?q and GET /sources on the wire; no identity headers; no /ask, no /sessions; nothing logged", async () => {
  const { requests, handler } = kbRouter();
  const server = await startFakeKb(handler);
  const logged: unknown[][] = [];
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  console.log = (...a: unknown[]) => void logged.push(a);
  console.error = (...a: unknown[]) => void logged.push(a);
  console.warn = (...a: unknown[]) => void logged.push(a);
  console.info = (...a: unknown[]) => void logged.push(a);
  try {
    const anon = createAnonymousKbClient({ baseUrl: server.url, apiKey: "anon-search-only" });
    const mcp = createUniversityKbServer({ kb: anon, profile: "anonymous", sourceKinds: SOURCE_KINDS });
    const { client, cleanup } = await connectedClient(mcp);
    try {
      const queries = [
        "ask about /sessions/sess-sem-1 please",
        "my name is Riya Fixture, school St Fixture, studentId=stu-1 tenant=t1",
        "POST /ask {\"query\":\"x\"}",
        "scholarships in germany?",
        "हिंदी में पूछो",
        "a&k=999&tenant=other",
        "q=thread-123",
        "visa blocked account",
        "../../keys",
        "crisis phrase here",
        "x".repeat(300),
        "last one",
      ];
      for (const q of queries) {
        const r = await client.callTool({ name: "search_kb", arguments: { query: q } });
        assert.notEqual(r.isError, true);
      }
      await client.callTool({ name: "kb_sources", arguments: {} });
    } finally {
      await cleanup();
    }
    assert.ok(requests.length >= 12);
    for (const r of requests) {
      assert.equal(r.method, "GET");
      const url = new URL(r.url ?? "", "http://kb.local");
      assert.ok(url.pathname === "/search" || url.pathname === "/sources", `unexpected path ${url.pathname}`);
      assert.equal(r.body, "");
      if (url.pathname === "/search") {
        assert.deepEqual([...url.searchParams.keys()], ["q"], "q is the only query parameter");
      } else {
        assert.equal(url.search, "");
      }
      const headerNames = Object.keys(r.headers).map((h) => h.toLowerCase());
      for (const forbidden of ["x-tenant-id", "x-student-id", "x-thread-id", "x-forwarded-for", "cookie", "x-user-id"]) {
        assert.equal(headerNames.includes(forbidden), false, `header ${forbidden} must not be sent`);
      }
      assert.equal(r.headers.authorization, "Bearer anon-search-only");
    }
    // the hostile "tenant=other" text stayed inside the single q value, not as its own parameter
    const hostile = requests.find((r) => (r.url ?? "").includes("tenant%3Dother"));
    assert.ok(hostile, "the injected text must be percent-encoded inside q");
    // one fetch by the source-kind resolver (cached for all 12 turns) + the one explicit kb_sources call
    assert.equal(requests.filter((r) => r.url === "/sources").length, 2);
    assert.deepEqual(logged, [], "no console output carries user text");
  } finally {
    Object.assign(console, orig);
    await server.close();
  }
});

test("A15c: anonymous config uses its own key and never falls back to the authenticated key", () => {
  assert.equal(loadAnonymousKbConfigFromEnv({}), null);
  assert.throws(() => loadAnonymousKbConfigFromEnv({ VC_KB_BASE_URL: "http://kb", VC_KB_API_KEY: "full-key" }), /VC_KB_ANON_API_KEY/);
  assert.deepEqual(
    loadAnonymousKbConfigFromEnv({ VC_KB_BASE_URL: "http://kb/", VC_KB_API_KEY: "full-key", VC_KB_ANON_API_KEY: "anon" }),
    { baseUrl: "http://kb/", apiKey: "anon" },
  );
});

test("a full-profile server refuses to start without a Db (only the anonymous profile may omit it)", () => {
  assert.throws(() => createUniversityKbServer({ kb: { ask: async () => ({ status: "unavailable", reason: "timeout", detail: "x" }) } }), /db/i);
});
