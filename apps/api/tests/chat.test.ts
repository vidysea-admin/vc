/**
 * P1 U8 (D-093 items 4A, 6A, 11; spec A6, A16b, A20, A23): the authenticated student chat routes. Outcome tests over the real handler,
 * the real @vc/db student store on the in-memory fake Db, a mock provider and a recording KB. Synthetic data only (B13, B8).
 * Each test name states the real scenario that reaches the behaviour.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COLLECTION_NAMES, claimChatTurn, tenantScopedDb } from "@vc/db";
import { createFakeDb } from "@vc/db/testing";
import { STUDENT_API_DRAFT } from "../src/openapi.js";
import { GATE_FILES, GoLiveRefusedError } from "../src/go-live-gate.js";
import { CHAT_FLAG_ENV, CHAT_ROUTES, ChatConfigError, MAX_CHAT_BODY_BYTES, chatEnabledFromEnv, createChatApi, withChatRoutes } from "../src/chat.js";
import { API_ROUTES, BodyTooLargeError, createApiHandler } from "../src/server.js";
import { createJwtVerifier, jwtConfigFromEnv } from "../src/auth.js";
import { APPROVER, GERMANY_QUESTION, NOW, adult, call, chatRequest, chatWorld, cleanupGates, everythingStored, gatesFixture, kbAnswerProvider, minor, newThread, recordingKb, studentToken, studentVerifier, threadsPath, turnsPath } from "./chat-fixtures.js";
import { SKILLS_DIR, SPEAKERS, realGatesWithB13Pending } from "./anonymous-fixtures.js";
import { GroundingBudget, MockGroundedAnswerer, MockProvider } from "@vc/providers";
import { TELE_MANAS_LINE, crisisGuard } from "@vc/engine";
import { createHash, generateKeyPairSync } from "node:crypto";

const REPO_GATES = fileURLToPath(new URL("../../../qa/gates", import.meta.url));
const baseDeps = () => ({
  verifier: studentVerifier(),
  dbForTenant: (t: string) => tenantScopedDb(createFakeDb().db, t),
  kb: recordingKb(),
  provider: kbAnswerProvider(),
  skillsDir: SKILLS_DIR,
  speakers: SPEAKERS,
});

// ---------------------------------------------------------------------------
// Flag and gate (A20)
// ---------------------------------------------------------------------------

test("A20: chat is OFF by default - unset, empty and 'false' read as disabled, only the exact word 'true' enables, anything else is a config error", () => {
  assert.equal(CHAT_FLAG_ENV, "VC_CHAT_ENABLED");
  for (const env of [{}, { VC_CHAT_ENABLED: "" }, { VC_CHAT_ENABLED: "false" }]) assert.equal(chatEnabledFromEnv(env), false, JSON.stringify(env));
  assert.equal(chatEnabledFromEnv({ VC_CHAT_ENABLED: "true" }), true);
  for (const bad of ["1", "yes", "TRUE", "on", "tru", " true", "true ", " false ", " false", "false ", " ", "\ttrue\n"]) assert.throws(() => chatEnabledFromEnv({ VC_CHAT_ENABLED: bad }), ChatConfigError, bad);
});

test("A20 flag off: nothing is built and every chat path answers exactly like an unknown path (404), for every method, without touching the main handler", async () => {
  const gates = gatesFixture();
  try {
    const off = createChatApi(baseDeps(), { enabled: false, gatesDir: gates.gates, now: NOW, approver: APPROVER });
    assert.equal(off, undefined);
    let mainCalls = 0;
    const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const main = createApiHandler({
      verifier: createJwtVerifier(jwtConfigFromEnv({ VC_JWT_ISSUER: "https://x.test", VC_JWT_PUBLIC_KEY: keys.publicKey.export({ type: "spki", format: "pem" }).toString() })),
      dbForTenant: () => { mainCalls++; throw new Error("no db"); },
      graphForTenant: () => { mainCalls++; throw new Error("no graph"); },
    });
    const composed = withChatRoutes(main, off);
    const unknown = await composed(chatRequest("POST", "/v1/students/stu-1/nothing", { body: "{}" }));
    for (const method of ["POST", "GET", "PUT", "DELETE"]) {
      const res = await composed(chatRequest(method, threadsPath("stu-1"), { body: "{}" }));
      assert.equal(res.status, unknown.status, `${method}: with the flag off the path falls through to the main handler, like any unknown /v1 path`);
      assert.equal(res.body, unknown.body);
    }
    assert.equal(mainCalls, 0);
  } finally {
    cleanupGates(gates);
  }
});

test("A20 flag on but gate closed: a temp copy of the real repo qa/gates with B13 set back to pending refuses to build the chat routes", () => {
  // pc-hardening-7 (ISS-pc-partner-keys-8): no longer depends on the live B13 state of the repo (signed since D-109).
  const g = realGatesWithB13Pending();
  try {
    assert.throws(
      () => createChatApi(baseDeps(), { enabled: true, gatesDir: g.gates, now: NOW, approver: APPROVER, env: {} }),
      (e: unknown) => e instanceof GoLiveRefusedError && e.result.failures.some((x) => x.startsWith(GATE_FILES.b13)),
    );
  } finally {
    cleanupGates(g);
  }
});

test("A20 real gates: the repo's actual qa/gates with VC_GATE_APPROVER unset, empty or blank refuse to build the chat routes with the needs-VC_GATE_APPROVER reason, whoever signed B13", () => {
  // pc-hardening-7 (R2): reads the REAL gates (read only). The reason holds for any signer; if B13 were ever reset to pending the refusal still names B13.
  const b13 = readFileSync(join(REPO_GATES, GATE_FILES.b13), "utf8");
  const signed = /^`?B13-signed: SIGNED \S+ by \p{Lu}/mu.test(b13);
  for (const env of [{}, { VC_GATE_APPROVER: "" }, { VC_GATE_APPROVER: "   " }]) {
    assert.throws(
      () => createChatApi(baseDeps(), { enabled: true, gatesDir: REPO_GATES, now: NOW, env }),
      (e: unknown) => {
        assert.ok(e instanceof GoLiveRefusedError, "GoLiveRefusedError");
        const b13Failure = e.result.failures.find((x) => x.startsWith(GATE_FILES.b13));
        assert.ok(b13Failure, e.result.failures.join(" | "));
        if (signed) assert.ok(b13Failure.includes("B13-signed needs VC_GATE_APPROVER (the repo approver) to be set"), b13Failure);
        return true;
      },
      JSON.stringify(env),
    );
  }
});

test("A20: each missing gate record refuses; voice's A10 and anonymous option b are NOT needed for authenticated chat", () => {
  const cases: [string, Parameters<typeof gatesFixture>[0]][] = [
    ["B13 pending", { b13: "`B13-signed: PENDING`\n" }],
    ["g-publish open", { gPublish: "**Status:** OPEN\n" }],
    ["nights missing", { nights: null }],
  ];
  for (const [label, override] of cases) {
    const f = gatesFixture(override);
    try {
      assert.throws(() => createChatApi(baseDeps(), { enabled: true, gatesDir: f.gates, now: NOW, approver: APPROVER, env: {} }), GoLiveRefusedError, label);
    } finally {
      cleanupGates(f);
    }
  }
  const ok = gatesFixture({ a10: null, gProd: "Answered: 2026-10-16T10:10:00+05:30 - a - authenticated only\n" });
  try {
    assert.ok(createChatApi(baseDeps(), { enabled: true, gatesDir: ok.gates, now: NOW, approver: APPROVER, env: {} }));
  } finally {
    cleanupGates(ok);
  }
});

test("no student text is traced: an environment that switches LangChain/LangSmith tracing on refuses to build the chat routes", () => {
  const f = gatesFixture();
  try {
    for (const env of [{ LANGSMITH_TRACING: "true" }, { LANGCHAIN_TRACING_V2: "true" }]) {
      assert.throws(() => createChatApi(baseDeps(), { enabled: true, gatesDir: f.gates, now: NOW, approver: APPROVER, env }), /tracing/i, JSON.stringify(env));
    }
  } finally {
    cleanupGates(f);
  }
});

test("the chat route list equals the draft student paths (without voice) and none of them is in the counsellor route table", () => {
  const draft: string[] = [];
  for (const [path, ops] of Object.entries(STUDENT_API_DRAFT.paths)) {
    for (const [method, op] of Object.entries(ops as Record<string, { "x-roles"?: string[] }>)) {
      if (op["x-roles"]?.includes("student") && !path.includes("/voice/")) draft.push(`${method.toUpperCase()} ${path}`);
    }
  }
  assert.deepEqual(CHAT_ROUTES.map((r) => `${r.method} ${r.path}`).sort(), draft.sort());
  assert.ok(CHAT_ROUTES.every((r) => r.roles === "student"));
  const main = new Set(API_ROUTES.map((r) => `${r.method} ${r.path}`));
  for (const r of CHAT_ROUTES) assert.ok(!main.has(`${r.method} ${r.path}`), r.path);
});

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

test("a request with no token, a garbage token or a token signed by a stranger is refused 401 with one identical body, and nothing is read or written", async () => {
  const w = chatWorld();
  try {
    const stranger = await studentToken(adult(), { key: generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey });
    const bodies = new Set<string>();
    for (const token of [undefined, "not-a-token", stranger]) {
      const res = await call(w, "POST", threadsPath("stu-1"), token ? { token } : {});
      assert.equal(res.status, 401);
      assert.ok(res.headers["www-authenticate"]);
      bodies.add(res.body);
    }
    assert.equal(bodies.size, 1);
    assert.equal(everythingStored(w.fakeDb), "[]");
  } finally {
    w.cleanup();
  }
});

test("a counsellor, admin or approver token, validly signed with the student key, is refused 403 on every student route", async () => {
  const w = chatWorld();
  try {
    for (const role of ["counsellor", "admin", "approver"]) {
      const token = await studentToken({ tenant: "tenant-a", counsellorId: "c-1", studentId: "stu-1", role });
      for (const [method, path, body] of [
        ["POST", threadsPath("stu-1"), undefined],
        ["GET", `${threadsPath("stu-1")}/th-1`, undefined],
        ["POST", turnsPath("stu-1", "th-1"), { text: "hello" }],
        ["GET", "/v1/students/stu-1/chat/profile", undefined],
        ["POST", "/v1/students/stu-1/chat/profile/facts/f1/decision", { action: "confirm" }],
      ] as const) {
        const res = await call(w, method, path, { token, ...(body ? { body } : {}) });
        assert.equal(res.status, 403, `${role} ${method} ${path}`);
      }
    }
    assert.equal(everythingStored(w.fakeDb), "[]");
    assert.equal(w.provider.calls.length, 0);
  } finally {
    w.cleanup();
  }
});

test("a student whose token names a different student than the path gets 404 (not 403) and nothing is created", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult("stu-1"));
    const res = await call(w, "POST", threadsPath("stu-2"), { token });
    assert.equal(res.status, 404);
    assert.equal(everythingStored(w.fakeDb), "[]");
  } finally {
    w.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Threads and turns
// ---------------------------------------------------------------------------

test("a student starts a thread, asks a sourced question, and reads the exchange back in order", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const turn = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: GERMANY_QUESTION, clientTurnId: "c-1" } });
    assert.equal(turn.status, 200);
    assert.equal(turn.json.state, "ok");
    assert.equal(turn.json.turnId, "c-1");
    assert.ok(turn.json.claims.length >= 1);
    const hist = await call(w, "GET", `${threadsPath("stu-1")}/${threadId}`, { token });
    assert.equal(hist.status, 200);
    assert.deepEqual(hist.json.turns.map((t: { role: string; turnId: string }) => [t.role, t.turnId]), [["user", "c-1"], ["assistant", "c-1"]]);
    assert.equal(hist.json.turns[0].text, GERMANY_QUESTION);
    assert.equal(hist.json.textStored, undefined);
  } finally {
    w.cleanup();
  }
});

test("a student whose phone retries the same clientTurnId after a dropped response gets the same answer, one model call, one stored exchange and one usage count", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const body = { text: GERMANY_QUESTION, clientTurnId: "retry-1" };
    const first = await call(w, "POST", turnsPath("stu-1", threadId), { token, body });
    const callsAfterFirst = w.provider.calls.length;
    const second = await call(w, "POST", turnsPath("stu-1", threadId), { token, body });
    assert.equal(second.status, 200);
    assert.deepEqual(second.json, first.json);
    assert.equal(w.provider.calls.length, callsAfterFirst, "the replay did not call the model again");
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 2);
    const usage = w.fakeDb.collection<{ textTurns: number }>(COLLECTION_NAMES.student_usage).all();
    assert.equal(usage.length, 1);
    assert.equal(usage[0]!.textTurns, 1);
  } finally {
    w.cleanup();
  }
});

test("the same clientTurnId reused with different text is refused 409, and the first answer is kept", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: GERMANY_QUESTION, clientTurnId: "c-1" } });
    const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: "What about the UK instead?", clientTurnId: "c-1" } });
    assert.equal(res.status, 409);
    assert.equal(res.json.error, "turn_id_conflict");
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 2);
  } finally {
    w.cleanup();
  }
});

test("a second tab sending the same clientTurnId while the first is still being answered gets 409 turn_in_progress and no second model call", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    // The first tab's claim, held (a lease that has not expired), as if its model call were still running.
    const scoped = w.deps.dbForTenant("tenant-a");
    const held = await claimChatTurn(scoped, { studentId: "stu-1", threadId, turnId: "dup-1", text: GERMANY_QUESTION, requestHash: createHash("sha256").update(GERMANY_QUESTION).digest("hex"), channel: "text" }, { now: new Date(w.clock.ms) });
    assert.equal(held.kind, "claimed");
    const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: GERMANY_QUESTION, clientTurnId: "dup-1" } });
    assert.equal(res.status, 409);
    assert.equal(res.json.error, "turn_in_progress");
    assert.equal(w.provider.calls.length, 0);
  } finally {
    w.cleanup();
  }
});

test("a turn without a clientTurnId gets a server-made turn id, and two such turns are two exchanges", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const a = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: GERMANY_QUESTION } });
    const b = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: GERMANY_QUESTION } });
    assert.notEqual(a.json.turnId, b.json.turnId);
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 4);
  } finally {
    w.cleanup();
  }
});

test("a model outage gives the apology answer, keeps nothing, and the student's retry with the same clientTurnId runs again", async () => {
  const failing = new MockProvider({ responses: {} });
  const w = chatWorld({ provider: failing });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const body = { text: GERMANY_QUESTION, clientTurnId: "out-1" };
    const down = await call(w, "POST", turnsPath("stu-1", threadId), { token, body });
    assert.equal(down.status, 200);
    assert.match(down.json.message, /try again/i);
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 0, "no half-finished exchange is kept");
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.student_usage).all().length, 0, "a failed turn is not counted against the student");
    // The outage ends; the retry (same clientTurnId) runs the model and is answered and kept.
    failing.setResponse("kb-answer", { claims: [{ text: "Public universities in Germany charge no tuition for most programmes.", kind: "fact", sourceIds: ["t-sem-1"] }] });
    failing.setResponse("vc-capabilities", { reply: "unused", questions: ["a?", "b?"] });
    const retry = await call(w, "POST", turnsPath("stu-1", threadId), { token, body });
    assert.equal(retry.json.state, "ok");
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 2);
  } finally {
    w.cleanup();
  }
});

test("a body that carries identity or unknown fields, bad JSON, an empty or over-long text, or an oversized body is refused before anything runs", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const path = turnsPath("stu-1", threadId);
    for (const body of [{ text: "hi", studentId: "stu-2" }, { text: "hi", tenantId: "tenant-b" }, { text: "hi", extra: 1 }, { text: "" }, {}, { text: 5 }, { text: "x".repeat(4001) }, [], "not json"]) {
      const res = await call(w, "POST", path, { token, body });
      assert.equal(res.status, 400, JSON.stringify(body).slice(0, 60));
    }
    const big = await call(w, "POST", path, { token, body: "{}", readBody: () => Promise.reject(new BodyTooLargeError()) });
    assert.equal(big.status, 413);
    assert.equal(w.provider.calls.length, 0);
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 0);
  } finally {
    w.cleanup();
  }
});

test("an unknown thread, or one that belongs to another student of the same tenant, is a 404 that does not say which", async () => {
  const w = chatWorld();
  try {
    const t1 = await studentToken(adult("stu-1"));
    const t2 = await studentToken(adult("stu-2"));
    const threadId = await newThread(w, t1, "stu-1");
    const own = await call(w, "GET", `${threadsPath("stu-2")}/${threadId}`, { token: t2 });
    const none = await call(w, "GET", `${threadsPath("stu-2")}/does-not-exist`, { token: t2 });
    assert.equal(own.status, 404);
    assert.equal(own.body, none.body);
    const turn = await call(w, "POST", turnsPath("stu-2", threadId), { token: t2, body: { text: GERMANY_QUESTION } });
    assert.equal(turn.status, 404);
    assert.equal(w.provider.calls.length, 0);
  } finally {
    w.cleanup();
  }
});

test("a path id with odd characters is refused 404 (path ids are letters, digits, dot, dash, underscore only)", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    for (const path of ["/v1/students/stu-1/chat/threads/a%2Fb", "/v1/students/stu-1/chat/threads/..", "/v1/students/stu-1/chat/threads/a b"]) {
      assert.equal((await call(w, "GET", path, { token })).status, 404, path);
    }
  } finally {
    w.cleanup();
  }
});

test("a wrong method on a chat path is 405 with Allow, and a non-chat path is left to the main handler", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const res = await call(w, "DELETE", threadsPath("stu-1"), { token });
    assert.equal(res.status, 405);
    assert.ok(res.headers["allow"]);
    const composed = withChatRoutes(async () => ({ status: 299, headers: {}, body: "main" }), w.handler);
    assert.equal((await composed(chatRequest("GET", "/v1/students/stu-1/profile"))).status, 299);
    assert.equal((await composed(chatRequest("POST", "/v1/students/stu-1/chat/threads"))).status, 401, "a chat path goes to the chat handler, which wants a token");
  } finally {
    w.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Rate limit (A23)
// ---------------------------------------------------------------------------

test("A23: the 31st request in a minute from one student is 429 with Retry-After, another student is not affected, and the window reopens", async () => {
  const w = chatWorld();
  try {
    const t1 = await studentToken(adult("stu-1"));
    const t2 = await studentToken(adult("stu-2"));
    const th1 = await newThread(w, t1, "stu-1"); // request 1 of 30
    const th2 = await newThread(w, t2, "stu-2");
    for (let i = 2; i <= 30; i++) {
      const r = await call(w, "GET", `${threadsPath("stu-1")}/${th1}`, { token: t1 });
      assert.equal(r.status, 200, `request ${i}`);
    }
    const over = await call(w, "GET", `${threadsPath("stu-1")}/${th1}`, { token: t1 });
    assert.equal(over.status, 429);
    assert.ok(Number(over.headers["retry-after"]) >= 1);
    assert.equal((await call(w, "GET", `${threadsPath("stu-2")}/${th2}`, { token: t2 })).status, 200);
    w.clock.ms += 61_000;
    assert.equal((await call(w, "GET", `${threadsPath("stu-1")}/${th1}`, { token: t1 })).status, 200);
  } finally {
    w.cleanup();
  }
});

test("A23: a tenant override of requestsPerMinute applies to that tenant only", async () => {
  const w = chatWorld({ deps: { limitsForTenant: (t) => (t === "tenant-b" ? { requestsPerMinute: 2 } : undefined) } });
  try {
    const b = await studentToken(adult("stu-1", "tenant-b"));
    const a = await studentToken(adult("stu-1", "tenant-a"));
    const thB = await newThread(w, b);
    assert.equal((await call(w, "GET", `${threadsPath("stu-1")}/${thB}`, { token: b })).status, 200);
    assert.equal((await call(w, "GET", `${threadsPath("stu-1")}/${thB}`, { token: b })).status, 429);
    const thA = await newThread(w, a);
    for (let i = 0; i < 5; i++) assert.equal((await call(w, "GET", `${threadsPath("stu-1")}/${thA}`, { token: a })).status, 200);
  } finally {
    w.cleanup();
  }
});

test("A23: a crisis message is never rate limited, even from a student already over the limit", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    for (let i = 0; i < 40; i++) await call(w, "GET", `${threadsPath("stu-1")}/${threadId}`, { token });
    assert.equal((await call(w, "GET", `${threadsPath("stu-1")}/${threadId}`, { token })).status, 429);
    const crisis = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: "I want to kill myself", clientTurnId: "cr-1" } });
    assert.equal(crisis.status, 200);
    assert.equal(crisis.json.state, "escalated");
  } finally {
    w.cleanup();
  }
});

// ISS-303 (D-103): the authenticated turn route has the same shape as the anonymous route after ISS-135 (D-101): the crisis scan runs on the
// full text before the limiter, so its CPU is bounded only by the body cap. The cap is the ISS-300 budget (64 KiB); a larger body is a 413
// that still carries the helpline, and is never scanned.
const CRISIS_PHRASE = "I want to kill myself.";
const FILLER = "I am writing a long message about my exams and my plans. ";
/** A turn body of about `kib` KiB with the crisis phrase at the start, in the middle or at the end. */
const crisisBody = (kib: number, where: "start" | "middle" | "end"): string => {
  const half = FILLER.repeat(Math.ceil((kib * 1024) / FILLER.length / 2));
  const text = where === "start" ? `${CRISIS_PHRASE} ${half}${half}` : where === "middle" ? `${half}${CRISIS_PHRASE} ${half}` : `${half}${half}${CRISIS_PHRASE}`;
  return JSON.stringify({ text, clientTurnId: `iss303-${kib}-${where}` });
};
const WHERE = ["start", "middle", "end"] as const;

test("ISS-303: the authenticated chat body cap is the 64 KiB scan budget of the anonymous route (ISS-300), not 256 KiB", () => {
  assert.equal(MAX_CHAT_BODY_BYTES, 64 * 1024);
});

test("ISS-303: a turn body over the cap is a 413 that still carries the helpline, never scanned, no model, nothing stored, whatever the crisis phrase position", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const path = turnsPath("stu-1", threadId);
    for (const kib of [100, 300]) {
      for (const where of WHERE) {
        const body = crisisBody(kib, where);
        assert.ok(Buffer.byteLength(body) > MAX_CHAT_BODY_BYTES);
        const res = await call(w, "POST", path, { token, body });
        assert.equal(res.status, 413, `${kib} KiB ${where}`);
        assert.equal(res.json.error, "body_too_large");
        assert.equal(res.json.helpline, TELE_MANAS_LINE, `${kib} KiB ${where}: a 413 carries the helpline`);
      }
    }
    // The real server rejects while reading, so the handler never sees the text at all.
    const streamed = await call(w, "POST", path, { token, body: "{}", readBody: () => Promise.reject(new BodyTooLargeError()) });
    assert.equal(streamed.status, 413);
    assert.equal(streamed.json.helpline, TELE_MANAS_LINE);
    assert.equal(w.provider.calls.length, 0);
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 0);
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.student_flags).all().length, 0);
  } finally {
    w.cleanup();
  }
});

test("ISS-303: a crisis phrase at the start, middle or end of a body inside the cap, far over the 4000-character turn limit, gets the fixed crisis answer", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    for (const [i, where] of WHERE.entries()) {
      const threadId = await newThread(w, token);
      const body = crisisBody(50, where);
      assert.ok(Buffer.byteLength(body) < MAX_CHAT_BODY_BYTES && JSON.parse(body).text.length > 4000);
      const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body });
      assert.equal(res.status, 200, `${where} (${i})`);
      assert.equal(res.json.state, "escalated", where);
      assert.match(res.json.message, /14416/);
    }
    // The same size without a crisis phrase is a plain 400: the over-long refusal is unchanged.
    const threadId = await newThread(w, token);
    const plain = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: FILLER.repeat(200) } });
    assert.equal(plain.status, 400);
  } finally {
    w.cleanup();
  }
});

test("ISS-303: a student already over the rate limit who sends a long (inside the cap) crisis message still gets the crisis answer; a plain message is 429", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const path = turnsPath("stu-1", threadId);
    for (let i = 0; i < 40; i++) await call(w, "GET", `${threadsPath("stu-1")}/${threadId}`, { token });
    assert.equal((await call(w, "POST", path, { token, body: { text: GERMANY_QUESTION, clientTurnId: "rl-plain" } })).status, 429);
    for (const where of WHERE) {
      const res = await call(w, "POST", path, { token, body: crisisBody(50, where) });
      assert.equal(res.status, 200, where);
      assert.equal(res.json.state, "escalated", where);
    }
    const short = await call(w, "POST", path, { token, body: { text: CRISIS_PHRASE, clientTurnId: "rl-short" } });
    assert.equal(short.status, 200);
    assert.equal(short.json.state, "escalated");
  } finally {
    w.cleanup();
  }
});

// ISS-350 (D-104): the crisis exemption must come before the shape checks. A body with a crisis `text` and an unknown key or a bad clientTurnId
// used to be a plain 400 with no crisis answer and no helpline. The crisis turn is now answered and escalated like any other, from `text` only.
const EVIL_MARK = "EVIL-MARK-350";
const CRISIS_TEXTS = [
  ["latin", "I want to kill myself"],
  ["devanagari", "मैं मरना चाहता हूँ"],
] as const;
const MALFORMED: readonly [string, (text: string) => Record<string, unknown>][] = [
  ["unknown key", (text) => ({ text, role: EVIL_MARK })],
  ["unknown tenantId key", (text) => ({ text, tenantId: EVIL_MARK, clientTurnId: "iss350-ok" })],
  ["clientTurnId with a path separator", (text) => ({ text, clientTurnId: `../${EVIL_MARK}` })],
  ["clientTurnId with a space", (text) => ({ text, clientTurnId: `a ${EVIL_MARK}` })],
  ["clientTurnId over 128 characters", (text) => ({ text, clientTurnId: "x".repeat(129) })],
  ["clientTurnId that is not a string", (text) => ({ text, clientTurnId: 12345 })],
  ["unknown key and a bad clientTurnId", (text) => ({ text, extra: EVIL_MARK, clientTurnId: `../${EVIL_MARK}` })],
];

test("ISS-350: a crisis text with an unknown key or an invalid clientTurnId, Latin or Devanagari, gets the fixed crisis answer, an escalation and a flag, with no malformed field stored", async () => {
  for (const [script, text] of CRISIS_TEXTS) {
    for (const [name, make] of MALFORMED) {
      const w = chatWorld();
      try {
        const token = await studentToken(adult());
        const threadId = await newThread(w, token);
        const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: make(text) });
        assert.equal(res.status, 200, `${script} / ${name}`);
        assert.equal(res.json.state, "escalated", `${script} / ${name}`);
        assert.match(res.json.message, /14416/, `${script} / ${name}: the helpline is in the answer`);
        assert.equal(w.escalations.length, 1, `${script} / ${name}: escalated`);
        assert.equal(w.fakeDb.collection(COLLECTION_NAMES.student_flags).all().length, 1, `${script} / ${name}: flagged`);
        const kept = everythingStored(w.fakeDb) + JSON.stringify(w.escalations) + JSON.stringify(w.logs) + res.body;
        assert.ok(!kept.includes(EVIL_MARK), `${script} / ${name}: no malformed field is stored, logged, escalated or echoed`);
        assert.ok(!kept.includes("12345") && !kept.includes("xxxxxxxxxx"), `${script} / ${name}: no malformed clientTurnId is kept`);
      } finally {
        w.cleanup();
      }
    }
  }
});

test("ISS-350: a crisis text with a bad field is also answered for a student already over the rate limit, and for an over-long crisis text with an unknown key", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const threadB = await newThread(w, token);
    const path = turnsPath("stu-1", threadId);
    for (let i = 0; i < 40; i++) await call(w, "GET", `${threadsPath("stu-1")}/${threadId}`, { token });
    assert.equal((await call(w, "POST", path, { token, body: { text: GERMANY_QUESTION } })).status, 429);
    const limited = await call(w, "POST", path, { token, body: { text: CRISIS_PHRASE, role: EVIL_MARK } });
    assert.equal(limited.status, 200);
    assert.equal(limited.json.state, "escalated");
    const long = await call(w, "POST", turnsPath("stu-1", threadB), { token, body: { text: `${FILLER.repeat(100)}${CRISIS_PHRASE}`, role: EVIL_MARK, clientTurnId: "../x" } });
    assert.equal(long.status, 200);
    assert.equal(long.json.state, "escalated");
    assert.ok(!everythingStored(w.fakeDb).includes(EVIL_MARK));
  } finally {
    w.cleanup();
  }
});

test("ISS-350: a benign text with the same unknown key or invalid clientTurnId stays a plain 400, with no model call and nothing stored", async () => {
  for (const [name, make] of MALFORMED) {
    for (const text of [GERMANY_QUESTION, "मुझे जर्मनी में पढ़ाई की फीस जाननी है"]) {
      const w = chatWorld();
      try {
        const token = await studentToken(adult());
        const threadId = await newThread(w, token);
        const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: make(text) });
        assert.equal(res.status, 400, name);
        assert.equal(res.json.error, "invalid_request", name);
        assert.equal(res.json.helpline, undefined, `${name}: a benign 400 is unchanged (no helpline)`);
        assert.equal(w.provider.calls.length, 0, name);
        assert.equal(w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 0, name);
        assert.equal(w.escalations.length, 0, name);
      } finally {
        w.cleanup();
      }
    }
  }
});

test("ISS-350: non-string text and unparseable JSON stay a plain 400, whatever else the body carries", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const path = turnsPath("stu-1", threadId);
    for (const body of [{ text: 42, role: "x" }, { text: ["I want to kill myself"] }, { role: "x" }, "{not json I want to kill myself", "[]", "null"]) {
      const res = await call(w, "POST", path, { token, body });
      assert.equal(res.status, 400, JSON.stringify(body));
    }
    assert.equal(w.escalations.length, 0);
  } finally {
    w.cleanup();
  }
});

/** How many times `text.trim()` runs on exactly `text` while `fn` runs: the first line of crisisGuard, so one count per guard scan of that text. */
async function countScans(text: string, fn: () => Promise<unknown> | unknown): Promise<number> {
  const original = String.prototype.trim;
  let n = 0;
  String.prototype.trim = function (this: string): string {
    if (String(this) === text) n++;
    return original.call(this);
  };
  try {
    await fn();
  } finally {
    String.prototype.trim = original;
  }
  return n;
}

test("ISS-350: the fix adds no scan: a malformed crisis turn scans exactly as often as a well-formed one, and a malformed benign turn is scanned once", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const crisisText = "Scan count probe: I want to kill myself";
    const benignText = "Scan count probe: what are tuition fees in Germany?";
    const newPath = async () => turnsPath("stu-1", await newThread(w, token));
    const okPath = await newPath();
    const wellFormed = await countScans(crisisText, () => call(w, "POST", okPath, { token, body: { text: crisisText } }));
    const malformedPath = await newPath();
    const malformed = await countScans(crisisText, () => call(w, "POST", malformedPath, { token, body: { text: crisisText, role: EVIL_MARK } }));
    assert.ok(wellFormed >= 1);
    assert.equal(malformed, wellFormed, "the malformed crisis turn runs the same scans as the well-formed one");
    const benignPath = await newPath();
    const direct = await countScans(benignText, () => crisisGuard(benignText));
    const benign = await countScans(benignText, () => call(w, "POST", benignPath, { token, body: { text: benignText, role: EVIL_MARK } }));
    assert.equal(benign, direct, "a malformed benign turn is scanned once by the route and then refused");
  } finally {
    w.cleanup();
  }
});

// ---------------------------------------------------------------------------
// D-110: no servable source -> disclaimer + expert answer
// ---------------------------------------------------------------------------

test("D-110: a signed-in student's question with no servable source gets the disclaimer plus an expert answer; the state is still no_sourced_answer, claims and sources are empty, the gap is still counted", async () => {
  const GUIDANCE = "Hostels in Lisbon usually cost about 400 to 700 euros a month, and student residences near the university are often cheaper.";
  const provider = kbAnswerProvider();
  provider.setResponse("kb-general-guidance", { answer: GUIDANCE });
  const w = chatWorld({ kb: recordingKb({ status: "ok", hits: [], dropped: 0 }), provider });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: "Which hostel is best in Lisbon?", clientTurnId: "d110-1" } });
    assert.equal(res.json.state, "no_sourced_answer");
    assert.equal(res.json.message, `General guidance — I couldn't find this in Vidysea's verified sources, so please confirm fees, deadlines and amounts on the official website. ${GUIDANCE}`);
    assert.deepEqual(res.json.claims, []);
    assert.deepEqual(res.json.sources, []);
    assert.doesNotMatch(res.json.message, /14416/);
    const gaps = w.fakeDb.collection<Record<string, unknown>>(COLLECTION_NAMES.chat_gap_counts).all();
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0]!.kind, "no_sourced_answer");
  } finally {
    w.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Gap counts
// ---------------------------------------------------------------------------

test("a question the knowledge base cannot answer says so, and adds one text-free count to the day's gap total (no student, thread or text)", async () => {
  const w = chatWorld({ kb: recordingKb({ status: "ok", hits: [], dropped: 0 }) });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: "Which hostel is best in Lisbon?", clientTurnId: "gap-1" } });
    assert.equal(res.json.state, "no_sourced_answer");
    const gaps = w.fakeDb.collection<Record<string, unknown>>(COLLECTION_NAMES.chat_gap_counts).all();
    assert.equal(gaps.length, 1);
    assert.deepEqual(Object.keys(gaps[0]!).sort(), ["_id", "count", "date", "kind", "tenantId"]);
    assert.equal(gaps[0]!.kind, "no_sourced_answer");
    assert.equal(gaps[0]!.count, 1);
    assert.ok(!JSON.stringify(gaps).includes("hostel"));
  } finally {
    w.cleanup();
  }
});

// ---------------------------------------------------------------------------
// p1-nosource-grounded G1 (API): grounded first for a signed-in student's no-source question
// ---------------------------------------------------------------------------

test("G1 (API): a signed-in student's no-source question with grounding on gets the disclaimer plus the grounded answer; web sources are structured; the gap is still counted; only the redacted question reaches the web", async () => {
  const GROUNDED = "Student hostels in Lisbon commonly cost 400 to 700 euros a month, and residences run by the university are usually cheaper.";
  const grounding = new MockGroundedAnswerer({ text: GROUNDED, sources: [{ title: "Lisbon housing", url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/CCC" }] });
  const w = chatWorld({ kb: recordingKb({ status: "ok", hits: [], dropped: 0 }), deps: { graph: { grounding } } });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: "Which hostel is best in Lisbon?", clientTurnId: "g1-api-1" } });
    assert.equal(res.json.state, "no_sourced_answer");
    assert.equal(res.json.message, `General guidance — I couldn't find this in Vidysea's verified sources, so please confirm fees, deadlines and amounts on the official website. ${GROUNDED}`);
    assert.deepEqual(res.json.claims, []);
    assert.deepEqual(res.json.sources.map((s: { kind: string; url: string; title: string }) => [s.kind, s.title, s.url]), [["web", "Lisbon housing", "https://vertexaisearch.cloud.google.com/grounding-api-redirect/CCC"]]);
    assert.equal(grounding.calls.length, 1);
    assert.equal(grounding.calls[0]!.question, "Which hostel is best in Lisbon?");
    const gaps = w.fakeDb.collection<Record<string, unknown>>(COLLECTION_NAMES.chat_gap_counts).all();
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0]!.kind, "no_sourced_answer");
  } finally {
    w.cleanup();
  }
});

test("H6 (API): the grounded-call cap is per chat thread; the next turn in the same thread falls back to the no-source reply (no crash), a new thread is grounded again", async () => {
  const GROUNDED = "Student hostels in Lisbon commonly cost 400 to 700 euros a month, and residences run by the university are usually cheaper.";
  const grounding = new MockGroundedAnswerer({ text: GROUNDED, sources: [] });
  const w = chatWorld({ kb: recordingKb({ status: "ok", hits: [], dropped: 0 }), deps: { graph: { grounding }, groundingBudget: new GroundingBudget({ maxPerSession: 1, maxPerDay: 50 }) } });
  try {
    const token = await studentToken(adult());
    const t1 = await newThread(w, token);
    const first = await call(w, "POST", turnsPath("stu-1", t1), { token, body: { text: "Which hostel is best in Lisbon?", clientTurnId: "h6-api-1" } });
    assert.ok(first.json.message.includes(GROUNDED));
    const second = await call(w, "POST", turnsPath("stu-1", t1), { token, body: { text: "Which hostel is best in Porto?", clientTurnId: "h6-api-2" } });
    assert.equal(second.status, 200);
    assert.equal(second.json.state, "no_sourced_answer");
    assert.ok(!second.json.message.includes(GROUNDED), second.json.message);
    assert.equal(grounding.calls.length, 1, "the capped turn never reached the web");
    const t2 = await newThread(w, token);
    const third = await call(w, "POST", turnsPath("stu-1", t2), { token, body: { text: "Which hostel is best in Faro?", clientTurnId: "h6-api-3" } });
    assert.ok(third.json.message.includes(GROUNDED));
    assert.equal(grounding.calls.length, 2);
  } finally {
    w.cleanup();
  }
});
