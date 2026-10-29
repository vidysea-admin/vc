/**
 * The ONE shared DB helper (contract B12). Every write path in this package —
 * and every future package that needs `virtual_counsellor` — goes through
 * `getVcDb` / `connectFromEnv`. Nothing else in the repo may call the driver's
 * `client.db(` directly; packages/db/tests/db-scope.test.ts greps
 * packages/**, apps/** and mcp/** source (never tests) to prove it.
 *
 * B8: nothing in this file connects to a real server on import or on test —
 * `connectFromEnv` only calls `client.db(name)` (a synchronous, local call on
 * the driver's `MongoClient` object; it never talks to the network by itself).
 * Establishing a live socket ( `.connect()` ) is left to the caller — the live
 * init script (scripts/db-init.ts, NOT run by this unit) or the app itself.
 */
import { MongoClient, type Db, type MongoClientOptions } from "mongodb";
import { FENCE_MARGIN_MS } from "./erasure.js";
import { assertTenantId, failClosed, tenantScopedDb } from "./tenant.js";

/** D-008/D-009: the engine's one database on the production Mongo server. */
export const VC_DB_NAME = "virtual_counsellor";

/**
 * T-014 / ISS-t-011-c3-rev-2: the client-LEVEL backstop timeout (mongodb@6 CSOT `timeoutMS`) for
 * any operation on this client that does NOT carry its own per-operation `timeoutMS` — most
 * notably the writes LangGraph's MongoDBSaver checkpointer makes on the scribe's behalf, which
 * erasure.ts's "Honest caveats" section says are "bounded by the graph's AbortSignal plus the
 * MongoClient's own timeoutMS where one is configured". Before this, `new MongoClient(url)` was
 * built with no options at all, so that backstop did not exist and the comment was aspirational,
 * not true. Capped at FENCE_MARGIN_MS (D-016): the fence is never released before
 * `createdAt + MINIMUM_FENCE_HOLD_MS` (= FENCED_WRITER_DEADLINE_MS + FENCE_MARGIN_MS), so a
 * client-level operation that respects this backstop always finishes — or is aborted server-side —
 * within the margin window past a fence-aware writer's own deadline.
 * Per-operation `timeoutMS` (e.g. WriterDeadline.op() in facts.ts/erasure.ts, and T-015's
 * ERASURE_PURGE_OP_TIMEOUT_MS in erasure.ts) always overrides this when one is passed explicitly;
 * this is only the floor for operations that pass none. T-015 / ISS-t-014-c0-2: an operator
 * override (MONGO_CLIENT_TIMEOUT_MS) is capped at this same FENCE_MARGIN_MS ceiling — see
 * resolveClientTimeoutMs below.
 */
export const DEFAULT_MONGO_CLIENT_TIMEOUT_MS = FENCE_MARGIN_MS;

/**
 * Reads the client-level timeout override from `env`. `MONGO_CLIENT_TIMEOUT_MS` is an ops/config
 * knob (how long an unguarded driver operation may run), never a secret — it is read the same way
 * MONGODB_URL is, straight from the process environment, no vault involved. Unset or blank falls
 * back to DEFAULT_MONGO_CLIENT_TIMEOUT_MS (unchanged by this rule).
 *
 * T-015 / ISS-t-014-c0-2: an override is REJECTED, not clamped, above FENCE_MARGIN_MS. Before this,
 * only the default respected the "at most FENCE_MARGIN_MS" cap (D-016) — an operator override had
 * no upper bound at all, and could silently defeat the exact liveness guarantee this client-level
 * backstop exists for (an unguarded operation, e.g. the scribe's LangGraph checkpointer, must
 * finish within the fence's own margin window; see erasure.ts's "Honest caveats"). Rejecting (over
 * clamping) is the chosen behaviour: a silent clamp would let an operator believe they had
 * configured e.g. 5 minutes of headroom while the real client still behaved as 30s — a worse trap
 * than a loud failure at startup, which is when connectFromEnv is called.
 */
/**
 * ISS-t-015-c0-4: a plain decimal integer only. `Number(raw)` alone silently accepts hex
 * ("0x1000" -> 4096), exponential notation ("1e5" -> 100000), a leading "+", and — because `Number`
 * trims — surrounding whitespace, none of which is the legible ms count an operator setting this
 * env var meant to type. The FENCE_MARGIN_MS cap below is never bypassed by any of these notations
 * (they all funnel through the same comparison), so this is config hygiene, not a safety gap on its
 * own — rejected anyway so a typo like "1e5" fails loudly at startup instead of quietly meaning
 * something other than what was typed.
 */
const STRICT_DECIMAL_INTEGER = /^[0-9]+$/;

function resolveClientTimeoutMs(env: Record<string, string | undefined>): number {
  const raw = env.MONGO_CLIENT_TIMEOUT_MS;
  if (raw === undefined || raw.trim() === "") return DEFAULT_MONGO_CLIENT_TIMEOUT_MS;
  if (!STRICT_DECIMAL_INTEGER.test(raw)) {
    throw new Error(
      `connectFromEnv: MONGO_CLIENT_TIMEOUT_MS must be a plain decimal integer number of ms ` +
        `(no hex, exponents, fractions, signs or whitespace), got "${raw}"`,
    );
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`connectFromEnv: MONGO_CLIENT_TIMEOUT_MS must be a positive number of ms, got "${raw}"`);
  }
  if (parsed > FENCE_MARGIN_MS) {
    throw new Error(
      `connectFromEnv: MONGO_CLIENT_TIMEOUT_MS must be at most FENCE_MARGIN_MS (${FENCE_MARGIN_MS}ms, D-016) — ` +
        `got ${parsed}ms. A larger client-level backstop would let an unguarded operation outlive the erasure ` +
        `fence's own margin window (ISS-t-014-c0-2).`,
    );
  }
  return parsed;
}

/**
 * Returns the `virtual_counsellor` database from `client`, or throws for any
 * other name. `name` defaults to VC_DB_NAME so a caller cannot accidentally
 * open a different database just by omitting the argument; a caller that
 * explicitly passes a different name still gets refused.
 */
export function getVcDb(client: MongoClient, name: string = VC_DB_NAME): Db {
  if (name !== VC_DB_NAME) {
    throw new Error(
      `getVcDb: refusing database "${name}" — this engine is only allowed to use "${VC_DB_NAME}" ` +
        `on this Mongo server (contract B12, qa/gates/mongo-host.md). Every other database, ` +
        `including "pathlynks" and "global_university_db", is off-limits for both reads and writes.`,
    );
  }
  return client.db(name);
}

/**
 * wire-fix-1 (D-134, contract B12, qa/gates/mongo-host.md): the ONE read-only opener for a database that is NOT `virtual_counsellor`.
 * The allow-list holds exactly one name, the Career Quest database. Everything else on the server (`pathlynks`, `global_university_db`, `admin`, ...) is
 * refused before the driver's `.db(` is reached, and `virtual_counsellor` is deliberately NOT on it (that database has its own full-CRUD path, `getVcDb`).
 */
export const READ_ONLY_DB_ALLOW_LIST: readonly string[] = Object.freeze(["pathlynks_journey"]);
/** Every read through the read-only handle goes to a secondary when one is available, so production primaries carry no student-facing read load. */
export const READ_ONLY_READ_PREFERENCE = "secondaryPreferred";

export interface ReadOnlyCursor {
  toArray(): Promise<Record<string, unknown>[]>;
}
/** Exactly three methods; no write, index, drop, rename, watch or single-document method exists on this type or on the object. */
export interface ReadOnlyCollection {
  find(filter: Record<string, unknown>, options?: Record<string, unknown>): ReadOnlyCursor;
  aggregate(pipeline: Record<string, unknown>[], options?: Record<string, unknown>): ReadOnlyCursor;
  countDocuments(filter: Record<string, unknown>, options?: Record<string, unknown>): Promise<number>;
}
export interface ReadOnlyDb {
  collection(name: string): ReadOnlyCollection;
}

const PLAIN_COLLECTION_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const WRITE_STAGE = /^\$(out|merge)$/;
/** The only caller options each read-only facade method forwards (tf-fix-2). */
const FIND_OPTIONS: readonly string[] = ["maxTimeMS", "projection", "sort", "limit", "skip", "hint"];
const AGGREGATE_OPTIONS: readonly string[] = ["maxTimeMS", "allowDiskUse"];
const COUNT_OPTIONS: readonly string[] = ["maxTimeMS", "limit", "skip"];

/**
 * Opens an allow-listed database as a read-only facade: `collection(name)` returns a frozen object with only find / aggregate / countDocuments, each forced to
 * `readPreference: secondaryPreferred` (only the allow-listed caller options pass through: find maxTimeMS/projection/sort/limit/skip/hint, aggregate maxTimeMS/allowDiskUse, countDocuments maxTimeMS/limit/skip; its readPreference is overridden). A cursor is
 * narrowed to `toArray`. `$out` and `$merge` stages are refused before the driver. `collections` (optional) narrows further to the source's allow-list.
 * No connection is made here (`client.db(name)` is a local call, contract B8).
 */
export function openReadOnlyDb(client: MongoClient, name: string, collections?: readonly string[]): ReadOnlyDb {
  if (typeof name !== "string" || !READ_ONLY_DB_ALLOW_LIST.includes(name)) {
    throw new Error(
      `openReadOnlyDb: refusing database ${JSON.stringify(typeof name === "string" ? name.slice(0, 64) : typeof name)} — the read-only opener serves only ` +
        `${READ_ONLY_DB_ALLOW_LIST.join(", ")} (contract B12, qa/gates/mongo-host.md). Every other database is off-limits.`,
    );
  }
  const db = client.db(name);
  // tf-fix-2: caller options are ALLOW-LISTED per method (own keys of a plain object only); anything else (out, merge, writeConcern, bypassDocumentValidation, session, ...) is dropped
  // before the driver, because e.g. AggregateOptions.out makes the driver append a $out stage. readPreference is always forced.
  const force = (allowed: readonly string[], options?: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    if (options !== null && typeof options === "object" && !Array.isArray(options)) {
      for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(options, key) && options[key] !== undefined) out[key] = options[key];
      }
    }
    out.readPreference = READ_ONLY_READ_PREFERENCE;
    return out;
  };
  // A write stage can hide in a sub-pipeline ($facet, $lookup, $unionWith), so the screen walks every nested own key, bounded in depth.
  const hasWriteStage = (v: unknown, depth = 0): boolean => {
    if (v === null || typeof v !== "object") return false;
    if (depth > 32) return true;
    if (Array.isArray(v)) return v.some((x) => hasWriteStage(x, depth + 1));
    return Object.keys(v).some((k) => WRITE_STAGE.test(k) || hasWriteStage((v as Record<string, unknown>)[k], depth + 1));
  };
  const narrow = (cursor: { toArray(): Promise<Record<string, unknown>[]> }): ReadOnlyCursor => Object.freeze({ toArray: () => cursor.toArray() });
  const handle: ReadOnlyDb = {
    collection(coll: string): ReadOnlyCollection {
      if (typeof coll !== "string" || !PLAIN_COLLECTION_NAME.test(coll) || (collections !== undefined && !collections.includes(coll))) {
        throw new Error(`openReadOnlyDb: refusing collection ${JSON.stringify(typeof coll === "string" ? coll.slice(0, 64) : typeof coll)} in "${name}"`);
      }
      const c = db.collection(coll);
      const facade: ReadOnlyCollection = {
        find: (filter, options) => narrow(c.find(filter as never, force(FIND_OPTIONS, options) as never) as never),
        aggregate: (pipeline, options) => {
          if (!Array.isArray(pipeline)) throw new Error("openReadOnlyDb: aggregate needs a pipeline array");
          for (const stage of pipeline) {
            if (stage === null || typeof stage !== "object" || hasWriteStage(stage)) throw new Error("openReadOnlyDb: refusing a write stage ($out / $merge) in a read-only aggregate");
          }
          return narrow(c.aggregate(pipeline as never, force(AGGREGATE_OPTIONS, options) as never) as never);
        },
        countDocuments: (filter, options) => c.countDocuments(filter as never, force(COUNT_OPTIONS, options) as never),
      };
      return Object.freeze(facade);
    },
  };
  return Object.freeze(handle);
}

/** The Career Quest database (`pathlynks_journey`), read-only; pass the source's collection list to narrow it further. */
export function openPathlynksJourney(client: MongoClient, collections?: readonly string[]): ReadOnlyDb {
  return openReadOnlyDb(client, "pathlynks_journey", collections);
}

export type MongoClientFactory = (url: string, options?: MongoClientOptions) => MongoClient;

const defaultClientFactory: MongoClientFactory = (url, options) => new MongoClient(url, options);

/**
 * Reads MONGODB_URL from `env` (throws if missing — B11: keys only come from
 * `.env`/the process environment, never hardcoded) and returns a client + the
 * `virtual_counsellor` database, via getVcDb. The URI's own default database
 * (e.g. the `/otherdb` in `mongodb://h:1/otherdb`) is never consulted — the
 * database name always comes from VC_DB_NAME, passed explicitly to getVcDb.
 *
 * `clientFactory` defaults to `new MongoClient(url, options)`, which itself
 * performs no I/O (the mongodb driver only connects on `.connect()` or a first
 * command). Tests inject a fake factory so this function is exercised with
 * zero network activity (contract B8). `options` always carries `timeoutMS`
 * (ISS-t-011-c3-rev-2, resolveClientTimeoutMs): every real client this
 * function builds has the driver-level backstop, whether or not the caller
 * ever passes a factory.
 */
export function connectFromEnv(
  env: Record<string, string | undefined>,
  clientFactory: MongoClientFactory = defaultClientFactory,
): { client: MongoClient; db: Db } {
  const url = env.MONGODB_URL;
  if (!url) {
    throw new Error("connectFromEnv: MONGODB_URL is not set (see .env.example, contract B11)");
  }
  const timeoutMS = resolveClientTimeoutMs(env);
  const client = clientFactory(url, { timeoutMS });
  const db = getVcDb(client, VC_DB_NAME);
  return { client, db };
}

/**
 * B12 gate: `dropDatabase` on `virtual_counsellor` is the one destructive
 * operation this engine still needs a human gate for (D-009). This package
 * deliberately exposes NO function that calls `db.dropDatabase()` anywhere —
 * the gate is "the capability does not exist in this package", not a runtime
 * check to bypass. Everything else inside `virtual_counsellor` (insert, find,
 * update, delete, bulk ops, creating/dropping the engine's own collections
 * and indexes) is ordinary CRUD via the typed accessors in collections.ts.
 */
export const DROP_DATABASE_GATE_NOTE =
  "dropDatabase on virtual_counsellor is gated by omission: no function in @vc/db calls it (D-009).";

/**
 * T-025: the MongoClient-shaped facade for a tenant (LangGraph's checkpoint saver opens its
 * database from the client itself): its database accessor returns the tenant-scoped
 * `virtual_counsellor` Db (via getVcDb, so any other database name is refused, B12), and
 * appendMetadata is forwarded (no I/O). Every other client member throws: this facade can not
 * connect, close, open sessions or run admin commands.
 */
export function tenantScopedClient(client: MongoClient, tenantId: string): MongoClient {
  const t = assertTenantId(tenantId);
  const facade = {
    db(name?: string) {
      return tenantScopedDb(getVcDb(client, name ?? VC_DB_NAME), t);
    },
    appendMetadata(metadata: unknown) {
      // Called ON the client (the real driver method reads its own `this`).
      (client as unknown as { appendMetadata(m: unknown): void }).appendMetadata(metadata);
    },
  };
  return failClosed(facade, "client") as unknown as MongoClient;
}
