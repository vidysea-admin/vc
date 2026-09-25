/**
 * Offline, connection-free tests for scripts/db-init.ts's index plan
 * (ISS-027). Importing this module must NOT connect to Mongo (contract B8) —
 * db-init.ts guards its `main()` call behind an entrypoint check so importing
 * it just for `INDEX_PLAN` (a plain data array) is side-effect-free.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { INDEX_PLAN } from "../scripts/db-init.js";
import { COLLECTION_NAMES } from "../src/collections.js";
import { FakeCollection, assertSupportedPartialFilter } from "./fakes.js";

// Every collection whose documents carry a `studentId` field (per
// src/collections.ts's *Doc interfaces) — edges/universities/courses do not.
const STUDENT_ID_COLLECTIONS = [
  COLLECTION_NAMES.facts,
  COLLECTION_NAMES.sessions,
  COLLECTION_NAMES.decisions,
  COLLECTION_NAMES.consents,
  COLLECTION_NAMES.students,
  COLLECTION_NAMES.scribe_resolutions,
  // T-011: the audit row holds studentId only while the request is open (unset on completion).
  COLLECTION_NAMES.erasure_requests,
];

test("ISS-027: every studentId-bearing collection has a plain (non-partial, non-unique) index led by studentId", () => {
  for (const name of STUDENT_ID_COLLECTIONS) {
    const plainStudentIdIndex = INDEX_PLAN.find(
      (spec) =>
        spec.collection === name &&
        Object.keys(spec.keys)[0] === "studentId" &&
        !spec.partialFilterExpression,
    );
    assert.ok(
      plainStudentIdIndex,
      `expected a plain {studentId:1}-led index for collection "${name}" in INDEX_PLAN, got: ${JSON.stringify(
        INDEX_PLAN.filter((s) => s.collection === name),
      )}`,
    );
  }
});

test("ISS-027: importing db-init.ts for its index plan does not attempt a Mongo connection", () => {
  // If import ran main() eagerly, this module load would already have thrown
  // (no MONGODB_URL is set in the test environment) before this test file's
  // other assertions could even run. Reaching this line at all is the proof.
  assert.ok(Array.isArray(INDEX_PLAN) && INDEX_PLAN.length > 0);
});

test("ISS-019/ISS-021 (regression): the facts unique-partial and edges from/to indexes are still declared", () => {
  const factsUnique = INDEX_PLAN.find(
    (spec) => spec.collection === COLLECTION_NAMES.facts && spec.unique === true,
  );
  assert.ok(factsUnique, "expected the unique partial index on facts");
  assert.deepEqual(factsUnique?.keys, { studentId: 1, key: 1 });
  // D-013: MongoDB rejects `$exists: false` in a partialFilterExpression, so
  // open facts carry an explicit `active: true` and the index filters on it.
  assert.deepEqual(factsUnique?.partialFilterExpression, { active: true });
  assert.equal(factsUnique?.name, "facts_studentId_key_active_true_unique");

  const edgesFrom = INDEX_PLAN.find((spec) => spec.collection === COLLECTION_NAMES.edges && spec.name === "edges_from");
  const edgesTo = INDEX_PLAN.find((spec) => spec.collection === COLLECTION_NAMES.edges && spec.name === "edges_to");
  assert.ok(edgesFrom);
  assert.ok(edgesTo);
});

// ---------------------------------------------------------------------------
// D-013: the fake must reject every partialFilterExpression the real server
// rejects, so an offline green can never again hide an uncreatable index.
// ---------------------------------------------------------------------------

test("D-013: every partialFilterExpression in INDEX_PLAN passes the server-supported-operator validator", () => {
  const partials = INDEX_PLAN.filter((spec) => spec.partialFilterExpression !== undefined);
  assert.ok(partials.length >= 1, "expected at least one partial index in the plan");
  for (const spec of partials) {
    assert.doesNotThrow(() => assertSupportedPartialFilter(spec.partialFilterExpression!), `${spec.name} must be creatable`);
  }
});

test("D-013: the fake rejects {validTo: {$exists: false}} as a partial filter, like the real server", () => {
  const coll = new FakeCollection<{ _id: string }>();
  assert.throws(
    () => coll.declareUniqueIndex(["studentId", "key"], { partialFilterExpression: { validTo: { $exists: false } } }),
    /not supported in partial index/,
  );
});

test("D-013: the partial-filter validator accepts the documented operators and rejects the rest", () => {
  const ok = [
    { active: true },
    { active: { $eq: true } },
    { a: { $exists: true } },
    { a: { $gt: 1, $lte: 5 } },
    { a: { $type: "string" } },
    { a: { $in: [1, 2] } },
    { $and: [{ a: 1 }, { b: { $exists: true } }] },
    { $or: [{ a: 1 }, { b: 2 }] },
  ];
  for (const f of ok) assert.doesNotThrow(() => assertSupportedPartialFilter(f), JSON.stringify(f));
  const bad = [
    { a: { $exists: false } },
    { a: { $ne: 1 } },
    { a: { $nin: [1] } },
    { a: { $not: { $eq: 1 } } },
    { $nor: [{ a: 1 }] },
    { a: { $regex: "x" } },
    { a: null },
    { $and: [{ a: { $exists: false } }] },
  ];
  for (const f of bad) assert.throws(() => assertSupportedPartialFilter(f), /not supported in partial index/, JSON.stringify(f));
});

// ---------------------------------------------------------------------------
// ISS-t-007-rev-8 / ISS-t-007-c1-2: scribe_resolutions is the atomic,
// cross-process claim for a scribe approval — one claim per thread, enforced
// by a UNIQUE index on threadId (the loser of a concurrent resume gets 11000).
// ---------------------------------------------------------------------------

test("ISS-t-007-rev-8: scribe_resolutions is a named collection with a UNIQUE (non-partial) index on threadId", () => {
  assert.equal(COLLECTION_NAMES.scribe_resolutions, "scribe_resolutions");
  const unique = INDEX_PLAN.find(
    (spec) => spec.collection === COLLECTION_NAMES.scribe_resolutions && spec.unique === true,
  );
  assert.ok(unique, "expected a unique index on scribe_resolutions");
  assert.deepEqual(unique?.keys, { threadId: 1 });
  assert.equal(unique?.partialFilterExpression, undefined, "the claim must be unique for EVERY doc, not a filtered subset");
});

test("ISS-t-007-rev-8: the fake enforces the planned threadId unique index even when _id differs (11000 on a second claim)", async () => {
  const coll = new FakeCollection<{ _id: string; threadId: string }>();
  const spec = INDEX_PLAN.find((s) => s.collection === COLLECTION_NAMES.scribe_resolutions && s.unique)!;
  coll.declareUniqueIndex(Object.keys(spec.keys));
  await coll.insertOne({ _id: "a", threadId: "scribe:s1" });
  await assert.rejects(coll.insertOne({ _id: "b", threadId: "scribe:s1" }), (err: { code?: number }) => err.code === 11000);
  assert.equal(coll.size(), 1);
});

// ---------------------------------------------------------------------------
// ISS-t-007-c1-1: the shared fake's find()/findOne() follow Mongo's
// array-contains-scalar semantics ({purposeTags: "x"} matches ["x", "y"]),
// so a purpose-filtered read never silently returns zero.
// ---------------------------------------------------------------------------

test("ISS-t-007-c1-1: find({purposeTags: scalar}) matches docs whose array CONTAINS it, and only those", async () => {
  type Doc = { _id: string; studentId: string; purposeTags: string[] };
  const coll = new FakeCollection<Doc>();
  coll.seed({ _id: "f1", studentId: "s1", purposeTags: ["profile_synthesis"] });
  coll.seed({ _id: "f2", studentId: "s1", purposeTags: ["application_filling", "profile_synthesis"] });
  coll.seed({ _id: "f3", studentId: "s1", purposeTags: ["application_filling"] });
  coll.seed({ _id: "f4", studentId: "s2", purposeTags: ["profile_synthesis"] });

  const synth = await coll.find({ studentId: "s1", purposeTags: "profile_synthesis" }).toArray();
  assert.deepEqual(synth.map((d) => d._id).sort(), ["f1", "f2"], "the correct purpose must NOT come back empty");
  const app = await coll.find({ studentId: "s1", purposeTags: "application_filling" }).toArray();
  assert.deepEqual(app.map((d) => d._id).sort(), ["f2", "f3"]);
  assert.equal((await coll.find({ purposeTags: "marketing" }).toArray()).length, 0, "no false positives");
  assert.equal((await coll.findOne({ purposeTags: "application_filling", studentId: "s1" }))?._id !== undefined, true);
  // Mongo: an array filter value matches an exactly-equal array (order-sensitive).
  assert.deepEqual(
    (await coll.find({ purposeTags: ["application_filling", "profile_synthesis"] }).toArray()).map((d) => d._id),
    ["f2"],
  );
  assert.equal((await coll.find({ purposeTags: ["profile_synthesis", "application_filling"] }).toArray()).length, 0);
});

test("T-011: the scribe checkpoint collections carry EXACTLY the indexes MongoDBSaver.setup() creates (same keys + names), thread_id-led", () => {
  const cp = INDEX_PLAN.filter((s) => s.collection === COLLECTION_NAMES.scribe_checkpoints);
  const wr = INDEX_PLAN.filter((s) => s.collection === COLLECTION_NAMES.scribe_checkpoint_writes);
  assert.deepEqual(
    cp.map((s) => [s.name, s.keys]),
    [["thread_ns_checkpoint_idx", { thread_id: 1, checkpoint_ns: 1, checkpoint_id: -1 }]],
  );
  assert.deepEqual(
    wr.map((s) => [s.name, s.keys]),
    [["thread_ns_checkpoint_task_idx", { thread_id: 1, checkpoint_ns: 1, checkpoint_id: 1, task_id: 1, idx: 1 }]],
  );
});

test("T-011: the erasure_requests audit log has a status index and no unique index", () => {
  const specs = INDEX_PLAN.filter((s) => s.collection === COLLECTION_NAMES.erasure_requests);
  assert.ok(specs.some((s) => Object.keys(s.keys)[0] === "status"));
  assert.ok(specs.every((s) => !s.unique));
});
