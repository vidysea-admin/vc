/**
 * U10 C18 (cycle 3, D-099): the crisis escalation carries the words of the crisis utterance ITSELF, identified at crisis time,
 * never an earlier student turn picked by seq adjacency. Shape of the failing probe (PA20/P1): a student turn is spoken and never
 * answered, then a crisis utterance with no words of its own; the fixed reply lands right after the earlier turn's seq.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { VOICE_CRISIS_NO_WORDS_TEXT } from "../src/voice.js";
import { CRISIS_PHRASE, adult, minorNoConsent, newThread, studentToken, until, voiceWorld, type VoiceWorld } from "./voice-fixtures.js";
import { CRISIS_RESUME_GAP_MS_DEFAULT, type LiveCrisisDetector } from "@vc/providers";
import { STUDENT_CRISIS_MESSAGE } from "@vc/engine";

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
      crisis: { detect: detector },
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

test("LK4: the voice escalation carries the detected language of the utterance (Devanagari hi, Latin Hinglish hi-Latn, English en), not an inline Devanagari test", async () => {
  const cases: [string, string][] = [
    [`${CRISIS_PHRASE} मुझे बहुत बुरा लग रहा है`, "hi"],
    [`${CRISIS_PHRASE} mujhe bahut bura lag raha hai`, "hi-Latn"],
    [`${CRISIS_PHRASE} tonight`, "en"],
  ];
  for (const [utterance, lang] of cases) {
    await run(detectEmptyFires, async (w, escalations) => {
      speak(w, utterance);
      await until(() => escalations.length === 1, "escalated");
      await w.voice.settled();
      assert.equal(escalations[0].turns[0].lang, lang, utterance);
      assert.equal(escalations[0].turns[0].text, utterance, "the original words are escalated");
    });
  }
});

// ---- U10s (voice hardening before go-live) -----------------------------------------------------------------------------------------

/** A profile name that is not a string makes `redactPii` throw (`n.trim is not a function`): a reachable redaction failure, no mocking. */
const throwingNames = (): any => ({ profileNames: async () => [123 as unknown as string] });

async function runWith(
  extraDeps: Record<string, unknown>,
  body: (w: VoiceWorld, escalations: any[]) => Promise<void>,
  claims: Record<string, unknown> = adult(),
): Promise<void> {
  const escalations: any[] = [];
  const w = await voiceWorld({
    deps: {
      crisis: { detect: detectEmptyFires },
      escalateForTenant: () => async (input: any) => void escalations.push(input),
      ...extraDeps,
    } as any,
  });
  try {
    const threadId = await newThread(w.chat, await studentToken(claims));
    await w.open(claims, threadId);
    await body(w, escalations);
  } finally {
    await w.cleanup();
  }
}

test("H1: redaction throws on the crisis words -> the flag is still written and the crisis is still escalated with the text-free marker, never the raw words", async () => {
  await runWith(throwingNames(), async (w, escalations) => {
    speak(w, `${CRISIS_PHRASE} secret-detail-xyz`);
    await until(() => escalations.length === 1, "escalated despite the redaction failure");
    await w.voice.settled();
    const text = escalatedText(escalations);
    assert.equal(text, VOICE_CRISIS_NO_WORDS_TEXT);
    assert.ok(!text.includes("kill") && !text.includes("secret-detail-xyz"), "raw words never escalated");
    assert.equal(w.fakeDb.collection<any>("student_flags").all().length, 1, "the crisis flag was written");
    const logged = JSON.stringify(w.logs);
    assert.ok(logged.includes("voice_crisis_redact_failed"), "the redaction failure is logged");
    assert.ok(!logged.includes("secret-detail-xyz") && !logged.includes("kill myself"), "the log carries no words");
  });
});

test("H3: two crises with no words in one session each escalate under their own turn id (not deduped into one)", async () => {
  await runWith({}, async (w, escalations) => {
    speak(w, EARLIER);
    answer(w, "Here is an answer about Germany.");
    speak(w, "   ");
    await until(() => escalations.length === 1, "first no-words crisis escalated");
    w.provider.backends[0]!.emitTurnComplete();
    await new Promise((r) => setTimeout(r, CRISIS_RESUME_GAP_MS_DEFAULT + 300));
    speak(w, "   ");
    await until(() => escalations.length === 2, "second no-words crisis escalated");
    await w.voice.settled();
    assert.equal(escalations[0].turns[0].text, VOICE_CRISIS_NO_WORDS_TEXT);
    assert.equal(escalations[1].turns[0].text, VOICE_CRISIS_NO_WORDS_TEXT);
    // The real port keys each record on sessionId:turnId:role:recipient: one id per crisis, or the second is a silent no-op upsert.
    assert.notEqual(escalations[0].turns[0].turnId, escalations[1].turns[0].turnId, "each crisis escalation has its own turn id");
    assert.equal(w.fakeDb.collection<any>("student_flags").all().length, 2, "and each crisis has its own flag");
  });
});

// ---- low leftovers (D-101): ISS-260 / ISS-261 / ISS-262 -----------------------------------------------------------------------------

/** The crisis gap: the mute lifts only on new speech after the model's turn ended and a pause longer than the resume gap. */
const nextUtterance = async (w: VoiceWorld) => {
  w.provider.backends[0]!.emitTurnComplete();
  await new Promise((r) => setTimeout(r, CRISIS_RESUME_GAP_MS_DEFAULT + 300));
};
const flagIds = (w: VoiceWorld): string[] => w.fakeDb.collection<any>("student_flags").all().map((f) => f.turnId as string);
const SPOKEN_ID = /^v[0-9a-f]{8}\d{6}$/; // the spoken turn's id: v<sid8><seq>
const CRISIS_ID = /^v[0-9a-f]{8}crisis[0-9a-f]{8}$/; // a crisis with no turn of its own, or whose spoken id was already used

test("ISS-260 H3 for an unconsented minor: the flag keeps the spoken turn id once, a second crisis on the same turn gets a fresh id, nothing is escalated", async () => {
  await runWith(
    {},
    async (w, escalations) => {
      speak(w, `${CRISIS_PHRASE} tonight`);
      await until(() => flagIds(w).length === 1, "first flag");
      await nextUtterance(w);
      speak(w, "   "); // a second crisis; the minor's words are never kept, and no new spoken turn exists to borrow
      await until(() => flagIds(w).length === 2, "second flag");
      await w.voice.settled();
      const [first, second] = flagIds(w);
      assert.match(first!, SPOKEN_ID, "the first flag keeps the spoken turn's id");
      assert.match(second!, CRISIS_ID, "the second crisis does not reuse the first's id");
      assert.notEqual(first, second);
      assert.equal(escalations.length, 0, "no text is stored for an unconsented minor, so nothing is escalated");
      assert.equal(w.fakeDb.collection<any>("chat_turns").all().length, 0, "and no turn is stored");
      assert.equal(w.logs.filter((l) => l.event === "voice_crisis_escalate_skipped_text_not_stored").length, 2, "each skip leaves a text-free log line");
    },
    minorNoConsent(),
  );
});

test("ISS-261 two worded crises each keep their own spoken turn id, flag and escalation agree with the stored turn, and no words cross over", async () => {
  await runWith({}, async (w, escalations) => {
    speak(w, `${CRISIS_PHRASE} first`);
    await until(() => escalations.length === 1, "first escalated");
    await nextUtterance(w);
    speak(w, `${CRISIS_PHRASE} second`);
    await until(() => escalations.length === 2, "second escalated");
    await w.voice.settled();
    const stored = w.fakeDb.collection<any>("chat_turns").all().filter((t) => t.role === "user");
    const idOf = (needle: string): string => stored.find((t) => String(t.text).includes(needle))!.turnId as string;
    const [f1, f2] = flagIds(w);
    assert.equal(f1, idOf("first"));
    assert.equal(f2, idOf("second"));
    assert.notEqual(f1, f2);
    assert.equal(escalations[0].turns[0].turnId, f1);
    assert.equal(escalations[1].turns[0].turnId, f2);
    assert.match(escalations[0].turns[0].text, /first/);
    assert.ok(!escalations[0].turns[0].text.includes("second"));
    assert.match(escalations[1].turns[0].text, /second/);
    assert.ok(!escalations[1].turns[0].text.includes("first"));
  });
});

test("ISS-261 a worded crisis, then a no-words crisis on the same turn: the second gets a fresh id and the text-free marker, never the first's words or id", async () => {
  await runWith({}, async (w, escalations) => {
    speak(w, `${CRISIS_PHRASE} first`);
    await until(() => escalations.length === 1, "first escalated");
    await nextUtterance(w);
    speak(w, "   ");
    await until(() => escalations.length === 2, "second escalated");
    await w.voice.settled();
    const [f1, f2] = flagIds(w);
    assert.match(f1!, SPOKEN_ID);
    assert.match(f2!, CRISIS_ID);
    assert.equal(escalations[1].turns[0].text, VOICE_CRISIS_NO_WORDS_TEXT);
    assert.notEqual(escalations[0].turns[0].turnId, escalations[1].turns[0].turnId);
  });
});

test("ISS-261 a throwing redaction on the first crisis does not touch the second: both are flagged under their own ids and escalated with the marker, no words logged", async () => {
  await runWith(throwingNames(), async (w, escalations) => {
    speak(w, `${CRISIS_PHRASE} secret-one-xyz`);
    await until(() => escalations.length === 1, "first escalated despite the redaction failure");
    await nextUtterance(w);
    speak(w, `${CRISIS_PHRASE} secret-two-xyz`);
    await until(() => escalations.length === 2, "second escalated despite the redaction failure");
    await w.voice.settled();
    for (const e of escalations) assert.equal(e.turns[0].text, VOICE_CRISIS_NO_WORDS_TEXT, "the marker, never the raw words");
    const ids = flagIds(w);
    assert.equal(ids.length, 2, "both crises are flagged");
    assert.notEqual(ids[0], ids[1]);
    assert.notEqual(escalations[0].turns[0].turnId, escalations[1].turns[0].turnId);
    assert.equal(w.logs.filter((l) => l.event === "voice_crisis_redact_failed").length, 2);
    const logged = JSON.stringify(w.logs);
    assert.ok(!logged.includes("secret-one-xyz") && !logged.includes("secret-two-xyz") && !logged.includes("kill myself"), "the log carries no words");
  });
});

test("ISS-262 ordering: the crisis record never reads a previous turn's id: a worded crisis after an answered earlier turn is flagged under its own spoken turn", async () => {
  await runWith({}, async (w, escalations) => {
    speak(w, EARLIER);
    answer(w, "Here is an answer about Germany.");
    speak(w, `${CRISIS_PHRASE} tonight`);
    await until(() => escalations.length === 1, "escalated");
    await w.voice.settled();
    const users = w.fakeDb.collection<any>("chat_turns").all().filter((t) => t.role === "user");
    const earlier = users.find((t) => String(t.text).includes("Germany"))!.turnId as string;
    const crisis = users.find((t) => String(t.text).includes("kill myself") || String(t.text).includes("tonight"))!.turnId as string;
    assert.notEqual(earlier, crisis);
    assert.deepEqual(flagIds(w), [crisis], "the flag carries the crisis utterance's own turn id, not the earlier turn's");
    assert.equal(escalations[0].turns[0].turnId, crisis);
  });
});

// ---------------------------------------------------------------------------
// voice-crisis-same-as-chat (Umesh 2026-10-29): a voice crisis behaves exactly like a chat crisis. The student gets the SAME
// STUDENT_CRISIS_MESSAGE text (one engine constant, never a copy), no pre-recorded audio is sent, there is exactly one crisis
// flag and one escalation, and no log line carries the student's words.
// ---------------------------------------------------------------------------
test("same-as-chat: a voice crisis shows the chat's STUDENT_CRISIS_MESSAGE once, sends no audio, writes one flag and one escalation, logs no words", async () => {
  const escalations: any[] = [];
  const w = await voiceWorld({ deps: { escalateForTenant: () => async (input) => void escalations.push(input) } });
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    const { client } = await w.open(adult(), threadId);
    w.provider.backends[0]!.emitOutputAudio(new Uint8Array(480).fill(9)); // the model is mid-sentence when the student speaks
    await until(() => client.frames.length === 1, "model audio before the crisis");
    speak(w, `${CRISIS_PHRASE} tonight`);
    await until(() => client.of("transcript.final").some((e) => e.role === "assistant" && e.text === STUDENT_CRISIS_MESSAGE), "the chat crisis message as a final assistant transcript");
    await until(() => escalations.length === 1, "escalated");
    w.provider.backends[0]!.emitOutputAudio(new Uint8Array(480).fill(9)); // the model carries on: muted
    await new Promise((r) => setTimeout(r, 60));
    await w.voice.settled().catch(() => undefined);
    assert.equal(client.of("transcript.final").filter((e) => e.text === STUDENT_CRISIS_MESSAGE).length, 1, "the message is sent once, not once per path");
    assert.equal(client.frames.length, 1, "no audio after the model's own chunk: no pre-recorded clip, and the muted model adds none");
    const types = client.events.map((e) => e.type + (e.type === "transcript.final" && e.text === STUDENT_CRISIS_MESSAGE ? "#crisis" : ""));
    assert.ok(types.indexOf("flag") < types.indexOf("state") && types.indexOf("state") < types.indexOf("transcript.final#crisis"), `order flag, state, message: ${types.join(",")}`);
    assert.deepEqual(w.provider.configs[0]!.crisisMessage, { text: STUDENT_CRISIS_MESSAGE }, "the session is configured with the engine constant and no audio");
    assert.equal(w.fakeDb.collection<any>("student_flags").all().filter((f: any) => f.kind === "crisis").length, 1, "exactly one crisis flag");
    assert.equal(escalations.length, 1, "exactly one escalation");
    assert.ok(!JSON.stringify(w.logs).includes("kill"), "no student words in a log line");
  } finally {
    await w.cleanup();
  }
});
