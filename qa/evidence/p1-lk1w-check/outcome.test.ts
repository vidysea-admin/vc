// Checker-owned outcome proof for p1-lk1w (lives OUTSIDE the bound tree). Drives the real startApi over real loopback HTTP with
// globalThis.fetch stubbed: the two synthetic hosts are answered by the stub, loopback passes through, any other host is BLOCKED and
// recorded (so no network call can happen). Evidence lines go to $EVID (jsonl).
import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const WT = process.env.WT ?? "D:/vc/.worktrees/lk1w";
const ORIG = "D:/vc/.worktrees/lk1w";
const u = (p: string) => pathToFileURL(`${WT}/${p}`).href;
const uo = (p: string) => pathToFileURL(`${ORIG}/${p}`).href;
const req = createRequire(`${WT}/apps/api/package.json`);
const { SignJWT } = await import(pathToFileURL(req.resolve("jose")).href);
const { startApi } = await import(u("apps/api/src/index.ts"));
const { ANONYMOUS_PATH } = await import(u("apps/api/src/anonymous.ts"));
const { createJwtVerifier, jwtConfigFromEnv } = await import(u("apps/api/src/auth.ts"));
const cf: any = await import(u("apps/api/tests/chat-fixtures.ts"));
const af: any = await import(u("apps/api/tests/anonymous-fixtures.ts"));
const { createFakeMongoClient } = await import(uo("packages/db/src/testing.ts"));
const { tenantScopedDb, COLLECTION_NAMES, VC_DB_NAME } = await import(uo("packages/db/src/index.ts"));
const { ANONYMOUS_CRISIS_MESSAGE, STUDENT_CRISIS_MESSAGE } = await import(u("packages/engine/src/student/graph.ts"));
const { concernClassifierProviderConfig } = await import(u("packages/engine/src/guards/concern-classifier.ts"));
const { loadTextChainConfig } = await import(uo("packages/providers/src/index.ts"));

const EVID = process.env.EVID ?? "D:/chk-lk1w/evidence/outcome.jsonl";
const ev = (name: string, data: unknown) => appendFileSync(EVID, JSON.stringify({ name, data }) + "\n");

const OLLAMA = "http://ollama.synthetic.test";
const LITELLM = "http://litellm.synthetic.test";
const SECRET_OLLAMA = "OLLAMA-SECRET-KEY-aaaa1111";
const SECRET_LLM = "LITELLM-SECRET-KEY-bbbb2222";
const GOOD = { claims: [af.GOOD_CLAIM] };

type Call = { kind: "ollama" | "litellm" | "BLOCKED"; url: string; model?: string; t: number };
let calls: Call[] = [];
let ollamaBehavior: (model: string, n: number, signal?: AbortSignal | null) => Promise<Response> = async () => ollamaOk();
const ollamaOk = (content: unknown = GOOD) => new Response(JSON.stringify({ message: { role: "assistant", content: JSON.stringify(content) }, done: true }), { status: 200 });
const litellmOk = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 });
const realFetch = globalThis.fetch;
const t0 = () => Date.now();
globalThis.fetch = (async (input: any, init?: RequestInit) => {
  const url = String(typeof input === "string" ? input : input?.url ?? input);
  if (url.startsWith("http://127.0.0.1")) return realFetch(input, init);
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  if (url.startsWith(OLLAMA)) {
    calls.push({ kind: "ollama", url, model: body.model, t: t0() });
    return ollamaBehavior(body.model, calls.filter((c) => c.kind === "ollama").length, init?.signal);
  }
  if (url.startsWith(LITELLM)) {
    calls.push({ kind: "litellm", url, model: body.model, t: t0() });
    return body.model === "main-model-x" ? litellmOk(GOOD) : litellmOk({});
  }
  calls.push({ kind: "BLOCKED", url, t: t0() });
  throw new Error(`blocked non-stub host ${url}`);
}) as typeof fetch;
const reset = (b?: typeof ollamaBehavior) => { calls = []; ollamaBehavior = b ?? (async () => ollamaOk()); };
const tally = () => ({
  ollama: calls.filter((c) => c.kind === "ollama").map((c) => `${c.url.replace(OLLAMA, "")}#${c.model}`),
  litellm: calls.filter((c) => c.kind === "litellm").map((c) => `${c.url.replace(LITELLM, "")}#${c.model}`),
  blocked: calls.filter((c) => c.kind === "BLOCKED").map((c) => c.url),
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ck = generateKeyPairSync("rsa", { modulusLength: 2048 });
const counsellorVerifier = createJwtVerifier(jwtConfigFromEnv({ VC_JWT_ISSUER: "https://issuer.checker.test", VC_JWT_PUBLIC_KEY: ck.publicKey.export({ type: "spki", format: "pem" }).toString() }));
const counsellorToken = (tenant: string) => new SignJWT({ tenant, counsellorId: "c-1", role: "counsellor" }).setProtectedHeader({ alg: "RS256" }).setIssuer("https://issuer.checker.test").setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) + 300).sign(ck.privateKey);

const BASE_ENV: Record<string, string> = {
  MONGODB_URL: "mongodb://fake-host/ignored",
  VC_LLM_PROVIDER: "litellm", VC_LLM_MODEL: "main-model-x", VC_LLM_BASE_URL: LITELLM, VC_LLM_API_KEY: SECRET_LLM,
  VC_CONCERN_MODEL: "classifier-model-x", VC_CONCERN_SAMPLE_RATES: "latin=1,devanagari=1,other=1",
  VC_CHAT_ENABLED: "true", VC_ANONYMOUS_ENABLED: "true",
};
const CHAIN_DEFAULT = { VC_TEXT_CHAIN: "default", OLLAMA_API_KEY: SECRET_OLLAMA, OLLAMA_BASE_URL: OLLAMA };

async function withApi<T>(envExtra: Record<string, string | undefined>, fn: (w: { base: string; fake: any; f: any }) => Promise<T>): Promise<T> {
  const fake = createFakeMongoClient();
  const f = af.gatesFixture();
  const api = await startApi({ ...BASE_ENV, ...envExtra }, {
    clientFactory: () => fake.client,
    http: {
      port: 0, verifier: counsellorVerifier, skillsDir: af.SKILLS_DIR,
      chat: { kb: af.recordingKb(), speakers: af.SPEAKERS, gatesDir: f.gates, verifier: cf.studentVerifier() },
      anonymous: { kb: af.recordingKb(), speakers: af.SPEAKERS, gatesDir: f.gates, trustSocketAddress: true },
    },
  });
  try {
    return await fn({ base: `http://127.0.0.1:${api.port}`, fake, f });
  } finally {
    await api.stop();
    af.cleanupGates(f);
  }
}

async function chatTurn(base: string, text: string, id: string) {
  const headers = { authorization: `Bearer ${await cf.studentToken(cf.adult())}`, "content-type": "application/json" };
  const { threadId } = (await (await realFetch(`${base}${cf.threadsPath("stu-1")}`, { method: "POST", headers })).json()) as any;
  const res = await realFetch(`${base}${cf.turnsPath("stu-1", threadId)}`, { method: "POST", headers, body: JSON.stringify({ text, clientTurnId: id }) });
  return { status: res.status, json: (await res.json()) as any };
}
async function anonAsk(base: string, text: string) {
  const res = await realFetch(`${base}${ANONYMOUS_PATH}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
  return { status: res.status, json: (await res.json()) as any };
}
async function scribe(w: { base: string; fake: any }) {
  const tenant = "tenant-a";
  await tenantScopedDb(w.fake.dbFor(VC_DB_NAME), tenant).collection(COLLECTION_NAMES.consents).insertOne({ _id: "consent-s1", studentId: "s1", guardianConsent: true, purposes: ["profile_synthesis", "counselling_session"], recordedAt: "2026-09-01T00:00:00.000Z", minor: true } as never);
  const text = "Honestly, so much pressure I can't cope, everything feels like too much right now.";
  const body = { sessionEndedAt: "2026-09-25T10:00:00.000Z", turns: [
    { turnId: "t1", speaker: "student", lang: "en", text: "I want to study computer science in Canada.", translatedText: "I want to study computer science in Canada.", ts: 1 },
    { turnId: "t4", speaker: "student", lang: "en", text, translatedText: text, ts: 4 } ] };
  const res = await realFetch(`${w.base}/v1/students/s1/sessions/sess1/scribe`, { method: "POST", headers: { authorization: `Bearer ${await counsellorToken(tenant)}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, text: (await res.text()).slice(0, 200) };
}

const Q = cf.GERMANY_QUESTION as string;

test("O1 chain UNSET: chat, anonymous, scribe and classifier are all served by the VC_LLM_* provider (litellm); zero Ollama calls", async () => {
  reset();
  await withApi({}, async (w) => {
    const c = await chatTurn(w.base, Q, "o1-c"); const cT = tally(); await sleep(300);
    const chatT = tally();
    assert.equal(c.status, 200); assert.equal(c.json.state, "ok");
    reset();
    const a = await anonAsk(w.base, Q); await sleep(100);
    const anonT = tally();
    assert.equal(a.status, 200); assert.equal(a.json.state, "ok");
    reset();
    const s = await scribe(w); await sleep(300);
    const scribeT = tally();
    ev("O1", { chat: { out: c.json.state, ...chatT }, anon: { out: a.json.state, ...anonT }, scribe: { status: s.status, ...scribeT } });
    assert.equal(chatT.ollama.length, 0); assert.equal(anonT.ollama.length, 0); assert.equal(scribeT.ollama.length, 0);
    assert.ok(chatT.litellm.some((x) => x.endsWith("#main-model-x")), "chat served by litellm main model");
    assert.ok(anonT.litellm.some((x) => x.endsWith("#main-model-x")), "anon served by litellm main model");
    assert.ok(scribeT.litellm.some((x) => x.endsWith("#main-model-x")), "scribe served by litellm main model");
    assert.ok(scribeT.litellm.some((x) => x.endsWith("#classifier-model-x")), "classifier called on litellm classifier model");
    assert.deepEqual(chatT.blocked.concat(anonT.blocked, scribeT.blocked), []);
  });
});

test("O2 chain SET (default): chat and anonymous served by Ollama glm first hop; scribe + classifier stay on litellm", async () => {
  reset();
  await withApi(CHAIN_DEFAULT, async (w) => {
    const c = await chatTurn(w.base, Q, "o2-c"); await sleep(300);
    const chatT = tally();
    assert.equal(c.status, 200); assert.equal(c.json.state, "ok");
    reset();
    const a = await anonAsk(w.base, Q); await sleep(100);
    const anonT = tally();
    assert.equal(a.json.state, "ok");
    reset();
    const s = await scribe(w); await sleep(300);
    const scribeT = tally();
    ev("O2", { chat: { out: c.json.state, ...chatT }, anon: { out: a.json.state, ...anonT }, scribe: { status: s.status, ...scribeT } });
    assert.deepEqual(chatT.ollama, ["/api/chat#glm-5.3-flash"]);
    assert.ok(!chatT.litellm.some((x) => x.endsWith("#main-model-x")), "chat turn never on litellm main model");
    assert.ok(chatT.litellm.every((x) => x.endsWith("#classifier-model-x")), "only the classifier uses litellm during a chat turn");
    assert.deepEqual(anonT.ollama, ["/api/chat#glm-5.3-flash"]);
    assert.deepEqual(anonT.litellm, []);
    assert.deepEqual(scribeT.ollama, [], "scribe + classifier never reach the chain");
    assert.ok(scribeT.litellm.some((x) => x.endsWith("#main-model-x")), "scribe on litellm main model");
    assert.ok(scribeT.litellm.some((x) => x.endsWith("#classifier-model-x")), "classifier on litellm classifier model");
    assert.deepEqual(chatT.blocked.concat(anonT.blocked, scribeT.blocked), []);
  });
});

test("O3 DeepSeek-first order is honoured (config only)", async () => {
  reset();
  await withApi({ ...CHAIN_DEFAULT, VC_TEXT_CHAIN: "ollama:deepseek-v4.1-flash,ollama:glm-5.3-flash" }, async (w) => {
    await chatTurn(w.base, Q, "o3-c"); const a = await anonAsk(w.base, Q);
    ev("O3", tally());
    assert.equal(a.json.state, "ok");
    assert.deepEqual(tally().ollama, ["/api/chat#deepseek-v4.1-flash", "/api/chat#deepseek-v4.1-flash"]);
  });
});

for (const mode of ["http503", "timeout", "http500-then-ok"] as const) {
  test(`O4 first hop ${mode}: the second hop answers inside the deadline (chat and anonymous)`, async () => {
    const behavior = async (model: string, _n: number, signal?: AbortSignal | null) => {
      if (model === "glm-5.3-flash") {
        if (mode === "timeout") return new Promise<Response>((_res, rej) => { signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))); });
        return new Response("upstream down", { status: mode === "http503" ? 503 : 500 });
      }
      return ollamaOk();
    };
    reset(behavior);
    await withApi({ ...CHAIN_DEFAULT, VC_TEXT_CHAIN_HOP_TIMEOUT_MS: "400", VC_TEXT_CHAIN_DEADLINE_MS: "5000" }, async (w) => {
      const s1 = Date.now(); const c = await chatTurn(w.base, Q, "o4-c"); const d1 = Date.now() - s1;
      const chatT = tally(); reset(behavior);
      const s2 = Date.now(); const a = await anonAsk(w.base, Q); const d2 = Date.now() - s2;
      const anonT = tally();
      ev(`O4-${mode}`, { chat: { out: c.json.state, ms: d1, ...chatT }, anon: { out: a.json.state, ms: d2, ...anonT } });
      assert.equal(c.json.state, "ok"); assert.equal(a.json.state, "ok");
      assert.deepEqual(chatT.ollama, ["/api/chat#glm-5.3-flash", "/api/chat#deepseek-v4.1-flash"]);
      assert.deepEqual(anonT.ollama, ["/api/chat#glm-5.3-flash", "/api/chat#deepseek-v4.1-flash"]);
      assert.ok(d1 < 5000 && d2 < 5000, `answered inside the 5000ms deadline (${d1}, ${d2})`);
    });
  });
}

test("O5 both hops down: bounded by the deadline, no hang, informational outcome", async () => {
  reset(async () => new Response("down", { status: 503 }));
  await withApi({ ...CHAIN_DEFAULT, VC_TEXT_CHAIN_DEADLINE_MS: "3000" }, async (w) => {
    const s1 = Date.now(); const c = await chatTurn(w.base, Q, "o5-c"); const d1 = Date.now() - s1;
    const chatT = tally(); reset(async () => new Response("down", { status: 503 }));
    const s2 = Date.now(); const a = await anonAsk(w.base, Q); const d2 = Date.now() - s2;
    ev("O5", { chat: { status: c.status, state: c.json?.state, msg: JSON.stringify(c.json).slice(0, 300), ms: d1, ...chatT }, anon: { status: a.status, state: a.json?.state, msg: JSON.stringify(a.json).slice(0, 300), ms: d2, ...tally() } });
    assert.ok(d1 < 6000 && d2 < 6000);
  });
});

test("O6 crisis text, chain set: zero Ollama calls in chat and anonymous; fixed helpline reply", async () => {
  reset();
  await withApi(CHAIN_DEFAULT, async (w) => {
    const crisisTexts = ["I want to kill myself", "mujhe marna hai, main apni jaan dena chahta hoon", "I want to end my life tonight"];
    const out: any[] = [];
    for (const [i, t] of crisisTexts.entries()) {
      reset();
      const a = await anonAsk(w.base, t); const anonT = tally();
      reset();
      const c = await chatTurn(w.base, t, `o6-c${i}`); await sleep(300); const chatT = tally();
      out.push({ text: t, anon: { status: a.status, json: a.json, ...anonT }, chat: { status: c.status, json: c.json, ...chatT } });
      assert.equal(anonT.ollama.length, 0, `anon crisis #${i}: zero chain calls`);
      assert.equal(anonT.litellm.length, 0, `anon crisis #${i}: zero model calls`);
      assert.equal(chatT.ollama.length, 0, `chat crisis #${i}: zero chain calls`);
      assert.equal(a.json.state, "escalated"); assert.equal(a.json.message, ANONYMOUS_CRISIS_MESSAGE, `anon crisis #${i}: the fixed helpline reply`);
      assert.equal(c.status, 200); assert.ok(JSON.stringify(c.json).includes(STUDENT_CRISIS_MESSAGE), `chat crisis #${i}: the fixed helpline reply`);
    }
    ev("O6", out);
  });
});

test("O7 hostile config: missing hop key / bad price / malformed chain all fail BEFORE connect, with no secret value in the error", async () => {
  const cases: [string, Record<string, string | undefined>][] = [
    ["default, OLLAMA_API_KEY missing", { VC_TEXT_CHAIN: "default", OLLAMA_BASE_URL: OLLAMA }],
    ["default, OLLAMA_API_KEY blank", { VC_TEXT_CHAIN: "default", OLLAMA_API_KEY: "   " }],
    ["unknown model with key", { VC_TEXT_CHAIN: "ollama:no-such-model-9", OLLAMA_API_KEY: SECRET_OLLAMA }],
    ["empty entries ,", { VC_TEXT_CHAIN: ",", OLLAMA_API_KEY: SECRET_OLLAMA }],
    ["ollama: empty id", { VC_TEXT_CHAIN: "ollama:", OLLAMA_API_KEY: SECRET_OLLAMA }],
    ["no prefix", { VC_TEXT_CHAIN: "glm-5.3-flash", OLLAMA_API_KEY: SECRET_OLLAMA }],
    ["gemini entry", { VC_TEXT_CHAIN: "gemini:lite", OLLAMA_API_KEY: SECRET_OLLAMA }],
    ["semicolon separator", { VC_TEXT_CHAIN: "ollama:glm-5.3-flash;ollama:deepseek-v4.1-flash", OLLAMA_API_KEY: SECRET_OLLAMA }],
    ["upper-case prefix", { VC_TEXT_CHAIN: "OLLAMA:glm-5.3-flash", OLLAMA_API_KEY: SECRET_OLLAMA }],
    ["bad hop timeout abc", { ...CHAIN_DEFAULT, VC_TEXT_CHAIN_HOP_TIMEOUT_MS: "abc" }],
    ["bad hop timeout 0", { ...CHAIN_DEFAULT, VC_TEXT_CHAIN_HOP_TIMEOUT_MS: "0" }],
    ["bad deadline -5", { ...CHAIN_DEFAULT, VC_TEXT_CHAIN_DEADLINE_MS: "-5" }],
    ["bad deadline 1.5", { ...CHAIN_DEFAULT, VC_TEXT_CHAIN_DEADLINE_MS: "1.5" }],
    ["VC_LLM_PROVIDER=ollama (chain not reachable through provider config)", { VC_LLM_PROVIDER: "ollama" }],
  ];
  const rows: any[] = [];
  for (const [label, envx] of cases) {
    let connected = 0, factoryCalls = 0, started = false, err = "";
    const fake = createFakeMongoClient();
    (fake.client as any).connect = async () => { connected += 1; };
    const f = af.gatesFixture();
    let api: any;
    try {
      api = await startApi({ ...BASE_ENV, ...envx }, { clientFactory: () => { factoryCalls += 1; return fake.client; }, http: { port: 0, verifier: counsellorVerifier, skillsDir: af.SKILLS_DIR, chat: { kb: af.recordingKb(), speakers: af.SPEAKERS, gatesDir: f.gates, verifier: cf.studentVerifier() }, anonymous: { kb: af.recordingKb(), speakers: af.SPEAKERS, gatesDir: f.gates, trustSocketAddress: true } } });
      started = true;
    } catch (e: any) {
      err = `${e?.name}: ${e?.message}`;
      const whole = JSON.stringify({ n: e?.name, m: e?.message, s: e?.stack, c: String(e?.cause ?? "") });
      for (const secret of [SECRET_OLLAMA, SECRET_LLM]) assert.ok(!whole.includes(secret), `${label}: error leaks a key value`);
    } finally {
      if (api) await api.stop();
      af.cleanupGates(f);
    }
    rows.push({ label, started, connected, factoryCalls, err });
    assert.equal(started, false, `${label}: must refuse`);
    assert.equal(connected, 0, `${label}: refused BEFORE connect`);
    assert.equal(factoryCalls, 0, `${label}: refused before the client was even built`);
  }
  ev("O7", rows);
});

test("O8 blank / whitespace / case variants that are tolerated by design", async () => {
  const rows: any[] = [];
  for (const v of ["", "   ", " default ", "DEFAULT", "Default"]) {
    reset();
    const r = await withApi({ ...CHAIN_DEFAULT, VC_TEXT_CHAIN: v }, async (w) => { const a = await anonAsk(w.base, Q); return { st: a.json.state, ...tally() }; });
    rows.push({ value: JSON.stringify(v), ...r });
  }
  ev("O8", rows);
});

test("O9 classifier base: ollama chain config is refused; litellm and mock bases still work", async () => {
  const chainCfg = loadTextChainConfig({ VC_TEXT_CHAIN: "default", OLLAMA_API_KEY: SECRET_OLLAMA, OLLAMA_BASE_URL: OLLAMA });
  let msg = "";
  try { concernClassifierProviderConfig(chainCfg, { model: "classifier-model-x" }); } catch (e: any) { msg = String(e?.message); }
  const lit = concernClassifierProviderConfig({ provider: "litellm", model: "m", baseUrl: LITELLM, models: ["a", "b"], maxAttempts: 3 }, { model: "classifier-model-x" });
  const mock = concernClassifierProviderConfig({ provider: "mock", model: "m" }, { model: "classifier-model-x" });
  ev("O9", { refusal: msg, litellm: lit, mock });
  assert.match(msg, /not a classifier base/);
  assert.ok(!msg.includes(SECRET_OLLAMA));
  assert.equal(lit.model, "classifier-model-x"); assert.equal((lit as any).models, undefined);
  assert.equal(mock.model, "classifier-model-x");
});
