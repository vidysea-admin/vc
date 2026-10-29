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
import { PATHLYNKS_POSTGRES_SOURCE_ID, pathlynksTablesFrom, createGithubPort, createLivePathlynksPort, seedSourcesFromConfig, type GithubFetchFn } from "../src/admin-routes.js";
import { ADMIN_PATH, adminWorld, fakeGithub, fakePostgres, type World } from "./admin-fixtures.js";

const TOKEN = "ghp_dummyDummyDummyDummyDummyDummy0001";
const COMMIT_SHA = "0123456789abcdef0123456789abcdef01234567";
const TREE_SHA = "fedcba9876543210fedcba9876543210fedcba98";
const HEAD = { sha: TREE_SHA, commit: COMMIT_SHA };
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
    seededSources: WORLD_SEED.sources,
    ...extra,
  });
  await seedSourcesFromConfig(w.store, WORLD_SEED);
  await w.store.sources.upsert({ id: "web-fe", siteId: "pathlynks", kind: "github", config: { owner: "acme", repo: "frontend", branch: "main", service: "frontend" } });
  return Object.assign(w, { gh, tokens });
}

/** The fixture's own "config/sources.json": the two sources whose env refs the server may resolve (fix2 F1). */
const WORLD_SEED = parseSourcesFile({
  version: 1,
  siteId: "pathlynks",
  sources: [
    { kind: "github", id: "school-be", owner: "acme", repo: "backend", branch: "main", service: "school", tokenRef: "GITHUB_TOKEN" },
    { kind: "postgres", id: "pathlynks-db", host: "db.example", port: 5432, database: "app", user: "reader", sslmode: "require", passwordRef: "PATHLYNKS_DB_PASSWORD", tables: ["students"] },
  ],
});

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
  assert.equal((await seedSourcesFromConfig(w.store, file)).created, file.sources.filter((s) => s.kind !== "mongo").length, "the read-only mongo source is config-only: it is never stored as an editable source");
  assert.equal(await w.store.sources.get("pathlynks-journey"), null);
  assert.ok(!JSON.stringify(w.fakeDb.collection("sources").all()).includes("ghp_"));
});

test("T-057: the real config/sources.json registers the Vidysea frontend repo as a frontend github source (names only, no secret)", async () => {
  const { loadSourcesFile } = await import("@vc/schemas");
  const file = loadSourcesFile(join(here, "..", "..", "..", "config", "sources.json"));
  const src = file.sources.find((s) => s.id === "vidysea-frontend");
  assert.ok(src && src.kind === "github", "vidysea-frontend github source is registered");
  assert.deepEqual(
    { owner: src.owner, repo: src.repo, branch: src.branch, service: src.service, siteId: src.siteId, platform: src.platform, tokenRef: src.tokenRef },
    { owner: "vidysea-admin", repo: "vidysea-user-frontend", branch: "prod", service: "frontend", siteId: "vidysea", platform: "vidysea", tokenRef: "GITHUB_TOKEN" },
  );
});

// ---------------------------------------------------------------------------------------------------------------- real GitHub port, fake fetch

test("VA8: createGithubPort sends the token only in the Authorization header, reads the recursive tree and a blob, and an HTTP error carries the status only", async () => {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const fetchFn: GithubFetchFn = async (url, init) => {
    seen.push({ url, headers: init.headers });
    if (url.includes("/commits/")) return { ok: true, status: 200, json: async () => ({ sha: COMMIT_SHA, commit: { tree: { sha: TREE_SHA } } }) };
    if (url.includes("/git/trees/")) return { ok: true, status: 200, json: async () => ({ sha: TREE_SHA, tree: [{ path: "migrations/a.js", type: "blob", sha: "abc", size: 3 }], truncated: false }) };
    if (url.includes("/git/blobs/")) return { ok: true, status: 200, json: async () => ({ content: Buffer.from("hi").toString("base64"), encoding: "base64", size: 2 }) };
    return { ok: false, status: 404, json: async () => ({ message: `Not Found ${TOKEN}` }) };
  };
  const port = createGithubPort(TOKEN, fetchFn);
  const tree = await port.listTree("acme", "back end", "release/1");
  assert.deepEqual(tree, { tree: [{ path: "migrations/a.js", type: "blob", sha: "abc", size: 3 }], truncated: false, sha: TREE_SHA, commit: COMMIT_SHA });
  assert.equal(seen[0]!.url, "https://api.github.com/repos/acme/back%20end/git/trees/release%2F1?recursive=1");
  assert.equal(seen[1]!.url, "https://api.github.com/repos/acme/back%20end/commits/release%2F1", "the commit of the branch, from the commits API");
  assert.equal(seen[0]!.headers.authorization, `Bearer ${TOKEN}`);
  assert.ok(seen.every((c) => !c.url.includes(TOKEN)));
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
        return { rows: [{ career: "Chef" }] };
      },
      async end() {},
    };
  };
  const base = { host: "evil.example", port: 5432, database: "app", user: "reader", sslmode: "require", passwordRef: "PATHLYNKS_DB_PASSWORD" };
  await w.store.sources.upsert({ id: "aaa-evil", siteId: "pathlynks", kind: "postgres", config: { ...base, tables: ["students", "saved_careers_evil", "compare_lists", "assessments"] } });
  const clock = { ms: 0 };
  const seeded = [{ kind: "postgres" as const, id: PATHLYNKS_POSTGRES_SOURCE_ID, ...base, sslmode: "require" as const, host: "real.example", tables: ["users", "user_grade", "grade", "student_saved_careers", "student_career_compare", "career_option", "assessment_response"] }];
  const port = createLivePathlynksPort(w.store, { env: { PATHLYNKS_DB_PASSWORD: "dummy-pg-password-0001" }, seeded, nowMs: () => clock.ms, connect: connect as never });
  assert.deepEqual(await port.getSavedCareers("stu-A"), { status: "unavailable" }, "only the evil source exists: the live port stays unavailable");
  assert.equal(connects, 0, "no connection was attempted for the evil source");
  await w.store.sources.upsert({ id: PATHLYNKS_POSTGRES_SOURCE_ID, siteId: "pathlynks", kind: "postgres", config: { ...base, host: "real.example", tables: ["users", "user_grade", "grade", "student_saved_careers", "student_career_compare", "career_option", "assessment_response"] } });
  clock.ms += 61_000;
  assert.deepEqual(await port.getSavedCareers("stu-A"), { status: "ok", data: [{ career: "Chef" }] });
  const selects = statements.filter((q) => /^SELECT\b/i.test(q) && !/has_table_privilege/i.test(q));
  assert.ok(selects.length > 0 && selects.every((q) => q.includes('"student_saved_careers"') && !q.includes("saved_careers_evil")), JSON.stringify(selects));
});

test("fix2 F1: the seeded pathlynks-db with its host PATCHed to attacker.example never becomes a live chat connection carrying the env password; restored, it connects again", async () => {
  const w = await adminWorld();
  const { loadSourcesFile } = await import("@vc/schemas");
  const file = loadSourcesFile(join(here, "..", "..", "..", "config", "sources.json"));
  await seedSourcesFromConfig(w.store, file);
  const seededPg = file.sources.find((s) => s.kind === "postgres")!;
  // An injected connect is called with no driver config, so a connection here means the port was built WITH a password (no password = no port).
  const connected: number[] = [];
  const connect = async () => {
    connected.push(1);
    return {
      async query(text: string) {
        if (/has_table_privilege/i.test(text)) return { rows: [{ ins: false, upd: false, del: false }] };
        if (/^SET/i.test(text)) return { rows: [] };
        return { rows: [] };
      },
      async end() {},
    };
  };
  const clock = { ms: 0 };
  const ENV_PW = "env-pg-password-not-real-0002";
  const port = createLivePathlynksPort(w.store, { env: { PATHLYNKS_DB_PASSWORD: ENV_PW }, seeded: file.sources, nowMs: () => clock.ms, connect: connect as never });
  const { kind, id, ...config } = seededPg;
  await w.store.sources.upsert({ id, siteId: file.siteId, kind, config: { ...config, host: "attacker.example" } });
  assert.deepEqual(await port.getSavedCareers("stu-A"), { status: "unavailable" });
  assert.equal(connected.length, 0, "no connection was opened for the PATCHed host");
  await w.store.sources.upsert({ id, siteId: file.siteId, kind, config });
  clock.ms += 61_000;
  await port.getSavedCareers("stu-A");
  assert.ok(connected.length > 0, "the unchanged seeded source still gets its env password and connects");
  // and with no seeded list handed in, the env password is never used at all
  const closed = createLivePathlynksPort(w.store, { env: { PATHLYNKS_DB_PASSWORD: ENV_PW }, nowMs: () => clock.ms, connect: connect as never });
  const n = connected.length;
  assert.deepEqual(await closed.getSavedCareers("stu-A"), { status: "unavailable" });
  assert.equal(connected.length, n);
});

test("fix1 R2: the fixed live-port source id is the postgres entry of config/sources.json", async () => {
  const { loadSourcesFile } = await import("@vc/schemas");
  const file = loadSourcesFile(join(here, "..", "..", "..", "config", "sources.json"));
  assert.deepEqual(file.sources.filter((s) => s.kind === "postgres" && (s.platform ?? "pathlynks") === "pathlynks").map((s) => s.id), [PATHLYNKS_POSTGRES_SOURCE_ID]);
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

test("fix2 F4: one migration that defines a table AND has one unparsed statement is a usable sync: status ok, the diagnostic recorded, the artifact replaced", async () => {
  const w = await worldWith(migrations());
  await syncOf(w, "school-be");
  w.deps.github = () => fakeGithub({ "migrations/20260101-m.js": MIG_OK_ONE.replace("}); }, down", "}); await queryInterface.addColumn(tbl, col, def); }, down") });
  w.clock.ms += 60_000;
  const res = await syncOf(w, "school-be");
  assert.equal(res.json.status, "ok", res.body);
  assert.equal(res.json.counts.diagnostics, 1);
  assert.equal(res.json.diagnostics.length, 1);
  assert.equal(res.json.diagnostics[0].code, "unresolved_args");
  const art = await w.store.artifacts.getLatest("school-be", "schema_map");
  assert.deepEqual(Object.keys(art!.data.tables as object), ["users"]);
});

test("fix2 F4: four valid createTable migrations, each with one raw sequelize.query, sync as ok with 4 tables, the artifact stored and 4 diagnostics recorded (no false error)", async () => {
  const w = await worldWith(migrations());
  const files: Record<string, string> = {};
  for (const t of ["alpha", "beta", "gamma", "delta"]) {
    files[`migrations/2026010${["alpha", "beta", "gamma", "delta"].indexOf(t)}-${t}.js`] =
      `module.exports = { up: async (queryInterface, Sequelize) => { await queryInterface.createTable('${t}', { id: { type: Sequelize.INTEGER, primaryKey: true } }); await queryInterface.sequelize.query('UPDATE ${t} SET id = id'); }, down: async () => {} };`;
  }
  w.deps.github = () => fakeGithub(files);
  const res = await syncOf(w, "school-be");
  assert.equal(res.json.status, "ok", res.body);
  assert.equal(res.json.counts.files, 4);
  assert.equal(res.json.counts.tables, 4);
  assert.ok(res.json.counts.diagnostics >= 4, res.body);
  const art = await w.store.artifacts.getLatest("school-be", "schema_map");
  assert.deepEqual(Object.keys(art!.data.tables as object).sort(), ["alpha", "beta", "delta", "gamma"]);
  assert.ok((art!.data.diagnostics as unknown[]).length >= 4);
  assert.equal((await w.store.sources.get("school-be"))!.lastSync!.status, "ok");
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

// T-057: the services copy rides on the existing sync; one extra file is read, and only when the tree has /services pages.
const SERVICES_TREE: Record<string, string> = {
  "src/app/(public)/page.tsx": "",
  "src/app/(public)/services/page.tsx": "",
  "src/app/(public)/services/study-abroad-student-loan-assistance/page.tsx": "",
  "src/app/(public)/services/study-visa-assistance/page.tsx": "",
  "src/app/api/health/route.ts": "",
  "src/messages/hi.json": JSON.stringify({ services: { meta: { loan: { title: "Hindi", description: "never read" } } } }),
  "src/messages/en.json": JSON.stringify({
    services: {
      meta: {
        loan: { title: "Student Loan Assistance | Financial Support - Vidysea", description: "Apply for further studies education loans with ease." },
        visa: { title: "Study Visa Assistance | Smooth Visa Process - Vidysea", description: "Get expert assistance for your student visa application." },
      },
    },
  }),
};

test("T-057: a frontend sync with /services pages stores label and summary from src/messages/en.json, reading only that file", async () => {
  const w = await worldWith(SERVICES_TREE);
  const res = await syncOf(w, "web-fe");
  assert.equal(res.json.status, "ok", res.body);
  const routes = (await w.store.artifacts.getLatest("web-fe", "nav_catalogue"))!.data.routes as { path: string; label?: string; summary?: string }[];
  const loan = routes.find((r) => r.path === "/services/study-abroad-student-loan-assistance")!;
  assert.equal(loan.label, "Student Loan Assistance");
  assert.equal(loan.summary, "Apply for further studies education loans with ease.");
  assert.equal(routes.find((r) => r.path === "/services/study-visa-assistance")!.label, "Study Visa Assistance");
  assert.equal(routes.find((r) => r.path === "/services")!.label, undefined);
  assert.deepEqual(w.gh.calls.filter((c) => c.startsWith("getBlob")), ["getBlob src/messages/en.json"], "only the English messages file is fetched");
});

test("T-057: a missing messages file leaves the plain route catalogue and the sync still succeeds", async () => {
  const { "src/messages/en.json": _gone, ...noMessages } = SERVICES_TREE;
  const w = await worldWith(noMessages);
  const res = await syncOf(w, "web-fe");
  assert.equal(res.json.status, "ok", res.body);
  const routes = (await w.store.artifacts.getLatest("web-fe", "nav_catalogue"))!.data.routes as { path: string; label?: string }[];
  assert.ok(routes.some((r) => r.path === "/services/study-visa-assistance"));
  assert.ok(routes.every((r) => r.label === undefined));
});


test("Q1 R4 exact table mapping requires every join and never selects a similarly named substitute", () => {
  const tables = ["users", "user_grade", "grade", "student_saved_careers", "student_career_compare", "career_option", "assessment_response"];
  assert.deepEqual(pathlynksTablesFrom(["student_saved_careers_evil", ...tables]), {
    profile: "users", userGrade: "user_grade", grade: "grade", savedCareers: "student_saved_careers",
    compareList: "student_career_compare", careerOption: "career_option", assessment: "assessment_response",
  });
  for (const missing of tables) assert.equal(pathlynksTablesFrom(tables.filter(t => t !== missing)), undefined, missing);
  assert.equal(pathlynksTablesFrom(["students", "saved_careers", "compare_lists", "assessments"]), undefined);
});


// S12 integration: synthetic store -> real native port -> mocked bounded SQL.
const S12_FILE = parseSourcesFile({version:1,siteId:'pathlynks',sources:[{kind:'postgres',id:'vidysea-db',siteId:'vidysea',platform:'vidysea',host:'vidysea.example',port:5432,database:'vidysea_fixture',user:'reader',sslmode:'require',passwordRef:'VIDYSEA_DB_PASSWORD',tables:['users','students','student_shortlisted_courses','ai_profile_assessments']}]});
const S12_OWNER = '11111111-1111-4111-8111-111111111111';

test('S12 Admin seeding preserves site/platform/enabled rather than relabelling Vidysea', async()=>{
 const w=await adminWorld(); await seedSourcesFromConfig(w.store,S12_FILE);
 const s=(await w.store.sources.get('vidysea-db'))!; assert.equal(s.siteId,'vidysea'); assert.equal(s.config.platform,'vidysea');
});

test('S12 native stored Vidysea adapter executes bounded SQL with bound owner, encrypted secret, and explicit unavailable comparison', async()=>{
 const api=await import('../src/admin-routes.js'); assert.equal(typeof api.createLiveVidyseaPort,'function');
 const w=await adminWorld(); await seedSourcesFromConfig(w.store,S12_FILE); await w.store.sources.setSecret('vidysea-db','synthetic-vidysea-secret');
 const statements:{text:string;values?:readonly unknown[]}[]=[];
 const port=api.createLiveVidyseaPort(w.store,{env:{PATHLYNKS_ALLOW_PRIVILEGED_ROLE:'1'},siteId:'vidysea',seeded:S12_FILE.sources,connect:async()=>({query:async(text:string,values?:readonly unknown[])=>{statements.push({text,values}); return /has_table_privilege/.test(text)?{rows:[{ins:false,upd:false,del:false}]}:/^SET|^BEGIN|^COMMIT|^ROLLBACK/.test(text)?{rows:[]}:{rows:[{source:'vidysea',programme_name:'Synthetic computing'}]};},end:async()=>{}})});
 assert.deepEqual(await port.getShortlistedProgrammes(S12_OWNER),{ok:true,rows:[{source:'vidysea',programme_name:'Synthetic computing'}],truncated:false});
 const sql=statements.find(s=>s.text.includes('q.programme_name'))!; assert.ok(sql.text.includes('LIMIT 51')); assert.deepEqual(sql.values,[S12_OWNER]); assert.ok(statements.some(s=>/has_table_privilege/.test(s.text)),'Pathlynks override did not suppress Vidysea privilege checks');
 assert.deepEqual(await port.getCompareList(S12_OWNER),{ok:false,reason:'unavailable',cause:'unsupported'}); assert.equal(port.getStatus().privilegeCheck,'ok'); assert.ok(!('getSavedCareers' in port));
});

test('tool-first T4: the live Vidysea port passes the five tracking reads through, owner-bound, and answers unavailable (never empty) when the source is not configured',async()=>{
 const api=await import('../src/admin-routes.js');
 const methods=['getJourneyMaps','getApplications','getVisaApplications','getFavourites','getSavedScholarships'] as const;
 const tables=['users','students','student_shortlisted_courses','ai_profile_assessments','user_course_journey_map','journey_phases','milestones','applications','visa_applications','user_favourites','saved_scholarships'];
 const file=parseSourcesFile({version:1,siteId:'pathlynks',sources:[{kind:'postgres',id:'vidysea-db',siteId:'vidysea',platform:'vidysea',host:'vidysea.example',port:5432,database:'vidysea_fixture',user:'reader',sslmode:'require',passwordRef:'VIDYSEA_DB_PASSWORD',tables}]});
 const w=await adminWorld(); await seedSourcesFromConfig(w.store,file); await w.store.sources.setSecret('vidysea-db','synthetic-vidysea-secret');
 const statements:{text:string;values?:readonly unknown[]}[]=[];
 const port=api.createLiveVidyseaPort(w.store,{env:{},siteId:'vidysea',seeded:file.sources,connect:async()=>({query:async(text:string,values?:readonly unknown[])=>{statements.push({text,values}); return /has_table_privilege/.test(text)?{rows:[{ins:false,upd:false,del:false}]}:/^SET|^BEGIN|^COMMIT|^ROLLBACK/.test(text)?{rows:[]}:{rows:[{source:'vidysea',item_id:'x'}]};},end:async()=>{}})});
 for(const m of methods){ assert.equal(typeof port[m],'function',m); assert.deepEqual(await port[m](S12_OWNER),{ok:true,rows:[{source:'vidysea',item_id:'x'}],truncated:false},m); }

 const data=statements.filter(s=>s.values?.[0]===S12_OWNER&&s.text.includes("'vidysea' AS source"));
 assert.equal(data.length,methods.length); assert.ok(data.every(s=>s.values?.length===1&&s.values[0]===S12_OWNER&&/LIMIT 51$/.test(s.text)));
 const closed=api.createLiveVidyseaPort(w.store,{env:new Proxy({}, {get(){throw Error('env forbidden');}}),siteId:'vidysea',seeded:file.sources.map(x=>({...x,enabled:false})),connect:async()=>{throw Error('must not connect');}});
 for(const m of methods) assert.deepEqual(await closed[m](S12_OWNER),{ok:false,reason:'unavailable',cause:'not_configured'},m);
});

test('S12 Vidysea credential canaries refuse cross-site/destination/ref/disabled before env access or SQL',async()=>{
 const api=await import('../src/admin-routes.js'); assert.equal(typeof api.createLiveVidyseaPort,'function');
 for(const patch of [{siteId:'other'}, {config:{host:'attacker.example'}}, {config:{passwordRef:'VC_ADMIN_MASTER_KEY'}}, {config:{enabled:false}}, {config:{platform:'pathlynks'}}]){
  const w=await adminWorld(); await seedSourcesFromConfig(w.store,S12_FILE); const src=(await w.store.sources.get('vidysea-db'))!;
  await w.store.sources.upsert({id:src.id,kind:src.kind,siteId:patch.siteId??src.siteId,config:{...src.config,...patch.config}});
  let reads=0,connects=0; const env=new Proxy({}, {get(){reads++;throw Error('env canary');}});
  const port=api.createLiveVidyseaPort(w.store,{env,siteId:'vidysea',seeded:S12_FILE.sources,connect:async()=>{connects++;throw Error('must not connect');}});
  assert.equal((await port.getStudentProfile(S12_OWNER)).ok,false); assert.equal(reads,0); assert.equal(connects,0);
 }
});

test('S12 Pathlynks factory refuses a Vidysea source even with encrypted credentials',async()=>{
 const w=await adminWorld(); await seedSourcesFromConfig(w.store,S12_FILE); await w.store.sources.setSecret('vidysea-db','synthetic-vidysea-secret'); let n=0;
 const port=createLivePathlynksPort(w.store,{env:{},seeded:S12_FILE.sources,sourceId:'vidysea-db',connect:async()=>{n++;throw Error('must not connect');}});
 assert.deepEqual(await port.getStudentProfile(S12_OWNER),{status:'unavailable'}); assert.equal(n,0);
});


test('S12 Admin Vidysea test endpoint reaches the native stored adapter with env credentials and preserves site usage attribution',async()=>{
 const api=await import('../src/admin-routes.js');const statements:string[]=[];const reads:string[]=[];
 const env=new Proxy({VIDYSEA_DB_PASSWORD:'synthetic-env-password'}, {get(target,key){reads.push(String(key));return target[key as keyof typeof target];}});
 const postgres=api.createPostgresTestPort({env,connect:async()=>({query:async(text:string)=>{statements.push(text);return /has_table_privilege/.test(text)?{rows:[{ins:false,upd:false,del:false}]}:{rows:[]};},end:async()=>{}})});
 const w=await adminWorld({env,seededSources:S12_FILE.sources,postgres});await seedSourcesFromConfig(w.store,S12_FILE);
 const res=await w.call('POST',ADMIN_PATH+'sources/vidysea-db/test',{token:await w.token('admin'),body:{}});assert.equal(res.status,200);assert.equal(res.json.ok,true,res.body);
 assert.ok(statements.some(s=>s.includes('s.academic_level')));assert.ok(statements.every(s=>!s.includes('student_saved_careers')));assert.ok(reads.includes('VIDYSEA_DB_PASSWORD'));assert.ok(!reads.some(k=>/PATHLYNKS|MASTER|MONGO/.test(k)));
 const sink=api.createUsageSink(w.store,'synthetic-meter-key');await sink.scope(async meter=>{meter.inputTokens=1;await sink.record({siteId:'vidysea',studentId:S12_OWNER,mode:'chat',latencyMs:1,answered:false},meter);});
 const row=w.fakeDb.collection('turn_usage').all().at(-1) as {siteId:string;answered:boolean};assert.equal(row.siteId,'vidysea');assert.equal(row.answered,false);
});

test('S12 disabled trusted Vidysea seed and immediate stored disable never read credentials or reuse an active port',async()=>{
 const api=await import('../src/admin-routes.js');const w=await adminWorld();await seedSourcesFromConfig(w.store,S12_FILE);let connects=0;
 const opts={siteId:'vidysea',seeded:S12_FILE.sources,env:{VIDYSEA_DB_PASSWORD:'synthetic-password'},connect:async()=>{connects++;return {query:async(text:string)=>/has_table_privilege/.test(text)?{rows:[{ins:false,upd:false,del:false}]}:{rows:[]},end:async()=>{}};}};
 const port=api.createLiveVidyseaPort(w.store,opts);assert.equal((await port.getStudentProfile(S12_OWNER)).ok,true);const n=connects;
 const src=(await w.store.sources.get('vidysea-db'))!;await w.store.sources.upsert({id:src.id,siteId:src.siteId,kind:src.kind,config:{...src.config,enabled:false}});assert.equal((await port.getStudentProfile(S12_OWNER)).ok,false);assert.equal(connects,n);
 const closed=api.createLiveVidyseaPort(w.store,{...opts,seeded:S12_FILE.sources.map(s=>({...s,enabled:false})),env:new Proxy({}, {get(){throw Error('env forbidden');}})});assert.equal((await closed.getStudentProfile(S12_OWNER)).ok,false);assert.equal(connects,n);
});

// T8 (tf-t8-product-db-kg, TF-20..TF-22): the product + DB knowledge graph rides on the existing syncs.
const HUB_TREE: Record<string, string> = {
  "src/app/(public)/page.tsx": "",
  "src/app/(public)/search/page.tsx": "",
  "src/app/student/(main)/journey-details/page.tsx": "",
  "src/app/student/(main)/journey-details/_components/StudentOS.tsx": [
    "export function StudentOS() {",
    "  const r = () => {",
    "    switch (active) {",
    '      case "journey":',
    "        return <JourneyMapSection />;",
    '      case "visa":',
    "        return <VisaSection />;",
    "      default:",
    "        return null;",
    "    }",
    "  };",
    "}",
  ].join("\n"),
  "src/lib/student/navigation.ts": 'export const STUDENT_HOME = "/student/journey-details";\nexport const STUDENT_SECTIONS = ["journey", "visa"] as const;\n',
  "src/components/student/StudentPortalSidebar.tsx": 'const ITEMS = [\n  { key: "journey", icon: MapPin, label: "Journey Map" },\n];\n',
  "src/components/student/Other.tsx": "never fetched",
};
const VIDYSEA_BE: Record<string, string> = {
  "app/models/student_lifecycle.py": ['class VisaApplication(Base):', '    __tablename__ = "visa_applications"', "    id = Column(UUID, primary_key=True)", '    student_id = Column(UUID, ForeignKey("students.id"), nullable=False)', "    status = Column(String(40))"].join("\n"),
  "app/api/v1/journey_map/models.py": ['class UserCourseJourneyMap(Base):', '    __tablename__ = "user_course_journey_map"', "    id = Column(UUID, primary_key=True)", "    student_id = Column(UUID)"].join("\n"),
  "app/api/v1/student/router.py": ['router = APIRouter(prefix="/student")', '@router.post("/visa")', "def start_visa(db=Depends(get_db)):", "    db.add(VisaApplication(student_id=1))"].join("\n"),
  "app/api/v1/admin/router.py": "never fetched: not a listed router folder",
  "app/main.py": "never fetched",
};

async function vidyseaWorld(files: Record<string, string>): Promise<ReturnType<typeof worldWith>> {
  const w = await worldWith(files);
  await w.store.sources.upsert({ id: "vidysea-be", siteId: "vidysea", kind: "github", config: { owner: "acme", repo: "vbe", branch: "prod", service: "other", platform: "vidysea" } });
  await w.store.sources.upsert({ id: "vidysea-fe", siteId: "vidysea", kind: "github", config: { owner: "acme", repo: "vfe", branch: "prod", service: "frontend", platform: "vidysea" } });
  await w.store.sources.upsert({ id: "vidysea-pg", siteId: "vidysea", kind: "postgres", config: { host: "h", port: 5432, database: "d", user: "u", sslmode: "require", passwordRef: "VIDYSEA_DB_PASSWORD", platform: "vidysea", tables: ["visa_applications", "users"] } });
  return w;
}

test("TF-20: a frontend sync with the StudentOS hub stores the tool half under data.kg, fetching only the three hub files", async () => {
  const w = await vidyseaWorld(HUB_TREE);
  const res = await syncOf(w, "vidysea-fe");
  assert.equal(res.json.status, "ok", res.body);
  assert.equal(res.json.counts.tools >= 2, true);
  const art = (await w.store.artifacts.getLatest("vidysea-fe", "nav_catalogue"))!;
  assert.ok(Array.isArray(art.data.routes));
  const kg = art.data.kg as { tools: { id: string; component?: string; source: { blob?: string } }[]; source: { files: Record<string, string> } };
  assert.equal(kg.tools.find((t) => t.id === "section:journey")!.component, "JourneyMapSection");
  assert.ok(kg.tools.some((t) => t.id === "route:/search"), "a seeded route in the catalogue becomes a route tool");
  assert.deepEqual(Object.keys(kg.source.files).sort(), ["src/app/student/(main)/journey-details/_components/StudentOS.tsx", "src/components/student/StudentPortalSidebar.tsx", "src/lib/student/navigation.ts"]);
  assert.deepEqual(w.gh.calls.filter((c) => c.startsWith("getBlob")).sort(), ["getBlob src/app/student/(main)/journey-details/_components/StudentOS.tsx", "getBlob src/components/student/StudentPortalSidebar.tsx", "getBlob src/lib/student/navigation.ts"]);
  assert.equal(w.gh.calls.filter((c) => c.startsWith("listTree")).length, 1, "one tree request per sync");
});

test("TF-22: a frontend sync whose hub vanished keeps the last good catalogue and graph", async () => {
  const w = await vidyseaWorld(HUB_TREE);
  assert.equal((await syncOf(w, "vidysea-fe")).json.status, "ok");
  const good = await w.store.artifacts.getLatest("vidysea-fe", "nav_catalogue");
  const gh = fakeGithub({ ...HUB_TREE, "src/lib/student/navigation.ts": "export const X = 1;" });
  w.deps.github = () => gh;
  w.clock.ms += 60_000;
  const res = await syncOf(w, "vidysea-fe");
  assert.equal(res.json.status, "error");
  assert.match(res.json.message, /hub was not found/);
  assert.deepEqual(await w.store.artifacts.getLatest("vidysea-fe", "nav_catalogue"), good);
});

test("TF-20: a Pathlynks-style frontend (no StudentOS hub) syncs exactly as before, with no kg key", async () => {
  const w = await worldWith(FRONTEND_TREE);
  const res = await syncOf(w, "web-fe");
  assert.equal(res.json.status, "ok");
  assert.ok(!("kg" in (await w.store.artifacts.getLatest("web-fe", "nav_catalogue"))!.data));
  assert.equal(res.json.counts.tools, undefined);
});

test("TF-20: a Vidysea backend sync reads models and the listed router folders only, stores tables plus data.kg, and marks the VC-readable tables", async () => {
  const w = await vidyseaWorld(VIDYSEA_BE);
  const res = await syncOf(w, "vidysea-be");
  assert.equal(res.json.status, "ok", res.body);
  assert.equal(res.json.counts.files, 3);
  assert.equal(res.json.counts.tables, 2);
  assert.deepEqual(w.gh.calls.filter((c) => c.startsWith("getBlob")).sort(), ["getBlob app/api/v1/journey_map/models.py", "getBlob app/api/v1/student/router.py", "getBlob app/models/student_lifecycle.py"]);
  const art = (await w.store.artifacts.getLatest("vidysea-be", "schema_map"))!;
  const tables = art.data.tables as Record<string, { columns: Record<string, { type: string; allowNull?: boolean }>; sourceFiles: string[] }>;
  assert.deepEqual(tables["visa_applications"]!.columns["student_id"], { type: "UUID", allowNull: false });
  const kg = art.data.kg as { tables: Record<string, { ownerKey?: string }>; writers: { path: string; tables: string[] }[]; toolEdges: { tool: string; table: string; tableFound: boolean; writerFound: boolean }[]; readEdges: { table: string; tableFound: boolean }[] };
  assert.equal(kg.tables["visa_applications"]!.ownerKey, "student_id");
  assert.deepEqual(kg.writers.map((x) => [x.path, x.tables]), [["/student/visa", ["visa_applications"]]]);
  const visa = kg.toolEdges.find((e) => e.tool === "section:visa" && e.table === "visa_applications")!;
  assert.deepEqual([visa.tableFound, visa.writerFound], [true, true]);
  assert.deepEqual(kg.readEdges, [{ table: "users", rel: "vc-reads", tableFound: false }, { table: "visa_applications", rel: "vc-reads", tableFound: true }]);
});

test("TF-22: a backend sync that finds no model files, or models with no tables, keeps the last good schema and reports an error", async () => {
  const w = await vidyseaWorld(VIDYSEA_BE);
  assert.equal((await syncOf(w, "vidysea-be")).json.status, "ok");
  const good = await w.store.artifacts.getLatest("vidysea-be", "schema_map");
  for (const files of [{ "app/main.py": "x" }, { "app/models/a.py": "class A(Base):\n    pass\n" }]) {
    const gh = fakeGithub(files);
    w.deps.github = () => gh;
    w.clock.ms += 60_000;
    const res = await syncOf(w, "vidysea-be");
    assert.equal(res.json.status, "error");
    assert.match(res.json.message, /stored schema was kept/);
    assert.deepEqual(await w.store.artifacts.getLatest("vidysea-be", "schema_map"), good);
  }
});

test("TF-20: a Pathlynks backend source (no vidysea platform) still goes down the Sequelize migrations path", async () => {
  const w = await worldWith({ ...migrations(), "app/models/a.py": "class A(Base):\n    __tablename__ = 'x'\n" });
  const res = await syncOf(w, "school-be");
  assert.equal(res.json.status, "ok", res.body);
  assert.ok(!w.gh.calls.some((c) => c.includes("app/models")));
});

test("D-134: the live Pathlynks port passes the Career Quest reads through only when a quest opener is wired, owner-bound and typed as {status}", async () => {
  const w = await adminWorld();
  const base = { host: "real.example", port: 5432, database: "app", user: "reader", sslmode: "require", passwordRef: "PATHLYNKS_DB_PASSWORD" };
  const tables = ["users", "user_grade", "grade", "student_saved_careers", "student_career_compare", "career_option", "assessment_response"];
  await w.store.sources.upsert({ id: PATHLYNKS_POSTGRES_SOURCE_ID, siteId: "pathlynks", kind: "postgres", config: { ...base, tables } });
  const seeded = [{ kind: "postgres" as const, id: PATHLYNKS_POSTGRES_SOURCE_ID, ...base, sslmode: "require" as const, tables }];
  const connect = async () => ({ async query() { return { rows: [] }; }, async end() {} });
  const filters: unknown[] = [];
  const writes: string[] = [];
  const doc = { gradeLabel: "Grade 11", avatarState: { level: 3, xp: 240 }, shareToken: "SECRET-TOKEN" };
  const questDb = async () => ({
    collection: (name: string) => ({
      find: (filter: Record<string, unknown>) => { filters.push([name, filter]); return { toArray: async () => (name === "pathlynks_quest_profiles" ? [doc] : [{ title: "Win a science fair", status: "active", targetDate: "2026-12-01" }]) }; },
      aggregate: () => ({ toArray: async () => [] }),
      countDocuments: async () => 0,
      insertOne: async () => { writes.push("insertOne"); },
      updateOne: async () => { writes.push("updateOne"); },
      deleteOne: async () => { writes.push("deleteOne"); },
    }),
  });
  const without = createLivePathlynksPort(w.store, { env: { PATHLYNKS_DB_PASSWORD: "dummy-pg-password-0001" }, seeded, connect: connect as never });
  await without.getSavedCareers("stu-A");
  assert.equal(without.getQuestProfile, undefined, "no opener: the engine sees no quest method (generic asks fall back to the KB)");
  const live = createLivePathlynksPort(w.store, { env: { PATHLYNKS_DB_PASSWORD: "dummy-pg-password-0001" }, seeded, connect: connect as never, questDb: questDb as never });
  const profile = await live.getQuestProfile!("stu-A");
  assert.equal(profile.status, "ok");
  assert.ok(profile.status === "ok" && profile.data !== null && (profile.data as Record<string, unknown>).level === 3 && !JSON.stringify(profile.data).includes("SECRET"), JSON.stringify(profile));
  const goals = await live.getQuestGoals!("stu-A");
  assert.deepEqual(goals, { status: "ok", data: [{ title: "Win a science fair", status: "active", due: "2026-12-01" }] });
  assert.ok(filters.every((f) => (f as [string, { studentId?: string }])[1].studentId === "stu-A"), "every Mongo read is owner-bound to the verified id");
  assert.deepEqual(await live.getQuestPlan!("bad id with spaces"), { status: "unavailable" });
  assert.deepEqual(writes, [], "no write method was ever called");
});

// ---------------------------------------------------------------------------------------------------------------- wire-fix-1 (data findings 1-2): keep last good + commit provenance

test("wire-fix-1: listTree returns the commit sha and the tree sha; a branch that moved between the two calls is re-read by the commit's own tree, so the pair is consistent", async () => {
  const MOVED_TREE = "1111111111111111111111111111111111111111";
  const seen: string[] = [];
  const fetchFn: GithubFetchFn = async (url) => {
    seen.push(url.replace("https://api.github.com", ""));
    if (url.includes("/commits/")) return { ok: true, status: 200, json: async () => ({ sha: COMMIT_SHA, commit: { tree: { sha: TREE_SHA } } }) };
    if (url.includes(`/git/trees/${TREE_SHA}`)) return { ok: true, status: 200, json: async () => ({ sha: TREE_SHA, tree: [{ path: "a.js", type: "blob", sha: "b1", size: 1 }] }) };
    if (url.includes("/git/trees/")) return { ok: true, status: 200, json: async () => ({ sha: MOVED_TREE, tree: [{ path: "newer.js", type: "blob", sha: "b2", size: 1 }] }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const listed = await createGithubPort(TOKEN, fetchFn).listTree("acme", "web", "main");
  assert.deepEqual(listed, { tree: [{ path: "a.js", type: "blob", sha: "b1", size: 1 }], sha: TREE_SHA, commit: COMMIT_SHA });
  assert.deepEqual(seen, ["/repos/acme/web/git/trees/main?recursive=1", "/repos/acme/web/commits/main", `/repos/acme/web/git/trees/${TREE_SHA}?recursive=1`]);
  const noCommit: GithubFetchFn = async (url) => (url.includes("/commits/") ? { ok: false, status: 403, json: async () => ({ message: `forbidden ${TOKEN}` }) } : { ok: true, status: 200, json: async () => ({ sha: TREE_SHA, tree: [] }) });
  await assert.rejects(() => createGithubPort(TOKEN, noCommit).listTree("acme", "web", "main"), (e: Error) => /403/.test(e.message) && !e.message.includes(TOKEN));
  const badCommit: GithubFetchFn = async (url) => ({ ok: true, status: 200, json: async () => (url.includes("/commits/") ? { sha: "not-a-sha" } : { sha: TREE_SHA, tree: [] }) });
  await assert.rejects(() => createGithubPort(undefined, badCommit).listTree("acme", "web", "main"));
});

test("wire-fix-1: every synced artifact records the repo identity: commit, tree sha, owner, repo, branch (Pathlynks routes, Sequelize schema, Vidysea graph halves)", async () => {
  const fe = await worldWith(FRONTEND_TREE);
  fe.deps.github = () => fakeGithub(FRONTEND_TREE, { head: HEAD });
  assert.equal((await syncOf(fe, "web-fe")).json.status, "ok");
  const nav = (await fe.store.artifacts.getLatest("web-fe", "nav_catalogue"))!;
  assert.deepEqual(nav.data.source, { owner: "acme", repo: "frontend", branch: "main", commit: COMMIT_SHA, treeSha: TREE_SHA });
  const be = await worldWith({ ...migrations() });
  be.deps.github = () => fakeGithub(migrations(), { head: HEAD });
  assert.equal((await syncOf(be, "school-be")).json.status, "ok");
  assert.deepEqual((await be.store.artifacts.getLatest("school-be", "schema_map"))!.data.source, { owner: "acme", repo: "backend", branch: "main", commit: COMMIT_SHA, treeSha: TREE_SHA });
  const v = await vidyseaWorld(HUB_TREE);
  v.deps.github = () => fakeGithub(HUB_TREE, { head: HEAD });
  assert.equal((await syncOf(v, "vidysea-fe")).json.status, "ok");
  const vkg = (await v.store.artifacts.getLatest("vidysea-fe", "nav_catalogue"))!.data;
  assert.equal((vkg.kg as { source: { commit?: string } }).source.commit, COMMIT_SHA);
  assert.equal((vkg.source as { commit?: string }).commit, COMMIT_SHA);
  const vb = await vidyseaWorld(VIDYSEA_BE);
  vb.deps.github = () => fakeGithub(VIDYSEA_BE, { head: HEAD });
  assert.equal((await syncOf(vb, "vidysea-be")).json.status, "ok");
  const vbd = (await vb.store.artifacts.getLatest("vidysea-be", "schema_map"))!.data;
  assert.deepEqual([(vbd.kg as { source: { commit?: string } }).source.commit, (vbd.kg as { source: { treeSha?: string } }).source.treeSha], [COMMIT_SHA, TREE_SHA]);
  assert.equal((vbd.source as { commit?: string }).commit, COMMIT_SHA);
  assert.ok(!JSON.stringify([nav, vkg, vbd]).includes(TOKEN));
});

/** A StudentOS hub with `n` sections (keys s0..s{n-1}); the same shape as HUB_TREE. */
function hubTree(n: number, extra: Record<string, string> = {}): Record<string, string> {
  const keys = Array.from({ length: n }, (_, i) => `s${i}`);
  const cases = keys.flatMap((k, i) => [`      case "${k}":`, `        return <Section${i} />;`]);
  return {
    ...HUB_TREE,
    "src/app/student/(main)/journey-details/_components/StudentOS.tsx": ["export function StudentOS() {", "  const r = () => {", "    switch (active) {", ...cases, "      default:", "        return null;", "    }", "  };", "}"].join("\n"),
    "src/lib/student/navigation.ts": `export const STUDENT_HOME = "/student/journey-details";\nexport const STUDENT_SECTIONS = [${keys.map((k) => `"${k}"`).join(", ")}] as const;\n`,
    "src/components/student/StudentPortalSidebar.tsx": `const ITEMS = [\n${keys.map((k) => `  { key: "${k}", icon: MapPin, label: "Label ${k}" },`).join("\n")}\n];\n`,
    ...extra,
  };
}

async function frontendKeeps(next: Record<string, string>, expect: RegExp, first = hubTree(10)): Promise<void> {
  const w = await vidyseaWorld(first);
  assert.equal((await syncOf(w, "vidysea-fe")).json.status, "ok");
  const good = await w.store.artifacts.getLatest("vidysea-fe", "nav_catalogue");
  const gh = fakeGithub(next);
  w.deps.github = () => gh;
  w.clock.ms += 60_000;
  const res = await syncOf(w, "vidysea-fe");
  assert.equal(res.json.status, "error", res.body);
  assert.match(res.json.message, expect);
  assert.deepEqual(await w.store.artifacts.getLatest("vidysea-fe", "nav_catalogue"), good, "the last good artifact is still the latest");
}

test("wire-fix-1: a frontend sync keeps the last good catalogue and graph when the hub file or the navigation file is missing from the tree", async () => {
  const noHub = { ...hubTree(10) };
  delete noHub["src/app/student/(main)/journey-details/_components/StudentOS.tsx"];
  await frontendKeeps(noHub, /hub was not found/);
  const noNav = { ...hubTree(10) };
  delete noNav["src/lib/student/navigation.ts"];
  await frontendKeeps(noNav, /hub was not found/);
});

test("wire-fix-1: a frontend sync keeps the last good graph when the tools shrank by more than 30%, and accepts a smaller change", async () => {
  await frontendKeeps(hubTree(6), /tools_shrank/);
  const w = await vidyseaWorld(hubTree(10));
  assert.equal((await syncOf(w, "vidysea-fe")).json.status, "ok");
  w.deps.github = () => fakeGithub(hubTree(8));
  w.clock.ms += 60_000;
  const ok = await syncOf(w, "vidysea-fe");
  assert.equal(ok.json.status, "ok", ok.body);
});

test("wire-fix-1: a frontend sync that skipped a hub file keeps the last good graph; the very first sync (nothing to keep) is not blocked by a skip", async () => {
  const big = "x".repeat(1_000_001);
  await frontendKeeps(hubTree(10, { "src/components/student/StudentPortalSidebar.tsx": big }), /skipped/);
  const first = await vidyseaWorld(hubTree(10, { "src/components/student/StudentPortalSidebar.tsx": big }));
  const res = await syncOf(first, "vidysea-fe");
  assert.equal(res.json.status, "ok", res.body);
  assert.ok((await first.store.artifacts.getLatest("vidysea-fe", "nav_catalogue"))!.data.kg);
});

function modelsOf(n: number): Record<string, string> {
  return Object.fromEntries(Array.from({ length: n }, (_, i) => [`app/models/m${i}.py`, [`class M${i}(Base):`, `    __tablename__ = "t${i}"`, "    id = Column(UUID, primary_key=True)", "    student_id = Column(UUID)"].join("\n")]));
}

async function backendKeeps(next: Record<string, string>, expect: RegExp, first: Record<string, string> = { ...VIDYSEA_BE, ...modelsOf(10) }): Promise<void> {
  const w = await vidyseaWorld(first);
  assert.equal((await syncOf(w, "vidysea-be")).json.status, "ok");
  const good = await w.store.artifacts.getLatest("vidysea-be", "schema_map");
  w.deps.github = () => fakeGithub(next);
  w.clock.ms += 60_000;
  const res = await syncOf(w, "vidysea-be");
  assert.equal(res.json.status, "error", res.body);
  assert.match(res.json.message, expect);
  assert.deepEqual(await w.store.artifacts.getLatest("vidysea-be", "schema_map"), good);
}

test("wire-fix-1: a Vidysea backend sync keeps the last good schema when the tables shrank by more than 30% or a model file was skipped", async () => {
  await backendKeeps({ ...VIDYSEA_BE, ...modelsOf(5) }, /tables_shrank/);
  const skippedModel = "# skipped\n" + "y".repeat(2_000_001);
  await backendKeeps({ ...VIDYSEA_BE, ...modelsOf(10), "app/models/m3.py": skippedModel }, /skipped/);
  const first = await vidyseaWorld({ ...VIDYSEA_BE, ...modelsOf(10), "app/models/m3.py": skippedModel });
  const res = await syncOf(first, "vidysea-be");
  assert.equal(res.json.status, "ok", res.body);
  assert.equal(res.json.counts.skipped, 1);
});

test("wire-fix-1: a Vidysea backend sync reads app/services/*.py, passes them to the graph, and the service-written seeded edge is verified by service (counts record the files)", async () => {
  const service = ["class StudentShortlistService:", "    def add_to_shortlist(self, db, student_id):", "        db.add(StudentShortlistedCourse(student_id=student_id))"].join("\n");
  const files = {
    "app/models/shortlist.py": ["class StudentShortlistedCourse(Base):", '    __tablename__ = "student_shortlisted_courses"', "    id = Column(UUID, primary_key=True)", "    student_id = Column(UUID)"].join("\n"),
    "app/api/v1/student/shortlist_router.py": ["from app.services.student_shortlist_service import StudentShortlistService", 'router = APIRouter(prefix="/shortlist")', '@router.post("/add")', "def add_to_shortlist(db=Depends(get_db)):", "    return StudentShortlistService().add_to_shortlist(db, 1)"].join("\n"),
    "app/services/student_shortlist_service.py": service,
    "app/services/other_service.py": "x = 1",
    "app/main.py": "never fetched",
  };
  const w = await vidyseaWorld(files);
  const res = await syncOf(w, "vidysea-be");
  assert.equal(res.json.status, "ok", res.body);
  assert.equal(res.json.counts.services, 2);
  assert.deepEqual(w.gh.calls.filter((c) => c.startsWith("getBlob app/services")).sort(), ["getBlob app/services/other_service.py", "getBlob app/services/student_shortlist_service.py"]);
  assert.ok(!w.gh.calls.includes("getBlob app/main.py"));
  assert.equal(w.gh.calls.filter((c) => c.startsWith("listTree")).length, 1, "still one tree request per sync");
  const kg = (await w.store.artifacts.getLatest("vidysea-be", "schema_map"))!.data.kg as { toolEdges: { tool: string; table: string; verifiedBy: string; via?: string }[]; source: { files: Record<string, string> } };
  const edge = kg.toolEdges.find((e) => e.tool === "section:shortlisted" && e.table === "student_shortlisted_courses")!;
  assert.deepEqual([edge.verifiedBy, edge.via], ["service", "app/services/student_shortlist_service.py"]);
});

// ---------------------------------------------------------------------------------------------------------------- tf-fix-2 (data re-review, medium): an explicit super-admin override for keep-last-good, and skippedServices gates the sync

async function syncAs(w: Awaited<ReturnType<typeof worldWith>>, id: string, role: "super-admin" | "admin", body: Record<string, unknown>) {
  return w.call("POST", `${ADMIN_PATH}sources/${id}/sync`, { token: await w.token(role), body });
}

async function shrunkBackend(next: Record<string, string>) {
  const w = await vidyseaWorld({ ...VIDYSEA_BE, ...modelsOf(10) });
  assert.equal((await syncOf(w, "vidysea-be")).json.status, "ok");
  const good = await w.store.artifacts.getLatest("vidysea-be", "schema_map");
  w.deps.github = () => fakeGithub(next);
  w.clock.ms += 60_000;
  return { w, good };
}

test("tf-fix-2: acceptShrink by a super-admin replaces a shrunk backend schema, and the override is audit-logged with the counts", async () => {
  const { w, good } = await shrunkBackend({ ...VIDYSEA_BE, ...modelsOf(5) });
  const kept = await syncAs(w, "vidysea-be", "super-admin", {});
  assert.equal(kept.json.status, "error", "without the flag, behaviour is unchanged");
  assert.deepEqual(await w.store.artifacts.getLatest("vidysea-be", "schema_map"), good);
  const before = w.auditRows().length;
  const res = await syncAs(w, "vidysea-be", "super-admin", { acceptShrink: true });
  assert.equal(res.json.status, "ok", res.body);
  const tables = (await w.store.artifacts.getLatest("vidysea-be", "schema_map"))!.data.tables as Record<string, unknown>;
  assert.equal(Object.keys(tables).filter((t) => /^t\d$/.test(t)).length, 5);
  const rows = w.auditRows().slice(before);
  const override = rows.find((r) => r.action === "sources.sync.accept_shrink")!;
  assert.ok(override, "an explicit audit row for the override");
  assert.equal(override.ok, true);
  assert.match(override.target, /vidysea-be/);
  assert.match(override.target, /tables_shrank/);
  assert.match(override.target, /\b1[0-9]\b.*\b[5-9]\b/, "the before and after table counts are in the row");
});

test("D-135: acceptShrink is honoured for a plain admin too; a viewer is refused (403) and nothing is replaced; a non-boolean flag is a 400", async () => {
  const { w, good } = await shrunkBackend({ ...VIDYSEA_BE, ...modelsOf(5) });
  const before = w.auditRows().length;
  const viewer = await syncAs(w, "vidysea-be", "viewer", { acceptShrink: true });
  assert.equal(viewer.status, 403, viewer.body);
  assert.deepEqual(await w.store.artifacts.getLatest("vidysea-be", "schema_map"), good);
  assert.ok(w.auditRows().slice(before).every((r) => r.ok === false));
  for (const bad of ["true", 1, {}, []]) assert.equal((await syncAs(w, "vidysea-be", "admin", { acceptShrink: bad })).status, 400, JSON.stringify(bad));
  assert.deepEqual(await w.store.artifacts.getLatest("vidysea-be", "schema_map"), good);
  const admin = await syncAs(w, "vidysea-be", "admin", { acceptShrink: true });
  assert.equal(admin.json.status, "ok", admin.body);
  assert.notDeepEqual(await w.store.artifacts.getLatest("vidysea-be", "schema_map"), good);
});

test("tf-fix-2: acceptShrink also clears a skipped model file and a shrunk frontend graph, but never an empty or structurally broken one", async () => {
  const skippedModel = "# skipped\n" + "y".repeat(2_000_001);
  const a = await shrunkBackend({ ...VIDYSEA_BE, ...modelsOf(10), "app/models/m3.py": skippedModel });
  assert.equal((await syncAs(a.w, "vidysea-be", "super-admin", {})).json.status, "error");
  assert.equal((await syncAs(a.w, "vidysea-be", "super-admin", { acceptShrink: true })).json.status, "ok");

  const noModels = await shrunkBackend({ "app/main.py": "x = 1" });
  const res = await syncAs(noModels.w, "vidysea-be", "super-admin", { acceptShrink: true });
  assert.equal(res.json.status, "error", "no tables at all is never overridable");
  assert.deepEqual(await noModels.w.store.artifacts.getLatest("vidysea-be", "schema_map"), noModels.good);

  const fe = await vidyseaWorld(hubTree(10));
  assert.equal((await syncOf(fe, "vidysea-fe")).json.status, "ok");
  const feGood = await fe.store.artifacts.getLatest("vidysea-fe", "nav_catalogue");
  fe.deps.github = () => fakeGithub(hubTree(6));
  fe.clock.ms += 60_000;
  assert.equal((await syncAs(fe, "vidysea-fe", "super-admin", {})).json.status, "error");
  assert.deepEqual(await fe.store.artifacts.getLatest("vidysea-fe", "nav_catalogue"), feGood);
  assert.equal((await syncAs(fe, "vidysea-fe", "super-admin", { acceptShrink: true })).json.status, "ok");
  const noHub = { ...hubTree(10) };
  delete noHub["src/app/student/(main)/journey-details/_components/StudentOS.tsx"];
  fe.deps.github = () => fakeGithub(noHub);
  fe.clock.ms += 60_000;
  assert.equal((await syncAs(fe, "vidysea-fe", "super-admin", { acceptShrink: true })).json.status, "error", "a missing hub is not a shrink");
});

test("tf-fix-2: a skipped service file gates a backend sync against a stored schema the same way a skipped model does; the first sync is not blocked", async () => {
  const bigService = "# skipped\n" + "y".repeat(2_000_001);
  const files = { ...VIDYSEA_BE, ...modelsOf(10), "app/services/big_service.py": bigService };
  const first = await vidyseaWorld(files);
  const ok = await syncOf(first, "vidysea-be");
  assert.equal(ok.json.status, "ok", ok.body);
  assert.equal(ok.json.counts.skippedServices, 1);
  const { w, good } = await shrunkBackend(files);
  const res = await syncOf(w, "vidysea-be");
  assert.equal(res.json.status, "error", res.body);
  assert.match(res.json.message, /skipped_files/);
  assert.equal(res.json.counts.skippedServices, 1);
  assert.deepEqual(await w.store.artifacts.getLatest("vidysea-be", "schema_map"), good);
  assert.equal((await syncAs(w, "vidysea-be", "super-admin", { acceptShrink: true })).json.status, "ok");
});
