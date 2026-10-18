import { test } from "node:test";
import assert from "node:assert/strict";
import { LiveSession, MockLiveBackend, MockLiveProvider, type LiveEvent, type LiveSessionConfig } from "../src/index.js";

const pcm = (n: number, fill = 1) => new Uint8Array(n * 2).fill(fill);
const RE = /kill myself|end my life/i;
const FIXED = { text: "Call Tele-MANAS 14416", audio: pcm(8, 7) };
const of = <T extends LiveEvent["type"]>(ev: LiveEvent[], t: T) => ev.filter((e): e is Extract<LiveEvent, { type: T }> => e.type === t);
const model = (ev: LiveEvent[]) => of(ev, "audio").filter((a) => !a.fixed).length;
async function rig(over: Partial<LiveSessionConfig> = {}) {
  const events: LiveEvent[] = [];
  const p = new MockLiveProvider();
  const s = await p.connect({ onEvent: (e) => events.push(e), detectCrisis: (t) => RE.test(t), crisisMessage: FIXED, toolHandler: (c) => ({ ok: c.id }), ...over });
  return { s, b: p.last, events };
}

test("H1 BRIEF: crisis, toolCall, turnComplete, model audio, typed harmless -> no model audio", async () => {
  const r = await rig();
  r.b.emitInputTranscript("I will kill myself", false);
  r.b.emitToolCall({ id: "t1", name: "search_kb", args: {} });
  r.b.emitTurnComplete();
  r.b.emitOutputAudio(pcm(5));
  r.b.emitOutputTranscript("Here are some colleges");
  r.s.sendText("what about fees");
  r.b.emitOutputAudio(pcm(5));
  r.b.emitTurnComplete();
  r.b.emitOutputAudio(pcm(5));
  assert.equal(model(r.events), 0);
  assert.equal(of(r.events, "audio").filter((a) => a.fixed).length, 1);
  assert.equal(of(r.events, "transcript").filter((t) => /colleges/.test(t.text)).length, 0);
});
test("H2 order variant: crisis, interrupted, toolCall, turnComplete, toolCall, turnComplete, audio -> silent, then new speech lifts", async () => {
  const r = await rig();
  r.b.emitInputTranscript("I want to end my life", true);
  r.b.emitInterrupted(); r.b.emitToolCall({ id: "a", name: "x", args: {} }); r.b.emitTurnComplete();
  r.b.emitToolCall({ id: "b", name: "x", args: {} }); r.b.emitTurnComplete();
  r.b.emitOutputAudio(pcm(5));
  assert.equal(model(r.events), 0);
  r.b.emitInputTranscript("ok", true);
  r.b.emitOutputAudio(pcm(5));
  assert.equal(model(r.events), 1);
});
test("H3 crisis partial, toolCall, student continues same utterance (non-crisis words), audio -> silent, single fixed", async () => {
  const r = await rig();
  r.b.emitInputTranscript("I will kill myself", false);
  r.b.emitToolCall({ id: "t", name: "x", args: {} });
  r.b.emitInputTranscript("and also", false);
  r.b.emitInputTranscript("the exams", false);
  r.b.emitOutputAudio(pcm(5));
  assert.equal(model(r.events), 0);
  assert.equal(of(r.events, "crisis").length, 1);
  assert.equal(of(r.events, "audio").filter((a) => a.fixed).length, 1);
});
test("H4 toolCall BEFORE any crisis still ends the utterance normally (no regression)", async () => {
  const r = await rig();
  r.b.emitInputTranscript("show colleges", false);
  r.b.emitToolCall({ id: "t", name: "x", args: {} });
  r.b.emitInputTranscript("I will kill myself", false);
  assert.equal(of(r.events, "crisis").length, 1);
});
test("H5 typed crisis then model audio/turnComplete/toolCall: silent until speech", async () => {
  const r = await rig();
  r.s.sendText("i want to end my life");
  r.b.emitToolCall({ id: "t", name: "x", args: {} });
  r.b.emitTurnComplete();
  r.b.emitOutputAudio(pcm(5));
  assert.equal(model(r.events), 0);
  r.b.emitInputTranscript("hi", true);
  r.b.emitOutputAudio(pcm(5));
  assert.equal(model(r.events), 1);
});
test("H6 non-crisis client interrupt mute still lifts on turnComplete (no over-reach)", async () => {
  const r = await rig();
  r.s.interrupt();
  r.b.emitOutputAudio(pcm(5));
  assert.equal(model(r.events), 0);
  r.b.emitTurnComplete();
  r.b.emitOutputAudio(pcm(5));
  assert.equal(model(r.events), 1);
});
test("H7 second crisis after recovery re-arms the mute and the helpline", async () => {
  const r = await rig();
  r.b.emitInputTranscript("I will kill myself", true);
  r.b.emitTurnComplete();
  r.b.emitInputTranscript("fine", true);
  r.b.emitOutputAudio(pcm(5));
  assert.equal(model(r.events), 1);
  r.b.emitInputTranscript("I want to end my life", true);
  r.b.emitToolCall({ id: "t", name: "x", args: {} });
  r.b.emitTurnComplete();
  r.b.emitOutputAudio(pcm(5));
  assert.equal(model(r.events), 1);
  assert.equal(of(r.events, "audio").filter((a) => a.fixed).length, 2);
});
