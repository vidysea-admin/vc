import { test } from "node:test";
import assert from "node:assert/strict";
import { MockLiveProvider, type LiveEvent, type LiveSessionConfig } from "../src/index.js";

const pcm = (n: number, fill = 1) => new Uint8Array(n * 2).fill(fill);
const RE = /kill myself|end my life|suicide/i;
const FIXED = { text: "Call Tele-MANAS 14416", audio: pcm(8, 7) };
const of = <T extends LiveEvent["type"]>(ev: LiveEvent[], t: T) => ev.filter((e): e is Extract<LiveEvent, { type: T }> => e.type === t);
const model = (ev: LiveEvent[]) => of(ev, "audio").filter((a) => !a.fixed).length;
const fixed = (ev: LiveEvent[]) => of(ev, "audio").filter((a) => a.fixed).length;
async function rig(over: Partial<LiveSessionConfig> = {}) {
  const events: LiveEvent[] = [];
  const clock = { t: 0 };
  const p = new MockLiveProvider();
  const s = await p.connect({ onEvent: (e) => events.push(e), detectCrisis: (t) => RE.test(t), crisisMessage: FIXED, toolHandler: (c) => ({ ok: c.id }), monotonicNow: () => clock.t, ...over });
  return { s, b: p.last, events, clock };
}

test("a: crisis -> turnComplete -> same-utterance chunk 300ms -> model audio: 0 emitted (also with final=true chunk)", async () => {
  for (const fin of [false, true]) {
    const r = await rig();
    r.b.emitInputTranscript("I will kill myself", false);
    r.b.emitTurnComplete();
    r.clock.t = 300;
    r.b.emitInputTranscript("because of exams", fin);
    r.b.emitOutputAudio(pcm(5));
    assert.equal(model(r.events), 0, `final=${fin}`);
    assert.equal(of(r.events, "crisis").length, 1);
    assert.equal(fixed(r.events), 1);
  }
});
test("a2: dense chunks every 100ms for 5s after turnComplete never lift", async () => {
  const r = await rig();
  r.b.emitInputTranscript("I will kill myself", false);
  r.b.emitTurnComplete();
  for (let t = 100; t <= 5000; t += 100) { r.clock.t = t; r.b.emitInputTranscript("and", false); }
  r.b.emitOutputAudio(pcm(5));
  assert.equal(model(r.events), 0);
  assert.equal(of(r.events, "crisis").length, 1);
});
test("b: crisis -> interrupted -> chunk 1300ms later -> heard; boundary 1200 exact heard; 1199 muted", async () => {
  for (const [gap, heard] of [[1300, 1], [1200, 1], [1199, 0]] as const) {
    const r = await rig();
    r.b.emitInputTranscript("I will kill myself", false);
    r.b.emitInterrupted();
    r.clock.t = gap;
    r.b.emitInputTranscript("okay", false);
    r.b.emitOutputAudio(pcm(5));
    assert.equal(model(r.events), heard, `gap=${gap}`);
  }
});
test("b2: crisis -> NO turnComplete/interrupted -> chunk after long gap -> still muted", async () => {
  const r = await rig();
  r.b.emitInputTranscript("I will kill myself", false);
  r.clock.t = 60000;
  r.b.emitInputTranscript("okay", false);
  r.b.emitOutputAudio(pcm(5));
  assert.equal(model(r.events), 0);
  r.clock.t = 120000;
  r.b.emitInputTranscript("still talking", true);
  r.b.emitOutputAudio(pcm(5));
  assert.equal(model(r.events), 0);
});
test("c: crisis -> toolCall -> turnComplete -> chunk 100ms later -> 0 model audio", async () => {
  const r = await rig();
  r.b.emitInputTranscript("I will kill myself", false);
  r.b.emitToolCall({ id: "t1", name: "x", args: {} });
  r.b.emitTurnComplete();
  r.clock.t = 100;
  r.b.emitInputTranscript("because of exams", false);
  r.b.emitOutputAudio(pcm(5));
  assert.equal(model(r.events), 0);
  assert.equal(of(r.events, "crisis").length, 1);
  assert.equal(fixed(r.events), 1);
});
test("c2: crisis -> toolCall only (no turn end) -> chunk after long gap -> muted", async () => {
  const r = await rig();
  r.b.emitInputTranscript("I will kill myself", false);
  r.b.emitToolCall({ id: "t1", name: "x", args: {} });
  r.clock.t = 9000;
  r.b.emitInputTranscript("ok", false);
  r.b.emitOutputAudio(pcm(5));
  assert.equal(model(r.events), 0);
});
test("d: second crisis in a NEW utterance refires once; duplicate in same utterance does not; also when the lift chunk itself is the crisis", async () => {
  const r = await rig();
  r.b.emitInputTranscript("I will kill myself", false);
  r.b.emitTurnComplete();
  r.clock.t = 3000;
  r.b.emitInputTranscript("I want to end my life", false); // lift chunk is itself a crisis
  assert.equal(of(r.events, "crisis").length, 2);
  assert.equal(fixed(r.events), 2);
  r.clock.t = 3100;
  r.b.emitInputTranscript("suicide", false);
  r.b.emitInputTranscript("I will kill myself", false);
  assert.equal(of(r.events, "crisis").length, 2);
  assert.equal(fixed(r.events), 2);
  r.b.emitOutputAudio(pcm(5));
  assert.equal(model(r.events), 0, "re-armed");
  // third, after another turn end + pause
  r.b.emitInterrupted();
  r.clock.t = 9000;
  r.b.emitInputTranscript("kill myself, I will kill myself", false);
  assert.equal(of(r.events, "crisis").length, 3);
  assert.equal(fixed(r.events), 3);
});
test("d2: new utterance starts harmless, crisis words arrive in a later chunk of that utterance -> refires once", async () => {
  const r = await rig();
  r.b.emitInputTranscript("I will kill myself", false);
  r.b.emitTurnComplete();
  r.clock.t = 3000;
  r.b.emitInputTranscript("okay so", false);
  r.b.emitOutputAudio(pcm(5));
  assert.equal(model(r.events), 1);
  r.clock.t = 3200;
  r.b.emitInputTranscript("actually I want to end my life", false);
  assert.equal(of(r.events, "crisis").length, 2);
  r.b.emitInputTranscript("really", false);
  assert.equal(of(r.events, "crisis").length, 2);
});
test("e: typed message after a crisis does not lift the mute (harmless and with turn end + long time)", async () => {
  const r = await rig();
  r.b.emitInputTranscript("I will kill myself", false);
  r.b.emitTurnComplete();
  r.clock.t = 10000;
  r.s.sendText("what are the fees");
  r.b.emitOutputAudio(pcm(5));
  r.b.emitOutputTranscript("Fees are 5 lakh");
  assert.equal(model(r.events), 0);
  assert.ok(!of(r.events, "transcript").some((t) => /Fees are/.test(t.text)));
  r.clock.t = 20000;
  r.s.sendText("hello?");
  r.b.emitOutputAudio(pcm(5));
  assert.equal(model(r.events), 0);
});
test("e2: typed crisis during spoken-crisis mute fires again, does not lift", async () => {
  const r = await rig();
  r.b.emitInputTranscript("I will kill myself", false);
  r.s.sendText("I want to end my life");
  assert.equal(of(r.events, "crisis").length, 2);
  r.b.emitOutputAudio(pcm(5));
  assert.equal(model(r.events), 0);
});
test("f: no regression: client interrupt() mute (no crisis) lifts at turnComplete; no detector -> audio passes", async () => {
  const r = await rig();
  r.s.interrupt();
  r.b.emitOutputAudio(pcm(5));
  assert.equal(model(r.events), 0);
  r.b.emitTurnComplete();
  r.b.emitOutputAudio(pcm(5));
  assert.equal(model(r.events), 1);
  const r2 = await rig({ detectCrisis: undefined, crisisMessage: undefined });
  r2.b.emitInputTranscript("hello", false);
  r2.b.emitOutputAudio(pcm(5));
  assert.equal(model(r2.events), 1);
});
test("g: crisisResumeGapMs validation", async () => {
  for (const bad of [-1, NaN, Infinity]) {
    await assert.rejects(rig({ crisisResumeGapMs: bad }), /crisisResumeGapMs/);
  }
});
test("h: default clock (performance.now) works: crisis -> turnComplete -> immediate chunk stays muted in real time", async () => {
  const events: LiveEvent[] = [];
  const p = new MockLiveProvider();
  await p.connect({ onEvent: (e) => events.push(e), detectCrisis: (t) => RE.test(t), crisisMessage: FIXED });
  const b = p.last;
  b.emitInputTranscript("I will kill myself", false);
  b.emitTurnComplete();
  b.emitInputTranscript("because of exams", false);
  b.emitOutputAudio(pcm(5));
  assert.equal(model(events), 0);
});
