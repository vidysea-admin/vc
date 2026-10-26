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
 * a 401 with no row: there is no actor to record, and an anonymous flood must not be able to fill the log.
 *
 * Secrets: no response carries a stored secret, a password hash or the master key. `hasSecret` is the only signal. A created or rotated API key is
 * in that one response and nowhere else. Error bodies are fixed codes; no exception text is ever copied into a response, a log line or an audit row.
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
  fetchRepoFiles,
  parseNextAppRoutes,
  parseSequelizeMigrations,
  type GithubPort,
} from "@vc/engine";
import { SourceConfig, findSecretLikeFields, type SourcesFile } from "@vc/schemas";
import { createPathlynksPort, type PathlynksEvent, type PathlynksResult as McpPathlynksResult } from "@vc/mcp-pathlynks";
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

/** What the Postgres test port answers. `cause` is one of a fixed set; the route maps it to a fixed sentence. */
export interface PostgresTestResult {
  ok: boolean;
  cause?: string;
}
export interface AdminPostgresPort {
  /** Connects with the source's non-secret config and the password, runs the read-only checks, disconnects. Never throws a driver message. */
  test(config: Record<string, unknown>, password: string | undefined): Promise<PostgresTestResult>;
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

  async function login(req: ApiRequest): Promise<ApiResponse> {
    const d = deps!;
    const verdict = limiter.check(clientKey(req));
    if (!verdict.allowed) {
      await audit(UNKNOWN_ACTOR, "login", "login", false);
      return respond(429, { error: "rate_limited" }, { "retry-after": String(verdict.retryAfterSec) });
    }
    const body = await readJson(req);
    if (typeof body === "string") {
      await audit(UNKNOWN_ACTOR, "login", "login", false);
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
      await audit(user?.email ?? UNKNOWN_ACTOR, "login", "login", false);
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
      if (write && !(await audit(actor.email, route.action, result.target ?? target, result.ok))) return respond(500, { error: "audit_unavailable" });
      return result.res;
    } catch (e) {
      log({ level: "error", event: "admin_request_failed", route: segs[0] ?? "", error: errorLabel(e) });
      return respond(500, { error: "internal" });
    }
  };
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
const ok = (status: number, body: unknown, target?: string): Result => ({ res: respond(status, body), ok: true, ...(target === undefined ? {} : { target }) });

// ---------------------------------------------------------------------------------------------------------------- routes

function buildRoutes(d: AdminRoutesDeps, log: (l: Record<string, unknown>) => void): RouteDef[] {
  const nowMs = d.nowMs ?? Date.now;
  const partnersOrFail = (): PartnerOpContext | undefined => d.partnerCtx;
  const noPartners = (): Result => err(503, "partners_not_configured");
  const siteIdOf = (c: Ctx): string => c.segs[1]!;
  const sourceIdOf = (c: Ctx): string => c.segs[1]!;
  const partnerSummary = async (id: string) => (await listPartners(d.partnerStore)).find((p) => p.partnerId === id);

  /** The credential for a source: the encrypted secret when one is stored, else the env var its `*Ref` names (public repos need none). */
  async function credentialFor(src: SourceSummary): Promise<string | undefined> {
    if (src.hasSecret) return d.store.sources.readSecret(src.id);
    const ref = src.kind === "github" ? src.config.tokenRef : src.config.passwordRef;
    const value = typeof ref === "string" ? (d.env ?? process.env)[ref] : undefined;
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
        return ok(201, { partner, keys }, partner.partnerId);
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
        const partner = await updatePartner(d.partnerStore, siteIdOf(c), { ...(name === undefined ? {} : { name }), ...(origins === undefined ? {} : { origins }) });
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
        return ok(200, { partner: out.partner, key: out.key, scope: out.scope }, `${siteIdOf(c)}:${out.scope}`);
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
        const parsed = SourceConfig.safeParse(rest);
        if (!parsed.success) return err(400, "invalid_source");
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
        const out = await syncGithubSource(src);
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
      const out = await withTimeout(d.postgres.test(src.config, await credentialFor(src)), NETWORK_TIMEOUT_MS);
      return out.ok ? { ok: true, message: "Connection works." } : { ok: false, message: PG_CAUSE_TEXT[out.cause ?? ""] ?? "The database could not be reached." };
    } catch (e) {
      if (e instanceof SecretsError) return { ok: false, message: "The secrets store is not configured on this server." };
      return { ok: false, message: src.kind === "github" ? "The repository could not be read." : "The database could not be reached." };
    }
  }

  /** fetch -> parse -> artifacts.put -> sources.recordSync. A failed fetch records status "error" and leaves the previous artifact in place. */
  async function syncGithubSource(src: SourceSummary): Promise<{ status: "ok" | "error"; counts: Record<string, number>; message?: string }> {
    const fail = async (message: string): Promise<{ status: "error"; counts: Record<string, number>; message: string }> => {
      await d.store.sources.recordSync(src.id, { at: new Date(nowMs()).toISOString(), status: "error", counts: {} });
      return { status: "error", counts: {}, message };
    };
    if (!d.github) return fail("GitHub access is not configured on this server.");
    const cfg = src.config as { owner?: unknown; repo?: unknown; branch?: unknown; service?: unknown };
    if (typeof cfg.owner !== "string" || typeof cfg.repo !== "string" || typeof cfg.branch !== "string") return fail("The source configuration is incomplete.");
    let token: string | undefined;
    try {
      token = await credentialFor(src);
    } catch {
      return fail("The stored credential could not be read.");
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
        const catalogue = parseNextAppRoutes(paths);
        await d.store.artifacts.put({ sourceId: src.id, kind: "nav_catalogue", data: { routes: catalogue.routes } });
        const counts = { files: paths.length, routes: catalogue.routes.length };
        await d.store.sources.recordSync(src.id, { at: new Date(nowMs()).toISOString(), status: "ok", counts });
        return { status: "ok", counts };
      }
      const files = await withTimeout(
        fetchRepoFiles(port, coords, ["**/migrations/*.js", "**/migrations/*.cjs", "**/migrations/*.ts"], { redact: token === undefined ? [] : [token] }),
        NETWORK_TIMEOUT_MS * 5,
      );
      const schema = parseSequelizeMigrations(files);
      await d.store.artifacts.put({ sourceId: src.id, kind: "schema_map", data: { tables: schema.tables } });
      const counts = { files: files.length, tables: Object.keys(schema.tables).length, diagnostics: schema.diagnostics.length };
      await d.store.sources.recordSync(src.id, { at: new Date(nowMs()).toISOString(), status: "ok", counts });
      return { status: "ok", counts };
    } catch (e) {
      log({ level: "error", event: "admin_sync_failed", source: src.id, error: e instanceof GithubFetchError ? `GithubFetchError:${e.stage}` : errorLabel(e) });
      return fail(e instanceof GithubFetchError && e.stage === "limit" ? "The repository is too large to sync in one go." : "The repository could not be read.");
    }
  }

  return routes;
}

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
    if (await store.sources.get(s.id)) {
      existing++;
      continue;
    }
    const { kind, id, ...config } = s;
    await store.sources.upsert({ id, siteId: file.siteId, kind, config });
    created++;
  }
  return { created, existing };
}

export type GithubFetchFn = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

class GithubHttpError extends Error {
  constructor(readonly status: number) {
    super(`GitHub answered ${status}`);
    this.name = "GithubHttpError";
  }
}

const GithubTree = z.object({ tree: z.array(z.object({ path: z.string(), type: z.string().optional(), sha: z.string().optional(), size: z.number().optional() })), truncated: z.boolean().optional() });
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
      const parsed = GithubTree.parse(await get(`/repos/${seg(owner)}/${seg(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`));
      return { tree: parsed.tree, ...(parsed.truncated === undefined ? {} : { truncated: parsed.truncated }) };
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
export function adaptPathlynksPort(p: Pick<ReturnType<typeof createPathlynksPort>, "getStudentProfile" | "getSavedCareers" | "getCompareList" | "getAssessmentStatus">): EnginePathlynksPort {
  const one = (r: McpPathlynksResult) => (r.ok ? ({ status: "ok", data: r.rows[0] ?? null } as const) : ({ status: "unavailable" } as const));
  const many = (r: McpPathlynksResult) => (r.ok ? ({ status: "ok", data: r.rows } as const) : ({ status: "unavailable" } as const));
  return {
    getStudentProfile: async (id) => one(await p.getStudentProfile(id)),
    getSavedCareers: async (id) => many(await p.getSavedCareers(id)),
    getCompareList: async (id) => many(await p.getCompareList(id)),
    getAssessmentStatus: async (id) => one(await p.getAssessmentStatus(id)),
  };
}

const PORT_CACHE_MS = 60_000;

/** Which configured table backs each Pathlynks read (by name: students, saved_careers, compare_*, assessment*). Undefined when one is missing. */
export function pathlynksTablesFrom(tables: readonly string[]): { profile: string; savedCareers: string; compareList: string; assessment: string } | undefined {
  const pick = (re: RegExp) => tables.find((t) => re.test(t));
  const profile = pick(/student|profile/i);
  const savedCareers = pick(/saved/i);
  const compareList = pick(/compar/i);
  const assessment = pick(/assess/i);
  return profile && savedCareers && compareList && assessment ? { profile, savedCareers, compareList, assessment } : undefined;
}

type PortConnect = Parameters<typeof createPathlynksPort>[0]["connect"];

function mcpPortFor(cfg: Record<string, unknown>, password: string, extra: { onEvent?: (e: PathlynksEvent) => void; connect?: PortConnect; allowPrivileged?: string | undefined }) {
  const tableNames = Array.isArray(cfg.tables) ? cfg.tables.filter((t): t is string => typeof t === "string") : [];
  const tables = pathlynksTablesFrom(tableNames);
  if (!tables || typeof cfg.host !== "string" || typeof cfg.port !== "number" || typeof cfg.database !== "string" || typeof cfg.user !== "string") return undefined;
  return createPathlynksPort({
    allowedTables: tableNames,
    tables,
    connection: { host: cfg.host, port: cfg.port, database: cfg.database, user: cfg.user, sslmode: cfg.sslmode === "verify-full" ? "verify-full" : "require", passwordRef: "PATHLYNKS_PORT_PASSWORD" },
    env: { PATHLYNKS_PORT_PASSWORD: password, PATHLYNKS_ALLOW_PRIVILEGED_ROLE: extra.allowPrivileged },
    ...(extra.onEvent ? { onEvent: extra.onEvent } : {}),
    ...(extra.connect ? { connect: extra.connect } : {}),
  });
}

/**
 * The engine PathlynksPort the chat path uses, built LAZILY from the stored postgres source (console edits and a newly stored password apply within 60 s)
 * and failing closed: no source, no password or a missing table is `unavailable`, never a throw. The password is read per build (the encrypted secret,
 * else the env var the source names) and goes only into a private env object handed to the port.
 */
export function createLivePathlynksPort(
  store: Pick<AdminStore, "sources">,
  opts: { env: Record<string, string | undefined>; nowMs?: () => number; onEvent?: (e: PathlynksEvent) => void; connect?: PortConnect },
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
      const src = (await store.sources.list()).find((s) => s.kind === "postgres");
      if (!src) return none;
      const ref = (src.config as { passwordRef?: unknown }).passwordRef;
      const password = src.hasSecret ? await store.sources.readSecret(src.id) : typeof ref === "string" ? opts.env[ref] : undefined;
      if (!password) return none;
      const port = mcpPortFor(src.config, password, { ...(opts.onEvent ? { onEvent: opts.onEvent } : {}), ...(opts.connect ? { connect: opts.connect } : {}), allowPrivileged: opts.env.PATHLYNKS_ALLOW_PRIVILEGED_ROLE });
      return port ? adaptPathlynksPort(port) : none;
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
  };
}

/** The Test-connection port for a Postgres source: the same port code as chat, one read-only probe on a dummy student id, mapped to a fixed cause. */
export function createPostgresTestPort(opts: { connect?: PortConnect; env?: Record<string, string | undefined> } = {}): AdminPostgresPort {
  return {
    async test(config, password) {
      if (!password) return { ok: false, cause: "not_configured" };
      const port = mcpPortFor(config, password, { ...(opts.connect ? { connect: opts.connect } : {}), allowPrivileged: (opts.env ?? process.env).PATHLYNKS_ALLOW_PRIVILEGED_ROLE });
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
        if (s.kind !== "github" || s.siteId !== siteId) continue;
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
