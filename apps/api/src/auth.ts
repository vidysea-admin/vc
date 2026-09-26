/**
 * T-025 (contract B21, D-021): JWT verification for the VC API.
 *
 * New file (genuinely new functionality: apps/api had no auth). Every request carries a JWT issued
 * by the client backend (for Pathlynks, its backend); VC has no login and no password store. This
 * module turns a bearer token into a verified AuthContext {tenantId, counsellorId, role}, or throws
 * AuthError. The caller maps every AuthError to the same 401 and reads or writes nothing.
 *
 * What is checked (jose `jwtVerify`, then our own claim checks):
 *   - signature, with a STRICT algorithm allow-list: RS256 / ES256 by default. HS256 only when
 *     explicitly configured, and then ALONE with its own secret (never alongside an asymmetric key,
 *     so a public key can never be used as an HMAC secret: no algorithm confusion). "none" and any
 *     unknown name are configuration errors. With a PEM public key the allow-list is narrowed to
 *     that key's own algorithm (an RSA key verifies RS256 only, a P-256 key ES256 only);
 *   - `exp` required; `exp` / `nbf` checked with a small clock skew (VC_JWT_CLOCK_SKEW_SEC,
 *     default 30 s, at most 300 s);
 *   - `iss` must equal VC_JWT_ISSUER; `aud` must include VC_JWT_AUDIENCE when that is set;
 *   - the claims VC needs: `tenant` (a tenant id, TENANT_ID_PATTERN), `counsellorId` (1-128
 *     characters, no control characters) and `role` ("counsellor" or "admin").
 *
 * Keys and issuer come from the environment (B11: names in .env.example, values never in the
 * tree). The real issuer, key distribution and rotation are an open question (D-021 §6), so the
 * key source is configurable: exactly one of VC_JWT_PUBLIC_KEY (PEM SPKI), VC_JWT_JWKS_URL (https,
 * rotation-friendly) or VC_JWT_HS256_SECRET (only with VC_JWT_ALGORITHMS=HS256).
 *
 * Never logs or returns a token, a claim value or a key. AuthError carries a short `reason` code
 * for tests and server-side diagnostics only; the HTTP response never includes it.
 */
import { createPublicKey, type KeyObject } from "node:crypto";
import { createRemoteJWKSet, customFetch, jwtVerify, type FetchImplementation, type JWTPayload } from "jose";
import { TENANT_ID_PATTERN } from "@vc/db";

export const JWT_ALGORITHMS = ["RS256", "ES256", "HS256"] as const;
export type JwtAlgorithm = (typeof JWT_ALGORITHMS)[number];

export const API_ROLES = ["counsellor", "admin"] as const;
export type ApiRole = (typeof API_ROLES)[number];

/** The verified identity of one request. */
export interface AuthContext {
  tenantId: string;
  counsellorId: string;
  role: ApiRole;
}

export interface JwtVerifier {
  /** Resolves the verified context, or rejects with AuthError. Never reads the database. */
  verify(token: string): Promise<AuthContext>;
}

export type JwtKeySource =
  | { kind: "public_key"; key: KeyObject; algorithm: "RS256" | "ES256" }
  | { kind: "jwks"; url: URL }
  | { kind: "hs256"; secret: Uint8Array };

export interface JwtConfig {
  issuer: string;
  audience?: string;
  algorithms: JwtAlgorithm[];
  clockToleranceSec: number;
  keySource: JwtKeySource;
}

/** A misconfigured verifier: thrown at startup, never per request. Names the variable, never its value. */
export class JwtConfigError extends Error {
  constructor(message: string) {
    super(`JwtConfigError: ${message}`);
    this.name = "JwtConfigError";
  }
}

export type AuthFailureReason =
  | "missing"
  | "malformed"
  | "algorithm"
  | "signature"
  | "expired"
  | "not_yet_valid"
  | "issuer"
  | "audience"
  | "claims"
  | "key"
  | "invalid";

/** Every authentication failure. The API answers all of them with the same 401 body. */
export class AuthError extends Error {
  readonly reason: AuthFailureReason;
  constructor(reason: AuthFailureReason) {
    super(`AuthError: the bearer token was rejected (${reason})`);
    this.name = "AuthError";
    this.reason = reason;
  }
}

export const DEFAULT_CLOCK_SKEW_SEC = 30;
export const MAX_CLOCK_SKEW_SEC = 300;
/** A token longer than this is refused before any parsing. */
export const MAX_TOKEN_LENGTH = 8192;
const MIN_HS256_SECRET_BYTES = 32;

/** The environment variable names (B11: values live only in .env). */
export const JWT_ENV = {
  issuer: "VC_JWT_ISSUER",
  audience: "VC_JWT_AUDIENCE",
  algorithms: "VC_JWT_ALGORITHMS",
  publicKey: "VC_JWT_PUBLIC_KEY",
  jwksUrl: "VC_JWT_JWKS_URL",
  hs256Secret: "VC_JWT_HS256_SECRET",
  clockSkewSec: "VC_JWT_CLOCK_SKEW_SEC",
} as const;

function nonEmpty(env: Record<string, string | undefined>, name: string): string | undefined {
  const value = env[name];
  return value === undefined || value.trim() === "" ? undefined : value;
}

function parseAlgorithms(raw: string | undefined): JwtAlgorithm[] {
  const names = (raw ?? "RS256,ES256")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (names.length === 0) throw new JwtConfigError(`${JWT_ENV.algorithms} lists no algorithm`);
  const out: JwtAlgorithm[] = [];
  for (const name of names) {
    if (name.toLowerCase() === "none") throw new JwtConfigError(`${JWT_ENV.algorithms} may never include "none"`);
    if (!(JWT_ALGORITHMS as readonly string[]).includes(name)) {
      throw new JwtConfigError(`${JWT_ENV.algorithms}: only ${JWT_ALGORITHMS.join(", ")} are allowed`);
    }
    if (!out.includes(name as JwtAlgorithm)) out.push(name as JwtAlgorithm);
  }
  return out;
}

/** The algorithm a PEM public key verifies (RSA >= 2048 bits -> RS256, EC P-256 -> ES256), else a config error. */
function publicKeyAlgorithm(key: KeyObject): "RS256" | "ES256" {
  const details = key.asymmetricKeyDetails ?? {};
  if (key.asymmetricKeyType === "rsa") {
    if ((details.modulusLength ?? 0) < 2048) throw new JwtConfigError(`${JWT_ENV.publicKey}: an RSA key must be at least 2048 bits`);
    return "RS256";
  }
  if (key.asymmetricKeyType === "ec" && details.namedCurve === "prime256v1") return "ES256";
  throw new JwtConfigError(`${JWT_ENV.publicKey}: only an RSA (RS256) or EC P-256 (ES256) public key is supported`);
}

/**
 * Reads and validates the JWT configuration. Throws JwtConfigError (naming the variable, never
 * echoing its value) on anything missing, ambiguous or unsafe.
 */
export function jwtConfigFromEnv(env: Record<string, string | undefined>): JwtConfig {
  const issuer = nonEmpty(env, JWT_ENV.issuer);
  if (!issuer) throw new JwtConfigError(`${JWT_ENV.issuer} is not set (see .env.example)`);
  const audience = nonEmpty(env, JWT_ENV.audience);
  const algorithms = parseAlgorithms(nonEmpty(env, JWT_ENV.algorithms));

  const skewRaw = nonEmpty(env, JWT_ENV.clockSkewSec);
  const clockToleranceSec = skewRaw === undefined ? DEFAULT_CLOCK_SKEW_SEC : Number(skewRaw);
  if (!Number.isInteger(clockToleranceSec) || clockToleranceSec < 0 || clockToleranceSec > MAX_CLOCK_SKEW_SEC) {
    throw new JwtConfigError(`${JWT_ENV.clockSkewSec} must be a whole number of seconds from 0 to ${MAX_CLOCK_SKEW_SEC}`);
  }

  const pem = nonEmpty(env, JWT_ENV.publicKey);
  const jwks = nonEmpty(env, JWT_ENV.jwksUrl);
  const secret = nonEmpty(env, JWT_ENV.hs256Secret);
  const sources = [pem, jwks, secret].filter((s) => s !== undefined).length;
  if (sources !== 1) {
    throw new JwtConfigError(`set exactly one of ${JWT_ENV.publicKey}, ${JWT_ENV.jwksUrl} or ${JWT_ENV.hs256Secret}`);
  }

  if (algorithms.includes("HS256")) {
    // Symmetric keys never share an allow-list with asymmetric ones (algorithm confusion).
    if (algorithms.length !== 1) throw new JwtConfigError(`${JWT_ENV.algorithms}: HS256 must be the only algorithm when it is used`);
    if (!secret) throw new JwtConfigError(`HS256 needs ${JWT_ENV.hs256Secret} (never a public key or a JWKS)`);
    const bytes = new TextEncoder().encode(secret);
    if (bytes.length < MIN_HS256_SECRET_BYTES) {
      throw new JwtConfigError(`${JWT_ENV.hs256Secret} must be at least ${MIN_HS256_SECRET_BYTES} bytes`);
    }
    return { issuer, audience, algorithms, clockToleranceSec, keySource: { kind: "hs256", secret: bytes } };
  }
  if (secret) throw new JwtConfigError(`${JWT_ENV.hs256Secret} is set but ${JWT_ENV.algorithms} does not name HS256`);

  if (pem) {
    let key: KeyObject;
    try {
      // .env files hold one line: a literal "\n" stands for a newline in the PEM.
      key = createPublicKey(pem.replace(/\\n/g, "\n"));
    } catch {
      throw new JwtConfigError(`${JWT_ENV.publicKey} is not a readable PEM public key`);
    }
    const algorithm = publicKeyAlgorithm(key);
    if (!algorithms.includes(algorithm)) {
      throw new JwtConfigError(`${JWT_ENV.publicKey} is a ${algorithm} key but ${JWT_ENV.algorithms} does not allow ${algorithm}`);
    }
    return { issuer, audience, algorithms: [algorithm], clockToleranceSec, keySource: { kind: "public_key", key, algorithm } };
  }

  let url: URL;
  try {
    url = new URL(jwks!);
  } catch {
    throw new JwtConfigError(`${JWT_ENV.jwksUrl} is not a URL`);
  }
  if (url.protocol !== "https:") throw new JwtConfigError(`${JWT_ENV.jwksUrl} must be an https URL`);
  return { issuer, audience, algorithms, clockToleranceSec, keySource: { kind: "jwks", url } };
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const COMPACT_JWS = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

function reasonFor(err: unknown): AuthFailureReason {
  const e = err as { code?: unknown; claim?: unknown } | null;
  switch (e?.code) {
    case "ERR_JWT_EXPIRED":
      return "expired";
    case "ERR_JWT_CLAIM_VALIDATION_FAILED":
      if (e.claim === "nbf") return "not_yet_valid";
      if (e.claim === "iss") return "issuer";
      if (e.claim === "aud") return "audience";
      return "claims";
    case "ERR_JWS_SIGNATURE_VERIFICATION_FAILED":
      return "signature";
    case "ERR_JOSE_ALG_NOT_ALLOWED":
      return "algorithm";
    case "ERR_JWS_INVALID":
    case "ERR_JWT_INVALID":
      return "malformed";
    case "ERR_JWKS_NO_MATCHING_KEY":
    case "ERR_JWKS_MULTIPLE_MATCHING_KEYS":
    case "ERR_JWKS_INVALID":
    case "ERR_JWKS_TIMEOUT":
      return "key";
    default:
      return "invalid";
  }
}

/** Our own checks on the three claims VC needs, after jose has verified signature and times. */
function contextFrom(payload: JWTPayload): AuthContext {
  const { tenant, counsellorId, role } = payload as Record<string, unknown>;
  if (typeof tenant !== "string" || !TENANT_ID_PATTERN.test(tenant)) throw new AuthError("claims");
  if (typeof counsellorId !== "string" || counsellorId.trim() === "" || counsellorId.length > 128 || CONTROL_CHARS.test(counsellorId)) {
    throw new AuthError("claims");
  }
  if (typeof role !== "string" || !(API_ROLES as readonly string[]).includes(role)) throw new AuthError("claims");
  return { tenantId: tenant, counsellorId, role: role as ApiRole };
}

export interface JwtVerifierOptions {
  /** Tests only: the JWKS fetch (offline); production uses the global fetch against the https URL. */
  jwksFetch?: FetchImplementation;
}

/** Builds the verifier once at startup. Performs no I/O itself (a JWKS is fetched on first use). */
export function createJwtVerifier(config: JwtConfig, options: JwtVerifierOptions = {}): JwtVerifier {
  const source = config.keySource;
  const key =
    source.kind === "jwks"
      ? createRemoteJWKSet(source.url, options.jwksFetch ? { [customFetch]: options.jwksFetch } : undefined)
      : source.kind === "hs256"
        ? source.secret
        : source.key;
  const verifyOptions = {
    issuer: config.issuer,
    ...(config.audience !== undefined ? { audience: config.audience } : {}),
    algorithms: [...config.algorithms],
    clockTolerance: config.clockToleranceSec,
    requiredClaims: ["exp", "iss", "tenant", "counsellorId", "role"],
  };
  return {
    async verify(token: string): Promise<AuthContext> {
      if (typeof token !== "string" || token.length === 0) throw new AuthError("missing");
      if (token.length > MAX_TOKEN_LENGTH || !COMPACT_JWS.test(token)) throw new AuthError("malformed");
      let payload: JWTPayload;
      try {
        ({ payload } = await jwtVerify(token, key as Parameters<typeof jwtVerify>[1], verifyOptions));
      } catch (err) {
        throw new AuthError(reasonFor(err));
      }
      return contextFrom(payload);
    },
  };
}

/**
 * The token from an `Authorization: Bearer <token>` header value, or undefined. The scheme is
 * case-insensitive (RFC 7235); anything else (Basic, a bare token, extra parts) is undefined.
 */
export function bearerToken(header: string | undefined): string | undefined {
  if (typeof header !== "string") return undefined;
  const m = /^Bearer +([^\s]+)\s*$/i.exec(header);
  return m ? m[1] : undefined;
}
