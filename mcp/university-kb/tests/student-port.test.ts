/**
 * golive-launcher: `createStudentKbPort`, the in-process StudentKbPort the API launcher builds from a KB client. The mapping
 * is shared with the MCP `search_kb` / `get_session` handlers, so the port must return exactly what those tools return.
 * Real local HTTP server (fakeKb.ts) and the real client; synthetic fixtures only; the real KnowledgeBase is never called.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { isServedAsk } from "@vc/engine";
import { createStudentKbPort, createUniversityKbServer } from "../src/index.js";
import { createAnonymousKbClient, createKnowledgeBaseClient, resetKbBreakers } from "../src/kb-client.js";
import { SourceKindConfigSchema } from "../src/source-kind.js";
import { createFakeDb } from "./fakes.js";
import { startFakeKb, type FakeKbRequest, type FakeKbResponse } from "./fakeKb.js";
import { readFixture } from "./kb-fixture.js";

const SOURCE_KINDS = SourceKindConfigSchema.parse({ internalSeminar: { sourceIds: ["src-sem-1"] }, toc: { sourceIds: ["src-toc-1"] } });

function kbRouter(askFixture = "ask-correct.json") {
  const requests: FakeKbRequest[] = [];
  const handler = (req: FakeKbRequest): FakeKbResponse => {
    requests.push(req);
    const url = new URL(req.url ?? "/", "http://kb.local");
    const json = (body: unknown): FakeKbResponse => ({ status: 200, body: JSON.stringify(body) });
    if (req.method === "GET" && url.pathname === "/search") return json(readFixture("search.json"));
    if (req.method === "GET" && url.pathname === "/sources") return json(readFixture("sources.json"));
    if (req.method === "GET" && url.pathname === "/sessions/sess-sem-1") return json(readFixture("sessions/sess-sem-1.json"));
    if (req.method === "GET" && url.pathname.startsWith("/sessions/")) return { status: 404, body: "{}" };
    if (req.method === "POST" && url.pathname === "/ask") return json(readFixture(askFixture));
    return { status: 404, body: "{}" };
  };
  return { requests, handler };
}

test("T-057: port.searchKb asks the KB for k=5 hits (the graph keeps at most 5)", async () => {
  const { handler, requests } = kbRouter();
  const server = await startFakeKb(handler);
  try {
    const port = createStudentKbPort({ client: createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k" }), sourceKinds: SOURCE_KINDS });
    await port.searchKb("scholarships germany");
    const search = requests.find((r) => (r.url ?? "").startsWith("/search"));
    assert.ok(search, "a /search request was made");
    assert.equal(new URL(search!.url!, "http://kb.local").searchParams.get("k"), "5");
  } finally {
    await server.close();
  }
});

test("port.searchKb returns exactly the hits the MCP search_kb tool returns (one shared mapping)", async () => {
  const { handler } = kbRouter();
  const server = await startFakeKb(handler);
  try {
    const kb = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k" });
    const port = createStudentKbPort({ client: kb, sourceKinds: SOURCE_KINDS });
    const fromPort = await port.searchKb("scholarships germany");
    assert.equal(fromPort.status, "ok");

    const mcp = createUniversityKbServer({ db: createFakeDb().db, kb, sourceKinds: SOURCE_KINDS });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([mcp.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const out = (await client.callTool({ name: "search_kb", arguments: { query: "scholarships germany" } })) as { structuredContent: any };
      assert.deepEqual(fromPort, { status: "ok", hits: out.structuredContent.hits, dropped: out.structuredContent.dropped });
    } finally {
      await client.close();
      await mcp.close();
    }
    if (fromPort.status !== "ok") return;
    assert.deepEqual(fromPort.hits.map((h) => [h.turnId, h.sourceKind]), [["t-sem-1", "internal-seminar"], ["t-wa-1", "whatsapp"], ["t-rec-9", "unknown"]]);
    assert.equal(fromPort.hits[0]?.speakerLabel, "Fixture Speaker S");
    assert.equal(fromPort.hits[1]?.speakerLabel, undefined, "a WhatsApp label is never passed on");
    assert.equal(fromPort.dropped, 2);
  } finally {
    await server.close();
  }
});

test("an anonymous port is structurally search-only: no ask, no session, and only GET /search and /sources reach the KB", async () => {
  const { requests, handler } = kbRouter();
  const server = await startFakeKb(handler);
  try {
    const port = createStudentKbPort({ client: createAnonymousKbClient({ baseUrl: server.url, apiKey: "anon-key" }) });
    assert.equal(port.askKnowledgeBase, undefined);
    assert.equal(port.getSession, undefined);
    const r = await port.searchKb("fees in germany");
    assert.equal(r.status, "ok");
    assert.deepEqual([...new Set(requests.map((q) => `${q.method} ${new URL(q.url ?? "/", "http://kb.local").pathname}`))].sort(), ["GET /search", "GET /sources"]);
    assert.ok(requests.every((q) => q.headers.authorization === "Bearer anon-key"));
  } finally {
    await server.close();
  }
});

test("port.askKnowledgeBase applies the serve rule; a served answer satisfies the engine's isServedAsk, a withheld one never does", async () => {
  for (const [fixture, served] of [["ask-correct.json", true], ["ask-web-used.json", false], ["ask-fallback-failed.json", false], ["ask-ambiguous.json", false]] as const) {
    const server = await startFakeKb(kbRouter(fixture).handler);
    try {
      const port = createStudentKbPort({ client: createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k" }) });
      const ask = await port.askKnowledgeBase!("what is the fee?");
      assert.equal(isServedAsk(ask), served, fixture);
      assert.equal(ask.status, served ? "answered" : "no_sourced_answer", fixture);
      if (!served) assert.deepEqual(ask.citations, { internal: [], web: [] }, `${fixture}: nothing leaks from a withheld answer`);
    } finally {
      await server.close();
    }
  }
});

test("port.getSession gates labels by source kind, and a missing session is unavailable (never a throw)", async () => {
  const server = await startFakeKb(kbRouter().handler);
  try {
    const port = createStudentKbPort({ client: createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k" }), sourceKinds: SOURCE_KINDS });
    const ok = await port.getSession!("sess-sem-1");
    assert.equal(ok.status, "ok");
    if (ok.status === "ok") assert.equal(ok.sourceKind, "internal-seminar");
    const gone = await port.getSession!("sess-missing");
    assert.equal(gone.status, "unavailable");
  } finally {
    await server.close();
  }
});

test("an unreachable KB is status unavailable, not a thrown error", async () => {
  const server = await startFakeKb(kbRouter().handler);
  const url = server.url;
  await server.close();
  const port = createStudentKbPort({ client: createKnowledgeBaseClient({ baseUrl: url, apiKey: "k", timeoutMs: 500 }) });
  const r = await port.searchKb("anything");
  assert.equal(r.status, "unavailable");
  const a = await port.askKnowledgeBase!("anything");
  assert.equal(a.status, "unavailable");
});

// ---------------------------------------------------------------------------
// kb-breaker-route-build: route-first retrieval behind VC_KB_ROUTE (default OFF), /search as the fallback
// ---------------------------------------------------------------------------
function routeRouter(route: (req: FakeKbRequest) => FakeKbResponse) {
  const requests: FakeKbRequest[] = [];
  const handler = (req: FakeKbRequest): FakeKbResponse => {
    requests.push(req);
    const url = new URL(req.url ?? "/", "http://kb.local");
    if (req.method === "GET" && url.pathname === "/route") return route(req);
    if (req.method === "GET" && url.pathname === "/search") return { status: 200, body: JSON.stringify(readFixture("search.json")) };
    if (req.method === "GET" && url.pathname === "/sources") return { status: 200, body: JSON.stringify(readFixture("sources.json")) };
    return { status: 404, body: "{}" };
  };
  const paths = () => requests.map((r) => `${r.method} ${new URL(r.url ?? "/", "http://kb.local").pathname}`).filter((p) => p !== "GET /sources");
  return { handler, paths };
}
const ROUTE_ONLY_HIT = {
  hits: [
    {
      turnId: "t-route-1",
      sessionId: "s-route-1",
      score: 0.9,
      turn: { _id: "t-route-1", text: "routed evidence" },
      session: { _id: "s-route-1", date: "2026-01-01", sourceId: "src-route" },
    },
  ],
};

test("route flag OFF (default, env unset): /route is never called, /search serves", async () => {
  resetKbBreakers();
  const saved = process.env.VC_KB_ROUTE;
  delete process.env.VC_KB_ROUTE;
  const { handler, paths } = routeRouter(() => ({ status: 200, body: JSON.stringify(ROUTE_ONLY_HIT) }));
  const server = await startFakeKb(handler);
  try {
    const port = createStudentKbPort({ client: createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k" }) });
    const r = await port.searchKb("fees");
    assert.equal(r.status, "ok");
    assert.deepEqual(paths(), ["GET /search"]);
  } finally {
    if (saved !== undefined) process.env.VC_KB_ROUTE = saved;
    await server.close();
  }
});

test("route flag ON via VC_KB_ROUTE=1: /route is tried first and its hits are served (no /search call)", async () => {
  resetKbBreakers();
  const saved = process.env.VC_KB_ROUTE;
  process.env.VC_KB_ROUTE = "1";
  const { handler, paths } = routeRouter(() => ({ status: 200, body: JSON.stringify(ROUTE_ONLY_HIT) }));
  const server = await startFakeKb(handler);
  try {
    const port = createStudentKbPort({ client: createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k" }) });
    const r = await port.searchKb("fees");
    assert.equal(r.status, "ok");
    if (r.status === "ok") assert.deepEqual(r.hits.map((h) => h.turnId), ["t-route-1"]);
    assert.deepEqual(paths(), ["GET /route"]);
  } finally {
    if (saved === undefined) delete process.env.VC_KB_ROUTE; else process.env.VC_KB_ROUTE = saved;
    await server.close();
  }
});

test("route ON: a route response is validated like /search -- a withdrawn-source hit (null turn/session) is dropped and counted", async () => {
  resetKbBreakers();
  const { handler } = routeRouter(() => ({ status: 200, body: JSON.stringify({ hits: [...ROUTE_ONLY_HIT.hits, ...(readFixture("search.json").hits as unknown[]).filter((h: any) => h.turn === null)] }) }));
  const server = await startFakeKb(handler);
  try {
    const port = createStudentKbPort({ client: createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k" }), routeEnabled: true });
    const r = await port.searchKb("fees");
    assert.equal(r.status, "ok");
    if (r.status === "ok") {
      assert.deepEqual(r.hits.map((h) => h.turnId), ["t-route-1"]);
      assert.equal(r.dropped, 1);
    }
  } finally {
    await server.close();
  }
});

test("route ON: /route 404 falls back to /search, and the next turn does not pay the 404 again", async () => {
  resetKbBreakers();
  const { handler, paths } = routeRouter(() => ({ status: 404, body: "{}" }));
  const server = await startFakeKb(handler);
  try {
    const port = createStudentKbPort({ client: createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k" }), routeEnabled: true });
    const first = await port.searchKb("fees");
    const second = await port.searchKb("fees again");
    assert.equal(first.status, "ok");
    assert.equal(second.status, "ok");
    assert.deepEqual(paths(), ["GET /route", "GET /search", "GET /search"]);
  } finally {
    await server.close();
  }
});

test("route ON: 503 route_timeout falls back to /search at once and does not count toward the breaker (failThreshold 1)", async () => {
  resetKbBreakers();
  const { handler, paths } = routeRouter(() => ({ status: 503, body: JSON.stringify({ error: "route_timeout" }) }));
  const server = await startFakeKb(handler);
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k", breaker: { failThreshold: 1, cooldownMs: 60_000 } });
    const port = createStudentKbPort({ client, routeEnabled: true });
    const first = await port.searchKb("fees");
    const second = await port.searchKb("fees again");
    assert.equal(first.status, "ok");
    assert.equal(second.status, "ok");
    assert.deepEqual(paths(), ["GET /route", "GET /search", "GET /search"], "route skipped (short) on the second turn, /search never short-circuited");
  } finally {
    await server.close();
  }
});

test("route ON: a /route timeout falls back to /search; an empty route result also falls back", async () => {
  resetKbBreakers();
  const slow = routeRouter(() => ({ status: 200, body: JSON.stringify(ROUTE_ONLY_HIT), delayMs: 400 }));
  const empty = routeRouter(() => ({ status: 200, body: JSON.stringify({ hits: [] }) }));
  const slowServer = await startFakeKb(slow.handler);
  const emptyServer = await startFakeKb(empty.handler);
  try {
    const a = await createStudentKbPort({ client: createKnowledgeBaseClient({ baseUrl: slowServer.url, apiKey: "k", timeoutMs: 40 }), routeEnabled: true }).searchKb("fees");
    assert.equal(a.status, "ok");
    if (a.status === "ok") assert.equal(a.hits[0]?.turnId, "t-sem-1", "served by /search");
    assert.deepEqual(slow.paths(), ["GET /route", "GET /search"]);

    const b = await createStudentKbPort({ client: createKnowledgeBaseClient({ baseUrl: emptyServer.url, apiKey: "k" }), routeEnabled: true }).searchKb("fees");
    assert.equal(b.status, "ok");
    if (b.status === "ok") assert.equal(b.hits[0]?.turnId, "t-sem-1");
    assert.deepEqual(empty.paths(), ["GET /route", "GET /search"]);
  } finally {
    await slowServer.close();
    await emptyServer.close();
  }
});

test("route ON + breaker open: no network at all; the port reports unavailable/circuit_open (the graph's searchFailed path)", async () => {
  resetKbBreakers();
  const { handler, paths } = routeRouter(() => ({ status: 503, body: "{}" }));
  const server = await startFakeKb((req) => (req.url?.startsWith("/search") ? { status: 503, body: "{}" } : handler(req)));
  try {
    const client = createKnowledgeBaseClient({ baseUrl: server.url, apiKey: "k", breaker: { failThreshold: 2, cooldownMs: 60_000 } });
    const port = createStudentKbPort({ client, routeEnabled: true });
    const first = await port.searchKb("fees");
    assert.equal(first.status, "unavailable");
    const served = paths().length;
    const second = await port.searchKb("fees");
    assert.equal(second.status, "unavailable");
    if (second.status === "unavailable") assert.equal(second.unavailableReason, "circuit_open");
    assert.equal(paths().length, served, "no request while open");
  } finally {
    await server.close();
  }
});
