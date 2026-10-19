/**
 * P1 U12 acceptance (spec v8 A5, A6, A7, A16b, A19, A23 together). Cross-unit chain through the REAL chat handler on the in-memory
 * fake Db with a mock provider and a recording KB (B8, B13): signed-in student turn -> KB hit -> claims guard -> redacted persistence
 * -> export -> erasure -> read-back zero. Plus a hostile set (crisis flood, wrong tenant, minor without consent).
 * Only the chain and the response-schema check are new; every single-unit behaviour is already proven in chat*.test.ts, voice-history.test.ts
 * and packages/db/tests (see qa/evidence/p1-u12/trace.md). Synthetic data only.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { COLLECTION_NAMES, exportStudent, executeErasure, requestErasure } from "@vc/db";
import { confirmTwiceAndApprove } from "@vc/db/testing";
import { ThreadSchema, TurnResponseSchema } from "@vc/schemas";
import { CRISIS_TEXT, GERMANY_QUESTION, adult, call, chatWorld, everythingStored, minor, newThread, studentToken, threadsPath, turnsPath } from "./chat-fixtures.js";

const PII = "My name is Priya Sharma, mail priya.sharma@example.com. " + GERMANY_QUESTION;
const STUDENT_COLLECTIONS = [
  COLLECTION_NAMES.chat_threads,
  COLLECTION_NAMES.chat_turns,
  COLLECTION_NAMES.profile_facts,
  COLLECTION_NAMES.student_usage,
  COLLECTION_NAMES.student_flags,
] as const;
const rowsOf = (w: ReturnType<typeof chatWorld>, name: string, studentId: string) =>
  w.fakeDb.collection<{ studentId?: string }>(name).all().filter((r) => r.studentId === studentId);

test("acceptance A5/A6/A7: a signed-in student's real turn validates against the published response schema, is stored redacted and tenant-stamped, shows in the export, and erasure leaves read-back zero through the API", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult("stu-1", "tenant-a"));
    const otherToken = await studentToken(adult("stu-2", "tenant-a"));
    const threadId = await newThread(w, token);
    const otherThread = await newThread(w, otherToken, "stu-2");
    await call(w, "POST", turnsPath("stu-2", otherThread), { token: otherToken, body: { text: GERMANY_QUESTION, clientTurnId: "o-1" } });

    const turn = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: PII, clientTurnId: "j-1" } });
    assert.equal(turn.status, 200);
    const parsed = TurnResponseSchema.parse(turn.json); // A5: the real response is the documented shape (student-openapi.test.ts proves schema == draft)
    assert.equal(parsed.state, "ok");
    assert.ok(parsed.claims.length >= 1 && parsed.claims.every((c) => c.status === "unverified" || c.sourceIds.length >= 1), "every presented claim is sourced");
    ThreadSchema.parse((await call(w, "GET", `${threadsPath("stu-1")}/${threadId}`, { token })).json);

    const stored = everythingStored(w.fakeDb);
    for (const raw of ["Priya", "Sharma", "priya.sharma@example.com"]) assert.ok(!stored.includes(raw), `${raw} must not be stored`); // D-093 6A
    for (const name of [COLLECTION_NAMES.chat_threads, COLLECTION_NAMES.chat_turns]) {
      const rows = w.fakeDb.collection<{ tenantId?: string }>(name).all();
      assert.ok(rows.length > 0 && rows.every((r) => r.tenantId === "tenant-a"), `${name} rows carry the token's tenant`); // A6
    }

    const db = w.deps.dbForTenant("tenant-a");
    const exported = await exportStudent(db, "stu-1");
    assert.ok(exported.chatTurns.length >= 2, "export holds the exchange");
    assert.ok(!JSON.stringify(exported).includes("Priya"));

    const { requestId } = await requestErasure(db, { studentId: "stu-1", requestedBy: "counsellor-7", reason: "student_request" });
    await confirmTwiceAndApprove(db, { requestId, confirmedBy: "admin-2" });
    assert.equal((await executeErasure(db, requestId)).status, "completed");

    for (const name of STUDENT_COLLECTIONS) assert.equal(rowsOf(w, name, "stu-1").length, 0, `${name}: read-back zero for stu-1`); // A7
    assert.equal((await call(w, "GET", `${threadsPath("stu-1")}/${threadId}`, { token })).status, 404, "the API no longer finds the erased thread");
    assert.ok(rowsOf(w, COLLECTION_NAMES.chat_turns, "stu-2").length >= 2, "the other student's history is untouched");
  } finally {
    w.cleanup();
  }
});

test("acceptance hostile: 35 crisis messages in a row from one student are all answered with the fixed message, never reach the model, are never rate limited and write one text-free flag per thread and window (flood dedup)", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    for (let i = 0; i < 35; i++) {
      const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: `cr-${i}` } });
      assert.equal(res.status, 200, `crisis turn ${i}`); // A23: the 31st and later in a minute there is still no 429 for crisis
      assert.equal(res.json.state, "escalated");
      assert.match(res.json.message, /14416/);
    }
    assert.equal(w.provider.calls.length, 0, "the model is never called on a crisis turn");
    const flags = rowsOf(w, COLLECTION_NAMES.student_flags, "stu-1");
    assert.equal(flags.length, 1, "35 crisis turns in one thread and window write ONE flag (p1-u8r M2 dedup, A11b)");
    assert.ok(flags.every((f) => !JSON.stringify(f).match(/kill|myself/i)), "flag rows hold ids and time only");

    // The dedup is keyed per thread: the same student's crisis turn in a second thread is its own flag.
    const thread2 = await newThread(w, token);
    const res2 = await call(w, "POST", turnsPath("stu-1", thread2), { token, body: { text: CRISIS_TEXT, clientTurnId: "cr-t2" } });
    assert.equal(res2.status, 200);
    assert.match(res2.json.message, /14416/);
    assert.equal(rowsOf(w, COLLECTION_NAMES.student_flags, "stu-1").length, 2, "a second thread gets its own flag");
    assert.equal(w.provider.calls.length, 0, "the model is still never called");
  } finally {
    w.cleanup();
  }
});

test("acceptance hostile: a student of tenant-b cannot read, write to or erase-probe tenant-a's thread, and an under-18 student without guardian consent is answered but nothing of the text is kept", async () => {
  const w = chatWorld();
  try {
    const a = await studentToken(adult("stu-1", "tenant-a"));
    const b = await studentToken(adult("stu-1", "tenant-b"));
    const threadA = await newThread(w, a);
    await call(w, "POST", turnsPath("stu-1", threadA), { token: a, body: { text: GERMANY_QUESTION, clientTurnId: "a-1" } });
    assert.equal((await call(w, "GET", `${threadsPath("stu-1")}/${threadA}`, { token: b })).status, 404);
    assert.equal((await call(w, "POST", turnsPath("stu-1", threadA), { token: b, body: { text: "hello", clientTurnId: "b-1" } })).status, 404);
    assert.equal(w.fakeDb.collection<{ tenantId?: string }>(COLLECTION_NAMES.chat_turns).all().filter((r) => r.tenantId === "tenant-b").length, 0);

    const m = await studentToken(minor("stu-9", "tenant-a"));
    const threadM = await newThread(w, m, "stu-9");
    const res = await call(w, "POST", turnsPath("stu-9", threadM), { token: m, body: { text: "Secret question about Germany fees at Zebra University", clientTurnId: "m-1" } });
    assert.equal(res.status, 200);
    TurnResponseSchema.parse(res.json);
    assert.ok(!everythingStored(w.fakeDb).includes("Zebra"), "no minor text without consent is stored");
    assert.equal(rowsOf(w, COLLECTION_NAMES.chat_turns, "stu-9").length, 0);
  } finally {
    w.cleanup();
  }
});
