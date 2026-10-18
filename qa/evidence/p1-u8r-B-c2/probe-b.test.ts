/** Coordinator B hostile probes for p1-u8r-chat-privacy cycle 2. Evidence only; not part of the unit. Synthetic data. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { COLLECTION_NAMES } from "../../../packages/db/src/index.js";
import { redactPii } from "../../../packages/schemas/src/redact.js";
import { HIT } from "../../../apps/api/tests/anonymous-fixtures.js";
import { CRISIS_TEXT, GERMANY_QUESTION, adult, call, chatWorld, everythingStored, kbAnswerProvider, newThread, recordingKb, studentToken, threadsPath, turnsPath } from "../../../apps/api/tests/chat-fixtures.js";

const say = (k: string, v: unknown) => console.log(`PROBE ${k} ${JSON.stringify(v)}`);
const CONCERN = "I feel hopeless about my marks";
const col = (w: any, n: string) => w.fakeDb.collection(n).all();

// ---------- redaction unit probes ----------
test("names: required variants", () => {
  const must = ["my name is devika nair", "i am kabir", "call me aarav", "MY NAME IS ROHAN", "My name is Dr. Anita Verma", "I am Mr. Rao from Pune", "my name is prof. sharma",
    "My name is Mrs. Priya Nair", "my name is MS. gupta", "I am Shri Ramesh Iyer", "i am smt. lakshmi devi", "My name is Sri Venkat", "I am Kumari Meena", "my name is km. sita", "MY NAME IS DR. ANITA VERMA", "i'm kabir singh"];
  for (const t of must) {
    const r = redactPii(t);
    say("name", { in: t, out: r.text, names: r.names });
  }
  const check = (t: string, leaks: string[], keeps: string[] = []) => {
    const r = redactPii(t).text;
    for (const l of leaks) assert.ok(!r.toLowerCase().includes(l.toLowerCase()), `${t} -> ${r} leaks ${l}`);
    for (const k of keeps) assert.ok(r.includes(k), `${t} -> ${r} lost ${k}`);
  };
  check("my name is devika nair", ["devika", "nair"]);
  check("i am kabir", ["kabir"]);
  check("call me aarav", ["aarav"]);
  check("MY NAME IS ROHAN", ["rohan"]);
  check("My name is Dr. Anita Verma", ["anita", "verma"]);
  check("I am Mr. Rao from Pune", ["rao"], ["from Pune"]);
  check("my name is prof. sharma", ["sharma"]);
  check("My name is Mrs. Priya Nair", ["priya", "nair"]);
  check("my name is ms. gupta", ["gupta"]);
  check("I am Shri Ramesh Iyer", ["ramesh", "iyer"]);
  check("i am smt. lakshmi devi", ["lakshmi"]);
  check("My name is Sri Venkat", ["venkat"]);
  check("I am Kumari Meena", ["meena"]);
  check("my name is km. sita", ["sita"]);
  check("MY NAME IS DR. ANITA VERMA", ["anita", "verma"]);
  check("i'm kabir singh", ["kabir", "singh"]);
});

test("names: precision", () => {
  for (const t of ["i am tired", "i am from delhi", "i am a student", "i am going to apply", "i am really worried about fees", "i am 17 years old"]) {
    const r = redactPii(t);
    say("prec", { in: t, out: r.text });
    assert.equal(r.text, t);
  }
});

test("names: record unsupported / edge", () => {
  for (const t of ["naam hai priya", "mera naam priya hai", "My name is Prof. Dr. Anita Devi Verma", "I am Dr. Anita. What is the fee?", "my name is dr. what is the fee", "Hi, this is Mr. Rao calling", "my name is Anita Kumari Devi Verma Singh"]) {
    const r = redactPii(t);
    say("edge", { in: t, out: r.text, names: r.names });
  }
});

test("perf: email scan", () => {
  const cases: Array<[string, string]> = [
    ["2M no-@ letters", "a".repeat(2_000_000)],
    ["2M no-@ a.", "a.".repeat(1_000_000)],
    ["200k a.", "a.".repeat(100_000)],
    ["250k a@+letters", "a@" + "a".repeat(250_000)],
    ["250k a@+a.a.", "a@" + "a.".repeat(125_000)],
    ["250k @@@@", "a@".repeat(125_000)],
    ["250k x@ a.b. many", "x@a.b".repeat(50_000)],
    ["250k digits-space", "1 ".repeat(125_000)],
    ["250k spaces after digit", "1" + " ".repeat(250_000) + "x"],
    ["250k i am i am", "i am ".repeat(50_000)],
    ["250k my name is X", "my name is Anita ".repeat(15_000)],
    ["250k Dr. chain", "my name is " + "Dr. ".repeat(60_000)],
  ];
  for (const [label, s] of cases) {
    const t0 = performance.now();
    redactPii(s);
    const ms = performance.now() - t0;
    say("perf", { label, len: s.length, ms: Math.round(ms) });
    if (label.startsWith("2M no-@") || label.startsWith("200k")) assert.ok(ms < 200, `${label} took ${ms}`);
  }
});

// ---------- API probes ----------
test("outage: ordinary turn 503 zero writes, retry works; crisis answered+escalated, text not stored", async () => {
  let down = true;
  const w = chatWorld({ deps: { profile: { facts: async () => { if (down) throw new Error("down"); return [{ key: "full_name", value: "Meera Kulkarni", source: "pathlynks" }]; } } } });
  try {
    const token = await studentToken(adult());
    const th = await newThread(w, token);
    const before = everythingStored(w.fakeDb);
    const body = { text: `${GERMANY_QUESTION} for Meera Kulkarni`, clientTurnId: "o1" };
    const r1 = await call(w, "POST", turnsPath("stu-1", th), { token, body });
    assert.equal(r1.status, 503);
    assert.equal(everythingStored(w.fakeDb), before, "zero writes");
    assert.equal(w.provider.calls.length, 0);
    down = false;
    const r2 = await call(w, "POST", turnsPath("stu-1", th), { token, body });
    assert.equal(r2.status, 200);
    assert.ok(!everythingStored(w.fakeDb).includes("Kulkarni"));
    down = true;
    const c = await call(w, "POST", turnsPath("stu-1", th), { token, body: { text: `my name is meera kulkarni. ${CRISIS_TEXT}`, clientTurnId: "o2" } });
    assert.equal(c.status, 200);
    assert.match(c.json.message, /14416/);
    assert.equal(w.escalations.length, 1);
    const stored = everythingStored(w.fakeDb);
    assert.ok(!/kill myself/i.test(stored) && !/meera|kulkarni/i.test(stored.replace(/Meera Kulkarni/g, "")), "crisis text not stored");
    say("outage-crisis-escalation-input", JSON.stringify(w.escalations).slice(0, 300));
  } finally { w.cleanup(); }
});

test("flood: 5 crisis in 10 min = 1 stored/flagged/escalated, all helpline; other thread/student/tenant independent", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const th = await newThread(w, token);
    for (let i = 0; i < 5; i++) {
      const r = await call(w, "POST", turnsPath("stu-1", th), { token, body: { text: CRISIS_TEXT, clientTurnId: `f${i}` } });
      assert.equal(r.status, 200); assert.match(r.json.message, /14416/);
      w.clock.ms += 100_000;
    }
    assert.equal(col(w, COLLECTION_NAMES.chat_turns).length, 2);
    assert.equal(col(w, COLLECTION_NAMES.student_flags).length, 1);
    assert.equal(w.escalations.length, 1);
    const th2 = await newThread(w, token);
    await call(w, "POST", turnsPath("stu-1", th2), { token, body: { text: CRISIS_TEXT, clientTurnId: "g0" } });
    assert.equal(w.escalations.length, 2);
    const t2 = await studentToken(adult("stu-2"));
    const th3 = await newThread(w, t2, "stu-2");
    await call(w, "POST", turnsPath("stu-2", th3), { token: t2, body: { text: CRISIS_TEXT, clientTurnId: "h0" } });
    assert.equal(w.escalations.length, 3);
    const t3 = await studentToken(adult("stu-1", "tenant-b"));
    const th4 = await newThread(w, t3, "stu-1");
    await call(w, "POST", turnsPath("stu-1", th4), { token: t3, body: { text: CRISIS_TEXT, clientTurnId: "i0" } });
    assert.equal(w.escalations.length, 4);
  } finally { w.cleanup(); }
});

test("flood: failed FLAG write gives the slot back", async () => {
  const w = chatWorld();
  try {
    const flags: any = w.fakeDb.collection(COLLECTION_NAMES.student_flags);
    const orig = flags.updateOne.bind(flags);
    let failures = 1;
    let injected = 0;
    flags.updateOne = (...a: unknown[]) => { if (failures-- > 0) { injected++; throw new Error("flag blip"); } return orig(...a); };
    const token = await studentToken(adult());
    const th = await newThread(w, token);
    const r1 = await call(w, "POST", turnsPath("stu-1", th), { token, body: { text: CRISIS_TEXT, clientTurnId: "ff1" } });
    assert.equal(r1.status, 200); assert.match(r1.json.message, /14416/);
    say("flagfail-after-first", { injected, flags: col(w, COLLECTION_NAMES.student_flags).length, esc: w.escalations.length });
    assert.equal(injected, 1, "the injection actually fired (instrument check)");
    const r2 = await call(w, "POST", turnsPath("stu-1", th), { token, body: { text: CRISIS_TEXT, clientTurnId: "ff2" } });
    assert.equal(r2.status, 200);
    const escAfter2 = w.escalations.length;
    const flagsAfter2 = col(w, COLLECTION_NAMES.student_flags).length;
    say("flagfail-after-second", { esc: escAfter2, flags: flagsAfter2 });
    assert.ok(flagsAfter2 >= 1, "second crisis got flagged (slot was given back)");
    await call(w, "POST", turnsPath("stu-1", th), { token, body: { text: CRISIS_TEXT, clientTurnId: "ff3" } });
    assert.equal(w.escalations.length, escAfter2, "after a confirmed holder the third is quiet");
  } finally { w.cleanup(); }
});

test("ranked: concern then crisis 60s = 2 esc; crisis then concern = 1", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const a = await newThread(w, token);
    await call(w, "POST", turnsPath("stu-1", a), { token, body: { text: CONCERN, clientTurnId: "r1" } });
    w.clock.ms += 60_000;
    const c = await call(w, "POST", turnsPath("stu-1", a), { token, body: { text: CRISIS_TEXT, clientTurnId: "r2" } });
    assert.equal(c.json.state, "escalated");
    assert.equal(w.escalations.length, 2);
    assert.equal(col(w, COLLECTION_NAMES.student_flags).length, 2);
    const b = await newThread(w, token);
    await call(w, "POST", turnsPath("stu-1", b), { token, body: { text: CRISIS_TEXT, clientTurnId: "r3" } });
    w.clock.ms += 60_000;
    await call(w, "POST", turnsPath("stu-1", b), { token, body: { text: CONCERN, clientTurnId: "r4" } });
    assert.equal(w.escalations.length, 3);
  } finally { w.cleanup(); }
});

test("ranked: a failed upgrade restores the previous (concern) holder", async () => {
  let n = 0;
  const w: any = chatWorld({ deps: { escalateForTenant: () => async (input: unknown) => { n++; if (n === 2) throw new Error("blip"); w.escalations.push(input); } } });
  try {
    const token = await studentToken(adult());
    const a = await newThread(w, token);
    await call(w, "POST", turnsPath("stu-1", a), { token, body: { text: CONCERN, clientTurnId: "u1" } });
    assert.equal(n, 1);
    w.clock.ms += 60_000;
    const up = await call(w, "POST", turnsPath("stu-1", a), { token, body: { text: CRISIS_TEXT, clientTurnId: "u2" } });
    assert.equal(up.status, 200); assert.match(up.json.message, /14416/);
    assert.equal(n, 2);
    w.clock.ms += 60_000;
    await call(w, "POST", turnsPath("stu-1", a), { token, body: { text: CONCERN, clientTurnId: "u3" } });
    say("restore", { n_after_concern: n });
    assert.equal(n, 2, "previous holder restored: concern is quiet");
    await call(w, "POST", turnsPath("stu-1", a), { token, body: { text: CRISIS_TEXT, clientTurnId: "u4" } });
    assert.equal(n, 3, "crisis still escalates after the failed upgrade");
  } finally { w.cleanup(); }
});

test("concurrent: two crisis turns, first fails => second leaves a record", async () => {
  let release!: () => void; const gate = new Promise<void>((r) => (release = r));
  let n = 0;
  const w = chatWorld({ deps: { escalateForTenant: () => async () => { n++; if (n === 1) { await gate; throw new Error("blip"); } } } });
  try {
    const token = await studentToken(adult());
    const th = await newThread(w, token);
    const p1 = call(w, "POST", turnsPath("stu-1", th), { token, body: { text: CRISIS_TEXT, clientTurnId: "k1" } });
    await new Promise((r) => setTimeout(r, 30));
    const p2 = await call(w, "POST", turnsPath("stu-1", th), { token, body: { text: CRISIS_TEXT, clientTurnId: "k2" } });
    assert.match(p2.json.message, /14416/);
    release();
    const r1 = await p1;
    assert.match(r1.json.message, /14416/);
    const flags = col(w, COLLECTION_NAMES.student_flags) as any[];
    say("concurrent-flags", flags.map((f) => ({ id: f._id, kind: f.kind })));
    assert.ok(flags.some((f) => f.turnId === "k2"), "k2 recorded");
    assert.ok(!JSON.stringify(flags).includes("kill"));
    const r3 = await call(w, "POST", turnsPath("stu-1", th), { token, body: { text: CRISIS_TEXT, clientTurnId: "k3" } });
    assert.equal(r3.status, 200);
    say("concurrent-n", { n });
    assert.ok(n >= 2, "no under-escalation after the failed holder (cycle 2: k2 ran loose after the 5 s wait, so k3 escalates again; n recorded)");
  } finally { release(); w.cleanup(); }
});

test("concurrent: 5 simultaneous crisis turns, observe rows", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const th = await newThread(w, token);
    const rs = await Promise.all([0, 1, 2, 3, 4].map((i) => call(w, "POST", turnsPath("stu-1", th), { token, body: { text: CRISIS_TEXT, clientTurnId: `s${i}` } })));
    for (const r of rs) { assert.equal(r.status, 200); assert.match(r.json.message, /14416/); }
    say("simul5", { esc: w.escalations.length, flags: col(w, COLLECTION_NAMES.student_flags).length, turns: col(w, COLLECTION_NAMES.chat_turns).length });
    assert.equal(w.escalations.length, 1);
  } finally { w.cleanup(); }
});

test("replay: same clientTurnId retry of a completed crisis turn replays (quiet, and after window expiry), then a new crisis still escalates", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const th = await newThread(w, token);
    const body = { text: CRISIS_TEXT, clientTurnId: "z1" };
    await call(w, "POST", turnsPath("stu-1", th), { token, body });
    const rows: any = w.fakeDb.collection(COLLECTION_NAMES.chat_turns);
    const asst = rows.all().find((r: any) => r.role === "assistant");
    await rows.updateOne({ _id: asst._id }, { $set: { response: { ...asst.response, message: "MARK 14416" } } });
    const q = await call(w, "POST", turnsPath("stu-1", th), { token, body });
    assert.equal(q.json.message, "MARK 14416");
    assert.equal(w.escalations.length, 1);
    w.clock.ms += 11 * 60_000;
    const q2 = await call(w, "POST", turnsPath("stu-1", th), { token, body });
    assert.equal(q2.json.message, "MARK 14416", "replay after window expiry");
    assert.equal(w.escalations.length, 1, "no new escalation on replay");
    assert.equal(col(w, COLLECTION_NAMES.student_flags).length, 1);
    const n = await call(w, "POST", turnsPath("stu-1", th), { token, body: { text: CRISIS_TEXT, clientTurnId: "z2" } });
    assert.equal(n.json.state, "escalated");
    say("replay-new-after", { esc: w.escalations.length });
    assert.equal(w.escalations.length, 2, "a new crisis after the replay is escalated");
    const bad = await call(w, "POST", turnsPath("stu-1", th), { token, body: { text: CRISIS_TEXT + " again", clientTurnId: "z1" } });
    say("replay-conflict", { status: bad.status });
  } finally { w.cleanup(); }
});

test("names e2e: required variants never stored; echoed name redacted in stored/replay/history", async () => {
  for (const intro of ["my name is devika nair.", "i am kabir.", "call me aarav.", "MY NAME IS ROHAN.", "My name is Dr. Anita Verma.", "I am Mr. Rao from Pune."]) {
    const nm = intro.replace(/\.$/, "").split(/\s+(?:is|am|me)\s+/i)[1]!.replace(/ from Pune/, "").replace(/^(Dr|Mr)\.\s*/, "");
    const text = `Welcome ${nm}, public universities in Germany charge no tuition for most programmes.`;
    const kb = recordingKb({ status: "ok", hits: [{ ...HIT, text }], dropped: 0 });
    const w = chatWorld({ kb, provider: kbAnswerProvider([{ text, kind: "fact", sourceIds: ["t-sem-1"] }]) });
    try {
      const token = await studentToken(adult());
      const th = await newThread(w, token);
      const body = { text: `${intro} ${GERMANY_QUESTION}`, clientTurnId: "e1" };
      const live = await call(w, "POST", turnsPath("stu-1", th), { token, body });
      assert.equal(live.status, 200);
      const rep = await call(w, "POST", turnsPath("stu-1", th), { token, body });
      const hist = await call(w, "GET", `${threadsPath("stu-1")}/${th}`, { token });
      for (const part of nm.split(/\s+/)) {
        const re = new RegExp(`\\b${part}\\b`, "i");
        assert.ok(!re.test(everythingStored(w.fakeDb)), `${intro}: ${part} stored`);
        assert.ok(!re.test(rep.body), `${intro}: ${part} replay`);
        assert.ok(!re.test(hist.body), `${intro}: ${part} history`);
      }
      say("echo", { intro, liveHasName: live.body.includes(nm.split(/\s+/)[0]!) });
    } finally { w.cleanup(); }
  }
});

test("rationale/escalation input: no raw student text; 'i am unalive' escalates; fact key redacted", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const th = await newThread(w, token);
    await call(w, "POST", turnsPath("stu-1", th), { token, body: { text: "my name is priya sharma, phone 9876543210, mail priya@example.com. i want to end my life", clientTurnId: "x1" } });
    say("esc-input", JSON.stringify(w.escalations));
    assert.equal(w.escalations.length, 1);
    const h = JSON.stringify(w.escalations).toLowerCase();
    for (const raw of ["priya", "sharma", "9876543210", "example.com"]) assert.ok(!h.includes(raw), raw);
  } finally { w.cleanup(); }
  const w2 = chatWorld();
  try {
    const t2 = await studentToken(adult());
    const th2 = await newThread(w2, t2);
    await call(w2, "POST", turnsPath("stu-1", th2), { token: t2, body: { text: "i am unalive", clientTurnId: "x2" } });
    assert.equal(w2.escalations.length, 1);
  } finally { w2.cleanup(); }
  const w3 = chatWorld({ deps: { extractFacts: async () => [{ key: "phone 9876543210 mail a@b.com", value: "v" }] as never } });
  try {
    const t3 = await studentToken(adult());
    const th3 = await newThread(w3, t3);
    await call(w3, "POST", turnsPath("stu-1", th3), { token: t3, body: { text: GERMANY_QUESTION, clientTurnId: "x3" } });
    const stored = everythingStored(w3.fakeDb);
    say("factkey", { stored9876: stored.includes("9876543210"), hasProfileRow: stored.includes("[PHONE]") });
    assert.ok(!stored.includes("9876543210") && !stored.includes("a@b.com"));
    assert.ok(stored.includes("[PHONE]"), "instrument check: a fact row exists with the redacted key");
  } finally { w3.cleanup(); }
});
