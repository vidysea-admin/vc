/**
 * B12/B8: the runtime Mongo checkpointer is bound to `virtual_counsellor` and
 * never to the URI's default database. Offline: a fake MongoClient records
 * every `.db(name)` call; nothing connects.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { COLLECTION_NAMES, VC_DB_NAME, tenantScopedDb, tenantScopedClient } from "@vc/db";
import { createFakeMongoClient, INDEX_PLAN } from "@vc/db/testing";
import {
  compileScribeGraph,
  createScribeCheckpointer,
  initScribeCheckpointer,
  resumeScribe,
  startScribe,
} from "../src/scribe/index.js";
import { baseInput, mockProvider, seedConsent, SKILLS_DIR } from "./scribe-fixtures.js";

function fakeClientWithMetadata() {
  const fake = createFakeMongoClient();
  let connected = false;
  const client = fake.client as unknown as Record<string, unknown>;
  client.appendMetadata = () => {};
  client.connect = async () => {
    connected = true;
    return client;
  };
  return { ...fake, wasConnected: () => connected };
}

test("B12: createScribeCheckpointer opens only virtual_counsellor on the client, and never connects", () => {
  const fake = fakeClientWithMetadata();
  const saver = createScribeCheckpointer(fake.client);
  assert.ok(saver instanceof MongoDBSaver);
  assert.ok(fake.dbCalls.length >= 1);
  assert.ok(fake.dbCalls.every((name) => name === VC_DB_NAME), `db calls: ${fake.dbCalls.join(", ")}`);
  assert.equal(fake.wasConnected(), false, "construction must not open a socket (B8)");
});

test("B12: the checkpointer collections are the engine's own, named inside virtual_counsellor", () => {
  const fake = fakeClientWithMetadata();
  const saver = createScribeCheckpointer(fake.client);
  assert.equal(saver.checkpointCollectionName, "scribe_checkpoints");
  assert.equal(saver.checkpointWritesCollectionName, "scribe_checkpoint_writes");
});

// ---------------------------------------------------------------------------
// T-016 / ISS-t-007-rev-6: the saver's setup() really runs, and matches db-init's plan
// ---------------------------------------------------------------------------

test("ISS-t-007-rev-6: initScribeCheckpointer runs the REAL MongoDBSaver.setup(), and its indexes are exactly db-init's INDEX_PLAN entries", async () => {
  const fake = createFakeMongoClient();
  const saver = await initScribeCheckpointer(fake.client);
  assert.ok(saver instanceof MongoDBSaver);
  const db = fake.dbFor(VC_DB_NAME);
  for (const name of [COLLECTION_NAMES.scribe_checkpoints, COLLECTION_NAMES.scribe_checkpoint_writes]) {
    const created = db.collection<{ _id: string }>(name).createIndexCalls.map((c) => ({ keys: c.keys, name: c.options?.name }));
    const planned = INDEX_PLAN.filter((s) => s.collection === name).map((s) => ({ keys: s.keys, name: s.name }));
    assert.ok(created.length > 0, `setup() created an index on ${name}`);
    assert.deepEqual(created, planned, `db-init mirrors setup() on ${name} (same keys, same name, same key order)`);
    for (const spec of INDEX_PLAN.filter((s) => s.collection === name)) {
      assert.deepEqual(Object.keys(spec.keys), Object.keys(created[0]!.keys), "key ORDER matches (a compound index is order-sensitive)");
    }
  }
  assert.ok(fake.dbCalls.every((n) => n === VC_DB_NAME));
});

test("ISS-t-007-rev-6: initScribeCheckpointer FAILS LOUDLY when setup() reports an index error (MongoDBSaver.setup returns errors, it does not throw)", async () => {
  const fake = createFakeMongoClient();
  const db = fake.client.db(VC_DB_NAME) as unknown as import("@vc/db/testing").FakeDb;
  db.collection<{ _id: string }>(COLLECTION_NAMES.scribe_checkpoints).createIndex = async () => {
    throw new Error("IndexOptionsConflict (simulated)");
  };
  await assert.rejects(initScribeCheckpointer(fake.client), /IndexOptionsConflict/);
});

test("ISS-t-007-rev-6 / B14: the REAL MongoDBSaver persists a scribe run into the fake db; a FRESH saver on the same db reads the paused thread back and completes it", async () => {
  const fake = createFakeMongoClient();
  const db = tenantScopedDb(fake.client.db(VC_DB_NAME), "scribe-test");
  const fakeDb = fake.dbFor(VC_DB_NAME);
  for (const spec of INDEX_PLAN) {
    if (spec.unique) fakeDb.collection<{ _id: string }>(spec.collection).declareUniqueIndex(Object.keys(spec.keys), { partialFilterExpression: spec.partialFilterExpression });
  }
  seedConsent(fakeDb.collection(COLLECTION_NAMES.consents), { _id: "scribe-test:consent-student-synthetic-1", tenantId: "scribe-test" } as never);
  const deps = { db, provider: mockProvider(), skillsDir: SKILLS_DIR };
  const first = compileScribeGraph(deps, { checkpointer: createScribeCheckpointer(tenantScopedClient(fake.client, "scribe-test")) });
  const started = await startScribe(first, baseInput(), { threadId: "thread-durable" });
  assert.equal(started.kind, "awaiting_approval");
  const stored = fakeDb.collection<{ _id: string; thread_id?: string }>(COLLECTION_NAMES.scribe_checkpoints).all();
  assert.ok(stored.some((d) => d.thread_id === "thread-durable"), "checkpoints are in scribe_checkpoints");

  // A new process: a fresh saver + graph over the same database.
  const second = compileScribeGraph(deps, { checkpointer: createScribeCheckpointer(tenantScopedClient(fake.client, "scribe-test")) });
  const done = await resumeScribe(second, { action: "approve" }, { threadId: "thread-durable" });
  assert.equal(done.kind === "done" && done.result.status, "written");
  assert.equal(fakeDb.collection<{ _id: string; active?: boolean }>(COLLECTION_NAMES.facts).all().filter((f) => f.active).length, 2);
});
