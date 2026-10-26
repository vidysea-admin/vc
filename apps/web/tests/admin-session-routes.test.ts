/**
 * vc-admin-control / VA19 (unit vca-ui): the Next route handlers that hold the admin session.
 * The JWT lives in an httpOnly cookie set HERE, never reachable from page script; the browser keeps it in memory only.
 * Every scenario drives the handler with a real Request and a mocked upstream fetch (the S3 admin API is built in a later unit).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_SESSION_COOKIE,
  handleSessionDelete,
  handleSessionGet,
  handleSessionLogin,
  handleProxy,
  createLoginGuard,
  type SessionDeps,
} from "../src/app/admin/_lib/session-handlers";
import { buildSessionCookie, clearSessionCookie, isLocalHost } from "../src/app/admin/_lib/session-cookie";

type Call = { url: string; init: RequestInit };

function deps(reply: (url: string, init: RequestInit) => Response | Promise<Response>, calls: Call[] = []): SessionDeps {
  return {
    upstreamBase: "http://api.test:9000",
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, init: init ?? {} });
      return reply(u, init ?? {});
    }) as typeof fetch,
  };
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const loginRequest = (body: unknown, url = "http://localhost:3108/api/admin-session"): Request =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("VA19 cookie flags: login on localhost sets HttpOnly + SameSite=Strict + Path=/ + Max-Age, no Secure", async () => {
  const calls: Call[] = [];
  const res = await handleSessionLogin(
    loginRequest({ email: "a@x.org", password: "pw-long-enough" }),
    deps(() => json(200, { token: "jwt.abc.def", role: "admin", email: "a@x.org" }), calls),
  );
  assert.equal(res.status, 200);
  const cookie = res.headers.get("set-cookie") ?? "";
  assert.ok(cookie.startsWith(`${ADMIN_SESSION_COOKIE}=jwt.abc.def`), cookie);
  assert.match(cookie, /;\s*HttpOnly/i);
  assert.match(cookie, /;\s*SameSite=Strict/i);
  assert.match(cookie, /;\s*Path=\//);
  assert.match(cookie, /;\s*Max-Age=\d+/);
  assert.doesNotMatch(cookie, /;\s*Secure/i, "localhost cannot take a Secure cookie in dev");
  assert.equal(calls[0].url, "http://api.test:9000/admin/api/login");
  assert.equal(JSON.parse(String(calls[0].init.body)).password, "pw-long-enough");
  const body = await res.json();
  assert.deepEqual({ role: body.role, email: body.email, token: body.token }, { role: "admin", email: "a@x.org", token: "jwt.abc.def" });
});

test("VA19 cookie flags: login over https on a real host is Secure; 127.0.0.1 and ::1 and localhost are the only exemptions", async () => {
  const res = await handleSessionLogin(
    loginRequest({ email: "a@x.org", password: "pw-long-enough" }, "https://console.vidysea.test/api/admin-session"),
    deps(() => json(200, { token: "t", role: "viewer", email: "a@x.org" })),
  );
  assert.match(res.headers.get("set-cookie") ?? "", /;\s*Secure/i);
  // A forged Host-looking hostname must not slip through: only the exact loopback names are local.
  for (const h of ["localhost", "127.0.0.1", "[::1]", "LOCALHOST"]) assert.equal(isLocalHost(h), true, h);
  for (const h of ["localhost.evil.test", "127.0.0.1.nip.io", "evil.test", "", "0.0.0.0"]) assert.equal(isLocalHost(h), false, h);
  // behind a TLS-terminating proxy the forwarded proto counts even if the app sees http
  const proxied = new Request("http://internal:3108/api/admin-session", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-proto": "https" },
    body: JSON.stringify({ email: "a@x.org", password: "pw-long-enough" }),
  });
  const res2 = await handleSessionLogin(proxied, deps(() => json(200, { token: "t", role: "viewer", email: "a@x.org" })));
  assert.match(res2.headers.get("set-cookie") ?? "", /;\s*Secure/i);
});

test("VA19 cookie builders: a token that could split the header is refused, clear sets Max-Age=0", () => {
  assert.throws(() => buildSessionCookie("a\r\nSet-Cookie: x=1", { secure: false }));
  assert.throws(() => buildSessionCookie("a;b", { secure: false }));
  assert.throws(() => buildSessionCookie("", { secure: false }));
  const cleared = clearSessionCookie({ secure: true });
  assert.match(cleared, /Max-Age=0/);
  assert.match(cleared, /HttpOnly/i);
  assert.match(cleared, /SameSite=Strict/i);
  assert.match(cleared, /Secure/i);
});

test("VA19 wrong password: generic 401, no cookie, and the upstream's wording is never echoed", async () => {
  const res = await handleSessionLogin(
    loginRequest({ email: "a@x.org", password: "nope-nope-nope" }),
    deps(() => json(401, { error: "no such user a@x.org", detail: "password mismatch for scrypt hash" })),
  );
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("set-cookie"), null);
  const text = await res.text();
  assert.deepEqual(JSON.parse(text), { error: "invalid_credentials" });
  assert.doesNotMatch(text, /scrypt|no such user/);
});

test("VA19 login rate limit (upstream 429) and unreachable upstream map to fixed, non-leaky errors", async () => {
  const limited = await handleSessionLogin(loginRequest({ email: "a@x.org", password: "pw-long-enough" }), deps(() => json(429, { error: "rate", ip: "10.0.0.7" })));
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { error: "too_many_attempts" });
  const down = await handleSessionLogin(
    loginRequest({ email: "a@x.org", password: "pw-long-enough" }),
    deps(() => {
      throw new Error("connect ECONNREFUSED 10.1.2.3:9000");
    }),
  );
  assert.equal(down.status, 502);
  const downText = await down.text();
  assert.doesNotMatch(downText, /ECONNREFUSED|10\.1\.2\.3/);
  const unconfigured = await handleSessionLogin(loginRequest({ email: "a@x.org", password: "pw-long-enough" }), { ...deps(() => json(200, {})), upstreamBase: undefined });
  assert.equal(unconfigured.status, 503);
});

test("VA19 login input: malformed / oversize / non-string credentials are 400 and never reach the upstream", async () => {
  const calls: Call[] = [];
  const d = deps(() => json(200, { token: "t", role: "viewer", email: "a" }), calls);
  const bad: unknown[] = [{}, { email: "a@x.org" }, { email: 5, password: "x" }, { email: "a@x.org", password: "x".repeat(2000) }, { email: "a@x.org", password: ["x"] }, "str", null];
  for (const b of bad) {
    const res = await handleSessionLogin(loginRequest(b), d);
    assert.equal(res.status, 400, JSON.stringify(b)?.slice(0, 60));
  }
  const notJson = await handleSessionLogin(new Request("http://localhost/api/admin-session", { method: "POST", body: "{{{" }), d);
  assert.equal(notJson.status, 400);
  assert.equal(calls.length, 0);
});

test("VA19 login: an upstream 200 without a usable token or a known role is refused (no cookie)", async () => {
  for (const reply of [{}, { token: "t" }, { token: "t", role: "root" }, { token: "a b", role: "admin" }, { token: 7, role: "admin" }]) {
    const res = await handleSessionLogin(loginRequest({ email: "a@x.org", password: "pw-long-enough" }), deps(() => json(200, reply)));
    assert.equal(res.status, 502, JSON.stringify(reply));
    assert.equal(res.headers.get("set-cookie"), null);
  }
});

test("VA19 reload: GET with the cookie re-validates against GET me and returns the token for in-memory use", async () => {
  const calls: Call[] = [];
  const req = new Request("http://localhost:3108/api/admin-session", { headers: { cookie: `other=1; ${ADMIN_SESSION_COOKIE}=jwt.live.tok` } });
  const res = await handleSessionGet(req, deps(() => json(200, { email: "v@x.org", role: "viewer" }), calls));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { token: "jwt.live.tok", role: "viewer", email: "v@x.org" });
  assert.equal(calls[0].url, "http://api.test:9000/admin/api/me");
  assert.equal((calls[0].init.headers as Record<string, string>).authorization, "Bearer jwt.live.tok");
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("VA19 expired / missing session: no cookie is 401 without an upstream call; an upstream 401 clears the cookie", async () => {
  const calls: Call[] = [];
  const none = await handleSessionGet(new Request("http://localhost/api/admin-session"), deps(() => json(200, {}), calls));
  assert.equal(none.status, 401);
  assert.equal(calls.length, 0);
  const expired = await handleSessionGet(
    new Request("http://localhost/api/admin-session", { headers: { cookie: `${ADMIN_SESSION_COOKIE}=old.jwt.tok` } }),
    deps(() => json(401, { error: "expired" }), calls),
  );
  assert.equal(expired.status, 401);
  assert.match(expired.headers.get("set-cookie") ?? "", /Max-Age=0/);
});

test("VA19 logout: DELETE clears the cookie", async () => {
  const res = await handleSessionDelete(new Request("http://localhost/api/admin-session", { method: "DELETE" }), deps(() => json(200, {})));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("set-cookie") ?? "", new RegExp(`${ADMIN_SESSION_COOKIE}=;.*Max-Age=0`));
});

test("VA19 proxy: forwards to /admin/api/<path> with the bearer header, keeps method + body + query, passes a 403 through", async () => {
  const calls: Call[] = [];
  const d = deps((url, init) => (init.method === "POST" ? json(403, { error: "forbidden" }) : json(200, { sites: [] })), calls);
  const get = await handleProxy(
    new Request("http://localhost/api/admin-session/proxy/metrics?from=2026-10-01&to=2026-10-07&siteId=s1", { headers: { authorization: "Bearer jwt.a.b" } }),
    ["metrics"],
    d,
  );
  assert.equal(get.status, 200);
  assert.equal(calls[0].url, "http://api.test:9000/admin/api/metrics?from=2026-10-01&to=2026-10-07&siteId=s1");
  assert.equal((calls[0].init.headers as Record<string, string>).authorization, "Bearer jwt.a.b");
  const post = await handleProxy(
    new Request("http://localhost/api/admin-session/proxy/sites/abc/revoke", { method: "POST", headers: { authorization: "Bearer jwt.a.b", "content-type": "application/json" }, body: "{}" }),
    ["sites", "abc", "revoke"],
    d,
  );
  assert.equal(post.status, 403, "a viewer's forced write comes back 403 untouched so the page can show it");
  assert.equal(calls[1].url, "http://api.test:9000/admin/api/sites/abc/revoke");
  assert.equal(calls[1].init.method, "POST");
});

test("VA19 proxy hostile: no bearer header (even with a valid cookie) is 401 and never forwarded; traversal / odd segments are 400", async () => {
  const calls: Call[] = [];
  const d = deps(() => json(200, {}), calls);
  const cookieOnly = await handleProxy(
    new Request("http://localhost/api/admin-session/proxy/sites", { headers: { cookie: `${ADMIN_SESSION_COOKIE}=jwt.a.b` } }),
    ["sites"],
    d,
  );
  assert.equal(cookieOnly.status, 401, "cross-site request forgery guard: the cookie alone authorises nothing");
  for (const segs of [[".."], ["sites", ".."], ["sites", "a/b"], ["sites", "%2e%2e"], [""], ["si tes"], []]) {
    const res = await handleProxy(new Request("http://localhost/x", { headers: { authorization: "Bearer jwt.a.b" } }), segs, d);
    assert.equal(res.status, 400, JSON.stringify(segs));
  }
  const crlf = await handleProxy(new Request("http://localhost/x", { headers: { authorization: "Bearer jwt.a.b" } }), ["login"], d);
  assert.notEqual(crlf.status, 400, "login is a normal admin api path");
  assert.equal(calls.filter(c => c.url.includes("..")).length, 0);
});

test("VA19 proxy: an upstream that is down is a fixed 502; an oversized request body is 413", async () => {
  const down = await handleProxy(
    new Request("http://localhost/x", { headers: { authorization: "Bearer jwt.a.b" } }),
    ["sites"],
    deps(() => {
      throw new Error("ECONNRESET secret-host");
    }),
  );
  assert.equal(down.status, 502);
  assert.doesNotMatch(await down.text(), /secret-host/);
  const big = await handleProxy(
    new Request("http://localhost/x", { method: "POST", headers: { authorization: "Bearer jwt.a.b" }, body: "x".repeat(70_000) }),
    ["sites"],
    deps(() => json(200, {})),
  );
  assert.equal(big.status, 413);
});

// ---------------------------------------------------------------------------------------------------------------- fix cycle 1 (R9): limiter bypass

test("fix1 R9: an attacker rotating X-Forwarded-For on every login attempt never gets a client address upstream, so the API limiter key cannot be reset", async () => {
  const calls: Call[] = [];
  const d = deps(() => json(401, { error: "nope" }), calls);
  for (let i = 1; i <= 6; i++) {
    const req = new Request("http://localhost:3108/api/admin-session", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `203.0.113.${i}, 10.0.0.1` },
      body: JSON.stringify({ email: `rot${i}@x.org`, password: "pw-long-enough" }),
    });
    await handleSessionLogin(req, d);
  }
  assert.equal(calls.length, 6);
  for (const c of calls) assert.equal((c.init.headers as Record<string, string>)["x-real-ip"], undefined, "X-Forwarded-For is attacker-controlled and is never forwarded as the client address");
  // The proxy-set x-real-ip is still honoured, and the proxy path follows the same rule.
  const real = new Request("http://localhost:3108/api/admin-session", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "198.51.100.7", "x-forwarded-for": "203.0.113.99" },
    body: JSON.stringify({ email: "real@x.org", password: "pw-long-enough" }),
  });
  await handleSessionLogin(real, d);
  assert.equal((calls[6]!.init.headers as Record<string, string>)["x-real-ip"], "198.51.100.7");
  await handleProxy(new Request("http://localhost:3108/api/admin-session/proxy/me", { headers: { authorization: "Bearer abc.def.ghi", "x-forwarded-for": "203.0.113.5" } }), ["me"], d);
  assert.equal((calls[7]!.init.headers as Record<string, string>)["x-real-ip"], undefined);
});

test("fix1 R9: ten login attempts for one e-mail from ten rotating addresses stop at the per-e-mail limit, before the upstream is called", async () => {
  const calls: Call[] = [];
  let now = 1_000_000;
  const d: SessionDeps = { ...deps(() => json(401, { error: "nope" }), calls), loginGuard: createLoginGuard({ limit: 5, windowMs: 60_000, now: () => now }) };
  const statuses: number[] = [];
  for (let i = 1; i <= 10; i++) {
    const req = new Request("http://localhost:3108/api/admin-session", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `203.0.113.${i}`, "x-real-ip": `198.51.100.${i}` },
      body: JSON.stringify({ email: i % 2 ? "Victim@x.org" : "victim@x.org", password: `guess-${i}` }),
    });
    statuses.push((await handleSessionLogin(req, d)).status);
  }
  assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429, 429, 429, 429, 429]);
  assert.equal(calls.length, 5, "the limited attempts never reached the admin API");
  now += 61_000;
  const again = await handleSessionLogin(new Request("http://localhost:3108/api/admin-session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "victim@x.org", password: "pw-long-enough" }) }), d);
  assert.equal(again.status, 401, "the window moved on, so the e-mail may try again");
  const other = await handleSessionLogin(new Request("http://localhost:3108/api/admin-session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "someone-else@x.org", password: "pw-long-enough" }) }), d);
  assert.equal(other.status, 401, "another e-mail is unaffected");
});

test("fix2 F3 (R9): an attacker tries 10,000 distinct e-mails within one window; a legitimate admin's first login is then still forwarded (the guard evicts, it never fails closed)", async () => {
  const calls: Call[] = [];
  let now = 2_000_000;
  const guard = createLoginGuard({ limit: 5, windowMs: 60_000, now: () => now });
  for (let i = 0; i < 10_000; i++) assert.equal(guard.check(`bot${i}@x.test`), true);
  const d: SessionDeps = { ...deps(() => json(401, { error: "nope" }), calls), loginGuard: guard };
  const res = await handleSessionLogin(loginRequest({ email: "super@vc.test", password: "pw-long-enough" }), d);
  assert.equal(res.status, 401, "reached the admin API instead of a 429 from a full guard table");
  assert.equal(calls.length, 1);
  // ten thousand MORE fresh e-mails at the very same instant still never lock a new one out
  for (let i = 10_000; i < 20_000; i++) guard.check(`bot${i}@x.test`);
  assert.equal(guard.check("another-admin@vc.test"), true);
  // and the per-e-mail limit itself still holds for an address that is being guessed at
  for (let i = 0; i < 5; i++) assert.equal(guard.check("victim@x.test"), true);
  assert.equal(guard.check("victim@x.test"), false);
});
