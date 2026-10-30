/**
 * T-060 / D-143: the Live provider exposes a provider turn id per model turn. Offline, SYNTHETIC only.
 *
 *   C1 provider  output, turn_complete and interrupted events carry the id the transport reported; sendText returns the id of
 *                the turn that answers it, so a caller can tell its own turn from an earlier reply.
 *   C2 compat    a transport that reports no id leaves every event and sendText exactly as before (no turnId key at all).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MockLiveProvider, type LiveEvent } from "../src/live.js";

async function connect() {
  const events: LiveEvent[] = [];
  const provider = new MockLiveProvider();
  const session = await provider.connect({ onEvent: (e) => events.push(e) });
  return { events, session, be: provider.last };
}

test("T-060 C1: model output and turn_complete carry the provider turn id; sendText returns the id of the turn that answers it", async () => {
  const { events, session, be } = await connect();
  be.textTurnId = () => "turn-readout";
  assert.equal(session.sendText("read this aloud"), "turn-readout");
  be.emitOutputAudio(new Uint8Array(4), "turn-reply");
  be.emitOutputTranscript("hello", "turn-reply");
  be.emitTurnComplete("turn-reply");
  be.emitOutputTranscript("question", "turn-readout");
  be.emitInterrupted("turn-readout");
  const audio = events.find((e) => e.type === "audio");
  assert.equal(audio?.type === "audio" && audio.turnId, "turn-reply");
  const partials = events.filter((e) => e.type === "transcript" && !e.final);
  assert.deepEqual(partials.map((e) => (e.type === "transcript" ? e.turnId : "?")), ["turn-reply", "turn-readout"]);
  const tc = events.find((e) => e.type === "turn_complete");
  assert.equal(tc?.type === "turn_complete" && tc.turnId, "turn-reply");
  const it = events.find((e) => e.type === "interrupted");
  assert.equal(it?.type === "interrupted" && it.turnId, "turn-readout");
});

test("T-060 C2: a transport without a turn id changes nothing: no turnId key on any event, sendText returns undefined", async () => {
  const { events, session, be } = await connect();
  assert.equal(session.sendText("hi"), undefined);
  be.emitOutputAudio(new Uint8Array(4));
  be.emitOutputTranscript("hello");
  be.emitTurnComplete();
  be.emitInterrupted();
  for (const e of events) assert.equal("turnId" in e, false, `no turnId key on ${e.type}`);
  assert.ok(events.some((e) => e.type === "turn_complete"));
});

test("T-060 C2: a crisis text gets no turn id (the fixed message owns the floor, the model is not prompted)", async () => {
  const events: LiveEvent[] = [];
  const provider = new MockLiveProvider();
  const session = await provider.connect({
    onEvent: (e) => events.push(e),
    detectCrisis: (t) => t.includes("hurt myself"),
    crisisMessage: { text: "fixed helpline text" },
  });
  provider.last.textTurnId = () => "turn-x";
  assert.equal(session.sendText("I want to hurt myself"), undefined);
  assert.equal(provider.last.calls.some((c) => c.type === "text"), false);
});
