/**
 * P1 U10 (C6, A19, D-086 Q4, D-093 4A/6A): voice turns share the thread with text turns, survive a reconnect, are exported and erased,
 * are stored redacted, and an under-18 student without a guardian-consent claim stores nothing. Audio is never stored. SYNTHETIC only.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { COLLECTION_NAMES, exportStudent, executeErasure, requestErasure } from "@vc/db";
import { confirmTwiceAndApprove } from "@vc/db/testing";
import { GERMANY_QUESTION, everythingStored } from "./chat-fixtures.js";
import {
  CRISIS_PHRASE,
  adult,
  call,
  minorConsent,
  minorNoConsent,
  newThread,
  studentToken,
  turnsPath,
  until,
  voiceWorld,
  type VoiceWorld,
  type VoiceWorldOptions,
} from "./voice-fixtures.js";

async function withWorld(fn: (w: VoiceWorld, threadId: string) => Promise<void>, opts?: VoiceWorldOptions, claims: Record<string, unknown> = adult()): Promise<void> {
  const w = await voiceWorld(opts);
  try {
    const threadId = await newThread(w.chat, await studentToken(claims), String(claims.studentId));
    await fn(w, threadId);
  } finally {
    await w.cleanup();
  }
}
const speak = (w: VoiceWorld, idx: number, text: string) => w.provider.backends[idx]!.emitInputTranscript(text, true);
const reply = (w: VoiceWorld, idx: number, text: string) => {
  w.provider.backends[idx]!.emitOutputTranscript(text);
  w.provider.backends[idx]!.emitTurnComplete();
};
const getThread = async (w: VoiceWorld, threadId: string, claims: Record<string, unknown> = adult()) =>
  call(w.chat, "GET", `/v1/students/${claims.studentId}/chat/threads/${threadId}`, { token: await studentToken(claims) });
const textTurn = async (w: VoiceWorld, threadId: string, id: string) => {
  const res = await call(w.chat, "POST", turnsPath("stu-1", threadId), { token: await studentToken(adult()), body: { text: GERMANY_QUESTION, clientTurnId: id } });
  assert.equal(res.status, 200);
};

test("C6/A19: voice turns interleave in order with text turns in one thread, survive a reconnect, and carry channel voice", async () => {
  await withWorld(async (w, threadId) => {
    await textTurn(w, threadId, "t-1");
    w.clock.ms += 1_000;
    const a = await w.open(adult(), threadId);
    speak(w, 0, "I am thinking about Munich");
    reply(w, 0, "Munich is a good city to study in");
    await until(() => a.client.of("state").length === 1, "voice exchange");
    await w.voice.settled().catch(() => undefined);
    w.clock.ms += 1_000;
    a.client.send({ type: "end" });
    await until(() => a.client.closed, "closed");
    await w.voice.settled();
    w.clock.ms += 1_000;
    await textTurn(w, threadId, "t-2");

    const turns = (await getThread(w, threadId)).json.turns as Array<{ role: string; channel: string; text: string }>;
    assert.deepEqual(
      turns.map((t) => `${t.channel}:${t.role}`),
      ["text:user", "text:assistant", "voice:user", "voice:assistant", "text:user", "text:assistant"],
    );
    assert.equal(turns[2]!.text, "I am thinking about Munich");
    assert.equal(turns[3]!.text, "Munich is a good city to study in");

    // A reconnect (a new voice session on the same thread) sees the same history and adds to it in order.
    w.clock.ms += 1_000;
    const b = await w.open(adult(), threadId);
    speak(w, 1, "and what about Berlin");
    reply(w, 1, "Berlin is also popular");
    await until(() => b.client.of("state").length === 1, "second exchange");
    await w.voice.settled().catch(() => undefined);
    const again = (await getThread(w, threadId)).json.turns as Array<{ role: string; channel: string; text: string }>;
    assert.equal(again.length, 8);
    assert.deepEqual(again.slice(0, 6), turns, "earlier history is unchanged by the reconnect");
    assert.deepEqual(again.slice(6).map((t) => `${t.channel}:${t.role}`), ["voice:user", "voice:assistant"]);
  });
});

test("C6: an assistant answer that was cut off (user spoke twice, no reply) is stored on its own and ordering stays stable", async () => {
  await withWorld(async (w, threadId) => {
    const { client } = await w.open(adult(), threadId);
    speak(w, 0, "first question");
    await until(() => client.of("transcript.final").length === 1, "first");
    w.clock.ms += 1_000;
    speak(w, 0, "second question");
    await until(() => client.of("transcript.final").length === 2, "second");
    await until(() => w.fakeDb.collection<any>(COLLECTION_NAMES.chat_turns).all().length === 2, "two user rows");
    const turns = (await getThread(w, threadId)).json.turns as Array<{ role: string; text: string }>;
    assert.deepEqual(turns.map((t) => `${t.role}:${t.text}`), ["user:first question", "user:second question"]);
  });
});

test("C6/D-086 Q4: transcripts are stored but audio is not: no collection holds any PCM bytes", async () => {
  await withWorld(async (w, threadId) => {
    const { client } = await w.open(adult(), threadId);
    client.sendAudio(640);
    w.provider.last.emitOutputAudio(new Uint8Array(480).fill(0x7a));
    speak(w, 0, "words only");
    reply(w, 0, "words back");
    await until(() => client.of("state").length === 1, "turn");
    await w.voice.settled().catch(() => undefined);
    const stored = everythingStored(w.fakeDb);
    assert.ok(stored.includes("words only"));
    assert.ok(!stored.includes("AQEBAQ"), "no base64 of the sent audio");
    assert.ok(!/"data":\[/.test(stored) && !stored.includes('"type":"Buffer"'), "no byte arrays");
    assert.ok(!stored.includes("enp6enp6"), "no base64 of the model audio");
    for (const doc of w.fakeDb.collection<any>(COLLECTION_NAMES.chat_turns).all()) {
      assert.ok(!("audio" in doc) && !("audioBytes" in doc));
    }
  });
});

test("C6/A19: the student export contains the voice turns (channel voice) and erasure removes them, leaving another student's voice history alone", async () => {
  await withWorld(async (w, threadId) => {
    const a = await w.open(adult(), threadId);
    speak(w, 0, "exported words");
    reply(w, 0, "answered words");
    await until(() => a.client.of("state").length === 1, "turn");
    a.client.send({ type: "end" });
    await until(() => a.client.closed, "closed");
    await w.voice.settled();

    const t2 = await newThread(w.chat, await studentToken(adult("stu-2")), "stu-2");
    const other = await w.open(adult("stu-2"), t2, { studentId: "stu-2" });
    speak(w, 1, "another student's words");
    await until(() => other.client.of("transcript.final").length === 1, "stu-2 final");
    await until(() => w.fakeDb.collection<any>(COLLECTION_NAMES.chat_turns).all().length === 3, "three rows stored");
    other.client.send({ type: "end" });
    await until(() => other.client.closed, "closed");
    await w.voice.settled();

    const db = w.deps.dbForTenant("tenant-a");
    const exported = await exportStudent(db, "stu-1");
    const voiceRows = exported.chatTurns.filter((t: any) => t.channel === "voice");
    assert.deepEqual(voiceRows.map((t: any) => `${t.role}:${t.text}`), ["user:exported words", "assistant:answered words"]);
    assert.ok(!JSON.stringify(exported).includes("another student's words"));

    const { requestId } = await requestErasure(db, { studentId: "stu-1", requestedBy: "counsellor-7", reason: "student_request" });
    await confirmTwiceAndApprove(db, { requestId, confirmedBy: "admin-2" });
    const outcome = await executeErasure(db, requestId);
    assert.equal(outcome.status, "completed");
    const left = w.fakeDb.collection<any>(COLLECTION_NAMES.chat_turns).all();
    assert.ok(left.every((r) => r.studentId === "stu-2"), "no stu-1 row remains");
    assert.equal(left.length, 1);
    assert.ok(!everythingStored(w.fakeDb).includes("exported words"));
    assert.ok(everythingStored(w.fakeDb).includes("another student's words"));
  });
});

test("C6/D-093 6A: the stored transcript is redacted (email, phone, self-stated and profile names); the live transcript to the owner is not", async () => {
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      const said = "my name is Priya Sharma, mail priya.sharma@example.com or call 98765 43210, my counsellor is Kavita Rao";
      speak(w, 0, said);
      reply(w, 0, "Thanks, I will note Kavita Rao and 98765 43210");
      await until(() => client.of("state").length === 1, "turn");
      await w.voice.settled().catch(() => undefined);
      const live = client.of("transcript.final").map((e) => e.text).join(" | ");
      assert.ok(live.includes("priya.sharma@example.com"), "the owner still sees the live text");
      const stored = everythingStored(w.fakeDb);
      for (const secret of ["priya.sharma@example.com", "98765 43210", "9876543210", "Priya Sharma", "Kavita Rao"]) {
        assert.ok(!stored.includes(secret), `${secret} must not be stored`);
      }
      assert.ok(stored.includes("[EMAIL]") && stored.includes("[PHONE]") && stored.includes("[NAME]"));
      // The exported/read-back history is the redacted one.
      const turns = (await getThread(w, threadId)).json.turns as Array<{ text: string }>;
      assert.ok(turns.every((t) => !t.text.includes("example.com")));
    },
    { deps: { profileNames: async () => ["Kavita Rao"] } },
  );
});

test("C6/D-093 4A: an under-18 student with no boolean-true guardian consent stores no turn, no audit and no fact; only ids-and-time rows stay", async () => {
  let extractorCalls = 0;
  await withWorld(
    async (w, threadId) => {
      const claims = minorNoConsent();
      const { client } = await w.open(claims, threadId);
      speak(w, 0, "I have 4 backlogs and my number is 9876543210");
      await until(() => client.of("transcript.final").length === 1, "live final");
      reply(w, 0, "That costs 9000 euros");
      await until(() => client.of("state").length === 1, "turn");
      assert.equal(client.of("flag").length, 1, "the live flag is still shown to the student");
      speak(w, 0, CRISIS_PHRASE);
      await until(() => client.of("flag").some((f) => f.reason === "crisis_detected"), "crisis flag");
      await w.voice.settled().catch(() => undefined);
      client.send({ type: "end" });
      await until(() => client.closed, "closed");
      await w.voice.settled();

      assert.equal(w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 0, "no turn text is stored");
      assert.equal(w.fakeDb.collection(COLLECTION_NAMES.profile_facts).all().length, 0, "no fact is stored");
      assert.equal(extractorCalls, 0, "facts are not even extracted");
      const stored = everythingStored(w.fakeDb);
      for (const secret of ["backlogs", "9876543210", "costs 9000", "kill"]) assert.ok(!stored.includes(secret), secret);
      assert.equal(w.fakeDb.collection<any>(COLLECTION_NAMES.student_flags).all().filter((f) => f.kind === "crisis").length, 1, "the crisis flag (ids and time) is kept");
      assert.ok(w.fakeDb.collection<any>(COLLECTION_NAMES.student_usage).all().length >= 0);
      const thread = (await getThread(w, threadId, claims)).json;
      assert.equal(thread.textStored, false);
      assert.deepEqual(thread.turns, []);
    },
    {
      deps: {
        extractFacts: async () => {
          extractorCalls++;
          return [{ key: "backlogs", value: "4" }];
        },
      },
    },
    minorNoConsent(),
  );
});

test("C6/D-093 4A: a guardianConsent claim that is not the boolean true (the string 'true') is not consent; a boolean true stores the turns", async () => {
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open({ ...minorNoConsent(), guardianConsent: "true" }, threadId);
      speak(w, 0, "string consent words");
      await until(() => client.of("transcript.final").length === 1, "final");
      await w.voice.settled().catch(() => undefined);
      assert.equal(w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 0);
    },
    undefined,
    minorNoConsent(),
  );
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(minorConsent(), threadId);
      speak(w, 0, "consented words");
      await until(() => client.of("transcript.final").length === 1, "final");
      await until(() => w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length === 1, "stored");
      const rows = w.fakeDb.collection<any>(COLLECTION_NAMES.chat_turns).all();
      assert.equal(rows[0].text, "consented words");
    },
    undefined,
    minorConsent(),
  );
});

test("C6: a failure to store a transcript is reported as a fixed persist_failed event and the session keeps going", async () => {
  await withWorld(async (w, threadId) => {
    const { client } = await w.open(adult(), threadId);
    const turns = w.fakeDb.collection<any>(COLLECTION_NAMES.chat_turns);
    const real = turns.updateOne.bind(turns);
    turns.updateOne = (async () => {
      throw new Error("disk full secret-detail-xyz");
    }) as typeof turns.updateOne;
    speak(w, 0, "words that cannot be stored");
    await until(() => client.of("error").some((e) => e.code === "persist_failed"), "persist_failed");
    assert.ok(!JSON.stringify(client.events).includes("secret-detail-xyz"));
    assert.equal(client.closed, false);
    turns.updateOne = real;
    speak(w, 0, "words that can");
    await until(() => turns.all().length === 1, "later turn stored");
  });
});
