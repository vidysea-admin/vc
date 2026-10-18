/**
 * Offline, connection-free tests for scripts/db-init.ts's index plan
 * (ISS-027). Importing this module must NOT connect to Mongo (contract B8) —
 * db-init.ts guards its `main()` call behind an entrypoint check so importing
 * it just for `INDEX_PLAN` (a plain data array) is side-effect-free.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  INDEX_PLAN,
  MIN_SERVER_VERSION,
  UnsupportedServerVersionError,
  isServerVersionAtLeast,
  assertServerVersionSupportsPartialIn,
  createPlannedIndexes,
  DB_INIT_CREATE_INDEX_TIMEOUT_MS,
} from "../scripts/db-init.js";
import { DEFAULT_MONGO_CLIENT_TIMEOUT_MS } from "../src/client.js";
import { COLLECTION_NAMES } from "../src/collections.js";
import { FakeCollection, assertSupportedPartialFilter, createFakeDb } from "./fakes.js";

// Every collection whose documents carry a `studentId` field (per
// src/collections.ts's *Doc interfaces) — edges/universities/courses do not.
const STUDENT_ID_COLLECTIONS = [
  COLLECTION_NAMES.facts,
  COLLECTION_NAMES.sessions,
  COLLECTION_NAMES.decisions,
  COLLECTION_NAMES.consents,
  COLLECTION_NAMES.students,
  COLLECTION_NAMES.scribe_resolutions,
  // T-024 / ISS-t-013r-c0-3: every persisted transcript turn carries studentId.
  COLLECTION_NAMES.session_transcripts,
  // T-011: the audit row holds studentId only while the request is open (unset on completion).
  COLLECTION_NAMES.erasure_requests,
  // P1 U8: the student chat collections each carry studentId on every row.
  COLLECTION_NAMES.chat_threads,
  COLLECTION_NAMES.chat_turns,
  COLLECTION_NAMES.profile_facts,
  COLLECTION_NAMES.student_usage,
  COLLECTION_NAMES.student_flags,
];

test("T-035: safety collection lookup indexes lead with tenant then student/session", () => {
  for (const collection of ["escalation_notifications", "crisis_flag_reviews"]) {
    for (const field of ["studentId", "sessionId"]) {
      assert.ok(INDEX_PLAN.some((s) => s.collection === collection && JSON.stringify(s.keys) === JSON.stringify({ tenantId: 1, [field]: 1 })), `${collection}/${field}`);
    }
  }
});

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
  // T-025: tenant-led, so two tenants' open facts never collide.
  assert.deepEqual(factsUnique?.keys, { tenantId: 1, studentId: 1, key: 1 });
  // D-013: MongoDB rejects `$exists: false` in a partialFilterExpression, so
  // open facts carry an explicit `active: true` and the index filters on it.
  assert.deepEqual(factsUnique?.partialFilterExpression, { active: true });
  assert.equal(factsUnique?.name, "facts_tenantId_studentId_key_active_true_unique");

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
  // T-025: one claim per thread PER TENANT (tenant-led key).
  assert.deepEqual(unique?.keys, { tenantId: 1, threadId: 1 });
  assert.equal(unique?.name, "scribe_resolutions_tenantId_threadId_unique");
  assert.equal(unique?.partialFilterExpression, undefined, "the claim must be unique for EVERY doc, not a filtered subset");
});

test("ISS-t-007-rev-8 / T-025: the fake enforces the planned tenant+threadId unique index even when _id differs (11000 on a second claim), and two tenants' claims on the same thread id coexist", async () => {
  const coll = new FakeCollection<{ _id: string; tenantId: string; threadId: string }>();
  const spec = INDEX_PLAN.find((s) => s.collection === COLLECTION_NAMES.scribe_resolutions && s.unique)!;
  coll.declareUniqueIndex(Object.keys(spec.keys));
  await coll.insertOne({ _id: "a", tenantId: "t1", threadId: "scribe:s1" });
  await assert.rejects(coll.insertOne({ _id: "b", tenantId: "t1", threadId: "scribe:s1" }), (err: { code?: number }) => err.code === 11000);
  await coll.insertOne({ _id: "c", tenantId: "t2", threadId: "scribe:s1" });
  assert.equal(coll.size(), 2);
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

test("T-011 / D-016: the erasure_requests audit log has a status index and exactly ONE unique index: studentKey among OPEN requests (pending/confirmed/awaiting_approval/approved/failed), with a server-supported partial filter", () => {
  const specs = INDEX_PLAN.filter((s) => s.collection === COLLECTION_NAMES.erasure_requests);
  assert.ok(specs.some((s) => Object.keys(s.keys)[0] === "status"));
  const unique = specs.filter((s) => s.unique);
  assert.deepEqual(
    unique.map((s) => [s.name, s.keys, s.partialFilterExpression]),
    [
      [
        "erasure_requests_open_tenantId_studentKey_unique",
        { tenantId: 1, studentKey: 1 },
        { status: { $in: ["pending", "confirmed", "awaiting_approval", "approved", "failed"] } },
      ],
    ],
  );
  assertSupportedPartialFilter(unique[0]!.partialFilterExpression!); // D-013: $in is allowed, $exists:false/$ne are not
});

test("T-011 / D-016 (ISS-t-011-c2-rev-3): erasure_fences has NO redundant studentKey index (the fence _id IS the key; lookups use _id)", () => {
  assert.equal(COLLECTION_NAMES.erasure_fences, "erasure_fences");
  const specs = INDEX_PLAN.filter((s) => s.collection === COLLECTION_NAMES.erasure_fences);
  assert.deepEqual(specs, []);
});

// ---------------------------------------------------------------------------
// T-014 / ISS-t-011-c3-rev-4: db-init checks the server's version supports the erasure_requests
// index's "$in" partial filter (MongoDB 6.0+, D-013) BEFORE creating anything, instead of failing
// deep inside the createIndex loop with a server error that never names the real cause.
// ---------------------------------------------------------------------------

test("isServerVersionAtLeast compares NUMERICALLY, not lexicographically (6.10 >= 6.9, 6.2 < 6.10)", () => {
  assert.ok(isServerVersionAtLeast("6.10.0", "6.9.0"), "6.10.0 >= 6.9.0");
  assert.ok(!isServerVersionAtLeast("6.2.0", "6.10.0"), "6.2.0 < 6.10.0 (a lexicographic compare would get this backwards)");
  assert.ok(isServerVersionAtLeast("6.0.0", "6.0.0"), "equal versions satisfy >=");
  assert.ok(!isServerVersionAtLeast("5.9.9", "6.0.0"));
  assert.ok(isServerVersionAtLeast("7.0.4"), "defaults to MIN_SERVER_VERSION when `required` is omitted");
});

test("ISS-t-011-c3-rev-4: assertServerVersionSupportsPartialIn throws UnsupportedServerVersionError against a server below MongoDB 6.0 (the fake's buildInfo)", async () => {
  const { db, fakeDb } = createFakeDb();
  fakeDb.buildInfoVersion = "4.4.20";
  await assert.rejects(assertServerVersionSupportsPartialIn(db), (err: unknown) => {
    assert.ok(err instanceof UnsupportedServerVersionError, `expected UnsupportedServerVersionError, got ${String(err)}`);
    assert.equal(err.version, "4.4.20");
    assert.equal(err.required, MIN_SERVER_VERSION);
    assert.match(err.message, /\$in/);
    return true;
  });
});

test("ISS-t-011-c3-rev-4: assertServerVersionSupportsPartialIn does not throw for a server at or above MongoDB 6.0", async () => {
  const { db, fakeDb } = createFakeDb();
  for (const version of ["6.0.0", "6.0.1", "7.0.4", "8.2.1"]) {
    fakeDb.buildInfoVersion = version;
    await assertServerVersionSupportsPartialIn(db); // must not throw
  }
});

test("ISS-t-011-c3-rev-4: an unreadable/missing buildInfo.version is treated as unsupported (fails closed, not open)", async () => {
  const { db, fakeDb } = createFakeDb();
  fakeDb.buildInfoVersion = undefined as unknown as string; // simulate a malformed buildInfo response
  await assert.rejects(assertServerVersionSupportsPartialIn(db), UnsupportedServerVersionError);
});

// ---------------------------------------------------------------------------
// T-015 / ISS-t-014-rev-1: db-init's createIndex gets an explicit per-op timeoutMS, larger than the
// client-level default (D-016's fence margin, sized for a fenced writer's post-check, not an index
// build). createPlannedIndexes is the loop split out of main() so it is testable offline (B8) — it
// is never run against a real server here, only against the fake, which records what it was called
// with.
// ---------------------------------------------------------------------------

test("ISS-t-014-rev-1: DB_INIT_CREATE_INDEX_TIMEOUT_MS is larger than the client-level default (D-016's fence margin)", () => {
  assert.ok(
    DB_INIT_CREATE_INDEX_TIMEOUT_MS > DEFAULT_MONGO_CLIENT_TIMEOUT_MS,
    `expected ${DB_INIT_CREATE_INDEX_TIMEOUT_MS} > ${DEFAULT_MONGO_CLIENT_TIMEOUT_MS}`,
  );
});

test("ISS-t-014-rev-1: createPlannedIndexes passes {timeoutMS: DB_INIT_CREATE_INDEX_TIMEOUT_MS} to EVERY createIndex call (the fake records the options it received)", async () => {
  const { db, fakeDb } = createFakeDb();
  await createPlannedIndexes(db, INDEX_PLAN);
  assert.ok(INDEX_PLAN.length > 0, "fixture sanity: there is something to assert on");
  for (const spec of INDEX_PLAN) {
    const collection = fakeDb.collection<{ _id: string }>(spec.collection);
    const call = collection.createIndexCalls.find((c) => c.options?.name === spec.name);
    assert.ok(call, `expected a createIndex call named "${spec.name}" on "${spec.collection}"`);
    assert.equal(call!.options?.timeoutMS, DB_INIT_CREATE_INDEX_TIMEOUT_MS, `createIndex(${spec.name})`);
    assert.deepEqual(call!.keys, spec.keys, `createIndex(${spec.name}) keys must match the plan`);
  }
});

test("ISS-t-014-rev-1: createPlannedIndexes defaults to INDEX_PLAN when no plan is passed", async () => {
  const { db, fakeDb } = createFakeDb();
  await createPlannedIndexes(db);
  const spec = INDEX_PLAN[0]!;
  const collection = fakeDb.collection<{ _id: string }>(spec.collection);
  assert.ok(collection.createIndexCalls.some((c) => c.options?.name === spec.name));
});

test("ISS-t-014-rev-1 falsification: a createIndex call WITHOUT the timeoutMS override does not satisfy the assertion above (sanity check on the test itself)", async () => {
  const { fakeDb } = createFakeDb();
  const collection = fakeDb.collection<{ _id: string }>(COLLECTION_NAMES.facts);
  await collection.createIndex({ studentId: 1 }, { name: "no_timeout_here" });
  const call = collection.createIndexCalls.find((c) => c.options?.name === "no_timeout_here");
  assert.ok(call);
  assert.notEqual(call!.options?.timeoutMS, DB_INIT_CREATE_INDEX_TIMEOUT_MS, "confirms the fake does not inject the option itself — createPlannedIndexes must");
});

// ---------------------------------------------------------------------------
// T-024 / ISS-t-013r-c0-3 (D-020 "puri chat bhi save rehegi"): the transcript and the checkpoint
// collections must never expire on their own. A TTL index (expireAfterSeconds) — or a TTL option
// handed to MongoDBSaver — would silently delete the chat that every fact's citation points into,
// outside any B15 erasure. Two guards: the index plan itself, and a repo-wide source scanner.
// ---------------------------------------------------------------------------

const NEVER_TTL_COLLECTIONS: readonly string[] = [
  COLLECTION_NAMES.session_transcripts,
  COLLECTION_NAMES.scribe_checkpoints,
  COLLECTION_NAMES.scribe_checkpoint_writes,
];

test("ISS-t-013r-c0-3: the transcript is a planned collection with a studentId index, and NO index on the transcript or checkpoint collections carries a TTL", () => {
  assert.ok(INDEX_PLAN.some((s) => s.collection === COLLECTION_NAMES.session_transcripts && Object.keys(s.keys)[0] === "studentId"));
  for (const spec of INDEX_PLAN.filter((s) => NEVER_TTL_COLLECTIONS.includes(s.collection))) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(spec, "expireAfterSeconds"),
      false,
      `${spec.collection}.${spec.name} must never be a TTL index (D-020)`,
    );
  }
});

/** A TTL index option or a TTL option for the checkpointer, in any source form. */
const TTL_PATTERN = /expireAfterSeconds|expire_after_seconds|\bttl\s*[:=]/i;

function containsTtl(content: string): boolean {
  return TTL_PATTERN.test(content);
}

const TTL_SCAN_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
const TTL_SCAN_DIRS = ["packages", "apps", "mcp"];
const TTL_SKIP_DIRS = new Set(["node_modules", "dist", "tests", "evals"]);

function listSourceFilesForTtl(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (TTL_SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) listSourceFilesForTtl(full, out);
    else if (/\.(ts|mts|cts|tsx|js|mjs|cjs)$/.test(entry) && !/\.(test|spec)\./.test(entry)) out.push(full);
  }
  return out;
}

test("ISS-t-013r-c0-3 scanner: no source file under packages/, apps/ or mcp/ declares a TTL (expireAfterSeconds / a ttl option) — the transcript and checkpoints never expire", () => {
  const files = TTL_SCAN_DIRS.flatMap((d) => listSourceFilesForTtl(join(TTL_SCAN_ROOT, d)));
  assert.ok(files.some((f) => f.replace(/\\/g, "/").endsWith("packages/db/scripts/db-init.ts")), "sanity: the scanner reaches db-init.ts");
  assert.ok(files.some((f) => f.replace(/\\/g, "/").endsWith("packages/engine/src/scribe/checkpointer.ts")), "sanity: the scanner reaches checkpointer.ts");
  const offenders = files.filter((f) => containsTtl(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, [], `a TTL was declared; D-020 keeps the full chat until a B15 erasure: ${offenders.join(", ")}`);
});

test("ISS-t-013r-c0-3 scanner falsification: the TTL pattern catches the forms a TTL would take", () => {
  assert.equal(containsTtl(`createIndex({ ts: 1 }, { expireAfterSeconds: 86400 })`), true);
  assert.equal(containsTtl(`{ collection: "session_transcripts", keys: { ts: 1 }, name: "x", expireAfterSeconds: 60 }`), true);
  assert.equal(containsTtl(`new MongoDBSaver({ client, ttl: 3600 })`), true);
  assert.equal(containsTtl(`const opts = { TTL: 5 }`), true);
  assert.equal(containsTtl(`const settled = true; // a subtle title`), false);
});

// ---------------------------------------------------------------------------
// T-025 (B21 tenancy): a UNIQUE index that does not lead with tenantId makes one tenant's write
// collide with another tenant's document (11000): an existence oracle and a write-blocker across
// tenants. Every unique index in the plan therefore leads with tenantId.
// ---------------------------------------------------------------------------

test("T-025: every UNIQUE index in INDEX_PLAN leads with tenantId (per-tenant uniqueness, INDEX_PLAN)", () => {
  const unique = INDEX_PLAN.filter((s) => s.unique);
  assert.ok(unique.length >= 3, "sanity: facts, scribe_resolutions and erasure_requests have unique indexes");
  for (const spec of unique) {
    assert.equal(Object.keys(spec.keys)[0], "tenantId", `${spec.name} must lead with tenantId`);
    assert.match(spec.name, /tenantId/, `${spec.name}: the name changed with the keys (a live DB drops the old one first, human-gated)`);
  }
});

test("T-025: the fake enforces the tenant-led facts index: the same open (studentId, key) in two tenants coexists, a duplicate within one tenant is 11000", async () => {
  const coll = new FakeCollection<{ _id: string; tenantId: string; studentId: string; key: string; active: true }>();
  const spec = INDEX_PLAN.find((s) => s.collection === COLLECTION_NAMES.facts && s.unique)!;
  coll.declareUniqueIndex(Object.keys(spec.keys), { partialFilterExpression: spec.partialFilterExpression });
  await coll.insertOne({ _id: "a", tenantId: "t1", studentId: "s", key: "k", active: true });
  await coll.insertOne({ _id: "b", tenantId: "t2", studentId: "s", key: "k", active: true });
  await assert.rejects(
    coll.insertOne({ _id: "c", tenantId: "t1", studentId: "s", key: "k", active: true }),
    (err: { code?: number }) => err.code === 11000,
  );
  assert.equal(coll.size(), 2);
});
