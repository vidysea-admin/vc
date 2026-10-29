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


test("S12: replacement preserves active provenance and needs exact candidate/version/displayed value; reject preserves active", async () => {
  const { a } = setup();
  const first = (await proposeProfileFact(a,{studentId:"stu-1",key:"target_country",value:"Germany",quote:"Deutschland",sourceLang:"de",threadId:"one",turnId:"old"}))!;
  await decideProfileFact(a,{studentId:"stu-1",factId:first.factId,action:"confirm"});
  const next = (await proposeProfileFact(a,{studentId:"stu-1",key:"target_country",value:"France",quote:"France",sourceLang:"fr",threadId:"two",turnId:"new"}))!;
  assert.equal(next.value,"Germany"); assert.equal(next.quote,"Deutschland");
  assert.equal(next.pendingChange?.value,"France"); assert.equal(next.pendingChange?.threadId,"two");
  const candidate = next.pendingChange!;
  for (const ref of [{},{candidateId:candidate.candidateId},{candidateId:candidate.candidateId,expectedVersion:"stale",value:"France"},{candidateId:candidate.candidateId,expectedVersion:candidate.version,value:"Germany"}]) {
    await assert.rejects(decideProfileFact(a,{studentId:"stu-1",factId:first.factId,action:"confirm",...ref}),/ProfileFactChanged/);
  }
  const rejected = await decideProfileFact(a,{studentId:"stu-1",factId:first.factId,action:"reject",candidateId:candidate.candidateId,expectedVersion:candidate.version,value:candidate.value});
  assert.equal(rejected?.value,"Germany"); assert.equal(rejected?.quote,"Deutschland"); assert.equal(rejected?.pendingChange,undefined);
  await assert.rejects(decideProfileFact(a,{studentId:"stu-1",factId:first.factId,action:"confirm",candidateId:candidate.candidateId,expectedVersion:candidate.version,value:candidate.value}),/ProfileFactChanged/);
  const replacement = (await proposeProfileFact(a,{studentId:"stu-1",key:"target_country",value:"Spain"}))!;
  const accepted = await decideProfileFact(a,{studentId:"stu-1",factId:first.factId,action:"confirm",candidateId:replacement.pendingChange!.candidateId,expectedVersion:replacement.pendingChange!.version,value:"Spain"});
  assert.equal(accepted?.value,"Spain"); assert.equal(accepted?.pendingChange,undefined);
  assert.equal(accepted?.quote,undefined); assert.equal(accepted?.threadId,undefined);
});

test("S12: correction clears candidate and provenance, forget removes active and candidate, initial reject removes only proposal",async()=>{
 const {a}=setup();
 const first=(await proposeProfileFact(a,{studentId:"stu-1",key:"budget",value:"10 lakh",quote:"ten",threadId:"one"}))!;
 assert.equal(first.pendingChange?.value,"10 lakh");
 const corrected=await decideProfileFact(a,{studentId:"stu-1",factId:first.factId,action:"correct",value:"12 lakh"});
 assert.equal(corrected?.pendingChange,undefined); assert.equal(corrected?.quote,undefined);
 await proposeProfileFact(a,{studentId:"stu-1",key:"budget",value:"15 lakh",quote:"fifteen"});
 await decideProfileFact(a,{studentId:"stu-1",factId:first.factId,action:"erase"});
 assert.deepEqual(await listProfileFacts(a,{studentId:"stu-1"}),[]);
 const pending=(await proposeProfileFact(a,{studentId:"stu-1",key:"interest",value:"music"}))!;
 await decideProfileFact(a,{studentId:"stu-1",factId:pending.factId,action:"reject",candidateId:pending.pendingChange!.candidateId,expectedVersion:pending.pendingChange!.version,value:"music"});
 assert.deepEqual(await listProfileFacts(a,{studentId:"stu-1"}),[]);
});

test("S12: stale extraction successful cleanup never rewinds the explicit forget history cutoff",async()=>{
 const m=await import("../src/profile-facts.js"); const {a,fakeDb}=setup();
 const t0=new Date("2026-11-01T10:00:00.000Z"),t2=new Date("2026-11-01T10:00:02.000Z");
 const threads=await import("../src/chat-threads.js");
 await createChatThread(a,{studentId:"stu-1",threadId:"owned",textStored:true},{now:t0});
 const claim=await claimChatTurn(a,{studentId:"stu-1",threadId:"owned",turnId:"t1",channel:"text",text:"I like robotics",requestHash:"synthetic-t1"},{now:new Date("2026-11-01T10:00:01Z")});
 assert.equal(claim.kind,"claimed");
 if(claim.kind!=="claimed")throw new Error("claim unavailable");
 await completeChatTurn(a,{studentId:"stu-1",threadId:"owned",turnId:"t1",leaseToken:claim.leaseToken,channel:"text",assistantText:"Lets explore robotics",response:{state:"ok",claims:[],sources:[],profileFactsUsed:[]}});
 assert.equal((await threads.listChatContext(a,{studentId:"stu-1",threadId:"owned"})).length,2);
 const fact=(await proposeProfileFact(a,{studentId:"stu-1",key:"interest",value:"robotics"},{now:t0}))!;
 const revision=await m.readStudentMemoryRevision(a,"stu-1");
 const col=fakeDb.collection(COLLECTION_NAMES.profile_facts), update=col.updateOne.bind(col);
 let release!:()=>void,entered!:()=>void;const blocked=new Promise<void>(r=>release=r),paused=new Promise<void>(r=>entered=r);
 col.updateOne=(async(...args:Parameters<typeof col.updateOne>)=>{if((args[1] as any).$setOnInsert?.key==="stale"){entered();await blocked;}return update(...args);}) as typeof col.updateOne;
 const proposal=proposeProfileFact(a,{studentId:"stu-1",key:"stale",value:"robotics",expectedRevision:revision},{now:t0});
 try {
   await paused;await decideProfileFact(a,{studentId:"stu-1",factId:fact.factId,action:"erase"},{now:t2});
   const before=await m.readStudentMemoryRevision(a,"stu-1");
   release();assert.equal(await proposal,null);
   const after=await m.readStudentMemoryRevision(a,"stu-1");assert.notEqual(before,after);
   // Old implementation derives a transcript cutoff from revision; retained counterexample reopens T1 chat after T2 forget.
   const snapshot=typeof m.readStudentMemorySnapshot==="function"?await m.readStudentMemorySnapshot(a,"stu-1"):{historyAfter:after.split("|")[0],historyUsable:true};
   assert.equal(snapshot.historyAfter,t2.toISOString());assert.equal(snapshot.historyUsable,true);
   assert.equal(["2026-11-01T10:00:01.000Z"].filter(at=>!snapshot.historyAfter||at>snapshot.historyAfter).length,0);
   assert.deepEqual(await threads.listChatContext(a,{studentId:"stu-1",threadId:"owned",after:snapshot.historyAfter!}),[]);
   assert.equal((await threads.listChatTurns(a,{studentId:"stu-1",threadId:"owned"})).length,2,"delivered history stays immutable");
   assert.deepEqual(await listProfileFacts(a,{studentId:"stu-1"}),[]);
 } finally {release();await Promise.allSettled([proposal]);}
});

test("S12: unknown legacy cutoff excludes history without discarding confirmed facts; marker-free history stays usable",async()=>{
 const m=await import("../src/profile-facts.js");const {a,b,fakeDb}=setup();
 assert.deepEqual(await m.readStudentMemorySnapshot(a,"stu-1"),{revision:"",historyAfter:null,historyUsable:true});
 const f=(await proposeProfileFact(a,{studentId:"stu-1",key:"interest",value:"music"}))!;
 await decideProfileFact(a,{studentId:"stu-1",factId:f.factId,action:"confirm"});
 const markers=fakeDb.collection(COLLECTION_NAMES.student_usage);
 await markers.updateOne({studentId:"stu-1",tenantId:"tenantA"},{$set:{revision:"arbitrary-legacy"},$unset:{historyAfter:"",historyUsable:""}});
 assert.deepEqual(await m.readStudentMemorySnapshot(a,"stu-1"),{revision:"arbitrary-legacy",historyAfter:null,historyUsable:false});
 assert.equal((await listProfileFacts(a,{studentId:"stu-1",status:"confirmed"}))[0]?.value,"music");
 assert.deepEqual(await m.readStudentMemorySnapshot(b,"stu-1"),{revision:"",historyAfter:null,historyUsable:true});
 for(const invalid of ["not-a-date",17]) {
  await markers.updateOne({studentId:"stu-1",tenantId:"tenantA"},{$set:{historyAfter:invalid}});
  assert.equal((await m.readStudentMemorySnapshot(a,"stu-1")).historyUsable,false);
 }
 await markers.updateOne({studentId:"stu-1",tenantId:"tenantA"},{$set:{pendingCompensations:1}});
 await assert.rejects(m.readStudentMemorySnapshot(a,"stu-1"),/pending/i);
});

test("S12: later explicit decision retains monotonic cutoff even if an earlier decision completes last",async()=>{
 const m=await import("../src/profile-facts.js");const {a,fakeDb}=setup();
 const facts=await Promise.all(["budget","interest"].map(key=>proposeProfileFact(a,{studentId:"stu-1",key,value:"old"})));
 const col=fakeDb.collection(COLLECTION_NAMES.profile_facts),update=col.updateOne.bind(col);
 let release!:()=>void,entered!:()=>void;const blocked=new Promise<void>(r=>release=r),paused=new Promise<void>(r=>entered=r);
 col.updateOne=(async(...args:Parameters<typeof col.updateOne>)=>{if((args[1] as any).$set?.value==="earlier"){entered();await blocked;}return update(...args);}) as typeof col.updateOne;
 const first=decideProfileFact(a,{studentId:"stu-1",factId:facts[0]!.factId,action:"correct",value:"earlier"},{now:new Date("2026-11-01T10:00:01Z")});
 try {
  await paused;
  await decideProfileFact(a,{studentId:"stu-1",factId:facts[1]!.factId,action:"correct",value:"later"},{now:new Date("2026-11-01T10:00:02Z")});
  await assert.rejects(m.readStudentMemorySnapshot(a,"stu-1"),/pending/i);
 } finally {release();await first;}
 assert.equal((await m.readStudentMemorySnapshot(a,"stu-1")).historyAfter,"2026-11-01T10:00:02.000Z");
});

test("S12: overlapping candidate confirmations cannot overwrite a newer explicit correction",async()=>{
 const {a,fakeDb}=setup(); const fact=(await proposeProfileFact(a,{studentId:"stu-1",key:"interest",value:"music"}))!;
 await decideProfileFact(a,{studentId:"stu-1",factId:fact.factId,action:"confirm"});
 const proposed=(await proposeProfileFact(a,{studentId:"stu-1",key:"interest",value:"robotics"}))!;
 assert.ok(proposed.pendingChange);
 const col=fakeDb.collection(COLLECTION_NAMES.profile_facts),update=col.updateOne.bind(col);
 let release!:()=>void,entered!:()=>void;const blocked=new Promise<void>(r=>release=r),paused=new Promise<void>(r=>entered=r);
 col.updateOne=(async(...args:Parameters<typeof col.updateOne>)=>{if((args[1] as any).$set?.value==="robotics"){entered();await blocked;}return update(...args);}) as typeof col.updateOne;
 const decision=decideProfileFact(a,{studentId:"stu-1",factId:fact.factId,action:"confirm",value:"robotics",candidateId:proposed.pendingChange.candidateId,expectedVersion:proposed.pendingChange.version});
 const outcome=decision.then(()=>undefined,e=>e);
 try {await paused;await decideProfileFact(a,{studentId:"stu-1",factId:fact.factId,action:"correct",value:"astronomy"});}
 finally {release();}
 assert.match((await outcome)?.message??"",/ProfileFactChanged/);
 assert.equal((await listProfileFacts(a,{studentId:"stu-1"}))[0]?.value,"astronomy");
});


test("S12: late older extraction cannot overwrite a newer candidate and exact same-candidate confirmations have one winner",async()=>{
 const {a,fakeDb}=setup();const first=(await proposeProfileFact(a,{studentId:"stu-1",key:"interest",value:"music"}))!;
 await decideProfileFact(a,{studentId:"stu-1",factId:first.factId,action:"confirm"});
 const col=fakeDb.collection(COLLECTION_NAMES.profile_facts),update=col.updateOne.bind(col);
 let release!:()=>void,entered!:()=>void;const blocked=new Promise<void>(r=>release=r),paused=new Promise<void>(r=>entered=r);
 col.updateOne=(async(...args:Parameters<typeof col.updateOne>)=>{if((args[1] as any).$set?.pendingChange?.value==="older"){entered();await blocked;}return update(...args);}) as typeof col.updateOne;
 const older=proposeProfileFact(a,{studentId:"stu-1",key:"interest",value:"older"});
 let newest:Awaited<ReturnType<typeof proposeProfileFact>>;
 try {await paused;newest=await proposeProfileFact(a,{studentId:"stu-1",key:"interest",value:"newer"});}finally{release();}
 await older;
 const current=(await listProfileFacts(a,{studentId:"stu-1"}))[0]!;
 assert.equal(current.value,"music");assert.equal(current.pendingChange?.value,"newer");assert.equal(current.pendingChange?.candidateId,newest!.pendingChange?.candidateId);
 const decision={studentId:"stu-1",factId:first.factId,action:"confirm" as const,value:"newer",candidateId:current.pendingChange!.candidateId,expectedVersion:current.pendingChange!.version};
 const results=await Promise.allSettled([decideProfileFact(a,decision),decideProfileFact(a,decision)]);
 assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(results.filter(r=>r.status==="rejected").length,1);
 assert.equal((await listProfileFacts(a,{studentId:"stu-1"}))[0]?.value,"newer");
});

test("S12: candidate decisions are student and tenant owned, aliases use one fact, account fields refuse before persistence",async()=>{
 const {a,b}=setup();const first=(await proposeProfileFact(a,{studentId:"stu-1",key:"targetCountry",value:"Germany"}))!;
 await decideProfileFact(a,{studentId:"stu-1",factId:first.factId,action:"confirm"});
 const next=(await proposeProfileFact(a,{studentId:"stu-1",key:"preferred country",value:"France"}))!;
 assert.equal(first.factId,next.factId);assert.equal(next.key,"target_country");
 await proposeProfileFact(b,{studentId:"stu-1",key:"country",value:"Japan"});
 const decision={studentId:"stu-1",factId:first.factId,action:"confirm" as const,value:"France",candidateId:next.pendingChange!.candidateId,expectedVersion:next.pendingChange!.version};
 await assert.rejects(decideProfileFact(a,{...decision,studentId:"other"}),ProfileFactNotFoundError);
 await assert.rejects(decideProfileFact(b,decision),/ProfileFactChanged/);
 assert.equal((await listProfileFacts(a,{studentId:"stu-1"})).length,1);
 assert.equal((await listProfileFacts(b,{studentId:"stu-1"}))[0]?.value,"Japan");
 for(const key of ["name","studentName","grade","schoolGrade","accountId","email"]) await assert.rejects(proposeProfileFact(a,{studentId:"stu-1",key,value:"synthetic"}),/authoritative account/);
 assert.equal((await listProfileFacts(a,{studentId:"stu-1"})).length,1);
});


test("S12: legacy authoritative chat rows cannot be read or confirmed as editable preferences but may be erased",async()=>{
 const {a,fakeDb}=setup();
 await a.collection(COLLECTION_NAMES.profile_facts).insertOne({_id:"legacy-name",factId:"legacy-name",studentId:"stu-1",key:"studentName",value:"synthetic",source:"chat",status:"proposed",proposedAt:"2026-10-27T00:00:00.000Z"});
 assert.deepEqual(await listProfileFacts(a,{studentId:"stu-1"}),[]);
 await assert.rejects(decideProfileFact(a,{studentId:"stu-1",factId:"legacy-name",action:"confirm"}),/authoritative account/);
 await assert.rejects(decideProfileFact(a,{studentId:"stu-1",factId:"legacy-name",action:"correct",value:"changed"}),/authoritative account/);
 await decideProfileFact(a,{studentId:"stu-1",factId:"legacy-name",action:"erase"});
 assert.equal(fakeDb.collection(COLLECTION_NAMES.profile_facts).all().length,0);
});

test("S13 fixA-5: a discarded proposal for a student with no prior decision keeps short-term context usable (historyAfter is set, history is not cut)", async () => {
  const m = await import("../src/profile-facts.js");
  const threads = await import("../src/chat-threads.js");
  const { a, fakeDb } = setup();
  await createChatThread(a, { studentId: "stu-1", threadId: "th-1", textStored: true });
  await createChatThread(a, { studentId: "stu-1", threadId: "th-2", textStored: true });
  const claim = await claimChatTurn(a, { studentId: "stu-1", threadId: "th-1", turnId: "t1", text: "hello", requestHash: "h", channel: "text" }, { now: new Date("2026-11-01T10:00:00.000Z") });
  assert.equal(claim.kind, "claimed");
  await completeChatTurn(a, { studentId: "stu-1", threadId: "th-1", turnId: "t1", leaseToken: (claim as { leaseToken: string }).leaseToken, channel: "text", assistantText: "hi", response: { state: "ok" } }, { now: new Date("2026-11-01T10:00:01.000Z") });
  assert.equal((await threads.listChatContext(a, { studentId: "stu-1", threadId: "th-1" })).length, 2);
  assert.deepEqual(await m.readStudentMemorySnapshot(a, "stu-1"), { revision: "", historyAfter: null, historyUsable: true });
  // The proposing thread turns no-text after the proposal row is written: the proposal is discarded (no decision was ever made).
  const facts = fakeDb.collection(COLLECTION_NAMES.profile_facts), update = facts.updateOne.bind(facts);
  facts.updateOne = (async (...args: Parameters<typeof facts.updateOne>) => {
    const out = await update(...args); 
    if ((args[1] as any).$setOnInsert?.status === "proposed") await threads.markChatThreadTextNotStored(a, { studentId: "stu-1", threadId: "th-2" });
    return out;
  }) as typeof facts.updateOne;
  assert.equal(await proposeProfileFact(a, { studentId: "stu-1", key: "interest", value: "music", threadId: "th-2" }), null);
  const snapshot = await m.readStudentMemorySnapshot(a, "stu-1");
  assert.notEqual(snapshot.revision, "", "the discard bumped the revision");
  assert.equal(snapshot.historyUsable, true, "fail-closed unusable history would drop a new student's short-term context");
  assert.notEqual(snapshot.historyAfter, null);
  assert.equal((await threads.listChatContext(a, { studentId: "stu-1", threadId: "th-1", after: snapshot.historyAfter! })).length, 2, "earlier delivered turns are still context");
});
