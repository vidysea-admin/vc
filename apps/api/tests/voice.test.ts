/**
 * P1 U10 voice WebSocket API: C1 session route, C2 WS auth, C3 events, C4 resume/silence/cap/text fallback, C8 error/flag/default-off,
 * C9 tenancy and cleanup. SYNTHETIC only: a real loopback HTTP+WebSocket server, the `ws` client, MockLiveProvider (no network, no paid call).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { SignJWT } from "jose";
import { WebSocket } from "ws";
import { LiveConfigError, LiveSession, MockLiveProvider, MockProvider, type LiveProvider } from "@vc/providers";
import { createStudentFactExtractor } from "@vc/engine";
import { confirmErasure, createChatThread, getStudentUsage, listChatTurns, requestErasure, usageMonth } from "@vc/db";
import { VoiceSessionResponseSchema } from "@vc/schemas";
import { GoLiveRefusedError } from "../src/go-live-gate.js";
import { createApiServer } from "../src/server.js";
import {
  VOICE_CRISIS_NO_WORDS_TEXT,
  VOICE_FLAG_ENV,
  VOICE_RESUME_WINDOW_MS,
  VOICE_START_TIMEOUT_MS,
  VOICE_WS_AUDIENCE,
  VoiceConfigError,
  createVoiceApi,
  voiceEnabledFromEnv,
  withVoiceRoutes,
  type VoiceApiDeps,
} from "../src/voice.js";
import {
  CRISIS_PHRASE,
  CRISIS_TEXT_FIXED,
  adult,
  call,
  cleanupGates,
  gatesFixture,
  minorConsent,
  minorNoConsent,
  newThread,
  studentToken,
  turnsPath,
  until,
  voiceWorld,
  type VoiceWorld,
  type VoiceWorldOptions,
} from "./voice-fixtures.js";
import { APPROVER, NOW, GERMANY_QUESTION, SKILLS_DIR, minor, profilePath } from "./chat-fixtures.js";

async function withWorld(fn: (w: VoiceWorld, threadId: string) => Promise<void>, opts?: VoiceWorldOptions): Promise<void> {
  const w = await voiceWorld(opts);
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    await fn(w, threadId);
  } finally {
    await w.cleanup();
  }
}

const speak = (w: VoiceWorld, idx: number, text: string) => w.provider.backends[idx]!.emitInputTranscript(text, true);
const answer = (w: VoiceWorld, idx: number, text: string) => {
  w.provider.backends[idx]!.emitOutputTranscript(text);
  w.provider.backends[idx]!.emitTurnComplete();
};
const sessionClaims = (token: string) => JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")) as Record<string, any>;

// ---------------------------------------------------------------------------
// C1: the session route
// ---------------------------------------------------------------------------

test("C1: POST voice/sessions mints a short-lived token with the D-088 audio format and no token in the URL", async () => {
  await withWorld(async (w, threadId) => {
    const res = await w.session(adult(), threadId);
    assert.equal(res.status, 201);
    const body = VoiceSessionResponseSchema.parse(res.json);
    assert.equal(body.wsUrl, `ws://127.0.0.1:${w.port}/v1/students/stu-1/chat/threads/${threadId}/voice/stream`);
    assert.ok(!body.wsUrl.includes(body.token), "the credential never rides in the URL");
    assert.equal(body.sessionMaxMinutes, 20);
    assert.deepEqual(body.audio, { format: "pcm16", inputSampleRateHz: 16000, outputSampleRateHz: 24000 });
    const claims = sessionClaims(body.token);
    assert.equal(claims.aud, VOICE_WS_AUDIENCE);
    assert.equal(claims.studentId, "stu-1");
    assert.equal(claims.tenant, "tenant-a");
    assert.equal(claims.threadId, threadId);
    assert.equal(claims.exp - claims.iat, 60);
    assert.equal(Date.parse(body.expiresAt), claims.exp * 1000);
    assert.equal(res.headers["cache-control"], "no-store");
  });
});

test("C1: session route refusals: no token, wrong role, other student's path, unknown thread, other tenant's thread, bad body, bad method, fenced", async () => {
  await withWorld(async (w, threadId) => {
    const path = `/v1/students/stu-1/chat/threads/${threadId}/voice/sessions`;
    assert.equal((await call(w, "POST", path)).status, 401);
    assert.equal((await call(w, "POST", path, { token: "not.a.jwt" })).status, 401);
    const counsellor = await studentToken({ ...adult(), role: "counsellor" });
    assert.equal((await call(w, "POST", path, { token: counsellor })).status, 403);
    // stu-2's token on stu-1's path: indistinguishable from a missing resource.
    const other = await studentToken(adult("stu-2"));
    assert.equal((await call(w, "POST", path, { token: other })).status, 404);
    const mineFirst = await studentToken(adult());
    // stu-1's own token and own thread, but another student in the path: still 404, and no token is minted (the path student must equal the token student).
    const crossPath = await call(w, "POST", `/v1/students/stu-2/chat/threads/${threadId}/voice/sessions`, { token: mineFirst });
    assert.equal(crossPath.status, 404);
    assert.equal(crossPath.json.token, undefined);
    const mine = await studentToken(adult());
    assert.equal((await call(w, "POST", `/v1/students/stu-1/chat/threads/nope-1/voice/sessions`, { token: mine })).status, 404);
    // Same student id in another tenant: the thread does not exist there.
    const otherTenant = await studentToken(adult("stu-1", "tenant-b"));
    assert.equal((await call(w, "POST", path, { token: otherTenant })).status, 404);
    assert.equal((await call(w, "POST", path, { token: mine, body: { x: 1 } })).status, 400);
    assert.equal((await call(w, "POST", path, { token: mine, body: "not json" })).status, 400);
    assert.equal((await call(w, "GET", path, { token: mine })).status, 405);
    assert.equal(w.provider.backends.length, 0);
    assert.equal(w.voice.stats().sockets, 0);
  });
});

test("C1: a fenced (erasure in progress) student gets 409 student_fenced and no token", async () => {
  await withWorld(async (w, threadId) => {
    const { requestErasure, confirmErasure } = await import("@vc/db");
    const db = w.deps.dbForTenant("tenant-a");
    const { requestId } = await requestErasure(db, { studentId: "stu-1", requestedBy: "counsellor-7", reason: "student_request" });
    await confirmErasure(db, { requestId, confirmedBy: "admin-2" });
    const res = await w.session(adult(), threadId);
    assert.equal(res.status, 409);
    assert.equal(res.json.error, "student_fenced");
    assert.equal(res.json.token, undefined);
  });
});

test("A6: the sandbox tenant accepts only syn- student ids at the voice session route", async () => {
  await withWorld(
    async (w) => {
      const real = await studentToken(adult("pl-4821", "sandbox"));
      const res = await call(w, "POST", `/v1/students/pl-4821/chat/threads/th-1/voice/sessions`, { token: real });
      assert.equal(res.status, 403);
      assert.equal(res.json.error, "sandbox_synthetic_only");
    },
    { deps: { sandboxTenantId: "sandbox" } },
  );
});

// ---------------------------------------------------------------------------
// C2: WebSocket auth. Every refusal is a 401 BEFORE the socket is accepted and before any provider connect.
// ---------------------------------------------------------------------------

async function assertRefused(w: VoiceWorld, token: string | undefined, threadId: string, status: number, o: Parameters<VoiceWorld["connect"]>[1] = { threadId }): Promise<void> {
  const res = await w.connect(token, { threadId, ...o });
  assert.equal(res.ok, false, "must be refused at the upgrade");
  assert.equal((res as { status: number }).status, status);
  assert.equal(w.provider.backends.length, 0, "no provider session was opened");
  assert.equal(w.voice.stats().sockets, 0, "no socket was accepted");
  assert.equal(w.voice.stats().liveSessions, 0);
}

test("C2: no token, a garbage token and a token in the URL query are each refused with 401", async () => {
  await withWorld(async (w, threadId) => {
    await assertRefused(w, undefined, threadId, 401);
    await assertRefused(w, "garbage", threadId, 401);
    await assertRefused(w, "a.b.c", threadId, 401);
    const good = await w.mint(adult(), threadId);
    await assertRefused(w, good, threadId, 401, { threadId, how: "query" });
    // The refused query attempt did not burn the token: it was never read.
    const ok = await w.connect(good, { threadId });
    assert.equal(ok.ok, true);
  });
});

test("C2: a token with the wrong audience (a student JWT, or any other aud) is refused", async () => {
  await withWorld(async (w, threadId) => {
    await assertRefused(w, await studentToken(adult()), threadId, 401);
    await assertRefused(w, await w.signWsToken({ tenant: "tenant-a", studentId: "stu-1", threadId }, { aud: "vc-student" }), threadId, 401);
    await assertRefused(w, await w.signWsToken({ tenant: "tenant-a", studentId: "stu-1", threadId }, { aud: "something-else" }), threadId, 401);
    await assertRefused(w, await w.signWsToken({ tenant: "tenant-a", studentId: "stu-1", threadId }, { iss: "https://evil.test" }), threadId, 401);
  });
});

test("C2: a token signed with another key, another algorithm, or alg none is refused", async () => {
  await withWorld(async (w, threadId) => {
    const base = { tenant: "tenant-a", studentId: "stu-1", threadId, sid: "11111111-1111-4111-8111-111111111111", minor: false, guardianConsent: false };
    await assertRefused(w, await w.signWsToken(base, { secret: new Uint8Array(32).fill(9) }), threadId, 401);
    const iat = Math.floor(w.clock.ms / 1000);
    const hs512 = await new SignJWT(base)
      .setProtectedHeader({ alg: "HS512" })
      .setIssuer("vc-api")
      .setAudience(VOICE_WS_AUDIENCE)
      .setJti("jti-hs512-0000-4000-8000-000000000000")
      .setIssuedAt(iat)
      .setExpirationTime(iat + 60)
      .sign(w.wsSecret);
    await assertRefused(w, hs512, threadId, 401);
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const none = `${b64({ alg: "none", typ: "JWT" })}.${b64({ ...base, iss: "vc-api", aud: VOICE_WS_AUDIENCE, jti: "j-none-0000-4000-8000-000000000000", iat, exp: iat + 60 })}.x`;
    await assertRefused(w, none, threadId, 401);
  });
});

test("C2: an expired token is refused (fake clock), and a token without exp or jti is refused", async () => {
  await withWorld(async (w, threadId) => {
    const token = await w.mint(adult(), threadId);
    w.clock.ms += 61_000;
    await assertRefused(w, token, threadId, 401);
    const iat = Math.floor(w.clock.ms / 1000);
    const noExp = await new SignJWT({ tenant: "tenant-a", studentId: "stu-1", threadId, sid: "11111111-1111-4111-8111-111111111111", minor: false, guardianConsent: false })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("vc-api")
      .setAudience(VOICE_WS_AUDIENCE)
      .setJti("jti-noexp-0000-4000-8000-000000000000")
      .setIssuedAt(iat)
      .sign(w.wsSecret);
    await assertRefused(w, noExp, threadId, 401);
    const noJti = await new SignJWT({ tenant: "tenant-a", studentId: "stu-1", threadId, sid: "11111111-1111-4111-8111-111111111111", minor: false, guardianConsent: false })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("vc-api")
      .setAudience(VOICE_WS_AUDIENCE)
      .setIssuedAt(iat)
      .setExpirationTime(iat + 60)
      .sign(w.wsSecret);
    await assertRefused(w, noJti, threadId, 401);
  });
});

test("C2: a token is single use: a replay is refused, and two concurrent upgrades with one token admit exactly one", async () => {
  await withWorld(async (w, threadId) => {
    const token = await w.mint(adult(), threadId);
    const first = await w.connect(token, { threadId });
    assert.equal(first.ok, true);
    const replay = await w.connect(token, { threadId });
    assert.equal(replay.ok, false);
    assert.equal((replay as { status: number }).status, 401);

    const t2 = await w.mint(adult(), threadId);
    const [a, b] = await Promise.all([w.connect(t2, { threadId }), w.connect(t2, { threadId })]);
    assert.equal([a, b].filter((r) => r.ok).length, 1, "exactly one concurrent upgrade wins");
    assert.equal([a, b].filter((r) => !r.ok).length, 1);
  });
});

test("C2: a token minted for one student or thread is refused on another student's or thread's path (same 401)", async () => {
  await withWorld(async (w, threadId) => {
    const otherThread = await newThread(w.chat, await studentToken(adult()));
    const t1 = await w.mint(adult(), threadId);
    await assertRefused(w, t1, threadId, 401, { threadId: otherThread });
    const t2 = await w.mint(adult(), threadId);
    await assertRefused(w, t2, threadId, 401, { threadId, studentId: "stu-2" });
    // And a token forged for a different tenant cannot be signed without the key: a wrong-tenant claim shape is refused too.
    await assertRefused(w, await w.signWsToken({ tenant: "bad tenant!", studentId: "stu-1", threadId }), threadId, 401);
  });
});

test("C2: the token is accepted from the Authorization header or the vc-token subprotocol, and the server selects vc-voice-v1", async () => {
  await withWorld(async (w, threadId) => {
    const viaHeader = await w.connect(await w.mint(adult(), threadId), { threadId, how: "header" });
    assert.ok(viaHeader.ok);
    if (viaHeader.ok) assert.equal(viaHeader.client.ws.protocol, "vc-voice-v1");
    const viaProto = await w.connect(await w.mint(adult(), threadId), { threadId, how: "protocol" });
    assert.ok(viaProto.ok);
    if (viaProto.ok) assert.equal(viaProto.client.ws.protocol, "vc-voice-v1");
  });
});

test("C2: another path or method is 404 and an Origin outside the allowed list is 403 (no token read)", async () => {
  await withWorld(
    async (w, threadId) => {
      const bad = await new Promise<number>((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${w.port}/v1/students/stu-1/chat/threads/${threadId}/voice/other`);
        ws.on("unexpected-response", (_r, res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        });
        ws.on("error", () => undefined);
      });
      assert.equal(bad, 404);
      const token = await w.mint(adult(), threadId);
      await assertRefused(w, token, threadId, 403, { threadId, origin: "https://evil.example" });
      // The refused attempt did not consume the token.
      assert.ok((await w.connect(token, { threadId, origin: "https://app.example" })).ok);
      assert.ok((await w.connect(await w.mint(adult(), threadId), { threadId })).ok, "no Origin (non-browser client) is allowed");
    },
    { deps: { allowedOrigins: ["https://app.example"] } },
  );
});

test("C2: no token and no raw frame text reaches the server log, on refusals or on a normal session", async () => {
  await withWorld(async (w, threadId) => {
    const t = await w.mint(adult(), threadId);
    await w.connect(t, { threadId, how: "query" });
    await w.connect("garbage-credential-xyz", { threadId });
    const { client } = await w.open(adult(), threadId);
    client.sendRaw("this is not json {");
    await until(() => client.of("error").length > 0, "bad_event");
    const logged = JSON.stringify(w.logs);
    assert.ok(!logged.includes(t));
    assert.ok(!logged.includes("garbage-credential-xyz"));
    assert.ok(!logged.includes("not json"));
  });
});

// ---------------------------------------------------------------------------
// C3: events
// ---------------------------------------------------------------------------

test("C3: audio in reaches the provider; model audio comes back as binary; transcripts are events with monotonic ids; state follows the finals", async () => {
  await withWorld(async (w, threadId) => {
    const { client, sid } = await w.open(adult(), threadId);
    client.sendAudio(640);
    await until(() => w.provider.last.audioIn.length === 1, "audio reaches the backend");
    assert.equal(w.provider.last.audioIn[0]!.byteLength, 640);

    w.provider.last.emitInputTranscript("I would like to study in Germany", false);
    w.provider.last.emitInputTranscript("", true);
    w.provider.last.emitOutputAudio(new Uint8Array(480).fill(3));
    w.provider.last.emitOutputTranscript("Germany has many options.");
    w.provider.last.emitTurnComplete();
    await until(() => client.of("state").length === 1, "state after the finals");

    assert.equal(client.frames.length, 1);
    assert.equal(client.frames[0]!.byteLength, 480);
    const finals = client.of("transcript.final");
    assert.deepEqual(finals.map((e) => e.role), ["user", "assistant"]);
    assert.equal(finals[0].turnId, finals[1].turnId, "one spoken exchange shares a turn id");
    assert.ok(client.events.some((e) => e.type === "transcript.partial"));
    const ids = client.events.map((e) => e.eventId as string);
    assert.deepEqual(ids, ids.map((_, i) => `${sid}.${i + 1}`), "ids are sid.1, sid.2, ... with no gaps");
    const idx = (t: string) => client.events.findIndex((e) => e.type === t);
    assert.ok(client.events.findLastIndex((e) => e.type === "transcript.final") < idx("state"), "the state follows the finals");
    assert.equal(client.of("state")[0].state, "ok");
  });
});

test("C3: odd-length audio is refused with bad_audio and the session continues", async () => {
  await withWorld(async (w, threadId) => {
    const { client } = await w.open(adult(), threadId);
    client.sendAudio(641);
    await until(() => client.of("error").length === 1, "bad_audio");
    assert.equal(client.of("error")[0].code, "bad_audio");
    client.sendAudio(640);
    await until(() => w.provider.last.audioIn.length === 1, "later audio still flows");
    assert.equal(client.closed, false);
  });
});

test("C3: interrupt reaches the provider, end closes the socket and the provider session", async () => {
  await withWorld(async (w, threadId) => {
    const { client } = await w.open(adult(), threadId);
    client.send({ type: "interrupt" });
    await until(() => w.provider.last.calls.some((c) => c.type === "interrupt"), "interrupt forwarded");
    client.send({ type: "end" });
    await until(() => client.closed, "socket closed");
    assert.equal(client.closeCode, 1000);
    await w.voice.settled();
    assert.ok(w.provider.last.calls.some((c) => c.type === "close"), "provider session closed");
    assert.equal(w.voice.stats().liveSessions, 0);
    assert.equal(w.voice.stats().activeSessions, 0);
  });
});

test("C3: control-message misuse: junk, extra fields, audio before start, a second start, a wrong thread, too many bad messages", async () => {
  await withWorld(async (w, threadId) => {
    const pre = await w.connect(await w.mint(adult(), threadId), { threadId });
    assert.ok(pre.ok);
    if (!pre.ok) return;
    pre.client.sendAudio(640);
    pre.client.sendAudio(640);
    await until(() => pre.client.of("error").length >= 1, "not_started");
    assert.equal(pre.client.of("error").length, 1, "audio before start is told once");
    assert.equal(pre.client.of("error")[0].code, "not_started");
    pre.client.send({ type: "interrupt" });
    pre.client.send({ type: "start", threadId, extra: true });
    pre.client.sendRaw("{");
    await until(() => pre.client.of("error").length >= 4, "not_started + bad_event x2");
    assert.deepEqual(pre.client.of("error").map((e) => e.code), ["not_started", "not_started", "bad_event", "bad_event"]);
    assert.equal(w.provider.backends.length, 0);

    pre.client.send({ type: "start", threadId });
    await until(() => w.provider.backends.length === 1, "start accepted");
    pre.client.send({ type: "start", threadId });
    await until(() => pre.client.of("error").some((e) => e.code === "already_started"), "already_started");
    assert.equal(w.provider.backends.length, 1);

    for (let i = 0; i < 12; i++) pre.client.sendRaw("junk");
    await until(() => pre.client.closed, "closed after repeated junk");
    assert.equal(pre.client.closeCode, 1008);
  });
});

test("C3: start with a thread other than the token's is refused (forbidden) and the socket closes", async () => {
  await withWorld(async (w, threadId) => {
    const other = await newThread(w.chat, await studentToken(adult()));
    const res = await w.connect(await w.mint(adult(), threadId), { threadId });
    assert.ok(res.ok);
    if (!res.ok) return;
    res.client.send({ type: "start", threadId: other });
    await until(() => res.client.closed, "closed");
    assert.equal(res.client.of("error")[0].code, "forbidden");
    assert.equal(w.provider.backends.length, 0);
  });
});

test("C3: a frame over the size limit closes the socket (1009) and nothing buffers without limit", async () => {
  await withWorld(async (w, threadId) => {
    const { client } = await w.open(adult(), threadId);
    client.ws.send(Buffer.alloc(200 * 1024, 1), { binary: true });
    await until(() => client.closed, "closed on an oversize frame");
    assert.equal(client.closeCode, 1009);
    await w.voice.settled();
    assert.equal(w.voice.stats().liveSessions, 0);
  });
});

test("C3: every eligible speech preference is read back; legacy first-proposal confirmation remains compatible", async () => {
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      speak(w, 0, "My GPA is 3.8 and I like Berlin");
      await until(() => client.of("confirm").length === 2, "numeric and nonnumeric confirm events");
      assert.deepEqual(client.of("confirm").map(p => [p.fact.key,p.fact.value]), [["gpa","3.8"],["city","Berlin"]]);
      assert.ok(client.of("confirm").every(p => p.fact.candidateId && p.fact.expectedVersion && p.threadId === threadId && p.promptId && p.question));
      const token = await studentToken(adult());
      const proposed = async () => (await call(w.chat, "GET", profilePath("stu-1"), { token })).json;
      let profile = await proposed();
      assert.equal(profile.facts.length, 0, "nothing is used before the student accepts");
      assert.deepEqual(profile.proposed.map((p: any) => `${p.key}:${p.status}`).sort(), ["city:proposed", "gpa:proposed"]);

      client.send({ type: "confirm", key: "never-asked", accepted: true });
      await until(() => client.of("error").some(e => e.code === "unknown_confirm"), "unknown confirmation refused");
      client.send({ type: "confirm", key: "gpa", accepted: true });
      await until(() => w.fakeDb.collection<any>("profile_facts").all().some((f) => f.key === "gpa" && f.status === "confirmed"), "gpa confirmed");
      profile = await proposed();
      assert.ok(profile.facts.some((f: any) => f.key === "gpa" && f.value === "3.8"));

      await until(() => client.closed, "confirmation requires fresh provider context");
    },
    {
      deps: {
        extractFacts: async () => [
          { key: "gpa", value: "3.8" },
          { key: "city", value: "Berlin" },
        ],
      },
    },
  );
});

test("C3: rejecting a read-back figure erases the proposed fact", async () => {
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      speak(w, 0, "My score is 310");
      await until(() => client.of("confirm").length === 1, "confirm event");
      client.send({ type: "confirm", key: "gre", accepted: false });
      await until(() => w.fakeDb.collection<any>("profile_facts").all().every((f) => f.key !== "gre" || f.status === "erased" || f.status === "rejected") , "decided");
      const token = await studentToken(adult());
      const profile = (await call(w.chat, "GET", profilePath("stu-1"), { token })).json;
      assert.equal(profile.facts.length, 0);
    },
    { deps: { extractFacts: async () => [{ key: "gre", value: "310" }] } },
  );
});

test("D-096 item 3 (same-as-chat): after a crisis the chat message and flag are forwarded, no audio is sent, model audio is dropped, and nothing is synthesised here", async () => {
  await withWorld(async (w, threadId) => {
    const { client } = await w.open(adult(), threadId);
    speak(w, 0, CRISIS_PHRASE);
    await until(() => client.of("flag").some((f) => f.reason === "crisis_detected"), "crisis flag");
    await until(() => client.of("transcript.final").some((e) => e.role === "assistant" && e.text === CRISIS_TEXT_FIXED), "the crisis message");
    assert.equal(client.frames.length, 0, "no pre-recorded crisis audio");
    assert.ok(client.of("state").some((s) => s.state === "escalated"));
    const framesBefore = client.frames.length;
    w.provider.last.emitOutputAudio(new Uint8Array(480).fill(9)); // the model tries to carry on: muted by LiveSession
    await w.voice.settled().catch(() => undefined);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(client.frames.length, framesBefore, "muted model audio is not forwarded");
    assert.ok(client.of("transcript.final").some((e) => e.role === "assistant" && e.text === CRISIS_TEXT_FIXED), "the fixed text is the transcript");
    // The crisis flag is stored as ids and time only.
    const flags = w.fakeDb.collection<any>("student_flags").all();
    assert.equal(flags.length, 1);
    assert.equal(flags[0].kind, "crisis");
    assert.ok(!JSON.stringify(flags).includes("kill"));
  });
});

// ---------------------------------------------------------------------------
// C4: resume, silence, 20-minute cap, text fallback
// ---------------------------------------------------------------------------

test("C4: resume with lastEventId replays the events the client missed, with their original ids, for the same student and thread only", async () => {
  await withWorld(async (w, threadId) => {
    const first = await w.open(adult(), threadId);
    speak(w, 0, "hello there");
    answer(w, 0, "Hi, how can I help.");
    await until(() => first.client.of("state").length === 1, "first session events");
    const seen = first.client.events.map((e) => e.eventId as string);
    assert.ok(seen.length >= 3);
    const lastSeen = seen[0]!; // the client only processed the first event before the link dropped
    first.client.abort();
    await until(() => w.voice.stats().sockets === 0, "first connection finalised");
    await w.voice.settled();

    const second = await w.open(adult(), threadId, { lastEventId: lastSeen });
    await until(() => second.client.events.length >= seen.length - 1, "replayed events");
    const replayed = second.client.events.slice(0, seen.length - 1);
    assert.deepEqual(replayed.map((e) => e.eventId), seen.slice(1), "the missed events come back with their original ids");
    assert.ok(second.sid !== first.sid);
    // The new connection's own events do not collide with the replayed ones.
    speak(w, 1, "one more thing");
    await until(() => second.client.of("transcript.final").length > replayed.filter((e) => e.type === "transcript.final").length, "new final");
    const all = second.client.events.map((e) => e.eventId);
    assert.equal(new Set(all).size, all.length);
  });
});

test("C4: resume of an expired, unknown or someone else's session id replays nothing", async () => {
  await withWorld(async (w, threadId) => {
    const first = await w.open(adult(), threadId);
    speak(w, 0, "private words");
    await until(() => first.client.of("transcript.final").length === 1, "final");
    const lastId = `${first.sid}.0`;
    first.client.abort();
    await w.voice.settled();

    // Another student (same tenant), with their own thread, asks to resume the first student's session.
    const t2 = await newThread(w.chat, await studentToken(adult("stu-2")), "stu-2");
    const thief = await w.open(adult("stu-2"), t2, { lastEventId: lastId });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(thief.client.of("transcript.final").length, 0, "another student gets no replay");
    assert.ok(!JSON.stringify(thief.client.events).includes("private words"));
    thief.client.abort();
    await w.voice.settled();

    // Unknown session id and an expired window.
    const unknown = await w.open(adult(), threadId, { lastEventId: "00000000-0000-4000-8000-000000000000.0" });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(unknown.client.events.length, 0);
    unknown.client.abort();
    await w.voice.settled();
    w.clock.ms += 6 * 60_000;
    const late = await w.open(adult(), threadId, { lastEventId: lastId });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(late.client.of("transcript.final").length, 0, "outside the resume window nothing is replayed");
  });
});

test("C4: 60 s of silence ends the session with a fixed message; speech and model output restart the clock; the timeout is configurable", async () => {
  await withWorld(async (w, threadId) => {
    const { client } = await w.open(adult(), threadId);
    w.timers.advance(50_000);
    speak(w, 0, "still here");
    await until(() => client.of("transcript.final").length === 1, "speech");
    w.timers.advance(50_000);
    await new Promise((r) => setTimeout(r, 30)); // closing is asynchronous: give a wrongly armed timer time to close the socket
    assert.equal(client.closed, false, "speech restarted the silence clock");
    w.provider.last.emitOutputTranscript("ok");
    await until(() => client.of("transcript.partial").length === 1, "model output");
    w.timers.advance(59_000);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(client.closed, false, "model output restarted the silence clock");
    w.timers.advance(2_000);
    await until(() => client.closed, "closed after silence");
    assert.equal(client.closeCode, 1000);
    const err = client.of("error").find((e) => e.code === "silence_timeout");
    assert.ok(err, "a silence_timeout error event");
    assert.ok(/text/i.test(err.message), "tells the student text still works");
    await w.voice.settled();
    assert.equal(w.voice.stats().timers, 0);
    assert.equal(w.timers.pending, 0);
  });
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      w.timers.advance(4_000);
      await new Promise((r) => setTimeout(r, 30));
      assert.equal(client.closed, false);
      w.timers.advance(1_500);
      await until(() => client.closed, "closed at the configured 5 s");
    },
    { deps: { silenceTimeoutMsForTenant: (t) => (t === "tenant-a" ? 5_000 : undefined) } },
  );
});

test("C4/D-088: a session ends at the 20-minute cap with a fixed message, and exactly 20 minutes are recorded", async () => {
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      w.timers.advance(19 * 60_000 + 59_000);
      assert.equal(client.closed, false);
      w.timers.advance(1_000);
      await until(() => client.closed, "closed at the cap");
      assert.equal(client.closeCode, 1000);
      assert.ok(client.of("error").some((e) => e.code === "session_time_limit"));
      await w.voice.settled();
      const usage = await getStudentUsage(w.deps.dbForTenant("tenant-a"), { studentId: "stu-1", month: usageMonth(new Date(w.clock.ms)) });
      assert.equal(usage.voiceMs, 20 * 60_000);
    },
    { deps: { silenceTimeoutMs: 10 * 3600_000 } },
  );
});

test("C4: text fallback: after a voice failure, a cap or a silence end, text chat continues in the same thread", async () => {
  const failing: LiveProvider = {
    kind: "mock",
    connect: async () => {
      throw new Error("provider exploded with api key sk-secret-123");
    },
  } as unknown as LiveProvider;
  await withWorld(
    async (w, threadId) => {
      const token = await w.mint(adult(), threadId);
      const res = await w.connect(token, { threadId });
      assert.ok(res.ok);
      if (!res.ok) return;
      res.client.send({ type: "start", threadId });
      await until(() => res.client.closed, "closed after the provider failure");
      const err = res.client.of("error")[0];
      assert.equal(err.code, "live_unavailable");
      assert.ok(/text/i.test(err.message));
      assert.ok(!JSON.stringify(res.client.events).includes("sk-secret-123"), "a provider message never reaches the client");
      assert.ok(!JSON.stringify(w.logs).includes("sk-secret-123"), "nor the log");
      // Text continues in the same thread.
      const student = await studentToken(adult());
      const turn = await call(w.chat, "POST", turnsPath("stu-1", threadId), { token: student, body: { text: GERMANY_QUESTION, clientTurnId: "after-voice-1" } });
      assert.equal(turn.status, 200);
      const thread = await call(w.chat, "GET", `/v1/students/stu-1/chat/threads/${threadId}`, { token: student });
      assert.equal(thread.status, 200);
      assert.equal(thread.json.turns.length, 2);
    },
    { live: failing },
  );
});

// ---------------------------------------------------------------------------
// C8: A12 error event, A20 refusal, default off
// ---------------------------------------------------------------------------

test("C8/A12: LiveConfigError is its own fixed error event (live_config), the socket closes, and no provider detail leaks", async () => {
  const cfg: LiveProvider = {
    kind: "mock",
    connect: async () => {
      throw new LiveConfigError("GEMINI_API_KEY=AIza-secret is not set");
    },
  } as unknown as LiveProvider;
  await withWorld(
    async (w, threadId) => {
      const res = await w.connect(await w.mint(adult(), threadId), { threadId });
      assert.ok(res.ok);
      if (!res.ok) return;
      res.client.send({ type: "start", threadId });
      await until(() => res.client.closed, "closed");
      assert.equal(res.client.of("error")[0].code, "live_config");
      assert.equal(res.client.closeCode, 1011);
      assert.ok(!JSON.stringify(res.client.events).includes("AIza"));
      assert.ok(!JSON.stringify(w.logs).includes("AIza"));
      await w.voice.settled();
      assert.equal(w.voice.stats().activeSessions, 0, "the failed start released its slot");
      // The thread is untouched and still readable.
      const thread = await call(w.chat, "GET", `/v1/students/stu-1/chat/threads/${threadId}`, { token: await studentToken(adult()) });
      assert.equal(thread.status, 200);
    },
    { live: cfg },
  );
});

test("C8/A12: a provider error mid-session is an error event and the session continues; a backend close ends the session with live_closed", async () => {
  await withWorld(async (w, threadId) => {
    const { client } = await w.open(adult(), threadId);
    w.provider.last.emitError("socket reset by peer 10.0.0.7");
    await until(() => client.of("error").length === 1, "live_error");
    assert.equal(client.of("error")[0].code, "live_error");
    assert.ok(!client.of("error")[0].message.includes("10.0.0.7"));
    assert.equal(client.closed, false);
    w.provider.last.emitClosed("gone");
    await until(() => client.closed, "closed");
    assert.ok(client.of("error").some((e) => e.code === "live_closed"));
    await w.voice.settled();
    assert.equal(w.voice.stats().liveSessions, 0);
  });
});

test("C9: a socket that closes while the provider connect is still in flight leaves no provider session behind", async () => {
  const inner = new MockLiveProvider();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let entered = false;
  const gated = {
    kind: "mock",
    connect: async (cfg: Parameters<MockLiveProvider["connect"]>[0]) => {
      entered = true;
      await gate;
      return inner.connect(cfg);
    },
  } as unknown as LiveProvider;
  await withWorld(
    async (w, threadId) => {
      const res = await w.connect(await w.mint(adult(), threadId), { threadId });
      assert.ok(res.ok);
      if (!res.ok) return;
      res.client.send({ type: "start", threadId });
      await until(() => entered, "provider connect in flight");
      res.client.abort();
      await until(() => w.voice.stats().sockets === 0, "socket gone");
      release();
      await until(() => inner.backends.length === 1, "the late provider session was created");
      await until(() => inner.last.calls.some((c) => c.type === "close"), "the late provider session was closed");
      await w.voice.settled();
      assert.equal(w.voice.stats().liveSessions, 0);
      assert.equal(w.voice.stats().activeSessions, 0);
    },
    { live: gated },
  );
});

test("C8/A20: default off: no flag builds nothing, no route is mounted, and the upgrade path does not exist", async () => {
  assert.equal(voiceEnabledFromEnv({}), false);
  assert.equal(voiceEnabledFromEnv({ [VOICE_FLAG_ENV]: "" }), false);
  assert.equal(voiceEnabledFromEnv({ [VOICE_FLAG_ENV]: "false" }), false);
  assert.equal(voiceEnabledFromEnv({ [VOICE_FLAG_ENV]: "true" }), true);
  for (const bad of ["TRUE", "1", "yes", "on", "enabled"]) assert.throws(() => voiceEnabledFromEnv({ [VOICE_FLAG_ENV]: bad }), VoiceConfigError, bad);

  const w = await voiceWorld();
  try {
    const gates = gatesFixture();
    try {
      assert.equal(createVoiceApi(w.deps, { enabled: false, gatesDir: gates.gates, now: NOW, approver: APPROVER, env: {} }), undefined);
    } finally {
      cleanupGates(gates);
    }
    // withVoiceRoutes(main, undefined) returns main itself: the voice path is whatever main says (404 here).
    const main = async () => ({ status: 404, headers: {}, body: "{}" });
    assert.equal(withVoiceRoutes(main, undefined), main);
  } finally {
    await w.cleanup();
  }
  // A server built without onUpgrade never upgrades: a WebSocket attempt fails, nothing is accepted.
  const bare = createApiServer(async () => ({ status: 404, headers: {}, body: "{}" }));
  await new Promise<void>((r) => bare.listen(0, "127.0.0.1", r));
  try {
    const port = (bare.address() as import("node:net").AddressInfo).port;
    const outcome = await new Promise<string>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/v1/students/stu-1/chat/threads/th-1/voice/stream`);
      ws.on("open", () => resolve("open"));
      ws.on("unexpected-response", (_q, res) => {
        res.resume();
        resolve(`http-${res.statusCode}`);
      });
      ws.on("error", () => resolve("error"));
    });
    assert.notEqual(outcome, "open");
  } finally {
    await new Promise<void>((r) => bare.close(() => r()));
  }
});

test("C8/A20: enabled without the go-live records (or the passing A10 record) is refused, and tracing on is refused", () => {
  const w0 = { deps: undefined as never };
  void w0;
  const deps = {
    verifier: undefined as never,
    dbForTenant: undefined as never,
    live: new MockLiveProvider(),
    wsSecret: new Uint8Array(32).fill(1),
    wsBaseUrl: "wss://api.example.test",
    crisis: {},
  };
  const good = (over: Parameters<typeof gatesFixture>[0] = {}) => gatesFixture({ gProd: "Answered: 2026-10-16T10:10:00+05:30 - c - all\n", ...over });
  const cases: Array<[string, Parameters<typeof gatesFixture>[0]]> = [
    ["no A10 record", { a10: null }],
    ["A10 not PASS", { a10: "Result: FAIL\nRun-at: 2026-10-16T11:00:00+05:30\nEvidence: qa/evidence/a10-voice-20261016/report.md\n" }],
    ["g-prod option b only (no voice)", { gProd: "Answered: 2026-10-16T10:10:00+05:30 - b - text plus anonymous\n" }],
    ["no B13", { b13: null }],
    ["no Nights", { nights: null }],
  ];
  for (const [name, over] of cases) {
    const g = good(over);
    try {
      assert.throws(() => createVoiceApi(deps, { enabled: true, gatesDir: g.gates, now: NOW, approver: APPROVER, env: {} }), GoLiveRefusedError, name);
    } finally {
      cleanupGates(g);
    }
  }
  const g = good();
  try {
    assert.doesNotThrow(() => createVoiceApi(deps, { enabled: true, gatesDir: g.gates, now: NOW, approver: APPROVER, env: {} })?.close());
    for (const v of ["LANGSMITH_TRACING", "LANGCHAIN_TRACING_V2"]) {
      assert.throws(() => createVoiceApi(deps, { enabled: true, gatesDir: g.gates, now: NOW, approver: APPROVER, env: { [v]: "true" } }), VoiceConfigError, v);
    }
    assert.throws(() => createVoiceApi({ ...deps, wsSecret: new Uint8Array(8) }, { enabled: true, gatesDir: g.gates, now: NOW, approver: APPROVER, env: {} }), VoiceConfigError);
    assert.throws(() => createVoiceApi({ ...deps, wsBaseUrl: "http://nope" }, { enabled: true, gatesDir: g.gates, now: NOW, approver: APPROVER, env: {} }), VoiceConfigError);
  } finally {
    cleanupGates(g);
  }
});

// ---------------------------------------------------------------------------
// C9: tenancy and cleanup
// ---------------------------------------------------------------------------

test("C9: tenants are isolated: a tenant-b token for tenant-a's thread finds nothing, resume across tenants replays nothing, and usage is per tenant", async () => {
  await withWorld(async (w, threadId) => {
    const a = await w.open(adult(), threadId);
    speak(w, 0, "tenant a words");
    await until(() => a.client.of("transcript.final").length === 1, "final");
    w.clock.ms += 7_000;
    a.client.abort();
    await w.voice.settled();

    // Same student id and the SAME thread id, but in tenant-b: there is no such thread there.
    const forged = await w.signWsToken({ tenant: "tenant-b", studentId: "stu-1", threadId, sid: "22222222-2222-4222-8222-222222222222" });
    const res = await w.connect(forged, { threadId });
    assert.ok(res.ok, "a correctly signed token passes the upgrade (the key is the credential)");
    if (!res.ok) return;
    res.client.send({ type: "start", threadId, lastEventId: `${a.sid}.0` });
    await until(() => res.client.closed, "closed");
    assert.equal(res.client.of("error")[0].code, "not_found");
    assert.ok(!JSON.stringify(res.client.events).includes("tenant a words"));
    assert.equal(w.provider.backends.length, 1, "no provider session for the wrong tenant");

    // A tenant-b student with the same id and their own thread resumes tenant-a's session id: nothing is replayed.
    const bToken = await studentToken(adult("stu-1", "tenant-b"));
    const bThread = await newThread(w.chat, bToken);
    const b = await w.open(adult("stu-1", "tenant-b"), bThread, { lastEventId: `${a.sid}.0` });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(b.client.of("transcript.final").length, 0);
    b.client.abort();
    await w.voice.settled();

    // Even if tenant-b held a thread with the SAME id (ids are only unique per tenant), tenant-a's session log is not theirs.
    await createChatThread(w.deps.dbForTenant("tenant-b"), { studentId: "stu-1", textStored: true, threadId });
    const sameId = await w.open(adult("stu-1", "tenant-b"), threadId, { lastEventId: `${a.sid}.0` });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(sameId.client.of("transcript.final").length, 0, "a colliding thread id in another tenant replays nothing");
    sameId.client.abort();
    await w.voice.settled();

    // Usage and history are per tenant.
    const month = usageMonth(new Date(w.clock.ms));
    const dbA = w.deps.dbForTenant("tenant-a");
    const dbB = w.deps.dbForTenant("tenant-b");
    assert.equal((await getStudentUsage(dbA, { studentId: "stu-1", month })).voiceMs, 7_000);
    assert.equal((await getStudentUsage(dbB, { studentId: "stu-1", month })).voiceMs, 0);
    assert.equal((await listChatTurns(dbA, { studentId: "stu-1", threadId })).filter((r) => r.channel === "voice").length, 1);
    assert.equal((await listChatTurns(dbB, { studentId: "stu-1", threadId })).length, 0);
  });
});

test("C9: a student has one voice session: a second start replaces the first, which is told it was superseded", async () => {
  await withWorld(async (w, threadId) => {
    const first = await w.open(adult(), threadId);
    const second = await w.open(adult(), threadId);
    await until(() => first.client.closed, "first closed");
    assert.equal(first.client.closeCode, 4000);
    assert.ok(first.client.of("error").some((e) => e.code === "superseded"));
    assert.equal(second.client.closed, false);
    await w.voice.settled();
    assert.equal(w.voice.stats().activeSessions, 1);
    assert.equal(w.voice.stats().liveSessions, 1);
    assert.ok(w.provider.backends[0]!.calls.some((c) => c.type === "close"));
  });
});

test("C9: the socket cap refuses more connections with 503 without opening anything", async () => {
  await withWorld(
    async (w, threadId) => {
      const t = await studentToken(adult());
      void t;
      assert.ok((await w.connect(await w.mint(adult(), threadId), { threadId })).ok);
      assert.ok((await w.connect(await w.mint(adult(), threadId), { threadId })).ok);
      const third = await w.connect(await w.mint(adult(), threadId), { threadId });
      assert.equal(third.ok, false);
      assert.equal((third as { status: number }).status, 503);
      assert.equal(w.voice.stats().sockets, 2, "the refused connection opened nothing");
      assert.equal(w.provider.backends.length, 0);
    },
    { deps: { maxSockets: 2 } },
  );
});

test("C9: 50 connect/abort cycles (before start, mid-session, after speech, at the cap) leak no socket, timer, provider session, slot or retained state beyond the resume log", async () => {
  await withWorld(async (w) => {
    const N = 50;
    let backends = 0;
    for (let i = 0; i < N; i++) {
      const sid = `cyc-${i}`;
      const claims = adult(sid);
      const tok = await studentToken(claims);
      const thread = await newThread(w.chat, tok, sid);
      const mode = i % 5;
      if (mode === 0) {
        // connect and abort before start
        const res = await w.connect(await w.mint(claims, thread, sid), { threadId: thread, studentId: sid });
        assert.ok(res.ok);
        if (res.ok) res.client.abort();
      } else if (mode === 1) {
        // abort straight after sending start (racing the start checks)
        const res = await w.connect(await w.mint(claims, thread, sid), { threadId: thread, studentId: sid });
        assert.ok(res.ok);
        if (res.ok) {
          res.client.send({ type: "start", threadId: thread });
          res.client.abort();
        }
      } else if (mode === 2) {
        const o = await w.open(claims, thread, { studentId: sid });
        o.client.abort();
      } else if (mode === 3) {
        const o = await w.open(claims, thread, { studentId: sid });
        speak(w, w.provider.backends.length - 1, "some words");
        await until(() => o.client.of("transcript.final").length === 1, "final");
        o.client.abort();
      } else {
        const o = await w.open(claims, thread, { studentId: sid });
        o.client.send({ type: "end" });
        await until(() => o.client.closed, "closed by end");
      }
      backends = w.provider.backends.length;
      await w.voice.settled();
    }
    // Let every connection that is still finalising settle.
    await until(() => w.voice.stats().sockets === 0, "all sockets gone");
    await w.voice.settled();
    const s = w.voice.stats();
    assert.equal(s.sockets, 0);
    assert.equal(s.activeSessions, 0);
    assert.equal(s.liveSessions, 0);
    assert.equal(s.timers, 0);
    assert.equal(w.timers.pending, 0);
    assert.ok(s.retainedLogs <= N);
    assert.equal(backends > 0, true);
    for (const b of w.provider.backends) assert.ok(b.calls.some((c) => c.type === "close"), "every provider session was closed");
    // The used-token memory is bounded and drains once the tokens' lifetime has passed.
    assert.ok(s.usedTokens <= N * 2);
    w.clock.ms += 120_000;
    const probe = await w.open(adult("probe-1"), await newThread(w.chat, await studentToken(adult("probe-1")), "probe-1"), { studentId: "probe-1" });
    probe.client.abort();
    await w.voice.settled();
    assert.ok(w.voice.stats().usedTokens <= 2, "expired token ids were dropped");
    assert.ok(w.logs.length === 0 || w.logs.every((l) => l.level === "error"));
  });
});

test("C9: closing the API closes every open connection and its provider session (shutdown does not strand a session)", async () => {
  const w = await voiceWorld();
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    const a = await w.open(adult(), threadId);
    await w.voice.close();
    await until(() => a.client.closed, "closed on shutdown");
    assert.equal(a.client.closeCode, 1001);
    assert.equal(w.voice.stats().sockets, 0);
    assert.equal(w.voice.stats().liveSessions, 0);
    const late = await w.mint(adult(), threadId).catch(() => "none");
    void late;
  } finally {
    await w.cleanup();
  }
});

// ---------------------------------------------------------------------------
// U10 repair 1 (senior review Block on 7227385): C10 one live session per student under concurrency, C12 crisis durability and
// escalation parity, C13 resume-log expiry. The per-student limits (C11) are in voice-limits.test.ts.
// ---------------------------------------------------------------------------

test("C10: B and C start together while A is active and A's drain is slow -> exactly one live provider session at the end, and the loser is told superseded", async () => {
  let release!: () => void;
  const gated = new Promise<void>((r) => (release = r));
  const w = await voiceWorld();
  const origDrain = LiveSession.prototype.drain;
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    const first = await w.open(adult(), threadId);
    let firstCall = true;
    LiveSession.prototype.drain = async function (this: LiveSession) {
      if (firstCall) {
        firstCall = false;
        await gated; // A's finalize stays in flight while B and C both reach the supersede step
      }
      return origDrain.call(this);
    };
    const rB = await w.connect(await w.mint(adult(), threadId), { threadId });
    const rC = await w.connect(await w.mint(adult(), threadId), { threadId });
    assert.ok(rB.ok && rC.ok);
    if (!rB.ok || !rC.ok) return;
    rB.client.send({ type: "start", threadId });
    rC.client.send({ type: "start", threadId });
    await until(() => first.client.of("error").some((e) => e.code === "superseded"), "A superseded");
    await new Promise((r) => setTimeout(r, 100));
    release();
    await until(() => first.client.closed, "A closed");
    await until(() => [rB.client, rC.client].some((c) => c.closed), "one of B and C was closed");
    await new Promise((r) => setTimeout(r, 100));
    await w.voice.settled();
    const open = [rB.client, rC.client].filter((c) => !c.closed);
    const lost = [rB.client, rC.client].filter((c) => c.closed);
    assert.equal(open.length, 1, "exactly one of the two concurrent starts survives");
    assert.ok(lost[0]!.of("error").some((e) => e.code === "superseded"), "the loser was told it was superseded");
    const s = w.voice.stats();
    assert.equal(s.liveSessions, 1, "exactly one live provider session for the student");
    assert.equal(s.activeSessions, 1);
    assert.equal(s.sockets, 1);
    const openBackends = w.provider.backends.filter((b) => !b.calls.some((c) => c.type === "close"));
    assert.equal(openBackends.length, 1, "exactly one provider backend is still open");
    assert.equal(w.provider.backends.length, 2, "A and the winner only: the older waiter stepped aside and never opened a paid provider session");
  } finally {
    LiveSession.prototype.drain = origDrain;
    release();
    await w.cleanup();
  }
});

test("C10: a connection closed while it waits to supersede the old session never takes the student's slot (activeSessions returns to 0)", async () => {
  let release!: () => void;
  const gated = new Promise<void>((r) => (release = r));
  const w = await voiceWorld();
  const origDrain = LiveSession.prototype.drain;
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    const first = await w.open(adult(), threadId);
    let firstCall = true;
    LiveSession.prototype.drain = async function (this: LiveSession) {
      if (firstCall) {
        firstCall = false;
        await gated;
      }
      return origDrain.call(this);
    };
    const res = await w.connect(await w.mint(adult(), threadId), { threadId });
    assert.ok(res.ok);
    if (!res.ok) return;
    res.client.send({ type: "start", threadId });
    await until(() => first.client.of("error").some((e) => e.code === "superseded"), "A told superseded");
    res.client.abort();
    await until(() => w.voice.stats().sockets === 1, "B finalized (only A left)");
    release();
    await until(() => w.voice.stats().sockets === 0, "A finalized");
    await w.voice.settled();
    await new Promise((r) => setTimeout(r, 100));
    const s = w.voice.stats();
    assert.equal(s.activeSessions, 0, "a closed connection must not stay in the per-student map");
    assert.equal(s.liveSessions, 0);
    assert.equal(w.provider.backends.length, 1, "the closed connection never opened a provider session");
  } finally {
    LiveSession.prototype.drain = origDrain;
    release();
    await w.cleanup();
  }
});

/** A Live provider whose first `hangFirst` connects never resolve; later connects (after `gate`, if any) are served by the mock. */
function hangingLive(hangFirst: number, gate?: Promise<void>): { live: LiveProvider; mock: MockLiveProvider; calls: () => number } {
  const mock = new MockLiveProvider();
  let n = 0;
  return {
    mock,
    calls: () => n,
    live: {
      connect: async (config) => {
        n++;
        if (n <= hangFirst) return new Promise<never>(() => undefined);
        if (gate) await gate;
        return mock.connect(config);
      },
    },
  };
}

test("C10: a start whose provider connect never returns is closed by the start timer, and the socket slot and the student's lock are freed", async () => {
  const h = hangingLive(1);
  const w = await voiceWorld({ live: h.live });
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    const res = await w.connect(await w.mint(adult(), threadId), { threadId });
    assert.ok(res.ok);
    if (!res.ok) return;
    res.client.send({ type: "start", threadId });
    await until(() => h.calls() === 1, "the provider connect was called and is hanging");
    assert.equal(w.voice.stats().activeSessions, 1, "the starting connection holds the student's slot");
    w.timers.advance(VOICE_START_TIMEOUT_MS);
    await until(() => res.client.closed, "closed by the start timer while starting");
    await w.voice.settled();
    const s = w.voice.stats();
    assert.equal(s.sockets, 0);
    assert.equal(s.activeSessions, 0, "the student's lock was freed");
    assert.equal(s.timers, 0);
    // The student can start again.
    const again = await w.connect(await w.mint(adult(), threadId), { threadId });
    assert.ok(again.ok);
    if (!again.ok) return;
    again.client.send({ type: "start", threadId });
    await until(() => h.mock.backends.length === 1, "the second start reached the provider");
  } finally {
    await w.cleanup();
  }
});

test("C10: a start that arrived late gets its own budget: a slow but finishing connect is not cut short by the connection's first timer", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const h = hangingLive(0, gate);
  const w = await voiceWorld({ live: h.live });
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    const res = await w.connect(await w.mint(adult(), threadId), { threadId });
    assert.ok(res.ok);
    if (!res.ok) return;
    w.timers.advance(VOICE_START_TIMEOUT_MS - 1_000); // the client sends `start` 14 s after it connected
    res.client.send({ type: "start", threadId });
    await until(() => h.calls() === 1, "connect called");
    w.timers.advance(VOICE_START_TIMEOUT_MS - 1_000); // 28 s after connect, but only 14 s into the start
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(res.client.closed, false, "a start inside its own budget is not killed by the connection's first timer");
    release();
    await until(() => w.voice.stats().liveSessions === 1, "the session went live");
    assert.equal(res.client.closed, false);
  } finally {
    release();
    await w.cleanup();
  }
});

test("C10: the start timer still closes a socket that never sent start", async () => {
  const w = await voiceWorld();
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    const res = await w.connect(await w.mint(adult(), threadId), { threadId });
    assert.ok(res.ok);
    if (!res.ok) return;
    w.timers.advance(VOICE_START_TIMEOUT_MS);
    await until(() => res.client.closed, "closed: never started");
    assert.equal(res.client.closeCode, 1008);
  } finally {
    await w.cleanup();
  }
});

// -- C12: crisis flag durability and escalation parity ------------------------

const failingFlagWrites = (w: VoiceWorld, failures: number): { attempts: () => number } => {
  const flags = w.fakeDb.collection<any>("student_flags");
  const real = flags.updateOne.bind(flags);
  let n = 0;
  flags.updateOne = (async (...args: Parameters<typeof real>) => {
    n++;
    if (n <= failures) throw new Error("flag store down secret-detail-xyz");
    return real(...args);
  }) as typeof flags.updateOne;
  return { attempts: () => n };
};

test("C12: a crisis flag write that fails once is retried once and stored; nothing is logged and the session continues", async () => {
  await withWorld(async (w, threadId) => {
    const { client } = await w.open(adult(), threadId);
    const probe = failingFlagWrites(w, 1);
    speak(w, 0, CRISIS_PHRASE);
    await until(() => w.fakeDb.collection<any>("student_flags").all().length === 1, "the flag was stored by the retry");
    assert.equal(probe.attempts(), 2);
    assert.equal(w.fakeDb.collection<any>("student_flags").all()[0].kind, "crisis");
    assert.ok(!w.logs.some((l) => l.event === "voice_crisis_flag_failed"));
    assert.equal(client.closed, false);
  });
});

test("C12: a crisis flag write that keeps failing is tried twice, logged as voice_crisis_flag_failed (text-free) and never ends the session", async () => {
  await withWorld(async (w, threadId) => {
    const { client } = await w.open(adult(), threadId);
    const probe = failingFlagWrites(w, 100);
    speak(w, 0, CRISIS_PHRASE);
    await until(() => w.logs.some((l) => l.event === "voice_crisis_flag_failed"), "the failure is logged");
    assert.equal(probe.attempts(), 2, "one retry, no more");
    const line = w.logs.find((l) => l.event === "voice_crisis_flag_failed")!;
    assert.equal(line.level, "error");
    assert.ok(!JSON.stringify(w.logs).includes("secret-detail-xyz"));
    assert.ok(!JSON.stringify(w.logs).includes("kill"));
    assert.equal(client.closed, false);
    assert.ok(client.of("flag").some((f) => f.reason === "crisis_detected"), "the student still got the crisis reply");
  });
});

test("C12: a crisis is escalated through the optional escalateForTenant port with the REDACTED words, like the text path", async () => {
  const escalations: any[] = [];
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      speak(w, 0, `${CRISIS_PHRASE}, mail me at pri.ya@example.com`);
      await until(() => escalations.length === 1, "escalated");
      await w.voice.settled().catch(() => undefined);
      const e = escalations[0];
      assert.equal(e.sessionId, threadId);
      assert.equal(e.studentId, "stu-1");
      assert.equal(e.turns.length, 1);
      assert.equal(e.turns[0].speaker, "student");
      assert.match(e.turns[0].text, /kill myself/);
      assert.ok(!e.turns[0].text.includes("pri.ya@example.com"), "the email is redacted before it reaches the port");
      assert.equal(e.turns[0].translatedText, e.turns[0].text);
      assert.equal(w.fakeDb.collection<any>("student_flags").all().length, 1, "the flag is still written");
      assert.equal(client.closed, false);
    },
    { deps: { escalateForTenant: () => async (input) => void escalations.push(input) } },
  );
});

test("C12: no escalation port -> behaviour is exactly as before (the flag only)", async () => {
  await withWorld(async (w, threadId) => {
    await w.open(adult(), threadId);
    speak(w, 0, CRISIS_PHRASE);
    await until(() => w.fakeDb.collection<any>("student_flags").all().length === 1, "flag stored");
    await w.voice.settled().catch(() => undefined);
    assert.deepEqual(w.logs, []);
  });
});

test("C12: an under-18 student without guardian consent is flagged (ids and time) but never escalated: no text is kept for them", async () => {
  const escalations: unknown[] = [];
  await withWorld(
    async (w, threadId) => {
      await w.open(minorNoConsent(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => w.fakeDb.collection<any>("student_flags").all().length === 1, "flag stored");
      await w.voice.settled().catch(() => undefined);
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(escalations.length, 0);
    },
    { deps: { escalateForTenant: () => async (input) => void escalations.push(input) } },
  );
});

test("C12: a minor WITH guardian consent is escalated, like the text path", async () => {
  const escalations: any[] = [];
  await withWorld(
    async (w, threadId) => {
      await w.open(minorConsent(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => escalations.length === 1, "escalated");
    },
    { deps: { escalateForTenant: () => async (input) => void escalations.push(input) } },
  );
});

test("C12: an escalation that keeps failing is tried twice and logged as voice_crisis_escalate_failed (text-free); the flag does not depend on it", async () => {
  let calls = 0;
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => w.logs.some((l) => l.event === "voice_crisis_escalate_failed"), "failure logged");
      assert.equal(calls, 2, "one retry, no more");
      assert.equal(w.fakeDb.collection<any>("student_flags").all().length, 1);
      assert.ok(!JSON.stringify(w.logs).includes("secret-detail-xyz"));
      assert.equal(client.closed, false);
    },
    {
      deps: {
        escalateForTenant: () => async () => {
          calls++;
          throw new Error("escalation down secret-detail-xyz");
        },
      },
    },
  );
});

test("C12: an escalation that fails once is retried once and delivered, with nothing logged", async () => {
  let attempts = 0;
  const seen: unknown[] = [];
  await withWorld(
    async (w, threadId) => {
      await w.open(adult(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => seen.length === 1, "the retry delivered");
      assert.equal(attempts, 2);
      assert.ok(!w.logs.some((l) => l.event === "voice_crisis_escalate_failed"));
    },
    {
      deps: {
        escalateForTenant: () => async (input) => {
          attempts++;
          if (attempts === 1) throw new Error("blip");
          seen.push(input);
        },
      },
    },
  );
});

// -- C13: the resume log expires ----------------------------------------------

test("C13: an expired resume log is dropped when a reconnect asks for it (read), and replays nothing", async () => {
  await withWorld(async (w, threadId) => {
    const a = await w.open(adult(), threadId);
    speak(w, 0, "words the retained log will hold");
    await until(() => a.client.of("transcript.final").length === 1, "event");
    const lastId = a.client.events[a.client.events.length - 1].eventId as string;
    a.client.send({ type: "end" });
    await until(() => a.client.closed, "closed");
    await w.voice.settled();
    assert.equal(w.voice.stats().retainedLogs, 1);
    w.clock.ms += VOICE_RESUME_WINDOW_MS + 1_000;
    const b = await w.open(adult(), threadId, { lastEventId: lastId });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(b.client.of("transcript.final").length, 0, "nothing replays after the window");
    assert.equal(w.voice.stats().retainedLogs, 0, "the read dropped the expired log");
  });
});

test("C13: the prune timer drops an expired resume log although nobody reads it, and is not counted in the per-connection timers", async () => {
  await withWorld(async (w, threadId) => {
    const a = await w.open(adult(), threadId);
    speak(w, 0, "words the retained log will hold");
    await until(() => a.client.of("transcript.final").length === 1, "event");
    a.client.send({ type: "end" });
    await until(() => a.client.closed, "closed");
    await w.voice.settled();
    assert.equal(w.voice.stats().retainedLogs, 1);
    assert.equal(w.voice.stats().timers, 0);
    assert.equal(w.pruneTimers.pending, 1, "one prune timer is armed while a log is retained");
    w.pruneTimers.advance(VOICE_RESUME_WINDOW_MS + 2_000);
    assert.equal(w.voice.stats().retainedLogs, 0);
    assert.equal(w.pruneTimers.pending, 0, "no timer is left once nothing is retained");
  });
});

void minor;

test("C13: shutdown drops every retained resume log (no transcript events are kept after close)", async () => {
  const w = await voiceWorld();
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    const a = await w.open(adult(), threadId);
    speak(w, 0, "words the retained log will hold");
    await until(() => a.client.of("transcript.final").length === 1, "event");
    a.client.send({ type: "end" });
    await until(() => a.client.closed, "closed");
    await w.voice.settled();
    assert.equal(w.voice.stats().retainedLogs, 1);
    await w.voice.close();
    assert.equal(w.voice.stats().retainedLogs, 0);
    assert.equal(w.pruneTimers.pending, 0);
  } finally {
    await w.cleanup();
  }
});

// ---------------------------------------------------------------------------
// U10 repair 2 (checker B F1-F3 and the review of f71f387): C14 a crisis always reaches the escalation or a log line, also when the
// socket drops; C16 the newest-wins step-aside survives an aborted newest start, and the supersede loop's second pass is needed;
// C17 the escalation port is built inside the retried write; C18 the escalation never carries an earlier turn's words; C19 the
// finalize drain is bounded. C15 (the month is read again after a supersede) is in voice-limits.test.ts.
// ---------------------------------------------------------------------------

/** Holds every student_flags write until `release()`; `hit()` turns true when the first write is in flight. */
const gatedFlagWrites = (w: VoiceWorld): { release: () => void; hit: () => boolean } => {
  const flags = w.fakeDb.collection<any>("student_flags");
  const real = flags.updateOne.bind(flags);
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let hit = false;
  flags.updateOne = (async (...args: Parameters<typeof real>) => {
    hit = true;
    await gate;
    return real(...args);
  }) as typeof flags.updateOne;
  return { release, hit: () => hit };
};

for (const how of ["drops", "ends gracefully"] as const) {
  test(`C14: a crisis whose flag write is still in flight when the socket ${how} is flagged once and escalated once`, async () => {
    const escalations: any[] = [];
    await withWorld(
      async (w, threadId) => {
        const { client } = await w.open(adult(), threadId);
        const g = gatedFlagWrites(w);
        speak(w, 0, CRISIS_PHRASE);
        await until(() => g.hit(), "the crisis flag write is in flight");
        if (how === "drops") client.abort();
        else client.send({ type: "end" });
        await until(() => w.provider.backends[0]!.calls.some((x) => x.type === "close"), "finalize began (the socket is closing)");
        g.release();
        await until(() => escalations.length >= 1, "escalated although the socket closed");
        await w.voice.settled();
        await new Promise((r) => setTimeout(r, 50));
        assert.equal(w.fakeDb.collection<any>("student_flags").all().length, 1, "exactly one flag");
        assert.equal(escalations.length, 1, "exactly one escalation");
        assert.match(escalations[0].turns[0].text, /kill myself/);
        assert.equal(w.voice.stats().sockets, 0);
        assert.ok(!w.logs.some((l) => l.event.startsWith("voice_crisis_escalate")), "nothing skipped or failed");
      },
      { deps: { escalateForTenant: () => async (input) => void escalations.push(input) } },
    );
  });
}

test("C14: a student fenced for erasure is the one crisis that is not escalated, and the skip is logged text-free (voice_crisis_escalate_skipped_fenced)", async () => {
  const escalations: unknown[] = [];
  await withWorld(
    async (w, threadId) => {
      await w.open(adult(), threadId);
      const db = w.deps.dbForTenant("tenant-a");
      const { requestId } = await requestErasure(db, { studentId: "stu-1", requestedBy: "counsellor-7", reason: "student_request" });
      await confirmErasure(db, { requestId, confirmedBy: "admin-2" });
      speak(w, 0, CRISIS_PHRASE);
      await until(() => w.logs.some((l) => l.event === "voice_crisis_escalate_skipped_fenced"), "the skip is logged");
      await w.voice.settled();
      assert.equal(escalations.length, 0);
      assert.ok(!JSON.stringify(w.logs).includes("kill"), "the log line is text-free");
    },
    { deps: { escalateForTenant: () => async (input) => void escalations.push(input) } },
  );
});

test("C14: an unconsented minor is flagged, not escalated, and the skip is logged text-free (voice_crisis_escalate_skipped_text_not_stored)", async () => {
  const escalations: unknown[] = [];
  await withWorld(
    async (w, threadId) => {
      await w.open(minorNoConsent(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => w.logs.some((l) => l.event === "voice_crisis_escalate_skipped_text_not_stored"), "the skip is logged");
      assert.equal(w.fakeDb.collection<any>("student_flags").all().length, 1);
      assert.equal(escalations.length, 0);
      assert.ok(!JSON.stringify(w.logs).includes("kill"));
    },
    { deps: { escalateForTenant: () => async (input) => void escalations.push(input) } },
  );
});

/** Gates the next LiveSession.drain() call after `arm()`; restore with `restore()`. */
function drainGate(): { arm: () => void; release: () => void; restore: () => void } {
  const orig = LiveSession.prototype.drain;
  let armed = false;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  LiveSession.prototype.drain = async function (this: LiveSession) {
    if (armed) {
      armed = false;
      await gate;
    }
    return orig.call(this);
  };
  return {
    arm: () => {
      armed = true;
    },
    release: () => release(),
    restore: () => {
      LiveSession.prototype.drain = orig;
    },
  };
}

test("C16: A active with a slow drain, B starts, C starts and then aborts: B (the only waiter left) becomes the one live session and is not told superseded", async () => {
  const w = await voiceWorld();
  const dg = drainGate();
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    const first = await w.open(adult(), threadId);
    dg.arm();
    const rB = await w.connect(await w.mint(adult(), threadId), { threadId });
    const rC = await w.connect(await w.mint(adult(), threadId), { threadId });
    assert.ok(rB.ok && rC.ok);
    if (!rB.ok || !rC.ok) return;
    rB.client.send({ type: "start", threadId });
    await until(() => first.client.of("error").filter((e) => e.code === "superseded").length >= 1, "B waits on A");
    rC.client.send({ type: "start", threadId });
    await until(() => first.client.of("error").filter((e) => e.code === "superseded").length >= 2, "C waits on A too");
    rC.client.abort();
    await until(() => w.voice.stats().sockets === 2, "C finalized (A and B left)");
    dg.release();
    await until(() => w.provider.backends.length === 2 || rB.client.closed, "B opened its provider session (or was closed)");
    await w.voice.settled();
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(rB.client.closed, false, "B is live");
    assert.ok(!rB.client.of("error").some((e) => e.code === "superseded"), "B was never told superseded");
    assert.equal(w.provider.backends.length, 2);
    const s = w.voice.stats();
    assert.equal(s.liveSessions, 1);
    assert.equal(s.activeSessions, 1);
    assert.equal(s.sockets, 1);
  } finally {
    dg.restore();
    dg.release();
    await w.cleanup();
  }
});

test("C16: the supersede loop's second pass is needed: a start that took the slot while B re-read the month is superseded before B opens its provider session", async () => {
  const w = await voiceWorld();
  const dg = drainGate();
  const usage = w.fakeDb.collection<any>("student_usage");
  const realFind = usage.findOne.bind(usage);
  let skip = -1;
  let readHeld = false;
  let releaseRead!: () => void;
  const readGate = new Promise<void>((r) => (releaseRead = r));
  usage.findOne = (async (...args: Parameters<typeof realFind>) => {
    if (skip === 0) {
      skip = -1;
      readHeld = true;
      await readGate;
    } else if (skip > 0) skip--;
    return realFind(...args);
  }) as typeof usage.findOne;
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    const a = await w.open(adult(), threadId);
    const rB = await w.connect(await w.mint(adult(), threadId), { threadId });
    assert.ok(rB.ok);
    if (!rB.ok) return;
    skip = 1; // B's start check reads the month (passes); B's re-read after superseding A is held
    rB.client.send({ type: "start", threadId });
    await until(() => readHeld, "B superseded A and is re-reading the month");
    assert.ok(a.client.of("error").some((e) => e.code === "superseded"));
    const d = await w.open(adult(), threadId); // D starts while B waits: the slot is free, D takes it and goes live
    assert.equal(w.provider.backends.length, 2);
    dg.arm();
    d.client.abort();
    await until(() => w.provider.backends[1]!.calls.some((x) => x.type === "close"), "D is closing, its drain held");
    releaseRead();
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(w.provider.backends.length, 2, "B must not open a provider session while D still holds the slot");
    assert.equal(rB.client.closed, false);
    dg.release();
    await until(() => w.provider.backends.length === 3 || rB.client.closed, "B opened its provider session after D was released");
    await w.voice.settled();
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(rB.client.closed, false, "B is live");
    assert.equal(w.provider.backends.length, 3);
    const s = w.voice.stats();
    assert.equal(s.liveSessions, 1);
    assert.equal(s.activeSessions, 1);
    assert.equal(s.sockets, 1);
  } finally {
    usage.findOne = realFind as typeof usage.findOne;
    dg.restore();
    dg.release();
    releaseRead();
    await w.cleanup();
  }
});

test("C17: an escalateForTenant factory that throws synchronously is retried, logged as voice_crisis_escalate_failed (text-free), and is never a persist_failed event", async () => {
  let built = 0;
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => w.logs.some((l) => l.event === "voice_crisis_escalate_failed") || client.of("error").length > 0, "the failure is visible");
      await w.voice.settled();
      assert.ok(w.logs.some((l) => l.event === "voice_crisis_escalate_failed"), "logged as voice_crisis_escalate_failed");
      assert.equal(built, 2, "the factory is inside the retried write: two attempts");
      assert.equal(w.fakeDb.collection<any>("student_flags").all().length, 1);
      assert.ok(!client.of("error").some((e) => e.code === "persist_failed"), "a crisis-write failure is a log line, not a persist_failed event");
      assert.ok(!JSON.stringify(w.logs).includes("secret-detail-xyz"));
      assert.equal(client.closed, false);
    },
    {
      deps: {
        escalateForTenant: () => {
          built++;
          throw new Error("factory down secret-detail-xyz");
        },
      },
    },
  );
});

test("C17: a factory that throws once is retried and the escalation is delivered, with nothing logged", async () => {
  let built = 0;
  const seen: any[] = [];
  await withWorld(
    async (w, threadId) => {
      await w.open(adult(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => seen.length === 1, "delivered on the retry");
      assert.equal(built, 2);
      assert.ok(!w.logs.some((l) => l.event.startsWith("voice_crisis_escalate")));
    },
    {
      deps: {
        escalateForTenant: () => {
          built++;
          if (built === 1) throw new Error("blip");
          return async (input) => void seen.push(input);
        },
      },
    },
  );
});

test("C18: a crisis with no words of its own is escalated with the fixed text-free marker, never with an earlier turn's words", async () => {
  const escalations: any[] = [];
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      speak(w, 0, "my earlier words about studying in Germany");
      answer(w, 0, "Here is an answer about Germany.");
      await until(() => client.of("transcript.final").length >= 2, "the earlier turn is done");
      speak(w, 0, "   "); // the detector fires on an empty utterance: there are no crisis words to send
      await until(() => escalations.length === 1, "escalated");
      const text = escalations[0].turns[0].text as string;
      assert.equal(text, VOICE_CRISIS_NO_WORDS_TEXT);
      assert.ok(typeof text === "string" && text.length > 0);
      assert.ok(!text.includes("earlier") && !text.includes("Germany"), "never an earlier turn's words");
      assert.equal(escalations[0].turns[0].translatedText, text);
      assert.equal(w.fakeDb.collection<any>("student_flags").all().length, 1);
    },
    {
      deps: {
        crisis: {
          detect: (text) => (text.trim() === "" ? { crisis: true, level: "crisis" } : { crisis: false }),
        },
        escalateForTenant: () => async (input) => void escalations.push(input),
      },
    },
  );
});

test("C18: the crisis utterance's own redacted words are escalated even when an earlier student turn was never answered", async () => {
  const escalations: any[] = [];
  await withWorld(
    async (w, threadId) => {
      await w.open(adult(), threadId);
      speak(w, 0, "an earlier unanswered question about Germany");
      speak(w, 0, CRISIS_PHRASE);
      await until(() => escalations.length === 1, "escalated");
      const text = escalations[0].turns[0].text as string;
      assert.match(text, /kill myself/);
      assert.ok(!text.includes("Germany"));
    },
    { deps: { escalateForTenant: () => async (input) => void escalations.push(input) } },
  );
});

test("C19: a crisis sink write that never settles cannot hold the slot: finalize waits at most drainTimeoutMs, logs voice_drain_timeout and frees the socket, the provider session and the student's slot", async () => {
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => w.fakeDb.collection<any>("student_flags").all().length === 1, "flag stored; the escalation now hangs");
      client.send({ type: "end" });
      await until(() => client.closed, "closed despite the hung sink write");
      await w.voice.settled();
      assert.ok(w.logs.some((l) => l.event === "voice_drain_timeout"));
      const s = w.voice.stats();
      assert.equal(s.sockets, 0);
      assert.equal(s.activeSessions, 0);
      assert.equal(s.liveSessions, 0);
      const again = await w.open(adult(), threadId);
      assert.equal(again.client.closed, false, "the student can start again");
    },
    { deps: { drainTimeoutMs: 100, escalateForTenant: () => () => new Promise<never>(() => undefined) } as Partial<VoiceApiDeps> },
  );
});

// ---------------------------------------------------------------------------
// p1-lk6 (D-104, D-105): voice facts go into the English KG with the original-language quote
// ---------------------------------------------------------------------------

const lk6Hindi = "मैं जर्मनी में एमबीए करना चाहता हूँ";
const lk6Provider = (facts: unknown[] | (() => never)) =>
  new MockProvider({ responses: { "fact-extraction": typeof facts === "function" ? (facts as never) : { facts } } });
const lk6Cand = (key: string, value: unknown, quote: string) => ({ key, value, source: { type: "transcript", quote, turnId: "ignored" }, confidence: 0.8, purposeTags: ["profile_synthesis"], sensitivity: "low" });

test("p1-lk6: a Hindi spoken turn becomes an English proposed fact with the Devanagari quote kept as its source", async () => {
  const text = lk6Provider([]);
  // The turn id is assigned by the voice API; the candidate must cite it, so answer from the input.
  text.setResponse("fact-extraction", (input: unknown) => ({
    facts: [lk6Cand("target_country", "Germany", "जर्मनी में एमबीए")].map((c) => ({ ...c, source: { ...c.source, turnId: (input as { turns: { turnId: string }[] }).turns[0]!.turnId } })),
  }));
  await withWorld(
    async (w, threadId) => {
      await w.open(adult(), threadId);
      speak(w, 0, lk6Hindi);
      await until(() => w.fakeDb.collection<any>("profile_facts").all().length === 1, "fact proposed");
      const row = w.fakeDb.collection<any>("profile_facts").all()[0];
      assert.deepEqual([row.key, row.value, row.quote, row.sourceLang, row.status], ["target_country", "Germany", "जर्मनी में एमबीए", "hi", "proposed"]);
      assert.equal(text.calls.length, 1);
      assert.equal((text.calls[0]!.input as { turns: { text: string; translatedText: string }[] }).turns[0]!.text, lk6Hindi, "the model read the original words");
    },
    { deps: { extractFacts: createStudentFactExtractor({ provider: text, skillsDir: SKILLS_DIR }) } },
  );
});

test("p1-lk6: an under-18 student without guardian consent makes no extraction call at all (no text is stored, so none is read)", async () => {
  const text = lk6Provider([lk6Cand("target_country", "Germany", "जर्मनी में एमबीए")]);
  await withWorld(
    async (w, threadId) => {
      await w.open(minorNoConsent(), threadId);
      speak(w, 0, lk6Hindi);
      await w.voice.settled().catch(() => undefined);
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(text.calls.length, 0);
      assert.equal(w.fakeDb.collection<any>("profile_facts").all().length, 0);
    },
    { deps: { extractFacts: createStudentFactExtractor({ provider: text, skillsDir: SKILLS_DIR }) } },
  );
});

test("p1-lk6: a failing extraction never ends the voice session and logs the event name and error class only, never the student's words", async () => {
  const text = lk6Provider((() => { throw new Error(`upstream echoed: ${lk6Hindi} 9876543210`); }) as () => never);
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      speak(w, 0, lk6Hindi);
      await until(() => w.logs.some((l: any) => l.event === "voice_fact_extraction_failed"), "failure logged");
      assert.ok(!client.closed, "the session is still open");
      const logged = JSON.stringify(w.logs);
      assert.ok(!logged.includes("जर्मनी") && !logged.includes("9876543210"), "no student words in the log");
    },
    { deps: { extractFacts: createStudentFactExtractor({ provider: text, skillsDir: SKILLS_DIR }) } },
  );
});
