/**
 * golive-launcher: the production launcher's configuration builder (apps/api/src/main.ts). Synthetic values only (B13); no
 * network (the KB clients are built but never called by the builder tests), no real Mongo (fake client), no listening
 * socket except the loopback test server that startApi opens on port 0.
 */
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
    MONGODB_URL: "mongodb://fake-host/ignored",
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
