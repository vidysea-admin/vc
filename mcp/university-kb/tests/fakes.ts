/**
 * In-process fake for the mongodb driver's Db/Collection surface -- only the
 * subset this package's tests exercise (findOne, find().toArray(), insertOne,
 * seed). No network I/O anywhere in this file (contract B8: tests run
 * offline). This is a package-local copy of the minimal pattern in
 * packages/db/tests/fakes.ts (test files are not imported across packages),
 * extended with `find().toArray()` and array-membership matching (needed for
 * `purposeTags` filters) that packages/db's own fake doesn't need.
 */

type FilterValue = unknown;
type Filter = Record<string, FilterValue>;

function matchesFilter(doc: Record<string, unknown>, filter: Filter): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (expected !== null && typeof expected === "object" && !Array.isArray(expected) && "$exists" in (expected as object)) {
      const exists = doc[key] !== undefined;
      return exists === (expected as { $exists: boolean }).$exists;
    }
    const actual = doc[key];
    if (Array.isArray(actual)) {
      return actual.includes(expected);
    }
    return actual === expected;
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

  find(filter: Filter = {}): { toArray: () => Promise<T[]> } {
    const matched = [...this.docs.values()].filter((doc) =>
      matchesFilter(doc as unknown as Record<string, unknown>, filter),
    );
    return { toArray: async () => matched };
  }

  async insertOne(doc: T): Promise<{ insertedId: string }> {
    if (this.docs.has(doc._id)) {
      throw new Error(`FakeCollection.insertOne: duplicate _id "${doc._id}"`);
    }
    this.docs.set(doc._id, doc);
    return { insertedId: doc._id };
  }

  /** Test setup helper -- seeds a doc directly, bypassing insertOne's duplicate check. */
  seed(doc: T): void {
    this.docs.set(doc._id, doc);
  }

  all(): T[] {
    return [...this.docs.values()];
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
