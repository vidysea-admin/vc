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

// ---------------------------------------------------------------------------
// ISS-t-015-c0-4: MONGO_CLIENT_TIMEOUT_MS accepts only a strict decimal integer — bare Number(raw)
// silently accepted hex, exponential notation, fractional ms and surrounding whitespace.
// ---------------------------------------------------------------------------

for (const surprising of ["0x1000", "0X1000", "1e5", "1E5", "30000.5", " 5000", "5000 ", "5 000", "+5000", "5000n", "Infinity", "NaN"]) {
  test(`ISS-t-015-c0-4: MONGO_CLIENT_TIMEOUT_MS rejects surprising-but-Number()-parseable notation "${surprising}"`, () => {
    assert.throws(
      () => connectFromEnv({ MONGODB_URL: "mongodb://h:1/x", MONGO_CLIENT_TIMEOUT_MS: surprising }),
      /MONGO_CLIENT_TIMEOUT_MS must be a plain decimal integer/,
    );
  });
}

test("ISS-t-015-c0-4: a plain decimal integer (no surrounding characters) is still accepted", () => {
  const { client } = createFakeMongoClient();
  let seenOptions: unknown;
  connectFromEnv({ MONGODB_URL: "mongodb://h:1/x", MONGO_CLIENT_TIMEOUT_MS: "12345" }, (url, options) => {
    seenOptions = options;
    return client;
  });
  assert.deepEqual(seenOptions, { timeoutMS: 12345 });
});

// ---------------------------------------------------------------------------
// wire-fix-1 (D-134, contract B12, qa/gates/mongo-host.md): the read-only opener for the one NON-virtual_counsellor database, pathlynks_journey.
// ---------------------------------------------------------------------------

import { openReadOnlyDb, openPathlynksJourney, READ_ONLY_DB_ALLOW_LIST, READ_ONLY_READ_PREFERENCE } from "../src/client.js";

/** A driver-shaped collection that ALSO has every write method, recording all calls, to prove the facade never reaches them. */
function recordingClient() {
  const calls: { db: string; coll: string; method: string; args: unknown[] }[] = [];
  const dbCalls: string[] = [];
  const mk = (db: string, coll: string) => new Proxy({}, {
    get: (_t, method: string) => (...args: unknown[]) => {
      calls.push({ db, coll, method, args });
      if (method === "find" || method === "aggregate") return { toArray: async () => [{ ok: 1 }], map: () => { throw new Error("cursor method leaked"); }, forEach: () => { throw new Error("leaked"); } };
      if (method === "countDocuments") return Promise.resolve(3);
      return Promise.resolve({ acknowledged: true });
    },
  });
  const client = { db(name: string) { dbCalls.push(name); return { collection: (c: string) => mk(name, c), dropDatabase: () => { throw new Error("dropDatabase reached"); } }; } };
  return { client: client as unknown as import("mongodb").MongoClient, calls, dbCalls };
}

test("wire-fix-1: the read-only allow-list holds only pathlynks_journey, and virtual_counsellor is not on it", () => {
  assert.deepEqual([...READ_ONLY_DB_ALLOW_LIST], ["pathlynks_journey"]);
  assert.equal(READ_ONLY_READ_PREFERENCE, "secondaryPreferred");
});

for (const bad of ["virtual_counsellor", "pathlynks", "pathlynks_demo", "global_university_db", "admin", "local", "config", "", "PATHLYNKS_JOURNEY", "pathlynks_journey ", "pathlynks_journey\0", "pathlynks_journey.x"]) {
  test(`wire-fix-1: openReadOnlyDb refuses database ${JSON.stringify(bad)} without ever calling the driver's .db(`, () => {
    const { client, dbCalls } = recordingClient();
    assert.throws(() => openReadOnlyDb(client, bad), /refusing database/);
    assert.deepEqual(dbCalls, []);
  });
}

test("wire-fix-1: openReadOnlyDb refuses a non-string database name", () => {
  const { client, dbCalls } = recordingClient();
  for (const bad of [undefined, null, 5, {}, ["pathlynks_journey"], { toString: () => "pathlynks_journey" }]) assert.throws(() => openReadOnlyDb(client, bad as never), /refusing database/);
  assert.deepEqual(dbCalls, []);
});

test("wire-fix-1: the opened handle has no write methods: collection() exposes exactly find / aggregate / countDocuments, and the db exposes only collection", () => {
  const { client, calls } = recordingClient();
  const db = openPathlynksJourney(client);
  assert.deepEqual(Object.keys(db).sort(), ["collection"]);
  assert.equal(Object.isFrozen(db), true);
  const coll = db.collection("pathlynks_goals") as unknown as Record<string, unknown>;
  assert.deepEqual(Object.keys(coll).sort(), ["aggregate", "countDocuments", "find"]);
  assert.equal(Object.isFrozen(coll), true);
  for (const write of ["insertOne", "insertMany", "updateOne", "updateMany", "replaceOne", "deleteOne", "deleteMany", "findOneAndUpdate", "findOneAndDelete", "bulkWrite", "drop", "createIndex", "dropIndex", "rename", "dropDatabase", "watch", "distinct", "findOne", "estimatedDocumentCount"]) {
    assert.equal((coll as Record<string, unknown>)[write], undefined, write);
    assert.equal((db as unknown as Record<string, unknown>)[write], undefined, write);
  }
  assert.deepEqual(calls, [], "opening and inspecting touched no collection method");
});

test("wire-fix-1: find / aggregate / countDocuments reach the driver with readPreference secondaryPreferred, even if the caller asks for primary", async () => {
  const { client, calls, dbCalls } = recordingClient();
  const coll = openPathlynksJourney(client).collection("pathlynks_goals");
  assert.deepEqual(dbCalls, ["pathlynks_journey"]);
  assert.deepEqual(await coll.find({ studentId: "s1" }, { maxTimeMS: 3000, limit: 5 }).toArray(), [{ ok: 1 }]);
  await coll.find({ studentId: "s1" }, { readPreference: "primary" }).toArray();
  await coll.find({ studentId: "s1" }).toArray();
  await coll.aggregate([{ $match: { studentId: "s1" } }], { readPreference: "primary" }).toArray();
  assert.equal(await coll.countDocuments({ studentId: "s1" }, { readPreference: "primaryPreferred" }), 3);
  assert.deepEqual(calls.map((c) => c.method), ["find", "find", "find", "aggregate", "countDocuments"]);
  for (const c of calls) {
    assert.equal(c.db, "pathlynks_journey");
    assert.equal((c.args.at(-1) as { readPreference?: string }).readPreference, "secondaryPreferred", c.method);
  }
  assert.equal((calls[0]!.args[1] as { maxTimeMS?: number }).maxTimeMS, 3000, "the caller's other options survive");
});

test("wire-fix-1: the cursor returned is toArray-only (no map / forEach / close), and an aggregation with $out or $merge is refused before the driver", async () => {
  const { client, calls } = recordingClient();
  const coll = openPathlynksJourney(client).collection("pathlynks_goals");
  const cursor = coll.find({}) as unknown as Record<string, unknown>;
  assert.deepEqual(Object.keys(cursor), ["toArray"]);
  for (const stage of [{ $out: "x" }, { $merge: { into: "x" } }, { $out: { db: "virtual_counsellor", coll: "x" } }]) {
    assert.throws(() => coll.aggregate([{ $match: {} }, stage]), /write stage/);
  }
  assert.throws(() => coll.aggregate("nope" as never), /pipeline/);
  assert.deepEqual(calls.map((c) => c.method), ["find"], "no aggregate reached the driver");
});

test("wire-fix-1: an optional collection allow-list is enforced, and a collection name that is not a plain name is refused", () => {
  const { client, calls } = recordingClient();
  const db = openPathlynksJourney(client, ["pathlynks_goals"]);
  assert.doesNotThrow(() => db.collection("pathlynks_goals"));
  for (const bad of ["pathlynks_activities", "system.users", "$cmd", "", "pathlynks_goals.x"]) assert.throws(() => db.collection(bad), /refusing collection/);
  assert.throws(() => openPathlynksJourney(client).collection("system.users"), /refusing collection/);
  assert.deepEqual(calls, []);
});

// ---------------------------------------------------------------------------
// tf-fix-2 (re-review Block): the facade ALLOW-LISTS caller options per method; nothing else reaches the driver (AggregateOptions.out would make the driver append $out).
// ---------------------------------------------------------------------------

const HOSTILE_OPTIONS = {
  out: "x",
  merge: { into: "x" },
  writeConcern: { w: 1 },
  bypassDocumentValidation: true,
  session: { fake: true },
  readConcern: { level: "majority" },
  comment: "c",
  let: { a: 1 },
  explain: true,
  hint: undefined,
  $out: "x",
};

test("tf-fix-2: out / merge / writeConcern / bypassDocumentValidation / session never reach the driver on find, aggregate or countDocuments", async () => {
  const { client, calls } = recordingClient();
  const coll = openPathlynksJourney(client).collection("pathlynks_goals");
  await coll.find({}, { ...HOSTILE_OPTIONS, maxTimeMS: 1000 }).toArray();
  await coll.aggregate([{ $match: {} }], { ...HOSTILE_OPTIONS, maxTimeMS: 1000 }).toArray();
  await coll.countDocuments({}, { ...HOSTILE_OPTIONS, maxTimeMS: 1000 });
  assert.deepEqual(calls.map((c) => c.method), ["find", "aggregate", "countDocuments"]);
  for (const c of calls) {
    const received = c.args.at(-1) as Record<string, unknown>;
    for (const bad of ["out", "merge", "writeConcern", "bypassDocumentValidation", "session", "readConcern", "comment", "let", "explain", "$out"]) {
      assert.equal(Object.prototype.hasOwnProperty.call(received, bad), false, `${c.method} leaked ${bad}`);
    }
    assert.equal(received.readPreference, "secondaryPreferred", c.method);
    assert.equal(received.maxTimeMS, 1000, `${c.method} keeps maxTimeMS`);
  }
});

test("tf-fix-2: each method keeps exactly its allow-listed options (find: projection/sort/limit/skip/hint; aggregate: allowDiskUse; countDocuments: limit/skip)", async () => {
  const { client, calls } = recordingClient();
  const coll = openPathlynksJourney(client).collection("pathlynks_goals");
  await coll.find({}, { maxTimeMS: 5, projection: { a: 1 }, sort: { a: 1 }, limit: 2, skip: 1, hint: { a: 1 }, allowDiskUse: true }).toArray();
  await coll.aggregate([{ $match: {} }], { maxTimeMS: 5, allowDiskUse: true, limit: 9, projection: { a: 1 } }).toArray();
  await coll.countDocuments({}, { maxTimeMS: 5, limit: 2, skip: 1, hint: { a: 1 }, allowDiskUse: true });
  const opts = calls.map((c) => c.args.at(-1) as Record<string, unknown>);
  assert.deepEqual(opts[0], { maxTimeMS: 5, projection: { a: 1 }, sort: { a: 1 }, limit: 2, skip: 1, hint: { a: 1 }, readPreference: "secondaryPreferred" });
  assert.deepEqual(opts[1], { maxTimeMS: 5, allowDiskUse: true, readPreference: "secondaryPreferred" });
  assert.deepEqual(opts[2], { maxTimeMS: 5, limit: 2, skip: 1, readPreference: "secondaryPreferred" });
});

test("tf-fix-2: hostile option containers (null, array, inherited keys, getters) cannot smuggle a write option", async () => {
  const { client, calls } = recordingClient();
  const coll = openPathlynksJourney(client).collection("pathlynks_goals");
  const inherited = Object.create({ out: "x", writeConcern: { w: 1 } }) as Record<string, unknown>;
  inherited.maxTimeMS = 7;
  await coll.find({}, null as never).toArray();
  await coll.find({}, ["out"] as never).toArray();
  await coll.aggregate([{ $match: {} }], inherited).toArray();
  await coll.countDocuments({}, "out" as never);
  for (const c of calls) {
    const received = c.args.at(-1) as Record<string, unknown>;
    assert.deepEqual(Object.keys(received).filter((k) => k !== "readPreference" && k !== "maxTimeMS"), [], c.method);
    assert.equal(received.readPreference, "secondaryPreferred");
  }
  assert.equal((calls[2]!.args.at(-1) as Record<string, unknown>).maxTimeMS, 7);
});

test("tf-fix-2: the $out / $merge stage screen still refuses, including a nested-looking key on a non-first stage", () => {
  const { client, calls } = recordingClient();
  const coll = openPathlynksJourney(client).collection("pathlynks_goals");
  for (const stage of [{ $out: "x" }, { $merge: { into: "x" } }]) assert.throws(() => coll.aggregate([{ $match: {} }, { $limit: 1 }, stage], { out: "x" }), /write stage/);
  assert.deepEqual(calls, []);
});

test("checker-final: a write stage hidden in a sub-pipeline ($facet / $lookup / $unionWith) is refused before the driver", () => {
  const { client, calls } = recordingClient();
  const coll = openPathlynksJourney(client).collection("pathlynks_goals");
  for (const stage of [
    { $facet: { a: [{ $match: {} }, { $out: "x" }] } },
    { $lookup: { from: "pathlynks_goals", pipeline: [{ $merge: { into: "x" } }], as: "y" } },
    { $unionWith: { coll: "pathlynks_goals", pipeline: [{ $out: "x" }] } },
  ]) {
    assert.throws(() => coll.aggregate([stage]), /write stage/, JSON.stringify(stage));
  }
  assert.doesNotThrow(() => coll.aggregate([{ $facet: { a: [{ $match: { status: "$out" } }] } }]), "a $out VALUE is not a stage key");
  assert.deepEqual(calls.map((c) => c.method), ["aggregate"]);
});
