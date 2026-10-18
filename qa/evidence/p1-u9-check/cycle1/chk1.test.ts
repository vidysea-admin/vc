import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GeminiLiveProvider, LiveConfigError, LiveSession, MockLiveBackend, MockLiveProvider, createSimpleOutputAuditor,
  type LiveEvent, type LiveFinalTranscript, type LiveSessionConfig,
} from "../src/index.js";

const pcm = (n: number, fill = 1) => new Uint8Array(n * 2).fill(fill);
const RE = /kill myself|end my life/i;
const FIXED = { text: "Call Tele-MANAS 14416", audio: pcm(8, 7) };
const AUDIT = createSimpleOutputAuditor({ allowedNumbers: ["14416"] });
const of = <T extends LiveEvent["type"]>(ev: LiveEvent[], t: T) => ev.filter((e): e is Extract<LiveEvent, { type: T }> => e.type === t);
const model = (ev: LiveEvent[]) => of(ev, "audio").filter((a) => !a.fixed).length;

async function rig(over: Partial<LiveSessionConfig> = {}) {
  const events: LiveEvent[] = []; const tr: LiveFinalTranscript[] = []; const audits: unknown[] = [];
  const p = new MockLiveProvider();
  const s = await p.connect({ onEvent: (e) => events.push(e), sink: { onFinalTranscript: (t) => void tr.push(t), onAudit: (a) => void audits.push(a) }, detectCrisis: (t) => RE.test(t), crisisMessage: FIXED, auditOutput: AUDIT, ...over });
  return { s, b: p.last, events, tr, audits };
}

test("P1 crisis then THREE interrupted events: still silent", async () => {
  const r = await rig();
  r.b.emitInputTranscript("I will kill myself", false);
  r.b.emitInterrupted(); r.b.emitInterrupted(); r.b.emitInterrupted();
  r.b.emitOutputAudio(pcm(5)); r.b.emitOutputTranscript("hello there");
  assert.equal(model(r.events), 0);
  assert.equal(r.s.droppedAudioChunks, 1);
  assert.equal(of(r.events, "transcript").filter((t) => t.text === "hello there").length, 0);
  assert.equal(r.b.calls.filter((c) => c.type === "interrupt").length, 1);
});

test("P2 crisis, client interrupt(), then backend interrupted: silent", async () => {
  const r = await rig();
  r.b.emitInputTranscript("I will kill myself", false);
  r.s.interrupt(); r.b.emitInterrupted(); r.b.emitOutputAudio(pcm(5));
  assert.equal(model(r.events), 0);
});

test("P3 crisis then later non-final chunk of same utterance then interrupted: silent, one crisis", async () => {
  const r = await rig();
  r.b.emitInputTranscript("I will kill myself", false);
  r.b.emitInputTranscript("right now", false);
  r.b.emitInterrupted(); r.b.emitOutputAudio(pcm(5));
  assert.equal(model(r.events), 0);
  assert.equal(of(r.events, "crisis").length, 1);
});

test("P4 crisis on FINAL chunk, two interrupted: silent; then next speech unmutes", async () => {
  const r = await rig();
  r.b.emitInputTranscript("I will kill myself", true);
  r.b.emitInterrupted(); r.b.emitInterrupted(); r.b.emitOutputAudio(pcm(5));
  assert.equal(model(r.events), 0);
  r.b.emitInputTranscript("thanks", false);
  r.b.emitOutputAudio(pcm(5));
  assert.equal(model(r.events), 1, "mute ends at next non-crisis speech (brief)");
});

test("P5 crisis, interrupted, second crisis utterance re-fires and stays muted through interrupted", async () => {
  const r = await rig();
  r.b.emitInputTranscript("I will kill myself", true);
  r.b.emitInterrupted();
  r.b.emitInputTranscript("I want to end my life", true);
  r.b.emitInterrupted(); r.b.emitOutputAudio(pcm(5));
  assert.equal(of(r.events, "crisis").length, 2);
  assert.equal(model(r.events), 0);
});

test("P6 half reply flushed once, audited once, no duplicate on turnComplete; order 1,2,3", async () => {
  const r = await rig();
  r.b.emitOutputAudio(pcm(3));
  r.b.emitOutputTranscript("Fee is 77777 rupees");
  r.b.emitInputTranscript("I will kill myself", false);
  r.b.emitTurnComplete(); r.b.emitTurnComplete();
  await r.s.drain();
  assert.equal(model(r.events), 1, "pre-crisis audio was forwarded exactly once");
  assert.equal(r.audits.length, 1);
  assert.deepEqual(of(r.events, "flag").map((f) => f.detail), ["77777"]);
  assert.deepEqual(r.tr.map((t) => [t.seq, t.role, t.interrupted ?? false, t.fixed ?? false]), [[1, "assistant", true, false], [2, "user", false, false], [3, "assistant", false, true]]);
  const finalAssistant = of(r.events, "transcript").filter((t) => t.role === "assistant" && t.final && !t.fixed);
  assert.equal(finalAssistant.length, 1);
});

test("P7 auditor throws during the crisis flush: audit_error flag, crisis still plays, still muted, backend interrupted", async () => {
  const r = await rig({ auditOutput: () => { throw new Error("boom"); } });
  r.b.emitOutputTranscript("some words");
  r.b.emitInputTranscript("I will kill myself", false);
  r.b.emitInterrupted(); r.b.emitOutputAudio(pcm(2));
  await r.s.drain();
  assert.deepEqual(of(r.events, "flag").map((f) => f.reason), ["audit_error"]);
  assert.equal(of(r.events, "audio").filter((a) => a.fixed).length, 1);
  assert.equal(model(r.events), 0);
  assert.equal(r.b.calls.filter((c) => c.type === "interrupt").length, 1);
});

test("P8 sink throws on every write: crisis still plays and mutes", async () => {
  const events: LiveEvent[] = [];
  const p = new MockLiveProvider();
  const s = await p.connect({ onEvent: (e) => events.push(e), sink: { onFinalTranscript: () => { throw new Error("db down"); } }, detectCrisis: (t) => RE.test(t), crisisMessage: FIXED, auditOutput: AUDIT });
  p.last.emitOutputTranscript("half 123456");
  p.last.emitInputTranscript("I will kill myself", false);
  p.last.emitInterrupted(); p.last.emitOutputAudio(pcm(2));
  await s.drain();
  assert.equal(of(events, "audio").filter((a) => a.fixed).length, 1);
  assert.equal(of(events, "audio").filter((a) => !a.fixed).length, 0);
});

test("P9 a listener that always throws cannot break the crisis path", async () => {
  let n = 0; const p = new MockLiveProvider();
  const s = await p.connect({ onEvent: () => { n++; throw new Error("ui"); }, detectCrisis: (t) => RE.test(t), crisisMessage: FIXED });
  p.last.emitInputTranscript("I will kill myself", false);
  p.last.emitInterrupted(); p.last.emitOutputAudio(pcm(2));
  assert.equal(p.last.calls.filter((c) => c.type === "interrupt").length, 1);
  assert.equal(s.droppedAudioChunks, 1);
  assert.ok(n > 3);
});

test("P10 pre-attach crisis, then close() before attach, then attach: nothing throws", async () => {
  const events: LiveEvent[] = [];
  const s = new LiveSession({ onEvent: (e) => events.push(e), detectCrisis: (t) => RE.test(t), crisisMessage: FIXED });
  const b = new MockLiveBackend(); b.bind(s);
  b.emitInputTranscript("I will kill myself", false);
  s.close();
  assert.doesNotThrow(() => s.attach(b));
  console.log("P10 observed: backend calls after close-then-attach =", JSON.stringify(b.calls), "events:", events.map((e) => e.type).join(","));
});

test("P11 pre-attach: backend.interrupt throws on replay; a queued tool call after it is still replayed; attach does not throw", async () => {
  const events: LiveEvent[] = [];
  const s = new LiveSession({ onEvent: (e) => events.push(e), detectCrisis: (t) => RE.test(t), crisisMessage: FIXED, toolHandler: (c) => ({ ok: c.name }) });
  const b = new MockLiveBackend(); b.bind(s);
  b.interrupt = () => { throw new Error("socket gone"); };
  b.emitInputTranscript("I will kill myself", false);
  b.emitToolCall({ id: "t1", name: "kb", args: {} });
  assert.doesNotThrow(() => s.attach(b));
  await new Promise((r) => setImmediate(r));
  assert.ok(of(events, "error").some((e) => e.message.includes("interrupt failed")));
  assert.deepEqual(b.calls.filter((c) => c.type === "tool_response").length, 1);
});

test("P12 pre-attach tool call whose handler throws -> error event, once", async () => {
  const events: LiveEvent[] = []; let calls = 0;
  const s = new LiveSession({ onEvent: (e) => events.push(e), toolHandler: () => { calls++; throw new Error("kb down"); } });
  const b = new MockLiveBackend(); b.bind(s);
  b.emitToolCall({ id: "t1", name: "kb", args: {} });
  assert.equal(calls, 0, "handler not run before attach");
  s.attach(b);
  await new Promise((r) => setImmediate(r));
  assert.equal(calls, 1);
  assert.equal(of(events, "error").length, 1);
  assert.equal(of(events, "tool_call").length, 1);
});

test("P13 sendText: detector throws -> crisis (fail closed), not forwarded; typed crisis twice fires twice; harmless text scanned once and forwarded", async () => {
  let throwNext = true; const seen: string[] = [];
  const r = await rig({ detectCrisis: (t) => { seen.push(t); if (throwNext) { throwNext = false; throw new Error("x"); } return RE.test(t); } });
  r.s.sendText("hello?");
  assert.equal(of(r.events, "crisis").length, 1);
  assert.equal(r.b.calls.filter((c) => c.type === "text").length, 0);
  r.s.sendText("I will kill myself");
  assert.equal(of(r.events, "crisis").length, 2);
  r.s.sendText("what is the deadline");
  assert.deepEqual(r.b.calls.filter((c) => c.type === "text"), [{ type: "text", text: "what is the deadline" }]);
  assert.deepEqual(seen, ["hello?", "I will kill myself", "what is the deadline"]);
});

test("P14 M3 boundaries", async () => {
  await new MockLiveProvider().connect({ onEvent: () => {}, detectCrisis: () => true, crisisMessage: { text: "t", audio: new Uint8Array(2) } });
  await new MockLiveProvider().connect({ onEvent: () => {}, crisisMessage: { text: "t" } }); // no detector: text only is fine
  await assert.rejects(() => new MockLiveProvider().connect({ onEvent: () => {}, detectCrisis: () => true }), LiveConfigError);
  let opened = 0;
  const gp = new GeminiLiveProvider({ model: "m", connector: { connect: async () => { opened++; return { sendRealtimeInput() {}, sendToolResponse() {}, close() {} }; } } as never });
  await assert.rejects(() => gp.connect({ onEvent: () => {}, detectCrisis: () => true, crisisMessage: { text: "t" } }), LiveConfigError);
  assert.equal(opened, 0, "no transport opened for a refused config");
});

test("P15 OBSERVE: harmless typed text after a crisis (no speech, no turnComplete): is the model reply audible?", async () => {
  const r = await rig();
  r.b.emitInputTranscript("I will kill myself", false);
  r.b.emitInterrupted();
  r.s.sendText("what is the deadline");
  r.b.emitOutputAudio(pcm(5));
  console.log("P15 observed: model audio audible after typed harmless text post-crisis =", model(r.events));
});

test("P16 flags do not go stale: crisis -> turnComplete -> client interrupt -> backend interrupted -> audible; crisis -> speech -> interrupt -> interrupted -> audible", async () => {
  const r = await rig();
  r.b.emitInputTranscript("I will kill myself", false); r.b.emitTurnComplete();
  r.s.interrupt(); r.b.emitInterrupted(); r.b.emitOutputAudio(pcm(2));
  assert.equal(model(r.events), 1);
  const q = await rig();
  q.b.emitInputTranscript("I will kill myself", true); q.b.emitInputTranscript("ok", false);
  q.s.interrupt(); q.b.emitInterrupted(); q.b.emitOutputAudio(pcm(2));
  assert.equal(model(q.events), 1);
});

test("P17 close right after crisis: no throw, interrupted turn stored once", async () => {
  const r = await rig();
  r.b.emitOutputTranscript("half");
  r.b.emitInputTranscript("I will kill myself", false);
  r.s.close();
  await r.s.drain();
  assert.equal(r.tr.filter((t) => t.text === "half").length, 1);
});
