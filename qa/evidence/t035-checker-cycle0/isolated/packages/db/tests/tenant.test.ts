/**
 * T-025 (contract B21, D-021): tenant scoping in packages/db. Every assertion reads the RAW fake
 * collections back (B14: outcome, not construction), so a stamping or filtering bug in
 * src/tenant.ts can not hide behind the wrapper's own reads. Offline (B8), synthetic data (B13).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import {
  TENANT_ID_PATTERN,
  TenantScopeError,
  tenantIdOf,
  tenantScopedDb,
} from "../src/tenant.js";
import {
  confirmErasure,
  executeErasure,
  exportStudent,
  isStudentFenced,
  releaseExpiredErasureFences,
  requestErasure,
  MINIMUM_FENCE_HOLD_MS,
} from "../src/erasure.js";
import { applyApprovedDiff, hasStudentSession, readActiveProfile, readSessionTranscript, recordSessionTranscript } from "../src/facts.js";
import { ConsentRequiredError, requireConsent } from "../src/consent.js";
import { COLLECTION_NAMES } from "../src/collections.js";
import { VC_DB_NAME, tenantScopedClient } from "../src/client.js";
import { INDEX_PLAN } from "../scripts/db-init.js";
import { createFakeDb, createFakeMongoClient, type FakeDb } from "./fakes.js";
import { confirmTwiceAndApprove } from "../src/testing.js";
import type { Fact } from "@vc/schemas";

type AnyDoc = { _id: string } & Record<string, unknown>;

const ALL_COLLECTIONS = [...Object.values(COLLECTION_NAMES), "scribe_checkpoints", "scribe_checkpoint_writes"];
const NOW = "2026-09-25T10:00:00.000Z";

function setup() {
  const { db, fakeDb } = createFakeDb();
  for (const spec of INDEX_PLAN) {
    if (!spec.unique) continue;
    fakeDb
      .collection<{ _id: string }>(spec.collection)
      .declareUniqueIndex(Object.keys(spec.keys), { partialFilterExpression: spec.partialFilterExpression });
  }
  return { db, fakeDb };
}

function raw(fakeDb: FakeDb, name: string): AnyDoc[] {
  return fakeDb.collection<AnyDoc>(name).all();
}

/** Every raw document of every collection, keyed by collection, deep-copied (a snapshot). */
function snapshot(fakeDb: FakeDb, filter: (d: AnyDoc) => boolean = () => true): Record<string, AnyDoc[]> {
  const out: Record<string, AnyDoc[]> = {};
  for (const name of ALL_COLLECTIONS) {
    out[name] = raw(fakeDb, name)
      .filter(filter)
      .map((d) => JSON.parse(JSON.stringify(d)) as AnyDoc)
      .sort((a, b) => a._id.localeCompare(b._id));
  }
  return out;
}

function fact(key: string, value: unknown, turnId: string, purposeTags: string[] = ["profile_synthesis"]): Fact {
  return {
    key,
    value,
    source: { type: "transcript", quote: `quote ${String(value)}`, turnId },
    confidence: 0.9,
    validFrom: "2026-09-25T00:00:00.000Z",
    purposeTags,
    sensitivity: "medium",
  } as Fact;
}

/**
 * Seeds one student in one tenant, THROUGH the scoped Db (the real write paths where they exist:
 * applyApprovedDiff, recordSessionTranscript), across every engine collection.
 */
async function seedTenantStudent(scoped: Db, studentId: string, marker: string) {
  const sessionIds = [`${studentId}-sess-1`, `${studentId}-sess-2`];
  await scoped.collection(COLLECTION_NAMES.students).insertOne({ _id: studentId, studentId, createdAt: NOW });
  for (const sessionId of sessionIds) {
    await scoped.collection(COLLECTION_NAMES.sessions).insertOne({ _id: sessionId, sessionId, studentId, startedAt: NOW, scribeThreadIds: [`scribe:${sessionId}`] });
  }
  await scoped.collection(COLLECTION_NAMES.consents).insertOne({
    _id: `consent-${studentId}`,
    studentId,
    guardianConsent: true,
    purposes: ["profile_synthesis"],
    recordedAt: NOW,
    minor: true,
  });
  await scoped.collection(COLLECTION_NAMES.decisions).insertOne({ _id: `decision-${studentId}`, studentId, rationale: marker, decidedAt: NOW });
  const diff = { studentId, summary: marker, changes: [], citedFactIds: [] };
  await applyApprovedDiff(scoped, diff, { approve: true, edits: [fact("targetCountry", `${marker}-Canada`, "t1"), fact("budget", `${marker}-20L`, "t2")] }, sessionIds[0]);
  await applyApprovedDiff(scoped, diff, { approve: true, edits: [fact("targetCountry", `${marker}-Germany`, "t3")] }, sessionIds[1]);
  for (const sessionId of sessionIds) {
    await recordSessionTranscript(scoped, {
      sessionId,
      studentId,
      turns: [
        { turnId: "t1", speaker: "student", lang: "en", text: `I want Canada ${marker}`, translatedText: `I want Canada ${marker}`, ts: 1 },
        { turnId: "t2", speaker: "counsellor", lang: "en", text: `Noted ${marker}`, translatedText: `Noted ${marker}`, ts: 2 },
      ],
    });
    const threadId = `scribe:${sessionId}`;
    await scoped.collection(COLLECTION_NAMES.scribe_resolutions).insertOne({ _id: threadId, threadId, studentId, responseHash: `h-${marker}`, claimedAt: NOW });
    await scoped.collection("scribe_checkpoints").insertOne({ _id: `${threadId}|c1`, thread_id: threadId, checkpoint_ns: "", checkpoint_id: "c1", checkpoint: marker });
    await scoped.collection("scribe_checkpoint_writes").insertOne({ _id: `${threadId}|c1|w`, thread_id: threadId, checkpoint_ns: "", checkpoint_id: "c1", task_id: "x", idx: 0, value: marker });
  }
  return { studentId, sessionIds };
}

// ---------------------------------------------------------------------------
// Stamping, qualification, stripping
// ---------------------------------------------------------------------------

test("T-025 stamp: an insert through the scope stores tenantId and a tenant-prefixed _id; a read returns the original document", async () => {
  const { db, fakeDb } = setup();
  const a = tenantScopedDb(db, "tenantA");
  await a.collection(COLLECTION_NAMES.sessions).insertOne({ _id: "sess-1", sessionId: "sess-1", studentId: "stu-1" });
  assert.deepEqual(raw(fakeDb, COLLECTION_NAMES.sessions), [{ _id: "tenantA:sess-1", sessionId: "sess-1", studentId: "stu-1", tenantId: "tenantA" }]);
  assert.deepEqual(await a.collection(COLLECTION_NAMES.sessions).findOne({ _id: "sess-1" }), { _id: "sess-1", sessionId: "sess-1", studentId: "stu-1" });
  assert.deepEqual(await a.collection(COLLECTION_NAMES.sessions).find({ studentId: "stu-1" }).toArray(), [
    { _id: "sess-1", sessionId: "sess-1", studentId: "stu-1" },
  ]);
});

test("T-025 stamp: an upsert through the scope stamps tenantId from the filter, qualifies $setOnInsert._id, and reports the unqualified upsertedId", async () => {
  const { db, fakeDb } = setup();
  const a = tenantScopedDb(db, "tenantA");
  const res = await a
    .collection(COLLECTION_NAMES.erasure_fences)
    .updateOne({ _id: "key-1" }, { $set: { requestId: "r1" }, $setOnInsert: { _id: "key-1", studentKey: "key-1" } }, { upsert: true });
  assert.equal(res.upsertedId, "key-1");
  assert.deepEqual(raw(fakeDb, COLLECTION_NAMES.erasure_fences), [{ _id: "tenantA:key-1", tenantId: "tenantA", studentKey: "key-1", requestId: "r1" }]);
});

test("T-025 isolation: the same _id in two tenants coexists (no 11000 across tenants), and each tenant reads, counts and deletes only its own", async () => {
  const { db, fakeDb } = setup();
  const a = tenantScopedDb(db, "tenantA");
  const b = tenantScopedDb(db, "tenantB");
  await a.collection(COLLECTION_NAMES.sessions).insertOne({ _id: "sess-1", studentId: "stu-1", who: "A" });
  await b.collection(COLLECTION_NAMES.sessions).insertOne({ _id: "sess-1", studentId: "stu-1", who: "B" });
  assert.equal(raw(fakeDb, COLLECTION_NAMES.sessions).length, 2);
  assert.equal((await a.collection(COLLECTION_NAMES.sessions).findOne({ _id: "sess-1" }))?.who, "A");
  assert.equal((await b.collection(COLLECTION_NAMES.sessions).findOne({ _id: "sess-1" }))?.who, "B");
  assert.equal(await a.collection(COLLECTION_NAMES.sessions).countDocuments({ studentId: "stu-1" }), 1);
  const del = await a.collection(COLLECTION_NAMES.sessions).deleteMany({ $or: [{ _id: { $in: ["sess-1"] } }, { sessionId: "sess-1" }] });
  assert.equal(del.deletedCount, 1);
  assert.deepEqual(raw(fakeDb, COLLECTION_NAMES.sessions).map((d) => d.who), ["B"]);
});

test("T-025 isolation: findOneAndUpdate and bulkWrite are tenant-filtered and never touch the other tenant's documents", async () => {
  const { db, fakeDb } = setup();
  const a = tenantScopedDb(db, "tenantA");
  const b = tenantScopedDb(db, "tenantB");
  await b.collection(COLLECTION_NAMES.scribe_resolutions).insertOne({ _id: "scribe:s1", threadId: "scribe:s1", studentId: "stu-1" });
  assert.equal(await a.collection(COLLECTION_NAMES.scribe_resolutions).findOneAndUpdate({ _id: "scribe:s1" }, { $set: { lease: "x" } }), null);
  await a.collection("scribe_checkpoint_writes").bulkWrite([
    { updateOne: { filter: { thread_id: "scribe:s1", idx: 0 }, update: { $setOnInsert: { value: "A" } }, upsert: true } },
  ]);
  const writes = raw(fakeDb, "scribe_checkpoint_writes");
  assert.equal(writes.length, 1);
  assert.equal(writes[0]!.tenantId, "tenantA");
  assert.equal(raw(fakeDb, COLLECTION_NAMES.scribe_resolutions)[0]!.lease, undefined, "B's claim untouched");
});

test("T-025 cursor: sort, limit and async iteration go through the scope and strip every document", async () => {
  const { db } = setup();
  const a = tenantScopedDb(db, "tenantA");
  for (const id of ["c", "a", "b"]) await a.collection("scribe_checkpoints").insertOne({ _id: id, thread_id: "t", checkpoint_id: id });
  const sorted = await a.collection("scribe_checkpoints").find({ thread_id: "t" }).sort("checkpoint_id", -1).limit(2).toArray();
  assert.deepEqual(sorted.map((d) => d._id), ["c", "b"]);
  const seen: unknown[] = [];
  for await (const d of a.collection("scribe_checkpoints").find({})) seen.push(d);
  assert.equal(seen.length, 3);
  for (const d of seen) assert.equal((d as Record<string, unknown>).tenantId, undefined);
});

// ---------------------------------------------------------------------------
// Refusals (fail closed)
// ---------------------------------------------------------------------------

test("T-025 refusal: a filter, update or insert that names another tenant, or could escape the scope, throws TenantScopeError and writes nothing", async () => {
  const { db, fakeDb } = setup();
  const a = tenantScopedDb(db, "tenantA");
  const c = a.collection(COLLECTION_NAMES.facts);
  const bad: Array<[string, () => Promise<unknown>]> = [
    ["filter with another tenantId", () => c.findOne({ tenantId: "tenantB" })],
    ["operator on tenantId", () => c.findOne({ tenantId: { $ne: "tenantA" } })],
    ["$where", () => c.findOne({ $where: "true" } as never)],
    ["$expr", () => c.findOne({ $expr: { $eq: [1, 1] } } as never)],
    ["$nor", () => c.findOne({ $nor: [{ studentId: "x" }] } as never)],
    ["_id $ne", () => c.findOne({ _id: { $ne: "x" } } as never)],
    ["_id $regex", () => c.findOne({ _id: { $regex: "^" } } as never)],
    ["dotted _id path", () => c.findOne({ "_id.x": 1 } as never)],
    ["$set tenantId", () => c.updateOne({ studentId: "s" }, { $set: { tenantId: "tenantB" } }, { upsert: true })],
    ["$unset tenantId", () => c.updateOne({ studentId: "s" }, { $unset: { tenantId: "" } })],
    ["$rename", () => c.updateOne({ studentId: "s" }, { $rename: { a: "tenantId" } } as never)],
    ["$set _id", () => c.updateOne({ studentId: "s" }, { $set: { _id: "y" } } as never, { upsert: true })],
    ["replacement doc", () => c.updateOne({ studentId: "s" }, { studentId: "s" } as never, { upsert: true })],
    ["pipeline update", () => c.updateOne({ studentId: "s" }, [{ $set: { a: 1 } }] as never, { upsert: true })],
    ["insert of another tenant's doc", () => c.insertOne({ _id: "x", tenantId: "tenantB" } as never)],
    ["bulkWrite replaceOne", () => c.bulkWrite([{ replaceOne: { filter: {}, replacement: {} } }] as never)],
    ["findOneAndUpdate includeResultMetadata", () => c.findOneAndUpdate({ studentId: "s" }, { $set: { a: 1 } }, { includeResultMetadata: true } as never)],
  ];
  for (const [label, run] of bad) {
    await assert.rejects(run(), TenantScopeError, label);
  }
  assert.equal(raw(fakeDb, COLLECTION_NAMES.facts).length, 0, "nothing was written");
});

test("T-025 refusal: collection and Db members the scope does not understand throw instead of being forwarded unscoped", () => {
  const { db } = setup();
  const a = tenantScopedDb(db, "tenantA");
  const c = a.collection(COLLECTION_NAMES.facts) as unknown as Record<string, unknown>;
  for (const name of ["insertMany", "updateMany", "replaceOne", "deleteOne", "findOneAndDelete", "findOneAndReplace", "aggregate", "distinct", "drop", "createIndex", "watch", "estimatedDocumentCount"]) {
    assert.throws(() => c[name], TenantScopeError, name);
  }
  const d = a as unknown as Record<string, unknown>;
  for (const name of ["admin", "dropDatabase", "createCollection", "dropCollection", "command", "aggregate", "listCollections"]) {
    assert.throws(() => d[name], TenantScopeError, name);
  }
  assert.throws(() => {
    (a as unknown as Record<string, unknown>).collection = () => null;
  }, TenantScopeError);
});

test("T-025 refusal: malformed tenant ids are refused; re-scoping to the same tenant is a no-op, to another tenant throws", () => {
  const { db } = setup();
  for (const bad of ["", "a:b", "a.b", "$a", "-a", "a b", "x".repeat(65), 7 as unknown as string]) {
    assert.throws(() => tenantScopedDb(db, bad), TenantScopeError, String(bad));
  }
  assert.ok(TENANT_ID_PATTERN.test("tenant_A-1"));
  const a = tenantScopedDb(db, "tenantA");
  assert.equal(tenantIdOf(a), "tenantA");
  assert.equal(tenantIdOf(db), undefined);
  assert.equal(tenantScopedDb(a, "tenantA"), a);
  assert.throws(() => tenantScopedDb(a, "tenantB"), TenantScopeError);
});

test("T-025 client facade: hands out the tenant-scoped virtual_counsellor Db only; other database names and client members are refused", async () => {
  const fake = createFakeMongoClient();
  const client = tenantScopedClient(fake.client, "tenantA");
  const facadeDb = (client as unknown as { db(name?: string): Db }).db(VC_DB_NAME);
  assert.equal(tenantIdOf(facadeDb), "tenantA");
  await facadeDb.collection(COLLECTION_NAMES.sessions).insertOne({ _id: "s", studentId: "x" });
  assert.equal(fake.dbFor(VC_DB_NAME).collection<AnyDoc>(COLLECTION_NAMES.sessions).all()[0]!.tenantId, "tenantA");
  assert.throws(() => (client as unknown as { db(name?: string): Db }).db("pathlynks"), /refusing database "pathlynks"/);
  for (const name of ["connect", "close", "startSession", "watch"]) {
    assert.throws(() => (client as unknown as Record<string, unknown>)[name], TenantScopeError, name);
  }
  assert.doesNotThrow(() => (client.appendMetadata as (m: unknown) => void)({ name: "x" }));
});

// ---------------------------------------------------------------------------
// Legacy (pre-tenancy) documents: refuse, never auto-adopt
// ---------------------------------------------------------------------------

test("T-025 legacy rule: documents without tenantId are invisible to a tenant, and are never adopted, changed or deleted through a scope", async () => {
  const { db, fakeDb } = setup();
  fakeDb.collection<AnyDoc>(COLLECTION_NAMES.consents).seed({ _id: "consent-stu-1", studentId: "stu-1", purposes: ["profile_synthesis"], guardianConsent: true, minor: false, recordedAt: NOW });
  fakeDb.collection<AnyDoc>(COLLECTION_NAMES.sessions).seed({ _id: "sess-1", sessionId: "sess-1", studentId: "stu-1" });
  fakeDb.collection<AnyDoc>(COLLECTION_NAMES.facts).seed({ _id: "f1", studentId: "stu-1", key: "k", active: true, purposeTags: ["profile_synthesis"] });
  const before = snapshot(fakeDb);
  const a = tenantScopedDb(db, "tenantA");
  await assert.rejects(requireConsent(a, "stu-1", "profile_synthesis"), ConsentRequiredError);
  assert.equal(await hasStudentSession(a, { studentId: "stu-1", sessionId: "sess-1" }), false);
  const exp = await exportStudent(a, "stu-1");
  assert.deepEqual([exp.facts.length, exp.sessions.length, exp.consents.length], [0, 0, 0]);
  // A tenant upsert on the legacy _id creates the tenant's own row; the legacy row is untouched.
  await a.collection(COLLECTION_NAMES.sessions).updateOne({ _id: "sess-1", studentId: "stu-1" }, { $addToSet: { scribeThreadIds: "scribe:sess-1" } }, { upsert: true });
  await a.collection(COLLECTION_NAMES.facts).deleteMany({ studentId: "stu-1" });
  const after = snapshot(fakeDb, (d) => d.tenantId === undefined);
  assert.deepEqual(after, before, "every legacy document is byte-for-byte unchanged");
  assert.equal(raw(fakeDb, COLLECTION_NAMES.sessions).filter((d) => d.tenantId === "tenantA").length, 1);
});

// ---------------------------------------------------------------------------
// Engine functions through the scope: erasure, export, transcripts, profile
// ---------------------------------------------------------------------------

test("T-025 cross-tenant: tenant A erasing student stu-1 deletes only A's documents; tenant B's same-id student is byte-for-byte unchanged and not fenced", async () => {
  const { db, fakeDb } = setup();
  const a = tenantScopedDb(db, "tenantA");
  const b = tenantScopedDb(db, "tenantB");
  await seedTenantStudent(a, "stu-1", "MARK-A");
  await seedTenantStudent(b, "stu-1", "MARK-B");
  const bBefore = snapshot(fakeDb, (d) => d.tenantId === "tenantB");
  assert.ok(Object.values(bBefore).flat().length > 10, "sanity: B is seeded across collections");

  const { requestId } = await requestErasure(a, { studentId: "stu-1", requestedBy: "counsellor-1", reason: "student_request" });
  await confirmTwiceAndApprove(a, { requestId, confirmedBy: "admin-1" });
  assert.equal(await isStudentFenced(a, "stu-1"), true);
  assert.equal(await isStudentFenced(b, "stu-1"), false, "A's fence never blocks B");
  const outcome = await executeErasure(a, requestId, { fenceGraceMs: 0 });
  assert.equal(outcome.status, "completed");

  // Raw read-back: nothing of A's student remains except the audit row, the fence and (T-029) the
  // approver's outbox record, none of which holds the clear studentId.
  for (const name of [COLLECTION_NAMES.erasure_requests, COLLECTION_NAMES.erasure_fences, COLLECTION_NAMES.email_outbox]) {
    for (const d of raw(fakeDb, name).filter((x) => x.tenantId === "tenantA")) {
      assert.ok(!JSON.stringify(d).includes("stu-1") && !JSON.stringify(d).includes("MARK-A"), `${name}: no student data`);
    }
  }
  for (const name of ALL_COLLECTIONS) {
    if (name === COLLECTION_NAMES.erasure_requests || name === COLLECTION_NAMES.erasure_fences || name === COLLECTION_NAMES.email_outbox) continue;
    const left = raw(fakeDb, name).filter((d) => d.tenantId === "tenantA");
    assert.deepEqual(left, [], `${name}: A's documents are gone`);
  }
  assert.deepEqual(snapshot(fakeDb, (d) => d.tenantId === "tenantB"), bBefore, "B unchanged");
  // Every raw document written in this test carries a tenantId.
  for (const name of ALL_COLLECTIONS) for (const d of raw(fakeDb, name)) assert.ok(typeof d.tenantId === "string", `${name}/${d._id}`);
  const bExport = await exportStudent(b, "stu-1");
  assert.equal(bExport.sessions.length, 2);
  assert.ok(JSON.stringify(bExport).includes("MARK-B"));
  assert.ok(!JSON.stringify(bExport).includes("MARK-A"), "B's export never contains A's data");
  assert.ok(!JSON.stringify(bExport).includes("tenant"), "no tenantId or prefix leaks into a scoped read");
});

test("T-025 cross-tenant: export, transcript, session and profile reads of a student that exists only in B are, from A, identical to a never-existing student", async () => {
  const { db } = setup();
  const a = tenantScopedDb(db, "tenantA");
  const b = tenantScopedDb(db, "tenantB");
  await seedTenantStudent(b, "stu-B", "MARK-B");
  const norm = (e: Awaited<ReturnType<typeof exportStudent>>) => JSON.stringify({ ...e, exportedAt: "X", studentId: "X" });
  assert.equal(norm(await exportStudent(a, "stu-B")), norm(await exportStudent(a, "stu-never")));
  assert.deepEqual(await readSessionTranscript(a, { studentId: "stu-B", sessionId: "stu-B-sess-1" }), []);
  assert.equal(await hasStudentSession(a, { studentId: "stu-B", sessionId: "stu-B-sess-1" }), false);
  assert.equal(await hasStudentSession(b, { studentId: "stu-B", sessionId: "stu-B-sess-1" }), true);
  await assert.rejects(readActiveProfile(a, "stu-B", "profile_synthesis"), ConsentRequiredError);
  await assert.rejects(readActiveProfile(a, "stu-never", "profile_synthesis"), ConsentRequiredError);
});

test("T-025 profile: readActiveProfile returns only open facts carrying the purpose, sorted by key, after the consent gate", async () => {
  const { db } = setup();
  const a = tenantScopedDb(db, "tenantA");
  await seedTenantStudent(a, "stu-1", "MARK-A");
  const facts = await readActiveProfile(a, "stu-1", "profile_synthesis");
  assert.deepEqual(facts.map((f) => [f.key, f.value]), [["budget", "MARK-A-20L"], ["targetCountry", "MARK-A-Germany"]]);
  for (const f of facts) assert.equal((f as unknown as Record<string, unknown>).tenantId, undefined);
  // The consent covers profile_synthesis only: another purpose is refused.
  await assert.rejects(readActiveProfile(a, "stu-1", "application_filling"), ConsentRequiredError);
});

test("T-025 per-tenant uniqueness: one open erasure request per student PER TENANT (the same student id in B can open its own)", async () => {
  const { db } = setup();
  const a = tenantScopedDb(db, "tenantA");
  const b = tenantScopedDb(db, "tenantB");
  await requestErasure(a, { studentId: "stu-1", requestedBy: "c-1", reason: "student_request" });
  await assert.rejects(requestErasure(a, { studentId: "stu-1", requestedBy: "c-1", reason: "student_request" }), { name: "ErasureRequestAlreadyOpenError" });
  const other = await requestErasure(b, { studentId: "stu-1", requestedBy: "c-9", reason: "student_request" });
  assert.match(other.requestId, /^[0-9a-f]{24}$/, "B's request id is unqualified to its caller");
  await assert.rejects(confirmErasure(a, { requestId: other.requestId, confirmedBy: "admin-1" }), { name: "ErasureRequestNotFoundError" });
});

// ---------------------------------------------------------------------------
// The fence sweep, per tenant
// ---------------------------------------------------------------------------

async function completedTenantErasure(db: Db, fakeDb: FakeDb, tenant: string, studentId: string) {
  const scoped = tenantScopedDb(db, tenant);
  const { requestId } = await requestErasure(scoped, { studentId, requestedBy: "c-1", reason: "student_request" });
  await confirmTwiceAndApprove(scoped, { requestId, confirmedBy: "admin-1" });
  await executeErasure(scoped, requestId, { fenceGraceMs: 0 });
  const fence = raw(fakeDb, COLLECTION_NAMES.erasure_fences).find((f) => f.tenantId === tenant && f.requestId === requestId)!;
  assert.ok(fence, "sanity: the completed erasure left its fence (inside the minimum hold)");
  return { scoped, requestId, fence };
}

test("T-025 sweep: the system (unscoped) sweep releases a tenant's expired fence, both with releaseAfter stamped and with it missing (crash after the completion CAS)", async () => {
  const { db, fakeDb } = setup();
  const one = await completedTenantErasure(db, fakeDb, "tenantA", "stu-1");
  assert.ok(one.fence.releaseAfter, "stamped by executeErasure");
  // The second fence lost its releaseAfter (the crash case): the sweep must read the tenant's
  // request row by its tenant-prefixed _id to learn it completed.
  const two = await completedTenantErasure(db, fakeDb, "tenantB", "stu-2");
  delete fakeDb.collection<AnyDoc>(COLLECTION_NAMES.erasure_fences).all().find((f) => f._id === two.fence._id)!.releaseAfter;
  const holdEnds = [one, two].map((x) => Date.parse(String(x.fence.createdAt)) + MINIMUM_FENCE_HOLD_MS);
  assert.equal(await releaseExpiredErasureFences(db, new Date(Math.min(...holdEnds) - 1), 0), 0, "never inside the hold");
  assert.equal(await releaseExpiredErasureFences(db, new Date(Math.max(...holdEnds) + 60_000), 0), 2);
  assert.deepEqual(raw(fakeDb, COLLECTION_NAMES.erasure_fences), []);
  assert.equal(await isStudentFenced(two.scoped, "stu-2"), false);
});

test("T-025 sweep: another tenant's OPEN request for the same student id never holds this tenant's fence; a tenant-scoped sweep touches only its own tenant", async () => {
  const { db, fakeDb } = setup();
  const done = await completedTenantErasure(db, fakeDb, "tenantA", "stu-1");
  const b = tenantScopedDb(db, "tenantB");
  const { requestId } = await requestErasure(b, { studentId: "stu-1", requestedBy: "c-1", reason: "student_request" });
  await confirmErasure(b, { requestId, confirmedBy: "admin-1" });
  const later = new Date(Date.parse(String(done.fence.createdAt)) + MINIMUM_FENCE_HOLD_MS + 60_000);
  assert.equal(await releaseExpiredErasureFences(b, later), 0, "B's own fence is held by B's confirmed request");
  assert.equal(await releaseExpiredErasureFences(done.scoped, later), 1, "A's fence is released despite B's open request");
  assert.equal(await isStudentFenced(done.scoped, "stu-1", later), false);
  assert.equal(await isStudentFenced(b, "stu-1", later), true);
});

test("T-025 sweep: pre-tenancy (unstamped) fences are still swept by the system sweep, and only against unstamped requests", async () => {
  const { db, fakeDb } = setup();
  const created = "2026-09-25T00:00:00.000Z";
  fakeDb.collection<AnyDoc>(COLLECTION_NAMES.erasure_fences).seed({ _id: "legacy-key", studentKey: "legacy-key", requestId: "r-legacy", createdAt: created, releaseAfter: created });
  // A TENANT's open request with the same studentKey must not hold the legacy fence.
  fakeDb.collection<AnyDoc>(COLLECTION_NAMES.erasure_requests).seed({ _id: "tenantA:r-x", tenantId: "tenantA", studentKey: "legacy-key", status: "confirmed" });
  assert.equal(await releaseExpiredErasureFences(db, new Date(Date.parse(created) + MINIMUM_FENCE_HOLD_MS + 1)), 1);
  assert.deepEqual(raw(fakeDb, COLLECTION_NAMES.erasure_fences), []);
});
