/**
 * The only file that imports `pg`. Builds the driver config from non-secret fields plus the password read from the
 * environment variable NAMED by `passwordRef` (the value is never logged or returned). No connection string is ever built.
 */
import pg from "pg";
import type { PgClientLike } from "./port.js";

export interface PgConnectionConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  sslmode: "require" | "verify-full";
  /** Env NAME holding the password. */
  passwordRef: string;
}

export interface PgDriverConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: { rejectUnauthorized: true };
  statement_timeout: number;
  query_timeout: number;
  connectionTimeoutMillis: number;
}

export function buildPgConfig(conn: PgConnectionConfig, env: Record<string, string | undefined>): PgDriverConfig | undefined {
  const password = env[conn.passwordRef];
  if (!password) return undefined;
  return {
    host: conn.host,
    port: conn.port,
    database: conn.database,
    user: conn.user,
    password,
    // Both sslmodes verify the certificate; "require" is never allowed to downgrade to an unverified session.
    ssl: { rejectUnauthorized: true },
    statement_timeout: 3000,
    query_timeout: 5000,
    connectionTimeoutMillis: 3000,
  };
}

export async function defaultConnect(cfg: PgDriverConfig): Promise<PgClientLike> {
  const client = new pg.Client(cfg);
  await client.connect();
  return {
    async query(text, values) {
      const r = await client.query(text, values ? [...values] : undefined);
      return { rows: r.rows as Record<string, unknown>[] };
    },
    async end() {
      await client.end();
    },
  };
}
