/**
 * P1 U8: the authenticated student chat store (chat_threads / chat_turns / student_usage). Fake DB only (B8).
 * All text here is invented (B13). Each test name says which real scenario reaches the behaviour.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLLECTION_NAMES,
  ChatTurnConflictError,
  ChatTurnLeaseLostError,
  StudentFencedError,
  TenantScopeError,
  abandonChatTurn,
  ChatThreadNotFoundError,
  appendVoiceAudit,
  appendVoiceTurn,
  claimChatTurn,
  completeChatTurn,
  confirmErasure,
  createChatThread,
  getChatThread,
  getStudentUsage,
  listChatTurns,
  markChatThreadTextNotStored,
  recordStudentUsage,
  requestErasure,
  tenantScopedDb,
} from "../src/index.js";
import { createFakeDb } from "./fakes.js";

function setup() {
  const { db, fakeDb } = createFakeDb();
  return { db, fakeDb, a: tenantScopedDb(db, "tenantA"), b: tenantScopedDb(db, "tenantB") };
}

const RESPONSE = { state: "ok", message: "Germany has several public universities.", claims: [], sources: [], profileFactsUsed: [] };
const claimInput = (over: Record<string, unknown> = {}) => ({
  studentId: "stu-1",
  threadId: "th-1",
  turnId: "turn-1",
  text: "what about [NAME] fees",
  requestHash: "h1",
  channel: "text" as const,
  ...over,
});

test("a student opening the chat gets a thread owned by them; another student cannot read it", async () => {
  const { a } = setup();
  const t = await createChatThread(a, { studentId: "stu-1", textStored: true });
  assert.match(t.threadId, /^[0-9a-f-]{36}$/);
  assert.equal((await getChatThread(a, { studentId: "stu-1", threadId: t.threadId }))?.studentId, "stu-1");
  assert.equal(await getChatThread(a, { studentId: "stu-2", threadId: t.threadId }), null);
});

test("a chat-store call on an unscoped Db is refused (tenant isolation fails closed)", async () => {
  const { db } = setup();
  await assert.rejects(createChatThread(db, { studentId: "stu-1", textStored: true }), TenantScopeError);
  await assert.rejects(claimChatTurn(db, claimInput()), TenantScopeError);
  // every other exported chat-store call refuses an unscoped Db too, one by one
  const ids = { studentId: "stu-1", threadId: "th-1" };
  await assert.rejects(getChatThread(db, ids), TenantScopeError);
  await assert.rejects(markChatThreadTextNotStored(db, ids), TenantScopeError);
  await assert.rejects(listChatTurns(db, ids), TenantScopeError);
  await assert.rejects(abandonChatTurn(db, { ...ids, turnId: "turn-1", leaseToken: "l" }), TenantScopeError);
  await assert.rejects(
    completeChatTurn(db, { ...ids, turnId: "turn-1", leaseToken: "l", channel: "text", assistantText: "x", response: RESPONSE }),
    TenantScopeError,
  );
  await assert.rejects(recordStudentUsage(db, { studentId: "stu-1", textTurns: 1 }), TenantScopeError);
  await assert.rejects(getStudentUsage(db, { studentId: "stu-1", month: "2026-10" }), TenantScopeError);
});

test("a first turn is claimed, completed, and a retry with the same turn id replays the stored answer without a second claim", async () => {
  const { a } = setup();
  const t = await createChatThread(a, { studentId: "stu-1", textStored: true, threadId: "th-1" });
  const c1 = await claimChatTurn(a, claimInput({ threadId: t.threadId }));
  assert.equal(c1.kind, "claimed");
  if (c1.kind !== "claimed") return;
  await completeChatTurn(a, {
    studentId: "stu-1", threadId: "th-1", turnId: "turn-1", leaseToken: c1.leaseToken,
    channel: "text", assistantText: RESPONSE.message, response: RESPONSE,
  });
  const c2 = await claimChatTurn(a, claimInput());
  assert.equal(c2.kind, "replay");
  if (c2.kind === "replay") assert.deepEqual(c2.response, RESPONSE);
  const turns = await listChatTurns(a, { studentId: "stu-1", threadId: "th-1" });
  assert.deepEqual(turns.map((x) => x.role), ["user", "assistant"]);
  assert.equal(turns[0]!.text, "what about [NAME] fees");
});

test("a retry that arrives while the first attempt is still running is told it is in progress, not run twice", async () => {
  const { a } = setup();
  await createChatThread(a, { studentId: "stu-1", textStored: true, threadId: "th-1" });
  assert.equal((await claimChatTurn(a, claimInput())).kind, "claimed");
  assert.equal((await claimChatTurn(a, claimInput())).kind, "in_progress");
});

test("a retry after the first attempt crashed past its lease takes the claim over; the dead holder can no longer complete", async () => {
  const { a } = setup();
  await createChatThread(a, { studentId: "stu-1", textStored: true, threadId: "th-1" });
  const dead = await claimChatTurn(a, claimInput(), { leaseMs: 1_000, now: new Date("2026-10-17T10:00:00.000Z") });
  assert.equal(dead.kind, "claimed");
  const live = await claimChatTurn(a, claimInput(), { leaseMs: 60_000, now: new Date("2026-10-17T10:05:00.000Z") });
  assert.equal(live.kind, "claimed");
  if (dead.kind !== "claimed" || live.kind !== "claimed") return;
  assert.notEqual(dead.leaseToken, live.leaseToken);
  await assert.rejects(
    completeChatTurn(a, { studentId: "stu-1", threadId: "th-1", turnId: "turn-1", leaseToken: dead.leaseToken, channel: "text", assistantText: "x", response: RESPONSE }),
    ChatTurnLeaseLostError,
  );
  await completeChatTurn(a, { studentId: "stu-1", threadId: "th-1", turnId: "turn-1", leaseToken: live.leaseToken, channel: "text", assistantText: "ok", response: RESPONSE });
  assert.equal((await claimChatTurn(a, claimInput())).kind, "replay");
});

test("the same turn id sent again with different text is a conflict, not a silent replay of the old answer", async () => {
  const { a } = setup();
  await createChatThread(a, { studentId: "stu-1", textStored: true, threadId: "th-1" });
  await claimChatTurn(a, claimInput());
  await assert.rejects(claimChatTurn(a, claimInput({ requestHash: "other" })), ChatTurnConflictError);
});

test("when the model call fails the claim is abandoned so the student's retry runs again", async () => {
  const { a } = setup();
  await createChatThread(a, { studentId: "stu-1", textStored: true, threadId: "th-1" });
  const c = await claimChatTurn(a, claimInput());
  if (c.kind !== "claimed") throw new Error("expected claimed");
  await abandonChatTurn(a, { studentId: "stu-1", threadId: "th-1", turnId: "turn-1", leaseToken: c.leaseToken });
  assert.deepEqual(await listChatTurns(a, { studentId: "stu-1", threadId: "th-1" }), []);
  assert.equal((await claimChatTurn(a, claimInput())).kind, "claimed");
});

test("a voice turn and a text turn land in one history in time order (A19)", async () => {
  const { a } = setup();
  await createChatThread(a, { studentId: "stu-1", textStored: true, threadId: "th-1" });
  const t0 = new Date("2026-10-17T10:00:00.000Z");
  const c1 = await claimChatTurn(a, claimInput({ turnId: "v1", channel: "voice", text: "voice question" }), { now: t0 });
  const c2 = await claimChatTurn(a, claimInput({ turnId: "t1", requestHash: "h2" }), { now: new Date(t0.getTime() + 5_000) });
  for (const [c, id, ch] of [[c1, "v1", "voice"], [c2, "t1", "text"]] as const) {
    if (c.kind !== "claimed") throw new Error("expected claimed");
    await completeChatTurn(a, { studentId: "stu-1", threadId: "th-1", turnId: id, leaseToken: c.leaseToken, channel: ch, assistantText: "a", response: RESPONSE });
  }
  const turns = await listChatTurns(a, { studentId: "stu-1", threadId: "th-1" });
  assert.deepEqual(turns.map((x) => `${x.turnId}:${x.role}:${x.channel}`), ["v1:user:voice", "v1:assistant:voice", "t1:user:text", "t1:assistant:text"]);
});

test("two tenants using the same student, thread and turn ids never see or collide with each other's chat (A6)", async () => {
  const { a, b, fakeDb } = setup();
  await createChatThread(a, { studentId: "stu-1", textStored: true, threadId: "th-1" });
  await createChatThread(b, { studentId: "stu-1", textStored: true, threadId: "th-1" });
  assert.equal((await claimChatTurn(a, claimInput({ text: "tenant A secret" }))).kind, "claimed");
  assert.equal((await claimChatTurn(b, claimInput({ text: "tenant B secret" }))).kind, "claimed");
  assert.deepEqual((await listChatTurns(a, { studentId: "stu-1", threadId: "th-1" })).map((x) => x.text), ["tenant A secret"]);
  assert.deepEqual((await listChatTurns(b, { studentId: "stu-1", threadId: "th-1" })).map((x) => x.text), ["tenant B secret"]);
  assert.equal(fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 2);
});

test("a student under erasure gets no new thread and no new turn, and a fence that appears mid-write undoes the write", async () => {
  const { a, fakeDb } = setup();
  await createChatThread(a, { studentId: "stu-1", textStored: true, threadId: "th-1" });
  const { requestId } = await requestErasure(a, { studentId: "stu-1", requestedBy: "counsellor-7", reason: "student_request" });
  await confirmErasure(a, { requestId, confirmedBy: "admin-2" });
  await assert.rejects(createChatThread(a, { studentId: "stu-1", textStored: true }), StudentFencedError);
  await assert.rejects(claimChatTurn(a, claimInput()), StudentFencedError);
  assert.equal(fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 0);

  // A second student: the fence appears after the claim is written (post-check path).
  await createChatThread(a, { studentId: "stu-2", textStored: true, threadId: "th-2" });
  const turns = fakeDb.collection<{ _id: string }>(COLLECTION_NAMES.chat_turns);
  const realUpdate = turns.updateOne.bind(turns);
  let fenced = false;
  turns.updateOne = (async (filter, update, opts) => {
    const res = await realUpdate(filter, update, opts);
    if (!fenced) {
      fenced = true;
      const r = await requestErasure(a, { studentId: "stu-2", requestedBy: "counsellor-7", reason: "student_request" });
      await confirmErasure(a, { requestId: r.requestId, confirmedBy: "admin-2" });
    }
    return res;
  }) as typeof turns.updateOne;
  await assert.rejects(claimChatTurn(a, claimInput({ studentId: "stu-2", threadId: "th-2" })), StudentFencedError);
  assert.equal(turns.all().length, 0, "the claim this call wrote is undone");
});

test("an under-18 thread without guardian consent is a text-free marker; marking an existing thread keeps its ids and flips textStored", async () => {
  const { a, fakeDb } = setup();
  const t = await createChatThread(a, { studentId: "stu-1", textStored: false });
  assert.equal(t.textStored, false);
  const keys = Object.keys(fakeDb.collection(COLLECTION_NAMES.chat_threads).all()[0]!).sort();
  assert.deepEqual(keys, ["_id", "createdAt", "lastActivityAt", "studentId", "tenantId", "textStored", "threadId"]);
  const t2 = await createChatThread(a, { studentId: "stu-1", textStored: true, threadId: "th-9" });
  await markChatThreadTextNotStored(a, { studentId: "stu-1", threadId: t2.threadId });
  assert.equal((await getChatThread(a, { studentId: "stu-1", threadId: "th-9" }))?.textStored, false);
});

test("usage counters add up per student per month and stay inside the tenant", async () => {
  const { a, b } = setup();
  const now = new Date("2026-10-17T10:00:00.000Z");
  await recordStudentUsage(a, { studentId: "stu-1", textTurns: 1 }, { now });
  await recordStudentUsage(a, { studentId: "stu-1", textTurns: 2, voiceMs: 5000 }, { now });
  await recordStudentUsage(b, { studentId: "stu-1", textTurns: 9 }, { now });
  assert.deepEqual(await getStudentUsage(a, { studentId: "stu-1", month: "2026-10" }), { month: "2026-10", textTurns: 3, voiceMs: 5000 });
  assert.deepEqual(await getStudentUsage(b, { studentId: "stu-1", month: "2026-10" }), { month: "2026-10", textTurns: 9, voiceMs: 0 });
  assert.deepEqual(await getStudentUsage(a, { studentId: "stu-1", month: "2026-09" }), { month: "2026-09", textTurns: 0, voiceMs: 0 });
});

// ---------------------------------------------------------------------------
// P1 U10 (A19, A9b): voice turns and their audit findings, in the same thread as the text turns
// ---------------------------------------------------------------------------

const voiceTurn = (over: Record<string, unknown> = {}) => ({
  studentId: "stu-1",
  threadId: "th-1",
  turnId: "v-1",
  role: "user" as const,
  text: "spoken [NAME] words",
  at: "2026-10-17T10:00:00.000Z",
  ...over,
});

test("U10: a spoken exchange is stored as voice rows in the same thread, user before assistant, interleaved with text turns by time", async () => {
  const { a } = setup();
  await createChatThread(a, { studentId: "stu-1", textStored: true, threadId: "th-1" });
  const t0 = new Date("2026-10-17T09:59:00.000Z");
  const c = await claimChatTurn(a, claimInput({ turnId: "t0" }), { now: t0 });
  if (c.kind !== "claimed") throw new Error("expected claimed");
  await completeChatTurn(a, { studentId: "stu-1", threadId: "th-1", turnId: "t0", leaseToken: c.leaseToken, channel: "text", assistantText: "a", response: RESPONSE });
  // The assistant side arrives first (a race the store must tolerate), sharing the user side's time.
  await appendVoiceTurn(a, voiceTurn({ role: "assistant", text: "spoken answer" }));
  await appendVoiceTurn(a, voiceTurn());
  const turns = await listChatTurns(a, { studentId: "stu-1", threadId: "th-1" });
  assert.deepEqual(turns.map((x) => `${x.turnId}:${x.role}:${x.channel}`), ["t0:user:text", "t0:assistant:text", "v-1:user:voice", "v-1:assistant:voice"]);
  assert.equal(turns[2]!.status, "done");
  assert.equal((await getChatThread(a, { studentId: "stu-1", threadId: "th-1" }))?.lastActivityAt, "2026-10-17T10:00:00.000Z");
});

test("U10: appendVoiceTurn is idempotent on (thread, turn, role): a replay changes neither the text nor the row count", async () => {
  const { a, fakeDb } = setup();
  await createChatThread(a, { studentId: "stu-1", textStored: true, threadId: "th-1" });
  await appendVoiceTurn(a, voiceTurn());
  await appendVoiceTurn(a, voiceTurn({ text: "a different text on replay", at: "2026-10-17T11:00:00.000Z" }));
  const rows = fakeDb.collection<any>(COLLECTION_NAMES.chat_turns).all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].text, "spoken [NAME] words");
  assert.equal(rows[0].at, "2026-10-17T10:00:00.000Z");
});

test("U10: appendVoiceTurn refuses a thread that is not the student's, bad input, and an unscoped Db", async () => {
  const { db, a, b } = setup();
  await createChatThread(a, { studentId: "stu-1", textStored: true, threadId: "th-1" });
  await assert.rejects(appendVoiceTurn(a, voiceTurn({ studentId: "stu-2" })), ChatThreadNotFoundError);
  await assert.rejects(appendVoiceTurn(b, voiceTurn()), ChatThreadNotFoundError, "another tenant has no such thread");
  await assert.rejects(appendVoiceTurn(a, voiceTurn({ threadId: "nope" })), ChatThreadNotFoundError);
  await assert.rejects(appendVoiceTurn(a, voiceTurn({ role: "system" })), /role/);
  await assert.rejects(appendVoiceTurn(a, voiceTurn({ at: "not a time" })), /ISO/);
  await assert.rejects(appendVoiceTurn(a, voiceTurn({ turnId: "" })), /turnId/);
  await assert.rejects(appendVoiceTurn(db, voiceTurn()), TenantScopeError);
  await assert.rejects(appendVoiceAudit(db, { studentId: "stu-1", threadId: "th-1", turnId: "v-1", reason: "uncited_number", at: "2026-10-17T10:00:00.000Z" }), TenantScopeError);
});

test("U10: a student under erasure gets no voice row, and a fence that appears mid-write undoes it", async () => {
  const { a, fakeDb } = setup();
  await createChatThread(a, { studentId: "stu-1", textStored: true, threadId: "th-1" });
  const { requestId } = await requestErasure(a, { studentId: "stu-1", requestedBy: "counsellor-7", reason: "student_request" });
  await confirmErasure(a, { requestId, confirmedBy: "admin-2" });
  await assert.rejects(appendVoiceTurn(a, voiceTurn()), StudentFencedError);
  assert.equal(fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 0);

  await createChatThread(a, { studentId: "stu-2", textStored: true, threadId: "th-2" });
  const turns = fakeDb.collection<{ _id: string }>(COLLECTION_NAMES.chat_turns);
  const realUpdate = turns.updateOne.bind(turns);
  let fenced = false;
  turns.updateOne = (async (filter, update, opts) => {
    const res = await realUpdate(filter, update, opts);
    if (!fenced) {
      fenced = true;
      const r = await requestErasure(a, { studentId: "stu-2", requestedBy: "counsellor-7", reason: "student_request" });
      await confirmErasure(a, { requestId: r.requestId, confirmedBy: "admin-2" });
    }
    return res;
  }) as typeof turns.updateOne;
  await assert.rejects(appendVoiceTurn(a, voiceTurn({ studentId: "stu-2", threadId: "th-2" })), StudentFencedError);
  assert.equal(turns.all().length, 0, "the row this call wrote is undone");
});

test("U10: appendVoiceAudit attaches a finding to the assistant voice row once, keeps a speaker's name out, and refuses a missing or text row", async () => {
  const { a, fakeDb } = setup();
  await createChatThread(a, { studentId: "stu-1", textStored: true, threadId: "th-1" });
  await appendVoiceTurn(a, voiceTurn({ role: "assistant", text: "it costs 5000" }));
  const finding = { studentId: "stu-1", threadId: "th-1", turnId: "v-1", reason: "uncited_number", detail: "5000", at: "2026-10-17T10:00:01.000Z" };
  await appendVoiceAudit(a, finding);
  await appendVoiceAudit(a, finding); // identical finding: not added twice
  await appendVoiceAudit(a, { studentId: "stu-1", threadId: "th-1", turnId: "v-1", reason: "named_speaker", at: "2026-10-17T10:00:02.000Z" });
  const row = fakeDb.collection<any>(COLLECTION_NAMES.chat_turns).all()[0];
  assert.deepEqual(row.voiceAudit, [
    { reason: "uncited_number", detail: "5000", at: "2026-10-17T10:00:01.000Z" },
    { reason: "named_speaker", at: "2026-10-17T10:00:02.000Z" },
  ]);
  await assert.rejects(appendVoiceAudit(a, { ...finding, turnId: "missing" }), ChatThreadNotFoundError);
  await assert.rejects(appendVoiceAudit(a, { ...finding, studentId: "stu-2" }), ChatThreadNotFoundError);
  // A text-channel row is never given voice findings.
  const c = await claimChatTurn(a, claimInput({ turnId: "t9" }));
  if (c.kind !== "claimed") throw new Error("expected claimed");
  await completeChatTurn(a, { studentId: "stu-1", threadId: "th-1", turnId: "t9", leaseToken: c.leaseToken, channel: "text", assistantText: "a", response: RESPONSE });
  await assert.rejects(appendVoiceAudit(a, { ...finding, turnId: "t9" }), ChatThreadNotFoundError);
});
