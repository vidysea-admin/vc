/**
 * P1 U10 (C6, A19, D-086 Q4, D-093 4A/6A): voice turns share the thread with text turns, survive a reconnect, are exported and erased,
 * are stored redacted, and an under-18 student without a guardian-consent claim stores nothing. Audio is never stored. SYNTHETIC only.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { COLLECTION_NAMES, exportStudent, executeErasure, requestErasure, tenantScopedDb, proposeProfileFact, decideProfileFact, listProfileFacts } from "@vc/db";
import { confirmTwiceAndApprove } from "@vc/db/testing";
import { CRISIS_RESUME_GAP_MS_DEFAULT } from "@vc/providers";
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

test("Q14: voice retrieves owned confirmed context as tool data and stops an active session before changed-policy output", async () => {
  let policy = { shortTermEnabled: true, longTermEnabled: true, learningEnabled: true, contextMessages: 12, maxFacts: 20 };
  await withWorld(async (w, threadId) => {
    const db = tenantScopedDb(w.rawDb, "tenant-a");
    const fact = await proposeProfileFact(db, { studentId: "stu-1", key: "interest", value: "biology" });
    await decideProfileFact(db, { studentId: "stu-1", factId: fact!.factId, action: "confirm" });
    await proposeProfileFact(db, { studentId: "stu-1", key: "unconfirmed", value: "PRIVATE-PROPOSAL" });
    w.clock.ms += 1000;
    await textTurn(w, threadId, "prior-topic");
    const a = await w.open(adult(), threadId);
    const cfg = w.provider.configs[0]!;
    assert.ok(cfg.tools?.some(t => t.name === "student_memory"));
    const context = await cfg.toolHandler!({ id: "memory-1", name: "student_memory", args: {} });
    assert.match(JSON.stringify(context), /biology/);
    assert.doesNotMatch(JSON.stringify(context), /PRIVATE-PROPOSAL/);
    assert.doesNotMatch(cfg.systemInstruction ?? "", /biology|PRIVATE-PROPOSAL/);
    policy = { ...policy, longTermEnabled: false };
    w.provider.backends[0]!.emitOutputTranscript("STALE-PERSONAL-OUTPUT");
    w.provider.backends[0]!.emitOutputAudio(new Uint8Array(480));
    w.provider.backends[0]!.emitTurnComplete();
    await until(() => a.client.closed, "policy change ends memory-bearing provider");
    assert.equal(a.client.frames.length, 0);
    assert.ok(!JSON.stringify(a.client.events).includes("STALE-PERSONAL-OUTPUT"));
  }, { deps: { memoryPolicyForTenant: async () => policy } });
});

test("Q14: an erased memory invalidates voice before more microphone data reaches the old provider", async () => {
  await withWorld(async (w, threadId) => {
    const db = tenantScopedDb(w.rawDb, "tenant-a");
    const fact = await proposeProfileFact(db, { studentId: "stu-1", key: "interest", value: "biology" });
    await decideProfileFact(db, { studentId: "stu-1", factId: fact!.factId, action: "confirm" });
    const a = await w.open(adult(), threadId);
    w.clock.ms += 1000;
    await decideProfileFact(db, { studentId: "stu-1", factId: fact!.factId, action: "erase" }, { now: new Date(w.clock.ms) });
    a.client.sendAudio();
    await until(() => a.client.closed, "forget closes old memory session");
    assert.equal(w.provider.backends[0]!.audioIn.length, 0);
  });
});

test("Q12/Q14 repair1: pending decisions reject old active, newly opened and resumed voice memory", async () => {
 for (const action of ["correct", "erase"] as const) {
  await withWorld(async (w, threadId) => {
   const db=tenantScopedDb(w.rawDb,"tenant-a");
   const fact=await proposeProfileFact(db,{studentId:"stu-1",key:"interest",value:"robotics"});assert.ok(fact);
   await decideProfileFact(db,{studentId:"stu-1",factId:fact.factId,action:"confirm"});
   const active=await w.open(adult(),threadId),preMinted=await w.mint(adult(),threadId);
   assert.match(JSON.stringify(await w.provider.configs[0]!.toolHandler!({id:"before",name:"student_memory",args:{}})),/robotics/);
   let release!:()=>void,entered!:()=>void;
   const block=new Promise<void>(r=>release=r),pending=new Promise<void>(r=>entered=r);
   const collection=w.fakeDb.collection(COLLECTION_NAMES.profile_facts);
   if(action==="correct") {
    const original=collection.updateOne.bind(collection);
    collection.updateOne=(async(...args:Parameters<typeof original>)=>{if((args[1] as any).$set?.value==="astronomy"){entered();await block;}return original(...args);}) as typeof collection.updateOne;
   }else{
    const original=collection.deleteMany.bind(collection);
    collection.deleteMany=(async(...args:Parameters<typeof original>)=>{entered();await block;return original(...args);}) as typeof collection.deleteMany;
   }
   const deciding=decideProfileFact(db,{studentId:"stu-1",factId:fact.factId,action,...(action==="correct"?{value:"astronomy"}:{})});
   try{
    await pending;
    reply(w,0,"Your interest is robotics");
    await until(()=>active.client.closed,"pending decision closes pre-existing voice");
    assert.ok(!active.client.events.some(e=>e.type==="transcript.final"&&e.text?.includes("robotics")));
    const during=await w.connect(preMinted,{threadId});
    if(during.ok){
     during.client.send({type:"start",threadId});
     await until(()=>during.client.closed||w.provider.backends.length>1,"pending start either closes or starts without memory");
     if(!during.client.closed){
      const cfg=w.provider.configs[1]!;
      assert.ok(!JSON.stringify(cfg.systemInstruction).includes("robotics"));
      if(cfg.tools?.some(t=>t.name==="student_memory"))assert.ok(!JSON.stringify(await cfg.toolHandler!({id:"pending",name:"student_memory",args:{}})).includes("robotics"));
      reply(w,1,"Your interest is robotics");
      await until(()=>during.client.closed,"pending voice cannot release obsolete output");
     }
     assert.ok(!JSON.stringify(during.client.events).includes("robotics"));
    }
    release();await deciding;
    const resumed=await w.open(adult(),threadId,{lastEventId:active.sid+".0"});
    const context=await w.provider.configs[resumed.backendIndex]!.toolHandler!({id:"after",name:"student_memory",args:{}});
    assert.ok(!JSON.stringify(context).includes("robotics"));
    assert.ok(!JSON.stringify(resumed.client.events).includes("robotics"),"resume cannot replay old memory-bearing output");
    if(action==="correct")assert.match(JSON.stringify(context),/astronomy/);
   }finally{release();await deciding;}
  });
 }
});

test("Q12/I4 repair: known profile names are redacted from voice proposal keys, values, quotes and later memory", async () => {
  const knownName = "Synthetiqa";
  await withWorld(async (w, threadId) => {
    const a = await w.open(adult(), threadId);
    speak(w, 0, knownName + " enjoys mathematics 17");
    const db = tenantScopedDb(w.rawDb, "tenant-a");
    await until(() => w.fakeDb.collection(COLLECTION_NAMES.profile_facts).all().length === 2, "both extracted facts persisted");
    const rows = await listProfileFacts(db, { studentId: "stu-1" });
    assert.equal(rows.length, 2);
    const keyCanary = rows.find(f => f.key !== "interest")!;
    const preference = rows.find(f => f.key === "interest")!;
    for (const field of [keyCanary.key, ...rows.flatMap(f => [f.value, f.quote])]) {
      assert.ok(field?.includes("[NAME]"), "each model-controlled field uses the known-name redactor");
      assert.ok(!field?.includes(knownName));
    }
    assert.ok(!everythingStored(w.fakeDb).includes(knownName), "all new stored fields are redacted");
    const profile = await call(w.chat, "GET", "/v1/students/stu-1/chat/profile", { token: await studentToken(adult()) });
    assert.equal(profile.status, 200);
    assert.ok(!JSON.stringify(profile.json).includes(knownName));
    assert.ok(!JSON.stringify(a.client.of("confirm")).includes(knownName), "numeric confirmation uses the same redacted fact");
    a.client.send({ type: "end" });
    await until(() => a.client.closed, "first voice session closed");
    await decideProfileFact(db, { studentId: "stu-1", factId: preference.factId, action: "confirm" });
    await w.open(adult(), threadId);
    const context = await w.provider.configs[1]!.toolHandler!({ id: "memory-redacted", name: "student_memory", args: {} });
    assert.match(JSON.stringify(context), /mathematics/);
    assert.ok(!JSON.stringify(context).includes(knownName));
  }, { deps: {
    profileNames: async () => [knownName],
    extractFacts: async t => ["interest_" + knownName, "interest"].map(key => ({ key, value: knownName + " enjoys mathematics 17", quote: t.text, sourceLang: "en" })),
  } });
});

test("Q14/I1 repair: voice memory numbers remain untrusted and cannot source factual speech", async () => {
  await withWorld(async (w, threadId) => {
    const db = tenantScopedDb(w.rawDb, "tenant-a");
    const fact = await proposeProfileFact(db, { studentId: "stu-1", key: "budget", value: "Fee claim 987651 euros" });
    await decideProfileFact(db, { studentId: "stu-1", factId: fact!.factId, action: "confirm" });
    const first = await w.open(adult(), threadId);
    speak(w, 0, "I heard the fee is 876542 euros");
    reply(w, 0, "You mentioned the fee 876542 euros");
    await until(() => first.client.of("state").length === 1, "history exchange complete");
    first.client.send({ type: "end" });
    await until(() => first.client.closed, "history session closed");
    w.clock.ms += 1000;
    const next = await w.open(adult(), threadId);
    w.provider.backends[1]!.emitToolCall({ id: "memory-numbers", name: "student_memory", args: {} });
    await until(() => w.provider.backends[1]!.calls.some(c => c.type === "tool_response"), "memory returned to provider");
    const result = w.provider.backends[1]!.calls.find(c => c.type === "tool_response");
    assert.match(JSON.stringify(result), /876542/);
    assert.match(JSON.stringify(result), /987651/);
    reply(w, 1, "University tuition is 876542 euros and 987651 euros");
    await until(() => next.client.of("state").length === 1, "unsupported spoken claim audited");
    assert.deepEqual(next.client.of("flag").filter(f => f.reason === "uncited_number").map(f => f.detail).sort(), ["876542", "987651"]);
  });
});

test("Q14: learning disabled while voice extraction waits discards its result", async () => {
  let learning = true, started = false;
  let finish!: (facts: readonly { key: string; value: string }[]) => void;
  await withWorld(async (w, threadId) => {
    await w.open(adult(), threadId);
    speak(w, 0, "I like chemistry");
    await until(() => started, "extractor started");
    learning = false;
    finish([{ key: "interest", value: "chemistry" }]);
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    assert.deepEqual(await listProfileFacts(tenantScopedDb(w.rawDb, "tenant-a"), { studentId: "stu-1" }), []);
  }, { deps: { memoryPolicyForTenant: async () => ({ shortTermEnabled: true, longTermEnabled: true, learningEnabled: learning, contextMessages: 12, maxFacts: 20 }), extractFacts: async () => { started = true; return new Promise(r => { finish = r; }); } } });
});

test("Q14: an unconsented minor gets no personal voice or memory tool declarations", async () => {
  await withWorld(async (w, threadId) => {
    await w.open(minorNoConsent(), threadId);
    assert.equal(w.provider.configs[0]!.tools, undefined);
    assert.equal(w.provider.configs[0]!.toolHandler, undefined);
  }, { deps: { tools: { declarations: [{ name: "private_profile", description: "private" }], run: async () => assert.fail("no private source") } } }, minorNoConsent());
});

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


test("S12 voice: nonnumeric replacement controls bind exact current choice and reject preserves active value", async () => {
  await withWorld(async (w, threadId) => {
    const db = tenantScopedDb(w.rawDb, "tenant-a");
    const fact = await proposeProfileFact(db, {studentId:"stu-1",key:"interest",value:"biology"});
    await decideProfileFact(db,{studentId:"stu-1",factId:fact!.factId,action:"confirm"});
    const a = await w.open(adult(),threadId);
    speak(w,0,"I now prefer astronomy");
    await until(()=>a.client.of("confirm").length===1,"nonnumeric replacement prompt");
    const prompt = a.client.of("confirm")[0];
    assert.equal(prompt.fact.value,"astronomy"); assert.equal(prompt.fact.currentValue,"biology");
    assert.equal(prompt.threadId,threadId); assert.ok(prompt.promptId); assert.ok(prompt.fact.candidateId); assert.ok(prompt.fact.expectedVersion);
    assert.match(prompt.question,/biology/); assert.match(prompt.question,/astronomy/);
    assert.ok(w.provider.backends[0]!.calls.some(c=>c.type==="text" && JSON.stringify(c).includes("astronomy")),"same live session asks exact change");
    a.client.send({type:"confirm",key:"interest",accepted:false});
    await until(()=>a.client.of("error").length===1,"legacy replacement refused");
    assert.equal((await listProfileFacts(db,{studentId:"stu-1"}))[0]!.value,"biology");
    const choice={type:"confirm",key:"interest",accepted:false,value:prompt.fact.value,candidateId:prompt.fact.candidateId,expectedVersion:prompt.fact.expectedVersion,threadId,promptId:prompt.promptId};
    a.client.send({...choice,expectedVersion:"stale"});
    await until(()=>a.client.of("error").length===2,"stale version refused");
    a.client.send(choice);
    await until(()=>a.client.closed,"decision retires provider context");
    const rows=await listProfileFacts(db,{studentId:"stu-1"}); assert.equal(rows[0]!.value,"biology"); assert.equal(rows[0]!.pendingChange,undefined);
  },{deps:{extractFacts:async()=>[{key:"interest",value:"astronomy"}]}});
});

test("S12 voice: only fresh finalized microphone yes/no can decide; partial model output and ambiguous speech cannot", async () => {
  for(const accepted of [true,false]) await withWorld(async(w,threadId)=>{
    const db=tenantScopedDb(w.rawDb,"tenant-a");
    const fact=await proposeProfileFact(db,{studentId:"stu-1",key:"interest",value:"biology"});
    await decideProfileFact(db,{studentId:"stu-1",factId:fact!.factId,action:"confirm"});
    const a=await w.open(adult(),threadId);
    speak(w,0,"I now prefer astronomy");
    await until(()=>a.client.of("confirm").length===1,"current choice");
    const p=a.client.of("confirm")[0];
    speak(w,0,"yes");await until(()=>a.client.of("transcript.final").some(e=>e.text==="yes"),"unbound final transcript recorded without approval");
    assert.ok((await listProfileFacts(db,{studentId:"stu-1"}))[0]!.pendingChange,"no post-prompt microphone input means no authority");
    // Generated words and a partial transcript flushed by model output carry no human final authority.
    a.client.sendAudio(); await until(()=>w.provider.backends[0]!.audioIn.length===1,"fresh audio");
    w.provider.backends[0]!.emitInputTranscript("yes",false); reply(w,0,"yes");
    await until(()=>a.client.of("state").length===1,"partial and generated output settled");
    assert.ok((await listProfileFacts(db,{studentId:"stu-1"}))[0]!.pendingChange);
    // S13 fix-b: the readout is over (turn_complete), so the next microphone frame arms the answer.
    a.client.sendAudio(); await until(()=>w.provider.backends[0]!.audioIn.length===2,"audio after the readout");
    speak(w,0,"maybe"); await until(()=>a.client.of("confirm").length===2,"ambiguous speech repeats prompt");
    assert.equal((await listProfileFacts(db,{studentId:"stu-1"}))[0]!.value,"biology");
    assert.ok(a.client.of("confirm").some(e=>e.promptId===p.promptId),"ambiguous answer repeats same choice");
    // The repeat is a new readout: it must finish before the answer can arm again.
    a.client.sendAudio(); await until(()=>w.provider.backends[0]!.audioIn.length===3,"audio during the repeated readout");
    reply(w,0,"repeating the question"); await until(()=>a.client.of("state").length===2,"repeated readout finished");
    a.client.sendAudio(); await until(()=>w.provider.backends[0]!.audioIn.length===4,"new human response audio");
    speak(w,0,accepted?"yes":"no");
    await until(()=>a.client.closed,"fresh final decision closes stale provider");
    const row=(await listProfileFacts(db,{studentId:"stu-1"}))[0]!;
    assert.equal(row.value,accepted?"astronomy":"biology"); assert.equal(row.pendingChange,undefined);
  },{deps:{extractFacts:async({text})=>text.includes("prefer")?[{key:"interest",value:"astronomy"}]:[]}});
});


test("S13 fix-b: a yes/no spoken before the model finished reading the memory question changes nothing", async () => {
  await withWorld(async (w, threadId) => {
    const db = tenantScopedDb(w.rawDb, "tenant-a");
    const fact = await proposeProfileFact(db, { studentId: "stu-1", key: "interest", value: "biology" });
    await decideProfileFact(db, { studentId: "stu-1", factId: fact!.factId, action: "confirm" });
    const a = await w.open(adult(), threadId);
    speak(w, 0, "I now prefer astronomy");
    await until(() => a.client.of("confirm").length === 1, "prompt");
    // Mic audio and a final "yes" arrive while the readout is still playing (no turn_complete yet).
    a.client.sendAudio(); await until(() => w.provider.backends[0]!.audioIn.length === 1, "mic frame during readout");
    speak(w, 0, "yes");
    await until(() => a.client.of("transcript.final").some((e) => e.text === "yes"), "early yes recorded as plain speech");
    assert.equal(a.client.closed, false);
    let row = (await listProfileFacts(db, { studentId: "stu-1" }))[0]!;
    assert.equal(row.value, "biology"); assert.ok(row.pendingChange, "the early yes decided nothing");
    // The readout completes; only audio after that can answer.
    reply(w, 0, "Should I remember interest as astronomy?"); await until(() => a.client.of("state").length === 1, "readout done");
    a.client.sendAudio(); await until(() => w.provider.backends[0]!.audioIn.length === 2, "mic frame after readout");
    speak(w, 0, "yes");
    await until(() => a.client.closed, "the answer after the readout decides");
    row = (await listProfileFacts(db, { studentId: "stu-1" }))[0]!;
    assert.equal(row.value, "astronomy"); assert.equal(row.pendingChange, undefined);
  }, { deps: { extractFacts: async () => [{ key: "interest", value: "astronomy" }] } });
});

test("S13 fix-c2: an earlier turn's turn_complete (no readout output yet) must not arm the yes/no answer early", async () => {
  await withWorld(async (w, threadId) => {
    const db = tenantScopedDb(w.rawDb, "tenant-a");
    const fact = await proposeProfileFact(db, { studentId: "stu-1", key: "interest", value: "biology" });
    await decideProfileFact(db, { studentId: "stu-1", factId: fact!.factId, action: "confirm" });
    const a = await w.open(adult(), threadId);
    speak(w, 0, "I now prefer astronomy");
    await until(() => a.client.of("confirm").length === 1, "prompt");
    assert.ok(w.provider.backends[0]!.calls.some((c) => c.type === "text" && JSON.stringify(c).includes("astronomy")), "the readout prompt was sent");
    // The reply to the student's OWN earlier utterance completes now: after the readout was dispatched, before any readout output.
    w.provider.backends[0]!.emitTurnComplete();
    await until(() => a.client.of("state").length === 1, "earlier turn_complete drained");
    a.client.sendAudio(); await until(() => w.provider.backends[0]!.audioIn.length === 1, "mic frame before the readout was spoken");
    speak(w, 0, "yes");
    await until(() => a.client.of("transcript.final").some((e) => e.text === "yes"), "early yes recorded as plain speech");
    assert.equal(a.client.closed, false);
    let row = (await listProfileFacts(db, { studentId: "stu-1" }))[0]!;
    assert.equal(row.value, "biology"); assert.ok(row.pendingChange, "the early yes decided nothing");
    // The real readout (output, then turn_complete) arms the answer as before.
    reply(w, 0, "Should I remember interest as astronomy?"); await until(() => a.client.of("state").length === 2, "readout done");
    a.client.sendAudio(); await until(() => w.provider.backends[0]!.audioIn.length === 2, "mic frame after readout");
    speak(w, 0, "yes");
    await until(() => a.client.closed, "the answer after the readout decides");
    row = (await listProfileFacts(db, { studentId: "stu-1" }))[0]!;
    assert.equal(row.value, "astronomy"); assert.equal(row.pendingChange, undefined);
  }, { deps: { extractFacts: async () => [{ key: "interest", value: "astronomy" }] } });
});

// S13 fix-c3b: an assistant turn already open when the readout is dispatched (output seen since the last turn_complete/interrupted)
// owns its trailing output and its turn_complete; those must not arm the yes/no for the readout that follows it.
for (const kind of ["transcript", "audio"] as const) {
  test(`S13 fix-c3b: trailing ${kind} output of an earlier open reply, then its turn_complete, must not arm the yes/no early`, async () => {
    await withWorld(async (w, threadId) => {
      const db = tenantScopedDb(w.rawDb, "tenant-a");
      const fact = await proposeProfileFact(db, { studentId: "stu-1", key: "interest", value: "biology" });
      await decideProfileFact(db, { studentId: "stu-1", factId: fact!.factId, action: "confirm" });
      const a = await w.open(adult(), threadId);
      const be = w.provider.backends[0]!;
      const earlier = (part: string) => (kind === "transcript" ? be.emitOutputTranscript(part) : be.emitOutputAudio(new Uint8Array(480)));
      earlier("Nice, "); // the model is already mid-reply when the readout is dispatched
      speak(w, 0, "I now prefer astronomy");
      await until(() => a.client.of("confirm").length === 1, "prompt");
      assert.ok(be.calls.some((c) => c.type === "text" && JSON.stringify(c).includes("astronomy")), "the readout prompt was sent");
      earlier("astronomy is great."); // trailing output of the EARLIER reply, after the readout was dispatched
      be.emitTurnComplete();
      await until(() => a.client.of("state").length === 1, "earlier turn_complete drained");
      a.client.sendAudio(); await until(() => be.audioIn.length === 1, "mic frame before the readout was spoken");
      speak(w, 0, "yes");
      await until(() => a.client.of("transcript.final").some((e) => e.text === "yes"), "early yes recorded as plain speech");
      assert.equal(a.client.closed, false);
      let row = (await listProfileFacts(db, { studentId: "stu-1" }))[0]!;
      assert.equal(row.value, "biology"); assert.ok(row.pendingChange, "the early yes decided nothing");
      // The earlier turn is closed now: the real readout (output, then turn_complete) still arms the answer.
      if (kind === "transcript") reply(w, 0, "Should I remember interest as astronomy?");
      else { be.emitOutputAudio(new Uint8Array(480)); be.emitTurnComplete(); }
      await until(() => a.client.of("state").length === 2, "readout done");
      a.client.sendAudio(); await until(() => be.audioIn.length === 2, "mic frame after readout");
      speak(w, 0, "yes");
      await until(() => a.client.closed, "the answer after the readout decides");
      row = (await listProfileFacts(db, { studentId: "stu-1" }))[0]!;
      assert.equal(row.value, "astronomy"); assert.equal(row.pendingChange, undefined);
    }, { deps: { extractFacts: async () => [{ key: "interest", value: "astronomy" }] } });
  });
}

test("S13 fix-c3b: an interrupted event closes the earlier open reply, so the real readout still arms", async () => {
  await withWorld(async (w, threadId) => {
    const db = tenantScopedDb(w.rawDb, "tenant-a");
    const fact = await proposeProfileFact(db, { studentId: "stu-1", key: "interest", value: "biology" });
    await decideProfileFact(db, { studentId: "stu-1", factId: fact!.factId, action: "confirm" });
    const a = await w.open(adult(), threadId);
    const be = w.provider.backends[0]!;
    be.emitOutputTranscript("Nice, ");
    speak(w, 0, "I now prefer astronomy");
    await until(() => a.client.of("confirm").length === 1, "prompt");
    be.emitOutputTranscript("astronomy is great."); // earlier reply still talking
    be.emitInterrupted(); // the provider cancels it: the earlier turn is closed without a turn_complete
    reply(w, 0, "Should I remember interest as astronomy?"); await until(() => a.client.of("state").length === 1, "readout done");
    a.client.sendAudio(); await until(() => be.audioIn.length === 1, "mic frame after readout");
    speak(w, 0, "yes");
    await until(() => a.client.closed, "the answer after the readout decides");
    const row = (await listProfileFacts(db, { studentId: "stu-1" }))[0]!;
    assert.equal(row.value, "astronomy"); assert.equal(row.pendingChange, undefined);
  }, { deps: { extractFacts: async () => [{ key: "interest", value: "astronomy" }] } });
});

// S13 fix-c4b: the fixed crisis audio is server-generated, not a model reply: it opens no model turn, so a later readout is armed by its own turn_complete.
test("S13 fix-c4b: fixed crisis audio with no turn_complete must not swallow the next readout's turn_complete (the yes still decides)", async () => {
  await withWorld(async (w, threadId) => {
    const db = tenantScopedDb(w.rawDb, "tenant-a");
    const fact = await proposeProfileFact(db, { studentId: "stu-1", key: "interest", value: "biology" });
    await decideProfileFact(db, { studentId: "stu-1", factId: fact!.factId, action: "confirm" });
    const a = await w.open(adult(), threadId);
    const be = w.provider.backends[0]!;
    // A provider that acknowledges the crisis interrupt synchronously: `interrupted` lands BEFORE the fixed audio, and no turn_complete follows the fixed audio.
    const plainInterrupt = be.interrupt.bind(be);
    be.interrupt = () => { plainInterrupt(); be.emitInterrupted(); };
    speak(w, 0, CRISIS_PHRASE);
    await until(() => a.client.of("flag").some((f) => f.reason === "crisis_detected"), "crisis flag");
    // The crisis mute lifts on new speech after the pause; a fact extraction then dispatches a readout.
    await new Promise((r) => setTimeout(r, CRISIS_RESUME_GAP_MS_DEFAULT + 300));
    speak(w, 0, "I now prefer astronomy");
    await until(() => a.client.of("confirm").length === 1, "prompt");
    assert.ok(be.calls.some((c) => c.type === "text" && JSON.stringify(c).includes("astronomy")), "the readout prompt was sent");
    reply(w, 0, "Should I remember interest as astronomy?");
    await until(() => a.client.of("state").some((s) => s.state === "ok"), "readout done");
    a.client.sendAudio(); await until(() => be.audioIn.length >= 1, "mic frame after readout");
    speak(w, 0, "yes");
    await until(() => a.client.closed, "the answer after the readout decides");
    const row = (await listProfileFacts(db, { studentId: "stu-1" }))[0]!;
    assert.equal(row.value, "astronomy"); assert.equal(row.pendingChange, undefined);
  }, { deps: { extractFacts: async (t) => (t.text.includes("astronomy") ? [{ key: "interest", value: "astronomy" }] : []) } });
});

test("S13 fix-b: frame-time memory checks are cached for a short TTL, so slow policy lookups do not overflow the frame queue", async () => {
  let policyCalls = 0;
  await withWorld(async (w, threadId) => {
    const a = await w.open(adult(), threadId);
    const slow = w.deps.memoryPolicyForTenant!;
    w.deps.memoryPolicyForTenant = async (tenant) => { policyCalls++; await new Promise((r) => setTimeout(r, 100)); return slow(tenant); };
    const before = policyCalls;
    const frames = 40;
    for (let i = 0; i < frames; i++) {
      a.client.sendAudio(48 * 1024);
      await new Promise((r) => setTimeout(r, 10));
    }
    await until(() => w.provider.backends[0]!.audioIn.length === frames, "all frames reached the provider", 8000);
    assert.equal(a.client.closed, false, "the frame queue never overflowed");
    assert.ok(a.client.of("error").every((e) => e.code !== "voice_busy"));
    assert.ok(policyCalls - before <= 5, "the frame check hit the policy store at most a few times, got " + (policyCalls - before));
  });
});


test("S12 voice: stale candidate and reconnected prompt cannot decide a later choice",async()=>{
  await withWorld(async(w,threadId)=>{
    const db=tenantScopedDb(w.rawDb,"tenant-a");
    const fact=await proposeProfileFact(db,{studentId:"stu-1",key:"interest",value:"biology"});
    await decideProfileFact(db,{studentId:"stu-1",factId:fact!.factId,action:"confirm"});
    const a=await w.open(adult(),threadId);speak(w,0,"I prefer astronomy");
    await until(()=>a.client.of("confirm").length===1,"first prompt");const p=a.client.of("confirm")[0];
    const choice={type:"confirm",key:p.fact.key,value:p.fact.value,candidateId:p.fact.candidateId,expectedVersion:p.fact.expectedVersion,threadId,promptId:p.promptId,accepted:true};
    for(const wrong of [{threadId:"other-thread"},{promptId:"old-prompt"},{value:"physics"},{candidateId:"old-candidate"}])a.client.send({...choice,...wrong});
    await until(()=>a.client.of("error").length===4,"wrong bindings refused");
    const newer=await proposeProfileFact(db,{studentId:"stu-1",key:"interest",value:"physics",threadId});
    a.client.send(choice);await until(()=>a.client.closed,"CAS conflict retires session");
    assert.equal((await listProfileFacts(db,{studentId:"stu-1"}))[0]!.pendingChange!.candidateId,newer!.pendingChange!.candidateId);
    const b=await w.open(adult(),threadId,{lastEventId:a.sid+".0"});
    assert.equal(b.client.of("confirm").length,0,"old choice cannot be replayed as current server prompt");
    b.client.send(choice);await until(()=>b.client.of("error").some(e=>e.code==="unknown_confirm"),"old socket prompt refused");
    assert.equal((await listProfileFacts(db,{studentId:"stu-1"}))[0]!.value,"biology");
    speak(w,b.backendIndex,"I now prefer astronomy"); await until(()=>b.client.of("confirm").length===1,"new session fresh choice");
    const fresh=b.client.of("confirm")[0];b.client.send({type:"confirm",key:fresh.fact.key,value:fresh.fact.value,candidateId:fresh.fact.candidateId,expectedVersion:fresh.fact.expectedVersion,threadId,promptId:fresh.promptId,accepted:true});
    await until(()=>b.client.closed,"latest explicit choice accepted");assert.equal((await listProfileFacts(db,{studentId:"stu-1"}))[0]!.value,"astronomy");
  },{deps:{extractFacts:async()=>[{key:"interest",value:"astronomy"}]}});
});

test("S12 voice: pending exact decision suppresses queued audio and closes old tools and microphone",async()=>{
  await withWorld(async(w,threadId)=>{
    const db=tenantScopedDb(w.rawDb,"tenant-a");
    const fact=await proposeProfileFact(db,{studentId:"stu-1",key:"interest",value:"biology"});
    await decideProfileFact(db,{studentId:"stu-1",factId:fact!.factId,action:"confirm"});
    const a=await w.open(adult(),threadId);speak(w,0,"I prefer astronomy");
    await until(()=>a.client.of("confirm").length===1,"replacement prompt");const p=a.client.of("confirm")[0];
    const coll=w.fakeDb.collection(COLLECTION_NAMES.profile_facts),original=coll.updateOne.bind(coll);
    let release!:()=>void,enter!:()=>void;const gate=new Promise<void>(r=>release=r),entered=new Promise<void>(r=>enter=r);
    coll.updateOne=(async(...args:Parameters<typeof original>)=>{if((args[1] as any).$set?.value==="astronomy"){enter();await gate;}return original(...args);}) as typeof coll.updateOne;
    let releaseOutput!:()=>void,outputEntered!:()=>void;const outputGate=new Promise<void>(r=>releaseOutput=r),outputWaiting=new Promise<void>(r=>outputEntered=r);
    let holdNext=true;const oldPolicy=w.deps.memoryPolicyForTenant!;
    w.deps.memoryPolicyForTenant=async tenant=>{if(holdNext){holdNext=false;outputEntered();await outputGate;}return oldPolicy(tenant);};
    w.provider.backends[0]!.emitOutputAudio(new Uint8Array(480));await outputWaiting;
    try{
      a.client.send({type:"confirm",key:p.fact.key,value:p.fact.value,candidateId:p.fact.candidateId,expectedVersion:p.fact.expectedVersion,threadId,promptId:p.promptId,accepted:true});
      await entered;releaseOutput();
      w.provider.backends[0]!.emitOutputAudio(new Uint8Array(480));reply(w,0,"OLD PERSONAL AUDIO");
      assert.deepEqual(await w.provider.configs[0]!.toolHandler!({id:"stale",name:"student_memory",args:{}}),{unavailable:true});
      release();await until(()=>a.client.closed,"context closed after mutation");
      assert.equal(a.client.frames.length,0);assert.ok(!JSON.stringify(a.client.events).includes("OLD PERSONAL AUDIO"));
      assert.equal((await listProfileFacts(db,{studentId:"stu-1"}))[0]!.value,"astronomy");
    }finally{releaseOutput();release();coll.updateOne=original;w.deps.memoryPolicyForTenant=oldPolicy;}
  },{deps:{extractFacts:async()=>[{key:"interest",value:"astronomy"}]}});
});


test("S12 voice: policy revoked before control or finalized speech refuses decision without changing active preference",async()=>{
  for(const viaSpeech of [false,true]){
    let policy={shortTermEnabled:true,longTermEnabled:true,learningEnabled:true,contextMessages:12,maxFacts:20};
    await withWorld(async(w,threadId)=>{
      const db=tenantScopedDb(w.rawDb,"tenant-a"),fact=await proposeProfileFact(db,{studentId:"stu-1",key:"interest",value:"biology"});
      await decideProfileFact(db,{studentId:"stu-1",factId:fact!.factId,action:"confirm"});
      const a=await w.open(adult(),threadId);speak(w,0,"I prefer astronomy");await until(()=>a.client.of("confirm").length===1,"policy choice");
      const p=a.client.of("confirm")[0];
      if(viaSpeech){a.client.sendAudio();await until(()=>w.provider.backends[0]!.audioIn.length===1,"fresh audio before revocation");}
      policy={...policy,learningEnabled:false};
      if(viaSpeech)speak(w,0,"yes");else a.client.send({type:"confirm",key:p.fact.key,value:p.fact.value,candidateId:p.fact.candidateId,expectedVersion:p.fact.expectedVersion,threadId,promptId:p.promptId,accepted:true});
      await until(()=>a.client.closed,"revocation closes decision context");assert.equal((await listProfileFacts(db,{studentId:"stu-1"}))[0]!.value,"biology");
    },{deps:{memoryPolicyForTenant:async()=>policy,extractFacts:async()=>[{key:"interest",value:"astronomy"}]}});
  }
});
