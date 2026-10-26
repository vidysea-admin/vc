/**
 * vc-admin-control VA8 (sync and test side): "Sync now" and "Test connection" over fake GitHub / Postgres ports, the real parsers from the engine
 * and the real admin store on the in-memory fake Db (B8). No network, dummy credentials only (B13).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GithubFetchError } from "@vc/engine";
import { parseSourcesFile } from "@vc/schemas";
import { PATHLYNKS_POSTGRES_SOURCE_ID, createGithubPort, createLivePathlynksPort, seedSourcesFromConfig, type GithubFetchFn } from "../src/admin-routes.js";
import { ADMIN_PATH, adminWorld, fakeGithub, fakePostgres, type World } from "./admin-fixtures.js";

const TOKEN = "ghp_dummyDummyDummyDummyDummyDummy0001";
const DUMMY_PG_PASSWORD = "dummy-pg-password-0001";
const here = dirname(fileURLToPath(import.meta.url));
const MIG_DIR = join(here, "..", "..", "..", "packages", "engine", "tests", "fixtures", "ingest", "migrations", "ok");
const migrations = (): Record<string, string> => Object.fromEntries(readdirSync(MIG_DIR).map((f) => [`migrations/${f}`, readFileSync(join(MIG_DIR, f), "utf8")]));
const FRONTEND_TREE: Record<string, string> = {
  "src/app/page.tsx": "",
  "src/app/colleges/page.tsx": "",
  "src/app/colleges/[id]/page.tsx": "",
  "src/app/api/health/route.ts": "",
  "README.md": "",
};

async function worldWith(files: Record<string, string>, extra: Parameters<typeof adminWorld>[0] = {}): Promise<World & { gh: ReturnType<typeof fakeGithub>; tokens: (string | undefined)[] }> {
  const gh = fakeGithub(files);
  const tokens: (string | undefined)[] = [];
  const w = await adminWorld({
    github: (t) => {
      tokens.push(t);
      return gh;
    },
    ...extra,
  });
  await w.store.sources.upsert({ id: "school-be", siteId: "pathlynks", kind: "github", config: { owner: "acme", repo: "backend", branch: "main", service: "school", tokenRef: "GITHUB_TOKEN" } });
  await w.store.sources.upsert({ id: "web-fe", siteId: "pathlynks", kind: "github", config: { owner: "acme", repo: "frontend", branch: "main", service: "frontend" } });
  await w.store.sources.upsert({ id: "pathlynks-db", siteId: "pathlynks", kind: "postgres", config: { host: "db.example", port: 5432, database: "app", user: "reader", sslmode: "require", passwordRef: "PATHLYNKS_DB_PASSWORD", tables: ["students"] } });
  return Object.assign(w, { gh, tokens });
}

test("VA8: syncing a backend source fetches only migrations, writes a schema_map artifact, records lastSync ok with counts, and the list shows it", async () => {
  const w = await worldWith({ ...migrations(), "src/index.js": "console.log(1)" });
  const token = await w.token("admin");
  const res = await w.call("POST", `${ADMIN_PATH}sources/school-be/sync`, { token, body: {} });
  assert.equal(res.status, 200, res.body);
  assert.equal(res.json.status, "ok");
  assert.equal(res.json.counts.files, 5);
  assert.equal(res.json.counts.diagnostics, 0);
  assert.ok(res.json.counts.tables >= 1);
  const art = await w.store.artifacts.getLatest("school-be", "schema_map");
  assert.ok(art, "artifact stored");
  assert.ok((art!.data.tables as Record<string, unknown>).users, "the users table came from the migrations");
  assert.ok(!w.gh.calls.some((c) => c.includes("src/index.js")), "a non-migration file is never fetched");
  const list = await w.call("GET", `${ADMIN_PATH}sources`, { token });
  const row = list.json.sources.find((s: { id: string }) => s.id === "school-be");
  assert.equal(row.lastSync.status, "ok");
  assert.equal(row.lastSync.counts.tables, res.json.counts.tables);
  assert.equal(w.auditRows().at(-1)!.action, "sources.sync");
  assert.equal(w.auditRows().at(-1)!.ok, true);
});

test("VA8: syncing a frontend source builds the nav_catalogue from the file TREE alone (no blob is fetched)", async () => {
  const w = await worldWith(FRONTEND_TREE);
  const res = await w.call("POST", `${ADMIN_PATH}sources/web-fe/sync`, { token: await w.token("admin"), body: {} });
  assert.equal(res.status, 200, res.body);
  assert.equal(res.json.status, "ok");
  assert.ok(res.json.counts.routes >= 3);
  assert.ok(w.gh.calls.every((c) => c.startsWith("listTree")), "tree only");
  const art = await w.store.artifacts.getLatest("web-fe", "nav_catalogue");
  const paths = (art!.data.routes as { path: string }[]).map((r) => r.path);
  assert.ok(paths.includes("/colleges"), JSON.stringify(paths));
  assert.ok(!paths.some((p) => p.includes("health")), "api route handlers are not navigation");
});

test("VA8: a failed fetch records lastSync error, keeps the previous artifact, and neither the response, the audit log nor the logs carry the token", async () => {
  const w = await worldWith(migrations());
  await w.store.sources.setSecret("school-be", TOKEN);
  const admin = await w.token("admin");
  assert.equal((await w.call("POST", `${ADMIN_PATH}sources/school-be/sync`, { token: admin, body: {} })).json.status, "ok");
  const before = await w.store.artifacts.getLatest("school-be", "schema_map");
  const failing = fakeGithub({}, { failWith: new GithubFetchError("listTree", `GitHub said no for token ${TOKEN}`, 401) });
  w.deps.github = () => failing;
  w.clock.ms += 60_000;
  const res = await w.call("POST", `${ADMIN_PATH}sources/school-be/sync`, { token: admin, body: {} });
  assert.equal(res.status, 200);
  assert.equal(res.json.status, "error");
  assert.equal(res.json.message, "The repository could not be read.");
  const after = await w.store.artifacts.getLatest("school-be", "schema_map");
  assert.deepEqual(after, before, "the previous artifact is still the latest");
  const row = (await w.store.sources.get("school-be"))!;
  assert.equal(row.lastSync!.status, "error");
  assert.deepEqual(row.lastSync!.counts, {});
  assert.equal(w.auditRows().at(-1)!.ok, false);
  for (const text of [res.body, JSON.stringify(w.auditRows()), JSON.stringify(w.logs), JSON.stringify(row)]) assert.ok(!text.includes(TOKEN));
  assert.ok(w.logs.some((l) => l.event === "admin_sync_failed"));
});

test("VA8: a repository over the fetch limits reports a plain too-large message, and an unconfigured GitHub port reports that instead of crashing", async () => {
  const w = await worldWith({});
  w.deps.github = () => ({ listTree: async () => ({ tree: [{ path: "src/app/page.tsx", type: "blob", sha: "a" }], truncated: true }), getBlob: async () => ({ content: "" }) });
  const res = await w.call("POST", `${ADMIN_PATH}sources/web-fe/sync`, { token: await w.token("admin"), body: {} });
  assert.equal(res.json.status, "error");
  assert.match(res.json.message, /too large/);
  const none = await adminWorld();
  await none.store.sources.upsert({ id: "school-be", siteId: "pathlynks", kind: "github", config: { owner: "a", repo: "b", branch: "main", service: "school" } });
  const r2 = await none.call("POST", `${ADMIN_PATH}sources/school-be/sync`, { token: await none.token("admin"), body: {} });
  assert.equal(r2.json.status, "error");
  assert.match(r2.json.message, /not configured/);
});

test("VA8: the token for a sync comes from the encrypted secret when one is set, else from the env var the source names, else none (a public repo)", async () => {
  const w = await worldWith(migrations(), { env: { GITHUB_TOKEN: "env-token-not-real-0001" } });
  const admin = await w.token("admin");
  await w.call("POST", `${ADMIN_PATH}sources/school-be/sync`, { token: admin, body: {} });
  assert.equal(w.tokens.at(-1), "env-token-not-real-0001");
  await w.store.sources.setSecret("school-be", TOKEN);
  await w.call("POST", `${ADMIN_PATH}sources/school-be/sync`, { token: admin, body: {} });
  assert.equal(w.tokens.at(-1), TOKEN);
  await w.call("POST", `${ADMIN_PATH}sources/web-fe/sync`, { token: admin, body: {} });
  assert.equal(w.tokens.at(-1), undefined, "web-fe names no tokenRef");
});

test("VA8: a postgres source cannot be synced (400 not_syncable) and an unknown source is 404, both audited ok:false", async () => {
  const w = await worldWith({});
  const admin = await w.token("admin");
  const pg = await w.call("POST", `${ADMIN_PATH}sources/pathlynks-db/sync`, { token: admin, body: {} });
  assert.equal(pg.status, 400);
  assert.equal(pg.json.error, "not_syncable");
  assert.equal((await w.call("POST", `${ADMIN_PATH}sources/ghost/sync`, { token: admin, body: {} })).status, 404);
  assert.deepEqual(w.auditRows().map((r) => r.ok), [false, false]);
});

test("VA8: Test connection for GitHub answers ok:true / false with a fixed plain message and never the underlying error text", async () => {
  const w = await worldWith({ "a.txt": "" });
  const admin = await w.token("admin");
  const good = await w.call("POST", `${ADMIN_PATH}sources/school-be/test`, { token: admin, body: {} });
  assert.deepEqual(good.json, { ok: true, message: "Connection works." });
  w.deps.github = () => fakeGithub({}, { failWith: new Error(`ECONNRESET ${TOKEN} 10.0.0.7:443`) });
  const bad = await w.call("POST", `${ADMIN_PATH}sources/school-be/test`, { token: admin, body: {} });
  assert.deepEqual(bad.json, { ok: false, message: "The repository could not be read." });
  assert.ok(!bad.body.includes(TOKEN) && !bad.body.includes("10.0.0.7"));
  assert.deepEqual(w.auditRows().map((r) => r.ok), [true, false]);
});

test("VA8: Test connection for Postgres passes only the non-secret config and the stored password to the port, and maps each failure cause to a fixed sentence", async () => {
  const pgPort = fakePostgres({ ok: true });
  const w = await worldWith({}, { postgres: pgPort });
  await w.store.sources.setSecret("pathlynks-db", DUMMY_PG_PASSWORD);
  const admin = await w.token("admin");
  const good = await w.call("POST", `${ADMIN_PATH}sources/pathlynks-db/test`, { token: admin, body: {} });
  assert.deepEqual(good.json, { ok: true, message: "Connection works." });
  assert.equal(pgPort.calls[0]!.passwordGiven, true);
  assert.ok(!JSON.stringify(pgPort.calls[0]!.config).includes(DUMMY_PG_PASSWORD));
  const causes: [string, RegExp][] = [
    ["privilege_check_failed", /write privileges/],
    ["timeout", /did not answer/],
    ["not_configured", /No password/],
    ["something_new", /could not be reached/],
  ];
  for (const [cause, re] of causes) {
    w.deps.postgres = fakePostgres({ ok: false, cause });
    const res = await w.call("POST", `${ADMIN_PATH}sources/pathlynks-db/test`, { token: admin, body: {} });
    assert.equal(res.json.ok, false, cause);
    assert.match(res.json.message, re, cause);
    assert.ok(!res.body.includes(DUMMY_PG_PASSWORD));
  }
  w.deps.postgres = { test: async () => Promise.reject(new Error(`pg: password authentication failed ${DUMMY_PG_PASSWORD}`)) };
  const thrown = await w.call("POST", `${ADMIN_PATH}sources/pathlynks-db/test`, { token: admin, body: {} });
  assert.deepEqual(thrown.json, { ok: false, message: "The database could not be reached." });
  w.deps.postgres = undefined;
  assert.match((await w.call("POST", `${ADMIN_PATH}sources/pathlynks-db/test`, { token: admin, body: {} })).json.message, /not configured/);
});

test("VA8: a stored secret that cannot be decrypted (master key rotated) makes Test connection say so plainly instead of throwing", async () => {
  const { createAdminStore } = await import("@vc/db");
  const w = await worldWith({ "a.txt": "" });
  await w.store.sources.setSecret("school-be", TOKEN);
  const other = createAdminStore(w.deps.db as never, { masterKey: Buffer.alloc(32, 7).toString("base64") });
  w.deps.store = other;
  const res = await w.call("POST", `${ADMIN_PATH}sources/school-be/test`, { token: await w.token("admin"), body: {} });
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, false);
  assert.ok(!res.body.includes(TOKEN));
});

// ---------------------------------------------------------------------------------------------------------------- seed

const SEED_FILE = parseSourcesFile({
  version: 1,
  siteId: "pathlynks",
  sources: [
    { kind: "github", id: "seed-auth", owner: "acme", repo: "backend", branch: "main", service: "auth", tokenRef: "GITHUB_TOKEN" },
    { kind: "postgres", id: "seed-db", host: "db.example", port: 5432, database: "app", user: "reader", sslmode: "require", passwordRef: "PATHLYNKS_DB_PASSWORD", tables: ["students"] },
  ],
});

test("VA8: seeding config/sources.json is idempotent: a second run changes nothing and never overwrites a stored secret or lastSync", async () => {
  const w = await adminWorld();
  assert.deepEqual(await seedSourcesFromConfig(w.store, SEED_FILE), { created: 2, existing: 0 });
  await w.store.sources.setSecret("seed-auth", TOKEN);
  await w.store.sources.recordSync("seed-auth", { at: "2026-10-25T00:00:00.000Z", status: "ok", counts: { files: 3 } });
  const before = JSON.stringify(w.fakeDb.collection("sources").all());
  assert.deepEqual(await seedSourcesFromConfig(w.store, SEED_FILE), { created: 0, existing: 2 });
  assert.equal(JSON.stringify(w.fakeDb.collection("sources").all()), before);
  assert.equal(await w.store.sources.readSecret("seed-auth"), TOKEN);
  assert.equal((await w.store.sources.get("seed-auth"))!.lastSync!.status, "ok");
  const row = (await w.store.sources.get("seed-db"))!;
  assert.equal(row.siteId, "pathlynks");
  assert.equal(row.config.passwordRef, "PATHLYNKS_DB_PASSWORD");
  assert.ok(!("kind" in row.config) && !("id" in row.config), "kind and id are columns, not config");
});

test("VA8: the real config/sources.json seeds cleanly and carries env NAMES only, never a value", async () => {
  const { loadSourcesFile } = await import("@vc/schemas");
  const file = loadSourcesFile(join(here, "..", "..", "..", "config", "sources.json"));
  assert.ok(file.sources.length >= 4);
  assert.ok(file.sources.some((s) => s.kind === "postgres"));
  const w = await adminWorld();
  assert.equal((await seedSourcesFromConfig(w.store, file)).created, file.sources.length);
  assert.ok(!JSON.stringify(w.fakeDb.collection("sources").all()).includes("ghp_"));
});

// ---------------------------------------------------------------------------------------------------------------- real GitHub port, fake fetch

test("VA8: createGithubPort sends the token only in the Authorization header, reads the recursive tree and a blob, and an HTTP error carries the status only", async () => {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const fetchFn: GithubFetchFn = async (url, init) => {
    seen.push({ url, headers: init.headers });
    if (url.includes("/git/trees/")) return { ok: true, status: 200, json: async () => ({ tree: [{ path: "migrations/a.js", type: "blob", sha: "abc", size: 3 }], truncated: false }) };
    if (url.includes("/git/blobs/")) return { ok: true, status: 200, json: async () => ({ content: Buffer.from("hi").toString("base64"), encoding: "base64", size: 2 }) };
    return { ok: false, status: 404, json: async () => ({ message: `Not Found ${TOKEN}` }) };
  };
  const port = createGithubPort(TOKEN, fetchFn);
  const tree = await port.listTree("acme", "back end", "release/1");
  assert.deepEqual(tree, { tree: [{ path: "migrations/a.js", type: "blob", sha: "abc", size: 3 }], truncated: false });
  assert.equal(seen[0]!.url, "https://api.github.com/repos/acme/back%20end/git/trees/release%2F1?recursive=1");
  assert.equal(seen[0]!.headers.authorization, `Bearer ${TOKEN}`);
  assert.ok(!seen[0]!.url.includes(TOKEN));
  const blob = await port.getBlob("acme", "backend", "abc");
  assert.deepEqual(blob, { content: Buffer.from("hi").toString("base64"), encoding: "base64", size: 2 });
  const anon = createGithubPort(undefined, fetchFn);
  await anon.listTree("acme", "backend", "main");
  assert.equal(seen.at(-1)!.headers.authorization, undefined, "a public repo sends no Authorization header");
  const notFound: GithubFetchFn = async () => ({ ok: false, status: 404, json: async () => ({ message: `Not Found ${TOKEN}` }) });
  await assert.rejects(
    () => createGithubPort(TOKEN, notFound).listTree("acme", "gone", "main"),
    (e: Error) => /404/.test(e.message) && !e.message.includes(TOKEN),
  );
  const malformed: GithubFetchFn = async () => ({ ok: true, status: 200, json: async () => ({ unexpected: true }) });
  await assert.rejects(() => createGithubPort(undefined, malformed).listTree("acme", "x", "main"));
});

// ---------------------------------------------------------------------------------------------------------------- fix cycle 1 (R1, R2)

test("fix1 R1: a stored source whose tokenRef names VC_ADMIN_MASTER_KEY never has that env value read: test and sync answer an error and the fake GitHub port gets no token", async () => {
  const MASTER = "master-key-not-real-0001";
  const w = await worldWith(migrations(), { env: { VC_ADMIN_MASTER_KEY: MASTER, MONGODB_URL: "mongodb://u:p@h/db" } });
  await w.store.sources.upsert({ id: "evil-gh", siteId: "pathlynks", kind: "github", config: { owner: "acme", repo: "backend", branch: "main", service: "school", tokenRef: "VC_ADMIN_MASTER_KEY" } });
  const admin = await w.token("admin");
  const before = w.tokens.length;
  const test = await w.call("POST", `${ADMIN_PATH}sources/evil-gh/test`, { token: admin, body: {} });
  assert.equal(test.json.ok, false);
  const sync = await w.call("POST", `${ADMIN_PATH}sources/evil-gh/sync`, { token: admin, body: {} });
  assert.equal(sync.json.status, "error");
  assert.equal(w.tokens.length, before, "the GitHub port was never even built for the evil ref");
  assert.ok(!w.tokens.includes(MASTER));
  for (const text of [test.body, sync.body, JSON.stringify(w.logs), JSON.stringify(w.auditRows())]) assert.ok(!text.includes(MASTER));
  // The same holds for a postgres source: the fake postgres port never receives the env value.
  const pgPort = fakePostgres({ ok: true });
  w.deps.postgres = pgPort;
  await w.store.sources.upsert({ id: "evil-pg", siteId: "pathlynks", kind: "postgres", config: { host: "db.example", port: 5432, database: "app", user: "reader", sslmode: "require", passwordRef: "MONGODB_URL", tables: ["students"] } });
  const pg = await w.call("POST", `${ADMIN_PATH}sources/evil-pg/test`, { token: admin, body: {} });
  assert.equal(pg.json.ok, false);
  assert.equal(pgPort.calls.length, 0, "the postgres port was never called with the env value");
});

test("fix1 R2: an admin-created postgres source with id aaa-evil does not become the live Pathlynks port; the seeded pathlynks-db keeps its tables", async () => {
  const w = await adminWorld();
  const statements: string[] = [];
  let connects = 0;
  const connect = async () => {
    connects++;
    return {
      async query(text: string) {
        statements.push(text);
        if (/has_table_privilege/i.test(text)) return { rows: [{ ins: false, upd: false, del: false }] };
        if (/^SET/i.test(text)) return { rows: [] };
        return { rows: [{ career_name: "Chef" }] };
      },
      async end() {},
    };
  };
  const base = { host: "evil.example", port: 5432, database: "app", user: "reader", sslmode: "require", passwordRef: "PATHLYNKS_DB_PASSWORD" };
  await w.store.sources.upsert({ id: "aaa-evil", siteId: "pathlynks", kind: "postgres", config: { ...base, tables: ["students", "saved_careers_evil", "compare_lists", "assessments"] } });
  const clock = { ms: 0 };
  const port = createLivePathlynksPort(w.store, { env: { PATHLYNKS_DB_PASSWORD: "dummy-pg-password-0001" }, nowMs: () => clock.ms, connect: connect as never });
  assert.deepEqual(await port.getSavedCareers("stu-A"), { status: "unavailable" }, "only the evil source exists: the live port stays unavailable");
  assert.equal(connects, 0, "no connection was attempted for the evil source");
  await w.store.sources.upsert({ id: PATHLYNKS_POSTGRES_SOURCE_ID, siteId: "pathlynks", kind: "postgres", config: { ...base, host: "real.example", tables: ["students", "saved_careers", "compare_lists", "assessments"] } });
  clock.ms += 61_000;
  assert.deepEqual(await port.getSavedCareers("stu-A"), { status: "ok", data: [{ career_name: "Chef" }] });
  const selects = statements.filter((q) => /^SELECT \*/i.test(q));
  assert.ok(selects.length > 0 && selects.every((q) => q.includes('"saved_careers"') && !q.includes("saved_careers_evil")), JSON.stringify(selects));
});

test("fix1 R2: the fixed live-port source id is the postgres entry of config/sources.json", async () => {
  const { loadSourcesFile } = await import("@vc/schemas");
  const file = loadSourcesFile(join(here, "..", "..", "..", "config", "sources.json"));
  assert.deepEqual(file.sources.filter((s) => s.kind === "postgres").map((s) => s.id), [PATHLYNKS_POSTGRES_SOURCE_ID]);
});

// ---------------------------------------------------------------------------------------------------------------- fix cycle 1 (R6): an empty or all-failed sync never replaces a good artifact

const MIG_OK_ONE = "module.exports = { up: async (queryInterface, Sequelize) => { await queryInterface.createTable('users', { id: { type: Sequelize.INTEGER, primaryKey: true } }); }, down: async () => {} };";

async function syncOf(w: Awaited<ReturnType<typeof worldWith>>, id: string) {
  return w.call("POST", `${ADMIN_PATH}sources/${id}/sync`, { token: await w.token("admin"), body: {} });
}

test("fix1 R6: a school sync that finds no migration file at all (a renamed folder) records error and keeps the previous schema_map as the latest", async () => {
  const w = await worldWith(migrations());
  assert.equal((await syncOf(w, "school-be")).json.status, "ok");
  const good = await w.store.artifacts.getLatest("school-be", "schema_map");
  w.deps.github = () => fakeGithub({ "src/index.js": "console.log(1)", "README.md": "" });
  w.clock.ms += 60_000;
  const res = await syncOf(w, "school-be");
  assert.equal(res.json.status, "error");
  assert.match(res.json.message, /no migration files/i);
  assert.equal(res.json.counts.files, 0);
  assert.deepEqual(await w.store.artifacts.getLatest("school-be", "schema_map"), good, "the good artifact is still the latest");
  const row = (await w.store.sources.get("school-be"))!;
  assert.equal(row.lastSync!.status, "error");
  assert.equal(row.lastSync!.counts.files, 0);
  assert.equal(w.auditRows().at(-1)!.ok, false);
});

test("fix1 R6: migration files that define no table (all no-ops) record error and keep the previous schema_map", async () => {
  const w = await worldWith(migrations());
  await syncOf(w, "school-be");
  const good = await w.store.artifacts.getLatest("school-be", "schema_map");
  w.deps.github = () => fakeGithub({ "migrations/20260101-noop.js": "module.exports = { up: async () => {}, down: async () => {} };" });
  w.clock.ms += 60_000;
  const res = await syncOf(w, "school-be");
  assert.equal(res.json.status, "error");
  assert.match(res.json.message, /no tables/i);
  assert.deepEqual(await w.store.artifacts.getLatest("school-be", "schema_map"), good);
  assert.equal((await w.store.sources.get("school-be"))!.lastSync!.status, "error");
});

test("fix1 R6: every migration file failing to parse (diagnostics >= files) records error with the diagnostics in the response and does not replace the artifact", async () => {
  const w = await worldWith(migrations());
  await syncOf(w, "school-be");
  const good = await w.store.artifacts.getLatest("school-be", "schema_map");
  // one file that yields a table AND an unparsed statement: diagnostics (1) >= files (1)
  w.deps.github = () => fakeGithub({ "migrations/20260101-m.js": MIG_OK_ONE.replace("}); }, down", "}); await queryInterface.addColumn(tbl, col, def); }, down") });
  w.clock.ms += 60_000;
  const res = await syncOf(w, "school-be");
  assert.equal(res.json.status, "error", res.body);
  assert.match(res.json.message, /could not be parsed/i);
  assert.equal(res.json.counts.diagnostics, 1);
  assert.equal(res.json.diagnostics.length, 1);
  assert.equal(res.json.diagnostics[0].code, "unresolved_args");
  assert.deepEqual(await w.store.artifacts.getLatest("school-be", "schema_map"), good);
});

test("fix1 R6: a migration over the size cap is counted as skipped, and the sync still succeeds for the others", async () => {
  const big = "// " + "x".repeat(1_100_000);
  const w = await worldWith({ ...migrations(), "migrations/20260102-big.js": big });
  const res = await syncOf(w, "school-be");
  assert.equal(res.json.status, "ok", res.body);
  assert.equal(res.json.counts.skipped, 1);
  assert.equal(res.json.counts.files, 5, "files counts the ones actually read");
  assert.equal((await w.store.sources.get("school-be"))!.lastSync!.counts.skipped, 1);
});

test("fix1 R6: a partial parse keeps at most 20 diagnostics in the artifact, with a token-looking file name redacted", async () => {
  const bad: Record<string, string> = {};
  for (let i = 0; i < 24; i++) bad[`migrations/2026020${String(i).padStart(2, "0")}-bad.js`] = "this is ((( not js";
  bad[`migrations/20260300-${TOKEN}.js`] = "this is ((( not js";
  const w = await worldWith({ ...migrations(), ...bad });
  await w.store.sources.setSecret("school-be", TOKEN);
  const res = await syncOf(w, "school-be");
  assert.equal(res.json.status, "ok", res.body);
  assert.equal(res.json.counts.diagnostics, 25);
  const art = await w.store.artifacts.getLatest("school-be", "schema_map");
  const diags = art!.data.diagnostics as { code: string; file: string; message: string }[];
  assert.equal(diags.length, 20);
  const everything = JSON.stringify(art) + res.body + JSON.stringify(w.logs);
  assert.ok(!everything.includes(TOKEN), "the token never lands in a stored or returned diagnostic");
});

test("fix1 R6: a frontend sync whose tree has no page routes records error and keeps the previous nav_catalogue", async () => {
  const w = await worldWith(FRONTEND_TREE);
  assert.equal((await syncOf(w, "web-fe")).json.status, "ok");
  const good = await w.store.artifacts.getLatest("web-fe", "nav_catalogue");
  w.deps.github = () => fakeGithub({ "README.md": "", "package.json": "{}" });
  w.clock.ms += 60_000;
  const res = await syncOf(w, "web-fe");
  assert.equal(res.json.status, "error");
  assert.match(res.json.message, /no page routes/i);
  assert.equal(res.json.counts.routes, 0);
  assert.deepEqual(await w.store.artifacts.getLatest("web-fe", "nav_catalogue"), good);
  assert.equal((await w.store.sources.get("web-fe"))!.lastSync!.status, "error");
});
