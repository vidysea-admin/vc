/**
 * vc-admin-control (spec S3, VA4-VA8, VA17): the admin API, mounted by `withAdminRoutes` in the startApi wrapper chain. Every route is under
 * `/admin/api/`:
 *
 *   POST login            GET me
 *   GET|POST admins       PATCH admins/:id                        (super-admin)
 *   GET|POST sites        PATCH sites/:id   POST sites/:id/keys/rotate   POST sites/:id/revoke   POST sites/:id/unrevoke
 *   GET|POST sources      PUT sources/:id/secret (super-admin)    POST sources/:id/test   POST sources/:id/sync
 *   GET metrics?from&to&siteId        GET audit
 *
 * Order for every request other than login: bearer token (HS256, typ "vc-admin", the user still exists and is not disabled; the STORED role is
 * used, so a demotion applies at once) -> role check (403) -> body validation (400) -> the handler. Each of those failures after authentication
 * writes one `audit_log` row with ok:false; a success writes one with ok:true; GETs write none. An unauthenticated request (no valid token) is
 * a 401 with no row: there is no actor to record. The one exception is login (contract VA6): EVERY login attempt writes exactly one row, success
 * (ok:true, the admin's e-mail) and failure alike, a wrong password, an unknown e-mail, a malformed body and a 429 rate-limited attempt included
 * (ok:false; the actor is the matched admin's e-mail or "unknown"). A row never holds the request body or the password.
 *
 * Secrets: no response carries a stored secret, a password hash or the master key. `hasSecret` is the only signal. A created or rotated API key is
 * in that one response and nowhere else. Error bodies are fixed codes; no exception text is ever copied into a response, a log line or an audit row.
 *
 * Credentials (fix cycle 2, F1): a source's credential is its own encrypted secret (set by a super-admin) or, ONLY for the exact connection seeded
 * from config/sources.json (same id, kind and host/port/database/user/sslmode, or owner/repo), the env var that seeded entry names. Any other source,
 * an admin-created one or a seeded doc whose connection fields were changed, never gets an env value: Test / Sync answer "no credential".
 *
 * Sites reuse partners.ts end to end (addPartner / rotatePartner / revokePartner / unrevokePartner / updatePartner / listPartners): there is no
 * second key format or key lookup (VA7). Admin password hashing and the JWT are in admin-auth.ts and are the only HMAC/scrypt use here.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { z } from "zod";

import {
  ADMIN_ROLES,
  AdminStoreError,
  SecretsError,
  aggregateMetrics,
  errorLabel,
  type AdminRole,
  type AdminStore,
  type AdminUserSummary,
  type SourceSummary,
} from "@vc/db";
import {
  GithubFetchError,
  STUDENT_HUB_FILES,
  applyServiceCopy,
  buildBackendKg,
  buildFrontendKg,
  fetchRepoFiles,
  parseNextAppRoutes,
  parseSequelizeMigrations,
  shouldKeepLastGood,
  type GithubPort,
  type KgSource,
  type RepoFile,
} from "@vc/engine";
import { SourceConfig, boundSourceCredentialRef, credentialRefPatternFor, findSecretLikeFields, type SourcesFile } from "@vc/schemas";
import { createPathlynksPort, createVidyseaPort, type VidyseaPort, type PathlynksEvent, type PathlynksResult as McpPathlynksResult } from "@vc/mcp-pathlynks";
import { studentKeyOf } from "@vc/db";
import type { StudentGraphDeps } from "@vc/engine";
import type { TurnUsageSink, UsageMeter } from "./chat.js";

import {
  ADMIN_TOKEN_TTL_SEC,
  burnPasswordCheck,
  createLoginLimiter,
  hashPassword,
  passwordPolicyError,
  signAdminToken,
  verifyAdminToken,
  verifyPassword,
} from "./admin-auth.js";
import { normalizeClientAddress } from "./anonymous.js";
import {
  PartnerConfigError,
  PartnerError,
  addPartner,
  listPartners,
  revokePartner,
  rotatePartner,
  unrevokePartner,
  updatePartner,
  parseMemoryPolicy,
  type KeyScope,
  type PartnerOpContext,
  type PartnerStore,
} from "./partners.js";
import { BodyTooLargeError, respond, type ApiHandler, type ApiRequest, type ApiResponse } from "./server.js";

/** The unscoped virtual_counsellor Db the admin store and the metrics aggregation take (the driver type is not imported here). */
export type AdminDb = Parameters<typeof aggregateMetrics>[0];

export const ADMIN_API_PREFIX = "/admin/api/";
const MAX_ADMIN_BODY_BYTES = 64 * 1024;
const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}$/;
const ADMIN_ID = /^[0-9a-f]{24}$/;
const ROLE_RANK: Record<AdminRole, number> = { viewer: 1, admin: 2, "super-admin": 3 };
const UNKNOWN_ACTOR = "unknown";
const NETWORK_TIMEOUT_MS = 60_000;

/** A source names a credential env var outside the PATHLYNKS_* / GITHUB_* allow-list; nothing was read from the environment. */
class CredentialRefError extends Error {
  constructor() {
    super("credential reference not allowed");
    this.name = "CredentialRefError";
  }
}
const CREDENTIAL_REF_REFUSED = "This source names a credential reference that is not allowed (only platform-bound PATHLYNKS_*, VIDYSEA_DB_* and GITHUB_* names are).";

/** The source names an env credential, but it is not the exact connection that credential was seeded for (and no encrypted secret is stored). */
class NoCredentialError extends Error {
  constructor() {
    super("no credential for this source");
    this.name = "NoCredentialError";
  }
}
const NO_CREDENTIAL = "No credential is set for this source. A super-admin can store one for it.";

type SeededSource = SourcesFile["sources"][number];

/**
 * The env var NAME a stored source may read, or undefined. Only the exact connection seeded from config/sources.json qualifies: the same id and kind,
 * the same ref, and the same host, port, database, user and sslmode (postgres) or owner and repo (github). Without a seeded list nothing qualifies.
 */
export function boundEnvRef(src: Pick<SourceSummary, 'id' | 'kind' | 'config'> & { siteId?: string }, seeded: readonly SeededSource[] | undefined, defaultSiteId = 'pathlynks'): string | undefined {
  return boundSourceCredentialRef({ ...src, siteId: src.siteId ?? defaultSiteId }, seeded, defaultSiteId);
}

/** What the Postgres test port answers. `cause` is one of a fixed set; the route maps it to a fixed sentence. */
export interface PostgresTestResult {
  ok: boolean;
  cause?: string;
}
export interface AdminPostgresPort {
  /** Connects with the source's non-secret config and the password, runs the read-only checks, disconnects. Never throws a driver message. */
  test(config: Record<string, unknown>, password: string | undefined, context?: { source: SourceSummary; seeded?: readonly SeededSource[]; defaultSiteId?: string }): Promise<PostgresTestResult>;
}

export interface AdminRoutesDeps {
  store: AdminStore;
  /** The unscoped virtual_counsellor Db (metrics read `turn_usage` through it). */
  db: AdminDb;
  partnerStore: PartnerStore;
  /** Pepper, reserved ids and own tenants as the CLI and the registry use them. Undefined when partner keys are off (site routes then answer 503). */
  partnerCtx?: PartnerOpContext;
  jwtSecret: Uint8Array;
  /** USD to INR for costPerStudentInr. Undefined = the store default. */
  usdInrRate?: number;
  nowMs?: () => number;
  /** The limiter key of a request (default: the normalised X-Real-IP). */
  clientKey?: (req: Pick<ApiRequest, "headers">) => string | undefined;
  /** Builds a GithubPort for one call from an optional token (the token never leaves the port). */
  github?: (token: string | undefined) => GithubPort;
  postgres?: AdminPostgresPort;
  /** Where `tokenRef` / `passwordRef` names are resolved when no encrypted secret is stored. */
  env?: Record<string, string | undefined>;
  /** The sources of config/sources.json: an env credential is released only to the exact connection seeded here (undefined = to none). */
  seededSources?: readonly SeededSource[];
  /** siteId for a source created without one (the config file's siteId). */
  defaultSiteId?: string;
  log?: (line: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------------------------------------------- helpers

/** An opaque, URL-safe id for an admin: the web proxy only forwards plain path segments, and an e-mail is not one. Deterministic, not secret. */
export function adminIdOf(email: string): string {
  return createHash("sha256").update(`vc-admin-id:v1\0${email}`).digest("hex").slice(0, 24);
}

const adminView = (u: AdminUserSummary) => ({ id: adminIdOf(u.email), email: u.email, role: u.role, disabled: u.disabled, createdAt: u.createdAt });

const bearerOf = (req: ApiRequest): string | undefined => {
  const raw = req.headers.authorization;
  const value = Array.isArray(raw) ? (raw.length === 1 ? raw[0] : undefined) : raw;
  if (typeof value !== "string") return undefined;
  const m = /^Bearer ([A-Za-z0-9._~+/=-]{1,4096})$/.exec(value);
  return m?.[1];
};

const defaultClientKey = (req: Pick<ApiRequest, "headers">): string | undefined => {
  const raw = req.headers["x-real-ip"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && value.trim() !== "" ? normalizeClientAddress(value) : undefined;
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error("failed"));
      },
    );
  });
}

const err = (status: number, code: string, extra: Record<string, string> = {}): Result => ({ res: respond(status, { error: code }, extra), ok: false });

/** What a route handler returns: the response, whether it counts as a success for the audit row, and the audit target. */
interface Result {
  res: ApiResponse;
  ok: boolean;
  /** The audit row's target: an id or a login name, never a secret or a body. */
  target?: string;
  /** The body carries a key shown exactly once: if the audit write then fails, the key is still returned (flagged), never lost. */
  oneTimeKey?: boolean;
}

interface Actor {
  email: string;
  role: AdminRole;
}

interface Ctx {
  req: ApiRequest;
  actor: Actor;
  segs: string[];
  url: URL;
  body: Record<string, unknown>;
}

interface RouteDef {
  /** "<METHOD> <pattern>" in the S3 spelling; the audit action is derived from `action`. */
  method: string;
  /** Path after /admin/api/ as segment patterns: "*" matches one id segment. */
  pattern: readonly string[];
  minRole: AdminRole;
  action: string;
  run(ctx: Ctx): Promise<Result>;
}

// ---------------------------------------------------------------------------------------------------------------- the mounted wrapper

export function withAdminRoutes(inner: ApiHandler, deps: AdminRoutesDeps | undefined): ApiHandler {
  const nowMs = deps?.nowMs ?? Date.now;
  const limiter = createLoginLimiter(nowMs);
  const clientKey = deps?.clientKey ?? defaultClientKey;
  const log = (line: Record<string, unknown>): void => {
    try {
      (deps?.log ?? ((l) => console.error(JSON.stringify(l))))(line);
    } catch {
      /* a logger must never break a request */
    }
  };

  const ROUTES: RouteDef[] = deps ? buildRoutes(deps, log) : [];

  async function audit(actorId: string, action: string, target: string, ok: boolean): Promise<boolean> {
    try {
      await deps!.store.audit.append({ actorId, action, target: target.slice(0, 200), ok, at: new Date(nowMs()).toISOString() });
      return true;
    } catch (e) {
      log({ level: "error", event: "admin_audit_failed", error: errorLabel(e) });
      return false;
    }
  }

  async function readJson(req: ApiRequest): Promise<Record<string, unknown> | "too_large" | "invalid"> {
    let raw: string;
    try {
      raw = await req.readBody(MAX_ADMIN_BODY_BYTES);
    } catch (e) {
      return e instanceof BodyTooLargeError ? "too_large" : "invalid";
    }
    if (raw.trim() === "") return {};
    try {
      const v: unknown = JSON.parse(raw);
      return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : "invalid";
    } catch {
      return "invalid";
    }
  }

  /** VA6: every failed login attempt is one ok:false row (never the body or the password). A failed audit write does not change the answer. */
  const auditFailedLogin = async (actor: string): Promise<void> => {
    await audit(actor, "login", "login", false);
  };

  async function login(req: ApiRequest): Promise<ApiResponse> {
    const d = deps!;
    const verdict = limiter.check(clientKey(req));
    if (!verdict.allowed) {
      await auditFailedLogin(UNKNOWN_ACTOR);
      return respond(429, { error: "rate_limited" }, { "retry-after": String(verdict.retryAfterSec) });
    }
    const body = await readJson(req);
    if (typeof body === "string") {
      await auditFailedLogin(UNKNOWN_ACTOR);
      return respond(body === "too_large" ? 413 : 400, { error: body === "too_large" ? "too_large" : "invalid_request" });
    }
    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";
    let user = null;
    try {
      user = email === "" ? null : await d.store.users.findByEmail(email);
    } catch (e) {
      if (!(e instanceof AdminStoreError)) throw e; // a malformed e-mail is just "no such user"
    }
    const good = user !== null && !user.disabled ? await verifyPassword(password, user.passwordHash) : await burnPasswordCheck(password);
    if (!good || user === null) {
      await auditFailedLogin(user?.email ?? UNKNOWN_ACTOR);
      return respond(401, { error: "invalid_credentials" });
    }
    const { token, exp } = await signAdminToken({ sub: user.email, role: user.role }, d.jwtSecret, nowMs());
    if (!(await audit(user.email, "login", "login", true))) return respond(500, { error: "audit_unavailable" });
    return respond(200, { token, role: user.role, email: user.email, expiresAt: new Date(exp * 1000).toISOString(), expiresInSec: ADMIN_TOKEN_TTL_SEC });
  }

  return async (req) => {
    let url: URL;
    try {
      url = new URL(req.url, "http://vc-api.invalid");
    } catch {
      return inner(req);
    }
    if (!url.pathname.startsWith(ADMIN_API_PREFIX)) return inner(req);
    if (!deps) return respond(503, { error: "admin_not_configured" });
    const method = req.method.toUpperCase();
    const segs = url.pathname.slice(ADMIN_API_PREFIX.length).split("/");
    if (segs.length > 6 || segs.some((s) => !SEGMENT.test(s))) return respond(404, { error: "not_found" });

    try {
      if (segs.length === 1 && segs[0] === "login") {
        if (method !== "POST") return respond(405, { error: "method_not_allowed" }, { allow: "POST" });
        return await login(req);
      }

      // Authenticate first, for every other path (known or not): an unauthenticated caller learns nothing about which routes exist.
      const token = bearerOf(req);
      const claims = token === undefined ? undefined : await verifyAdminToken(token, deps.jwtSecret, nowMs());
      let user = null;
      if (claims) {
        try {
          user = await deps.store.users.findByEmail(claims.sub);
        } catch (e) {
          if (!(e instanceof AdminStoreError)) throw e;
        }
      }
      if (!user || user.disabled) return respond(401, { error: "unauthorized" }, { "www-authenticate": 'Bearer realm="vc-admin"' });
      const actor: Actor = { email: user.email, role: user.role };

      const matching = ROUTES.filter((r) => matches(r.pattern, segs));
      if (matching.length === 0) return respond(404, { error: "not_found" });
      const route = matching.find((r) => r.method === method);
      if (!route) return respond(405, { error: "method_not_allowed" }, { allow: [...new Set(matching.map((r) => r.method))].join(", ") });

      const write = method !== "GET";
      const target = segs.length > 1 ? (segs[1] ?? route.action) : route.action;
      if (ROLE_RANK[actor.role] < ROLE_RANK[route.minRole] || (write && actor.role === "viewer")) {
        if (!(await audit(actor.email, route.action, target, false))) return respond(500, { error: "audit_unavailable" });
        return respond(403, { error: "forbidden" });
      }

      let body: Record<string, unknown> = {};
      if (write) {
        const parsed = await readJson(req);
        if (typeof parsed === "string") {
          if (!(await audit(actor.email, route.action, target, false))) return respond(500, { error: "audit_unavailable" });
          return respond(parsed === "too_large" ? 413 : 400, { error: parsed === "too_large" ? "too_large" : "invalid_request" });
        }
        body = parsed;
      }

      let result: Result;
      try {
        result = await route.run({ req, actor, segs, url, body });
      } catch (e) {
        result = mapError(e, log, route.action);
      }
      if (write && !(await audit(actor.email, route.action, result.target ?? target, result.ok))) {
        // The mutation already happened. A response that carries a one-time key must not turn into a 500 that loses it: return it, flagged and logged.
        if (result.ok && result.oneTimeKey) return unaudited(result.res);
        return respond(500, { error: "audit_unavailable" });
      }
      return result.res;
    } catch (e) {
      log({ level: "error", event: "admin_request_failed", route: segs[0] ?? "", error: errorLabel(e) });
      return respond(500, { error: "internal" });
    }
  };
}

/** The same response with `auditRecorded:false` added (the audit write failed after a mutation whose one-time key must still reach the admin). */
function unaudited(res: ApiResponse): ApiResponse {
  try {
    const body: unknown = JSON.parse(res.body);
    if (body !== null && typeof body === "object" && !Array.isArray(body)) return { ...res, body: JSON.stringify({ ...(body as Record<string, unknown>), auditRecorded: false }) };
  } catch {
    /* fall through */
  }
  return respond(500, { error: "audit_unavailable" });
}

/** "<METHOD> <path> <minRole>" for every route this module serves: the role-matrix test diffs its table against this list (VA5). */
export function adminRouteSignatures(): string[] {
  const noop = (): void => undefined;
  return buildRoutes({} as AdminRoutesDeps, noop).map((r) => `${r.method} ${r.pattern.join("/")} ${r.minRole}`).concat("POST login viewer");
}

function matches(pattern: readonly string[], segs: readonly string[]): boolean {
  return pattern.length === segs.length && pattern.every((p, i) => p === "*" || p === segs[i]);
}

/** Domain errors -> fixed status and code. Nothing from the error's message reaches the response. */
function mapError(e: unknown, log: (l: Record<string, unknown>) => void, action: string): Result {
  if (e instanceof PartnerError) {
    switch (e.code) {
      case "partner_exists":
      case "partner_revoked":
      case "rotated_concurrently":
        return err(409, e.code);
      case "partner_not_found":
        return err(404, e.code);
      default:
        return err(400, e.code);
    }
  }
  if (e instanceof PartnerConfigError) return err(503, "partners_not_configured");
  if (e instanceof AdminStoreError) {
    if (e.code === "exists") return err(409, "exists");
    if (e.code === "not_found") return err(404, "not_found");
    if (e.code === "range") return err(400, "range");
    return err(400, "invalid_request");
  }
  if (e instanceof SecretsError) return err(503, "secrets_not_configured");
  log({ level: "error", event: "admin_route_failed", route: action, error: errorLabel(e) });
  return err(500, "internal");
}

// ---------------------------------------------------------------------------------------------------------------- body helpers

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const strArray = (v: unknown): string[] | undefined => (Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : undefined);
const isScope = (v: unknown): v is KeyScope => v === "pub" || v === "srv";
const isRole = (v: unknown): v is AdminRole => typeof v === "string" && (ADMIN_ROLES as readonly string[]).includes(v);
const ok = (status: number, body: unknown, target?: string, extra: Partial<Result> = {}): Result => ({ res: respond(status, body), ok: true, ...(target === undefined ? {} : { target }), ...extra });

// ---------------------------------------------------------------------------------------------------------------- routes

function buildRoutes(d: AdminRoutesDeps, log: (l: Record<string, unknown>) => void): RouteDef[] {
  const nowMs = d.nowMs ?? Date.now;
  const partnersOrFail = (): PartnerOpContext | undefined => d.partnerCtx;
  const noPartners = (): Result => err(503, "partners_not_configured");
  const siteIdOf = (c: Ctx): string => c.segs[1]!;
  const sourceIdOf = (c: Ctx): string => c.segs[1]!;
  const partnerSummary = async (id: string) => (await listPartners(d.partnerStore)).find((p) => p.partnerId === id);

  /**
   * The credential for a source: its own encrypted secret when one is stored; else, only for the exact seeded connection (boundEnvRef), the env var
   * that seeded entry names; else none for a source that names no ref (a public repo), and NoCredentialError for one that does.
   */
  async function credentialFor(src: SourceSummary): Promise<string | undefined> {
    if (src.config.enabled === false) throw new NoCredentialError();
    if (src.hasSecret) return d.store.sources.readSecret(src.id);
    const ref = src.kind === "github" ? src.config.tokenRef : src.config.passwordRef;
    if (ref === undefined) return undefined;
    // A stored doc may predate the schema: re-check the name AND its kind binding here (PATHLYNKS_* only for postgres, GITHUB_* only for github).
    if (typeof ref !== "string" || !credentialRefPatternFor(src.kind === "github" ? "github" : "postgres", src.config.platform === "vidysea" ? "vidysea" : "pathlynks").test(ref)) throw new CredentialRefError();
    const bound = boundEnvRef(src, d.seededSources, d.defaultSiteId);
    if (bound === undefined) throw new NoCredentialError();
    const value = (d.env ?? process.env)[bound];
    return value !== undefined && value !== "" ? value : undefined;
  }

  const routes: RouteDef[] = [
    {
      method: "GET",
      pattern: ["me"],
      minRole: "viewer",
      action: "me",
      run: async (c) => ok(200, { id: adminIdOf(c.actor.email), email: c.actor.email, role: c.actor.role }),
    },

    // ----- admins (super-admin)
    {
      method: "GET",
      pattern: ["admins"],
      minRole: "super-admin",
      action: "admins.list",
      run: async () => ok(200, { admins: (await d.store.users.list()).map(adminView) }),
    },
    {
      method: "POST",
      pattern: ["admins"],
      minRole: "super-admin",
      action: "admins.create",
      run: async (c) => {
        const email = str(c.body.email);
        const password = c.body.password;
        if (email === undefined || !isRole(c.body.role)) return err(400, "invalid_admin");
        if (passwordPolicyError(password) !== undefined) return err(400, "invalid_admin");
        const created = await d.store.users.create({ email, passwordHash: await hashPassword(password as string), role: c.body.role });
        return ok(201, { admin: adminView(created) }, created.email);
      },
    },
    {
      method: "PATCH",
      pattern: ["admins", "*"],
      minRole: "super-admin",
      action: "admins.set_role",
      run: async (c) => {
        const id = c.segs[1]!;
        if (!ADMIN_ID.test(id) || !isRole(c.body.role)) return err(400, "invalid_admin");
        const target = (await d.store.users.list()).find((u) => adminIdOf(u.email) === id);
        if (!target) return err(404, "not_found");
        // No self-service role change at all: nobody grants themselves a role or demotes themselves out of the last super-admin seat.
        if (target.email === c.actor.email) return { res: respond(403, { error: "self_change_forbidden" }), ok: false, target: target.email };
        if (!(await d.store.users.setRole(target.email, c.body.role))) return err(404, "not_found");
        return ok(200, { admin: adminView({ ...target, role: c.body.role }) }, target.email);
      },
    },

    // ----- sites (partners.ts)
    {
      method: "GET",
      pattern: ["sites"],
      minRole: "viewer",
      action: "sites.list",
      run: async () => ok(200, { sites: await listPartners(d.partnerStore) }),
    },
    {
      method: "POST",
      pattern: ["sites"],
      minRole: "admin",
      action: "sites.create",
      run: async (c) => {
        const ctx = partnersOrFail();
        if (!ctx) return noPartners();
        const name = str(c.body.name);
        const origins = c.body.origins === undefined ? [] : strArray(c.body.origins);
        const id = c.body.id === undefined ? undefined : str(c.body.id);
        if (name === undefined || origins === undefined || (c.body.id !== undefined && id === undefined)) return err(400, "invalid_site");
        const { partner, keys } = await addPartner(d.partnerStore, { name, origins, ...(id === undefined ? {} : { id }) }, ctx);
        return ok(201, { partner, keys }, partner.partnerId, { oneTimeKey: true });
      },
    },
    {
      method: "PATCH",
      pattern: ["sites", "*"],
      minRole: "admin",
      action: "sites.update",
      run: async (c) => {
        const name = c.body.name === undefined ? undefined : str(c.body.name);
        const origins = c.body.origins === undefined ? undefined : strArray(c.body.origins);
        if ((c.body.name !== undefined && name === undefined) || (c.body.origins !== undefined && origins === undefined)) return err(400, "invalid_site");
        const hasMemoryPolicy = Object.prototype.hasOwnProperty.call(c.body, "memoryPolicy");
        const memoryPolicy = hasMemoryPolicy ? parseMemoryPolicy(c.body.memoryPolicy) : undefined;
        if (hasMemoryPolicy && !memoryPolicy) return err(400, "invalid_memory_policy");
        if (Object.keys(c.body).some(k => !["name", "origins", "memoryPolicy"].includes(k))) return err(400, "invalid_site");
        const partner = await updatePartner(d.partnerStore, siteIdOf(c), { ...(name === undefined ? {} : { name }), ...(origins === undefined ? {} : { origins }), ...(memoryPolicy ? { memoryPolicy } : {}) });
        return ok(200, { partner });
      },
    },
    {
      method: "POST",
      pattern: ["sites", "*", "keys", "rotate"],
      minRole: "admin",
      action: "sites.rotate",
      run: async (c) => {
        const ctx = partnersOrFail();
        if (!ctx) return noPartners();
        if (!isScope(c.body.scope)) return err(400, "invalid_scope");
        const out = await rotatePartner(d.partnerStore, siteIdOf(c), c.body.scope, ctx);
        return ok(200, { partner: out.partner, key: out.key, scope: out.scope }, `${siteIdOf(c)}:${out.scope}`, { oneTimeKey: true });
      },
    },
    {
      method: "POST",
      pattern: ["sites", "*", "revoke"],
      minRole: "admin",
      action: "sites.revoke",
      run: async (c) => ok(200, { partner: await revokePartner(d.partnerStore, siteIdOf(c)) }),
    },
    {
      method: "POST",
      pattern: ["sites", "*", "unrevoke"],
      minRole: "admin",
      action: "sites.unrevoke",
      run: async (c) => ok(200, { partner: await unrevokePartner(d.partnerStore, siteIdOf(c)) }),
    },

    // ----- sources
    {
      method: "GET",
      pattern: ["sources"],
      minRole: "viewer",
      action: "sources.list",
      run: async () => ok(200, { sources: await d.store.sources.list() }),
    },
    {
      method: "POST",
      pattern: ["sources"],
      minRole: "admin",
      action: "sources.create",
      run: async (c) => {
        const { siteId: rawSite, ...rest } = c.body;
        // A secret-looking value anywhere in the body (a password / token field holding text, a URL with credentials) is a 400 and nothing is stored.
        if (findSecretLikeFields(rest).length > 0) return err(400, "secret_in_config");
        const parsed = SourceConfig.safeParse(rest.platform === undefined ? rest : { ...rest, siteId: rawSite });
        if (!parsed.success) return err(400, "invalid_source");
        // wire-fix-1: the read-only Mongo source is config-only (config/sources.json); the console can neither create nor retarget it.
        if (parsed.data.kind === "mongo") return err(400, "invalid_source");
        const siteId = rawSite === undefined ? d.defaultSiteId : str(rawSite);
        if (siteId === undefined) return err(400, "invalid_source");
        const { kind, id, ...config } = parsed.data;
        if (await d.store.sources.get(id)) return err(409, "exists");
        const created = await d.store.sources.upsert({ id, siteId, kind, config });
        return ok(201, { source: created }, id);
      },
    },
    {
      method: "PUT",
      pattern: ["sources", "*", "secret"],
      minRole: "super-admin",
      action: "sources.set_secret",
      run: async (c) => {
        const secret = c.body.secret;
        if (typeof secret !== "string" || secret === "" || secret.length > 4096) return err(400, "invalid_secret");
        if (!(await d.store.sources.get(sourceIdOf(c)))) return err(404, "not_found");
        await d.store.sources.setSecret(sourceIdOf(c), secret);
        return ok(200, { ok: true, hasSecret: true });
      },
    },
    {
      method: "POST",
      pattern: ["sources", "*", "test"],
      minRole: "admin",
      action: "sources.test",
      run: async (c) => {
        const src = await d.store.sources.get(sourceIdOf(c));
        if (!src) return err(404, "not_found");
        const out = await testSource(src);
        return { res: respond(200, out), ok: out.ok };
      },
    },
    {
      method: "POST",
      pattern: ["sources", "*", "sync"],
      minRole: "admin",
      action: "sources.sync",
      run: async (c) => {
        const src = await d.store.sources.get(sourceIdOf(c));
        if (!src) return err(404, "not_found");
        if (src.kind !== "github") return err(400, "not_syncable");
        // tf-fix-2 / D-135: the explicit keep-last-good override. A strict boolean, honoured for every admin who may sync (minRole "admin"; a viewer never reaches here).
        // Per-right checkboxes per admin group come later (D-135); until then an admin is an admin.
        const flag = c.body.acceptShrink;
        if (flag !== undefined && typeof flag !== "boolean") return err(400, "invalid_request");
        const out = await syncGithubSource(src, flag === true ? { actor: c.actor.email } : undefined);
        return { res: respond(200, out), ok: out.status === "ok" };
      },
    },

    // ----- metrics, audit (GET, viewer)
    {
      method: "GET",
      pattern: ["metrics"],
      minRole: "viewer",
      action: "metrics",
      run: async (c) => {
        const from = c.url.searchParams.get("from");
        const to = c.url.searchParams.get("to");
        const siteId = c.url.searchParams.get("siteId");
        if (from === null || to === null || from === "" || to === "") return err(400, "range");
        const result = await aggregateMetrics(d.db, { from, to, ...(siteId === null || siteId === "" ? {} : { siteId }), ...(d.usdInrRate === undefined ? {} : { usdInrRate: d.usdInrRate }) });
        return ok(200, result);
      },
    },
    {
      method: "GET",
      pattern: ["audit"],
      minRole: "viewer",
      action: "audit",
      run: async (c) => {
        const limitRaw = c.url.searchParams.get("limit");
        const limit = limitRaw === null ? 100 : Number(limitRaw);
        if (!Number.isInteger(limit) || limit < 1 || limit > 200) return err(400, "invalid_request");
        const before = c.url.searchParams.get("before");
        const rows = await d.store.audit.list({ limit, ...(before === null || before === "" ? {} : { before }) });
        return ok(200, { entries: rows.map((r) => ({ at: r.at, actorId: r.actorId, action: r.action, target: r.target, ok: r.ok })) });
      },
    },
  ];

  // ---------------------------------------------------------------- source test / sync

  async function testSource(src: SourceSummary): Promise<{ ok: boolean; message: string }> {
    try {
      if (src.kind === "github") {
        if (!d.github) return { ok: false, message: "GitHub access is not configured on this server." };
        const cfg = src.config as { owner?: unknown; repo?: unknown; branch?: unknown };
        if (typeof cfg.owner !== "string" || typeof cfg.repo !== "string" || typeof cfg.branch !== "string") return { ok: false, message: "The source configuration is incomplete." };
        const port = d.github(await credentialFor(src));
        await withTimeout(Promise.resolve(port.listTree(cfg.owner, cfg.repo, cfg.branch)), NETWORK_TIMEOUT_MS);
        return { ok: true, message: "Connection works." };
      }
      if (!d.postgres) return { ok: false, message: "Database access is not configured on this server." };
      const out = await withTimeout(d.postgres.test(src.config, await credentialFor(src), { source: src, ...(d.seededSources ? { seeded: d.seededSources } : {}), ...(d.defaultSiteId ? { defaultSiteId: d.defaultSiteId } : {}) }), NETWORK_TIMEOUT_MS);
      return out.ok ? { ok: true, message: "Connection works." } : { ok: false, message: PG_CAUSE_TEXT[out.cause ?? ""] ?? "The database could not be reached." };
    } catch (e) {
      if (e instanceof SecretsError) return { ok: false, message: "The secrets store is not configured on this server." };
      if (e instanceof CredentialRefError) return { ok: false, message: CREDENTIAL_REF_REFUSED };
      if (e instanceof NoCredentialError) return { ok: false, message: NO_CREDENTIAL };
      return { ok: false, message: src.kind === "github" ? "The repository could not be read." : "The database could not be reached." };
    }
  }

  /** Up to 20 parser diagnostics, with the token and anything secret-looking scrubbed, each field length-capped (they are stored and returned). */
  function safeDiagnostics(list: readonly { code: string; file: string; message: string }[], token: string | undefined): SyncDiagnostic[] {
    const scrub = (text: string, max: number): string => {
      const cleaned = token !== undefined && token !== "" ? text.split(token).join("[redacted]") : text;
      return findSecretLikeFields(cleaned).length > 0 || SECRET_IN_TEXT.test(cleaned) ? "[redacted]" : cleaned.slice(0, max);
    };
    return list.slice(0, MAX_STORED_DIAGNOSTICS).map((x) => ({ code: scrub(String(x.code), 64), file: scrub(String(x.file), 200), message: scrub(String(x.message), 300) }));
  }

  /** T8: a GithubPort that answers listTree from an already fetched listing (one tree request per sync) and forwards blobs. */
  function cached(listed: Awaited<ReturnType<GithubPort["listTree"]>>, port: GithubPort): GithubPort {
    return { listTree: async () => listed, getBlob: (o, r, sha) => port.getBlob(o, r, sha) };
  }

  /** wire-fix-1: repo identity stored in EVERY synced artifact (`data.source`): owner, repo, branch, plus the commit sha and the tree sha when the port exposes them. */
  function repoIdentity(coords: { owner: string; repo: string; branch: string }, listed: Awaited<ReturnType<GithubPort["listTree"]>>): Omit<KgSource, "files"> {
    const extra: { sha?: unknown; commit?: unknown } = Array.isArray(listed) ? {} : (listed as { sha?: unknown; commit?: unknown });
    return {
      owner: coords.owner,
      repo: coords.repo,
      branch: coords.branch,
      ...(typeof extra.commit === "string" ? { commit: extra.commit } : {}),
      ...(typeof extra.sha === "string" ? { treeSha: extra.sha } : {}),
    };
  }

  /** T8: repo identity for a graph half: the blob sha of every file read, plus the tree sha / commit when the port exposes one. */
  function kgSource(coords: { owner: string; repo: string; branch: string }, listed: Awaited<ReturnType<GithubPort["listTree"]>>, tree: { path: string; sha?: string }[], read: readonly RepoFile[]): KgSource {
    const bySha = new Map(tree.map((e) => [e.path, e.sha]));
    const files: Record<string, string> = {};
    for (const f of read) {
      const sha = bySha.get(f.path);
      if (typeof sha === "string") files[f.path] = sha;
    }
    const id = repoIdentity(coords, listed);
    return { ...id, files };
  }

  const KEPT_GRAPH = "so the stored catalogue and graph were kept.";
  const reasonsText = (reasons: readonly string[]): string => reasons.join(", ");
  /** The keep-last-good reasons an admin may knowingly accept (tf-fix-2): a shrink or skipped files. An empty graph, a missing hub or no models are never overridable. */
  const ACCEPTABLE_REASONS: ReadonlySet<string> = new Set(["tools_shrank", "tables_shrank", "skipped_files"]);
  /** True when the sync must keep the stored graph. With the override (any admin, D-135; the route's minRole already refuses a viewer) an acceptable-only verdict goes through, after a counted audit row; if that row cannot be written the stored graph is kept. */
  async function keepsStored(src: SourceSummary, verdict: { keep: boolean; reasons: readonly string[] }, counts: string, override?: { actor: string }): Promise<boolean> {
    if (!verdict.keep) return false;
    if (override === undefined || !verdict.reasons.every((r) => ACCEPTABLE_REASONS.has(r))) return true;
    try {
      await d.store.audit.append({ actorId: override.actor, action: "sources.sync.accept_shrink", target: `${src.id} ${reasonsText(verdict.reasons)} ${counts}`.slice(0, 200), ok: true, at: new Date(nowMs()).toISOString() });
      return false;
    } catch (e) {
      log({ level: "error", event: "admin_audit_failed", error: errorLabel(e) });
      return true;
    }
  }

  /** fetch -> parse -> artifacts.put -> sources.recordSync. A failed fetch, or a sync that found nothing usable, records status "error" and leaves the previous artifact in place. */
  async function syncGithubSource(src: SourceSummary, override?: { actor: string }): Promise<SyncOutcome> {
    const fail = async (message: string, counts: Record<string, number> = {}, diagnostics?: SyncDiagnostic[]): Promise<SyncOutcome> => {
      await d.store.sources.recordSync(src.id, { at: new Date(nowMs()).toISOString(), status: "error", counts });
      return { status: "error", counts, message, ...(diagnostics === undefined ? {} : { diagnostics }) };
    };
    if (!d.github) return fail("GitHub access is not configured on this server.");
    const cfg = src.config as { owner?: unknown; repo?: unknown; branch?: unknown; service?: unknown };
    if (typeof cfg.owner !== "string" || typeof cfg.repo !== "string" || typeof cfg.branch !== "string") return fail("The source configuration is incomplete.");
    let token: string | undefined;
    try {
      token = await credentialFor(src);
    } catch (e) {
      return fail(e instanceof CredentialRefError ? CREDENTIAL_REF_REFUSED : e instanceof NoCredentialError ? NO_CREDENTIAL : "The stored credential could not be read.");
    }
    const port = d.github(token);
    const coords = { owner: cfg.owner, repo: cfg.repo, branch: cfg.branch };
    try {
      if (cfg.service === "frontend") {
        // Routes need only the file list, not the file contents.
        const listed = await withTimeout(Promise.resolve(port.listTree(coords.owner, coords.repo, coords.branch)), NETWORK_TIMEOUT_MS);
        const tree = Array.isArray(listed) ? listed : listed.tree;
        if (!Array.isArray(listed) && listed.truncated === true) throw new GithubFetchError("limit", "the repository tree is truncated");
        const paths = tree.filter((e) => e.type === undefined || e.type === "blob").map((e) => e.path);
        let catalogue = parseNextAppRoutes(paths);
        // T-057: the platform's services get a name and purpose from the host's English next-intl messages. One extra file, read only when the tree has
        // /services pages; if it is missing, oversize or unreadable, the plain route catalogue still syncs.
        if (catalogue.routes.some((r) => r.path.startsWith("/services/"))) {
          try {
            const [messages] = await withTimeout(fetchRepoFiles(port, coords, ["src/messages/en.json"], { redact: token === undefined ? [] : [token] }), NETWORK_TIMEOUT_MS);
            if (messages !== undefined) catalogue = applyServiceCopy(catalogue, messages.content);
          } catch (e) {
            log({ level: "warn", event: "admin_sync_service_copy_skipped", source: src.id, error: e instanceof GithubFetchError ? `GithubFetchError:${e.stage}` : errorLabel(e) });
          }
        }
        const counts: Record<string, number> = { files: paths.length, routes: catalogue.routes.length };
        // An empty catalogue (renamed app folder, wrong branch) must not replace the last good one.
        if (counts.routes === 0) return fail("No page routes were found in the repository, so the stored catalogue was kept.", counts);
        // T8: when the repo has the StudentOS hub, the tool half of the product knowledge graph rides on the same artifact (`data.kg`).
        // wire-fix-1 (keep last good): once a stored artifact carries a graph, a later sync replaces it only with a graph that is still whole. The hub or the
        // navigation file missing from the tree, a skipped hub file, or a drop of more than 30% in the tools keeps the stored catalogue AND graph (the whole sync is
        // then reported as an error and nothing is written). With nothing stored yet, only an empty graph is held back.
        const previous = await d.store.artifacts.getLatest(src.id, "nav_catalogue");
        const prevTools = (previous?.data.kg as { tools?: unknown[] } | undefined)?.tools;
        const hadGraph = Array.isArray(prevTools) && prevTools.length > 0;
        const hubInTree = paths.some((p) => /(?:^|\/)StudentOS\.tsx$/.test(p)) && paths.includes(STUDENT_HUB_FILES.navigation);
        const hubMissing = `The student hub was not found in the repository, ${KEPT_GRAPH}`;
        let kg: Record<string, unknown> | undefined;
        if (hubInTree) {
          let skippedHub = 0;
          const hubFiles = await withTimeout(
            fetchRepoFiles(cached(listed, port), coords, [STUDENT_HUB_FILES.navigation, STUDENT_HUB_FILES.sidebar, STUDENT_HUB_FILES.osGlob], {
              redact: token === undefined ? [] : [token],
              onSkip: () => {
                skippedHub++;
              },
            }),
            NETWORK_TIMEOUT_MS * 2,
          );
          const built = buildFrontendKg(hubFiles, catalogue, kgSource(coords, listed, tree, hubFiles));
          const sections = built.tools.filter((t) => t.kind === "section").length;
          counts.tools = built.tools.length;
          counts.sections = sections;
          counts.kgDiagnostics = built.diagnostics.length;
          counts.skipped = skippedHub;
          const verdict = shouldKeepLastGood(hadGraph ? { tools: prevTools as unknown[] } : null, { tools: built.tools }, { skipped: skippedHub });
          if (hadGraph && sections === 0) return fail(hubMissing, counts, safeDiagnostics(built.diagnostics, token));
          if (hadGraph && (await keepsStored(src, verdict, `tools ${(prevTools as unknown[]).length}->${built.tools.length} skipped ${skippedHub}`, override))) return fail(`The new graph looks incomplete (${reasonsText(verdict.reasons)}), ${KEPT_GRAPH}`, counts, safeDiagnostics(built.diagnostics, token));
          if (sections > 0) kg = built as unknown as Record<string, unknown>;
        } else if (hadGraph) {
          return fail(hubMissing, counts);
        }
        await d.store.artifacts.put({ sourceId: src.id, kind: "nav_catalogue", data: { routes: catalogue.routes, source: repoIdentity(coords, listed), ...(kg === undefined ? {} : { kg }) } });
        await d.store.sources.recordSync(src.id, { at: new Date(nowMs()).toISOString(), status: "ok", counts });
        return { status: "ok", counts };
      }
      if (cfg.service !== "frontend" && src.config.platform === "vidysea") {
        // T8: the Vidysea backend is Python (SQLAlchemy models, FastAPI routers), not Sequelize migrations. Models give the tables, the student-facing
        // routers give the writer endpoints; the schema_map artifact keeps the migration-shaped `tables` and carries the graph half in `data.kg`.
        let skippedPy = 0;
        const listedPy = await withTimeout(Promise.resolve(port.listTree(coords.owner, coords.repo, coords.branch)), NETWORK_TIMEOUT_MS);
        const treePy = Array.isArray(listedPy) ? listedPy : listedPy.tree;
        const pyFiles = await withTimeout(
          fetchRepoFiles(cached(listedPy, port), coords, [...BACKEND_MODEL_GLOBS, ...BACKEND_ROUTER_GLOBS], {
            redact: token === undefined ? [] : [token],
            maxBytes: 2_000_000,
            onSkip: () => {
              skippedPy++;
            },
          }),
          NETWORK_TIMEOUT_MS * 5,
        );
        // kg-fix-1 / wire-fix-1: the service modules (`app/services/*.py`) let the graph verify the edges whose write happens in a service. They only verify;
        // they are not stored. A skipped service file leaves its edges unverified (counted), it does not make the schema itself incomplete.
        let skippedServices = 0;
        const serviceFiles = await withTimeout(
          fetchRepoFiles(cached(listedPy, port), coords, [...BACKEND_SERVICE_GLOBS], {
            redact: token === undefined ? [] : [token],
            maxBytes: 2_000_000,
            onSkip: () => {
              skippedServices++;
            },
          }),
          NETWORK_TIMEOUT_MS * 5,
        );
        const isModel = (f: RepoFile): boolean => /^app\/models\/[^/]+\.py$/.test(f.path) || /^app\/api\/v1\/[^/]+\/models\.py$/.test(f.path);
        const modelFiles = pyFiles.filter(isModel);
        const siblings = await d.store.sources.list(src.siteId);
        const vcReadTables = siblings.filter((x) => x.kind === "postgres" && Array.isArray(x.config.tables)).flatMap((x) => (x.config.tables as unknown[]).filter((t): t is string => typeof t === "string"));
        const built = buildBackendKg(modelFiles, pyFiles.filter((f) => !isModel(f)), { vcReadTables, source: kgSource(coords, listedPy, treePy, pyFiles), serviceFiles });
        const names = Object.keys(built.tables);
        const bcounts = { files: pyFiles.length, tables: names.length, writers: built.writers.length, toolEdges: built.toolEdges.length, diagnostics: built.diagnostics.length, skipped: skippedPy, services: serviceFiles.length, skippedServices };
        const bdiagnostics = safeDiagnostics(built.diagnostics, token);
        // No model files or no tables (renamed folder, wrong branch) must never become the latest artifact.
        if (modelFiles.length === 0) return fail("No model files were found in the repository, so the stored schema was kept.", bcounts, bdiagnostics);
        if (names.length === 0) return fail("The model files define no tables, so the stored schema was kept.", bcounts, bdiagnostics);
        // wire-fix-1 (keep last good): against a stored schema, a drop of more than 30% in the tables, or any skipped model/router file, keeps the stored one.
        const previousSchema = await d.store.artifacts.getLatest(src.id, "schema_map");
        const prevTables = previousSchema?.data.tables;
        const verdict = shouldKeepLastGood(prevTables !== undefined && prevTables !== null && typeof prevTables === "object" ? { tables: prevTables as Record<string, unknown> } : null, { tables: built.tables }, { skipped: skippedPy + skippedServices });
        const prevTableCount = prevTables !== undefined && prevTables !== null && typeof prevTables === "object" ? Object.keys(prevTables as Record<string, unknown>).length : 0;
        if (previousSchema !== null && (await keepsStored(src, verdict, `tables ${prevTableCount}->${names.length} skipped ${skippedPy} skippedServices ${skippedServices}`, override))) return fail(`The new schema looks incomplete (${reasonsText(verdict.reasons)}), so the stored schema was kept.`, bcounts, bdiagnostics);
        const tables: Record<string, unknown> = {};
        for (const n of names) {
          const t = built.tables[n]!;
          const columns: Record<string, unknown> = {};
          for (const [c, def] of Object.entries(t.columns)) Object.defineProperty(columns, c, { value: { type: def.type, ...(def.allowNull === undefined ? {} : { allowNull: def.allowNull }) }, enumerable: true, writable: true, configurable: true });
          Object.defineProperty(tables, n, { value: { columns, sourceFiles: [t.file] }, enumerable: true, writable: true, configurable: true });
        }
        await d.store.artifacts.put({ sourceId: src.id, kind: "schema_map", data: { tables, diagnostics: bdiagnostics, source: repoIdentity(coords, listedPy), kg: built as unknown as Record<string, unknown> } });
        await d.store.sources.recordSync(src.id, { at: new Date(nowMs()).toISOString(), status: "ok", counts: bcounts });
        return { status: "ok", counts: bcounts, diagnostics: bdiagnostics };
      }
      let skipped = 0;
      // wire-fix-1: one listing, shared with the file fetch, so the artifact can record the commit and tree it was read from.
      const listedSeq = await withTimeout(Promise.resolve(port.listTree(coords.owner, coords.repo, coords.branch)), NETWORK_TIMEOUT_MS);
      const files = await withTimeout(
        fetchRepoFiles(cached(listedSeq, port), coords, ["**/migrations/*.js", "**/migrations/*.cjs", "**/migrations/*.ts"], {
          redact: token === undefined ? [] : [token],
          onSkip: () => {
            skipped++;
          },
        }),
        NETWORK_TIMEOUT_MS * 5,
      );
      const schema = parseSequelizeMigrations(files);
      const tables = Object.keys(schema.tables).length;
      const counts = { files: files.length, tables, diagnostics: schema.diagnostics.length, skipped };
      const diagnostics = safeDiagnostics(schema.diagnostics, token);
      // Nothing usable must never become the latest artifact (it would blank the schema the chat reads) nor be reported as ok. Parser diagnostics alone
      // never make a sync an error (fix cycle 2, F4): a migration with one raw query still defines its tables; the diagnostics are stored with them.
      const problem =
        files.length === 0
          ? "No migration files were found in the repository, so the stored schema was kept."
          : tables === 0
            ? "The migration files define no tables, so the stored schema was kept."
            : undefined;
      if (problem !== undefined) return fail(problem, counts, diagnostics);
      await d.store.artifacts.put({ sourceId: src.id, kind: "schema_map", data: { tables: schema.tables, diagnostics, source: repoIdentity(coords, listedSeq) } });
      await d.store.sources.recordSync(src.id, { at: new Date(nowMs()).toISOString(), status: "ok", counts });
      return { status: "ok", counts, diagnostics };
    } catch (e) {
      log({ level: "error", event: "admin_sync_failed", source: src.id, error: e instanceof GithubFetchError ? `GithubFetchError:${e.stage}` : errorLabel(e) });
      return fail(e instanceof GithubFetchError && e.stage === "limit" ? "The repository is too large to sync in one go." : "The repository could not be read.");
    }
  }

  return routes;
}

/** T8: the backend files the graph reads: every model file, and the student-facing router files (the folders the inventory's write sites live in). */
const BACKEND_MODEL_GLOBS = ["app/models/*.py", "app/api/v1/*/models.py"] as const;
const BACKEND_SERVICE_GLOBS = ["app/services/*.py"] as const;
const BACKEND_ROUTER_GLOBS = [
  "app/api/v1/{student,students,journey_map,applications,exploration,scholarships}/*router*.py",
  "app/api/v1/{tools,services,users,auth,rewards,notifications,pre_departure,recommend,discovery}/*router*.py",
  "app/api/v1/further_profile.py",
] as const;

interface SyncDiagnostic {
  code: string;
  file: string;
  message: string;
}
interface SyncOutcome {
  status: "ok" | "error";
  counts: Record<string, number>;
  message?: string;
  diagnostics?: SyncDiagnostic[];
}
const MAX_STORED_DIAGNOSTICS = 20;
/** A token-shaped word inside a diagnostic text (a file name can carry one). */
const SECRET_IN_TEXT = /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{10,}|\bgithub_pat_[A-Za-z0-9_]{10,}|\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]{2,}/;

const PG_CAUSE_TEXT: Record<string, string> = {
  not_configured: "No password is set for this database source.",
  connect_error: "The database could not be reached.",
  timeout: "The database did not answer in time.",
  query_error: "The database refused the read-only check.",
  privilege_check_failed: "The database user has write privileges, so the connection was refused.",
  privilege_check_error: "The database user's privileges could not be checked, so the connection was refused.",
};

// ---------------------------------------------------------------------------------------------------------------- seed + real GitHub port

/** Seeds `config/sources.json` into the store. Idempotent: a source that already exists is left exactly as it is (its secret and lastSync included). */
export async function seedSourcesFromConfig(store: Pick<AdminStore, "sources">, file: SourcesFile): Promise<{ created: number; existing: number }> {
  let created = 0;
  let existing = 0;
  for (const s of file.sources) {
    // wire-fix-1 (D-134): a "mongo" source (the Career Quest database) is read by code from config/sources.json alone. It is not an admin-editable stored source,
    // so a console edit can never retarget the database or its collection allow-list.
    if (s.kind === "mongo") continue;
    if (await store.sources.get(s.id)) {
      existing++;
      continue;
    }
    const { kind, id, ...config } = s;
    await store.sources.upsert({ id, siteId: s.siteId ?? file.siteId, kind, config });
    created++;
  }
  return { created, existing };
}

export type GithubFetchFn = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const GIT_SHA = /^[0-9a-f]{40}$/i;

class GithubHttpError extends Error {
  constructor(readonly status: number) {
    super(`GitHub answered ${status}`);
    this.name = "GithubHttpError";
  }
}

const GithubTree = z.object({ sha: z.string().regex(GIT_SHA).optional(), tree: z.array(z.object({ path: z.string(), type: z.string().optional(), sha: z.string().optional(), size: z.number().optional() })), truncated: z.boolean().optional() });
const GithubCommit = z.object({ sha: z.string().regex(GIT_SHA), commit: z.object({ tree: z.object({ sha: z.string().regex(GIT_SHA) }) }) });
const GithubBlobBody = z.object({ content: z.string(), encoding: z.string().optional(), size: z.number().optional() });

/**
 * The production GithubPort: two read-only GETs on api.github.com. The token goes into the Authorization header only; a failure carries the
 * HTTP status and nothing else (never the response body, never the header), so it cannot echo the token.
 */
export function createGithubPort(token: string | undefined, fetchFn: GithubFetchFn = fetch as unknown as GithubFetchFn): GithubPort {
  const get = async (path: string): Promise<unknown> => {
    const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "vc-admin-sync", "x-github-api-version": "2022-11-28" };
    if (token !== undefined && token !== "") headers.authorization = `Bearer ${token}`;
    const res = await fetchFn(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new GithubHttpError(res.status);
    return res.json();
  };
  const seg = (v: string): string => encodeURIComponent(v);
  return {
    async listTree(owner, repo, branch) {
      // wire-fix-1: the listing carries the commit sha of the branch (commits API) and the sha of the tree read, so every artifact can name what it was built from.
      let parsed = GithubTree.parse(await get(`/repos/${seg(owner)}/${seg(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`));
      const head = GithubCommit.parse(await get(`/repos/${seg(owner)}/${seg(repo)}/commits/${encodeURIComponent(branch)}`));
      // The branch moved between the two reads: take the tree of the commit just named, so the commit and the entries always belong together.
      if (parsed.sha !== undefined && parsed.sha.toLowerCase() !== head.commit.tree.sha.toLowerCase()) {
        parsed = GithubTree.parse(await get(`/repos/${seg(owner)}/${seg(repo)}/git/trees/${head.commit.tree.sha}?recursive=1`));
      }
      return { tree: parsed.tree, ...(parsed.truncated === undefined ? {} : { truncated: parsed.truncated }), sha: head.commit.tree.sha, commit: head.sha };
    },
    async getBlob(owner, repo, sha) {
      return GithubBlobBody.parse(await get(`/repos/${seg(owner)}/${seg(repo)}/git/blobs/${seg(sha)}`));
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------- startApi wiring helpers

/** USD to INR for `costPerStudentInr`: VC_USD_INR_RATE (the name in .env.example), else VC_USD_INR (the gate G7 name). Undefined = the store default. Bad = startup error. */
export function usdInrFromEnv(env: Record<string, string | undefined>): number | undefined {
  for (const name of ["VC_USD_INR_RATE", "VC_USD_INR"]) {
    const raw = env[name];
    if (raw === undefined || raw.trim() === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || n > 10_000) throw new Error(`${name} must be a positive number`);
    return n;
  }
  return undefined;
}

/**
 * VA17: the usage sink chat and voice write through. The student key is the HMAC of (site, student id) under a key DERIVED from VC_ADMIN_MASTER_KEY
 * (domain-separated, never the master key itself), so a usage row never holds a student id and the same student is one key across turns. The meter
 * is an AsyncLocalStorage the chain's `onUsage` adds to while a turn runs inside `scope`.
 */
export function createUsageSink(
  store: Pick<AdminStore, "usage">,
  masterKey: string,
  nowIso: () => string = () => new Date().toISOString(),
): TurnUsageSink & { addUsage(u: { actual?: string; inputTokens?: number; outputTokens?: number; usd?: number }): void } {
  const hmacKey = createHash("sha256").update(`vc-usage-student-key|${masterKey}`).digest("hex");
  const als = new AsyncLocalStorage<UsageMeter>();
  return {
    scope: (fn) => {
      const meter: UsageMeter = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
      return als.run(meter, () => fn(meter));
    },
    addUsage(u) {
      const m = als.getStore();
      if (!m || u.actual !== "reported") return;
      if (Number.isFinite(u.inputTokens)) m.inputTokens += u.inputTokens!;
      if (Number.isFinite(u.outputTokens)) m.outputTokens += u.outputTokens!;
      if (Number.isFinite(u.usd) && u.usd! >= 0) m.costUsd += u.usd!;
    },
    async record(entry, meter) {
      await store.usage.record({
        at: nowIso(),
        siteId: entry.siteId,
        ...(entry.studentId === undefined ? {} : { studentKey: studentKeyOf(hmacKey, entry.siteId, entry.studentId) }),
        mode: entry.mode,
        inputTokens: Math.max(0, Math.round(meter.inputTokens)),
        outputTokens: Math.max(0, Math.round(meter.outputTokens)),
        costUsd: Math.max(0, meter.costUsd),
        latencyMs: entry.latencyMs,
        answered: entry.answered,
        ...(entry.guardrail === undefined ? {} : { guardrail: entry.guardrail }),
      });
    },
  };
}

type EnginePathlynksPort = NonNullable<StudentGraphDeps["pathlynks"]>;

/** The mcp port answers `{ok, rows, truncated}` or a typed failure; the engine port answers `{status}`. A refusal or failure is just `unavailable` (no cause reaches a student). */
export function adaptPathlynksPort(p: Pick<ReturnType<typeof createPathlynksPort>, "getStudentProfile" | "getSavedCareers" | "getCompareList" | "getAssessmentStatus"> & Partial<Pick<ReturnType<typeof createPathlynksPort>, "getCategoryFits" | "getCareerFits" | "getTraitScores" | "getCombinedReportSummary" | "getQuestProfile" | "getQuestGoals" | "getQuestPlan">>, withQuest = true): EnginePathlynksPort {
  const one = (r: McpPathlynksResult) => (r.ok ? ({ status: "ok", data: r.rows[0] ?? null } as const) : ({ status: "unavailable" } as const));
  const many = (r: McpPathlynksResult) => (r.ok ? ({ status: "ok", data: r.rows, ...(r.truncated ? { truncated: true } : {}) } as const) : ({ status: "unavailable" } as const));
  return {
    getStudentProfile: async (id) => one(await p.getStudentProfile(id)),
    getSavedCareers: async (id) => many(await p.getSavedCareers(id)),
    getCompareList: async (id) => many(await p.getCompareList(id)),
    getAssessmentStatus: async (id) => one(await p.getAssessmentStatus(id)),
    // T-057: the fit/trait/report reads (each is `unavailable` when the stored source does not list its tables).
    ...(p.getCategoryFits ? { getCategoryFits: async (id: string) => many(await p.getCategoryFits!(id)) } : {}),
    ...(p.getCareerFits ? { getCareerFits: async (id: string) => many(await p.getCareerFits!(id)) } : {}),
    ...(p.getTraitScores ? { getTraitScores: async (id: string) => many(await p.getTraitScores!(id)) } : {}),
    ...(p.getCombinedReportSummary ? { getCombinedReportSummary: async (id: string) => one(await p.getCombinedReportSummary!(id)) } : {}),
    // D-134: Career Quest (Mongo) reads, passed through only when a quest opener is wired (withQuest); otherwise the engine sees no quest method and falls back to the KB.
    ...(withQuest && p.getQuestProfile ? { getQuestProfile: async (id: string) => one(await p.getQuestProfile!(id)) } : {}),
    ...(withQuest && p.getQuestGoals ? { getQuestGoals: async (id: string) => many(await p.getQuestGoals!(id)) } : {}),
    ...(withQuest && p.getQuestPlan ? { getQuestPlan: async (id: string) => one(await p.getQuestPlan!(id)) } : {}),
  };
}

const PORT_CACHE_MS = 60_000;

/** The seeded id (config/sources.json) of the Pathlynks Postgres source: the only one the live chat port is ever built from. */
export const PATHLYNKS_POSTGRES_SOURCE_ID = "pathlynks-db";

/** Exact R4 read model. A missing joined table fails closed; similarly named tables never qualify. */
export function pathlynksTablesFrom(tables: readonly string[]): Parameters<typeof createPathlynksPort>[0]["tables"] | undefined {
  const required = { profile: "users", userGrade: "user_grade", grade: "grade", savedCareers: "student_saved_careers", compareList: "student_career_compare", careerOption: "career_option", assessment: "assessment_response" };
  if (!Object.values(required).every((name) => tables.includes(name))) return undefined;
  // T-057: optional fit/trait/report tables, each exact-named and mapped only when the stored source lists it (a group is all or nothing).
  const has = (...names: string[]) => names.every((n) => tables.includes(n));
  return {
    ...required,
    ...(has("user_category_fitscore", "category_option") ? { categoryFit: "user_category_fitscore", categoryOption: "category_option" } : {}),
    ...(has("user_subcategory_fitscore", "subcategory_option") ? { subcategoryFit: "user_subcategory_fitscore", subcategoryOption: "subcategory_option" } : {}),
    ...(has("student_trait_score_point") ? { traitScores: "student_trait_score_point" } : {}),
    ...(has("combined_report_llm_data") ? { combinedReport: "combined_report_llm_data" } : {}),
  };
}

type PortConnect = Parameters<typeof createPathlynksPort>[0]["connect"];

type QuestDbOpener = Parameters<typeof createPathlynksPort>[0]["questDb"];

function mcpPortFor(cfg: Record<string, unknown>, password: string, extra: { onEvent?: (e: PathlynksEvent) => void; connect?: PortConnect; allowPrivileged?: string | undefined; caFile?: string | undefined; questDb?: QuestDbOpener }) {
  const tableNames = Array.isArray(cfg.tables) ? cfg.tables.filter((t): t is string => typeof t === "string") : [];
  const tables = pathlynksTablesFrom(tableNames);
  if (!tables || typeof cfg.host !== "string" || typeof cfg.port !== "number" || typeof cfg.database !== "string" || typeof cfg.user !== "string") return undefined;
  return createPathlynksPort({
    allowedTables: tableNames,
    tables,
    // CA path is server configuration, never a mutable admin/browser-supplied path or env-name lookup.
    connection: { host: cfg.host, port: cfg.port, database: cfg.database, user: cfg.user, sslmode: cfg.sslmode === "verify-full" ? "verify-full" : "require", passwordRef: "PATHLYNKS_PORT_PASSWORD", caFileRef: "PATHLYNKS_DB_CA_FILE" },
    env: { PATHLYNKS_PORT_PASSWORD: password, PATHLYNKS_ALLOW_PRIVILEGED_ROLE: extra.allowPrivileged, PATHLYNKS_DB_CA_FILE: extra.caFile },
    ...(extra.onEvent ? { onEvent: extra.onEvent } : {}),
    ...(extra.connect ? { connect: extra.connect } : {}),
    ...(extra.questDb ? { questDb: extra.questDb } : {}),
  });
}

/**
 * The engine PathlynksPort the chat path uses, built LAZILY from the stored postgres source (console edits and a newly stored password apply within 60 s)
 * and failing closed: no source, no password or a missing table is `unavailable`, never a throw. The password is read per build (the encrypted secret,
 * else, only for the exact seeded connection, the env var the seeded entry names) and goes only into a private env object handed to the port.
 */
export function createLivePathlynksPort(
  store: Pick<AdminStore, "sources">,
  opts: {
    env: Record<string, string | undefined>;
    /** config/sources.json's sources: the env password is used only while the stored doc is still the exact seeded connection (undefined = never). */
    seeded?: readonly SeededSource[];
    nowMs?: () => number;
    onEvent?: (e: PathlynksEvent) => void;
    connect?: PortConnect;
    sourceId?: string;
    siteId?: string;
    /** D-134: opens the Career Quest Mongo database (`pathlynks_journey`) read-only; supplied by the composition root. Absent = the quest tools are not wired. */
    questDb?: QuestDbOpener;
  },
): EnginePathlynksPort {
  const nowMs = opts.nowMs ?? Date.now;
  let cached: { at: number; port: EnginePathlynksPort } | undefined;
  const unavailable = { status: "unavailable" } as const;
  const none: EnginePathlynksPort = {
    getStudentProfile: async () => unavailable,
    getSavedCareers: async () => unavailable,
    getCompareList: async () => unavailable,
    getAssessmentStatus: async () => unavailable,
  };
  async function build(): Promise<EnginePathlynksPort> {
    try {
      // The seeded id only: an admin-created postgres source (any other id) can never become the live student-data port.
      const src = await store.sources.get(opts.sourceId ?? PATHLYNKS_POSTGRES_SOURCE_ID);
      if (!src || src.kind !== 'postgres' || src.config.enabled === false || (src.config.platform ?? 'pathlynks') !== 'pathlynks' || src.siteId !== (opts.siteId ?? 'pathlynks')) return none;
      // fix2 F1: the env password only for the unchanged seeded connection; a doc whose host/port/database/user/sslmode/ref changed gets none.
      const bound = src.hasSecret ? undefined : boundEnvRef(src, opts.seeded, opts.siteId);
      const password = src.hasSecret ? await store.sources.readSecret(src.id) : bound !== undefined ? opts.env[bound] : undefined;
      if (!password) return none;
      const port = mcpPortFor(src.config, password, { ...(opts.onEvent ? { onEvent: opts.onEvent } : {}), ...(opts.connect ? { connect: opts.connect } : {}), allowPrivileged: opts.env.PATHLYNKS_ALLOW_PRIVILEGED_ROLE, caFile: opts.env.PATHLYNKS_DB_CA_FILE, ...(opts.questDb ? { questDb: opts.questDb } : {}) });
      return port ? adaptPathlynksPort(port, Boolean(opts.questDb)) : none;
    } catch {
      return none;
    }
  }
  const current = async (): Promise<EnginePathlynksPort> => {
    const t = nowMs();
    if (!cached || t - cached.at >= PORT_CACHE_MS) cached = { at: t, port: await build() };
    return cached.port;
  };
  return {
    getStudentProfile: async (id) => (await current()).getStudentProfile(id),
    getSavedCareers: async (id) => (await current()).getSavedCareers(id),
    getCompareList: async (id) => (await current()).getCompareList(id),
    getAssessmentStatus: async (id) => (await current()).getAssessmentStatus(id),
    getCategoryFits: async (id) => { const p = await current(); return p.getCategoryFits ? p.getCategoryFits(id) : unavailable; },
    getCareerFits: async (id) => { const p = await current(); return p.getCareerFits ? p.getCareerFits(id) : unavailable; },
    getTraitScores: async (id) => { const p = await current(); return p.getTraitScores ? p.getTraitScores(id) : unavailable; },
    getCombinedReportSummary: async (id) => { const p = await current(); return p.getCombinedReportSummary ? p.getCombinedReportSummary(id) : unavailable; },
    // D-134: present only when the composition root supplied a quest opener, so a deployment without one never shows "can't see" for generic asks.
    ...(opts.questDb ? {
      getQuestProfile: async (id: string) => { const p = await current(); return p.getQuestProfile ? p.getQuestProfile(id) : unavailable; },
      getQuestGoals: async (id: string) => { const p = await current(); return p.getQuestGoals ? p.getQuestGoals(id) : unavailable; },
      getQuestPlan: async (id: string) => { const p = await current(); return p.getQuestPlan ? p.getQuestPlan(id) : unavailable; },
    } : {}),
  };
}


/** Native Vidysea SQL model; this factory never aliases programmes or assessment to Pathlynks careers. */
export function createLiveVidyseaPort(
  store: Pick<AdminStore, 'sources'>,
  opts: { env: Record<string, string | undefined>; seeded?: readonly SeededSource[]; siteId: string; nowMs?: () => number; onEvent?: (e: PathlynksEvent) => void; connect?: PortConnect },
): VidyseaPort {
  const unavailable = { ok: false, reason: 'unavailable', cause: 'not_configured' } as const;
  const none: VidyseaPort = {
    getStudentProfile: async () => unavailable,
    getShortlistedProgrammes: async () => unavailable,
    getProfileAssessment: async () => unavailable,
    getCompareList: async () => ({ ok: false, reason: 'unavailable', cause: 'unsupported' }),
    getPathlynksSnapshot: async () => unavailable,
    getJourneyMaps: async () => unavailable,
    getApplications: async () => unavailable,
    getVisaApplications: async () => unavailable,
    getFavourites: async () => unavailable,
    getSavedScholarships: async () => unavailable,
    getStatus: () => ({ privilegeCheck: 'unchecked' }),
  };
  const nowMs = opts.nowMs ?? Date.now;
  let cached: { at: number; identity: string; port: VidyseaPort } | undefined;
  let last: VidyseaPort = none;
  const current = async (): Promise<VidyseaPort> => {
    try {
      // Binding precedes ALL environment/CA/secret resolution, including encrypted credentials.
      const src = await store.sources.get('vidysea-db');
      if (!src || src.kind !== 'postgres' || opts.siteId !== 'vidysea' || src.siteId !== opts.siteId || src.config.platform !== 'vidysea') return last = none;
      const ref = boundEnvRef(src, opts.seeded, opts.siteId);
      if (!ref) return last = none;
      const identity = JSON.stringify([src.siteId, src.kind, src.config, src.hasSecret]);
      const at = nowMs();
      if (cached && cached.identity === identity && at - cached.at < PORT_CACHE_MS) return last = cached.port;
      const password = src.hasSecret ? await store.sources.readSecret(src.id) : opts.env[ref];
      if (!password) return last = none;
      const c = src.config;
      const names = Array.isArray(c.tables) ? c.tables.filter((t): t is string => typeof t === 'string') : [];
      if (typeof c.host !== 'string' || typeof c.port !== 'number' || typeof c.database !== 'string' || typeof c.user !== 'string' || (c.sslmode !== 'require' && c.sslmode !== 'verify-full')) return last = none;
      // The connection was matched to trusted seed above. The private ref has no ambient fallback.
      const connection = { host: c.host, port: c.port, database: c.database, user: c.user, sslmode: c.sslmode, passwordRef: 'VIDYSEA_DB_PORT_PASSWORD', caFileRef: 'VIDYSEA_DB_CA_FILE' } as const;
      const port = createVidyseaPort({
        allowedTables: names,
        tables: { profile: 'users', student: 'students', shortlist: 'student_shortlisted_courses', assessment: 'ai_profile_assessments', ...(names.includes('pathlynks_student_snapshot') ? { snapshot: 'pathlynks_student_snapshot' } : {}) },
        connection,
        // D-123: Vidysea's own privileged-role override (reads stay read-only); never inherited from the Pathlynks flag.
        allowPrivilegedRole: opts.env.VIDYSEA_ALLOW_PRIVILEGED_ROLE === '1',
        credentialBinding: { platform: 'vidysea', siteId: opts.siteId, sourceId: src.id, seed: connection },
        env: { VIDYSEA_DB_PORT_PASSWORD: password, VIDYSEA_DB_CA_FILE: opts.env.VIDYSEA_DB_CA_FILE },
        ...(opts.connect ? { connect: opts.connect } : {}),
        ...(opts.onEvent ? { onEvent: opts.onEvent } : {}),
      });
      cached = { at, identity, port };
      return last = port;
    } catch { return last = none; }
  };
  return {
    getStudentProfile: async id => (await current()).getStudentProfile(id),
    getShortlistedProgrammes: async id => (await current()).getShortlistedProgrammes(id),
    getProfileAssessment: async id => (await current()).getProfileAssessment(id),
    getPathlynksSnapshot: async id => (await current()).getPathlynksSnapshot(id),
    getJourneyMaps: async id => (await current()).getJourneyMaps(id),
    getApplications: async id => (await current()).getApplications(id),
    getVisaApplications: async id => (await current()).getVisaApplications(id),
    getFavourites: async id => (await current()).getFavourites(id),
    getSavedScholarships: async id => (await current()).getSavedScholarships(id),
    getCompareList: async id => none.getCompareList(id),
    getStatus: () => last.getStatus(),
  };
}

/** The Test-connection port for a Postgres source: the same port code as chat, one read-only probe on a dummy student id, mapped to a fixed cause. */
export function createPostgresTestPort(opts: { connect?: PortConnect; env?: Record<string, string | undefined> } = {}): AdminPostgresPort {
  return {
    async test(config, password, context) {
      if (!password || config.enabled === false) return { ok: false, cause: 'not_configured' };
      if (config.platform === 'vidysea') {
        if (!context) return { ok: false, cause: 'not_configured' };
        const source = context.source;
        const native = createLiveVidyseaPort({ sources: {
          get: async id => id === source.id ? { ...source, hasSecret: true } : null,
          readSecret: async id => id === source.id ? password : undefined,
        } } as Pick<AdminStore, 'sources'>, { env: opts.env ?? process.env, siteId: source.siteId, ...(context.seeded ? { seeded: context.seeded } : {}), ...(opts.connect ? { connect: opts.connect } : {}) });
        const result = await native.getStudentProfile('00000000-0000-4000-8000-000000000000');
        return result.ok ? { ok: true } : { ok: false, cause: result.cause };
      }
      const port = mcpPortFor(config, password, { ...(opts.connect ? { connect: opts.connect } : {}), allowPrivileged: (opts.env ?? process.env).PATHLYNKS_ALLOW_PRIVILEGED_ROLE, caFile: (opts.env ?? process.env).PATHLYNKS_DB_CA_FILE });
      if (!port) return { ok: false, cause: "not_configured" };
      const res = await port.getStudentProfile("connection-test");
      return res.ok ? { ok: true } : { ok: false, cause: res.cause };
    },
  };
}

/**
 * The stored navigation catalogue the `navigate_steps` tool reads: the newest `nav_catalogue` artifact among the site's GitHub sources (the frontend repo's
 * sync writes it). Cached for 60 s; nothing is fetched from GitHub at chat time. A missing artifact or a store failure is `undefined` ("I don't know that page yet").
 */
export function createNavCatalogueLoader(store: Pick<AdminStore, "sources" | "artifacts">, siteId: string, nowMs: () => number = Date.now): () => Promise<{ routes: { path: string }[] } | undefined> {
  let cached: { at: number; value: { routes: { path: string }[] } | undefined } | undefined;
  return async () => {
    const t = nowMs();
    if (cached && t - cached.at < PORT_CACHE_MS) return cached.value;
    let value: { routes: { path: string }[] } | undefined;
    try {
      let best: { builtAt: string; routes: { path: string }[] } | undefined;
      for (const s of await store.sources.list()) {
        if (s.kind !== "github" || s.siteId !== siteId || s.config.enabled === false) continue;
        const art = await store.artifacts.getLatest(s.id, "nav_catalogue");
        const routes = art?.data.routes;
        if (art && Array.isArray(routes) && (best === undefined || art.builtAt > best.builtAt)) best = { builtAt: art.builtAt, routes: routes as { path: string }[] };
      }
      value = best ? { routes: best.routes } : undefined;
    } catch {
      value = undefined;
    }
    cached = { at: t, value };
    return value;
  };
}
