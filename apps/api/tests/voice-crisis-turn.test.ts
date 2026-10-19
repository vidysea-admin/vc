/**
 * U10 C18 (cycle 3, D-099): the crisis escalation carries the words of the crisis utterance ITSELF, identified at crisis time,
 * never an earlier student turn picked by seq adjacency. Shape of the failing probe (PA20/P1): a student turn is spoken and never
 * answered, then a crisis utterance with no words of its own; the fixed reply lands right after the earlier turn's seq.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { VOICE_CRISIS_NO_WORDS_TEXT } from "../src/voice.js";
import { CRISIS_AUDIO, CRISIS_PHRASE, CRISIS_TEXT_FIXED, adult, newThread, studentToken, until, voiceWorld, type VoiceWorld } from "./voice-fixtures.js";
import { CRISIS_RESUME_GAP_MS_DEFAULT, type LiveCrisisDetector } from "@vc/providers";

const EARLIER = "my earlier unanswered question about Germany";

const speak = (w: VoiceWorld, text: string) => w.provider.backends[0]!.emitInputTranscript(text, true);
const answer = (w: VoiceWorld, text: string) => {
  w.provider.backends[0]!.emitOutputTranscript(text);
  w.provider.backends[0]!.emitTurnComplete();
};

/** Fires on an empty utterance and on the crisis phrase; throws on anything containing "DETECTOR-THROWS". */
const detect: LiveCrisisDetector = (text) => {
  if (text.includes("DETECTOR-THROWS")) throw new Error("detector down");
  if (text.trim() === "") throw new Error("detector down on an empty utterance");
  return text.includes(CRISIS_PHRASE) ? { crisis: true, level: "crisis" } : { crisis: false };
};
const detectEmptyFires: LiveCrisisDetector = (text) =>
  text.trim() === "" || text.includes(CRISIS_PHRASE) ? { crisis: true, level: "crisis" } : { crisis: false };

async function run(
  detector: LiveCrisisDetector,
  body: (w: VoiceWorld, escalations: any[]) => Promise<void>,
): Promise<void> {
  const escalations: any[] = [];
  const w = await voiceWorld({
    deps: {
      crisis: { message: { text: CRISIS_TEXT_FIXED, audio: CRISIS_AUDIO }, detect: detector },
      escalateForTenant: () => async (input) => void escalations.push(input),
    },
  });
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    await w.open(adult(), threadId);
    await body(w, escalations);
  } finally {
    await w.cleanup();
  }
}

const escalatedText = (escalations: any[]): string => {
  assert.equal(escalations.length, 1, "exactly one escalation");
  const turn = escalations[0].turns[0];
  assert.equal(turn.translatedText, turn.text);
  return turn.text as string;
};

test("C18 (a): an unanswered earlier turn, then a crisis with no words of its own -> the text-free marker, never the earlier words", async () => {
  await run(detectEmptyFires, async (w, escalations) => {
    speak(w, EARLIER);
    speak(w, "   ");
    await until(() => escalations.length === 1, "escalated");
    await w.voice.settled();
    const text = escalatedText(escalations);
    assert.equal(text, VOICE_CRISIS_NO_WORDS_TEXT);
    assert.ok(!text.includes("Germany") && !text.includes("earlier"));
    assert.equal(w.fakeDb.collection<any>("student_flags").all().length, 1);
  });
});

test("C18 (b): an unanswered earlier turn, then a crisis WITH words -> those words only", async () => {
  await run(detectEmptyFires, async (w, escalations) => {
    speak(w, EARLIER);
    speak(w, `${CRISIS_PHRASE} tonight`);
    await until(() => escalations.length === 1, "escalated");
    await w.voice.settled();
    const text = escalatedText(escalations);
    assert.match(text, /kill myself tonight/);
    assert.ok(!text.includes("Germany") && !text.includes("earlier"), "only the crisis utterance's own words");
  });
});

test("C18 (c): an answered earlier turn (a seq gap), then a crisis with no words -> the marker", async () => {
  await run(detectEmptyFires, async (w, escalations) => {
    speak(w, EARLIER);
    answer(w, "Here is an answer about Germany.");
    speak(w, "   ");
    await until(() => escalations.length === 1, "escalated");
    await w.voice.settled();
    const text = escalatedText(escalations);
    assert.equal(text, VOICE_CRISIS_NO_WORDS_TEXT);
    assert.ok(!text.includes("Germany"));
  });
});

test("C18 (d1): the detector throws on an utterance with words -> fail-closed escalation with that utterance's own words only", async () => {
  await run(detect, async (w, escalations) => {
    speak(w, EARLIER);
    speak(w, "DETECTOR-THROWS please help me");
    await until(() => escalations.length === 1, "escalated");
    await w.voice.settled();
    const text = escalatedText(escalations);
    assert.match(text, /please help me/);
    assert.ok(!text.includes("Germany") && !text.includes("earlier"));
    assert.equal(w.fakeDb.collection<any>("student_flags").all().length, 1);
  });
});

test("C18 (d2): the detector throws on an utterance with no words -> fail-closed escalation with the marker, never the earlier words", async () => {
  await run(detect, async (w, escalations) => {
    speak(w, EARLIER);
    speak(w, "   ");
    await until(() => escalations.length === 1, "escalated");
    await w.voice.settled();
    const text = escalatedText(escalations);
    assert.equal(text, VOICE_CRISIS_NO_WORDS_TEXT);
    assert.ok(!text.includes("Germany"));
  });
});

test("C18 (e): two crises in a row each carry their own utterance's words (the first's words never leak into the second)", async () => {
  await run(detectEmptyFires, async (w, escalations) => {
    speak(w, `${CRISIS_PHRASE} first`);
    await until(() => escalations.length === 1, "first escalated");
    // The crisis mute lifts only on new speech after the turn ended and a real pause longer than the resume gap.
    w.provider.backends[0]!.emitTurnComplete();
    await new Promise((r) => setTimeout(r, CRISIS_RESUME_GAP_MS_DEFAULT + 300));
    speak(w, EARLIER);
    speak(w, "   ");
    await until(() => escalations.length === 2, "second escalated");
    await w.voice.settled();
    assert.match(escalations[0].turns[0].text, /kill myself first/);
    assert.equal(escalations[1].turns[0].text, VOICE_CRISIS_NO_WORDS_TEXT);
  });
});
