/**
 * P1 U8 (D-093 item 11, 4A): the config-driven student JWT. Every key here is generated in-process and every token is synthetic;
 * nothing reads the real environment and the JWKS "fetch" is a local function (no network, B8).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { SignJWT, exportJWK, type JWTPayload } from "jose";
import {
  AuthError,
  JwtConfigError,
  STUDENT_JWT_ENV,
  createJwtVerifier,
  createStudentJwtVerifier,
  jwtConfigFromEnv,
  studentJwtConfigFromEnv,
  type AuthFailureReason,
} from "../src/auth.js";

const ISSUER = "https://pathlynks.synthetic.test";
const AUDIENCE = "vc-student";
const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const rsaOther = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = (k: KeyObject) => k.export({ type: "spki", format: "pem" }).toString();
const HS_SECRET = "synthetic-student-hs256-secret-0123456789";
const nowSec = () => Math.floor(Date.now() / 1000);

const ADULT = { tenant: "tenant-a", studentId: "stu-1", role: "student", isMinor: false };

async function sign(
  claims: Record<string, unknown>,
  opts: { key?: KeyObject | Uint8Array; alg?: string; kid?: string; iss?: string; aud?: string | null; exp?: number } = {},
): Promise<string> {
  const jwt = new SignJWT(claims as JWTPayload).setProtectedHeader({ alg: opts.alg ?? "RS256", ...(opts.kid ? { kid: opts.kid } : {}) }).setIssuedAt();
  jwt.setIssuer(opts.iss ?? ISSUER);
  if (opts.aud !== null) jwt.setAudience(opts.aud ?? AUDIENCE);
  jwt.setExpirationTime(opts.exp ?? nowSec() + 300);
  return jwt.sign(opts.key ?? rsa.privateKey);
}

const rsaEnv = (extra: Record<string, string> = {}) => ({
  [STUDENT_JWT_ENV.issuer]: ISSUER,
  [STUDENT_JWT_ENV.audience]: AUDIENCE,
  [STUDENT_JWT_ENV.publicKey]: pem(rsa.publicKey),
  ...extra,
});
const verifier = (extra: Record<string, string> = {}) => createStudentJwtVerifier(studentJwtConfigFromEnv(rsaEnv(extra)));

async function rejectsWith(p: Promise<unknown>, reason: AuthFailureReason): Promise<void> {
  await assert.rejects(p, (err: unknown) => {
    assert.ok(err instanceof AuthError, `expected AuthError, got ${String(err)}`);
    assert.equal(err.reason, reason);
    return true;
  });
}

test("student config comes from its own env names: issuer, audience and ONE key source, with the audience mandatory", () => {
  assert.throws(() => studentJwtConfigFromEnv({ [STUDENT_JWT_ENV.issuer]: ISSUER, [STUDENT_JWT_ENV.publicKey]: pem(rsa.publicKey) }), JwtConfigError);
  assert.throws(() => studentJwtConfigFromEnv({ [STUDENT_JWT_ENV.audience]: AUDIENCE, [STUDENT_JWT_ENV.publicKey]: pem(rsa.publicKey) }), JwtConfigError);
  assert.throws(() => studentJwtConfigFromEnv(rsaEnv({ [STUDENT_JWT_ENV.jwksUrl]: "https://pathlynks.synthetic.test/jwks" })), JwtConfigError);
  assert.throws(
    () => studentJwtConfigFromEnv({ [STUDENT_JWT_ENV.issuer]: ISSUER, [STUDENT_JWT_ENV.audience]: AUDIENCE, [STUDENT_JWT_ENV.jwksUrl]: "http://x.test/jwks" }),
    JwtConfigError,
  );
  // The counsellor variables are NOT read for students (a counsellor-only environment configures no student verifier).
  assert.throws(() => studentJwtConfigFromEnv({ VC_JWT_ISSUER: ISSUER, VC_JWT_AUDIENCE: AUDIENCE, VC_JWT_PUBLIC_KEY: pem(rsa.publicKey) }), JwtConfigError);
  const hs = studentJwtConfigFromEnv({ [STUDENT_JWT_ENV.issuer]: ISSUER, [STUDENT_JWT_ENV.audience]: AUDIENCE, [STUDENT_JWT_ENV.algorithms]: "HS256", [STUDENT_JWT_ENV.hs256Secret]: HS_SECRET });
  assert.deepEqual(hs.jwt.algorithms, ["HS256"]);
  assert.throws(() => studentJwtConfigFromEnv(rsaEnv({ [STUDENT_JWT_ENV.claimStudentId]: "bad name!" })), JwtConfigError);
  assert.throws(() => studentJwtConfigFromEnv(rsaEnv({ [STUDENT_JWT_ENV.claimStudentId]: "__proto__" })), JwtConfigError);
});

test("a student whose adult token verifies gets their tenant, student id and a persist-text context", async () => {
  const ctx = await verifier().verify(await sign(ADULT));
  assert.deepEqual(ctx, { tenantId: "tenant-a", studentId: "stu-1", role: "student", minor: false, guardianConsent: false });
});

test("a Pathlynks student whose claim names differ is accepted once the claim names are configured", async () => {
  const v = verifier({
    [STUDENT_JWT_ENV.claimTenant]: "org",
    [STUDENT_JWT_ENV.claimStudentId]: "pl_student",
    [STUDENT_JWT_ENV.claimRole]: "typ",
    [STUDENT_JWT_ENV.claimIsMinor]: "under18",
    [STUDENT_JWT_ENV.claimGuardianConsent]: "guardian_ok",
  });
  const ctx = await v.verify(await sign({ org: "tenant-b", pl_student: "stu-9", typ: "student", under18: true, guardian_ok: true }));
  assert.deepEqual(ctx, { tenantId: "tenant-b", studentId: "stu-9", role: "student", minor: true, guardianConsent: true });
  await rejectsWith(v.verify(await sign(ADULT)), "claims");
});

test("an under-18 student with no age or minor claim is treated as a minor (fail closed); a stated adult is not", async () => {
  const v = verifier();
  assert.equal((await v.verify(await sign({ tenant: "t", studentId: "s", role: "student" }))).minor, true);
  assert.equal((await v.verify(await sign({ tenant: "t", studentId: "s", role: "student", age: 17 }))).minor, true);
  assert.equal((await v.verify(await sign({ tenant: "t", studentId: "s", role: "student", age: 18 }))).minor, false);
  assert.equal((await v.verify(await sign({ tenant: "t", studentId: "s", role: "student", isMinor: false, age: 16 }))).minor, true, "any minor signal wins");
});

test("guardian consent counts only as the boolean true, and a non-boolean value is not consent", async () => {
  const v = verifier();
  const base = { tenant: "t", studentId: "s", role: "student", isMinor: true };
  assert.equal((await v.verify(await sign({ ...base, guardianConsent: true }))).guardianConsent, true);
  for (const bad of ["true", 1, "yes", null, [true]]) {
    assert.equal((await v.verify(await sign({ ...base, guardianConsent: bad }))).guardianConsent, false, JSON.stringify(bad));
  }
});

test("a counsellor, admin or approver token is refused on the student verifier with the role reason, even when signed by the same key", async () => {
  const v = verifier();
  for (const role of ["counsellor", "admin", "approver"]) {
    await rejectsWith(v.verify(await sign({ tenant: "tenant-a", counsellorId: "c-1", role })), "role");
  }
  await rejectsWith(v.verify(await sign({ tenant: "tenant-a", studentId: "stu-1" })), "claims");
});

test("a student token is refused by the counsellor verifier (not a counsellor claim set), so a student cannot reach counsellor routes", async () => {
  const counsellor = createJwtVerifier(jwtConfigFromEnv({ VC_JWT_ISSUER: ISSUER, VC_JWT_AUDIENCE: AUDIENCE, VC_JWT_PUBLIC_KEY: pem(rsa.publicKey) }));
  await assert.rejects(counsellor.verify(await sign(ADULT)), (e: unknown) => e instanceof AuthError && e.reason === "claims");
});

test("invalid student tokens are refused: wrong key, wrong issuer, wrong audience, expired, none-alg, malformed, empty", async () => {
  const v = verifier();
  await rejectsWith(v.verify(await sign(ADULT, { key: rsaOther.privateKey })), "signature");
  await rejectsWith(v.verify(await sign(ADULT, { iss: "https://evil.test" })), "issuer");
  await rejectsWith(v.verify(await sign(ADULT, { aud: "someone-else" })), "audience");
  await rejectsWith(v.verify(await sign(ADULT, { aud: null })), "audience");
  await rejectsWith(v.verify(await sign(ADULT, { exp: nowSec() - 3600 })), "expired");
  await rejectsWith(v.verify("not-a-token"), "malformed");
  await rejectsWith(v.verify(""), "missing");
  const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ ...ADULT, iss: ISSUER, aud: AUDIENCE, exp: nowSec() + 300 })).toString("base64url")}.`;
  await assert.rejects(v.verify(none), AuthError);
});

test("an HS256 student secret is accepted alone and an RS256 token is not accepted under it (no algorithm confusion)", async () => {
  const v = createStudentJwtVerifier(
    studentJwtConfigFromEnv({ [STUDENT_JWT_ENV.issuer]: ISSUER, [STUDENT_JWT_ENV.audience]: AUDIENCE, [STUDENT_JWT_ENV.algorithms]: "HS256", [STUDENT_JWT_ENV.hs256Secret]: HS_SECRET }),
  );
  const ok = await sign(ADULT, { key: new TextEncoder().encode(HS_SECRET), alg: "HS256" });
  assert.equal((await v.verify(ok)).studentId, "stu-1");
  await assert.rejects(v.verify(await sign(ADULT)), AuthError);
});

test("a JWKS-configured student verifier resolves the signing key by kid from a local fetch", async () => {
  const jwk = { ...(await exportJWK(rsa.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  const v = createStudentJwtVerifier(
    studentJwtConfigFromEnv({ [STUDENT_JWT_ENV.issuer]: ISSUER, [STUDENT_JWT_ENV.audience]: AUDIENCE, [STUDENT_JWT_ENV.jwksUrl]: "https://pathlynks.synthetic.test/jwks" }),
    { jwksFetch: async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { "content-type": "application/json" } }) },
  );
  assert.equal((await v.verify(await sign(ADULT, { kid: "k1" }))).tenantId, "tenant-a");
  await rejectsWith(v.verify(await sign(ADULT, { kid: "missing" })), "key");
});

test("a student id with control characters or over 128 characters is refused", async () => {
  const v = verifier();
  await rejectsWith(v.verify(await sign({ ...ADULT, studentId: "a\nb" })), "claims");
  await rejectsWith(v.verify(await sign({ ...ADULT, studentId: "x".repeat(129) })), "claims");
  await rejectsWith(v.verify(await sign({ ...ADULT, tenant: "bad:tenant" })), "claims");
});
