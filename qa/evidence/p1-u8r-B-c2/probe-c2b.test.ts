/** Coordinator B extra hostile probes, cycle 2 (code 585f6dc). Evidence only. Synthetic data. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { COLLECTION_NAMES } from "../../../packages/db/src/index.js";
import { CRISIS_TEXT, adult, call, chatWorld, everythingStored, newThread, studentToken, turnsPath } from "../../../apps/api/tests/chat-fixtures.js";

const say = (k: string, v: unknown) => console.log(`PROBE ${k} ${JSON.stringify(v)}`);
const CONCERN = "I feel hopeless about my marks";
const col = (w: any, n: string) => w.fakeDb.collection(n).all();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => boolean, ms = 4000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error("until timeout"); await sleep(5); } };
function gated() {
  const calls: Array<{ input: any; resolve: () => void; reject: (e?: Error) => void }> = [];
  const factory = () => async (input: any) => new Promise<void>((res, rej) => { calls.push({ input, resolve: () => res(), reject: (e) => rej(e ?? new Error("escalate failed")) }); });
  return { calls, factory };
}
const turn = (w: any, token: string, th: string, text: string, id: string) => call(w, "POST", turnsPath("stu-1", th), { token, body: { text, clientTurnId: id } });

test("x1: with NO escalate port wired, 5 crisis turns in a window (record: does the cap still bound writes?)", async () => {
  const w = chatWorld({ deps: { escalateForTenant: undefined } });
  try {
    const token = await studentToken(adult());
    const th = await newThread(w, token);
    for (let i = 0; i < 5; i++) { const r = await turn(w, token, th, CRISIS_TEXT, `n${i}`); assert.equal(r.status, 200); assert.match(r.json.message, /14416/); w.clock.ms += 60_000; }
    say("x1-no-escalate-port", { turnRows: col(w, COLLECTION_NAMES.chat_turns).length, flags: col(w, COLLECTION_NAMES.student_flags).length });
  } finally { w.cleanup(); }
});

test("x2: concern B behind an in-flight crisis holder: holder succeeds -> B quiet; holder fails -> B escalates", async () => {
  for (const outcome of ["succeeds", "fails"] as const) {
    const g = gated();
    const w = chatWorld({ deps: { escalateForTenant: g.factory } });
    try {
      const token = await studentToken(adult());
      const th = await newThread(w, token);
      const pA = turn(w, token, th, CRISIS_TEXT, "a1");
      await until(() => g.calls.length >= 1);
      const pB = turn(w, token, th, CONCERN, "b1");
      await sleep(150);
      if (outcome === "succeeds") { g.calls[0]!.resolve(); await Promise.all([pA, pB]); say("x2", { outcome, calls: g.calls.length }); assert.equal(g.calls.length, 1); }
      else { g.calls[0]!.reject(); await until(() => g.calls.length >= 2); g.calls[1]!.resolve(); await Promise.all([pA, pB]); say("x2", { outcome, calls: g.calls.length }); assert.equal(g.calls.length, 2); }
    } finally { w.cleanup(); }
  }
});

test("x3: crisis phrase at the END of an over-long message gets the helpline; over-long non-crisis is 400", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const th = await newThread(w, token);
    const r = await turn(w, token, th, "padding words here ".repeat(300) + CRISIS_TEXT, "x3a");
    assert.equal(r.status, 200); assert.match(r.json.message, /14416/);
    const r2 = await turn(w, token, th, "padding words here ".repeat(300), "x3b");
    say("x3", { crisisEnd: r.status, nonCrisisOverlong: r2.status });
    assert.equal(r2.status, 400);
    assert.ok(!everythingStored(w.fakeDb).includes("padding words"));
  } finally { w.cleanup(); }
});

test("x4: escalation input for a titled-initial name carries no part of the name; crisis still escalates", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const th = await newThread(w, token);
    await turn(w, token, th, "I'm Dr. A. P. J. Abdul Kalam. I want to end my life", "x4");
    const j = JSON.stringify(w.escalations).toLowerCase();
    say("x4", { esc: w.escalations.length, input: j.slice(0, 260) });
    assert.equal(w.escalations.length, 1);
    assert.ok(!/abdul|kalam/.test(j));
  } finally { w.cleanup(); }
});

test("x5: window expiry reopens the slot after 10 min; a holder that succeeded then 11 min later a new crisis escalates", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const th = await newThread(w, token);
    await turn(w, token, th, CRISIS_TEXT, "e1");
    w.clock.ms += 9 * 60_000; await turn(w, token, th, CRISIS_TEXT, "e2");
    assert.equal(w.escalations.length, 1);
    w.clock.ms += 2 * 60_000; await turn(w, token, th, CRISIS_TEXT, "e3");
    say("x5", { esc: w.escalations.length });
    assert.equal(w.escalations.length, 2);
  } finally { w.cleanup(); }
});

test("x6: provider/graph failure (retryable) on a crisis holder gives the slot back", async () => {
  // a crisis turn whose escalate port throws synchronously (not just rejects)
  let n = 0;
  const w = chatWorld({ deps: { escalateForTenant: () => (async (input: unknown) => { n++; if (n === 1) throw new TypeError("sync-ish boom"); void input; }) as never } });
  try {
    const token = await studentToken(adult());
    const th = await newThread(w, token);
    const r1 = await turn(w, token, th, CRISIS_TEXT, "g1");
    assert.equal(r1.status, 200); assert.match(r1.json.message, /14416/);
    const r2 = await turn(w, token, th, CRISIS_TEXT, "g2");
    assert.equal(r2.status, 200);
    say("x6", { n });
    assert.equal(n, 2);
    const r3 = await turn(w, token, th, CRISIS_TEXT, "g3");
    assert.equal(n, 2, "third is quiet behind the confirmed second");
    void r3;
  } finally { w.cleanup(); }
});
