/**
 * Pathlynks read port (vc-admin-control S5, VA12).
 *
 * Boundary rules, all enforced here and nowhere else:
 *  - Only four read methods; no generic query entry point.
 *  - The student id is the argument of every method and is bound as `$1`; it is never placed in SQL text.
 *    The caller is the engine / the MCP server below, which take the id from the verified auth context only.
 *  - Table names come from the configured allow-list (config/sources.json `tables`), are validated as plain
 *    identifiers once at construction, and are the only text interpolated into SQL (Postgres cannot bind identifiers).
 *  - Every connection: `SET statement_timeout = 3000`, `SET default_transaction_read_only = on`, then a
 *    has_table_privilege(INSERT/UPDATE/DELETE) probe for every configured table. Any true, error or empty answer
 *    fails closed: no data SELECT is issued.
 *  - Results are capped at 50 rows (`truncated` flags the cut). Failures are typed results, never thrown, and carry a
 *    fixed `cause` constant only (no driver message, host, user or password).
 */
import { buildPgConfig, defaultConnect, type PgConnectionConfig } from "./connect.js";

export const STATEMENT_TIMEOUT_MS = 3000;
export const ROW_CAP = 50;
const DEFAULT_QUERY_TIMEOUT_MS = 5000;
const STUDENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

export interface PgClientLike {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}
export type ConnectFn = () => Promise<PgClientLike>;

export type PathlynksRow = Record<string, unknown>;
export type UnavailableCause =
  | "not_configured"
  | "connect_error"
  | "query_error"
  | "timeout"
  | "privilege_check_failed"
  | "privilege_check_error";
export type PathlynksResult =
  | { ok: true; rows: PathlynksRow[]; truncated: boolean }
  | { ok: false; reason: "unavailable"; cause: UnavailableCause }
  | { ok: false; reason: "refused"; cause: "invalid_student_id" };

export interface PathlynksPort {
  getStudentProfile(studentId: string): Promise<PathlynksResult>;
  getSavedCareers(studentId: string): Promise<PathlynksResult>;
  getCompareList(studentId: string): Promise<PathlynksResult>;
  getAssessmentStatus(studentId: string): Promise<PathlynksResult>;
  /** Last privilege-check outcome (recorded, not secret). */
  getStatus(): { privilegeCheck: "unchecked" | "ok" | "failed" | "error"; lastCause?: UnavailableCause };
}

export type PathlynksEvent =
  | { type: "privileged_role_override" }
  | { type: "privilege_check_failed" }
  | { type: "privilege_check_error" }
  | { type: "unavailable"; cause: UnavailableCause };

export interface PathlynksPortConfig {
  /** `tables` of the postgres source in config/sources.json. */
  allowedTables: readonly string[];
  /** Which allow-listed table backs each read. */
  tables: { profile: string; savedCareers: string; compareList: string; assessment: string };
  /** Non-secret connection fields of the postgres source; the password is read from env[passwordRef]. */
  connection?: PgConnectionConfig;
  env?: Record<string, string | undefined>;
  /** Test seam: replaces the pg connection. */
  connect?: ConnectFn;
  queryTimeoutMs?: number;
  onEvent?: (event: PathlynksEvent) => void;
  /**
   * G1 (answered 2026-10-26): the Pathlynks pool user (pathlynksadm) may hold write privileges. True skips ONLY the connect-time write-privilege refusal;
   * SELECT-only SQL, the read-only transaction and the statement timeout stay. Default false. Absent = the env var PATHLYNKS_ALLOW_PRIVILEGED_ROLE === "1".
   */
  allowPrivilegedRole?: boolean;
}

class PortFailure extends Error {
  constructor(readonly cause_: UnavailableCause) {
    super(cause_);
  }
}

function withDeadline<T>(p: Promise<T>, ms: number, cause: UnavailableCause): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new PortFailure("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e instanceof PortFailure ? e : new PortFailure(cause));
      },
    );
  });
}

export function createPathlynksPort(config: PathlynksPortConfig): PathlynksPort {
  const allow = new Set(config.allowedTables);
  if (allow.size === 0) throw new Error("pathlynks port: the table allow-list is empty");
  for (const t of allow) {
    if (!IDENTIFIER_PATTERN.test(t)) throw new Error("pathlynks port: allow-listed table is not a plain identifier");
  }
  const t = config.tables;
  const mapped = [t.profile, t.savedCareers, t.compareList, t.assessment];
  for (const name of mapped) {
    if (!allow.has(name)) throw new Error("pathlynks port: a configured table is not in the allow-list");
  }
  // Pre-built, fully static statements. The only interpolated text is an allow-listed, validated identifier.
  const sqlFor = (table: string): string => `SELECT * FROM "${table}" WHERE student_id = $1 LIMIT ${ROW_CAP + 1}`;
  const configured = [...new Set(mapped)];
  const allowPrivileged = config.allowPrivilegedRole ?? (config.env ?? process.env).PATHLYNKS_ALLOW_PRIVILEGED_ROLE === "1";
  const queryTimeoutMs = config.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;
  const emit = (e: PathlynksEvent): void => {
    try {
      config.onEvent?.(e);
    } catch {
      /* an observer must never break a turn */
    }
  };
  const status: ReturnType<PathlynksPort["getStatus"]> = { privilegeCheck: "unchecked" };
  // The override is a startup fact, announced once with no secret: the operator sees that the guard is off by choice.
  if (allowPrivileged) emit({ type: "privileged_role_override" });

  async function open(): Promise<PgClientLike> {
    if (config.connect) return config.connect();
    if (!config.connection) throw new PortFailure("not_configured");
    const pg = buildPgConfig(config.connection, config.env ?? process.env);
    if (!pg) throw new PortFailure("not_configured");
    return defaultConnect(pg);
  }

  async function verifyReadOnly(client: PgClientLike): Promise<void> {
    if (allowPrivileged) return; // G1 override: the read-only transaction (SET default_transaction_read_only = on) and SELECT-only SQL still hold.
    for (const table of configured) {
      let row: Record<string, unknown> | undefined;
      try {
        const res = await withDeadline(
          client.query(
            "SELECT has_table_privilege(current_user, $1, 'INSERT') AS ins, has_table_privilege(current_user, $1, 'UPDATE') AS upd, has_table_privilege(current_user, $1, 'DELETE') AS del",
            [table],
          ),
          queryTimeoutMs,
          "privilege_check_error",
        );
        row = res.rows[0];
      } catch {
        status.privilegeCheck = "error";
        status.lastCause = "privilege_check_error";
        emit({ type: "privilege_check_error" });
        throw new PortFailure("privilege_check_error");
      }
      if (!row || typeof row.ins !== "boolean" || typeof row.upd !== "boolean" || typeof row.del !== "boolean") {
        status.privilegeCheck = "error";
        status.lastCause = "privilege_check_error";
        emit({ type: "privilege_check_error" });
        throw new PortFailure("privilege_check_error");
      }
      if (row.ins || row.upd || row.del) {
        status.privilegeCheck = "failed";
        status.lastCause = "privilege_check_failed";
        emit({ type: "privilege_check_failed" });
        throw new PortFailure("privilege_check_failed");
      }
    }
    status.privilegeCheck = "ok";
    delete status.lastCause;
  }

  async function read(table: string, studentId: string): Promise<PathlynksResult> {
    if (typeof studentId !== "string" || !STUDENT_ID_PATTERN.test(studentId)) {
      return { ok: false, reason: "refused", cause: "invalid_student_id" };
    }
    let client: PgClientLike | undefined;
    try {
      try {
        client = await withDeadline(open(), queryTimeoutMs, "connect_error");
      } catch (e) {
        throw e instanceof PortFailure && e.cause_ === "not_configured" ? e : new PortFailure(e instanceof PortFailure ? e.cause_ : "connect_error");
      }
      try {
        await withDeadline(client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`), queryTimeoutMs, "query_error");
        await withDeadline(client.query("SET default_transaction_read_only = on"), queryTimeoutMs, "query_error");
      } catch (e) {
        throw new PortFailure(e instanceof PortFailure ? e.cause_ : "query_error");
      }
      await verifyReadOnly(client);
      const res = await withDeadline(client.query(sqlFor(table), [studentId]), queryTimeoutMs, "query_error");
      const rows = res.rows.slice(0, ROW_CAP);
      return { ok: true, rows, truncated: res.rows.length > ROW_CAP };
    } catch (e) {
      const cause: UnavailableCause = e instanceof PortFailure ? e.cause_ : "query_error";
      emit({ type: "unavailable", cause });
      return { ok: false, reason: "unavailable", cause };
    } finally {
      if (client) {
        try {
          await withDeadline(client.end(), 1000, "query_error");
        } catch {
          /* a failed close must not surface */
        }
      }
    }
  }

  return {
    getStudentProfile: (id) => read(t.profile, id),
    getSavedCareers: (id) => read(t.savedCareers, id),
    getCompareList: (id) => read(t.compareList, id),
    getAssessmentStatus: (id) => read(t.assessment, id),
    getStatus: () => ({ ...status }),
  };
}
