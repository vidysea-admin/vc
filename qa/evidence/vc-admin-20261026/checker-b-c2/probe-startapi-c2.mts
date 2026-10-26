// Checker B cycle 2: startApi-level proof that the index.ts wiring (seededSources) gives the seeded sources their env credential over real HTTP.
// Dummy values only. Imports repo files by file URL; lives outside any product tree.
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes } from "node:crypto";
const R = "file:///D:/vc/.worktrees/vca-int/";
const IDX: any = await import(R + "apps/api/src/index.ts");
const AUTH: any = await import(R + "apps/api/src/auth.ts");
const AA: any = await import(R + "apps/api/src/admin-auth.ts");
const AF: any = await import(R + "apps/api/tests/anonymous-fixtures.ts");
const DBT: any = await import(R + "packages/db/src/testing.ts");
const DB: any = await import(R + "packages/db/src/index.ts");
const SC: any = await import(R + "packages/schemas/src/index.ts");
const FX: any = await import(R + "apps/api/tests/admin-fixtures.ts");

const file = SC.loadSourcesFile("D:/vc/.worktrees/vca-int/config/sources.json");
const SENT = "sentinel-env-value-0xDEADBEEF";
const env: Record<string, string> = {
  MONGODB_URL: "mongodb://fake-host/ignored",
  VC_ADMIN_JWT_SECRET: "test-admin-jwt-secret-not-real-".padEnd(48, "j"),
  VC_ADMIN_MASTER_KEY: randomBytes(32).toString("base64"),
};
for (const s of file.sources) env[s.kind === "postgres" ? s.passwordRef : s.tokenRef] = SENT;

test("startApi: seeded pathlynks-db / repos get their env credential over HTTP; an admin-created clone at an attacker host gets none", async () => {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const PEM = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  const verifier = AUTH.createJwtVerifier(AUTH.jwtConfigFromEnv({ VC_JWT_ISSUER: "https://issuer.synthetic.test", VC_JWT_PUBLIC_KEY: PEM }));
  const fake = DBT.createFakeMongoClient();
  const fdb = fake.client.db(DB.VC_DB_NAME);
  await fdb.collection("admin_users").insertOne({ _id: "admin@vc.test", email: "admin@vc.test", passwordHash: await FX.passwordHash(), role: "admin", disabled: false, createdAt: new Date().toISOString() });
  const pgCalls: { host: unknown; pw: string | undefined }[] = [];
  const ghTokens: (string | undefined)[] = [];
  const logs: any[] = [];
  const api = await IDX.startApi(env, {
    clientFactory: () => fake.client,
    admin: {
      postgres: { async test(c: any, pw: string | undefined) { pgCalls.push({ host: c.host, pw }); return { ok: true }; } },
      github: (t: string | undefined) => { ghTokens.push(t); return FX.fakeGithub({ "migrations/1-a.js": "module.exports={up:async(q,S)=>{await q.createTable('t',{id:{type:S.INTEGER}})}}" }); },
      log: (l: any) => logs.push(l),
    },
    http: { port: 0, verifier, provider: AF.kbAnswerProvider(), skillsDir: AF.SKILLS_DIR },
  });
  try {
    const { token } = await AA.signAdminToken({ sub: "admin@vc.test", role: "admin" }, AA.adminJwtSecretFromEnv(env), Date.now());
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await fetch(`http://127.0.0.1:${api.port}/admin/api/${path}`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: res.status, text: await res.text() };
    };
    const list = await call("GET", "sources");
    console.log("sources list", list.status, (JSON.parse(list.text).sources ?? []).map((s: any) => s.id).join(","));
    const pg = file.sources.find((s: any) => s.kind === "postgres");
    const t = await call("POST", `sources/${pg.id}/test`, {});
    console.log("seeded pg test", t.status, t.text);
    assert.equal(pgCalls.at(-1)?.pw, SENT, "seeded pathlynks-db received its env password through startApi wiring");
    for (const g of file.sources.filter((s: any) => s.kind === "github")) {
      const n = ghTokens.length;
      const r = await call("POST", `sources/${g.id}/sync`, {});
      assert.equal(r.status, 200, `${g.id} ${r.text.slice(0, 120)}`);
      assert.equal(ghTokens.at(-1), SENT, `${g.id} got its token`);
      assert.ok(ghTokens.length > n);
    }
    const { kind, id, ...cfg } = pg;
    const before = pgCalls.length;
    const c = await call("POST", "sources", { ...cfg, kind: "postgres", id: "pg-clone", host: "attacker.example" });
    console.log("evil create", c.status);
    const e = await call("POST", "sources/pg-clone/test", {});
    console.log("evil test", e.status, e.text);
    assert.equal(pgCalls.length, before, "attacker host never contacted");
    assert.ok(!JSON.stringify(logs).includes(SENT));
  } finally {
    await api.stop();
  }
});
