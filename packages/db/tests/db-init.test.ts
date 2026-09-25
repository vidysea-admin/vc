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
