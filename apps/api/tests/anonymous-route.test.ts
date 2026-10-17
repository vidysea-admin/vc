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
  AnonymousConfigError,
  anonymousEnabledFromEnv,
  createAnonymousApi,
  withAnonymousRoutes,
} from "../src/anonymous.js";
import { createFakeMongoClient } from "@vc/db/testing";
import { VC_DB_NAME } from "@vc/db";
import { APPROVER, NOW, SKILLS_DIR, SPEAKERS, anonRequest, anonWorld, cleanupGates, gatesFixture, kbAnswerProvider, recordingKb } from "./anonymous-fixtures.js";

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
      { MONGODB_URL: "mongodb://fake-host/ignored", VC_ANONYMOUS_ENABLED: "true" },
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
        { MONGODB_URL: "mongodb://fake-host/ignored", VC_ANONYMOUS_ENABLED: "true" },
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
    { MONGODB_URL: "mongodb://fake-host/ignored", VC_ANONYMOUS_ENABLED: "true" },
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
          { MONGODB_URL: "mongodb://fake-host/ignored", VC_ANONYMOUS_ENABLED: "true" },
          { clientFactory: () => fake.client, http: { port: 0, verifier, provider: mockProvider(), skillsDir: SKILLS_DIR, anonymous } },
        ),
        (err: unknown) => err instanceof AnonymousConfigError && /clientKey|trustSocketAddress/.test((err as Error).message),
      );
    }
    assert.equal(connected, 0, "refused before connecting to Mongo");
    const ok1 = await startApi(
      { MONGODB_URL: "mongodb://fake-host/ignored", VC_ANONYMOUS_ENABLED: "true" },
      { clientFactory: () => fake.client, http: { port: 0, verifier, provider: mockProvider(), skillsDir: SKILLS_DIR, anonymous: { kb: recordingKb(), speakers: SPEAKERS, gatesDir: f.gates, clientKey: () => "lb-forwarded-client" } } },
    );
    await ok1.stop();
    const ok2 = await startApi(
      { MONGODB_URL: "mongodb://fake-host/ignored", VC_ANONYMOUS_ENABLED: "true" },
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
