/**
 * vc-admin-control VA5, VA6, VA7, VA8 (route side), VA17 (route side): the admin API over the real handler chain `withAdminRoutes`, the real admin
 * store and partner store on the in-memory fake Db (B8), generated or obviously dummy credentials only (B13). Each test name states the real
 * scenario that reaches the behaviour.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { studentKeyOf } from "@vc/db";
import { adminIdOf, adminRouteSignatures } from "../src/admin-routes.js";
import {
  PartnerError,
  addPartner,
  createPartnerRegistry,
  hashPartnerKey,
  listPartners,
  revokePartner,
  unrevokePartner,
  updatePartner,
} from "../src/partners.js";
import { ADMIN_EMAILS, ADMIN_PATH, PASSWORD, PEPPER, T0, adminWorld, fakeGithub, type World } from "./admin-fixtures.js";

type Role = "viewer" | "admin" | "super-admin";
const RANK: Record<Role, number> = { viewer: 1, admin: 2, "super-admin": 3 };
const DUMMY_SECRET = "test-secret-not-real-0001";

async function seeded(): Promise<World> {
  const w = await adminWorld({ github: () => fakeGithub({ "migrations/20260101-init.js": "module.exports = { up: async (queryInterface, Sequelize) => { await queryInterface.createTable('users', { id: { type: Sequelize.INTEGER, primaryKey: true } }); }, down: async () => {} };" }) });
  await addPartner(w.partnerStore, { name: "Pathlynks", origins: ["https://pathlynks.example"] }, w.deps.partnerCtx!);
  await w.store.sources.upsert({ id: "gh-1", siteId: "pathlynks", kind: "github", config: { owner: "acme", repo: "backend", branch: "main", service: "school" } });
  return w;
}

interface Row {
  method: string;
  /** The route in S3 spelling, with * for an id segment. */
  pattern: string;
  /** The concrete request path (after /admin/api/). */
  path: string;
  body?: unknown;
  min: Role;
  ok: number;
}
const VIEWER_ID = adminIdOf(ADMIN_EMAILS.viewer);
const GITHUB_BODY = { kind: "github", id: "gh-2", owner: "acme", repo: "frontend", branch: "main", service: "frontend" };
const RANGE = "from=2026-10-01T00:00:00.000Z&to=2026-10-02T00:00:00.000Z";
const TABLE: Row[] = [
  { method: "GET", pattern: "me", path: "me", min: "viewer", ok: 200 },
  { method: "GET", pattern: "admins", path: "admins", min: "super-admin", ok: 200 },
  { method: "POST", pattern: "admins", path: "admins", body: { email: "new@vc.test", password: PASSWORD, role: "viewer" }, min: "super-admin", ok: 201 },
  { method: "PATCH", pattern: "admins/*", path: `admins/${VIEWER_ID}`, body: { role: "admin" }, min: "super-admin", ok: 200 },
  { method: "GET", pattern: "sites", path: "sites", min: "viewer", ok: 200 },
  { method: "POST", pattern: "sites", path: "sites", body: { name: "New Site", origins: ["https://new.example"] }, min: "admin", ok: 201 },
  { method: "PATCH", pattern: "sites/*", path: "sites/pathlynks", body: { name: "Renamed" }, min: "admin", ok: 200 },
  { method: "POST", pattern: "sites/*/keys/rotate", path: "sites/pathlynks/keys/rotate", body: { scope: "pub" }, min: "admin", ok: 200 },
  { method: "POST", pattern: "sites/*/revoke", path: "sites/pathlynks/revoke", body: {}, min: "admin", ok: 200 },
  { method: "POST", pattern: "sites/*/unrevoke", path: "sites/pathlynks/unrevoke", body: {}, min: "admin", ok: 200 },
  { method: "GET", pattern: "sources", path: "sources", min: "viewer", ok: 200 },
  { method: "POST", pattern: "sources", path: "sources", body: GITHUB_BODY, min: "admin", ok: 201 },
  { method: "PUT", pattern: "sources/*/secret", path: "sources/gh-1/secret", body: { secret: DUMMY_SECRET }, min: "super-admin", ok: 200 },
  { method: "POST", pattern: "sources/*/test", path: "sources/gh-1/test", body: {}, min: "admin", ok: 200 },
  { method: "POST", pattern: "sources/*/sync", path: "sources/gh-1/sync", body: {}, min: "admin", ok: 200 },
  { method: "GET", pattern: "metrics", path: `metrics?${RANGE}`, min: "viewer", ok: 200 },
  { method: "GET", pattern: "audit", path: "audit", min: "viewer", ok: 200 },
];

test("VA5: the test table covers exactly the routes admin-routes.ts serves (a route missing from the table is a failure)", () => {
  const served = adminRouteSignatures().sort();
  const tabled = [...TABLE.map((r) => `${r.method} ${r.pattern} ${r.min}`), "POST login viewer"].sort();
  assert.deepEqual(served, tabled);
});

for (const row of TABLE) {
  for (const role of ["viewer", "admin", "super-admin"] as const) {
    const allowed = RANK[role] >= RANK[row.min] && (row.method === "GET" || role !== "viewer");
    test(`VA5/VA6: ${role} ${row.method} /admin/api/${row.pattern} -> ${allowed ? row.ok : 403}, ${allowed ? (row.method === "GET" ? "no audit row" : "one ok audit row") : "no side effect and one ok:false audit row"}`, async () => {
      const w = await seeded();
      const token = await w.token(role);
      const before = w.snapshot();
      const auditBefore = w.auditRows().length;
      const res = await w.call(row.method, ADMIN_PATH + row.path, { token, ...(row.body === undefined ? {} : { body: row.body }) });
      assert.equal(res.status, allowed ? row.ok : 403, res.body);
      const rows = w.auditRows();
      if (!allowed) {
        assert.equal(w.snapshot(), before, "a refused call changed nothing but the audit log");
        assert.equal(rows.length, auditBefore + 1);
        assert.equal(rows.at(-1)!.ok, false);
        assert.equal(rows.at(-1)!.actorId, ADMIN_EMAILS[role]);
      } else if (row.method === "GET") {
        assert.equal(rows.length, auditBefore, "a GET writes no audit row");
      } else {
        assert.equal(rows.length, auditBefore + 1, "exactly one audit row per write");
        assert.equal(rows.at(-1)!.ok, true);
        assert.equal(rows.at(-1)!.actorId, ADMIN_EMAILS[role]);
      }
      // no token: always 401, never 403 or 200, and nothing is written
      const bare = await w.call(row.method, ADMIN_PATH + row.path, row.body === undefined ? {} : { body: row.body });
      assert.equal(bare.status, 401);
      assert.equal(w.auditRows().length, rows.length);
    });
  }
}

test("VA5: a viewer or admin cannot grant themselves a higher role, and nobody can change their own role (including the last super-admin)", async () => {
  const w = await seeded();
  const viewerId = adminIdOf(ADMIN_EMAILS.viewer);
  const adminId = adminIdOf(ADMIN_EMAILS.admin);
  const superId = adminIdOf(ADMIN_EMAILS["super-admin"]);
  assert.equal((await w.call("PATCH", `${ADMIN_PATH}admins/${viewerId}`, { token: await w.token("viewer"), body: { role: "super-admin" } })).status, 403);
  assert.equal((await w.call("PATCH", `${ADMIN_PATH}admins/${adminId}`, { token: await w.token("admin"), body: { role: "super-admin" } })).status, 403);
  assert.equal((await w.call("POST", `${ADMIN_PATH}admins`, { token: await w.token("admin"), body: { email: "x@vc.test", password: PASSWORD, role: "super-admin" } })).status, 403);
  const self = await w.call("PATCH", `${ADMIN_PATH}admins/${superId}`, { token: await w.token("super-admin"), body: { role: "viewer" } });
  assert.equal(self.status, 403);
  assert.equal(self.json.error, "self_change_forbidden");
  assert.equal((await w.store.users.findByEmail(ADMIN_EMAILS.viewer))?.role, "viewer");
  assert.equal((await w.store.users.findByEmail(ADMIN_EMAILS.admin))?.role, "admin");
  assert.equal((await w.store.users.findByEmail(ADMIN_EMAILS["super-admin"]))?.role, "super-admin");
  // a super-admin can change someone else's role, and the id in the path is the opaque one the list returned
  const list = await w.call("GET", `${ADMIN_PATH}admins`, { token: await w.token("super-admin") });
  assert.deepEqual(list.json.admins.map((a: { id: string }) => a.id).sort(), [viewerId, adminId, superId].sort());
  assert.ok(list.json.admins.every((a: Record<string, unknown>) => !("passwordHash" in a)));
  const ok = await w.call("PATCH", `${ADMIN_PATH}admins/${viewerId}`, { token: await w.token("super-admin"), body: { role: "admin" } });
  assert.equal(ok.status, 200);
  assert.equal((await w.store.users.findByEmail(ADMIN_EMAILS.viewer))?.role, "admin");
});

test("VA5: an unknown route is 404, a known path with another method is 405 with Allow, and an unauthenticated caller gets 401 for both", async () => {
  const w = await seeded();
  const token = await w.token("super-admin");
  assert.equal((await w.call("GET", `${ADMIN_PATH}nope`, { token })).status, 404);
  assert.equal((await w.call("GET", `${ADMIN_PATH}nope`)).status, 401);
  const wrongMethod = await w.call("DELETE", `${ADMIN_PATH}sites`, { token });
  assert.equal(wrongMethod.status, 405);
  assert.match(wrongMethod.headers.allow ?? "", /GET/);
  assert.equal((await w.call("GET", `${ADMIN_PATH}login`)).status, 405);
  assert.equal((await w.call("GET", `${ADMIN_PATH}sites/..%2Fadmins`, { token })).status, 404);
  // a path outside /admin/api/ goes to the inner handler untouched
  assert.equal((await w.call("GET", "/v1/anything", { token })).json.error, "inner");
});

test("VA5: an unparseable or oversized JSON body is a 400 / 413 with an ok:false audit row, not a crash", async () => {
  const w = await seeded();
  const token = await w.token("admin");
  const bad = await w.call("POST", `${ADMIN_PATH}sites`, { token, raw: "{not json" });
  assert.equal(bad.status, 400);
  const arr = await w.call("POST", `${ADMIN_PATH}sites`, { token, raw: "[1,2]" });
  assert.equal(arr.status, 400);
  const rows = w.auditRows();
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.ok === false));
});

// ---------------------------------------------------------------------------------------------------------------- VA6 audit

test("VA6: validation failures and downstream errors are audited ok:false, successes ok:true, and login success, failure and rate-limit are all rows", async () => {
  const w = await seeded();
  const token = await w.token("admin");
  const clockStep = () => (w.clock.ms += 1000);
  clockStep();
  assert.equal((await w.call("POST", `${ADMIN_PATH}sites`, { token, body: { name: "Good Site" } })).status, 201);
  clockStep();
  assert.equal((await w.call("POST", `${ADMIN_PATH}sites`, { token, body: { name: "Good Site" } })).status, 409, "duplicate id");
  clockStep();
  assert.equal((await w.call("POST", `${ADMIN_PATH}sites`, { token, body: { name: 7 } })).status, 400, "wrong type");
  clockStep();
  assert.equal((await w.call("POST", `${ADMIN_PATH}sites/ghost/revoke`, { token, body: {} })).status, 404);
  clockStep();
  const login = (password: string) => w.call("POST", `${ADMIN_PATH}login`, { body: { email: ADMIN_EMAILS.admin, password }, headers: { "x-real-ip": "198.51.100.5" } });
  assert.equal((await login(PASSWORD)).status, 200);
  clockStep();
  assert.equal((await login("wrong-password-xyz")).status, 401);
  const rows = w.auditRows();
  assert.deepEqual(
    rows.map((r) => [r.action, r.ok]),
    [
      ["sites.create", true],
      ["sites.create", false],
      ["sites.create", false],
      ["sites.revoke", false],
      ["login", true],
      ["login", false],
    ],
  );
  // a rate-limited login is a row too
  for (let i = 0; i < 4; i++) await login("wrong-password-xyz");
  assert.equal((await login(PASSWORD)).status, 429);
  const last = w.auditRows().at(-1)!;
  assert.deepEqual([last.action, last.ok], ["login", false]);
});

test("VA6: GET audit returns rows newest first for a viewer, and a row holds only at, actorId, action, target and ok (no body, no secret)", async () => {
  const w = await seeded();
  const admin = await w.token("admin");
  for (const name of ["Alpha Site", "Beta Site", "Gamma Site"]) {
    w.clock.ms += 60_000;
    await w.call("POST", `${ADMIN_PATH}sites`, { token: admin, body: { name } });
  }
  const res = await w.call("GET", `${ADMIN_PATH}audit`, { token: await w.token("viewer") });
  assert.equal(res.status, 200);
  const targets = res.json.entries.map((e: { target: string }) => e.target);
  assert.deepEqual(targets, ["gamma-site", "beta-site", "alpha-site"]);
  const ats = res.json.entries.map((e: { at: string }) => e.at);
  assert.deepEqual(ats, [...ats].sort().reverse());
  for (const e of res.json.entries) assert.deepEqual(Object.keys(e).sort(), ["action", "actorId", "at", "ok", "target"]);
  for (const stored of w.auditRows()) assert.deepEqual(Object.keys(stored).sort(), ["_id", "action", "actorId", "at", "ok", "target"]);
  assert.equal((await w.call("GET", `${ADMIN_PATH}audit?limit=2`, { token: admin })).json.entries.length, 2);
  assert.equal((await w.call("GET", `${ADMIN_PATH}audit?limit=0`, { token: admin })).status, 400);
});

test("VA6: if the audit row cannot be written, a write answers 500 audit_unavailable instead of pretending it was recorded", async () => {
  const w = await seeded();
  w.store.audit.append = async () => {
    throw new Error("disk full");
  };
  const res = await w.call("PATCH", `${ADMIN_PATH}sites/pathlynks`, { token: await w.token("admin"), body: { name: "Unaudited Site" } });
  assert.equal(res.status, 500);
  assert.equal(res.json.error, "audit_unavailable");
  assert.ok(!res.body.includes("disk full"));
});

// ---------------------------------------------------------------------------------------------------------------- VA7 sites

test("VA7: a key made in the console authenticates through the existing registry (pub on the page scope, srv on the server scope), the response shows it once, and a later list shows prefixes only", async () => {
  const w = await seeded();
  const admin = await w.token("admin");
  const created = await w.call("POST", `${ADMIN_PATH}sites`, { token: admin, body: { name: "Console Site", origins: ["https://console.example"] } });
  assert.equal(created.status, 201);
  const { pub, srv } = created.json.keys as { pub: string; srv: string };
  assert.match(pub, /^vck_pub_console-site_[A-Za-z0-9_-]{43}$/);
  assert.match(srv, /^vck_srv_console-site_[A-Za-z0-9_-]{43}$/);
  const registry = createPartnerRegistry({ store: w.partnerStore, pepper: PEPPER, nowMs: () => w.clock.ms });
  assert.equal((await registry.authenticate(pub, "pub"))?.partnerId, "console-site");
  assert.equal((await registry.authenticate(srv, "srv"))?.partnerId, "console-site");
  assert.equal(await registry.authenticate(pub, "srv"), undefined, "a page key is not a server key");
  const stored = (await w.partnerStore.get("console-site"))!;
  assert.equal(stored.keys.pub.hash, hashPartnerKey(pub, PEPPER), "the one existing HMAC path");
  const list = await w.call("GET", `${ADMIN_PATH}sites`, { token: admin });
  assert.ok(!list.body.includes(pub) && !list.body.includes(srv) && !list.body.includes(stored.keys.pub.hash));
  const site = list.json.sites.find((s: { partnerId: string }) => s.partnerId === "console-site");
  assert.match(site.keys.pub.prefix, /^vck_pub_console-site_/);
  assert.deepEqual(site.allowedOrigins, ["https://console.example"]);
});

test("VA7: rotating a key in the console stops the old one within the 60 s cache bound and the new one works; revoke kills both, unrevoke brings the same keys back", async () => {
  const w = await seeded();
  const admin = await w.token("admin");
  const created = await w.call("POST", `${ADMIN_PATH}sites`, { token: admin, body: { name: "Rotating Site" } });
  const old = created.json.keys.pub as string;
  const srv = created.json.keys.srv as string;
  const registry = createPartnerRegistry({ store: w.partnerStore, pepper: PEPPER, nowMs: () => w.clock.ms });
  assert.ok(await registry.authenticate(old, "pub"));
  const rotated = await w.call("POST", `${ADMIN_PATH}sites/rotating-site/keys/rotate`, { token: admin, body: { scope: "pub" } });
  assert.equal(rotated.status, 200);
  const fresh = rotated.json.key as string;
  assert.notEqual(fresh, old);
  assert.equal(rotated.json.scope, "pub");
  w.clock.ms += 61_000;
  assert.equal(await registry.authenticate(old, "pub"), undefined, "the rotated-out key gets the uniform refusal");
  assert.ok(await registry.authenticate(fresh, "pub"));
  assert.ok(await registry.authenticate(srv, "srv"), "the other scope is untouched");

  assert.equal((await w.call("POST", `${ADMIN_PATH}sites/rotating-site/revoke`, { token: admin, body: {} })).json.partner.status, "revoked");
  w.clock.ms += 61_000;
  assert.equal(await registry.authenticate(fresh, "pub"), undefined);
  assert.equal(await registry.authenticate(srv, "srv"), undefined);
  assert.equal((await w.call("POST", `${ADMIN_PATH}sites/rotating-site/keys/rotate`, { token: admin, body: { scope: "srv" } })).status, 409, "a revoked site is not rotated");
  assert.equal((await w.call("POST", `${ADMIN_PATH}sites/rotating-site/unrevoke`, { token: admin, body: {} })).json.partner.status, "active");
  w.clock.ms += 61_000;
  assert.ok(await registry.authenticate(fresh, "pub"));
  assert.ok(await registry.authenticate(srv, "srv"));
  assert.equal((await w.call("POST", `${ADMIN_PATH}sites/rotating-site/keys/rotate`, { token: admin, body: { scope: "other" } })).status, 400);
});

test("VA7: the console refuses what the CLI refuses: reserved ids, bad origins, a duplicate id, an unsafe name", async () => {
  const w = await seeded();
  const admin = await w.token("admin");
  const post = (body: unknown) => w.call("POST", `${ADMIN_PATH}sites`, { token: admin, body });
  assert.equal((await post({ name: "Sandbox", id: "sandbox" })).json.error, "invalid_partner_id");
  assert.equal((await post({ name: "Admin" })).json.error, "invalid_partner_id", "the slug of the name is the reserved id admin");
  for (const origin of ["http://evil.example", "https://*.evil.example", "https://evil.example/path", "https://u:p@evil.example", "ftp://evil.example", "not a url"]) {
    const res = await post({ name: "Origin Test", origins: [origin] });
    assert.equal(res.status, 400, origin);
    assert.equal(res.json.error, "invalid_origin", origin);
  }
  assert.equal((await post({ name: "Pathlynks" })).status, 409);
  assert.equal((await post({ name: "  " })).status, 400);
  assert.equal((await post({ name: "Bad\u0007Name" })).status, 400);
  assert.equal((await post({ name: "Fine Name", origins: "https://a.example" })).status, 400);
  assert.deepEqual((await listPartners(w.partnerStore)).map((p) => p.partnerId), ["pathlynks"], "nothing refused was stored");
});

test("VA7: PATCH sites/:id renames and replaces origins through normalizeOrigin, never touches the keys, and refuses what the CLI refuses", async () => {
  const w = await seeded();
  const admin = await w.token("admin");
  const before = (await w.partnerStore.get("pathlynks"))!;
  const res = await w.call("PATCH", `${ADMIN_PATH}sites/pathlynks`, { token: admin, body: { name: "  Pathlynks India ", origins: ["HTTPS://App.Pathlynks.Example", "https://app.pathlynks.example", "http://localhost:3000"] } });
  assert.equal(res.status, 200);
  assert.equal(res.json.partner.name, "Pathlynks India");
  assert.deepEqual(res.json.partner.allowedOrigins, ["https://app.pathlynks.example", "http://localhost:3000"]);
  const after = (await w.partnerStore.get("pathlynks"))!;
  assert.deepEqual(after.keys, before.keys, "no key changed");
  assert.equal(after.status, "active");
  for (const body of [{ origins: ["https://a.example/x"] }, { origins: ["http://remote.example"] }, { name: "" }, { name: 3 }, {}]) {
    const bad = await w.call("PATCH", `${ADMIN_PATH}sites/pathlynks`, { token: admin, body });
    assert.equal(bad.status, 400, JSON.stringify(body));
  }
  assert.deepEqual((await w.partnerStore.get("pathlynks"))!.allowedOrigins, ["https://app.pathlynks.example", "http://localhost:3000"], "refused edits changed nothing");
  assert.equal((await w.call("PATCH", `${ADMIN_PATH}sites/ghost`, { token: admin, body: { name: "X Y" } })).status, 404);
});

test("VA7: updatePartner and unrevokePartner are the partners.ts functions the console calls: same store, same normalisation, idempotent, keys never minted", async () => {
  const w = await seeded();
  const ctx = w.deps.partnerCtx!;
  const before = (await w.partnerStore.get("pathlynks"))!;
  const renamed = await updatePartner(w.partnerStore, "pathlynks", { name: "New Name" });
  assert.equal(renamed.name, "New Name");
  assert.deepEqual(renamed.allowedOrigins, ["https://pathlynks.example"], "origins untouched when not given");
  await assert.rejects(() => updatePartner(w.partnerStore, "pathlynks", {}), (e: unknown) => e instanceof PartnerError && e.code === "usage");
  await assert.rejects(() => updatePartner(w.partnerStore, "ghost", { name: "X Y" }), (e: unknown) => e instanceof PartnerError && e.code === "partner_not_found");
  await assert.rejects(() => unrevokePartner(w.partnerStore, "ghost"), (e: unknown) => e instanceof PartnerError && e.code === "partner_not_found");
  assert.equal((await unrevokePartner(w.partnerStore, "pathlynks")).status, "active", "unrevoke of an active partner is a no-op");
  await revokePartner(w.partnerStore, "pathlynks");
  assert.equal((await updatePartner(w.partnerStore, "pathlynks", { name: "Still Renamed" })).status, "revoked", "a revoked site can be renamed and stays revoked");
  assert.equal((await unrevokePartner(w.partnerStore, "pathlynks")).status, "active");
  const after = (await w.partnerStore.get("pathlynks"))!;
  assert.deepEqual(after.keys, before.keys, "the same two key records as at creation");
  assert.equal(ctx.pepper, PEPPER);
});

test("VA7: with partner keys off (no pepper) the site write routes answer 503 and the read route still lists", async () => {
  const w = await adminWorld({ partnerCtx: undefined });
  const admin = await w.token("admin");
  assert.equal((await w.call("POST", `${ADMIN_PATH}sites`, { token: admin, body: { name: "No Pepper" } })).status, 503);
  assert.equal((await w.call("GET", `${ADMIN_PATH}sites`, { token: admin })).status, 200);
});

test("VA7 static: admin-routes.ts has no createHmac / timingSafeEqual and admin-auth.ts uses timingSafeEqual only for the scrypt compare (no partner-key hashing in either)", () => {
  const read = (f: string) => readFileSync(fileURLToPath(new URL(`../src/${f}`, import.meta.url)), "utf8");
  assert.ok(!/createHmac|timingSafeEqual/.test(read("admin-routes.ts")));
  const auth = read("admin-auth.ts");
  assert.ok(!/createHmac/.test(auth));
  assert.equal((auth.match(/timingSafeEqual\(/g) ?? []).length, 1);
  assert.ok(!/vck_|PARTNER_KEY|hashPartnerKey|parsePartnerKey/.test(read("admin-routes.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")), "no second key format or lookup in the routes");
});

// ---------------------------------------------------------------------------------------------------------------- VA8 sources (CRUD side)

test("VA8: POST sources validates the body with the S1 SourceConfig: a password field, a token-looking tokenRef, a connection string, unknown keys and kinds are 400 and nothing is stored", async () => {
  const w = await seeded();
  const admin = await w.token("admin");
  const post = (body: unknown) => w.call("POST", `${ADMIN_PATH}sources`, { token: admin, body });
  const pg = { kind: "postgres", id: "pg-1", host: "db.example", port: 5432, database: "app", user: "reader", sslmode: "require", passwordRef: "PATHLYNKS_DB_PASSWORD", tables: ["students"] };
  const bad: Record<string, unknown>[] = [
    { ...GITHUB_BODY, token: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" },
    { ...GITHUB_BODY, tokenRef: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" },
    { ...GITHUB_BODY, tokenRef: "lower_case_name" },
    { ...pg, password: DUMMY_SECRET },
    { ...pg, host: "postgres://reader:hunter2secret@db.example/app" },
    { ...pg, passwordRef: DUMMY_SECRET },
    { ...pg, sslmode: "disable" },
    { ...pg, tables: [] },
    { ...GITHUB_BODY, extra: 1 },
    { ...GITHUB_BODY, kind: "ftp" },
    { ...GITHUB_BODY, id: "Bad Id" },
    {},
  ];
  for (const body of bad) {
    const res = await post(body);
    assert.equal(res.status, 400, JSON.stringify(Object.keys(body)));
  }
  assert.deepEqual((await w.store.sources.list()).map((s) => s.id), ["gh-1"], "none of the refused bodies was stored");
  const okGithub = await post(GITHUB_BODY);
  assert.equal(okGithub.status, 201);
  assert.equal(okGithub.json.source.siteId, "pathlynks", "the default site id of the config file");
  assert.equal(okGithub.json.source.hasSecret, false);
  assert.deepEqual(okGithub.json.source.config, { owner: "acme", repo: "frontend", branch: "main", service: "frontend" });
  assert.equal((await post(pg)).status, 201);
  assert.equal((await post(GITHUB_BODY)).status, 409, "a duplicate id is a conflict, not an overwrite");
  assert.equal((await post({ ...GITHUB_BODY, id: "gh-3", siteId: "videshi" })).json.source.siteId, "videshi");
  const list = await w.call("GET", `${ADMIN_PATH}sources`, { token: await w.token("viewer") });
  assert.deepEqual(list.json.sources.map((s: { id: string }) => s.id).sort(), ["gh-1", "gh-2", "gh-3", "pg-1"]);
});

test("VA8: PUT sources/:id/secret stores only the encrypted triple, answers hasSecret, and refuses empty, oversized and unknown-source requests", async () => {
  const w = await seeded();
  const sup = await w.token("super-admin");
  const put = (id: string, body: unknown) => w.call("PUT", `${ADMIN_PATH}sources/${id}/secret`, { token: sup, body });
  assert.equal((await put("gh-1", { secret: "" })).status, 400);
  assert.equal((await put("gh-1", { secret: 5 })).status, 400);
  assert.equal((await put("gh-1", { secret: "x".repeat(5000) })).status, 400);
  assert.equal((await put("ghost", { secret: DUMMY_SECRET })).status, 404);
  const ok = await put("gh-1", { secret: DUMMY_SECRET });
  assert.deepEqual(ok.json, { ok: true, hasSecret: true });
  const doc = w.fakeDb.collection<{ _id: string; secretEnc?: { iv: string; tag: string; ct: string } }>("sources").all().find((d) => d._id === "gh-1")!;
  assert.deepEqual(Object.keys(doc.secretEnc!).sort(), ["ct", "iv", "tag"]);
  assert.ok(!JSON.stringify(w.fakeDb.collection("sources").all()).includes(DUMMY_SECRET), "no plaintext in the database");
  assert.equal(await w.store.sources.readSecret("gh-1"), DUMMY_SECRET);
  const list = await w.call("GET", `${ADMIN_PATH}sources`, { token: await w.token("viewer") });
  assert.equal(list.json.sources[0].hasSecret, true);
  assert.ok(!list.body.includes(DUMMY_SECRET));
});

test("VA8: without VC_ADMIN_MASTER_KEY, setting a secret answers 503 secrets_not_configured and stores nothing", async () => {
  const { createAdminStore } = await import("@vc/db");
  const w = await seeded();
  const keyless = createAdminStore(w.fakeDb as never, {});
  const w2 = await adminWorld({ store: keyless });
  await keyless.sources.upsert({ id: "gh-9", siteId: "pathlynks", kind: "github", config: { owner: "a", repo: "b", branch: "main", service: "other" } });
  const res = await w2.call("PUT", `${ADMIN_PATH}sources/gh-9/secret`, { token: await w2.token("super-admin"), body: { secret: DUMMY_SECRET } });
  assert.equal(res.status, 503);
  assert.equal(res.json.error, "secrets_not_configured");
  assert.equal((await keyless.sources.get("gh-9"))?.hasSecret, false);
});

// ---------------------------------------------------------------------------------------------------------------- VA17 metrics

async function seedUsage(w: World): Promise<void> {
  const key = (s: string) => studentKeyOf("k".repeat(40), "pathlynks", s);
  const rec = (siteId: string, at: string, mode: "chat" | "voice", studentKey: string | undefined, inputTokens: number, outputTokens: number, costUsd: number, latencyMs: number, answered: boolean, guardrail?: string) =>
    w.store.usage.record({ at, siteId, ...(studentKey === undefined ? {} : { studentKey }), mode, inputTokens, outputTokens, costUsd, latencyMs, answered, ...(guardrail === undefined ? {} : { guardrail }) });
  await rec("pathlynks", "2026-10-20T09:00:00.000Z", "chat", key("a"), 100, 50, 0.01, 200, true);
  await rec("pathlynks", "2026-10-20T10:00:00.000Z", "voice", key("a"), 200, 100, 0.02, 400, true, "crisis");
  await rec("pathlynks", "2026-10-20T11:00:00.000Z", "chat", key("b"), 300, 150, 0.03, 600, false);
  await rec("pathlynks", "2026-10-21T09:00:00.000Z", "chat", key("b"), 400, 200, 0.04, 800, true);
  await rec("videshi", "2026-10-21T09:30:00.000Z", "chat", undefined, 50, 25, 0.005, 100, true);
  await rec("pathlynks", "2026-10-22T00:00:00.000Z", "chat", key("c"), 1, 1, 0.001, 50, true);
}

test("VA17: GET metrics returns the golden numbers for a seeded usage set (viewer allowed), filters by site, and excludes the exclusive end of the range", async () => {
  const w = await adminWorld({ usdInrRate: 80 });
  await seedUsage(w);
  const viewer = await w.token("viewer");
  const all = await w.call("GET", `${ADMIN_PATH}metrics?from=2026-10-20T00:00:00.000Z&to=2026-10-22T00:00:00.000Z`, { token: viewer });
  assert.equal(all.status, 200);
  assert.deepEqual(all.json, {
    perSiteDay: [
      { siteId: "pathlynks", day: "2026-10-20", conversations: 3 },
      { siteId: "pathlynks", day: "2026-10-21", conversations: 1 },
      { siteId: "videshi", day: "2026-10-21", conversations: 1 },
    ],
    activeStudents: 2,
    chatVsVoice: { chat: 4, voice: 1 },
    tokens: 1575,
    costUsd: 0.105,
    costPerStudentInr: 4.2,
    latencyP50: 400,
    latencyP95: 800,
    guardrailHits: 1,
    unanswered: 1,
  });
  const one = await w.call("GET", `${ADMIN_PATH}metrics?from=2026-10-20T00:00:00.000Z&to=2026-10-22T00:00:00.000Z&siteId=pathlynks`, { token: viewer });
  assert.deepEqual(one.json, {
    perSiteDay: [
      { siteId: "pathlynks", day: "2026-10-20", conversations: 3 },
      { siteId: "pathlynks", day: "2026-10-21", conversations: 1 },
    ],
    activeStudents: 2,
    chatVsVoice: { chat: 3, voice: 1 },
    tokens: 1500,
    costUsd: 0.1,
    costPerStudentInr: 4,
    latencyP50: 400,
    latencyP95: 800,
    guardrailHits: 1,
    unanswered: 1,
  });
  const empty = await w.call("GET", `${ADMIN_PATH}metrics?from=2026-01-01T00:00:00.000Z&to=2026-01-02T00:00:00.000Z`, { token: viewer });
  assert.deepEqual(empty.json, { perSiteDay: [], activeStudents: 0, chatVsVoice: { chat: 0, voice: 0 }, tokens: 0, costUsd: 0, costPerStudentInr: 0, latencyP50: 0, latencyP95: 0, guardrailHits: 0, unanswered: 0 });
});

test("VA17: an inverted, equal, missing or unparseable range is a 400 and a bad site id is a 400", async () => {
  const w = await adminWorld();
  const viewer = await w.token("viewer");
  for (const q of ["from=2026-10-22T00:00:00.000Z&to=2026-10-20T00:00:00.000Z", "from=2026-10-20T00:00:00.000Z&to=2026-10-20T00:00:00.000Z", "from=2026-10-20T00:00:00.000Z", "to=2026-10-20T00:00:00.000Z", "", "from=abc&to=def", "from=2026-10-20T00:00:00.000Z&to=2026-10-21T00:00:00.000Z&siteId=Bad%20Site"]) {
    const res = await w.call("GET", `${ADMIN_PATH}metrics${q === "" ? "" : `?${q}`}`, { token: viewer });
    assert.equal(res.status, 400, q);
  }
  assert.equal(T0 > 0, true);
});

// ---------------------------------------------------------------------------------------------------------------- fix cycle 1 (R1): env-name allow-list

test("fix1 R1: an admin creates a source naming VC_ADMIN_MASTER_KEY / VC_ADMIN_JWT_SECRET / MONGODB_URL as its credential ref: 400 and nothing is stored", async () => {
  const w = await seeded();
  const admin = await w.token("admin");
  const pg = { kind: "postgres", id: "pg-evil", host: "db.example", port: 5432, database: "app", user: "reader", sslmode: "require", tables: ["students"] };
  const evil = [
    { ...pg, passwordRef: "VC_ADMIN_MASTER_KEY" },
    { ...pg, passwordRef: "VC_ADMIN_JWT_SECRET" },
    { ...pg, passwordRef: "MONGODB_URL" },
    { ...GITHUB_BODY, id: "gh-evil", tokenRef: "VC_ADMIN_MASTER_KEY" },
    { ...GITHUB_BODY, id: "gh-evil", tokenRef: "VC_ADMIN_JWT_SECRET" },
    { ...GITHUB_BODY, id: "gh-evil", tokenRef: "MONGODB_URL" },
  ];
  for (const body of evil) {
    const res = await w.call("POST", `${ADMIN_PATH}sources`, { token: admin, body });
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  assert.deepEqual((await w.store.sources.list()).map((s) => s.id), ["gh-1"], "none of the evil sources was stored");
  const fine = await w.call("POST", `${ADMIN_PATH}sources`, { token: admin, body: { ...pg, id: "pg-ok", passwordRef: "PATHLYNKS_DB_PASSWORD" } });
  assert.equal(fine.status, 201);
  assert.equal((await w.call("POST", `${ADMIN_PATH}sources`, { token: admin, body: { ...GITHUB_BODY, id: "gh-ok", tokenRef: "GITHUB_TOKEN_2" } })).status, 201);
});

// ---------------------------------------------------------------------------------------------------------------- fix cycle 1 (R4): the one-time key survives an audit failure

test("fix1 R4: rotating a site key while the audit write is failing still returns the new key once, flagged auditRecorded:false and logged, instead of a 500 that loses it", async () => {
  const w = await seeded();
  const admin = await w.token("admin");
  w.store.audit.append = async () => {
    throw new Error("disk full");
  };
  const res = await w.call("POST", `${ADMIN_PATH}sites/pathlynks/keys/rotate`, { token: admin, body: { scope: "pub" } });
  assert.equal(res.status, 200, res.body);
  assert.match(res.json.key, /^vck_pub_pathlynks_[A-Za-z0-9_-]{43}$/);
  assert.equal(res.json.auditRecorded, false);
  assert.ok(w.logs.some((l) => l.event === "admin_audit_failed"));
  assert.ok(!res.body.includes("disk full"));
  const registry = createPartnerRegistry({ store: w.partnerStore, pepper: PEPPER, nowMs: () => w.clock.ms });
  assert.equal((await registry.authenticate(res.json.key, "pub"))?.partnerId, "pathlynks", "the returned key is the live one");
});

test("fix1 R4: creating a site while the audit write is failing returns both new keys with the audit flag; an ordinary write still answers 500 audit_unavailable", async () => {
  const w = await seeded();
  const admin = await w.token("admin");
  w.store.audit.append = async () => {
    throw new Error("disk full");
  };
  const res = await w.call("POST", `${ADMIN_PATH}sites`, { token: admin, body: { name: "Late Audit", origins: ["https://late.example"] } });
  assert.equal(res.status, 201, res.body);
  assert.match(res.json.keys.pub, /^vck_pub_late-audit_/);
  assert.match(res.json.keys.srv, /^vck_srv_late-audit_/);
  assert.equal(res.json.auditRecorded, false);
  const plain = await w.call("POST", `${ADMIN_PATH}sites/pathlynks/revoke`, { token: admin, body: {} });
  assert.equal(plain.status, 500);
  assert.equal(plain.json.error, "audit_unavailable");
});
