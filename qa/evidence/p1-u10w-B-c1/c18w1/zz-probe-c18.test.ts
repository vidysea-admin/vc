/** Hostile probes for C18 / W1 (checker B, sub-checker c18w1). Scratch copy only. */
import assert from "node:assert/strict";
import test from "node:test";
import { COLLECTION_NAMES } from "@vc/db";
import { CRISIS_RESUME_GAP_MS_DEFAULT, type LiveCrisisDetector } from "@vc/providers";
import { VOICE_CRISIS_NO_WORDS_TEXT, type VoiceApiDeps } from "../src/voice.js";
import { CRISIS_AUDIO, CRISIS_PHRASE, CRISIS_TEXT_FIXED, adult, minorConsent, minorNoConsent, newThread, studentToken, until, voiceWorld, type VoiceWorld } from "./voice-fixtures.js";

const EARLIER = "my earlier unanswered question about Germany";
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const speak = (w: VoiceWorld, text: string, final = true) => w.provider.backends[0]!.emitInputTranscript(text, final);
const liftMute = async (w: VoiceWorld) => {
  w.provider.backends[0]!.emitTurnComplete();
  await sleep(CRISIS_RESUME_GAP_MS_DEFAULT + 300);
};
const detectEmptyFires: LiveCrisisDetector = (text) =>
  text.trim() === "" || text.includes(CRISIS_PHRASE) ? { crisis: true, level: "crisis" } : { crisis: false };

async function run(
  detector: LiveCrisisDetector | undefined,
  body: (w: VoiceWorld, esc: any[], ctx: { client: any; threadId: string }) => Promise<void>,
  claims: Record<string, unknown> = adult(),
  extra: Partial<VoiceApiDeps> = {},
): Promise<void> {
  const esc: any[] = [];
  const w = await voiceWorld({
    deps: {
      crisis: { message: { text: CRISIS_TEXT_FIXED, audio: CRISIS_AUDIO }, ...(detector ? { detect: detector } : {}) },
      escalateForTenant: () => async (input: any) => void esc.push(input),
      ...extra,
    } as Partial<VoiceApiDeps>,
  });
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    const { client } = await w.open(claims, threadId);
    await body(w, esc, { client, threadId });
  } finally {
    await w.cleanup();
  }
}
const textOf = (esc: any[], i = 0): string => esc[i].turns[0].text as string;

// p1b: Gemini-style non-final chunks: earlier unanswered speech then crisis words, real default detector. (informational)
test("p1b: non-final earlier chunk + crisis chunk (default detector) -> what words are escalated", async () => {
  await run(undefined, async (w, esc) => {
    speak(w, EARLIER, false);
    speak(w, CRISIS_PHRASE, false);
    await until(() => esc.length === 1, "escalated");
    await w.voice.settled();
    console.log("OBSERVED p1b escalated text =", JSON.stringify(textOf(esc)));
  });
});

// p1c: FINAL earlier unanswered turn then crisis words w/ default detector
test("p1c: final earlier unanswered turn then crisis words (default detector) -> only the crisis words", async () => {
  await run(undefined, async (w, esc) => {
    speak(w, EARLIER, true);
    speak(w, CRISIS_PHRASE, true);
    await until(() => esc.length === 1, "escalated");
    await w.voice.settled();
    assert.ok(!textOf(esc).includes("Germany"), textOf(esc));
    assert.match(textOf(esc), /kill myself/);
  });
});

// p5 reverse: first crisis has no words, second has words
test("p5r: first crisis no words, second crisis words -> second carries only its own words; first is the marker", async () => {
  await run(detectEmptyFires, async (w, esc) => {
    speak(w, "   ");
    await until(() => esc.length === 1, "first");
    await liftMute(w);
    speak(w, `${CRISIS_PHRASE} second`);
    await until(() => esc.length === 2, "second");
    await w.voice.settled();
    assert.equal(textOf(esc, 0), VOICE_CRISIS_NO_WORDS_TEXT);
    assert.match(textOf(esc, 1), /kill myself second/);
    assert.ok(!textOf(esc, 1).includes(VOICE_CRISIS_NO_WORDS_TEXT));
  });
});

// p5f: words, then words again (no-words in the middle) three crises
test("p5t: three crises in a row (words / none / words) keep their pairing", async () => {
  await run(detectEmptyFires, async (w, esc) => {
    speak(w, `${CRISIS_PHRASE} one`);
    await until(() => esc.length === 1, "1");
    await liftMute(w);
    speak(w, "   ");
    await until(() => esc.length === 2, "2");
    await liftMute(w);
    speak(w, `${CRISIS_PHRASE} three`);
    await until(() => esc.length === 3, "3");
    await w.voice.settled();
    assert.match(textOf(esc, 0), /kill myself one/);
    assert.equal(textOf(esc, 1), VOICE_CRISIS_NO_WORDS_TEXT);
    assert.match(textOf(esc, 2), /kill myself three/);
  });
});

// p6: second crisis detected while the first record's flag write is still gated
test("p6: second crisis arrives while the first crisis's flag write is gated -> each escalation has its own words", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await run(detectEmptyFires, async (w, esc) => {
    const flags = w.fakeDb.collection("student_flags") as any;
    const real = flags.updateOne.bind(flags);
    let n = 0;
    let entered = false;
    flags.updateOne = async (...a: unknown[]) => {
      if (++n === 1) {
        entered = true;
        await gate;
      }
      return real(...a);
    };
    speak(w, `${CRISIS_PHRASE} alphafirst`);
    await until(() => entered, "first flag write entered and gated");
    await liftMute(w);
    speak(w, `${CRISIS_PHRASE} bravosecond`);
    await sleep(100);
    release();
    await until(() => esc.length === 2, "both escalated");
    await w.voice.settled();
    assert.match(textOf(esc, 0), /alphafirst/);
    assert.ok(!textOf(esc, 0).includes("bravosecond"));
    assert.match(textOf(esc, 1), /bravosecond/);
    assert.ok(!textOf(esc, 1).includes("alphafirst"));
  });
});

// p6b: gate the thread-turn writes so the second crisis is DETECTED before the first record starts
test("p6b: sink chain blocked on a turn write; two crises detected before the first record runs -> pairing holds", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await run(detectEmptyFires, async (w, esc) => {
    const turns = w.fakeDb.collection(COLLECTION_NAMES.chat_turns) as any;
    const real = turns.updateOne.bind(turns);
    let entered = false;
    turns.updateOne = async (...a: unknown[]) => {
      entered = true;
      await gate;
      return real(...a);
    };
    speak(w, `${CRISIS_PHRASE} alphafirst`);
    await until(() => entered, "turn write gated");
    await liftMute(w);
    speak(w, `${CRISIS_PHRASE} bravosecond`);
    await sleep(100);
    assert.equal(esc.length, 0);
    release();
    await until(() => esc.length === 2, "both escalated");
    await w.voice.settled();
    assert.match(textOf(esc, 0), /alphafirst/);
    assert.ok(!textOf(esc, 0).includes("bravosecond"));
    assert.match(textOf(esc, 1), /bravosecond/);
    assert.ok(!textOf(esc, 1).includes("alphafirst"));
  });
});

// p7: socket drops during the (gated) flag write
test("p7: socket aborted during the gated flag write -> exactly 1 flag, 1 escalation, right words", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await run(detectEmptyFires, async (w, esc, { client }) => {
    const flags = w.fakeDb.collection("student_flags") as any;
    const real = flags.updateOne.bind(flags);
    let entered = false;
    flags.updateOne = async (...a: unknown[]) => {
      entered = true;
      await gate;
      return real(...a);
    };
    speak(w, `${CRISIS_PHRASE} zetadropped`);
    await until(() => entered, "gated");
    client.abort();
    await sleep(300);
    release();
    await until(() => esc.length >= 1, "escalated");
    await w.voice.settled();
    await sleep(200);
    assert.equal(esc.length, 1);
    assert.equal(w.fakeDb.collection<any>("student_flags").all().length, 1);
    assert.match(textOf(esc), /zetadropped/);
  });
});

// p8: minors without boolean-true consent
for (const [name, claims] of [
  ["minor no consent", minorNoConsent()],
  ["minor guardianConsent string 'true'", { ...minorNoConsent(), guardianConsent: "true" }],
  ["minor guardianConsent 1", { ...minorNoConsent(), guardianConsent: 1 }],
] as const) {
  test(`p8: ${name}: flagged but nothing escalated, nothing raw stored/logged`, async () => {
    const SECRET = "secretwordzz";
    await run(
      detectEmptyFires,
      async (w, esc) => {
        speak(w, `${CRISIS_PHRASE} ${SECRET}`);
        await until(() => w.fakeDb.collection<any>("student_flags").all().length === 1, "flag");
        await w.voice.settled().catch(() => undefined);
        await liftMute(w); // a second crisis, also no words kept
        speak(w, "   ");
        await sleep(300);
        await w.voice.settled().catch(() => undefined);
        assert.equal(esc.length, 0);
        assert.ok(!JSON.stringify(w.logs).includes(SECRET));
        for (const name of Object.values(COLLECTION_NAMES) as string[]) {
          try {
            assert.ok(!JSON.stringify(w.fakeDb.collection<any>(name).all()).includes(SECRET), `collection ${name} holds the raw words`);
          } catch (e) {
            if ((e as Error).message.startsWith("collection ")) throw e;
          }
        }
      },
      claims as any,
    );
  });
}

test("p8b: minor WITH boolean-true consent still escalates", async () => {
  await run(detectEmptyFires, async (w, esc) => {
    speak(w, `${CRISIS_PHRASE} consented`);
    await until(() => esc.length === 1, "esc");
    assert.match(textOf(esc), /consented/);
  }, minorConsent() as any);
});

// p8c: the detector throws for an unconsented minor
test("p8c: detector throws for an unconsented minor -> flag only, no escalation, queue does not misalign later", async () => {
  const thrower: LiveCrisisDetector = (text) => {
    if (text.includes("THROW")) throw new Error("down");
    return { crisis: false };
  };
  await run(thrower, async (w, esc) => {
    speak(w, "THROW secretwordzz");
    await until(() => w.fakeDb.collection<any>("student_flags").all().length === 1, "flag");
    await w.voice.settled().catch(() => undefined);
    await sleep(100);
    assert.equal(esc.length, 0);
    assert.ok(!JSON.stringify(w.logs).includes("secretwordzz"));
  }, minorNoConsent() as any);
});

// p9: PII redaction
test("p9: email and phone inside the crisis words are redacted in the escalation", async () => {
  await run(detectEmptyFires, async (w, esc) => {
    speak(w, `${CRISIS_PHRASE} mail me at foo.bar@example.com or call +91 98765 43210 or 9876543210`);
    await until(() => esc.length === 1, "esc");
    await w.voice.settled();
    const t = textOf(esc);
    console.log("OBSERVED p9 escalated text =", JSON.stringify(t));
    assert.ok(!t.includes("foo.bar@example.com"), t);
    assert.ok(!t.includes("98765"), t);
    assert.ok(!t.includes("9876543210"), t);
  });
});

// p10: long utterance clamp
test("p10: a >2000 char crisis utterance is clamped in the escalation", async () => {
  await run(detectEmptyFires, async (w, esc) => {
    speak(w, `${CRISIS_PHRASE} ${"abcde ".repeat(1500)}`);
    await until(() => esc.length === 1, "esc");
    await w.voice.settled();
    console.log("OBSERVED p10 escalated length =", textOf(esc).length);
    assert.ok(textOf(esc).length <= 2000);
    assert.match(textOf(esc), /kill myself/);
  });
});

// p4b: detector throws on empty and on words, then recovers; later crisis pairing
test("p4b: detector throws on no-words, then a later normal crisis with words -> pairing holds", async () => {
  const d: LiveCrisisDetector = (text) => {
    if (text.trim() === "") throw new Error("down on empty");
    return text.includes(CRISIS_PHRASE) ? { crisis: true } : { crisis: false };
  };
  await run(d, async (w, esc) => {
    speak(w, "   ");
    await until(() => esc.length === 1, "1");
    await liftMute(w);
    speak(w, `${CRISIS_PHRASE} later`);
    await until(() => esc.length === 2, "2");
    await w.voice.settled();
    assert.equal(textOf(esc, 0), VOICE_CRISIS_NO_WORDS_TEXT);
    assert.match(textOf(esc, 1), /later/);
  });
});

// p12a: malformed detector result (undefined) is treated by LiveSession as a crisis with no capture; a gated sink chain lets a
// well-formed crisis be detected before the record of the first is consumed -> does the second's words go to the first record?
test("p12a: malformed detector return (undefined) + blocked sink chain -> later crisis words attach to the right record", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const d = ((text: string) => {
    if (text.includes("MALFORMED")) return undefined;
    return text.includes(CRISIS_PHRASE) ? { crisis: true } : { crisis: false };
  }) as unknown as LiveCrisisDetector;
  await run(d, async (w, esc) => {
    const turns = w.fakeDb.collection(COLLECTION_NAMES.chat_turns) as any;
    const real = turns.updateOne.bind(turns);
    let entered = false;
    turns.updateOne = async (...a: unknown[]) => {
      entered = true;
      await gate;
      return real(...a);
    };
    speak(w, "MALFORMED utterance");
    await until(() => entered, "gated");
    await liftMute(w);
    speak(w, `${CRISIS_PHRASE} bravosecond`);
    await sleep(100);
    release();
    await until(() => esc.length === 2, "both escalated");
    await w.voice.settled();
    console.log("OBSERVED p12a esc0 =", JSON.stringify(textOf(esc, 0)), " esc1 =", JSON.stringify(textOf(esc, 1)));
    assert.ok(!textOf(esc, 0).includes("bravosecond"), "first record (malformed-detector crisis) must not carry the second's words");
    assert.match(textOf(esc, 1), /bravosecond/);
  });
});
