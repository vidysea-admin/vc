/**
 * P1 U8 (spec A16b, D-093 item 6A/4A; B21 startApi wiring): the profile routes, the proposed-fact flow, and the chat routes over a real
 * HTTP server through startApi. Fake Db and mock provider only (B8); invented students and facts (B13).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { COLLECTION_NAMES, VC_DB_NAME } from "@vc/db";
import { createFakeMongoClient } from "@vc/db/testing";
import { GoLiveRefusedError } from "../src/go-live-gate.js";
import { ChatConfigError } from "../src/chat.js";
import { JwtConfigError } from "../src/auth.js";
import { startApi } from "../src/index.js";
import { createJwtVerifier, jwtConfigFromEnv } from "../src/auth.js";
import { GERMANY_QUESTION, adult, call, chatWorld, cleanupGates, gatesFixture, kbAnswerProvider, minor, newThread, profilePath, recordingKb, studentToken, studentVerifier, threadsPath, turnsPath, SKILLS_DIR, SPEAKERS } from "./chat-fixtures.js";
import { generateKeyPairSync } from "node:crypto";

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
