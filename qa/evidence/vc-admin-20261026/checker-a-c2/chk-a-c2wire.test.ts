/** Checker A cycle-2: the production wiring in apps/api/src/index.ts (seededSources spread) end to end over real HTTP through startApi. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { VC_DB_NAME } from "@vc/db";
import { createFakeMongoClient } from "@vc/db/testing";
import { createAdminStore } from "@vc/db";
import { startApi } from "../src/index.js";
import { createJwtVerifier, jwtConfigFromEnv } from "../src/auth.js";
import { hashPassword } from "../src/admin-auth.js";
import { kbAnswerProvider, SKILLS_DIR } from "./anonymous-fixtures.js";
import { fakeGithub } from "./admin-fixtures.js";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const verifier = createJwtVerifier(jwtConfigFromEnv({ VC_JWT_ISSUER: "https://issuer.synthetic.test", VC_JWT_PUBLIC_KEY: keys.publicKey.export({ type: "spki", format: "pem" }).toString() }));
const DB_PW = "WIRE-DB-PW-DUMMY-a1";
const GH = "WIRE-GH-TOKEN-DUMMY-b2";
const MASTER = randomBytes(32).toString("base64");

async function boot(sources: unknown) {
  const fake = createFakeMongoClient();
  const pgCalls: { host: unknown; password: string | undefined }[] = [];
  const ghTokens: (string | undefined)[] = [];
  const api = await startApi(
    { MONGODB_URL: "mongodb://fake-host/ignored", VC_ADMIN_JWT_SECRET: "x".repeat(48) + "-wire-test-not-real", VC_ADMIN_MASTER_KEY: MASTER, PATHLYNKS_DB_PASSWORD: DB_PW, GITHUB_TOKEN: GH },
    {
      clientFactory: () => fake.client,
      http: { port: 0, verifier, provider: kbAnswerProvider(), skillsDir: SKILLS_DIR } as never,
      admin: {
        sources: sources as never,
        postgres: { async test(c: Record<string, unknown>, p: string | undefined) { pgCalls.push({ host: c.host, password: p }); return { ok: false, cause: "connect_failed" }; } } as never,
        github: ((t: string | undefined) => { ghTokens.push(t); return fakeGithub({}); }) as never,
        log: () => undefined,
      },
    },
  );
  return { api, fake, pgCalls, ghTokens };
}
async function loginToken(b: Awaited<ReturnType<typeof boot>>) {
  const store = createAdminStore(b.fake.dbFor(VC_DB_NAME) as never, { masterKey: MASTER });
  await store.users.create({ email: "wire@vc.test", passwordHash: await hashPassword("wire-password-dummy-1"), role: "admin" });
  const r = await fetch(`http://127.0.0.1:${b.api.port}/admin/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "wire@vc.test", password: "wire-password-dummy-1" }) });
  const j = (await r.json()) as { token?: string };
  assert.equal(r.status, 200, JSON.stringify(j));
  return j.token!;
}
const post = (b: Awaited<ReturnType<typeof boot>>, token: string, path: string, body: unknown = {}) =>
  fetch(`http://127.0.0.1:${b.api.port}/admin/api/${path}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, text: await r.text() }));

test("C2-WIRE: through startApi, the seeded pathlynks-db and a seeded repo get their env credentials; an admin-created twin gets none", async () => {
  const sources = JSON.parse(JSON.stringify((await import("@vc/schemas")).loadSourcesFile(`${process.env.CHK_ROOT ?? "D:/vc/.worktrees/vca-int"}/config/sources.json`)));
  const b = await boot(sources);
  try {
    const token = await loginToken(b);
    const t = await post(b, token, "sources/pathlynks-db/test");
    const s = await post(b, token, "sources/pathlynks-school/sync");
    console.log("WIRE seeded test/sync:", t.status, t.text.slice(0, 120), "|", s.status, s.text.slice(0, 120));
    assert.deepEqual(b.pgCalls.map((c) => c.password), [DB_PW]);
    assert.deepEqual(b.ghTokens, [GH]);
    const pg = sources.sources.find((x: { kind: string }) => x.kind === "postgres");
    const { kind, id, ...rest } = pg;
    const c = await post(b, token, "sources", { kind, id: "wire-twin", ...rest });
    assert.equal(c.status, 201, c.text);
    const tt = await post(b, token, "sources/wire-twin/test");
    console.log("WIRE twin test:", tt.text.slice(0, 160));
    assert.equal(b.pgCalls.length, 1, "twin got no env password");
    // a dupe of the seeded id is refused
    assert.equal((await post(b, token, "sources", { kind, id: "pathlynks-db", ...rest, host: "attacker.example.com" })).status, 409);
  } finally {
    await b.api.stop();
  }
});

test("C2-WIRE-NOFILE: with no sources file nothing is seeded and no env credential is ever released", async () => {
  const b = await boot({ version: 1, siteId: "pathlynks", sources: [] });
  try {
    const token = await loginToken(b);
    const body = { kind: "postgres", id: "later-db", host: "db.example.org", port: 5432, database: "d", user: "u", sslmode: "require", passwordRef: "PATHLYNKS_DB_PASSWORD", tables: ["students"] };
    assert.equal((await post(b, token, "sources", body)).status, 201);
    await post(b, token, "sources/later-db/test");
    assert.equal(b.pgCalls.length, 0);
  } finally {
    await b.api.stop();
  }
});
