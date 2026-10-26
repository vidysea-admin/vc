/**
 * vc-admin-control / VA19 (unit vca-ui): the browser-side admin API client codes to the spec S3 paths and is tested against a mocked fetch.
 * Also: the in-memory token rule (token only in the Authorization header, never in a URL or a storage API) and the role matrix.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { AdminApiError, createAdminClient, PROXY_BASE } from "../src/app/admin/_lib/client";
import { can, canSeeNav, ROLES } from "../src/app/admin/_lib/permissions";
import { adminGateTarget } from "../src/app/admin/_lib/gate";
import { defaultRange, metricsWindow } from "../src/app/admin/_lib/format";

type Call = { url: string; init: RequestInit };

function harness(status = 200, body: unknown = {}) {
  const calls: Call[] = [];
  let unauthorized = 0;
  const client = createAdminClient({
    fetch: (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
    getToken: () => "tok.en.mem",
    onUnauthorized: () => {
      unauthorized += 1;
    },
  });
  return { client, calls, unauthorized: () => unauthorized };
}

const headerOf = (c: Call, name: string): string | undefined => (c.init.headers as Record<string, string>)[name];

test("VA19 client S3 paths: every method calls the spec route with the right verb and a bearer header", async () => {
  const h = harness(200, {});
  const c = h.client;
  await c.me();
  await c.listSites();
  await c.createSite({ name: "Pathlynks", origins: ["https://pathlynks.example"] });
  await c.updateSite("pathlynks", { name: "P", origins: ["https://p.example"] });
  await c.rotateKey("pathlynks", "pub");
  await c.revokeSite("pathlynks");
  await c.unrevokeSite("pathlynks");
  await c.listSources();
  await c.createSource({ kind: "github", id: "gh-main", owner: "vidysea", repo: "frontend", branch: "main", service: "frontend" });
  await c.setSourceSecret("gh-main", "ghp_not_a_real_secret");
  await c.testSource("gh-main");
  await c.syncSource("gh-main");
  await c.listAdmins();
  await c.createAdmin({ email: "n@x.org", password: "a-long-password", role: "viewer" });
  await c.setAdminRole("admin-1", "admin");
  await c.metrics({ from: "2026-10-01", to: "2026-10-07", siteId: "pathlynks" });
  await c.audit();
  const seen = h.calls.map(x => `${x.init.method ?? "GET"} ${x.url.replace(PROXY_BASE, "")}`);
  assert.deepEqual(seen, [
    "GET /me",
    "GET /sites",
    "POST /sites",
    "PATCH /sites/pathlynks",
    "POST /sites/pathlynks/keys/rotate",
    "POST /sites/pathlynks/revoke",
    "POST /sites/pathlynks/unrevoke",
    "GET /sources",
    "POST /sources",
    "PUT /sources/gh-main/secret",
    "POST /sources/gh-main/test",
    "POST /sources/gh-main/sync",
    "GET /admins",
    "POST /admins",
    "PATCH /admins/admin-1",
    "GET /metrics?from=2026-10-01&to=2026-10-07&siteId=pathlynks",
    "GET /audit",
  ]);
  for (const call of h.calls) assert.equal(headerOf(call, "authorization"), "Bearer tok.en.mem");
  assert.deepEqual(JSON.parse(String(h.calls[4].init.body)), { scope: "pub" });
  assert.deepEqual(JSON.parse(String(h.calls[9].init.body)), { secret: "ghp_not_a_real_secret" });
});

test("VA19 in-memory token: the token is only ever in the Authorization header, never a URL, query or body", async () => {
  const h = harness(200, {});
  await h.client.listSites();
  await h.client.createSite({ name: "n", origins: [] });
  await h.client.metrics({ from: "a", to: "b" });
  for (const call of h.calls) {
    assert.ok(!call.url.includes("tok.en.mem"), call.url);
    assert.ok(!String(call.init.body ?? "").includes("tok.en.mem"));
  }
});

test("VA19 viewer forced write: a 403 becomes an AdminApiError the page shows as an error (no redirect)", async () => {
  const h = harness(403, { error: "forbidden" });
  await assert.rejects(
    () => h.client.createSite({ name: "x", origins: [] }),
    (e: unknown) => e instanceof AdminApiError && e.status === 403 && /not allowed/i.test(e.message),
  );
  assert.equal(h.unauthorized(), 0);
});

test("VA19 expired session: a 401 calls onUnauthorized (the page goes back to login) and still rejects", async () => {
  const h = harness(401, { error: "expired" });
  await assert.rejects(() => h.client.listSites(), (e: unknown) => e instanceof AdminApiError && e.status === 401);
  assert.equal(h.unauthorized(), 1);
});

test("VA19 client errors never surface raw server text; other statuses get a fixed sentence", async () => {
  const h = harness(500, { error: "stack: Error at /srv/api/admin-routes.ts:88 password=hunter2" });
  await assert.rejects(
    () => h.client.listSources(),
    (e: unknown) => e instanceof AdminApiError && !/hunter2|admin-routes/.test(e.message),
  );
  const net = createAdminClient({
    fetch: (async () => {
      throw new TypeError("fetch failed 10.0.0.1");
    }) as typeof fetch,
    getToken: () => "t",
    onUnauthorized: () => undefined,
  });
  await assert.rejects(() => net.listSources(), (e: unknown) => e instanceof AdminApiError && e.status === 0 && !/10\.0\.0\.1/.test(e.message));
});

test("VA19 client path ids are encoded: a site id with a slash cannot escape its segment", async () => {
  const h = harness(200, {});
  await h.client.revokeSite("a/../../admins");
  assert.ok(h.calls[0].url.endsWith("/sites/a%2F..%2F..%2Fadmins/revoke"), h.calls[0].url);
});

test("VA19 role matrix: viewer writes nothing, admin everything but admins + secrets, super-admin all", () => {
  const writes = ["site.write", "key.write", "source.write", "source.test", "source.sync", "source.secret", "admin.write"] as const;
  for (const w of writes) assert.equal(can("viewer", w), false, `viewer ${w}`);
  for (const w of ["site.write", "key.write", "source.write", "source.test", "source.sync"] as const) assert.equal(can("admin", w), true, `admin ${w}`);
  for (const w of ["source.secret", "admin.write"] as const) assert.equal(can("admin", w), false, `admin ${w}`);
  for (const w of writes) assert.equal(can("super-admin", w), true, `super ${w}`);
  assert.equal(can("root" as never, "site.write"), false, "an unknown role is a viewer at best");
  assert.equal(can(undefined, "site.write"), false);
  assert.deepEqual([...ROLES], ["super-admin", "admin", "viewer"]);
  assert.equal(canSeeNav("viewer", "admins"), false);
  assert.equal(canSeeNav("admin", "admins"), false);
  assert.equal(canSeeNav("super-admin", "admins"), true);
  for (const r of ROLES) for (const page of ["dashboard", "sites", "sources", "audit"] as const) assert.equal(canSeeNav(r, page), true);
});

test("VA19 expired / missing session: the server gate sends a missing or empty cookie to login, a present one through", () => {
  assert.equal(adminGateTarget(undefined), "/admin/login");
  assert.equal(adminGateTarget(""), "/admin/login");
  assert.equal(adminGateTarget("   "), "/admin/login");
  assert.equal(adminGateTarget("jwt.a.b"), null);
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

test("VA19 no storage: no admin source file touches localStorage, sessionStorage, IndexedDB or document.cookie, and none puts a token in a URL", () => {
  const root = join(import.meta.dirname, "..", "src", "app");
  const files = [...walk(join(root, "admin")), ...walk(join(root, "api", "admin-session"))];
  assert.ok(files.length >= 8, `expected the admin tree, found ${files.length} files`);
  for (const f of files) {
    const text = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const banned of [/\blocalStorage\b/, /\bsessionStorage\b/, /\bindexedDB\b/, /document\.cookie/, /[?&]token=/, /\bdangerouslySetInnerHTML\b/]) {
      assert.doesNotMatch(text, banned, `${f} matches ${banned}`);
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------- fix cycle 1 (R3)

test("fix1 R3: a usage row stamped today at noon appears in the default dashboard window (the API's `to` is exclusive, the UI's To is inclusive)", () => {
  const now = new Date("2026-10-26T12:00:00.000Z");
  const range = defaultRange(now);
  assert.equal(range.to, "2026-10-26", "the picker still shows today as the To date");
  const win = metricsWindow(range);
  const rowAt = now.toISOString();
  assert.ok(win.from <= rowAt && rowAt < win.to, `${win.from} <= ${rowAt} < ${win.to}`);
  assert.ok("2026-10-26T23:59:59.999Z" < win.to, "the last millisecond of today is inside too");
  assert.ok(!("2026-10-27T00:00:00.000Z" < win.to), "tomorrow is outside");
  assert.equal(metricsWindow({ from: "2026-12-30", to: "2026-12-31" }).to, "2027-01-01", "the day after rolls over the year");
});

test("fix1 R3: the dashboard page sends the exclusive end, not the raw To date", () => {
  const src = readFileSync(join(import.meta.dirname, "..", "src", "app", "admin", "(console)", "dashboard", "page.tsx"), "utf8");
  assert.ok(/metricsWindow\(range\)/.test(src), "metrics are requested through metricsWindow");
  assert.ok(!/to: range\.to/.test(src), "no raw range.to goes to the API");
});
