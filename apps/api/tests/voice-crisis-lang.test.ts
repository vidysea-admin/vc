/**
 * T-061 (D-143): a voice crisis reply is in the student's language, picked by the chat's own function (crisisMessageFor over
 * detectLanguageOffline), so a Hindi (Devanagari) student gets the vetted Hindi message and a Hinglish (Roman-script) student the vetted
 * Hinglish one, as in chat. English is unchanged. Real voice API, MockLiveProvider, fake Db; every utterance is invented.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CRISIS_MESSAGES, STUDENT_CRISIS_MESSAGE, crisisMessageFor, detectLanguageOffline } from "@vc/engine";
import { CRISIS_PHRASE, adult, newThread, studentToken, until, voiceWorld } from "./voice-fixtures.js";
import type { LiveCrisisDetector } from "@vc/providers";

const detect: LiveCrisisDetector = (text) => (text.includes(CRISIS_PHRASE) ? { crisis: true, level: "crisis" } : { crisis: false });

async function crisisReplyFor(utterance: string): Promise<{ replies: string[]; escalations: any[]; configuredText: string }> {
  const escalations: any[] = [];
  const w = await voiceWorld({ deps: { crisis: { detect }, escalateForTenant: () => async (input) => void escalations.push(input) } });
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    const { client } = await w.open(adult(), threadId);
    w.provider.backends[0]!.emitInputTranscript(utterance, true);
    await until(() => client.of("transcript.final").some((e) => e.role === "assistant"), "a final assistant transcript after the crisis");
    await until(() => escalations.length === 1, "escalated");
    await w.voice.settled().catch(() => undefined);
    return {
      replies: client.of("transcript.final").filter((e) => e.role === "assistant").map((e) => e.text as string),
      escalations,
      configuredText: w.provider.configs[0]!.crisisMessage!.text,
    };
  } finally {
    await w.cleanup();
  }
}

test("C1: a Hindi (Devanagari) voice crisis gets the chat's Hindi student crisis message", async () => {
  const utterance = `${CRISIS_PHRASE} मुझे बहुत बुरा लग रहा है`;
  assert.equal(detectLanguageOffline(utterance).lang, "hi");
  const r = await crisisReplyFor(utterance);
  assert.notEqual(CRISIS_MESSAGES.hi.student, STUDENT_CRISIS_MESSAGE);
  assert.deepEqual(r.replies, [crisisMessageFor("hi", "student")]);
  assert.equal(r.escalations.length, 1, "still escalated once");
});

test("C1: a Hinglish (Roman-script) voice crisis gets the chat's hi-Latn student crisis message", async () => {
  const utterance = `${CRISIS_PHRASE} mujhe bahut bura lag raha hai`;
  assert.equal(detectLanguageOffline(utterance).lang, "hi-Latn");
  const r = await crisisReplyFor(utterance);
  assert.notEqual(CRISIS_MESSAGES["hi-Latn"].student, STUDENT_CRISIS_MESSAGE);
  assert.deepEqual(r.replies, [crisisMessageFor("hi-Latn", "student")]);
  assert.equal(r.escalations.length, 1, "still escalated once");
});

test("C2: an English voice crisis is unchanged: the English student message, once", async () => {
  const r = await crisisReplyFor(`${CRISIS_PHRASE} tonight`);
  assert.deepEqual(r.replies, [STUDENT_CRISIS_MESSAGE]);
  assert.equal(r.escalations.length, 1);
});

test("C2: before any crisis the session is configured with the English message (a session never starts without a non-empty message)", async () => {
  const w = await voiceWorld({ deps: { crisis: { detect } } });
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    await w.open(adult(), threadId);
    assert.deepEqual(w.provider.configs[0]!.crisisMessage, { text: STUDENT_CRISIS_MESSAGE });
  } finally {
    await w.cleanup();
  }
});

test("C2: a later English crisis after a Hindi one in the same session is answered in English (language follows the utterance, not the session)", async () => {
  const w = await voiceWorld({ deps: { crisis: { detect } } });
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    const { client } = await w.open(adult(), threadId);
    const b = w.provider.backends[0]!;
    b.emitInputTranscript(`${CRISIS_PHRASE} मुझे बहुत बुरा लग रहा है`, true);
    await until(() => client.of("transcript.final").some((e) => e.role === "assistant" && e.text === crisisMessageFor("hi", "student")), "the Hindi message");
    b.emitTurnComplete();
    await new Promise((r) => setTimeout(r, 1300)); // past the crisis resume gap
    b.emitInputTranscript(`${CRISIS_PHRASE} tonight`, true);
    await until(() => client.of("transcript.final").some((e) => e.role === "assistant" && e.text === STUDENT_CRISIS_MESSAGE), "the English message");
  } finally {
    await w.cleanup();
  }
});

test("C2: a model final whose text equals the crisis message is still an ordinary model reply (relayed with a turn id, not the fixed path) and no crisis fires", async () => {
  const escalations: any[] = [];
  const w = await voiceWorld({ deps: { crisis: { detect }, escalateForTenant: () => async (input) => void escalations.push(input) } });
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    const { client } = await w.open(adult(), threadId);
    const b = w.provider.backends[0]!;
    b.emitInputTranscript("tell me about studying in Germany", true);
    b.emitOutputTranscript(STUDENT_CRISIS_MESSAGE);
    b.emitTurnComplete();
    await until(() => client.of("transcript.final").some((e) => e.role === "assistant" && e.text === STUDENT_CRISIS_MESSAGE), "the model final relayed");
    const reply = client.of("transcript.final").find((e) => e.role === "assistant" && e.text === STUDENT_CRISIS_MESSAGE)!;
    assert.equal(typeof reply.turnId, "string", "an ordinary reply carries a turn id");
    assert.equal(escalations.length, 0);
    assert.equal(client.of("flag").filter((e) => e.reason === "crisis_detected").length, 0);
  } finally {
    await w.cleanup();
  }
});
