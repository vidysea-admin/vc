/**
 * P1 U9: Live (voice) session seam. Mock-first, offline: no network, no real model (G-REAL closed).
 * Every test name starts with the real scenario that reaches the behaviour.
 *
 * Criteria (manifest ids):
 *   C1 interface    audio PCM16 16k in / 24k out, transcripts both ways, tool calls, interrupt, close
 *   C2 mock         the Mock implementation behaves as specified (every C1/C4/C5/C6 test drives it)
 *   C3 gemini       the Gemini adapter translates the SDK message shapes, compile-only, no network
 *   C4 crisis       input-transcript crisis hook interrupts and plays the fixed message
 *   C5 audit        output-transcript audit (A9b) emits `flag`, clean transcript emits none
 *   C6 sink         final transcripts leave through the callback interface; no apps/api import
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  GeminiLiveProvider,
  LIVE_INPUT_MIME,
  LIVE_INPUT_SAMPLE_RATE_HZ,
  LIVE_OUTPUT_MIME,
  LIVE_OUTPUT_SAMPLE_RATE_HZ,
  LiveAudioFormatError,
  LiveConfigError,
  LiveNotWiredError,
  LiveSessionClosedError,
  MockLiveProvider,
  buildGeminiLiveConfig,
  createSimpleOutputAuditor,
  type GeminiLiveCallbacks,
  type GeminiLiveConnection,
  type GeminiLiveConnector,
  type LiveAuditRecord,
  type LiveCrisisRecord,
  type LiveEvent,
  type LiveFinalTranscript,
  type LiveSessionConfig,
  type LiveToolCall,
} from "../src/index.js";

// --- no-network guard: every test in this file runs with fetch and WebSocket booby-trapped ------
const realFetch = globalThis.fetch;
const realWs = (globalThis as Record<string, unknown>).WebSocket;
let networkTouched = 0;
beforeEach(() => {
  networkTouched = 0;
  globalThis.fetch = (() => {
    networkTouched++;
    throw new Error("network is closed in U9 tests");
  }) as typeof fetch;
  (globalThis as Record<string, unknown>).WebSocket = function () {
    networkTouched++;
    throw new Error("network is closed in U9 tests");
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
  (globalThis as Record<string, unknown>).WebSocket = realWs;
  assert.equal(networkTouched, 0, "a test touched the network");
});

// --- helpers ---------------------------------------------------------------------------------
const pcm = (samples: number, fill = 1): Uint8Array => new Uint8Array(samples * 2).fill(fill);
const CRISIS_RE = /kill myself|end my life|marna chahta|suicide/i;
const FIXED = { text: "I am worried about you. Tele-MANAS 14416 is free, 24x7. Who is a safe adult near you?", audio: pcm(64, 7) };

interface Rig {
  provider: MockLiveProvider;
  session: Awaited<ReturnType<MockLiveProvider["connect"]>>;
  events: LiveEvent[];
  transcripts: LiveFinalTranscript[];
  audits: LiveAuditRecord[];
  crises: LiveCrisisRecord[];
  backend: MockLiveProvider["last"];
}

async function rig(over: Partial<LiveSessionConfig> = {}): Promise<Rig> {
  const events: LiveEvent[] = [];
  const transcripts: LiveFinalTranscript[] = [];
  const audits: LiveAuditRecord[] = [];
  const crises: LiveCrisisRecord[] = [];
  const provider = new MockLiveProvider();
  const session = await provider.connect({
    onEvent: (e) => events.push(e),
    sink: {
      onFinalTranscript: (t) => void transcripts.push(t),
      onAudit: (a) => void audits.push(a),
      onCrisis: (c) => void crises.push(c),
    },
    ...over,
  });
  return { provider, session, events, transcripts, audits, crises, backend: provider.last };
}
const of = <T extends LiveEvent["type"]>(events: LiveEvent[], type: T) =>
  events.filter((e): e is Extract<LiveEvent, { type: T }> => e.type === type);

// =================================================================================================
// C1 interface
// =================================================================================================
test("C1 audio format: a student's 16 kHz PCM16 mic chunk reaches the backend byte for byte; the constants are 16000/24000", async () => {
  const r = await rig();
  const chunk = pcm(160, 3);
  r.session.sendAudio(chunk);
  assert.deepEqual(r.backend.audioIn[0], chunk);
  assert.equal(LIVE_INPUT_SAMPLE_RATE_HZ, 16_000);
  assert.equal(LIVE_OUTPUT_SAMPLE_RATE_HZ, 24_000);
  assert.equal(LIVE_INPUT_MIME, "audio/pcm;rate=16000");
  assert.equal(LIVE_OUTPUT_MIME, "audio/pcm;rate=24000");
});

test("C1 audio format: a browser that sends a half-sample (odd byte length) or an empty frame is refused, nothing reaches the backend", async () => {
  const r = await rig();
  assert.throws(() => r.session.sendAudio(new Uint8Array(3)), LiveAudioFormatError);
  assert.throws(() => r.session.sendAudio(new Uint8Array(0)), LiveAudioFormatError);
  assert.throws(() => r.session.sendAudio("AAAA" as unknown as Uint8Array), LiveAudioFormatError);
  assert.equal(r.backend.audioIn.length, 0);
});

test("C1 audio out: the model speaks and the client receives 24 kHz PCM16 audio events with the 24 kHz mime", async () => {
  const r = await rig();
  const speech = pcm(480, 9);
  r.backend.emitOutputAudio(speech);
  const audio = of(r.events, "audio");
  assert.equal(audio.length, 1);
  assert.equal(audio[0]!.mimeType, "audio/pcm;rate=24000");
  assert.deepEqual(audio[0]!.data, speech);
});

test("C1 transcripts: a student speaks in two chunks and the model answers; both transcripts stream and finish in thread order", async () => {
  const r = await rig();
  r.backend.emitInputTranscript("which countries", false);
  r.backend.emitInputTranscript("are cheapest", false);
  r.backend.emitOutputTranscript("Germany has low");
  r.backend.emitOutputTranscript("public tuition.");
  r.backend.emitTurnComplete();
  await r.session.drain();
  const user = of(r.events, "transcript").filter((t) => t.role === "user");
  assert.deepEqual(user.map((t) => t.text), ["which countries", "are cheapest"]);
  const finals = of(r.events, "transcript").filter((t) => t.final && t.role === "assistant");
  assert.deepEqual(finals.map((t) => t.text), ["Germany has low public tuition."]);
  assert.deepEqual(
    r.transcripts.map((t) => [t.seq, t.role, t.text, t.channel]),
    [
      [1, "user", "which countries are cheapest", "voice"],
      [2, "assistant", "Germany has low public tuition.", "voice"],
    ],
  );
});

test("C1 tool call: the model asks for search_kb mid-answer; the call is surfaced, the handler's result goes back to the model", async () => {
  const seen: LiveToolCall[] = [];
  const r = await rig({
    tools: [{ name: "search_kb", description: "search the knowledge base", parameters: { type: "object" } }],
    toolHandler: (call) => {
      seen.push(call);
      return { hits: [{ id: "n1", text: "Tuition is 0 euros at public universities" }] };
    },
  });
  r.backend.emitToolCall({ id: "c1", name: "search_kb", args: { q: "tuition germany" } });
  await new Promise((res) => setImmediate(res));
  assert.deepEqual(of(r.events, "tool_call")[0]!.call, { id: "c1", name: "search_kb", args: { q: "tuition germany" } });
  assert.equal(seen.length, 1);
  const back = r.backend.calls.find((c) => c.type === "tool_response");
  assert.ok(back && back.type === "tool_response");
  assert.equal(back.id, "c1");
  assert.deepEqual(back.result, { hits: [{ id: "n1", text: "Tuition is 0 euros at public universities" }] });
});

test("C1 tool call: with no handler the caller answers through sendToolResult (the API layer owns KB access)", async () => {
  const r = await rig();
  const call = { id: "c9", name: "search_kb", args: {} };
  r.backend.emitToolCall(call);
  assert.equal(r.backend.calls.filter((c) => c.type === "tool_response").length, 0);
  await r.session.sendToolResult(call, { hits: [] });
  assert.equal(r.backend.calls.filter((c) => c.type === "tool_response").length, 1);
});

test("C1 tool call: the KB tool throws during a live answer; an error event is raised and the session stays usable", async () => {
  const r = await rig({
    toolHandler: () => {
      throw new Error("kb down");
    },
  });
  r.backend.emitToolCall({ id: "c2", name: "search_kb", args: {} });
  await new Promise((res) => setImmediate(res));
  assert.match(of(r.events, "error")[0]!.message, /search_kb failed: kb down/);
  assert.equal(r.session.closed, false);
  r.session.sendAudio(pcm(10));
});

test("C1 interrupt: the student talks over the model; backend is told, event fires, the rest of that reply is dropped and the partial reply is stored as interrupted", async () => {
  const r = await rig();
  r.backend.emitOutputTranscript("Germany has");
  r.backend.emitOutputAudio(pcm(10));
  r.session.interrupt();
  r.backend.emitOutputAudio(pcm(10)); // in-flight audio from the cancelled reply
  r.backend.emitOutputTranscript("low tuition and");
  await r.session.drain();
  assert.equal(r.backend.calls.filter((c) => c.type === "interrupt").length, 1);
  assert.equal(of(r.events, "interrupted").length, 1);
  assert.equal(of(r.events, "audio").length, 1, "only the pre-interrupt chunk was forwarded");
  assert.equal(r.session.droppedAudioChunks, 1);
  assert.deepEqual(r.transcripts.map((t) => [t.text, t.interrupted]), [["Germany has", true]]);
});

test("C1 interrupt: after the barge-in the student's next words un-mute the model for its new answer", async () => {
  const r = await rig();
  r.backend.emitOutputAudio(pcm(4));
  r.session.interrupt();
  r.backend.emitInputTranscript("actually what about France", false);
  r.backend.emitOutputAudio(pcm(4));
  assert.equal(of(r.events, "audio").length, 2);
});

test("C1 interrupt: the backend itself reports the student barged in; the half reply is stored interrupted and the next reply flows", async () => {
  const r = await rig();
  r.backend.emitOutputTranscript("The deadline is");
  r.backend.emitInterrupted();
  r.backend.emitOutputAudio(pcm(4));
  await r.session.drain();
  assert.equal(of(r.events, "interrupted").length, 1);
  assert.deepEqual(r.transcripts.map((t) => [t.text, t.interrupted]), [["The deadline is", true]]);
  assert.equal(of(r.events, "audio").length, 1);
});

test("C1 close: the student hangs up twice (double tap); the backend closes once, one closed event, and every send afterwards throws", async () => {
  const r = await rig();
  r.session.close("hang up");
  r.session.close("hang up again");
  assert.equal(r.backend.calls.filter((c) => c.type === "close").length, 1);
  assert.deepEqual(of(r.events, "closed"), [{ type: "closed", reason: "hang up" }]);
  assert.throws(() => r.session.sendAudio(pcm(2)), LiveSessionClosedError);
  assert.throws(() => r.session.sendText("hi"), LiveSessionClosedError);
  assert.throws(() => r.session.interrupt(), LiveSessionClosedError);
  await assert.rejects(() => r.session.sendToolResult({ id: "x", name: "y", args: {} }, {}), LiveSessionClosedError);
});

test("C1 close: the network drops mid-reply; the half reply is saved, one closed event, and late backend events are ignored", async () => {
  const r = await rig();
  r.backend.emitOutputTranscript("The visa takes");
  r.backend.emitClosed("socket lost");
  r.backend.emitOutputAudio(pcm(4));
  r.backend.emitOutputTranscript("ignored");
  await r.session.drain();
  assert.deepEqual(of(r.events, "closed"), [{ type: "closed", reason: "socket lost" }]);
  assert.equal(of(r.events, "audio").length, 0);
  assert.deepEqual(r.transcripts.map((t) => [t.text, t.interrupted]), [["The visa takes", true]]);
});

test("C1 close: a UI listener that throws never breaks the voice session", async () => {
  const r = await rig({
    onEvent: () => {
      throw new Error("ui bug");
    },
  });
  r.backend.emitOutputAudio(pcm(2));
  r.backend.emitTurnComplete();
  r.session.sendAudio(pcm(2));
  r.session.close();
});

// =================================================================================================
// C4 crisis hook
// =================================================================================================
test("C4 crisis: the phrase arrives split across two transcript chunks; the detector sees the accumulated utterance and the fixed message plays once", async () => {
  const r = await rig({ detectCrisis: (t) => CRISIS_RE.test(t), crisisMessage: FIXED });
  r.backend.emitOutputAudio(pcm(5)); // model is mid-sentence when the student speaks
  r.backend.emitInputTranscript("I want to kill", false);
  assert.equal(of(r.events, "crisis").length, 0);
  r.backend.emitInputTranscript("myself", false); // neither chunk alone matches; the utterance does
  await r.session.drain();
  assert.equal(of(r.events, "crisis").length, 1);
  assert.equal(r.backend.calls.filter((c) => c.type === "interrupt").length, 1, "the backend model was interrupted");
  const fixedAudio = of(r.events, "audio").filter((a) => a.fixed);
  assert.equal(fixedAudio.length, 1);
  assert.deepEqual(fixedAudio[0]!.data, FIXED.audio);
  const fixedText = of(r.events, "transcript").filter((t) => t.fixed);
  assert.deepEqual(fixedText.map((t) => t.text), [FIXED.text]);
});

test("C4 crisis: after the trigger, the model's own audio and words for that answer are dropped (none reaches the student)", async () => {
  const r = await rig({ detectCrisis: (t) => CRISIS_RE.test(t), crisisMessage: FIXED });
  r.backend.emitInputTranscript("I want to end my life", false);
  const before = of(r.events, "audio").length;
  r.backend.emitOutputAudio(pcm(50));
  r.backend.emitOutputAudio(pcm(50));
  r.backend.emitOutputTranscript("Have you thought about universities in");
  await r.session.drain();
  assert.equal(of(r.events, "audio").length, before, "no model audio forwarded after the trigger");
  assert.equal(r.session.droppedAudioChunks, 2);
  assert.ok(!of(r.events, "transcript").some((t) => t.text.includes("universities")));
  assert.ok(!r.transcripts.some((t) => t.text.includes("universities")));
});

test("C4 crisis: the student's words are written to the thread before the fixed reply, and the crisis record is handed to the sink", async () => {
  const r = await rig({ detectCrisis: (t) => CRISIS_RE.test(t), crisisMessage: FIXED });
  r.backend.emitInputTranscript("main marna chahta hu", false);
  await r.session.drain();
  assert.deepEqual(
    r.transcripts.map((t) => [t.seq, t.role, t.text, t.fixed ?? false]),
    [
      [1, "user", "main marna chahta hu", false],
      [2, "assistant", FIXED.text, true],
    ],
  );
  assert.equal(r.crises.length, 1);
});

test("C4 crisis: the rest of the same sentence keeps streaming in after the trigger; the fixed message is not played a second time", async () => {
  const r = await rig({ detectCrisis: (t) => CRISIS_RE.test(t), crisisMessage: FIXED });
  r.backend.emitInputTranscript("I want to kill myself", false);
  r.backend.emitInputTranscript("honestly I want to end my life", false); // matches the detector again
  r.backend.emitInputTranscript("suicide is all I think about", true);
  assert.equal(of(r.events, "crisis").length, 1);
  assert.equal(r.backend.calls.filter((c) => c.type === "interrupt").length, 1);
});

test("C4 crisis: the student recovers and later says it again in a new turn; the fixed message plays again and the model speaks normally in between", async () => {
  const r = await rig({ detectCrisis: (t) => CRISIS_RE.test(t), crisisMessage: FIXED });
  r.backend.emitInputTranscript("I want to end my life", false);
  r.backend.emitTurnComplete();
  r.backend.emitOutputAudio(pcm(3)); // next normal reply is audible again
  assert.equal(of(r.events, "audio").filter((a) => !a.fixed).length, 1);
  r.backend.emitTurnComplete();
  r.backend.emitInputTranscript("I might kill myself tonight", false);
  assert.equal(of(r.events, "crisis").length, 2);
});

test("C4 crisis: an ordinary question about fees never triggers the hook", async () => {
  const r = await rig({ detectCrisis: (t) => CRISIS_RE.test(t), crisisMessage: FIXED });
  r.backend.emitInputTranscript("how much is the fee in Canada, I will die of stress if it is high", false);
  r.backend.emitOutputAudio(pcm(3));
  assert.equal(of(r.events, "crisis").length, 0);
  assert.equal(r.backend.calls.filter((c) => c.type === "interrupt").length, 0);
  assert.equal(of(r.events, "audio").length, 1);
});

test("C4 crisis: the student types the phrase during a voice session; it is NOT forwarded to the model and the fixed message plays", async () => {
  const r = await rig({ detectCrisis: (t) => CRISIS_RE.test(t), crisisMessage: FIXED });
  r.session.sendText("i want to end my life");
  await r.session.drain();
  assert.equal(r.backend.calls.filter((c) => c.type === "text").length, 0);
  assert.equal(of(r.events, "crisis").length, 1);
  assert.deepEqual(r.transcripts.map((t) => [t.role, t.text]), [
    ["user", "i want to end my life"],
    ["assistant", FIXED.text],
  ]);
});

test("C4 crisis: a harmless typed message in a voice session is forwarded to the model and not duplicated into the voice thread", async () => {
  const r = await rig({ detectCrisis: (t) => CRISIS_RE.test(t), crisisMessage: FIXED });
  r.session.sendText("what is the deadline");
  await r.session.drain();
  assert.deepEqual(r.backend.calls.filter((c) => c.type === "text"), [{ type: "text", text: "what is the deadline" }]);
  assert.equal(r.transcripts.length, 0);
});

test("C4 crisis: the detector crashes on a weird transcript; unsure counts as crisis (D-087), with an error event for the engineers", async () => {
  const r = await rig({
    detectCrisis: () => {
      throw new Error("regex bug");
    },
    crisisMessage: FIXED,
  });
  r.backend.emitInputTranscript("hello", false);
  const crisis = of(r.events, "crisis");
  assert.equal(crisis.length, 1);
  assert.equal(crisis[0]!.level, "detector_error");
  assert.match(of(r.events, "error")[0]!.message, /regex bug/);
});

test("C4 crisis: the detector can return a level and it travels on the crisis event and record", async () => {
  const r = await rig({ detectCrisis: (t) => ({ crisis: /kill myself/.test(t), level: "high" }), crisisMessage: FIXED });
  r.backend.emitInputTranscript("kill myself", false);
  await r.session.drain();
  assert.equal(of(r.events, "crisis")[0]!.level, "high");
  assert.equal(r.crises[0]!.level, "high");
});

test("C4 crisis: the trigger-to-fixed-message latency is measured on the injected clock and stays inside the 2 s bound (D-088 Q5)", async () => {
  let t = 1_000_000;
  const r = await rig({ detectCrisis: (x) => CRISIS_RE.test(x), crisisMessage: FIXED, now: () => (t += 40) });
  r.backend.emitInputTranscript("suicide", false);
  const c = of(r.events, "crisis")[0]!;
  assert.ok(c.latencyMs >= 0 && c.latencyMs <= 2000, `latency ${c.latencyMs}`);
  // The fixed audio is handed over BEFORE the crisis event is emitted: nothing else sits in between.
  const idx = (type: string) => r.events.findIndex((e) => e.type === type);
  assert.ok(idx("audio") < idx("crisis"));
});

test("C4 crisis: a deployment wires a detector but forgets the fixed message; the session refuses to start (no silent no-op)", async () => {
  await assert.rejects(() => new MockLiveProvider().connect({ onEvent: () => {}, detectCrisis: () => true }), LiveConfigError);
});

// =================================================================================================
// C5 output audit (A9b)
// =================================================================================================
const AUDIT = createSimpleOutputAuditor({ listedSpeakers: ["Priyanka Sharma", "Rahul"], allowedNumbers: ["14416"] });

test("C5 audit A9b: the model says a fee figure no tool returned; a flag event reaches the client and an audit record is stored with the thread", async () => {
  const r = await rig({ auditOutput: AUDIT });
  r.backend.emitOutputTranscript("Tuition there is 12000 euros a year.");
  r.backend.emitTurnComplete();
  await r.session.drain();
  assert.deepEqual(of(r.events, "flag"), [{ type: "flag", reason: "uncited_number", detail: "12000" }]);
  assert.equal(r.audits.length, 1);
  assert.equal(r.audits[0]!.finding.reason, "uncited_number");
  assert.equal(r.audits[0]!.seq, r.transcripts[0]!.seq, "the audit points at the assistant turn it is about");
});

test("C5 audit A9b: the model names a counsellor who is on the do-not-name list; a listed_speaker flag fires", async () => {
  const r = await rig({ auditOutput: AUDIT });
  r.backend.emitOutputTranscript("Priyanka Sharma told another student to apply early.");
  r.backend.emitTurnComplete();
  assert.deepEqual(of(r.events, "flag").map((f) => [f.reason, f.detail]), [["listed_speaker", "Priyanka Sharma"]]);
});

test("C5 audit A9b: a clean answer (figure came from the KB tool, no names) emits no flag and no audit record", async () => {
  const r = await rig({ auditOutput: AUDIT, toolHandler: () => ({ hits: [{ text: "Fee is 12,000 euros per year" }] }) });
  r.backend.emitToolCall({ id: "t", name: "search_kb", args: {} });
  await new Promise((res) => setImmediate(res));
  r.backend.emitOutputTranscript("Public tuition is 12000 euros a year at that university.");
  r.backend.emitTurnComplete();
  await r.session.drain();
  assert.equal(of(r.events, "flag").length, 0);
  assert.equal(r.audits.length, 0);
});

test("C5 audit A9b: a name that only contains a listed name inside another word is not flagged (Rahulkar vs Rahul)", async () => {
  const r = await rig({ auditOutput: AUDIT });
  r.backend.emitOutputTranscript("Professor Rahulkar leads the lab.");
  r.backend.emitTurnComplete();
  assert.equal(of(r.events, "flag").length, 0);
});

test("C5 audit A9b: the Tele-MANAS number the fixed message carries is allow-listed, an unrelated number beside it is still flagged", async () => {
  const r = await rig({ auditOutput: AUDIT });
  r.backend.emitOutputTranscript("Call 14416 or consider 55 percent odds.");
  r.backend.emitTurnComplete();
  assert.deepEqual(of(r.events, "flag").map((f) => f.detail), ["55"]);
});

test("C5 audit A9b: the audit is after the fact, not before: the spoken audio is already delivered when the flag arrives", async () => {
  const r = await rig({ auditOutput: AUDIT });
  r.backend.emitOutputAudio(pcm(8));
  r.backend.emitOutputTranscript("It costs 777 dollars.");
  const beforeTurnEnd = of(r.events, "flag").length;
  r.backend.emitTurnComplete();
  assert.equal(beforeTurnEnd, 0);
  assert.equal(of(r.events, "flag").length, 1);
  const kinds = r.events.map((e) => e.type);
  assert.ok(kinds.indexOf("audio") < kinds.indexOf("flag"));
});

test("C5 audit A9b: the auditor itself crashes; the failure is a visible audit_error flag, never a silent pass", async () => {
  const r = await rig({
    auditOutput: () => {
      throw new Error("auditor bug");
    },
  });
  r.backend.emitOutputTranscript("Anything.");
  r.backend.emitTurnComplete();
  assert.deepEqual(of(r.events, "flag"), [{ type: "flag", reason: "audit_error", detail: "auditor bug" }]);
});

test("C5 audit A9b: the student cuts the model off mid-sentence; the half sentence is still audited", async () => {
  const r = await rig({ auditOutput: AUDIT });
  r.backend.emitOutputTranscript("It is 9999");
  r.backend.emitInterrupted();
  assert.deepEqual(of(r.events, "flag").map((f) => f.detail), ["9999"]);
});

test("C5 audit A9b: two findings in one reply give two flags and two audit records (one per finding)", async () => {
  const r = await rig({ auditOutput: AUDIT });
  r.backend.emitOutputTranscript("Rahul says 42 and 43.");
  r.backend.emitTurnComplete();
  await r.session.drain();
  assert.equal(of(r.events, "flag").length, 3);
  assert.equal(r.audits.length, 3);
});

// =================================================================================================
// C6 sink
// =================================================================================================
test("C6 sink: U8's async persistence is slow for the first turn; thread order is still user, assistant, user", async () => {
  const written: string[] = [];
  const r = await rig({
    sink: {
      onFinalTranscript: async (t) => {
        await new Promise((res) => setTimeout(res, t.seq === 1 ? 20 : 0));
        written.push(`${t.seq}:${t.role}`);
      },
    },
  });
  r.backend.emitInputTranscript("first question", true);
  r.backend.emitOutputTranscript("first answer");
  r.backend.emitTurnComplete();
  r.backend.emitInputTranscript("second question", true);
  await r.session.drain();
  assert.deepEqual(written, ["1:user", "2:assistant", "3:user"]);
});

test("C6 sink: U8's database write fails once; an error event is raised, later turns are still delivered, the session survives", async () => {
  const got: string[] = [];
  const r = await rig({
    sink: {
      onFinalTranscript: (t) => {
        if (t.seq === 1) throw new Error("mongo down");
        got.push(t.text);
      },
    },
  });
  r.backend.emitInputTranscript("one", true);
  r.backend.emitInputTranscript("two", true);
  await r.session.drain();
  assert.deepEqual(got, ["two"]);
  assert.match(of(r.events, "error")[0]!.message, /transcript sink failed: mongo down/);
  assert.equal(r.session.closed, false);
});

test("C6 sink: the timestamps come from the injected clock as ISO strings (no real time in tests)", async () => {
  const r = await rig({ now: () => Date.UTC(2026, 9, 17, 12, 0, 0) });
  r.backend.emitInputTranscript("hi", true);
  await r.session.drain();
  assert.equal(r.transcripts[0]!.ts, "2026-10-17T12:00:00.000Z");
});

test("C6 sink: the live module imports nothing from apps/api, a websocket library or a vendor SDK (layering and offline guarantee)", () => {
  const src = readFileSync(fileURLToPath(new URL("../src/live.ts", import.meta.url)), "utf8");
  const imports = [...src.matchAll(/^\s*(?:import|export)\b[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  assert.deepEqual(imports, []);
  assert.ok(!/require\(|import\(/.test(src));
  assert.ok(!/\bfetch\s*\(|new WebSocket/.test(src));
});

// =================================================================================================
// C3 Gemini adapter (compile-only: a fake connector stands in for the SDK)
// =================================================================================================
interface FakeConn extends GeminiLiveConnection {
  sent: unknown[];
  closed: number;
}
function fakeConnector() {
  const calls: { model: string; config: Record<string, unknown> }[] = [];
  let callbacks!: GeminiLiveCallbacks;
  const conn: FakeConn = {
    sent: [],
    closed: 0,
    sendRealtimeInput(i) {
      this.sent.push({ rt: i });
    },
    sendToolResponse(i) {
      this.sent.push({ tool: i });
    },
    close() {
      this.closed++;
    },
  };
  const connector: GeminiLiveConnector = {
    async connect(params) {
      calls.push({ model: params.model, config: params.config });
      callbacks = params.callbacks;
      return conn;
    },
  };
  return { connector, conn, calls, cb: () => callbacks };
}
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

test("C3 gemini: a deployment with no connector (no key, no SDK) fails loudly instead of pretending to be live", async () => {
  await assert.rejects(() => new GeminiLiveProvider({ model: "gemini-live" }).connect({ onEvent: () => {} }), LiveNotWiredError);
});

test("C3 gemini: connecting asks for audio out, both transcripts, the voice, the system prompt and the KB tool declarations", async () => {
  const f = fakeConnector();
  const p = new GeminiLiveProvider({ model: "gemini-live-x", connector: f.connector });
  await p.connect({
    onEvent: () => {},
    systemInstruction: "You are a coach.",
    voiceName: "Puck",
    tools: [{ name: "search_kb", description: "search", parameters: { type: "object", properties: { q: { type: "string" } } } }],
  });
  assert.equal(f.calls[0]!.model, "gemini-live-x");
  const cfg = f.calls[0]!.config as Record<string, any>;
  assert.deepEqual(cfg.responseModalities, ["AUDIO"]);
  assert.deepEqual(cfg.inputAudioTranscription, {});
  assert.deepEqual(cfg.outputAudioTranscription, {});
  assert.equal(cfg.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Puck");
  assert.equal(cfg.systemInstruction.parts[0].text, "You are a coach.");
  assert.equal(cfg.tools[0].functionDeclarations[0].name, "search_kb");
  assert.equal(buildGeminiLiveConfig({ onEvent: () => {} }).tools, undefined);
});

test("C3 gemini: a full spoken exchange from Gemini-shaped messages becomes normalized transcripts, 24 kHz audio, a tool call and a turn end", async () => {
  const f = fakeConnector();
  const events: LiveEvent[] = [];
  const transcripts: LiveFinalTranscript[] = [];
  const session = await new GeminiLiveProvider({ model: "m", connector: f.connector }).connect({
    onEvent: (e) => events.push(e),
    sink: { onFinalTranscript: (t) => void transcripts.push(t) },
  });
  const speech = pcm(240, 5);
  f.cb().onmessage({ serverContent: { inputTranscription: { text: " what is the fee " } } });
  f.cb().onmessage({ toolCall: { functionCalls: [{ id: "g1", name: "search_kb", args: { q: "fee" } }] } });
  f.cb().onmessage({ serverContent: { modelTurn: { parts: [{ inlineData: { data: b64(speech), mimeType: "audio/pcm;rate=24000" } }] } } });
  f.cb().onmessage({ serverContent: { outputTranscription: { text: "It depends." } } });
  f.cb().onmessage({ serverContent: { turnComplete: true } });
  await session.drain();
  assert.deepEqual(of(events, "tool_call")[0]!.call, { id: "g1", name: "search_kb", args: { q: "fee" } });
  const audio = of(events, "audio");
  assert.equal(audio.length, 1);
  assert.deepEqual(audio[0]!.data, speech);
  assert.deepEqual(transcripts.map((t) => [t.role, t.text]), [["user", "what is the fee"], ["assistant", "It depends."]]);
  assert.equal(of(events, "turn_complete").length, 1);
});

test("C3 gemini: the student's mic audio is sent to Gemini as base64 PCM16 at 16 kHz; text, tool results and close take the SDK's shapes", async () => {
  const f = fakeConnector();
  const session = await new GeminiLiveProvider({ model: "m", connector: f.connector }).connect({ onEvent: () => {} });
  const chunk = pcm(32, 2);
  session.sendAudio(chunk);
  session.sendText("hello");
  await session.sendToolResult({ id: "g1", name: "search_kb", args: {} }, { hits: [1] });
  await session.sendToolResult({ id: "g2", name: "search_kb", args: {} }, "plain string result");
  session.close("done");
  assert.deepEqual(f.conn.sent, [
    { rt: { audio: { data: b64(chunk), mimeType: "audio/pcm;rate=16000" } } },
    { rt: { text: "hello" } },
    { tool: { functionResponses: [{ id: "g1", name: "search_kb", response: { hits: [1] } }] } },
    { tool: { functionResponses: [{ id: "g2", name: "search_kb", response: { result: "plain string result" } }] } },
    { rt: { audioStreamEnd: true } },
  ]);
  assert.equal(f.conn.closed, 1);
});

test("C3 gemini: the model returns audio at the wrong sample rate; an error is raised and the audio is not played", async () => {
  const f = fakeConnector();
  const events: LiveEvent[] = [];
  await new GeminiLiveProvider({ model: "m", connector: f.connector }).connect({ onEvent: (e) => events.push(e) });
  f.cb().onmessage({ serverContent: { modelTurn: { parts: [{ inlineData: { data: b64(pcm(8)), mimeType: "audio/pcm;rate=16000" } }] } } });
  f.cb().onmessage({ serverContent: { modelTurn: { parts: [{ inlineData: { data: b64(new Uint8Array(3)), mimeType: "audio/pcm;rate=24000" } }] } } });
  assert.equal(of(events, "audio").length, 0);
  assert.equal(of(events, "error").length, 2);
});

test("C3 gemini: Gemini reports the student barged in and then closes the socket; both surface once", async () => {
  const f = fakeConnector();
  const events: LiveEvent[] = [];
  await new GeminiLiveProvider({ model: "m", connector: f.connector }).connect({ onEvent: (e) => events.push(e) });
  f.cb().onmessage({ serverContent: { interrupted: true } });
  f.cb().onclose?.({ reason: "server gone" });
  f.cb().onclose?.({ reason: "again" });
  assert.equal(of(events, "interrupted").length, 1);
  assert.deepEqual(of(events, "closed"), [{ type: "closed", reason: "server gone" }]);
});

test("C3 gemini: an SDK error callback becomes an error event without closing the session", async () => {
  const f = fakeConnector();
  const events: LiveEvent[] = [];
  const s = await new GeminiLiveProvider({ model: "m", connector: f.connector }).connect({ onEvent: (e) => events.push(e) });
  f.cb().onerror?.(new Error("quota"));
  assert.equal(of(events, "error")[0]!.message, "quota");
  assert.equal(s.closed, false);
});

test("C3 gemini: junk messages (null, empty serverContent, a function call with no name) are ignored without throwing", async () => {
  const f = fakeConnector();
  const events: LiveEvent[] = [];
  await new GeminiLiveProvider({ model: "m", connector: f.connector }).connect({ onEvent: (e) => events.push(e) });
  for (const m of [null, 42, {}, { serverContent: {} }, { toolCall: { functionCalls: [{ id: "x" }] } }]) f.cb().onmessage(m);
  assert.equal(events.length, 0);
});

test("C4 crisis via gemini: a Hindi-English crisis phrase arrives as Gemini input transcription; Gemini is interrupted, the fixed message plays, Gemini's own reply is silenced", async () => {
  const f = fakeConnector();
  const events: LiveEvent[] = [];
  const s = await new GeminiLiveProvider({ model: "m", connector: f.connector }).connect({
    onEvent: (e) => events.push(e),
    detectCrisis: (t) => CRISIS_RE.test(t),
    crisisMessage: FIXED,
  });
  f.cb().onmessage({ serverContent: { inputTranscription: { text: "mujhe lagta hai main marna chahta hu" } } });
  f.cb().onmessage({ serverContent: { modelTurn: { parts: [{ inlineData: { data: b64(pcm(100)), mimeType: "audio/pcm;rate=24000" } }] } } });
  assert.equal(of(events, "crisis").length, 1);
  assert.ok(f.conn.sent.some((m) => JSON.stringify(m) === JSON.stringify({ rt: { audioStreamEnd: true } })), "Gemini's input stream was ended");
  assert.equal(of(events, "audio").filter((a) => !a.fixed).length, 0);
  assert.equal(s.droppedAudioChunks, 1);
});

// =================================================================================================
// misc: the default auditor on its own
// =================================================================================================
test("C5 audit A9b: createSimpleOutputAuditor numbers with thousands separators and decimals match the tool text, a different figure does not", () => {
  const a = createSimpleOutputAuditor();
  assert.deepEqual(a({ text: "Fee is 12,000 euros and 3.5 percent.", sourcedText: ["12000 EUR; rate 3.5%"] }), []);
  assert.deepEqual(a({ text: "Fee is 13,000.", sourcedText: ["12000"] }).map((f) => f.detail), ["13000"]);
});
