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
  credentialRefPatternFor,
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

test("VA3: the real config/sources.json parses: four Pathlynks GitHub branches + separate Pathlynks/Vidysea Postgres", () => {
  const f = loadSourcesFile(REAL);
  assert.equal(f.version, 1);
  const github = f.sources.filter((s) => s.kind === "github");
  const postgres = f.sources.filter((s) => s.kind === "postgres");
  assert.equal(github.length, 6); // four Pathlynks branches + vidysea-frontend (T-057) + vidysea-backend (tool-first T8)
  assert.deepEqual(new Set(github.map((s) => (s.kind === "github" ? s.service : ""))), new Set(["frontend", "auth", "school", "career", "other"]));
  assert.equal(postgres.length, 2);
  // wire-fix-1 (D-134): pin the exact set, not a count, so an added or dropped source fails by name.
  assert.deepEqual(f.sources.map((s) => `${s.kind}:${s.id}`).sort(), [
    "github:pathlynks-auth", "github:pathlynks-career", "github:pathlynks-frontend", "github:pathlynks-school", "github:vidysea-backend", "github:vidysea-frontend",
    "mongo:pathlynks-journey", "postgres:pathlynks-db", "postgres:vidysea-db",
  ]);
  assert.equal(postgres.find(s => s.platform === "vidysea")?.enabled, true); // t057-vidysea-db-enable: read-only Vidysea source on (D-122/D-123)
  const p = postgres[0]!;
  assert.ok(p.kind === "postgres" && p.tables.length > 0 && ["require", "verify-full"].includes(p.sslmode));
  assert.equal(new Set(f.sources.map((s) => s.id)).size, f.sources.length, "ids unique");
});

test("TF-T2: vidysea-db allow-lists exactly the tool-first read tables (no more) beside the original native set", () => {
  const f = loadSourcesFile(REAL);
  const vidysea = f.sources.find((s) => s.kind === "postgres" && s.platform === "vidysea");
  assert.ok(vidysea && vidysea.kind === "postgres");
  assert.deepEqual([...vidysea.tables].sort(), [
    "ai_profile_assessments", "applications", "journey_phases", "milestones", "pathlynks_student_snapshot", "saved_scholarships",
    "student_shortlisted_courses", "students", "user_course_journey_map", "user_favourites", "users", "visa_applications",
  ]);
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
  for (const good of ["GITHUB_TOKEN", "GITHUB_TOKEN_2"]) assert.equal(SourceConfig.safeParse({ ...gh, tokenRef: good }).success, true, good);
  for (const good of ["PATHLYNKS_DB_PASSWORD", "PATHLYNKS_DB_PASSWORD_2"]) assert.equal(SourceConfig.safeParse({ ...pg, passwordRef: good }).success, true, good);
  assert.equal(CREDENTIAL_REF_PATTERN.test("VC_ADMIN_MASTER_KEY"), false);
});

test("fix2 F1: a github source naming PATHLYNKS_DB_PASSWORD as its tokenRef (the DB password sent to GitHub as a bearer) is refused; a postgres source naming GITHUB_TOKEN is refused", () => {
  for (const bad of ["PATHLYNKS_DB_PASSWORD", "PATHLYNKS_TOKEN"]) assert.equal(SourceConfig.safeParse({ ...gh, tokenRef: bad }).success, false, `github tokenRef ${bad}`);
  for (const bad of ["GITHUB_TOKEN", "GITHUB_DB_PASSWORD"]) assert.equal(SourceConfig.safeParse({ ...pg, passwordRef: bad }).success, false, `postgres passwordRef ${bad}`);
  assert.equal(credentialRefPatternFor("github").test("PATHLYNKS_DB_PASSWORD"), false);
  assert.equal(credentialRefPatternFor("postgres").test("GITHUB_TOKEN"), false);
  assert.equal(credentialRefPatternFor("github").test("GITHUB_TOKEN"), true);
  assert.equal(credentialRefPatternFor("postgres").test("PATHLYNKS_DB_PASSWORD"), true);
});

// S12: paired explicit platform/site metadata extends version1 without changing legacy meaning.
test("S12 sources: legacy version1 and both-site metadata remain compatible and separated", () => {
  const vidysea = { ...pg, id: "vidysea-db", platform: "vidysea", siteId: "vidysea", passwordRef: "VIDYSEA_DB_PASSWORD", enabled: false };
  assert.equal(parseSourcesFile(file([pg])).siteId, "pathlynks");
  const mixed = parseSourcesFile(file([pg, vidysea]));
  assert.equal(mixed.sources.length, 2);
  assert.equal(mixed.sources[1]!.siteId, "vidysea");
  assert.equal(mixed.sources[1]!.platform, "vidysea");
  for (const bad of [{ ...vidysea, passwordRef: "PATHLYNKS_DB_PASSWORD" }, { ...pg, passwordRef: "VIDYSEA_DB_PASSWORD" }, { ...vidysea, siteId: undefined }, { ...vidysea, platform: undefined }]) assert.equal(SourceConfig.safeParse(bad).success, false);
  assert.equal(credentialRefPatternFor("postgres", "vidysea").test("VIDYSEA_DB_PASSWORD"), true);
  assert.equal(credentialRefPatternFor("postgres", "vidysea").test("VIDYSEA_ADMIN_SECRET"), false);
});

test("S12 source env binding requires exact site/kind/id/destination and never crosses platforms", async () => {
  const { boundSourceCredentialRef } = await import("../src/sources.js");
  const seed = SourceConfig.parse({ ...pg, id: "vidysea-db", siteId: "vidysea", platform: "vidysea", passwordRef: "VIDYSEA_DB_PASSWORD" });
  const { id, kind, siteId, ...config } = seed;
  const stored = { id, kind, siteId: siteId!, config };
  assert.equal(boundSourceCredentialRef(stored, [seed], "pathlynks"), "VIDYSEA_DB_PASSWORD");
  for (const changed of [{ ...stored, siteId: "pathlynks" }, { ...stored, id: "other-db" }, { ...stored, kind: "github" }, { ...stored, config: { ...config, host: "attacker.invalid" } }, { ...stored, config: { ...config, platform: "pathlynks" } }, { ...stored, config: { ...config, passwordRef: "PATHLYNKS_DB_PASSWORD" } }]) assert.equal(boundSourceCredentialRef(changed, [seed], "pathlynks"), undefined);
  assert.equal(boundSourceCredentialRef(stored, undefined, "pathlynks"), undefined);
  assert.equal(boundSourceCredentialRef(stored, [{ ...seed, enabled: false }], "pathlynks"), undefined);
  assert.equal(boundSourceCredentialRef({ ...stored, config: { ...config, enabled: false } }, [seed], "pathlynks"), undefined);
});


test("S12 tenant selector refuses unknown/ambiguous/disabled without bootstrap fallback", async () => {
  const { postgresSourceForTenant } = await import("../src/sources.js");
  const vidysea = { ...pg, id: "vidysea-db", siteId: "vidysea", platform: "vidysea", passwordRef: "VIDYSEA_DB_PASSWORD" };
  const mixed = parseSourcesFile(file([pg, vidysea]));
  assert.equal(postgresSourceForTenant(mixed, "pathlynks")?.id, "pl-db");
  assert.equal(postgresSourceForTenant(mixed, "vidysea")?.id, "vidysea-db");
  assert.equal(postgresSourceForTenant(mixed, "unknown"), undefined);
  assert.equal(postgresSourceForTenant(mixed, ""), undefined);
  assert.equal(postgresSourceForTenant(parseSourcesFile(file([pg, { ...vidysea, enabled: false }])), "vidysea"), undefined);
  assert.equal(postgresSourceForTenant(parseSourcesFile(file([pg, vidysea, { ...vidysea, id: "vidysea-other" }])), "vidysea"), undefined);
});


// ---------------------------------------------------------------------------------------------------------------- wire-fix-1 (D-134): the "mongo" source kind
const mongo = { kind: "mongo", id: "pathlynks-journey", siteId: "pathlynks", platform: "pathlynks", enabled: true, database: "pathlynks_journey", collections: ["pathlynks_quest_profiles", "pathlynks_goals"], urlRef: "MONGODB_URL" };

test("wire-fix-1: the real config holds the pathlynks-journey mongo source with exactly the four quest collections", () => {
  const f = loadSourcesFile(REAL);
  const m = f.sources.find((s) => s.kind === "mongo");
  assert.ok(m && m.kind === "mongo");
  assert.equal(m.id, "pathlynks-journey");
  assert.equal(m.enabled, true);
  assert.equal(m.database, "pathlynks_journey");
  assert.deepEqual([...m.collections].sort(), ["pathlynks_activities", "pathlynks_goals", "pathlynks_quest_profiles", "pathlynks_skill_activities"]);
  assert.equal(f.sources.filter((s) => s.kind === "mongo").length, 1);
});

test("wire-fix-1: a mongo source parses with an allow-list and an env NAME; secrets, unknown keys, odd collection names and a foreign env ref are refused", () => {
  assert.equal(SourceConfig.safeParse(mongo).success, true);
  assert.equal(SourceConfig.safeParse({ ...mongo, urlRef: undefined }).success, true, "urlRef is optional");
  for (const bad of [
    { ...mongo, collections: [] },
    { ...mongo, collections: ["$cmd"] },
    { ...mongo, collections: ["system.users"] },
    { ...mongo, collections: ["a/b"] },
    { ...mongo, database: "a b" },
    { ...mongo, database: undefined },
    { ...mongo, urlRef: "VC_ADMIN_MASTER_KEY" },
    { ...mongo, urlRef: "mongodb://u:p@h/db" },
    { ...mongo, url: "mongodb://h/db" },
    { ...mongo, host: "h" },
    { ...mongo, siteId: undefined },
  ]) assert.equal(SourceConfig.safeParse(bad).success, false, JSON.stringify(bad));
  rejects(file([{ ...mongo, uri: "mongodb://user:dummy-pass@host.invalid/db" }]), /secret-like/);
  assert.deepEqual(findSecretLikeFields(mongo), []);
  assert.equal(parseSourcesFile(file([gh, pg, mongo])).sources.length, 3);
});

test("wire-fix-1: no env credential is ever bound to a mongo source (boundSourceCredentialRef) and postgresSourceForTenant ignores it", async () => {
  const { boundSourceCredentialRef, postgresSourceForTenant } = await import("../src/sources.js");
  const seed = SourceConfig.parse(mongo);
  const { id, kind, siteId, ...config } = seed;
  assert.equal(boundSourceCredentialRef({ id, kind, siteId: siteId!, config }, [seed], "pathlynks"), undefined);
  assert.equal(postgresSourceForTenant(parseSourcesFile(file([mongo])), "pathlynks"), undefined);
});

test("wire-fix-1: mongoSourceForTenant picks the one enabled mongo source of the verified tenant, never a fallback", async () => {
  const { mongoSourceForTenant } = await import("../src/sources.js");
  const f = parseSourcesFile(file([pg, mongo]));
  assert.equal(mongoSourceForTenant(f, "pathlynks")?.id, "pathlynks-journey");
  assert.equal(mongoSourceForTenant(f, "vidysea"), undefined);
  assert.equal(mongoSourceForTenant(f, ""), undefined);
  assert.equal(mongoSourceForTenant(parseSourcesFile(file([{ ...mongo, enabled: false }])), "pathlynks"), undefined);
  assert.equal(mongoSourceForTenant(parseSourcesFile(file([mongo, { ...mongo, id: "second" }])), "pathlynks"), undefined, "ambiguous = none");
});
