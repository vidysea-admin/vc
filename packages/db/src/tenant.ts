/**
 * T-025 (contract B21, D-021): tenant scoping for every read and write of the engine.
 *
 * New file, on purpose: no existing module owned "which tenant does this Db act for". Every
 * @vc/db / @vc/engine function already takes a `Db` and calls `collection(name)` on it, so the
 * narrowest place to make tenancy impossible to forget is the Db itself. `tenantScopedDb(db, t)`
 * returns a Db-shaped wrapper that exposes ONLY `collection(...)`, and each wrapped collection
 * exposes only the operations the engine uses. Everything else throws TenantScopeError (fail
 * closed): an operation this file does not understand is never forwarded unscoped.
 *
 * What the wrapper does, per operation:
 *   - Every filter (find, findOne, countDocuments, updateOne, findOneAndUpdate, deleteMany, and
 *     bulkWrite's filters) gets `tenantId: <t>` added at the top level. A filter that names a
 *     DIFFERENT tenantId, or uses tenantId with an operator, throws.
 *   - Every document written carries `tenantId: <t>`: an insert stamps it, an upsert gets it from
 *     the filter's equality (the server seeds an upserted document from the filter's equality
 *     fields). An update that touches `tenantId` throws.
 *   - String `_id`s are stored as `<t>:<id>` and read back as `<id>`. Many engine ids are derived
 *     from caller input (the session id, `<sessionId>:<turnId>` transcript turns, the hashed
 *     erasure-fence key, the claim's thread id, the reject-reason audit id, edge ids). Without the
 *     prefix, tenant A writing a session id that tenant B already used would collide on the
 *     built-in unique `_id` index and get 11000: an existence oracle across tenants, and a way to
 *     block the other tenant's writes. With the prefix, both tenants' documents coexist.
 *     Qualification covers `_id: "x"`, `_id: {$eq}`, `_id: {$in: [...]}` (also inside `$or` /
 *     `$and`) and `$setOnInsert: {_id}`. Any other `_id` operator, a dotted `_id.` path, or a
 *     `$set` of `_id` throws.
 *   - Reads strip `tenantId` and the `<t>:` prefix, so callers see exactly the documents they saw
 *     before tenancy existed.
 *   - Only `$or` / `$and` are allowed as top-level query operators; `$expr`, `$where`, `$nor`,
 *     `$text` and every other one throws (they could reach fields this wrapper can not reason about).
 *
 * Legacy documents (written before T-025, so without `tenantId`) are never matched by a scoped
 * filter, so a tenant can not read, adopt, change or delete them. Rule: REFUSE, never auto-adopt.
 * Assigning them to a tenant is a separate, human-gated backfill; this unit neither writes nor runs one.
 *
 * `tenantScopedClient(client, t)` (in client.ts, the one module that opens databases; keeping it
 * there also keeps this file free of imports, so erasure.ts -> tenant.ts forms no cycle) is the MongoClient-shaped facade LangGraph's checkpoint saver
 * needs (it opens its database from the client itself): it hands out tenant-scoped Dbs, through
 * getVcDb (so B12's one-database guard still applies), and forwards appendMetadata. Nothing else.
 *
 * This file performs no I/O by itself: it only forwards the caller's operations. Every module that
 * writes through it is itself a fence-aware writer (packages/db/tests/db-scope.test.ts).
 */
import type { Collection, Db, Document } from "mongodb";

/** The field stamped on every tenant-owned document. */
export const TENANT_FIELD = "tenantId";

/**
 * A tenant id: 1-64 characters, letters, digits, `_` and `-`, starting with a letter or digit. No
 * `:` (it is the `_id` prefix separator), no `.` or `$` (Mongo field-path metacharacters).
 */
export const TENANT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export class TenantScopeError extends Error {
  constructor(message: string) {
    super(`TenantScopeError: ${message}`);
    this.name = "TenantScopeError";
  }
}

/** Returns the tenant id if it is well-formed, else throws TenantScopeError. */
export function assertTenantId(tenantId: unknown): string {
  if (typeof tenantId !== "string" || !TENANT_ID_PATTERN.test(tenantId)) {
    throw new TenantScopeError("the tenant id must be 1-64 characters of [A-Za-z0-9_-], starting with a letter or digit");
  }
  return tenantId;
}

const scopedTenants = new WeakMap<object, string>();

/** The tenant a Db was scoped to by tenantScopedDb, or undefined for an unscoped (system) Db. */
export function tenantIdOf(db: Db): string | undefined {
  return scopedTenants.get(db as unknown as object);
}

type Doc = Record<string, unknown>;

function isPlainObject(value: unknown): value is Doc {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function qualifyId(tenantId: string, id: unknown): unknown {
  return typeof id === "string" ? `${tenantId}:${id}` : id;
}

function unqualifyId(tenantId: string, id: unknown): unknown {
  const prefix = `${tenantId}:`;
  return typeof id === "string" && id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

function scopeIdCondition(tenantId: string, condition: unknown): unknown {
  if (!isPlainObject(condition)) return qualifyId(tenantId, condition);
  const ops = Object.keys(condition);
  if (ops.length === 0 || !ops.every((op) => op.startsWith("$"))) {
    throw new TenantScopeError("an embedded-document `_id` condition is not supported through a tenant scope");
  }
  const out: Doc = {};
  for (const [op, arg] of Object.entries(condition)) {
    if (op === "$eq") out.$eq = qualifyId(tenantId, arg);
    else if (op === "$in") {
      if (!Array.isArray(arg)) throw new TenantScopeError("`_id: {$in}` needs an array");
      out.$in = arg.map((id) => qualifyId(tenantId, id));
    } else {
      throw new TenantScopeError(`the \`_id\` operator ${op} is not supported through a tenant scope`);
    }
  }
  return out;
}

function scopeBranch(tenantId: string, filter: unknown): Doc {
  if (!isPlainObject(filter)) throw new TenantScopeError("a filter must be a plain object");
  const out: Doc = {};
  for (const [key, value] of Object.entries(filter)) {
    if (key === "$or" || key === "$and") {
      if (!Array.isArray(value) || value.length === 0) throw new TenantScopeError(`${key} needs a non-empty array`);
      out[key] = value.map((branch) => scopeBranch(tenantId, branch));
    } else if (key.startsWith("$")) {
      throw new TenantScopeError(`the query operator ${key} is not allowed through a tenant scope`);
    } else if (key === "_id") {
      out._id = scopeIdCondition(tenantId, value);
    } else if (key.startsWith("_id.")) {
      throw new TenantScopeError("a dotted `_id.` path is not supported through a tenant scope");
    } else if (key === TENANT_FIELD) {
      if (value !== tenantId) throw new TenantScopeError("a filter may not name another tenant (or use an operator on tenantId)");
      out[key] = value;
    } else if (key.startsWith(`${TENANT_FIELD}.`)) {
      throw new TenantScopeError("a dotted tenantId path is not allowed");
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** The caller's filter restricted to the tenant (exported for tests and for reasoning in one place). */
export function scopeFilter(tenantId: string, filter: unknown = {}): Doc {
  return { ...scopeBranch(tenantId, filter ?? {}), [TENANT_FIELD]: tenantId };
}

/** The caller's update with `$setOnInsert._id` qualified; anything that could move a document across tenants throws. */
export function scopeUpdate(tenantId: string, update: unknown): Doc {
  if (Array.isArray(update)) throw new TenantScopeError("an aggregation-pipeline update is not supported through a tenant scope");
  if (!isPlainObject(update)) throw new TenantScopeError("an update must be a plain object");
  const ops = Object.keys(update);
  if (ops.length === 0 || !ops.every((op) => op.startsWith("$"))) {
    throw new TenantScopeError("a replacement document is not supported through a tenant scope (use update operators)");
  }
  const out: Doc = {};
  for (const [op, fields] of Object.entries(update)) {
    if (op === "$rename") throw new TenantScopeError("$rename is not supported through a tenant scope");
    if (!isPlainObject(fields)) throw new TenantScopeError(`${op} needs a plain object`);
    const scoped: Doc = {};
    for (const [path, value] of Object.entries(fields)) {
      if (path === TENANT_FIELD || path.startsWith(`${TENANT_FIELD}.`)) {
        throw new TenantScopeError("an update may not change tenantId");
      }
      if (path === "_id" && op === "$setOnInsert") {
        scoped._id = qualifyId(tenantId, value);
        continue;
      }
      if (path === "_id" || path.startsWith("_id.")) throw new TenantScopeError(`${op} may not change _id`);
      scoped[path] = value;
    }
    out[op] = scoped;
  }
  return out;
}

/** A document stamped for insert: tenantId set, a string `_id` qualified. */
export function stampDocument(tenantId: string, doc: unknown): Doc {
  if (!isPlainObject(doc)) throw new TenantScopeError("an inserted document must be a plain object");
  if (TENANT_FIELD in doc && doc[TENANT_FIELD] !== tenantId) throw new TenantScopeError("a document may not carry another tenant's id");
  const out: Doc = { ...doc, [TENANT_FIELD]: tenantId };
  if ("_id" in doc) out._id = qualifyId(tenantId, doc._id);
  return out;
}

/** A document read through the scope: tenantId removed, `_id` unqualified. */
/** A raw document as its tenant sees it: tenantId removed, `_id` unqualified. Throws for another tenant's. */
export function stripDocument<T>(tenantId: string, doc: T): T {
  if (!isPlainObject(doc)) return doc;
  const { [TENANT_FIELD]: owner, ...rest } = doc as Doc;
  if (owner !== undefined && owner !== tenantId) {
    // Unreachable while every filter carries tenantId; kept so a future bug fails loudly.
    throw new TenantScopeError("a read returned another tenant's document");
  }
  if ("_id" in rest) rest._id = unqualifyId(tenantId, rest._id);
  return rest as unknown as T;
}

/**
 * Names a caller (or a runtime such as `await`, `console.log` or JSON.stringify) may probe on any
 * object; they read as undefined instead of throwing, so the wrapper is not mistaken for a thenable
 * and still prints.
 */
const PROBED_NAMES = new Set(["then", "catch", "toJSON", "constructor", "inspect", "nodeType", "asymmetricMatch", "$$typeof"]);

/** Exposes only `target`'s own members; any other name throws (fail closed). Assignment throws. */
export function failClosed<T extends object>(target: T, label: string): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (typeof prop === "symbol" || Object.prototype.hasOwnProperty.call(t, prop)) return Reflect.get(t, prop, receiver);
      if (PROBED_NAMES.has(prop)) return undefined;
      throw new TenantScopeError(`${label}.${prop} is not available through a tenant scope`);
    },
    set(_t, prop) {
      throw new TenantScopeError(`${label}.${String(prop)} can not be assigned through a tenant scope`);
    },
    defineProperty(_t, prop) {
      throw new TenantScopeError(`${label}.${String(prop)} can not be defined through a tenant scope`);
    },
    deleteProperty(_t, prop) {
      throw new TenantScopeError(`${label}.${String(prop)} can not be deleted through a tenant scope`);
    },
  });
}

interface CursorLike {
  sort(...args: unknown[]): CursorLike;
  limit(n: number): CursorLike;
  skip?(n: number): CursorLike;
  project?(projection: unknown): CursorLike;
  toArray(): Promise<unknown[]>;
  next?(): Promise<unknown>;
  close?(): Promise<void>;
  [Symbol.asyncIterator](): AsyncIterator<unknown>;
}

function scopedCursor(tenantId: string, cursor: CursorLike): unknown {
  let inner = cursor;
  const api = {
    sort(...args: unknown[]) {
      inner = inner.sort(...args);
      return guarded;
    },
    limit(n: number) {
      inner = inner.limit(n);
      return guarded;
    },
    skip(n: number) {
      if (!inner.skip) throw new TenantScopeError("cursor.skip is not supported by this driver");
      inner = inner.skip(n);
      return guarded;
    },
    project(projection: unknown) {
      if (!inner.project) throw new TenantScopeError("cursor.project is not supported by this driver");
      inner = inner.project(projection);
      return guarded;
    },
    async toArray() {
      return (await inner.toArray()).map((d) => stripDocument(tenantId, d));
    },
    async next() {
      if (!inner.next) throw new TenantScopeError("cursor.next is not supported by this driver");
      const d = await inner.next();
      return d === null ? null : stripDocument(tenantId, d);
    },
    async close() {
      await inner.close?.();
    },
    async *[Symbol.asyncIterator]() {
      for await (const d of inner as AsyncIterable<unknown>) yield stripDocument(tenantId, d);
    },
  };
  const guarded = failClosed(api, "cursor");
  return guarded;
}

type BulkOp = Record<string, Doc>;

function scopeBulkOp(tenantId: string, op: unknown): BulkOp {
  if (!isPlainObject(op) || Object.keys(op).length !== 1) throw new TenantScopeError("a bulkWrite op must have exactly one kind");
  const [kind, spec] = Object.entries(op)[0]!;
  if (!isPlainObject(spec)) throw new TenantScopeError(`bulkWrite ${kind} needs a plain object`);
  switch (kind) {
    case "updateOne":
      return { updateOne: { ...spec, filter: scopeFilter(tenantId, spec.filter), update: scopeUpdate(tenantId, spec.update) } };
    case "insertOne":
      return { insertOne: { ...spec, document: stampDocument(tenantId, spec.document) } };
    case "deleteOne":
    case "deleteMany":
      return { [kind]: { ...spec, filter: scopeFilter(tenantId, spec.filter) } };
    default:
      throw new TenantScopeError(`bulkWrite ${kind} is not supported through a tenant scope`);
  }
}

// The driver's Collection surface, loosened to what this wrapper forwards.
type LooseCollection = {
  collectionName: string;
  findOne(filter: unknown, options?: unknown): Promise<unknown>;
  find(filter: unknown, options?: unknown): CursorLike;
  countDocuments(filter: unknown, options?: unknown): Promise<number>;
  insertOne(doc: unknown, options?: unknown): Promise<{ insertedId: unknown } & Doc>;
  updateOne(filter: unknown, update: unknown, options?: unknown): Promise<{ upsertedId?: unknown } & Doc>;
  findOneAndUpdate(filter: unknown, update: unknown, options?: unknown): Promise<unknown>;
  deleteMany(filter: unknown, options?: unknown): Promise<unknown>;
  bulkWrite(ops: unknown[], options?: unknown): Promise<unknown>;
};

function scopedCollection(tenantId: string, raw: Collection<Document>): Collection<Document> {
  const inner = raw as unknown as LooseCollection;
  const api = {
    collectionName: inner.collectionName,
    async findOne(filter?: unknown, options?: unknown) {
      return stripDocument(tenantId, await inner.findOne(scopeFilter(tenantId, filter), options));
    },
    find(filter?: unknown, options?: unknown) {
      return scopedCursor(tenantId, inner.find(scopeFilter(tenantId, filter), options));
    },
    async countDocuments(filter?: unknown, options?: unknown) {
      return inner.countDocuments(scopeFilter(tenantId, filter), options);
    },
    async insertOne(doc: unknown, options?: unknown) {
      const res = await inner.insertOne(stampDocument(tenantId, doc), options);
      return { ...res, insertedId: unqualifyId(tenantId, res.insertedId) };
    },
    async updateOne(filter: unknown, update: unknown, options?: unknown) {
      const res = await inner.updateOne(scopeFilter(tenantId, filter), scopeUpdate(tenantId, update), options);
      return res.upsertedId === null || res.upsertedId === undefined ? res : { ...res, upsertedId: unqualifyId(tenantId, res.upsertedId) };
    },
    async findOneAndUpdate(filter: unknown, update: unknown, options: Doc = {}) {
      if (options.includeResultMetadata) throw new TenantScopeError("findOneAndUpdate includeResultMetadata is not supported through a tenant scope");
      return stripDocument(tenantId, await inner.findOneAndUpdate(scopeFilter(tenantId, filter), scopeUpdate(tenantId, update), options));
    },
    async deleteMany(filter: unknown, options?: unknown) {
      return inner.deleteMany(scopeFilter(tenantId, filter), options);
    },
    async bulkWrite(ops: unknown[], options?: unknown) {
      if (!Array.isArray(ops)) throw new TenantScopeError("bulkWrite needs an array of ops");
      return inner.bulkWrite(ops.map((op) => scopeBulkOp(tenantId, op)), options);
    },
  };
  return failClosed(api, `collection(${JSON.stringify(inner.collectionName ?? "?")})`) as unknown as Collection<Document>;
}

/**
 * A Db that acts only for `tenantId`: `collection(name)` hands out a tenant-scoped collection,
 * and every other Db member throws. Scoping an already-scoped Db to the same tenant returns it
 * unchanged; to a different tenant throws.
 */
export function tenantScopedDb(db: Db, tenantId: string): Db {
  const t = assertTenantId(tenantId);
  const existing = tenantIdOf(db);
  if (existing !== undefined) {
    if (existing === t) return db;
    throw new TenantScopeError("this Db is already scoped to a different tenant");
  }
  const raw = db as unknown as { databaseName?: string; collection(name: string, options?: unknown): Collection<Document> };
  const api = {
    databaseName: raw.databaseName,
    collection(name: string, options?: unknown) {
      return scopedCollection(t, raw.collection(name, options));
    },
  };
  const scoped = failClosed(api, "db");
  scopedTenants.set(scoped, t);
  return scoped as unknown as Db;
}
