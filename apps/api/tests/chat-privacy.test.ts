/**
 * P1 U8 (D-093 4A under-18, 6A redacted persistence; spec A6 sandbox, B12 tenant isolation, D-015/D-016 erasure fence): what the chat
 * does and does not keep. Outcome tests: the assertions read the fake Db after the request, not the handler's own claims. Synthetic data (B13).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { COLLECTION_NAMES, confirmErasure, requestErasure } from "@vc/db";
import { HIT } from "./anonymous-fixtures.js";
import { CRISIS_TEXT, GERMANY_QUESTION, adult, call, chatWorld, everythingStored, kbAnswerProvider, minor, newThread, recordingKb, studentToken, threadsPath, turnsPath } from "./chat-fixtures.js";

const PII_TEXT = "My name is Priya Sharma, call me on 9876543210 or mail priya.sharma@example.com. What are the tuition fees for public universities in Germany?";

// ---------------------------------------------------------------------------
// 6A: redacted persistence
// ---------------------------------------------------------------------------

test("D-093 6A: a student who types their name, phone and email in a question gets an answer, and none of the three is in anything stored", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: PII_TEXT, clientTurnId: "pii-1" } });
    assert.equal(res.status, 200);
    assert.equal(res.json.state, "ok");
    const stored = everythingStored(w.fakeDb);
    for (const raw of ["Priya", "Sharma", "9876543210", "priya.sharma@example.com"]) assert.ok(!stored.includes(raw), `${raw} must not be stored`);
    assert.ok(stored.includes("[PHONE]") && stored.includes("[EMAIL]") && stored.includes("[NAME]"));
    // The live turn may still reach the model (D-093 6A): the answer above came from the unredacted question.
    assert.ok(JSON.stringify(w.provider.calls).includes("9876543210"));
    // The history a student reads back is the redacted text too.
    const hist = await call(w, "GET", `${threadsPath("stu-1")}/${threadId}`, { token });
    assert.ok(!hist.body.includes("9876543210"));
  } finally {
    w.cleanup();
  }
});

test("D-093 6A: a name the Pathlynks profile supplies is redacted from stored text even when the student never said 'my name is'", async () => {
  const w = chatWorld({ deps: { profile: { facts: async () => [{ key: "full_name", value: "Meera Kulkarni", source: "pathlynks" }] } } });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: `${GERMANY_QUESTION} Asking for Meera Kulkarni.`, clientTurnId: "n-1" } });
    assert.ok(!everythingStored(w.fakeDb).includes("Kulkarni"));
  } finally {
    w.cleanup();
  }
});

test("D-093 6A: a model answer that carries an email address is stored and replayed redacted, while the first live answer is unchanged", async () => {
  // A source that itself carries an address, quoted by a verified claim: the answer message is the claim text.
  const text = "Write to admissions.desk@example.com about the semester contribution of about 300 euros.";
  const kb = recordingKb({ status: "ok", hits: [{ ...HIT, text }], dropped: 0 });
  const w = chatWorld({ kb, provider: kbAnswerProvider([{ text, kind: "fact", sourceIds: ["t-sem-1"] }]) });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const body = { text: GERMANY_QUESTION, clientTurnId: "echo-1" };
    const live = await call(w, "POST", turnsPath("stu-1", threadId), { token, body });
    assert.equal(live.status, 200);
    assert.ok(live.body.includes("admissions.desk@example.com"), "the live answer is unchanged");
    assert.ok(!everythingStored(w.fakeDb).includes("admissions.desk@example.com"), "not in anything stored");
    const replay = await call(w, "POST", turnsPath("stu-1", threadId), { token, body });
    assert.ok(!replay.body.includes("admissions.desk@example.com"));
    assert.ok(replay.body.includes("[EMAIL]"));
  } finally {
    w.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 4A: under 18
// ---------------------------------------------------------------------------

test("p1-lk9 C1: an under-18 student with no guardian-consent claim gets the fixed consent reply, no model call, and no turn text or answer is stored anywhere", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(minor());
    const threadId = await newThread(w, token);
    const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: GERMANY_QUESTION, clientTurnId: "m-1" } });
    assert.equal(res.status, 200);
    assert.equal(res.json.state, "ok");
    assert.equal(w.provider.calls.length, 0, "an unconsented minor's turn makes ZERO provider calls");
    assert.equal(w.kb.calls.length, 0, "and does not search the knowledge base for them either");
    assert.deepEqual(res.json.claims, []);
    assert.deepEqual(res.json.sources, []);
    assert.match(res.json.message, /guardian/i, "the reply asks for guardian consent");
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 0);
    const stored = everythingStored(w.fakeDb);
    assert.ok(!/Germany|tuition|universit/i.test(stored), "nothing the student asked is stored");
    const thread = w.fakeDb.collection<Record<string, unknown>>(COLLECTION_NAMES.chat_threads).all();
    assert.equal(thread.length, 1);
    assert.equal(thread[0]!.textStored, false);
    const hist = await call(w, "GET", `${threadsPath("stu-1")}/${threadId}`, { token });
    assert.deepEqual(hist.json.turns, []);
    assert.equal(hist.json.textStored, false);
  } finally {
    w.cleanup();
  }
});

test("p1-lk9 C1: a minor whose guardianConsent claim is explicitly false, or a token with no age claim at all, makes zero provider calls (fail closed)", async () => {
  const w = chatWorld();
  try {
    const explicit = await studentToken(minor("stu-1", "tenant-a", { guardianConsent: false }));
    const noAge = await studentToken({ tenant: "tenant-a", studentId: "stu-2", role: "student" });
    const stringTrue = await studentToken(minor("stu-3", "tenant-a", { guardianConsent: "true" }));
    for (const [id, token] of [["stu-1", explicit], ["stu-2", noAge], ["stu-3", stringTrue]] as const) {
      const threadId = await newThread(w, token, id);
      const res = await call(w, "POST", turnsPath(id, threadId), { token, body: { text: GERMANY_QUESTION, clientTurnId: `c1-${id}` } });
      assert.equal(res.status, 200, id);
      assert.match(res.json.message, /guardian/i, id);
      assert.deepEqual(res.json.claims, [], id);
      assert.equal(w.provider.calls.length, 0, `${id}: no provider call`);
    }
    assert.equal(w.kb.calls.length, 0);
  } finally {
    w.cleanup();
  }
});

test("p1-lk9 C1: control, an adult and a minor WITH guardian consent are answered normally by the model", async () => {
  const w = chatWorld();
  try {
    const a = await studentToken(adult("stu-1"));
    const ta = await newThread(w, a, "stu-1");
    const ra = await call(w, "POST", turnsPath("stu-1", ta), { token: a, body: { text: GERMANY_QUESTION, clientTurnId: "c1-a" } });
    assert.equal(ra.json.state, "ok");
    assert.ok(ra.json.claims.length >= 1);
    const callsAfterAdult = w.provider.calls.length;
    assert.ok(callsAfterAdult > 0, "control: the provider spy is live");
    const m = await studentToken(minor("stu-2", "tenant-a", { guardianConsent: true }));
    const tm = await newThread(w, m, "stu-2");
    const rm = await call(w, "POST", turnsPath("stu-2", tm), { token: m, body: { text: GERMANY_QUESTION, clientTurnId: "c1-m" } });
    assert.ok(rm.json.claims.length >= 1);
    assert.ok(w.provider.calls.length > callsAfterAdult);
  } finally {
    w.cleanup();
  }
});

test("p1-lk9 C1: a crisis or concern text from an unconsented minor is still answered with the vetted crisis reply, with zero provider calls and no text kept", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(minor());
    const threadId = await newThread(w, token);
    const cr = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "c1-cr" } });
    assert.equal(cr.status, 200);
    assert.equal(cr.json.state, "escalated");
    assert.match(cr.json.message, /14416/);
    const noAge = await studentToken({ tenant: "tenant-a", studentId: "stu-9", role: "student" });
    const t9 = await newThread(w, noAge, "stu-9");
    const cr2 = await call(w, "POST", turnsPath("stu-9", t9), { token: noAge, body: { text: CRISIS_TEXT, clientTurnId: "c1-cr2" } });
    assert.equal(cr2.json.state, "escalated");
    assert.match(cr2.json.message, /14416/);
    const th2 = await newThread(w, token);
    w.clock.ms += 60_000;
    const co = await call(w, "POST", turnsPath("stu-1", th2), { token, body: { text: "I feel hopeless about my marks", clientTurnId: "c1-co" } });
    assert.equal(co.status, 200);
    assert.equal(co.json.state, "escalated", "the guard treats an unsure or indirect text as the higher level (B24.7)");
    assert.match(co.json.message, /14416/);
    assert.equal(w.provider.calls.length, 0, "no provider call for any of the three");
    assert.equal(w.escalations.length, 0, "an unconsented minor's text is not handed to escalation");
    assert.ok(!/kill|myself|hopeless/i.test(everythingStored(w.fakeDb)));
  } finally {
    w.cleanup();
  }
});

test("D-093 4A: an under-18 student without consent who opens the chat and leaves before asking anything has a thread already marked text-free", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(minor());
    const threadId = await newThread(w, token);
    const rows = w.fakeDb.collection<Record<string, unknown>>(COLLECTION_NAMES.chat_threads).all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.textStored, false);
    const hist = await call(w, "GET", `${threadsPath("stu-1")}/${threadId}`, { token });
    assert.equal(hist.json.textStored, false);
    assert.deepEqual(hist.json.turns, []);
  } finally {
    w.cleanup();
  }
});

test("D-093 4A: a token with no age and no minor claim is treated as under 18 (fail closed), so its text is not stored either", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken({ tenant: "tenant-a", studentId: "stu-1", role: "student" });
    const threadId = await newThread(w, token);
    await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: GERMANY_QUESTION } });
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 0);
  } finally {
    w.cleanup();
  }
});

test("D-093 4A: an under-18 student WITH the guardian-consent claim is stored like an adult; a consent claim that is the string 'true' is not consent", async () => {
  const w = chatWorld();
  try {
    const ok = await studentToken(minor("stu-1", "tenant-a", { guardianConsent: true }));
    const threadId = await newThread(w, ok);
    await call(w, "POST", turnsPath("stu-1", threadId), { token: ok, body: { text: GERMANY_QUESTION, clientTurnId: "g-1" } });
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 2);
    const bad = await studentToken(minor("stu-2", "tenant-a", { guardianConsent: "true" }));
    const th2 = await newThread(w, bad, "stu-2");
    await call(w, "POST", turnsPath("stu-2", th2), { token: bad, body: { text: GERMANY_QUESTION, clientTurnId: "g-2" } });
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 2, "stu-2's exchange added nothing");
  } finally {
    w.cleanup();
  }
});

test("D-093 4A: a thread opened with consent that later turns come without it is marked textStored false, and the earlier stored turns stay readable", async () => {
  const w = chatWorld();
  try {
    const consented = await studentToken(minor("stu-1", "tenant-a", { guardianConsent: true }));
    const threadId = await newThread(w, consented);
    await call(w, "POST", turnsPath("stu-1", threadId), { token: consented, body: { text: GERMANY_QUESTION, clientTurnId: "a-1" } });
    const lapsed = await studentToken(minor("stu-1", "tenant-a"));
    await call(w, "POST", turnsPath("stu-1", threadId), { token: lapsed, body: { text: GERMANY_QUESTION, clientTurnId: "a-2" } });
    const hist = await call(w, "GET", `${threadsPath("stu-1")}/${threadId}`, { token: consented });
    assert.equal(hist.json.textStored, false);
    assert.deepEqual(hist.json.turns.map((t: { turnId: string }) => t.turnId), ["a-1", "a-1"]);
  } finally {
    w.cleanup();
  }
});

test("D-093 4A: a crisis message from an under-18 student without consent gets the fixed message, keeps only an ids-and-time flag row, and does not hand the text to escalation", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(minor());
    const threadId = await newThread(w, token);
    const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "cr-1" } });
    assert.equal(res.status, 200);
    assert.equal(res.json.state, "escalated");
    assert.match(res.json.message, /14416/);
    assert.equal(w.escalations.length, 0);
    const flags = w.fakeDb.collection<Record<string, unknown>>(COLLECTION_NAMES.student_flags).all();
    assert.equal(flags.length, 1);
    assert.deepEqual(Object.keys(flags[0]!).sort(), ["_id", "at", "kind", "studentId", "tenantId", "threadId", "turnId"]);
    assert.ok(!/kill|myself/i.test(everythingStored(w.fakeDb)));
  } finally {
    w.cleanup();
  }
});

test("a crisis message from an adult is answered with the fixed message, flagged in the safety log, and escalated through the tenant's escalation path", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "cr-2" } });
    assert.equal(res.json.state, "escalated");
    assert.match(res.json.message, /14416/);
    assert.equal(w.escalations.length, 1);
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.student_flags).all().length, 1);
    assert.equal(w.provider.calls.length, 0, "a crisis turn never reaches the model");
  } finally {
    w.cleanup();
  }
});

test("a student who raised a crisis flag earlier in the thread still sees the helpline on a later turn after the server restarts (the flag is read from the store)", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "cr-3" } });
    const { createChatApi } = await import("../src/chat.js");
    const fresh = createChatApi({ ...w.deps }, { enabled: true, gatesDir: w.gates.gates, now: new Date("2026-11-01T00:00:00.000Z"), approver: "Umesh", env: {} })!;
    const later = await call({ handler: fresh }, "POST", turnsPath("stu-1", threadId), { token, body: { text: GERMANY_QUESTION, clientTurnId: "cr-4" } });
    assert.match(later.json.message, /14416/);
  } finally {
    w.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Tenants, sandbox, erasure fence
// ---------------------------------------------------------------------------

test("two tenants with the same student id never see each other's threads, and every stored row carries its own tenant", async () => {
  const w = chatWorld();
  try {
    const a = await studentToken(adult("stu-1", "tenant-a"));
    const b = await studentToken(adult("stu-1", "tenant-b"));
    const thA = await newThread(w, a);
    await call(w, "POST", turnsPath("stu-1", thA), { token: a, body: { text: GERMANY_QUESTION, clientTurnId: "t-1" } });
    assert.equal((await call(w, "GET", `${threadsPath("stu-1")}/${thA}`, { token: b })).status, 404);
    assert.equal((await call(w, "POST", turnsPath("stu-1", thA), { token: b, body: { text: GERMANY_QUESTION } })).status, 404);
    const thB = await newThread(w, b);
    const histB = await call(w, "GET", `${threadsPath("stu-1")}/${thB}`, { token: b });
    assert.deepEqual(histB.json.turns, []);
    for (const row of w.fakeDb.collection<{ tenantId?: string }>(COLLECTION_NAMES.chat_turns).all()) assert.equal(row.tenantId, "tenant-a");
    for (const row of w.fakeDb.collection<{ tenantId?: string }>(COLLECTION_NAMES.chat_threads).all()) assert.ok(row.tenantId === "tenant-a" || row.tenantId === "tenant-b");
  } finally {
    w.cleanup();
  }
});

test("A6: the sandbox tenant accepts only syn- student ids (403 for a real-looking id on every route), other tenants are unaffected", async () => {
  const w = chatWorld({ deps: { sandboxTenantId: "sandbox" } });
  try {
    const real = await studentToken(adult("pl-4821", "sandbox"));
    for (const [method, path, body] of [
      ["POST", threadsPath("pl-4821"), undefined],
      ["GET", `${threadsPath("pl-4821")}/th-1`, undefined],
      ["POST", turnsPath("pl-4821", "th-1"), { text: "hello" }],
      ["GET", "/v1/students/pl-4821/chat/profile", undefined],
    ] as const) {
      const res = await call(w, method, path, { token: real, ...(body ? { body } : {}) });
      assert.equal(res.status, 403, path);
      assert.equal(res.json.error, "sandbox_synthetic_only");
    }
    assert.equal(everythingStored(w.fakeDb), "[]");
    const syn = await studentToken(adult("syn-001", "sandbox"));
    assert.equal((await call(w, "POST", threadsPath("syn-001"), { token: syn })).status, 201);
    const prod = await studentToken(adult("pl-4821", "tenant-a"));
    assert.equal((await call(w, "POST", threadsPath("pl-4821"), { token: prod })).status, 201);
  } finally {
    w.cleanup();
  }
});

test("D-015: a student whose erasure is in progress is told 409 student_fenced, the model is not called, and nothing new is kept", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const db = w.deps.dbForTenant("tenant-a");
    const { requestId } = await requestErasure(db, { studentId: "stu-1", requestedBy: "counsellor-7", reason: "student_request" });
    await confirmErasure(db, { requestId, confirmedBy: "admin-2" });
    const turn = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: GERMANY_QUESTION, clientTurnId: "f-1" } });
    assert.equal(turn.status, 409);
    assert.equal(turn.json.error, "student_fenced");
    assert.equal(w.provider.calls.length, 0);
    assert.equal((await call(w, "POST", threadsPath("stu-1"), { token })).status, 409);
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 0);
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.student_usage).all().length, 0);
  } finally {
    w.cleanup();
  }
});

test("a 500 from an unexpected failure carries no cause and the log line carries no student text", async () => {
  const w = chatWorld({
    deps: {
      dbForTenant: () => {
        throw new Error(`boom with ${GERMANY_QUESTION} and 9876543210`);
      },
    },
  });
  try {
    const token = await studentToken(adult());
    const res = await call(w, "POST", threadsPath("stu-1"), { token });
    assert.equal(res.status, 500);
    assert.deepEqual(res.json, { error: "internal" });
    assert.ok(!JSON.stringify(w.logs).includes("9876543210"));
    assert.equal(w.logs.length, 1);
  } finally {
    w.cleanup();
  }
});

// ---------------------------------------------------------------------------
// p1-u8r (U8 repair): fail-closed profile outage, crisis flood cap, lower-case names, echoed names, redacted escalation input
// ---------------------------------------------------------------------------

test("p1-u8r A1: a student who types 'my name is devika nair' in lower case has the name in nothing that is stored or read back", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: `my name is devika nair. ${GERMANY_QUESTION}`, clientTurnId: "lc-1" } });
    assert.equal(res.status, 200);
    const stored = everythingStored(w.fakeDb);
    assert.ok(!/devika|nair/i.test(stored), "the lower-case name must not be stored");
    assert.ok(stored.includes("[NAME]"));
    const hist = await call(w, "GET", `${threadsPath("stu-1")}/${threadId}`, { token });
    assert.ok(!/devika|nair/i.test(hist.body));
  } finally {
    w.cleanup();
  }
});

test("p1-u8r A1: 'i am tired' and 'i am from delhi' in a stored question survive redaction (no over-redaction)", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: `i am tired and i am from delhi. ${GERMANY_QUESTION}`, clientTurnId: "lc-2" } });
    const stored = everythingStored(w.fakeDb);
    assert.ok(stored.includes("i am tired and i am from delhi"), "ordinary lower-case sentences are kept as typed");
    assert.ok(!stored.includes("[NAME]"));
  } finally {
    w.cleanup();
  }
});

for (const [label, intro] of [
  ["capitalised", "My name is Anita Verma."],
  ["lower case", "my name is anita verma."],
] as const) {
  test(`p1-u8r A2: a name the student stated (${label}) and the model echoes in its reply is stored and replayed redacted, while the live answer is unchanged`, async () => {
    const text = "Welcome Anita Verma, public universities in Germany charge no tuition for most programmes.";
    const kb = recordingKb({ status: "ok", hits: [{ ...HIT, text }], dropped: 0 });
    const w = chatWorld({ kb, provider: kbAnswerProvider([{ text, kind: "fact", sourceIds: ["t-sem-1"] }]) });
    try {
      const token = await studentToken(adult());
      const threadId = await newThread(w, token);
      const body = { text: `${intro} ${GERMANY_QUESTION}`, clientTurnId: "echo-name" };
      const live = await call(w, "POST", turnsPath("stu-1", threadId), { token, body });
      assert.equal(live.status, 200);
      assert.ok(live.body.includes("Anita Verma"), "the live answer is unchanged");
      assert.ok(!/anita|verma/i.test(everythingStored(w.fakeDb)), "the echoed name is in nothing stored (message and claims)");
      const replay = await call(w, "POST", turnsPath("stu-1", threadId), { token, body });
      assert.ok(!/anita|verma/i.test(replay.body), "nor in the replay");
      const hist = await call(w, "GET", `${threadsPath("stu-1")}/${threadId}`, { token });
      assert.ok(!/anita|verma/i.test(hist.body), "nor in the history");
    } finally {
      w.cleanup();
    }
  });
}

test("p1-u8r M1: when the Pathlynks profile cannot be read, an ordinary turn is refused 503 before anything is written (a profile name could not be redacted), and works once the profile is back", async () => {
  let down = true;
  const w = chatWorld({
    deps: {
      profile: {
        facts: async () => {
          if (down) throw new Error("pathlynks is down");
          return [{ key: "full_name", value: "Meera Kulkarni", source: "pathlynks" }];
        },
      },
    },
  });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const body = { text: `${GERMANY_QUESTION} Asking for Meera Kulkarni.`, clientTurnId: "out-1" };
    const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body });
    assert.equal(res.status, 503);
    assert.equal(res.json.error, "profile_unavailable");
    assert.equal(w.provider.calls.length, 0);
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 0);
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.student_usage).all().length, 0);
    assert.ok(!everythingStored(w.fakeDb).includes("Kulkarni"));
    down = false;
    const retry = await call(w, "POST", turnsPath("stu-1", threadId), { token, body });
    assert.equal(retry.status, 200, "the same turn id is accepted on retry (no 409 from a changed request hash)");
    assert.ok(!everythingStored(w.fakeDb).includes("Kulkarni"));
  } finally {
    w.cleanup();
  }
});

test("p1-u8r M1: a crisis message during a profile outage still gets the helpline and an escalation, but its text is not stored", async () => {
  const w = chatWorld({
    deps: {
      profile: {
        facts: async () => {
          throw new Error("pathlynks is down");
        },
      },
    },
  });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: `I am Meera and ${CRISIS_TEXT}`, clientTurnId: "out-2" } });
    assert.equal(res.status, 200);
    assert.equal(res.json.state, "escalated");
    assert.match(res.json.message, /14416/);
    assert.equal(w.escalations.length, 1);
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.student_flags).all().length, 1);
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 0, "no turn text is stored while the profile name cannot be redacted");
    assert.ok(!/Meera|kill/i.test(everythingStored(w.fakeDb)));
  } finally {
    w.cleanup();
  }
});

test("p1-u8r M2: a flood of crisis messages in one thread is always answered with the helpline, but writes at most one stored exchange, one flag, one escalation and one usage count per window", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    for (let i = 0; i < 40; i++) {
      const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: `fl-${i}` } });
      assert.equal(res.status, 200, `crisis turn ${i} is never refused`);
      assert.equal(res.json.state, "escalated");
      assert.match(res.json.message, /14416/);
    }
    assert.equal(w.escalations.length, 1, "one escalation per thread per window");
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.student_flags).all().length, 1);
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length, 2, "one stored exchange (user + assistant)");
    const usage = w.fakeDb.collection<{ textTurns: number }>(COLLECTION_NAMES.student_usage).all();
    assert.equal(usage.reduce((n, u) => n + u.textTurns, 0), 1);
    // The window ends: the next crisis message is escalated again.
    w.clock.ms += 11 * 60_000;
    const later = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "fl-later" } });
    assert.equal(later.json.state, "escalated");
    assert.equal(w.escalations.length, 2);
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.student_flags).all().length, 2);
  } finally {
    w.cleanup();
  }
});

test("p1-u8r M2: a crisis turn whose escalation write failed does not use up the window, so the next crisis turn is escalated", async () => {
  let attempts = 0;
  const w = chatWorld({
    deps: {
      escalateForTenant: () => async () => {
        attempts++;
        if (attempts === 1) throw new Error("mongo blip");
      },
    },
  });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const first = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "rl-1" } });
    assert.equal(first.json.state, "escalated");
    assert.match(first.json.message, /14416/);
    const second = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "rl-2" } });
    assert.equal(second.json.state, "escalated");
    assert.equal(attempts, 2, "the retry after a failed escalation reached the escalation path");
    const third = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "rl-3" } });
    assert.equal(third.json.state, "escalated");
    assert.equal(attempts, 2, "once an escalation went through, the window is used");
  } finally {
    w.cleanup();
  }
});

test("p1-u8r item 5: the crisis escalation path is handed redacted text, never the student's name, phone or email, and the crisis is still escalated", async () => {
  const w = chatWorld({ deps: { profile: { facts: async () => [{ key: "full_name", value: "Meera Kulkarni", source: "pathlynks" }] } } });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const res = await call(w, "POST", turnsPath("stu-1", threadId), {
      token,
      body: { text: `my name is priya sharma, mail priya@example.com or 9876543210, my friend Meera Kulkarni knows. ${CRISIS_TEXT}`, clientTurnId: "esc-1" },
    });
    assert.equal(res.json.state, "escalated");
    assert.equal(w.escalations.length, 1, "the crisis is still escalated");
    const handed = JSON.stringify(w.escalations);
    for (const raw of ["priya", "sharma", "priya@example.com", "9876543210", "Meera", "Kulkarni"]) assert.ok(!handed.toLowerCase().includes(raw.toLowerCase()), `${raw} must not reach the escalation path`);
    assert.ok(/kill myself/i.test(handed), "the crisis wording itself is kept so the guard and the classifier still see it");
    assert.ok(handed.includes("[NAME]"));
  } finally {
    w.cleanup();
  }
});

test("p1-u8r item 5: redacting an introduction never hides the crisis wording from the escalation ('i am unalive' is not turned into 'i am [NAME]')", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: "i am unalive", clientTurnId: "sui-1" } });
    assert.equal(res.json.state, "escalated");
    assert.equal(w.escalations.length, 1);
    assert.match(JSON.stringify(w.escalations), /unalive/);
  } finally {
    w.cleanup();
  }
});

test("p1-u8r M2: the crisis budget is per thread, so a student in a second thread is still escalated within the same window", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const one = await newThread(w, token);
    const two = await newThread(w, token);
    await call(w, "POST", turnsPath("stu-1", one), { token, body: { text: CRISIS_TEXT, clientTurnId: "th-1" } });
    await call(w, "POST", turnsPath("stu-1", one), { token, body: { text: CRISIS_TEXT, clientTurnId: "th-2" } });
    await call(w, "POST", turnsPath("stu-1", two), { token, body: { text: CRISIS_TEXT, clientTurnId: "th-3" } });
    assert.equal(w.escalations.length, 2);
  } finally {
    w.cleanup();
  }
});

// ---- p1-u8r fix cycle 1 ----------------------------------------------------------------------------------------------------------
const CONCERN_TEXT = "I feel hopeless about my marks";

test("p1-u8r cycle 1 H1: a concern turn does not hide a crisis turn that follows it in the window (concern then crisis escalates twice)", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const one = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CONCERN_TEXT, clientTurnId: "h1-a" } });
    assert.equal(one.status, 200);
    assert.equal(w.escalations.length, 1, "the concern turn is escalated");
    w.clock.ms += 60_000;
    const two = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "h1-b" } });
    assert.equal(two.json.state, "escalated");
    assert.match(two.json.message, /14416/);
    assert.equal(w.escalations.length, 2, "the crisis turn that follows a concern turn is escalated too");
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.student_flags).all().length, 2, "both turns are flagged");
    // The slot now holds the higher level: a further crisis and a further concern are quiet.
    w.clock.ms += 60_000;
    await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "h1-c" } });
    await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CONCERN_TEXT, clientTurnId: "h1-d" } });
    assert.equal(w.escalations.length, 2, "equal or lower level inside the window stays quiet");
  } finally {
    w.cleanup();
  }
});

test("p1-u8r cycle 1 H1: crisis then crisis escalates once, and crisis then concern escalates once", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const a = await newThread(w, token);
    await call(w, "POST", turnsPath("stu-1", a), { token, body: { text: CRISIS_TEXT, clientTurnId: "h1-e" } });
    w.clock.ms += 60_000;
    await call(w, "POST", turnsPath("stu-1", a), { token, body: { text: CRISIS_TEXT, clientTurnId: "h1-f" } });
    assert.equal(w.escalations.length, 1, "crisis then crisis: one escalation");
    const b = await newThread(w, token);
    await call(w, "POST", turnsPath("stu-1", b), { token, body: { text: CRISIS_TEXT, clientTurnId: "h1-g" } });
    w.clock.ms += 60_000;
    const low = await call(w, "POST", turnsPath("stu-1", b), { token, body: { text: CONCERN_TEXT, clientTurnId: "h1-h" } });
    assert.equal(low.status, 200);
    assert.match(low.json.message, /14416|helpline|Tele/i, "the quiet turn still carries the helpline");
    assert.equal(w.escalations.length, 2, "crisis then concern on a second thread adds only that thread's first escalation");
  } finally {
    w.cleanup();
  }
});

test("p1-u8r cycle 1 M-race: a quiet crisis turn answered while the slot holder is still in flight leaves a text-free flag, even if the holder then fails", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let attempts = 0;
  const w = chatWorld({
    deps: {
      escalateForTenant: () => async () => {
        attempts++;
        if (attempts === 1) {
          await gate;
          throw new Error("mongo blip");
        }
      },
    },
  });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const holder = call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "rc-1" } });
    await new Promise((r) => setTimeout(r, 20));
    const quiet = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "rc-2" } });
    assert.equal(quiet.status, 200);
    assert.match(quiet.json.message, /14416/);
    release();
    await holder;
    const flags = w.fakeDb.collection<{ turnId: string; kind: string }>(COLLECTION_NAMES.student_flags).all();
    assert.ok(flags.some((f) => f.turnId === "rc-2" && f.kind === "crisis"), "the quiet turn is recorded as a flag (ids, level, time)");
    assert.equal(JSON.stringify(flags).includes("kill myself"), false, "a quiet turn's flag holds no student text");
  } finally {
    release();
    w.cleanup();
  }
});

test("p1-u8r cycle 1 M-race: a retry with the same clientTurnId of a completed crisis turn replays the stored answer and does not run the model again", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const first = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "rp-1" } });
    assert.equal(first.json.state, "escalated");
    // Mark the stored answer so a replay is told apart from a fresh run of the (fixed-text) crisis graph.
    const rows = w.fakeDb.collection<{ _id: string; role: string; response?: { message?: string } }>(COLLECTION_NAMES.chat_turns);
    const assistant = rows.all().find((r) => r.role === "assistant")!;
    await rows.updateOne({ _id: assistant._id } as never, { $set: { response: { ...assistant.response, message: "STORED-MARKER 14416" } } } as never);
    const escalationsBefore = w.escalations.length;
    const retry = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "rp-1" } });
    assert.equal(retry.status, 200);
    assert.equal(retry.json.message, "STORED-MARKER 14416", "the stored response is replayed, the graph is not run again");
    assert.equal(w.escalations.length, escalationsBefore, "no new escalation");
    assert.equal(w.fakeDb.collection(COLLECTION_NAMES.student_flags).all().length, 1, "no new flag");
  } finally {
    w.cleanup();
  }
});

// p1-u8r cycle 2: a crisis turn may be answered quietly only because another turn in its window ACTUALLY escalated.
const OVERLONG_CRISIS = "I want to kill myself. " + "x ".repeat(3000);
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
const flagRows = (w: ReturnType<typeof chatWorld>) => w.fakeDb.collection<{ turnId: string; kind: string }>(COLLECTION_NAMES.student_flags).all();
const until = async (cond: () => boolean) => {
  while (!cond()) await new Promise((r) => setTimeout(r, 5));
};

test("p1-u8r cycle 2 item 1: an over-long crisis turn (which cannot escalate) does not silence a normal crisis turn 60 s later", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const first = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: OVERLONG_CRISIS, clientTurnId: "c2-ol-1" } });
    assert.equal(first.json.state, "escalated");
    assert.equal(w.escalations.length, 0, "the over-long turn has no escalation port");
    w.clock.ms += 60_000;
    const second = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "c2-ol-2" } });
    assert.equal(second.json.state, "escalated");
    assert.equal(w.escalations.length, 1, "the full crisis turn is escalated");
    assert.ok(flagRows(w).some((f) => f.turnId === "c2-ol-2"), "and flagged");
    // An over-long crisis does not silence a concern turn either.
    const b = await newThread(w, token);
    await call(w, "POST", turnsPath("stu-1", b), { token, body: { text: OVERLONG_CRISIS, clientTurnId: "c2-ol-3" } });
    w.clock.ms += 60_000;
    await call(w, "POST", turnsPath("stu-1", b), { token, body: { text: CONCERN_TEXT, clientTurnId: "c2-ol-4" } });
    assert.equal(w.escalations.length, 2, "the concern turn behind an over-long crisis is escalated");
  } finally {
    w.cleanup();
  }
});

test("p1-u8r cycle 2 item 1: an unconsented minor's crisis turn does not silence a later consented crisis turn in the same thread", async () => {
  const w = chatWorld();
  try {
    const minorToken = await studentToken(minor());
    const threadId = await newThread(w, minorToken);
    await call(w, "POST", turnsPath("stu-1", threadId), { token: minorToken, body: { text: CRISIS_TEXT, clientTurnId: "c2-mn-1" } });
    assert.equal(w.escalations.length, 0);
    w.clock.ms += 60_000;
    const consented = await studentToken(minor("stu-1", "tenant-a", { guardianConsent: true }));
    const res = await call(w, "POST", turnsPath("stu-1", threadId), { token: consented, body: { text: CRISIS_TEXT, clientTurnId: "c2-mn-2" } });
    assert.equal(res.json.state, "escalated");
    assert.equal(w.escalations.length, 1, "the consented crisis turn is escalated");
    // A textless turn never confirms the slot (nothing was escalated), so a second unconsented crisis turn is not quiet: it is flagged too.
    const other = await newThread(w, minorToken);
    await call(w, "POST", turnsPath("stu-1", other), { token: minorToken, body: { text: CRISIS_TEXT, clientTurnId: "c2-mn-3" } });
    w.clock.ms += 60_000;
    await call(w, "POST", turnsPath("stu-1", other), { token: minorToken, body: { text: CRISIS_TEXT, clientTurnId: "c2-mn-4" } });
    const ids = flagRows(w).map((f) => f.turnId);
    assert.ok(ids.includes("c2-mn-3") && ids.includes("c2-mn-4"), `both unconsented crisis turns are flagged: ${ids.join(",")}`);
  } finally {
    w.cleanup();
  }
});

test("p1-u8r cycle 2 item 2: a failed holder's slot is never put back (concern A in flight, crisis B takes over, A fails, B fails, then concern C escalates)", async () => {
  const gates: Array<() => void> = [];
  let attempts = 0;
  const w = chatWorld({
    deps: {
      quietWaitMs: 50,
      escalateForTenant: () => async (input) => {
        const n = ++attempts;
        if (n <= 2) {
          await new Promise<void>((r) => gates.push(r));
          throw new Error("mongo blip");
        }
        w.escalations.push(input);
      },
    },
  });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const a = call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CONCERN_TEXT, clientTurnId: "c2-g-a" } });
    await until(() => gates.length >= 1);
    const b = call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "c2-g-b" } });
    await until(() => gates.length >= 2);
    gates[0]!();
    await a;
    gates[1]!();
    await b;
    const c = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CONCERN_TEXT, clientTurnId: "c2-g-c" } });
    assert.equal(c.status, 200);
    assert.equal(attempts, 3, "concern C reached the escalation path");
    assert.equal(w.escalations.length, 1, "and was escalated");
    // C held the slot itself (no failed ghost was put back in its way), so its escalation now covers the window.
    await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CONCERN_TEXT, clientTurnId: "c2-g-d" } });
    assert.equal(attempts, 3, "a further concern in the window is quiet behind C's confirmed escalation");
  } finally {
    gates.forEach((g) => g());
    w.cleanup();
  }
});

test("p1-u8r cycle 2 item 3: a quiet turn behind an in-flight holder waits for it; when the holder fails, the waiting turn escalates itself", async () => {
  const gate = deferred();
  let attempts = 0;
  const w = chatWorld({
    deps: {
      quietWaitMs: 5_000,
      escalateForTenant: () => async (input) => {
        attempts++;
        if (attempts === 1) {
          await gate.promise;
          throw new Error("mongo blip");
        }
        w.escalations.push(input);
      },
    },
  });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const holder = call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "c2-w-1" } });
    await until(() => attempts >= 1);
    const waiting = call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "c2-w-2" } });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(attempts, 1, "the second turn is waiting on the holder, not yet escalating");
    gate.resolve();
    await holder;
    const res = await waiting;
    assert.equal(res.json.state, "escalated");
    assert.equal(attempts, 2, "the waiting turn ran the escalation path itself");
    assert.equal(w.escalations.length, 1, "exactly one escalation went through");
    await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "c2-w-3" } });
    assert.equal(attempts, 2, "a later crisis in the window is quiet behind the confirmed escalation");
  } finally {
    gate.resolve();
    w.cleanup();
  }
});

test("p1-u8r cycle 2 item 3: a quiet turn behind an in-flight holder that succeeds stays quiet and writes nothing", async () => {
  const gate = deferred();
  let attempts = 0;
  const w = chatWorld({
    deps: {
      quietWaitMs: 5_000,
      escalateForTenant: () => async (input) => {
        attempts++;
        if (attempts === 1) await gate.promise;
        w.escalations.push(input);
      },
    },
  });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const holder = call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "c2-s-1" } });
    await until(() => attempts >= 1);
    const waiting = call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "c2-s-2" } });
    await new Promise((r) => setTimeout(r, 30));
    gate.resolve();
    await holder;
    const res = await waiting;
    assert.match(res.json.message, /14416/);
    assert.equal(attempts, 1, "the waiting turn did not escalate again");
    assert.deepEqual(flagRows(w).map((f) => f.turnId), ["c2-s-1"], "only the holder's flag");
  } finally {
    gate.resolve();
    w.cleanup();
  }
});

test("p1-u8r cycle 2 item 3: the wait is bounded; a holder that hangs past it does not keep the waiting crisis turn from escalating", async () => {
  const gate = deferred();
  let attempts = 0;
  const w = chatWorld({
    deps: {
      quietWaitMs: 100,
      escalateForTenant: () => async (input) => {
        attempts++;
        if (attempts === 1) await gate.promise;
        w.escalations.push(input);
      },
    },
  });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const holder = call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "c2-b-1" } });
    await until(() => attempts >= 1);
    const res = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: CRISIS_TEXT, clientTurnId: "c2-b-2" } });
    assert.equal(res.json.state, "escalated");
    assert.equal(attempts, 2, "after the bounded wait the turn escalated itself");
    gate.resolve();
    await holder;
  } finally {
    gate.resolve();
    w.cleanup();
  }
});
