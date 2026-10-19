/**
 * P1 U8: the student profile-fact store (A16b), the text-free flag log and the gap counts (spec A7), and how B15 erasure and
 * export cover the new collections. Fake DB only (B8). All text here is invented (B13).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLLECTION_NAMES,
  ERASURE_EXEMPT_COLLECTIONS,
  ERASURE_PLAN,
  ProfileFactNotFoundError,
  StudentFencedError,
  TenantScopeError,
  claimChatTurn,
  completeChatTurn,
  confirmErasure,
  createChatThread,
  decideProfileFact,
  executeErasure,
  exportStudent,
  incrementGapCount,
  listGapCounts,
  listProfileFacts,
  listStudentFlags,
  proposeProfileFact,
  recordStudentFlag,
  recordStudentUsage,
  requestErasure,
  tenantScopedDb,
} from "../src/index.js";
import { INDEX_PLAN } from "../scripts/db-init.js";
import { confirmTwiceAndApprove } from "../src/testing.js";
import { createFakeDb } from "./fakes.js";

function setup() {
  const { db, fakeDb } = createFakeDb();
  for (const spec of INDEX_PLAN) {
    if (!spec.unique) continue;
    fakeDb.collection<{ _id: string }>(spec.collection).declareUniqueIndex(Object.keys(spec.keys), { partialFilterExpression: spec.partialFilterExpression });
  }
  return { db, fakeDb, a: tenantScopedDb(db, "tenantA"), b: tenantScopedDb(db, "tenantB") };
}

test("a fact proposed from chat starts as proposed, is hidden from 'confirmed', and confirming it makes it student-confirmed", async () => {
  const { a } = setup();
  const f = await proposeProfileFact(a, { studentId: "stu-1", key: "target_country", value: "Germany", threadId: "th-1", turnId: "t1" });
  assert.equal(f.status, "proposed");
  assert.deepEqual((await listProfileFacts(a, { studentId: "stu-1" })).map((x) => [x.key, x.status]), [["target_country", "proposed"]]);
  const done = await decideProfileFact(a, { studentId: "stu-1", factId: f.factId, action: "confirm" });
  assert.equal(done?.status, "confirmed");
  assert.equal((await listProfileFacts(a, { studentId: "stu-1" }))[0]!.status, "confirmed");
});

test("a student correcting a proposed fact replaces its value (redacted) and confirms it", async () => {
  const { a } = setup();
  const f = await proposeProfileFact(a, { studentId: "stu-1", key: "budget", value: "10 lakh" });
  const done = await decideProfileFact(a, { studentId: "stu-1", factId: f.factId, action: "correct", value: "12 lakh, call 9876543210" });
  assert.equal(done?.value, "12 lakh, call [PHONE]");
  assert.equal(done?.status, "confirmed");
});

test("p1-u8r low: a fact key a model proposed with a phone number or email in it is stored redacted, like the value", async () => {
  const { a, fakeDb } = setup();
  const f = await proposeProfileFact(a, { studentId: "stu-1", key: "reach me on 9876543210 or priya@example.com", value: "Germany" });
  assert.equal(f.key, "reach me on [PHONE] or [EMAIL]");
  const stored = JSON.stringify(fakeDb.collection(COLLECTION_NAMES.profile_facts).all());
  assert.ok(!stored.includes("9876543210") && !stored.includes("priya@example.com"));
  assert.equal((await listProfileFacts(a, { studentId: "stu-1" }))[0]!.key, "reach me on [PHONE] or [EMAIL]");
});

test("a student erasing a proposed fact deletes it from the store", async () => {
  const { a, fakeDb } = setup();
  const f = await proposeProfileFact(a, { studentId: "stu-1", key: "budget", value: "10 lakh" });
  assert.equal(await decideProfileFact(a, { studentId: "stu-1", factId: f.factId, action: "erase" }), null);
  assert.equal(fakeDb.collection(COLLECTION_NAMES.profile_facts).all().length, 0);
});

test("a student cannot decide on another student's fact, or on one that does not exist", async () => {
  const { a } = setup();
  const f = await proposeProfileFact(a, { studentId: "stu-1", key: "budget", value: "10 lakh" });
  await assert.rejects(decideProfileFact(a, { studentId: "stu-2", factId: f.factId, action: "confirm" }), ProfileFactNotFoundError);
  await assert.rejects(decideProfileFact(a, { studentId: "stu-1", factId: "nope", action: "confirm" }), ProfileFactNotFoundError);
});

test("proposing the same key twice keeps one fact per key, and a confirmed fact is not downgraded back to proposed", async () => {
  const { a } = setup();
  const f1 = await proposeProfileFact(a, { studentId: "stu-1", key: "budget", value: "10 lakh" });
  await decideProfileFact(a, { studentId: "stu-1", factId: f1.factId, action: "confirm" });
  const f2 = await proposeProfileFact(a, { studentId: "stu-1", key: "budget", value: "15 lakh" });
  assert.equal(f2.factId, f1.factId);
  const all = await listProfileFacts(a, { studentId: "stu-1" });
  assert.equal(all.length, 1);
  assert.equal(all[0]!.status, "confirmed");
  assert.equal(all[0]!.value, "10 lakh");
});

test("two tenants with the same student id keep separate profile facts and flag logs (A6)", async () => {
  const { a, b } = setup();
  await proposeProfileFact(a, { studentId: "stu-1", key: "budget", value: "A" });
  await proposeProfileFact(b, { studentId: "stu-1", key: "budget", value: "B" });
  assert.deepEqual((await listProfileFacts(a, { studentId: "stu-1" })).map((x) => x.value), ["A"]);
  assert.deepEqual((await listProfileFacts(b, { studentId: "stu-1" })).map((x) => x.value), ["B"]);
  await recordStudentFlag(a, { studentId: "stu-1", threadId: "th", turnId: "t1", kind: "crisis" });
  assert.equal((await listStudentFlags(b, { studentId: "stu-1" })).length, 0);
});

test("the profile store and flag log refuse an unscoped Db", async () => {
  const { db } = setup();
  await assert.rejects(proposeProfileFact(db, { studentId: "s", key: "k", value: "v" }), TenantScopeError);
  await assert.rejects(recordStudentFlag(db, { studentId: "s", threadId: "t", turnId: "u", kind: "crisis" }), TenantScopeError);
  await assert.rejects(incrementGapCount(db, { kind: "no_sourced_answer" }), TenantScopeError);
});

test("a crisis turn leaves a text-free flag row (ids and time only), and the same turn flagged twice is one row", async () => {
  const { a, fakeDb } = setup();
  const now = new Date("2026-10-17T10:00:00.000Z");
  await recordStudentFlag(a, { studentId: "stu-1", threadId: "th", turnId: "t1", kind: "crisis" }, { now });
  await recordStudentFlag(a, { studentId: "stu-1", threadId: "th", turnId: "t1", kind: "crisis" }, { now });
  const rows = fakeDb.collection(COLLECTION_NAMES.student_flags).all();
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]!).sort(), ["_id", "at", "kind", "studentId", "tenantId", "threadId", "turnId"]);
  assert.equal((await listStudentFlags(a, { studentId: "stu-1" }))[0]!.kind, "crisis");
});

test("an unanswerable turn raises that day's gap count by one, with no student or text in the row", async () => {
  const { a, fakeDb } = setup();
  const now = new Date("2026-10-17T10:00:00.000Z");
  await incrementGapCount(a, { kind: "no_sourced_answer" }, { now });
  await incrementGapCount(a, { kind: "no_sourced_answer" }, { now });
  await incrementGapCount(a, { kind: "unverified_claim" }, { now });
  assert.deepEqual(await listGapCounts(a, { date: "2026-10-17" }), [
    { date: "2026-10-17", kind: "no_sourced_answer", count: 2 },
    { date: "2026-10-17", kind: "unverified_claim", count: 1 },
  ]);
  for (const row of fakeDb.collection(COLLECTION_NAMES.chat_gap_counts).all()) {
    assert.deepEqual(Object.keys(row).sort(), ["_id", "count", "date", "kind", "tenantId"]);
  }
});

test("a student under erasure gets no new profile fact and no new flag row", async () => {
  const { a } = setup();
  const { requestId } = await requestErasure(a, { studentId: "stu-1", requestedBy: "counsellor-7", reason: "student_request" });
  await confirmErasure(a, { requestId, confirmedBy: "admin-2" });
  await assert.rejects(proposeProfileFact(a, { studentId: "stu-1", key: "k", value: "v" }), StudentFencedError);
  await assert.rejects(recordStudentFlag(a, { studentId: "stu-1", threadId: "t", turnId: "u", kind: "crisis" }), StudentFencedError);
});

// ---------------------------------------------------------------------------
// B15 erasure + export
// ---------------------------------------------------------------------------

async function seedChat(db: ReturnType<typeof tenantScopedDb>, studentId: string) {
  await createChatThread(db, { studentId, textStored: true, threadId: `th-${studentId}` });
  const c = await claimChatTurn(db, { studentId, threadId: `th-${studentId}`, turnId: "t1", text: `question of ${studentId}`, requestHash: "h", channel: "text" });
  if (c.kind !== "claimed") throw new Error("expected claimed");
  await completeChatTurn(db, { studentId, threadId: `th-${studentId}`, turnId: "t1", leaseToken: c.leaseToken, channel: "text", assistantText: "answer", response: { state: "ok", claims: [], sources: [], profileFactsUsed: [] } });
  await recordStudentUsage(db, { studentId, textTurns: 1 });
  await proposeProfileFact(db, { studentId, key: "budget", value: "10 lakh" });
  await recordStudentFlag(db, { studentId, threadId: `th-${studentId}`, turnId: "t1", kind: "concern" });
}

test("every new student-bearing chat collection is in the B15 erasure plan and the gap counts are exempt with a reason", () => {
  const planned = new Set(ERASURE_PLAN.map((s) => s.collection));
  for (const name of [COLLECTION_NAMES.chat_threads, COLLECTION_NAMES.chat_turns, COLLECTION_NAMES.profile_facts, COLLECTION_NAMES.student_usage, COLLECTION_NAMES.student_flags]) {
    assert.ok(planned.has(name), `${name} must be in ERASURE_PLAN`);
  }
  assert.match((ERASURE_EXEMPT_COLLECTIONS as Record<string, string>)[COLLECTION_NAMES.chat_gap_counts] ?? "", /no student/i);
});

test("erasing a student removes their threads, turns, facts, usage and flags and leaves another student's untouched; the receipt counts them", async () => {
  const { fakeDb, a } = setup();
  await seedChat(a, "stu-1");
  await seedChat(a, "stu-2");
  const { requestId } = await requestErasure(a, { studentId: "stu-1", requestedBy: "counsellor-7", reason: "student_request" });
  await confirmTwiceAndApprove(a, { requestId, confirmedBy: "admin-2" });
  const outcome = await executeErasure(a, requestId);
  assert.equal(outcome.status, "completed");
  for (const name of [COLLECTION_NAMES.chat_threads, COLLECTION_NAMES.chat_turns, COLLECTION_NAMES.profile_facts, COLLECTION_NAMES.student_usage, COLLECTION_NAMES.student_flags]) {
    const left = fakeDb.collection<{ studentId: string }>(name).all();
    assert.deepEqual([...new Set(left.map((d) => d.studentId))], ["stu-2"], name);
  }
  const line = outcome.receipt.collections.find((l) => l.collection === COLLECTION_NAMES.chat_turns);
  assert.equal(line?.deleted, 2);
  assert.equal(line?.remaining, 0);
});

test("exporting a student returns their chat threads, turns, facts, usage and flags, and nobody else's", async () => {
  const { a } = setup();
  await seedChat(a, "stu-1");
  await seedChat(a, "stu-2");
  const out = await exportStudent(a, "stu-1");
  assert.deepEqual(out.chatThreads.map((t) => t.threadId), ["th-stu-1"]);
  assert.deepEqual(out.chatTurns.map((t) => `${t.role}:${t.text}`), ["user:question of stu-1", "assistant:answer"]);
  assert.deepEqual(out.profileFacts.map((f) => f.key), ["budget"]);
  assert.equal(out.usage.length, 1);
  assert.equal(out.flags.length, 1);
  assert.ok(!JSON.stringify(out).includes("stu-2"));
});

// ---------------------------------------------------------------------------
// p1-lk6 (D-104, D-105): the English KG keeps the original-language quote and the language label, both optional and additive.
// ---------------------------------------------------------------------------

test("p1-lk6: a proposed fact keeps the original-language quote and sourceLang next to its English value, and the quote is redacted like the value", async () => {
  const { a, fakeDb } = setup();
  const f = await proposeProfileFact(a, {
    studentId: "stu-1",
    key: "target_country",
    value: "Germany",
    quote: "मुझे जर्मनी जाना है, मेरा फोन 9876543210 है",
    sourceLang: "hi",
    threadId: "th-1",
    turnId: "t1",
  });
  assert.equal(f.value, "Germany");
  assert.equal(f.quote, "मुझे जर्मनी जाना है, मेरा फोन [PHONE] है");
  assert.equal(f.sourceLang, "hi");
  const stored = JSON.stringify(fakeDb.collection(COLLECTION_NAMES.profile_facts).all());
  assert.ok(!stored.includes("9876543210"), "the stored quote carries no phone number");
  const listed = (await listProfileFacts(a, { studentId: "stu-1" }))[0]!;
  assert.deepEqual([listed.quote, listed.sourceLang], [f.quote, "hi"]);
});

test("p1-lk6: quote and sourceLang are optional: a fact proposed without them has neither field (old rows and old callers are unchanged)", async () => {
  const { a } = setup();
  const f = await proposeProfileFact(a, { studentId: "stu-1", key: "budget", value: "10 lakh" });
  assert.ok(!("quote" in f) && !("sourceLang" in f));
});

test("p1-lk6: an unusable quote or language label (empty, over-long, not a language tag) is left out of the row and never fails the proposal", async () => {
  const { a } = setup();
  for (const [i, bad] of [{ quote: "   " }, { quote: "x".repeat(1001) }, { sourceLang: "not a tag!" }, { sourceLang: "" }].entries()) {
    const f = await proposeProfileFact(a, { studentId: "stu-1", key: `k${i}`, value: "v", ...bad });
    assert.ok(!("quote" in f) && !("sourceLang" in f), JSON.stringify(bad));
  }
});

test("p1-lk6: proposing the same key again replaces the quote with the newer value's quote; without one the stale quote is removed; a confirmed fact keeps its own", async () => {
  const { a } = setup();
  await proposeProfileFact(a, { studentId: "stu-1", key: "budget", value: "10 lakh", quote: "दस लाख", sourceLang: "hi" });
  const second = await proposeProfileFact(a, { studentId: "stu-1", key: "budget", value: "15 lakh", quote: "पंद्रह लाख", sourceLang: "hi" });
  assert.deepEqual([second.value, second.quote], ["15 lakh", "पंद्रह लाख"]);
  const third = await proposeProfileFact(a, { studentId: "stu-1", key: "budget", value: "20 lakh" });
  assert.equal(third.value, "20 lakh");
  assert.ok(!("quote" in third) && !("sourceLang" in third), "a quote of the old value must not stay beside the new one");
  const confirmed = await proposeProfileFact(a, { studentId: "stu-1", key: "city", value: "Pune", quote: "पुणे" });
  await decideProfileFact(a, { studentId: "stu-1", factId: confirmed.factId, action: "confirm" });
  const again = await proposeProfileFact(a, { studentId: "stu-1", key: "city", value: "Delhi", quote: "दिल्ली" });
  assert.deepEqual([again.value, again.quote, again.status], ["Pune", "पुणे", "confirmed"]);
});

test("p1-lk6: a student correcting a fact whose quote supports the old value drops the quote (the corrected value is the student's own words)", async () => {
  const { a } = setup();
  const f = await proposeProfileFact(a, { studentId: "stu-1", key: "budget", value: "10 lakh", quote: "दस लाख", sourceLang: "hi" });
  const done = await decideProfileFact(a, { studentId: "stu-1", factId: f.factId, action: "correct", value: "12 lakh" });
  assert.equal(done?.value, "12 lakh");
  assert.ok(!("quote" in done!), "the old quote no longer supports the corrected value");
  const kept = await proposeProfileFact(a, { studentId: "stu-1", key: "city", value: "Pune", quote: "पुणे" });
  const confirmed = await decideProfileFact(a, { studentId: "stu-1", factId: kept.factId, action: "confirm" });
  assert.equal(confirmed?.quote, "पुणे", "confirming keeps the quote");
});
