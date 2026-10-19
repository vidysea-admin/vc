/**
 * Checker A (cycle 2) own hostile probes for p1-u10-voice-ws. Not the maker's tests. SYNTHETIC only (mock provider, fake Db).
 * Run only in the scratch copy D:/vc/.worktrees/p1-u10-A-fals; never added to the worktree under check.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { COLLECTION_NAMES, FencedWriterDeadlineError, exportStudent, executeErasure, getStudentUsage, recordStudentUsage, requestErasure, usageMonth } from "@vc/db";
import { confirmTwiceAndApprove } from "@vc/db/testing";
import { LiveSession, MockLiveProvider, type LiveProvider } from "@vc/providers";
import { everythingStored } from "./chat-fixtures.js";
import { VOICE_RESUME_WINDOW_MS, type VoiceApiDeps } from "../src/voice.js";
import {
  CRISIS_AUDIO,
  CRISIS_PHRASE,
  adult,
  minorConsent,
  minorNoConsent,
  newThread,
  studentToken,
  until,
  voiceWorld,
  type VoiceWorld,
  type VoiceWorldOptions,
} from "./voice-fixtures.js";

const MIN = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withWorld(fn: (w: VoiceWorld, threadId: string) => Promise<void>, opts?: VoiceWorldOptions): Promise<void> {
  const w = await voiceWorld({ ...opts, deps: { silenceTimeoutMs: 10 * 3600_000, ...(opts?.deps ?? {}) } });
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    await fn(w, threadId);
  } finally {
    await w.cleanup();
  }
}
const speak = (w: VoiceWorld, idx: number, text: string) => w.provider.backends[idx]!.emitInputTranscript(text, true);
const flagsOf = (w: VoiceWorld) => w.fakeDb.collection<any>("student_flags").all();
const addUsage = (w: VoiceWorld, ms: number) => recordStudentUsage(w.deps.dbForTenant("tenant-a"), { studentId: "stu-1", voiceMs: ms }, { now: new Date(w.clock.ms) });
const usedMs = (w: VoiceWorld) => getStudentUsage(w.deps.dbForTenant("tenant-a"), { studentId: "stu-1", month: usageMonth(new Date(w.clock.ms)) }).then((u) => u.voiceMs);
const zero = (w: VoiceWorld) => {
  const s = w.voice.stats();
  assert.equal(s.sockets, 0, "sockets");
  assert.equal(s.activeSessions, 0, "activeSessions");
  assert.equal(s.liveSessions, 0, "liveSessions");
  assert.equal(s.timers, 0, "timers");
};
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
function drainGate() {
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
  return { arm: () => void (armed = true), release: () => release(), restore: () => void (LiveSession.prototype.drain = orig) };
}

// ---------------------------------------------------------------------------------------------- C14 crisis durability
const PII_CRISIS = "my name is Asha Rao, email asha.rao@example.com, I want to kill myself";

test("PA1 C14: socket aborts while the flag write is gated -> exactly 1 flag, 1 escalation, redacted words, nothing leaked or skipped", async () => {
  const esc: any[] = [];
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      const g = gatedFlagWrites(w);
      speak(w, 0, PII_CRISIS);
      await until(() => g.hit(), "flag in flight");
      client.abort();
      await until(() => w.provider.backends[0]!.calls.some((x) => x.type === "close"), "finalize began");
      assert.equal(esc.length, 0, "not escalated while the flag write is still gated");
      g.release();
      await until(() => esc.length >= 1, "escalated after the socket was gone");
      await w.voice.settled();
      await sleep(60);
      assert.equal(flagsOf(w).length, 1);
      assert.equal(esc.length, 1);
      const text = esc[0].turns[0].text as string;
      assert.match(text, /kill myself/);
      assert.ok(!/Asha|Rao|example\.com/.test(text), `escalation text must be redacted: ${text}`);
      assert.ok(!w.logs.some((l) => l.event.startsWith("voice_crisis")), `no skip/fail log expected: ${JSON.stringify(w.logs)}`);
      zero(w);
    },
    { deps: { escalateForTenant: () => async (i) => void esc.push(i) } },
  );
});

test("PA2 C14: API shutdown (voice.close) while the crisis flag write is gated still flags once and escalates once", async () => {
  const esc: any[] = [];
  await withWorld(
    async (w, threadId) => {
      await w.open(adult(), threadId);
      const g = gatedFlagWrites(w);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => g.hit(), "flag in flight");
      const closing = w.voice.close();
      await sleep(40);
      g.release();
      await closing;
      assert.equal(flagsOf(w).length, 1);
      assert.equal(esc.length, 1);
    },
    { deps: { escalateForTenant: () => async (i) => void esc.push(i) } },
  );
});

test("PA3 C14: socket aborts while the ESCALATION itself is gated (flag already stored) -> still exactly one escalation, then everything is released", async () => {
  const esc: any[] = [];
  let entered = false;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => entered, "escalation port entered");
      client.abort();
      await until(() => w.provider.backends[0]!.calls.some((x) => x.type === "close"), "finalize began");
      await sleep(40);
      assert.equal(flagsOf(w).length, 1);
      release();
      await until(() => esc.length === 1, "escalation delivered");
      await w.voice.settled();
      assert.equal(esc.length, 1);
      zero(w);
    },
    {
      deps: {
        escalateForTenant: () => async (i) => {
          entered = true;
          await gate;
          esc.push(i);
        },
      },
    },
  );
});

test("PA4 C14/C12: an unconsented minor who drops mid-crisis is flagged once, NOT escalated, the skip is logged text-free, and no spoken text is stored", async () => {
  const esc: any[] = [];
  const w = await voiceWorld({ deps: { silenceTimeoutMs: 10 * 3600_000, escalateForTenant: () => async (i) => void esc.push(i) } });
  try {
    const threadId = await newThread(w.chat, await studentToken(minorNoConsent()));
    const { client } = await w.open(minorNoConsent(), threadId);
    const g = gatedFlagWrites(w);
    speak(w, 0, PII_CRISIS);
    await until(() => g.hit(), "flag in flight");
    client.abort();
    await sleep(30);
    g.release();
    await until(() => w.logs.some((l) => l.event === "voice_crisis_escalate_skipped_text_not_stored"), "skip logged");
    await w.voice.settled();
    assert.equal(flagsOf(w).length, 1);
    assert.equal(esc.length, 0);
    assert.ok(!JSON.stringify(w.logs).includes("kill"), "log is text-free");
    const stored = everythingStored(w.fakeDb);
    assert.ok(!stored.includes("kill myself") && !stored.includes("Asha") && !stored.includes("example.com"), "no spoken text stored for an unconsented minor");
    zero(w);
  } finally {
    await w.cleanup();
  }
});

test("PA5 C14/C12: a minor WITH guardian consent who drops mid-crisis IS escalated once, with redacted words", async () => {
  const esc: any[] = [];
  const w = await voiceWorld({ deps: { silenceTimeoutMs: 10 * 3600_000, escalateForTenant: () => async (i) => void esc.push(i) } });
  try {
    const threadId = await newThread(w.chat, await studentToken(minorConsent()));
    const { client } = await w.open(minorConsent(), threadId);
    const g = gatedFlagWrites(w);
    speak(w, 0, PII_CRISIS);
    await until(() => g.hit(), "flag in flight");
    client.abort();
    await sleep(30);
    g.release();
    await until(() => esc.length === 1, "escalated");
    await w.voice.settled();
    assert.equal(esc.length, 1);
    assert.ok(!/Asha|example\.com/.test(esc[0].turns[0].text));
    zero(w);
  } finally {
    await w.cleanup();
  }
});

test("PA6 C12: a crisis flag write that always fails is retried once, logged text-free (voice_crisis_flag_failed), the escalation STILL happens, and no persist_failed reaches the client", async () => {
  const esc: any[] = [];
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      const flags = w.fakeDb.collection<any>("student_flags");
      let n = 0;
      flags.updateOne = (async () => {
        n++;
        throw new Error("secret-flag-detail-123 kill myself");
      }) as typeof flags.updateOne;
      speak(w, 0, CRISIS_PHRASE);
      await until(() => esc.length === 1, "escalated despite the failed flag");
      await w.voice.settled();
      assert.equal(n, 2, "two attempts in all");
      assert.ok(w.logs.some((l) => l.event === "voice_crisis_flag_failed"));
      assert.ok(!JSON.stringify(w.logs).includes("secret-flag-detail-123") && !JSON.stringify(w.logs).includes("kill"));
      assert.ok(!client.of("error").some((e) => e.code === "persist_failed"));
    },
    { deps: { escalateForTenant: () => async (i) => void esc.push(i) } },
  );
});

test("PA7 OBSERVE: a flag write that dies with FencedWriterDeadlineError (not a real erasure fence) -> what happens to the escalation?", async () => {
  const esc: any[] = [];
  await withWorld(
    async (w, threadId) => {
      await w.open(adult(), threadId);
      const flags = w.fakeDb.collection<any>("student_flags");
      flags.updateOne = (async () => {
        throw new FencedWriterDeadlineError(Promise.resolve());
      }) as typeof flags.updateOne;
      speak(w, 0, CRISIS_PHRASE);
      await sleep(300);
      await w.voice.settled();
      console.log(`PA7-OBSERVE escalations=${esc.length} logs=${JSON.stringify(w.logs.map((l) => l.event))}`);
    },
    { deps: { escalateForTenant: () => async (i) => void esc.push(i) } },
  );
});

test("PA8 C14: crisis spoken and the socket aborted in the same tick (no gating) -> 1 flag, 1 escalation", async () => {
  const esc: any[] = [];
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      client.abort();
      await until(() => esc.length >= 1, "escalated");
      await w.voice.settled();
      await sleep(40);
      assert.equal(flagsOf(w).length, 1);
      assert.equal(esc.length, 1);
      zero(w);
    },
    { deps: { escalateForTenant: () => async (i) => void esc.push(i) } },
  );
});

test("PA8b C17: an escalation factory that throws twice with the socket gone is logged (voice_crisis_escalate_failed), flag kept, nothing thrown, slot released", async () => {
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      const g = gatedFlagWrites(w);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => g.hit(), "in flight");
      client.abort();
      await sleep(30);
      g.release();
      await until(() => w.logs.some((l) => l.event === "voice_crisis_escalate_failed"), "failure logged");
      await w.voice.settled();
      assert.equal(flagsOf(w).length, 1);
      zero(w);
    },
    {
      deps: {
        escalateForTenant: () => {
          throw new Error("factory boom");
        },
      },
    },
  );
});

// ---------------------------------------------------------------------------------------------- C15 quota after supersede
test("PA9a C15: usage 50, A ran 5 min -> B supersedes A and IS allowed, but its cap is exactly the 5 minutes left", async () => {
  await withWorld(async (w, threadId) => {
    await addUsage(w, 50 * MIN);
    const a = await w.open(adult(), threadId);
    w.clock.ms += 5 * MIN;
    const b = await w.open(adult(), threadId); // supersedes A; A's 5 minutes are written first
    assert.ok(a.client.of("error").some((e) => e.code === "superseded"));
    await until(() => w.voice.stats().liveSessions === 1 && w.voice.stats().activeSessions === 1, "B live");
    assert.equal(await usedMs(w), 55 * MIN);
    w.timers.advance(5 * MIN - 1_000);
    await sleep(40);
    assert.equal(b.client.closed, false, "not closed before the remaining 5 minutes are gone");
    w.timers.advance(1_000);
    await until(() => b.client.closed, "closed at the cap");
    assert.ok(b.client.of("error").some((e) => e.code === "session_time_limit"));
    await w.voice.settled();
    assert.equal(await usedMs(w), 60 * MIN);
    zero(w);
  });
});

test("PA9b C15: usage 50, A ran 10 min, B and C start together -> both refused/stepped aside, no new provider session, everything returns to zero", async () => {
  await withWorld(async (w, threadId) => {
    await addUsage(w, 50 * MIN);
    const a = await w.open(adult(), threadId);
    w.clock.ms += 10 * MIN;
    const tb = await w.mint(adult(), threadId);
    const tc = await w.mint(adult(), threadId);
    const rb = await w.connect(tb, { threadId });
    const rc = await w.connect(tc, { threadId });
    assert.ok(rb.ok && rc.ok);
    if (!rb.ok || !rc.ok) return;
    rb.client.send({ type: "start", threadId });
    rc.client.send({ type: "start", threadId });
    await until(() => rb.client.closed && rc.client.closed && a.client.closed, "all three closed");
    await w.voice.settled();
    assert.equal(w.provider.backends.length, 1, "no provider session opened for B or C");
    const codes = [...rb.client.of("error"), ...rc.client.of("error")].map((e) => e.code).sort();
    assert.ok(codes.includes("voice_quota_exceeded"), `codes ${codes}`);
    assert.equal(await usedMs(w), 60 * MIN);
    zero(w);
  });
});

// ---------------------------------------------------------------------------------------------- C16 / C10 supersede
test("PA10a C16: A active (slow drain), B starts then C starts; the OLDER B aborts -> C is the one live session and is never told superseded", async () => {
  const dg = drainGate();
  try {
    await withWorld(async (w, threadId) => {
      const a = await w.open(adult(), threadId);
      dg.arm();
      const rb = await w.connect(await w.mint(adult(), threadId), { threadId });
      const rc = await w.connect(await w.mint(adult(), threadId), { threadId });
      assert.ok(rb.ok && rc.ok);
      if (!rb.ok || !rc.ok) return;
      rb.client.send({ type: "start", threadId });
      await until(() => a.client.of("error").some((e) => e.code === "superseded"), "A superseded");
      rc.client.send({ type: "start", threadId });
      await sleep(80);
      rb.client.abort();
      await until(() => w.voice.stats().sockets === 2, "B gone");
      dg.release();
      await until(() => w.provider.backends.length === 2, "C opened the provider session");
      await w.voice.settled();
      assert.equal(rc.client.closed, false);
      assert.ok(!rc.client.of("error").some((e) => e.code === "superseded"));
      const s = w.voice.stats();
      assert.equal(s.liveSessions, 1);
      assert.equal(s.activeSessions, 1);
      assert.equal(s.sockets, 1);
      rc.client.send({ type: "end" });
      await until(() => rc.client.closed, "C closed");
      await w.voice.settled();
      zero(w);
    });
  } finally {
    dg.restore();
  }
});

test("PA10b C10/C16: A active (slow drain), B and C start, NEITHER aborts -> exactly one live provider session, loser told superseded, all counters 0 after both close", async () => {
  const dg = drainGate();
  try {
    await withWorld(async (w, threadId) => {
      const a = await w.open(adult(), threadId);
      dg.arm();
      const rb = await w.connect(await w.mint(adult(), threadId), { threadId });
      const rc = await w.connect(await w.mint(adult(), threadId), { threadId });
      assert.ok(rb.ok && rc.ok);
      if (!rb.ok || !rc.ok) return;
      rb.client.send({ type: "start", threadId });
      rc.client.send({ type: "start", threadId });
      await until(() => a.client.of("error").some((e) => e.code === "superseded"), "A superseded");
      await sleep(80);
      dg.release();
      await until(() => rb.client.closed || rc.client.closed, "one loser closed");
      await sleep(80);
      await w.voice.settled();
      const live = [rb.client, rc.client].filter((c) => !c.closed);
      assert.equal(live.length, 1);
      assert.equal(w.voice.stats().liveSessions, 1);
      assert.equal(w.provider.backends.length, 2, "A and the winner only");
      live[0]!.send({ type: "end" });
      await until(() => live[0]!.closed, "winner closed");
      await w.voice.settled();
      zero(w);
    });
  } finally {
    dg.restore();
  }
});

test("PA11 C10: B's provider connect is still in flight when C supersedes B -> C goes live, B's LATE provider session is closed on arrival, 1 live session, counters 0 at the end", async () => {
  const inner = new MockLiveProvider();
  let n = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const live = {
    kind: "mock",
    connect: async (cfg: Parameters<MockLiveProvider["connect"]>[0]) => {
      const my = ++n;
      if (my === 1) await gate;
      return inner.connect(cfg);
    },
  } as unknown as LiveProvider;
  await withWorld(
    async (w, threadId) => {
      const rb = await w.connect(await w.mint(adult(), threadId), { threadId });
      assert.ok(rb.ok);
      if (!rb.ok) return;
      rb.client.send({ type: "start", threadId });
      await until(() => n === 1, "B connect in flight");
      const rc = await w.connect(await w.mint(adult(), threadId), { threadId });
      assert.ok(rc.ok);
      if (!rc.ok) return;
      rc.client.send({ type: "start", threadId });
      await until(() => inner.backends.length === 1, "C's session opened");
      await until(() => rb.client.closed, "B closed");
      assert.ok(rb.client.of("error").some((e) => e.code === "superseded"));
      release();
      await until(() => inner.backends.length === 2, "B's late session was created");
      await until(() => inner.backends[1]!.calls.some((c) => c.type === "close"), "B late session closed on arrival");
      await w.voice.settled();
      const s = w.voice.stats();
      assert.equal(s.liveSessions, 1);
      assert.equal(s.activeSessions, 1);
      rc.client.send({ type: "end" });
      await until(() => rc.client.closed, "C closed");
      await w.voice.settled();
      zero(w);
    },
    { live },
  );
});

test("PA11b C9: a second concurrent session for one student is not an extra paid session: A is told superseded and closed, one live session remains", async () => {
  await withWorld(async (w, threadId) => {
    const a = await w.open(adult(), threadId);
    const b = await w.open(adult(), threadId);
    await until(() => a.client.closed, "A closed");
    assert.ok(a.client.of("error").some((e) => e.code === "superseded"));
    await w.voice.settled();
    assert.equal(w.voice.stats().liveSessions, 1);
    assert.equal(b.client.closed, false);
  });
});

// ---------------------------------------------------------------------------------------------- C19 bounded drain
test("PA12 C19: a never-settling escalation + a plain socket DROP (not 'end'): released within drainTimeoutMs, voice_drain_timeout logged, minutes recorded, student can start again, shutdown completes", async () => {
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      w.clock.ms += 2 * MIN;
      speak(w, 0, CRISIS_PHRASE);
      await until(() => flagsOf(w).length === 1, "flag stored; escalation now hangs");
      client.abort();
      await until(() => w.logs.some((l) => l.event === "voice_drain_timeout"), "drain timeout logged", 3000);
      await w.voice.settled();
      zero(w);
      assert.equal(await usedMs(w), 2 * MIN, "the two minutes were recorded");
      const again = await w.open(adult(), threadId);
      assert.equal(again.client.closed, false);
      assert.equal(w.voice.stats().liveSessions, 1);
    },
    { deps: { drainTimeoutMs: 150, escalateForTenant: () => () => new Promise<never>(() => undefined) } as Partial<VoiceApiDeps> },
  );
});

// ---------------------------------------------------------------------------------------------- C11 limits
test("PA13 C11: default 30/min session-route limit per student: the 31st is 429 with Retry-After, another student is unaffected", async () => {
  await withWorld(async (w, threadId) => {
    for (let i = 0; i < 30; i++) assert.equal((await w.session(adult(), threadId)).status, 201, `request ${i + 1}`);
    const r = await w.session(adult(), threadId);
    assert.equal(r.status, 429);
    assert.equal(r.json.error, "rate_limited");
    assert.ok(Number(r.headers["retry-after"]) >= 1);
    const t2 = await newThread(w.chat, await studentToken(adult("stu-2")), "stu-2");
    assert.equal((await w.session(adult("stu-2"), t2, "stu-2")).status, 201);
  });
});

test("PA13b C11: pre-start cap: one student's third unstarted socket is 429 and its token is not burned; another student connects", async () => {
  await withWorld(async (w, threadId) => {
    const t = [await w.mint(adult(), threadId), await w.mint(adult(), threadId), await w.mint(adult(), threadId)];
    const a = await w.connect(t[0]!, { threadId });
    const b = await w.connect(t[1]!, { threadId });
    assert.ok(a.ok && b.ok);
    const c = await w.connect(t[2]!, { threadId });
    assert.ok(!c.ok && c.status === 429);
    const t2 = await newThread(w.chat, await studentToken(adult("stu-2")), "stu-2");
    const o = await w.connect(await w.mint(adult("stu-2"), t2, "stu-2"), { studentId: "stu-2", threadId: t2 });
    assert.ok(o.ok);
    if (a.ok) a.client.abort();
    await until(() => w.voice.stats().sockets === 2, "slot freed");
    const retry = await w.connect(t[2]!, { threadId });
    assert.ok(retry.ok, "token unspent");
  });
});

test("PA13c C11: socket cap holds (maxSockets 2): third connection is 503 and opens nothing", async () => {
  await withWorld(
    async (w, threadId) => {
      const t2 = await newThread(w.chat, await studentToken(adult("stu-2")), "stu-2");
      const a = await w.connect(await w.mint(adult(), threadId), { threadId });
      const b = await w.connect(await w.mint(adult("stu-2"), t2, "stu-2"), { studentId: "stu-2", threadId: t2 });
      assert.ok(a.ok && b.ok);
      const t3 = await newThread(w.chat, await studentToken(adult("stu-3")), "stu-3");
      const c = await w.connect(await w.mint(adult("stu-3"), t3, "stu-3"), { studentId: "stu-3", threadId: t3 });
      assert.ok(!c.ok && c.status === 503);
      assert.equal(w.voice.stats().sockets, 2);
    },
    { deps: { maxSockets: 2 } },
  );
});

test("PA13d C10: a never-resolving live.connect is closed by the 15 s start timer (1008); slot, socket and lock are freed and the student can retry", async () => {
  let n = 0;
  const inner = new MockLiveProvider();
  const live = {
    kind: "mock",
    connect: async (cfg: Parameters<MockLiveProvider["connect"]>[0]) => {
      if (++n === 1) return new Promise<never>(() => undefined);
      return inner.connect(cfg);
    },
  } as unknown as LiveProvider;
  await withWorld(
    async (w, threadId) => {
      const r = await w.connect(await w.mint(adult(), threadId), { threadId });
      assert.ok(r.ok);
      if (!r.ok) return;
      r.client.send({ type: "start", threadId });
      await until(() => n === 1, "connect hanging");
      w.timers.advance(14_999);
      await sleep(40);
      assert.equal(r.client.closed, false);
      w.timers.advance(1);
      await until(() => r.client.closed, "closed");
      assert.equal(r.client.closeCode, 1008);
      await w.voice.settled();
      zero(w);
      const r2 = await w.connect(await w.mint(adult(), threadId), { threadId });
      assert.ok(r2.ok);
      if (!r2.ok) return;
      r2.client.send({ type: "start", threadId });
      await until(() => inner.backends.length === 1, "retry reached the provider");
    },
    { live },
  );
});

// ---------------------------------------------------------------------------------------------- C13 retained logs
test("PA14 C13: an expired resume log is pruned by the timer with nobody asking, and a late reconnect replays nothing", async () => {
  await withWorld(async (w, threadId) => {
    const a = await w.open(adult(), threadId);
    speak(w, 0, "hello there from the first connection");
    await until(() => a.client.of("transcript.final").length === 1, "event");
    const lastId = a.client.events[a.client.events.length - 1].eventId as string;
    a.client.send({ type: "end" });
    await until(() => a.client.closed, "closed");
    await w.voice.settled();
    assert.equal(w.voice.stats().retainedLogs, 1);
    w.clock.ms += VOICE_RESUME_WINDOW_MS + 1_500;
    w.pruneTimers.advance(VOICE_RESUME_WINDOW_MS + 2_000);
    assert.equal(w.voice.stats().retainedLogs, 0);
    const b = await w.open(adult(), threadId, { lastEventId: lastId });
    await sleep(60);
    assert.equal(b.client.of("transcript.final").length, 0, "nothing replayed");
  });
});

// ---------------------------------------------------------------------------------------------- C2 hostile tokens
function b64(o: unknown) {
  return Buffer.from(JSON.stringify(o)).toString("base64url");
}
test("PA15 C2: tampered signature, tampered payload (other student), expired, replayed, other-thread, student-JWT-as-ws-token, alg none -> all refused 401 before any provider session; no token in logs", async () => {
  await withWorld(async (w, threadId) => {
    const thread2 = await newThread(w.chat, await studentToken(adult()));
    const good = await w.mint(adult(), threadId);
    const parts = good.split(".");
    const sigFlip = `${parts[0]}.${parts[1]}.${parts[2]!.slice(0, 10)}${parts[2]![10] === "A" ? "B" : "A"}${parts[2]!.slice(11)}`;
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"));
    const forged = `${parts[0]}.${b64({ ...payload, studentId: "stu-2" })}.${parts[2]}`;
    const noneTok = `${b64({ alg: "none", typ: "JWT" })}.${parts[1]}.`;
    const r1 = await w.connect(sigFlip, { threadId });
    assert.ok(!r1.ok && r1.status === 401, "tampered signature");
    const r2 = await w.connect(forged, { studentId: "stu-2", threadId });
    assert.ok(!r2.ok && r2.status === 401, "tampered payload");
    const r3 = await w.connect(noneTok, { threadId });
    assert.ok(!r3.ok && r3.status === 401, "alg none");
    const r4 = await w.connect(await studentToken(adult()), { threadId });
    assert.ok(!r4.ok && r4.status === 401, "student JWT as ws token");
    const r5 = await w.connect(good, { threadId: thread2 });
    assert.ok(!r5.ok && r5.status === 401, "token for another thread");
    const r6 = await w.connect(good, { studentId: "stu-2", threadId });
    assert.ok(!r6.ok && r6.status === 401, "token for another student");
    const exp = await w.mint(adult(), threadId);
    w.clock.ms += 61_000;
    const r7 = await w.connect(exp, { threadId });
    assert.ok(!r7.ok && r7.status === 401, "expired");
    w.clock.ms -= 61_000;
    const ok1 = await w.connect(good, { threadId });
    assert.ok(ok1.ok, "the genuine token still works after all the refusals (not burned)");
    if (ok1.ok) ok1.client.abort();
    await until(() => w.voice.stats().sockets === 0, "closed");
    const r8 = await w.connect(good, { threadId });
    assert.ok(!r8.ok && r8.status === 401, "replay");
    assert.equal(w.provider.backends.length, 0);
    const logs = JSON.stringify(w.logs);
    assert.ok(!logs.includes(parts[2]!) && !logs.includes(parts[1]!), "no token material in logs");
  });
});

// ---------------------------------------------------------------------------------------------- C3/C4 frames, silence, mute
test("PA16 C3: oversize frame -> 1009; 11 malformed messages -> 1008; binary before start does not close", async () => {
  await withWorld(async (w, threadId) => {
    const a = await w.connect(await w.mint(adult(), threadId), { threadId });
    assert.ok(a.ok);
    if (!a.ok) return;
    a.client.sendAudio(10);
    await until(() => a.client.of("error").some((e) => e.code === "not_started"), "not_started warning");
    assert.equal(a.client.closed, false);
    for (let i = 0; i < 11; i++) a.client.sendRaw("{not json");
    await until(() => a.client.closed, "closed after >10 bad messages");
    assert.equal(a.client.closeCode, 1008);
    const b = await w.connect(await w.mint(adult(), threadId), { threadId });
    assert.ok(b.ok);
    if (!b.ok) return;
    b.client.ws.send(Buffer.alloc(200 * 1024, 1), { binary: true });
    await until(() => b.client.closed, "closed on oversize");
    assert.equal(b.client.closeCode, 1009);
    await w.voice.settled();
    zero(w);
  });
});

test("PA17 C4: 60 s of silence closes the socket (raw audio frames do not reset the clock); default config", async () => {
  const w = await voiceWorld();
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    const { client } = await w.open(adult(), threadId);
    w.timers.advance(59_000);
    client.sendAudio(640);
    await sleep(40);
    assert.equal(client.closed, false);
    w.timers.advance(1_000);
    await until(() => client.closed, "closed by silence");
    assert.ok(client.of("error").some((e) => e.code === "silence_timeout"));
    await w.voice.settled();
    zero(w);
  } finally {
    await w.cleanup();
  }
});

test("PA18 D-096: after a crisis only the fixed helpline audio reaches the client; later model audio is dropped", async () => {
  await withWorld(async (w, threadId) => {
    const { client } = await w.open(adult(), threadId);
    speak(w, 0, CRISIS_PHRASE);
    await until(() => client.of("flag").some((f) => f.reason === "crisis_detected"), "crisis flag");
    w.provider.backends[0]!.emitOutputAudio(new Uint8Array(100).fill(9));
    w.provider.backends[0]!.emitOutputAudio(new Uint8Array(100).fill(9));
    await sleep(80);
    assert.ok(client.frames.length >= 1);
    for (const f of client.frames) assert.deepEqual([...f], [...CRISIS_AUDIO], "only the fixed crisis audio");
  });
});

// ---------------------------------------------------------------------------------------------- C6/C7
test("PA19 C6/C7: adult voice turns are in the export and erased; an unconsented minor stores no words; minutes are recorded on abort", async () => {
  await withWorld(async (w, threadId) => {
    const a = await w.open(adult(), threadId);
    speak(w, 0, "zebra quartz words one");
    w.provider.backends[0]!.emitOutputTranscript("zebra quartz answer");
    w.provider.backends[0]!.emitTurnComplete();
    await until(() => a.client.of("state").length === 1, "turn");
    w.clock.ms += 3 * MIN;
    a.client.abort();
    await until(() => w.voice.stats().sockets === 0, "closed");
    await w.voice.settled();
    assert.equal(await usedMs(w), 3 * MIN, "minutes recorded on an abrupt close");
    const db = w.deps.dbForTenant("tenant-a");
    const exported = await exportStudent(db, "stu-1");
    assert.deepEqual(exported.chatTurns.filter((t: any) => t.channel === "voice").map((t: any) => t.role), ["user", "assistant"]);
    const { requestId } = await requestErasure(db, { studentId: "stu-1", requestedBy: "counsellor-7", reason: "student_request" });
    await confirmTwiceAndApprove(db, { requestId, confirmedBy: "admin-2" });
    assert.equal((await executeErasure(db, requestId)).status, "completed");
    assert.ok(!everythingStored(w.fakeDb).includes("zebra quartz"));
  });
  const w2 = await voiceWorld({ deps: { silenceTimeoutMs: 10 * 3600_000 } });
  try {
    const th = await newThread(w2.chat, await studentToken(minorNoConsent()));
    const m = await w2.open(minorNoConsent(), th);
    speak(w2, 0, "mango whistle words two");
    w2.provider.backends[0]!.emitOutputTranscript("mango whistle answer");
    w2.provider.backends[0]!.emitTurnComplete();
    await until(() => m.client.of("state").length === 1, "turn");
    m.client.send({ type: "end" });
    await until(() => m.client.closed, "closed");
    await w2.voice.settled();
    assert.equal(w2.fakeDb.collection<any>(COLLECTION_NAMES.chat_turns).all().filter((r: any) => r.channel === "voice" && r.text).length, 0);
    assert.ok(!everythingStored(w2.fakeDb).includes("mango whistle"));
  } finally {
    await w2.cleanup();
  }
});

// ---- PA20/PA21: C18 hostile variants (an earlier student turn that was never answered sits at seq N-1 of the fixed reply) ----
test("PA20 C18: earlier student turn NEVER answered, then a crisis utterance with no words of its own -> the marker, never the earlier words", async () => {
  const escalations: any[] = [];
  await withWorld(
    async (w, threadId) => {
      await w.open(adult(), threadId);
      speak(w, 0, "my earlier unanswered words about studying in Germany");
      speak(w, 0, "   ");
      await until(() => escalations.length === 1, "escalated");
      const text = escalations[0].turns[0].text as string;
      assert.ok(!text.includes("Germany") && !text.includes("earlier"), `escalation carried an earlier turn's words: ${text}`);
    },
    {
      deps: {
        crisis: { message: { text: "Please call the helpline.", audio: CRISIS_AUDIO }, detect: (text: string) => (text.trim() === "" ? { crisis: true, level: "crisis" } : { crisis: false }) },
        escalateForTenant: () => async (input: any) => void escalations.push(input),
      } as Partial<VoiceApiDeps>,
    },
  );
});
