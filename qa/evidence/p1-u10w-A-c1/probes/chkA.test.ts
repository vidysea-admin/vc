/**
 * Checker A (p1-u10w-voice-wiring, cycle 1) hostile probes. Written by the checker, not the maker. Lives only in a throwaway copy
 * under D:/vc/.worktrees/ (never in the bound tree). SYNTHETIC data only; MockLiveProvider; loopback.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { SignJWT } from "jose";
import { COLLECTION_NAMES, recordStudentUsage, getStudentUsage, usageMonth } from "@vc/db";
import { escalateTurns, loadConcernClassifierConfig, loadSkill, CONCERN_CLASSIFIER_SKILL } from "@vc/engine";
import { CRISIS_RESUME_GAP_MS_DEFAULT, type LiveCrisisDetector } from "@vc/providers";
import { VOICE_CRISIS_NO_WORDS_TEXT, voiceEnabledFromEnv, VoiceConfigError, VOICE_WS_AUDIENCE, VOICE_WS_ISSUER } from "../src/voice.js";
import { SKILLS_DIR, kbAnswerProvider } from "./chat-fixtures.js";
import { CRISIS_AUDIO, CRISIS_PHRASE, CRISIS_TEXT_FIXED, adult, minorNoConsent, newThread, studentToken, until, voiceWorld, type VoiceWorld } from "./voice-fixtures.js";

const EARLIER = "my earlier unanswered question about Germany";
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const speak = (w: VoiceWorld, text: string) => w.provider.backends[0]!.emitInputTranscript(text, true);
const gap = async (w: VoiceWorld) => {
  w.provider.backends[0]!.emitTurnComplete();
  await sleep(CRISIS_RESUME_GAP_MS_DEFAULT + 300);
};
const detectEmptyFires: LiveCrisisDetector = (text) => (text.trim() === "" || text.includes(CRISIS_PHRASE) ? { crisis: true, level: "crisis" } : { crisis: false });
const detectThrows: LiveCrisisDetector = (text) => {
  if (text.includes("DETECTOR-THROWS") || text.trim() === "") throw new Error("detector down");
  return { crisis: false };
};

async function run(detector: LiveCrisisDetector | undefined, body: (w: VoiceWorld, esc: any[], threadId: string) => Promise<void>, extra: Record<string, unknown> = {}) {
  const esc: any[] = [];
  const w = await voiceWorld({
    deps: {
      crisis: { message: { text: CRISIS_TEXT_FIXED, audio: CRISIS_AUDIO }, ...(detector ? { detect: detector } : {}) },
      escalateForTenant: () => async (input: any) => void esc.push(input),
      ...extra,
    } as any,
  });
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    await body(w, esc, threadId);
  } finally {
    await w.cleanup();
  }
}

const gatedFlagWrites = (w: VoiceWorld) => {
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

// ------------------------------- C18 hostile variants -------------------------------

test("PA1 C18+C14: unanswered earlier turn, crisis WITH words, flag write in flight, socket drops -> one escalation with ONLY the crisis words", async () => {
  await run(undefined, async (w, esc, threadId) => {
    const { client } = await w.open(adult(), threadId);
    speak(w, EARLIER);
    const g = gatedFlagWrites(w);
    speak(w, `${CRISIS_PHRASE} tonight`);
    await until(() => g.hit(), "flag write in flight");
    client.abort();
    await until(() => w.provider.backends[0]!.calls.some((x) => x.type === "close"), "finalize began");
    g.release();
    await until(() => esc.length >= 1, "escalated after the drop");
    await w.voice.settled();
    await sleep(50);
    assert.equal(esc.length, 1);
    assert.match(esc[0].turns[0].text, /kill myself tonight/);
    assert.ok(!/Germany|earlier/.test(esc[0].turns[0].text));
    assert.equal(w.fakeDb.collection<any>("student_flags").all().length, 1);
  });
});

test("PA2 C18+C14: unanswered earlier turn, NO-words crisis, flag write in flight, graceful end -> marker, never the earlier words", async () => {
  await run(detectEmptyFires, async (w, esc, threadId) => {
    const { client } = await w.open(adult(), threadId);
    speak(w, EARLIER);
    const g = gatedFlagWrites(w);
    speak(w, "   ");
    await until(() => g.hit(), "flag write in flight");
    client.send({ type: "end" });
    await until(() => w.provider.backends[0]!.calls.some((x) => x.type === "close"), "finalize began");
    g.release();
    await until(() => esc.length >= 1, "escalated");
    await w.voice.settled();
    await sleep(50);
    assert.equal(esc.length, 1);
    assert.equal(esc[0].turns[0].text, VOICE_CRISIS_NO_WORDS_TEXT);
  });
});

test("PA3 C18: no-words crisis (after an unanswered turn) THEN a crisis with words: each carries its own", async () => {
  await run(detectEmptyFires, async (w, esc, threadId) => {
    await w.open(adult(), threadId);
    speak(w, EARLIER);
    speak(w, "   ");
    await until(() => esc.length === 1, "first");
    await gap(w);
    speak(w, `${CRISIS_PHRASE} second`);
    await until(() => esc.length === 2, "second");
    await w.voice.settled();
    assert.equal(esc[0].turns[0].text, VOICE_CRISIS_NO_WORDS_TEXT);
    assert.match(esc[1].turns[0].text, /kill myself second/);
    assert.ok(!/Germany|earlier/.test(esc[1].turns[0].text));
  });
});

test("PA4 C18: throwing detector, three crises in a row (words / no words / words): no leak between them", async () => {
  await run(detectThrows, async (w, esc, threadId) => {
    await w.open(adult(), threadId);
    speak(w, "DETECTOR-THROWS alpha words");
    await until(() => esc.length === 1, "1");
    await gap(w);
    speak(w, "   ");
    await until(() => esc.length === 2, "2");
    await gap(w);
    speak(w, "DETECTOR-THROWS gamma words");
    await until(() => esc.length === 3, "3");
    await w.voice.settled();
    assert.match(esc[0].turns[0].text, /alpha words/);
    assert.equal(esc[1].turns[0].text, VOICE_CRISIS_NO_WORDS_TEXT);
    assert.match(esc[2].turns[0].text, /gamma words/);
    assert.ok(!/alpha/.test(esc[2].turns[0].text) && !/alpha/.test(esc[1].turns[0].text));
    assert.equal(w.fakeDb.collection<any>("student_flags").all().length >= 1, true);
  });
});

test("PA5 C18/C12: the escalated crisis words are redacted (email, phone)", async () => {
  await run(undefined, async (w, esc, threadId) => {
    await w.open(adult(), threadId);
    speak(w, `mail me at kid.person@example.com or 9876543210 I want to kill myself`);
    await until(() => esc.length === 1, "escalated");
    await w.voice.settled();
    const t = esc[0].turns[0].text as string;
    assert.ok(!t.includes("kid.person@example.com") && !t.includes("9876543210"), t);
    assert.match(t, /kill myself/);
  });
});

test("PA6 C18: unconsented minor crisis: flagged, never escalated, logged text-free; next adult-free session unaffected", async () => {
  const esc: any[] = [];
  const w = await voiceWorld({ deps: { escalateForTenant: () => async (i: any) => void esc.push(i) } as any });
  try {
    const threadId = await newThread(w.chat, await studentToken(minorNoConsent()));
    await w.open(minorNoConsent(), threadId);
    speak(w, `${CRISIS_PHRASE} hidden words`);
    await until(() => w.logs.some((l) => l.event === "voice_crisis_escalate_skipped_text_not_stored"), "skip logged");
    await w.voice.settled();
    assert.equal(esc.length, 0);
    assert.equal(w.fakeDb.collection<any>("student_flags").all().length, 1);
    assert.ok(!JSON.stringify(w.logs).includes("hidden"));
  } finally {
    await w.cleanup();
  }
});

test("PA13 (observation): two crises sharing lastUser.turnId through the REAL escalateTurns port: how many notification records?", async () => {
  const deps = () => ({
    recipients: async () => ({ adminIds: ["admin-1"], counsellorIds: ["counsellor-1"] }),
    classifier: { provider: kbAnswerProvider(), skillPrompt: loadSkill(SKILLS_DIR, CONCERN_CLASSIFIER_SKILL), config: loadConcernClassifierConfig({}) },
    alert: () => undefined,
  });
  const w = await voiceWorld({
    deps: {
      crisis: { message: { text: CRISIS_TEXT_FIXED, audio: CRISIS_AUDIO }, detect: detectEmptyFires },
      escalateForTenant: (_t: string, db: any) => async (input: any) => escalateTurns(db, input, deps() as any),
    } as any,
  });
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    await w.open(adult(), threadId);
    speak(w, `${CRISIS_PHRASE} one`);
    await until(() => w.fakeDb.collection<any>(COLLECTION_NAMES.escalation_notifications).all().length >= 1, "first notified");
    await w.voice.settled();
    await gap(w);
    speak(w, "   ");
    await until(() => w.fakeDb.collection<any>("student_flags").all().length >= 1, "flag");
    await sleep(300);
    await w.voice.settled();
    const docs = w.fakeDb.collection<any>(COLLECTION_NAMES.escalation_notifications).all();
    const flags = w.fakeDb.collection<any>("student_flags").all();
    console.log("PA13 observation: notification records =", docs.length, "flags =", flags.length, "ids =", docs.map((d: any) => d._id).join(" | "));
  } finally {
    await w.cleanup();
  }
});

// ------------------------------- flag gate -------------------------------

test("PA9 flag gate: only a trimmed 'true' is on; unset/empty/'false' off; everything else is a config error, never on", () => {
  const on = (v: string | undefined) => voiceEnabledFromEnv(v === undefined ? {} : { VC_VOICE_ENABLED: v });
  assert.equal(on(undefined), false);
  assert.equal(on(""), false);
  assert.equal(on("false"), false);
  assert.equal(on("true"), true);
  const trimmed = on(" true "); // observation: surrounding whitespace is trimmed
  console.log("PA9 observation: ' true ' ->", trimmed);
  for (const v of ["TRUE", "True", "tRue", "1", "yes", "on", "enabled", "truee", "t", "0", "no", "off", "null"]) {
    assert.throws(() => on(v), VoiceConfigError, v);
  }
});

// ------------------------------- WS auth + tenancy hostile variants -------------------------------

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

async function refused(w: VoiceWorld, token: string, threadId: string, how: "header" | "protocol" = "header") {
  const r = await w.connect(token, { threadId, how });
  assert.equal(r.ok, false, "must be refused");
  if (!r.ok) assert.equal(r.status, 401);
  assert.equal(w.provider.backends.length, 0, "no provider connect");
}

test("PA10a WS auth: alg none (empty signature, dummy signature), HS384 with the right secret, wrong issuer, wrong audience, expired by payload, expired by clock", async () => {
  const w = await voiceWorld();
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    const iat = Math.floor(w.clock.ms / 1000);
    const payload = { iss: VOICE_WS_ISSUER, aud: VOICE_WS_AUDIENCE, jti: "jti-none-0000-4000-8000-000000000000", iat, exp: iat + 60, tenant: "tenant-a", studentId: "stu-1", threadId, sid: "11111111-1111-4111-8111-111111111111", minor: false, guardianConsent: false };
    await refused(w, `${b64({ alg: "none", typ: "JWT" })}.${b64(payload)}.`, threadId);
    await refused(w, `${b64({ alg: "none", typ: "JWT" })}.${b64(payload)}.AAAA`, threadId);
    const hs384 = await new SignJWT({ tenant: "tenant-a", studentId: "stu-1", threadId, sid: payload.sid, minor: false, guardianConsent: false })
      .setProtectedHeader({ alg: "HS384" }).setIssuer(VOICE_WS_ISSUER).setAudience(VOICE_WS_AUDIENCE).setJti("jti-384-0000-4000-8000-000000000000").setIssuedAt(iat).setExpirationTime(iat + 60).sign(w.wsSecret);
    await refused(w, hs384, threadId);
    await refused(w, await w.signWsToken({ tenant: "tenant-a", studentId: "stu-1", threadId }, { iss: "someone-else" }), threadId);
    await refused(w, await w.signWsToken({ tenant: "tenant-a", studentId: "stu-1", threadId }, { aud: "vc-voice-ws-2" }), threadId);
    await refused(w, await w.signWsToken({ tenant: "tenant-a", studentId: "stu-1", threadId }, { expSec: iat - 10 }), threadId);
    const t = await w.mint(adult(), threadId);
    w.clock.ms += 61_000;
    await refused(w, t, threadId);
    // a token that is the student JWT itself is not a voice token
    await refused(w, await studentToken(adult()), threadId);
    // protocol path is refused equally
    await refused(w, hs384, threadId, "protocol");
  } finally {
    await w.cleanup();
  }
});

test("PA10b WS auth: another student's token on this student's path, another thread's token, and replay after the first socket closed", async () => {
  const w = await voiceWorld();
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    const other = await newThread(w.chat, await studentToken(adult()));
    const mine = await w.mint(adult(), threadId);
    // token for stu-2 on stu-1's path
    const t2 = await w.signWsToken({ tenant: "tenant-a", studentId: "stu-2", threadId });
    const r = await w.connect(t2, { threadId, studentId: "stu-1" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 401);
    // thread mismatch
    const r2 = await w.connect(mine, { threadId: other });
    assert.equal(r2.ok, false);
    if (!r2.ok) assert.equal(r2.status, 401);
    // legit use, then close, then replay
    const ok = await w.connect(mine, { threadId });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      ok.client.send({ type: "end" });
      await until(() => ok.client.closed, "closed");
    }
    await w.voice.settled();
    const again = await w.connect(mine, { threadId });
    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.status, 401);
    assert.equal(w.provider.backends.length, 0);
  } finally {
    await w.cleanup();
  }
});

test("PA10c tenancy: a token for tenant-b (same student id, same thread id) on tenant-a's path never reaches tenant-a's thread: start -> not_found, no provider session, nothing of tenant-a replayed", async () => {
  const w = await voiceWorld();
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    // give tenant-a's thread a retained log so a cross-tenant replay would be visible
    const a = await w.open(adult(), threadId);
    a.client.send({ type: "end" });
    await until(() => a.client.closed, "a closed");
    await w.voice.settled();
    const tb = await w.signWsToken({ tenant: "tenant-b", studentId: "stu-1", threadId, sid: "22222222-2222-4222-8222-222222222222" });
    const r = await w.connect(tb, { threadId });
    assert.equal(r.ok, true, "the upgrade itself is accepted (the token is valid for tenant-b)");
    if (!r.ok) return;
    const before = w.provider.backends.length;
    r.client.send({ type: "start", threadId, lastEventId: `${a.sid}.0` });
    await until(() => r.client.closed, "closed after start");
    assert.equal(r.client.of("error")[0]?.code, "not_found");
    assert.equal(w.provider.backends.length, before, "no provider session for the other tenant");
    assert.equal(r.client.events.filter((e) => e.type === "transcript.final" || e.type === "transcript.partial").length, 0, "no replay of tenant-a events");
    assert.equal(r.client.events.filter((e) => String(e.eventId ?? "").startsWith(a.sid)).length, 0);
  } finally {
    await w.cleanup();
  }
});

// ------------------------------- monthly cap -------------------------------

test("PA11 cap: 59 min used; two overlapping starts and a restart cannot push the month above 60 min", async () => {
  const w = await voiceWorld({ deps: { silenceTimeoutMs: 10 * 3600_000 } });
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    const db = w.deps.dbForTenant("tenant-a");
    await recordStudentUsage(db, { studentId: "stu-1", voiceMs: 59 * 60_000 }, { now: new Date(w.clock.ms) });
    const a = await w.open(adult(), threadId);
    w.clock.ms += 30_000;
    const b = await w.open(adult(), threadId); // supersedes a: a's 30 s are written, b re-reads the month
    w.clock.ms += 40_000; // more than the 30 s that are left
    w.timers.advance(0);
    await sleep(30);
    w.timers.advance(40_000);
    await until(() => b.client.closed, "b hit the remaining-quota cap");
    await w.voice.settled();
    const used = (await getStudentUsage(db, { studentId: "stu-1", month: usageMonth(new Date(w.clock.ms)) })).voiceMs;
    console.log("PA11 used ms =", used);
    assert.ok(used <= 60 * 60_000, `month capped, got ${used}`);
    void a;
    const third = await w.session(adult(), threadId);
    assert.equal(third.status, 429);
  } finally {
    await w.cleanup();
  }
});
