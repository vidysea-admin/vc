/**
 * vc-admin-control VA9 (and the VA8 / VA4 secret rules): a dummy secret, a dummy password, the master key and the JWT secret are put in, every route and
 * error path is walked, and the whole output surface is scanned: response bodies and headers, log lines, audit rows, and the fake Db. B13: dummy values only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ADMIN_PATH, JWT_SECRET_TEXT, MASTER_KEY, PASSWORD, adminWorld, fakeGithub, fakePostgres } from "./admin-fixtures.js";
import { adminRouteSignatures } from "../src/admin-routes.js";

const SOURCE_SECRET = "dummy-source-secret-ZXCV-0001";
const NEW_ADMIN_PASSWORD = "dummy-new-admin-password-0002";

test("VA9: no secret, password, hash, ciphertext, master key or JWT secret appears in any response, header, log, audit row (and the Db holds only ciphertext and hashes)", async () => {
  const w = await adminWorld({
    github: () => fakeGithub({}, { failWith: new Error(`boom ${SOURCE_SECRET}`) }),
    postgres: fakePostgres({ ok: false, cause: "connect_error" }),
  });
  const sup = await w.token("super-admin");
  const seen: string[] = [];
  const hit = async (method: string, path: string, opts: { token?: string; body?: unknown; raw?: string; headers?: Record<string, string> } = {}) => {
    const res = await w.call(method, ADMIN_PATH + path, opts);
    seen.push(res.body, JSON.stringify(res.headers));
    return res;
  };

  await hit("POST", "admins", { token: sup, body: { email: "leak@vc.test", password: NEW_ADMIN_PASSWORD, role: "viewer" } });
  await hit("POST", "admins", { token: sup, body: { email: "leak@vc.test", password: NEW_ADMIN_PASSWORD, role: "viewer" } });
  await hit("POST", "admins", { token: sup, body: { email: "short@vc.test", password: "short", role: "viewer" } });
  await hit("POST", "login", { body: { email: "leak@vc.test", password: NEW_ADMIN_PASSWORD } });
  await hit("POST", "login", { body: { email: "leak@vc.test", password: PASSWORD } });
  await hit("POST", "login", { raw: `{"email":"leak@vc.test","password":"${NEW_ADMIN_PASSWORD}"` });
  const site = await hit("POST", "sites", { token: sup, body: { name: "Leak Site", origins: ["https://leak.example"] } });
  await hit("POST", "sources", { token: sup, body: { kind: "github", id: "leak-gh", owner: "acme", repo: "backend", branch: "main", service: "school", tokenRef: "GITHUB_TOKEN" } });
  await hit("POST", "sources", { token: sup, body: { kind: "github", id: "leak-bad", owner: "acme", repo: "backend", branch: "main", service: "school", token: SOURCE_SECRET } });
  await hit("POST", "sources", { token: sup, body: { kind: "postgres", id: "leak-pg", host: "db.example", port: 5432, database: "app", user: "reader", sslmode: "require", passwordRef: "PATHLYNKS_DB_PASSWORD", tables: ["students"] } });
  await hit("PUT", "sources/leak-gh/secret", { token: sup, body: { secret: SOURCE_SECRET } });
  await hit("PUT", "sources/leak-pg/secret", { token: sup, body: { secret: SOURCE_SECRET } });
  await hit("PUT", "sources/leak-gh/secret", { token: sup, body: { secret: 5 } });
  await hit("POST", "sources/leak-gh/test", { token: sup, body: {} });
  await hit("POST", "sources/leak-pg/test", { token: sup, body: {} });
  await hit("POST", "sources/leak-gh/sync", { token: sup, body: {} });
  await hit("POST", "sites/leak-site/keys/rotate", { token: sup, body: { scope: "srv" } });
  for (const p of ["me", "admins", "sites", "sources", "audit", "metrics?from=2026-10-01T00:00:00.000Z&to=2026-10-02T00:00:00.000Z", "nope"]) await hit("GET", p, { token: sup });
  await hit("GET", "sources", { token: "not.a.token" });
  await hit("GET", "sources");

  const created = site.json.keys as { pub: string; srv: string };
  const rotatedOut = created.srv;
  const everything = seen.join("\n");
  const dbText = JSON.stringify(["admin_users", "sources", "source_artifacts", "audit_log", "turn_usage", "partners"].map((n) => w.fakeDb.collection(n).all()));
  const logText = JSON.stringify(w.logs);
  const auditText = JSON.stringify(w.auditRows());

  // Things that must be in NO output at all.
  for (const [label, value] of [
    ["source secret", SOURCE_SECRET],
    ["new admin password", NEW_ADMIN_PASSWORD],
    ["seed password", PASSWORD],
    ["master key", MASTER_KEY],
    ["JWT secret", JWT_SECRET_TEXT],
  ] as const) {
    assert.ok(!everything.includes(value), `${label} in a response`);
    assert.ok(!logText.includes(value), `${label} in a log`);
    assert.ok(!auditText.includes(value), `${label} in an audit row`);
    assert.ok(!dbText.includes(value), `${label} in the database`);
  }
  // Shapes that must never leave the server.
  assert.ok(!/scrypt\$/.test(everything), "a password hash in a response");
  assert.ok(!/passwordHash|secretEnc|"iv"|"tag"|"ct"/.test(everything), "a stored-field name in a response");
  assert.ok(!/scrypt\$/.test(logText + auditText));
  assert.ok(/scrypt\$/.test(dbText) && dbText.includes("secretEnc"), "the Db does hold hashes and ciphertext (the scan is not vacuous)");
  // A created key appears exactly once in all output: the creation response (and the rotate response for the new srv key).
  const occurrences = (needle: string) => everything.split(needle).length - 1;
  assert.equal(occurrences(created.pub), 1, "pub key shown once");
  assert.equal(occurrences(created.srv), 1, "the original srv key shown once");
  assert.ok(!logText.includes(created.pub) && !logText.includes(created.srv) && !auditText.includes(created.pub));
  assert.ok(!dbText.includes(created.pub) && !dbText.includes(rotatedOut), "partner keys are stored as HMACs only");
});

test("VA9: the secret route never answers the secret and the sources list says only hasSecret, for every role that may read it", async () => {
  const w = await adminWorld();
  await w.store.sources.upsert({ id: "gh-1", siteId: "pathlynks", kind: "github", config: { owner: "a", repo: "b", branch: "main", service: "school" } });
  await w.call("PUT", `${ADMIN_PATH}sources/gh-1/secret`, { token: await w.token("super-admin"), body: { secret: SOURCE_SECRET } });
  for (const role of ["viewer", "admin", "super-admin"] as const) {
    const list = await w.call("GET", `${ADMIN_PATH}sources`, { token: await w.token(role) });
    assert.ok(!list.body.includes(SOURCE_SECRET));
    assert.deepEqual(Object.keys(list.json.sources[0]).sort(), ["config", "hasSecret", "id", "kind", "siteId"]);
    // there is no GET for a secret: any attempt to read it is a 405 or 404, never a value
    for (const path of ["sources/gh-1/secret", "sources/gh-1"]) {
      const res = await w.call("GET", ADMIN_PATH + path, { token: await w.token(role) });
      assert.ok(res.status === 404 || res.status === 405, `${role} ${path} -> ${res.status}`);
      assert.ok(!res.body.includes(SOURCE_SECRET));
    }
  }
});

test("VA9 static: nothing outside the admin store calls readSecret, and the routes file never logs a request body or a thrown message", () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
  const routes = read("../src/admin-routes.ts");
  const calls = routes.match(/readSecret\(/g) ?? [];
  assert.equal(calls.length, 1, "readSecret is called once, in credentialFor");
  assert.ok(!/log\([^)]*(\.message|body|req\.)/.test(routes.replace(/\/\*[\s\S]*?\*\//g, "")), "log lines carry labels, never a message or a body");
  const sigs = adminRouteSignatures();
  assert.ok(!sigs.some((s) => /secret/.test(s) && s.startsWith("GET")), "no GET route for a secret");
});
