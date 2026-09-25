import { test } from "node:test";
import assert from "node:assert/strict";
import { VC_DB_NAME, getVcDb, connectFromEnv, DEFAULT_MONGO_CLIENT_TIMEOUT_MS } from "../src/client.js";
import { FENCE_MARGIN_MS } from "../src/erasure.js";
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

// ---------------------------------------------------------------------------
// T-014 / ISS-t-011-c3-rev-2: the MongoClient timeoutMS backstop.
// ---------------------------------------------------------------------------

test("ISS-t-011-c3-rev-2: DEFAULT_MONGO_CLIENT_TIMEOUT_MS is at most FENCE_MARGIN_MS (D-016)", () => {
  assert.ok(
    DEFAULT_MONGO_CLIENT_TIMEOUT_MS > 0 && DEFAULT_MONGO_CLIENT_TIMEOUT_MS <= FENCE_MARGIN_MS,
    `expected 0 < ${DEFAULT_MONGO_CLIENT_TIMEOUT_MS} <= FENCE_MARGIN_MS (${FENCE_MARGIN_MS})`,
  );
});

test("ISS-t-011-c3-rev-2: connectFromEnv passes {timeoutMS} through to the client factory", () => {
  const { client } = createFakeMongoClient();
  let seenOptions: unknown;
  connectFromEnv({ MONGODB_URL: "mongodb://h:1/otherdb" }, (url, options) => {
    seenOptions = options;
    return client;
  });
  assert.deepEqual(seenOptions, { timeoutMS: DEFAULT_MONGO_CLIENT_TIMEOUT_MS });
});

test("ISS-t-011-c3-rev-2: the OPTION REALLY REACHES the driver — a real (unconnected) MongoClient built by connectFromEnv's default factory reports timeoutMS in its own parsed `.options`, not just an argument some factory received", async () => {
  // No `.connect()` is ever called here — constructing a MongoClient and reading its parsed
  // `.options` is synchronous, local, and network-free (same guarantee client.ts already relies on
  // for `client.db(name)`, contract B8).
  const { client } = connectFromEnv({ MONGODB_URL: "mongodb://localhost:27017/ignored" });
  try {
    assert.equal(
      client.options.timeoutMS,
      DEFAULT_MONGO_CLIENT_TIMEOUT_MS,
      "the real driver's own client options must carry the backstop timeout, as an outcome — not merely what was passed to some intermediate factory",
    );
  } finally {
    await client.close();
  }
});

test("ISS-t-011-c3-rev-2: MONGO_CLIENT_TIMEOUT_MS overrides the default, and the override also reaches the real driver's options", async () => {
  const { client } = connectFromEnv({ MONGODB_URL: "mongodb://localhost:27017/ignored", MONGO_CLIENT_TIMEOUT_MS: "5000" });
  try {
    assert.equal(client.options.timeoutMS, 5000);
  } finally {
    await client.close();
  }
});

for (const bad of ["nope", "0", "-5"]) {
  test(`ISS-t-011-c3-rev-2: connectFromEnv rejects a non-positive-number MONGO_CLIENT_TIMEOUT_MS ("${bad}")`, () => {
    assert.throws(
      () => connectFromEnv({ MONGODB_URL: "mongodb://h:1/x", MONGO_CLIENT_TIMEOUT_MS: bad }),
      /MONGO_CLIENT_TIMEOUT_MS/,
    );
  });
}

// ---------------------------------------------------------------------------
// T-015 / ISS-t-014-c0-2: an override above FENCE_MARGIN_MS is REJECTED (chosen over clamping —
// see resolveClientTimeoutMs's docstring in client.ts), closing the gap the checker found: only the
// DEFAULT used to respect the "<= FENCE_MARGIN_MS" cap; an operator override had none.
// ---------------------------------------------------------------------------

test("ISS-t-014-c0-2: MONGO_CLIENT_TIMEOUT_MS above FENCE_MARGIN_MS is rejected, naming the cap", () => {
  assert.throws(
    () => connectFromEnv({ MONGODB_URL: "mongodb://h:1/x", MONGO_CLIENT_TIMEOUT_MS: String(FENCE_MARGIN_MS + 1) }),
    /FENCE_MARGIN_MS/,
  );
});

test("ISS-t-014-c0-2: a HUGE override (the checker's own repro: 10 days in ms) is rejected, not silently accepted", () => {
  const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
  assert.throws(
    () => connectFromEnv({ MONGODB_URL: "mongodb://h:1/x", MONGO_CLIENT_TIMEOUT_MS: String(tenDaysMs) }),
    /FENCE_MARGIN_MS/,
  );
});

test("ISS-t-014-c0-2: MONGO_CLIENT_TIMEOUT_MS exactly at FENCE_MARGIN_MS (the boundary) is accepted and reaches the driver", () => {
  const { client } = createFakeMongoClient();
  let seenOptions: unknown;
  connectFromEnv({ MONGODB_URL: "mongodb://h:1/x", MONGO_CLIENT_TIMEOUT_MS: String(FENCE_MARGIN_MS) }, (url, options) => {
    seenOptions = options;
    return client;
  });
  assert.deepEqual(seenOptions, { timeoutMS: FENCE_MARGIN_MS });
});

test("ISS-t-014-c0-2: a normal override well within the cap (e.g. 5000ms) is unaffected by the new cap check", () => {
  const { client } = createFakeMongoClient();
  let seenOptions: unknown;
  connectFromEnv({ MONGODB_URL: "mongodb://h:1/x", MONGO_CLIENT_TIMEOUT_MS: "5000" }, (url, options) => {
    seenOptions = options;
    return client;
  });
  assert.deepEqual(seenOptions, { timeoutMS: 5000 });
});
