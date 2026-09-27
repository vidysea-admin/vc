/**
 * T-025 (B21): JWT verification. Every key here is generated in-process; nothing reads the real
 * environment, and the JWKS "fetch" is a local function (no network, B8).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { SignJWT, exportJWK, type JWTPayload } from "jose";
import {
  AuthError,
  JwtConfigError,
  bearerToken,
  createJwtVerifier,
  jwtConfigFromEnv,
  MAX_TOKEN_LENGTH,
  type AuthFailureReason,
} from "../src/auth.js";

const ISSUER = "https://issuer.synthetic.test";
const AUDIENCE = "vc-api";
const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const rsaOther = generateKeyPairSync("rsa", { modulusLength: 2048 });
const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pem = (k: KeyObject) => k.export({ type: "spki", format: "pem" }).toString();
const RSA_PEM = pem(rsa.publicKey);
const EC_PEM = pem(ec.publicKey);
const HS_SECRET = "synthetic-hs256-secret-0123456789abcdef";

const GOOD_CLAIMS = { tenant: "tenant-a", counsellorId: "counsellor-1", role: "counsellor" };

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

async function sign(
  claims: Record<string, unknown>,
  opts: { key?: KeyObject | Uint8Array; alg?: string; kid?: string; iss?: string | null; aud?: string | null; exp?: number | null; nbf?: number } = {},
): Promise<string> {
  const jwt = new SignJWT(claims as JWTPayload).setProtectedHeader({ alg: opts.alg ?? "RS256", ...(opts.kid ? { kid: opts.kid } : {}) }).setIssuedAt();
  if (opts.iss !== null) jwt.setIssuer(opts.iss ?? ISSUER);
  if (opts.aud !== null) jwt.setAudience(opts.aud ?? AUDIENCE);
  if (opts.exp !== null) jwt.setExpirationTime(opts.exp ?? nowSec() + 300);
  if (opts.nbf !== undefined) jwt.setNotBefore(opts.nbf);
  return jwt.sign(opts.key ?? rsa.privateKey);
}

function rsaVerifier(extra: Record<string, string> = {}) {
  return createJwtVerifier(jwtConfigFromEnv({ VC_JWT_ISSUER: ISSUER, VC_JWT_AUDIENCE: AUDIENCE, VC_JWT_PUBLIC_KEY: RSA_PEM, ...extra }));
}

async function rejectsWith(p: Promise<unknown>, reason: AuthFailureReason | AuthFailureReason[]): Promise<void> {
  const allowed = Array.isArray(reason) ? reason : [reason];
  await assert.rejects(p, (err: unknown) => {
    assert.ok(err instanceof AuthError, `expected AuthError, got ${String(err)}`);
    assert.ok(allowed.includes(err.reason), `reason ${err.reason} not in ${allowed.join("|")}`);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

test("T-025 auth: config refuses a missing issuer, 'none', unknown algorithms and unsafe HS256 setups", () => {
  const base = { VC_JWT_ISSUER: ISSUER, VC_JWT_PUBLIC_KEY: RSA_PEM };
  const bad: [string, Record<string, string | undefined>][] = [
    ["no issuer", { VC_JWT_PUBLIC_KEY: RSA_PEM }],
    ["none", { ...base, VC_JWT_ALGORITHMS: "RS256,none" }],
    ["NONE", { ...base, VC_JWT_ALGORITHMS: "NONE" }],
    ["unknown alg", { ...base, VC_JWT_ALGORITHMS: "PS256" }],
    // With a JWKS there is no PEM narrowing, so only the allow-list itself can refuse these.
    ["unknown alg with a JWKS", { VC_JWT_ISSUER: ISSUER, VC_JWT_JWKS_URL: "https://issuer.synthetic.test/jwks", VC_JWT_ALGORITHMS: "PS256" }],
    ["none with a JWKS", { VC_JWT_ISSUER: ISSUER, VC_JWT_JWKS_URL: "https://issuer.synthetic.test/jwks", VC_JWT_ALGORITHMS: "ES256,none" }],
    ["empty list", { ...base, VC_JWT_ALGORITHMS: " , " }],
    ["HS256 mixed with RS256", { VC_JWT_ISSUER: ISSUER, VC_JWT_ALGORITHMS: "HS256,RS256", VC_JWT_HS256_SECRET: HS_SECRET }],
    ["HS256 with a PEM, not a secret", { ...base, VC_JWT_ALGORITHMS: "HS256" }],
    ["HS256 short secret", { VC_JWT_ISSUER: ISSUER, VC_JWT_ALGORITHMS: "HS256", VC_JWT_HS256_SECRET: "short" }],
    ["secret without HS256", { VC_JWT_ISSUER: ISSUER, VC_JWT_HS256_SECRET: HS_SECRET }],
    ["two key sources", { ...base, VC_JWT_JWKS_URL: "https://issuer.synthetic.test/jwks" }],
    ["no key source", { VC_JWT_ISSUER: ISSUER }],
    ["unreadable PEM", { VC_JWT_ISSUER: ISSUER, VC_JWT_PUBLIC_KEY: "not a pem" }],
    ["RSA 1024", { VC_JWT_ISSUER: ISSUER, VC_JWT_PUBLIC_KEY: pem(generateKeyPairSync("rsa", { modulusLength: 1024 }).publicKey) }],
    ["EC P-384", { VC_JWT_ISSUER: ISSUER, VC_JWT_PUBLIC_KEY: pem(generateKeyPairSync("ec", { namedCurve: "P-384" }).publicKey) }],
    ["EC key but only RS256 allowed", { VC_JWT_ISSUER: ISSUER, VC_JWT_PUBLIC_KEY: EC_PEM, VC_JWT_ALGORITHMS: "RS256" }],
    ["http JWKS", { VC_JWT_ISSUER: ISSUER, VC_JWT_JWKS_URL: "http://issuer.synthetic.test/jwks" }],
    ["bad JWKS url", { VC_JWT_ISSUER: ISSUER, VC_JWT_JWKS_URL: "::" }],
    ["skew too large", { ...base, VC_JWT_CLOCK_SKEW_SEC: "301" }],
    ["skew negative", { ...base, VC_JWT_CLOCK_SKEW_SEC: "-1" }],
    ["skew not a number", { ...base, VC_JWT_CLOCK_SKEW_SEC: "abc" }],
  ];
  for (const [label, env] of bad) {
    assert.throws(() => jwtConfigFromEnv(env), JwtConfigError, label);
  }
  // Never echoes a value: the secret is not in the message.
  try {
    jwtConfigFromEnv({ VC_JWT_ISSUER: ISSUER, VC_JWT_ALGORITHMS: "HS256", VC_JWT_HS256_SECRET: "short-secret-value" });
  } catch (err) {
    assert.doesNotMatch((err as Error).message, /short-secret-value/);
  }
});

test("T-025 auth: config narrows a PEM key to its own algorithm and unescapes one-line PEMs", () => {
  const cfg = jwtConfigFromEnv({ VC_JWT_ISSUER: ISSUER, VC_JWT_PUBLIC_KEY: RSA_PEM.replace(/\n/g, "\\n") });
  assert.deepEqual(cfg.algorithms, ["RS256"]);
  assert.equal(cfg.clockToleranceSec, 30);
  assert.equal(cfg.audience, undefined);
  const ecCfg = jwtConfigFromEnv({ VC_JWT_ISSUER: ISSUER, VC_JWT_PUBLIC_KEY: EC_PEM });
  assert.deepEqual(ecCfg.algorithms, ["ES256"]);
  const hs = jwtConfigFromEnv({ VC_JWT_ISSUER: ISSUER, VC_JWT_ALGORITHMS: "HS256", VC_JWT_HS256_SECRET: HS_SECRET, VC_JWT_CLOCK_SKEW_SEC: "0" });
  assert.deepEqual(hs.algorithms, ["HS256"]);
  assert.equal(hs.clockToleranceSec, 0);
});

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

test("T-025 auth: a valid RS256 token yields {tenantId, counsellorId, role}", async () => {
  const ctx = await rsaVerifier().verify(await sign(GOOD_CLAIMS));
  assert.deepEqual(ctx, { tenantId: "tenant-a", counsellorId: "counsellor-1", role: "counsellor" });
});

test("T-025 auth: a valid ES256 token verifies against an EC P-256 PEM", async () => {
  const v = createJwtVerifier(jwtConfigFromEnv({ VC_JWT_ISSUER: ISSUER, VC_JWT_PUBLIC_KEY: EC_PEM }));
  const ctx = await v.verify(await sign({ ...GOOD_CLAIMS, role: "admin" }, { key: ec.privateKey, alg: "ES256" }));
  assert.equal(ctx.role, "admin");
});

test("T-025 auth: signature failures (tampered payload, another key) are refused", async () => {
  const v = rsaVerifier();
  const token = await sign(GOOD_CLAIMS);
  const [h, , s] = token.split(".");
  const forgedPayload = Buffer.from(JSON.stringify({ ...GOOD_CLAIMS, tenant: "tenant-b", iss: ISSUER, aud: AUDIENCE, exp: nowSec() + 300 })).toString("base64url");
  await rejectsWith(v.verify(`${h}.${forgedPayload}.${s}`), "signature");
  await rejectsWith(v.verify(await sign(GOOD_CLAIMS, { key: rsaOther.privateKey })), "signature");
});

test("T-025 auth: algorithm confusion and 'none' are refused", async () => {
  const v = rsaVerifier();
  // HS256 signed with the PUBLIC key's PEM text as the HMAC secret: the classic confusion attack.
  const confused = await sign(GOOD_CLAIMS, { key: new TextEncoder().encode(RSA_PEM), alg: "HS256" });
  await rejectsWith(v.verify(confused), "algorithm");
  // ES256 under an RSA-only config.
  await rejectsWith(v.verify(await sign(GOOD_CLAIMS, { key: ec.privateKey, alg: "ES256" })), "algorithm");
  // alg: none (unsigned).
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "none", typ: "JWT" })}.${b64({ ...GOOD_CLAIMS, iss: ISSUER, aud: AUDIENCE, exp: nowSec() + 300 })}.`;
  await rejectsWith(v.verify(unsigned), ["algorithm", "malformed"]);
});

test("T-025 auth: exp / nbf honour the clock skew, and exp is required", async () => {
  const v = rsaVerifier({ VC_JWT_CLOCK_SKEW_SEC: "30" });
  await rejectsWith(v.verify(await sign(GOOD_CLAIMS, { exp: nowSec() - 120 })), "expired");
  assert.equal((await v.verify(await sign(GOOD_CLAIMS, { exp: nowSec() - 5 }))).tenantId, "tenant-a", "inside the skew");
  await rejectsWith(v.verify(await sign(GOOD_CLAIMS, { nbf: nowSec() + 120 })), "not_yet_valid");
  assert.equal((await v.verify(await sign(GOOD_CLAIMS, { nbf: nowSec() + 5 }))).tenantId, "tenant-a", "inside the skew");
  await rejectsWith(v.verify(await sign(GOOD_CLAIMS, { exp: null })), "claims");
});

test("T-025 auth: issuer and audience are enforced", async () => {
  const v = rsaVerifier();
  await rejectsWith(v.verify(await sign(GOOD_CLAIMS, { iss: "https://evil.synthetic.test" })), "issuer");
  await rejectsWith(v.verify(await sign(GOOD_CLAIMS, { iss: null })), ["issuer", "claims"]);
  await rejectsWith(v.verify(await sign(GOOD_CLAIMS, { aud: "someone-else" })), "audience");
  await rejectsWith(v.verify(await sign(GOOD_CLAIMS, { aud: null })), ["audience", "claims"]);
  // No audience configured: any (or no) aud passes.
  const noAud = createJwtVerifier(jwtConfigFromEnv({ VC_JWT_ISSUER: ISSUER, VC_JWT_PUBLIC_KEY: RSA_PEM }));
  assert.equal((await noAud.verify(await sign(GOOD_CLAIMS, { aud: null }))).tenantId, "tenant-a");
});

test("T-025 auth: tenant / counsellorId / role claims are required and validated", async () => {
  const v = rsaVerifier();
  const cases: Record<string, unknown>[] = [
    { counsellorId: "c1", role: "counsellor" },
    { tenant: "tenant-a", role: "counsellor" },
    { tenant: "tenant-a", counsellorId: "c1" },
    { ...GOOD_CLAIMS, tenant: "" },
    { ...GOOD_CLAIMS, tenant: "tenant:a" },
    { ...GOOD_CLAIMS, tenant: "-lead" },
    { ...GOOD_CLAIMS, tenant: "a".repeat(65) },
    { ...GOOD_CLAIMS, tenant: 7 },
    { ...GOOD_CLAIMS, tenant: { $ne: null } },
    { ...GOOD_CLAIMS, counsellorId: "   " },
    { ...GOOD_CLAIMS, counsellorId: "c\u0000x" },
    { ...GOOD_CLAIMS, counsellorId: "x".repeat(129) },
    { ...GOOD_CLAIMS, role: "student" },
    { ...GOOD_CLAIMS, role: "Admin" },
  ];
  for (const claims of cases) {
    await rejectsWith(v.verify(await sign(claims)), "claims");
  }
});

test("T-025 auth: malformed and oversized tokens are refused before parsing", async () => {
  const v = rsaVerifier();
  await rejectsWith(v.verify(""), "missing");
  await rejectsWith(v.verify("abc"), "malformed");
  await rejectsWith(v.verify("a.b.c.d"), "malformed");
  await rejectsWith(v.verify("a b.c.d"), "malformed");
  await rejectsWith(v.verify(`${"a".repeat(MAX_TOKEN_LENGTH)}.b.c`), "malformed");
  await rejectsWith(v.verify("eyJ.eyJ.sig"), ["malformed", "invalid"]);
});

test("T-025 auth: HS256 only when explicitly configured, and then an RS256 token is refused", async () => {
  const v = createJwtVerifier(jwtConfigFromEnv({ VC_JWT_ISSUER: ISSUER, VC_JWT_ALGORITHMS: "HS256", VC_JWT_HS256_SECRET: HS_SECRET }));
  const secret = new TextEncoder().encode(HS_SECRET);
  assert.equal((await v.verify(await sign(GOOD_CLAIMS, { key: secret, alg: "HS256" }))).tenantId, "tenant-a");
  await rejectsWith(v.verify(await sign(GOOD_CLAIMS)), "algorithm");
  await rejectsWith(v.verify(await sign(GOOD_CLAIMS, { key: new TextEncoder().encode("another-secret-another-secret-00"), alg: "HS256" })), "signature");
});

test("T-025 auth: a JWKS key source verifies by kid through an injected (offline) fetch", async () => {
  const jwk = { ...(await exportJWK(ec.publicKey)), kid: "k1", alg: "ES256", use: "sig" };
  let fetches = 0;
  const jwksFetch = async () => {
    fetches += 1;
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json" } });
  };
  const cfg = jwtConfigFromEnv({ VC_JWT_ISSUER: ISSUER, VC_JWT_JWKS_URL: "https://issuer.synthetic.test/.well-known/jwks.json" });
  const v = createJwtVerifier(cfg, { jwksFetch: jwksFetch as never });
  const ctx = await v.verify(await sign(GOOD_CLAIMS, { key: ec.privateKey, alg: "ES256", kid: "k1" }));
  assert.equal(ctx.counsellorId, "counsellor-1");
  assert.ok(fetches >= 1);
  await rejectsWith(v.verify(await sign(GOOD_CLAIMS, { key: ec.privateKey, alg: "ES256", kid: "unknown" })), "key");
  // A token signed by a key not in the set, with the same kid.
  const stranger = generateKeyPairSync("ec", { namedCurve: "P-256" });
  await rejectsWith(v.verify(await sign(GOOD_CLAIMS, { key: stranger.privateKey, alg: "ES256", kid: "k1" })), "signature");
});

test("T-025 auth: bearerToken takes only a single-token Bearer header", () => {
  assert.equal(bearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(bearerToken("bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(bearerToken(undefined), undefined);
  assert.equal(bearerToken("Basic dXNlcjpwYXNz"), undefined);
  assert.equal(bearerToken("abc.def.ghi"), undefined);
  assert.equal(bearerToken("Bearer a b"), undefined);
  assert.equal(bearerToken("Bearer "), undefined);
});

// ---------------------------------------------------------------------------
// B21 amendment (checker 9f13acc): issuer + key only from config; placeholder issuer "umesh"
// ---------------------------------------------------------------------------

test("T-025 B21 contract: the placeholder issuer 'umesh' (local key pair) and a later real issuer differ ONLY in config; each verifier accepts its own tokens and refuses the other's", async () => {
  // Both key pairs are generated here, in memory; no private key exists on disk or in the tree.
  const placeholder = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const real = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const realJwk = { ...(await exportJWK(real.publicKey)), kid: "real-1", alg: "ES256", use: "sig" };
  const jwksFetch = async () => new Response(JSON.stringify({ keys: [realJwk] }), { headers: { "content-type": "application/json" } });

  // Today: VC_JWT_ISSUER=umesh + VC_JWT_PUBLIC_KEY. Later: the real issuer + VC_JWT_JWKS_URL. Same code path.
  const todayEnv = { VC_JWT_ISSUER: "umesh", VC_JWT_PUBLIC_KEY: pem(placeholder.publicKey).replace(/\n/g, "\n") };
  const laterEnv = { VC_JWT_ISSUER: "https://backend.client.synthetic.test", VC_JWT_JWKS_URL: "https://backend.client.synthetic.test/.well-known/jwks.json" };
  const today = createJwtVerifier(jwtConfigFromEnv(todayEnv));
  const later = createJwtVerifier(jwtConfigFromEnv(laterEnv), { jwksFetch: jwksFetch as never });

  const todayToken = await sign(GOOD_CLAIMS, { key: placeholder.privateKey, iss: "umesh", aud: null });
  const laterToken = await sign(GOOD_CLAIMS, { key: real.privateKey, alg: "ES256", kid: "real-1", iss: laterEnv.VC_JWT_ISSUER, aud: null });

  assert.deepEqual(await today.verify(todayToken), { tenantId: "tenant-a", counsellorId: "counsellor-1", role: "counsellor" });
  assert.deepEqual(await later.verify(laterToken), { tenantId: "tenant-a", counsellorId: "counsellor-1", role: "counsellor" });
  // Cross: the placeholder's tokens stop working once config names the real issuer, and vice versa.
  await rejectsWith(today.verify(laterToken), ["algorithm", "issuer", "signature"]);
  await rejectsWith(later.verify(todayToken), ["algorithm", "issuer", "signature", "key"]);
  // The right key with the wrong issuer is refused: issuer is checked, not just the signature.
  await rejectsWith(today.verify(await sign(GOOD_CLAIMS, { key: placeholder.privateKey, iss: "umesh-other", aud: null })), "issuer");
  // No default issuer: without VC_JWT_ISSUER nothing verifies (config error at startup).
  assert.throws(() => jwtConfigFromEnv({ VC_JWT_PUBLIC_KEY: todayEnv.VC_JWT_PUBLIC_KEY }), JwtConfigError);
});

test("T-025 B21 contract: no issuer or key is hard-coded in apps/api/src, .env.example lists the JWT names with no values, and no private key is tracked in git", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const srcDir = path.join(root, "apps", "api", "src");
  for (const f of readdirSync(srcDir).filter((n) => n.endsWith(".ts"))) {
    const text = readFileSync(path.join(srcDir, f), "utf8");
    // Every `issuer:` assignment in src comes from config, never a string literal.
    assert.doesNotMatch(text, /issuer\s*[:=]\s*["'`](?!VC_JWT_)/, `${f}: a literal issuer (only the env NAME may be a literal)`);
    assert.doesNotMatch(text, /["'`]umesh["'`]|pathlynks\.(com|in|ai)/i, `${f}: a hard-coded issuer name`);
    assert.doesNotMatch(text, /-----BEGIN [A-Z ]*KEY-----/, `${f}: an embedded key`);
  }
  const example = readFileSync(path.join(root, ".env.example"), "utf8");
  for (const name of ["VC_JWT_ISSUER", "VC_JWT_PUBLIC_KEY", "VC_JWT_JWKS_URL", "VC_JWT_ALGORITHMS", "VC_JWT_AUDIENCE"]) {
    assert.match(example, new RegExp(`^${name}=$`, "m"), `.env.example must list ${name} with no value`);
  }
  const tracked = execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
  const textLike = /\.(ts|js|mjs|cjs|json|md|ya?ml|txt|pem|key|env|example|py|ps1|sh|toml|jsonl|csv)$|^\.env/i;
  const offenders: string[] = [];
  for (const rel of tracked.filter((p) => textLike.test(path.basename(p)))) {
    let text: string;
    try {
      text = readFileSync(path.join(root, rel), "utf8");
    } catch {
      continue;
    }
    if (/-----BEGIN (RSA |EC |ENCRYPTED )?PRIVATE KEY-----/.test(text)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], "a private key is tracked in git");
});
