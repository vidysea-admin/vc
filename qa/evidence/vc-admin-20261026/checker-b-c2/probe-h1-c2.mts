// Checker B cycle 2 hostile probe (outside any product tree; imports repo files by file URL). Dummy values only.
import test from "node:test";
import assert from "node:assert/strict";
const R = "file:///D:/vc/.worktrees/vca-int/";
const FX: any = await import(R + "apps/api/tests/admin-fixtures.ts");
const RT: any = await import(R + "apps/api/src/admin-routes.ts");
const SC: any = await import(R + "packages/schemas/src/index.ts");
const SRV: any = await import(R + "apps/api/src/server.ts");
const { adminWorld, fakeGithub, ADMIN_PATH, ADMIN_EMAILS, PASSWORD } = FX;
const file = SC.loadSourcesFile("D:/vc/.worktrees/vca-int/config/sources.json");
const seededPg = file.sources.find((s: any) => s.kind === "postgres");
const seededGh = file.sources.filter((s: any) => s.kind === "github");
const SENT = "sentinel-env-value-0xDEADBEEF";
const env: Record<string, string> = {};
for (const s of file.sources) env[s.kind === "postgres" ? s.passwordRef : s.tokenRef] = SENT;
env.VC_ADMIN_MASTER_KEY = SENT;
env.MONGODB_URL = SENT;
const WRONG_PG = seededGh[0].tokenRef; // a GITHUB_* name
const PG_REF = seededPg.passwordRef;
function recorders() {
  const pgCalls: { host: unknown; password: string | undefined; cfg: any }[] = [];
  const ghTokens: { token: string | undefined }[] = [];
  return {
    pgCalls,
    ghTokens,
    postgres: {
      async test(config: any, password: string | undefined) {
        pgCalls.push({ host: config.host, password, cfg: config });
        return { ok: true };
      },
    },
    github: (token: string | undefined) => {
      ghTokens.push({ token });
      return fakeGithub({ "migrations/1-a.js": "module.exports={up:async(q,S)=>{await q.createTable('t',{id:{type:S.INTEGER}})}}" });
    },
  };
}
const pgCfg = (o: any = {}) => {
  const { kind, id, ...c } = seededPg;
  return { ...c, ...o };
};
async function world(r: any, seeded: any = file.sources) {
  const w = await adminWorld({ env, postgres: r.postgres, github: r.github, ...(seeded ? { seededSources: seeded } : {}) });
  await RT.seedSourcesFromConfig(w.store, file);
  return w;
}
const leak = (w: any) => JSON.stringify([w.logs, w.auditRows(), w.fakeDb.collection("sources").all(), w.fakeDb.collection("source_artifacts").all()]).includes(SENT);

test("P0 positive: seeded pathlynks-db + seeded repos still receive their env credentials (Test and Sync)", async () => {
  const r = recorders();
  const w = await world(r);
  const admin = await w.token("admin");
  let x = await w.call("POST", `${ADMIN_PATH}sources/${seededPg.id}/test`, { token: admin, body: {} });
  assert.equal(x.status, 200);
  assert.equal(x.json.ok, true, x.body);
  assert.equal(r.pgCalls.at(-1)!.password, SENT);
  for (const g of seededGh) {
    for (const act of ["test", "sync"]) {
      const n = r.ghTokens.length;
      x = await w.call("POST", `${ADMIN_PATH}sources/${g.id}/${act}`, { token: admin, body: {} });
      assert.equal(x.status, 200, `${g.id} ${act}`);
      assert.ok(r.ghTokens.length > n, `${g.id} ${act} built a github port`);
      assert.equal(r.ghTokens.at(-1)!.token, SENT, `${g.id} ${act} got its token`);
    }
  }
  assert.equal(leak(w), false);
});

test("P1 H1d: admin-created postgres source naming the allowed ref gets NO env password, whatever its host", async () => {
  const r = recorders();
  const w = await world(r);
  const admin = await w.token("admin");
  const variants: any[] = [
    { host: "attacker.example" },
    { host: "ATTACKER.example" },
    { database: "other" },
    { user: "other" },
    { port: 5433 },
    { sslmode: "verify-full" },
    { host: seededPg.host.toUpperCase(), database: "other" },
  ];
  let i = 0;
  const statuses: number[] = [];
  for (const v of variants) {
    const id = `pg-evil-${i++}`;
    const c = await w.call("POST", `${ADMIN_PATH}sources`, { token: admin, body: { ...pgCfg(v), id, kind: "postgres" } });
    statuses.push(c.status);
    if (c.status === 201) {
      const t = await w.call("POST", `${ADMIN_PATH}sources/${id}/test`, { token: admin, body: {} });
      assert.ok(!t.body.includes(SENT));
    } else assert.equal(c.status, 400);
  }
  const c = await w.call("POST", `${ADMIN_PATH}sources`, { token: admin, body: { ...pgCfg(), id: "pg-clone", kind: "postgres" } });
  console.log("create statuses", JSON.stringify(statuses), "clone create", c.status);
  if (c.status === 201) {
    const t = await w.call("POST", `${ADMIN_PATH}sources/pg-clone/test`, { token: admin, body: {} });
    console.log("clone test body", t.body);
  }
  const dup = await w.call("POST", `${ADMIN_PATH}sources`, { token: admin, body: { ...pgCfg({ host: "attacker.example" }), id: seededPg.id, kind: "postgres" } });
  assert.equal(dup.status, 409);
  console.log("H1d calls", JSON.stringify(r.pgCalls.map((x) => ({ host: x.host, db: x.cfg.database, hasPw: x.password !== undefined }))));
  assert.equal(r.pgCalls.filter((x) => x.password !== undefined).length, 0, "no env password to any admin-created source");
  assert.equal(leak(w), false);
});

test("P2 github: admin-created github sources with the seeded token ref get no token; wrong-kind refs refused", async () => {
  const r = recorders();
  const w = await world(r);
  const admin = await w.token("admin");
  const g = seededGh[0];
  const mk = (o: any) => ({ kind: "github", owner: g.owner, repo: g.repo, branch: g.branch, service: g.service, tokenRef: g.tokenRef, ...o });
  const cases: any[] = [{ id: "gh-a", owner: "evil" }, { id: "gh-b", repo: "other" }, { id: "gh-clone" }];
  for (const c of cases) {
    const cr = await w.call("POST", `${ADMIN_PATH}sources`, { token: admin, body: mk(c) });
    if (cr.status === 201)
      for (const act of ["test", "sync"]) {
        const x = await w.call("POST", `${ADMIN_PATH}sources/${c.id}/${act}`, { token: admin, body: {} });
        assert.ok(!x.body.includes(SENT));
      }
  }
  const a = await w.call("POST", `${ADMIN_PATH}sources`, { token: admin, body: { ...pgCfg(), id: "pg-wrong", kind: "postgres", passwordRef: WRONG_PG } });
  const b = await w.call("POST", `${ADMIN_PATH}sources`, { token: admin, body: mk({ id: "gh-wrong", tokenRef: PG_REF }) });
  console.log("wrong-kind create statuses", a.status, b.status);
  assert.equal(a.status, 400);
  assert.equal(b.status, 400);
  assert.equal(r.ghTokens.filter((t) => t.token !== undefined).length, 0, "no token to any admin-created repo");
  assert.equal(leak(w), false);
});

test("P3 'PATCH' (store-level upsert, the only way a seeded doc changes): any connection-field change withholds the credential; branch/tables change keeps it", async () => {
  const r = recorders();
  const w = await world(r);
  const admin = await w.token("admin");
  const upsertPg = (o: any) => w.store.sources.upsert({ id: seededPg.id, siteId: file.siteId, kind: "postgres", config: pgCfg(o) });
  const base = r.pgCalls.length;
  const mut: any[] = [{ host: "attacker.example" }, { port: 5433 }, { database: "x" }, { user: "x" }, { sslmode: "verify-full" }, { passwordRef: "PATHLYNKS_OTHER" }, { passwordRef: WRONG_PG }, { port: "5432" }, { host: seededPg.host + "x" }];
  for (const m of mut) {
    await upsertPg(m);
    const t = await w.call("POST", `${ADMIN_PATH}sources/${seededPg.id}/test`, { token: admin, body: {} });
    assert.ok(!t.body.includes(SENT));
  }
  assert.equal(r.pgCalls.slice(base).filter((c) => c.password !== undefined).length, 0, "changed seeded postgres connection never got the env password");
  await upsertPg({ tables: ["students"] });
  await w.call("POST", `${ADMIN_PATH}sources/${seededPg.id}/test`, { token: admin, body: {} });
  console.log("tables-only change gets password:", r.pgCalls.at(-1)!.password === SENT);
  await upsertPg({ host: seededPg.host.toUpperCase() });
  await w.call("POST", `${ADMIN_PATH}sources/${seededPg.id}/test`, { token: admin, body: {} });
  console.log("uppercase same host gets password:", r.pgCalls.at(-1)!.password === SENT);
  for (const g of seededGh) {
    const { kind, id, ...cfg } = g;
    const up = (o: any) => w.store.sources.upsert({ id, siteId: file.siteId, kind: "github", config: { ...cfg, ...o } });
    const n0 = r.ghTokens.length;
    for (const m of [{ owner: "evil" }, { repo: "evil" }, { tokenRef: "GITHUB_OTHER" }, { tokenRef: PG_REF }]) {
      await up(m);
      for (const act of ["test", "sync"]) {
        const x = await w.call("POST", `${ADMIN_PATH}sources/${id}/${act}`, { token: admin, body: {} });
        assert.ok(!x.body.includes(SENT));
      }
    }
    assert.equal(r.ghTokens.slice(n0).filter((t) => t.token !== undefined).length, 0, `${id}: changed repo never got token`);
    await up({ branch: "other-branch" });
    await w.call("POST", `${ADMIN_PATH}sources/${id}/test`, { token: admin, body: {} });
    console.log(id, "branch-only change gets token:", r.ghTokens.at(-1)!.token === SENT);
    await w.store.sources.upsert({ id, siteId: file.siteId, kind: "postgres", config: pgCfg({ host: "attacker.example" }) });
    const nn = r.pgCalls.length;
    await w.call("POST", `${ADMIN_PATH}sources/${id}/test`, { token: admin, body: {} });
    assert.ok(r.pgCalls.slice(nn).every((c) => c.password === undefined));
  }
  assert.equal(leak(w), false);
});

test("P4 no HTTP route changes a source's connection; PATCH/PUT/DELETE on sources/:id are not served", async () => {
  const r = recorders();
  const w = await world(r);
  const sup = await w.token("super-admin");
  for (const m of ["PATCH", "PUT", "DELETE"]) {
    const x = await w.call(m, `${ADMIN_PATH}sources/${seededPg.id}`, { token: sup, body: { host: "attacker.example" } });
    assert.ok([404, 405].includes(x.status), `${m} -> ${x.status}`);
  }
  const after = await w.store.sources.get(seededPg.id);
  assert.equal((after.config as any).host, seededPg.host);
});

test("P5 live port: PATCHed seeded host -> unavailable & no connect; restore connects; no seeded list -> never", async () => {
  const w = await adminWorld({ env });
  await RT.seedSourcesFromConfig(w.store, file);
  let connects = 0;
  const connect = async () => {
    connects++;
    return {
      async query(t: string) {
        if (/has_table_privilege/i.test(t)) return { rows: [{ ins: false, upd: false, del: false }] };
        return { rows: [] };
      },
      async end() {},
    };
  };
  const clock = { ms: 0 };
  const port = RT.createLivePathlynksPort(w.store, { env, seeded: file.sources, nowMs: () => clock.ms, connect });
  const up = (o: any) => w.store.sources.upsert({ id: seededPg.id, siteId: file.siteId, kind: "postgres", config: pgCfg(o) });
  for (const o of [{ host: "attacker.example" }, { port: 1 }, { database: "z" }, { user: "z" }, { sslmode: "verify-full" }, { passwordRef: "PATHLYNKS_Z" }]) {
    await up(o);
    clock.ms += 61_000;
    assert.deepEqual(await port.getSavedCareers("stu"), { status: "unavailable" }, JSON.stringify(o));
  }
  assert.equal(connects, 0);
  await up({});
  clock.ms += 61_000;
  await port.getSavedCareers("stu");
  assert.ok(connects > 0, "restored seeded connects");
  const c1 = connects;
  const closed = RT.createLivePathlynksPort(w.store, { env, nowMs: () => clock.ms, connect });
  await up({});
  clock.ms += 61_000;
  await closed.getSavedCareers("stu");
  assert.equal(connects, c1);
});

test("P6 VA6: every login attempt writes exactly one audit row, none with a secret/body/password", async () => {
  const w = await adminWorld({ env });
  const rows = () => w.auditRows().length;
  const login = (body: any, o: any = {}) =>
    w.handler({ method: "POST", url: `${ADMIN_PATH}login`, headers: {}, readBody: o.readBody ?? (async () => (typeof body === "string" ? body : JSON.stringify(body))) });
  const WEIRD = "hunter2-attacker-typed-password-ZZZ";
  const cases: [string, any, any, number][] = [
    ["wrong password", { email: ADMIN_EMAILS.admin, password: WEIRD }, {}, 401],
    ["unknown email", { email: "nobody@vc.test", password: WEIRD }, {}, 401],
    ["attacker email 300 chars", { email: "x".repeat(300) + "@vc.test", password: WEIRD }, {}, 401],
    ["malformed email", { email: "not an email\u0000", password: WEIRD }, {}, 401],
    ["empty body", {}, {}, 401],
    ["malformed json", "{not json", {}, 400],
    ["array body", "[1]", {}, 400],
    ["too large", "", { readBody: async () => { throw new SRV.BodyTooLargeError(1); } }, 413],
    ["read failure", "", { readBody: async () => { throw new Error("socket reset " + WEIRD); } }, 400],
    ["success", { email: ADMIN_EMAILS.admin, password: PASSWORD }, {}, 200],
  ];
  const out: string[] = [];
  for (const [name, body, o, want] of cases) {
    w.clock.ms += 120_000;
    const before = rows();
    const res = await login(body, o);
    const d = rows() - before;
    out.push(`${name}: status ${res.status} rows+${d}`);
    assert.equal(res.status, want, name);
    assert.equal(d, 1, `${name}: audit rows ${d}`);
  }
  w.clock.ms += 120_000;
  let saw429 = false;
  for (let i = 0; i < 12; i++) {
    const b = rows();
    const res = await login({ email: ADMIN_EMAILS.admin, password: WEIRD });
    const d = rows() - b;
    assert.equal(d, 1, `attempt ${i} rows ${d}`);
    if (res.status === 429) saw429 = true;
  }
  assert.ok(saw429, "limiter engaged");
  await w.store.users.create({ email: "off@vc.test", passwordHash: await FX.passwordHash(), role: "admin" });
  const dis = (w.store.users as any).setDisabled ?? (w.store.users as any).disable;
  if (dis) {
    await dis.call(w.store.users, "off@vc.test", true);
    w.clock.ms += 120_000;
    const b = rows();
    const res = await login({ email: "off@vc.test", password: PASSWORD });
    assert.equal(res.status, 401);
    assert.equal(rows() - b, 1);
    out.push("disabled: ok");
  } else out.push("disabled: no disable method found (skipped): " + Object.keys(w.store.users).join(","));
  for (const m of ["GET", "PUT", "DELETE"]) {
    const b = rows();
    const res = await w.handler({ method: m, url: `${ADMIN_PATH}login`, headers: {}, readBody: async () => "" });
    out.push(`${m} login: ${res.status} rows+${rows() - b}`);
    assert.equal(res.status, 405);
  }
  console.log(out.join("\n"));
  const dump = JSON.stringify(w.auditRows());
  for (const bad of [WEIRD, PASSWORD, SENT, "x".repeat(300), "socket reset", "not an email"]) assert.ok(!dump.includes(bad), `audit row leaks ${bad.slice(0, 12)}`);
  for (const row of w.auditRows()) assert.deepEqual(Object.keys(row).sort(), ["_id", "action", "actorId", "at", "ok", "target"].sort());
  console.log("audit sample", JSON.stringify(w.auditRows().slice(0, 3)));
});

test("P7 VA6: audit store failure on a failed login keeps the 401; success with failing audit mints no token", async () => {
  const w = await adminWorld({ env });
  (w.store.audit as any).append = async () => {
    throw new Error("db down " + SENT);
  };
  const login = (body: any) => w.handler({ method: "POST", url: `${ADMIN_PATH}login`, headers: {}, readBody: async () => JSON.stringify(body) });
  const bad = await login({ email: ADMIN_EMAILS.admin, password: "nope" });
  assert.equal(bad.status, 401);
  const good = await login({ email: ADMIN_EMAILS.admin, password: PASSWORD });
  console.log("success w/ failing audit:", good.status, "token in body:", good.body.includes("token"));
  assert.ok(!bad.body.includes(SENT) && !good.body.includes(SENT) && !JSON.stringify(w.logs).includes(SENT));
});
