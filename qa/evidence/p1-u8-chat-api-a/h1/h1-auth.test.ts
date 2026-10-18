/** H1 areas 1 and 2: hostile auth probes. Each assertion states the SAFE outcome. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { SignJWT } from "jose";
import { createStudentJwtVerifier, studentJwtConfigFromEnv, STUDENT_JWT_ENV, createJwtVerifier, jwtConfigFromEnv } from "../../p1-u8/apps/api/src/auth.js";
import { createApiHandler } from "../../p1-u8/apps/api/src/server.js";
import { chatWorld, chatRequest, call, everythingStored, threadsPath, turnsPath, ISSUER, AUDIENCE } from "../../p1-u8/apps/api/tests/chat-fixtures.js";

const kp = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = kp.publicKey.export({ type: "spki", format: "pem" }).toString();
const verifier = () => createStudentJwtVerifier(studentJwtConfigFromEnv({ [STUDENT_JWT_ENV.issuer]: ISSUER, [STUDENT_JWT_ENV.audience]: AUDIENCE, [STUDENT_JWT_ENV.publicKey]: PEM }));
const world = () => chatWorld({ deps: { verifier: verifier() } });
const good = { tenant: "tenant-a", studentId: "stu-1", role: "student", isMinor: false };

type Opt = { key?: any; iss?: string | null; aud?: string | string[] | null; exp?: number | string | null; nbf?: number; alg?: string };
async function tok(claims: Record<string, unknown>, o: Opt = {}): Promise<string> {
  let j = new SignJWT(claims as any).setProtectedHeader({ alg: o.alg ?? "RS256" }).setIssuedAt();
  if (o.iss !== null) j = j.setIssuer(o.iss ?? ISSUER);
  if (o.aud !== null) j = j.setAudience(o.aud ?? AUDIENCE);
  if (o.exp !== null) j = j.setExpirationTime(o.exp ?? Math.floor(Date.now() / 1000) + 300);
  if (o.nbf !== undefined) j = j.setNotBefore(o.nbf);
  return j.sign(o.key ?? kp.privateKey);
}
const b64u = (o: unknown) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");

const ROUTES = (sid: string, th = "th-1"): [string, string, unknown][] => [
  ["POST", threadsPath(sid), undefined],
  ["GET", `${threadsPath(sid)}/${th}`, undefined],
  ["POST", turnsPath(sid, th), { text: "hello" }],
  ["GET", `/v1/students/${sid}/chat/profile`, undefined],
  ["POST", `/v1/students/${sid}/chat/profile/facts/f1/decision`, { action: "confirm" }],
];

async function allRoutes(w: any, headersFor: () => Record<string, any>, urlSuffix = "") {
  const out: { path: string; status: number; body: string }[] = [];
  for (const [m, p, b] of ROUTES("stu-1")) {
    const req = chatRequest(m, p + urlSuffix, { ...(b ? { body: b } : {}) });
    req.headers = { ...req.headers, ...headersFor() };
    const r = await w.handler(req);
    out.push({ path: `${m} ${p}`, status: r.status, body: r.body });
  }
  return out;
}

test("1a role forgery: student key + role counsellor/admin/approver => 403 on all 5 routes; odd roles => 401/403, never 2xx", async () => {
  const w = world();
  try {
    for (const role of ["counsellor", "admin", "approver", "Student", " student", "STUDENT", "teacher", ""]) {
      const t = await tok({ ...good, role, counsellorId: "c-1" });
      for (const [m, p, b] of ROUTES("stu-1")) {
        const r = await call(w, m, p, { token: t, ...(b ? { body: b } : {}) });
        assert.ok(r.status === 401 || r.status === 403, `role=${JSON.stringify(role)} ${m} ${p} -> ${r.status}`);
        if (["counsellor", "admin", "approver"].includes(role)) assert.equal(r.status, 403, `role=${role} ${m} ${p}`);
      }
    }
    for (const role of [["student", "admin"], { a: 1 }, 1, true, null]) {
      const t = await tok({ ...good, role });
      for (const [m, p, b] of ROUTES("stu-1")) {
        const r = await call(w, m, p, { token: t, ...(b ? { body: b } : {}) });
        assert.ok(r.status === 401 || r.status === 403, `role=${JSON.stringify(role)} ${m} ${p} -> ${r.status}`);
      }
    }
    const noRole = await tok({ tenant: "tenant-a", studentId: "stu-1" });
    for (const [m, p, b] of ROUTES("stu-1")) assert.ok([401, 403].includes((await call(w, m, p, { token: noRole, ...(b ? { body: b } : {}) })).status));
    assert.equal(everythingStored(w.fakeDb), "[]");
    assert.equal(w.provider.calls.length, 0);
  } finally { w.cleanup(); }
});

test("1b token forgery matrix on all 5 routes: never 2xx, and one body per status, no config leak", async () => {
  const w = world();
  try {
    const valid = await tok(good);
    const now = Math.floor(Date.now() / 1000);
    const [h, p, s] = valid.split(".");
    const hs256Public = await new SignJWT(good as any).setProtectedHeader({ alg: "HS256" }).setIssuer(ISSUER).setAudience(AUDIENCE).setExpirationTime(now + 300).sign(new TextEncoder().encode(PEM));
    const claimsNone = { ...good, iss: ISSUER, aud: AUDIENCE, exp: now + 300 };
    const cases: Record<string, string> = {
      wrongKey: await tok(good, { key: other.privateKey }),
      wrongIssuer: await tok(good, { iss: "https://evil.test" }),
      wrongAudience: await tok(good, { aud: "other-aud" }),
      missingAudience: await tok(good, { aud: null }),
      audArrayWithoutOurs: await tok(good, { aud: ["x", "y"] }),
      missingIssuer: await tok(good, { iss: null }),
      missingExp: await tok(good, { exp: null }),
      expired: await tok(good, { exp: now - 3600 }),
      notYetValid: await tok(good, { nbf: now + 3600 }),
      algNone: `${b64u({ alg: "none", typ: "JWT" })}.${b64u(claimsNone)}.`,
      algNoneWithSig: `${b64u({ alg: "none", typ: "JWT" })}.${b64u(claimsNone)}.${s}`,
      algNoneUpper: `${b64u({ alg: "None" })}.${b64u(claimsNone)}.`,
      hs256PublicKeyAsSecret: hs256Public,
      truncated: valid.slice(0, valid.length - 20),
      truncatedHalf: valid.slice(0, Math.floor(valid.length / 2)),
      twoSegments: `${h}.${p}`,
      extraSegments: `${valid}.${s}`,
      fiveSegmentsJwe: `${h}.${p}.${s}.${s}.${s}`,
      empty: "",
      dotsOnly: "..",
      oversize: "a".repeat(9000),
      headerJkuSpoof: `${b64u({ alg: "RS256", jku: "https://evil.test/jwks" })}.${p}.${s}`,
      embeddedJwk: `${b64u({ alg: "RS256", jwk: { kty: "RSA", n: "x", e: "AQAB" } })}.${p}.${s}`,
    };
    const seen = new Map<string, Set<string>>();
    for (const [name, t] of Object.entries(cases)) {
      const hdr = () => ({ authorization: `Bearer ${t}` });
      for (const r of await allRoutes(w, hdr)) {
        assert.ok(r.status === 401 || r.status === 403, `${name} ${r.path} -> ${r.status} ${r.body}`);
        const k = String(r.status);
        (seen.get(k) ?? seen.set(k, new Set()).get(k)!).add(r.body);
        assert.ok(!/key|issuer|audience|PEM|VC_STUDENT|vc-student|pathlynks|stack/i.test(r.body), `${name} body leaks config: ${r.body}`);
      }
    }
    for (const [k, v] of seen) assert.equal(v.size, 1, `status ${k} has ${v.size} distinct bodies: ${[...v].join(" | ")}`);
    assert.equal(everythingStored(w.fakeDb), "[]");
  } finally { w.cleanup(); }
});

test("1c transport forgery: empty bearer, token only in query, two Authorization headers, other schemes; lowercase bearer observed", async () => {
  const w = world();
  try {
    const valid = await tok(good);
    const obs: Record<string, number[]> = {};
    const run = async (name: string, hdr: () => Record<string, any>, suffix = "") => { obs[name] = (await allRoutes(w, hdr, suffix)).map((r) => r.status); return obs[name]!; };
    const cases: [string, () => Record<string, any>, string][] = [
      ["emptyBearer", () => ({ authorization: "Bearer " }), ""],
      ["emptyBearer2", () => ({ authorization: "Bearer" }), ""],
      ["queryAccessToken", () => ({}), `?access_token=${valid}`],
      ["queryToken", () => ({}), `?token=${valid}&authorization=Bearer%20${valid}`],
      ["basicScheme", () => ({ authorization: `Basic ${valid}` }), ""],
      ["bareToken", () => ({ authorization: valid }), ""],
      ["arrayTwoHeaders", () => ({ authorization: [`Bearer ${valid}`, `Bearer ${valid}`] }), ""],
      ["commaJoined", () => ({ authorization: `Bearer ${valid}, Bearer ${valid}` }), ""],
      ["bearerWithExtraPart", () => ({ authorization: `Bearer ${valid} extra` }), ""],
      ["xAuthHeaderOnly", () => ({ "x-authorization": `Bearer ${valid}` }), ""],
      ["cookieOnly", () => ({ cookie: `token=${valid}` }), ""],
      ["tabSeparated", () => ({ authorization: `Bearer\t${valid}` }), ""],
      ["bearerNewlineInjected", () => ({ authorization: `Bearer ${valid}\r\nX: y` }), ""],
    ];
    for (const [name, hdr, suffix] of cases) {
      const st = await run(name, hdr, suffix);
      for (const s of st) assert.ok(s === 401 || s === 403, `${name} -> ${s}`);
    }
    const lc = await run("lowercaseBearerValidToken", () => ({ authorization: `bearer ${valid}` }));
    console.log("OBS lowercase bearer + valid token statuses:", JSON.stringify(lc));
    const up = await run("BEARERValid", () => ({ authorization: `BEARER ${valid}` }));
    console.log("OBS BEARER + valid token statuses:", JSON.stringify(up));
  } finally { w.cleanup(); }
});

test("1d a STUDENT token is refused by the counsellor handler; a counsellor-key token is refused by student routes", async () => {
  const cKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const cPem = cKey.publicKey.export({ type: "spki", format: "pem" }).toString();
  const studentWithCounsellorId = await tok({ ...good, counsellorId: "c-1" });
  const studentOnly = await tok(good);
  const mk = (pem: string) =>
    createApiHandler({ verifier: createJwtVerifier(jwtConfigFromEnv({ VC_JWT_ISSUER: ISSUER, VC_JWT_PUBLIC_KEY: pem })), dbForTenant: () => { throw new Error("db touched"); }, graphForTenant: () => { throw new Error("graph touched"); } } as any);
  const scribe = "/v1/students/stu-1/sessions/s1/scribe";
  // Worst case: counsellor verifier configured with the STUDENT key and issuer.
  for (const t of [studentOnly, studentWithCounsellorId]) {
    const r = await mk(PEM)(chatRequest("POST", scribe, { token: t, body: {} }));
    assert.ok(r.status === 401 || r.status === 403, `student token on counsellor route (shared key) -> ${r.status} ${r.body}`);
  }
  // Normal case: separate counsellor key.
  const r4 = await mk(cPem)(chatRequest("POST", scribe, { token: studentWithCounsellorId, body: {} }));
  assert.equal(r4.status, 401);
  const w = world();
  try {
    const ct = await tok({ tenant: "tenant-a", counsellorId: "c-1", role: "counsellor", studentId: "stu-1" }, { key: cKey.privateKey });
    for (const [m, p, b] of ROUTES("stu-1")) assert.equal((await call(w, m, p, { token: ct, ...(b ? { body: b } : {}) })).status, 401, `${m} ${p}`);
  } finally { w.cleanup(); }
});

test("2a claims abuse: bad studentId / tenant claims never yield a 2xx and never reach the data layer", async () => {
  const w = world();
  try {
    const badStudents = ["a/b", "../x", "a\u0000b", "a\nb", "x".repeat(129), "", "   ", "a\u007fb", "a\tb"];
    for (const studentId of badStudents) {
      const t = await tok({ ...good, studentId });
      for (const pid of ["stu-1", encodeURIComponent(studentId), "..", "x"]) {
        for (const [m, p, b] of ROUTES(pid)) {
          const r = await call(w, m, p, { token: t, ...(b ? { body: b } : {}) });
          assert.ok(r.status !== 200 && r.status !== 201, `studentId=${JSON.stringify(studentId)} pid=${pid} ${m} ${p} -> ${r.status} ${r.body}`);
        }
      }
    }
    for (const studentId of [123, ["stu-1"], { a: 1 }, null, true]) {
      const t = await tok({ ...good, studentId });
      const r = await call(w, "POST", threadsPath("stu-1"), { token: t });
      assert.equal(r.status, 401, `studentId=${JSON.stringify(studentId)}`);
    }
    for (const tenant of ["a:b", "../x", "$ne", "x".repeat(65), "", "a.b", "a b", { $ne: "x" }, ["tenant-a"], "a\u0000"]) {
      const t = await tok({ ...good, tenant });
      for (const [m, p, b] of ROUTES("stu-1")) {
        const r = await call(w, m, p, { token: t, ...(b ? { body: b } : {}) });
        assert.equal(r.status, 401, `tenant=${JSON.stringify(tenant)} ${m} ${p} -> ${r.status}`);
      }
    }
    assert.equal(everythingStored(w.fakeDb), "[]");
  } finally { w.cleanup(); }
});

test("2b minor / consent claim abuse: only boolean true is consent; isMinor:false with age 12 is a minor; junk fails closed", async () => {
  const w = world();
  try {
    const run = async (claims: Record<string, unknown>) => {
      w.clock.ms += 120_000;
      const t = await tok({ tenant: "tenant-a", studentId: "stu-1", role: "student", ...claims });
      const th = await call(w, "POST", threadsPath("stu-1"), { token: t });
      assert.equal(th.status, 201);
      const g = await call(w, "GET", `${threadsPath("stu-1")}/${th.json.threadId}`, { token: t });
      return g.json.textStored === false ? "minor-noconsent" : "stored";
    };
    for (const gc of ["true", 1, "yes", "TRUE", [true], { v: true }, null, 0]) {
      assert.equal(await run({ isMinor: true, guardianConsent: gc }), "minor-noconsent", `guardianConsent=${JSON.stringify(gc)}`);
    }
    assert.equal(await run({ isMinor: true, guardianConsent: true }), "stored");
    assert.equal(await run({ isMinor: false, age: 12 }), "minor-noconsent", "isMinor:false + age 12 must be a minor");
    assert.equal(await run({ isMinor: false, age: 17.9 }), "minor-noconsent");
    assert.equal(await run({ isMinor: false, age: -5 }), "minor-noconsent", "negative age");
    for (const age of ["12", "adult", NaN, null, [12], { a: 1 }]) {
      const res = await run({ isMinor: false, age });
      console.log(`OBS isMinor:false + age=${JSON.stringify(age)} =>`, res);
    }
    for (const im of ["false", 0, "no", null]) {
      assert.equal(await run({ isMinor: im }), "minor-noconsent", `isMinor=${JSON.stringify(im)} without age must fail closed`);
    }
    assert.equal(await run({}), "minor-noconsent", "no age and no isMinor: fail closed");
    assert.equal(await run({ age: "30" }), "minor-noconsent", "age as string is not trusted as adult");
    assert.equal(await run({ age: 30 }), "stored");
    assert.equal(await run({ isMinor: true, age: 30, guardianConsent: "true" }), "minor-noconsent", "isMinor:true wins over age 30");
  } finally { w.cleanup(); }
});

test("2c path param abuse: traversal, encoded slash, NUL, dot-only, 129 chars => 4xx, never 2xx or 500", async () => {
  const w = world();
  try {
    const t = await tok(good);
    const bad = ["..", ".", "%2e%2e", "a%2Fb", "a%00b", "x".repeat(129), "-x", "a%0Ab", "%252e", "a;b", "a%5Cb"];
    for (const v of bad) {
      const reqs: [string, string, unknown][] = [
        ["GET", `${threadsPath("stu-1")}/${v}`, undefined],
        ["POST", turnsPath("stu-1", v), { text: "hi" }],
        ["POST", `/v1/students/stu-1/chat/profile/facts/${v}/decision`, { action: "confirm" }],
        ["POST", threadsPath(v), undefined],
      ];
      for (const [m, p, b] of reqs) {
        const r = await call(w, m, p, { token: t, ...(b ? { body: b } : {}) });
        assert.ok(r.status >= 400 && r.status < 500, `${m} ${p} -> ${r.status} ${r.body}`);
      }
    }
  } finally { w.cleanup(); }
});
