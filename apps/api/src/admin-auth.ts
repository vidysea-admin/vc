/**
 * vc-admin-control VA4 (spec S3): admin passwords, the admin JWT and the login rate limit.
 *
 *  - Passwords: scrypt (N=2^15, r=8, p=1, 16-byte random salt), stored as `scrypt$N$r$p$<salt b64url>$<hash b64url>`, compared in constant time.
 *    `verifyPassword` never throws on a malformed stored hash (it answers false) and always spends one scrypt, so the cost does not tell a
 *    caller whether the account exists (see `DUMMY_HASH`).
 *  - Token: HS256 with VC_ADMIN_JWT_SECRET (>= 32 characters), 8 h, claims `{sub, role, typ:"vc-admin"}`. `verifyAdminToken` pins the algorithm
 *    to HS256 (so `alg:none` and any other algorithm are refused) and requires `typ === "vc-admin"`: a voice ticket, a student JWT or a
 *    counsellor JWT, even one signed with the same secret, carries no such claim and is refused. The clock is injectable.
 *  - Login limit: 5 attempts per minute per client key (the nginx X-Real-IP value, as for the other public routes). In memory, per process.
 *    A correct password does not bypass the limit once it is hit: the check runs before the password is looked at.
 *
 * This module is the only place admin password hashing and admin token signing happen. Partner API keys are NOT hashed here (VA7): they keep
 * their own HMAC path in partners.ts.
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

import { ADMIN_ROLES, type AdminRole } from "@vc/db";

import { AnonymousRateLimiter, type LimiterVerdict } from "./anonymous.js";

export const ADMIN_JWT_TYP = "vc-admin";
export const ADMIN_JWT_SECRET_ENV = "VC_ADMIN_JWT_SECRET";
export const ADMIN_TOKEN_TTL_SEC = 8 * 60 * 60;
export const ADMIN_MIN_SECRET_CHARS = 32;
export const ADMIN_PASSWORD_MIN_CHARS = 12;
export const ADMIN_PASSWORD_MAX_CHARS = 256;

export const SCRYPT_N = 1 << 15;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const SCRYPT_SALT_BYTES = 16;
/** scrypt needs 128 * N * r bytes (32 MiB here); node's default cap is exactly that, so leave headroom. */
const SCRYPT_MAXMEM = 128 * 1024 * 1024;

function scryptAsync(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

const params = (n: number, r: number, p: number): ScryptOptions => ({ N: n, r, p, maxmem: SCRYPT_MAXMEM });

/** A password acceptable for a NEW admin: 12 to 256 characters. (Login accepts anything up to the max, so an old short password is not leaked by an error.) */
export function passwordPolicyError(password: unknown): string | undefined {
  if (typeof password !== "string") return "password must be a string";
  if (password.length < ADMIN_PASSWORD_MIN_CHARS) return `password must be at least ${ADMIN_PASSWORD_MIN_CHARS} characters`;
  if (password.length > ADMIN_PASSWORD_MAX_CHARS) return `password must be at most ${ADMIN_PASSWORD_MAX_CHARS} characters`;
  return undefined;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const key = await scryptAsync(password, salt, SCRYPT_KEYLEN, params(SCRYPT_N, SCRYPT_R, SCRYPT_P));
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

/** A well-formed hash of a password nobody knows, made once: verifying against it costs the same as a real account. */
let dummyHash: Promise<string> | undefined;
const DUMMY_HASH = (): Promise<string> => (dummyHash ??= hashPassword(randomBytes(24).toString("base64url")));

/** Constant-time check. Any malformed, truncated or unknown-scheme stored value answers false (never throws). */
export async function verifyPassword(password: unknown, stored: unknown): Promise<boolean> {
  const pw = typeof password === "string" && password.length <= ADMIN_PASSWORD_MAX_CHARS ? password : "";
  const parts = typeof stored === "string" ? stored.split("$") : [];
  const ok = parts.length === 6 && parts[0] === "scrypt" && typeof password === "string" && password.length <= ADMIN_PASSWORD_MAX_CHARS;
  if (!ok) {
    // Spend the same scrypt either way so timing does not separate "no such account / bad hash" from "wrong password".
    await scryptAsync(pw, randomBytes(SCRYPT_SALT_BYTES), SCRYPT_KEYLEN, params(SCRYPT_N, SCRYPT_R, SCRYPT_P)).catch(() => undefined);
    return false;
  }
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  // Only the parameters this module writes are accepted: a stored hash cannot ask for a huge N and turn a login into a memory attack.
  if (n !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P) {
    await scryptAsync(pw, randomBytes(SCRYPT_SALT_BYTES), SCRYPT_KEYLEN, params(SCRYPT_N, SCRYPT_R, SCRYPT_P)).catch(() => undefined);
    return false;
  }
  let salt: Buffer;
  let want: Buffer;
  try {
    salt = Buffer.from(parts[4]!, "base64url");
    want = Buffer.from(parts[5]!, "base64url");
  } catch {
    return false;
  }
  if (salt.length !== SCRYPT_SALT_BYTES || want.length !== SCRYPT_KEYLEN) {
    await scryptAsync(pw, randomBytes(SCRYPT_SALT_BYTES), SCRYPT_KEYLEN, params(SCRYPT_N, SCRYPT_R, SCRYPT_P)).catch(() => undefined);
    return false;
  }
  try {
    const got = await scryptAsync(password as string, salt, SCRYPT_KEYLEN, params(n, r, p));
    return got.length === want.length && timingSafeEqual(got, want);
  } catch {
    return false;
  }
}

/** Login for an unknown / disabled account: the same work as a wrong password, then false. */
export async function burnPasswordCheck(password: unknown): Promise<false> {
  await verifyPassword(password, await DUMMY_HASH());
  return false;
}

/** The signing secret as bytes, or undefined (admin console not configured). Shorter than 32 characters is a startup error, not a weak key. */
export function adminJwtSecretFromEnv(env: Record<string, string | undefined>): Uint8Array | undefined {
  const raw = env[ADMIN_JWT_SECRET_ENV];
  if (raw === undefined || raw === "") return undefined;
  if (raw.length < ADMIN_MIN_SECRET_CHARS) throw new Error(`${ADMIN_JWT_SECRET_ENV} must be at least ${ADMIN_MIN_SECRET_CHARS} characters`);
  return new TextEncoder().encode(raw);
}

export interface AdminClaims {
  /** The admin's normalised e-mail (the user's `_id` in `admin_users`). */
  sub: string;
  role: AdminRole;
}

export async function signAdminToken(claims: AdminClaims, secret: Uint8Array, nowMs: number): Promise<{ token: string; exp: number }> {
  const iat = Math.floor(nowMs / 1000);
  const exp = iat + ADMIN_TOKEN_TTL_SEC;
  const token = await new SignJWT({ role: claims.role, typ: ADMIN_JWT_TYP })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(secret);
  return { token, exp };
}

/** The verified claims, or undefined for ANY problem (the caller answers one generic 401 and never learns which). */
export async function verifyAdminToken(token: string, secret: Uint8Array, nowMs: number): Promise<AdminClaims | undefined> {
  if (typeof token !== "string" || token === "" || token.length > 4096) return undefined;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"], currentDate: new Date(nowMs), requiredClaims: ["exp", "sub"] });
    if (payload.typ !== ADMIN_JWT_TYP) return undefined;
    if (typeof payload.sub !== "string" || payload.sub === "") return undefined;
    const role = payload.role;
    if (typeof role !== "string" || !(ADMIN_ROLES as readonly string[]).includes(role)) return undefined;
    return { sub: payload.sub, role: role as AdminRole };
  } catch {
    return undefined;
  }
}

export const LOGIN_LIMIT = 5;
export const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_KEYS = 10_000;

/** The 5-per-minute-per-client limiter (in memory). A rejected attempt is not recorded; `check` runs BEFORE the password is read. */
export function createLoginLimiter(nowMs: () => number): { check(clientKey: string | undefined): LimiterVerdict } {
  const limiter = new AnonymousRateLimiter({ limit: LOGIN_LIMIT, windowMs: LOGIN_WINDOW_MS, maxKeys: LOGIN_MAX_KEYS, nowMs });
  return { check: (k) => limiter.check(k) };
}
