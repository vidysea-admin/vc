/**
 * B12/B8: the runtime Mongo checkpointer is bound to `virtual_counsellor` and
 * never to the URI's default database. Offline: a fake MongoClient records
 * every `.db(name)` call; nothing connects.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { VC_DB_NAME } from "@vc/db";
import { createFakeMongoClient } from "../../db/tests/fakes.js";
import { createScribeCheckpointer } from "../src/scribe/index.js";

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
