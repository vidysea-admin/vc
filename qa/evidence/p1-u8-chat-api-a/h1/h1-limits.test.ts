/** H1 area 4: limits and idempotency under concurrency. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { COLLECTION_NAMES, claimChatTurn, completeChatTurn, ChatTurnLeaseLostError, CHAT_TURN_LEASE_MS } from "@vc/db";
import { chatWorld, call, studentToken, adult, newThread, threadsPath, turnsPath, CRISIS_TEXT, recordingKb } from "../../p1-u8/apps/api/tests/chat-fixtures.js";

const Q = "What are the tuition fees for public universities in Germany?";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rows = (w: any, name: string) => w.fakeDb.collection(name).all() as any[];
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function slowKbWorld(extra: Record<string, unknown> = {}) {
  const kb = recordingKb();
  const slow = { ...kb, searchKb: async (...a: unknown[]) => { await sleep(40); return (kb.searchKb as any)(...a); } };
  return chatWorld({ deps: { kb: slow as any, ...extra } as any });
}

test("4a 40 parallel turns from one student: at most 30 pass, the rest 429 with Retry-After, model calls equal passes; crisis text is never limited; window resets", async () => {
  const w = chatWorld();
  try {
    const t = await studentToken(adult("stu-1"));
    const th = await newThread(w, t);
    w.clock.ms += 61_000; // the thread create used one slot: reset the window
    const base = w.provider.calls.length;
    const res = await Promise.all(Array.from({ length: 40 }, (_, i) => call(w, "POST", turnsPath("stu-1", th), { token: t, body: { text: Q, clientTurnId: `p-${i}` } })));
    const ok = res.filter((r) => r.status === 200).length;
    const limited = res.filter((r) => r.status === 429);
    console.log(`OBS 4a pass=${ok} limited=${limited.length} other=${res.length - ok - limited.length}`);
    assert.ok(ok <= 30, `${ok} turns passed in one window`);
    assert.equal(ok + limited.length, 40);
    assert.ok(limited.length >= 10);
    for (const r of limited) {
      assert.ok(Number(r.headers["retry-after"]) >= 1, "429 without Retry-After");
      assert.equal(r.json.error, "rate_limited");
    }
    const perTurn = (w.provider.calls.length - base) / ok;
    assert.ok(Number.isInteger(perTurn) && perTurn >= 1, `model calls ${w.provider.calls.length - base} for ${ok} turns`);
    // rejected turns stored nothing
    assert.equal(rows(w, COLLECTION_NAMES.chat_turns).filter((r) => r.role === "user").length, ok);
    // crisis is never limited, even now
    for (let i = 0; i < 5; i++) {
      const c = await call(w, "POST", turnsPath("stu-1", th), { token: t, body: { text: CRISIS_TEXT, clientTurnId: `crisis-${i}` } });
      assert.equal(c.status, 200, `crisis turn ${i} -> ${c.status}`);
    }
    // other routes are limited too (profile GET) and a different student is unaffected
    const prof = await call(w, "GET", `/v1/students/stu-1/chat/profile`, { token: t });
    assert.equal(prof.status, 429);
    const t2 = await studentToken(adult("stu-2"));
    assert.equal((await call(w, "POST", threadsPath("stu-2"), { token: t2 })).status, 201);
    w.clock.ms += 61_000;
    assert.equal((await call(w, "GET", `/v1/students/stu-1/chat/profile`, { token: t })).status, 200, "window did not reset");
  } finally { w.cleanup(); }
});

test("4b limiter key collisions: (tenant ab, student c) vs (tenant a, student bc) and (a-b / c) variants have separate budgets", async () => {
  const w = chatWorld();
  try {
    const pairs: [string, string][] = [["ab", "c"], ["a", "bc"], ["a-b", "c"], ["a", "b-c"], ["tenant-a", "x"], ["tenant", "a-x"]];
    // exhaust the first pair
    const t0 = await studentToken(adult(pairs[0]![1], pairs[0]![0]));
    let limitedAt = -1;
    for (let i = 0; i < 40; i++) {
      const r = await call(w, "GET", `/v1/students/${pairs[0]![1]}/chat/profile`, { token: t0 });
      if (r.status === 429) { limitedAt = i; break; }
    }
    assert.equal(limitedAt, 30, "limit is 30 per window");
    for (const [tenant, sid] of pairs.slice(1)) {
      const t = await studentToken(adult(sid, tenant));
      const r = await call(w, "GET", `/v1/students/${sid}/chat/profile`, { token: t });
      assert.equal(r.status, 200, `(${tenant},${sid}) shares a budget with (ab,c)`);
    }
    // per-tenant override creates a separate limiter and is honoured
  } finally { w.cleanup(); }
  const w2 = chatWorld({ deps: { limitsForTenant: (tenantId: string) => (tenantId === "tenant-low" ? { requestsPerMinute: 3 } : undefined) } as any });
  try {
    const t = await studentToken(adult("stu-1", "tenant-low"));
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await call(w2, "GET", `/v1/students/stu-1/chat/profile`, { token: t })).status);
    assert.deepEqual(codes, [200, 200, 200, 429, 429]);
    const t2 = await studentToken(adult("stu-1", "tenant-a"));
    assert.equal((await call(w2, "GET", `/v1/students/stu-1/chat/profile`, { token: t2 })).status, 200);
  } finally { w2.cleanup(); }
});

test("4c the same clientTurnId 20 times in parallel (slow KB): exactly one model run, one stored exchange, one usage count; the rest replay (200, identical) or 409 turn_in_progress", async () => {
  const base = slowKbWorld();
  let perTurnCalls = 0;
  try {
    const t = await studentToken(adult("stu-1"));
    const th0 = await newThread(base, t);
    assert.equal((await call(base, "POST", turnsPath("stu-1", th0), { token: t, body: { text: Q, clientTurnId: "baseline" } })).status, 200);
    perTurnCalls = base.provider.calls.length;
  } finally { base.cleanup(); }
  assert.ok(perTurnCalls >= 1);

  const w = slowKbWorld();
  try {
    const t = await studentToken(adult("stu-1"));
    const th = await newThread(w, t);
    w.clock.ms += 61_000;
    const res = await Promise.all(Array.from({ length: 20 }, () => call(w, "POST", turnsPath("stu-1", th), { token: t, body: { text: Q, clientTurnId: "dup-1" } })));
    const byStatus: Record<string, number> = {};
    for (const r of res) byStatus[`${r.status}${r.json?.error ? ":" + r.json.error : ""}`] = (byStatus[`${r.status}${r.json?.error ? ":" + r.json.error : ""}`] ?? 0) + 1;
    console.log("OBS 4c statuses", JSON.stringify(byStatus), "model calls", w.provider.calls.length, "baseline per turn", perTurnCalls);
    for (const r of res) assert.ok(r.status === 200 || (r.status === 409 && r.json.error === "turn_in_progress"), `unexpected ${r.status} ${r.body}`);
    assert.equal(w.provider.calls.length - 0, perTurnCalls + 0, "more than one model run for one clientTurnId");
    const turns = rows(w, COLLECTION_NAMES.chat_turns);
    assert.equal(turns.filter((r) => r.role === "user").length, 1);
    assert.equal(turns.filter((r) => r.role === "assistant").length, 1);
    assert.equal(rows(w, COLLECTION_NAMES.student_usage).reduce((n, r) => n + r.textTurns, 0), 1, "usage counted more than once");
    const okBodies = new Set(res.filter((r) => r.status === 200).map((r) => JSON.stringify(r.json)));
    console.log("OBS 4c distinct 200 bodies:", okBodies.size);
    // after the dust settles every retry replays the same answer, no new model run
    const calls1 = w.provider.calls.length;
    const again = await Promise.all(Array.from({ length: 5 }, () => call(w, "POST", turnsPath("stu-1", th), { token: t, body: { text: Q, clientTurnId: "dup-1" } })));
    for (const r of again) assert.equal(r.status, 200);
    assert.equal(new Set(again.map((r) => JSON.stringify(r.json))).size, 1);
    assert.equal(w.provider.calls.length, calls1);
    assert.equal(rows(w, COLLECTION_NAMES.chat_turns).length, 2);
    assert.equal(rows(w, COLLECTION_NAMES.student_usage).reduce((n, r) => n + r.textTurns, 0), 1);
  } finally { w.cleanup(); }
});

test("4d same clientTurnId with different text => 409 turn_id_conflict (sequential and concurrent), the stored text is never overwritten", async () => {
  const w = slowKbWorld();
  try {
    const t = await studentToken(adult("stu-1"));
    const th = await newThread(w, t);
    assert.equal((await call(w, "POST", turnsPath("stu-1", th), { token: t, body: { text: Q, clientTurnId: "id-1" } })).status, 200);
    const c = await call(w, "POST", turnsPath("stu-1", th), { token: t, body: { text: "A completely different question about Japan", clientTurnId: "id-1" } });
    assert.equal(c.status, 409);
    assert.equal(c.json.error, "turn_id_conflict");
    const hist = await call(w, "GET", `${threadsPath("stu-1")}/${th}`, { token: t });
    assert.ok(!JSON.stringify(hist.json).includes("Japan"));
    assert.equal(hist.json.turns.length, 2);
    // concurrent: two different texts racing on one new id
    const [x, y] = await Promise.all([
      call(w, "POST", turnsPath("stu-1", th), { token: t, body: { text: "first text race one", clientTurnId: "race-1" } }),
      call(w, "POST", turnsPath("stu-1", th), { token: t, body: { text: "second text race two", clientTurnId: "race-1" } }),
    ]);
    console.log("OBS 4d race statuses", x.status, x.json?.error, y.status, y.json?.error);
    assert.ok([x.status, y.status].filter((s) => s === 200).length === 1, "exactly one of the racing texts runs");
    assert.ok([x, y].every((r) => r.status === 200 || r.status === 409));
    const stored = rows(w, COLLECTION_NAMES.chat_turns).filter((r) => String(r._id).includes("race-1"));
    assert.equal(stored.filter((r) => r.role === "user").length, 1);
    assert.equal(stored.filter((r) => r.role === "assistant").length, 1);
  } finally { w.cleanup(); }
});

test("4e crashed lease holder: in-progress until the lease expires on the fake clock, then ONE takeover runs; the dead holder cannot complete late", async () => {
  const w = chatWorld();
  try {
    const t = await studentToken(adult("stu-1"));
    const th = await newThread(w, t);
    const db = w.deps.dbForTenant("tenant-a");
    const text = "How do I choose a Master's programme in Germany?";
    // the "crashed" holder: claims the turn (as the route would) and never finishes
    const claim = await claimChatTurn(db, { studentId: "stu-1", threadId: th, turnId: "crash-1", text, requestHash: sha(text), channel: "text" }, { now: new Date(w.clock.ms) });
    assert.equal(claim.kind, "claimed");
    const calls0 = w.provider.calls.length;
    const r1 = await call(w, "POST", turnsPath("stu-1", th), { token: t, body: { text, clientTurnId: "crash-1" } });
    assert.equal(r1.status, 409);
    assert.equal(r1.json.error, "turn_in_progress");
    assert.ok(r1.headers["retry-after"]);
    assert.equal(w.provider.calls.length, calls0);
    w.clock.ms += CHAT_TURN_LEASE_MS - 1000; // still inside the lease
    assert.equal((await call(w, "POST", turnsPath("stu-1", th), { token: t, body: { text, clientTurnId: "crash-1" } })).status, 409);
    w.clock.ms += 2000 + 61_000; // beyond the lease (and a fresh rate window)
    const retries = await Promise.all(Array.from({ length: 6 }, () => call(w, "POST", turnsPath("stu-1", th), { token: t, body: { text, clientTurnId: "crash-1" } })));
    console.log("OBS 4e takeover statuses", retries.map((r) => r.status + (r.json?.error ? ":" + r.json.error : "")).join(","));
    for (const r of retries) assert.ok(r.status === 200 || r.status === 409, `${r.status} ${r.body}`);
    assert.ok(retries.some((r) => r.status === 200), "no takeover happened");
    const perTurn = w.provider.calls.length - calls0;
    assert.ok(perTurn >= 1);
    // a second wave must replay, not run again
    const calls1 = w.provider.calls.length;
    const r2 = await call(w, "POST", turnsPath("stu-1", th), { token: t, body: { text, clientTurnId: "crash-1" } });
    assert.equal(r2.status, 200);
    assert.equal(w.provider.calls.length, calls1);
    // the dead holder wakes up and tries to close its stale lease
    await assert.rejects(
      completeChatTurn(db, { studentId: "stu-1", threadId: th, turnId: "crash-1", leaseToken: (claim as any).leaseToken, channel: "text", assistantText: "STALE OVERWRITE", response: { stale: true } }, { now: new Date(w.clock.ms) }),
      ChatTurnLeaseLostError,
    );
    const hist = await call(w, "GET", `${threadsPath("stu-1")}/${th}`, { token: t });
    assert.ok(!JSON.stringify(hist.json).includes("STALE OVERWRITE"));
    assert.equal(rows(w, COLLECTION_NAMES.chat_turns).filter((r) => String(r._id).includes("crash-1")).length, 2);
    // wrong student / wrong lease token cannot abandon or complete
    await assert.rejects(completeChatTurn(db, { studentId: "stu-other", threadId: th, turnId: "crash-1", leaseToken: "x", channel: "text", assistantText: "x", response: {} }, { now: new Date(w.clock.ms) }), ChatTurnLeaseLostError);
  } finally { w.cleanup(); }
});
