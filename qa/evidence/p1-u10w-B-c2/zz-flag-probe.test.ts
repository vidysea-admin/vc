/**
 * Hostile probes for coordinator B / wiring (p1-u10w cycle 1). Reads the real startApi like voice-wiring.test.ts does. Synthetic only.
 * Results are printed as `PROBE <id> ...` lines on stderr so they are in the raw log.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type Server } from "node:http";
import { connect as netConnect, type AddressInfo } from "node:net";
import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import type { Db } from "mongodb";
import { COLLECTION_NAMES, VC_DB_NAME, createChatThread, getStudentUsage, tenantScopedDb, usageMonth } from "@vc/db";
import { createFakeMongoClient } from "@vc/db/testing";
import { MockLiveProvider, type LiveProvider } from "@vc/providers";
import { createJwtVerifier, jwtConfigFromEnv } from "../src/auth.js";
import { startApi } from "../src/index.js";
import { CRISIS_AUDIO, CRISIS_PHRASE, CRISIS_TEXT_FIXED, adult, studentToken, until } from "./voice-fixtures.js";
import { SKILLS_DIR, SPEAKERS, cleanupGates, gatesFixture, kbAnswerProvider, recordingKb, studentVerifier } from "./chat-fixtures.js";

const VOICE_GATES = { gProd: "Answered: 2026-10-16T10:10:00+05:30 - c - all three including voice\n" };
const REPO_GATES = fileURLToPath(new URL("../../../qa/gates", import.meta.url));
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
const counsellorVerifier = createJwtVerifier(jwtConfigFromEnv({ VC_JWT_ISSUER: "https://issuer.synthetic.test", VC_JWT_PUBLIC_KEY: PEM }));
const CRISIS = { message: { text: CRISIS_TEXT_FIXED, audio: CRISIS_AUDIO } };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const P = (id: string, msg: string) => process.stderr.write(`PROBE ${id} ${msg}\n`);

async function freePort(): Promise<number> {
  const s: Server = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as AddressInfo).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}
function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = netConnect(port, "127.0.0.1");
    s.once("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.once("error", () => resolve(false));
  });
}

interface Boot {
  api: Awaited<ReturnType<typeof startApi>>;
  fake: ReturnType<typeof createFakeMongoClient>;
  provider: MockLiveProvider;
  port: number;
  db: Db;
  secret: Uint8Array;
  stop(): Promise<void>;
}
async function boot(
  env: Record<string, string | undefined>,
  voice: Record<string, unknown> | undefined,
  extra: { chat?: Record<string, unknown>; fake?: ReturnType<typeof createFakeMongoClient>; gatesDir?: string } = {},
): Promise<Boot> {
  const fake = extra.fake ?? createFakeMongoClient();
  const gates = gatesFixture(VOICE_GATES);
  const provider = new MockLiveProvider();
  const port = await freePort();
  const secret = new Uint8Array(randomBytes(32));
  const api = await startApi(
    { MONGODB_URL: "mongodb://fake-host/ignored", ...env },
    {
      clientFactory: () => fake.client,
      http: {
        port,
        verifier: counsellorVerifier,
        provider: kbAnswerProvider(),
        skillsDir: SKILLS_DIR,
        ...(voice
          ? { voice: { live: provider, crisis: CRISIS, wsSecret: secret, wsBaseUrl: `ws://127.0.0.1:${port}`, verifier: studentVerifier(), gatesDir: extra.gatesDir ?? gates.gates, ...voice } }
          : {}),
        ...(extra.chat ? { chat: { gatesDir: gates.gates, ...extra.chat } } : {}),
      } as any,
    },
  );
  const db = tenantScopedDb(fake.dbFor(VC_DB_NAME) as unknown as Db, "tenant-a");
  let stopped = false;
  return {
    api,
    fake,
    provider,
    port,
    db,
    secret,
    async stop() {
      if (!stopped) {
        stopped = true;
        await api.stop();
      }
      cleanupGates(gates);
    },
  };
}
const sessionUrl = (port: number, threadId: string) => `http://127.0.0.1:${port}/v1/students/stu-1/chat/threads/${threadId}/voice/sessions`;
const streamUrl = (port: number, threadId: string) => `ws://127.0.0.1:${port}/v1/students/stu-1/chat/threads/${threadId}/voice/stream`;
async function mintToken(b: Boot, threadId: string): Promise<{ status: number; token?: string }> {
  const jwt = await studentToken(adult());
  const res = await fetch(sessionUrl(b.port, threadId), { method: "POST", headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" }, body: "{}" });
  const json: any = await res.json().catch(() => ({}));
  return { status: res.status, token: json.token };
}
function openSocket(port: number, threadId: string, token: string): Promise<{ ws: WebSocket; events: any[] } | { status: number }> {
  return new Promise((resolve) => {
    const events: any[] = [];
    const ws = new WebSocket(streamUrl(port, threadId), ["vc-voice-v1"], { headers: { authorization: `Bearer ${token}` } });
    ws.on("message", (data, isBinary) => {
      if (!isBinary) events.push(JSON.parse((data as Buffer).toString("utf8")));
    });
    ws.on("unexpected-response", (_q, res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0 });
    });
    ws.on("open", () => resolve({ ws, events }));
    ws.on("error", () => resolve({ status: 0 }));
  });
}
async function startedSession(b: Boot, threadId = "th-w") {
  await createChatThread(b.db, { studentId: "stu-1", textStored: true, threadId });
  const m = await mintToken(b, threadId);
  assert.equal(m.status, 201);
  const sock = await openSocket(b.port, threadId, m.token!);
  assert.ok("ws" in sock, "the upgrade was accepted");
  if (!("ws" in sock)) throw new Error("unreachable");
  sock.ws.send(JSON.stringify({ type: "start", threadId }));
  await until(() => b.provider.backends.length === 1, "the provider session after start");
  return { ws: sock.ws, events: sock.events, threadId };
}

// ---------------------------------------------------------------- p1 flag values
for (const raw of [undefined, "", "false", "0", "1", "TRUE", "True", " true", "true ", "\ttrue\n", "yes", "on", "tru", "truee", "false ", "FALSE", "true ", " true", "tRue", "true\r\n", "﻿true", "true\u0000"]) {
  test(`p1 flag ${JSON.stringify(raw)}: must be off or refuse (only exactly "true" may enable voice)`, async () => {
    const env = raw === undefined ? {} : { VC_VOICE_ENABLED: raw };
    let outcome: string;
    let b: Boot | undefined;
    let connects = 0;
    try {
      const open = new MockLiveProvider();
      const orig = open.connect.bind(open);
      (open as any).connect = async (c: any) => {
        connects++;
        return orig(c);
      };
      b = await boot(env, { live: open });
      const threadId = "th-p1";
      await createChatThread(b.db, { studentId: "stu-1", textStored: true, threadId });
      const m = await mintToken(b, threadId);
      if (m.status === 201) {
        const sock = await openSocket(b.port, threadId, m.token!);
        outcome = "ENABLED (session minted 201; ws " + ("ws" in sock ? "upgraded" : "refused " + sock.status) + ")";
        if ("ws" in sock) sock.ws.close();
      } else outcome = `OFF (session route ${m.status})`;
    } catch (e) {
      outcome = `REFUSED-AT-STARTUP ${(e as Error).name}: ${(e as Error).message.slice(0, 90)}`;
    } finally {
      await b?.stop();
    }
    P("p1", `${JSON.stringify(raw)} -> ${outcome}; providerConnects=${connects}`);
    assert.ok(!outcome.startsWith("ENABLED"), `value ${JSON.stringify(raw)} enabled voice although it is not exactly "true": ${outcome}`);
  });
}

// ---------------------------------------------------------------- p2 real gates
test("p2 flag true with the REAL repo qa/gates: startApi rejects and nothing listens", async () => {
  const fake = createFakeMongoClient();
  let connected = 0;
  (fake.client as any).connect = async () => void connected++;
  const port = await freePort();
  let err: Error | undefined;
  await startApi(
    { MONGODB_URL: "mongodb://fake-host/ignored", VC_VOICE_ENABLED: "true" },
    {
      clientFactory: () => fake.client,
      http: { port, verifier: counsellorVerifier, provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, voice: { live: new MockLiveProvider(), crisis: CRISIS, wsSecret: new Uint8Array(randomBytes(32)), wsBaseUrl: `ws://127.0.0.1:${port}`, verifier: studentVerifier(), gatesDir: REPO_GATES } } as any,
    },
  ).catch((e) => void (err = e));
  const up = await listening(port);
  P("p2", `real gates: err=${err?.name} msg=${err?.message.slice(0, 160)} mongoConnect=${connected} listening=${up}`);
  assert.ok(err, "startApi must reject");
  assert.equal(connected, 0);
  assert.equal(up, false);
  // Also with the gatesDir option OMITTED: default must be the repo gates (closed).
  const port2 = await freePort();
  let err2: Error | undefined;
  await startApi(
    { MONGODB_URL: "mongodb://fake-host/ignored", VC_VOICE_ENABLED: "true" },
    {
      clientFactory: () => fake.client,
      http: { port: port2, verifier: counsellorVerifier, provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, voice: { live: new MockLiveProvider(), crisis: CRISIS, wsSecret: new Uint8Array(randomBytes(32)), wsBaseUrl: `ws://127.0.0.1:${port2}`, verifier: studentVerifier() } } as any,
    },
  ).catch((e) => void (err2 = e));
  P("p2b", `default gatesDir: err=${err2?.name} msg=${err2?.message.slice(0, 160)} listening=${await listening(port2)}`);
  assert.ok(err2, "default gates dir must refuse too");
  assert.equal(await listening(port2), false);
});

// ---------------------------------------------------------------- p3 missing pieces
const P3: Array<{ name: string; env?: Record<string, string>; voice?: Record<string, unknown> | "none" }> = [
  { name: "no live", voice: { live: undefined } },
  { name: "no crisis", voice: { crisis: undefined } },
  { name: "no voice options at all", voice: "none" },
  { name: "secret 31 bytes", voice: { wsSecret: new Uint8Array(31) } },
  { name: "secret 0 bytes", voice: { wsSecret: new Uint8Array(0) } },
  { name: "secret not Uint8Array (string)", voice: { wsSecret: "a-string-secret-that-is-longer-than-thirty-two-bytes" } },
  { name: "tracing LANGSMITH_TRACING=true", env: { LANGSMITH_TRACING: "true" } },
  { name: "tracing LANGSMITH_TRACING_V2=1", env: { LANGSMITH_TRACING_V2: "1" } },
  { name: "tracing LANGCHAIN_TRACING=yes", env: { LANGCHAIN_TRACING: "yes" } },
  { name: "tracing LANGCHAIN_TRACING_V2=ON", env: { LANGCHAIN_TRACING_V2: "ON" } },
  { name: "tracing LANGCHAIN_TRACING_V2=' true '", env: { LANGCHAIN_TRACING_V2: " true " } },
  { name: "base url http://", voice: { wsBaseUrl: "http://x.example" } },
  { name: "base url https://", voice: { wsBaseUrl: "https://x.example" } },
  { name: "base url empty", voice: { wsBaseUrl: "" } },
  { name: "base url ws:// bare", voice: { wsBaseUrl: "ws://" } },
  { name: "base url with space", voice: { wsBaseUrl: "ws://a b" } },
  { name: "base url ftp", voice: { wsBaseUrl: "ftp://x" } },
];
for (const c of P3) {
  test(`p3 flag true + open gate + ${c.name}: rejects before listening, connect never called`, async () => {
    const fake = createFakeMongoClient();
    let mongoConnected = 0;
    (fake.client as any).connect = async () => void mongoConnected++;
    const gates = gatesFixture(VOICE_GATES);
    const port = await freePort();
    const live = new MockLiveProvider();
    let liveConnects = 0;
    const orig = live.connect.bind(live);
    (live as any).connect = async (x: any) => (liveConnects++, orig(x));
    const base = { live, crisis: CRISIS, wsSecret: new Uint8Array(randomBytes(32)), wsBaseUrl: `ws://127.0.0.1:${port}`, verifier: studentVerifier(), gatesDir: gates.gates };
    const voice = c.voice === "none" ? undefined : { ...base, ...(c.voice ?? {}) };
    let err: Error | undefined;
    let api: any;
    try {
      api = await startApi(
        { MONGODB_URL: "mongodb://fake-host/ignored", VC_VOICE_ENABLED: "true", ...(c.env ?? {}) },
        { clientFactory: () => fake.client, http: { port, verifier: counsellorVerifier, provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, ...(voice ? { voice } : {}) } as any },
      );
    } catch (e) {
      err = e as Error;
    }
    const up = await listening(port);
    if (api) await api.stop();
    cleanupGates(gates);
    P("p3", `${c.name} -> err=${err?.name}: ${err?.message.slice(0, 70)} mongoConnect=${mongoConnected} liveConnects=${liveConnects} listening=${up}`);
    assert.ok(err, `${c.name}: expected rejection`);
    assert.equal(mongoConnected, 0, "mongo not connected");
    assert.equal(liveConnects, 0, "live provider never connected");
    assert.equal(up, false, "nothing listening");
  });
}
test("p3 env-sourced secret/base url: VC_VOICE_WS_SECRET unset or short -> reject; VC_VOICE_WS_BASE_URL unset -> reject", async () => {
  for (const [name, env, voice] of [
    ["env secret unset", { VC_VOICE_WS_BASE_URL: "wss://v.example" }, { wsSecret: undefined, wsBaseUrl: undefined }],
    ["env secret short", { VC_VOICE_WS_SECRET: "short", VC_VOICE_WS_BASE_URL: "wss://v.example" }, { wsSecret: undefined, wsBaseUrl: undefined }],
    ["env base unset", { VC_VOICE_WS_SECRET: "x".repeat(40) }, { wsSecret: undefined, wsBaseUrl: undefined }],
  ] as Array<[string, Record<string, string>, Record<string, unknown>]>) {
    let err: Error | undefined;
    let b: Boot | undefined;
    try {
      b = await boot({ VC_VOICE_ENABLED: "true", ...env }, voice);
    } catch (e) {
      err = e as Error;
    }
    await b?.stop();
    P("p3env", `${name} -> ${err?.name}`);
    assert.ok(err, name);
  }
});

// ---------------------------------------------------------------- p4 flag off but options passed
test("p4 flag off (unset/false) but voice options passed: no route, upgrade refused, connect never called", async () => {
  for (const env of [{}, { VC_VOICE_ENABLED: "false" }]) {
    const live = new MockLiveProvider();
    let connects = 0;
    const orig = live.connect.bind(live);
    (live as any).connect = async (x: any) => (connects++, orig(x));
    const b = await boot(env, { live });
    try {
      const jwt = await studentToken(adult());
      const res = await fetch(sessionUrl(b.port, "th-x"), { method: "POST", headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" }, body: "{}" });
      await res.arrayBuffer();
      // forge a structurally valid token with the very secret passed in the options
      const forged = await new SignJWT({ tenant: "tenant-a", studentId: "stu-1", threadId: "th-x", sid: randomUUID(), minor: false, guardianConsent: true })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuer("vc-voice") // best guess; the real value is irrelevant: the route must not exist
        .setAudience("vc-voice-ws")
        .setJti(randomUUID())
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + 60)
        .sign(b.secret);
      const sock = await openSocket(b.port, "th-x", forged);
      const other = await fetch(`http://127.0.0.1:${b.port}/v1/students/stu-1/chat/threads/th-x/voice/stream`, { headers: { connection: "Upgrade", upgrade: "websocket", "sec-websocket-version": "13", "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==" } }).then((r) => r.status).catch((e) => `err:${e.cause?.code ?? e.message}`);
      P("p4", `${JSON.stringify(env)} -> sessionRoute=${res.status} wsUpgrade=${"ws" in sock ? "UPGRADED" : sock.status} rawUpgradeGET=${other} liveConnects=${connects}`);
      assert.ok([401, 403, 404].includes(res.status));
      assert.ok(!("ws" in sock));
      assert.equal(connects, 0);
    } finally {
      await b.stop();
    }
  }
});

// ---------------------------------------------------------------- p5 token handling
test("p5 flag on: valid token reaches provider; token from ANOTHER secret / reused / other thread refused before connect", async () => {
  const b = await boot({ VC_VOICE_ENABLED: "true" }, {});
  try {
    const threadId = "th-p5";
    await createChatThread(b.db, { studentId: "stu-1", textStored: true, threadId });
    const mk = async (secret: Uint8Array, thread = threadId) =>
      new SignJWT({ tenant: "tenant-a", studentId: "stu-1", threadId: thread, sid: randomUUID(), minor: false, guardianConsent: true })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuer("PLACEHOLDER")
        .setAudience("vc-voice-ws")
        .setJti(randomUUID())
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + 60)
        .sign(secret);
    // get the true issuer by minting a real token and reading it
    const real = await mintToken(b, threadId);
    const payload = JSON.parse(Buffer.from(real.token!.split(".")[1]!, "base64url").toString());
    const mkIss = async (secret: Uint8Array, thread = threadId) =>
      new SignJWT({ tenant: "tenant-a", studentId: "stu-1", threadId: thread, sid: randomUUID(), minor: false, guardianConsent: true })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuer(payload.iss)
        .setAudience(payload.aud)
        .setJti(randomUUID())
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + 60)
        .sign(secret);
    void mk;
    const wrongSecret = await mkIss(new Uint8Array(randomBytes(32)));
    const r1 = await openSocket(b.port, threadId, wrongSecret);
    const goodForgeSameSecret = await mkIss(b.secret); // sanity: a token with the right secret and shape works => the verification is only the secret
    const r2 = await openSocket(b.port, threadId, goodForgeSameSecret);
    const noneAlg = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${real.token!.split(".")[1]}.`;
    const r3 = await openSocket(b.port, threadId, noneAlg);
    const r4 = await openSocket(b.port, "th-other", await mkIss(b.secret, threadId)); // path names another thread
    P("p5", `wrongSecret=${"ws" in r1 ? "UPGRADED" : r1.status} rightSecretForged=${"ws" in r2 ? "upgraded" : r2.status} algNone=${"ws" in r3 ? "UPGRADED" : r3.status} pathMismatch=${"ws" in r4 ? "UPGRADED" : r4.status} providerBackendsBeforeStart=${b.provider.backends.length}`);
    assert.ok(!("ws" in r1), "token minted with another secret refused");
    assert.ok(!("ws" in r3));
    assert.ok(!("ws" in r4));
    assert.equal(b.provider.backends.length, 0, "no provider connect so far (no start sent)");
    if ("ws" in r2) r2.ws.close();
    // real flow
    const r5 = await openSocket(b.port, threadId, real.token!);
    assert.ok("ws" in r5, "valid token upgrades");
    if ("ws" in r5) {
      r5.ws.send(JSON.stringify({ type: "start", threadId }));
      await until(() => b.provider.backends.length >= 1, "provider reached");
      // reuse of the spent token
      const reuse = await openSocket(b.port, threadId, real.token!);
      P("p5b", `validTokenReachesProvider backends=${b.provider.backends.length}; reuseOfSpentToken=${"ws" in reuse ? "UPGRADED" : reuse.status}`);
      assert.ok(!("ws" in reuse));
      r5.ws.close();
    }
  } finally {
    await b.stop();
  }
});

// ---------------------------------------------------------------- p6 shutdown ordering
test("p6a live session: provider-close and usage precede db close; websocket closes 1001", async () => {
  const fake = createFakeMongoClient();
  const events: string[] = [];
  const inner6 = new MockLiveProvider();
  const live6 = { kind: "mock", connect: async (cfg: any) => {
    const sess = await inner6.connect(cfg);
    const c0 = sess.close.bind(sess);
    (sess as any).close = (r?: string) => (events.push("provider-close"), c0(r));
    return sess;
  } } as unknown as LiveProvider;
  const b = await boot({ VC_VOICE_ENABLED: "true" }, { live: live6 }, { fake });
  (b as any).provider = inner6;
  const realClose = fake.client.close.bind(fake.client);
  let usage = -1;
  (fake.client as any).close = async () => {
    usage = (await getStudentUsage(b.db, { studentId: "stu-1", month: usageMonth(new Date()) })).voiceMs;
    events.push(`db-close(usage=${usage})`);
    return realClose();
  };
  try {
    const s = await startedSession(b);
    const be = b.provider.backends[0]!;
    const origClose = (be as any).close?.bind(be);
    void origClose;
    const closed = new Promise<number>((r) => s.ws.on("close", (code) => (events.push("ws-closed"), r(code))));
    await sleep(30);
    events.push("stop-called");
    await b.api.stop();
    events.push("stop-returned");
    const code = await closed;
    const providerClosed = be.calls.some((x) => x.type === "close");
    P("p6a", `events=${events.join(" > ")} wsCode=${code} providerClosed=${providerClosed}`);
    assert.ok(usage > 0);
    assert.ok(providerClosed);
    assert.ok(events.findIndex((e) => e.startsWith("db-close")) > events.indexOf("stop-called"));
  } finally {
    await b.stop();
  }
});

test("p6b gated slow drain: voice close waits for in-flight escalation (bounded) before the db closes", async () => {
  for (const mode of ["released", "never"] as const) {
    const fake = createFakeMongoClient();
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const delivered: any[] = [];
    const b = await boot(
      { VC_VOICE_ENABLED: "true" },
      { drainTimeoutMs: 600, escalateForTenant: () => async (input: any) => {
        events.push("esc-start");
        if (mode === "released") await gate;
        else await new Promise<never>(() => undefined);
        delivered.push(input);
        events.push("esc-delivered");
      } },
      { fake },
    );
    const realClose = fake.client.close.bind(fake.client);
    (fake.client as any).close = async () => (events.push("db-close"), realClose());
    try {
      const s = await startedSession(b);
      b.provider.backends[0]!.emitInputTranscript(CRISIS_PHRASE, true);
      await until(() => events.includes("esc-start"), "escalation started");
      const t0 = Date.now();
      events.push("stop-called");
      const stopping = b.api.stop().then(() => events.push("stop-returned"));
      if (mode === "released") {
        await sleep(250);
        events.push("release");
        release();
      }
      await stopping;
      const took = Date.now() - t0;
      P("p6b", `mode=${mode} took=${took}ms events=${events.join(" > ")}`);
      if (mode === "released") assert.ok(events.indexOf("esc-delivered") < events.indexOf("db-close"), "escalation delivered before db closed");
      else assert.ok(took < 3000, "bounded");
      void s;
    } finally {
      await b.stop();
    }
  }
});

test("p6c stop() during an in-flight start (provider connect gated) does not hang; the late provider session is not leaked", async () => {
  const inner = new MockLiveProvider();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let entered = 0;
  const sessions: any[] = [];
  const live = {
    kind: "mock",
    connect: async (cfg: any) => {
      entered++;
      await gate;
      const s = await inner.connect(cfg);
      sessions.push(s);
      return s;
    },
  } as unknown as LiveProvider;
  const b = await boot({ VC_VOICE_ENABLED: "true" }, { live });
  try {
    const threadId = "th-p6c";
    await createChatThread(b.db, { studentId: "stu-1", textStored: true, threadId });
    const m = await mintToken(b, threadId);
    const sock = await openSocket(b.port, threadId, m.token!);
    assert.ok("ws" in sock);
    if (!("ws" in sock)) return;
    sock.ws.send(JSON.stringify({ type: "start", threadId }));
    await until(() => entered === 1, "connect in flight");
    const t0 = Date.now();
    let outcome = "";
    const stopP = b.api.stop().then(() => (outcome = `stop resolved in ${Date.now() - t0}ms`));
    const raced = await Promise.race([stopP.then(() => "resolved"), sleep(8000).then(() => "HUNG-8s")]);
    P("p6c", `stop() during gated connect -> ${raced} (${outcome})`);
    release();
    await sleep(300);
    await Promise.race([stopP, sleep(5000)]);
    const open = inner.backends.map((bk) => bk.calls.some((x) => x.type === "close"));
    P("p6c2", `after release: provider sessions created=${inner.backends.length} closedFlags=${JSON.stringify(open)} liveSessionsStats(not exposed)`);
    assert.equal(raced, "resolved", "stop must not hang");
    assert.ok(inner.backends.every((_bk, i) => open[i]), "late provider session closed (no leak)");
  } finally {
    release();
    await b.stop();
  }
});

// ---------------------------------------------------------------- p7 one flag, one escalation
test("p7a chat ON with explicit chat port: voice crisis reaches that port exactly once with tenantId and threadId; default escalateTurns not used", async () => {
  const seen: Array<{ tenantId: string; input: any }> = [];
  const b = await boot(
    { VC_VOICE_ENABLED: "true", VC_CHAT_ENABLED: "true" },
    {},
    { chat: { kb: recordingKb(), speakers: SPEAKERS, verifier: studentVerifier(), escalateForTenant: (tenantId: string) => async (input: any) => void seen.push({ tenantId, input }) } },
  );
  try {
    const s = await startedSession(b);
    b.provider.backends[0]!.emitInputTranscript(CRISIS_PHRASE, true);
    await until(() => seen.length >= 1, "escalated");
    await sleep(400);
    const notif = b.fake.dbFor(VC_DB_NAME).collection<any>(COLLECTION_NAMES.escalation_notifications).all().length;
    P("p7a", `calls=${seen.length} tenantId=${seen[0]?.tenantId} sessionId=${seen[0]?.input.sessionId} threadId=${s.threadId} defaultNotifications=${notif} flags=${b.fake.dbFor(VC_DB_NAME).collection<any>("student_flags").all().length}`);
    assert.equal(seen.length, 1);
    assert.equal(seen[0]!.tenantId, "tenant-a");
    assert.equal(seen[0]!.input.sessionId, s.threadId);
    assert.equal(notif, 0);
    s.ws.close();
  } finally {
    await b.stop();
  }
});
test("p7b chat OFF: voice crisis reaches default escalateTurns once (record count stable, no duplicates)", async () => {
  const b = await boot({ VC_VOICE_ENABLED: "true" }, {});
  try {
    const s = await startedSession(b);
    b.provider.backends[0]!.emitInputTranscript(CRISIS_PHRASE, true);
    const col = () => b.fake.dbFor(VC_DB_NAME).collection<any>(COLLECTION_NAMES.escalation_notifications).all();
    await until(() => col().length > 0, "records");
    await sleep(500);
    const docs = col();
    const ids = new Set(docs.map((d: any) => d._id));
    P("p7b", `notifications=${docs.length} uniqueIds=${ids.size} kinds=${[...new Set(docs.map((d: any) => d.kind))]} sessionIds=${[...new Set(docs.map((d: any) => d.sessionId))]} flags=${b.fake.dbFor(VC_DB_NAME).collection<any>("student_flags").all().length}`);
    assert.equal(docs.length, ids.size);
    s.ws.close();
  } finally {
    await b.stop();
  }
});
test("p7c chat ON without explicit port (default shared) : voice crisis uses the same default once", async () => {
  const b = await boot({ VC_VOICE_ENABLED: "true", VC_CHAT_ENABLED: "true" }, {}, { chat: { kb: recordingKb(), speakers: SPEAKERS, verifier: studentVerifier() } });
  try {
    const s = await startedSession(b);
    b.provider.backends[0]!.emitInputTranscript(CRISIS_PHRASE, true);
    const col = () => b.fake.dbFor(VC_DB_NAME).collection<any>(COLLECTION_NAMES.escalation_notifications).all();
    await until(() => col().length > 0, "records");
    await sleep(400);
    P("p7c", `notifications=${col().length} uniqueIds=${new Set(col().map((d: any) => d._id)).size}`);
    s.ws.close();
  } finally {
    await b.stop();
  }
});
