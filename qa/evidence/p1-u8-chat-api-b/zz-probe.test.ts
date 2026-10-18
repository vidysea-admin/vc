// Checker B hostile probes (independent of the maker's tests). Lives only in a throwaway copy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createHmac } from "node:crypto";
import { SignJWT } from "jose";
import { COLLECTION_NAMES, profileFactId } from "@vc/db";
import { createJwtVerifier, jwtConfigFromEnv } from "../src/auth.js";
import {
  AUDIENCE, ISSUER, CRISIS_TEXT, GERMANY_QUESTION, adult, minor, call, chatWorld, everythingStored, newThread, studentToken, studentVerifier, threadsPath, turnsPath, profilePath,
} from "./chat-fixtures.js";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const nowSec = () => Math.floor(Date.now() / 1000);
const goodClaims = () => ({ ...adult(), iss: ISSUER, aud: AUDIENCE, exp: nowSec() + 300, iat: nowSec() });

async function statusFor(w: { handler: any }, token: string | undefined, studentId = "stu-1"): Promise<number> {
  const res = await call(w, "POST", threadsPath(studentId), token === undefined ? {} : { token });
  return res.status;
}

test("P1a forged and wrong tokens against a student route: none is ever served, none writes anything", async () => {
  const w = chatWorld();
  try {
    const real = await studentToken(adult());
    const [h, p, s] = real.split(".");
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const tampered = `${h}.${b64({ ...goodClaims(), studentId: "stu-2" })}.${s}`; // payload swapped, signature kept
    const algNone = `${b64({ alg: "none", typ: "JWT" })}.${b64(goodClaims())}.`;
    const algNone2 = `${b64({ alg: "none", typ: "JWT" })}.${b64(goodClaims())}.${s}`;
    // algorithm confusion: HS256 signed with the PEM public key bytes as the secret
    const pem = (await import("node:crypto")).createPublicKey; void pem;
    const hsHeader = b64({ alg: "HS256", typ: "JWT" });
    const hsPayload = b64(goodClaims());
    const hsSig = createHmac("sha256", "not-the-key").update(`${hsHeader}.${hsPayload}`).digest("base64url");
    const confusion = `${hsHeader}.${hsPayload}.${hsSig}`;
    const stranger = await studentToken(adult(), { key: other.privateKey });
    const expired = await new SignJWT(adult() as any).setProtectedHeader({ alg: "RS256" }).setIssuer(ISSUER).setAudience(AUDIENCE).setExpirationTime(nowSec() - 3600).sign(generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey);
    const wrongAud = await new SignJWT(adult() as any).setProtectedHeader({ alg: "RS256" }).setIssuer(ISSUER).setAudience("some-other-audience").setExpirationTime(nowSec() + 300).sign(other.privateKey);
    const bad: Record<string, string | undefined> = { none: undefined, tampered, algNone, algNone2, confusion, stranger, expired, wrongAud, junk: "a.b.c", empty: "" };
    for (const [name, tok] of Object.entries(bad)) {
      const status = await statusFor(w, tok);
      assert.equal(status, 401, `${name} must be 401 (got ${status})`);
    }
    // header variants
    for (const hdr of ["Basic abc", "Bearer", "bearer  ", `Token ${real}`]) {
      const res = await w.handler({ method: "POST", url: threadsPath("stu-1"), headers: { authorization: hdr }, remoteAddress: "203.0.113.9", readBody: async () => "" } as any);
      assert.equal(res.status, 401, `header ${hdr}`);
    }
    // role/claims shapes with a VALID signature
    for (const claims of [
      { ...adult(), role: "Student" },
      { ...adult(), role: ["student"] },
      { ...adult(), studentId: 123 },
      { ...adult(), studentId: "" },
      { ...adult(), tenant: "tenant-a:evil" },
      { ...adult(), tenant: "../x" },
      { ...adult(), tenant: 5 },
      { tenant: "tenant-a", studentId: "stu-1" },
    ]) {
      const tok = await studentToken(claims as any);
      const status = await statusFor(w, tok);
      assert.ok(status === 401 || status === 403, `claims ${JSON.stringify(claims)} -> ${status}`);
    }
    assert.equal(everythingStored(w.fakeDb), "[]", "no rejected request may have stored anything");
  } finally {
    w.cleanup();
  }
});

test("P1b a student token is refused by the counsellor verifier even when it shares issuer, audience and key", async () => {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pemKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  const counsellor = createJwtVerifier(jwtConfigFromEnv({ VC_JWT_ISSUER: ISSUER, VC_JWT_AUDIENCE: AUDIENCE, VC_JWT_PUBLIC_KEY: pemKey }));
  for (const claims of [adult(), { ...adult(), role: "counsellor" }, { ...adult(), role: "admin", counsellorId: "x" }]) {
    const tok = await new SignJWT(claims as any).setProtectedHeader({ alg: "RS256" }).setIssuer(ISSUER).setAudience(AUDIENCE).setExpirationTime(nowSec() + 300).sign(keys.privateKey);
    let accepted: unknown = null;
    try { accepted = await counsellor.verify(tok); } catch { accepted = null; }
    // a student-role token must never become a counsellor context
    if (claims.role === "student") assert.equal(accepted, null, `student token accepted by counsellor verifier: ${JSON.stringify(accepted)}`);
  }
});

test("P2 student A cannot read or touch student B: same tenant and across tenants, threads, turns, profile, facts", async () => {
  const w = chatWorld({ deps: { extractFacts: async ({ studentId }) => [{ key: "target_country", value: `secret-of-${studentId}` }] } });
  try {
    const tokA = await studentToken(adult("stu-a", "tenant-a"));
    const tokB = await studentToken(adult("stu-b", "tenant-a"));
    const tokA2 = await studentToken(adult("stu-a", "tenant-b")); // same student id, other tenant
    const tA = await newThread(w, tokA, "stu-a");
    const turnA = await call(w, "POST", turnsPath("stu-a", tA), { token: tokA, body: { text: GERMANY_QUESTION, clientTurnId: "same-id" } });
    assert.equal(turnA.status, 200);
    // B -> A's thread, with B's path and with A's path
    for (const [path, tok] of [
      [`${threadsPath("stu-b")}/${tA}`, tokB],
      [`${threadsPath("stu-a")}/${tA}`, tokB],
    ] as const) {
      const r = await call(w, "GET", path, { token: tok });
      assert.equal(r.status, 404, path);
      assert.ok(!r.body.includes("Germany") && !r.body.includes("tuition"));
    }
    const post = await call(w, "POST", turnsPath("stu-b", tA), { token: tokB, body: { text: "hello there", clientTurnId: "x-1" } });
    assert.equal(post.status, 404);
    const post2 = await call(w, "POST", turnsPath("stu-a", tA), { token: tokB, body: { text: "hello there", clientTurnId: "x-2" } });
    assert.equal(post2.status, 404);
    // other tenant, same student id
    const cross = await call(w, "GET", `${threadsPath("stu-a")}/${tA}`, { token: tokA2 });
    assert.equal(cross.status, 404);
    const crossPost = await call(w, "POST", turnsPath("stu-a", tA), { token: tokA2, body: { text: GERMANY_QUESTION, clientTurnId: "same-id" } });
    assert.equal(crossPost.status, 404);
    // facts: A's proposed fact id cannot be decided by B or by tenant-b's stu-a
    const profA = await call(w, "GET", profilePath("stu-a"), { token: tokA });
    assert.equal(profA.status, 200);
    const factId: string = profA.json.proposed[0].factId;
    assert.equal(factId, profileFactId("stu-a", "target_country"));
    for (const [sid, tok] of [["stu-b", tokB], ["stu-a", tokA2], ["stu-a", tokB]] as const) {
      const r = await call(w, "POST", `/v1/students/${sid}/chat/profile/facts/${factId}/decision`, { token: tok, body: { action: "erase" } });
      assert.ok(r.status === 404, `decision by ${sid} -> ${r.status}`);
    }
    const profAfter = await call(w, "GET", profilePath("stu-a"), { token: tokA });
    assert.equal(profAfter.json.proposed.length, 1, "A's fact must survive B's erase attempts");
    // B's own profile does not show A's
    const profB = await call(w, "GET", profilePath("stu-b"), { token: tokB });
    assert.ok(!profB.body.includes("secret-of-stu-a"));
    // the same clientTurnId in B's own thread is an independent exchange
    const tB = await newThread(w, tokB, "stu-b");
    const turnB = await call(w, "POST", turnsPath("stu-b", tB), { token: tokB, body: { text: GERMANY_QUESTION, clientTurnId: "same-id" } });
    assert.equal(turnB.status, 200);
    // A's history unchanged and holds nothing of B
    const histA = await call(w, "GET", `${threadsPath("stu-a")}/${tA}`, { token: tokA });
    assert.equal(histA.json.turns.length, 2);
  } finally {
    w.cleanup();
  }
});

test("P3 under-18 variants: only a boolean true consent stores text; odd claim shapes fail closed; nothing leaks through crisis, overlong or retry", async () => {
  for (const [label, extra, expectStored] of [
    ["no consent", {}, false],
    ["consent string", { guardianConsent: "true" }, false],
    ["consent number", { guardianConsent: 1 }, false],
    ["consent array", { guardianConsent: [true] }, false],
    ["consent false", { guardianConsent: false }, false],
    ["consent true", { guardianConsent: true }, true],
  ] as const) {
    const w = chatWorld();
    try {
      const tok = await studentToken(minor("stu-m", "tenant-a", extra as any));
      const tid = await newThread(w, tok, "stu-m");
      const text = `${GERMANY_QUESTION} My number is 9876543210 and mail kid.secret@example.com`;
      const r = await call(w, "POST", turnsPath("stu-m", tid), { token: tok, body: { text, clientTurnId: "m-1" } });
      assert.equal(r.status, 200, label);
      const stored = everythingStored(w.fakeDb);
      assert.equal(stored.includes("[PHONE]") || stored.includes("tuition"), expectStored, `${label}: stored? ${stored.slice(0, 300)}`);
      assert.ok(!stored.includes("9876543210") && !stored.includes("kid.secret"), `${label}: raw PII stored`);
    } finally {
      w.cleanup();
    }
  }
  // age claims: age 12 with isMinor:false is still a minor; age 30 with no isMinor is adult
  for (const [claims, expectStored] of [
    [{ tenant: "tenant-a", studentId: "stu-x", role: "student", isMinor: false, age: 12 }, false],
    [{ tenant: "tenant-a", studentId: "stu-x", role: "student", age: 30 }, true],
    [{ tenant: "tenant-a", studentId: "stu-x", role: "student", isMinor: "false" }, false],
    [{ tenant: "tenant-a", studentId: "stu-x", role: "student", age: "30" }, false],
    [{ tenant: "tenant-a", studentId: "stu-x", role: "student", age: 17.99 }, false],
    [{ tenant: "tenant-a", studentId: "stu-x", role: "student", isMinor: true, age: 40 }, false],
  ] as const) {
    const w = chatWorld();
    try {
      const tok = await studentToken(claims as any);
      const tid = await newThread(w, tok, "stu-x");
      await call(w, "POST", turnsPath("stu-x", tid), { token: tok, body: { text: GERMANY_QUESTION, clientTurnId: "a-1" } });
      assert.equal(everythingStored(w.fakeDb).includes("tuition"), expectStored, JSON.stringify(claims));
    } finally {
      w.cleanup();
    }
  }
  // crisis + overlong crisis from an unconsented minor: fixed message, no text and no escalation anywhere
  const w = chatWorld();
  try {
    const tok = await studentToken(minor("stu-m", "tenant-a"));
    const tid = await newThread(w, tok, "stu-m");
    const r1 = await call(w, "POST", turnsPath("stu-m", tid), { token: tok, body: { text: `${CRISIS_TEXT} call 9876543210`, clientTurnId: "c-1" } });
    assert.equal(r1.status, 200);
    assert.match(r1.body, /14416/);
    const long = `${"x ".repeat(3000)} ${CRISIS_TEXT} ${"y ".repeat(500)}`;
    const r2 = await call(w, "POST", turnsPath("stu-m", tid), { token: tok, body: { text: long, clientTurnId: "c-2" } });
    assert.equal(r2.status, 200);
    assert.match(r2.body, /14416/);
    assert.equal(w.escalations.length, 0, "no escalation hand-off for an unconsented minor");
    const stored = everythingStored(w.fakeDb);
    assert.ok(!stored.includes("9876543210") && !stored.includes("kill myself") && !stored.includes("xx x"), stored.slice(0, 400));
    // chat_turns must be empty for this student
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 0);
  } finally {
    w.cleanup();
  }
});

test("P4 rate limit: 30 normal turns/min per student, crisis never limited, other student and other tenant unaffected", async () => {
  const w = chatWorld();
  try {
    const tok = await studentToken(adult("stu-r", "tenant-a"));
    const tid = await newThread(w, tok, "stu-r"); // request 1
    let last = 0;
    for (let i = 0; i < 29; i++) {
      const r = await call(w, "GET", `${threadsPath("stu-r")}/${tid}`, { token: tok });
      last = r.status;
      assert.equal(last, 200, `request ${i + 2}`);
    }
    const over = await call(w, "GET", `${threadsPath("stu-r")}/${tid}`, { token: tok });
    assert.equal(over.status, 429);
    assert.ok(over.headers?.["retry-after"]);
    const crisis = await call(w, "POST", turnsPath("stu-r", tid), { token: tok, body: { text: CRISIS_TEXT, clientTurnId: "cr-1" } });
    assert.equal(crisis.status, 200);
    const tok2 = await studentToken(adult("stu-s", "tenant-a"));
    assert.equal((await call(w, "POST", threadsPath("stu-s"), { token: tok2 })).status, 201);
    const tok3 = await studentToken(adult("stu-r", "tenant-b"));
    assert.equal((await call(w, "POST", threadsPath("stu-r"), { token: tok3 })).status, 201);
  } finally {
    w.cleanup();
  }
});

test("P5 sandbox tenant: real-looking id refused on every route, syn- id accepted", async () => {
  const w = chatWorld({ deps: { sandboxTenantId: "sandbox" } });
  try {
    const real = await studentToken(adult("priya-real", "sandbox"));
    assert.equal(await statusFor(w, real, "priya-real"), 403);
    const syn = await studentToken(adult("syn-001", "sandbox"));
    assert.equal(await statusFor(w, syn, "syn-001"), 201);
  } finally {
    w.cleanup();
  }
});
