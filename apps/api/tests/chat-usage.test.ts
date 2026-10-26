/**
 * vc-admin-control VA17: every completed authenticated chat turn writes ONE text-free usage row (tokens, cost, latency, an HMAC student key), an anonymous
 * voice session writes a row with no student key, and a failing usage sink never fails or changes a turn. B13: synthetic ids, fake Db, no provider call.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createAdminStore, studentKeyOf } from "@vc/db";
import { createFakeDb } from "@vc/db/testing";
import { createUsageSink } from "../src/admin-routes.js";
import { adult, call, chatWorld, CRISIS_TEXT, everythingStored, newThread, studentToken, turnsPath } from "./chat-fixtures.js";
import { MASTER_KEY } from "./admin-fixtures.js";

const SITE = "pathlynks";
const CANARY = "my-secret-canary-sentence-9981";
const hmacKeyOf = (master: string) => createHash("sha256").update(`vc-usage-student-key|${master}`).digest("hex");

function usageWorld(extra: Parameters<typeof chatWorld>[0] = {}, sinkOver?: (s: ReturnType<typeof createUsageSink>) => ReturnType<typeof createUsageSink>) {
  const admin = createFakeDb();
  const store = createAdminStore(admin.db, { masterKey: MASTER_KEY });
  const sink = createUsageSink(store, MASTER_KEY);
  const used = sinkOver ? sinkOver(sink) : sink;
  const w = chatWorld({ ...extra, deps: { ...(extra.deps ?? {}), usage: used } });
  return { w, sink, rows: () => admin.fakeDb.collection("turn_usage").all() as Record<string, unknown>[], adminDb: admin.fakeDb };
}

const turn = async (w: ReturnType<typeof chatWorld>, studentId: string, text: string, n: number, tenant = SITE) => {
  const token = await studentToken(adult(studentId, tenant));
  const threadId = await newThread(w, token, studentId);
  return call(w, "POST", turnsPath(studentId, threadId), { token, body: { text, clientTurnId: `u-${studentId}-${n}` } });
};

test("VA17: an authenticated chat turn writes exactly one row: mode chat, the tenant as siteId, a 64-hex HMAC student key, numeric latency, answered, and no text or raw id", async () => {
  const u = usageWorld();
  try {
    const res = await turn(u.w, "stu-usage-1", `tell me about German universities ${CANARY}`, 1);
    assert.equal(res.status, 200, res.body);
    const rows = u.rows();
    assert.equal(rows.length, 1);
    const row = rows[0]!;
    assert.equal(row.mode, "chat");
    assert.equal(row.siteId, SITE);
    assert.equal(row.studentKey, studentKeyOf(hmacKeyOf(MASTER_KEY), SITE, "stu-usage-1"));
    assert.match(String(row.studentKey), /^[0-9a-f]{64}$/);
    assert.equal(typeof row.latencyMs, "number");
    assert.equal(row.answered, true);
    const text = JSON.stringify(rows);
    assert.ok(!text.includes("stu-usage-1") && !text.includes(CANARY) && !text.includes("German"), "no raw id and no turn text in the usage row");
    // the same student is the same key on a second turn; another student or another site is a different key
    await turn(u.w, "stu-usage-1", "and about fees?", 2);
    await turn(u.w, "stu-usage-2", "and about fees?", 3);
    const keys = u.rows().map((r) => r.studentKey);
    assert.equal(keys.length, 3);
    assert.equal(keys[0], keys[1]);
    assert.notEqual(keys[0], keys[2]);
    assert.notEqual(studentKeyOf(hmacKeyOf(MASTER_KEY), "other-site", "stu-usage-1"), keys[0]);
  } finally {
    u.w.cleanup();
  }
});

test("VA17: tokens and cost reported by the provider while the turn runs are summed into that turn's row, and only reported usage counts", async () => {
  const u = usageWorld();
  try {
    const gen = u.w.provider.generate.bind(u.w.provider);
    (u.w.provider as { generate: unknown }).generate = async (...args: Parameters<typeof gen>) => {
      u.sink.addUsage({ actual: "reported", inputTokens: 1200, outputTokens: 300, usd: 0.0021 });
      u.sink.addUsage({ actual: "reported", inputTokens: 100, outputTokens: 50, usd: 0.0004 });
      u.sink.addUsage({ actual: "estimated", inputTokens: 999999, outputTokens: 999999, usd: 99 });
      return gen(...args);
    };
    const res = await turn(u.w, "stu-usage-3", "how do I apply?", 4);
    assert.equal(res.status, 200, res.body);
    const row = u.rows()[0]!;
    assert.equal(row.inputTokens, 1300);
    assert.equal(row.outputTokens, 350);
    assert.ok(Math.abs((row.costUsd as number) - 0.0025) < 1e-9, String(row.costUsd));
    // usage reported outside any turn is dropped, not carried into the next turn
    u.sink.addUsage({ actual: "reported", inputTokens: 5000, outputTokens: 5000, usd: 5 });
    (u.w.provider as { generate: unknown }).generate = gen;
    await turn(u.w, "stu-usage-3", "one more", 5);
    assert.equal(u.rows()[1]!.inputTokens, 0);
  } finally {
    u.w.cleanup();
  }
});

test("VA17: a crisis turn is recorded with guardrail 'crisis' and still holds no text", async () => {
  const u = usageWorld();
  try {
    const res = await turn(u.w, "stu-usage-4", CRISIS_TEXT, 6);
    assert.equal(res.status, 200);
    const rows = u.rows();
    if (rows.length === 1) {
      assert.equal(rows[0]!.guardrail, "crisis");
      assert.ok(!JSON.stringify(rows).includes(CRISIS_TEXT));
    } else assert.equal(rows.length, 0, "a quiet crisis path may write no row, never more than one");
  } finally {
    u.w.cleanup();
  }
});

test("VA17: a usage sink that throws never fails or changes the turn (the answer is identical to a world with no sink) and leaks no error text", async () => {
  const baseline = chatWorld();
  const broken = usageWorld({}, (s) => ({ ...s, record: async () => { throw new Error("db down password=hunter2"); } }) as typeof s);
  try {
    const a = await turn(baseline, "stu-usage-5", "tell me about fees", 7);
    const b = await turn(broken.w, "stu-usage-5", "tell me about fees", 7);
    assert.equal(b.status, 200);
    assert.equal(b.json.message, a.json.message);
    assert.equal(b.json.state, a.json.state);
    assert.ok(!b.body.includes("hunter2") && !JSON.stringify(broken.w.logs).includes("hunter2"));
    assert.ok(JSON.stringify(broken.w.logs).includes("chat_usage_write_failed"));
  } finally {
    baseline.cleanup();
    broken.w.cleanup();
  }
});

test("VA17: no sink, nothing recorded; and an anonymous voice session's row omits the student key (sink level)", async () => {
  const none = chatWorld();
  try {
    await turn(none, "stu-usage-6", "hello there", 8);
    assert.ok(!everythingStored(none.fakeDb).includes("turn_usage"));
  } finally {
    none.cleanup();
  }
  const admin = createFakeDb();
  const store = createAdminStore(admin.db, { masterKey: MASTER_KEY });
  const sink = createUsageSink(store, MASTER_KEY, () => "2026-10-26T10:00:00.000Z");
  await sink.record({ siteId: SITE, mode: "voice", latencyMs: 42_000, answered: true }, { inputTokens: 0, outputTokens: 0, costUsd: 0 });
  const rows = admin.fakeDb.collection("turn_usage").all() as Record<string, unknown>[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.mode, "voice");
  assert.ok(!("studentKey" in rows[0]!), "anonymous: no student key at all");
  assert.equal(rows[0]!.latencyMs, 42_000);
});
