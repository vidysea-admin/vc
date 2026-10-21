/**
 * P1 U8 (spec A16b, D-093 item 6A/4A; B21 startApi wiring): the profile routes, the proposed-fact flow, and the chat routes over a real
 * HTTP server through startApi. Fake Db and mock provider only (B8); invented students and facts (B13).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { COLLECTION_NAMES, VC_DB_NAME, confirmErasure, requestErasure } from "@vc/db";
import { createFakeMongoClient } from "@vc/db/testing";
import { GoLiveRefusedError } from "../src/go-live-gate.js";
import { ChatConfigError } from "../src/chat.js";
import { JwtConfigError } from "../src/auth.js";
import { startApi } from "../src/index.js";
import { createJwtVerifier, jwtConfigFromEnv } from "../src/auth.js";
import { CRISIS_TEXT, GERMANY_QUESTION, adult, call, chatWorld, cleanupGates, gatesFixture, kbAnswerProvider, minor, newThread, profilePath, recordingKb, settle, studentToken, studentVerifier, threadsPath, turnsPath, SKILLS_DIR, SPEAKERS } from "./chat-fixtures.js";
import { generateKeyPairSync } from "node:crypto";
import { CHAIN_ENV, GOOD_CLAIM, chainRequestInput, stubOllamaFetch, stubOllamaRouted } from "./anonymous-fixtures.js";
import { MockProvider, RulesProvider, isRetryableProviderError } from "@vc/providers";
import { PROVIDER_APOLOGY_TEXT, STUDENT_CRISIS_MESSAGE, createStudentFactExtractor, detectLanguageOffline } from "@vc/engine";
import { CHAIN_MONTHLY_CAP_ENV, ChainBudgetExhaustedError, ChainSpendCapError, createChainSpendGuard, parseChainMonthlyCap } from "../src/index.js";

const PATHLYNKS = [{ key: "grade", value: "Grade 12, CBSE", source: "pathlynks" as const }];
const proposeGermany = () => [{ key: "target_country", value: "Germany" }];

/** Like assert.rejects for startApi, but if it wrongly starts, stop the server first so the failure is a clean red and not a hung process. */
async function mustRefuse(p: Promise<{ stop(): Promise<void> }>, err: new (...a: never[]) => Error): Promise<void> {
  let api: { stop(): Promise<void> } | undefined;
  try {
    api = await p;
  } catch (e) {
    assert.ok(e instanceof err, `expected ${err.name}`);
    return;
  }
  await api.stop();
  assert.fail("startApi started, but it must have refused");
}

async function askOnce(w: ReturnType<typeof chatWorld>, token: string, threadId: string, id: string) {
  const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: GERMANY_QUESTION, clientTurnId: id } });
  assert.equal(res.status, 200);
  await settle(); // p1-lk9 C2: extraction runs after the reply
  return res;
}

test("A16b: the profile shows the Pathlynks-supplied facts as in use and nothing else when the student has said nothing storable", async () => {
  const w = chatWorld({ deps: { profile: { facts: async () => PATHLYNKS } } });
  try {
    const token = await studentToken(adult());
    const res = await call(w, "GET", profilePath("stu-1"), { token });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { facts: PATHLYNKS, proposed: [] });
  } finally {
    w.cleanup();
  }
});

test("A16b: a fact heard in chat is proposed back, is NOT in the facts in use, and only becomes one after the student confirms it", async () => {
  const w = chatWorld({ deps: { profile: { facts: async () => PATHLYNKS }, extractFacts: async () => proposeGermany() } });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    await askOnce(w, token, threadId, "p-1");
    const before = await call(w, "GET", profilePath("stu-1"), { token });
    assert.deepEqual(before.json.facts, PATHLYNKS, "an unconfirmed chat fact is never in use");
    assert.equal(before.json.proposed.length, 1);
    const proposed = before.json.proposed[0];
    assert.deepEqual([proposed.key, proposed.value, proposed.status], ["target_country", "Germany", "proposed"]);
    const done = await call(w, "POST", `/v1/students/stu-1/chat/profile/facts/${proposed.factId}/decision`, { token, body: { action: "confirm" } });
    assert.equal(done.status, 200);
    assert.deepEqual(done.json.proposed, []);
    assert.deepEqual(done.json.facts, [...PATHLYNKS, { key: "target_country", value: "Germany", source: "student-confirmed" }]);
  } finally {
    w.cleanup();
  }
});

test("A16b: a student corrects a wrongly heard fact (the corrected value is redacted and confirmed) and erases another", async () => {
  const w = chatWorld({ deps: { extractFacts: async () => [{ key: "budget", value: "10 lakh" }, { key: "city", value: "Pune" }] } });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    await askOnce(w, token, threadId, "p-2");
    const { proposed } = (await call(w, "GET", profilePath("stu-1"), { token })).json;
    const budget = proposed.find((f: { key: string }) => f.key === "budget");
    const city = proposed.find((f: { key: string }) => f.key === "city");
    const corrected = await call(w, "POST", `/v1/students/stu-1/chat/profile/facts/${budget.factId}/decision`, { token, body: { action: "correct", value: "12 lakh, call 9876543210" } });
    assert.deepEqual(corrected.json.facts, [{ key: "budget", value: "12 lakh, call [PHONE]", source: "student-confirmed" }]);
    const erased = await call(w, "POST", `/v1/students/stu-1/chat/profile/facts/${city.factId}/decision`, { token, body: { action: "erase" } });
    assert.equal(erased.status, 200);
    assert.deepEqual(erased.json.proposed, []);
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.profile_facts).all().length, 1);
  } finally {
    w.cleanup();
  }
});

test("A16b: a decision on a fact that does not exist, or on another student's fact, is 404; a bad decision body is 400", async () => {
  const w = chatWorld({ deps: { extractFacts: async () => proposeGermany() } });
  try {
    const t1 = await studentToken(adult("stu-1"));
    const t2 = await studentToken(adult("stu-2"));
    const threadId = await newThread(w, t1);
    await askOnce(w, t1, threadId, "p-3");
    const factId = (await call(w, "GET", profilePath("stu-1"), { token: t1 })).json.proposed[0].factId;
    assert.equal((await call(w, "POST", `/v1/students/stu-2/chat/profile/facts/${factId}/decision`, { token: t2, body: { action: "confirm" } })).status, 404);
    assert.equal((await call(w, "POST", "/v1/students/stu-1/chat/profile/facts/nope/decision", { token: t1, body: { action: "confirm" } })).status, 404);
    for (const body of [{ action: "correct" }, { action: "delete" }, { action: "confirm", extra: 1 }, {}]) {
      assert.equal((await call(w, "POST", `/v1/students/stu-1/chat/profile/facts/${factId}/decision`, { token: t1, body })).status, 400, JSON.stringify(body));
    }
    assert.equal((await call(w, "GET", profilePath("stu-1"), { token: t1 })).json.proposed.length, 1, "the fact is untouched");
  } finally {
    w.cleanup();
  }
});

test("D-093 4A: for an under-18 student without consent nothing is extracted or proposed, so no fact row is created", async () => {
  let extractCalls = 0;
  const w = chatWorld({ deps: { extractFacts: async () => (extractCalls++, proposeGermany()) } });
  try {
    const token = await studentToken(minor());
    const threadId = await newThread(w, token);
    await askOnce(w, token, threadId, "p-4");
    assert.equal(extractCalls, 0);
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.profile_facts).all().length, 0);
  } finally {
    w.cleanup();
  }
});

test("a Pathlynks profile outage is a 503 profile_unavailable (never an empty profile that hides what is in use), with no cause in the body", async () => {
  const w = chatWorld({ deps: { profile: { facts: async () => { throw new Error("pathlynks down: token=secret-123"); } } } });
  try {
    const token = await studentToken(adult());
    const res = await call(w, "GET", profilePath("stu-1"), { token });
    assert.equal(res.status, 503);
    assert.deepEqual(res.json, { error: "profile_unavailable" });
    assert.ok(!JSON.stringify(w.logs).includes("secret-123"));
  } finally {
    w.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Over real HTTP and startApi
// ---------------------------------------------------------------------------

const counsellorKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const counsellorVerifier = createJwtVerifier(jwtConfigFromEnv({ VC_JWT_ISSUER: "https://issuer.synthetic.test", VC_JWT_PUBLIC_KEY: counsellorKeys.publicKey.export({ type: "spki", format: "pem" }).toString() }));
const httpBase = (extra: Record<string, unknown> = {}) => ({ port: 0, verifier: counsellorVerifier, provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, ...extra });

test("startApi: flag off -> a chat path answers exactly like an unknown /v1 path over real HTTP, and no gate file is read", async () => {
  const fake = createFakeMongoClient();
  const api = await startApi(
    { MONGODB_URL: "mongodb://fake-host/ignored" },
    { clientFactory: () => fake.client, http: httpBase({ chat: { kb: recordingKb(), speakers: SPEAKERS, gatesDir: "Z:/does/not/exist", verifier: studentVerifier() } }) },
  );
  try {
    const token = await studentToken(adult());
    const chat = await fetch(`http://127.0.0.1:${api.port}${threadsPath("stu-1")}`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    const unknown = await fetch(`http://127.0.0.1:${api.port}/v1/students/stu-1/nothing`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    assert.equal(chat.status, unknown.status);
    assert.equal(await chat.text(), await unknown.text());
    assert.deepEqual(fake.dbFor(VC_DB_NAME).collection("chat_threads").all(), []);
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
      { MONGODB_URL: "mongodb://fake-host/ignored", VC_CHAT_ENABLED: "true" },
      { clientFactory: () => fake.client, http: httpBase({ chat: { kb: recordingKb(), speakers: SPEAKERS, verifier: studentVerifier() } }) },
    ),
    GoLiveRefusedError,
  );
  assert.equal(connected, 0);
});

test("startApi: flag on with the gate open but no student JWT configuration is a config error before connecting (no silent fall-back to the counsellor key)", async () => {
  const fake = createFakeMongoClient();
  const f = gatesFixture();
  let connected = 0;
  (fake.client as unknown as { connect: () => Promise<void> }).connect = async () => {
    connected += 1;
  };
  try {
    await mustRefuse(
      startApi(
        { MONGODB_URL: "mongodb://fake-host/ignored", VC_CHAT_ENABLED: "true", VC_JWT_ISSUER: "https://issuer.synthetic.test", VC_JWT_AUDIENCE: "vc-api", VC_JWT_ALGORITHMS: "HS256", VC_JWT_HS256_SECRET: "synthetic-counsellor-secret-0123456789abcdef" },
        { clientFactory: () => fake.client, http: httpBase({ chat: { kb: recordingKb(), speakers: SPEAKERS, gatesDir: f.gates } }) },
      ),
      JwtConfigError,
    );
    await assert.rejects(
      startApi(
        { MONGODB_URL: "mongodb://fake-host/ignored", VC_CHAT_ENABLED: "true" },
        { clientFactory: () => fake.client, http: httpBase({ chat: { gatesDir: f.gates, verifier: studentVerifier() } }) },
      ),
      ChatConfigError,
    );
    assert.equal(connected, 0);
  } finally {
    cleanupGates(f);
  }
});

test("startApi: flag on and gate open -> a student creates a thread and asks a question over real HTTP; the rows land in virtual_counsellor under the student's tenant; a counsellor-key token is refused", async () => {
  const fake = createFakeMongoClient();
  const f = gatesFixture();
  const api = await startApi(
    { MONGODB_URL: "mongodb://fake-host/ignored", VC_CHAT_ENABLED: "true" },
    { clientFactory: () => fake.client, http: httpBase({ chat: { kb: recordingKb(), speakers: SPEAKERS, gatesDir: f.gates, verifier: studentVerifier() } }) },
  );
  try {
    const base = `http://127.0.0.1:${api.port}`;
    const token = await studentToken(adult());
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    const created = await fetch(`${base}${threadsPath("stu-1")}`, { method: "POST", headers });
    assert.equal(created.status, 201);
    const { threadId } = (await created.json()) as { threadId: string };
    const turn = await fetch(`${base}${turnsPath("stu-1", threadId)}`, { method: "POST", headers, body: JSON.stringify({ text: GERMANY_QUESTION, clientTurnId: "h-1" }) });
    assert.equal(turn.status, 200);
    assert.equal(((await turn.json()) as { state: string }).state, "ok");
    const rows = fake.dbFor(VC_DB_NAME).collection<{ tenantId?: string }>("chat_turns").all();
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.tenantId === "tenant-a"));
    const counsellor = await fetch(`${base}${threadsPath("stu-1")}`, { method: "POST", headers: { authorization: `Bearer ${await studentToken({ tenant: "tenant-a", counsellorId: "c-1", role: "counsellor" })}` } });
    assert.equal(counsellor.status, 403);
    const noToken = await fetch(`${base}/v1/students/stu-1/erasure-requests`, { method: "POST" });
    assert.equal(noToken.status, 401, "the counsellor routes are untouched");
  } finally {
    await api.stop();
    cleanupGates(f);
  }
});

// ---------------------------------------------------------------------------
// P1 LK1w: the student chat surface runs on the text chain (VC_TEXT_CHAIN); the scribe / classifier provider does not move.
// ---------------------------------------------------------------------------

/** Like mustRefuse, matching the refusal by message; a startApi that wrongly starts is stopped first so a red run fails instead of hanging on an open server. */
async function mustRefuseWith(p: Promise<{ stop(): Promise<void> }>, message: RegExp): Promise<void> {
  let api: { stop(): Promise<void> } | undefined;
  try {
    api = await p;
  } catch (e) {
    assert.match(String((e as Error).message), message);
    return;
  }
  await api.stop();
  assert.fail("startApi started, but it must have refused");
}

async function chatTurnOverHttp(env: Record<string, string | undefined>, scribe: ReturnType<typeof kbAnswerProvider>) {
  const fake = createFakeMongoClient();
  const f = gatesFixture();
  const api = await startApi(
    { MONGODB_URL: "mongodb://fake-host/ignored", VC_CHAT_ENABLED: "true", ...env },
    { clientFactory: () => fake.client, http: httpBase({ provider: scribe, chat: { kb: recordingKb(), speakers: SPEAKERS, gatesDir: f.gates, verifier: studentVerifier() } }) },
  );
  try {
    const base = `http://127.0.0.1:${api.port}`;
    const headers = { authorization: `Bearer ${await studentToken(adult())}`, "content-type": "application/json" };
    const { threadId } = (await (await fetch(`${base}${threadsPath("stu-1")}`, { method: "POST", headers })).json()) as { threadId: string };
    const turn = await fetch(`${base}${turnsPath("stu-1", threadId)}`, { method: "POST", headers, body: JSON.stringify({ text: GERMANY_QUESTION, clientTurnId: "lk1w-1" }) });
    assert.equal(turn.status, 200);
    return (await turn.json()) as { state: string };
  } finally {
    await api.stop();
    cleanupGates(f);
  }
}

test("LK1w: VC_TEXT_CHAIN set -> a student chat turn is answered by the chain (Ollama hop on the wire) and the injected scribe/classifier provider is not called", async () => {
  const stub = stubOllamaFetch({ claims: [GOOD_CLAIM] });
  const scribe = kbAnswerProvider();
  try {
    const out = await chatTurnOverHttp(CHAIN_ENV, scribe);
    assert.equal(out.state, "ok");
    assert.ok(stub.calls.length >= 1, "the chain hop was called");
    assert.match(stub.calls[0]!.url, /^http:\/\/ollama\.synthetic\.test\/api\/chat$/);
    assert.equal(JSON.parse(stub.calls[0]!.body).model, "glm-5.3-flash", "the chain's first hop, in config order");
    // P1 LK7: the LK5 safety screen runs on the classifier's base provider (D-105 Q4), so that provider is asked for the screen and for nothing else.
    assert.deepEqual(scribe.calls.filter((c) => c.skillName !== "concern-classifier"), [], "the current provider (scribe/classifier base) never served the student turn (only the safety screen ran on it)");
  } finally {
    stub.restore();
  }
});

test("LK1w: VC_TEXT_CHAIN unset -> the student chat turn uses the current provider and nothing is sent to Ollama", async () => {
  const stub = stubOllamaFetch({ claims: [GOOD_CLAIM] });
  const scribe = kbAnswerProvider();
  try {
    const out = await chatTurnOverHttp({}, scribe);
    assert.equal(out.state, "ok");
    assert.ok(scribe.calls.length >= 1);
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});

test("LK1w: VC_TEXT_CHAIN does not replace the scribe provider config: with no injected provider, no VC_LLM_PROVIDER and the classifier injected (so only the scribe base is read), startApi still refuses before connecting", async () => {
  const fake = createFakeMongoClient();
  let connected = 0;
  (fake.client as unknown as { connect: () => Promise<void> }).connect = async () => { connected += 1; };
  await mustRefuseWith(startApi({ MONGODB_URL: "mongodb://fake-host/ignored", ...CHAIN_ENV }, { clientFactory: () => fake.client, http: { port: 0, verifier: counsellorVerifier, skillsDir: SKILLS_DIR, escalationForTenant: (() => ({})) as never } }), /VC_LLM_PROVIDER/);
  assert.equal(connected, 0);
});

test("LK1w: a bad chain (no OLLAMA_API_KEY) is a startup config error before connecting, and its message never carries a key", async () => {
  const fake = createFakeMongoClient();
  let connected = 0;
  (fake.client as unknown as { connect: () => Promise<void> }).connect = async () => { connected += 1; };
  await mustRefuseWith(startApi({ MONGODB_URL: "mongodb://fake-host/ignored", VC_TEXT_CHAIN: "default" }, { clientFactory: () => fake.client, http: httpBase() }), /OLLAMA_API_KEY/);
  assert.equal(connected, 0);
});

// ---------------------------------------------------------------------------
// p1-lk6 (D-104, D-105): the student's original words become English KG facts, with the original-language quote kept as the source
// ---------------------------------------------------------------------------

const HINDI_Q = "जर्मनी में सार्वजनिक विश्वविद्यालयों की ट्यूशन फीस कितनी है? मैं वहाँ एमबीए करना चाहता हूँ";
const lk6Cand = (key: string, value: unknown, quote: string, turnId: string) => ({ key, value, source: { type: "transcript", quote, turnId }, confidence: 0.8, purposeTags: ["profile_synthesis"], sensitivity: "low" });
/** A text provider that answers the KB question and, for fact-extraction, cites the turn id it was given. */
function lk6Provider(candidates: (turnId: string) => unknown[], onExtract?: () => void): MockProvider {
  const p = kbAnswerProvider();
  p.setResponse("fact-extraction", ((input: { turns: { turnId: string }[] }) => {
    onExtract?.();
    return { facts: candidates(input.turns[0]!.turnId) };
  }) as never);
  return p;
}

test("p1-lk6: a Devanagari chat turn is stored as written, and the proposed fact is English with the Devanagari quote kept as its source", async () => {
  const provider = lk6Provider((turnId) => [lk6Cand("target_country", "Germany", "जर्मनी में", turnId), lk6Cand("intended_degree", "MBA", "एमबीए करना चाहता हूँ", turnId)]);
  const w = chatWorld({ provider, deps: { extractFacts: createStudentFactExtractor({ provider, skillsDir: SKILLS_DIR }) } });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: HINDI_Q, clientTurnId: "lk6-1" } });
    assert.equal(res.status, 200);
    await settle();
    const rows = w.fakeDb.collection<any>(COLLECTION_NAMES.profile_facts).all().sort((x, y) => x.key.localeCompare(y.key));
    assert.deepEqual(rows.map((r) => [r.key, r.value, r.quote, r.sourceLang, r.status]), [
      ["intended_degree", "MBA", "एमबीए करना चाहता हूँ", "hi", "proposed"],
      ["target_country", "Germany", "जर्मनी में", "hi", "proposed"],
    ]);
    const user = w.fakeDb.collection<any>("chat_turns").all().find((t) => t.role === "user");
    assert.equal(user.text, HINDI_Q, "the original message is stored as written, not translated");
    const view = (await call(w, "GET", profilePath("stu-1"), { token })).json;
    assert.deepEqual(view.proposed.map((p: any) => [p.key, p.value]).sort(), [["intended_degree", "MBA"], ["target_country", "Germany"]]);
    assert.ok(!JSON.stringify(view).includes("जर्मनी में"), "the student-facing profile view is unchanged: English key and value only");
  } finally {
    w.cleanup();
  }
});

test("p1-lk6: a fact whose quote is not in the student's words is never proposed", async () => {
  const provider = lk6Provider((turnId) => [lk6Cand("target_country", "Germany", "I want to study in Germany", turnId)]);
  const w = chatWorld({ provider, deps: { extractFacts: createStudentFactExtractor({ provider, skillsDir: SKILLS_DIR }) } });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    assert.equal((await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: HINDI_Q, clientTurnId: "lk6-2" } })).status, 200);
    await settle();
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.profile_facts).all().length, 0);
  } finally {
    w.cleanup();
  }
});

test("p1-lk6: an under-18 student without guardian consent makes no extraction call", async () => {
  let calls = 0;
  const provider = lk6Provider((turnId) => [lk6Cand("target_country", "Germany", "जर्मनी में", turnId)], () => void (calls += 1));
  const w = chatWorld({ provider, deps: { extractFacts: createStudentFactExtractor({ provider, skillsDir: SKILLS_DIR }) } });
  try {
    const token = await studentToken(minor());
    const threadId = await newThread(w, token);
    assert.equal((await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: HINDI_Q, clientTurnId: "lk6-3" } })).status, 200);
    assert.equal(calls, 0);
    assert.equal(provider.calls.filter((c) => c.skillName === "fact-extraction").length, 0);
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.profile_facts).all().length, 0);
  } finally {
    w.cleanup();
  }
});

test("p1-lk6: extraction failure never fails the turn; the log has the event name, no student words or quote", async () => {
  const provider = lk6Provider(() => {
    throw new Error(`upstream echoed: ${HINDI_Q} 9876543210`);
  });
  const w = chatWorld({ provider, deps: { extractFacts: createStudentFactExtractor({ provider, skillsDir: SKILLS_DIR }) } });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: HINDI_Q, clientTurnId: "lk6-4" } });
    assert.equal(res.status, 200);
    assert.equal(res.json.state, "ok");
    await settle();
    assert.ok(w.logs.some((l: any) => l.event === "chat_fact_extraction_failed"));
    const logged = JSON.stringify(w.logs);
    assert.ok(!logged.includes("जर्मनी") && !logged.includes("9876543210"));
    assert.equal(w.fakeDb.collection<any>("chat_turns").all().filter((t) => t.role === "assistant").length, 1, "the turn was stored");
  } finally {
    w.cleanup();
  }
});

test("p1-lk6: startApi wires the default extractor for chat when none is injected, over the default text provider", async () => {
  const fake = createFakeMongoClient();
  const f = gatesFixture();
  const provider = lk6Provider((turnId) => [lk6Cand("target_country", "Germany", "जर्मनी में", turnId)]);
  const api = await startApi(
    { MONGODB_URL: "mongodb://fake-host/ignored", VC_CHAT_ENABLED: "true" },
    { clientFactory: () => fake.client, http: httpBase({ provider, chat: { kb: recordingKb(), speakers: SPEAKERS, gatesDir: f.gates, verifier: studentVerifier() } }) },
  );
  try {
    const base = `http://127.0.0.1:${api.port}`;
    const headers = { authorization: `Bearer ${await studentToken(adult())}`, "content-type": "application/json" };
    const { threadId } = (await (await fetch(`${base}${threadsPath("stu-1")}`, { method: "POST", headers })).json()) as { threadId: string };
    const turn = await fetch(`${base}${turnsPath("stu-1", threadId)}`, { method: "POST", headers, body: JSON.stringify({ text: HINDI_Q, clientTurnId: "lk6-5" }) });
    assert.equal(turn.status, 200);
    await settle();
    const rows = fake.dbFor(VC_DB_NAME).collection<any>("profile_facts").all();
    assert.deepEqual(rows.map((r) => [r.key, r.value, r.quote, r.sourceLang]), [["target_country", "Germany", "जर्मनी में", "hi"]]);
  } finally {
    await api.stop();
    cleanupGates(f);
  }
});

test("p1-lk6: an injected extractFacts still wins over the default", async () => {
  const fake = createFakeMongoClient();
  const f = gatesFixture();
  const provider = lk6Provider((turnId) => [lk6Cand("target_country", "Germany", "जर्मनी में", turnId)]);
  const api = await startApi(
    { MONGODB_URL: "mongodb://fake-host/ignored", VC_CHAT_ENABLED: "true" },
    { clientFactory: () => fake.client, http: httpBase({ provider, chat: { kb: recordingKb(), speakers: SPEAKERS, gatesDir: f.gates, verifier: studentVerifier(), extractFacts: async () => [{ key: "city", value: "Pune" }] } }) },
  );
  try {
    const base = `http://127.0.0.1:${api.port}`;
    const headers = { authorization: `Bearer ${await studentToken(adult())}`, "content-type": "application/json" };
    const { threadId } = (await (await fetch(`${base}${threadsPath("stu-1")}`, { method: "POST", headers })).json()) as { threadId: string };
    await fetch(`${base}${turnsPath("stu-1", threadId)}`, { method: "POST", headers, body: JSON.stringify({ text: HINDI_Q, clientTurnId: "lk6-6" }) });
    await settle();
    assert.deepEqual(fake.dbFor(VC_DB_NAME).collection<any>("profile_facts").all().map((r) => r.key), ["city"]);
    assert.ok(!provider.calls.some((c) => c.skillName === "fact-extraction"));
  } finally {
    await api.stop();
    cleanupGates(f);
  }
});

test("p1-lk6: a crisis turn is answered with the fixed helpline text and is never sent to the fact extractor model", async () => {
  let calls = 0;
  const provider = lk6Provider((turnId) => [lk6Cand("feeling", "wants to die", "kill myself", turnId)], () => void (calls += 1));
  const w = chatWorld({ provider, deps: { extractFacts: createStudentFactExtractor({ provider, skillsDir: SKILLS_DIR }) } });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: "I want to kill myself", clientTurnId: "lk6-7" } });
    assert.equal(res.status, 200);
    assert.equal(res.json.state, "escalated");
    assert.equal(calls, 0);
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.profile_facts).all().length, 0);
  } finally {
    w.cleanup();
  }
});

// ---------------------------------------------------------------------------
// p1-lk9 C2: fact extraction runs detached, after the reply
// ---------------------------------------------------------------------------

/** Records every unhandled rejection while the test runs (an extraction that rejects after the reply must never become one). */
function watchUnhandled() {
  const seen: unknown[] = [];
  const h = (e: unknown) => void seen.push(e);
  process.on("unhandledRejection", h);
  return { seen, stop: () => void process.off("unhandledRejection", h) };
}
/** Fails (instead of hanging the suite) when `p` has not settled within `ms`. */
function within<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const t = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error(`${what} did not return within ${ms} ms`)), ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}
function deferred() {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  return { gate, release };
}

test("p1-lk9 C2: an extractor that never resolves does not block the reply, and the reply is complete", async () => {
  let started = 0;
  const w = chatWorld({ deps: { extractFacts: () => (started++, new Promise(() => undefined)) } });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const res = await within(call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: GERMANY_QUESTION, clientTurnId: "c2-1" } }), 3000, "the turn");
    assert.equal(res.status, 200);
    assert.equal(res.json.state, "ok");
    assert.ok(res.json.claims.length >= 1);
    await settle();
    assert.equal(started, 1, "control: the extractor was started (this is not a turn that skipped extraction)");
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 2, "the turn was stored");
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.student_usage).all().length, 1, "and counted");
  } finally {
    w.cleanup();
  }
});

test("p1-lk9 C2: an extractor that rejects is logged text-free and is never an unhandled rejection; the turn is unaffected", async () => {
  const watch = watchUnhandled();
  const w = chatWorld({
    deps: {
      extractFacts: async () => {
        throw new Error(`extractor echoed: ${GERMANY_QUESTION} 9876543210`);
      },
    },
  });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: GERMANY_QUESTION, clientTurnId: "c2-2" } });
    assert.equal(res.status, 200);
    await settle();
    assert.ok(w.logs.some((l: any) => l.event === "chat_fact_extraction_failed"), "the failure is logged");
    assert.ok(!JSON.stringify(w.logs).includes("9876543210") && !JSON.stringify(w.logs).includes("Germany"), "the log has no student words");
    assert.deepEqual(watch.seen, [], "no unhandled rejection");
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.profile_facts).all().length, 0);
  } finally {
    watch.stop();
    w.cleanup();
  }
});

test("p1-lk9 C2: a throwing logger and a synchronous extractor throw are also never an unhandled rejection", async () => {
  const watch = watchUnhandled();
  const w = chatWorld({
    deps: {
      extractFacts: (() => {
        throw new Error("sync boom");
      }) as never,
      log: () => {
        throw new Error("logger down");
      },
    },
  });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: GERMANY_QUESTION, clientTurnId: "c2-3" } });
    assert.equal(res.status, 200);
    await settle();
    assert.deepEqual(watch.seen, []);
  } finally {
    watch.stop();
    w.cleanup();
  }
});

test("p1-lk9 C2: an erasure that starts after the reply but before extraction resolves still prevents the fact write (StudentFencedError on the detached path)", async () => {
  const watch = watchUnhandled();
  const d = deferred();
  const w = chatWorld({ deps: { extractFacts: async () => (await d.gate, proposeGermany()) } });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const res = await within(call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: GERMANY_QUESTION, clientTurnId: "c2-4" } }), 3000, "the turn");
    assert.equal(res.status, 200);
    const db = w.deps.dbForTenant("tenant-a");
    const { requestId } = await requestErasure(db, { studentId: "stu-1", requestedBy: "counsellor-7", reason: "student_request" });
    await confirmErasure(db, { requestId, confirmedBy: "admin-2" });
    d.release();
    await settle();
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.profile_facts).all().length, 0, "no fact row exists for an erased student");
    assert.deepEqual(watch.seen, [], "the fence refusal is not an unhandled rejection");
  } finally {
    watch.stop();
    w.cleanup();
  }
});

test("p1-lk9 C2: proposed facts are absent from GET chat/profile while extraction is pending and appear once it resolves", async () => {
  const d = deferred();
  const w = chatWorld({ deps: { extractFacts: async () => (await d.gate, proposeGermany()) } });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const res = await within(call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: GERMANY_QUESTION, clientTurnId: "c2-5" } }), 3000, "the turn");
    assert.equal(res.status, 200);
    assert.deepEqual((await call(w, "GET", profilePath("stu-1"), { token })).json.proposed, [], "pending: nothing proposed yet");
    d.release();
    await settle();
    const after = (await call(w, "GET", profilePath("stu-1"), { token })).json;
    assert.deepEqual(
      after.proposed.map((p: { key: string; value: string; status: string }) => [p.key, p.value, p.status]),
      [["target_country", "Germany", "proposed"]],
    );
  } finally {
    w.cleanup();
  }
});

test("p1-lk9 C2: extraction still happens only in the stores-text branch (a replay and an unconsented minor never start it)", async () => {
  let started = 0;
  const w = chatWorld({ deps: { extractFacts: async () => (started++, proposeGermany()) } });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const body = { text: GERMANY_QUESTION, clientTurnId: "c2-6" };
    await call(w, "POST", turnsPath("stu-1", threadId), { token, body });
    await settle();
    assert.equal(started, 1);
    const replay = await call(w, "POST", turnsPath("stu-1", threadId), { token, body });
    assert.equal(replay.status, 200);
    const kid = await studentToken(minor("stu-2", "tenant-a"));
    const kt = await newThread(w, kid, "stu-2");
    await call(w, "POST", turnsPath("stu-2", kt), { token: kid, body: { text: GERMANY_QUESTION, clientTurnId: "c2-8" } });
    await settle();
    assert.equal(started, 1, "a replay and an unconsented turn started no extraction");
  } finally {
    w.cleanup();
  }
});

// ---------------------------------------------------------------------------
// P1 LK7 (D-105): the model language detector and the safety screen on the authenticated chat path; the monthly spend cap on the text chain
// ---------------------------------------------------------------------------

/** A chat session over real HTTP through startApi. `scribe` is the injected base provider (the concern classifier's base). */
async function lk7Session(env: Record<string, string | undefined>, scribe: MockProvider, extra: { chat?: Record<string, unknown>; http?: Record<string, unknown> } = {}) {
  const fake = createFakeMongoClient();
  const f = gatesFixture();
  const api = await startApi(
    { MONGODB_URL: "mongodb://fake-host/ignored", VC_CHAT_ENABLED: "true", ...env },
    { clientFactory: () => fake.client, http: httpBase({ provider: scribe, ...(extra.http ?? {}), chat: { kb: recordingKb(), speakers: SPEAKERS, gatesDir: f.gates, verifier: studentVerifier(), ...(extra.chat ?? {}) } }) },
  );
  const base = `http://127.0.0.1:${api.port}`;
  const headers = { authorization: `Bearer ${await studentToken(adult())}`, "content-type": "application/json" };
  const { threadId } = (await (await fetch(`${base}${threadsPath("stu-1")}`, { method: "POST", headers })).json()) as { threadId: string };
  let n = 0;
  return {
    api,
    async ask(text: string) {
      const res = await fetch(`${base}${turnsPath("stu-1", threadId)}`, { method: "POST", headers, body: JSON.stringify({ text, clientTurnId: `lk7-${++n}` }) });
      return { status: res.status, json: (await res.json()) as { state: string; message?: string } };
    },
    async close() {
      await api.stop();
      cleanupGates(f);
    },
  };
}
const classifierCalls = (p: MockProvider) => p.calls.filter((c) => c.skillName === "concern-classifier");
const screenOut = (severity: string) => ({ severity, likelyBenign: false, rationale: "synthetic" });
/** One Latin-script word of Hinglish: the offline detector reads this as English, so only the model can say hi-Latn. */
const ONE_MARKER_HINGLISH = "Germany fees kitni";

test("LK7 L1: with VC_TEXT_CHAIN set, an authenticated turn's language comes from the MODEL detector (on the chain wire), and the answer call is told that reply language", async () => {
  assert.equal(detectLanguageOffline(ONE_MARKER_HINGLISH).lang, "en", "precondition: the offline script test alone would say en");
  const stub = stubOllamaRouted({ detect: { lang: "hi-Latn", confidence: 0.9 } });
  const s = await lk7Session(CHAIN_ENV, kbAnswerProvider());
  try {
    const out = await s.ask(ONE_MARKER_HINGLISH);
    assert.equal(out.status, 200);
    const detect = stub.calls.filter((c) => c.kind === "lang-detect");
    assert.equal(detect.length, 1, "exactly one detector call on the chain");
    assert.equal((chainRequestInput(detect[0]!) as { text: string }).text, ONE_MARKER_HINGLISH);
    const answer = stub.calls.filter((c) => c.kind === "other").map(chainRequestInput).find((i) => "evidence" in i);
    assert.equal((answer as { replyLang?: string } | undefined)?.replyLang, "hi-Latn", "the model's language reached the answer call");
  } finally {
    await s.close();
    stub.restore();
  }
});

test("LK7 L2: VC_TEXT_CHAIN unset -> no model detector call exists anywhere (offline script test only) and nothing is sent to Ollama", async () => {
  const stub = stubOllamaRouted();
  const scribe = kbAnswerProvider();
  const s = await lk7Session({}, scribe);
  try {
    assert.equal((await s.ask(ONE_MARKER_HINGLISH)).status, 200);
    assert.equal(stub.calls.length, 0);
    assert.equal(scribe.calls.filter((c) => c.skillName === "lang-detect").length, 0, "the base provider is not used as a detector");
  } finally {
    await s.close();
    stub.restore();
  }
});

test("LK7 C1: crisisGuard still runs FIRST on the original text: a crisis turn makes no detector, screen or chain call and gets the fixed message", async () => {
  const stub = stubOllamaRouted();
  const scribe = kbAnswerProvider();
  scribe.setResponse("concern-classifier", screenOut("none"));
  const s = await lk7Session(CHAIN_ENV, scribe);
  try {
    const out = await s.ask(CRISIS_TEXT);
    assert.equal(out.status, 200);
    assert.equal(out.json.state, "escalated");
    assert.equal(out.json.message, STUDENT_CRISIS_MESSAGE);
    assert.equal(stub.calls.length, 0, "no chain request of any kind");
    assert.equal(scribe.calls.length, 0, "no screen request either");
  } finally {
    await s.close();
    stub.restore();
  }
});

test("LK7 S1: the safety screen is on for authenticated turns by default: 'possible' returns the fixed crisis message with no answer; the screen saw the original text", async () => {
  const scribe = kbAnswerProvider();
  scribe.setResponse("concern-classifier", screenOut("high"));
  const s = await lk7Session({}, scribe);
  try {
    const out = await s.ask(GERMANY_QUESTION);
    assert.equal(out.json.state, "escalated");
    assert.equal(out.json.message, STUDENT_CRISIS_MESSAGE);
    const calls = classifierCalls(scribe);
    assert.equal(calls.length, 1);
    assert.equal((calls[0]!.input as { text: string; guardLevel: string }).text, GERMANY_QUESTION);
    assert.equal((calls[0]!.input as { guardLevel: string }).guardLevel, "none");
  } finally {
    await s.close();
  }
});

test("LK7 S2: a clear screen releases the normal answer; a screen outage fails closed to the fixed crisis message (D-105)", async () => {
  const clear = kbAnswerProvider();
  const s1 = await lk7Session({}, clear);
  try {
    assert.equal((await s1.ask(GERMANY_QUESTION)).json.state, "ok");
    assert.equal(classifierCalls(clear).length, 1);
  } finally {
    await s1.close();
  }
  const down = kbAnswerProvider();
  down.setResponse("concern-classifier", (() => { throw new Error("classifier down"); }) as never);
  const s2 = await lk7Session({}, down);
  try {
    const out = await s2.ask(GERMANY_QUESTION);
    assert.equal(out.json.state, "escalated");
    assert.equal(out.json.message, STUDENT_CRISIS_MESSAGE);
  } finally {
    await s2.close();
  }
});

test("LK7 S3: with the chain set, the screen still runs on the classifier's base provider (D-105 Q4: a task moves to the chain only after its own eval), never on the chain", async () => {
  const stub = stubOllamaRouted();
  const scribe = kbAnswerProvider();
  const s = await lk7Session(CHAIN_ENV, scribe);
  try {
    assert.equal((await s.ask(GERMANY_QUESTION)).json.state, "ok");
    assert.equal(classifierCalls(scribe).length, 1, "the screen ran on the base provider");
    assert.ok(stub.calls.length >= 1, "the answer ran on the chain");
    assert.ok(stub.calls.every((c) => !JSON.parse(c.body).messages[0].content.includes("concern")), "no chain request carries the concern-classifier prompt");
  } finally {
    await s.close();
    stub.restore();
  }
});

test("LK7 S4: chat.safetyScreen = false turns the authenticated screen off (no classifier call); a supplied screen provider is the one used", async () => {
  const off = kbAnswerProvider();
  off.setResponse("concern-classifier", screenOut("high"));
  const s1 = await lk7Session({}, off, { chat: { safetyScreen: false } });
  try {
    assert.equal((await s1.ask(GERMANY_QUESTION)).json.state, "ok");
    assert.equal(classifierCalls(off).length, 0);
  } finally {
    await s1.close();
  }
  const base = kbAnswerProvider();
  const own = new MockProvider({ responses: { "concern-classifier": screenOut("high") } });
  const s2 = await lk7Session({}, base, { chat: { safetyScreen: { provider: own } } });
  try {
    assert.equal((await s2.ask(GERMANY_QUESTION)).json.state, "escalated");
    assert.equal(own.calls.length, 1);
    assert.equal(classifierCalls(base).length, 0);
  } finally {
    await s2.close();
  }
});

// -- the monthly spend cap ---------------------------------------------------

test("LK7 P1: VC_TEXT_CHAIN set and the cap missing or invalid -> startApi refuses (fail closed) BEFORE connecting, naming the variable and never a key", async () => {
  for (const bad of [undefined, "", "   ", "abc", "0", "-5", "NaN", "Infinity", "1e999", "0x10", "5 USD", "1,5", "50;"]) {
    const fake = createFakeMongoClient();
    let connected = 0;
    (fake.client as unknown as { connect: () => Promise<void> }).connect = async () => { connected += 1; };
    const env: Record<string, string | undefined> = { MONGODB_URL: "mongodb://fake-host/ignored", ...CHAIN_ENV };
    if (bad === undefined) delete env.VC_CHAIN_MONTHLY_CAP_USD;
    else env.VC_CHAIN_MONTHLY_CAP_USD = bad;
    let started: { stop(): Promise<void> } | undefined;
    try {
      started = await startApi(env, { clientFactory: () => fake.client, http: httpBase() });
    } catch (e) {
      assert.ok(e instanceof ChainSpendCapError, `${JSON.stringify(bad)}: ${String(e)}`);
      assert.match((e as Error).message, /VC_CHAIN_MONTHLY_CAP_USD/);
      assert.ok(!(e as Error).message.includes("synthetic-key-not-real"));
    }
    if (started) {
      await started.stop();
      assert.fail(`startApi started with the cap ${JSON.stringify(bad)}`);
    }
    assert.equal(connected, 0, `${JSON.stringify(bad)}: nothing connected`);
  }
});

test("LK7 P2: a valid cap starts the chain; with VC_TEXT_CHAIN unset the cap is not required", async () => {
  assert.equal(CHAIN_MONTHLY_CAP_ENV, "VC_CHAIN_MONTHLY_CAP_USD");
  assert.equal(parseChainMonthlyCap({ VC_CHAIN_MONTHLY_CAP_USD: "50" }), 50);
  assert.equal(parseChainMonthlyCap({ VC_CHAIN_MONTHLY_CAP_USD: " 12.5 " }), 12.5);
  for (const env of [{ ...CHAIN_ENV }, {}]) {
    const fake = createFakeMongoClient();
    const api = await startApi({ MONGODB_URL: "mongodb://fake-host/ignored", ...env }, { clientFactory: () => fake.client, http: httpBase() });
    await api.stop();
  }
});

test("LK7 G1: the guard reserves the estimate before a request, refuses one that would pass the cap with a NON-retryable error, and settles a reported usage to the actual figure", () => {
  const clock = { d: new Date("2026-11-03T10:00:00.000Z") };
  const lines: unknown[] = [];
  const g = createChainSpendGuard({ capUsd: 1, now: () => clock.d, log: (l) => lines.push(l) });
  const est = (usd: number) => ({ model: "m", estimatedInputTokens: 1, maxOutputTokens: 1, estimatedCostUsd: usd });
  const a = est(0.4);
  g.beforeRequest(a);
  assert.equal(g.spentUsd(), 0.4);
  g.onUsage({ model: "m", estimate: a, actual: "reported", inputTokens: 1, outputTokens: 1, usd: 0.1 });
  assert.ok(Math.abs(g.spentUsd() - 0.1) < 1e-12, "settled to the actual spend");
  const b = est(0.6);
  g.beforeRequest(b);
  g.onUsage({ model: "m", estimate: b, actual: "unreported" });
  assert.ok(Math.abs(g.spentUsd() - 0.7) < 1e-12, "unreported keeps the reservation");
  g.beforeRequest(est(0.3)); // 0.7 + 0.3 = 1.0 is exactly the cap: allowed
  let err: unknown;
  try {
    g.beforeRequest(est(0.0001));
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof ChainBudgetExhaustedError);
  assert.equal(isRetryableProviderError(err), false, "a budget stop must not fail over to the next hop");
  assert.ok(Math.abs(g.spentUsd() - 1.0) < 1e-12, "a refused request reserves nothing");
  try { g.beforeRequest(est(0.5)); } catch { /* second refusal */ }
  assert.equal(lines.filter((l) => (l as { event: string }).event === "chain_cap_exhausted").length, 1, "one text-free line per month, not per request");
});

test("LK7 G2: the cap is per UTC calendar month: a new month starts at zero, and a usage settled after the month turned does not touch the new month", () => {
  const clock = { d: new Date("2026-11-30T23:59:59.000Z") };
  const g = createChainSpendGuard({ capUsd: 1, now: () => clock.d, log: () => undefined });
  const est = (usd: number) => ({ model: "m", estimatedInputTokens: 1, maxOutputTokens: 1, estimatedCostUsd: usd });
  const old = est(0.9);
  g.beforeRequest(old);
  assert.throws(() => g.beforeRequest(est(0.2)), ChainBudgetExhaustedError);
  clock.d = new Date("2026-12-01T00:00:00.000Z");
  g.beforeRequest(est(0.5));
  g.onUsage({ model: "m", estimate: old, actual: "reported", inputTokens: 1, outputTokens: 1, usd: 0.01 });
  assert.equal(g.spentUsd(), 0.5, "the November settle did not change December");
  assert.equal(g.snapshot().month, "2026-12");
});

test("LK7 E1: when the cap runs out mid-month, student turns get the existing degraded reply over real HTTP (200, never a 500), no request leaves after the stop, and spend never passes the cap", async () => {
  const stub = stubOllamaRouted();
  const lines: unknown[] = [];
  const s = await lk7Session({ ...CHAIN_ENV, VC_CHAIN_MONTHLY_CAP_USD: "0.03" }, kbAnswerProvider(), { http: { chainSpend: { log: (l: unknown) => lines.push(l) } } });
  try {
    const results: { status: number; message?: string; state: string; callsAfter: number }[] = [];
    for (let i = 0; i < 5; i++) {
      const out = await s.ask(GERMANY_QUESTION);
      results.push({ status: out.status, state: out.json.state, message: out.json.message, callsAfter: stub.calls.length });
    }
    assert.ok(results.every((r) => r.status === 200), JSON.stringify(results));
    assert.equal(results[0]!.message?.includes(PROVIDER_APOLOGY_TEXT), false, "the first turn was served");
    const firstDegraded = results.findIndex((r) => r.message?.includes(PROVIDER_APOLOGY_TEXT));
    assert.ok(firstDegraded > 0, `a later turn is degraded: ${JSON.stringify(results)}`);
    for (let i = firstDegraded; i < results.length; i++) {
      assert.ok(results[i]!.message?.includes(PROVIDER_APOLOGY_TEXT), `turn ${i} stays degraded`);
      assert.equal(results[i]!.callsAfter, results[firstDegraded]!.callsAfter, "no request left after the stop");
    }
    const snap = s.api.chainSpend!();
    assert.equal(snap.capUsd, 0.03);
    assert.ok(snap.spentUsd <= 0.03 + 1e-12, `spent ${snap.spentUsd}`);
    assert.ok(snap.capRefusals >= 1);
    assert.ok(lines.some((l) => (l as { event: string }).event === "chain_cap_exhausted"));
    assert.ok(!JSON.stringify(lines).includes("Germany"), "text-free");
  } finally {
    await s.close();
    stub.restore();
  }
});

test("LK7 E2: reported token usage settles the spend to the actual figure, so the same cap serves more turns than the reservation alone would", async () => {
  const stub = stubOllamaRouted({ usage: { prompt_eval_count: 100, eval_count: 50 } });
  const s = await lk7Session({ ...CHAIN_ENV, VC_CHAIN_MONTHLY_CAP_USD: "0.03" }, kbAnswerProvider());
  try {
    for (let i = 0; i < 5; i++) {
      const out = await s.ask(GERMANY_QUESTION);
      assert.equal(out.status, 200);
      assert.equal(out.json.message?.includes(PROVIDER_APOLOGY_TEXT), false, `turn ${i} still served`);
    }
    const snap = s.api.chainSpend!();
    assert.ok(snap.spentUsd > 0 && snap.spentUsd < 0.03, `spent ${snap.spentUsd}`);
  } finally {
    await s.close();
    stub.restore();
  }
});

test("LK7 X1: when every hop of the chain fails (the whole chain is exhausted) the turn is the degraded reply, the failover alert still fires, and the exhaustion is counted", async () => {
  const stub = stubOllamaRouted({ status: 503 });
  const errors: string[] = [];
  const realError = console.error;
  console.error = (...a: unknown[]) => { errors.push(a.map(String).join(" ")); };
  const s = await lk7Session(CHAIN_ENV, kbAnswerProvider());
  try {
    const out = await s.ask(GERMANY_QUESTION);
    assert.equal(out.status, 200);
    assert.ok(out.json.message?.includes(PROVIDER_APOLOGY_TEXT));
    assert.ok(errors.some((e) => e.includes("provider_failover_exhausted")), "the default alert is kept");
    assert.ok(s.api.chainSpend!().chainExhausted >= 1);
  } finally {
    console.error = realError;
    await s.close();
    stub.restore();
  }
});

// p1-lk7 fix cycle 1: a screen provider that cannot serve concern-classifier must never reach students as "every turn is a crisis".
async function startOverBase(provider: MockProvider | RulesProvider, extraChat: Record<string, unknown> = {}, env: Record<string, string | undefined> = {}) {
  const fake = createFakeMongoClient();
  let connected = 0;
  (fake.client as unknown as { connect: () => Promise<void> }).connect = async () => { connected += 1; };
  const f = gatesFixture();
  try {
    const api = await startApi(
      { MONGODB_URL: "mongodb://fake-host/ignored", VC_CHAT_ENABLED: "true", ...env },
      { clientFactory: () => fake.client, http: httpBase({ provider, chat: { kb: recordingKb(), speakers: SPEAKERS, gatesDir: f.gates, verifier: studentVerifier(), ...extraChat } }) },
    );
    return { api, connected: () => connected, done: async () => { await api.stop(); cleanupGates(f); } };
  } catch (e) {
    cleanupGates(f);
    return { error: e as Error, connected: () => connected };
  }
}

test("LK7 C1-fix R1: chat on + screen on + a rules base provider (no concern-classifier) -> startApi REFUSES with a named error, before connecting, naming no key", async () => {
  for (const env of [{}, CHAIN_ENV]) {
    const r = await startOverBase(new RulesProvider(), {}, env);
    if ("done" in r) {
      await r.done();
      assert.fail("startApi started with the screen on over a rules provider");
    }
    assert.ok(r.error instanceof ChatConfigError, String(r.error));
    assert.match(r.error.message, /safety screen/i);
    assert.match(r.error.message, /concern-classifier/);
    assert.ok(!r.error.message.includes("synthetic-key-not-real"));
    assert.equal(r.connected(), 0, "nothing connected");
  }
});

test("LK7 C1-fix R2: the same rules base with the screen switched off in code (chat.safetyScreen = false) starts; so does chat off", async () => {
  const off = await startOverBase(new RulesProvider(), { safetyScreen: false });
  assert.ok("done" in off, off && "error" in off ? String(off.error) : "");
  await off.done();
  const chatOff = await startOverBase(new RulesProvider(), {}, { VC_CHAT_ENABLED: "false" });
  assert.ok("done" in chatOff, "error" in chatOff ? String(chatOff.error) : "");
  await chatOff.done();
});

test("LK7 C1-fix R3: a rules base is fine when the screen has its own classifier-capable provider (the screen's provider is what counts), and a refusal names the screen provider", async () => {
  const own = new MockProvider({ responses: { "concern-classifier": screenOut("none") } });
  const ok = await startOverBase(new RulesProvider(), { safetyScreen: { provider: own } });
  assert.ok("done" in ok, "error" in ok ? String(ok.error) : "");
  await ok.done();
  const bad = await startOverBase(new MockProvider({ responses: {} }), { safetyScreen: { provider: new RulesProvider() } });
  assert.ok("error" in bad, "a rules screen provider must refuse even when the base is a mock");
  assert.ok(bad.error instanceof ChatConfigError);
});

test("LK7 C1-fix R4: a classifier-capable base starts and an ordinary question is ANSWERED (not escalated, no crisis message)", async () => {
  const scribe = kbAnswerProvider();
  scribe.setResponse("concern-classifier", screenOut("none"));
  const s = await lk7Session({}, scribe);
  try {
    const out = await s.ask(GERMANY_QUESTION);
    assert.equal(out.status, 200);
    assert.notEqual(out.json.state, "escalated");
    assert.notEqual(out.json.message, STUDENT_CRISIS_MESSAGE);
    assert.equal(classifierCalls(scribe).length, 1);
  } finally {
    await s.close();
  }
});
