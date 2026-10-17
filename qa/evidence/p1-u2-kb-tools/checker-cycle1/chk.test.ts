import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createUniversityKbServer } from "../src/index.js";
import { createKnowledgeBaseClient, createAnonymousKbClient, loadAnonymousKbConfigFromEnv, NO_SOURCED_ANSWER_TEXT } from "../src/kb-client.js";
import { SourceKindConfigSchema, createSourceKindResolver } from "../src/source-kind.js";
import { createFakeDb } from "./fakes.js";

const CFG = SourceKindConfigSchema.parse({ internalSeminar: { sourceIds: ["s-sem"] }, toc: { sourceIds: ["s-toc"] } });
type Route = (m: string, p: string, headers: Record<string, string>, body?: string) => { status: number; body: unknown } | "throw";
function mkFetch(route: Route, log: any[] = []) {
  return (async (url: string, init: any) => {
    const u = new URL(url);
    const p = u.pathname + u.search;
    log.push({ method: init.method, path: p, headers: init.headers, body: init.body });
    const r = route(init.method, p, init.headers, init.body);
    if (r === "throw") throw new Error("ECONNREFUSED leak-" + p);
    return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
}
async function connect(server: any) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "c", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}
const askBody = (o: any = {}) => ({
  answer: "SECRET-ANSWER-TEXT", verdict: "correct", reason: "SECRET-REASON", scored: [], web_used: false, insufficient_coverage: false,
  sources: { internal: [{ node_id: "n1" }], web: [] }, auditLog: [], ...o,
});
async function ask(body: unknown, status = 200) {
  const kb = createKnowledgeBaseClient({ baseUrl: "http://kb", apiKey: "k", fetchImpl: mkFetch(() => ({ status, body })) });
  const c = await connect(createUniversityKbServer({ db: createFakeDb() as any, kb }));
  const r: any = await c.callTool({ name: "ask_knowledge_base", arguments: { query: "q" } });
  return r;
}
function assertWithheld(r: any, status: string) {
  const s = r.structuredContent;
  assert.equal(s.status, status);
  assert.equal(s.answer, NO_SOURCED_ANSWER_TEXT);
  assert.deepEqual(s.citations, { internal: [], web: [] });
  assert.equal(s.reason, "");
  const all = JSON.stringify(r);
  assert.ok(!all.includes("SECRET-ANSWER-TEXT"), "answer leaked");
  assert.ok(!all.includes("SECRET-REASON"), "reason leaked");
}

test("serve: correct served; web[] stripped; sourceKind unknown", async () => {
  const r = await ask(askBody({ sources: { internal: [{ node_id: "n1" }], web: [{ url: "http://x" }] } }));
  const s = r.structuredContent;
  assert.equal(s.status, "answered"); assert.equal(s.answer, "SECRET-ANSWER-TEXT");
  assert.deepEqual(s.citations.web, []); assert.equal(s.sourceKind, "unknown"); assert.equal(s.citations.internal.length, 1);
});
for (const [name, o] of Object.entries({
  Correct: { verdict: "Correct" }, "correct ": { verdict: "correct " }, CORRECT: { verdict: "CORRECT" }, incorrect: { verdict: "incorrect" },
  insufficient: { insufficient_coverage: true }, web_used: { web_used: true },
  noInternal: { sources: { internal: [], web: [{ url: "x" }] } },
  webUsedStray: { web_used: true, sources: { internal: [{ node_id: "a" }], web: [{ url: "x" }] } },
})) {
  test("withheld: " + name, async () => { assertWithheld(await ask(askBody(o)), "no_sourced_answer"); });
}
test("withheld: realistic no coverage -> no_sourced_answer not unavailable", async () => {
  assertWithheld(await ask(askBody({ verdict: "incorrect", insufficient_coverage: true, sources: { internal: [], web: [] } })), "no_sourced_answer");
});
test("correct but zero citations -> unavailable, no leak", async () => {
  assertWithheld(await ask(askBody({ sources: { internal: [], web: [] } })), "unavailable");
});
test("missing flags -> fixed text no leak", async () => {
  const b: any = askBody(); delete b.web_used; assertWithheld(await ask(b), "unavailable");
  const c: any = askBody(); delete c.insufficient_coverage; assertWithheld(await ask(c), "unavailable");
  const d: any = askBody({ web_used: "false" }); assertWithheld(await ask(d), "unavailable");
  const e: any = askBody({ insufficient_coverage: null }); assertWithheld(await ask(e), "unavailable");
});
test("5xx / 401 / non-json / array / null -> unavailable", async () => {
  assertWithheld(await ask(askBody(), 503), "unavailable");
  assertWithheld(await ask(askBody(), 401), "unavailable");
  assertWithheld(await ask("not json SECRET-ANSWER-TEXT"), "unavailable");
  assertWithheld(await ask(null), "unavailable");
  assertWithheld(await ask([askBody()]), "unavailable");
});
test("network error -> unavailable", async () => {
  const kb = createKnowledgeBaseClient({ baseUrl: "http://kb", apiKey: "k", fetchImpl: mkFetch(() => "throw") });
  const c = await connect(createUniversityKbServer({ db: createFakeDb() as any, kb }));
  const r: any = await c.callTool({ name: "ask_knowledge_base", arguments: { query: "q" } });
  assert.equal(r.structuredContent.status, "unavailable"); assert.equal(r.isError ?? false, false);
});
test("ask query cap", async () => {
  const log: any[] = [];
  const kb = createKnowledgeBaseClient({ baseUrl: "http://kb", apiKey: "k", fetchImpl: mkFetch(() => ({ status: 200, body: askBody() }), log) });
  const c = await connect(createUniversityKbServer({ db: createFakeDb() as any, kb }));
  const bad: any = await c.callTool({ name: "ask_knowledge_base", arguments: { query: "x".repeat(1001) } }).catch((e) => ({ isError: true, e }));
  assert.ok(bad.isError); assert.equal(log.length, 0);
  const ok: any = await c.callTool({ name: "ask_knowledge_base", arguments: { query: "x".repeat(1000) } });
  assert.equal(ok.structuredContent.status, "answered");
});

// ---- search/session label + cross-check
const sources = { sources: [
  { _id: "s-sem", kind: "recording" }, { _id: "s-toc", kind: "document" }, { _id: "s-wa", kind: "whatsapp-batch" }, { _id: "s-unk", kind: "recording" },
] };
const hit = (id: string, sid: string, src: string, label = "Some Person", extra: any = {}) => ({
  turnId: id, sessionId: sid, score: 1, turn: { _id: id, text: "t " + id, speakerLabel: label }, session: { _id: sid, sourceId: src, date: "2026-01-01", title: "T" + sid }, ...extra });
const searchRoute = (hits: any[], srcStatus = 200): Route => (m, p) => {
  if (p.startsWith("/search")) return { status: 200, body: { hits } };
  if (p.startsWith("/sources")) return srcStatus === 200 ? { status: 200, body: sources } : { status: srcStatus, body: {} };
  if (p.startsWith("/sessions/")) return { status: 200, body: { session: { _id: "S1", sourceId: "s-sem", date: "2026-01-01" }, turns: [{ _id: "x1", text: "a", speakerLabel: "P" }] } };
  return { status: 404, body: {} };
};
const HITS = [hit("t1", "S1", "s-sem"), hit("t2", "S2", "s-toc"), hit("t3", "S3", "s-wa"), hit("t4", "S4", "s-unk"), hit("t5", "S5", "s-missing")];
for (const profile of ["full", "anonymous"] as const) {
  test("labels only seminar/toc (" + profile + ")", async () => {
    const mk = profile === "full" ? createKnowledgeBaseClient : createAnonymousKbClient;
    const kb = mk({ baseUrl: "http://kb", apiKey: "k", fetchImpl: mkFetch(searchRoute(HITS)) });
    const c = await connect(createUniversityKbServer({ ...(profile === "full" ? { db: createFakeDb() as any } : {}), kb: kb as any, sourceKinds: CFG, profile }));
    const r: any = await c.callTool({ name: "search_kb", arguments: { query: "q" } });
    const by: any = Object.fromEntries(r.structuredContent.hits.map((h: any) => [h.turnId, h]));
    assert.equal(by.t1.speakerLabel, "Some Person"); assert.equal(by.t1.sourceKind, "internal-seminar");
    assert.equal(by.t2.speakerLabel, "Some Person"); assert.equal(by.t2.sourceKind, "toc");
    for (const t of ["t3", "t4", "t5"]) { assert.ok(!("speakerLabel" in by[t]), t); }
    assert.equal(by.t3.sourceKind, "whatsapp"); assert.equal(by.t4.sourceKind, "unknown"); assert.equal(by.t5.sourceKind, "unknown");
  });
  test("labels absent when /sources down (" + profile + ")", async () => {
    const mk = profile === "full" ? createKnowledgeBaseClient : createAnonymousKbClient;
    const kb = mk({ baseUrl: "http://kb", apiKey: "k", fetchImpl: mkFetch(searchRoute(HITS, 500)) });
    const c = await connect(createUniversityKbServer({ ...(profile === "full" ? { db: createFakeDb() as any } : {}), kb: kb as any, sourceKinds: CFG, profile }));
    const r: any = await c.callTool({ name: "search_kb", arguments: { query: "q" } });
    for (const h of r.structuredContent.hits) { assert.ok(!("speakerLabel" in h)); assert.equal(h.sourceKind, "unknown"); }
    assert.ok(!JSON.stringify(r).includes("Some Person"));
  });
}
test("whatsapp listed in seminar config is still whatsapp and no label", async () => {
  const cfg = SourceKindConfigSchema.parse({ internalSeminar: { sourceIds: ["s-wa"], titles: ["TS3"] } });
  const kb = createKnowledgeBaseClient({ baseUrl: "http://kb", apiKey: "k", fetchImpl: mkFetch(searchRoute([hit("t3", "S3", "s-wa")])) });
  const c = await connect(createUniversityKbServer({ db: createFakeDb() as any, kb, sourceKinds: cfg }));
  const r: any = await c.callTool({ name: "search_kb", arguments: { query: "q" } });
  assert.equal(r.structuredContent.hits[0].sourceKind, "whatsapp"); assert.ok(!("speakerLabel" in r.structuredContent.hits[0]));
});
test("get_session label: seminar yes; unknown no", async () => {
  const kb = createKnowledgeBaseClient({ baseUrl: "http://kb", apiKey: "k", fetchImpl: mkFetch(searchRoute([])) });
  const c = await connect(createUniversityKbServer({ db: createFakeDb() as any, kb, sourceKinds: CFG }));
  const r: any = await c.callTool({ name: "get_session", arguments: { sessionId: "S1" } });
  assert.equal(r.structuredContent.turns[0].speakerLabel, "P");
  const c2 = await connect(createUniversityKbServer({ db: createFakeDb() as any, kb, sourceKinds: SourceKindConfigSchema.parse({}) }));
  const r2: any = await c2.callTool({ name: "get_session", arguments: { sessionId: "S1" } });
  assert.ok(!("speakerLabel" in r2.structuredContent.turns[0])); assert.equal(r2.structuredContent.sourceKind, "unknown");
  const kb3 = createKnowledgeBaseClient({ baseUrl: "http://kb", apiKey: "k", fetchImpl: mkFetch(searchRoute([], 500)) });
  const c3 = await connect(createUniversityKbServer({ db: createFakeDb() as any, kb: kb3, sourceKinds: CFG }));
  const r3: any = await c3.callTool({ name: "get_session", arguments: { sessionId: "S1" } });
  // searchRoute 500 only affects /sources
  assert.ok(!("speakerLabel" in r3.structuredContent.turns[0]));
});
test("mismatched ids dropped", async () => {
  const bad = [
    hit("t1", "S1", "s-sem"),
    { ...hit("t2", "S2", "s-sem"), turn: { _id: "OTHER", text: "x" } },
    { ...hit("t3", "S3", "s-sem"), session: { _id: "OTHER", sourceId: "s-sem", date: "d" } },
    { ...hit("t4", "S4", "s-sem"), turn: { text: "no id" } },
    { ...hit("t5", "S5", "s-sem"), turn: null }, { ...hit("t6", "S6", "s-sem"), session: null },
    { ...hit("t7", "S7", "s-sem"), turnId: "" },
  ];
  const kb = createKnowledgeBaseClient({ baseUrl: "http://kb", apiKey: "k", fetchImpl: mkFetch(searchRoute(bad)) });
  const c = await connect(createUniversityKbServer({ db: createFakeDb() as any, kb, sourceKinds: CFG }));
  const r: any = await c.callTool({ name: "search_kb", arguments: { query: "q" } });
  assert.deepEqual(r.structuredContent.hits.map((h: any) => h.turnId), ["t1"]); assert.equal(r.structuredContent.dropped, 6);
});
test("get_session mismatched session id -> unavailable; 404 -> not_found", async () => {
  const kb = createKnowledgeBaseClient({ baseUrl: "http://kb", apiKey: "k", fetchImpl: mkFetch(searchRoute([])) });
  const c = await connect(createUniversityKbServer({ db: createFakeDb() as any, kb }));
  const r: any = await c.callTool({ name: "get_session", arguments: { sessionId: "OTHERID" } });
  assert.equal(r.structuredContent.status, "unavailable");
  const kb2 = createKnowledgeBaseClient({ baseUrl: "http://kb", apiKey: "k", fetchImpl: mkFetch(() => ({ status: 404, body: {} })) });
  const c2 = await connect(createUniversityKbServer({ db: createFakeDb() as any, kb: kb2 }));
  const r2: any = await c2.callTool({ name: "get_session", arguments: { sessionId: "S1" } });
  assert.equal(r2.structuredContent.unavailableReason, "not_found");
});

// ---- anonymous
test("anonymous: only 2 tools even with full client; wire identity-free; own key", async () => {
  const log: any[] = [];
  const kb = createKnowledgeBaseClient({ baseUrl: "http://kb", apiKey: "ANONKEY", fetchImpl: mkFetch(searchRoute(HITS), log) });
  const c = await connect(createUniversityKbServer({ kb, profile: "anonymous", sourceKinds: CFG }));
  const tools = (await c.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(tools, ["kb_sources", "search_kb"]);
  for (const name of ["ask_knowledge_base", "get_session", "kb_gaps", "search_courses", "get_course"]) {
    const r: any = await c.callTool({ name, arguments: { query: "q", sessionId: "S1", courseId: "c" } }).catch(() => ({ isError: true }));
    assert.ok(r.isError, name);
  }
  await c.callTool({ name: "search_kb", arguments: { query: "my name is Priya tenant-9 thread-4" } });
  await c.callTool({ name: "kb_sources", arguments: {} });
  assert.ok(log.length >= 2);
  for (const l of log) {
    assert.equal(l.method, "GET"); assert.match(l.path, /^\/(search\?|sources$)/);
    assert.deepEqual(Object.keys(l.headers).sort(), ["accept", "authorization"]); assert.equal(l.headers.authorization, "Bearer ANONKEY");
    assert.equal(l.body, undefined);
  }
  assert.ok(log.some((l) => l.path.startsWith("/search?q=")));
  assert.throws(() => loadAnonymousKbConfigFromEnv({ VC_KB_BASE_URL: "http://x", VC_KB_API_KEY: "full" }));
  assert.deepEqual(loadAnonymousKbConfigFromEnv({ VC_KB_BASE_URL: "http://x", VC_KB_API_KEY: "full", VC_KB_ANON_API_KEY: "anon" }), { baseUrl: "http://x", apiKey: "anon" });
  assert.throws(() => loadAnonymousKbConfigFromEnv({ VC_KB_BASE_URL: "http://x", VC_KB_API_KEY: "full", VC_KB_ANON_API_KEY: "  " }));
  const anonClient: any = createAnonymousKbClient({ baseUrl: "http://kb", apiKey: "a", fetchImpl: mkFetch(searchRoute([])) });
  assert.deepEqual(Object.keys(anonClient).sort(), ["search", "sources"]);
});
test("anonymous network error does not echo query", async () => {
  const kb = createAnonymousKbClient({ baseUrl: "http://kb", apiKey: "a", fetchImpl: mkFetch(() => "throw") });
  const c = await connect(createUniversityKbServer({ kb, profile: "anonymous" }));
  const r: any = await c.callTool({ name: "search_kb", arguments: { query: "SECRETQUERY" } });
  assert.equal(r.structuredContent.status, "unavailable"); assert.ok(!JSON.stringify(r).includes("SECRETQUERY")); assert.ok(!JSON.stringify(r).includes("leak-"));
});
test("kb_sources only id/kind", async () => {
  const kb = createKnowledgeBaseClient({ baseUrl: "http://kb", apiKey: "k", fetchImpl: mkFetch(() => ({ status: 200, body: { sources: [{ _id: "a", kind: "recording", path: "/p", hash: "h", consent: { given: true } }] } })) });
  const c = await connect(createUniversityKbServer({ db: createFakeDb() as any, kb }));
  const r: any = await c.callTool({ name: "kb_sources", arguments: {} });
  assert.deepEqual(r.structuredContent.sources, [{ id: "a", kind: "recording" }]); assert.ok(!JSON.stringify(r).includes("/p"));
});
test("resolver: client.sources throwing synchronously must not cache failure forever", async () => {
  let n = 0;
  const client: any = { sources: () => { n++; if (n === 1) throw new Error("sync boom"); return Promise.resolve({ status: "ok", sources: [{ id: "s", kind: "whatsapp-batch" }], dropped: 0 }); } };
  const r = createSourceKindResolver({ client });
  assert.equal(await r.tag({ sourceId: "s" }), "unknown");
  assert.equal(await r.tag({ sourceId: "s" }), "whatsapp");
});
