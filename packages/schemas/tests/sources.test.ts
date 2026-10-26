/**
 * vc-admin-control VA3 (S1): the sources config schema rejects secret values and the seeded
 * config/sources.json parses. Synthetic data only; every secret-looking value below is an obvious dummy.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CREDENTIAL_REF_PATTERN,
  SourceConfig,
  SourcesFile,
  SourcesConfigError,
  findSecretLikeFields,
  loadSourcesFile,
  parseSourcesFile,
} from "../src/sources.js";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
const REAL = join(repoRoot, "config", "sources.json");

const gh = { kind: "github", id: "pl-frontend", owner: "acme", repo: "web", branch: "main", service: "frontend" };
const pg = {
  kind: "postgres",
  id: "pl-db",
  host: "db.example.invalid",
  port: 5432,
  database: "app",
  user: "ro_user",
  sslmode: "require",
  passwordRef: "PATHLYNKS_DB_PASSWORD",
  tables: ["students"],
};
const file = (sources: unknown[], extra: Record<string, unknown> = {}) => ({ version: 1, siteId: "pathlynks", sources, ...extra });

function withFile(content: unknown, fn: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "vc-sources-"));
  try {
    const path = join(dir, "sources.json");
    writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
    fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const rejects = (content: unknown, match?: RegExp) =>
  withFile(content, (p) => assert.throws(() => loadSourcesFile(p), (e: unknown) => e instanceof SourcesConfigError && (match ? match.test(String((e as Error).message)) : true)));

test("VA3: the real config/sources.json parses: four Pathlynks GitHub branches + the Pathlynks Postgres", () => {
  const f = loadSourcesFile(REAL);
  assert.equal(f.version, 1);
  const github = f.sources.filter((s) => s.kind === "github");
  const postgres = f.sources.filter((s) => s.kind === "postgres");
  assert.equal(github.length, 4);
  assert.deepEqual(new Set(github.map((s) => (s.kind === "github" ? s.service : ""))), new Set(["frontend", "auth", "school", "career"]));
  assert.equal(postgres.length, 1);
  const p = postgres[0]!;
  assert.ok(p.kind === "postgres" && p.tables.length > 0 && ["require", "verify-full"].includes(p.sslmode));
  assert.equal(new Set(f.sources.map((s) => s.id)).size, f.sources.length, "ids unique");
});

test("VA3: the real config/sources.json holds env NAMES only (no secret-like field or value)", () => {
  assert.deepEqual(findSecretLikeFields(JSON.parse(readFileSync(REAL, "utf8"))), []);
});

test("VA3: SourceConfig / SourcesFile are strict (an unknown key is a parse failure)", () => {
  assert.equal(SourceConfig.safeParse(gh).success, true);
  assert.equal(SourceConfig.safeParse({ ...gh, extra: 1 }).success, false);
  assert.equal(SourceConfig.safeParse({ ...pg, extra: 1 }).success, false);
  assert.equal(SourcesFile.safeParse({ ...file([gh]), extra: 1 }).success, false);
  assert.equal(SourcesFile.safeParse(file([gh, pg])).success, true);
});

test("VA3 rejection: an unknown key", () => {
  rejects(file([{ ...gh, mystery: "x" }]));
  rejects({ ...file([gh]), mystery: "x" });
});

test("VA3 rejection: a field named password / secret / token (any case) holding a value; the value is never echoed", () => {
  const dummy = "test-secret-not-real";
  for (const key of ["password", "Password", "SECRET", "token", "Token", "passwd", "apiKey"]) {
    withFile(file([{ ...pg, [key]: dummy }]), (p) => {
      assert.throws(
        () => loadSourcesFile(p),
        (e: unknown) => e instanceof SourcesConfigError && !String((e as Error).message).includes(dummy) && /secret-like/.test((e as Error).message),
        key,
      );
    });
  }
  rejects(file([{ ...gh, token: dummy }]), /secret-like/);
  rejects(file([{ ...gh, nested: { password: dummy } }]), /secret-like/);
});

test("VA3 rejection: a passwordRef / tokenRef that is not an env-name shape", () => {
  for (const bad of ["hunter2-not-real", "lower_case", "9LEADING", "HAS SPACE", "", "a.b"]) {
    rejects(file([{ ...pg, passwordRef: bad }]));
    rejects(file([{ ...gh, tokenRef: bad }]));
  }
  assert.equal(SourceConfig.safeParse({ ...gh, tokenRef: "GITHUB_TOKEN" }).success, true);
});

test("VA3 rejection: a connection string with embedded credentials (any field, any scheme)", () => {
  rejects(file([{ ...pg, host: "postgres://user:dummy-pass-not-real@db.example.invalid:5432/app" }]));
  rejects(file([{ ...gh, repo: "https://user:dummy-pass-not-real@github.com/acme/web.git" }]));
  assert.deepEqual(findSecretLikeFields({ a: "postgresql://u:p@h/db" }), ["a"]);
  assert.deepEqual(findSecretLikeFields({ a: "postgresql://h/db" }), []);
});

test("VA3 rejection: a Postgres source with sslmode outside the enum", () => {
  for (const bad of ["disable", "prefer", "allow", "verify-ca", "", "REQUIRE"]) rejects(file([{ ...pg, sslmode: bad }]));
  rejects(file([{ ...pg, sslmode: undefined }]));
  for (const ok of ["require", "verify-full"]) assert.equal(SourceConfig.safeParse({ ...pg, sslmode: ok }).success, true);
});

test("VA3: tables must be non-empty; duplicate source ids, bad version and non-JSON are refused", () => {
  rejects(file([{ ...pg, tables: [] }]));
  rejects(file([gh, { ...gh }]), /duplicate/);
  rejects({ ...file([gh]), version: 2 });
  rejects("{ not json");
  assert.throws(() => loadSourcesFile(join(tmpdir(), "vc-sources-does-not-exist.json")), SourcesConfigError);
});

test("VA3: other secret-shaped literals are refused wherever they sit (private key block, JWT, GitHub token prefix)", () => {
  assert.deepEqual(findSecretLikeFields({ note: "-----BEGIN " + "PRIVATE KEY-----" }), ["note"]);
  assert.deepEqual(findSecretLikeFields({ note: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln" }), ["note"]);
  assert.deepEqual(findSecretLikeFields({ note: "ghp_" + "a".repeat(36) }), ["note"]);
  assert.deepEqual(findSecretLikeFields({ ok: "frontend", n: 5, t: ["a"] }), []);
});

test("VA3: parseSourcesFile is the pure twin of loadSourcesFile", () => {
  assert.equal(parseSourcesFile(file([gh, pg])).sources.length, 2);
  assert.throws(() => parseSourcesFile(file([{ ...gh, password: "test-secret-not-real" }])), SourcesConfigError);
});

test("VA3: .env.example lists every *Ref name found in config/sources.json with an empty value", () => {
  const f = loadSourcesFile(REAL);
  const refs = f.sources.flatMap((s) => (s.kind === "postgres" ? [s.passwordRef] : s.tokenRef ? [s.tokenRef] : []));
  assert.ok(refs.length >= 1, "sanity: the real config names at least one Ref");
  const lines = readFileSync(join(repoRoot, ".env.example"), "utf8").split(/\r?\n/);
  for (const name of new Set(refs)) {
    const line = lines.find((l) => l.startsWith(`${name}=`));
    assert.ok(line !== undefined, `${name} missing from .env.example`);
    assert.equal(line, `${name}=`, `${name} must have an empty value`);
  }
});

test("VA1 (config side): .env.example holds empty values for the admin secrets it names", () => {
  const lines = readFileSync(join(repoRoot, ".env.example"), "utf8").split(/\r?\n/);
  for (const name of ["VC_ADMIN_MASTER_KEY", "VC_ADMIN_JWT_SECRET", "PATHLYNKS_DB_PASSWORD", "GITHUB_TOKEN"]) {
    assert.ok(lines.includes(`${name}=`), `${name}= (empty) must be in .env.example`);
  }
});

test("fix1 R1: a source naming VC_ADMIN_MASTER_KEY, VC_ADMIN_JWT_SECRET or MONGODB_URL as its credential ref is refused; PATHLYNKS_* and GITHUB_* names pass", () => {
  for (const bad of ["VC_ADMIN_MASTER_KEY", "VC_ADMIN_JWT_SECRET", "MONGODB_URL", "PATHLYNKS", "GITHUBTOKEN", "pathlynks_db_password"]) {
    assert.equal(SourceConfig.safeParse({ ...gh, tokenRef: bad }).success, false, `tokenRef ${bad}`);
    assert.equal(SourceConfig.safeParse({ ...pg, passwordRef: bad }).success, false, `passwordRef ${bad}`);
  }
  for (const good of ["GITHUB_TOKEN", "GITHUB_TOKEN_2", "PATHLYNKS_DB_PASSWORD"]) {
    assert.equal(SourceConfig.safeParse({ ...gh, tokenRef: good }).success, true, good);
    assert.equal(SourceConfig.safeParse({ ...pg, passwordRef: good }).success, true, good);
  }
  assert.equal(CREDENTIAL_REF_PATTERN.test("VC_ADMIN_MASTER_KEY"), false);
});
