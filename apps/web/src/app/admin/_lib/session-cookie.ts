/**
 * vc-admin-control S8 / VA19: the admin JWT cookie. Set only by the Next route handler (never by page script), so it is HttpOnly;
 * SameSite=Strict; Secure everywhere except the loopback hosts a developer uses (a Secure cookie is dropped on plain http://localhost).
 */
export const SESSION_COOKIE_NAME = "vc_admin_session";
/** The admin JWT lives 8 h (S3); the cookie does not outlive it. */
export const SESSION_MAX_AGE_SEC = 8 * 60 * 60;

/** A JWT (or any dot-separated base64url token). Anything that could split a header or add an attribute is refused. */
const TOKEN_PATTERN = /^[A-Za-z0-9._~+/=-]{1,4096}$/;

export function isTokenShaped(token: unknown): token is string {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Exact loopback names only: `localhost.evil.test` and `127.0.0.1.nip.io` are not local. */
export function isLocalHost(hostname: string): boolean {
  return LOOPBACK.has(hostname.trim().toLowerCase());
}

export interface CookieOptions {
  secure: boolean;
}

export function buildSessionCookie(token: string, opts: CookieOptions): string {
  if (!isTokenShaped(token)) throw new Error("admin session token is not cookie-safe");
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; Max-Age=${SESSION_MAX_AGE_SEC}; HttpOnly; SameSite=Strict${opts.secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(opts: CookieOptions): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${opts.secure ? "; Secure" : ""}`;
}

/** Secure unless the request is plain http on a loopback host (a TLS-terminating proxy is detected by x-forwarded-proto). */
export function cookieOptionsFor(req: Request): CookieOptions {
  const url = new URL(req.url);
  const forwarded = (req.headers.get("x-forwarded-proto") ?? "").split(",")[0].trim().toLowerCase();
  const https = url.protocol === "https:" || forwarded === "https";
  return { secure: https || !isLocalHost(url.hostname) };
}

/** Reads one cookie from a Cookie header. */
export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}
