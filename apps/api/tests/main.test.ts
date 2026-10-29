/**
 * golive-launcher: the production launcher's configuration builder (apps/api/src/main.ts). Synthetic values only (B13); no
 * network (the KB clients are built but never called by the builder tests), no real Mongo (fake client), no listening
 * socket except the loopback test server that startApi opens on port 0.
 */
import { createHash } from "node:crypto";
import { crisisMessageFor } from "@vc/engine";
import { GeminiLiveProvider, MockLiveProvider, type GeminiLiveConnector, type GeminiLiveConnection } from "@vc/providers";
import { VC_DB_NAME, tenantScopedDb, createChatThread } from "@vc/db";
import { WebSocket } from "ws";
import { studentVerifier, studentToken, adult } from "./chat-fixtures.js";
import { until } from "./voice-fixtures.js";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { createFakeMongoClient } from "@vc/db/testing";
import { CLIENT_KEY_HEADER, LauncherConfigError, buildLauncherConfig, clientKeyFromRequest, describeStartupError, launch, loadSpeakers } from "../src/main.js";
import { ANONYMOUS_PATH } from "../src/anonymous.js";
import { SKILLS_DIR, cleanupGates, gatesFixture, kbAnswerProvider } from "./anonymous-fixtures.js";

const KB = { VC_KB_BASE_URL: "http://127.0.0.1:1", VC_KB_ANON_API_KEY: "synthetic-anon-key", VC_KB_API_KEY: "synthetic-chat-key" };
const STUDENT_JWT = { VC_STUDENT_JWT_ALGORITHMS: "HS256", VC_STUDENT_JWT_ISSUER: "https://issuer.synthetic.test", VC_STUDENT_JWT_AUDIENCE: "vc-student", VC_STUDENT_JWT_HS256_SECRET: "s".repeat(40) };
const req = (headers: Record<string, string | string[] | undefined>) => ({ headers });

// (a) anonymous refuses without its KB config
test("a: VC_ANONYMOUS_ENABLED=true without the KB URL or the search-only key refuses to start, naming the variable", () => {
  assert.throws(() => buildLauncherConfig({ VC_ANONYMOUS_ENABLED: "true" }), (e: unknown) => e instanceof LauncherConfigError && /VC_KB_BASE_URL/.test(e.message));
  assert.throws(() => buildLauncherConfig({ VC_ANONYMOUS_ENABLED: "true", VC_KB_BASE_URL: KB.VC_KB_BASE_URL }), (e: unknown) => e instanceof LauncherConfigError && /VC_KB_ANON_API_KEY/.test(e.message));
  // the chat key is never a fallback for the anonymous (search-only) key
  assert.throws(
    () => buildLauncherConfig({ VC_ANONYMOUS_ENABLED: "true", VC_KB_BASE_URL: KB.VC_KB_BASE_URL, VC_KB_API_KEY: KB.VC_KB_API_KEY }),
    (e: unknown) => e instanceof LauncherConfigError && /VC_KB_ANON_API_KEY/.test(e.message),
  );
  const ok = buildLauncherConfig({ VC_ANONYMOUS_ENABLED: "true", VC_KB_BASE_URL: KB.VC_KB_BASE_URL, VC_KB_ANON_API_KEY: KB.VC_KB_ANON_API_KEY });
  assert.equal(ok.host, "127.0.0.1");
  assert.ok(ok.anonymous?.kb && ok.anonymous.speakers && ok.anonymous.clientKey);
  assert.equal(ok.chat, undefined);
  assert.equal(typeof ok.anonymous.kb.searchKb, "function");
  assert.equal((ok.anonymous.kb as { askKnowledgeBase?: unknown }).askKnowledgeBase, undefined, "the anonymous port is search-only");
  assert.throws(() => buildLauncherConfig({ VC_ANONYMOUS_ENABLED: "yes" }), /must be "true" or "false"/);
});

test("a: with both flags off the builder serves nothing and binds loopback", () => {
  assert.deepEqual(buildLauncherConfig({}), { host: "127.0.0.1" });
  assert.deepEqual(buildLauncherConfig({ VC_ANONYMOUS_ENABLED: "false", VC_CHAT_ENABLED: "false" }), { host: "127.0.0.1" });
});

// (b) the client key
test("b: the client key is X-Real-IP; X-Forwarded-For (any entry) is ignored", () => {
  assert.equal(CLIENT_KEY_HEADER, "x-real-ip");
  assert.equal(clientKeyFromRequest(req({ "x-real-ip": "203.0.113.9" })), "203.0.113.9");
  assert.equal(clientKeyFromRequest(req({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1, 10.0.0.1" })), "203.0.113.9");
  assert.equal(clientKeyFromRequest(req({ "x-forwarded-for": "198.51.100.1" })), undefined, "XFF alone is not a client key");
  assert.equal(clientKeyFromRequest(req({ "x-real-ip": "not-an-ip", "x-forwarded-for": "198.51.100.1" })), undefined);
  assert.equal(clientKeyFromRequest(req({ "x-real-ip": ["203.0.113.9", "198.51.100.1"] })), undefined, "a repeated header is not what nginx sets");
  assert.equal(clientKeyFromRequest(req({ "x-real-ip": "::ffff:203.0.113.9" })), "203.0.113.9", "IPv4-mapped IPv6 is normalised like the socket address");
  assert.equal(clientKeyFromRequest(req({})), undefined);
});

test("b: over real HTTP through launch(), the limiter keys on X-Real-IP and a rotating X-Forwarded-For does not buy a fresh bucket", async () => {
  const fake = createFakeMongoClient();
  const gates = gatesFixture();
  const env = {
    MONGODB_URL: "mongodb://fake-host/ignored", VC_GATE_APPROVER: "Umesh",
    VC_JWT_ISSUER: "https://issuer.synthetic.test",
    VC_JWT_ALGORITHMS: "HS256",
    VC_JWT_HS256_SECRET: "j".repeat(40),
    VC_ANONYMOUS_ENABLED: "true",
    VC_KB_BASE_URL: KB.VC_KB_BASE_URL,
    VC_KB_ANON_API_KEY: KB.VC_KB_ANON_API_KEY,
  };
  const api = await launch(env, { clientFactory: () => fake.client, http: { port: 0, provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, anonymous: { gatesDir: gates.gates } } });
  try {
    const post = (realIp: string | undefined, xff: string) =>
      fetch(`http://127.0.0.1:${api.port}${ANONYMOUS_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(realIp ? { "x-real-ip": realIp } : {}), "x-forwarded-for": xff },
        body: JSON.stringify({ text: "What are the tuition fees for public universities in Germany?" }),
      });
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) statuses.push((await post("203.0.113.9", `198.51.100.${i}`)).status);
    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(200));
    assert.equal(statuses[10], 429, "the 11th request from one X-Real-IP is limited however X-Forwarded-For changes");
    assert.equal((await post("203.0.113.10", "198.51.100.1")).status, 200, "another X-Real-IP has its own bucket");
  } finally {
    await api.stop();
    cleanupGates(gates);
  }
});

// (c) speakers
test("c: speakers default to an empty list, and a set file is parsed against the schema", () => {
  assert.deepEqual(loadSpeakers({}), { speakers: [] });
  assert.deepEqual(loadSpeakers({ VC_SPEAKERS_FILE: "  " }), { speakers: [] });
  const file = { speakers: [{ id: "spk-1", name: "Synthetic Speaker", aliases: ["S. Speaker"] }] };
  let asked = "";
  const parsed = loadSpeakers({ VC_SPEAKERS_FILE: "/etc/vc/speakers.json" }, (p) => ((asked = p), JSON.stringify(file)));
  assert.equal(asked, "/etc/vc/speakers.json");
  assert.deepEqual(parsed, file);
  // the builder carries it into the surface it enables
  const cfg = buildLauncherConfig({ VC_ANONYMOUS_ENABLED: "true", ...KB, VC_SPEAKERS_FILE: "x.json" }, { readFile: () => JSON.stringify(file) });
  assert.deepEqual(cfg.anonymous?.speakers, file);
  assert.deepEqual(buildLauncherConfig({ VC_ANONYMOUS_ENABLED: "true", ...KB }).anonymous?.speakers, { speakers: [] });
});

test("c: a speakers file that is set but unreadable or invalid refuses to start (never a silent empty list)", () => {
  assert.throws(
    () => loadSpeakers({ VC_SPEAKERS_FILE: "missing.json" }, () => {
      throw new Error("ENOENT");
    }),
    (e: unknown) => e instanceof LauncherConfigError && /VC_SPEAKERS_FILE/.test(e.message),
  );
  assert.throws(() => loadSpeakers({ VC_SPEAKERS_FILE: "bad.json" }, () => "{not json"), /VC_SPEAKERS_FILE/);
  assert.throws(() => loadSpeakers({ VC_SPEAKERS_FILE: "bad.json" }, () => JSON.stringify({ speakers: [{ id: "x" }] })), /VC_SPEAKERS_FILE/);
});

// (d) chat refuses without its config
test("d: VC_CHAT_ENABLED=true refuses to start when its config is missing, naming each missing variable", () => {
  assert.throws(() => buildLauncherConfig({ VC_CHAT_ENABLED: "true", ...STUDENT_JWT }), (e: unknown) => e instanceof LauncherConfigError && /VC_KB_BASE_URL/.test(e.message));
  assert.throws(() => buildLauncherConfig({ VC_CHAT_ENABLED: "true", VC_KB_BASE_URL: KB.VC_KB_BASE_URL, VC_KB_ANON_API_KEY: KB.VC_KB_ANON_API_KEY, ...STUDENT_JWT }), /VC_KB_API_KEY/);
  const { VC_STUDENT_JWT_ISSUER: _i, ...noIssuer } = STUDENT_JWT;
  assert.throws(() => buildLauncherConfig({ VC_CHAT_ENABLED: "true", ...KB, ...noIssuer }), /VC_STUDENT_JWT_ISSUER/);
  const { VC_STUDENT_JWT_HS256_SECRET: _s, ...noKey } = STUDENT_JWT;
  assert.throws(() => buildLauncherConfig({ VC_CHAT_ENABLED: "true", ...KB, ...noKey }), /VC_STUDENT_JWT_PUBLIC_KEY.*VC_STUDENT_JWT_HS256_SECRET/);
  assert.throws(
    () => buildLauncherConfig({ VC_CHAT_ENABLED: "true", ...KB, ...STUDENT_JWT, VC_STUDENT_JWT_HS256_SECRET: "tooshortsecret" }),
    (e: unknown) => e instanceof LauncherConfigError && /VC_STUDENT_JWT/.test((e as Error).message) && !/tooshortsecret/.test((e as Error).message),
  );
  const ok = buildLauncherConfig({ VC_CHAT_ENABLED: "true", ...KB, ...STUDENT_JWT });
  assert.ok(ok.chat?.kb && ok.chat.speakers);
  assert.equal(typeof ok.chat.kb.searchKb, "function");
  assert.equal(typeof ok.chat.kb.askKnowledgeBase, "function");
  assert.equal(typeof ok.chat.kb.getSession, "function");
  assert.equal(ok.anonymous, undefined);
  assert.throws(() => buildLauncherConfig({ VC_CHAT_ENABLED: " true" }), /must be "true" or "false"/);
});

test("d: chat config present but the flag unset serves no chat", () => {
  assert.equal(buildLauncherConfig({ ...KB, ...STUDENT_JWT }).chat, undefined);
});

// (e) the startup failure line never carries a credential
test("e: describeStartupError redacts Mongo URI credentials and credential-shaped runs, and leaves a config error unchanged", () => {
  const leak = describeStartupError(new Error("connect failed for mongodb+srv://user:SENTINELPW@host/db?x=1"));
  assert.ok(!/SENTINELPW/.test(leak) && !/user:/.test(leak), leak);
  assert.equal(leak, "Error: connect failed for mongodb://***@host/db?x=1");
  // hostile variants: raw "@" in the password, upper-case scheme, a second URI, a secret run
  assert.ok(!/SENTINELPW|TAIL/.test(describeStartupError(new Error("x mongodb://u:SENTINELPW@TAIL@h:1/d"))));
  assert.ok(!/SENTINELPW/.test(describeStartupError(new Error("x MONGODB+SRV://u:SENTINELPW@h/d and mongodb://a:b@h2/d"))));
  assert.ok(!/SENTINELPW/.test(describeStartupError(new Error("bad key sk-SENTINELPW0123456789abcdef or token_SENTINELPW0123456789abcdef"))));
  assert.ok(!/SENTINELPW/.test(describeStartupError(Object.assign(new Error("m"), { name: "mongodb://u:SENTINELPW@h" }))));
  // a config error already names the variable and never a value; it passes through
  const cfg = new LauncherConfigError("VC_ANONYMOUS_ENABLED is enabled but VC_KB_BASE_URL is not set");
  assert.equal(describeStartupError(cfg), cfg.message);
  assert.equal(describeStartupError("a string"), "unknown error");
});

test("e: the real entrypoint prints no credential when a non-config startup error echoes a Mongo URI", () => {
  const env = {
    PATH: process.env.PATH ?? "",
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    VC_JWT_ISSUER: "https://issuer.synthetic.test",
    VC_JWT_ALGORITHMS: "HS256",
    VC_JWT_HS256_SECRET: "j".repeat(40),
    VC_LLM_PROVIDER: "mongodb+srv://user:SENTINELPW@host", // loadProviderConfig echoes the bad value in its message
  };
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/main.ts"], { cwd: new URL("..", import.meta.url), env, encoding: "utf8", timeout: 60_000 });
  const out = `${r.stdout}${r.stderr}`;
  assert.equal(r.status, 1, out);
  assert.match(out, /vc-api failed to start: Error: loadProviderConfig: VC_LLM_PROVIDER must be/);
  assert.match(out, /mongodb:\/\/\*\*\*@host/);
  assert.ok(!/SENTINELPW/.test(out), out);
});

// S7 fixtures prove wiring only: these bytes are NOT vetted crisis speech.
const VOICE_PCM = new Uint8Array([1, 0, 2, 0, 3, 0]);
const VOICE_ENV = { VC_VOICE_ENABLED: "true", GEMINI_API_KEY: "SENTINEL-GOOGLE-KEY", VC_VOICE_MODEL: "explicit-test-model", VC_VOICE_WS_SECRET: "w".repeat(40), VC_VOICE_WS_BASE_URL: "ws://127.0.0.1:9012", VC_VOICE_CRISIS_PCM_FILE: "synthetic.pcm", VC_VOICE_CRISIS_PCM_SHA256: createHash("sha256").update(VOICE_PCM).digest("hex") };
const NO_CONNECT: GeminiLiveConnector = { async connect() { throw new Error("must not connect during config"); } };

test("S7: voice-only builder requires explicit config, binds vetted text to bytes and never connects", () => {
  assert.throws(() => buildLauncherConfig({ VC_VOICE_ENABLED: "true" }), /GEMINI_API_KEY/);
  for (const name of Object.keys(VOICE_ENV).filter(n => n !== "VC_VOICE_ENABLED")) {
    const env: Record<string, string | undefined> = { ...VOICE_ENV }; delete env[name];
    assert.throws(() => buildLauncherConfig(env), LauncherConfigError, name);
  }
  const cfg = buildLauncherConfig(VOICE_ENV, { voiceConnector: NO_CONNECT, readBinaryFile: () => VOICE_PCM });
  assert.ok(cfg.voice?.live instanceof GeminiLiveProvider);
  assert.equal(cfg.voice.live.model, VOICE_ENV.VC_VOICE_MODEL);
  assert.equal(cfg.voice.crisis?.message.text, crisisMessageFor("en", "student"));
  assert.deepEqual(cfg.voice.crisis?.message.audio, VOICE_PCM);
  assert.equal(cfg.anonymous, undefined); assert.equal(cfg.chat, undefined);
});

test("S7: flag off does not read voice env, files or connector; exact parser retained", () => {
  const env = { VC_VOICE_ENABLED: "false", get GEMINI_API_KEY(): string { throw new Error("voice credential read"); }, get VC_VOICE_CRISIS_PCM_FILE(): string { throw new Error("asset read"); } };
  assert.deepEqual(buildLauncherConfig(env, { readBinaryFile: () => { throw new Error("asset read"); }, voiceConnector: NO_CONNECT }), { host: "127.0.0.1" });
  assert.throws(() => buildLauncherConfig({ VC_VOICE_ENABLED: "yes" }), /true.*false/);
});

test("S7: bad effective secret, URL, hash and non-raw/partial/empty/oversized audio refuse without leaking", () => {
  const readBinaryFile = () => VOICE_PCM;
  for (const patch of [ { VC_VOICE_WS_SECRET: "SENTINEL-SHORT" }, ...["ws://example.test", "wss://u:SENTINELPW@example.test", "wss://example.test?key=SENTINELPW", "wss://example.test#SENTINELPW", "https://example.test"].map(VC_VOICE_WS_BASE_URL => ({ VC_VOICE_WS_BASE_URL })), { VC_VOICE_CRISIS_PCM_SHA256: "bad-SENTINELPW" }, { VC_VOICE_CRISIS_PCM_SHA256: "0".repeat(64) } ]) {
    assert.throws(() => buildLauncherConfig({ ...VOICE_ENV, ...patch }, { readBinaryFile, voiceConnector: NO_CONNECT }), (e: unknown) => e instanceof LauncherConfigError && !/SENTINEL/.test(describeStartupError(e)));
  }
  for (const bytes of [new Uint8Array(), new Uint8Array([1]), Buffer.from("RIFF0000WAVE"), Buffer.from("ID3fake!"), new Uint8Array([255, 251, 0, 0]), new Uint8Array(2_880_002)]) {
    const env = { ...VOICE_ENV, VC_VOICE_CRISIS_PCM_SHA256: createHash("sha256").update(bytes).digest("hex") };
    assert.throws(() => buildLauncherConfig(env, { readBinaryFile: (_path, limit) => { assert.equal(limit, 2_880_000); return bytes; }, voiceConnector: NO_CONNECT }), LauncherConfigError);
  }
  assert.throws(() => buildLauncherConfig(VOICE_ENV, { readBinaryFile: () => { throw new Error("SENTINELPW unreadable"); } }), (e: unknown) => e instanceof LauncherConfigError && !/SENTINELPW/.test(e.message));
});

test("S7: exact launch/startApi voice-only path mints an owned socket and reaches the injected connector; shutdown closes it", async () => {
  const fake = createFakeMongoClient(), gates = gatesFixture({ gProd: "Answered: 2026-10-16T10:10:00+05:30 - c - all three including voice\n" });
  let connects = 0, closes = 0;
  const connection: GeminiLiveConnection = {
    sendRealtimeInput() { assert.equal(this, connection); },
    sendToolResponse() { assert.equal(this, connection); },
    close() { assert.equal(this, connection); closes++; },
  };
  const connector: GeminiLiveConnector = { async connect(input) { connects++; assert.equal(input.model, VOICE_ENV.VC_VOICE_MODEL); assert.ok(input.config.responseModalities); return connection; } };
  const api = await launch({ ...VOICE_ENV, MONGODB_URL: "mongodb://fake-host/ignored", VC_GATE_APPROVER: "Umesh" }, {
    clientFactory: () => fake.client,
    http: { port: 0, provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, verifier: { verify: async () => { throw new Error("student test only"); } }, voice: { verifier: studentVerifier(), gatesDir: gates.gates } },
  }, { voiceConnector: connector, readBinaryFile: () => VOICE_PCM });
  let socket: WebSocket | undefined;
  try {
    assert.equal(connects, 0, "startup never connects to the paid provider");
    const db = tenantScopedDb(fake.dbFor(VC_DB_NAME) as any, "tenant-a");
    const thread = await createChatThread(db, { studentId: "stu-1", textStored: true });
    const base = `http://127.0.0.1:${api.port}/v1/students/stu-1/chat/threads/${thread.threadId}/voice`;
    const mint = await fetch(base + "/sessions", { method: "POST", headers: { authorization: `Bearer ${await studentToken(adult())}`, "content-type": "application/json" }, body: "{}" });
    assert.equal(mint.status, 201);
    const body: any = await mint.json();
    socket = new WebSocket(base.replace("http:", "ws:") + "/stream", ["vc-voice-v1", "vc-token." + body.token]);
    await new Promise<void>((resolve, reject) => { socket!.once("open", resolve); socket!.once("error", reject); });
    socket.send(JSON.stringify({ type: "start", threadId: thread.threadId }));
    await until(() => connects === 1, "injected connector reached after owned start");
    const closed = new Promise<void>(resolve => socket!.once("close", () => resolve()));
    await api.stop(); await closed;
    assert.equal(closes, 1);
  } finally { socket?.terminate(); await api.stop(); cleanupGates(gates); }
});

test("S7: complete trusted voice override needs no Google credential/asset; incomplete effective config fails before DB connect", async () => {
  const fake = createFakeMongoClient(), gates = gatesFixture({ gProd: "Answered: 2026-10-16T10:10:00+05:30 - c - voice\n" });
  let connects = 0;
  const original = fake.client.connect.bind(fake.client);
  fake.client.connect = async () => { connects++; return original(); };
  const voice = { live: new MockLiveProvider(), crisis: { message: { text: crisisMessageFor("en", "student"), audio: VOICE_PCM } }, wsSecret: new Uint8Array(40).fill(7), wsBaseUrl: "ws://127.0.0.1:9012", verifier: studentVerifier(), gatesDir: gates.gates };
  const env = { VC_VOICE_ENABLED: "true", MONGODB_URL: "mongodb://fake-host/ignored", VC_GATE_APPROVER: "Umesh" };
  const base = { port: 0, provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, verifier: { verify: async () => { throw Error("unused"); } } };
  await assert.rejects(launch(env, { clientFactory: () => fake.client, http: { ...base, voice: { ...voice, wsBaseUrl: "wss://example.test?secret=SENTINEL" } } }), LauncherConfigError);
  assert.equal(connects, 0);
  const api = await launch(env, { clientFactory: () => fake.client, http: { ...base, voice } });
  try { assert.equal(connects, 1); assert.ok(api.port); }
  finally { await api.stop(); cleanupGates(gates); }
});

test("T057: VC_KB_TIMEOUT_MS is optional and bounded; an out-of-range value refuses to start, naming the variable", () => {
  const base = { VC_ANONYMOUS_ENABLED: "true", ...KB, VC_KB_ANON_API_KEY: "anon-key" };
  assert.ok(buildLauncherConfig(base).anonymous);
  assert.ok(buildLauncherConfig({ ...base, VC_KB_TIMEOUT_MS: "25000" }).anonymous);
  for (const bad of ["999", "30001", "abc", "2.5"]) {
    assert.throws(() => buildLauncherConfig({ ...base, VC_KB_TIMEOUT_MS: bad }), (e: unknown) => e instanceof LauncherConfigError && /VC_KB_TIMEOUT_MS/.test(e.message), bad);
  }
});
