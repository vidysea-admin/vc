/**
 * The only file that imports `pg`. Builds the driver config from non-secret fields plus the password read from the
 * environment variable NAMED by `passwordRef` (the value is never logged or returned). No connection string is ever built.
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import type { PgClientLike } from "./port.js";

export interface PgConnectionConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  sslmode: "require" | "verify-full";
  /** Env NAME holding the password. */
  passwordRef: string;
  /** Env NAME holding the path to the operator-provisioned official RDS CA bundle. */
  caFileRef?: string;
}

/** Supplied by trusted server bootstrap, never the browser/admin request itself. */
export interface PgCredentialBinding {
  platform: "pathlynks" | "vidysea";
  siteId: string;
  sourceId: string;
  seed: PgConnectionConfig;
}

export interface PgDriverConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: { rejectUnauthorized: true; ca?: string };
  statement_timeout: number;
  query_timeout: number;
  connectionTimeoutMillis: number;
}

export function buildPgConfig(conn: PgConnectionConfig, env: Record<string, string | undefined>, binding?: PgCredentialBinding): PgDriverConfig | undefined {
  // Vidysea refs cannot take the legacy unscoped path. Validate all metadata before any env/CA lookup.
  if (/^VIDYSEA_/.test(conn.passwordRef) && !binding) return undefined;
  if (binding) {
    const vidysea = binding.platform === "vidysea";
    if (vidysea && (binding.siteId !== "vidysea" || binding.sourceId !== "vidysea-db")) return undefined;
    const prefix = vidysea ? /^VIDYSEA_DB_[A-Z0-9_]+$/ : /^PATHLYNKS_[A-Z0-9_]+$/;
    if (!prefix.test(conn.passwordRef)) return undefined;
    const seed = binding.seed;
    if (conn.host.toLowerCase() !== seed.host.toLowerCase() || conn.port !== seed.port || conn.database !== seed.database || conn.user !== seed.user || conn.sslmode !== seed.sslmode || conn.passwordRef !== seed.passwordRef || conn.caFileRef !== seed.caFileRef) return undefined;
    if (conn.caFileRef && conn.caFileRef !== (vidysea ? "VIDYSEA_DB_CA_FILE" : "PATHLYNKS_DB_CA_FILE")) return undefined;
  }
  const password = env[conn.passwordRef];
  if (!password) return undefined;
  let ca: string | undefined;
  if (conn.caFileRef) {
    const file = env[conn.caFileRef];
    if (!file) return undefined;
    try {
      ca = readFileSync(file, "utf8");
      if (!ca.includes("-----BEGIN CERTIFICATE-----")) return undefined;
    } catch { return undefined; }
  }
  return {
    host: conn.host,
    port: conn.port,
    database: conn.database,
    user: conn.user,
    password,
    // Both sslmodes verify the certificate; "require" is never allowed to downgrade to an unverified session.
    ssl: { rejectUnauthorized: true, ...(ca === undefined ? {} : { ca }) },
    statement_timeout: 3000,
    query_timeout: 5000,
    connectionTimeoutMillis: 3000,
  };
}

export async function defaultConnect(cfg: PgDriverConfig): Promise<PgClientLike> {
  const client = new pg.Client(cfg);
  try {
    await client.connect();
  } catch (e) {
    try { await client.end(); } catch { /* preserve the original connection failure */ }
    throw e;
  }
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
