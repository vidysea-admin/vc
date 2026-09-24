import { test } from "node:test";
import assert from "node:assert/strict";
import { VC_DB_NAME, getVcDb, connectFromEnv } from "../src/client.js";
import { createFakeMongoClient } from "./fakes.js";

test("VC_DB_NAME is virtual_counsellor", () => {
  assert.equal(VC_DB_NAME, "virtual_counsellor");
});

test("getVcDb accepts the default name (virtual_counsellor)", () => {
  const { client } = createFakeMongoClient();
  assert.doesNotThrow(() => getVcDb(client));
});

for (const badName of ["pathlynks", "global_university_db", ""]) {
  test(`B12: getVcDb rejects database name "${badName || "(empty string)"}"`, () => {
    const { client } = createFakeMongoClient();
    assert.throws(() => getVcDb(client, badName), /virtual_counsellor/);
  });
}

test("B12: getVcDb never calls the driver's .db( for a rejected name", () => {
  const { client, dbCalls } = createFakeMongoClient();
  assert.throws(() => getVcDb(client, "pathlynks"));
  assert.deepEqual(dbCalls, [], "the fake's .db( should never have been reached");
});

test("connectFromEnv throws when MONGODB_URL is missing", () => {
  assert.throws(() => connectFromEnv({}), /MONGODB_URL/);
});

test("connectFromEnv ignores a URI-encoded default db name and always requests virtual_counsellor", () => {
  const { client, dbCalls } = createFakeMongoClient();
  const { db } = connectFromEnv({ MONGODB_URL: "mongodb://h:1/otherdb" }, () => client);
  assert.deepEqual(dbCalls, ["virtual_counsellor"]);
  assert.ok(db, "connectFromEnv should return a db handle");
});

test("connectFromEnv never connects to a real MongoClient (the injected factory is used, not `new MongoClient`)", () => {
  const { client, dbCalls } = createFakeMongoClient();
  let factoryCalledWith: string | undefined;
  connectFromEnv({ MONGODB_URL: "mongodb://h:1/otherdb" }, (url) => {
    factoryCalledWith = url;
    return client;
  });
  assert.equal(factoryCalledWith, "mongodb://h:1/otherdb");
  assert.deepEqual(dbCalls, ["virtual_counsellor"]);
});
