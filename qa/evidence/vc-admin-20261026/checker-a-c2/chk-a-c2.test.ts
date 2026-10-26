/** Checker A cycle-2 hostile probes (run in a throwaway copy outside the repo, then copied here). CHK_ROOT = the copy root. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createPostgresTestPort, createLivePathlynksPort, seedSourcesFromConfig, boundEnvRef } from "../src/admin-routes.js";
import { loadSourcesFile, type SourcesFile } from "@vc/schemas";
import { ADMIN_PATH, adminWorld, fakeGithub } from "./admin-fixtures.js";

const P = ADMIN_PATH;
const ROOT = process.env.CHK_ROOT ?? "D:/vc/.worktrees/vca-int";
const file: SourcesFile = loadSourcesFile(`${ROOT}/config/sources.json`);
const SEED_PG = file.sources.find((s) => s.kind === "postgres")! as Extract<SourcesFile["sources"][number], { kind: "postgres" }>;
const req = createRequire(`${ROOT}/mcp/pathlynks/package.json`);
const pg = req("pg");
const TABLES = SEED_PG.tables;
const DB_PW = "DB-PW-DUMMY-c2-5e2";
const GH_TOKEN = "GH-TOKEN-DUMMY-c2-91c";
const env = { PATHLYNKS_DB_PASSWORD: DB_PW, GITHUB_TOKEN: GH_TOKEN };

function spyPg() {
  const seen: { host?: string; password?: string }[] = [];
  const orig = pg.Client.prototype.connect;
  pg.Client.prototype.connect = async function (this: { connectionParameters: { host: string; password: string } }) {
    seen.push({ host: this.connectionParameters.host, password: this.connectionParameters.password });
    throw new Error("stubbed connect");
  };
  return { seen, restore: () => (pg.Client.prototype.connect = orig) };
}
/** A postgres test port that records the host and the exact password it was handed. */
function recPg() {
  const calls: { host: unknown; password: string | undefined }[] = [];
  return { calls, async test(config: Record<string, unknown>, password: string | undefined) { calls.push({ host: config.host, password }); return { ok: false, cause: "connect_failed" }; } };
}
function recGh() {
  const tokens: (string | undefined)[] = [];
  const coords: string[] = [];
  const gh = (t: string | undefined) => {
    tokens.push(t);
    const g = fakeGithub({});
    return { ...g, listTree: async (o: string, r: string, b: string) => { coords.push(`${o}/${r}@${b}`); return g.listTree(o, r, b); } };
  };
  return { tokens, coords, gh };
}
const pgBody = (id: string, over: Record<string, unknown> = {}) => ({ kind: "postgres", id, host: "attacker.example.com", port: 5432, database: "x", user: "u", sslmode: "require", passwordRef: "PATHLYNKS_DB_PASSWORD", tables: TABLES, ...over });
const ghBody = (id: string, over: Record<string, unknown> = {}) => ({ kind: "github", id, owner: "a", repo: "b", branch: "main", service: "school", tokenRef: "GITHUB_TOKEN", ...over });
async function seededWorld(extra: Record<string, unknown> = {}) {
  const r = recPg();
  const g = recGh();
  const w = await adminWorld({ env, seededSources: file.sources, postgres: r as never, github: g.gh as never, ...extra });
  await seedSourcesFromConfig(w.store, file);
  return { w, r, g };
}
async function mutate(w: Awaited<ReturnType<typeof adminWorld>>, id: string, over: Record<string, unknown>) {
  const cur = (await w.store.sources.get(id))!;
  await w.store.sources.upsert({ id, siteId: cur.siteId, kind: cur.kind, config: { ...cur.config, ...over } as never });
}

test("C2-POS: seeded pathlynks-db and the 4 seeded repos still get their credentials (Test and Sync)", async () => {
  const { w, r, g } = await seededWorld();
  const a = await w.token("admin");
  await w.call("POST", `${P}sources/pathlynks-db/test`, { token: a, body: {} });
  assert.deepEqual(r.calls, [{ host: SEED_PG.host, password: DB_PW }]);
  for (const id of ["pathlynks-frontend", "pathlynks-auth", "pathlynks-school", "pathlynks-career"]) {
    await w.call("POST", `${P}sources/${id}/test`, { token: a, body: {} });
    await w.call("POST", `${P}sources/${id}/sync`, { token: a, body: {} });
  }
  assert.ok(g.tokens.length >= 8 && g.tokens.every((t) => t === GH_TOKEN), `tokens ${JSON.stringify(g.tokens)}`);
});

test("C2-NEWID: admin-created sources (any host/owner, incl. an exact twin of the seeded connection under a new id) never get an env value", async () => {
  const { w, r, g } = await seededWorld();
  const a = await w.token("admin");
  const twin = { host: SEED_PG.host, port: SEED_PG.port, database: SEED_PG.database, user: SEED_PG.user, sslmode: SEED_PG.sslmode };
  for (const [id, over] of [["evil-1", {}], ["evil-twin", twin], ["evil-twin-ci", { ...twin, host: SEED_PG.host.toUpperCase() }]] as const) {
    const c = await w.call("POST", `${P}sources`, { token: a, body: pgBody(id, over) });
    assert.equal(c.status, 201, id);
    const t = await w.call("POST", `${P}sources/${id}/test`, { token: a, body: {} });
    assert.equal(t.json.ok, false);
    assert.match(t.json.message, /No credential/);
  }
  const gtwin = { owner: "Himanshu-Vidysea", repo: "vidyaksh-frontend", branch: "production_frontend", service: "frontend" };
  for (const [id, over] of [["evil-gh", {}], ["evil-gh-twin", gtwin]] as const) {
    assert.equal((await w.call("POST", `${P}sources`, { token: a, body: ghBody(id, over) })).status, 201);
    const t = await w.call("POST", `${P}sources/${id}/test`, { token: a, body: {} });
    const s = await w.call("POST", `${P}sources/${id}/sync`, { token: a, body: {} });
    console.log("NEWID gh", id, t.body, "|", s.body.slice(0, 160));
  }
  assert.equal(r.calls.length, 0, "postgres port never called for an admin-created source");
  assert.equal(g.tokens.length, 0, "github port never built for an admin-created source");
  // wrong-kind refs and a duplicate of the seeded id
  assert.equal((await w.call("POST", `${P}sources`, { token: a, body: pgBody("k1", { passwordRef: "GITHUB_TOKEN" }) })).status, 400);
  assert.equal((await w.call("POST", `${P}sources`, { token: a, body: ghBody("k2", { tokenRef: "PATHLYNKS_DB_PASSWORD" }) })).status, 400);
  assert.equal((await w.call("POST", `${P}sources`, { token: a, body: pgBody("pathlynks-db", { host: "attacker.example.com" }) })).status, 409);
  assert.equal((await w.call("POST", `${P}sources`, { token: a, body: pgBody("Pathlynks-DB") })).status, 400);
  assert.equal((await w.call("POST", `${P}sources`, { token: a, body: ghBody("pathlynks-frontend", { owner: "evil" }) })).status, 409);
});

test("C2-MUTATE: a seeded doc whose connection field changed (store-level PATCH) gets no env credential for Test, Sync, nor the live port", async () => {
  const pgVariants: [string, Record<string, unknown>][] = [
    ["host", { host: "attacker.example.com" }], ["host-trailing-dot", { host: SEED_PG.host + "." }], ["host-prefix", { host: "x" + SEED_PG.host }],
    ["port", { port: 5433 }], ["database", { database: "other" }], ["user", { user: "other" }], ["sslmode", { sslmode: "verify-full" }],
    ["passwordRef-other-pathlynks", { passwordRef: "PATHLYNKS_OTHER" }], ["passwordRef-github", { passwordRef: "GITHUB_TOKEN" }], ["passwordRef-vc", { passwordRef: "VC_ADMIN_MASTER_KEY" }],
    ["host-number-port-string", { port: String(SEED_PG.port) }],
  ];
  for (const [name, over] of pgVariants) {
    const { w, r } = await seededWorld();
    const spy = spyPg();
    try {
      await mutate(w, "pathlynks-db", over);
      const a = await w.token("admin");
      const t = await w.call("POST", `${P}sources/pathlynks-db/test`, { token: a, body: {} });
      assert.ok(!r.calls.some((c) => c.password === DB_PW), `pg Test leaked the env password for ${name}: ${t.body}`);
      const live = createLivePathlynksPort(w.store, { env, seeded: file.sources, nowMs: () => w.clock.ms });
      await live.getStudentProfile("student-1");
      assert.ok(!spy.seen.some((s) => s.password === DB_PW), `live port leaked for ${name}`);
    } finally {
      spy.restore();
    }
  }
  const ghVariants: [string, Record<string, unknown>][] = [
    ["owner", { owner: "evil" }], ["repo", { repo: "evil" }], ["tokenRef-other", { tokenRef: "GITHUB_OTHER" }], ["tokenRef-pathlynks", { tokenRef: "PATHLYNKS_DB_PASSWORD" }], ["tokenRef-removed", { tokenRef: undefined }],
    ["owner-trailing-space", { owner: "Himanshu-Vidysea " }],
  ];
  for (const [name, over] of ghVariants) {
    const { w, g } = await seededWorld();
    await mutate(w, "pathlynks-school", over);
    const a = await w.token("admin");
    const t = await w.call("POST", `${P}sources/pathlynks-school/test`, { token: a, body: {} });
    const s = await w.call("POST", `${P}sources/pathlynks-school/sync`, { token: a, body: {} });
    assert.ok(!g.tokens.includes(GH_TOKEN), `github leaked for ${name}: ${t.body} | ${s.body.slice(0, 200)}`);
  }
});

test("C2-CASE: case variant of the seeded host/owner/repo keeps the credential (same DNS name / same GitHub repo): functional, not a leak", async () => {
  const { w, r } = await seededWorld();
  await mutate(w, "pathlynks-db", { host: SEED_PG.host.toUpperCase() });
  const a = await w.token("admin");
  await w.call("POST", `${P}sources/pathlynks-db/test`, { token: a, body: {} });
  console.log("CASE host upper -> password handed:", r.calls.map((c) => [c.host, c.password === DB_PW]));
});

test("C2-UNICODE (store-level only): Kelvin sign U+212A lower-cases to k, so a stored doc whose host contains it compares equal to the seeded host", async () => {
  const seedHost = SEED_PG.host;
  assert.ok(seedHost.includes("k"), "seeded host contains a k");
  const evil = seedHost.replace("k", "\u212A");
  const bound = boundEnvRef({ id: "pathlynks-db", kind: "postgres", config: { host: evil, port: SEED_PG.port, database: SEED_PG.database, user: SEED_PG.user, sslmode: SEED_PG.sslmode, passwordRef: SEED_PG.passwordRef, tables: TABLES } } as never, file.sources);
  console.log("UNICODE kelvin host bound ->", bound);
  // create path: the schema's ASCII host regex must refuse it
  const { w } = await seededWorld();
  const c = await w.call("POST", `${P}sources`, { token: await w.token("admin"), body: pgBody("kelvin", { host: evil }) });
  console.log("UNICODE create via POST ->", c.status);
  assert.equal(c.status, 400);
});

test("C2-NOSEED: no seeded list (config file absent) -> env credential for nobody, seeded id included", async () => {
  const r = recPg();
  const w = await adminWorld({ env, postgres: r as never });
  await seedSourcesFromConfig(w.store, file);
  await w.call("POST", `${P}sources/pathlynks-db/test`, { token: await w.token("admin"), body: {} });
  assert.equal(r.calls.length, 0);
});

test("C2-SECRET: a super-admin-stored secret works for an admin-created source (own secret, not env); env never used for it", async () => {
  const { w, r } = await seededWorld();
  const a = await w.token("admin");
  const s = await w.token("super-admin");
  await w.call("POST", `${P}sources`, { token: a, body: pgBody("own-secret", { host: "db.example.org" }) });
  assert.equal((await w.call("PUT", `${P}sources/own-secret/secret`, { token: a, body: { secret: "x-secret" } })).status, 403);
  assert.equal((await w.call("PUT", `${P}sources/own-secret/secret`, { token: s, body: { secret: "own-secret-dummy-value" } })).status, 200);
  await w.call("POST", `${P}sources/own-secret/test`, { token: a, body: {} });
  assert.deepEqual(r.calls.map((c) => c.password), ["own-secret-dummy-value"]);
});

test("C2-LIVE: live port after a store-level change of the seeded doc stops sending the env password within the 60 s cache; control still connects with it", async () => {
  const spy = spyPg();
  try {
    const { w } = await seededWorld();
    const port = createLivePathlynksPort(w.store, { env, seeded: file.sources, nowMs: () => w.clock.ms });
    await port.getStudentProfile("student-1");
    const before = spy.seen.map((s) => [s.host, s.password === DB_PW]);
    await mutate(w, "pathlynks-db", { host: "attacker.example.com" });
    w.clock.ms += 61_000;
    spy.seen.length = 0;
    await port.getStudentProfile("student-1");
    console.log("LIVE before:", JSON.stringify(before), "after PATCH:", JSON.stringify(spy.seen.map((s) => [s.host, s.password === DB_PW])));
    assert.deepEqual(before, [[SEED_PG.host, true]]);
    assert.equal(spy.seen.length, 0);
    // omitting `seeded` (as before the wiring edit) fails closed
    const bare = createLivePathlynksPort(w.store, { env, nowMs: () => w.clock.ms });
    await mutate(w, "pathlynks-db", { host: SEED_PG.host });
    await bare.getStudentProfile("student-1");
    assert.equal(spy.seen.length, 0);
  } finally {
    spy.restore();
  }
});

test("C2-VA6: login attempts of every kind write exactly one audit row, none holds the body or the password", async () => {
  const w = await adminWorld({ env });
  const PW = "test-password-not-real-1";
  const rows0 = w.auditRows().length;
  const login = (body: unknown, raw?: string) => w.call("POST", `${P}login`, { body, ...(raw !== undefined ? { raw } : {}), headers: { "x-real-ip": "203.0.113.9" } });
  const ok = await login({ email: "super@vc.test", password: PW });
  const bad = await login({ email: "super@vc.test", password: "wrong-pw-dummy-77" });
  const unk = await login({ email: "nobody@vc.test", password: "wrong-pw-dummy-78" });
  const mal = await login(undefined, "{not json");
  console.log("VA6 statuses ok/bad/unk/mal:", ok.status, bad.status, unk.status, mal.status);
  const rows = w.auditRows().slice(rows0);
  console.log("VA6 rows:", JSON.stringify(rows.map((r) => [r.actorId, r.action, r.target, r.ok])));
  assert.equal(rows.length, 4);
  // 429 path
  let limited = 0;
  for (let i = 0; i < 12; i++) {
    const before = w.auditRows().length;
    const r = await login({ email: "super@vc.test", password: "guess-dummy-" + i });
    if (r.status === 429) limited++;
    assert.equal(w.auditRows().length - before, 1, `attempt ${i} (${r.status}) wrote ${w.auditRows().length - before} rows`);
  }
  assert.ok(limited > 0, "limiter reached");
  const dump = JSON.stringify(w.auditRows()) + JSON.stringify(w.logs);
  assert.ok(!dump.includes(PW) && !dump.includes("wrong-pw-dummy") && !dump.includes("guess-dummy"), "password in audit/logs");
  assert.ok(!/Bearer|eyJ/.test(JSON.stringify(w.auditRows())), "token in audit rows");
  // GETs write none
  const t = await w.token("viewer");
  const n = w.auditRows().length;
  await w.call("GET", `${P}sources`, { token: t });
  assert.equal(w.auditRows().length, n);
});

test("C2-VA6b: a failing audit write does not change the login answer or throw", async () => {
  const w = await adminWorld({ env });
  const col = w.fakeDb.collection("audit_log") as unknown as { insertOne?: (...a: unknown[]) => unknown };
  const orig = col.insertOne;
  if (typeof orig === "function") col.insertOne = async () => { throw new Error("audit down"); };
  try {
    const r = await w.call("POST", `${P}login`, { body: { email: "super@vc.test", password: "nope-dummy-1" } });
    console.log("VA6b with audit down ->", r.status, r.body);
  } finally {
    if (orig) col.insertOne = orig;
  }
});
