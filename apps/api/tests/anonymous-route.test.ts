/**
 * P1 U7 (spec A20 route side, contract B21 anonymous-route exception, B24.9): the public anonymous route is OFF by default,
 * enabled only by an explicit config flag, and then only when the A20 go-live gate passes; it is the ONLY route served without
 * a JWT, the list is closed, and every other route still answers 401. Outcome tests over real gate-file directories, the real
 * route table and the real node:http adapter. Synthetic data only (B13).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createJwtVerifier, jwtConfigFromEnv } from "../src/auth.js";
import { API_ROUTES, createApiHandler, createApiServer } from "../src/server.js";
import { STUDENT_API_DRAFT } from "../src/openapi.js";
import { GoLiveRefusedError } from "../src/go-live-gate.js";
import { startApi } from "../src/index.js";
import {
  ANONYMOUS_FLAG_ENV,
  ANONYMOUS_PATH,
  ANONYMOUS_ROUTES,
  ANONYMOUS_SAFETY_SCREEN_ENV,
  AnonymousConfigError,
  anonymousEnabledFromEnv,
  anonymousSafetyScreenFromEnv,
  buildAnonymousGraphDeps,
  createAnonymousApi,
  withAnonymousRoutes,
} from "../src/anonymous.js";
import { GroundingBudget, MockGroundedAnswerer, MockProvider, RulesProvider } from "@vc/providers";
import { createFakeMongoClient } from "@vc/db/testing";
import { VC_DB_NAME } from "@vc/db";
import { APPROVER, CHAIN_ENV, GOOD_CLAIM, NOW, SKILLS_DIR, SPEAKERS, ask, anonRequest, anonWorld, cleanupGates, gatesFixture, kbAnswerProvider, recordingKb, stubOllamaFetch, stubOllamaRouted } from "./anonymous-fixtures.js";

const REPO_GATES = fileURLToPath(new URL("../../../qa/gates", import.meta.url));
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
const verifier = createJwtVerifier(jwtConfigFromEnv({ VC_JWT_ISSUER: "https://issuer.synthetic.test", VC_JWT_PUBLIC_KEY: PEM }));

const baseDeps = () => ({
  kb: recordingKb(),
  provider: kbAnswerProvider(),
  skillsDir: SKILLS_DIR,
  speakers: SPEAKERS,
  counter: { increment: async () => {} },
});

// ---------------------------------------------------------------------------
// The flag
// ---------------------------------------------------------------------------

test("A20: the anonymous route is OFF by default - unset, empty and 'false' all read as disabled; only the exact word 'true' enables", () => {
  assert.equal(ANONYMOUS_FLAG_ENV, "VC_ANONYMOUS_ENABLED");
  for (const env of [{}, { VC_ANONYMOUS_ENABLED: "" }, { VC_ANONYMOUS_ENABLED: "false" }, { VC_ANONYMOUS_ENABLED: " false " }]) assert.equal(anonymousEnabledFromEnv(env), false, JSON.stringify(env));
  assert.equal(anonymousEnabledFromEnv({ VC_ANONYMOUS_ENABLED: "true" }), true);
  for (const bad of ["1", "yes", "TRUE", "on", "enabled", "tru"]) {
    assert.throws(() => anonymousEnabledFromEnv({ VC_ANONYMOUS_ENABLED: bad }), AnonymousConfigError, bad);
  }
});

test("G1 (pc-hardening-5, ISS-pc-hardening-4-1): the anonymous go-live gate reads the approver from the env it is passed (process.env only when none is passed) and fails closed when none is configured", () => {
  const ok = gatesFixture({ a10: null, gProd: "Answered: 2026-10-16T10:10:00+05:30 - b - authenticated text plus anonymous" });
  const saved = process.env.VC_GATE_APPROVER;
  try {
    const route = (env?: Record<string, string | undefined>) => ({ enabled: true, gatesDir: ok.gates, now: NOW, ...(env ? { env } : {}) });
    delete process.env.VC_GATE_APPROVER;
    for (const env of [{}, { VC_GATE_APPROVER: "" }, { VC_GATE_APPROVER: "   " }, { VC_GATE_APPROVER: "Mallory" }]) {
      assert.throws(() => createAnonymousApi(baseDeps(), route(env)), GoLiveRefusedError, JSON.stringify(env));
    }
    assert.throws(() => createAnonymousApi(baseDeps(), route()), GoLiveRefusedError, "no env passed, none in process.env");
    assert.ok(createAnonymousApi(baseDeps(), route({ VC_GATE_APPROVER: APPROVER })), "the passed env approver matches the B13 signer");
    process.env.VC_GATE_APPROVER = APPROVER;
    assert.throws(() => createAnonymousApi(baseDeps(), route({})), GoLiveRefusedError, "process.env is not consulted when an env is passed");
    assert.ok(createAnonymousApi(baseDeps(), route()), "no env passed: process.env is the fallback");
  } finally {
    if (saved === undefined) delete process.env.VC_GATE_APPROVER;
    else process.env.VC_GATE_APPROVER = saved;
    cleanupGates(ok);
  }
});

test("A20 state OFF: with the flag off nothing is built and the path answers exactly like an unknown path (404), for every method", async () => {
  const gates = gatesFixture();
  try {
    const off = createAnonymousApi(baseDeps(), { enabled: false, gatesDir: gates.gates, now: NOW, approver: APPROVER });
    assert.equal(off, undefined, "no handler exists when the flag is off, even though the gate files would allow it");
    let mainCalls = 0;
    const main = createApiHandler({ verifier, dbForTenant: () => { mainCalls++; throw new Error("no db"); }, graphForTenant: () => { mainCalls++; throw new Error("no graph"); } });
    const composed = withAnonymousRoutes(main, off);
    const unknown = await composed({ method: "POST", url: "/v1/public/nothing", headers: {}, readBody: async () => "{}" });
    for (const method of ["POST", "GET", "PUT", "DELETE", "OPTIONS"]) {
      const res = await composed({ method, url: ANONYMOUS_PATH, headers: {}, readBody: async () => JSON.stringify({ text: "What are the fees in Germany?" }) });
      assert.equal(res.status, 404, method);
      assert.equal(res.body, unknown.body);
      assert.deepEqual(res.headers, unknown.headers);
    }
    assert.equal(mainCalls, 0);
  } finally {
    cleanupGates(gates);
  }
});

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

test("A20 state ON but gate closed: the real repo qa/gates (B13 PENDING, gates unanswered) refuses to build the route", () => {
  assert.throws(() => createAnonymousApi(baseDeps(), { enabled: true, gatesDir: REPO_GATES, now: NOW, approver: APPROVER, env: {} }), GoLiveRefusedError);
});

test("A20: every gate record is required - an unsigned B13, an open g-publish, a g-prod without option b/c, a missing Nights mode each refuse; voice's A10 is NOT needed", () => {
  const cases: [string, Parameters<typeof gatesFixture>[0]][] = [
    ["B13 pending", { b13: "`B13-signed: PENDING`\n" }],
    ["B13 missing", { b13: null }],
    ["g-publish open", { gPublish: "**Status:** OPEN\n" }],
    ["g-prod option a (authenticated text only)", { gProd: "Answered: 2026-10-16T10:10:00+05:30 - a - authenticated only\n" }],
    ["g-prod option d (hold)", { gProd: "Answered: 2026-10-16T10:10:00+05:30 - d - hold\n" }],
    ["nights missing", { nights: null }],
  ];
  for (const [label, override] of cases) {
    const f = gatesFixture(override);
    try {
      assert.throws(() => createAnonymousApi(baseDeps(), { enabled: true, gatesDir: f.gates, now: NOW, approver: APPROVER, env: {} }), GoLiveRefusedError, label);
    } finally {
      cleanupGates(f);
    }
  }
  const ok = gatesFixture({ a10: null, gProd: "Answered: 2026-10-16T10:10:00+05:30 - b - authenticated text plus anonymous\n" });
  try {
    assert.ok(createAnonymousApi(baseDeps(), { enabled: true, gatesDir: ok.gates, now: NOW, approver: APPROVER, env: {} }));
  } finally {
    cleanupGates(ok);
  }
});

test("A20 state ON and gate open: the route is served", async () => {
  const w = anonWorld();
  try {
    const res = await w.handler(anonRequest({ text: "What are the tuition fees for public universities in Germany?" }));
    assert.equal(res.status, 200);
    assert.equal(JSON.parse(res.body).state, "ok");
    assert.equal(res.headers["cache-control"], "no-store");
  } finally {
    w.cleanup();
  }
});

test("no student text is traced: an env that switches LangChain/LangSmith tracing on refuses to build the route", () => {
  const f = gatesFixture();
  try {
    for (const env of [{ LANGSMITH_TRACING: "true" }, { LANGCHAIN_TRACING_V2: "true" }, { LANGSMITH_TRACING_V2: "1" }, { LANGCHAIN_TRACING: "true" }]) {
      assert.throws(() => createAnonymousApi(baseDeps(), { enabled: true, gatesDir: f.gates, now: NOW, approver: APPROVER, env }), /tracing/i, JSON.stringify(env));
    }
    assert.ok(createAnonymousApi(baseDeps(), { enabled: true, gatesDir: f.gates, now: NOW, approver: APPROVER, env: { LANGSMITH_TRACING: "false" } }));
  } finally {
    cleanupGates(f);
  }
});

// ---------------------------------------------------------------------------
// B21: the closed list
// ---------------------------------------------------------------------------

test("B21 exception: the closed list is exactly one text route, equals the draft's security:[] operations, and contains no voice route", () => {
  assert.deepEqual(ANONYMOUS_ROUTES.map((r) => `${r.method} ${r.path} ${String(r.roles)}`), [`POST ${ANONYMOUS_PATH} public`]);
  const draftAnonymous: string[] = [];
  for (const [path, ops] of Object.entries(STUDENT_API_DRAFT.paths)) {
    for (const [method, op] of Object.entries(ops as Record<string, { security?: unknown[] }>)) {
      if (Array.isArray(op.security) && op.security.length === 0) draftAnonymous.push(`${method.toUpperCase()} ${path}`);
    }
  }
  assert.deepEqual(draftAnonymous, [`POST ${ANONYMOUS_PATH}`]);
  assert.equal(JSON.stringify(ANONYMOUS_ROUTES).toLowerCase().includes("voice"), false);
  assert.equal(API_ROUTES.some((r) => r.path.startsWith("/v1/public")), false, "the authenticated route table holds no public route");
});

test("B21 exception: with the anonymous route ON, every other registered route still answers 401 with no token, and the main handler touches no Db", async () => {
  const w = anonWorld();
  try {
    let touched = 0;
    const main = createApiHandler({ verifier, dbForTenant: () => { touched++; throw new Error("db"); }, graphForTenant: () => { touched++; throw new Error("graph"); } });
    const composed = withAnonymousRoutes(main, w.handler);
    const concrete = (p: string) => p.replace(/\{[^}]+\}/g, "synthetic-1");
    for (const route of API_ROUTES.filter((r) => r.roles !== "public")) {
      const res = await composed({ method: route.method, url: concrete(route.path), headers: {}, readBody: async () => "{}" });
      assert.equal(res.status, 401, route.id);
    }
    assert.equal(touched, 0);
    // other /v1/public paths, voice paths, and near-miss spellings are not anonymous routes
    for (const path of ["/v1/public/chat/voice", "/v1/public/voice-sessions", "/v1/public/chat/turns/", "/v1/public/chat/turns/x", "/v1/public/chat", "/v1/public", "/v1/public/chat/turns%2f", "/V1/public/chat/turns", "/v1/students/syn-1/voice/sessions", "/v1/chat/threads/t1/turns"]) {
      const res = await composed({ method: "POST", url: path, headers: {}, readBody: async () => "{}" });
      assert.ok(res.status === 404 || res.status === 401, `${path} -> ${res.status}`);
    }
    // the anonymous path accepts POST only
    for (const method of ["GET", "PUT", "DELETE", "PATCH"]) {
      const res = await composed({ method, url: ANONYMOUS_PATH, headers: {}, readBody: async () => "{}" });
      assert.equal(res.status, 405, method);
      assert.equal(res.headers.allow, "POST");
    }
    assert.equal(touched, 0);
  } finally {
    w.cleanup();
  }
});

test("B21 exception: the anonymous route ignores identity - a valid-looking Authorization header changes nothing and no tenant or student id is read", async () => {
  const w = anonWorld();
  try {
    const q = "What are the tuition fees for public universities in Germany?";
    const plain = await w.handler(anonRequest({ text: q }, { ip: "192.0.2.1" }));
    const withToken = await w.handler(anonRequest({ text: q }, { ip: "192.0.2.2", headers: { authorization: "Bearer eyJhbGciOiJSUzI1NiJ9.eyJ0ZW5hbnQiOiJ0ZW5hbnQtYSIsInJvbGUiOiJzdHVkZW50In0.x" } }));
    assert.equal(withToken.status, 200);
    assert.equal(withToken.body, plain.body);
    assert.equal(JSON.stringify(w.provider.calls.map((c) => c.input)).includes("tenant-a"), false);
    const forged = await w.handler(anonRequest({ text: q, studentId: "syn-1", tenantId: "tenant-a" }, { ip: "192.0.2.3" }));
    assert.equal(forged.status, 400, "a body that names a tenant or student is refused, not honoured");
  } finally {
    w.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Over real HTTP and startApi
// ---------------------------------------------------------------------------

const mockProvider = () => kbAnswerProvider();

test("startApi: flag off -> the anonymous path is a 404 over real HTTP and no gate file is read", async () => {
  const fake = createFakeMongoClient();
  const api = await startApi(
    { MONGODB_URL: "mongodb://fake-host/ignored" },
    { clientFactory: () => fake.client, http: { port: 0, verifier, provider: mockProvider(), skillsDir: SKILLS_DIR, anonymous: { kb: recordingKb(), speakers: SPEAKERS, gatesDir: "Z:/does/not/exist" } } },
  );
  try {
    const res = await fetch(`http://127.0.0.1:${api.port}${ANONYMOUS_PATH}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "What are the fees in Germany?" }) });
    assert.equal(res.status, 404);
    assert.deepEqual(fake.dbFor(VC_DB_NAME).collection("anonymous_counters").all(), []);
  } finally {
    await api.stop();
  }
});

test("startApi: flag on with the real repo gates refuses to start, BEFORE connecting to Mongo", async () => {
  const fake = createFakeMongoClient();
  let connected = 0;
  (fake.client as unknown as { connect: () => Promise<void> }).connect = async () => {
    connected += 1;
  };
  await assert.rejects(
    startApi(
      { MONGODB_URL: "mongodb://fake-host/ignored", VC_GATE_APPROVER: "Umesh", VC_ANONYMOUS_ENABLED: "true" },
      { clientFactory: () => fake.client, http: { port: 0, verifier, provider: mockProvider(), skillsDir: SKILLS_DIR, anonymous: { kb: recordingKb(), speakers: SPEAKERS, trustSocketAddress: true } } },
    ),
    GoLiveRefusedError,
  );
  assert.equal(connected, 0);
});

test("startApi: flag on without a KB or speakers supplied is a config error, before connecting", async () => {
  const fake = createFakeMongoClient();
  const f = gatesFixture();
  try {
    await assert.rejects(
      startApi(
        { MONGODB_URL: "mongodb://fake-host/ignored", VC_GATE_APPROVER: "Umesh", VC_ANONYMOUS_ENABLED: "true" },
        { clientFactory: () => fake.client, http: { port: 0, verifier, provider: mockProvider(), skillsDir: SKILLS_DIR, anonymous: { gatesDir: f.gates, trustSocketAddress: true } } },
      ),
      AnonymousConfigError,
    );
  } finally {
    cleanupGates(f);
  }
});

test("startApi: flag on and gate open -> a real HTTP POST is answered and ONLY the text-free counter is written to virtual_counsellor; other routes still 401", async () => {
  const fake = createFakeMongoClient();
  const f = gatesFixture();
  const api = await startApi(
    { MONGODB_URL: "mongodb://fake-host/ignored", VC_GATE_APPROVER: "Umesh", VC_ANONYMOUS_ENABLED: "true" },
    { clientFactory: () => fake.client, http: { port: 0, verifier, provider: mockProvider(), skillsDir: SKILLS_DIR, anonymous: { kb: recordingKb(), speakers: SPEAKERS, gatesDir: f.gates, trustSocketAddress: true } } },
  );
  try {
    const base = `http://127.0.0.1:${api.port}`;
    const crisis = await fetch(`${base}${ANONYMOUS_PATH}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "I want to kill myself" }) });
    assert.equal(crisis.status, 200);
    const body = (await crisis.json()) as { state: string; message: string };
    assert.equal(body.state, "escalated");
    assert.match(body.message, /14416/);
    const generic = await fetch(`${base}${ANONYMOUS_PATH}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "What are the tuition fees for public universities in Germany?" }) });
    assert.equal((await generic.json() as { state: string }).state, "ok");
    const docs = fake.dbFor(VC_DB_NAME).collection<any>("anonymous_counters").all();
    assert.deepEqual(docs.map((d: any) => [d.kind, d.count]).sort(), [["answered", 1], ["crisis", 1]]);
    assert.deepEqual([...new Set(fake.dbCalls)], ["virtual_counsellor"]);
    const authed = await fetch(`${base}/v1/students/syn-1/export`);
    assert.equal(authed.status, 401);
    const tooBig = await fetch(`${base}${ANONYMOUS_PATH}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "a".repeat(300 * 1024) }) });
    assert.equal(tooBig.status, 413);
  } finally {
    await api.stop();
    cleanupGates(f);
  }
});

test("the node:http adapter hands the socket address to the limiter (10 per minute per real client)", async () => {
  const w = anonWorld();
  const main = createApiHandler({ verifier, dbForTenant: () => { throw new Error("db"); }, graphForTenant: () => { throw new Error("graph"); } });
  const server = createApiServer(withAnonymousRoutes(main, w.handler));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as { port: number };
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await fetch(`http://127.0.0.1:${port}${ANONYMOUS_PATH}`, { method: "POST", body: JSON.stringify({ text: "What are the tuition fees for public universities in Germany?" }) });
      statuses.push(r.status);
      await r.arrayBuffer();
    }
    assert.deepEqual(statuses, [...Array(10).fill(200), 429, 429]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    w.cleanup();
  }
});

test("U7 repair 2: with the flag on, startApi refuses to start unless the deployment states how clients are told apart - an explicit clientKey or trustSocketAddress: true", async () => {
  const fake = createFakeMongoClient();
  let connected = 0;
  (fake.client as unknown as { connect: () => Promise<void> }).connect = async () => {
    connected += 1;
  };
  const f = gatesFixture();
  try {
    for (const anonymous of [{ kb: recordingKb(), speakers: SPEAKERS, gatesDir: f.gates }, { kb: recordingKb(), speakers: SPEAKERS, gatesDir: f.gates, trustSocketAddress: false }]) {
      await assert.rejects(
        startApi(
          { MONGODB_URL: "mongodb://fake-host/ignored", VC_GATE_APPROVER: "Umesh", VC_ANONYMOUS_ENABLED: "true" },
          { clientFactory: () => fake.client, http: { port: 0, verifier, provider: mockProvider(), skillsDir: SKILLS_DIR, anonymous } },
        ),
        (err: unknown) => err instanceof AnonymousConfigError && /clientKey|trustSocketAddress/.test((err as Error).message),
      );
    }
    assert.equal(connected, 0, "refused before connecting to Mongo");
    const ok1 = await startApi(
      { MONGODB_URL: "mongodb://fake-host/ignored", VC_GATE_APPROVER: "Umesh", VC_ANONYMOUS_ENABLED: "true" },
      { clientFactory: () => fake.client, http: { port: 0, verifier, provider: mockProvider(), skillsDir: SKILLS_DIR, anonymous: { kb: recordingKb(), speakers: SPEAKERS, gatesDir: f.gates, clientKey: () => "lb-forwarded-client" } } },
    );
    await ok1.stop();
    const ok2 = await startApi(
      { MONGODB_URL: "mongodb://fake-host/ignored", VC_GATE_APPROVER: "Umesh", VC_ANONYMOUS_ENABLED: "true" },
      { clientFactory: () => fake.client, http: { port: 0, verifier, provider: mockProvider(), skillsDir: SKILLS_DIR, anonymous: { kb: recordingKb(), speakers: SPEAKERS, gatesDir: f.gates, trustSocketAddress: true } } },
    );
    await ok2.stop();
  } finally {
    cleanupGates(f);
  }
});

test("U7 repair 5: the draft OpenAPI operation documents the 405, 413 and 500 the route can return, and the AnonymousError schema carries the helpline field", () => {
  const op = (STUDENT_API_DRAFT.paths as Record<string, { post: { responses: Record<string, unknown> } }>)["/v1/public/chat/turns"]!.post;
  for (const code of ["200", "400", "405", "413", "429", "500"]) assert.ok(code in op.responses, `response ${code} documented`);
  const err = (STUDENT_API_DRAFT.components.schemas.AnonymousError as { properties: Record<string, unknown> });
  assert.ok("helpline" in err.properties);
});

// P1 LK1w: the anonymous route is a student surface, so it runs on the text chain when VC_TEXT_CHAIN is set; crisisGuard still runs first.
async function anonymousOverHttp(env: Record<string, string | undefined>, text: string, scribe: ReturnType<typeof kbAnswerProvider>) {
  const fake = createFakeMongoClient();
  const f = gatesFixture();
  const api = await startApi(
    { MONGODB_URL: "mongodb://fake-host/ignored", VC_GATE_APPROVER: "Umesh", VC_ANONYMOUS_ENABLED: "true", ...env },
    { clientFactory: () => fake.client, http: { port: 0, verifier, provider: scribe, skillsDir: SKILLS_DIR, anonymous: { kb: recordingKb(), speakers: SPEAKERS, gatesDir: f.gates, trustSocketAddress: true } } },
  );
  try {
    const res = await fetch(`http://127.0.0.1:${api.port}${ANONYMOUS_PATH}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
    assert.equal(res.status, 200);
    return (await res.json()) as { state: string };
  } finally {
    await api.stop();
    cleanupGates(f);
  }
}

test("LK1w: VC_TEXT_CHAIN set -> an anonymous question is answered by the chain and not by the injected provider; a crisis text still escalates with zero model calls", async () => {
  const stub = stubOllamaFetch({ claims: [GOOD_CLAIM] });
  const scribe = kbAnswerProvider();
  try {
    const ok = await anonymousOverHttp(CHAIN_ENV, "What are the tuition fees for public universities in Germany?", scribe);
    assert.equal(ok.state, "ok");
    assert.ok(stub.calls.length >= 1, "the chain hop was called");
    assert.equal(scribe.calls.length, 0);
    const before = stub.calls.length;
    const crisis = await anonymousOverHttp(CHAIN_ENV, "I want to kill myself", scribe);
    assert.equal(crisis.state, "escalated");
    assert.equal(stub.calls.length, before, "crisisGuard runs first on the original text: no chain call for a crisis turn");
    assert.equal(scribe.calls.length, 0);
  } finally {
    stub.restore();
  }
});

test("LK1w: VC_TEXT_CHAIN unset -> the anonymous route uses the current provider and nothing goes to Ollama", async () => {
  const stub = stubOllamaFetch({ claims: [GOOD_CLAIM] });
  const scribe = kbAnswerProvider();
  try {
    const ok = await anonymousOverHttp({}, "What are the tuition fees for public universities in Germany?", scribe);
    assert.equal(ok.state, "ok");
    assert.ok(scribe.calls.length >= 1);
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});

// ---------------------------------------------------------------------------
// P1 LK7 (D-105 vs contract A15b / B24.6, an OPEN decision): the model safety screen on the anonymous route sits behind a flag that defaults OFF,
// and the model language detector is not wired for anonymous turns at all. Anonymous behaviour is unchanged unless the flag is "true".
// ---------------------------------------------------------------------------

const GERMANY_Q = "What are the tuition fees for public universities in Germany?";
const classifierCallsOf = (p: ReturnType<typeof kbAnswerProvider>) => p.calls.filter((c) => c.skillName === "concern-classifier");

test("LK7 A1: flag unset (default OFF) -> an anonymous turn makes no safety-screen call and no model language-detector call, even with the chain set; a 'high' screen would not matter", async () => {
  const stub = stubOllamaRouted();
  const scribe = kbAnswerProvider();
  scribe.setResponse("concern-classifier", { severity: "high", likelyBenign: false, rationale: "synthetic" });
  try {
    const out = await anonymousOverHttp(CHAIN_ENV, GERMANY_Q, scribe);
    assert.equal(out.state, "ok");
    assert.equal(classifierCallsOf(scribe).length, 0, "no screen");
    assert.equal(stub.calls.filter((c) => c.kind === "lang-detect").length, 0, "no model detector on the anonymous route (A15b)");
    assert.ok(stub.calls.length >= 1, "the answer itself still ran on the chain (LK1w, unchanged)");
  } finally {
    stub.restore();
  }
  for (const off of ["", "false"]) {
    const s2 = kbAnswerProvider();
    s2.setResponse("concern-classifier", { severity: "high", likelyBenign: false, rationale: "synthetic" });
    assert.equal((await anonymousOverHttp({ VC_ANONYMOUS_SAFETY_SCREEN: off }, GERMANY_Q, s2)).state, "ok", JSON.stringify(off));
    assert.equal(classifierCallsOf(s2).length, 0);
  }
});

test("LK7 A2: VC_ANONYMOUS_SAFETY_SCREEN=true -> the screen runs on the anonymous turn (base provider, original text); 'possible' is the fixed crisis answer, a clear screen releases the answer", async () => {
  assert.equal(ANONYMOUS_SAFETY_SCREEN_ENV, "VC_ANONYMOUS_SAFETY_SCREEN");
  const high = kbAnswerProvider();
  high.setResponse("concern-classifier", { severity: "high", likelyBenign: false, rationale: "synthetic" });
  const out = await anonymousOverHttp({ VC_ANONYMOUS_SAFETY_SCREEN: "true" }, GERMANY_Q, high);
  assert.equal(out.state, "escalated");
  assert.equal(classifierCallsOf(high).length, 1);
  assert.equal((classifierCallsOf(high)[0]!.input as { text: string }).text, GERMANY_Q);
  const clear = kbAnswerProvider();
  assert.equal((await anonymousOverHttp({ VC_ANONYMOUS_SAFETY_SCREEN: "true" }, GERMANY_Q, clear)).state, "ok");
  assert.equal(classifierCallsOf(clear).length, 1);
});

test("LK7 A3: with the flag on, a crisis text is still answered by crisisGuard first: the screen is never called", async () => {
  const scribe = kbAnswerProvider();
  const out = await anonymousOverHttp({ VC_ANONYMOUS_SAFETY_SCREEN: "true" }, "I want to kill myself", scribe);
  assert.equal(out.state, "escalated");
  assert.equal(scribe.calls.length, 0);
});

test("LK7 A4: the flag reads like the other flags: unset, empty and 'false' are off, exactly 'true' is on, anything else is a config error (never a silent on or off)", () => {
  for (const env of [{}, { VC_ANONYMOUS_SAFETY_SCREEN: "" }, { VC_ANONYMOUS_SAFETY_SCREEN: "false" }]) assert.equal(anonymousSafetyScreenFromEnv(env), false, JSON.stringify(env));
  assert.equal(anonymousSafetyScreenFromEnv({ VC_ANONYMOUS_SAFETY_SCREEN: "true" }), true);
  for (const bad of ["1", "yes", "TRUE", "on"]) assert.throws(() => anonymousSafetyScreenFromEnv({ VC_ANONYMOUS_SAFETY_SCREEN: bad }), AnonymousConfigError, bad);
});

test("LK7 A5: buildAnonymousGraphDeps passes a screen through only when one is supplied, and then marks it on for anonymous turns", () => {
  const without = buildAnonymousGraphDeps({ ...baseDeps() });
  assert.equal(without.safetyScreen, undefined);
  assert.equal(without.detectLanguage, undefined);
  const provider = kbAnswerProvider();
  const withScreen = buildAnonymousGraphDeps({ ...baseDeps(), safetyScreen: { provider } });
  assert.equal(withScreen.safetyScreen?.provider, provider);
  assert.equal(withScreen.safetyScreen?.anonymous, true);
});

// ---------------------------------------------------------------------------
// p1-nosource-grounded (G1/G5 wiring)
// ---------------------------------------------------------------------------

test("G5: buildAnonymousGraphDeps maps scope no_source to anonymous: 'no_source' and passes grounding through; scope all or absent stays anonymous: true", () => {
  const provider = kbAnswerProvider();
  const grounding = new MockGroundedAnswerer({ text: "x", sources: [] });
  const ns = buildAnonymousGraphDeps({ ...baseDeps(), safetyScreen: { provider, scope: "no_source" }, grounding });
  assert.equal(ns.safetyScreen?.anonymous, "no_source");
  assert.equal(ns.grounding, grounding);
  assert.equal(buildAnonymousGraphDeps({ ...baseDeps(), safetyScreen: { provider, scope: "all" } }).safetyScreen?.anonymous, true);
  assert.equal(buildAnonymousGraphDeps({ ...baseDeps(), safetyScreen: { provider } }).safetyScreen?.anonymous, true);
  assert.equal(buildAnonymousGraphDeps({ ...baseDeps() }).grounding, undefined);
});

async function anonymousNoSourceOverHttp(env: Record<string, string | undefined>, text: string, scribe: ReturnType<typeof kbAnswerProvider>) {
  const fake = createFakeMongoClient();
  const f = gatesFixture();
  const api = await startApi(
    { MONGODB_URL: "mongodb://fake-host/ignored", VC_GATE_APPROVER: "Umesh", VC_ANONYMOUS_ENABLED: "true", ...env },
    { clientFactory: () => fake.client, http: { port: 0, verifier, provider: scribe, skillsDir: SKILLS_DIR, anonymous: { kb: recordingKb({ status: "ok", hits: [], dropped: 0 }), speakers: SPEAKERS, gatesDir: f.gates, trustSocketAddress: true } } },
  );
  try {
    const res = await fetch(`http://127.0.0.1:${api.port}${ANONYMOUS_PATH}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
    assert.equal(res.status, 200);
    return (await res.json()) as { state: string };
  } finally {
    await api.stop();
    cleanupGates(f);
  }
}

test("G5: by default (screen flag unset) a no-source anonymous turn is safety-screened before any model call; a 'possible' verdict is the crisis answer and the guidance model is never called", async () => {
  const high = kbAnswerProvider();
  high.setResponse("concern-classifier", { severity: "high", likelyBenign: false, rationale: "synthetic" });
  high.setResponse("kb-general-guidance", { answer: "should never be asked" });
  const out = await anonymousNoSourceOverHttp({}, GERMANY_Q, high);
  assert.equal(out.state, "escalated");
  assert.equal(classifierCallsOf(high).length, 1);
  assert.equal(high.calls.filter((c) => c.skillName === "kb-general-guidance").length, 0);
  const clear = kbAnswerProvider();
  clear.setResponse("kb-general-guidance", { answer: "Public universities in Germany mostly charge no tuition." });
  const ok = await anonymousNoSourceOverHttp({}, GERMANY_Q, clear);
  assert.equal(ok.state, "no_sourced_answer");
  assert.equal(classifierCallsOf(clear).length, 1);
});

test("G1: VC_GROUNDING set to anything but off/gemini, or gemini without GEMINI_API_KEY, is a startup error before anything connects", async () => {
  for (const env of [{ VC_GROUNDING: "bing" }, { VC_GROUNDING: "gemini" }, { VC_GROUNDING: "GEMINI", GEMINI_API_KEY: "k" }]) {
    let connected = false;
    const fake = createFakeMongoClient();
    await assert.rejects(
      startApi({ MONGODB_URL: "mongodb://fake-host/ignored", VC_GATE_APPROVER: "Umesh", ...env }, { clientFactory: () => { connected = true; return fake.client; }, http: { port: 0, verifier, provider: kbAnswerProvider(), skillsDir: SKILLS_DIR } }),
      /GroundingConfigError/,
      JSON.stringify(Object.keys(env)),
    );
    assert.equal(connected, false);
  }
});

// ---------------------------------------------------------------------------
// p1-grounding-hardening (H2 grounding never runs unscreened, H6 caps)
// ---------------------------------------------------------------------------

const GROUND_ENV = { VC_GROUNDING: "gemini", GEMINI_API_KEY: "synthetic-gemini-key-not-real" };

async function startAnonymous(provider: MockProvider | RulesProvider, env: Record<string, string | undefined>) {
  const fake = createFakeMongoClient();
  let connected = 0;
  (fake.client as unknown as { connect: () => Promise<void> }).connect = async () => { connected += 1; };
  const f = gatesFixture();
  try {
    const api = await startApi(
      { MONGODB_URL: "mongodb://fake-host/ignored", VC_GATE_APPROVER: "Umesh", VC_ANONYMOUS_ENABLED: "true", ...env },
      { clientFactory: () => fake.client, http: { port: 0, verifier, provider, skillsDir: SKILLS_DIR, anonymous: { kb: recordingKb({ status: "ok", hits: [], dropped: 0 }), speakers: SPEAKERS, gatesDir: f.gates, trustSocketAddress: true } } },
    );
    return { api, connected: () => connected, done: async () => { await api.stop(); cleanupGates(f); } };
  } catch (e) {
    cleanupGates(f);
    return { error: e as Error, connected: () => connected };
  }
}

test("H2: VC_GROUNDING=gemini with the anonymous route over a rules provider (no classifier, so no screen) refuses to start, before connecting, naming no key", async () => {
  for (const extra of [{}, { VC_ANONYMOUS_SAFETY_SCREEN: "true" }, CHAIN_ENV]) {
    const r = await startAnonymous(new RulesProvider(), { ...GROUND_ENV, ...extra });
    if ("done" in r) {
      await r.done();
      assert.fail(`started grounded with no screen: ${JSON.stringify(Object.keys(extra))}`);
    }
    assert.match(r.error.message, /GroundingConfigError/);
    assert.match(r.error.message, /safety screen/i);
    assert.ok(!r.error.message.includes("synthetic-gemini-key-not-real"));
    assert.equal(r.connected(), 0, "nothing connected");
  }
});

test("H2: the same rules provider WITHOUT grounding still starts (the existing behaviour), and grounding over a classifier-capable provider starts with the screen on", async () => {
  const off = await startAnonymous(new RulesProvider(), {});
  assert.ok("done" in off, "error" in off ? String(off.error) : "");
  await off.done();
  for (const extra of [{}, { VC_ANONYMOUS_SAFETY_SCREEN: "true" }]) {
    const ok = await startAnonymous(kbAnswerProvider(), { ...GROUND_ENV, ...extra });
    assert.ok("done" in ok, "error" in ok ? String(ok.error) : "");
    await ok.done();
  }
});

const NO_HITS_KB = () => recordingKb({ status: "ok", hits: [], dropped: 0 });
const GROUNDED_REPLY = { text: "Public universities in Germany mostly charge no tuition, with a semester contribution of about 300 euros.", sources: [] };
function capWorld(budget: GroundingBudget, grounded: MockGroundedAnswerer) {
  const provider = kbAnswerProvider();
  provider.setResponse("kb-general-guidance", { answer: "Model-only guidance: German public universities usually charge no tuition fees." });
  return anonWorld({ kb: NO_HITS_KB(), provider, deps: { grounding: grounded, groundingBudget: budget, limits: { anonymousRequestsPerMinute: 100 } } });
}

test("H6: grounded calls are capped per anonymous client; over the cap the turn falls back to the model-only guidance (D-110), no crash, and other clients are unaffected", async () => {
  const grounded = new MockGroundedAnswerer(GROUNDED_REPLY);
  const w = capWorld(new GroundingBudget({ maxPerSession: 2, maxPerDay: 100 }), grounded);
  try {
    const messages: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const out = await ask(w, GERMANY_Q, { ip: "203.0.113.50" });
      assert.equal(out.status, 200);
      assert.equal(out.json.state, "no_sourced_answer");
      messages.push(out.json.message);
    }
    assert.equal(grounded.calls.length, 2, "only the first two reached the web");
    assert.ok(messages[0]!.includes("semester contribution"), messages[0]);
    assert.ok(messages[2]!.includes("Model-only guidance"), messages[2]);
    assert.ok(messages[3]!.includes("Model-only guidance"), messages[3]);
    const other = await ask(w, GERMANY_Q, { ip: "203.0.113.51" });
    assert.ok(other.json.message.includes("semester contribution"));
    assert.equal(grounded.calls.length, 3);
  } finally {
    w.cleanup();
  }
});

test("H6: grounded calls are capped per day across clients; a refused spend guard is the same fallback", async () => {
  const grounded = new MockGroundedAnswerer(GROUNDED_REPLY);
  const w = capWorld(new GroundingBudget({ maxPerSession: 10, maxPerDay: 2 }), grounded);
  try {
    for (const ip of ["203.0.113.60", "203.0.113.61", "203.0.113.62"]) {
      const out = await ask(w, GERMANY_Q, { ip });
      assert.equal(out.status, 200);
      assert.equal(out.json.state, "no_sourced_answer");
    }
    assert.equal(grounded.calls.length, 2);
  } finally {
    w.cleanup();
  }
  const g2 = new MockGroundedAnswerer(GROUNDED_REPLY);
  const spendDenied = capWorld(new GroundingBudget({ maxPerSession: 10, maxPerDay: 10, spend: () => { throw new Error("monthly cap"); } }), g2);
  try {
    const out = await ask(spendDenied, GERMANY_Q, { ip: "203.0.113.70" });
    assert.equal(out.status, 200);
    assert.ok(out.json.message.includes("Model-only guidance"), out.json.message);
    assert.equal(g2.calls.length, 0);
  } finally {
    spendDenied.cleanup();
  }
});

test("H6: startApi refuses a malformed grounded-call cap and a non-flash VC_GROUNDING_MODEL before connecting", async () => {
  for (const bad of [{ VC_GROUNDING_MAX_PER_SESSION: "0" }, { VC_GROUNDING_MAX_PER_DAY: "many" }, { VC_GROUNDING_MODEL: "gemini-2.5-pro" }]) {
    const r = await startAnonymous(kbAnswerProvider(), { ...GROUND_ENV, ...bad });
    if ("done" in r) {
      await r.done();
      assert.fail(JSON.stringify(bad));
    }
    assert.match(r.error.message, /GroundingConfigError/);
    assert.equal(r.connected(), 0);
  }
});

// p1-grounding-hardening fix cycle 1, F3 (H6 privacy): the grounded-call budget is keyed on the salted digest the rate limiter uses, never the raw address.
class SpyBudget extends GroundingBudget {
  readonly seen: string[] = [];
  override bind(inner: Parameters<GroundingBudget["bind"]>[0], key: string | (() => string)) {
    return super.bind(inner, () => {
      const k = typeof key === "function" ? key() : key;
      this.seen.push(k);
      return k;
    });
  }
}

test("H6 F3: the grounded-call budget key is a salted digest, never the raw client address; the same client keeps one bucket and clients stay apart", async () => {
  const spy = new SpyBudget({ maxPerSession: 5, maxPerDay: 100 });
  const grounded = new MockGroundedAnswerer(GROUNDED_REPLY);
  const w = capWorld(spy, grounded);
  try {
    await ask(w, GERMANY_Q, { ip: "203.0.113.50" });
    await ask(w, GERMANY_Q, { ip: "203.0.113.50" });
    await ask(w, GERMANY_Q, { ip: "203.0.113.51" });
    assert.equal(spy.seen.length, 3);
    for (const k of spy.seen) {
      assert.ok(!k.includes("203.0.113"), `raw address in the budget key: ${k}`);
      assert.match(k, /^[A-Za-z0-9_-]{43}$/, "a base64url SHA-256 digest");
    }
    assert.equal(spy.seen[0], spy.seen[1]);
    assert.notEqual(spy.seen[0], spy.seen[2]);
  } finally {
    w.cleanup();
  }
});

test("H6 F3: a request with no client key falls back to ONE shared, still-capped bucket (fail safe), and the missing key is logged once, text-free", async () => {
  const spy = new SpyBudget({ maxPerSession: 2, maxPerDay: 100 });
  const grounded = new MockGroundedAnswerer(GROUNDED_REPLY);
  const provider = kbAnswerProvider();
  provider.setResponse("kb-general-guidance", { answer: "Model-only guidance: German public universities usually charge no tuition fees." });
  const w = anonWorld({ kb: NO_HITS_KB(), provider, deps: { grounding: grounded, groundingBudget: spy, clientKey: () => undefined, limits: { anonymousRequestsPerMinute: 100 } } });
  try {
    for (let i = 0; i < 4; i += 1) await ask(w, GERMANY_Q, { ip: `203.0.113.${80 + i}` });
    assert.equal(new Set(spy.seen).size, 1, "every keyless request shares one bucket");
    assert.equal(grounded.calls.length, 2, "and that bucket is capped, not unlimited");
    const missing = (w.logs as Array<{ event?: string }>).filter((l) => l.event === "anonymous_client_key_missing");
    assert.equal(missing.length, 1, "logged once");
    assert.ok(!JSON.stringify(missing).includes("203.0.113"));
  } finally {
    w.cleanup();
  }
});
