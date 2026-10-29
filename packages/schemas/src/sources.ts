/**
 * vc-admin-control S1 (VA3): the knowledge-source config, `config/sources.json`.
 *
 * The file holds NON-secret fields and environment-variable NAMES only (`passwordRef`, `tokenRef`).
 * A secret value never belongs here: `loadSourcesFile` refuses any field named like a secret that
 * holds a value, any `*Ref` that is not an env-name shape, and any string carrying credentials
 * (connection string with userinfo, private key block, JWT, GitHub token prefix). Error messages name
 * the PATH of the offending field, never its value.
 *
 * Client-safe: no static node import (the barrel is imported by apps/web); the file read in
 * `loadSourcesFile` goes through `process.getBuiltinModule`, so a browser bundle never resolves `fs`.
 */
import { z } from "zod";

/** An environment variable NAME: UPPER_SNAKE_CASE, never a value. */
export const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/**
 * Source credential names are limited to Pathlynks, GitHub or explicitly bound Vidysea database refs. A name such as VC_ADMIN_MASTER_KEY, VC_ADMIN_JWT_SECRET or
 * MONGODB_URL would turn "Test connection" into a way to send a server secret to a host the admin chose (vc-admin-control fix cycle 1, R1).
 */
export const CREDENTIAL_REF_PATTERN = /^(PATHLYNKS|GITHUB)_[A-Z0-9_]+$|^VIDYSEA_DB_[A-Z0-9_]+$/;

/**
 * The ref prefix is bound to the source kind (fix cycle 2, F1): a github `tokenRef` names only GITHUB_*, a postgres `passwordRef` only PATHLYNKS_* or explicitly selected VIDYSEA_DB_*,
 * so the database password can never be sent to GitHub as a bearer token (or a GitHub token to a database host).
 */
export const GITHUB_REF_PATTERN = /^GITHUB_[A-Z0-9_]+$/;
export const PATHLYNKS_REF_PATTERN = /^PATHLYNKS_[A-Z0-9_]+$/;
export const VIDYSEA_REF_PATTERN = /^VIDYSEA_DB_[A-Z0-9_]+$/;
export type PlatformKind = "pathlynks" | "vidysea";
export function credentialRefPatternFor(kind: "github" | "postgres", platform: PlatformKind = "pathlynks"): RegExp {
  return kind === "github" ? GITHUB_REF_PATTERN : platform === "vidysea" ? VIDYSEA_REF_PATTERN : PATHLYNKS_REF_PATTERN;
}

const envName = (kind: "github" | "postgres") =>
  z
    .string()
    .regex(ENV_NAME_PATTERN, "must be an environment variable NAME (UPPER_SNAKE_CASE)")
    .regex(credentialRefPatternFor(kind), kind === "github" ? "must name a GITHUB_* environment variable" : "must name a PATHLYNKS_* environment variable");
const SourceId = z.string().regex(/^[a-z0-9][a-z0-9_-]{1,63}$/, "source id: lowercase letters, digits, - and _");
const Identifier = z.string().regex(/^[A-Za-z0-9_.-]{1,63}$/);
const HostName = z.string().regex(/^[A-Za-z0-9]([A-Za-z0-9.-]{0,253}[A-Za-z0-9])?$/, "host name only (no scheme, userinfo or path)");
const TableName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,62}(\.[A-Za-z_][A-Za-z0-9_]{0,62})?$/);

export const GithubSourceConfig = z
  .object({
    kind: z.literal("github"),
    id: SourceId,
    siteId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/).optional(),
    platform: z.enum(["pathlynks", "vidysea"]).optional(),
    enabled: z.boolean().optional(),
    owner: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/),
    repo: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/),
    branch: z.string().regex(/^[A-Za-z0-9._/-]{1,200}$/).refine((b) => !b.includes(".."), "branch must not contain .."),
    service: z.enum(["frontend", "auth", "school", "career", "other"]),
    tokenRef: envName("github").optional(),
  })
  .strict();

export const PostgresSourceConfig = z
  .object({
    kind: z.literal("postgres"),
    id: SourceId,
    siteId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/).optional(),
    platform: z.enum(["pathlynks", "vidysea"]).optional(),
    enabled: z.boolean().optional(),
    host: HostName,
    port: z.number().int().min(1).max(65535),
    database: Identifier,
    user: Identifier,
    sslmode: z.enum(["require", "verify-full"]),
    passwordRef: z.string().regex(ENV_NAME_PATTERN).regex(/^(PATHLYNKS_[A-Z0-9_]+|VIDYSEA_DB_[A-Z0-9_]+)$/),
    tables: z.array(TableName).min(1),
  })
  .strict();

/**
 * wire-fix-1 (D-134): a read-only Mongo source (the Career Quest database `pathlynks_journey`). It names a database and a closed collection allow-list, never a
 * host or a URL: the connection is the server's own MONGODB_URL, so a source entry cannot point a credential at another host. `urlRef` is optional and, if
 * present, can only be the literal env NAME `MONGODB_URL` (no value ever lives here). Whether a database may be opened at all is decided again, in code, by the
 * allow-list in @vc/db (`openReadOnlyDb`); this schema is not the only gate.
 */
const MongoCollectionName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,62}$/, "collection name: letters, digits and _ only (no $, no dots, so no system.* or $cmd)");
export const MongoSourceConfig = z
  .object({
    kind: z.literal("mongo"),
    id: SourceId,
    siteId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/).optional(),
    platform: z.enum(["pathlynks", "vidysea"]).optional(),
    enabled: z.boolean().optional(),
    database: Identifier,
    collections: z.array(MongoCollectionName).min(1).max(32),
    urlRef: z.string().regex(ENV_NAME_PATTERN).regex(/^MONGODB_URL$/, "must name MONGODB_URL").optional(),
  })
  .strict();

export const SourceConfig = z.discriminatedUnion("kind", [GithubSourceConfig, PostgresSourceConfig, MongoSourceConfig]).superRefine((source, ctx) => {
  if ((source.siteId === undefined) !== (source.platform === undefined)) ctx.addIssue({ code: "custom", path: ["platform"], message: "siteId and platform must be supplied together" });
  if (source.kind === "postgres" && !credentialRefPatternFor("postgres", source.platform).test(source.passwordRef)) ctx.addIssue({ code: "custom", path: ["passwordRef"], message: "credential ref must match platform" });
});
export type SourceConfig = z.infer<typeof SourceConfig>;

export const SourcesFile = z
  .object({
    version: z.literal(1),
    siteId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/),
    sources: z.array(SourceConfig),
  })
  .strict();
export type SourcesFile = z.infer<typeof SourcesFile>;

/** The caller supplies its already-authenticated tenant; there is no bootstrap-site fallback. */
export function postgresSourceForTenant(file: SourcesFile, verifiedTenant: string): Extract<SourceConfig, { kind: "postgres" }> | undefined {
  if (!verifiedTenant) return undefined;
  const matches = file.sources.filter((source): source is Extract<SourceConfig, { kind: "postgres" }> => source.kind === "postgres" && source.enabled !== false && (source.siteId ?? file.siteId) === verifiedTenant);
  return matches.length === 1 ? matches[0] : undefined;
}

/** The one enabled mongo source of the caller's already-authenticated tenant; none or several = undefined (no bootstrap fallback). */
export function mongoSourceForTenant(file: SourcesFile, verifiedTenant: string): Extract<SourceConfig, { kind: "mongo" }> | undefined {
  if (!verifiedTenant) return undefined;
  const matches = file.sources.filter((source): source is Extract<SourceConfig, { kind: "mongo" }> => source.kind === "mongo" && source.enabled !== false && (source.siteId ?? file.siteId) === verifiedTenant);
  return matches.length === 1 ? matches[0] : undefined;
}

/** Pure credential allow-list: trusted bootstrap identity, platform, site and destination must all match.
 * Call before reading env; encrypted credentials need the same identity binding on retarget in the store. */
export function boundSourceCredentialRef(
  source: { id: string; kind: string; siteId: string; config: Record<string, unknown> },
  seeded: readonly SourceConfig[] | undefined,
  defaultSiteId: string,
): string | undefined {
  const seed = seeded?.find(s => s.id === source.id);
  if (!seed || seed.enabled === false || source.config.enabled === false || seed.kind !== source.kind || source.siteId !== (seed.siteId ?? defaultSiteId)) return undefined;
  const c = source.config;
  if ((c.platform ?? "pathlynks") !== (seed.platform ?? "pathlynks")) return undefined;
  if (c.siteId !== undefined && c.siteId !== source.siteId) return undefined;
  const same = (key: string, value: unknown, fold = false) => fold && typeof c[key] === "string" && typeof value === "string" ? c[key].toLowerCase() === value.toLowerCase() : c[key] === value;
  if (seed.kind === "mongo") return undefined; // a mongo source carries no per-source credential: the server's own MONGODB_URL is used by code, never released by ref
  if (seed.kind === "postgres") {
    const matches = same("host", seed.host, true) && same("port", seed.port) && same("database", seed.database) && same("user", seed.user) && same("sslmode", seed.sslmode) && same("passwordRef", seed.passwordRef);
    return matches && credentialRefPatternFor("postgres", seed.platform).test(seed.passwordRef) ? seed.passwordRef : undefined;
  }
  return same("owner", seed.owner, true) && same("repo", seed.repo, true) && same("branch", seed.branch) && same("tokenRef", seed.tokenRef) && seed.tokenRef !== undefined && credentialRefPatternFor("github", seed.platform).test(seed.tokenRef) ? seed.tokenRef : undefined;
}


export class SourcesConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourcesConfigError";
  }
}

/** A key name that says "this holds a secret". A `...Ref` name holds an env NAME and is checked by the schema instead. */
const SECRET_KEY_NAME = /(password|passwd|secret|token|api_?key|master_?key|private_?key|credential)/i;
const REF_SUFFIX = /ref$/i;
/** `scheme://user:pass@host`: credentials embedded in a URL or connection string. */
const URL_WITH_CREDENTIALS = /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/;
const SECRET_LITERALS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]{2,}/,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
];

/** Paths (dotted, never values) of every field that looks like it holds a secret. Empty = clean. */
export function findSecretLikeFields(value: unknown, path = ""): string[] {
  const out: string[] = [];
  const at = (key: string) => (path === "" ? key : `${path}.${key}`);
  if (typeof value === "string") {
    if (URL_WITH_CREDENTIALS.test(value) || SECRET_LITERALS.some((re) => re.test(value))) out.push(path === "" ? "(root)" : path);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => out.push(...findSecretLikeFields(item, `${path}[${i}]`)));
    return out;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      const holdsValue = v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "");
      if (SECRET_KEY_NAME.test(key) && !REF_SUFFIX.test(key) && holdsValue) out.push(at(key));
      else out.push(...findSecretLikeFields(v, at(key)));
    }
  }
  return out;
}

/** Parses an already-decoded config; the pure twin of `loadSourcesFile`. Throws SourcesConfigError. */
export function parseSourcesFile(raw: unknown): SourcesFile {
  const secretPaths = findSecretLikeFields(raw);
  if (secretPaths.length > 0) {
    throw new SourcesConfigError(`sources config holds secret-like value(s) at: ${secretPaths.join(", ")} (use a *Ref env NAME instead)`);
  }
  const parsed = SourcesFile.safeParse(raw);
  if (!parsed.success) {
    // Path + issue code only: a zod message can quote the received value.
    const issues = parsed.error.issues.map((i) => {
      const keys = i.code === "unrecognized_keys" ? ` [${i.keys.join(", ")}]` : "";
      return `${i.path.join(".") || "(root)"}: ${i.code}${keys}`;
    });
    throw new SourcesConfigError(`sources config invalid: ${issues.join("; ")}`);
  }
  const ids = parsed.data.sources.map((s) => s.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup !== undefined) throw new SourcesConfigError(`sources config invalid: duplicate source id "${dup}"`);
  return parsed.data;
}

/** Reads and validates `config/sources.json` (or any path). Throws SourcesConfigError; never quotes a value. */
export function loadSourcesFile(path: string): SourcesFile {
  const fs = process.getBuiltinModule("node:fs");
  let text: string;
  try {
    text = fs.readFileSync(path, "utf8");
  } catch {
    throw new SourcesConfigError("sources config unreadable");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    throw new SourcesConfigError("sources config is not valid JSON");
  }
  return parseSourcesFile(raw);
}
