import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyApprovedDiff,
  proposeFactChanges,
  deriveFactId,
  FactConflictError,
  PartialApplyError,
} from "../src/facts.js";
import { COLLECTION_NAMES } from "../src/collections.js";
import { createFakeDb } from "./fakes.js";
import type { FactDoc } from "../src/collections.js";
import type { Fact, ProfileDiff, CounsellorDecision } from "@vc/schemas";

function citedFact(overrides: Partial<Fact> = {}): Fact {
  return {
    key: "targetCountry",
    value: "Canada",
    source: { type: "transcript", quote: "I want to study in Canada", turnId: "42" },
    confidence: 0.8,
    validFrom: "2026-09-25T00:00:00.000Z",
    purposeTags: ["counselling"],
    sensitivity: "low",
    ...overrides,
  };
}

function emptyDiff(overrides: Partial<ProfileDiff> = {}): ProfileDiff {
  return {
    studentId: "student-1",
    summary: "session summary",
    changes: [],
    citedFactIds: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// proposeFactChanges writes nothing
// ---------------------------------------------------------------------------

test("proposeFactChanges never touches the facts collection (it only returns a ProfileDiff)", () => {
  const { fakeDb } = createFakeDb();
  const diff = proposeFactChanges({
    studentId: "student-1",
    summary: "session summary",
    existingFacts: [],
    candidateFacts: [citedFact()],
  });
  assert.equal(diff.studentId, "student-1");
  assert.equal(diff.changes.length, 1);
  assert.equal(diff.changes[0]?.op, "add");
  assert.equal(fakeDb.collection<FactDoc>(COLLECTION_NAMES.facts).size(), 0);
});

test("proposeFactChanges emits an 'update' op when a candidate changes an existing active fact's value", () => {
  const existing: FactDoc = { ...citedFact(), _id: "student-1:targetCountry:v1", studentId: "student-1" };
  const diff = proposeFactChanges({
    studentId: "student-1",
    summary: "session summary",
    existingFacts: [existing],
    candidateFacts: [citedFact({ value: "United Kingdom" })],
  });
  assert.equal(diff.changes.length, 1);
  assert.equal(diff.changes[0]?.op, "update");
  assert.equal(diff.changes[0]?.before, "Canada");
  assert.equal(diff.changes[0]?.after, "United Kingdom");
});

test("proposeFactChanges emits no change when the candidate value matches the existing active fact", () => {
  const existing: FactDoc = { ...citedFact(), _id: "student-1:targetCountry:v1", studentId: "student-1" };
  const diff = proposeFactChanges({
    studentId: "student-1",
    summary: "session summary",
    existingFacts: [existing],
    candidateFacts: [citedFact()],
  });
  assert.equal(diff.changes.length, 0);
});

test("proposeFactChanges rejects an uncited candidate fact (Zod, no source)", () => {
  const { source, ...uncited } = citedFact();
  assert.throws(() =>
    proposeFactChanges({
      studentId: "student-1",
      summary: "s",
      existingFacts: [],
      candidateFacts: [uncited as unknown as Fact],
    }),
  );
});

// ---------------------------------------------------------------------------
// applyApprovedDiff: B3 (no write without approve:true)
// ---------------------------------------------------------------------------

test("B3: applyApprovedDiff writes zero facts and zero edges when approve is false", async () => {
  const { db, fakeDb } = createFakeDb();
  const decision: CounsellorDecision = { approve: false, edits: [citedFact()] };
  const result = await applyApprovedDiff(db, emptyDiff(), decision);
  assert.equal(result.written.length, 0);
  assert.equal(fakeDb.collection<FactDoc>(COLLECTION_NAMES.facts).size(), 0);
  assert.equal(fakeDb.collection(COLLECTION_NAMES.edges).size(), 0);
});

test("B3: applyApprovedDiff writes zero facts when approve is true but edits is omitted", async () => {
  const { db, fakeDb } = createFakeDb();
  const result = await applyApprovedDiff(db, emptyDiff(), { approve: true });
  assert.equal(result.written.length, 0);
  assert.equal(fakeDb.collection<FactDoc>(COLLECTION_NAMES.facts).size(), 0);
});

test("applyApprovedDiff writes facts + edges (fact->source sourced_from, student->fact has) when approve is true", async () => {
  const { db, fakeDb } = createFakeDb();
  const decision: CounsellorDecision = { approve: true, edits: [citedFact()] };
  const result = await applyApprovedDiff(db, emptyDiff(), decision, "session-1");

  assert.equal(result.written.length, 1);
  assert.equal(fakeDb.collection<FactDoc>(COLLECTION_NAMES.facts).size(), 1);

  const edges = fakeDb.collection(COLLECTION_NAMES.edges).all() as Array<{
    from: { kind: string; id: string };
    to: { kind: string; id: string };
    rel: string;
  }>;
  assert.equal(edges.length, 2);
  const sourcedFrom = edges.find((e) => e.rel === "sourced_from");
  const has = edges.find((e) => e.rel === "has");
  assert.ok(sourcedFrom, "expected a fact->session sourced_from edge");
  assert.equal(sourcedFrom?.from.kind, "fact");
  assert.equal(sourcedFrom?.to.kind, "session");
  assert.equal(sourcedFrom?.to.id, "session-1");
  assert.ok(has, "expected a student->fact has edge");
  assert.equal(has?.from.kind, "student");
  assert.equal(has?.from.id, "student-1");
  assert.equal(has?.to.kind, "fact");
});

test("applyApprovedDiff falls back to a source-derived edge when no sessionId is given", async () => {
  const { db, fakeDb } = createFakeDb();
  const decision: CounsellorDecision = { approve: true, edits: [citedFact()] };
  await applyApprovedDiff(db, emptyDiff(), decision);
  const edges = fakeDb.collection(COLLECTION_NAMES.edges).all() as Array<{
    to: { kind: string; id: string };
    rel: string;
  }>;
  const sourcedFrom = edges.find((e) => e.rel === "sourced_from");
  assert.ok(sourcedFrom);
  assert.equal(sourcedFrom?.to.kind, "transcript_turn");
  assert.equal(sourcedFrom?.to.id, "42");
});

test("supersede-not-delete: approving a changed value closes the old fact via validTo instead of removing it", async () => {
  const { db, fakeDb } = createFakeDb();
  const factsColl = fakeDb.collection<FactDoc>(COLLECTION_NAMES.facts);
  // ISS-026: declared so this test exercises the same unique partial index
  // scripts/db-init.ts actually creates — without it, the insert-before-retire
  // bug (ISS-026) was invisible to this test.
  factsColl.declareUniqueIndex(["studentId", "key"], { partialFilterExpression: { validTo: { $exists: false } } });
  const existing: FactDoc = { ...citedFact(), _id: "student-1:targetCountry:v1", studentId: "student-1" };
  factsColl.seed(existing);

  const decision: CounsellorDecision = {
    approve: true,
    edits: [citedFact({ value: "United Kingdom" })],
  };
  const result = await applyApprovedDiff(db, emptyDiff(), decision);

  assert.equal(result.supersededKeys.length, 1);
  assert.equal(result.supersededKeys[0], "targetCountry");
  assert.equal(factsColl.size(), 2, "the old fact must still exist, superseded, not deleted");
  const stillThere = await factsColl.findOne({ _id: "student-1:targetCountry:v1" });
  assert.ok(stillThere, "the superseded fact document must not be deleted");
  assert.ok(stillThere?.validTo, "the superseded fact must have validTo set");
});

test("Zod rejects an uncited fact on write: applyApprovedDiff rejects a decision.edits fact with no source", async () => {
  const { db } = createFakeDb();
  const { source, ...uncited } = citedFact();
  const decision = { approve: true, edits: [uncited] } as unknown as CounsellorDecision;
  await assert.rejects(() => applyApprovedDiff(db, emptyDiff(), decision));
});

// ---------------------------------------------------------------------------
// ISS-020: deterministic fact _id -> replaying the same approved diff is idempotent
// ---------------------------------------------------------------------------

test("ISS-020: applyApprovedDiff twice with the same inputs is idempotent (one open fact, no duplicate edges)", async () => {
  const { db, fakeDb } = createFakeDb();
  const decision: CounsellorDecision = { approve: true, edits: [citedFact()] };
  const diff = emptyDiff();

  const first = await applyApprovedDiff(db, diff, decision, "session-1");
  const second = await applyApprovedDiff(db, diff, decision, "session-1");

  assert.equal(first.written[0]?._id, second.written[0]?._id, "replay must resolve to the same deterministic _id");
  assert.equal(second.supersededKeys.length, 0, "replay must not treat its own fact as something it superseded");

  const factsColl = fakeDb.collection<FactDoc>(COLLECTION_NAMES.facts);
  const openFacts = factsColl.all().filter((f) => f.validTo === undefined);
  assert.equal(openFacts.length, 1, "replay must not create a second open fact");

  const edgesColl = fakeDb.collection(COLLECTION_NAMES.edges);
  assert.equal(edgesColl.size(), 2, "replay must not create duplicate edges (has + sourced_from)");
});

test("ISS-020: deriveFactId is deterministic for identical inputs and differs when the value differs", () => {
  const a = deriveFactId("student-1", "targetCountry", "Canada", "session-1");
  const b = deriveFactId("student-1", "targetCountry", "Canada", "session-1");
  const c = deriveFactId("student-1", "targetCountry", "United Kingdom", "session-1");
  assert.equal(a, b);
  assert.notEqual(a, c);
});

// ---------------------------------------------------------------------------
// ISS-019: unique partial index -> concurrent writers never leave two open facts
// ---------------------------------------------------------------------------

test("ISS-019: interleaving two applyApprovedDiff calls for the same (studentId,key) leaves at most one open fact", async () => {
  const { db, fakeDb } = createFakeDb();
  const factsColl = fakeDb.collection<FactDoc>(COLLECTION_NAMES.facts);
  // Mirrors scripts/db-init.ts's facts_studentId_key_active_unique index.
  factsColl.declareUniqueIndex(["studentId", "key"], { partialFilterExpression: { validTo: { $exists: false } } });

  const decisionA: CounsellorDecision = { approve: true, edits: [citedFact({ value: "Canada" })] };
  const decisionB: CounsellorDecision = { approve: true, edits: [citedFact({ value: "United Kingdom" })] };

  const results = await Promise.allSettled([
    applyApprovedDiff(db, emptyDiff(), decisionA, "session-A"),
    applyApprovedDiff(db, emptyDiff(), decisionB, "session-B"),
  ]);

  const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  // A genuine race must never silently write two open facts: the loser (if
  // any) surfaces a typed FactConflictError instead.
  for (const r of rejected) {
    assert.ok(r.reason instanceof FactConflictError, `expected FactConflictError, got ${String(r.reason)}`);
  }

  const openFacts = factsColl.all().filter((f) => f.validTo === undefined && f.key === "targetCountry");
  assert.ok(openFacts.length <= 1, `expected at most one open fact after the race, got ${openFacts.length}`);
});

// ---------------------------------------------------------------------------
// ISS-021: deep-equal value comparison + schema-drift handling in proposeFactChanges
// ---------------------------------------------------------------------------

test("ISS-021: proposeFactChanges treats structurally-equal object/array values as unchanged (deep-equal, not reference-equal)", () => {
  const existing: FactDoc = {
    ...citedFact({ value: { country: "Canada", cities: ["Toronto", "Vancouver"] } }),
    _id: "student-1:targetCountry:v1",
    studentId: "student-1",
  };
  const diff = proposeFactChanges({
    studentId: "student-1",
    summary: "s",
    existingFacts: [existing],
    // A different object instance, different key order, same content — must
    // NOT be treated as a change.
    candidateFacts: [citedFact({ value: { cities: ["Toronto", "Vancouver"], country: "Canada" } })],
  });
  assert.equal(diff.changes.length, 0);
});

test("ISS-021: proposeFactChanges DOES flag an object/array value whose content actually differs", () => {
  const existing: FactDoc = {
    ...citedFact({ value: { country: "Canada", cities: ["Toronto"] } }),
    _id: "student-1:targetCountry:v1",
    studentId: "student-1",
  };
  const diff = proposeFactChanges({
    studentId: "student-1",
    summary: "s",
    existingFacts: [existing],
    candidateFacts: [citedFact({ value: { country: "Canada", cities: ["Toronto", "Vancouver"] } })],
  });
  assert.equal(diff.changes.length, 1);
  assert.equal(diff.changes[0]?.op, "update");
});

test("ISS-021: proposeFactChanges skips a schema-drifted stored fact instead of throwing, and reports it", () => {
  const drifted = {
    _id: "student-1:targetCountry:v1",
    studentId: "student-1",
    key: "targetCountry",
    value: "Canada",
    // missing `source` (required by FactSchema, B2) — simulates a legacy
    // document that no longer matches the current schema.
    confidence: 0.8,
    validFrom: "2026-09-25T00:00:00.000Z",
    purposeTags: ["counselling"],
    sensitivity: "low",
  } as unknown as FactDoc;

  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  let diff: ProfileDiff;
  try {
    diff = proposeFactChanges({
      studentId: "student-1",
      summary: "s",
      existingFacts: [drifted],
      candidateFacts: [citedFact()], // same key; would be "add" since the drifted doc must be skipped
    });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(diff.changes.length, 1);
  assert.equal(diff.changes[0]?.op, "add", "the drifted doc must be skipped, not treated as an active fact");
  assert.ok(warnings.length >= 1, "a schema-drifted stored fact must be reported");
  assert.match(String(warnings[0]?.[0]), /schema-drifted/);
});

// ---------------------------------------------------------------------------
// ISS-026: retire-then-insert (CAS) — insert-before-retire made every
// sequential update after the first throw FactConflictError against the real
// unique partial index.
// ---------------------------------------------------------------------------

test("ISS-026: two SEQUENTIAL applyApprovedDiff calls with different values for the same key both succeed", async () => {
  const { db, fakeDb } = createFakeDb();
  const factsColl = fakeDb.collection<FactDoc>(COLLECTION_NAMES.facts);
  // Mirrors scripts/db-init.ts's facts_studentId_key_active_unique index exactly.
  factsColl.declareUniqueIndex(["studentId", "key"], { partialFilterExpression: { validTo: { $exists: false } } });

  const diff = emptyDiff();
  const first = await applyApprovedDiff(
    db,
    diff,
    { approve: true, edits: [citedFact({ value: "Canada" })] },
    "session-1",
  );
  const second = await applyApprovedDiff(
    db,
    diff,
    { approve: true, edits: [citedFact({ value: "United Kingdom" })] },
    "session-2",
  );

  assert.equal(first.written.length, 1);
  assert.equal(second.written.length, 1, "the second sequential update must succeed, not throw FactConflictError");
  assert.deepEqual(second.supersededKeys, ["targetCountry"], "supersededKeys must contain the updated key");

  const openFacts = factsColl.all().filter((f) => f.validTo === undefined);
  assert.equal(openFacts.length, 1, "exactly one open fact after two sequential updates to the same key");
  assert.equal(openFacts[0]?.value, "United Kingdom");
});

test("ISS-026: a crash between retiring the old fact and inserting the new one heals on retry of the same decision (never stuck at zero open facts)", async () => {
  const { db, fakeDb } = createFakeDb();
  const factsColl = fakeDb.collection<FactDoc>(COLLECTION_NAMES.facts);
  factsColl.declareUniqueIndex(["studentId", "key"], { partialFilterExpression: { validTo: { $exists: false } } });

  // Simulate the worst-case crash window ISS-026 names: a prior (crashed)
  // attempt at this exact decision already retired the old fact but never
  // got to insert the new one, so this key currently has ZERO open facts.
  factsColl.seed({
    ...citedFact({ value: "Canada" }),
    _id: "student-1:targetCountry:v1",
    studentId: "student-1",
    validTo: "2026-09-24T00:00:00.000Z",
  });
  assert.equal(
    factsColl.all().filter((f) => f.validTo === undefined).length,
    0,
    "precondition: zero open facts for this key, simulating the crash window",
  );

  const decision: CounsellorDecision = { approve: true, edits: [citedFact({ value: "United Kingdom" })] };
  const result = await applyApprovedDiff(db, emptyDiff(), decision, "session-1");

  const openFacts = factsColl.all().filter((f) => f.validTo === undefined);
  assert.equal(openFacts.length, 1, "retry after the simulated crash must heal to exactly one open fact");
  assert.equal(result.written.length, 1);
  assert.equal(
    result.written[0]?._id,
    deriveFactId("student-1", "targetCountry", "United Kingdom", "session-1"),
    "the healed fact must have the same deterministic _id a fresh apply of this decision would produce",
  );
});

// ---------------------------------------------------------------------------
// ISS-028: a multi-fact diff that fails part-way must surface the partial
// outcome (ids already written + the failing key), not just the raw error.
// ---------------------------------------------------------------------------

test("ISS-028: a multi-fact diff that fails part-way throws PartialApplyError carrying the ids written so far and the failing key", async () => {
  const { db, fakeDb } = createFakeDb();
  const factsColl = fakeDb.collection<FactDoc>(COLLECTION_NAMES.facts);

  let insertCount = 0;
  const originalInsertOne = factsColl.insertOne.bind(factsColl);
  factsColl.insertOne = (async (doc: FactDoc) => {
    insertCount += 1;
    if (insertCount === 2) {
      throw new Error("simulated write failure on the second fact");
    }
    return originalInsertOne(doc);
  }) as typeof factsColl.insertOne;

  const firstId = deriveFactId("student-1", "targetCountry", "Canada", undefined);
  const decision: CounsellorDecision = {
    approve: true,
    edits: [citedFact({ key: "targetCountry", value: "Canada" }), citedFact({ key: "budget", value: 20000 })],
  };

  await assert.rejects(
    () => applyApprovedDiff(db, emptyDiff(), decision),
    (err: unknown) => {
      assert.ok(err instanceof PartialApplyError, `expected PartialApplyError, got ${String(err)}`);
      const partial = err as PartialApplyError;
      assert.deepEqual(partial.writtenIds, [firstId], "must carry the id of the fact already written");
      assert.equal(partial.failingKey, "budget", "must carry the key that failed");
      assert.ok(partial.cause instanceof Error);
      assert.match((partial.cause as Error).message, /simulated write failure/);
      return true;
    },
  );

  assert.equal(factsColl.size(), 1, "the first fact must remain committed even though the diff as a whole failed");
});

// ---------------------------------------------------------------------------
// ISS-t-003b-db-hardening-1: deriveFactId must not collide when a delimiter
// character moves between fields.
// ---------------------------------------------------------------------------

test("ISS-t-003b-db-hardening-1: deriveFactId does not collide when a '|' character moves between studentId and key", () => {
  const a = deriveFactId("alice|X", "c", "same-value", "session-1");
  const b = deriveFactId("alice", "X|c", "same-value", "session-1");
  assert.notEqual(a, b, "('alice|X','c') and ('alice','X|c') must not derive the same fact _id");
});
