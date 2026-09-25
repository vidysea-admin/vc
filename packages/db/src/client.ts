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
