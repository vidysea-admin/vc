/**
 * P1 U10 (C7, A23, D-088 Q5): 60 voice minutes per student per month and 20 per session, both overridable per tenant; minutes are
 * recorded through recordStudentUsage when a connection ends; at the limit voice is refused and text continues. SYNTHETIC only.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { confirmErasure, getStudentUsage, recordStudentUsage, requestErasure, usageMonth } from "@vc/db";
import { VoiceSessionResponseSchema } from "@vc/schemas";
import { GERMANY_QUESTION } from "./chat-fixtures.js";
import { adult, call, newThread, studentToken, turnsPath, until, voiceWorld, type VoiceWorld, type VoiceWorldOptions } from "./voice-fixtures.js";

const MIN = 60_000;
async function withWorld(fn: (w: VoiceWorld, threadId: string) => Promise<void>, opts?: VoiceWorldOptions): Promise<void> {
  const w = await voiceWorld({ ...opts, deps: { silenceTimeoutMs: 10 * 3600_000, ...(opts?.deps ?? {}) } });
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    await fn(w, threadId);
  } finally {
    await w.cleanup();
  }
}
const used = (w: VoiceWorld, tenant = "tenant-a", studentId = "stu-1") =>
  getStudentUsage(w.deps.dbForTenant(tenant), { studentId, month: usageMonth(new Date(w.clock.ms)) }).then((u) => u.voiceMs);
const addUsage = (w: VoiceWorld, ms: number, tenant = "tenant-a", studentId = "stu-1") =>
  recordStudentUsage(w.deps.dbForTenant(tenant), { studentId, voiceMs: ms }, { now: new Date(w.clock.ms) });

test("C7: a student at 60 voice minutes gets 429 voice_quota_exceeded with Retry-After, and text chat on the same thread continues", async () => {
  await withWorld(async (w, threadId) => {
    await addUsage(w, 60 * MIN);
    const res = await w.session(adult(), threadId);
    assert.equal(res.status, 429);
    assert.equal(res.json.error, "voice_quota_exceeded");
    const retry = Number(res.headers["retry-after"]);
    assert.ok(retry > 0 && retry <= 31 * 86400, "retry-after points at the start of next month");
    assert.equal(res.json.token, undefined);
    const turn = await call(w.chat, "POST", turnsPath("stu-1", threadId), { token: await studentToken(adult()), body: { text: GERMANY_QUESTION, clientTurnId: "q-1" } });
    assert.equal(turn.status, 200, "text continues");
    assert.equal(w.provider.backends.length, 0);
  });
});

test("C7: a token minted before the limit was reached is still refused at start (the check runs twice), with a fixed message that points to text", async () => {
  await withWorld(async (w, threadId) => {
    const token = await w.mint(adult(), threadId);
    await addUsage(w, 60 * MIN);
    const res = await w.connect(token, { threadId });
    assert.ok(res.ok);
    if (!res.ok) return;
    res.client.send({ type: "start", threadId });
    await until(() => res.client.closed, "closed");
    assert.equal(res.client.of("error")[0].code, "voice_quota_exceeded");
    assert.ok(/text/i.test(res.client.of("error")[0].message));
    assert.equal(res.client.closeCode, 1008);
    assert.equal(w.provider.backends.length, 0, "no provider session was opened for a student over quota");
  });
});

test("C7: the session limit is the smaller of 20 minutes and what is left of the month, and the cap enforces it", async () => {
  await withWorld(async (w, threadId) => {
    await addUsage(w, 55 * MIN);
    const res = await w.session(adult(), threadId);
    assert.equal(res.status, 201);
    assert.equal(VoiceSessionResponseSchema.parse(res.json).sessionMaxMinutes, 5);
    const { client } = await w.open(adult(), threadId);
    w.timers.advance(4 * MIN + 59_000);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(client.closed, false);
    w.timers.advance(1_000);
    await until(() => client.closed, "closed at the remaining-quota cap");
    assert.ok(client.of("error").some((e) => e.code === "session_time_limit"));
    await w.voice.settled();
    assert.equal(await used(w), 60 * MIN, "the month is now exactly used up");
    assert.equal((await w.session(adult(), threadId)).status, 429);
  });
});

test("C7: minutes are recorded when the connection ends (end, abort), accumulate across sessions, and a connection that never started records nothing", async () => {
  await withWorld(async (w, threadId) => {
    const a = await w.open(adult(), threadId);
    w.clock.ms += 90_000;
    a.client.send({ type: "end" });
    await until(() => a.client.closed, "closed");
    await w.voice.settled();
    assert.equal(await used(w), 90_000);

    const b = await w.open(adult(), threadId);
    w.clock.ms += 30_000;
    b.client.abort();
    await until(() => w.voice.stats().sockets === 0, "closed");
    await w.voice.settled();
    assert.equal(await used(w), 120_000);

    const c = await w.connect(await w.mint(adult(), threadId), { threadId });
    assert.ok(c.ok);
    if (c.ok) c.client.abort();
    await until(() => w.voice.stats().sockets === 0, "closed");
    await w.voice.settled();
    assert.equal(await used(w), 120_000);
  });
});

test("C7: a per-tenant override changes the limits for that tenant only", async () => {
  await withWorld(
    async (w, threadId) => {
      // tenant-a: default 60. tenant-b: 5 minutes a month, 2 minutes a session.
      const tokenB = await studentToken(adult("stu-1", "tenant-b"));
      const threadB = await newThread(w.chat, tokenB);
      await addUsage(w, 6 * MIN, "tenant-a");
      await addUsage(w, 6 * MIN, "tenant-b");
      assert.equal((await w.session(adult("stu-1", "tenant-a"), threadId)).status, 201, "6 of 60 minutes is fine for tenant-a");
      const b = await w.session(adult("stu-1", "tenant-b"), threadB);
      assert.equal(b.status, 429, "6 of 5 minutes is over the tenant-b override");
      assert.equal(b.json.error, "voice_quota_exceeded");

      const t2 = await newThread(w.chat, await studentToken(adult("stu-2", "tenant-b")), "stu-2");
      const s = await w.session(adult("stu-2", "tenant-b"), t2, "stu-2");
      assert.equal(s.status, 201);
      assert.equal(VoiceSessionResponseSchema.parse(s.json).sessionMaxMinutes, 2);
      const t3 = await newThread(w.chat, await studentToken(adult("stu-3", "tenant-b")), "stu-3");
      const o = await w.open(adult("stu-3", "tenant-b"), t3, { studentId: "stu-3" });
      w.timers.advance(2 * MIN);
      await until(() => o.client.closed, "closed at the tenant-b 2 minute cap");
      assert.ok(o.client.of("error").some((e) => e.code === "session_time_limit"));
      await w.voice.settled();
      assert.equal(await used(w, "tenant-b", "stu-3"), 2 * MIN);
      const a = await w.open(adult("stu-1", "tenant-a"), threadId);
      w.timers.advance(2 * MIN);
      await new Promise((r) => setTimeout(r, 30));
      assert.equal(a.client.closed, false, "tenant-a keeps its 20 minute cap");
    },
    { deps: { limitsForTenant: (t) => (t === "tenant-b" ? { voiceMinutesPerMonth: 5, voiceSessionMaxMinutes: 2 } : undefined) } },
  );
});

test("C7: a student under erasure is not charged: the minutes write is refused by the fence, nothing is forced, the session closes cleanly", async () => {
  await withWorld(async (w, threadId) => {
    const { client } = await w.open(adult(), threadId);
    const db = w.deps.dbForTenant("tenant-a");
    const { requestId } = await requestErasure(db, { studentId: "stu-1", requestedBy: "counsellor-7", reason: "student_request" });
    await confirmErasure(db, { requestId, confirmedBy: "admin-2" });
    w.clock.ms += 30_000;
    client.send({ type: "end" });
    await until(() => client.closed, "closed");
    await w.voice.settled();
    assert.equal(w.fakeDb.collection<any>("student_usage").all().length, 0, "nothing is written for a student under erasure");
    assert.equal(w.voice.stats().sockets, 0);
    assert.equal(w.voice.stats().liveSessions, 0);
  });
});

// -- U10 repair 1, C11: one student cannot fill the shared socket cap or the provider budget ------------------------------

test("C11: the session route is limited per student (requestsPerMinute, D-088 Q5): the next mint is 429 rate_limited with Retry-After, another student is unaffected, and the window reopens", async () => {
  await withWorld(
    async (w, threadId) => {
      for (let i = 0; i < 3; i++) assert.equal((await w.session(adult(), threadId)).status, 201, `mint ${i + 1}`);
      const limited = await w.session(adult(), threadId);
      assert.equal(limited.status, 429);
      assert.equal(limited.json.error, "rate_limited");
      assert.ok(Number(limited.headers["retry-after"]) >= 1);
      assert.equal(limited.json.token, undefined);
      const t2 = await newThread(w.chat, await studentToken(adult("stu-2")), "stu-2");
      assert.equal((await w.session(adult("stu-2"), t2, "stu-2")).status, 201, "another student is not limited by stu-1");
      // The same student id in another tenant has its own budget.
      const t3 = await newThread(w.chat, await studentToken(adult("stu-1", "tenant-b")));
      assert.equal((await w.session(adult("stu-1", "tenant-b"), t3)).status, 201);
      w.clock.ms += 61_000;
      assert.equal((await w.session(adult(), threadId)).status, 201, "the window reopens after a minute");
    },
    { deps: { limitsForTenant: () => ({ requestsPerMinute: 3 }) } },
  );
});

test("C11: a refused (not-yours) session request does not spend the student's budget", async () => {
  await withWorld(
    async (w, threadId) => {
      for (let i = 0; i < 5; i++) assert.equal((await w.session(adult("stu-2"), threadId, "stu-1")).status, 404);
      assert.equal((await w.session(adult(), threadId)).status, 201);
      assert.equal((await w.session(adult(), threadId)).status, 201);
    },
    { deps: { limitsForTenant: () => ({ requestsPerMinute: 2 }) } },
  );
});

test("C11: one student can hold only 2 sockets that have not started; a third is refused 429 at the upgrade, another student still connects, and a slot reopens when one closes", async () => {
  await withWorld(async (w, threadId) => {
    const tokens = [await w.mint(adult(), threadId), await w.mint(adult(), threadId), await w.mint(adult(), threadId), await w.mint(adult(), threadId)];
    const a = await w.connect(tokens[0]!, { threadId });
    const b = await w.connect(tokens[1]!, { threadId });
    assert.ok(a.ok && b.ok);
    const c = await w.connect(tokens[2]!, { threadId });
    assert.equal(c.ok, false);
    if (!c.ok) assert.equal(c.status, 429);
    assert.equal(w.voice.stats().sockets, 2);
    // The refused token was not burned: it works once a slot is free.
    const t2 = await newThread(w.chat, await studentToken(adult("stu-2")), "stu-2");
    const other = await w.connect(await w.mint(adult("stu-2"), t2, "stu-2"), { studentId: "stu-2", threadId: t2 });
    assert.ok(other.ok, "another student still connects");
    if (a.ok) a.client.abort();
    await until(() => w.voice.stats().sockets === 2, "one of stu-1's sockets closed");
    const retry = await w.connect(tokens[2]!, { threadId });
    assert.ok(retry.ok, "the refused token was not consumed, and the freed slot is usable");
    // A started (active) session no longer counts as pre-start.
    if (retry.ok) retry.client.send({ type: "start", threadId });
    await until(() => w.provider.backends.length === 1, "started");
    const again = await w.connect(tokens[3]!, { threadId });
    assert.ok(again.ok, "an active session does not count against the pre-start limit");
  });
});

// -- U10 repair 2, C15 (review F1, A23/D-088): the month is read again after the old session is superseded ------------------------

test("C15: usage 50 min, A runs 10 min, B supersedes A: the month is read again after A's minutes are written and B is refused voice_quota_exceeded with no provider session", async () => {
  await withWorld(async (w, threadId) => {
    await addUsage(w, 50 * MIN);
    const a = await w.open(adult(), threadId);
    w.clock.ms += 10 * MIN; // A has run its 10 minutes; the clock moves without firing A's cap timer
    const token = await w.mint(adult(), threadId); // A's minutes are not written yet, so the mint still passes
    const res = await w.connect(token, { threadId });
    assert.ok(res.ok);
    if (!res.ok) return;
    res.client.send({ type: "start", threadId });
    await until(() => res.client.closed, "B refused");
    assert.ok(a.client.of("error").some((e) => e.code === "superseded"), "A was superseded");
    assert.ok(res.client.of("error").some((e) => e.code === "voice_quota_exceeded"));
    assert.equal(res.client.closeCode, 1008);
    await w.voice.settled();
    assert.equal(w.provider.backends.length, 1, "B never opened a provider session");
    assert.equal(await used(w), 60 * MIN);
    const s = w.voice.stats();
    assert.equal(s.liveSessions, 0);
    assert.equal(s.activeSessions, 0);
  });
});
