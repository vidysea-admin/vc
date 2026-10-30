/**
 * T-060 / D-143: the voice readout is attributed by the provider turn id. A reply whose first output arrives AFTER the readout
 * was dispatched (no turn was open at dispatch) is that reply's own turn, not the readout's. Offline, SYNTHETIC only.
 *
 *   C1 own-turn   fake Live session reporting turn ids: the late reply neither marks readout output nor arms the yes/no; the
 *                 readout's own turn (same id) does.
 *   C2 compat     an ordinary readout and reply keep their arrival-order attribution when ids are absent (the S13 rule), and when
 *                 the ids match the readout's own turn.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { tenantScopedDb, proposeProfileFact, decideProfileFact, listProfileFacts } from "@vc/db";
import { adult, newThread, studentToken, until, voiceWorld, type VoiceWorld, type VoiceWorldOptions } from "./voice-fixtures.js";

async function withWorld(fn: (w: VoiceWorld, threadId: string) => Promise<void>, opts?: VoiceWorldOptions): Promise<void> {
  const w = await voiceWorld(opts);
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()), "stu-1");
    await fn(w, threadId);
  } finally {
    await w.cleanup();
  }
}
const speak = (w: VoiceWorld, text: string) => w.provider.backends[0]!.emitInputTranscript(text, true);
const deps = { extractFacts: async () => [{ key: "interest", value: "astronomy" }] };

async function seed(w: VoiceWorld) {
  const db = tenantScopedDb(w.rawDb, "tenant-a");
  const fact = await proposeProfileFact(db, { studentId: "stu-1", key: "interest", value: "biology" });
  await decideProfileFact(db, { studentId: "stu-1", factId: fact!.factId, action: "confirm" });
  return db;
}

test("T-060 C1: a reply whose first output arrives after the readout dispatch is its own turn, so it does not arm the yes/no", async () => {
  await withWorld(async (w, threadId) => {
    const db = await seed(w);
    const a = await w.open(adult(), threadId);
    const be = w.provider.backends[0]!;
    be.textTurnId = () => "turn-readout";
    speak(w, "I now prefer astronomy");
    await until(() => a.client.of("confirm").length === 1, "prompt");
    assert.ok(be.calls.some((c) => c.type === "text" && JSON.stringify(c).includes("astronomy")), "the readout prompt was sent");
    // The reply to the student's own utterance: its FIRST output comes after the dispatch, and no turn was open at dispatch.
    be.emitOutputTranscript("Nice, astronomy is great.", "turn-reply");
    be.emitTurnComplete("turn-reply");
    await until(() => a.client.of("state").length === 1, "the reply's turn_complete drained");
    a.client.sendAudio(); await until(() => be.audioIn.length === 1, "mic frame before the readout was spoken");
    speak(w, "yes");
    await until(() => a.client.of("transcript.final").some((e) => e.text === "yes"), "early yes recorded as plain speech");
    assert.equal(a.client.closed, false);
    let row = (await listProfileFacts(db, { studentId: "stu-1" }))[0]!;
    assert.equal(row.value, "biology"); assert.ok(row.pendingChange, "the reply's turn_complete did not arm the answer");
    // The readout's own turn (same id) arms it.
    be.emitOutputTranscript("Should I remember interest as astronomy?", "turn-readout");
    be.emitTurnComplete("turn-readout");
    await until(() => a.client.of("state").length === 2, "readout done");
    a.client.sendAudio(); await until(() => be.audioIn.length === 2, "mic frame after readout");
    speak(w, "yes");
    await until(() => a.client.closed, "the answer after the readout decides");
    row = (await listProfileFacts(db, { studentId: "stu-1" }))[0]!;
    assert.equal(row.value, "astronomy"); assert.equal(row.pendingChange, undefined);
  }, { deps });
});

test("T-060 C2: with matching turn ids an ordinary readout still arms the yes/no, and an early yes decides nothing", async () => {
  await withWorld(async (w, threadId) => {
    const db = await seed(w);
    const a = await w.open(adult(), threadId);
    const be = w.provider.backends[0]!;
    be.textTurnId = () => "turn-readout";
    speak(w, "I now prefer astronomy");
    await until(() => a.client.of("confirm").length === 1, "prompt");
    a.client.sendAudio(); await until(() => be.audioIn.length === 1, "mic frame during readout");
    speak(w, "yes");
    await until(() => a.client.of("transcript.final").some((e) => e.text === "yes"), "early yes recorded as plain speech");
    assert.ok((await listProfileFacts(db, { studentId: "stu-1" }))[0]!.pendingChange, "the early yes decided nothing");
    be.emitOutputTranscript("Should I remember interest as astronomy?", "turn-readout");
    be.emitOutputAudio(new Uint8Array(480), "turn-readout");
    be.emitTurnComplete("turn-readout");
    await until(() => a.client.of("state").length === 1, "readout done");
    a.client.sendAudio(); await until(() => be.audioIn.length === 2, "mic frame after readout");
    speak(w, "yes");
    await until(() => a.client.closed, "the answer after the readout decides");
    const row = (await listProfileFacts(db, { studentId: "stu-1" }))[0]!;
    assert.equal(row.value, "astronomy"); assert.equal(row.pendingChange, undefined);
  }, { deps });
});

test("T-060 C2: events with a turn id but a readout dispatched without one fall back to arrival order (no id, no change)", async () => {
  await withWorld(async (w, threadId) => {
    const db = await seed(w);
    const a = await w.open(adult(), threadId);
    const be = w.provider.backends[0]!; // no textTurnId: the readout has no provider id
    speak(w, "I now prefer astronomy");
    await until(() => a.client.of("confirm").length === 1, "prompt");
    be.emitOutputTranscript("Should I remember interest as astronomy?", "turn-7");
    be.emitTurnComplete("turn-7");
    await until(() => a.client.of("state").length === 1, "readout done");
    a.client.sendAudio(); await until(() => be.audioIn.length === 1, "mic frame after readout");
    speak(w, "yes");
    await until(() => a.client.closed, "the answer after the readout decides");
    assert.equal((await listProfileFacts(db, { studentId: "stu-1" }))[0]!.value, "astronomy");
  }, { deps });
});
