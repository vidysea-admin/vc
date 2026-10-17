/**
 * P1 U8 (D-093 4A under-18, 6A redacted persistence; spec A6 sandbox, B12 tenant isolation, D-015/D-016 erasure fence): what the chat
 * does and does not keep. Outcome tests: the assertions read the fake Db after the request, not the handler's own claims. Synthetic data (B13).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { COLLECTION_NAMES, confirmErasure, requestErasure } from "@vc/db";
import { HIT } from "./anonymous-fixtures.js";
import { CRISIS_TEXT, GERMANY_QUESTION, adult, call, chatWorld, everythingStored, kbAnswerProvider, minor, newThread, recordingKb, studentToken, threadsPath, turnsPath } from "./chat-fixtures.js";

const PII_TEXT = "My name is Priya Sharma, call me on 9876543210 or mail priya.sharma@example.com. What are the tuition fees for public universities in Germany?";

// ---------------------------------------------------------------------------
// 6A: redacted persistence
// ---------------------------------------------------------------------------

test("D-093 6A: a student who types their name, phone and email in a question gets an answer, and none of the three is in anything stored", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: PII_TEXT, clientTurnId: "pii-1" } });
    assert.equal(res.status, 200);
    assert.equal(res.json.state, "ok");
    const stored = everythingStored(w.fakeDb);
    for (const raw of ["Priya", "Sharma", "9876543210", "priya.sharma@example.com"]) assert.ok(!stored.includes(raw), `${raw} must not be stored`);
    assert.ok(stored.includes("[PHONE]") && stored.includes("[EMAIL]") && stored.includes("[NAME]"));
    // The live turn may still reach the model (D-093 6A): the answer above came from the unredacted question.
    assert.ok(JSON.stringify(w.provider.calls).includes("9876543210"));
    // The history a student reads back is the redacted text too.
    const hist = await call(w, "GET", `${threadsPath("stu-1")}/${threadId}`, { token });
    assert.ok(!hist.body.includes("9876543210"));
  } finally {
    w.cleanup();
  }
});

test("D-093 6A: a name the Pathlynks profile supplies is redacted from stored text even when the student never said 'my name is'", async () => {
  const w = chatWorld({ deps: { profile: { facts: async () => [{ key: "full_name", value: "Meera Kulkarni", source: "pathlynks" }] } } });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: `${GERMANY_QUESTION} Asking for Meera Kulkarni.`, clientTurnId: "n-1" } });
    assert.ok(!everythingStored(w.fakeDb).includes("Kulkarni"));
  } finally {
    w.cleanup();
  }
});

test("D-093 6A: a model answer that carries an email address is stored and replayed redacted, while the first live answer is unchanged", async () => {
  // A source that itself carries an address, quoted by a verified claim: the answer message is the claim text.
  const text = "Write to admissions.desk@example.com about the semester contribution of about 300 euros.";
  const kb = recordingKb({ status: "ok", hits: [{ ...HIT, text }], dropped: 0 });
  const w = chatWorld({ kb, provider: kbAnswerProvider([{ text, kind: "fact", sourceIds: ["t-sem-1"] }]) });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const body = { text: GERMANY_QUESTION, clientTurnId: "echo-1" };
    const live = await call(w, "POST", turnsPath("stu-1", threadId), { token, body });
    assert.equal(live.status, 200);
    assert.ok(live.body.includes("admissions.desk@example.com"), "the live answer is unchanged");
    assert.ok(!everythingStored(w.fakeDb).includes("admissions.desk@example.com"), "not in anything stored");
    const replay = await call(w, "POST", turnsPath("stu-1", threadId), { token, body });
    assert.ok(!replay.body.includes("admissions.desk@example.com"));
    assert.ok(replay.body.includes("[EMAIL]"));
  } finally {
    w.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 4A: under 18
// ---------------------------------------------------------------------------

test("D-093 4A: an under-18 student with no guardian-consent claim still gets the answer, and no turn text, answer or redacted copy is stored anywhere", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(minor());
    const threadId = await newThread(w, token);
    const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: GERMANY_QUESTION, clientTurnId: "m-1" } });
    assert.equal(res.status, 200);
    assert.equal(res.json.state, "ok");
    assert.ok(res.json.claims.length >= 1, "the answer is the same quality");
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 0);
    const stored = everythingStored(w.fakeDb);
    assert.ok(!/Germany|tuition|universit/i.test(stored), "nothing the student asked or was told is stored");
    const thread = w.fakeDb.collection<Record<string, unknown>>(COLLECTION_NAMES.chat_threads).all();
    assert.equal(thread.length, 1);
    assert.equal(thread[0]!.textStored, false);
    const hist = await call(w, "GET", `${threadsPath("stu-1")}/${threadId}`, { token });
    assert.deepEqual(hist.json.turns, []);
    assert.equal(hist.json.textStored, false);
  } finally {
    w.cleanup();
  }
});

test("D-093 4A: a token with no age and no minor claim is treated as under 18 (fail closed), so its text is not stored either", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken({ tenant: "tenant-a", studentId: "stu-1", role: "student" });
    const threadId = await newThread(w, token);
    await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: GERMANY_QUESTION } });
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 0);
  } finally {
    w.cleanup();
  }
});

test("D-093 4A: an under-18 student WITH the guardian-consent claim is stored like an adult; a consent claim that is the string 'true' is not consent", async () => {
  const w = chatWorld();
  try {
    const ok = await studentToken(minor("stu-1", "tenant-a", { guardianConsent: true }));
    const threadId = await newThread(w, ok);
    await call(w, "POST", turnsPath("stu-1", threadId), { token: ok, body: { text: GERMANY_QUESTION, clientTurnId: "g-1" } });
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 2);
    const bad = await studentToken(minor("stu-2", "tenant-a", { guardianConsent: "true" }));
    const th2 = await newThread(w, bad, "stu-2");
    await call(w, "POST", turnsPath("stu-2", th2), { token: bad, body: { text: GERMANY_QUESTION, clientTurnId: "g-2" } });
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 2, "stu-2's exchange added nothing");
  } finally {
    w.cleanup();
  }
});

test("D-093 4A: a thread opened with consent that later turns come without it is marked textStored false, and the earlier stored turns stay readable", async () => {
  const w = chatWorld();
  try {
    const consented = await studentToken(minor("stu-1", "tenant-a", { guardianConsent: true }));
    const threadId = await newThread(w, consented);
    await call(w, "POST", turnsPath("stu-1", threadId), { token: consented, body: { text: GERMANY_QUESTION, clientTurnId: "a-1" } });
    const lapsed = await studentToken(minor("stu-1", "tenant-a"));
    await call(w, "POST", turnsPath("stu-1", threadId), { token: lapsed, body: { text: GERMANY_QUESTION, clientTurnId: "a-2" } });
    const hist = await call(w, "GET", `${threadsPath("stu-1")}/${threadId}`, { token: consented });
    assert.equal(hist.json.textStored, false);
    assert.deepEqual(hist.json.turns.map((t: { turnId: string }) => t.turnId), ["a-1", "a-1"]);
  } finally {
    w.cleanup();
  }
});

test("D-093 4A: a crisis message from an under-18 student without consent gets the fixed message, keeps only an ids-and-time flag row, and does not hand the text to escalation", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(minor());
    const threadId = await newThread(w, token);
    const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "cr-1" } });
    assert.equal(res.status, 200);
    assert.equal(res.json.state, "escalated");
    assert.match(res.json.message, /14416/);
    assert.equal(w.escalations.length, 0);
    const flags = w.fakeDb.collection<Record<string, unknown>>(COLLECTION_NAMES.student_flags).all();
    assert.equal(flags.length, 1);
    assert.deepEqual(Object.keys(flags[0]!).sort(), ["_id", "at", "kind", "studentId", "tenantId", "threadId", "turnId"]);
    assert.ok(!/kill|myself/i.test(everythingStored(w.fakeDb)));
  } finally {
    w.cleanup();
  }
});

test("a crisis message from an adult is answered with the fixed message, flagged in the safety log, and escalated through the tenant's escalation path", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "cr-2" } });
    assert.equal(res.json.state, "escalated");
    assert.match(res.json.message, /14416/);
    assert.equal(w.escalations.length, 1);
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.student_flags).all().length, 1);
    assert.equal(w.provider.calls.length, 0, "a crisis turn never reaches the model");
  } finally {
    w.cleanup();
  }
});

test("a student who raised a crisis flag earlier in the thread still sees the helpline on a later turn after the server restarts (the flag is read from the store)", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "cr-3" } });
    const { createChatApi } = await import("../src/chat.js");
    const fresh = createChatApi({ ...w.deps }, { enabled: true, gatesDir: w.gates.gates, now: new Date("2026-11-01T00:00:00.000Z"), approver: "Umesh", env: {} })!;
    const later = await call({ handler: fresh }, "POST", turnsPath("stu-1", threadId), { token, body: { text: GERMANY_QUESTION, clientTurnId: "cr-4" } });
    assert.match(later.json.message, /14416/);
  } finally {
    w.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Tenants, sandbox, erasure fence
// ---------------------------------------------------------------------------

test("two tenants with the same student id never see each other's threads, and every stored row carries its own tenant", async () => {
  const w = chatWorld();
  try {
    const a = await studentToken(adult("stu-1", "tenant-a"));
    const b = await studentToken(adult("stu-1", "tenant-b"));
    const thA = await newThread(w, a);
    await call(w, "POST", turnsPath("stu-1", thA), { token: a, body: { text: GERMANY_QUESTION, clientTurnId: "t-1" } });
    assert.equal((await call(w, "GET", `${threadsPath("stu-1")}/${thA}`, { token: b })).status, 404);
    assert.equal((await call(w, "POST", turnsPath("stu-1", thA), { token: b, body: { text: GERMANY_QUESTION } })).status, 404);
    const thB = await newThread(w, b);
    const histB = await call(w, "GET", `${threadsPath("stu-1")}/${thB}`, { token: b });
    assert.deepEqual(histB.json.turns, []);
    for (const row of w.fakeDb.collection<{ tenantId?: string }>(COLLECTION_NAMES.chat_turns).all()) assert.equal(row.tenantId, "tenant-a");
    for (const row of w.fakeDb.collection<{ tenantId?: string }>(COLLECTION_NAMES.chat_threads).all()) assert.ok(row.tenantId === "tenant-a" || row.tenantId === "tenant-b");
  } finally {
    w.cleanup();
  }
});

test("A6: the sandbox tenant accepts only syn- student ids (403 for a real-looking id on every route), other tenants are unaffected", async () => {
  const w = chatWorld({ deps: { sandboxTenantId: "sandbox" } });
  try {
    const real = await studentToken(adult("pl-4821", "sandbox"));
    for (const [method, path, body] of [
      ["POST", threadsPath("pl-4821"), undefined],
      ["GET", `${threadsPath("pl-4821")}/th-1`, undefined],
      ["POST", turnsPath("pl-4821", "th-1"), { text: "hello" }],
      ["GET", "/v1/students/pl-4821/chat/profile", undefined],
    ] as const) {
      const res = await call(w, method, path, { token: real, ...(body ? { body } : {}) });
      assert.equal(res.status, 403, path);
      assert.equal(res.json.error, "sandbox_synthetic_only");
    }
    assert.equal(everythingStored(w.fakeDb), "[]");
    const syn = await studentToken(adult("syn-001", "sandbox"));
    assert.equal((await call(w, "POST", threadsPath("syn-001"), { token: syn })).status, 201);
    const prod = await studentToken(adult("pl-4821", "tenant-a"));
    assert.equal((await call(w, "POST", threadsPath("pl-4821"), { token: prod })).status, 201);
  } finally {
    w.cleanup();
  }
});

test("D-015: a student whose erasure is in progress is told 409 student_fenced, the model is not called, and nothing new is kept", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const db = w.deps.dbForTenant("tenant-a");
    const { requestId } = await requestErasure(db, { studentId: "stu-1", requestedBy: "counsellor-7", reason: "student_request" });
    await confirmErasure(db, { requestId, confirmedBy: "admin-2" });
    const turn = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: GERMANY_QUESTION, clientTurnId: "f-1" } });
    assert.equal(turn.status, 409);
    assert.equal(turn.json.error, "student_fenced");
    assert.equal(w.provider.calls.length, 0);
    assert.equal((await call(w, "POST", threadsPath("stu-1"), { token })).status, 409);
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 0);
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.student_usage).all().length, 0);
  } finally {
    w.cleanup();
  }
});

test("a 500 from an unexpected failure carries no cause and the log line carries no student text", async () => {
  const w = chatWorld({
    deps: {
      dbForTenant: () => {
        throw new Error(`boom with ${GERMANY_QUESTION} and 9876543210`);
      },
    },
  });
  try {
    const token = await studentToken(adult());
    const res = await call(w, "POST", threadsPath("stu-1"), { token });
    assert.equal(res.status, 500);
    assert.deepEqual(res.json, { error: "internal" });
    assert.ok(!JSON.stringify(w.logs).includes("9876543210"));
    assert.equal(w.logs.length, 1);
  } finally {
    w.cleanup();
  }
});
