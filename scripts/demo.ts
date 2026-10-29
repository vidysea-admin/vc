/**
 * T-057 demo checks (docs/demo-contract.md, D-124):
 *   pnpm demo:preflight            C1: Mongo virtual_counsellor, both platform DBs (TLS verified, read-only) and KB /search -> 4x OK
 *   pnpm demo:context pathlynks    C2: the test student's Pathlynks blocks, each with its row count
 *   pnpm demo:context vidysea      C3: the linked student's Vidysea snapshot + profile blocks
 *
 * Read-only and value-free: the output is block names, row counts and field NAMES only (tier A: no real rows in logs, no secrets).
 * The platform ports are built exactly as the API builds them (config/sources.json + pathlynksTablesFrom + the server CA env).
 * Exit code 1 when any check fails or any required block is empty.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { connectFromEnv } from "../packages/db/src/client.js";
import { createPathlynksPort, createVidyseaPort } from "../mcp/pathlynks/src/index.js";
import { createKnowledgeBaseClient } from "../mcp/university-kb/src/kb-client.js";
import { pathlynksTablesFrom } from "../apps/api/src/admin-routes.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(): Record<string, string | undefined> {
  const file = process.env.VC_ENV_FILE ?? join(ROOT, ".env");
  const fromFile = existsSync(file)
    ? Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/).filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l)).map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, "$2")];
      }))
    : {};
  return { ...fromFile, ...process.env };
}

type Seed = { id: string; kind: string; host: string; port: number; database: string; user: string; sslmode: "require" | "verify-full"; passwordRef: string; tables: string[] };
function seed(id: string): Seed {
  const all = JSON.parse(readFileSync(join(ROOT, "config", "sources.json"), "utf8")).sources as Seed[];
  const s = all.find((x) => x.id === id && x.kind === "postgres");
  if (!s) throw new Error(`config/sources.json has no postgres source ${id}`);
  return s;
}

function pathlynksPort(env: Record<string, string | undefined>) {
  const s = seed("pathlynks-db");
  const tables = pathlynksTablesFrom(s.tables);
  if (!tables) throw new Error("pathlynks-db tables do not cover the read model");
  const connection = { host: s.host, port: s.port, database: s.database, user: s.user, sslmode: s.sslmode, passwordRef: s.passwordRef, caFileRef: "PATHLYNKS_DB_CA_FILE" };
  return createPathlynksPort({ allowedTables: s.tables, tables, connection, credentialBinding: { platform: "pathlynks", siteId: "pathlynks", sourceId: s.id, seed: connection }, env });
}

function vidyseaPort(env: Record<string, string | undefined>) {
  const s = seed("vidysea-db");
  const connection = { host: s.host, port: s.port, database: s.database, user: s.user, sslmode: s.sslmode, passwordRef: s.passwordRef, caFileRef: "VIDYSEA_DB_CA_FILE" };
  return createVidyseaPort({
    allowedTables: s.tables,
    tables: { profile: "users", student: "students", shortlist: "student_shortlisted_courses", assessment: "ai_profile_assessments", ...(s.tables.includes("pathlynks_student_snapshot") ? { snapshot: "pathlynks_student_snapshot" } : {}) },
    connection,
    credentialBinding: { platform: "vidysea", siteId: "vidysea", sourceId: s.id, seed: connection },
    allowPrivilegedRole: env.VIDYSEA_ALLOW_PRIVILEGED_ROLE === "1",
    env,
  });
}

type PortResult = { ok: true; rows: Record<string, unknown>[]; truncated: boolean } | { ok: false; reason: string; cause?: string };
let failed = false;
const line = (status: "OK" | "EMPTY" | "FAIL", name: string, detail: string) => {
  if (status !== "OK") failed = true;
  console.log(`${status.padEnd(5)} ${name.padEnd(30)} ${detail}`);
};
const filled = (row: Record<string, unknown>) => Object.entries(row).filter(([k, v]) => k !== "source" && k !== "sourceTable" && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)).map(([k]) => k);

async function block(name: string, run: () => Promise<PortResult>, required = true): Promise<void> {
  try {
    const r = await run();
    if (!r.ok) return line("FAIL", name, `${r.reason}${r.cause ? ` (${r.cause})` : ""}`);
    const fields = r.rows[0] ? filled(r.rows[0]).join(",") : "";
    if (r.rows.length === 0) return required ? line("EMPTY", name, "rows=0") : console.log(`info  ${name.padEnd(30)} rows=0 (optional)`);
    line("OK", name, `rows=${r.rows.length}${r.truncated ? "+" : ""} fields=${fields}`);
  } catch (err) {
    line("FAIL", name, err instanceof Error ? err.name : "error");
  }
}

async function preflight(env: Record<string, string | undefined>): Promise<void> {
  // 1. Mongo virtual_counsellor
  try {
    const { client, db } = connectFromEnv(env);
    try {
      await db.command({ ping: 1 });
      line("OK", "mongo virtual_counsellor", `db=${db.databaseName}`);
    } finally {
      await client.close();
    }
  } catch (err) {
    line("FAIL", "mongo virtual_counsellor", err instanceof Error ? err.name : "error");
  }
  // 2/3. Platform DBs: a real owner-bound read inside a read-only transaction, TLS verified against the configured CA.
  const pid = env.VC_TEST_PATHLYNKS_USER_ID;
  const vid = env.VC_TEST_VIDYSEA_USER_ID;
  if (!pid) line("FAIL", "pathlynks db", "VC_TEST_PATHLYNKS_USER_ID not set");
  else await block("pathlynks db (read-only, TLS)", () => pathlynksPort(env).getStudentProfile(pid));
  if (!vid) line("FAIL", "vidysea db", "VC_TEST_VIDYSEA_USER_ID not set");
  else await block("vidysea db (read-only, TLS)", () => vidyseaPort(env).getStudentProfile(vid));
  // 4. KB /search (the chat path; /ask is not on the critical path).
  const baseUrl = env.VC_KB_BASE_URL;
  const apiKey = env.VC_KB_API_KEY;
  if (!baseUrl || !apiKey) return line("FAIL", "kb /search", "VC_KB_BASE_URL / VC_KB_API_KEY not set");
  const t0 = Date.now();
  try {
    // Same bound as the API launcher (apps/api/src/main.ts): an integer 1000..30000, else the client default.
    const raw = env.VC_KB_TIMEOUT_MS ? Number(env.VC_KB_TIMEOUT_MS) : NaN;
    const timeoutMs = Number.isInteger(raw) && raw >= 1_000 && raw <= 30_000 ? raw : undefined;
    const r = await createKnowledgeBaseClient({ baseUrl, apiKey, ...(timeoutMs ? { timeoutMs } : {}) }).search("university admission requirements", 3);
    const ms = Date.now() - t0;
    if (r.status !== "ok") line("FAIL", "kb /search", `${r.status} in ${ms} ms`);
    else line(r.hits.length > 0 ? "OK" : "EMPTY", "kb /search", `hits=${r.hits.length} in ${ms} ms`);
  } catch (err) {
    line("FAIL", "kb /search", err instanceof Error ? err.name : "error");
  }
}

async function context(env: Record<string, string | undefined>, platform: string | undefined): Promise<void> {
  if (platform === "pathlynks") {
    const id = env.VC_TEST_PATHLYNKS_USER_ID;
    if (!id) return line("FAIL", "pathlynks", "VC_TEST_PATHLYNKS_USER_ID not set");
    const p = pathlynksPort(env);
    await block("profile + grade", () => p.getStudentProfile(id));
    await block("category fit scores", () => p.getCategoryFits(id));
    await block("subcategory careers", () => p.getCareerFits(id));
    await block("trait levels", () => p.getTraitScores(id));
    await block("combined report summary", () => p.getCombinedReportSummary(id));
    await block("assessment status", () => p.getAssessmentStatus(id));
    await block("saved careers", () => p.getSavedCareers(id), false);
    await block("compare list", () => p.getCompareList(id), false);
    return;
  }
  if (platform === "vidysea") {
    const id = env.VC_TEST_VIDYSEA_USER_ID;
    if (!id) return line("FAIL", "vidysea", "VC_TEST_VIDYSEA_USER_ID not set");
    const v = vidyseaPort(env);
    await block("pathlynks snapshot", () => v.getPathlynksSnapshot(id));
    await block("vidysea profile", () => v.getStudentProfile(id));
    await block("shortlisted programmes", () => v.getShortlistedProgrammes(id), false);
    await block("profile assessment", () => v.getProfileAssessment(id), false);
    return;
  }
  console.error("usage: demo.ts context <pathlynks|vidysea>");
  failed = true;
}

const [cmd, arg] = process.argv.slice(2);
const env = loadEnv();
if (cmd === "preflight") await preflight(env);
else if (cmd === "context") await context(env, arg);
else {
  console.error("usage: demo.ts <preflight|context pathlynks|context vidysea>");
  failed = true;
}
// exitCode, not exit(): an immediate exit while pg sockets close trips a libuv assertion on Windows.
process.exitCode = failed ? 1 : 0;
