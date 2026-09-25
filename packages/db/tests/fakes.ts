/**
 * In-process fakes for the mongodb driver's Db/Collection/MongoClient surface —
 * only the subset this package's tests exercise (findOne, find, insertOne, updateOne,
 * findOneAndUpdate, and for T-011 deleteMany + countDocuments with dotted paths, $in, $or).
 * No network I/O anywhere in this file (contract B8: tests run offline). The
 * `as unknown as <mongodb type>` casts at the bottom are the one place fakes
 * cross into the real driver's type surface; production code never imports
 * from here. Other packages' tests reach it only through the test-only
 * `@vc/db/testing` subpath (src/testing.ts), which src/index.ts never re-exports.
 */

type Filter = Record<string, unknown>;

/** T-011: dotted-path read (`"from.id"`), as the server resolves embedded fields. */
function getPath(doc: Record<string, unknown>, path: string): unknown {
  let current: unknown = doc;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function isOperatorObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((k) => k.startsWith("$"));
}

/**
 * Mongo query semantics for the subset the engine uses: equality (incl. array-contains),
 * dotted paths, `$exists`, `$eq`, `$in`, and top-level `$or` / `$and` (T-011 erasure
 * selectors). Any other operator THROWS, so a test can never pass because the fake
 * silently ignored a filter the real server would apply.
 */
function matchesFilter(doc: Record<string, unknown>, filter: Filter): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") return (expected as Filter[]).some((sub) => matchesFilter(doc, sub));
    if (key === "$and") return (expected as Filter[]).every((sub) => matchesFilter(doc, sub));
    if (key.startsWith("$")) throw new Error(`FakeCollection: unsupported top-level operator ${key}`);
    const actual = getPath(doc, key);
    if (isOperatorObject(expected)) {
      return Object.entries(expected).every(([op, arg]) => {
        switch (op) {
          case "$exists":
            return (actual !== undefined) === arg;
          case "$eq":
            return valueMatches(actual, arg);
          case "$in":
            return (arg as unknown[]).some((candidate) => valueMatches(actual, candidate));
          default:
            throw new Error(`FakeCollection: unsupported query operator ${op}`);
        }
      });
    }
    return valueMatches(actual, expected);
  });
}

/**
 * ISS-t-007-c1-1: Mongo equality semantics for one field. A scalar filter value against an ARRAY
 * field matches when the array contains it (`{purposeTags: "x"}` matches `["x", "y"]`); an array
 * filter value matches an exactly-equal array (order-sensitive) or an array element equal to it.
 * Everything else is strict equality, as before.
 */
function valueMatches(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;
  if (Array.isArray(expected)) {
    const want = JSON.stringify(expected);
    if (JSON.stringify(actual) === want) return true;
    return Array.isArray(actual) && actual.some((el) => JSON.stringify(el) === want);
  }
  return Array.isArray(actual) && actual.some((el) => el === expected);
}

/**
 * D-013: throws on any partialFilterExpression the real server rejects, so an
 * offline test can never again pass against an index `createIndex` would
 * refuse. Per the MongoDB manual (core/index-partial, checked 2026-09-25) a
 * partial filter accepts ONLY: equality (`field: value` or `$eq`),
 * `$exists: true`, `$gt/$gte/$lt/$lte`, `$type`, `$in`, and top-level
 * `$and`/`$or` of those. Everything else — notably `$exists: false` (the
 * server rewrites it to `$not`), `$ne`, `$nin`, `$not`, `$nor`, `$regex`, and
 * `field: null` (which the server also treats as a missing-field match) — is
 * rejected with the server's own wording ("not supported in partial index").
 */
export function assertSupportedPartialFilter(filter: Filter, path = ""): void {
  const reject = (what: string): never => {
    throw new Error(`Expression not supported in partial index: ${what}${path ? ` (at ${path})` : ""}`);
  };
  for (const [field, expected] of Object.entries(filter)) {
    if (field === "$and" || field === "$or") {
      if (!Array.isArray(expected) || expected.length === 0) reject(`${field} must be a non-empty array`);
      (expected as Filter[]).forEach((sub, i) => assertSupportedPartialFilter(sub, `${path}${field}[${i}].`));
      continue;
    }
    if (field.startsWith("$")) reject(field);
    if (expected === null) reject(`${field}: null`);
    if (typeof expected !== "object" || Array.isArray(expected) || expected instanceof Date) continue; // equality
    const ops = Object.entries(expected as Record<string, unknown>);
    if (ops.length === 0 || !ops.every(([op]) => op.startsWith("$"))) continue; // embedded-document equality
    for (const [op, arg] of ops) {
      if (op === "$exists") {
        if (arg !== true) reject(`${field}: {$exists: ${JSON.stringify(arg)}} ($not)`);
      } else if (!["$eq", "$gt", "$gte", "$lt", "$lte", "$type", "$in"].includes(op)) {
        reject(`${field}: {${op}}`);
      }
    }
  }
}

export interface FakeUniqueIndexSpec {
  keys: string[];
  partialFilterExpression?: Filter;
}

/**
 * Mirrors the shape of a real MongoDB duplicate-key error closely enough for
 * production code to branch on `err.code === 11000` the same way it would
 * against the real driver's `MongoServerError` (ISS-019, facts.ts's
 * applyApprovedDiff). Duck-typed on purpose: production code (src/**) never
 * imports from this file, so it can only ever detect this by shape.
 */
export class FakeDuplicateKeyError extends Error {
  readonly code = 11000;
  readonly codeName = "DuplicateKey";
  constructor(message: string) {
    super(message);
    this.name = "FakeDuplicateKeyError";
  }
}

export class FakeCollection<T extends { _id: string }> {
  private readonly docs = new Map<string, T>();
  private readonly uniqueIndexes: FakeUniqueIndexSpec[] = [];

  /**
   * Test-only: declare a unique (optionally partial) index so `insertOne`
   * enforces it the way a real Mongo unique partial index would — throwing a
   * `{code: 11000}` error on a conflicting insert — matching the index this
   * package's scripts/db-init.ts creates on `facts` (ISS-019: unique on
   * {studentId, key} where `validTo` is unset).
   */
  declareUniqueIndex(keys: string[], options: { partialFilterExpression?: Filter } = {}): void {
    // D-013: refuse a filter the real server would refuse at createIndex.
    if (options.partialFilterExpression) assertSupportedPartialFilter(options.partialFilterExpression);
    this.uniqueIndexes.push({ keys, partialFilterExpression: options.partialFilterExpression });
  }

  private assertNoUniqueConflict(doc: T): void {
    const docRecord = doc as unknown as Record<string, unknown>;
    for (const idx of this.uniqueIndexes) {
      if (idx.partialFilterExpression && !matchesFilter(docRecord, idx.partialFilterExpression)) {
        continue; // this doc doesn't fall under the partial index at all
      }
      const conflict = [...this.docs.values()].find((other) => {
        if (other._id === doc._id) return false;
        const otherRecord = other as unknown as Record<string, unknown>;
        if (idx.partialFilterExpression && !matchesFilter(otherRecord, idx.partialFilterExpression)) {
          return false;
        }
        return idx.keys.every((key) => otherRecord[key] === docRecord[key]);
      });
      if (conflict) {
        const keyDesc = idx.keys.map((key) => `${key}: ${JSON.stringify(docRecord[key])}`).join(", ");
        throw new FakeDuplicateKeyError(
          `E11000 duplicate key error collection: fake.${idx.keys.join("_")} index dup key: { ${keyDesc} }`,
        );
      }
    }
  }

  /**
   * Returns a COPY, like the real driver (T-011 cycle 1): returning the stored object let a
   * caller's snapshot silently change under a concurrent writer, which hid (and could fake) CAS
   * races such as ISS-t-011-c0-1.
   */
  async findOne(filter: Filter = {}): Promise<T | null> {
    for (const doc of this.docs.values()) {
      if (matchesFilter(doc as unknown as Record<string, unknown>, filter)) return structuredClone(doc);
    }
    return null;
  }

  /**
   * T-007: the scribe graph reads a student's open facts with
   * `find({studentId, active: true}).toArray()` (the query the unique partial
   * index serves). Mongo equality semantics, like findOne, including array-contains-scalar
   * (ISS-t-007-c1-1: `{purposeTags: purpose}` matches a doc whose purposeTags include it). Returns copies so a
   * caller mutating a result never mutates the stored doc (driver semantics).
   */
  find(filter: Filter = {}): { toArray: () => Promise<T[]> } {
    const matched = [...this.docs.values()]
      .filter((doc) => matchesFilter(doc as unknown as Record<string, unknown>, filter))
      .map((doc) => structuredClone(doc));
    return { toArray: async () => matched };
  }

  async insertOne(doc: T): Promise<{ insertedId: string }> {
    if (this.docs.has(doc._id)) {
      // ISS-t-003b-c1-3: the real driver reports a duplicate _id through the
      // built-in unique _id index, i.e. as code 11000, exactly like any other
      // unique-index violation. A plain Error here hid ISS-t-003b-c1-1.
      throw new FakeDuplicateKeyError(
        `E11000 duplicate key error collection: fake index: _id_ dup key: { _id: ${JSON.stringify(doc._id)} }`,
      );
    }
    this.assertNoUniqueConflict(doc);
    this.docs.set(doc._id, doc);
    return { insertedId: doc._id };
  }

  /**
   * A minimal CAS-capable stand-in for the real driver's findOneAndUpdate:
   * finds the first doc matching `filter`, applies `$set` to it in place, and
   * returns a doc — or `null` if nothing matched, which is what facts.ts's
   * retire-then-insert CAS step (ISS-026) branches on to detect a losing race.
   * Unlike `updateOne` this never upserts.
   *
   * ISS-t-003b-c1-3: matches mongodb@6 (`FindOneAndUpdateOptions.returnDocument`,
   * "The default is 'before'"): it returns a copy of the PRE-image by default
   * and the post-image only when `{returnDocument: "after"}` is passed.
   */
  async findOneAndUpdate(
    filter: Filter,
    update: { $set?: Partial<T>; $unset?: Record<string, unknown> },
    options: { returnDocument?: "before" | "after" } = {},
  ): Promise<T | null> {
    const existing = [...this.docs.values()].find((doc) =>
      matchesFilter(doc as unknown as Record<string, unknown>, filter),
    );
    if (!existing) return null;
    const preImage = structuredClone(existing);
    if (update.$set) Object.assign(existing, update.$set);
    // D-013: `$unset` removes the field entirely (the retire CAS unsets `active`).
    for (const field of Object.keys(update.$unset ?? {})) delete (existing as Record<string, unknown>)[field];
    return options.returnDocument === "after" ? structuredClone(existing) : preImage;
  }

  async updateOne(
    filter: Filter,
    update: { $set?: Partial<T>; $setOnInsert?: T; $unset?: Record<string, unknown> },
    options: { upsert?: boolean } = {},
  ): Promise<{ matchedCount: number; upsertedCount: number; upsertedId: string | null }> {
    const existing = [...this.docs.values()].find((doc) =>
      matchesFilter(doc as unknown as Record<string, unknown>, filter),
    );
    if (existing) {
      if (update.$set) Object.assign(existing, update.$set);
      // T-011 cycle 2: `$unset` removes the field (re-setting an erasure fence clears releaseAfter).
      for (const field of Object.keys(update.$unset ?? {})) delete (existing as Record<string, unknown>)[field];
      return { matchedCount: 1, upsertedCount: 0, upsertedId: null };
    }
    if (!options.upsert) return { matchedCount: 0, upsertedCount: 0, upsertedId: null };
    const seed = update.$setOnInsert ?? ({ ...filter } as unknown as T);
    const _id = (seed as { _id?: string })._id ?? (filter._id as string | undefined);
    if (!_id) throw new Error("FakeCollection.updateOne: upsert requires a resolvable _id");
    const created = { ...seed, _id } as T;
    if (update.$set) Object.assign(created, update.$set);
    this.docs.set(_id, created);
    return { matchedCount: 0, upsertedCount: 1, upsertedId: _id };
  }

  /** T-011: driver-shaped deleteMany (`{acknowledged, deletedCount}`), same filter semantics as find. */
  async deleteMany(filter: Filter = {}): Promise<{ acknowledged: true; deletedCount: number }> {
    let deletedCount = 0;
    for (const [id, doc] of [...this.docs.entries()]) {
      if (matchesFilter(doc as unknown as Record<string, unknown>, filter)) {
        this.docs.delete(id);
        deletedCount += 1;
      }
    }
    return { acknowledged: true, deletedCount };
  }

  /** T-011: the read-back used by the erasure verification pass. */
  async countDocuments(filter: Filter = {}): Promise<number> {
    return [...this.docs.values()].filter((doc) => matchesFilter(doc as unknown as Record<string, unknown>, filter))
      .length;
  }

  all(): T[] {
    return [...this.docs.values()];
  }

  seed(doc: T): void {
    this.docs.set(doc._id, doc);
  }

  size(): number {
    return this.docs.size;
  }
}

export class FakeDb {
  private readonly collections = new Map<string, FakeCollection<{ _id: string }>>();

  /**
   * ISS-t-011-c3-rev-4: db-init.ts's assertServerVersionSupportsPartialIn reads
   * `db.admin().buildInfo().version`. Defaults to a supported version so every OTHER test using
   * createFakeDb() is unaffected; a test targeting the version gate sets this before calling it.
   */
  buildInfoVersion = "7.0.0";

  collection<T extends { _id: string }>(name: string): FakeCollection<T> {
    if (!this.collections.has(name)) {
      this.collections.set(name, new FakeCollection<{ _id: string }>());
    }
    return this.collections.get(name) as unknown as FakeCollection<T>;
  }

  admin(): { buildInfo: () => Promise<{ version: string }> } {
    return { buildInfo: async () => ({ version: this.buildInfoVersion }) };
  }
}

/** A Db-shaped fake, cast to the real `Db` type at this one boundary. */
export function createFakeDb(): { fakeDb: FakeDb; db: import("mongodb").Db } {
  const fakeDb = new FakeDb();
  return { fakeDb, db: fakeDb as unknown as import("mongodb").Db };
}

/**
 * A MongoClient-shaped fake whose `.db(name)` records every name it was asked
 * for (so a test can assert the URI's default db was never used) and returns
 * an independent FakeDb per distinct name, matching real MongoClient.db()
 * semantics closely enough for this package's tests.
 */
export function createFakeMongoClient(): {
  client: import("mongodb").MongoClient;
  dbCalls: string[];
  dbFor: (name: string) => FakeDb;
} {
  const dbCalls: string[] = [];
  const dbsByName = new Map<string, FakeDb>();
  const fakeClient = {
    db(name: string) {
      dbCalls.push(name);
      if (!dbsByName.has(name)) dbsByName.set(name, new FakeDb());
      return dbsByName.get(name) as unknown as import("mongodb").Db;
    },
    connect: async () => fakeClient,
    close: async () => {},
  };
  return {
    client: fakeClient as unknown as import("mongodb").MongoClient,
    dbCalls,
    dbFor: (name: string) => dbsByName.get(name) as FakeDb,
  };
}
