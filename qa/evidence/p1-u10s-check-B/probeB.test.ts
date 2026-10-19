import assert from "node:assert/strict";
import test from "node:test";
import { VOICE_CRISIS_NO_WORDS_TEXT } from "../src/voice.js";
import { ChatConfigError, chatEnabledFromEnv } from "../src/chat.js";
import { CRISIS_AUDIO, CRISIS_PHRASE, CRISIS_TEXT_FIXED, adult, newThread, studentToken, until, voiceWorld, type VoiceWorld } from "./voice-fixtures.js";
import { CRISIS_RESUME_GAP_MS_DEFAULT, type LiveCrisisDetector } from "@vc/providers";

const speak = (w: VoiceWorld, text: string) => w.provider.backends[0]!.emitInputTranscript(text, true);
const answer = (w: VoiceWorld, text: string) => { w.provider.backends[0]!.emitOutputTranscript(text); w.provider.backends[0]!.emitTurnComplete(); };
const detectEmptyFires: LiveCrisisDetector = (text) => text.trim() === "" || text.includes(CRISIS_PHRASE) ? { crisis: true, level: "crisis" } : { crisis: false };
const gap = async (w: VoiceWorld) => { w.provider.backends[0]!.emitTurnComplete(); await new Promise((r) => setTimeout(r, CRISIS_RESUME_GAP_MS_DEFAULT + 300)); };

async function run(extra: Record<string, unknown>, body: (w: VoiceWorld, esc: any[]) => Promise<void>) {
  const esc: any[] = [];
  const w = await voiceWorld({ deps: { crisis: { message: { text: CRISIS_TEXT_FIXED, audio: CRISIS_AUDIO }, detect: detectEmptyFires }, escalateForTenant: () => async (i: any) => void esc.push(i), ...extra } as any });
  try { const t = await newThread(w.chat, await studentToken(adult())); await w.open(adult(), t); await body(w, esc); } finally { await w.cleanup(); }
}
const throwingNames = { profileNames: async () => [123 as unknown as string] };

test("PB-H1: throwing redaction with words: flag turnId = escalation turnId, marker in text AND translatedText, log has no words, then a LATER crisis still escalates", async () => {
  await run(throwingNames, async (w, esc) => {
    speak(w, `${CRISIS_PHRASE} zzsecretzz`);
    await until(() => esc.length === 1, "esc1");
    await w.voice.settled();
    const t = esc[0].turns[0];
    assert.equal(t.text, VOICE_CRISIS_NO_WORDS_TEXT); assert.equal(t.translatedText, VOICE_CRISIS_NO_WORDS_TEXT);
    const flags = w.fakeDb.collection<any>("student_flags").all();
    assert.equal(flags.length, 1); assert.equal(flags[0].turnId, t.turnId);
    const logs = JSON.stringify(w.logs);
    assert.ok(logs.includes("voice_crisis_redact_failed")); assert.ok(!logs.includes("zzsecretzz") && !logs.includes("kill"));
    assert.ok(!JSON.stringify(esc).includes("zzsecretzz"));
    await gap(w);
    speak(w, `${CRISIS_PHRASE} again zzsecret2`);
    await until(() => esc.length === 2, "esc2");
    await w.voice.settled();
    assert.equal(esc[1].turns[0].text, VOICE_CRISIS_NO_WORDS_TEXT);
    assert.notEqual(esc[0].turns[0].turnId, esc[1].turns[0].turnId);
    assert.equal(w.fakeDb.collection<any>("student_flags").all().length, 2);
  });
});

test("PB-H3: three crises (words, none, none) -> 3 distinct ids, flags == escalations 1:1; two WITH words also distinct", async () => {
  await run({}, async (w, esc) => {
    speak(w, `${CRISIS_PHRASE} first`);
    await until(() => esc.length === 1, "e1");
    await gap(w);
    speak(w, "   ");
    await until(() => esc.length === 2, "e2");
    await gap(w);
    speak(w, "   ");
    await until(() => esc.length === 3, "e3");
    await gap(w);
    speak(w, `${CRISIS_PHRASE} fourth`);
    await until(() => esc.length === 4, "e4");
    await w.voice.settled();
    const ids = esc.map((e) => e.turns[0].turnId);
    assert.equal(new Set(ids).size, 4, JSON.stringify(ids));
    const flags = w.fakeDb.collection<any>("student_flags").all();
    assert.equal(flags.length, 4);
    assert.deepEqual(flags.map((f: any) => f.turnId).sort(), [...ids].sort());
    console.log("PBIDS", JSON.stringify(ids));
  });
});

test("PB-H3b: same session: no-words crisis directly after an answered turn does not reuse that turn id (both ids unique, flags unique)", async () => {
  await run({}, async (w, esc) => {
    speak(w, "hello about Germany"); answer(w, "ok");
    speak(w, "   "); await until(() => esc.length === 1, "e1");
    await gap(w);
    speak(w, "   "); await until(() => esc.length === 2, "e2");
    await w.voice.settled();
    assert.notEqual(esc[0].turns[0].turnId, esc[1].turns[0].turnId);
    assert.equal(w.fakeDb.collection<any>("student_flags").all().length, 2);
  });
});

test("PB-H4: env flag hostile values", () => {
  for (const ok of [undefined, "", "false"]) assert.equal(chatEnabledFromEnv({ VC_CHAT_ENABLED: ok }), false);
  assert.equal(chatEnabledFromEnv({ VC_CHAT_ENABLED: "true" }), true);
  for (const bad of ["True", "TRUE", "true\n", "true\r\n", " true", "false\r\n", "﻿true", "0", "true,", "​true", "false\t", "  "])
    assert.throws(() => chatEnabledFromEnv({ VC_CHAT_ENABLED: bad }), ChatConfigError, JSON.stringify(bad));
  assert.equal(chatEnabledFromEnv({ OTHER: "x" }), false);
});
