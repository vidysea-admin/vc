/**
 * Sub-checker "authcap" hostile probes for p1-u10w (C1, C2, C7, C15, C11, C9). Lives only in the scratch copy and the evidence dir.
 * Fake providers only; SYNTHETIC ids. Each refusal: HTTP non-101 BEFORE the upgrade, provider connect never called, no socket,
 * and neither the token nor its signature appears in w.logs or captured console/stderr output.
 */
import assert from "node:assert/strict";
import net from "node:net";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { SignJWT } from "jose";
import { createChatThread, getStudentUsage, recordStudentUsage, usageMonth } from "@vc/db";
import { VoiceSessionResponseSchema } from "@vc/schemas";
import { STUDENT_JWT_ENV, createStudentJwtVerifier, studentJwtConfigFromEnv } from "../src/auth.js";
import { VOICE_WS_AUDIENCE, VOICE_WS_ISSUER } from "../src/voice.js";
import { AUDIENCE, ISSUER, GERMANY_QUESTION } from "./chat-fixtures.js";
import { adult, call, newThread, studentToken, turnsPath, until, voiceWorld, type VoiceWorld, type VoiceWorldOptions } from "./voice-fixtures.js";

const MIN = 60_000;
const SID = "11111111-1111-4111-8111-111111111111";

interface Ctx {
  w: VoiceWorld;
  t1: string; // stu-1 / tenant-a thread
  t1b: string; // second stu-1 thread
  t2: string; // stu-2 / tenant-a thread
  tb: string; // stu-1 / tenant-b thread
  connectCalls: { n: number };
  captured: string[];
}

async function withWorld(fn: (c: Ctx) => Promise<void>, opts?: VoiceWorldOptions): Promise<void> {
  const w = await voiceWorld({ ...opts, deps: { silenceTimeoutMs: 10 * 3600_000, ...(opts?.deps ?? {}) } });
  const captured: string[] = [];
  const orig = { error: console.error, warn: console.warn, info: console.info, log: console.log, werr: process.stderr.write.bind(process.stderr) };
  const grab = (...a: unknown[]) => void captured.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
  console.error = grab;
  console.warn = grab;
  console.info = grab;
  console.log = grab;
  (process.stderr as any).write = (chunk: any, ...rest: any[]) => {
    captured.push(String(chunk));
    const cb = rest.find((r) => typeof r === "function");
    if (cb) cb();
    return true;
  };
  const connectCalls = { n: 0 };
  const origConnect = w.provider.connect.bind(w.provider);
  (w.provider as any).connect = async (cfg: any) => {
    connectCalls.n++;
    return origConnect(cfg);
  };
  try {
    const t1 = await newThread(w.chat, await studentToken(adult()));
    const t1b = await newThread(w.chat, await studentToken(adult()));
    const t2 = await newThread(w.chat, await studentToken(adult("stu-2")), "stu-2");
    const tb = await newThread(w.chat, await studentToken(adult("stu-1", "tenant-b")));
    await fn({ w, t1, t1b, t2, tb, connectCalls, captured });
  } finally {
    console.error = orig.error;
    console.warn = orig.warn;
    console.info = orig.info;
    console.log = orig.log;
    (process.stderr as any).write = orig.werr;
    await w.cleanup();
  }
}

interface ForgeOpts {
  claims?: Record<string, unknown>;
  omit?: string[];
  alg?: string;
  secret?: Uint8Array;
  iss?: string | null;
  aud?: string | string[] | null;
  jti?: unknown;
  iat?: number | null;
  exp?: number | null;
}
async function forge(w: VoiceWorld, base: Record<string, unknown>, o: ForgeOpts = {}): Promise<string> {
  const nowSec = Math.floor(w.clock.ms / 1000);
  const payload: Record<string, unknown> = { sid: SID, minor: false, guardianConsent: false, ...base, ...(o.claims ?? {}) };
  for (const k of o.omit ?? []) delete payload[k];
  if (o.jti !== undefined && o.jti !== null) payload.jti = o.jti;
  let j = new SignJWT(payload as any).setProtectedHeader({ alg: o.alg ?? "HS256" });
  if (o.iss !== null) j = j.setIssuer(o.iss ?? VOICE_WS_ISSUER);
  if (o.aud !== null) j = j.setAudience(o.aud ?? VOICE_WS_AUDIENCE);
  if (o.jti === undefined) j = j.setJti(`jti-${Math.random().toString(16).slice(2)}-0000-4000-8000-000000000000`);
  if (o.iat !== null) j = j.setIssuedAt(o.iat ?? nowSec);
  if (o.exp !== null) j = j.setExpirationTime(o.exp ?? nowSec + 60);
  return j.sign(o.secret ?? w.wsSecret);
}
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

function leaked(c: Ctx, token: string): string[] {
  const hay = JSON.stringify(c.w.logs) + "\n" + c.captured.join("\n");
  const bad: string[] = [];
  if (hay.includes(token)) bad.push("token");
  const sig = token.split(".")[2];
  if (sig && sig.length > 8 && hay.includes(sig)) bad.push("signature");
  return bad;
}

/** Asserts refusal at the HTTP layer (never a 101), no provider connect, no socket, and no token/signature in any log. */
async function refused(c: Ctx, token: string | undefined, studentId: string, threadId: string, label: string, o: { status?: number; how?: "header" | "protocol" | "query" } = {}): Promise<void> {
  const before = c.connectCalls.n;
  const res = await c.w.connect(token, { studentId, threadId, how: o.how });
  assert.equal(res.ok, false, `${label}: must be refused before the upgrade completes`);
  assert.equal((res as { status: number }).status, o.status ?? 401, `${label}: status`);
  assert.equal(c.connectCalls.n, before, `${label}: provider connect must not be called`);
  assert.equal(c.w.voice.stats().sockets, 0, `${label}: no socket accepted`);
  if (token) assert.deepEqual(leaked(c, token), [], `${label}: token/signature leaked into a log`);
}

const tokenOf = (w: VoiceWorld, studentId: string, threadId: string, extra: Record<string, unknown> = {}) =>
  forge(w, { tenant: "tenant-a", studentId, threadId, ...extra });

function rawUpgrade(port: number, path: string, extraHeaders = ""): Promise<string> {
  return new Promise((resolve) => {
    let buf = "";
    let done = false;
    const finish = (s: string) => {
      if (done) return;
      done = true;
      resolve(s);
    };
    const s = net.connect(port, "127.0.0.1", () => {
      s.write(
        `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: vc-voice-v1\r\n${extraHeaders}\r\n`,
      );
    });
    s.on("data", (d) => {
      buf += d.toString("latin1");
      if (buf.includes("\r\n")) {
        s.destroy();
        finish(buf.split("\r\n")[0]!);
      }
    });
    s.on("close", () => finish(buf.split("\r\n")[0] || "closed"));
    s.on("error", () => undefined);
  });
}

// ---------------------------------------------------------------------------
// (1) WS auth
// ---------------------------------------------------------------------------

test("(1a) token minted for ANOTHER student of the same tenant is refused on this student's path, and on its own thread path with the wrong thread", async (t) => {
  await withWorld(async (c) => {
    const { w } = c;
    const tok2 = await w.mint(adult("stu-2"), c.t2, "stu-2");
    await refused(c, tok2, "stu-1", c.t1, "stu-2 token on stu-1 path");
    const tok2b = await w.mint(adult("stu-2"), c.t2, "stu-2");
    await refused(c, tok2b, "stu-2", c.t1, "stu-2 token on stu-2 path but stu-1's thread id");
    // Secret-holder case (informational): claims student stu-2 + stu-1's thread id, path matches the claims.
    const forged = await tokenOf(w, "stu-2", c.t1);
    const res = await w.connect(forged, { studentId: "stu-2", threadId: c.t1 });
    t.diagnostic(`secret-holder forged stu-2+thread-of-stu-1: upgrade ok=${res.ok}`);
    if (res.ok) {
      res.client.send({ type: "start", threadId: c.t1 });
      await until(() => res.client.closed, "closed");
      assert.equal(res.client.of("error")[0].code, "not_found");
      assert.equal(c.connectCalls.n, 0, "no provider connect for a thread the student does not own");
    }
  });
});

test("(1b/1k) tenant confusion: other-tenant token refused on tenant-a path; wrong claim key `tenantId`; unsafe tenant strings", async (t) => {
  await withWorld(async (c) => {
    const { w } = c;
    const tokB = await w.mint(adult("stu-1", "tenant-b"), c.tb, "stu-1");
    await refused(c, tokB, "stu-1", c.t1, "tenant-b token on tenant-a thread path");
    // claim key `tenantId` instead of `tenant`
    const alt = await forge(w, { tenantId: "tenant-a", studentId: "stu-1", threadId: c.t1 });
    await refused(c, alt, "stu-1", c.t1, "claim named tenantId instead of tenant");
    for (const bad of ["", "a b", "../x", "tenant-a\u0000x", "x".repeat(200), 5, null]) {
      const tk = await forge(w, { tenant: bad, studentId: "stu-1", threadId: c.t1 });
      await refused(c, tk, "stu-1", c.t1, `tenant claim ${JSON.stringify(bad)?.slice(0, 20)}`);
    }
    // Secret-holder: tenant-b claim + tenant-a thread id string: upgrade passes (key is the credential), start must find nothing.
    const forged = await forge(w, { tenant: "tenant-b", studentId: "stu-1", threadId: c.t1 });
    const res = await w.connect(forged, { studentId: "stu-1", threadId: c.t1 });
    t.diagnostic(`secret-holder tenant-b + tenant-a thread id: upgrade ok=${res.ok}`);
    if (res.ok) {
      res.client.send({ type: "start", threadId: c.t1 });
      await until(() => res.client.closed, "closed");
      assert.equal(res.client.of("error")[0].code, "not_found");
      assert.equal(c.connectCalls.n, 0);
    }
  });
});

test("(1c) expiry: exp in the past, exp == now, 59 s ok / 60 s refused, lifetime ceiling, future iat", async (t) => {
  await withWorld(async (c) => {
    const { w } = c;
    const nowSec = Math.floor(w.clock.ms / 1000);
    await refused(c, await forge(w, { tenant: "tenant-a", studentId: "stu-1", threadId: c.t1 }, { exp: nowSec - 10, iat: nowSec - 70 }), "stu-1", c.t1, "exp 10 s in the past");
    await refused(c, await forge(w, { tenant: "tenant-a", studentId: "stu-1", threadId: c.t1 }, { exp: nowSec }), "stu-1", c.t1, "exp == now");
    // minted: valid at +59 s, expired at +60 s
    const a = await w.mint(adult(), c.t1);
    const b = await w.mint(adult(), c.t1);
    w.clock.ms += 59_000;
    const okA = await w.connect(a, { studentId: "stu-1", threadId: c.t1 });
    assert.equal(okA.ok, true, "token valid at +59 s");
    if (okA.ok) okA.client.abort();
    await until(() => w.voice.stats().sockets === 0, "closed");
    w.clock.ms += 1_000;
    await refused(c, b, "stu-1", c.t1, "minted token at +60 s");
    // lifetime ceiling (hardening; only a secret holder can mint a long-lived token)
    const nowSec2 = Math.floor(w.clock.ms / 1000);
    const long = await forge(w, { tenant: "tenant-a", studentId: "stu-1", threadId: c.t1 }, { exp: nowSec2 + 3600 });
    const resLong = await w.connect(long, { studentId: "stu-1", threadId: c.t1 });
    t.diagnostic(`exp = iat+3600 (beyond the 60 s lifetime): upgrade ok=${resLong.ok}`);
    const fut = await forge(w, { tenant: "tenant-a", studentId: "stu-1", threadId: c.t1 }, { iat: nowSec2 + 3600, exp: nowSec2 + 3660 });
    const resFut = await w.connect(fut, { studentId: "stu-1", threadId: c.t1 });
    t.diagnostic(`iat 1 h in the future: upgrade ok=${resFut.ok}`);
    assert.equal(resLong.ok, false, "a token whose exp-iat exceeds the 60 s lifetime should be refused (hardening)");
  });
});

test("(1d/1e/1f) algorithm confusion and key: none (several spellings), HS384, HS512, wrong secret, empty signature, oversized", async () => {
  await withWorld(async (c) => {
    const { w } = c;
    const base = { tenant: "tenant-a", studentId: "stu-1", threadId: c.t1 };
    const nowSec = Math.floor(w.clock.ms / 1000);
    const body = { ...base, sid: SID, minor: false, guardianConsent: false, iss: VOICE_WS_ISSUER, aud: VOICE_WS_AUDIENCE, jti: "j-none-0000-4000-8000-000000000000", iat: nowSec, exp: nowSec + 60 };
    for (const alg of ["none", "None", "NONE", "nOnE"]) {
      await refused(c, `${b64({ alg, typ: "JWT" })}.${b64(body)}.x`, "stu-1", c.t1, `alg ${alg}`);
      await refused(c, `${b64({ alg, typ: "JWT" })}.${b64(body)}.`, "stu-1", c.t1, `alg ${alg} empty sig`);
    }
    await refused(c, await forge(w, base, { alg: "HS384" }), "stu-1", c.t1, "HS384 with the right secret");
    await refused(c, await forge(w, base, { alg: "HS512" }), "stu-1", c.t1, "HS512 with the right secret");
    await refused(c, await forge(w, base, { secret: new Uint8Array(32).fill(7) }), "stu-1", c.t1, "wrong secret");
    await refused(c, await forge(w, base, { secret: w.wsSecret.slice(0, 31) }), "stu-1", c.t1, "truncated secret");
    // tampered payload keeping a valid signature of another payload
    const good = await forge(w, base);
    const [h, , s] = good.split(".");
    const tampered = `${h}.${b64({ ...body, studentId: "stu-2", threadId: c.t2 })}.${s}`;
    await refused(c, tampered, "stu-2", c.t2, "payload swapped, signature kept");
    await refused(c, `${good}A`, "stu-1", c.t1, "signature extended by a char");
    await refused(c, "x".repeat(4100), "stu-1", c.t1, "oversized token");
    await refused(c, `${good}.extra`, "stu-1", c.t1, "four segments");
    // The unburned good token still works (no refusal above consumed it).
    assert.equal((await w.connect(good, { studentId: "stu-1", threadId: c.t1 })).ok, true);
  });
});

test("(1g) claim hygiene: wrong iss / aud, aud array, missing iat/jti/exp/studentId/tenant/threadId/sid, wrong types, missing sub", async (t) => {
  await withWorld(async (c) => {
    const { w } = c;
    const base = { tenant: "tenant-a", studentId: "stu-1", threadId: c.t1 };
    await refused(c, await forge(w, base, { iss: "https://evil.test" }), "stu-1", c.t1, "wrong issuer");
    await refused(c, await forge(w, base, { iss: null }), "stu-1", c.t1, "missing issuer");
    await refused(c, await forge(w, base, { aud: "vc-student" }), "stu-1", c.t1, "audience vc-student");
    await refused(c, await forge(w, base, { aud: null }), "stu-1", c.t1, "missing audience");
    await refused(c, await forge(w, base, { aud: ["other"] }), "stu-1", c.t1, "audience array without ours");
    // missing jti: build without calling setJti
    const noJti = await new SignJWT({ ...base, sid: SID, minor: false, guardianConsent: false } as any)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(VOICE_WS_ISSUER)
      .setAudience(VOICE_WS_AUDIENCE)
      .setIssuedAt(Math.floor(w.clock.ms / 1000))
      .setExpirationTime(Math.floor(w.clock.ms / 1000) + 60)
      .sign(w.wsSecret);
    await refused(c, noJti, "stu-1", c.t1, "missing jti");
    await refused(c, await forge(w, base, { exp: null }), "stu-1", c.t1, "missing exp");
    await refused(c, await forge(w, base, { iat: null }), "stu-1", c.t1, "missing iat");
    for (const k of ["studentId", "tenant", "threadId", "sid", "minor", "guardianConsent"]) {
      await refused(c, await forge(w, base, { omit: [k] }), "stu-1", c.t1, `missing ${k}`);
    }
    await refused(c, await forge(w, base, { claims: { sid: "not-a-uuid" } }), "stu-1", c.t1, "sid not a uuid");
    await refused(c, await forge(w, base, { claims: { minor: "false" } }), "stu-1", c.t1, "minor as string");
    await refused(c, await forge(w, base, { claims: { studentId: 7 } }), "stu-1", c.t1, "studentId number");
    await refused(c, await forge(w, base, { claims: { studentId: "" } }), "", c.t1, "studentId empty").catch(() => undefined);
    await refused(c, await forge(w, base, { claims: { threadId: ["a"] } }), "stu-1", c.t1, "threadId array");
    await refused(c, await forge(w, base, { jti: 12345 }), "stu-1", c.t1, "jti number");
    // aud array containing ours + another: jose accepts; informational
    const mixed = await forge(w, base, { aud: [VOICE_WS_AUDIENCE, "vc-student"] });
    const rm = await w.connect(mixed, { studentId: "stu-1", threadId: c.t1 });
    t.diagnostic(`aud array [vc-voice-ws, vc-student] accepted=${rm.ok}`);
    // `sub` is not used by the code: a token without sub is the normal minted shape.
    const minted = await w.mint(adult(), c.t1);
    const claims = JSON.parse(Buffer.from(minted.split(".")[1]!, "base64url").toString("utf8"));
    t.diagnostic(`minted token has sub claim: ${"sub" in claims}; claim keys: ${Object.keys(claims).sort().join(",")}`);
    assert.equal((await w.connect(minted, { studentId: "stu-1", threadId: c.t1 })).ok, true);
  });
});

test("(1h) replay: sequential, after the first socket closed, 6 concurrent, same jti on a different token, refused attempts do not burn", async () => {
  await withWorld(async (c) => {
    const { w } = c;
    const tok = await w.mint(adult(), c.t1);
    const first = await w.connect(tok, { studentId: "stu-1", threadId: c.t1 });
    assert.equal(first.ok, true);
    const dup = await w.connect(tok, { studentId: "stu-1", threadId: c.t1 });
    assert.equal(dup.ok, false, "second use while the first is open");
    assert.equal((dup as any).status, 401);
    assert.equal(w.voice.stats().sockets, 1);
    if (first.ok) first.client.abort();
    await until(() => w.voice.stats().sockets === 0, "closed");
    await refused(c, tok, "stu-1", c.t1, "replay after the first socket closed");
    // 6 concurrent with one token
    const tok2 = await w.mint(adult(), c.t1);
    const rs = await Promise.all(Array.from({ length: 6 }, () => w.connect(tok2, { studentId: "stu-1", threadId: c.t1 })));
    assert.equal(rs.filter((r) => r.ok).length, 1, "exactly one of 6 concurrent upgrades wins");
    assert.ok(rs.filter((r) => !r.ok).every((r) => (r as any).status === 401 || (r as any).status === 429), "losers are 401 (or the pre-start 429)");
    for (const r of rs) if (r.ok) r.client.abort();
    await until(() => w.voice.stats().sockets === 0, "closed");
    // different token (different signature, new thread) carrying a used jti
    const usedJti = JSON.parse(Buffer.from(tok2.split(".")[1]!, "base64url").toString("utf8")).jti as string;
    await refused(c, await forge(w, { tenant: "tenant-a", studentId: "stu-1", threadId: c.t1b }, { jti: usedJti }), "stu-1", c.t1b, "reused jti on a forged token");
    // the first ok upgrade with a token for the other thread uses a new jti
    const tokB = await w.mint(adult(), c.t1b);
    assert.equal((await w.connect(tokB, { studentId: "stu-1", threadId: c.t1b })).ok, true);
  });
});

test("(1i) token for thread X on thread Y path; path variants over a raw socket (encoded, traversal, trailing slash, wrong method)", async (t) => {
  await withWorld(async (c) => {
    const { w } = c;
    const tx = await w.mint(adult(), c.t1);
    await refused(c, tx, "stu-1", c.t1b, "thread X token on thread Y path");
    const tx2 = await w.mint(adult(), c.t1);
    const base = `/v1/students/stu-1/chat/threads/${c.t1}/voice/stream`;
    const auth = `Authorization: Bearer ${tx2}\r\n`;
    const results: Record<string, string> = {};
    results.encodedStudent = await rawUpgrade(w.port, `/v1/students/stu%2D1/chat/threads/${c.t1}/voice/stream`, auth);
    results.trailingSlash = await rawUpgrade(w.port, `${base}/`, auth);
    results.doubleSlash = await rawUpgrade(w.port, `/v1//students/stu-1/chat/threads/${c.t1}/voice/stream`, auth);
    results.caseVariant = await rawUpgrade(w.port, `/V1/students/stu-1/chat/threads/${c.t1}/voice/stream`, auth);
    results.otherStudentAfterDotDot = await rawUpgrade(w.port, `/v1/students/stu-2/../stu-1/chat/threads/${c.t1b}/voice/stream`, auth);
    results.queryOnly = await rawUpgrade(w.port, `${base}?token=${tx2}`, "");
    t.diagnostic(JSON.stringify(results));
    for (const k of ["encodedStudent", "trailingSlash", "doubleSlash", "caseVariant"]) assert.ok(/ 404 /.test(results[k]!), `${k} -> 404, got ${results[k]}`);
    assert.ok(/ 401 /.test(results.queryOnly!), `query-only token -> 401, got ${results.queryOnly}`);
    // tx2 (thread t1) with a dot-dot path that normalises to thread t1b must not pass
    assert.ok(!/ 101 /.test(results.otherStudentAfterDotDot!), "dot-dot normalised path with a token for another thread is not upgraded");
    assert.deepEqual(leaked(c, tx2), []);
  });
});

test("(1j) token in the URL query is refused and ignored even beside a valid header; header beats subprotocol; no leakage", async (t) => {
  await withWorld(async (c) => {
    const { w } = c;
    const t1 = await w.mint(adult(), c.t1);
    await refused(c, t1, "stu-1", c.t1, "query only", { how: "query" });
    // garbage Authorization header and a valid vc-token subprotocol: the header wins -> 401
    const t2 = await w.mint(adult(), c.t1);
    const raw = await rawUpgrade(w.port, `/v1/students/stu-1/chat/threads/${c.t1}/voice/stream`, `Authorization: Bearer garbage.garbage.garbage\r\nSec-WebSocket-Protocol: vc-voice-v1, vc-token.${t2}\r\n`);
    t.diagnostic(`bad header + good subprotocol: ${raw}`);
    // vc-token prefix variants
    const raw2 = await rawUpgrade(w.port, `/v1/students/stu-1/chat/threads/${c.t1}/voice/stream`, `Sec-WebSocket-Protocol: vc-voice-v1, VC-TOKEN.${t2}\r\n`);
    t.diagnostic(`upper-case prefix subprotocol: ${raw2}`);
    assert.ok(/ 401 /.test(raw2), "upper-case prefix is not a token");
    // a good token in the query next to a good header: accepted via header
    const t3 = await w.mint(adult(), c.t1);
    const r = await w.connect(t3, { studentId: "stu-1", threadId: c.t1, how: "header" });
    assert.equal(r.ok, true);
    assert.deepEqual(leaked(c, t1), []);
    assert.deepEqual(leaked(c, t2), []);
    assert.deepEqual(leaked(c, t3), []);
  });
});

test("(1l/1m) a student REST JWT is not a voice token; a voice token is not a REST credential (session route, text routes)", async () => {
  await withWorld(async (c) => {
    const { w } = c;
    const rest = await studentToken(adult());
    await refused(c, rest, "stu-1", c.t1, "REST student JWT as voice token");
    await refused(c, rest, "stu-1", c.t1, "REST student JWT via subprotocol", { how: "protocol" });
    const vt = await w.mint(adult(), c.t1);
    const sessionPath = `/v1/students/stu-1/chat/threads/${c.t1}/voice/sessions`;
    assert.equal((await call(w, "POST", sessionPath, { token: vt })).status, 401, "voice token on the session route");
    assert.equal((await call(w.chat, "POST", `/v1/students/stu-1/chat/threads`, { token: vt })).status, 401, "voice token on chat thread create");
    assert.equal((await call(w.chat, "POST", turnsPath("stu-1", c.t1), { token: vt, body: { text: GERMANY_QUESTION, clientTurnId: "x-1" } })).status, 401, "voice token on a text turn");
    // and the token is still unspent
    assert.equal((await w.connect(vt, { studentId: "stu-1", threadId: c.t1 })).ok, true);
  });
});

// ---------------------------------------------------------------------------
// (2) Session route C1
// ---------------------------------------------------------------------------

test("(2) session route: roles, no/garbage/expired/wrong-aud student token, cross student/tenant paths, response schema and 60 s lifetime", async (t) => {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const PEM = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  const verifier = createStudentJwtVerifier(studentJwtConfigFromEnv({ [STUDENT_JWT_ENV.issuer]: ISSUER, [STUDENT_JWT_ENV.audience]: AUDIENCE, [STUDENT_JWT_ENV.publicKey]: PEM }));
  const mk = (claims: Record<string, unknown>, o: { exp?: number; iat?: number; aud?: string } = {}) =>
    new SignJWT(claims as any)
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt(o.iat ?? Math.floor(Date.now() / 1000))
      .setIssuer(ISSUER)
      .setAudience(o.aud ?? AUDIENCE)
      .setExpirationTime(o.exp ?? Math.floor(Date.now() / 1000) + 300)
      .sign(keys.privateKey);
  await withWorld(
    async (c) => {
      const { w } = c;
      const path = `/v1/students/stu-1/chat/threads/${c.t1}/voice/sessions`;
      const nowS = Math.floor(Date.now() / 1000);
      assert.equal((await call(w, "POST", path)).status, 401, "no token");
      assert.equal((await call(w, "POST", path, { token: "a.b.c" })).status, 401, "garbage");
      assert.equal((await call(w, "POST", path, { token: await mk(adult(), { exp: nowS - 3600, iat: nowS - 3900 }) })).status, 401, "expired student token");
      assert.equal((await call(w, "POST", path, { token: await mk(adult(), { aud: "something-else" }) })).status, 401, "student token wrong audience");
      assert.equal((await call(w, "POST", path, { token: await mk({ ...adult(), role: "counsellor" }) })).status, 403, "counsellor");
      assert.equal((await call(w, "POST", path, { token: await mk({ ...adult(), role: "admin" }) })).status, 403, "admin");
      assert.equal((await call(w, "POST", path, { token: await mk({ ...adult(), role: "superuser" }) })).status >= 400, true, "unknown role refused");
      assert.equal((await call(w, "POST", path, { token: await mk(adult("stu-2")) })).status, 404, "other student on stu-1 path");
      assert.equal((await call(w, "POST", `/v1/students/stu-2/chat/threads/${c.t1}/voice/sessions`, { token: await mk(adult()) })).status, 404, "stu-1 token + stu-1 thread under stu-2 path");
      assert.equal((await call(w, "POST", `/v1/students/stu-2/chat/threads/${c.t2}/voice/sessions`, { token: await mk(adult()) })).status, 404, "stu-1 token on stu-2's own path+thread");
      assert.equal((await call(w, "POST", path, { token: await mk(adult("stu-1", "tenant-b")) })).status, 404, "tenant-b stu-1 on tenant-a thread");
      assert.equal(c.connectCalls.n, 0);
      // happy path, two tenants
      for (const [tenant, thread] of [["tenant-a", c.t1], ["tenant-b", c.tb]] as const) {
        const res = await call(w, "POST", `/v1/students/stu-1/chat/threads/${thread}/voice/sessions`, { token: await mk(adult("stu-1", tenant)) });
        assert.equal(res.status, 201, tenant);
        const body = VoiceSessionResponseSchema.parse(res.json);
        const cl = JSON.parse(Buffer.from(body.token.split(".")[1]!, "base64url").toString("utf8"));
        assert.equal(cl.exp - cl.iat, 60);
        assert.equal(cl.tenant, tenant);
        assert.equal(cl.threadId, thread);
        assert.equal(Date.parse(body.expiresAt), cl.exp * 1000);
        assert.ok(!body.wsUrl.includes(body.token));
        assert.equal(res.headers["cache-control"], "no-store");
        t.diagnostic(`${tenant}: 201 ok, exp-iat=${cl.exp - cl.iat}, sessionMaxMinutes=${body.sessionMaxMinutes}`);
        assert.deepEqual(leaked(c, body.token), []);
      }
    },
    { deps: { verifier } },
  );
});

// ---------------------------------------------------------------------------
// (3) Monthly cap C7 / C15
// ---------------------------------------------------------------------------

const usedMs = (w: VoiceWorld, tenant = "tenant-a", studentId = "stu-1", at?: number) =>
  getStudentUsage(w.deps.dbForTenant(tenant), { studentId, month: usageMonth(new Date(at ?? w.clock.ms)) }).then((u) => u.voiceMs);
const addUsage = (w: VoiceWorld, ms: number, tenant = "tenant-a", studentId = "stu-1", at?: number) =>
  recordStudentUsage(w.deps.dbForTenant(tenant), { studentId, voiceMs: ms }, { now: new Date(at ?? w.clock.ms) });

test("(3a) 59 min used -> session limit 1 min, closed at 1 min exactly, month ends at exactly 60 min; 59m30s -> 30 s cap and exactly 60 total; 1 ms left", async () => {
  await withWorld(async (c) => {
    const { w } = c;
    await addUsage(w, 59 * MIN);
    const res = await w.session(adult(), c.t1);
    assert.equal(res.status, 201);
    assert.equal(VoiceSessionResponseSchema.parse(res.json).sessionMaxMinutes, 1);
    const { client } = await w.open(adult(), c.t1);
    w.timers.advance(59_999);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(client.closed, false);
    w.timers.advance(1);
    await until(() => client.closed, "closed at 1 min");
    assert.ok(client.of("error").some((e) => e.code === "session_time_limit"));
    await w.voice.settled();
    assert.equal(await usedMs(w), 60 * MIN);
    assert.equal((await w.session(adult(), c.t1)).status, 429);
  });
  await withWorld(async (c) => {
    const { w } = c;
    await addUsage(w, 59 * MIN + 30_000);
    assert.equal(VoiceSessionResponseSchema.parse((await w.session(adult(), c.t1)).json).sessionMaxMinutes, 1);
    const { client } = await w.open(adult(), c.t1);
    w.timers.advance(29_999);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(client.closed, false);
    w.timers.advance(1);
    await until(() => client.closed, "closed at 30 s");
    await w.voice.settled();
    assert.equal(await usedMs(w), 60 * MIN, "never more than the 60 minutes");
  });
  await withWorld(async (c) => {
    const { w } = c;
    await addUsage(w, 60 * MIN - 1);
    assert.equal((await w.session(adult(), c.t1)).status, 201);
    const { client } = await w.open(adult(), c.t1);
    w.timers.advance(1);
    await until(() => client.closed, "closed at 1 ms");
    await w.voice.settled();
    assert.equal(await usedMs(w), 60 * MIN);
  });
});

test("(3b) exactly 60 min (and over 60) -> 429 voice_quota_exceeded at the route and at start, before any provider connect; text continues", async () => {
  await withWorld(async (c) => {
    const { w } = c;
    const token = await w.mint(adult(), c.t1);
    await addUsage(w, 60 * MIN);
    const res = await w.session(adult(), c.t1);
    assert.equal(res.status, 429);
    assert.equal(res.json.error, "voice_quota_exceeded");
    const conn = await w.connect(token, { studentId: "stu-1", threadId: c.t1 });
    assert.ok(conn.ok);
    if (conn.ok) {
      conn.client.send({ type: "start", threadId: c.t1 });
      await until(() => conn.client.closed, "closed");
      assert.equal(conn.client.of("error")[0].code, "voice_quota_exceeded");
    }
    assert.equal(c.connectCalls.n, 0);
    await addUsage(w, 5 * MIN); // 65 min
    assert.equal((await w.session(adult(), c.t1)).status, 429);
    const turn = await call(w.chat, "POST", turnsPath("stu-1", c.t1), { token: await studentToken(adult()), body: { text: GERMANY_QUESTION, clientTurnId: "q-1" } });
    assert.equal(turn.status, 200);
  });
});

test("(3c) per-tenant override raising (120/90) and lowering (5) and invalid overrides (fail closed?)", async (t) => {
  await withWorld(
    async (c) => {
      const { w } = c;
      // tenant-a: 120 a month, 90 a session. 70 used -> allowed, session cap min(90, 50)=50
      await addUsage(w, 70 * MIN);
      const r = await w.session(adult(), c.t1);
      assert.equal(r.status, 201);
      assert.equal(VoiceSessionResponseSchema.parse(r.json).sessionMaxMinutes, 50);
      const { client } = await w.open(adult(), c.t1);
      w.timers.advance(49 * MIN + 59_999);
      await new Promise((rr) => setTimeout(rr, 30));
      assert.equal(client.closed, false, "tenant-a raised cap holds past the 20 min default");
      w.timers.advance(1);
      await until(() => client.closed, "closed at 50 min");
      await w.voice.settled();
      assert.equal(await usedMs(w), 120 * MIN);
      assert.equal((await w.session(adult(), c.t1)).status, 429);
      // tenant-b: 5 a month. 4 min used -> cap 1 min; 5 used -> refused
      await addUsage(w, 4 * MIN, "tenant-b");
      assert.equal(VoiceSessionResponseSchema.parse((await w.session(adult("stu-1", "tenant-b"), c.tb)).json).sessionMaxMinutes, 1);
      await addUsage(w, 1 * MIN, "tenant-b");
      assert.equal((await w.session(adult("stu-1", "tenant-b"), c.tb)).status, 429);
    },
    { deps: { limitsForTenant: (tn) => (tn === "tenant-a" ? { voiceMinutesPerMonth: 120, voiceSessionMaxMinutes: 90 } : tn === "tenant-b" ? { voiceMinutesPerMonth: 5 } : undefined) } },
  );
  for (const bad of [{ voiceMinutesPerMonth: 0 }, { voiceMinutesPerMonth: -5 }, { voiceMinutesPerMonth: 1.5 }, { voiceMinutesPerMonth: "60" as any }, { voiceMinutesPerMonth: Number.NaN }, { voiceMinutesPerMonth: Infinity }, { bogus: 1 } as any]) {
    await withWorld(
      async (c) => {
        const res = await c.w.session(adult(), c.t1);
        t.diagnostic(`invalid override ${String(JSON.stringify(bad))}: route status=${res.status}, token minted=${res.json?.token !== undefined}`);
        assert.notEqual(res.status, 201, `invalid override ${JSON.stringify(bad)} must not mint a token`);
        assert.equal(res.json?.token, undefined);
      },
      { deps: { limitsForTenant: () => bad } },
    );
  }
});

test("(3d) month boundary (UTC): previous month does not count; 23:59:59 vs 00:00:00; host TZ independent", async (t) => {
  await withWorld(async (c) => {
    const { w } = c;
    const lastSec = Date.parse("2026-10-31T23:59:59.000Z");
    const firstSec = Date.parse("2026-11-01T00:00:00.000Z");
    w.clock.ms = lastSec;
    await addUsage(w, 60 * MIN);
    assert.equal((await w.session(adult(), c.t1)).status, 429, "Oct 31 23:59:59 UTC: October is used up");
    w.clock.ms = firstSec;
    const r = await w.session(adult(), c.t1);
    assert.equal(r.status, 201, "Nov 1 00:00:00 UTC: new month");
    assert.equal(VoiceSessionResponseSchema.parse(r.json).sessionMaxMinutes, 20);
    // The same moment viewed from an east/west local zone would be a different local month; usage keys are UTC.
    t.diagnostic(`host TZ offset minutes=${new Date(lastSec).getTimezoneOffset()}; key at last sec=${usageMonth(new Date(lastSec))}, at first sec=${usageMonth(new Date(firstSec))}`);
    assert.equal(usageMonth(new Date(lastSec)), "2026-10");
    assert.equal(usageMonth(new Date(firstSec)), "2026-11");
    // November usage does not make October look used (clock back, reading Oct)
    await addUsage(w, 30 * MIN, "tenant-a", "stu-1", firstSec);
    assert.equal(await usedMs(w, "tenant-a", "stu-1", lastSec), 60 * MIN);
    assert.equal(await usedMs(w, "tenant-a", "stu-1", firstSec), 30 * MIN);
  });
});

test("(3e) a session that crosses midnight UTC: which month is charged, and can the total exceed 60 min across the boundary", async (t) => {
  await withWorld(async (c) => {
    const { w } = c;
    const start = Date.parse("2026-10-31T23:55:00.000Z");
    w.clock.ms = start;
    await addUsage(w, 55 * MIN, "tenant-a", "stu-1", start); // 55 used in October
    const { client } = await w.open(adult(), c.t1);
    // cap = 5 min (remaining in October). Cap timer fires at 00:00:00 -> finalize reads nowDate() in November.
    w.timers.advance(5 * MIN);
    await until(() => client.closed, "closed at the October cap");
    await w.voice.settled();
    const oct = await usedMs(w, "tenant-a", "stu-1", start);
    const nov = await usedMs(w, "tenant-a", "stu-1", Date.parse("2026-11-01T00:00:00.000Z"));
    t.diagnostic(`session 23:55->00:00 UTC (cap 5): October used=${oct / MIN} min, November used=${nov / MIN} min`);
    // total minutes actually spoken across both months = 60; the ledger must not be able to exceed the monthly cap in either month
    assert.ok(oct + nov === 60 * MIN, "no minute lost or double counted across the boundary");
    const nextRes = await w.session(adult(), c.t1);
    t.diagnostic(`after the cross-midnight session, Nov session route status=${nextRes.status}, sessionMaxMinutes=${nextRes.json?.sessionMaxMinutes}`);
  });
});

test("(3f) minutes recorded on end, abort, provider close and provider error; sum is exact; two students/tenants do not share a cap; no double count on end+abort", async () => {
  await withWorld(async (c) => {
    const { w } = c;
    const a = await w.open(adult(), c.t1);
    w.clock.ms += 90_000;
    a.client.send({ type: "end" });
    await until(() => a.client.closed, "closed");
    await w.voice.settled();
    assert.equal(await usedMs(w), 90_000, "end");
    const b = await w.open(adult(), c.t1);
    w.clock.ms += 30_000;
    b.client.abort();
    await until(() => w.voice.stats().sockets === 0, "closed");
    await w.voice.settled();
    assert.equal(await usedMs(w), 120_000, "abort");
    const d = await w.open(adult(), c.t1);
    w.clock.ms += 45_000;
    w.provider.last.emitClosed("gone");
    await until(() => d.client.closed, "closed");
    await w.voice.settled();
    assert.equal(await usedMs(w), 165_000, "provider close");
    const e = await w.open(adult(), c.t1);
    w.provider.last.emitError("boom");
    await until(() => e.client.of("error").length >= 1, "live_error");
    w.clock.ms += 20_000;
    e.client.abort();
    await until(() => w.voice.stats().sockets === 0, "closed");
    await w.voice.settled();
    assert.equal(await usedMs(w), 185_000, "after a provider error then abort");
    // end + abort at the same time: counted once
    const f = await w.open(adult(), c.t1);
    w.clock.ms += 10_000;
    f.client.send({ type: "end" });
    f.client.abort();
    await until(() => w.voice.stats().sockets === 0, "closed");
    await w.voice.settled();
    assert.equal(await usedMs(w), 195_000, "end+abort counted once");
    // cap timer and abort in the same tick
    const g = await w.open(adult(), c.t1);
    w.clock.ms += 5_000;
    g.client.abort();
    w.timers.advance(20 * MIN);
    await until(() => w.voice.stats().sockets === 0, "closed");
    await w.voice.settled();
    const total = await usedMs(w);
    assert.ok(total >= 200_000, "at least the 5 s");
    assert.ok(total <= 195_000 + 5_000 + 20 * MIN, "bounded by the cap timer");
  });
});

test("(3g) caps are per (tenant, student): stu-1 at 60 does not limit stu-2; tenant-a stu-1 at 60 does not limit tenant-b stu-1", async () => {
  await withWorld(async (c) => {
    const { w } = c;
    await addUsage(w, 60 * MIN);
    assert.equal((await w.session(adult(), c.t1)).status, 429);
    const s2 = await w.session(adult("stu-2"), c.t2, "stu-2");
    assert.equal(s2.status, 201);
    assert.equal(VoiceSessionResponseSchema.parse(s2.json).sessionMaxMinutes, 20);
    const sb = await w.session(adult("stu-1", "tenant-b"), c.tb);
    assert.equal(sb.status, 201);
    assert.equal(VoiceSessionResponseSchema.parse(sb.json).sessionMaxMinutes, 20);
    const o2 = await w.open(adult("stu-2"), c.t2, { studentId: "stu-2" });
    const ob = await w.open(adult("stu-1", "tenant-b"), c.tb, { studentId: "stu-1" });
    w.clock.ms += 7_000;
    o2.client.abort();
    ob.client.abort();
    await until(() => w.voice.stats().sockets === 0, "closed");
    await w.voice.settled();
    assert.equal(await usedMs(w, "tenant-a", "stu-2"), 7_000);
    assert.equal(await usedMs(w, "tenant-b", "stu-1"), 7_000);
    assert.equal(await usedMs(w, "tenant-a", "stu-1"), 60 * MIN);
  });
});

test("(3h/C15) supersede re-read: 50 used, A runs 5 min, B supersedes -> B capped at the remaining 5 min and total never exceeds 60", async () => {
  await withWorld(async (c) => {
    const { w } = c;
    await addUsage(w, 50 * MIN);
    const a = await w.open(adult(), c.t1);
    w.clock.ms += 5 * MIN; // A's cap is 10 min; clock moves without firing timers
    const b = await w.open(adult(), c.t1); // B supersedes A: A's 5 min are written, the month is read again
    await until(() => a.client.closed, "A closed");
    assert.ok(a.client.of("error").some((e) => e.code === "superseded"));
    w.timers.advance(5 * MIN - 1);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(b.client.closed, false);
    w.timers.advance(1);
    await until(() => b.client.closed, "B closed at remaining 5 min");
    assert.ok(b.client.of("error").some((e) => e.code === "session_time_limit"));
    await w.voice.settled();
    assert.equal(await usedMs(w), 60 * MIN, "50 + 5 + 5, never more than 60");
  });
});

test("(3i) concurrent starts of one student with 55 used: at most one session, total never exceeds 60", async () => {
  await withWorld(async (c) => {
    const { w } = c;
    await addUsage(w, 55 * MIN);
    const toks = await Promise.all([w.mint(adult(), c.t1), w.mint(adult(), c.t1)]);
    const conns = await Promise.all(toks.map((tk) => w.connect(tk, { studentId: "stu-1", threadId: c.t1 })));
    for (const r of conns) if (r.ok) r.client.send({ type: "start", threadId: c.t1 });
    await new Promise((r) => setTimeout(r, 150));
    assert.ok(w.voice.stats().liveSessions <= 1, `live sessions ${w.voice.stats().liveSessions}`);
    w.timers.advance(5 * MIN);
    await new Promise((r) => setTimeout(r, 100));
    w.timers.advance(5 * MIN);
    await new Promise((r) => setTimeout(r, 100));
    await w.voice.settled();
    for (const r of conns) if (r.ok) r.client.abort();
    await until(() => w.voice.stats().sockets === 0, "closed");
    await w.voice.settled();
    const total = await usedMs(w);
    assert.ok(total <= 60 * MIN, `total ${total / MIN} min`);
  });
});

test("(C11) session-route limiter: keyed by (tenant, student); counsellor/other-student refusals do not spend; pre-start cap is per student", async () => {
  await withWorld(
    async (c) => {
      const { w } = c;
      for (let i = 0; i < 2; i++) assert.equal((await w.session({ ...adult(), role: "counsellor" }, c.t1)).status, 403);
      for (let i = 0; i < 2; i++) assert.equal((await w.session(adult("stu-2"), c.t1, "stu-1")).status, 404);
      assert.equal((await w.session(adult(), c.t1)).status, 201);
      assert.equal((await w.session(adult(), c.t1)).status, 201);
      const lim = await w.session(adult(), c.t1);
      assert.equal(lim.status, 429);
      assert.equal(lim.json.error, "rate_limited");
      assert.equal((await w.session(adult("stu-1", "tenant-b"), c.tb)).status, 201, "same id other tenant has its own budget");
    },
    { deps: { limitsForTenant: () => ({ requestsPerMinute: 2 }) } },
  );
});
