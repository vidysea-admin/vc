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
 * The only env-var names a source may reference as its credential: a Pathlynks or GitHub one. A name such as VC_ADMIN_MASTER_KEY, VC_ADMIN_JWT_SECRET or
 * MONGODB_URL would turn "Test connection" into a way to send a server secret to a host the admin chose (vc-admin-control fix cycle 1, R1).
 */
export const CREDENTIAL_REF_PATTERN = /^(PATHLYNKS|GITHUB)_[A-Z0-9_]+$/;

const EnvName = z
  .string()
  .regex(ENV_NAME_PATTERN, "must be an environment variable NAME (UPPER_SNAKE_CASE)")
  .regex(CREDENTIAL_REF_PATTERN, "must name a PATHLYNKS_* or GITHUB_* environment variable");
const SourceId = z.string().regex(/^[a-z0-9][a-z0-9_-]{1,63}$/, "source id: lowercase letters, digits, - and _");
const Identifier = z.string().regex(/^[A-Za-z0-9_.-]{1,63}$/);
const HostName = z.string().regex(/^[A-Za-z0-9]([A-Za-z0-9.-]{0,253}[A-Za-z0-9])?$/, "host name only (no scheme, userinfo or path)");
const TableName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,62}(\.[A-Za-z_][A-Za-z0-9_]{0,62})?$/);

export const GithubSourceConfig = z
  .object({
    kind: z.literal("github"),
    id: SourceId,
    owner: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/),
    repo: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/),
    branch: z.string().regex(/^[A-Za-z0-9._/-]{1,200}$/).refine((b) => !b.includes(".."), "branch must not contain .."),
    service: z.enum(["frontend", "auth", "school", "career", "other"]),
    tokenRef: EnvName.optional(),
  })
  .strict();

export const PostgresSourceConfig = z
  .object({
    kind: z.literal("postgres"),
    id: SourceId,
    host: HostName,
    port: z.number().int().min(1).max(65535),
    database: Identifier,
    user: Identifier,
    sslmode: z.enum(["require", "verify-full"]),
    passwordRef: EnvName,
    tables: z.array(TableName).min(1),
  })
  .strict();

export const SourceConfig = z.discriminatedUnion("kind", [GithubSourceConfig, PostgresSourceConfig]);
export type SourceConfig = z.infer<typeof SourceConfig>;

export const SourcesFile = z
  .object({
    version: z.literal(1),
    siteId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/),
    sources: z.array(SourceConfig),
  })
  .strict();
export type SourcesFile = z.infer<typeof SourcesFile>;

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
