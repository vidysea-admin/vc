/**
 * In-process fakes for the mongodb driver's Db/Collection/MongoClient surface —
 * only the subset this package's tests exercise (findOne, insertOne, updateOne).
 * No network I/O anywhere in this file (contract B8: tests run offline). The
 * `as unknown as <mongodb type>` casts at the bottom are the one place fakes
 * cross into the real driver's type surface; production code (src/**) never
 * imports from here.
 */

type Filter = Record<string, unknown>;

function matchesFilter(doc: Record<string, unknown>, filter: Filter): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (expected !== null && typeof expected === "object" && "$exists" in (expected as object)) {
      const exists = doc[key] !== undefined;
      return exists === (expected as { $exists: boolean }).$exists;
    }
    return doc[key] === expected;
  });
}

export class FakeCollection<T extends { _id: string }> {
  private readonly docs = new Map<string, T>();

  async findOne(filter: Filter = {}): Promise<T | null> {
    for (const doc of this.docs.values()) {
      if (matchesFilter(doc as unknown as Record<string, unknown>, filter)) return doc;
    }
    return null;
  }

  async insertOne(doc: T): Promise<{ insertedId: string }> {
    if (this.docs.has(doc._id)) {
      throw new Error(`FakeCollection.insertOne: duplicate _id "${doc._id}"`);
    }
    this.docs.set(doc._id, doc);
    return { insertedId: doc._id };
  }

  async updateOne(
    filter: Filter,
    update: { $set?: Partial<T>; $setOnInsert?: T },
    options: { upsert?: boolean } = {},
  ): Promise<{ matchedCount: number; upsertedId: string | null }> {
    const existing = [...this.docs.values()].find((doc) =>
      matchesFilter(doc as unknown as Record<string, unknown>, filter),
    );
    if (existing) {
      if (update.$set) Object.assign(existing, update.$set);
      return { matchedCount: 1, upsertedId: null };
    }
    if (!options.upsert) return { matchedCount: 0, upsertedId: null };
    const seed = update.$setOnInsert ?? ({ ...filter } as unknown as T);
    const _id = (seed as { _id?: string })._id ?? (filter._id as string | undefined);
    if (!_id) throw new Error("FakeCollection.updateOne: upsert requires a resolvable _id");
    const created = { ...seed, _id } as T;
    if (update.$set) Object.assign(created, update.$set);
    this.docs.set(_id, created);
    return { matchedCount: 0, upsertedId: _id };
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

  collection<T extends { _id: string }>(name: string): FakeCollection<T> {
    if (!this.collections.has(name)) {
      this.collections.set(name, new FakeCollection<{ _id: string }>());
    }
    return this.collections.get(name) as unknown as FakeCollection<T>;
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
