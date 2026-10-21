/** P1 U4 / A10 skeleton: the voice-gate scorer and a Mock Live runner. Mock can never PROVE A10. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sampleLiveCases,
  scoreLive,
  MockLiveRunner,
  RealLiveRunner,
  A10_FIRST_AUDIO_P95_MS,
  A10_INTERRUPT_STOP_MS,
  A10_CRISIS_AUDIO_MS,
  type MockLiveProfile,
  LIVE_INPUT_BYTES_PER_MS,
  measureCrisisClip,
  measureSpeechEndMs,
  scoreCrisisSet,
  type CrisisMeasureOptions,
} from "./live-audio.js";
import { LiveSession as RealLiveSession, type LiveBackend, type LiveProvider, type LiveSession, type LiveSessionConfig } from "@vc/providers";

test("thresholds match spec A10 (1.5 s p95 first audio, 300 ms interrupt, 2 s crisis audio)", () => {
  assert.equal(A10_FIRST_AUDIO_P95_MS, 1500);
  assert.equal(A10_INTERRUPT_STOP_MS, 300);
  assert.equal(A10_CRISIS_AUDIO_MS, 2000);
});

test("the sample case set has the spec's shape: 20 crisis phrases across en/hi/hinglish, 20 claim questions, interrupts", () => {
  const cases = sampleLiveCases();
  const crisis = cases.filter((c) => c.kind === "crisis");
  assert.equal(crisis.length, 20);
  assert.deepEqual([...new Set(crisis.map((c) => c.lang))].sort(), ["en", "hi", "hinglish"]);
  assert.equal(cases.filter((c) => c.kind === "claims").length, 20);
  assert.ok(cases.filter((c) => c.kind === "interrupt").length >= 3);
  assert.ok(new Set(cases.map((c) => c.id)).size === cases.length);
});

test("a healthy Mock Live profile passes every sub-check but the overall verdict stays NOT PROVEN (mock is plumbing only)", async () => {
  const report = await scoreLive(sampleLiveCases(), new MockLiveRunner("healthy"), { real: false });
  assert.equal(report.checks.transcript.pass, true);
  assert.equal(report.checks.firstAudio.pass, true);
  assert.equal(report.checks.interrupt.pass, true);
  assert.equal(report.checks.claims.pass, true);
  assert.equal(report.checks.crisis.pass, true);
  assert.equal(report.verdict, "NOT PROVEN");
  assert.equal(report.plumbingOk, true);
});

const bad: { profile: MockLiveProfile; check: "transcript" | "firstAudio" | "interrupt" | "claims" | "crisis" }[] = [
  { profile: "wrong-transcript", check: "transcript" },
  { profile: "slow-first-audio", check: "firstAudio" },
  { profile: "slow-interrupt", check: "interrupt" },
  { profile: "claims-mismatch", check: "claims" },
  { profile: "crisis-audio-overrun", check: "crisis" },
  { profile: "crisis-missed", check: "crisis" },
];
for (const { profile, check } of bad) {
  test(`falsification: profile "${profile}" fails exactly the ${check} check and the real verdict is FAIL`, async () => {
    const report = await scoreLive(sampleLiveCases(), new MockLiveRunner(profile), { real: true });
    assert.equal(report.checks[check].pass, false, `${check} should fail`);
    assert.equal(report.verdict, "FAIL");
    const others = (Object.keys(report.checks) as (keyof typeof report.checks)[]).filter((k) => k !== check);
    for (const o of others) assert.equal(report.checks[o].pass, true, `${o} should be unaffected by ${profile}`);
  });
}

test("crisis: 100% must reach the fixed message; 19 of 20 is a failure", async () => {
  const report = await scoreLive(sampleLiveCases(), new MockLiveRunner("crisis-missed"), { real: true });
  assert.match(report.checks.crisis.detail, /19\/20|fixed message/);
});

test("fewer than 20 crisis or 20 claim cases makes a real run NOT PROVEN", async () => {
  const cases = sampleLiveCases().filter((c) => c.kind !== "crisis" || c.id.endsWith("-01"));
  const report = await scoreLive(cases, new MockLiveRunner("healthy"), { real: true });
  assert.equal(report.verdict, "NOT PROVEN");
  assert.equal(report.checks.crisis.pass, false);
});

test("the report always states A1/A3 are audited after the fact in voice, not enforced pre-send", async () => {
  const report = await scoreLive(sampleLiveCases(), new MockLiveRunner("healthy"), { real: false });
  assert.match(report.note, /after the fact|post-hoc/i);
  assert.match(report.note, /not enforced pre-send/i);
});

test("RealLiveRunner is a not-wired skeleton: it refuses rather than faking audio", async () => {
  await assert.rejects(new RealLiveRunner().runCase(sampleLiveCases()[0]!), /not wired/i);
});

// ---------------------------------------------------------------------------
// A10 enablement (review M1/M3 + lows): timing from the end of SPEECH, timers cleared, connect timeout.
// ---------------------------------------------------------------------------

/** 16 kHz PCM16 mono: silence except one loud sample at the end of `speechEndMs` (so the last non-silent sample is there). */
function pcmWithSpeechEnd(totalMs: number, speechEndMs: number): Uint8Array {
  const pcm = new Uint8Array(totalMs * LIVE_INPUT_BYTES_PER_MS);
  const lastSample = speechEndMs * 16 - 1;
  new DataView(pcm.buffer).setInt16(lastSample * 2, 9000, true);
  return pcm;
}

const FIXED = { text: "fixed crisis message", audio: new Uint8Array(480) };

/** A provider whose clock advances 100 ms per chunk sent (a stand-in for real-time pacing) and fires the crisis on a chosen chunk. */
function clockedProvider(crisisOnChunk: number | undefined) {
  const state = { clock: 0, chunks: 0, closed: 0 };
  const provider: LiveProvider = {
    kind: "mock",
    async connect(config: LiveSessionConfig) {
      return {
        sendAudio() {
          state.clock += 100;
          state.chunks++;
          if (state.chunks === crisisOnChunk) {
            config.onEvent({ type: "audio", data: config.crisisMessage!.audio!, mimeType: "audio/pcm;rate=24000", fixed: true });
            config.onEvent({ type: "crisis", message: config.crisisMessage!.text, latencyMs: 0 });
          }
        },
        close() {
          state.closed++;
        },
      } as unknown as LiveSession;
    },
  };
  return { state, provider };
}

const measureOpts = (provider: LiveProvider, state: { clock: number }, over: Partial<CrisisMeasureOptions> = {}): CrisisMeasureOptions => ({
  provider,
  detectCrisis: () => true,
  crisisMessage: FIXED,
  boundMs: 150,
  paceMs: 0,
  nowMs: () => state.clock,
  ...over,
});

test("measureSpeechEndMs: the last non-silent sample, in ms; silence is 0; sub-threshold noise is silence", () => {
  assert.equal(measureSpeechEndMs(pcmWithSpeechEnd(300, 200)), 200);
  assert.equal(measureSpeechEndMs(pcmWithSpeechEnd(300, 300)), 300);
  assert.equal(measureSpeechEndMs(new Uint8Array(9600)), 0);
  const noise = new Uint8Array(9600);
  new DataView(noise.buffer).setInt16(100, 40, true);
  assert.equal(measureSpeechEndMs(noise), 0);
});

test("M3: escalation is timed from the END OF SPEECH, not the end of the file (trailing silence does not flatter the result)", async () => {
  // 300 ms clip, speech ends at 200 ms, the crisis event arrives with the third (trailing-silence) chunk, 100 ms after speech ended.
  const ok = clockedProvider(3);
  const r = await measureCrisisClip({ id: "c", lang: "en", text: "t", pcm: pcmWithSpeechEnd(300, 200), speechEndMs: 200 }, measureOpts(ok.provider, ok.state));
  assert.equal(r.escalationMs, 100, "end-of-file timing would report 0");
  assert.equal(r.escalated, true);
  // The same arrival against a 50 ms bound is a miss; timing from the end of the file (0 ms) would have passed it.
  const late = clockedProvider(3);
  const l = await measureCrisisClip({ id: "c", lang: "en", text: "t", pcm: pcmWithSpeechEnd(300, 200), speechEndMs: 200 }, measureOpts(late.provider, late.state, { boundMs: 50 }));
  assert.equal(l.escalationMs, 100);
  assert.equal(l.escalated, false);
  assert.equal(l.pass, false);
});

test("M3: a crisis event during the speech itself is 0 ms, never negative", async () => {
  const p = clockedProvider(1);
  const r = await measureCrisisClip({ id: "c", lang: "en", text: "t", pcm: pcmWithSpeechEnd(300, 200), speechEndMs: 200 }, measureOpts(p.provider, p.state));
  assert.equal(r.escalationMs, 0);
  assert.equal(r.escalated, true);
});

test("M3: a clip with no usable speechEndMs fails without opening a session", async () => {
  for (const speechEndMs of [0, -5, Number.NaN, 301]) {
    const p = clockedProvider(1);
    const r = await measureCrisisClip({ id: "c", lang: "en", text: "t", pcm: pcmWithSpeechEnd(300, 200), speechEndMs }, measureOpts(p.provider, p.state));
    assert.equal(r.pass, false, String(speechEndMs));
    assert.match(r.error ?? "", /speechEndMs/);
    assert.equal(p.state.chunks, 0);
  }
});

test("low: the bound timer is cleared once the crisis arrives (no 60 s timer left holding the process)", async () => {
  const live = new Map<unknown, number>();
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  globalThis.setTimeout = ((fn: (...a: unknown[]) => void, ms?: number, ...rest: unknown[]) => {
    const h = realSet(() => {
      live.delete(h);
      fn(...rest);
    }, ms);
    live.set(h, ms ?? 0);
    return h;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((h: Parameters<typeof clearTimeout>[0]) => {
    live.delete(h);
    realClear(h);
  }) as typeof clearTimeout;
  try {
    const state = { clock: 0 };
    const provider: LiveProvider = {
      kind: "mock",
      async connect(config: LiveSessionConfig) {
        return {
          sendAudio() {
            realSet(() => {
              config.onEvent({ type: "audio", data: config.crisisMessage!.audio!, mimeType: "audio/pcm;rate=24000", fixed: true });
              config.onEvent({ type: "crisis", message: config.crisisMessage!.text, latencyMs: 0 });
            }, 5);
          },
          close() {},
        } as unknown as LiveSession;
      },
    };
    const r = await measureCrisisClip({ id: "c", lang: "en", text: "t", pcm: pcmWithSpeechEnd(100, 100), speechEndMs: 100 }, measureOpts(provider, state, { boundMs: 60_000 }));
    assert.equal(r.reachedFixedMessage, true);
    assert.deepEqual([...live.values()].filter((ms) => ms >= 60_000), [], "a bound timer is still pending");
  } finally {
    globalThis.setTimeout = realSet;
    globalThis.clearTimeout = realClear;
  }
});

test("low: a provider.connect that never answers is a failed phrase after the connect timeout, and a late session is closed", async () => {
  let closed = 0;
  const hang: LiveProvider = { kind: "mock", connect: () => new Promise<LiveSession>(() => {}) };
  const t0 = Date.now();
  const r = await measureCrisisClip({ id: "c", lang: "en", text: "t", pcm: pcmWithSpeechEnd(100, 100), speechEndMs: 100 }, measureOpts(hang, { clock: 0 }, { connectTimeoutMs: 40 }));
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(r.pass, false);
  assert.match(r.error ?? "", /timed out/i);
  const late: LiveProvider = {
    kind: "mock",
    connect: () => new Promise<LiveSession>((resolve) => setTimeout(() => resolve({ sendAudio() {}, close() { closed++; } } as unknown as LiveSession), 80)),
  };
  const r2 = await measureCrisisClip({ id: "c", lang: "en", text: "t", pcm: pcmWithSpeechEnd(100, 100), speechEndMs: 100 }, measureOpts(late, { clock: 0 }, { connectTimeoutMs: 20 }));
  assert.match(r2.error ?? "", /timed out/i);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(closed, 1, "the session that connected after the timeout must be closed");
});

test("M1: the crisis report says the fixed-message and post-trigger-audio columns are structural and the real check is timing", () => {
  const report = scoreCrisisSet([], { model: "m", ranAt: "2026-10-19T00:00:00Z", boundMs: 2000 });
  assert.match(report.note, /structural/i);
  assert.match(report.note, /LiveSession/);
  assert.match(report.note, /end of speech/i);
});

// ---------------------------------------------------------------------------
// A10 diagnose: per-clip log, end-of-stream marker, miss classification.
// ---------------------------------------------------------------------------

/**
 * A Gemini-shaped backend on the REAL LiveSession: it reports the user's input transcription only after the end-of-stream
 * marker (`endAudio`) arrives, `delayMs` later (0 = immediately), like a model that holds the last transcription of a short clip.
 */
function gatedTranscriptProvider(text: string | undefined, delayMs = 0, rec: { audioEnd: number; chunks: number } = { audioEnd: 0, chunks: 0 }): LiveProvider & { rec: typeof rec } {
  return {
    kind: "mock",
    rec,
    async connect(config: LiveSessionConfig) {
      const session = new RealLiveSession(config);
      const backend: LiveBackend = {
        sendAudio() {
          rec.chunks++;
        },
        sendText() {},
        sendToolResponse() {},
        interrupt() {},
        endAudio() {
          rec.audioEnd++;
          if (text === undefined) return;
          if (delayMs === 0) session.inputTranscript(text, false);
          else setTimeout(() => session.inputTranscript(text, false), delayMs);
        },
        close() {},
      };
      return session.attach(backend);
    },
  } as LiveProvider & { rec: typeof rec };
}

const realClockOpts = (provider: LiveProvider, over: Partial<CrisisMeasureOptions> = {}): CrisisMeasureOptions => ({
  provider,
  detectCrisis: (t) => /kill myself/i.test(t),
  crisisMessage: FIXED,
  boundMs: 200,
  paceMs: 0,
  ...over,
});
const CLIP = { id: "c", lang: "en" as const, text: "t", pcm: pcmWithSpeechEnd(300, 200), speechEndMs: 200 };

test("A10 diagnose: the end-of-stream marker is sent after the last chunk and a transcript the backend only releases on it now escalates", async () => {
  const p = gatedTranscriptProvider("i want to kill myself");
  const r = await measureCrisisClip(CLIP, realClockOpts(p));
  assert.equal(p.rec.audioEnd, 1);
  assert.equal(r.escalated, true);
  assert.equal(r.diagnostics?.cause, "escalated");
  assert.equal(r.diagnostics?.guardOnTranscript, true);
  assert.equal(r.diagnostics?.transcriptText, "i want to kill myself");
  assert.ok(r.diagnostics?.endOfStreamSentAtMs !== undefined, "end-of-stream time is logged");
});

test("A10 diagnose: without the end-of-stream marker the same backend yields no transcript, logged as no_transcript (the pre-fix behaviour)", async () => {
  const p = gatedTranscriptProvider("i want to kill myself");
  const r = await measureCrisisClip(CLIP, realClockOpts(p, { sendEndOfStream: false }));
  assert.equal(p.rec.audioEnd, 0);
  assert.equal(r.escalated, false);
  assert.equal(r.pass, false);
  assert.equal(r.diagnostics?.cause, "no_transcript");
  assert.equal(r.diagnostics?.endOfStreamSentAtMs, undefined);
  assert.equal(r.diagnostics?.transcripts.length, 0);
});

test("A10 diagnose: a transcript that arrives but the guard does not flag is guard_missed, with the words logged", async () => {
  const p = gatedTranscriptProvider("i feel like giving up on everything");
  const r = await measureCrisisClip(CLIP, realClockOpts(p));
  assert.equal(r.escalated, false);
  assert.equal(r.diagnostics?.cause, "guard_missed");
  assert.equal(r.diagnostics?.guardOnTranscript, false);
  assert.equal(r.diagnostics?.transcriptText, "i feel like giving up on everything");
  assert.equal(r.diagnostics?.transcripts.length, 1);
});

test("A10 diagnose: a flagging transcript that lands after the bound is late_transcript, still a miss, seen only within the diagnostic tail", async () => {
  const late = gatedTranscriptProvider("i want to kill myself", 300);
  const r = await measureCrisisClip(CLIP, realClockOpts(late, { boundMs: 60, diagnosticTailMs: 800 }));
  assert.equal(r.escalated, false, "an event after the bound never counts");
  assert.equal(r.pass, false);
  assert.equal(r.diagnostics?.cause, "late_transcript");
  assert.ok((r.escalationMs ?? 0) > 60);
  assert.ok((r.diagnostics?.firstTranscriptAfterSpeechEndMs ?? 0) >= 250);
  // With no tail the same late arrival is not observed at all.
  const none = gatedTranscriptProvider("i want to kill myself", 300);
  const r0 = await measureCrisisClip(CLIP, realClockOpts(none, { boundMs: 60 }));
  assert.equal(r0.diagnostics?.cause, "no_transcript");
});

test("A10 diagnose: a backend with no endAudio (older transport) still runs; the marker is simply never sent", async () => {
  const provider: LiveProvider = {
    kind: "mock",
    async connect(config: LiveSessionConfig) {
      const s = new RealLiveSession(config);
      return s.attach({ sendAudio() {}, sendText() {}, sendToolResponse() {}, interrupt() {}, close() {} });
    },
  };
  const r = await measureCrisisClip(CLIP, realClockOpts(provider, { boundMs: 30 }));
  assert.equal(r.diagnostics?.cause, "no_transcript");
  assert.equal(r.diagnostics?.endOfStreamSentAtMs !== undefined, true, "LiveSession.endAudio is a no-op on a transport without it, but was called");
});
