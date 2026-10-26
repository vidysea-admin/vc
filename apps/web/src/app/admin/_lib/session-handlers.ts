/**
 * vc-admin-control S8 / VA19: the logic behind the Next route handlers under api/admin-session.
 *   POST   /api/admin-session          login: checks the credentials with the admin API (S3 POST /admin/api/login), sets the httpOnly cookie, returns the token for in-memory use.
 *   GET    /api/admin-session          reload: re-validates the cookie against GET /admin/api/me and hands the token back to the page's memory.
 *   DELETE /api/admin-session          logout: clears the cookie.
 *   *      /api/admin-session/proxy/*  same-origin pass-through to /admin/api/*; authorised by the Authorization header ONLY (the cookie alone authorises nothing, so a cross-site request carries no power).
 * Upstream wording is never echoed: the page sees fixed error codes.
 */
import { ROLES } from "./permissions";
import type { AdminRole } from "./types";
import { clearSessionCookie, buildSessionCookie, cookieOptionsFor, isTokenShaped, readCookie, SESSION_COOKIE_NAME } from "./session-cookie";

export const ADMIN_SESSION_COOKIE = SESSION_COOKIE_NAME;
export const UPSTREAM_ENV = "VC_ADMIN_API_URL";

const BODY_LIMIT = 64 * 1024;
const LOGIN_BODY_LIMIT = 8 * 1024;
const UPSTREAM_TIMEOUT_MS = 15_000;
const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}$/;
const BEARER = /^Bearer ([A-Za-z0-9._~+/=-]{1,4096})$/;
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export interface SessionDeps {
  /** Origin of the admin API (env VC_ADMIN_API_URL). Absent = not configured. */
  upstreamBase: string | undefined;
  fetch: typeof fetch;
  /** Per-e-mail login budget. Absent = no per-e-mail limit at this layer (the admin API still limits per client). */
  loginGuard?: LoginGuard;
}

export function defaultDeps(env: Record<string, string | undefined> = process.env): SessionDeps {
  const raw = env[UPSTREAM_ENV]?.trim();
  return { upstreamBase: raw ? raw.replace(/\/+$/, "") : undefined, fetch: (...args) => fetch(...args), loginGuard: sharedLoginGuard };
}

const JSON_HEADERS = { "content-type": "application/json", "cache-control": "no-store" };

function reply(status: number, body: unknown, cookie?: string): Response {
  const headers = new Headers(JSON_HEADERS);
  if (cookie) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

function isRole(v: unknown): v is AdminRole {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

/**
 * Only the address the reverse proxy sets (x-real-ip) is forwarded. The first X-Forwarded-For value is whatever the caller wrote, so trusting it would
 * let an attacker pick a fresh limiter key on every request; a Route Handler has no socket address, so with no x-real-ip no address is forwarded.
 */
function clientAddress(req: Request): string | undefined {
  const v = req.headers.get("x-real-ip")?.trim();
  return v && /^[0-9a-fA-F:.]{2,45}$/.test(v) ? v : undefined;
}

async function readLimited(req: Request, limit: number): Promise<string | "too_large"> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) return "too_large";
  const text = await req.text();
  return text.length > limit ? "too_large" : text;
}

async function upstream(deps: SessionDeps, path: string, init: RequestInit): Promise<Response | "down"> {
  try {
    return await deps.fetch(`${deps.upstreamBase}${path}`, { ...init, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS), redirect: "manual" });
  } catch {
    return "down";
  }
}

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  try {
    const v: unknown = await res.json();
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function handleSessionLogin(req: Request, deps: SessionDeps): Promise<Response> {
  if (!deps.upstreamBase) return reply(503, { error: "admin_api_not_configured" });
  const raw = await readLimited(req, LOGIN_BODY_LIMIT);
  if (raw === "too_large") return reply(400, { error: "bad_request" });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return reply(400, { error: "bad_request" });
  }
  const b = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const email = b.email;
  const password = b.password;
  if (typeof email !== "string" || email.length < 3 || email.length > 254 || typeof password !== "string" || password.length < 1 || password.length > 1024) {
    return reply(400, { error: "bad_request" });
  }
  if (deps.loginGuard && !deps.loginGuard.check(`email:${email.trim().toLowerCase()}`)) return reply(429, { error: "too_many_attempts" });
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
  const ip = clientAddress(req);
  if (ip) headers["x-real-ip"] = ip;
  const res = await upstream(deps, "/admin/api/login", { method: "POST", headers, body: JSON.stringify({ email, password }) });
  if (res === "down") return reply(502, { error: "upstream_unavailable" });
  if (res.status === 429) return reply(429, { error: "too_many_attempts" });
  if (res.status === 400 || res.status === 401 || res.status === 403) return reply(401, { error: "invalid_credentials" });
  if (!res.ok) return reply(502, { error: "upstream_error" });
  const out = await jsonOf(res);
  if (!isTokenShaped(out.token) || !isRole(out.role)) return reply(502, { error: "upstream_error" });
  const cookie = buildSessionCookie(out.token, cookieOptionsFor(req));
  return reply(200, { token: out.token, role: out.role, email: typeof out.email === "string" ? out.email : email }, cookie);
}

export async function handleSessionGet(req: Request, deps: SessionDeps): Promise<Response> {
  if (!deps.upstreamBase) return reply(503, { error: "admin_api_not_configured" });
  const token = readCookie(req.headers.get("cookie"), SESSION_COOKIE_NAME);
  if (!isTokenShaped(token)) return reply(401, { error: "no_session" });
  const res = await upstream(deps, "/admin/api/me", { method: "GET", headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
  if (res === "down") return reply(502, { error: "upstream_unavailable" });
  if (res.status === 401 || res.status === 403) return reply(401, { error: "session_expired" }, clearSessionCookie(cookieOptionsFor(req)));
  if (!res.ok) return reply(502, { error: "upstream_error" });
  const me = await jsonOf(res);
  if (!isRole(me.role)) return reply(502, { error: "upstream_error" });
  return reply(200, { token, role: me.role, email: typeof me.email === "string" ? me.email : "" });
}

export async function handleSessionDelete(req: Request, _deps: SessionDeps): Promise<Response> {
  return reply(200, { ok: true }, clearSessionCookie(cookieOptionsFor(req)));
}

export async function handleProxy(req: Request, segments: readonly string[], deps: SessionDeps): Promise<Response> {
  if (!deps.upstreamBase) return reply(503, { error: "admin_api_not_configured" });
  if (segments.length === 0 || segments.length > 6 || !segments.every(s => SEGMENT.test(s) && !s.includes(".."))) return reply(400, { error: "bad_request" });
  const bearer = BEARER.exec(req.headers.get("authorization") ?? "");
  if (!bearer) return reply(401, { error: "no_session" });
  const method = req.method.toUpperCase();
  if (!METHODS.has(method)) return reply(405, { error: "method_not_allowed" });
  const search = new URL(req.url).search;
  if (search.length > 512) return reply(400, { error: "bad_request" });
  const headers: Record<string, string> = { authorization: `Bearer ${bearer[1]}`, accept: "application/json" };
  const ip = clientAddress(req);
  if (ip) headers["x-real-ip"] = ip;
  let body: string | undefined;
  if (method !== "GET") {
    const raw = await readLimited(req, BODY_LIMIT);
    if (raw === "too_large") return reply(413, { error: "payload_too_large" });
    if (raw !== "") {
      body = raw;
      headers["content-type"] = "application/json";
    }
  }
  const res = await upstream(deps, `/admin/api/${segments.join("/")}${search}`, { method, headers, body });
  if (res === "down") return reply(502, { error: "upstream_unavailable" });
  if (res.status >= 500) return reply(502, { error: "upstream_error" });
  const text = await res.text();
  return new Response(text.length > 2_000_000 ? "{}" : text, { status: res.status, headers: JSON_HEADERS });
}

export interface LoginGuard {
  /** True when this key may make another attempt now; false once it has used its budget for the window. */
  check(key: string): boolean;
}

/**
 * A per-key attempt budget (in memory, per server process). Keyed by e-mail it stops one account being guessed at from many addresses, which the
 * admin API's per-client limit alone cannot: this layer never forwards an attacker-supplied address, so it cannot know the client.
 *
 * Bounded at `maxKeys`, and it never fails closed (fix cycle 2, F3): when the table is full, expired keys go first, then the least recently used
 * one, so a flood of fresh attacker-chosen e-mails can never make a legitimate admin's first attempt a 429.
 */
export function createLoginGuard(opts: { limit?: number; windowMs?: number; maxKeys?: number; now?: () => number } = {}): LoginGuard {
  const limit = opts.limit ?? 5;
  const windowMs = opts.windowMs ?? 60_000;
  const maxKeys = Math.max(1, opts.maxKeys ?? 10_000);
  const now = opts.now ?? Date.now;
  // Insertion order = least recently used first: every touch deletes and re-inserts the key.
  const hits = new Map<string, number[]>();
  return {
    check(key) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((at) => t - at < windowMs);
      hits.delete(key);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      // Full: drop from the least recently used end (expired keys sit there), and if every key is still live, drop the least recently used one
      // anyway instead of refusing this attempt. O(1) amortised: a flood cannot turn each check into a full-table scan.
      for (const k of hits.keys()) {
        if (hits.size < maxKeys) break;
        hits.delete(k);
      }
      recent.push(t);
      hits.set(key, recent);
      return true;
    },
  };
}

const sharedLoginGuard = createLoginGuard();
