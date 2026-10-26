/**
 * vc-admin-control VA4: admin passwords, the admin JWT (typ "vc-admin"), the 5-per-minute login limit and the CLI. Outcome tests over the real
 * handler chain `withAdminRoutes`, the real admin store on the in-memory fake Db, generated or obviously dummy credentials only (B13).
 * Each test name states the real scenario that reaches the behaviour.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";
import { createFakeDb } from "@vc/db/testing";
import { createAdminStore } from "@vc/db";
import { ADMIN_JWT_TYP, ADMIN_TOKEN_TTL_SEC, SCRYPT_N, hashPassword, signAdminToken, verifyAdminToken, verifyPassword } from "../src/admin-auth.js";
import { runAdminCli, type AdminCliDeps } from "../src/admin-cli.js";
import { mintAnonymousVoiceToken, mintVoiceToken } from "../src/voice.js";
import { ADMIN_EMAILS, ADMIN_PATH, JWT_SECRET, JWT_SECRET_TEXT, PASSWORD, T0, adminWorld, passwordHash } from "./admin-fixtures.js";

const login = (w: Awaited<ReturnType<typeof adminWorld>>, email: string, password: string, ip = "198.51.100.7") =>
  w.call("POST", `${ADMIN_PATH}login`, { body: { email, password }, headers: { "x-real-ip": ip } });

test("VA4: an admin signs in with the right password and gets an 8-hour HS256 token with claims sub, role and typ vc-admin", async () => {
  const w = await adminWorld();
  const res = await login(w, ADMIN_EMAILS.admin, PASSWORD);
  assert.equal(res.status, 200);
  assert.equal(res.json.role, "admin");
  assert.equal(res.json.email, ADMIN_EMAILS.admin);
  const claims = await verifyAdminToken(res.json.token, JWT_SECRET, T0);
  assert.deepEqual(claims, { sub: ADMIN_EMAILS.admin, role: "admin" });
  const [h, p] = (res.json.token as string).split(".");
  assert.equal(JSON.parse(Buffer.from(h!, "base64url").toString()).alg, "HS256");
  const payload = JSON.parse(Buffer.from(p!, "base64url").toString());
  assert.equal(payload.typ, ADMIN_JWT_TYP);
  assert.equal(payload.exp - payload.iat, 8 * 3600);
  assert.equal(ADMIN_TOKEN_TTL_SEC, 8 * 3600);
  assert.deepEqual(Object.keys(payload).sort(), ["exp", "iat", "role", "sub", "typ"]);
  // and the token works on a real route
  const me = await w.call("GET", `${ADMIN_PATH}me`, { token: res.json.token });
  assert.equal(me.status, 200);
  assert.equal(me.json.email, ADMIN_EMAILS.admin);
});

test("VA4: a wrong password and an unknown e-mail get the identical generic 401 (same status, headers and body)", async () => {
  const w = await adminWorld();
  const wrong = await login(w, ADMIN_EMAILS.admin, "not-the-password-at-all");
  const unknown = await login(w, "nobody@vc.test", "not-the-password-at-all");
  const malformed = await login(w, "not an email", PASSWORD);
  const key = (r: { status: number; headers: Record<string, string>; body: string }) => JSON.stringify([r.status, Object.entries(r.headers).sort(), r.body]);
  assert.equal(wrong.status, 401);
  assert.equal(key(wrong), key(unknown));
  assert.equal(key(wrong), key(malformed));
  assert.ok(!wrong.body.includes(ADMIN_EMAILS.admin), "the body does not echo the e-mail");
});

test("VA4: a disabled admin cannot sign in with the right password, and a token issued before the disable is refused on every route", async () => {
  const w = await adminWorld();
  const tokenBefore = await w.token("admin");
  assert.equal((await w.call("GET", `${ADMIN_PATH}me`, { token: tokenBefore })).status, 200);
  assert.equal(await w.store.users.disable(ADMIN_EMAILS.admin), true);
  assert.equal((await login(w, ADMIN_EMAILS.admin, PASSWORD)).status, 401);
  for (const path of ["me", "sites", "sources", "audit"]) assert.equal((await w.call("GET", `${ADMIN_PATH}${path}`, { token: tokenBefore })).status, 401, path);
});

test("VA4: the role in the database wins over the role inside an older token, so a demotion applies at once", async () => {
  const w = await adminWorld();
  const superToken = await w.token("super-admin");
  assert.equal((await w.call("GET", `${ADMIN_PATH}admins`, { token: superToken })).status, 200);
  await w.store.users.setRole(ADMIN_EMAILS["super-admin"], "viewer");
  assert.equal((await w.call("GET", `${ADMIN_PATH}admins`, { token: superToken })).status, 403);
});

test("VA4: tokens that are expired, alg none, signed with another secret, missing typ, or are voice tickets / student JWTs are refused with 401 on every GET route", async () => {
  const w = await adminWorld();
  const good = await signAdminToken({ sub: ADMIN_EMAILS["super-admin"], role: "super-admin" }, JWT_SECRET, T0);
  // time moves to the exact expiry: refused; one second earlier it still works
  w.clock.ms = T0 + 8 * 3600 * 1000 - 1000;
  assert.equal((await w.call("GET", `${ADMIN_PATH}me`, { token: good.token })).status, 200);
  w.clock.ms = T0 + 8 * 3600 * 1000;
  assert.equal((await w.call("GET", `${ADMIN_PATH}me`, { token: good.token })).status, 401, "expired");
  w.clock.ms = T0;

  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const iat = Math.floor(T0 / 1000);
  const sub = ADMIN_EMAILS["super-admin"];
  const algNone = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub, role: "super-admin", typ: ADMIN_JWT_TYP, iat, exp: iat + 3600 })}.`;
  const wrongSecret = (await signAdminToken({ sub, role: "super-admin" }, new TextEncoder().encode("another-secret-".padEnd(48, "z")), T0)).token;
  const sign = (claims: Record<string, unknown>) => new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuedAt(iat).setExpirationTime(iat + 3600).sign(JWT_SECRET);
  const noTyp = await sign({ role: "super-admin" });
  const wrongTyp = await sign({ role: "super-admin", typ: "vc-student" });
  const who = { tenantId: "pathlynks", studentId: "student-1", minor: false, guardianConsent: true } as never;
  // The voice-ticket signing key here IS the admin secret: only the missing typ claim stands between these tokens and the admin API.
  const voiceTicket = (await mintVoiceToken(JWT_SECRET, who, "thread-1", T0)).token;
  const anonTicket = (await mintAnonymousVoiceToken(JWT_SECRET, "pathlynks", "https://pathlynks.example", "ck", T0)).token;
  const studentJwt = await new SignJWT({ tenant: "pathlynks", studentId: "student-1", role: "student" }).setProtectedHeader({ alg: "HS256" }).setIssuer("x").setIssuedAt(iat).setExpirationTime(iat + 3600).sign(JWT_SECRET);
  const counsellorJwt = await new SignJWT({ tenant: "pathlynks", counsellorId: "c-1", role: "admin" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuedAt(iat).setExpirationTime(iat + 3600).sign(JWT_SECRET);
  const cases: Record<string, string> = { algNone, wrongSecret, noTyp, wrongTyp, voiceTicket, anonTicket, studentJwt, counsellorJwt, garbage: "not.a.jwt", empty: "" };
  for (const [name, token] of Object.entries(cases)) {
    for (const path of ["me", "admins", "sites", "sources", "metrics?from=2026-10-01&to=2026-10-02", "audit"]) {
      const res = await w.call("GET", `${ADMIN_PATH}${path}`, token === "" ? {} : { token });
      assert.equal(res.status, 401, `${name} on ${path}`);
    }
    // and on a write route, with no audit row (no actor to record)
    const before = w.auditRows().length;
    const res = await w.call("POST", `${ADMIN_PATH}sites`, { ...(token === "" ? {} : { token }), body: { name: "X Site" } });
    assert.equal(res.status, 401, `${name} on POST sites`);
    assert.equal(w.auditRows().length, before, `${name}: no audit row for an unauthenticated call`);
  }
  assert.ok(JWT_SECRET_TEXT.length >= 32);
});

test("VA4: the 6th login within a minute from one client gets 429 with Retry-After, whatever e-mail it uses and even with the correct password", async () => {
  const w = await adminWorld();
  for (let i = 0; i < 5; i++) assert.equal((await login(w, `user${i}@vc.test`, "wrong-password-xyz")).status, 401, `attempt ${i + 1}`);
  const sixth = await login(w, ADMIN_EMAILS["super-admin"], PASSWORD);
  assert.equal(sixth.status, 429);
  assert.ok(Number(sixth.headers["retry-after"]) >= 1 && Number(sixth.headers["retry-after"]) <= 60);
  assert.equal(sixth.json.token, undefined);
  // another client address has its own budget
  assert.equal((await login(w, ADMIN_EMAILS["super-admin"], PASSWORD, "198.51.100.99")).status, 200);
  // the window passes: the first client may try again
  w.clock.ms = T0 + 61_000;
  assert.equal((await login(w, ADMIN_EMAILS["super-admin"], PASSWORD)).status, 200);
});

test("VA4: five SUCCESSFUL logins use the whole budget as well: the 6th is 429 even though every one before it was correct", async () => {
  const w = await adminWorld();
  for (let i = 0; i < 5; i++) assert.equal((await login(w, ADMIN_EMAILS.viewer, PASSWORD)).status, 200);
  assert.equal((await login(w, ADMIN_EMAILS.viewer, PASSWORD)).status, 429);
});

test("VA4: the login limiter keys on the nginx X-Real-IP client key, not on one shared bucket", async () => {
  const w = await adminWorld();
  for (let i = 0; i < 5; i++) await login(w, "x@vc.test", "wrong-password-xyz", "203.0.113.1");
  assert.equal((await login(w, "x@vc.test", "wrong-password-xyz", "203.0.113.1")).status, 429);
  assert.equal((await login(w, "x@vc.test", "wrong-password-xyz", "203.0.113.2")).status, 401);
});

test("VA4: passwords are scrypt N=2^15 r=8 p=1 with a fresh 16-byte salt, verified in constant time, and a malformed stored hash just answers false", async () => {
  const hash = await passwordHash();
  const parts = hash.split("$");
  assert.deepEqual(parts.slice(0, 4), ["scrypt", String(1 << 15), "8", "1"]);
  assert.equal(SCRYPT_N, 32768);
  assert.equal(Buffer.from(parts[4]!, "base64url").length, 16);
  assert.equal(Buffer.from(parts[5]!, "base64url").length, 32);
  const other = await hashPassword(PASSWORD);
  assert.notEqual(hash, other, "a fresh salt per hash");
  assert.equal(await verifyPassword(PASSWORD, hash), true);
  assert.equal(await verifyPassword(PASSWORD + "x", hash), false);
  assert.equal(await verifyPassword("", hash), false);
  for (const bad of ["", "plain", "scrypt$1$1$1$AA$AA", `scrypt$${1 << 20}$8$1$${parts[4]}$${parts[5]}`, `bcrypt$${parts.slice(1).join("$")}`, undefined, 12]) {
    assert.equal(await verifyPassword(PASSWORD, bad), false, String(bad));
  }
  // static: the module's hashing is scrypt + timingSafeEqual and nothing else
  const src = readFileSync(fileURLToPath(new URL("../src/admin-auth.ts", import.meta.url)), "utf8");
  assert.ok(/timingSafeEqual\(got, want\)/.test(src));
  assert.ok(!/createHmac|createHash/.test(src), "no hashing other than scrypt in admin-auth.ts");
});

test("VA4: a stored hash that asks for a huge cost (N=2^25) is refused without running it", async () => {
  const parts = (await passwordHash()).split("$");
  const t0 = Date.now();
  assert.equal(await verifyPassword(PASSWORD, `scrypt$${1 << 25}$8$1$${parts[4]}$${parts[5]}`), false);
  assert.ok(Date.now() - t0 < 5000);
});

// ---------------------------------------------------------------------------------------------------------------- CLI

function cliDeps(over: Partial<AdminCliDeps> & { passwords?: string[] } = {}) {
  const { passwords, ...rest } = over;
  const { fakeDb, db } = createFakeDb();
  const out: string[] = [];
  const err: string[] = [];
  const prompts: string[] = [];
  const queue = [...(passwords ?? [PASSWORD, PASSWORD])];
  const deps: AdminCliDeps = {
    store: createAdminStore(db),
    isTty: true,
    readPassword: async (p) => {
      prompts.push(p);
      return queue.shift() ?? "";
    },
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    ...rest,
  };
  return { deps, out, err, prompts, fakeDb, store: deps.store };
}

test("VA4 CLI: `admin create <email> --role super-admin` asks for the password on the terminal twice, stores only a scrypt hash, and prints nothing secret", async () => {
  const c = cliDeps();
  assert.equal(await runAdminCli(["create", "boss@vc.test", "--role", "super-admin"], c.deps), 0);
  assert.deepEqual(c.prompts, ["Password: ", "Repeat password: "]);
  const user = await c.store.users.findByEmail("boss@vc.test");
  assert.equal(user?.role, "super-admin");
  assert.equal(await verifyPassword(PASSWORD, user!.passwordHash), true);
  const everything = [...c.out, ...c.err].join("\n");
  assert.ok(!everything.includes(PASSWORD) && !everything.includes(user!.passwordHash), "stdout and stderr never contain the typed password or its hash");
  assert.ok(!JSON.stringify(c.fakeDb.collection("admin_users").all()).includes(PASSWORD), "the password is not stored");
});

test("VA4 CLI: a password on the command line is refused with usage exit 2, before any prompt, and is never echoed", async () => {
  const typed = "typed-on-argv-123456";
  for (const argv of [
    ["create", "a@vc.test", "--role", "admin", "--password", typed],
    ["create", "a@vc.test", "--role", "admin", `--password=${typed}`],
    ["create", "a@vc.test", "--role", "admin", "-p", typed],
    ["create", "a@vc.test", typed, "--role", "admin"],
  ]) {
    const c = cliDeps();
    assert.equal(await runAdminCli(argv, c.deps), 2, argv.join(" ").replace(typed, "<pw>"));
    assert.deepEqual(c.prompts, [], "no prompt was shown");
    assert.equal(await c.store.users.findByEmail("a@vc.test"), null, "nothing was created");
    assert.ok(![...c.out, ...c.err].join("\n").includes(typed), "the argv password is never echoed");
  }
});

test("VA4 CLI: with stdin not a terminal, a short password, mismatched repeats, a bad role or a duplicate e-mail, nothing wrong is created", async () => {
  const noTty = cliDeps({ isTty: false });
  assert.equal(await runAdminCli(["create", "a@vc.test", "--role", "admin"], noTty.deps), 2);
  assert.deepEqual(noTty.prompts, []);
  const short = cliDeps({ passwords: ["short", "short"] });
  assert.equal(await runAdminCli(["create", "a@vc.test", "--role", "admin"], short.deps), 1);
  assert.equal(await short.store.users.findByEmail("a@vc.test"), null);
  const differ = cliDeps({ passwords: [PASSWORD, PASSWORD + "x"] });
  assert.equal(await runAdminCli(["create", "a@vc.test", "--role", "admin"], differ.deps), 1);
  assert.equal(await differ.store.users.findByEmail("a@vc.test"), null);
  const badRole = cliDeps();
  assert.equal(await runAdminCli(["create", "a@vc.test", "--role", "root"], badRole.deps), 2);
  assert.equal(await runAdminCli(["create", "a@vc.test"], badRole.deps), 2);
  const dup = cliDeps({ passwords: [PASSWORD, PASSWORD, PASSWORD, PASSWORD] });
  assert.equal(await runAdminCli(["create", "a@vc.test", "--role", "viewer"], dup.deps), 0);
  assert.equal(await runAdminCli(["create", "A@vc.test", "--role", "super-admin"], dup.deps), 1);
  assert.equal((await dup.store.users.findByEmail("a@vc.test"))?.role, "viewer", "the existing admin was not changed");
});

// ---------------------------------------------------------------------------------------------------------------- fix cycle 1 (R5): the anonymous audit flood

test("fix1 R5: 50 failed logins for one e-mail from one client write one audit row; the 429-limited ones and malformed bodies write none", async () => {
  const w = await adminWorld();
  for (let i = 0; i < 50; i++) await login(w, "nobody@vc.test", "wrong-password-xyz");
  const failed = w.auditRows().filter((r) => r.action === "login");
  assert.equal(failed.length, 1, `rows: ${failed.length}`);
  assert.equal(failed[0]!.ok, false);
  // a malformed anonymous body from a fresh client is not a login attempt anyone can be blamed for
  const before = w.auditRows().length;
  const bad = await w.call("POST", `${ADMIN_PATH}login`, { headers: { "x-real-ip": "198.51.100.50" }, raw: "{not json" });
  assert.equal(bad.status, 400);
  assert.equal(w.auditRows().filter((r) => r.action === "login").length, before, "no row for a malformed anonymous body");
});

test("fix1 R5: 50 attempts rotating 50 e-mails from one client are cut off by the 5-per-minute limiter and leave at most 5 rows; a new window records a new failure; success is always audited", async () => {
  const w = await adminWorld();
  for (let i = 0; i < 50; i++) await login(w, `rot${i}@vc.test`, "wrong-password-xyz");
  assert.equal(w.auditRows().filter((r) => r.action === "login").length, 5);
  w.clock.ms = T0 + 61_000;
  await login(w, "rot0@vc.test", "wrong-password-xyz");
  await login(w, "rot0@vc.test", "wrong-password-xyz");
  assert.equal(w.auditRows().filter((r) => r.action === "login").length, 6, "one more row for the repeated pair in the new window");
  assert.equal((await login(w, ADMIN_EMAILS.admin, PASSWORD)).status, 200);
  const last = w.auditRows().filter((r) => r.action === "login").at(-1)!;
  assert.deepEqual([last.actorId, last.ok], [ADMIN_EMAILS.admin, true]);
});
