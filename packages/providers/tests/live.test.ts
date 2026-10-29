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
  LiveSession,
  LiveSessionClosedError,
  MockLiveBackend,
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
  let mono = 0;
  const r = await rig({ detectCrisis: (t) => CRISIS_RE.test(t), crisisMessage: FIXED, monotonicNow: () => mono });
  r.backend.emitInputTranscript("I want to end my life", false);
  r.backend.emitTurnComplete();
  mono = 3000; // the student pauses before speaking again (new utterance)
  r.backend.emitInputTranscript("okay, I will talk to my sister", true); // D-096: only the student's next words lift the mute
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

test("Q14/I1 repair: tool results default to context and result payloads cannot authorize factual evidence", async () => {
  const r = await rig({ auditOutput: AUDIT, tools: [{ name: "student_memory", description: "untrusted context" }] });
  await r.session.sendToolResult({ id: "memory", name: "student_memory", args: {} }, { factualEvidence: true, facts: [{ value: "Fee is 987651 euros" }] });
  await r.session.sendToolResult({ id: "undeclared", name: "search_kb", args: {} }, { text: "Fee is 876542 euros" });
  r.backend.emitOutputTranscript("University fees are 987651 and 876542 euros");
  r.backend.emitTurnComplete();
  await r.session.drain();
  assert.deepEqual(of(r.events, "flag").map(f => f.detail).sort(), ["876542", "987651"]);
  assert.equal(r.backend.calls.filter(c => c.type === "tool_response").length, 2, "context still reaches the provider unchanged");
});

test("C5 audit A9b: a clean answer (figure came from the KB tool, no names) emits no flag and no audit record", async () => {
  const r = await rig({ auditOutput: AUDIT, tools: [{ name: "search_kb", description: "trusted KB", factualEvidence: true }], toolHandler: () => ({ hits: [{ text: "Fee is 12,000 euros per year" }] }) });
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
    tools: [{ name: "search_kb", description: "search", factualEvidence: true, parameters: { type: "object", properties: { q: { type: "string" } } } }],
  });
  assert.equal(f.calls[0]!.model, "gemini-live-x");
  const cfg = f.calls[0]!.config as Record<string, any>;
  assert.deepEqual(cfg.responseModalities, ["AUDIO"]);
  assert.deepEqual(cfg.inputAudioTranscription, {});
  assert.deepEqual(cfg.outputAudioTranscription, {});
  assert.equal(cfg.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Puck");
  assert.equal(cfg.systemInstruction.parts[0].text, "You are a coach.");
  assert.deepEqual(cfg.tools[0].functionDeclarations[0], { name: "search_kb", description: "search", parametersJsonSchema: { type: "object", properties: { q: { type: "string" } } } }, "app-only evidence metadata never enters the Gemini SDK declaration");
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

test("A10 diagnose: endAudio() sends Gemini's audioStreamEnd once, without muting the model or closing the session", async () => {
  const f = fakeConnector();
  const events: LiveEvent[] = [];
  const session = await new GeminiLiveProvider({ model: "m", connector: f.connector }).connect({ onEvent: (e) => events.push(e) });
  session.sendAudio(pcm(32, 2));
  session.endAudio();
  assert.deepEqual(f.conn.sent[f.conn.sent.length - 1], { rt: { audioStreamEnd: true } });
  assert.equal(f.conn.sent.filter((m) => JSON.stringify(m) === JSON.stringify({ rt: { audioStreamEnd: true } })).length, 1);
  assert.equal(session.closed, false);
  assert.equal(f.conn.closed, 0);
  // Not an interrupt: the model's reply still reaches the student.
  f.cb().onmessage({ serverContent: { modelTurn: { parts: [{ inlineData: { data: b64(pcm(8)), mimeType: "audio/pcm;rate=24000" } }] } } });
  assert.equal(of(events, "audio").length, 1);
  assert.equal(of(events, "interrupted").length, 0);
});

test("A10 diagnose: endAudio() on a mock session records audio_end; on a closed session it throws like every other send", async () => {
  const p = new MockLiveProvider();
  const s = await p.connect({ onEvent: () => {} });
  s.endAudio();
  assert.deepEqual(p.last.calls, [{ type: "audio_end" }]);
  s.close();
  assert.throws(() => s.endAudio(), LiveSessionClosedError);
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

// =================================================================================================
// C4 fix cycle 1: crisis interrupt path (F1, F2, M1, M2, M3)
// =================================================================================================
test("C4 crisis F1: the backend reports `interrupted` after the crisis trigger chunk; the model's audio and words stay silenced", async () => {
  const r = await rig({ detectCrisis: (t) => CRISIS_RE.test(t), crisisMessage: FIXED });
  r.backend.emitInputTranscript("I will kill myself", false);
  r.backend.emitInterrupted();
  r.backend.emitOutputAudio(pcm(50));
  r.backend.emitOutputTranscript("Have you thought about universities in");
  await r.session.drain();
  assert.equal(of(r.events, "audio").filter((a) => !a.fixed).length, 0, "model audio leaked after crisis + interrupted");
  assert.equal(r.session.droppedAudioChunks, 1);
  assert.ok(!r.transcripts.some((t) => t.text.includes("universities")));
});

test("C4 crisis F1: the crisis arrives on a FINAL transcript chunk and `interrupted` follows; the mute still holds", async () => {
  const r = await rig({ detectCrisis: (t) => CRISIS_RE.test(t), crisisMessage: FIXED });
  r.backend.emitInputTranscript("I will kill myself", true);
  r.backend.emitInterrupted();
  r.backend.emitOutputAudio(pcm(50));
  assert.equal(of(r.events, "audio").filter((a) => !a.fixed).length, 0, "model audio leaked after final crisis chunk + interrupted");
});

test("C4 crisis F1: after crisis + interrupted the model's turn ends; the next reply is audible again once the student speaks (the mute is not permanent)", async () => {
  let mono = 0;
  const r = await rig({ detectCrisis: (t) => CRISIS_RE.test(t), crisisMessage: FIXED, monotonicNow: () => mono });
  r.backend.emitInputTranscript("I will kill myself", false);
  r.backend.emitInterrupted();
  r.backend.emitTurnComplete();
  r.backend.emitOutputAudio(pcm(3));
  assert.equal(of(r.events, "audio").filter((a) => !a.fixed).length, 0, "D-096: turnComplete alone never lifts a crisis mute");
  mono = 3000; // the student pauses before speaking again (new utterance)
  r.backend.emitInputTranscript("okay", true);
  r.backend.emitOutputAudio(pcm(3));
  assert.equal(of(r.events, "audio").filter((a) => !a.fixed).length, 1);
});

test("C4 crisis F2: the model was mid-sentence with a figure when the student's crisis phrase arrived; the half reply is audited and stored as interrupted, before the student's words", async () => {
  const r = await rig({ detectCrisis: (t) => CRISIS_RE.test(t), crisisMessage: FIXED, auditOutput: AUDIT });
  r.backend.emitOutputTranscript("The fee is 99999 rupees");
  r.backend.emitInputTranscript("I will kill myself", false);
  await r.session.drain();
  assert.deepEqual(of(r.events, "flag").map((f) => f.detail), ["99999"], "spoken uncited number in the half reply was never audited");
  assert.equal(r.audits.length, 1);
  assert.deepEqual(
    r.transcripts.map((t) => [t.seq, t.role, t.text, t.interrupted ?? false, t.fixed ?? false]),
    [
      [1, "assistant", "The fee is 99999 rupees", true, false],
      [2, "user", "I will kill myself", false, false],
      [3, "assistant", FIXED.text, false, true],
    ],
  );
});

test("C4 crisis M1: a crisis arrives from the transport before the session is attached; the fixed message plays now and the backend interrupt is replayed on attach", async () => {
  const events: LiveEvent[] = [];
  const session = new LiveSession({ onEvent: (e) => events.push(e), detectCrisis: (t) => CRISIS_RE.test(t), crisisMessage: FIXED });
  const backend = new MockLiveBackend();
  backend.bind(session);
  backend.emitInputTranscript("I will kill myself", false);
  assert.equal(of(events, "crisis").length, 1);
  assert.equal(of(events, "audio").filter((a) => a.fixed).length, 1);
  assert.equal(of(events, "error").length, 0, "a crisis before attach must not become an error");
  assert.equal(backend.calls.filter((c) => c.type === "interrupt").length, 0, "nothing to interrupt yet");
  session.attach(backend);
  assert.equal(backend.calls.filter((c) => c.type === "interrupt").length, 1, "the skipped backend interrupt is replayed on attach");
  assert.equal(of(events, "error").length, 0);
});

test("C4 crisis M1: the model asks for a KB tool before the session is attached; the call is answered after attach, not turned into an error", async () => {
  const events: LiveEvent[] = [];
  const session = new LiveSession({ onEvent: (e) => events.push(e), toolHandler: (c) => ({ ok: c.name }) });
  const backend = new MockLiveBackend();
  backend.bind(session);
  backend.emitToolCall({ id: "t1", name: "search_kb", args: {} });
  await new Promise((r) => setImmediate(r));
  assert.equal(of(events, "error").length, 0, "a tool call before attach must not become an error");
  session.attach(backend);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(backend.calls.filter((c) => c.type === "tool_response"), [{ type: "tool_response", id: "t1", name: "search_kb", result: { ok: "search_kb" } }]);
  assert.equal(of(events, "error").length, 0);
});

test("C4 crisis M2: the student speaks a crisis phrase and then types another distress message in the same utterance; the typed text is scanned, not forwarded, and answered", async () => {
  const seen: string[] = [];
  const r = await rig({ detectCrisis: (t) => (seen.push(t), CRISIS_RE.test(t)), crisisMessage: FIXED });
  r.backend.emitInputTranscript("I will kill myself", false);
  r.session.sendText("please help i want to end my life");
  await r.session.drain();
  assert.ok(seen.includes("please help i want to end my life"), "the typed text never reached the detector");
  assert.equal(r.backend.calls.filter((c) => c.type === "text").length, 0, "crisis text was forwarded to the model");
  assert.equal(of(r.events, "crisis").length, 2);
  assert.ok(r.transcripts.some((t) => t.role === "user" && t.text.includes("end my life")), "the typed words are in the thread");
});

test("C4 crisis M2: a harmless typed message after a spoken crisis in the same utterance is still scanned and forwarded", async () => {
  const seen: string[] = [];
  const r = await rig({ detectCrisis: (t) => (seen.push(t), CRISIS_RE.test(t)), crisisMessage: FIXED });
  r.backend.emitInputTranscript("I will kill myself", false);
  r.session.sendText("what is the deadline");
  assert.ok(seen.includes("what is the deadline"));
  assert.deepEqual(r.backend.calls.filter((c) => c.type === "text"), [{ type: "text", text: "what is the deadline" }]);
});

test("C4 crisis M3: a voice deployment wires a detector and a fixed message with text only (no audio); the session refuses to start rather than leave the student with silence", async () => {
  await assert.rejects(
    () => new MockLiveProvider().connect({ onEvent: () => {}, detectCrisis: () => true, crisisMessage: { text: "call 14416" } }),
    LiveConfigError,
  );
  await assert.rejects(
    () => new MockLiveProvider().connect({ onEvent: () => {}, detectCrisis: () => true, crisisMessage: { text: "call 14416", audio: new Uint8Array(0) } }),
    LiveConfigError,
  );
  await assert.rejects(
    () => new MockLiveProvider().connect({ onEvent: () => {}, detectCrisis: () => true, crisisMessage: { text: "call 14416", audio: new Uint8Array(3) } }),
    LiveConfigError,
  );
});

// =================================================================================================
// C4 fix cycle 2: the crisis mute lifts only on new student speech (D-096: R1, R2) and the lows
// =================================================================================================
test("C4 crisis R1: the model makes a tool call right after the crisis chunk and the student keeps talking in the same utterance; no model audio is heard", async () => {
  const r = await rig({ detectCrisis: (t) => CRISIS_RE.test(t), crisisMessage: FIXED });
  r.backend.emitInputTranscript("I will kill myself", false);
  r.backend.emitToolCall({ id: "t1", name: "search_kb", args: {} });
  r.backend.emitInputTranscript("because of exams", false);
  r.backend.emitOutputAudio(pcm(50));
  r.backend.emitOutputTranscript("Exams can be stressful, let us look at colleges");
  await r.session.drain();
  assert.equal(of(r.events, "tool_call").length, 1, "the tool call is still surfaced");
  assert.equal(of(r.events, "audio").filter((a) => !a.fixed).length, 0, "model audio leaked after crisis + toolCall");
  assert.ok(!r.transcripts.some((t) => t.text.includes("colleges")), "model words leaked into the thread");
  assert.equal(of(r.events, "crisis").length, 1, "the same utterance must not refire the fixed message");
});

test("C4 crisis R2: after crisis + interrupted the model ends its turn; its next reply stays muted until the student speaks again, then is heard", async () => {
  let mono = 0;
  const r = await rig({ detectCrisis: (t) => CRISIS_RE.test(t), crisisMessage: FIXED, monotonicNow: () => mono });
  r.backend.emitInputTranscript("I will kill myself", false);
  r.backend.emitInterrupted();
  r.backend.emitTurnComplete();
  r.backend.emitOutputAudio(pcm(3));
  r.backend.emitOutputTranscript("Anyway, about the fee");
  assert.equal(of(r.events, "audio").filter((a) => !a.fixed).length, 0, "turnComplete lifted the crisis mute");
  mono = 3000; // the student pauses before speaking again (new utterance)
  r.backend.emitInputTranscript("okay I will call them", true);
  r.backend.emitOutputAudio(pcm(3));
  assert.equal(of(r.events, "audio").filter((a) => !a.fixed).length, 1, "the next student speech must lift the mute");
});

test("C4 crisis low: the transport floods events before attach; the queue is capped, the oldest are dropped with a warning, and the crisis interrupt is never dropped", async () => {
  const events: LiveEvent[] = [];
  const session = new LiveSession({
    onEvent: (e) => events.push(e),
    detectCrisis: (t) => CRISIS_RE.test(t),
    crisisMessage: FIXED,
    toolHandler: (c) => ({ ok: c.id }),
  });
  const backend = new MockLiveBackend();
  backend.bind(session);
  backend.emitInputTranscript("I will kill myself", true);
  for (let i = 0; i < 300; i++) backend.emitToolCall({ id: `t${i}`, name: "search_kb", args: {} });
  const warnings = of(events, "error").filter((e) => /dropped/i.test(e.message));
  assert.ok(warnings.length >= 1, "dropping queued events must be visible");
  session.attach(backend);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const responses = backend.calls.filter((c) => c.type === "tool_response");
  assert.equal(responses.length, 256, "queue cap");
  assert.equal((responses[0] as { id: string }).id, "t44", "the oldest are dropped first");
  assert.equal(backend.calls.filter((c) => c.type === "interrupt").length, 1, "the crisis interrupt survives the overflow");
});

test("C4 crisis low: a transport tries to attach a second backend; it is refused and the first stays wired", async () => {
  const session = new LiveSession({ onEvent: () => {} });
  const first = new MockLiveBackend();
  const second = new MockLiveBackend();
  session.attach(first);
  assert.throws(() => session.attach(second), LiveConfigError);
  session.sendText("hello");
  assert.equal(first.calls.filter((c) => c.type === "text").length, 1);
  assert.equal(second.calls.length, 0);
});

test("C4 crisis low: the student types a crisis message, then says one aloud; the helpline audio plays again for the spoken one", async () => {
  const r = await rig({ detectCrisis: (t) => CRISIS_RE.test(t), crisisMessage: FIXED });
  r.session.sendText("i want to end my life");
  r.backend.emitInputTranscript("I will kill myself", false);
  assert.equal(of(r.events, "crisis").length, 2, "a typed crisis blocked the spoken one");
  assert.equal(of(r.events, "audio").filter((a) => a.fixed).length, 2);
});

test("C4 crisis low: a client that mutates the helpline audio buffer it received cannot corrupt the next crisis playback", async () => {
  const original = Uint8Array.from(FIXED.audio);
  let mono = 0;
  const r = await rig({ detectCrisis: (t) => CRISIS_RE.test(t), crisisMessage: FIXED, monotonicNow: () => mono });
  r.backend.emitInputTranscript("I will kill myself", true);
  const first = of(r.events, "audio").filter((a) => a.fixed)[0]!;
  assert.notEqual(first.data, FIXED.audio, "the shared buffer itself was handed out");
  first.data.fill(0);
  r.backend.emitTurnComplete();
  mono = 3000; // a new utterance (D-096 brief rewrite 1: turn end + pause)
  r.backend.emitInputTranscript("I might end my life", true);
  const second = of(r.events, "audio").filter((a) => a.fixed)[1]!;
  assert.deepEqual(Array.from(second.data), Array.from(original));
  assert.deepEqual(Array.from(FIXED.audio), Array.from(original));
});

// =================================================================================================
// C4 brief rewrite 1: "new student speech" on a transport with no final flag (H1, Low; D-096)
// The crisis mute lifts only on a student chunk that comes after a turnComplete/interrupted AND
// after a pause of at least crisisResumeGapMs since the previous student chunk (monotonic clock).
// =================================================================================================
function monoRig(over: Partial<LiveSessionConfig> = {}) {
  const clock = { t: 0 };
  const rigP = rig({ detectCrisis: (t) => CRISIS_RE.test(t), crisisMessage: FIXED, monotonicNow: () => clock.t, ...over });
  return { clock, rigP };
}

test("C4 crisis H1: Gemini order, crisis -> turnComplete -> the same sentence goes on a moment later; the model's audio stays muted", async () => {
  const { clock, rigP } = monoRig();
  const r = await rigP;
  r.backend.emitInputTranscript("I will kill myself", false); // Gemini never sends final=true
  r.backend.emitTurnComplete();
  clock.t = 300; // same breath: well inside the default 1200 ms gap
  r.backend.emitInputTranscript("because of exams", false);
  r.backend.emitOutputAudio(pcm(50));
  r.backend.emitOutputTranscript("Exams can be stressful, let us look at colleges");
  await r.session.drain();
  assert.equal(of(r.events, "audio").filter((a) => !a.fixed).length, 0, "model audio leaked mid crisis utterance after turnComplete");
  assert.ok(!r.transcripts.some((t) => t.text.includes("colleges")));
  assert.equal(of(r.events, "crisis").length, 1, "the same utterance must not refire");
});

test("C4 crisis H1: crisis -> turnComplete -> the student speaks again after a real pause; the model's next reply is heard", async () => {
  const { clock, rigP } = monoRig();
  const r = await rigP;
  r.backend.emitInputTranscript("I will kill myself", false);
  r.backend.emitTurnComplete();
  clock.t = 2000;
  r.backend.emitInputTranscript("okay, I will call my sister", false);
  r.backend.emitOutputAudio(pcm(3));
  assert.equal(of(r.events, "audio").filter((a) => !a.fixed).length, 1, "new student speech must lift the crisis mute");
});

test("C4 crisis H1: the pause is measured from the LAST student chunk, not the crisis chunk; continuous speech never lifts the mute", async () => {
  const { clock, rigP } = monoRig();
  const r = await rigP;
  r.backend.emitInputTranscript("I will kill myself", false);
  r.backend.emitTurnComplete();
  for (const [t, words] of [[800, "because"], [1600, "of exams"], [2400, "and my parents"]] as const) {
    clock.t = t;
    r.backend.emitInputTranscript(words, false);
  }
  r.backend.emitOutputAudio(pcm(3));
  assert.equal(of(r.events, "audio").filter((a) => !a.fixed).length, 0, "800 ms steps are one utterance");
});

test("C4 crisis H1: crisis -> the student speaks after a pause but the backend never ended its turn; still muted", async () => {
  const { clock, rigP } = monoRig();
  const r = await rigP;
  r.backend.emitInputTranscript("I will kill myself", false);
  clock.t = 5000;
  r.backend.emitInputTranscript("okay", false);
  r.backend.emitOutputAudio(pcm(3));
  assert.equal(of(r.events, "audio").filter((a) => !a.fixed).length, 0, "a pause alone must not lift the crisis mute");
});

test("C4 crisis H1: the resume gap is a constructor option; a longer gap keeps a 2 s pause muted", async () => {
  const { clock, rigP } = monoRig({ crisisResumeGapMs: 5000 });
  const r = await rigP;
  r.backend.emitInputTranscript("I will kill myself", false);
  r.backend.emitTurnComplete();
  clock.t = 2000;
  r.backend.emitInputTranscript("okay", false);
  r.backend.emitOutputAudio(pcm(3));
  assert.equal(of(r.events, "audio").filter((a) => !a.fixed).length, 0);
  clock.t = 8000;
  r.backend.emitInputTranscript("so what now", false);
  r.backend.emitOutputAudio(pcm(3));
  assert.equal(of(r.events, "audio").filter((a) => !a.fixed).length, 1);
});

test("C4 crisis Low: a second spoken crisis in a NEW utterance plays the helpline again; a duplicate in that utterance does not", async () => {
  const { clock, rigP } = monoRig();
  const r = await rigP;
  r.backend.emitInputTranscript("I will kill myself", false);
  r.backend.emitTurnComplete();
  clock.t = 3000;
  r.backend.emitInputTranscript("I still want to end my life", false); // new utterance
  assert.equal(of(r.events, "crisis").length, 2, "a new spoken crisis must refire");
  assert.equal(of(r.events, "audio").filter((a) => a.fixed).length, 2);
  clock.t = 3400;
  r.backend.emitInputTranscript("suicide is all I think about", false); // same utterance
  r.backend.emitTurnComplete();
  clock.t = 3800; // a turnComplete but no pause: still the same utterance
  r.backend.emitInputTranscript("I will kill myself", false);
  assert.equal(of(r.events, "crisis").length, 2, "same-utterance duplicates must not double-fire");
  assert.equal(of(r.events, "audio").filter((a) => a.fixed).length, 2);
  r.backend.emitOutputAudio(pcm(3));
  assert.equal(of(r.events, "audio").filter((a) => !a.fixed).length, 0, "the second crisis re-armed the mute");
});

test("C4 crisis Low: after a crisis the student starts a new, harmless utterance; the old crisis words are not re-scanned into a false refire", async () => {
  const { clock, rigP } = monoRig();
  const r = await rigP;
  r.backend.emitInputTranscript("I will kill myself", false);
  clock.t = 200;
  r.backend.emitInputTranscript("because of exams", false); // buffered in the crisis utterance
  r.backend.emitTurnComplete();
  clock.t = 3000;
  r.backend.emitInputTranscript("okay what about fees", false);
  r.backend.emitTurnComplete(); // the new utterance ends normally (no crisis mute any more)
  await r.session.drain();
  assert.equal(of(r.events, "crisis").length, 1, "stale crisis text refired the helpline");
  assert.ok(r.transcripts.some((t) => t.role === "user" && t.text === "okay what about fees"), "the new utterance is its own thread turn");
});


test("S12 voice: explicit human finality retains starting context; implicit output flush cannot grant it",async()=>{
  const backend=new MockLiveBackend();const transcripts:LiveFinalTranscript[]=[];let prompt="first";
  const session=new LiveSession({onEvent:()=>{},captureInputContext:()=>prompt,sink:{onFinalTranscript:t=>{transcripts.push(t);}}}).attach(backend);
  backend.bind(session);
  backend.emitInputTranscript("yes",false);prompt="second";backend.emitInputTranscript("please",true);await session.drain();
  assert.equal(transcripts[0]!.inputFinal,true);assert.equal(transcripts[0]!.inputContext,"first");
  backend.emitInputTranscript("yes",false);backend.emitOutputTranscript("yes");backend.emitTurnComplete();await session.drain();
  assert.equal(transcripts[1]!.inputFinal,undefined);assert.equal(transcripts[1]!.inputContext,undefined);
  session.close();
});


test("S12 voice Gemini connector: only explicit input finished marks human finality, including an empty final marker",async()=>{
  const f=fakeConnector(),transcripts:LiveFinalTranscript[]=[];
  const session=await new GeminiLiveProvider({model:"synthetic-unchanged",connector:f.connector}).connect({onEvent:()=>{},captureInputContext:()=>"owned-prompt",sink:{onFinalTranscript:t=>{transcripts.push(t);}}});
  f.cb().onmessage({serverContent:{inputTranscription:{text:"yes",finished:false}}});
  f.cb().onmessage({serverContent:{outputTranscription:{text:"yes"},turnComplete:true}});await session.drain();
  assert.equal(transcripts[0]!.inputFinal,undefined);
  f.cb().onmessage({serverContent:{inputTranscription:{text:"no",finished:false}}});
  f.cb().onmessage({serverContent:{inputTranscription:{finished:true}}});await session.drain();
  const no=transcripts.find(t=>t.role==="user"&&t.text==="no")!;assert.equal(no.inputFinal,true);assert.equal(no.inputContext,"owned-prompt");session.close();
});
