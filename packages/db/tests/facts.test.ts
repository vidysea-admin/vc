import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyApprovedDiff,
  proposeFactChanges,
  deriveContentHash,
  FactConflictError,
  PartialApplyError,
  ensureScribeSessionRow,
  recordApprovedSessionSummary,
  SessionRowMissingError,
} from "../src/facts.js";
import {
  requestErasure,
  confirmErasure,
  StudentFencedError,
  FencedWriterDeadlineError,
  FENCED_WRITER_DEADLINE_MS,
} from "../src/erasure.js";
import { COLLECTION_NAMES } from "../src/collections.js";
import { INDEX_PLAN } from "../scripts/db-init.js";
import { createFakeDb, FakeCollection } from "./fakes.js";
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

/**
 * ISS-t-003b-c1-3: every facts test runs against the PRODUCTION index set.
 * The unique indexes are read from scripts/db-init.ts's INDEX_PLAN (the same
 * data main() hands to createIndex), never hand-copied, so a test can not
 * silently run against a laxer fake than the real collection.
 */
function setup() {
  const { db, fakeDb } = createFakeDb();
  for (const spec of INDEX_PLAN) {
    if (!spec.unique) continue;
    fakeDb
      .collection<{ _id: string }>(spec.collection)
      .declareUniqueIndex(Object.keys(spec.keys), { partialFilterExpression: spec.partialFilterExpression });
  }
  const factsColl = fakeDb.collection<FactDoc>(COLLECTION_NAMES.facts);
  const edgesColl = fakeDb.collection<{ _id: string; from: { kind: string; id: string }; to: { kind: string; id: string }; rel: string }>(
    COLLECTION_NAMES.edges,
  );
  const open = (key = "targetCountry") => factsColl.all().filter((f) => f.active === true && f.key === key);
  return { db, fakeDb, factsColl, edgesColl, open };
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
  const { fakeDb } = setup();
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
  const existing: FactDoc = { ...citedFact(), _id: "student-1:targetCountry:v1", studentId: "student-1", active: true };
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
  const existing: FactDoc = { ...citedFact(), _id: "student-1:targetCountry:v1", studentId: "student-1", active: true };
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
  const { db, fakeDb } = setup();
  const decision: CounsellorDecision = { approve: false, edits: [citedFact()] };
  const result = await applyApprovedDiff(db, emptyDiff(), decision);
  assert.equal(result.written.length, 0);
  assert.equal(fakeDb.collection<FactDoc>(COLLECTION_NAMES.facts).size(), 0);
  assert.equal(fakeDb.collection(COLLECTION_NAMES.edges).size(), 0);
});

test("B3: applyApprovedDiff writes zero facts when approve is true but edits is omitted", async () => {
  const { db, fakeDb } = setup();
  const result = await applyApprovedDiff(db, emptyDiff(), { approve: true });
  assert.equal(result.written.length, 0);
  assert.equal(fakeDb.collection<FactDoc>(COLLECTION_NAMES.facts).size(), 0);
});

test("applyApprovedDiff writes facts + edges (fact->source sourced_from, student->fact has) when approve is true", async () => {
  const { db, fakeDb } = setup();
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
  const { db, fakeDb } = setup();
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
  const { db, fakeDb } = setup();
  const factsColl = fakeDb.collection<FactDoc>(COLLECTION_NAMES.facts);
  const existing: FactDoc = { ...citedFact(), _id: "student-1:targetCountry:v1", studentId: "student-1", active: true };
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
  const { db } = setup();
  const { source, ...uncited } = citedFact();
  const decision = { approve: true, edits: [uncited] } as unknown as CounsellorDecision;
  await assert.rejects(() => applyApprovedDiff(db, emptyDiff(), decision));
});

// ---------------------------------------------------------------------------
// ISS-020: deterministic fact _id -> replaying the same approved diff is idempotent
// ---------------------------------------------------------------------------

test("ISS-020: applyApprovedDiff twice with the same inputs is idempotent (one open fact, no duplicate edges)", async () => {
  const { db, fakeDb } = setup();
  const decision: CounsellorDecision = { approve: true, edits: [citedFact()] };
  const diff = emptyDiff();

  const first = await applyApprovedDiff(db, diff, decision, "session-1");
  const second = await applyApprovedDiff(db, diff, decision, "session-1");

  assert.equal(first.written[0]?._id, second.written[0]?._id, "replay must resolve to the same deterministic _id");
  assert.equal(second.supersededKeys.length, 0, "replay must not treat its own fact as something it superseded");

  const factsColl = fakeDb.collection<FactDoc>(COLLECTION_NAMES.facts);
  const openFacts = factsColl.all().filter((f) => f.active === true);
  assert.equal(openFacts.length, 1, "replay must not create a second open fact");

  const edgesColl = fakeDb.collection(COLLECTION_NAMES.edges);
  assert.equal(edgesColl.size(), 2, "replay must not create duplicate edges (has + sourced_from)");
});

test("ISS-020: deriveContentHash is deterministic for identical inputs and differs when the value differs", () => {
  const a = deriveContentHash("student-1", "targetCountry", "Canada", "session-1");
  const b = deriveContentHash("student-1", "targetCountry", "Canada", "session-1");
  const c = deriveContentHash("student-1", "targetCountry", "United Kingdom", "session-1");
  assert.equal(a, b);
  assert.notEqual(a, c);
});

// ---------------------------------------------------------------------------
// ISS-019: unique partial index -> concurrent writers never leave two open facts
// ---------------------------------------------------------------------------

test("ISS-019: interleaving two applyApprovedDiff calls for the same (studentId,key) leaves at most one open fact", async () => {
  const { db, fakeDb } = setup();
  const factsColl = fakeDb.collection<FactDoc>(COLLECTION_NAMES.facts);

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

  const openFacts = factsColl.all().filter((f) => f.active === true && f.key === "targetCountry");
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
    active: true,
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
    active: true,
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
    active: true, // D-013: a drifted OPEN fact (a history doc is skipped before the schema check)
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
  const { db, fakeDb } = setup();
  const factsColl = fakeDb.collection<FactDoc>(COLLECTION_NAMES.facts);

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

  const openFacts = factsColl.all().filter((f) => f.active === true);
  assert.equal(openFacts.length, 1, "exactly one open fact after two sequential updates to the same key");
  assert.equal(openFacts[0]?.value, "United Kingdom");
});

test("ISS-026: a crash between retiring the old fact and inserting the new one heals on retry of the same decision (never stuck at zero open facts)", async () => {
  const { db, fakeDb } = setup();
  const factsColl = fakeDb.collection<FactDoc>(COLLECTION_NAMES.facts);

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
    factsColl.all().filter((f) => f.active === true).length,
    0,
    "precondition: zero open facts for this key, simulating the crash window",
  );

  const decision: CounsellorDecision = { approve: true, edits: [citedFact({ value: "United Kingdom" })] };
  const result = await applyApprovedDiff(db, emptyDiff(), decision, "session-1");

  const openFacts = factsColl.all().filter((f) => f.active === true);
  assert.equal(openFacts.length, 1, "retry after the simulated crash must heal to exactly one open fact");
  assert.equal(result.written.length, 1);
  assert.equal(
    result.written[0]?.contentHash,
    deriveContentHash("student-1", "targetCountry", "United Kingdom", "session-1"),
    "the healed fact must carry the same contentHash a fresh apply of this decision would produce (D-012)",
  );
});

// ---------------------------------------------------------------------------
// ISS-028: a multi-fact diff that fails part-way must surface the partial
// outcome (ids already written + the failing key), not just the raw error.
// ---------------------------------------------------------------------------

test("ISS-028: a multi-fact diff that fails part-way throws PartialApplyError carrying the ids written so far and the failing key", async () => {
  const { db, fakeDb } = setup();
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

  const decision: CounsellorDecision = {
    approve: true,
    edits: [citedFact({ key: "targetCountry", value: "Canada" }), citedFact({ key: "budget", value: 20000 })],
  };

  await assert.rejects(
    () => applyApprovedDiff(db, emptyDiff(), decision),
    (err: unknown) => {
      assert.ok(err instanceof PartialApplyError, `expected PartialApplyError, got ${String(err)}`);
      const partial = err as PartialApplyError;
      const committed = factsColl.all();
      assert.equal(committed.length, 1);
      assert.deepEqual(partial.writtenIds, [committed[0]?._id], "must carry the id of the fact already written");
      assert.equal(partial.failingKey, "budget", "must carry the key that failed");
      assert.ok(partial.cause instanceof Error);
      assert.match((partial.cause as Error).message, /simulated write failure/);
      return true;
    },
  );

  assert.equal(factsColl.size(), 1, "the first fact must remain committed even though the diff as a whole failed");
});

// ---------------------------------------------------------------------------
// ISS-t-003b-db-hardening-1: deriveContentHash must not collide when a delimiter
// character moves between fields.
// ---------------------------------------------------------------------------

test("ISS-t-003b-db-hardening-1: deriveContentHash does not collide when a '|' character moves between studentId and key", () => {
  const a = deriveContentHash("alice|X", "c", "same-value", "session-1");
  const b = deriveContentHash("alice", "X|c", "same-value", "session-1");
  assert.notEqual(a, b, "('alice|X','c') and ('alice','X|c') must not derive the same fact _id");
});

// ---------------------------------------------------------------------------
// ISS-t-003b-c1-3: the fake must behave like the mongodb@6 driver, or the
// tests above prove nothing about production.
// ---------------------------------------------------------------------------

test("ISS-t-003b-c1-3: FakeCollection.insertOne of a duplicate _id throws a code-11000 error (like the real driver)", async () => {
  const coll = new FakeCollection<{ _id: string; v: number }>();
  await coll.insertOne({ _id: "x", v: 1 });
  await assert.rejects(
    () => coll.insertOne({ _id: "x", v: 2 }),
    (err: unknown) => {
      assert.equal((err as { code?: number }).code, 11000, "duplicate _id must surface as code 11000");
      return true;
    },
  );
});

test("ISS-t-003b-c1-3: FakeCollection.findOneAndUpdate returns the PRE-image by default and the post-image only with returnDocument:'after'", async () => {
  const coll = new FakeCollection<{ _id: string; v: number }>();
  await coll.insertOne({ _id: "x", v: 1 });
  const before = await coll.findOneAndUpdate({ _id: "x" }, { $set: { v: 2 } });
  assert.equal(before?.v, 1, "default (driver: returnDocument 'before') must return the pre-image");
  const after = await coll.findOneAndUpdate({ _id: "x" }, { $set: { v: 3 } }, { returnDocument: "after" });
  assert.equal(after?.v, 3, "returnDocument:'after' must return the post-image");
  assert.equal((await coll.findOne({ _id: "x" }))?.v, 3, "the stored doc must carry the update either way");
  assert.equal(await coll.findOneAndUpdate({ _id: "missing" }, { $set: { v: 9 } }), null);
});

test("ISS-t-003b-c1-3: the facts tests run with the production unique partial index from INDEX_PLAN", async () => {
  const { factsColl } = setup();
  const base = { ...citedFact(), studentId: "student-1" };
  await factsColl.insertOne({ ...base, _id: "a", active: true });
  await assert.rejects(
    () => factsColl.insertOne({ ...base, _id: "b", active: true }),
    (err: unknown) => (err as { code?: number }).code === 11000,
  );
  await factsColl.insertOne({ ...base, _id: "c", validTo: "2026-09-25T00:00:00.000Z" });
});

// ---------------------------------------------------------------------------
// ISS-t-003b-c1-1 (critical), D-012: fact identity is separate from content.
// A content-addressed _id collided with the retired historical doc on a value
// revert (A -> B -> A) and left the key at zero open facts for good.
// ---------------------------------------------------------------------------

async function applyValue(db: import("mongodb").Db, value: unknown, sessionId = "session-1") {
  return applyApprovedDiff(db, emptyDiff(), { approve: true, edits: [citedFact({ value })] }, sessionId);
}

test("ISS-t-003b-c1-1: A -> B -> A succeeds; one open fact with value A, history holds 3 docs with the old A still retired", async () => {
  const { db, factsColl, open } = setup();
  const first = await applyValue(db, "Canada");
  await applyValue(db, "United Kingdom");
  const third = await applyValue(db, "Canada");

  assert.equal(third.written.length, 1);
  assert.deepEqual(third.supersededKeys, ["targetCountry"]);
  assert.equal(open().length, 1, "exactly one open fact after A -> B -> A");
  assert.equal(open()[0]?.value, "Canada");
  assert.equal(factsColl.size(), 3, "history must hold all three writes (longitudinal, D-003)");

  const oldA = await factsColl.findOne({ _id: first.written[0]!._id });
  assert.ok(oldA?.validTo, "the ORIGINAL A must still be retired, not resurrected");
  assert.notEqual(third.written[0]?._id, first.written[0]?._id, "the reverted A is a new document with a fresh _id");
  assert.equal(third.written[0]?.contentHash, first.written[0]?.contentHash, "same content, same contentHash");
});

test("ISS-t-003b-c1-1: A -> B -> A -> B also succeeds", async () => {
  const { db, factsColl, open } = setup();
  await applyValue(db, "Canada");
  await applyValue(db, "United Kingdom");
  await applyValue(db, "Canada");
  const fourth = await applyValue(db, "United Kingdom");
  assert.equal(fourth.written.length, 1);
  assert.equal(open().length, 1);
  assert.equal(open()[0]?.value, "United Kingdom");
  assert.equal(factsColl.size(), 4);
});

test("ISS-t-003b-c1-1: every write gets a fresh _id that is not derived from content", async () => {
  const { db } = setup();
  const r = await applyValue(db, "Canada");
  const doc = r.written[0]!;
  assert.notEqual(doc._id, deriveContentHash("student-1", "targetCountry", "Canada", "session-1"));
  assert.equal(doc.contentHash, deriveContentHash("student-1", "targetCountry", "Canada", "session-1"));
});

test("ISS-t-003b-c1-1: replaying an identical decision is a no-op (contentHash match, no new doc, no new edges)", async () => {
  const { db, factsColl, edgesColl } = setup();
  await applyValue(db, "Canada");
  await applyValue(db, "United Kingdom");
  const sizeBefore = factsColl.size();
  const edgesBefore = edgesColl.size();
  const replay = await applyValue(db, "United Kingdom");
  assert.equal(replay.supersededKeys.length, 0);
  assert.equal(factsColl.size(), sizeBefore, "replay must not insert");
  assert.equal(edgesColl.size(), edgesBefore, "replay must not add edges");
});

// ---------------------------------------------------------------------------
// ISS-t-003b-c1-2 (high): a CAS miss or an 11000 must re-read the active fact
// and treat a matching contentHash as our own already-landed write.
// ---------------------------------------------------------------------------

test("ISS-t-003b-c1-2: two CONCURRENT identical decisions against a key holding a different open fact both succeed, one open fact", async () => {
  const { db, open } = setup();
  await applyValue(db, "Canada", "session-0");
  const results = await Promise.allSettled([
    applyValue(db, "United Kingdom", "session-1"),
    applyValue(db, "United Kingdom", "session-1"),
  ]);
  for (const r of results) {
    assert.equal(r.status, "fulfilled", `identical concurrent replay must not fail: ${r.status === "rejected" ? String(r.reason) : ""}`);
  }
  assert.equal(open().length, 1);
  assert.equal(open()[0]?.value, "United Kingdom");
});

test("ISS-t-003b-c1-2: concurrent identical decisions still succeed when the loser re-reads inside the winner's retire->insert window", async () => {
  const { db, factsColl, open } = setup();
  await applyValue(db, "Canada", "session-0");
  // Delay the FIRST insert by a few milliseconds so the other writer's CAS miss
  // re-reads while the key has zero open facts (the live retire->insert window).
  const originalInsertOne = factsColl.insertOne.bind(factsColl);
  let calls = 0;
  factsColl.insertOne = (async (doc: FactDoc) => {
    calls += 1;
    if (calls === 1) await new Promise((r) => setTimeout(r, 5));
    return originalInsertOne(doc);
  }) as typeof factsColl.insertOne;

  const results = await Promise.allSettled([
    applyValue(db, "United Kingdom", "session-1"),
    applyValue(db, "United Kingdom", "session-1"),
  ]);
  for (const r of results) {
    assert.equal(r.status, "fulfilled", `identical concurrent replay must not fail: ${r.status === "rejected" ? String(r.reason) : ""}`);
  }
  assert.equal(open().length, 1);
  assert.equal(open()[0]?.value, "United Kingdom");
});

test("ISS-t-003b-c1-2: an 11000 on insert whose winner has our contentHash is success, not FactConflictError", async () => {
  const { db, factsColl, open } = setup();
  // Another writer inserts the identical fact between our read and our insert.
  const originalInsertOne = factsColl.insertOne.bind(factsColl);
  let injected = false;
  factsColl.insertOne = (async (doc: FactDoc) => {
    if (!injected) {
      injected = true;
      await originalInsertOne({ ...doc, _id: "other-writer" });
    }
    return originalInsertOne(doc);
  }) as typeof factsColl.insertOne;
  const r = await applyValue(db, "Canada");
  assert.equal(r.written[0]?._id, "other-writer", "the already-landed identical fact is reported as the write");
  assert.equal(open().length, 1);
});

test("ISS-t-003b-c1-2: concurrent writers with DIFFERENT values against an existing key leave at most one open fact; losers get FactConflictError", async () => {
  const { db, open } = setup();
  await applyValue(db, "Canada", "session-0");
  const results = await Promise.allSettled([
    applyValue(db, "United Kingdom", "session-1"),
    applyValue(db, "Germany", "session-2"),
  ]);
  const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  for (const r of rejected) {
    assert.ok(r.reason instanceof FactConflictError, `expected FactConflictError, got ${String(r.reason)}`);
  }
  assert.equal(rejected.length, 1, "exactly one of the two different-value writers loses");
  assert.equal(open().length, 1, "exactly one open fact after the race");
});

// ---------------------------------------------------------------------------
// ISS-t-003b-c1-4: a retry with a different sessionId is a NEW write with its
// own provenance (documented behaviour; D-012 contentHash includes sessionId).
// ---------------------------------------------------------------------------

test("ISS-t-003b-c1-4: the same value re-approved under a different sessionId is a new write with a provenance edge to the new session", async () => {
  const { db, factsColl, edgesColl, open } = setup();
  const first = await applyValue(db, "Canada", "session-1");
  const retry = await applyValue(db, "Canada", "session-2");

  assert.deepEqual(retry.supersededKeys, ["targetCountry"], "a different session is not a replay");
  assert.equal(factsColl.size(), 2);
  assert.equal(open().length, 1);
  const newFact = open()[0]!;
  assert.equal(newFact._id, retry.written[0]?._id);
  assert.notEqual(newFact._id, first.written[0]?._id);
  assert.equal(newFact.contentHash, deriveContentHash("student-1", "targetCountry", "Canada", "session-2"));

  const sourced = edgesColl.all().filter((e) => e.rel === "sourced_from" && e.from.id === newFact._id);
  assert.equal(sourced.length, 1);
  assert.deepEqual(sourced[0]?.to, { kind: "session", id: "session-2" });
  const oldSourced = edgesColl.all().filter((e) => e.rel === "sourced_from" && e.from.id === first.written[0]?._id);
  assert.deepEqual(oldSourced[0]?.to, { kind: "session", id: "session-1" }, "the old fact keeps its own provenance");
});

// ---------------------------------------------------------------------------
// Crash healing (ISS-026 under D-012): a real crash between retire and insert.
// ---------------------------------------------------------------------------

test("crash between retire and insert: re-running the same decision heals to exactly one open fact", async () => {
  const { db, factsColl, open } = setup();
  await applyValue(db, "Canada", "session-0");

  const originalInsertOne = factsColl.insertOne.bind(factsColl);
  factsColl.insertOne = (async () => {
    throw new Error("simulated process crash after the CAS retire");
  }) as typeof factsColl.insertOne;
  await assert.rejects(() => applyValue(db, "United Kingdom", "session-1"), /simulated process crash/);
  assert.equal(open().length, 0, "precondition: the crash left zero open facts");

  factsColl.insertOne = originalInsertOne;
  const healed = await applyValue(db, "United Kingdom", "session-1");
  assert.equal(healed.written.length, 1);
  assert.equal(open().length, 1);
  assert.equal(open()[0]?.value, "United Kingdom");
  assert.equal(factsColl.size(), 2);
});

// ---------------------------------------------------------------------------
// D-013: open facts carry `active: true`; retiring sets validTo AND unsets
// active in the same CAS update; every open-fact read filters on active:true.
// ---------------------------------------------------------------------------

test("D-013: an inserted open fact carries active:true and no validTo", async () => {
  const { db, factsColl } = setup();
  const r = await applyValue(db, "Canada");
  const stored = await factsColl.findOne({ _id: r.written[0]!._id });
  assert.equal(stored?.active, true);
  assert.equal(stored?.validTo, undefined);
});

test("D-013: retiring a fact sets validTo and unsets active in ONE CAS update filtered on {_id, active:true}", async () => {
  const { db, factsColl } = setup();
  const first = await applyValue(db, "Canada");
  const calls: Array<{ filter: unknown; update: unknown }> = [];
  const original = factsColl.findOneAndUpdate.bind(factsColl);
  factsColl.findOneAndUpdate = (async (filter: Record<string, unknown>, update: Record<string, unknown>, options?: { returnDocument?: "before" | "after" }) => {
    calls.push({ filter, update });
    return original(filter, update, options);
  }) as typeof factsColl.findOneAndUpdate;
  await applyValue(db, "United Kingdom");

  assert.equal(calls.length, 1, "exactly one CAS update per supersession");
  assert.deepEqual(calls[0]?.filter, { _id: first.written[0]!._id, active: true });
  const update = calls[0]?.update as { $set?: { validTo?: string }; $unset?: Record<string, unknown> };
  assert.ok(update.$set?.validTo, "the CAS update sets validTo");
  assert.deepEqual(update.$unset, { active: "" }, "the SAME update unsets active");

  const old = await factsColl.findOne({ _id: first.written[0]!._id });
  assert.ok(old?.validTo);
  assert.equal("active" in (old as object), false, "a retired fact has no active field at all");
});

test("D-013: applyApprovedDiff treats only active:true as open (a doc without active is history, never CAS-retired)", async () => {
  const { db, factsColl, open } = setup();
  // A doc with no validTo but also no `active` is NOT open under D-013.
  factsColl.seed({ ...citedFact({ value: "Canada" }), _id: "legacy", studentId: "student-1" });
  const r = await applyValue(db, "United Kingdom");
  assert.deepEqual(r.supersededKeys, [], "nothing active to supersede");
  assert.equal(open().length, 1);
  assert.equal(open()[0]?.value, "United Kingdom");
});

test("D-013: proposeFactChanges diffs only against active:true facts", () => {
  const history: FactDoc = { ...citedFact({ value: "Canada" }), _id: "h", studentId: "student-1" };
  const diff = proposeFactChanges({
    studentId: "student-1",
    summary: "s",
    existingFacts: [history],
    candidateFacts: [citedFact({ value: "Canada" })],
  });
  assert.equal(diff.changes.length, 1);
  assert.equal(diff.changes[0]?.op, "add", "a fact without active:true is not the current value");
});

// ---------------------------------------------------------------------------
// T-016: the scribe's session row (ISS-t-011-rev-5) and its approved summary (ISS-t-007-rev-7)
// ---------------------------------------------------------------------------

test("ISS-t-011-rev-5: ensureScribeSessionRow creates the row once, records each thread once, and reports `created` only for the insert", async () => {
  const { db, fakeDb } = setup();
  const sessions = fakeDb.collection<{ _id: string } & Record<string, unknown>>(COLLECTION_NAMES.sessions);
  const input = { sessionId: "sess-1", studentId: "stu-1", threadId: "scribe:sess-1", endedAt: "2026-09-25T10:00:00.000Z" };
  assert.deepEqual(await ensureScribeSessionRow(db, input), { created: true });
  assert.deepEqual(await ensureScribeSessionRow(db, input), { created: false }, "replay: no new row");
  assert.deepEqual(await ensureScribeSessionRow(db, { ...input, threadId: "retry-thread" }), { created: false });
  assert.equal(sessions.size(), 1);
  const row = await sessions.findOne({ _id: "sess-1" });
  assert.equal(row?.studentId, "stu-1");
  assert.equal(row?.sessionId, "sess-1");
  assert.equal(row?.endedAt, "2026-09-25T10:00:00.000Z");
  assert.deepEqual(row?.scribeThreadIds, ["scribe:sess-1", "retry-thread"], "each thread once (idempotent $addToSet)");
});

test("ISS-t-011-rev-5 hostile: a sessionId owned by another student is refused with 11000 and the row is untouched", async () => {
  const { db, fakeDb } = setup();
  const sessions = fakeDb.collection<{ _id: string } & Record<string, unknown>>(COLLECTION_NAMES.sessions);
  await ensureScribeSessionRow(db, { sessionId: "sess-1", studentId: "stu-1", threadId: "t-1" });
  await assert.rejects(
    ensureScribeSessionRow(db, { sessionId: "sess-1", studentId: "stu-2", threadId: "t-evil" }),
    (err: unknown) => (err as { code?: number }).code === 11000,
  );
  assert.deepEqual((await sessions.findOne({ _id: "sess-1" }))?.scribeThreadIds, ["t-1"]);
  assert.equal((await sessions.findOne({ _id: "sess-1" }))?.studentId, "stu-1");
});

test("ISS-t-011-rev-5: ensureScribeSessionRow refuses an empty studentId / sessionId / threadId (an anonymous row is invisible to erasure)", async () => {
  const { db, fakeDb } = setup();
  for (const bad of [
    { sessionId: "s", studentId: "", threadId: "t" },
    { sessionId: "", studentId: "u", threadId: "t" },
    { sessionId: "s", studentId: "u", threadId: " " },
  ]) {
    await assert.rejects(ensureScribeSessionRow(db, bad), /non-empty/);
  }
  assert.equal(fakeDb.collection(COLLECTION_NAMES.sessions).size(), 0);
});

test("ISS-t-007-rev-7: recordApprovedSessionSummary stores the summary on the existing row and NEVER creates one", async () => {
  const { db, fakeDb } = setup();
  const sessions = fakeDb.collection<{ _id: string } & Record<string, unknown>>(COLLECTION_NAMES.sessions);
  await assert.rejects(
    recordApprovedSessionSummary(db, { sessionId: "sess-9", studentId: "stu-1", summary: "s" }),
    SessionRowMissingError,
  );
  assert.equal(sessions.size(), 0, "no upsert: a purged row is never resurrected by a late summary write");
  await ensureScribeSessionRow(db, { sessionId: "sess-9", studentId: "stu-1", threadId: "t" });
  await recordApprovedSessionSummary(db, { sessionId: "sess-9", studentId: "stu-1", summary: "Wants CS in Canada." });
  const row = await sessions.findOne({ _id: "sess-9" });
  assert.equal(row?.summary, "Wants CS in Canada.");
  assert.equal(typeof row?.summaryApprovedAt, "string");
  // Another student's id never matches the row.
  await assert.rejects(recordApprovedSessionSummary(db, { sessionId: "sess-9", studentId: "stu-2", summary: "x" }), SessionRowMissingError);
  assert.equal((await sessions.findOne({ _id: "sess-9" }))?.summary, "Wants CS in Canada.");
});

// ---------------------------------------------------------------------------
// ISS-t-016-rev-1: recordApprovedSessionSummary is fence-aware, mirroring applyApprovedDiff.
// ---------------------------------------------------------------------------

async function fenceStudent(db: Awaited<ReturnType<typeof setup>>["db"], studentId: string): Promise<void> {
  const { requestId } = await requestErasure(db, { studentId, requestedBy: "counsellor-7", reason: "student_request" });
  await confirmErasure(db, { requestId, confirmedBy: "admin-2" });
}

test("ISS-t-016-rev-1: a student already fenced BEFORE the call is refused; nothing is written", async () => {
  const { db, fakeDb } = setup();
  const sessions = fakeDb.collection<{ _id: string } & Record<string, unknown>>(COLLECTION_NAMES.sessions);
  await ensureScribeSessionRow(db, { sessionId: "sess-fence-1", studentId: "stu-fence-1", threadId: "t" });
  await fenceStudent(db, "stu-fence-1");
  await assert.rejects(
    recordApprovedSessionSummary(db, { sessionId: "sess-fence-1", studentId: "stu-fence-1", summary: "s" }),
    StudentFencedError,
  );
  const row = await sessions.findOne({ _id: "sess-fence-1" });
  assert.equal(row?.summary, undefined, "the pre-check refused before any write");
  assert.equal(row?.summaryApprovedAt, undefined);
});

test("ISS-t-016-rev-1: a fence that appears AFTER the write is compensated — summary, summaryApprovedAt and summaryWithheldReason are unset, and StudentFencedError is thrown", async () => {
  const { db, fakeDb } = setup();
  const sessions = fakeDb.collection<{ _id: string } & Record<string, unknown>>(COLLECTION_NAMES.sessions);
  await ensureScribeSessionRow(db, { sessionId: "sess-fence-2", studentId: "stu-fence-2", threadId: "t" });
  const realUpdate = sessions.updateOne.bind(sessions);
  let fenced = false;
  sessions.updateOne = (async (filter, update, opts) => {
    const res = await realUpdate(filter, update, opts);
    const set = (update as { $set?: { summary?: unknown } } | undefined)?.$set;
    if (!fenced && set && set.summary !== undefined) {
      fenced = true;
      await fenceStudent(db, "stu-fence-2");
    }
    return res;
  }) as typeof sessions.updateOne;

  await assert.rejects(
    recordApprovedSessionSummary(db, {
      sessionId: "sess-fence-2",
      studentId: "stu-fence-2",
      summary: "Wants CS in Canada.",
      summaryWithheldReason: undefined,
    }),
    StudentFencedError,
  );
  const row = await sessions.findOne({ _id: "sess-fence-2" });
  assert.equal(row?.summary, undefined, "the write this call made is undone immediately, not left for executeErasure");
  assert.equal(row?.summaryApprovedAt, undefined);
  assert.equal(row?.summaryWithheldReason, undefined);
});

test("ISS-t-016-rev-1: compensation matches on the value THIS call wrote — a LATER legitimate write is never clobbered by a stale undo", async () => {
  const { db, fakeDb } = setup();
  const sessions = fakeDb.collection<{ _id: string } & Record<string, unknown>>(COLLECTION_NAMES.sessions);
  await ensureScribeSessionRow(db, { sessionId: "sess-fence-3", studentId: "stu-fence-3", threadId: "t" });

  // Write once (this succeeds normally, unfenced).
  await recordApprovedSessionSummary(db, { sessionId: "sess-fence-3", studentId: "stu-fence-3", summary: "first" });
  const afterFirst = await sessions.findOne({ _id: "sess-fence-3" });
  assert.equal(afterFirst?.summary, "first");
  const firstApprovedAt = afterFirst?.summaryApprovedAt;

  // Fence the student now (independent of any write), and confirm a SECOND (fenced) call's own undo
  // never touches the row because its own pre-check refuses it before writing anything at all —
  // the FIRST call's legitimately-written value survives.
  await fenceStudent(db, "stu-fence-3");
  await assert.rejects(
    recordApprovedSessionSummary(db, { sessionId: "sess-fence-3", studentId: "stu-fence-3", summary: "second" }),
    StudentFencedError,
  );
  const row = await sessions.findOne({ _id: "sess-fence-3" });
  assert.equal(row?.summary, "first", "the pre-check refused the second call before writing; the first call's value is untouched");
  assert.equal(row?.summaryApprovedAt, firstApprovedAt);
});

test("ISS-t-016-rev-1: a call that runs past its writer deadline throws FencedWriterDeadlineError and is undone when it settles", { timeout: 5000 }, async () => {
  const { db, fakeDb } = setup();
  const sessions = fakeDb.collection<{ _id: string } & Record<string, unknown>>(COLLECTION_NAMES.sessions);
  await ensureScribeSessionRow(db, { sessionId: "sess-fence-4", studentId: "stu-fence-4", threadId: "t" });
  const realUpdate = sessions.updateOne.bind(sessions);
  let gate!: () => void;
  const opened = new Promise<void>((resolve) => (gate = resolve));
  let calls = 0;
  sessions.updateOne = (async (filter, update, opts) => {
    calls += 1;
    if (calls === 1) await opened; // stuck past the (short) deadline
    return realUpdate(filter, update, opts);
  }) as typeof sessions.updateOne;

  const call = recordApprovedSessionSummary(
    db,
    { sessionId: "sess-fence-4", studentId: "stu-fence-4", summary: "late" },
    { deadlineMs: 20 },
  );
  const err = await call.catch((e: unknown) => e);
  assert.ok(err instanceof FencedWriterDeadlineError, `expected FencedWriterDeadlineError, got ${String(err)}`);
  gate(); // let the stuck write land
  await (err as FencedWriterDeadlineError).settled;
  const row = await sessions.findOne({ _id: "sess-fence-4" });
  assert.equal(row?.summary, undefined, "a timed-out writer keeps nothing, even once its late write lands");
});

test("ISS-t-016-rev-1: RangeError on a deadline longer than FENCED_WRITER_DEADLINE_MS, before anything is written", async () => {
  const { db, fakeDb } = setup();
  const sessions = fakeDb.collection<{ _id: string } & Record<string, unknown>>(COLLECTION_NAMES.sessions);
  await ensureScribeSessionRow(db, { sessionId: "sess-fence-5", studentId: "stu-fence-5", threadId: "t" });
  await assert.rejects(
    recordApprovedSessionSummary(
      db,
      { sessionId: "sess-fence-5", studentId: "stu-fence-5", summary: "x" },
      { deadlineMs: FENCED_WRITER_DEADLINE_MS + 1 },
    ),
    RangeError,
  );
  assert.equal((await sessions.findOne({ _id: "sess-fence-5" }))?.summary, undefined);
});

// ---------------------------------------------------------------------------
// T-013 (D-020, citation-guarantee-scope): a "reasoning" fact is linked to the value fact it
// `explains` via a third edge in the SAME edges collection.
// ---------------------------------------------------------------------------

test("T-013: a reasoning fact approved ALONGSIDE the value fact it explains gets an 'explains' edge to it", async () => {
  const { db, fakeDb } = setup();
  const valueFact = citedFact({ key: "targetCountry", value: "UK" });
  const reasoningFact = citedFact({
    key: "why_targetCountry",
    value: "sister lives there",
    kind: "reasoning",
    explains: "targetCountry",
    needsReview: true,
    source: { type: "transcript", quote: "because my sister lives there", turnId: "42" },
  });
  const decision: CounsellorDecision = { approve: true, edits: [valueFact, reasoningFact] };
  const result = await applyApprovedDiff(db, emptyDiff(), decision, "session-1");
  assert.equal(result.written.length, 2);

  const edges = fakeDb.collection(COLLECTION_NAMES.edges).all() as Array<{
    from: { kind: string; id: string };
    to: { kind: string; id: string };
    rel: string;
  }>;
  const explainsEdge = edges.find((e) => e.rel === "explains");
  assert.ok(explainsEdge, "expected a fact->fact 'explains' edge");
  const reasoningDoc = result.written.find((f) => f.key === "why_targetCountry")!;
  const valueDoc = result.written.find((f) => f.key === "targetCountry")!;
  assert.equal(explainsEdge?.from.kind, "fact");
  assert.equal(explainsEdge?.from.id, reasoningDoc._id);
  assert.equal(explainsEdge?.to.kind, "fact");
  assert.equal(explainsEdge?.to.id, valueDoc._id);
});

test("T-013: a reasoning fact approved for a value fact ALREADY active in the DB (a different, earlier session) still gets linked", async () => {
  const { db, fakeDb, factsColl } = setup();
  const existing: FactDoc = { ...citedFact({ key: "targetCountry", value: "UK" }), _id: "existing-1", studentId: "student-1", active: true };
  factsColl.seed(existing);

  const reasoningFact = citedFact({
    key: "why_targetCountry",
    value: "sister lives there",
    kind: "reasoning",
    explains: "targetCountry",
    needsReview: true,
    source: { type: "transcript", quote: "because my sister lives there", turnId: "42" },
  });
  const decision: CounsellorDecision = { approve: true, edits: [reasoningFact] };
  const result = await applyApprovedDiff(db, emptyDiff(), decision, "session-1");
  assert.equal(result.written.length, 1);

  const edges = fakeDb.collection(COLLECTION_NAMES.edges).all() as Array<{
    from: { kind: string; id: string };
    to: { kind: string; id: string };
    rel: string;
  }>;
  const explainsEdge = edges.find((e) => e.rel === "explains");
  assert.ok(explainsEdge, "expected the reasoning fact to link to the PRE-EXISTING active value fact");
  assert.equal(explainsEdge?.to.id, "existing-1");
});

test("T-013: a reasoning fact whose `explains` key has no active fact anywhere is written unlinked (no 'explains' edge), never dropped", async () => {
  const { db, fakeDb } = setup();
  const reasoningFact = citedFact({
    key: "why_targetCountry",
    value: "sister lives there",
    kind: "reasoning",
    explains: "targetCountry",
    needsReview: true,
    source: { type: "transcript", quote: "because my sister lives there", turnId: "42" },
  });
  const decision: CounsellorDecision = { approve: true, edits: [reasoningFact] };
  const result = await applyApprovedDiff(db, emptyDiff(), decision, "session-1");
  assert.equal(result.written.length, 1, "the reasoning fact is still written even with nothing to link to");

  const edges = fakeDb.collection(COLLECTION_NAMES.edges).all() as Array<{ rel: string }>;
  assert.equal(edges.some((e) => e.rel === "explains"), false);
  // The ordinary sourced_from + has edges are still recorded.
  assert.equal(edges.filter((e) => e.rel === "sourced_from" || e.rel === "has").length, 2);
});

test("T-013: an ordinary 'value' fact never gets an 'explains' edge, even if it happens to carry `explains`-shaped data elsewhere", async () => {
  const { db, fakeDb } = setup();
  const decision: CounsellorDecision = { approve: true, edits: [citedFact()] };
  await applyApprovedDiff(db, emptyDiff(), decision, "session-1");
  const edges = fakeDb.collection(COLLECTION_NAMES.edges).all() as Array<{ rel: string }>;
  assert.equal(edges.some((e) => e.rel === "explains"), false);
});
