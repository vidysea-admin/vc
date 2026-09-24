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
import { MongoClient, type Db } from "mongodb";

/** D-008/D-009: the engine's one database on the production Mongo server. */
export const VC_DB_NAME = "virtual_counsellor";

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

export type MongoClientFactory = (url: string) => MongoClient;

const defaultClientFactory: MongoClientFactory = (url) => new MongoClient(url);

/**
 * Reads MONGODB_URL from `env` (throws if missing — B11: keys only come from
 * `.env`/the process environment, never hardcoded) and returns a client + the
 * `virtual_counsellor` database, via getVcDb. The URI's own default database
 * (e.g. the `/otherdb` in `mongodb://h:1/otherdb`) is never consulted — the
 * database name always comes from VC_DB_NAME, passed explicitly to getVcDb.
 *
 * `clientFactory` defaults to `new MongoClient(url)`, which itself performs no
 * I/O (the mongodb driver only connects on `.connect()` or a first command).
 * Tests inject a fake factory so this function is exercised with zero network
 * activity (contract B8).
 */
export function connectFromEnv(
  env: Record<string, string | undefined>,
  clientFactory: MongoClientFactory = defaultClientFactory,
): { client: MongoClient; db: Db } {
  const url = env.MONGODB_URL;
  if (!url) {
    throw new Error("connectFromEnv: MONGODB_URL is not set (see .env.example, contract B11)");
  }
  const client = clientFactory(url);
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
