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

test("S13 DB writers refuse new text and voice on a permanently no-text thread", async () => {
  const { a, fakeDb } = setup();
  const {proposeProfileFact}=await import("../src/profile-facts.js");
  await createChatThread(a, { studentId: "stu-1", threadId: "th-1", textStored: false });
  await assert.rejects(claimChatTurn(a, claimInput()), /ChatThreadTextNotStored/);
  await assert.rejects(appendVoiceTurn(a, { studentId: "stu-1", threadId: "th-1", turnId: "voice-1", role: "user", text: "synthetic secret", at: new Date().toISOString() }), /ChatThreadTextNotStored/);
  assert.equal(fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 0);
  assert.equal(await proposeProfileFact(a,{studentId:"stu-1",threadId:"th-1",key:"interest",value:"Biology"}),null);
  assert.equal(fakeDb.collection(COLLECTION_NAMES.profile_facts).all().length,0);
});

test("S13 DB completion refuses a claim after the thread becomes no-text; earlier completed history survives", async () => {
  const { a } = setup();
  await createChatThread(a, { studentId: "stu-1", threadId: "th-1", textStored: true });
  const prior = await claimChatTurn(a, claimInput({ turnId: "prior" }));
  if (prior.kind !== "claimed") throw Error("expected claim");
  await completeChatTurn(a, { studentId: "stu-1", threadId: "th-1", turnId: "prior", leaseToken: prior.leaseToken, channel: "text", assistantText: RESPONSE.message, response: RESPONSE });
  const late = await claimChatTurn(a, claimInput());
  if (late.kind !== "claimed") throw Error("expected claim");
  await markChatThreadTextNotStored(a, { studentId: "stu-1", threadId: "th-1" });
  await assert.rejects(completeChatTurn(a, { studentId: "stu-1", threadId: "th-1", turnId: "turn-1", leaseToken: late.leaseToken, channel: "text", assistantText: "late response", response: RESPONSE }), /ChatThreadTextNotStored/);
  assert.deepEqual((await listChatTurns(a, { studentId: "stu-1", threadId: "th-1" })).filter(row => row.role === "assistant").map(row => row.turnId), ["prior"]);
});

test("S12: an obsolete unpublished answer is not history and an explicit retry can reclaim its exact turn", async () => {
  const { a } = setup();
  await createChatThread(a, { studentId: "stu-1", textStored: true, threadId: "th-1" });
  const claimed = await claimChatTurn(a, claimInput());
  assert.equal(claimed.kind, "claimed");
  if (claimed.kind !== "claimed") return;
  let checks = 0;
  await assert.rejects(completeChatTurn(a, {
    studentId: "stu-1", threadId: "th-1", turnId: "turn-1", leaseToken: claimed.leaseToken,
    channel: "text", assistantText: RESPONSE.message, response: RESPONSE,
  }, { validatePublication: async () => ++checks < 2 }), /ChatTurnMemoryChanged/);
  assert.deepEqual(await listChatTurns(a, { studentId: "stu-1", threadId: "th-1" }), []);
  assert.equal((await claimChatTurn(a, claimInput())).kind, "claimed");
});

test("S12: an assistant staged while its final guard is pending cannot be read as a completed exchange", async () => {
  const { a } = setup();
  await createChatThread(a, { studentId: "stu-1", textStored: true, threadId: "th-1" });
  const claimed = await claimChatTurn(a, claimInput());
  if (claimed.kind !== "claimed") throw new Error("expected claim");
  let release!: () => void, entered!: () => void;
  const paused = new Promise<void>(resolve => { entered = resolve; });
  const resume = new Promise<void>(resolve => { release = resolve; });
  let checks = 0;
  const completing = completeChatTurn(a, {
    studentId: "stu-1", threadId: "th-1", turnId: "turn-1", leaseToken: claimed.leaseToken,
    channel: "text", assistantText: RESPONSE.message, response: RESPONSE,
  }, { validatePublication: async () => {
    if (++checks === 2) { entered(); await resume; return false; }
    return true;
  } });
  // Baseline lacks the guard; race completion rather than hanging the red test.
  const reached = await Promise.race([paused.then(() => true), completing.then(() => false)]);
  if (!reached) { assert.fail("completion skipped the final publication guard"); return; }
  assert.equal((await listChatTurns(a, { studentId: "stu-1", threadId: "th-1" })).some(row => row.role === "assistant"), false);
  assert.equal((await claimChatTurn(a, claimInput())).kind, "in_progress");
  release();
  await assert.rejects(completing, /ChatTurnMemoryChanged/);
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


test("Q10/Q11: bounded owned sessions and complete pairs exclude current/pending/orphan turns", async () => {
 const m = await import("../src/chat-threads.js");
 const {a,b,fakeDb}=setup();
 const collection=fakeDb.collection(COLLECTION_NAMES.chat_threads);const find=collection.find.bind(collection);const selections:Array<{sort?:unknown;limit?:number}>=[];
 collection.find=((filter:any)=>{const c=find(filter);const selection:{sort?:unknown;limit?:number}={};selections.push(selection);const sort=c.sort.bind(c),limit=c.limit.bind(c),toArray=c.toArray.bind(c);c.sort=(spec:any)=>{selection.sort=spec;return sort(spec);};c.limit=(n:number)=>{selection.limit=n;return limit(n);};c.toArray=async()=>{assert.ok(selection.limit!==undefined&&selection.limit<=51,"bound before materialization");return toArray();};return c;}) as typeof collection.find;
 // Existing fake cursor sorts only the first field; reverse insertion supplies the tie order. Real Mongo compound-sort proof stays with integration.
 for(let i=54;i>=0;i--) await createChatThread(a,{studentId:"stu-1",threadId:"page-"+String(i).padStart(2,"0"),textStored:true},{now:new Date("2026-10-27T00:00:00Z")});
 const page=await m.listChatThreads(a,{studentId:"stu-1",limit:50});
 assert.equal(page.items.length,50); assert.ok(page.nextCursor);
 assert.deepEqual(selections[0],{sort:{createdAt:-1,threadId:-1},limit:51});
 const tail=await m.listChatThreads(a,{studentId:"stu-1",limit:50,cursor:page.nextCursor});
 assert.equal(tail.items.length,5); assert.equal(new Set([...page.items,...tail.items].map(x=>x.threadId)).size,55);
 await assert.rejects(m.listChatThreads(b,{studentId:"stu-1",cursor:page.nextCursor}));
 await assert.rejects(m.listChatThreads(a,{studentId:"stu-1",cursor:"invalid"}));
 assert.equal((await m.listChatThreads(a,{studentId:"other"})).items.length,0);
 const threadId=page.items[0]!.threadId;
 for(const turnId of ["done","pending","current"]){const c=await claimChatTurn(a,claimInput({threadId,turnId}),{now:new Date("2026-10-26T00:00:00Z")});if(turnId!=="pending"&&c.kind==="claimed")await completeChatTurn(a,{studentId:"stu-1",threadId,turnId,leaseToken:c.leaseToken,channel:"text",assistantText:"answer",response:RESPONSE},{now:new Date("2026-10-26T00:00:01Z")});}
 // Fixed clock: completedAt must stay before `before`, or the test fails on any run date after 2026-10-27.
 const context=await m.listChatContext(a,{studentId:"stu-1",threadId,turnId:"current",before:"2026-10-28T00:00:00.000Z",maxMessages:12});
 assert.deepEqual(context.map(x=>x.turnId),["done","done"]);
 assert.equal((await m.listChatContext(a,{studentId:"stu-1",threadId,maxMessages:0})).length,0);
 await markChatThreadTextNotStored(a,{studentId:"stu-1",threadId});assert.deepEqual(await m.listChatContext(a,{studentId:"stu-1",threadId}),[]);
});

test("Q12: corrected/forgotten memory rejects queued old extraction and strips unsupported provenance",async()=>{
 const m=await import("../src/profile-facts.js"); const {a}=setup();
 const f=await m.proposeProfileFact(a,{studentId:"stu-1",key:"goal",value:"Germany",quote:"Germany",threadId:"old",turnId:"old"});
 const revision=await m.readStudentMemoryRevision(a,"stu-1");
 const corrected=await m.decideProfileFact(a,{studentId:"stu-1",factId:f.factId,action:"correct",value:"Japan"});
 assert.equal(corrected?.value,"Japan"); assert.equal(corrected?.quote,undefined); assert.equal(corrected?.threadId,undefined);
 await m.decideProfileFact(a,{studentId:"stu-1",factId:f.factId,action:"erase"});
 await m.proposeProfileFact(a,{studentId:"stu-1",key:"goal",value:"Germany",expectedRevision:revision});
 assert.deepEqual(await m.listProfileFacts(a,{studentId:"stu-1"}),[]);
 assert.notEqual(await m.readStudentMemoryRevision(a,"stu-1"),revision);
});


test("Q11: context honors character/lower-message caps and omits incomplete voice exchanges",async()=>{
 const {listChatContext}=await import("../src/chat-threads.js");const {a}=setup();const threadId="voice-context";await createChatThread(a,{studentId:"stu-1",threadId,textStored:true});
 for(let i=0;i<8;i++){const at=new Date(Date.parse("2026-10-26T00:00:00Z")+i*1000).toISOString();for(const role of ["user","assistant"] as const)await appendVoiceTurn(a,{studentId:"stu-1",threadId,turnId:"v"+i,role,text:"x".repeat(3000),at});}
 await appendVoiceTurn(a,{studentId:"stu-1",threadId,turnId:"orphan",role:"user",text:"unfinished",at:"2026-10-26T01:00:00.000Z"});
 const full=await listChatContext(a,{studentId:"stu-1",threadId,maxMessages:12});assert.equal(full.length,4);assert.equal(full.reduce((n,r)=>n+r.text.length,0),12000);assert.ok(full.every(r=>r.turnId!=="orphan"));
 assert.equal((await listChatContext(a,{studentId:"stu-1",threadId,maxMessages:2})).length,2);
 assert.deepEqual(await listChatContext(a,{studentId:"stu-1",threadId,maxMessages:1}),[]);
});


for (const action of ["correct", "erase"] as const) {
test("Q12/Q14 repair1: paused " + action + " never publishes old facts under a stable revision", async () => {
    const m = await import("../src/profile-facts.js");
    const {a, fakeDb} = setup();
    const fact = await m.proposeProfileFact(a, {studentId:"stu-1",key:"interest",value:"robotics"});
    assert.ok(fact);
    await m.decideProfileFact(a,{studentId:"stu-1",factId:fact.factId,action:"confirm"});
    const before = await m.readStudentMemoryRevision(a,"stu-1");
    const col = fakeDb.collection(COLLECTION_NAMES.profile_facts);
    let release!: () => void, entered!: () => void;
    const blocked = new Promise<void>(r => { release = r; });
    const paused = new Promise<void>(r => { entered = r; });
    const update = col.updateOne.bind(col), remove = col.deleteMany.bind(col);
    col.updateOne = (async (...args: Parameters<typeof col.updateOne>) => {
      if ((args[1] as any).$set?.value === "astronomy") { entered(); await blocked; }
      return update(...args);
    }) as typeof col.updateOne;
    col.deleteMany = (async (...args: Parameters<typeof col.deleteMany>) => {
      if (action === "erase") { entered(); await blocked; }
      return remove(...args);
    }) as typeof col.deleteMany;
    const decision = m.decideProfileFact(a,{studentId:"stu-1",factId:fact.factId,action,...(action==="correct"?{value:"astronomy"}:{})});
    await paused;
    const pendingMarker = await fakeDb.collection(COLLECTION_NAMES.student_usage).findOne({studentId:"stu-1",tenantId:"tenantA"});
    try {
      await assert.rejects(m.readStudentMemoryRevision(a,"stu-1"), /pending/i, action + " must fail context reads closed");
      await assert.rejects(m.proposeProfileFact(a,{studentId:"stu-1",key:"new",value:"robotics"}), /pending/i);
      await assert.rejects(m.proposeProfileFact(a,{studentId:"stu-1",key:"stale",value:"robotics",expectedRevision:before}), /pending/i);
      assert.equal(await m.readStudentMemoryRevision(a,"other"), "");
    } finally { release(); await decision; }
    const after = await m.readStudentMemoryRevision(a,"stu-1");
    assert.notEqual(after,before);
    assert.notEqual(after,pendingMarker?.revision,"completion publishes a fresh revision after the mutation");
    assert.equal(await m.proposeProfileFact(a,{studentId:"stu-1",key:"interest",value:"robotics",expectedRevision:before}),null);
    const facts = await m.listProfileFacts(a,{studentId:"stu-1"});
    assert.deepEqual(facts.map(f=>f.value), action==="correct"?["astronomy"]:[]);
});
}

test("Q12/Q14 repair1: overlapping decisions remain pending until every mutation completes", async () => {
  const m = await import("../src/profile-facts.js");
  const {a, fakeDb} = setup();
  const facts = await Promise.all(["interest","goal"].map(key=>m.proposeProfileFact(a,{studentId:"stu-1",key,value:"robotics"})));
  const col=fakeDb.collection(COLLECTION_NAMES.profile_facts), update=col.updateOne.bind(col);
  const gates = [0,1].map(()=>{let release!:()=>void,entered!:()=>void;return {blocked:new Promise<void>(r=>release=r),paused:new Promise<void>(r=>entered=r),release:()=>release(),enter:()=>entered()};});
  col.updateOne=(async(...args:Parameters<typeof col.updateOne>)=>{
    const value=(args[1] as any).$set?.value;
    const index=value==="astronomy"?0:value==="biology"?1:-1;
    if(index>=0){gates[index]!.enter();await gates[index]!.blocked;}
    return update(...args);
  }) as typeof col.updateOne;
  const first=m.decideProfileFact(a,{studentId:"stu-1",factId:facts[0]!.factId,action:"correct",value:"astronomy"});
  const second=m.decideProfileFact(a,{studentId:"stu-1",factId:facts[1]!.factId,action:"correct",value:"biology"});
  await Promise.all(gates.map(g=>g.paused));
  try {
    await assert.rejects(m.readStudentMemoryRevision(a,"stu-1"), /pending/i);
    gates[1]!.release(); await second;
    await assert.rejects(m.readStudentMemoryRevision(a,"stu-1"), /pending/i,"finishing one decision must not open the other");
  } finally {gates.forEach(g=>g.release());await Promise.all([first,second]);}
  assert.ok(await m.readStudentMemoryRevision(a,"stu-1"));
  assert.deepEqual((await m.listProfileFacts(a,{studentId:"stu-1"})).map(f=>f.value).sort(),["astronomy","biology"]);
});

test("Q12/Q14 repair1: failed mutation stays closed even after another decision succeeds", async () => {
  const m=await import("../src/profile-facts.js"); const {a,fakeDb}=setup();
  const fact=await m.proposeProfileFact(a,{studentId:"stu-1",key:"interest",value:"robotics"});assert.ok(fact);
  const before=await m.readStudentMemoryRevision(a,"stu-1");
  const col=fakeDb.collection(COLLECTION_NAMES.profile_facts),update=col.updateOne.bind(col);
  col.updateOne=(async(...args:Parameters<typeof col.updateOne>)=>{if((args[1] as any).$set?.value==="astronomy")throw new Error("synthetic mutation failure");return update(...args);}) as typeof col.updateOne;
  await assert.rejects(m.decideProfileFact(a,{studentId:"stu-1",factId:fact.factId,action:"correct",value:"astronomy"}),/synthetic mutation failure/);
  await assert.rejects(m.readStudentMemoryRevision(a,"stu-1"),/pending/i);
  await m.decideProfileFact(a,{studentId:"stu-1",factId:fact.factId,action:"confirm"});
  await assert.rejects(m.readStudentMemoryRevision(a,"stu-1"),/pending/i);
  await assert.rejects(m.proposeProfileFact(a,{studentId:"stu-1",key:"stale",value:"robotics",expectedRevision:before}),/pending/i);
});

test("Q12/Q14 repair1: proposal paused before persistence is discarded when a decision starts", async () => {
  const m=await import("../src/profile-facts.js");const {a,fakeDb}=setup();
  const fact=await m.proposeProfileFact(a,{studentId:"stu-1",key:"interest",value:"robotics"});assert.ok(fact);
  const before=await m.readStudentMemoryRevision(a,"stu-1");
  const col=fakeDb.collection(COLLECTION_NAMES.profile_facts),update=col.updateOne.bind(col);
  let release!:()=>void,entered!:()=>void;
  const blocked=new Promise<void>(r=>release=r),paused=new Promise<void>(r=>entered=r);
  col.updateOne=(async(...args:Parameters<typeof col.updateOne>)=>{if((args[1] as any).$setOnInsert?.key==="stale"){entered();await blocked;}return update(...args);}) as typeof col.updateOne;
  const proposal=m.proposeProfileFact(a,{studentId:"stu-1",key:"stale",value:"robotics",expectedRevision:before});
  await paused;
  await m.decideProfileFact(a,{studentId:"stu-1",factId:fact.factId,action:"erase"});
  release();assert.equal(await proposal,null);
  assert.deepEqual(await m.listProfileFacts(a,{studentId:"stu-1"}),[]);
});


test("Q12/Q14 repair1: a proposal writing across pending mutation is removed on revision refusal", async () => {
  const m=await import("../src/profile-facts.js");const {a,fakeDb}=setup();
  const fact=await m.proposeProfileFact(a,{studentId:"stu-1",key:"interest",value:"robotics"});assert.ok(fact);
  const revision=await m.readStudentMemoryRevision(a,"stu-1");
  const col=fakeDb.collection(COLLECTION_NAMES.profile_facts),update=col.updateOne.bind(col);
  const gates=[0,1].map(()=>{let release!:()=>void,entered!:()=>void;return {blocked:new Promise<void>(r=>release=r),paused:new Promise<void>(r=>entered=r),release:()=>release(),enter:()=>entered()};});
  col.updateOne=(async(...args:Parameters<typeof col.updateOne>)=>{
    const index=(args[1] as any).$setOnInsert?.key==="stale"?0:(args[1] as any).$set?.value==="astronomy"?1:-1;
    if(index>=0){gates[index]!.enter();await gates[index]!.blocked;}
    return update(...args);
  }) as typeof col.updateOne;
  const proposal=m.proposeProfileFact(a,{studentId:"stu-1",key:"stale",value:"robotics",expectedRevision:revision});
  await gates[0]!.paused;
  const decision=m.decideProfileFact(a,{studentId:"stu-1",factId:fact.factId,action:"correct",value:"astronomy"});
  await gates[1]!.paused;
  try {
    gates[0]!.release(); await assert.rejects(proposal,/pending/i);
    assert.deepEqual((await m.listProfileFacts(a,{studentId:"stu-1"})).map(f=>f.key),["interest"]);
  } finally { gates.forEach(g=>g.release());await Promise.allSettled([proposal,decision]); }
  const after=await m.readStudentMemoryRevision(a,"stu-1");
  assert.notEqual(after,revision);
  assert.equal(await m.proposeProfileFact(a,{studentId:"stu-1",key:"stale",value:"robotics",expectedRevision:revision}),null);
});


for (const failure of ["begin", "complete"] as const) {
  test("Q12/Q14 repair1: " + failure + " publication error cannot reopen unchanged memory", async () => {
    const m=await import("../src/profile-facts.js");const {a,fakeDb}=setup();
    const fact=await m.proposeProfileFact(a,{studentId:"stu-1",key:"interest",value:"robotics"});assert.ok(fact);
    const markers=fakeDb.collection(COLLECTION_NAMES.student_usage),update=markers.updateOne.bind(markers);
    let publication=0;
    markers.updateOne=(async(...args:Parameters<typeof markers.updateOne>)=>{
      publication++;
      if(failure==="begin"&&publication===1){await update(...args);throw new Error("synthetic ambiguous begin");}
      if(failure==="complete"&&publication===2)throw new Error("synthetic incomplete publication");
      return update(...args);
    }) as typeof markers.updateOne;
    await assert.rejects(m.decideProfileFact(a,{studentId:"stu-1",factId:fact.factId,action:"correct",value:"astronomy"}),/synthetic/);
    await assert.rejects(m.readStudentMemoryRevision(a,"stu-1"),/pending/i);
    const marker=await markers.findOne({studentId:"stu-1",tenantId:"tenantA"});
    assert.equal(marker?.pendingDecisions,1);
    assert.equal(JSON.stringify(marker).includes("robotics"),false);
    assert.equal(JSON.stringify(marker).includes("astronomy"),false);
    assert.equal((await m.listProfileFacts(a,{studentId:"stu-1"}))[0]?.value,failure==="begin"?"robotics":"astronomy");
  });
}

for (const displayedValue of [undefined, "biology"] as const) {
  test("Q12/Q14 repair2 B1: pending confirm refuses a replaced proposal " + (displayedValue === undefined ? "legacy snapshot" : "displayed value"), async () => {
    const m=await import("../src/profile-facts.js");const {a,fakeDb}=setup();
    const fact=await m.proposeProfileFact(a,{studentId:"stu-1",key:"interest",value:"biology"});assert.ok(fact);
    const revision=await m.readStudentMemoryRevision(a,"stu-1");
    const col=fakeDb.collection(COLLECTION_NAMES.profile_facts),update=col.updateOne.bind(col);
    const gates=[0,1,2].map(()=>{let release!:()=>void,entered!:()=>void;return {blocked:new Promise<void>(r=>release=r),paused:new Promise<void>(r=>entered=r),release:()=>release(),enter:()=>entered()};});
    col.updateOne=(async(...args:Parameters<typeof col.updateOne>)=>{
      if((args[1] as any).$set?.value==="chemistry") {gates[0]!.enter();await gates[0]!.blocked;const res=await update(...args);gates[1]!.enter();await gates[1]!.blocked;return res;}
      if((args[1] as any).$set?.status==="confirmed") {gates[2]!.enter();await gates[2]!.blocked;}
      return update(...args);
    }) as typeof col.updateOne;
    const proposal=m.proposeProfileFact(a,{studentId:"stu-1",key:"interest",value:"chemistry",expectedRevision:revision});
    let decision:Promise<unknown>|undefined;
    try {
      await gates[0]!.paused;
      decision=m.decideProfileFact(a,{studentId:"stu-1",factId:fact.factId,action:"confirm",...(displayedValue===undefined?{}:{value:displayedValue})});
      const result=decision.then(value=>({value,error:undefined}),error=>({value:undefined,error}));
      await gates[2]!.paused;
      gates[0]!.release();await gates[1]!.paused;gates[2]!.release();
      const settled=await result;
      assert.ok(settled.error instanceof TypeError,"replacement must conflict instead of becoming confirmed");
      assert.equal(settled.error.message,"ProfileFactChanged");
      gates[1]!.release();assert.equal(await proposal,null);
      assert.ok(await m.readStudentMemoryRevision(a,"stu-1"));
      assert.deepEqual(await m.listProfileFacts(a,{studentId:"stu-1",status:"confirmed"}),[]);
      assert.deepEqual(await m.listProfileFacts(a,{studentId:"stu-1",status:"proposed"}),[]);
      const marker=await fakeDb.collection(COLLECTION_NAMES.student_usage).findOne({studentId:"stu-1",tenantId:"tenantA"});
      assert.equal(marker?.pendingDecisions,0,"CAS conflict releases only its own decision count");
    } finally {gates.forEach(g=>g.release());await Promise.allSettled([proposal,...(decision?[decision]:[])]);}
  });
}

test("Q12/Q14 repair2 B1: displayed value mismatch refuses before changing revision; legacy confirmation still works",async()=>{
  const m=await import("../src/profile-facts.js");const {a}=setup();
  const fact=await m.proposeProfileFact(a,{studentId:"stu-1",key:"interest",value:"chemistry"});assert.ok(fact);
  const revision=await m.readStudentMemoryRevision(a,"stu-1");
  await assert.rejects(m.decideProfileFact(a,{studentId:"stu-1",factId:fact.factId,action:"confirm",value:"biology"}),err=>err instanceof TypeError&&err.message==="ProfileFactChanged");
  assert.equal(await m.readStudentMemoryRevision(a,"stu-1"),revision);
  assert.equal((await m.listProfileFacts(a,{studentId:"stu-1",status:"proposed"}))[0]?.value,"chemistry");
  assert.equal((await m.decideProfileFact(a,{studentId:"stu-1",factId:fact.factId,action:"confirm"}))?.value,"chemistry");
});

for(const ambiguous of [false,true]) {
  test("Q12/Q14 repair2 B2: " + (ambiguous?"ambiguous":"failed") + " stale cleanup remains durably closed",async()=>{
    const m=await import("../src/profile-facts.js");const {a,b,fakeDb}=setup();
    const fact=await m.proposeProfileFact(a,{studentId:"stu-1",key:"interest",value:"robotics",quote:"robotics"});assert.ok(fact);
    await m.decideProfileFact(a,{studentId:"stu-1",factId:fact.factId,action:"confirm"});
    const revision=await m.readStudentMemoryRevision(a,"stu-1");
    const other=await m.proposeProfileFact(a,{studentId:"other",key:"interest",value:"biology"});assert.ok(other);
    const col=fakeDb.collection(COLLECTION_NAMES.profile_facts),update=col.updateOne.bind(col),remove=col.deleteMany.bind(col);
    let release!:()=>void,entered!:()=>void;const blocked=new Promise<void>(r=>release=r),paused=new Promise<void>(r=>entered=r);
    col.updateOne=(async(...args:Parameters<typeof col.updateOne>)=>{if((args[1] as any).$setOnInsert?.key==="interest"){entered();await blocked;}return update(...args);}) as typeof col.updateOne;
    const proposal=m.proposeProfileFact(a,{studentId:"stu-1",key:"interest",value:"robotics",quote:"robotics",expectedRevision:revision});
    try {
      await paused;
      await m.decideProfileFact(a,{studentId:"stu-1",factId:fact.factId,action:"erase"});
      col.deleteMany=(async(...args:Parameters<typeof col.deleteMany>)=>{if((args[0] as any).proposalToken){if(ambiguous)await remove(...args);throw new Error("synthetic compensation write failure");}return remove(...args);}) as typeof col.deleteMany;
      release();await assert.rejects(proposal,/synthetic compensation write failure/);
      await assert.rejects(m.readStudentMemoryRevision(a,"stu-1"),/pending/i);
      for(const status of [undefined,"confirmed","proposed"] as const) await assert.rejects(m.listProfileFacts(a,{studentId:"stu-1",...(status?{status}:{})}),/pending/i);
      await assert.rejects(m.decideProfileFact(a,{studentId:"stu-1",factId:fact.factId,action:"confirm"}),/pending/i);
      assert.equal((await m.listProfileFacts(a,{studentId:"other"}))[0]?.value,"biology");
      assert.deepEqual(await m.listProfileFacts(b,{studentId:"stu-1"}),[]);
      const marker=await fakeDb.collection(COLLECTION_NAMES.student_usage).findOne({studentId:"stu-1",tenantId:"tenantA"});
      assert.equal(marker?.pendingDecisions,0);assert.equal(marker?.pendingCompensations,1);
      assert.equal(JSON.stringify(marker).includes("robotics"),false,"uncertainty metadata never retains erased values or quotes");
    } finally {release();await Promise.allSettled([proposal]);}
  });
}

test("Q12/Q14 repair2 B1: confirm CAS conflict cannot release another pending decision",async()=>{
  const m=await import("../src/profile-facts.js");const {a,fakeDb}=setup();
  const fact=await m.proposeProfileFact(a,{studentId:"stu-1",key:"interest",value:"biology"});assert.ok(fact);
  const other=await m.proposeProfileFact(a,{studentId:"stu-1",key:"goal",value:"robotics"});assert.ok(other);
  const col=fakeDb.collection(COLLECTION_NAMES.profile_facts),update=col.updateOne.bind(col);
  const gates=[0,1].map(()=>{let release!:()=>void,entered!:()=>void;return {blocked:new Promise<void>(r=>release=r),paused:new Promise<void>(r=>entered=r),release:()=>release(),enter:()=>entered()};});
  col.updateOne=(async(...args:Parameters<typeof col.updateOne>)=>{
    const index=(args[1] as any).$set?.value==="astronomy"?1:(args[1] as any).$set?.status==="confirmed"?0:-1;
    if(index>=0){gates[index]!.enter();await gates[index]!.blocked;}
    return update(...args);
  }) as typeof col.updateOne;
  const confirm=m.decideProfileFact(a,{studentId:"stu-1",factId:fact.factId,action:"confirm"});
  const outcome=confirm.then(()=>undefined,error=>error);
  let correction:Promise<unknown>|undefined;
  try {
    await gates[0]!.paused;
    correction=m.decideProfileFact(a,{studentId:"stu-1",factId:other.factId,action:"correct",value:"astronomy"});
    await gates[1]!.paused;
    // The exact real-proposal interleaving is covered above; isolate the CAS/counter here.
    const replaced=await update({factId:fact.factId,studentId:"stu-1",tenantId:"tenantA"},{$set:{value:"chemistry",proposalToken:"synthetic-replacement"}});
    assert.equal(replaced.matchedCount,1);
    gates[0]!.release();const err=await outcome;assert.ok(err instanceof TypeError);assert.equal(err.message,"ProfileFactChanged");
    const marker=await fakeDb.collection(COLLECTION_NAMES.student_usage).findOne({studentId:"stu-1",tenantId:"tenantA"});
    assert.equal(marker?.pendingDecisions,1);
    await assert.rejects(m.readStudentMemoryRevision(a,"stu-1"),/pending/i);
    gates[1]!.release();await correction;
    assert.ok(await m.readStudentMemoryRevision(a,"stu-1"));
    assert.deepEqual((await m.listProfileFacts(a,{studentId:"stu-1",status:"confirmed"})).map(f=>f.value),["astronomy"]);
  } finally {gates.forEach(g=>g.release());await Promise.allSettled([confirm,...(correction?[correction]:[])]);}
});

test("Q12/Q14 repair2 B2: failed cleanup reservation cannot expose or confirm an unpublished stale row",async()=>{
  const m=await import("../src/profile-facts.js");const {a,fakeDb}=setup();
  const fact=await m.proposeProfileFact(a,{studentId:"stu-1",key:"interest",value:"robotics"});assert.ok(fact);
  const revision=await m.readStudentMemoryRevision(a,"stu-1");
  const col=fakeDb.collection(COLLECTION_NAMES.profile_facts),update=col.updateOne.bind(col);
  let release!:()=>void,entered!:()=>void;const blocked=new Promise<void>(r=>release=r),paused=new Promise<void>(r=>entered=r);
  col.updateOne=(async(...args:Parameters<typeof col.updateOne>)=>{if((args[1] as any).$setOnInsert?.key==="interest"){entered();await blocked;}return update(...args);}) as typeof col.updateOne;
  const proposal=m.proposeProfileFact(a,{studentId:"stu-1",key:"interest",value:"robotics",expectedRevision:revision});
  try {
    await paused;await m.decideProfileFact(a,{studentId:"stu-1",factId:fact.factId,action:"erase"});
    const markers=fakeDb.collection(COLLECTION_NAMES.student_usage),publish=markers.updateOne.bind(markers);
    markers.updateOne=(async(...args:Parameters<typeof markers.updateOne>)=>{if((args[1] as any).$inc?.pendingCompensations===1)throw new Error("synthetic cleanup reservation failure");return publish(...args);}) as typeof markers.updateOne;
    release();await assert.rejects(proposal,/synthetic cleanup reservation failure/);
    for(const status of [undefined,"confirmed","proposed"] as const)assert.deepEqual(await m.listProfileFacts(a,{studentId:"stu-1",...(status?{status}:{})}),[]);
    await assert.rejects(m.decideProfileFact(a,{studentId:"stu-1",factId:fact.factId,action:"confirm"}),err=>err instanceof TypeError&&err.message==="ProfileFactChanged");
    const raw=await col.findOne({studentId:"stu-1",tenantId:"tenantA"});assert.equal(raw?.proposalPending,true,"atomic value-free publication metadata remains durable when the marker write fails");
  } finally {release();await Promise.allSettled([proposal]);}
});

test("Q12/Q14 repair2 B1: explicit correction wins over an unpublished racing proposal",async()=>{
  const m=await import("../src/profile-facts.js");const {a,fakeDb}=setup();
  const fact=await m.proposeProfileFact(a,{studentId:"stu-1",key:"interest",value:"biology"});assert.ok(fact);
  const revision=await m.readStudentMemoryRevision(a,"stu-1");
  const col=fakeDb.collection(COLLECTION_NAMES.profile_facts),update=col.updateOne.bind(col);
  let release!:()=>void,entered!:()=>void;const blocked=new Promise<void>(r=>release=r),paused=new Promise<void>(r=>entered=r);
  col.updateOne=(async(...args:Parameters<typeof col.updateOne>)=>{const result=await update(...args);if((args[1] as any).$set?.value==="chemistry"){entered();await blocked;}return result;}) as typeof col.updateOne;
  const proposal=m.proposeProfileFact(a,{studentId:"stu-1",key:"interest",value:"chemistry",expectedRevision:revision});
  try {
    await paused;
    assert.deepEqual(await m.listProfileFacts(a,{studentId:"stu-1"}),[]);
    await m.decideProfileFact(a,{studentId:"stu-1",factId:fact.factId,action:"correct",value:"astronomy"});
    release();assert.equal(await proposal,null);
    assert.ok(await m.readStudentMemoryRevision(a,"stu-1"));
    assert.deepEqual((await m.listProfileFacts(a,{studentId:"stu-1",status:"confirmed"})).map(f=>f.value),["astronomy"]);
  } finally {release();await Promise.allSettled([proposal]);}
});

for (const cleanupFails of [false,true]) test('S13 committed publication survives lost acknowledgement; cleanupFails='+cleanupFails, async()=>{
 const {a,fakeDb}=setup();await createChatThread(a,{studentId:'stu-1',threadId:'th-1',textStored:true});
 const claim=await claimChatTurn(a,claimInput());if(claim.kind!=='claimed')throw Error('claim');
 const turns=fakeDb.collection(COLLECTION_NAMES.chat_turns),update=turns.updateOne.bind(turns);
 turns.updateOne=(async(...args:Parameters<typeof turns.updateOne>)=>{const result=await update(...args);if((args[1] as any).$set?.publication==='published')throw Error('synthetic lost acknowledgement');return result;}) as typeof turns.updateOne;
 if(cleanupFails)turns.deleteMany=async()=>{throw Error('synthetic cleanup failure');};
 await completeChatTurn(a,{studentId:'stu-1',threadId:'th-1',turnId:'turn-1',leaseToken:claim.leaseToken,channel:'text',assistantText:RESPONSE.message,response:RESPONSE});
 assert.equal((await listChatTurns(a,{studentId:'stu-1',threadId:'th-1'})).filter(x=>x.role==='assistant').length,1);
 assert.equal((await claimChatTurn(a,claimInput())).kind,'replay');
});

test('S13 expired lease takeover while an old assistant is staged preserves only the new attempt',async()=>{
 const {a}=setup();await createChatThread(a,{studentId:'stu-1',threadId:'th-1',textStored:true});
 const first=await claimChatTurn(a,claimInput(),{leaseMs:1000,now:new Date('2026-10-17T10:00:00.000Z')});if(first.kind!=='claimed')throw Error('claim');
 let resume!:()=>void,entered!:()=>void;const paused=new Promise<void>(r=>entered=r),go=new Promise<void>(r=>resume=r);let checks=0;
 const old=completeChatTurn(a,{studentId:'stu-1',threadId:'th-1',turnId:'turn-1',leaseToken:first.leaseToken,channel:'text',assistantText:'old answer',response:{...RESPONSE,message:'old answer'}},{validatePublication:async()=>{if(++checks===2){entered();await go;}return true;}});
 const rejected=assert.rejects(old,ChatTurnLeaseLostError);await paused;
 const next=await claimChatTurn(a,claimInput(),{now:new Date('2026-10-17T10:05:00.000Z')});if(next.kind!=='claimed')throw Error('takeover');
 await completeChatTurn(a,{studentId:'stu-1',threadId:'th-1',turnId:'turn-1',leaseToken:next.leaseToken,channel:'text',assistantText:'new answer',response:{...RESPONSE,message:'new answer'}});
 resume();await rejected;
 assert.deepEqual((await listChatTurns(a,{studentId:'stu-1',threadId:'th-1'})).filter(x=>x.role==='assistant').map(x=>x.text),['new answer']);
 const replay=await claimChatTurn(a,claimInput());assert.equal(replay.kind,'replay');if(replay.kind==='replay')assert.equal(replay.response.message,'new answer');
});

// S13 fix A item 2 (data review, medium-high): the memory marker upsert in completeChatTurn must be a fenced write. Erasure landing between the
// last freshness check and the marker upsert otherwise leaves a `memory:<studentId>` student_usage row behind for an erased student (hostile test H4).
test("S13 fixA-2: erasure racing the memory-marker upsert leaves zero student_usage and chat residue, and the writer is refused as fenced", async () => {
  const { INDEX_PLAN } = await import("../scripts/db-init.js");
  const { confirmTwiceAndApprove } = await import("../src/testing.js");
  const { executeErasure } = await import("../src/index.js");
  const { a, fakeDb } = setup();
  for (const s of INDEX_PLAN) if (s.unique) fakeDb.collection(s.collection).declareUniqueIndex(Object.keys(s.keys), { partialFilterExpression: s.partialFilterExpression });
  await createChatThread(a, { studentId: "stu-1", threadId: "th-1", textStored: true });
  const claim = await claimChatTurn(a, claimInput());
  if (claim.kind !== "claimed") throw new Error("claim");
  const usage = fakeDb.collection(COLLECTION_NAMES.student_usage), orig = usage.updateOne.bind(usage);
  let fired = false;
  usage.updateOne = (async (...args: Parameters<typeof usage.updateOne>) => {
    if (!fired && String((args[0] as { _id?: unknown })._id).includes("memory:")) {
      fired = true;
      const { requestId } = await requestErasure(a, { studentId: "stu-1", requestedBy: "counsellor", reason: "student_request" });
      await confirmTwiceAndApprove(a, { requestId, confirmedBy: "admin-2" });
      assert.equal((await executeErasure(a, requestId)).status, "completed");
    }
    return orig(...args);
  }) as typeof usage.updateOne;
  let failure: unknown;
  await completeChatTurn(a, { studentId: "stu-1", threadId: "th-1", turnId: "turn-1", leaseToken: claim.leaseToken, channel: "text", assistantText: "ans", response: RESPONSE, memorySnapshot: { revision: "", policy: "p" } }).catch((err) => { failure = err; });
  assert.equal(fired, true, "the race was exercised");
  const residue = (name: string) => fakeDb.collection(name).all().filter((d: Record<string, unknown>) => d.studentId === "stu-1").map((d: Record<string, unknown>) => `${name}:${String(d._id)}`);
  assert.deepEqual(residue(COLLECTION_NAMES.student_usage), []);
  assert.deepEqual(residue(COLLECTION_NAMES.chat_turns), []);
  assert.deepEqual(residue(COLLECTION_NAMES.chat_threads), []);
  assert.ok(failure instanceof StudentFencedError, `expected StudentFencedError, got ${String(failure)}`);
});
