/** Coordinator B hostile probes for p1-u8r-chat-privacy cycle 2 (code 585f6dc). Evidence only; not part of the unit. Synthetic data. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { COLLECTION_NAMES } from "../../../packages/db/src/index.js";
import { redactPii } from "../../../packages/schemas/src/redact.js";
import { HIT } from "../../../apps/api/tests/anonymous-fixtures.js";
import { CRISIS_TEXT, GERMANY_QUESTION, adult, call, chatWorld, everythingStored, kbAnswerProvider, minor, newThread, recordingKb, studentToken, threadsPath, turnsPath } from "../../../apps/api/tests/chat-fixtures.js";

const say = (k: string, v: unknown) => console.log(`PROBE ${k} ${JSON.stringify(v)}`);
const CONCERN = "I feel hopeless about my marks";
const col = (w: any, n: string) => w.fakeDb.collection(n).all();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => boolean, ms = 4000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error("until timeout"); await sleep(5); } };
const OVERLONG = "I want to kill myself. " + "padding words here ".repeat(300); // > 4000 chars
assert.ok(OVERLONG.length > 4000 && OVERLONG.length < 200_000);

/** An escalate port whose every call blocks until the test settles it. */
function gated() {
  const calls: Array<{ input: any; resolve: () => void; reject: (e?: Error) => void }> = [];
  const factory = () => async (input: any) => new Promise<void>((res, rej) => { calls.push({ input, resolve: () => res(), reject: (e) => rej(e ?? new Error("escalate failed")) }); });
  return { calls, factory };
}
const say2 = async (w: any, token: string, th: string, text: string, id: string, who = "stu-1") => call(w, "POST", turnsPath(who, th), { token, body: { text, clientTurnId: id } });

// ---------- cycle-2 item 1: overlong / unconsented holders never silence a later escalatable turn ----------
test("c2-1a: overlong crisis then 'I want to kill myself' 60s later = 1 escalation (the second); third is quiet", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const th = await newThread(w, token);
    const r1 = await say2(w, token, th, OVERLONG, "ol1");
    assert.equal(r1.status, 200); assert.match(r1.json.message, /14416/);
    assert.equal(w.escalations.length, 0, "overlong turn has no escalate port");
    assert.ok(!everythingStored(w.fakeDb).includes("padding words"), "overlong text never stored");
    w.clock.ms += 60_000;
    const r2 = await say2(w, token, th, CRISIS_TEXT, "ol2");
    assert.equal(r2.status, 200); assert.match(r2.json.message, /14416/);
    say("c2-1a", { esc: w.escalations.length, flags: col(w, COLLECTION_NAMES.student_flags).length });
    assert.equal(w.escalations.length, 1);
    w.clock.ms += 60_000;
    await say2(w, token, th, CRISIS_TEXT, "ol3");
    assert.equal(w.escalations.length, 1, "after a real escalation the window is covered");
  } finally { w.cleanup(); }
});

test("c2-1b: overlong crisis then a concern = 1 escalation; overlong twice = both flagged, none escalated", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const th = await newThread(w, token);
    await say2(w, token, th, OVERLONG, "ob1");
    w.clock.ms += 60_000;
    const c = await say2(w, token, th, CONCERN, "ob2");
    say("c2-1b-state", { state: c.json.state });
    say("c2-1b", { esc: w.escalations.length });
    assert.equal(w.escalations.length, 1);
    const th2 = await newThread(w, token);
    await say2(w, token, th2, OVERLONG, "ob3");
    await say2(w, token, th2, OVERLONG, "ob4");
    const flags = (col(w, COLLECTION_NAMES.student_flags) as any[]).filter((f) => f.threadId === th2);
    say("c2-1b-two-overlong", { flags: flags.map((f) => f.turnId) });
    assert.equal(flags.length, 2);
  } finally { w.cleanup(); }
});

test("c2-1c: unconsented-minor crisis then a consented full crisis = 1 escalation; two unconsented are both flagged, text never stored", async () => {
  const w = chatWorld();
  try {
    const tNo = await studentToken(minor("stu-1", "tenant-a"));
    const tYes = await studentToken(minor("stu-1", "tenant-a", { guardianConsent: true }));
    const th = await newThread(w, tNo);
    const r1 = await say2(w, tNo, th, CRISIS_TEXT, "m1");
    assert.equal(r1.status, 200); assert.match(r1.json.message, /14416/);
    assert.equal(w.escalations.length, 0);
    w.clock.ms += 60_000;
    const r2 = await say2(w, tYes, th, CRISIS_TEXT, "m2");
    assert.equal(r2.status, 200); assert.match(r2.json.message, /14416/);
    say("c2-1c", { esc: w.escalations.length, status: r2.status });
    assert.equal(w.escalations.length, 1);
    // two unconsented in one window
    const th2 = await newThread(w, tNo);
    await say2(w, tNo, th2, CRISIS_TEXT, "m3");
    await say2(w, tNo, th2, CRISIS_TEXT, "m4");
    const flags = (col(w, COLLECTION_NAMES.student_flags) as any[]).filter((f) => f.threadId === th2);
    say("c2-1c-two", { flags: flags.map((f) => f.turnId) });
    assert.equal(flags.length, 2);
    const stored = everythingStored(w.fakeDb).toLowerCase();
    // thread th2 content: no kill text from unconsented minor turns (th1's consented turn may store redacted text)
    const th2rows = (col(w, COLLECTION_NAMES.chat_turns) as any[]).filter((r) => r.threadId === th2);
    assert.equal(th2rows.length, 0, "no turn rows for unconsented thread");
    void stored;
  } finally { w.cleanup(); }
});

// ---------- cycle-2 item 2: failed slot never restored ----------
for (const order of ["A-then-B", "B-then-A"] as const) {
  test(`c2-2: concern A in flight, crisis B takes over, A and B fail (${order}), concern C escalates, concern D quiet`, async () => {
    const g = gated();
    const w = chatWorld({ deps: { escalateForTenant: g.factory, quietWaitMs: 3000 } });
    try {
      const token = await studentToken(adult());
      const th = await newThread(w, token);
      const pA = say2(w, token, th, CONCERN, "a1");
      await until(() => g.calls.length >= 1);
      const pB = say2(w, token, th, CRISIS_TEXT, "b1");
      await until(() => g.calls.length >= 2);
      if (order === "A-then-B") { g.calls[0]!.reject(); g.calls[1]!.reject(); } else { g.calls[1]!.reject(); g.calls[0]!.reject(); }
      const [rA, rB] = await Promise.all([pA, pB]);
      assert.equal(rA.status, 200); assert.equal(rB.status, 200); assert.match(rB.json.message, /14416/);
      const pC = say2(w, token, th, CONCERN, "c1");
      await until(() => g.calls.length >= 3, 3000);
      g.calls[2]!.resolve();
      const rC = await pC;
      assert.equal(rC.status, 200);
      const before = g.calls.length;
      const rD = await say2(w, token, th, CONCERN, "d1");
      assert.equal(rD.status, 200);
      say("c2-2", { order, callsAfterC: before, callsAfterD: g.calls.length });
      assert.equal(g.calls.length, 3, "D is quiet behind C");
    } finally { w.cleanup(); }
  });
}

// ---------- cycle-2 item 3: bounded wait ----------
test("c2-3a: quiet turn behind an in-flight holder that FAILS escalates itself within 5 s", async () => {
  const g = gated();
  const w = chatWorld({ deps: { escalateForTenant: g.factory } }); // default quietWaitMs (5 s)
  try {
    const token = await studentToken(adult());
    const th = await newThread(w, token);
    const pA = say2(w, token, th, CRISIS_TEXT, "w1");
    await until(() => g.calls.length >= 1);
    const t0 = performance.now();
    const pB = say2(w, token, th, CRISIS_TEXT, "w2");
    await sleep(250);
    assert.equal(g.calls.length, 1, "B is waiting, not yet escalating");
    g.calls[0]!.reject();
    await until(() => g.calls.length >= 2, 4500);
    const ms = performance.now() - t0;
    g.calls[1]!.resolve();
    const [rA, rB] = await Promise.all([pA, pB]);
    say("c2-3a", { ms: Math.round(ms), a: rA.status, b: rB.status });
    assert.ok(ms < 5000);
    assert.match(rB.json.message, /14416/);
    const flags = (col(w, COLLECTION_NAMES.student_flags) as any[]).map((f) => f.turnId);
    assert.ok(flags.includes("w2"), "B recorded its own flag");
    // and the window is now covered by B
    const rC = await say2(w, token, th, CRISIS_TEXT, "w3");
    assert.equal(rC.status, 200);
    assert.equal(g.calls.length, 2);
  } finally { w.cleanup(); }
});

test("c2-3b: quiet turn behind an in-flight holder that SUCCEEDS writes nothing", async () => {
  const g = gated();
  const w = chatWorld({ deps: { escalateForTenant: g.factory } });
  try {
    const token = await studentToken(adult());
    const th = await newThread(w, token);
    const pA = say2(w, token, th, CRISIS_TEXT, "s1");
    await until(() => g.calls.length >= 1);
    const pB = say2(w, token, th, CRISIS_TEXT, "s2");
    await sleep(150);
    g.calls[0]!.resolve();
    const [rA, rB] = await Promise.all([pA, pB]);
    assert.match(rB.json.message, /14416/);
    say("c2-3b", { calls: g.calls.length, turns: (col(w, COLLECTION_NAMES.chat_turns) as any[]).map((r) => r.turnId), flags: (col(w, COLLECTION_NAMES.student_flags) as any[]).map((f) => f.turnId) });
    assert.equal(g.calls.length, 1);
    assert.ok(!(col(w, COLLECTION_NAMES.chat_turns) as any[]).some((r) => r.turnId === "s2"), "quiet turn wrote no row");
    assert.ok(!(col(w, COLLECTION_NAMES.student_flags) as any[]).some((r) => r.turnId === "s2"));
    void rA;
  } finally { w.cleanup(); }
});

test("c2-3c: holder still in flight after the wait -> the waiting turn runs the full path itself, no crisis turn unrecorded", async () => {
  const g = gated();
  const w = chatWorld({ deps: { escalateForTenant: g.factory, quietWaitMs: 150 } });
  try {
    const token = await studentToken(adult());
    const th = await newThread(w, token);
    const pA = say2(w, token, th, CRISIS_TEXT, "l1");
    await until(() => g.calls.length >= 1);
    const pB = say2(w, token, th, CRISIS_TEXT, "l2");
    await until(() => g.calls.length >= 2, 3000);
    g.calls[1]!.resolve();
    const rB = await pB;
    assert.match(rB.json.message, /14416/);
    const flagsB = (col(w, COLLECTION_NAMES.student_flags) as any[]).map((f) => f.turnId);
    say("c2-3c", { calls: g.calls.length, flags: flagsB });
    assert.ok(flagsB.includes("l2"));
    g.calls[0]!.resolve();
    await pA;
    // after A confirmed, further crisis is quiet
    await say2(w, token, th, CRISIS_TEXT, "l3");
    assert.equal(g.calls.length, 2);
  } finally { w.cleanup(); }
});

// ---------- timers: no leaked handle holds the process (unref + clear) ----------
test("c2-3d: 20 waiting turns leave no live timer (process can exit)", async () => {
  const g = gated();
  const w = chatWorld({ deps: { escalateForTenant: g.factory, quietWaitMs: 60_000 } });
  try {
    const token = await studentToken(adult());
    const th = await newThread(w, token);
    const pA = say2(w, token, th, CRISIS_TEXT, "t0");
    await until(() => g.calls.length >= 1);
    const ps = [1, 2, 3, 4, 5].map((i) => say2(w, token, th, CRISIS_TEXT, `t${i}`));
    await sleep(100);
    g.calls[0]!.resolve();
    await Promise.all([pA, ...ps]);
    const handles = (process as any)._getActiveHandles().filter((h: any) => h?.constructor?.name === "Timeout" && h.hasRef?.() && h._idleTimeout === 60_000);
    say("c2-3d", { liveRefTimers60s: handles.length });
    assert.equal(handles.length, 0);
  } finally { w.cleanup(); }
});

// ---------- cycle-2 item 4: titles and initials ----------
test("c2-4: names with titles and initials", () => {
  const must: Array<[string, string[], string[]]> = [
    ["I'm Dr. A. P. J. Abdul Kalam", ["abdul", "kalam"], []],
    ["I'm Dr. A. P. J. Abdul Kalam and I want fees", ["abdul", "kalam"], ["and I want fees"]],
    ["My name is Prof. Dr. Anita Rao Verma", ["anita", "rao", "verma"], []],
    ["my name is dr. anita rao verma from pune", ["anita", "rao", "verma"], ["from pune"]],
    ["I am Shri Ram Prasad Bismil Sharma", ["ram", "prasad", "bismil", "sharma"], []],
    ["I am Shri Ram Prasad Bismil Sharma from Pune", ["ram", "prasad", "bismil", "sharma"], ["from Pune"]],
    ["my name is Mr. R. K. Narayan from Mysore", ["narayan"], ["from Mysore"]],
    ["I am Smt. M. S. Subbulakshmi", ["subbulakshmi"], []],
    ["My name is Dr. Dr. Dr. Anita Verma", ["anita", "verma"], []],
    ["my name is km. dr. prof. sita devi gupta", ["sita", "devi", "gupta"], []],
    ["My name is Dr Anita Verma", ["anita", "verma"], []],
    ["My name is DR. ANITA RAO VERMA", ["anita", "rao", "verma"], []],
  ];
  for (const [t, leaks, keeps] of must) {
    const r = redactPii(t);
    say("c2-4", { in: t, out: r.text, names: r.names });
    for (const l of leaks) assert.ok(!new RegExp(`\\b${l}\\b`, "i").test(r.text), `${t} -> ${r.text} leaks ${l}`);
    for (const k of keeps) assert.ok(r.text.includes(k), `${t} -> ${r.text} lost ${k}`);
  }
  // precision regression: non-name text survives
  for (const t of ["i am tired", "i am from delhi", "i am a student", "i am going to apply", "I am Dr. what is the fee", "i am dr. who knows"]) {
    const r = redactPii(t);
    say("c2-4-prec", { in: t, out: r.text });
  }
});

test("c2-4-perf: adversarial chains stay linear", () => {
  const cases: Array<[string, string]> = [
    ["50k Dr. ", "my name is " + "Dr. ".repeat(50_000)],
    ["50k Dr. then Name", "my name is " + "Dr. ".repeat(50_000) + "Anita"],
    ["100k A. initials", "my name is " + "A. ".repeat(100_000)],
    ["100k A. initials then Name", "my name is " + "A. ".repeat(100_000) + "Verma"],
    ["100k Dr A. mix", "I am " + "Dr. A. ".repeat(50_000)],
    ["leads x 50k with initials", "i am A. ".repeat(50_000)],
    ["leads x 50k Dr", "my name is Dr. ".repeat(40_000)],
    ["lower dr chain", "my name is " + "dr. ".repeat(50_000)],
    ["Dr no dot chain", "I am " + "Dr ".repeat(80_000)],
    ["unicode L. chain", "I am " + "Ä. ".repeat(80_000) + "x"],
    ["2M no @", "a.".repeat(1_000_000)],
  ];
  for (const [label, s] of cases) {
    const t0 = performance.now();
    redactPii(s);
    const ms = Math.round(performance.now() - t0);
    say("c2-4-perf", { label, len: s.length, ms });
    assert.ok(ms < 1000, `${label} took ${ms} ms`);
  }
});

// ---------- e2e: Kalam echoed in reply ----------
test("c2-e2e: 'I'm Dr. A. P. J. Abdul Kalam' stated, model echoes 'Abdul Kalam' -> nothing stored, replay or history carries it", async () => {
  const text = "Welcome Abdul Kalam, public universities in Germany charge no tuition for most programmes.";
  const kb = recordingKb({ status: "ok", hits: [{ ...HIT, text }], dropped: 0 });
  const w = chatWorld({ kb, provider: kbAnswerProvider([{ text, kind: "fact", sourceIds: ["t-sem-1"] }]) });
  try {
    const token = await studentToken(adult());
    const th = await newThread(w, token);
    const body = { text: `I'm Dr. A. P. J. Abdul Kalam. ${GERMANY_QUESTION}`, clientTurnId: "k1" };
    const live = await call(w, "POST", turnsPath("stu-1", th), { token, body });
    const rep = await call(w, "POST", turnsPath("stu-1", th), { token, body });
    const hist = await call(w, "GET", `${threadsPath("stu-1")}/${th}`, { token });
    const stored = everythingStored(w.fakeDb);
    say("c2-e2e", { liveHasName: live.body.includes("Abdul"), storedHas: /abdul|kalam/i.test(stored), replayHas: /abdul|kalam/i.test(rep.body), histHas: /abdul|kalam/i.test(hist.body) });
    for (const part of ["Abdul", "Kalam"]) {
      const re = new RegExp(`\\b${part}\\b`, "i");
      assert.ok(!re.test(stored), `${part} stored`);
      assert.ok(!re.test(rep.body), `${part} replay`);
      assert.ok(!re.test(hist.body), `${part} history`);
    }
  } finally { w.cleanup(); }
});
