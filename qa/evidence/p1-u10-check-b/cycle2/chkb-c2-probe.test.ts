/**
 * Checker B (cycle 2) independent hostile probes for p1-u10-voice-ws. Scratch only, never committed. SYNTHETIC data.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { LiveSession } from "@vc/providers";
import { getStudentUsage, recordStudentUsage, usageMonth } from "@vc/db";
import { VOICE_CRISIS_NO_WORDS_TEXT, type VoiceApiDeps } from "../src/voice.js";
import { CRISIS_AUDIO, CRISIS_PHRASE, CRISIS_TEXT_FIXED, adult, newThread, studentToken, until, voiceWorld, type VoiceWorld, type VoiceWorldOptions } from "./voice-fixtures.js";

const MIN = 60_000;
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
const used = (w: VoiceWorld) => getStudentUsage(w.deps.dbForTenant("tenant-a"), { studentId: "stu-1", month: usageMonth(new Date(w.clock.ms)) }).then((u) => u.voiceMs);

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
  return { arm: () => (armed = true) as unknown as void, release: () => release(), restore: () => void (LiveSession.prototype.drain = orig) };
}

const whitespaceDetector = {
  message: { text: CRISIS_TEXT_FIXED, audio: CRISIS_AUDIO },
  detect: (text: string) => (text.trim() === "" ? { crisis: true, level: "crisis" } : { crisis: false }),
};

test("P1 (C18): an UNANSWERED earlier turn then an empty-utterance crisis: marker, never the earlier turn's words", async () => {
  const escalations: any[] = [];
  await withWorld(
    async (w, threadId) => {
      await w.open(adult(), threadId);
      speak(w, 0, "an earlier unanswered question about Germany");
      await until(() => w.fakeDb.collection<any>("chat_turns").all().length >= 1, "earlier turn stored");
      speak(w, 0, "   ");
      await until(() => escalations.length === 1, "escalated");
      const text = escalations[0].turns[0].text as string;
      console.log("P1 escalated text:", JSON.stringify(text));
      assert.equal(text, VOICE_CRISIS_NO_WORDS_TEXT);
    },
    { deps: { crisis: whitespaceDetector, escalateForTenant: () => async (input: any) => void escalations.push(input) } as Partial<VoiceApiDeps> },
  );
});

test("P1b (C18): an answered earlier turn then an empty crisis: marker", async () => {
  const escalations: any[] = [];
  await withWorld(
    async (w, threadId) => {
      await w.open(adult(), threadId);
      speak(w, 0, "an earlier question about Germany");
      w.provider.backends[0]!.emitOutputTranscript("An answer about Germany.");
      w.provider.backends[0]!.emitTurnComplete();
      await until(() => w.fakeDb.collection<any>("chat_turns").all().length >= 2, "earlier turns stored");
      speak(w, 0, "   ");
      await until(() => escalations.length === 1, "escalated");
      assert.equal(escalations[0].turns[0].text, VOICE_CRISIS_NO_WORDS_TEXT);
    },
    { deps: { crisis: whitespaceDetector, escalateForTenant: () => async (input: any) => void escalations.push(input) } as Partial<VoiceApiDeps> },
  );
});

test("P2 (C15): usage 50 min, A runs 5 min, B supersedes A: B is admitted with the re-read remaining 5 min as its cap", async () => {
  await withWorld(async (w, threadId) => {
    await recordStudentUsage(w.deps.dbForTenant("tenant-a"), { studentId: "stu-1", voiceMs: 50 * MIN }, { now: new Date(w.clock.ms) });
    const a = await w.open(adult(), threadId);
    w.clock.ms += 5 * MIN;
    const b = await w.open(adult(), threadId);
    assert.ok(a.client.of("error").some((e) => e.code === "superseded"));
    assert.equal(b.client.closed, false, "B admitted");
    assert.equal(w.provider.backends.length, 2);
    w.timers.advance(5 * MIN + 1000);
    await until(() => b.client.closed, "B ended at its 5-minute cap");
    assert.ok(b.client.of("error").some((e) => e.code === "session_time_limit"), "B hit the re-read cap, not the 20-minute one");
    await w.voice.settled();
    assert.equal(await used(w), 60 * MIN);
    const s = w.voice.stats();
    assert.deepEqual([s.sockets, s.activeSessions, s.liveSessions], [0, 0, 0]);
  });
});

test("P3: A active with a gated drain; B and C start, C aborts, D starts; exactly one live provider session (D, the newest), no leak after all close", async () => {
  const w = await voiceWorld({ deps: { silenceTimeoutMs: 10 * 3600_000 } });
  const dg = drainGate();
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    const a = await w.open(adult(), threadId);
    dg.arm();
    const mk = async () => {
      const r = await w.connect(await w.mint(adult(), threadId), { threadId });
      assert.ok(r.ok);
      return (r as any).client as import("./voice-fixtures.js").VoiceClient;
    };
    const B = await mk();
    const C = await mk();
    B.send({ type: "start", threadId });
    await until(() => a.client.of("error").some((e) => e.code === "superseded"), "B waits on A");
    C.send({ type: "start", threadId });
    await until(() => a.client.of("error").filter((e) => e.code === "superseded").length >= 2, "C waits on A");
    C.abort();
    await until(() => w.voice.stats().sockets === 2, "C finalized");
    const D = await mk();
    D.send({ type: "start", threadId });
    await new Promise((r) => setTimeout(r, 100));
    dg.release();
    await until(() => B.closed || w.provider.backends.length >= 2, "B stepped aside or someone went live");
    await w.voice.settled();
    await new Promise((r) => setTimeout(r, 200));
    const s = w.voice.stats();
    console.log("P3 stats", JSON.stringify(s), "backends", w.provider.backends.length, "B closed", B.closed, "D closed", D.closed, "B errs", JSON.stringify(B.of("error").map((e) => e.code)));
    assert.equal(s.liveSessions, 1);
    assert.equal(s.activeSessions, 1);
    assert.equal(B.closed, true, "B (older) stepped aside");
    assert.equal(D.closed, false, "D (newest) is live");
    assert.equal(w.provider.backends.length, 2, "A and D only");
    D.send({ type: "end" });
    await until(() => D.closed, "D ended");
    await w.voice.settled();
    const s2 = w.voice.stats();
    assert.deepEqual([s2.sockets, s2.activeSessions, s2.liveSessions, s2.timers], [0, 0, 0, 0]);
  } finally {
    dg.restore();
    dg.release();
    await w.cleanup();
  }
});

test("P4a (C12/C14): the flag write fails twice for an adult: still escalated once, flag failure logged text-free", async () => {
  const escalations: any[] = [];
  await withWorld(
    async (w, threadId) => {
      await w.open(adult(), threadId);
      const flags = w.fakeDb.collection<any>("student_flags");
      flags.updateOne = (async () => {
        throw new Error("flag store down secret-xyz");
      }) as typeof flags.updateOne;
      speak(w, 0, `${CRISIS_PHRASE}, my email is nobody@example.com`);
      await until(() => escalations.length === 1, "escalated although the flag failed");
      await w.voice.settled();
      assert.ok(w.logs.some((l) => l.event === "voice_crisis_flag_failed"));
      assert.ok(!JSON.stringify(w.logs).includes("secret-xyz") && !JSON.stringify(w.logs).includes("kill"));
      const text = escalations[0].turns[0].text as string;
      console.log("P4a escalated text:", JSON.stringify(text));
      assert.ok(!text.includes("nobody@example.com"), "redacted");
      assert.match(text, /kill myself/);
    },
    { deps: { escalateForTenant: () => async (input: any) => void escalations.push(input) } as Partial<VoiceApiDeps> },
  );
});

test("P4b (C14): a port that returns no escalate function: logged unavailable, no throw, session lives", async () => {
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => w.logs.some((l) => l.event === "voice_crisis_escalate_unavailable"), "unavailable logged");
      assert.equal(client.closed, false);
    },
    { deps: { escalateForTenant: () => undefined } as unknown as Partial<VoiceApiDeps> },
  );
});

test("P4c (C14): the socket drops while the ESCALATION (not the flag) is in flight: still exactly one escalation", async () => {
  const escalations: any[] = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let started = false;
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => started, "escalation in flight");
      client.abort();
      await until(() => w.provider.backends[0]!.calls.some((x) => x.type === "close"), "finalize began");
      release();
      await until(() => escalations.length >= 1, "escalated");
      await w.voice.settled();
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(escalations.length, 1);
      assert.equal(w.fakeDb.collection<any>("student_flags").all().length, 1);
      assert.equal(w.voice.stats().sockets, 0);
    },
    {
      deps: {
        escalateForTenant: () => async (input: any) => {
          started = true;
          await gate;
          escalations.push(input);
        },
      } as Partial<VoiceApiDeps>,
    },
  );
});

test("P5 (C19): a never-settling write: drain timeout releases the slot, minutes are still recorded, and the background write is not cancelled", async () => {
  const escalations: any[] = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      w.clock.ms += 3 * MIN;
      speak(w, 0, CRISIS_PHRASE);
      await until(() => w.fakeDb.collection<any>("student_flags").all().length === 1, "flag stored; escalation hangs");
      client.send({ type: "end" });
      await until(() => client.closed, "closed");
      await w.voice.settled();
      assert.ok(w.logs.some((l) => l.event === "voice_drain_timeout"));
      assert.equal(await used(w), 3 * MIN, "minutes recorded after the drain timeout");
      const s = w.voice.stats();
      assert.deepEqual([s.sockets, s.activeSessions, s.liveSessions, s.timers], [0, 0, 0, 0]);
      release();
      await until(() => escalations.length === 1, "the background escalation still completes");
    },
    {
      deps: {
        drainTimeoutMs: 100,
        escalateForTenant: () => async (input: any) => {
          await gate;
          escalations.push(input);
        },
      } as Partial<VoiceApiDeps>,
    },
  );
});

test("P1c (C18, reachable via the D-087 detector-error path): a throwing detector on a whitespace chunk after an unanswered earlier turn", async () => {
  const escalations: any[] = [];
  const throwing = {
    message: { text: CRISIS_TEXT_FIXED, audio: CRISIS_AUDIO },
    detect: (text: string): { crisis: boolean } => {
      if (text.trim() === "") throw new Error("detector blew up");
      return { crisis: false };
    },
  };
  await withWorld(
    async (w, threadId) => {
      await w.open(adult(), threadId);
      speak(w, 0, "what are the tuition fees in Germany");
      await until(() => w.fakeDb.collection<any>("chat_turns").all().length >= 1, "earlier turn stored");
      speak(w, 0, "   ");
      await until(() => escalations.length === 1, "escalated");
      const text = escalations[0].turns[0].text as string;
      console.log("P1c escalated text:", JSON.stringify(text));
      assert.equal(text, VOICE_CRISIS_NO_WORDS_TEXT);
    },
    { deps: { crisis: throwing, escalateForTenant: () => async (input: any) => void escalations.push(input) } as unknown as Partial<VoiceApiDeps> },
  );
});
