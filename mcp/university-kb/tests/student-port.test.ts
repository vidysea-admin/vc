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
import { createAnonymousKbClient, createKnowledgeBaseClient } from "../src/kb-client.js";
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
