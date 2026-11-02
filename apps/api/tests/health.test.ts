/**
 * devops-handover H1: GET /health (liveness) and GET /ready (readiness). Both are unauthenticated, answer before every other
 * wrapper (so the anonymous limiter never sees them), and leak nothing: the body is a fixed one-key literal, never a host,
 * error text, env value or version. Fakes only: no real Mongo, no real listener other than a 127.0.0.1 port-0 test server.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createJwtVerifier, jwtConfigFromEnv } from "../src/auth.js";
import { READY_PING_TIMEOUT_MS, respond, withHealthRoutes, type ApiHandler, type ApiRequest } from "../src/server.js";
import { ANONYMOUS_PATH } from "../src/anonymous.js";
import { startApi } from "../src/index.js";
import { VC_DB_NAME } from "@vc/db";
import { createFakeMongoClient } from "@vc/db/testing";
import { SKILLS_DIR, SPEAKERS, cleanupGates, gatesFixture, kbAnswerProvider, recordingKb } from "./anonymous-fixtures.js";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
const verifier = createJwtVerifier(jwtConfigFromEnv({ VC_JWT_ISSUER: "https://issuer.synthetic.test", VC_JWT_PUBLIC_KEY: PEM }));

const SECRET_HOST = "mongodb://svc-user:s3cr3t-pass@db-internal.example.invalid:27017/virtual_counsellor";

function req(method: string, url: string, headers: ApiRequest["headers"] = {}): ApiRequest {
  return { method, url, headers, readBody: async () => "" };
}

function spyMain() {
  const calls: string[] = [];
  const main: ApiHandler = async (r) => {
    calls.push(`${r.method} ${r.url}`);
    return respond(404, { error: "not_found" });
  };
  return { main, calls };
}

test("H1: GET /health is 200 {status: ok}, needs no auth, and calls neither the ping nor the rest of the stack", async () => {
  const { main, calls } = spyMain();
  let pings = 0;
  const h = withHealthRoutes(main, { ping: async () => void (pings += 1) });
  const res = await h(req("GET", "/health"));
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body), { status: "ok" });
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(pings, 0, "liveness makes no dependency call");
  assert.deepEqual(calls, [], "answered before the rest of the handler stack (no auth, no limiter)");
  const withQuery = await h(req("GET", "/health?probe=lb"));
  assert.equal(withQuery.status, 200);
});

test("H1: GET /ready is 200 {status: ready} when the ping succeeds, exactly one ping, no auth", async () => {
  const { main, calls } = spyMain();
  let pings = 0;
  const h = withHealthRoutes(main, { ping: async () => void (pings += 1) });
  const res = await h(req("GET", "/ready"));
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body), { status: "ready" });
  assert.equal(pings, 1);
  assert.deepEqual(calls, []);
});

test("H1: GET /ready is 503 {status: unavailable} on a failing ping, and the body and logs carry no host, error text or secret", async () => {
  const logged: unknown[][] = [];
  const e = mock.method(console, "error", (...a: unknown[]) => void logged.push(a));
  const l = mock.method(console, "log", (...a: unknown[]) => void logged.push(a));
  try {
    for (const ping of [
      async () => {
        throw new Error(`connect ECONNREFUSED ${SECRET_HOST}`);
      },
      () => {
        throw new Error(`sync failure ${SECRET_HOST}`);
      },
    ]) {
      const h = withHealthRoutes(spyMain().main, { ping });
      const res = await h(req("GET", "/ready"));
      assert.equal(res.status, 503);
      assert.deepEqual(JSON.parse(res.body), { status: "unavailable" });
      assert.doesNotMatch(res.body + JSON.stringify(res.headers), /mongodb|s3cr3t|db-internal|ECONNREFUSED|27017|version/i);
    }
  } finally {
    e.mock.restore();
    l.mock.restore();
  }
  assert.deepEqual(logged, [], "neither route logs anything");
});

test("H1: GET /ready is 503 when the ping is slower than the readiness deadline (about 1 s by default)", async () => {
  assert.ok(READY_PING_TIMEOUT_MS >= 500 && READY_PING_TIMEOUT_MS <= 1500, "the default deadline is about 1 s");
  const h = withHealthRoutes(spyMain().main, { ping: () => new Promise<void>(() => {}), timeoutMs: 25 });
  const started = Date.now();
  const res = await h(req("GET", "/ready"));
  assert.equal(res.status, 503);
  assert.deepEqual(JSON.parse(res.body), { status: "unavailable" });
  assert.ok(Date.now() - started < 1000, "answered at the deadline, not when the hung ping settles");
});

test("H1: a ping that fails AFTER its deadline is swallowed (no unhandled rejection)", async () => {
  let reject!: (e: Error) => void;
  const late = new Promise<void>((_, r) => {
    reject = r;
  });
  const h = withHealthRoutes(spyMain().main, { ping: () => late, timeoutMs: 10 });
  const res = await h(req("GET", "/ready"));
  assert.equal(res.status, 503);
  const unhandled: unknown[] = [];
  const onUnhandled = (r: unknown) => void unhandled.push(r);
  process.on("unhandledRejection", onUnhandled);
  try {
    reject(new Error("late failure"));
    await new Promise((r) => setTimeout(r, 20));
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
  assert.deepEqual(unhandled, []);
});

test("H1: other methods on the two paths are 405 (no ping); every other path, including near-misses, falls through to the stack (404)", async () => {
  const { main, calls } = spyMain();
  let pings = 0;
  const h = withHealthRoutes(main, { ping: async () => void (pings += 1) });
  for (const path of ["/health", "/ready"]) {
    const res = await h(req("POST", path));
    assert.equal(res.status, 405);
    assert.equal(res.headers.allow, "GET");
  }
  assert.equal(pings, 0);
  for (const path of ["/healthz", "/health/", "/health/x", "/ready/", "/readyz", "/v1/health", "/"]) {
    const res = await h(req("GET", path));
    assert.equal(res.status, 404, path);
  }
  assert.equal(calls.length, 7, "near-miss paths are handed on, not answered");
});

// ---------------------------------------------------------------------------
// Over real HTTP and startApi
// ---------------------------------------------------------------------------

test("H1: startApi serves /health and /ready over real HTTP, the ping hits the virtual_counsellor client, a failing ping is 503, an unknown path is still 404", async () => {
  const fake = createFakeMongoClient();
  const api = await startApi(
    { MONGODB_URL: "mongodb://fake-host/ignored" },
    { clientFactory: () => fake.client, http: { port: 0, verifier, provider: kbAnswerProvider(), skillsDir: SKILLS_DIR } },
  );
  try {
    const base = `http://127.0.0.1:${api.port}`;
    const commands: unknown[] = [];
    let fail = false;
    const db = fake.dbFor(VC_DB_NAME) as unknown as { command: (c: unknown) => Promise<unknown> };
    db.command = async (c) => {
      commands.push(c);
      if (fail) throw new Error(`boom ${SECRET_HOST}`);
      return { ok: 1 };
    };

    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });
    assert.deepEqual(commands, [], "liveness did not ping");

    const ready = await fetch(`${base}/ready`);
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { status: "ready" });
    assert.deepEqual(commands, [{ ping: 1 }]);

    fail = true;
    const down = await fetch(`${base}/ready`);
    assert.equal(down.status, 503);
    const downText = await down.text();
    assert.deepEqual(JSON.parse(downText), { status: "unavailable" });
    assert.doesNotMatch(downText, /s3cr3t|db-internal|mongodb|boom/);

    assert.equal((await fetch(`${base}/healthz`)).status, 404);
    assert.equal((await fetch(`${base}/v1/students/syn-1/export`)).status, 401, "the rest of the API is still authenticated");
    assert.deepEqual([...new Set(fake.dbCalls)], ["virtual_counsellor"]);
  } finally {
    await api.stop();
  }
});

test("H1: /health and /ready are not counted by the anonymous limiter (20 probes, then the first anonymous request is still answered)", async () => {
  const fake = createFakeMongoClient();
  const f = gatesFixture();
  const api = await startApi(
    { MONGODB_URL: "mongodb://fake-host/ignored", VC_GATE_APPROVER: "Umesh", VC_ANONYMOUS_ENABLED: "true" },
    { clientFactory: () => fake.client, http: { port: 0, verifier, provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, anonymous: { kb: recordingKb(), speakers: SPEAKERS, gatesDir: f.gates, trustSocketAddress: true } } },
  );
  try {
    const base = `http://127.0.0.1:${api.port}`;
    (fake.dbFor(VC_DB_NAME) as unknown as { command: () => Promise<unknown> }).command = async () => ({ ok: 1 });
    for (let i = 0; i < 10; i++) {
      assert.equal((await fetch(`${base}/health`)).status, 200);
      assert.equal((await fetch(`${base}/ready`)).status, 200);
    }
    const anon = await fetch(`${base}${ANONYMOUS_PATH}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "hello" }) });
    assert.equal(anon.status, 200, "the per-client budget (10 per minute) was not spent by the probes");
    await anon.arrayBuffer();
  } finally {
    await api.stop();
    cleanupGates(f);
  }
});
