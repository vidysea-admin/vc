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
 *     characters, no control characters) and `role` ("counsellor", "admin" or, T-029, "approver").
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

/** T-029: "approver" may only approve or reject B15 erasure requests (server.ts APPROVER). */
export const API_ROLES = ["counsellor", "admin", "approver"] as const;
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
  | "role"
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

/** The environment variable names one verifier reads. The counsellor API uses JWT_ENV; the student API uses STUDENT_JWT_ENV. */
export interface JwtEnvNames {
  issuer: string;
  audience: string;
  algorithms: string;
  publicKey: string;
  jwksUrl: string;
  hs256Secret: string;
  clockSkewSec: string;
}

function nonEmpty(env: Record<string, string | undefined>, name: string): string | undefined {
  const value = env[name];
  return value === undefined || value.trim() === "" ? undefined : value;
}

function parseAlgorithms(raw: string | undefined, names: JwtEnvNames): JwtAlgorithm[] {
  const listed = (raw ?? "RS256,ES256")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (listed.length === 0) throw new JwtConfigError(`${names.algorithms} lists no algorithm`);
  const out: JwtAlgorithm[] = [];
  for (const name of listed) {
    if (name.toLowerCase() === "none") throw new JwtConfigError(`${names.algorithms} may never include "none"`);
    if (!(JWT_ALGORITHMS as readonly string[]).includes(name)) {
      throw new JwtConfigError(`${names.algorithms}: only ${JWT_ALGORITHMS.join(", ")} are allowed`);
    }
    if (!out.includes(name as JwtAlgorithm)) out.push(name as JwtAlgorithm);
  }
  return out;
}

/** The algorithm a PEM public key verifies (RSA >= 2048 bits -> RS256, EC P-256 -> ES256), else a config error. */
function publicKeyAlgorithm(key: KeyObject, names: JwtEnvNames): "RS256" | "ES256" {
  const details = key.asymmetricKeyDetails ?? {};
  if (key.asymmetricKeyType === "rsa") {
    if ((details.modulusLength ?? 0) < 2048) throw new JwtConfigError(`${names.publicKey}: an RSA key must be at least 2048 bits`);
    return "RS256";
  }
  if (key.asymmetricKeyType === "ec" && details.namedCurve === "prime256v1") return "ES256";
  throw new JwtConfigError(`${names.publicKey}: only an RSA (RS256) or EC P-256 (ES256) public key is supported`);
}

/**
 * Reads and validates the JWT configuration. Throws JwtConfigError (naming the variable, never
 * echoing its value) on anything missing, ambiguous or unsafe.
 */
export function jwtConfigFromEnv(env: Record<string, string | undefined>, names: JwtEnvNames = JWT_ENV): JwtConfig {
  const issuer = nonEmpty(env, names.issuer);
  if (!issuer) throw new JwtConfigError(`${names.issuer} is not set (see .env.example)`);
  const audience = nonEmpty(env, names.audience);
  const algorithms = parseAlgorithms(nonEmpty(env, names.algorithms), names);

  const skewRaw = nonEmpty(env, names.clockSkewSec);
  const clockToleranceSec = skewRaw === undefined ? DEFAULT_CLOCK_SKEW_SEC : Number(skewRaw);
  if (!Number.isInteger(clockToleranceSec) || clockToleranceSec < 0 || clockToleranceSec > MAX_CLOCK_SKEW_SEC) {
    throw new JwtConfigError(`${names.clockSkewSec} must be a whole number of seconds from 0 to ${MAX_CLOCK_SKEW_SEC}`);
  }

  const pem = nonEmpty(env, names.publicKey);
  const jwks = nonEmpty(env, names.jwksUrl);
  const secret = nonEmpty(env, names.hs256Secret);
  const sources = [pem, jwks, secret].filter((s) => s !== undefined).length;
  if (sources !== 1) {
    throw new JwtConfigError(`set exactly one of ${names.publicKey}, ${names.jwksUrl} or ${names.hs256Secret}`);
  }

  if (algorithms.includes("HS256")) {
    // Symmetric keys never share an allow-list with asymmetric ones (algorithm confusion).
    if (algorithms.length !== 1) throw new JwtConfigError(`${names.algorithms}: HS256 must be the only algorithm when it is used`);
    if (!secret) throw new JwtConfigError(`HS256 needs ${names.hs256Secret} (never a public key or a JWKS)`);
    const bytes = new TextEncoder().encode(secret);
    if (bytes.length < MIN_HS256_SECRET_BYTES) {
      throw new JwtConfigError(`${names.hs256Secret} must be at least ${MIN_HS256_SECRET_BYTES} bytes`);
    }
    return { issuer, audience, algorithms, clockToleranceSec, keySource: { kind: "hs256", secret: bytes } };
  }
  if (secret) throw new JwtConfigError(`${names.hs256Secret} is set but ${names.algorithms} does not name HS256`);

  if (pem) {
    let key: KeyObject;
    try {
      // .env files hold one line: a literal "\n" stands for a newline in the PEM.
      key = createPublicKey(pem.replace(/\\n/g, "\n"));
    } catch {
      throw new JwtConfigError(`${names.publicKey} is not a readable PEM public key`);
    }
    const algorithm = publicKeyAlgorithm(key, names);
    if (!algorithms.includes(algorithm)) {
      throw new JwtConfigError(`${names.publicKey} is a ${algorithm} key but ${names.algorithms} does not allow ${algorithm}`);
    }
    return { issuer, audience, algorithms: [algorithm], clockToleranceSec, keySource: { kind: "public_key", key, algorithm } };
  }

  let url: URL;
  try {
    url = new URL(jwks!);
  } catch {
    throw new JwtConfigError(`${names.jwksUrl} is not a URL`);
  }
  if (url.protocol !== "https:") throw new JwtConfigError(`${names.jwksUrl} must be an https URL`);
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

function verificationKey(config: JwtConfig, options: JwtVerifierOptions): Parameters<typeof jwtVerify>[1] {
  const source = config.keySource;
  return (
    source.kind === "jwks"
      ? createRemoteJWKSet(source.url, options.jwksFetch ? { [customFetch]: options.jwksFetch } : undefined)
      : source.kind === "hs256"
        ? source.secret
        : source.key
  ) as Parameters<typeof jwtVerify>[1];
}

function verifyOptionsOf(config: JwtConfig, requiredClaims: string[]) {
  return {
    issuer: config.issuer,
    ...(config.audience !== undefined ? { audience: config.audience } : {}),
    algorithms: [...config.algorithms],
    clockTolerance: config.clockToleranceSec,
    requiredClaims,
  };
}

/** Shared by both verifiers: the cheap pre-checks, then jose's signature / time / issuer / audience checks. */
async function verifiedPayload(token: string, key: Parameters<typeof jwtVerify>[1], verifyOptions: ReturnType<typeof verifyOptionsOf>): Promise<JWTPayload> {
  if (typeof token !== "string" || token.length === 0) throw new AuthError("missing");
  if (token.length > MAX_TOKEN_LENGTH || !COMPACT_JWS.test(token)) throw new AuthError("malformed");
  try {
    return (await jwtVerify(token, key, verifyOptions)).payload;
  } catch (err) {
    throw new AuthError(reasonFor(err));
  }
}

/** Builds the verifier once at startup. Performs no I/O itself (a JWKS is fetched on first use). */
export function createJwtVerifier(config: JwtConfig, options: JwtVerifierOptions = {}): JwtVerifier {
  const key = verificationKey(config, options);
  const verifyOptions = verifyOptionsOf(config, ["exp", "iss", "tenant", "counsellorId", "role"]);
  return {
    async verify(token: string): Promise<AuthContext> {
      return contextFrom(await verifiedPayload(token, key, verifyOptions));
    },
  };
}

// ---------------------------------------------------------------------------
// P1 U8 (D-093 item 11, 4A): the STUDENT token. Pathlynks has not given the real format yet, so everything that may differ is
// configuration: its own issuer, audience (mandatory) and key source, and the NAMES of the claims. Until Pathlynks answers, the
// defaults below are [ASSUMPTION]s, listed in the manifest and to be settled by a B21 contract amendment.
// ---------------------------------------------------------------------------

/** A student token is never a counsellor token: this is the only role the student routes accept. */
export const STUDENT_ROLE = "student";

/** The student verifier's environment names. Separate from JWT_ENV, so a counsellor-only environment configures no student route. */
const studentVar = (suffix: string) => `VC_STUDENT_JWT_${suffix}`;
export const STUDENT_JWT_ENV = {
  issuer: studentVar("ISSUER"),
  audience: studentVar("AUDIENCE"),
  algorithms: studentVar("ALGORITHMS"),
  publicKey: studentVar("PUBLIC_KEY"),
  jwksUrl: studentVar("JWKS_URL"),
  hs256Secret: studentVar("HS256_SECRET"),
  clockSkewSec: studentVar("CLOCK_SKEW_SEC"),
  claimTenant: studentVar("CLAIM_TENANT"),
  claimStudentId: studentVar("CLAIM_STUDENT_ID"),
  claimRole: studentVar("CLAIM_ROLE"),
  claimIsMinor: studentVar("CLAIM_IS_MINOR"),
  claimAge: studentVar("CLAIM_AGE"),
  claimGuardianConsent: studentVar("CLAIM_GUARDIAN_CONSENT"),
};

/** The claim names the student verifier reads. */
export interface StudentClaimNames {
  tenant: string;
  studentId: string;
  role: string;
  isMinor: string;
  age: string;
  guardianConsent: string;
}

export const DEFAULT_STUDENT_CLAIM_NAMES: StudentClaimNames = Object.freeze({
  tenant: "tenant",
  studentId: "studentId",
  role: "role",
  isMinor: "isMinor",
  age: "age",
  guardianConsent: "guardianConsent",
});

export interface StudentJwtConfig {
  jwt: JwtConfig;
  claims: StudentClaimNames;
}

/** The verified identity of one student request. */
export interface StudentAuthContext {
  tenantId: string;
  studentId: string;
  role: typeof STUDENT_ROLE;
  /** true for an under-18 student, and ALSO when no age or minor claim was supplied (fail closed, D-093 4A). */
  minor: boolean;
  /** true only when the guardian-consent claim is the boolean true. */
  guardianConsent: boolean;
}

export interface StudentJwtVerifier {
  /** Resolves the verified student context, or rejects with AuthError (reason "role" for a non-student token). */
  verify(token: string): Promise<StudentAuthContext>;
}

const CLAIM_NAME = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/;
const FORBIDDEN_CLAIM_NAMES = new Set(["__proto__", "constructor", "prototype", "exp", "iss", "aud", "nbf", "iat", "jti"]);

function claimName(env: Record<string, string | undefined>, envName: string, fallback: string): string {
  const value = nonEmpty(env, envName)?.trim() ?? fallback;
  if (!CLAIM_NAME.test(value) || FORBIDDEN_CLAIM_NAMES.has(value)) throw new JwtConfigError(`${envName} is not an allowed claim name`);
  return value;
}

/** Reads the student verifier's configuration (JwtConfigError on anything missing or unsafe). The audience is mandatory. */
export function studentJwtConfigFromEnv(env: Record<string, string | undefined>): StudentJwtConfig {
  const jwt = jwtConfigFromEnv(env, STUDENT_JWT_ENV);
  if (jwt.audience === undefined) throw new JwtConfigError(`${STUDENT_JWT_ENV.audience} is not set (a student token must name its audience)`);
  const claims: StudentClaimNames = {
    tenant: claimName(env, STUDENT_JWT_ENV.claimTenant, DEFAULT_STUDENT_CLAIM_NAMES.tenant),
    studentId: claimName(env, STUDENT_JWT_ENV.claimStudentId, DEFAULT_STUDENT_CLAIM_NAMES.studentId),
    role: claimName(env, STUDENT_JWT_ENV.claimRole, DEFAULT_STUDENT_CLAIM_NAMES.role),
    isMinor: claimName(env, STUDENT_JWT_ENV.claimIsMinor, DEFAULT_STUDENT_CLAIM_NAMES.isMinor),
    age: claimName(env, STUDENT_JWT_ENV.claimAge, DEFAULT_STUDENT_CLAIM_NAMES.age),
    guardianConsent: claimName(env, STUDENT_JWT_ENV.claimGuardianConsent, DEFAULT_STUDENT_CLAIM_NAMES.guardianConsent),
  };
  if (new Set(Object.values(claims)).size !== Object.values(claims).length) throw new JwtConfigError("the student claim names must all differ");
  return { jwt, claims };
}

function studentContextFrom(payload: JWTPayload, names: StudentClaimNames): StudentAuthContext {
  const p = payload as Record<string, unknown>;
  const role = p[names.role];
  if (typeof role !== "string") throw new AuthError("claims");
  // A validly signed token of any other role (counsellor, admin, approver) is a role refusal, checked before the rest.
  if (role !== STUDENT_ROLE) throw new AuthError("role");
  const tenant = p[names.tenant];
  const studentId = p[names.studentId];
  if (typeof tenant !== "string" || !TENANT_ID_PATTERN.test(tenant)) throw new AuthError("claims");
  if (typeof studentId !== "string" || studentId.trim() === "" || studentId.length > 128 || CONTROL_CHARS.test(studentId)) throw new AuthError("claims");
  const age = p[names.age];
  const underAge = typeof age === "number" && Number.isFinite(age) && age < 18;
  const statedAdult = p[names.isMinor] === false || (typeof age === "number" && Number.isFinite(age) && age >= 18);
  const minor = p[names.isMinor] === true || underAge || !statedAdult;
  return { tenantId: tenant, studentId, role: STUDENT_ROLE, minor, guardianConsent: p[names.guardianConsent] === true };
}

/** Builds the student verifier once at startup. Performs no I/O itself. */
export function createStudentJwtVerifier(config: StudentJwtConfig, options: JwtVerifierOptions = {}): StudentJwtVerifier {
  const key = verificationKey(config.jwt, options);
  const verifyOptions = verifyOptionsOf(config.jwt, ["exp", "iss"]);
  return {
    async verify(token: string): Promise<StudentAuthContext> {
      return studentContextFrom(await verifiedPayload(token, key, verifyOptions), config.claims);
    },
  };
}

/**
 * pc-hardening-3 K1 (ISS-pc-reserved-ids-6): the reverse of the reserved-partner-id rule. A partner id IS the tenant of everything its server key reaches (chat.ts:855),
 * so a signed student token whose `tenant` claim equals an existing partner id would read and write that partner's students. `refuse` is asked with the verified
 * tenant claim (production: the partner registry's `isPartnerTenantClaim`); when it answers true, or throws (the partner list could not be read: fail closed), the token
 * is refused with AuthError("claims"), which every student route (chat, profile, voice sessions) already maps to the uniform 401. The wrapped verifier is otherwise unchanged.
 */
export function refuseTenantClaims(inner: StudentJwtVerifier, refuse: (tenantId: string) => boolean | Promise<boolean>): StudentJwtVerifier {
  return {
    async verify(token: string): Promise<StudentAuthContext> {
      const ctx = await inner.verify(token);
      let refused: boolean;
      try {
        refused = await refuse(ctx.tenantId);
      } catch {
        refused = true;
      }
      if (refused) throw new AuthError("claims");
      return ctx;
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
