/**
 * Hostile probes for W2 / W3 / W4 / C19 (sub-checker w234). SYNTHETIC only. Scratch copy only.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { Db } from "mongodb";
import { COLLECTION_NAMES } from "@vc/db";
import { escalateTurns, loadConcernClassifierConfig, loadSkill, CONCERN_CLASSIFIER_SKILL } from "@vc/engine";
import { CRISIS_RESUME_GAP_MS_DEFAULT, MockLiveProvider, type LiveProvider } from "@vc/providers";
import type { VoiceApiDeps } from "../src/voice.js";
import { CRISIS_AUDIO, CRISIS_PHRASE, CRISIS_TEXT_FIXED, adult, newThread, studentToken, until, voiceWorld, type VoiceWorld, type VoiceWorldOptions } from "./voice-fixtures.js";
import { SKILLS_DIR, kbAnswerProvider } from "./chat-fixtures.js";

const unhandled: unknown[] = [];
process.on("unhandledRejection", (r) => void unhandled.push(r));
process.on("uncaughtException", (r) => void unhandled.push(r));

async function withWorld(fn: (w: VoiceWorld, threadId: string) => Promise<void>, opts?: VoiceWorldOptions): Promise<void> {
  const w = await voiceWorld(opts);
  try {
    const threadId = await newThread(w.chat, await studentToken(adult()));
    await fn(w, threadId);
  } finally {
    await w.cleanup();
  }
}
const speak = (w: VoiceWorld, idx: number, text: string) => w.provider.backends[idx]!.emitInputTranscript(text, true);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const now = () => performance.now();
function gateP() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const p = new Promise<void>((s, j) => {
    resolve = s;
    reject = j;
  });
  p.catch(() => undefined);
  return { p, resolve, reject };
}
const flagCount = (w: VoiceWorld) => w.fakeDb.collection<any>("student_flags").all().length;
const say = (m: string) => console.log(`PROBE-NOTE ${m}`);

// ---------------------------------------------------------------------------- W2
test("p1a W2: gated escalation outliving drainTimeoutMs: close() resolves only AFTER release", async () => {
  const g = gateP();
  const delivered: any[] = [];
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => flagCount(w) === 1, "flag stored");
      client.send({ type: "end" });
      await until(() => client.closed, "closed after drain timeout");
      await w.voice.settled();
      assert.ok(w.logs.some((l) => l.event === "voice_drain_timeout"));
      const t0 = now();
      let tResolved = 0;
      const closing = w.voice.close().then(() => (tResolved = now()));
      await sleep(80);
      const tRelease = now();
      g.resolve();
      await closing;
      say(`p1a release at +${Math.round(tRelease - t0)}ms, close resolved at +${Math.round(tResolved - t0)}ms`);
      assert.ok(tResolved >= tRelease, "close() did not resolve before the release");
      assert.equal(delivered.length, 1);
      assert.ok(!w.logs.some((l) => l.event === "voice_shutdown_drain_timeout"), "not timed out");
    },
    { deps: { drainTimeoutMs: 400, escalateForTenant: () => async (i: any) => { await g.p; delivered.push(i); } } as Partial<VoiceApiDeps> },
  );
});

test("p1b W2: never-settling late work: close() <= ~drainTimeoutMs and logs voice_shutdown_drain_timeout (ended session)", async () => {
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => flagCount(w) === 1, "flag stored");
      client.send({ type: "end" });
      await until(() => client.closed, "closed");
      await w.voice.settled();
      const t0 = now();
      await w.voice.close();
      const took = now() - t0;
      say(`p1b close() took ${Math.round(took)}ms with drainTimeoutMs=300`);
      assert.ok(took >= 280 && took < 700, `took ${took}`);
      assert.ok(w.logs.some((l) => l.event === "voice_shutdown_drain_timeout"));
    },
    { deps: { drainTimeoutMs: 300, escalateForTenant: () => () => new Promise<never>(() => undefined) } as Partial<VoiceApiDeps> },
  );
});

test("p1c W2: TWO late tasks are both tracked; close() waits for both", async () => {
  const gates = [gateP(), gateP()];
  let n = 0;
  const delivered: number[] = [];
  await withWorld(
    async (w, threadId) => {
      for (let i = 0; i < 2; i++) {
        const { client } = await w.open(adult(), threadId);
        speak(w, i, CRISIS_PHRASE);
        await until(() => flagCount(w) === i + 1, `flag ${i + 1}`);
        client.send({ type: "end" });
        await until(() => client.closed, `closed ${i + 1}`);
        await w.voice.settled();
      }
      assert.equal(w.logs.filter((l) => l.event === "voice_drain_timeout").length, 2);
      const t0 = now();
      let tResolved = 0;
      const closing = w.voice.close().then(() => (tResolved = now()));
      await sleep(50);
      gates[0]!.resolve();
      await sleep(80);
      const tLast = now();
      assert.equal(tResolved, 0, "close() still waiting for the second task");
      gates[1]!.resolve();
      await closing;
      say(`p1c close resolved at +${Math.round(tResolved - t0)}ms; last release at +${Math.round(tLast - t0)}ms; delivered=${delivered.join(",")}`);
      assert.deepEqual(delivered.sort(), [1, 2]);
      assert.ok(tResolved >= tLast);
    },
    { deps: { drainTimeoutMs: 200, escalateForTenant: () => async () => { const k = ++n; await gates[k - 1]!.p; delivered.push(k); } } as unknown as Partial<VoiceApiDeps> },
  );
});

test("p1d W2: a late task that keeps REJECTING after the drain timeout and after close(): no unhandled rejection / uncaught exception", async () => {
  const before = unhandled.length;
  let calls = 0;
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => flagCount(w) === 1, "flag stored");
      client.send({ type: "end" });
      await until(() => client.closed, "closed");
      await w.voice.settled();
      await w.voice.close(); // bounded wait times out; the work is still pending
      assert.ok(w.logs.some((l) => l.event === "voice_shutdown_drain_timeout"));
      await sleep(900); // both rejecting attempts land after close()
      say(`p1d port calls=${calls}; logs=${w.logs.map((l) => l.event).join(",")}`);
      assert.equal(calls, 2);
      assert.equal(unhandled.length - before, 0, `unhandled: ${String(unhandled.slice(before))}`);
    },
    { deps: { drainTimeoutMs: 100, escalateForTenant: () => async () => { calls++; await sleep(300); throw new Error("late failure"); } } as Partial<VoiceApiDeps> },
  );
});

test("p1e W2: close() called twice concurrently and again afterwards, with late work pending; all resolve, no throw", async () => {
  const g = gateP();
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => flagCount(w) === 1, "flag stored");
      client.send({ type: "end" });
      await until(() => client.closed, "closed");
      await w.voice.settled();
      const order: string[] = [];
      const c1 = w.voice.close().then(() => order.push("c1"));
      const c2 = w.voice.close().then(() => order.push("c2"));
      await sleep(60);
      g.resolve();
      await Promise.all([c1, c2]);
      await w.voice.close();
      say(`p1e order=${order.join(",")}`);
      assert.equal(order.length, 2);
    },
    { deps: { drainTimeoutMs: 400, escalateForTenant: () => async () => { await g.p; } } as Partial<VoiceApiDeps> },
  );
});

test("p1f W2: close() while a connection is still live (no end): socket closed 1001, provider closed, stats clean", async () => {
  await withWorld(async (w, threadId) => {
    const { client } = await w.open(adult(), threadId);
    await w.voice.close();
    await until(() => client.closed, "client closed");
    assert.equal(client.closeCode, 1001);
    const s = w.voice.stats();
    assert.deepEqual([s.sockets, s.activeSessions, s.liveSessions], [0, 0, 0]);
    assert.ok(w.provider.backends[0]!.calls.some((x: any) => x.type === "close"));
  });
});

test("p1g W2: close() while a LIVE connection has a hung escalation: total close() time (finalize drain + late wait)", async () => {
  await withWorld(
    async (w, threadId) => {
      await w.open(adult(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => flagCount(w) === 1, "flag stored; escalation hangs");
      const t0 = now();
      await w.voice.close();
      const took = now() - t0;
      say(`p1g live conn + hung write: close() took ${Math.round(took)}ms with drainTimeoutMs=300 (finalize drain + late wait)`);
      assert.ok(w.logs.some((l) => l.event === "voice_drain_timeout"));
      assert.ok(w.logs.some((l) => l.event === "voice_shutdown_drain_timeout"));
      assert.ok(took < 1200);
    },
    { deps: { drainTimeoutMs: 300, escalateForTenant: () => () => new Promise<never>(() => undefined) } as Partial<VoiceApiDeps> },
  );
});

// ---------------------------------------------------------------------------- W3
type Mode = "immediate" | "gate" | "forever" | "gate-reject";
function tracker(modes: Mode[]) {
  const inner = new MockLiveProvider();
  const gates = modes.map(() => gateP());
  const events: string[] = [];
  const enterAt: number[] = [];
  const openAtEnter: number[] = [];
  let entered = 0;
  let open = 0;
  let max = 0;
  const live = {
    kind: "mock",
    connect: async (cfg: Parameters<MockLiveProvider["connect"]>[0]) => {
      const n = ++entered;
      openAtEnter.push(open);
      enterAt.push(now());
      events.push(`enter${n}`);
      open++;
      max = Math.max(max, open);
      const mode = modes[n - 1] ?? "immediate";
      if (mode === "forever") await new Promise<never>(() => undefined);
      if (mode === "gate" || mode === "gate-reject") {
        try {
          await gates[n - 1]!.p;
        } catch (e) {
          open--;
          events.push(`rejected${n}`);
          throw e;
        }
      }
      const session = await inner.connect(cfg);
      events.push(`resolved${n}`);
      const close = session.close.bind(session);
      let counted = false;
      session.close = ((reason?: string) => {
        if (!counted) {
          counted = true;
          open--;
          events.push(`close${n}`);
        }
        return close(reason);
      }) as typeof session.close;
      return session;
    },
  } as unknown as LiveProvider;
  return { live, inner, gates, events, enterAt, openAtEnter, entered: () => entered, maxOpen: () => max, openNow: () => open };
}
async function startPair(w: VoiceWorld, threadId: string) {
  const r = await w.connect(await w.mint(adult(), threadId), { threadId });
  assert.ok(r.ok);
  if (!r.ok) throw new Error("x");
  return r.client;
}

test("p2a W3: superseded start with gated connect: next connect NOT entered until first resolves AND its session closed", async () => {
  const t = tracker(["gate"]);
  await withWorld(
    async (w, threadId) => {
      const a = await startPair(w, threadId);
      a.send({ type: "start", threadId });
      await until(() => t.entered() === 1, "A connect in flight");
      const c = await startPair(w, threadId);
      c.send({ type: "start", threadId });
      await until(() => a.of("error").some((e) => e.code === "superseded"), "A superseded");
      await sleep(200);
      assert.equal(t.entered(), 1);
      t.gates[0]!.resolve();
      await until(() => t.entered() === 2, "C connect entered");
      say(`p2a events=${t.events.join(",")} openAtEnter=${t.openAtEnter.join(",")} max=${t.maxOpen()}`);
      assert.ok(t.events.indexOf("close1") !== -1 && t.events.indexOf("close1") < t.events.indexOf("enter2"), "close1 precedes enter2");
      assert.equal(t.openAtEnter[1], 0, "no provider session open or connecting when C entered");
      await until(() => w.voice.stats().liveSessions === 1, "one live");
      assert.equal(t.maxOpen(), 1);
    },
    { live: t.live },
  );
});

test("p2b W3: a connect that never resolves: C proceeds after ~connectOverlapWaitMs, logs overlap; the late A session is closed when it finally returns", async () => {
  const t = tracker(["gate"]);
  await withWorld(
    async (w, threadId) => {
      const a = await startPair(w, threadId);
      a.send({ type: "start", threadId });
      await until(() => t.entered() === 1, "A connect in flight");
      const c = await startPair(w, threadId);
      const tSend = now();
      c.send({ type: "start", threadId });
      await until(() => t.entered() === 2, "C connect entered after the bounded wait", 3000);
      const dt = t.enterAt[1]! - tSend;
      say(`p2b C connect entered ${Math.round(dt)}ms after start (connectOverlapWaitMs=300)`);
      assert.ok(dt >= 250 && dt < 1200, `dt=${dt}`);
      assert.ok(w.logs.some((l) => l.event === "voice_connect_overlap"));
      await until(() => t.inner.backends.length === 1, "C session"); // C resolved (immediate)
      await until(() => w.voice.stats().liveSessions === 1, "C live");
      t.gates[0]!.resolve(); // A's connect finally returns, long after being superseded and bypassed
      await until(() => t.events.includes("close1"), "A late session closed");
      await sleep(50);
      say(`p2b events=${t.events.join(",")} liveSessions=${w.voice.stats().liveSessions} max=${t.maxOpen()}`);
      assert.equal(w.voice.stats().liveSessions, 1);
      assert.equal(c.closed, false);
    },
    { live: t.live, deps: { connectOverlapWaitMs: 300 } as Partial<VoiceApiDeps> },
  );
});

async function threeStarts(w: VoiceWorld, t: ReturnType<typeof tracker>, threadId: string, betweenBandC: number) {
  const a = await startPair(w, threadId);
  a.send({ type: "start", threadId });
  await until(() => t.entered() === 1, "A connect in flight");
  const b = await startPair(w, threadId);
  b.send({ type: "start", threadId });
  await until(() => a.of("error").some((e) => e.code === "superseded"), "A superseded"); // A gone: the pre-start socket cap (2) lets C connect now
  if (betweenBandC > 0) await sleep(betweenBandC);
  const c = await startPair(w, threadId);
  c.send({ type: "start", threadId });
  return { a, b, c };
}

for (const gap of [0, 60]) {
  test(`p2c W3: THREE starts (A connecting gated; B, then C ${gap}ms later): only C connects, after A resolved AND closed; B never connects; max open 1`, async () => {
    const t = tracker(["gate"]);
    await withWorld(
      async (w, threadId) => {
        const { b, c } = await threeStarts(w, t, threadId, gap);
        await sleep(300);
        assert.equal(t.entered(), 1, "nobody connected while A is in flight (bound is 5 s)");
        t.gates[0]!.resolve();
        await until(() => t.entered() === 2 && w.voice.stats().liveSessions === 1, "C live");
        await until(() => b.of("error").some((e) => e.code === "superseded"), "B superseded");
        await sleep(200);
        say(`p2c gap=${gap} events=${t.events.join(",")} openAtEnter=${t.openAtEnter.join(",")} max=${t.maxOpen()} entered=${t.entered()} B.err=${b.of("error").map((e) => e.code)} C.err=${c.of("error").map((e) => e.code)} overlapLogs=${w.logs.filter((l) => l.event === "voice_connect_overlap").length}`);
        assert.equal(t.entered(), 2, "B never connected");
        assert.equal(t.maxOpen(), 1);
        assert.ok(t.events.indexOf("close1") < t.events.indexOf("enter2"));
        assert.equal(c.closed, false);
        assert.equal(w.voice.stats().liveSessions, 1);
      },
      { live: t.live, deps: { connectOverlapWaitMs: 5000 } as Partial<VoiceApiDeps> },
    );
  });
}

test("p2e W3: THREE starts with A never returning: bounded wait, at most ONE extra provider session beyond the stated overlap rule", async () => {
  const t = tracker(["gate"]);
  await withWorld(
    async (w, threadId) => {
      const { b, c } = await threeStarts(w, t, threadId, 60);
      const t0 = now();
      await until(() => t.entered() >= 2, "someone connected after the bound", 3000);
      say(`p2e first extra connect ${Math.round(now() - t0)}ms after C start (bound 300)`);
      await sleep(800);
      say(`p2e events=${t.events.join(",")} max=${t.maxOpen()} entered=${t.entered()} B.err=${b.of("error").map((e) => e.code)} C.closed=${c.closed} overlapLogs=${w.logs.filter((l) => l.event === "voice_connect_overlap").length}`);
      assert.equal(t.entered(), 2, "exactly one start connected beyond A");
      assert.equal(t.maxOpen(), 2, "A (stuck) + one");
      assert.equal(w.voice.stats().liveSessions, 1);
      t.gates[0]!.resolve();
      await until(() => t.events.includes("close1"), "A late closed");
      assert.equal(w.voice.stats().liveSessions, 1);
    },
    { live: t.live, deps: { connectOverlapWaitMs: 300 } as Partial<VoiceApiDeps> },
  );
});

test("p2f W3: first connect REJECTS while C waits: C proceeds promptly (not after the full bound), no overlap logged", async () => {
  const t = tracker(["gate-reject"]);
  await withWorld(
    async (w, threadId) => {
      const a = await startPair(w, threadId);
      a.send({ type: "start", threadId });
      await until(() => t.entered() === 1, "A in flight");
      const c = await startPair(w, threadId);
      c.send({ type: "start", threadId });
      await until(() => a.of("error").some((e) => e.code === "superseded"), "A superseded");
      await sleep(150);
      assert.equal(t.entered(), 1);
      const tRej = now();
      t.gates[0]!.reject(new Error("provider down"));
      await until(() => t.entered() === 2, "C connect entered", 1500);
      const dt = t.enterAt[1]! - tRej;
      say(`p2f C connect entered ${Math.round(dt)}ms after A's reject (bound 3000ms); events=${t.events.join(",")}`);
      assert.ok(dt < 500, `dt=${dt}`);
      assert.ok(!w.logs.some((l) => l.event === "voice_connect_overlap"));
      await until(() => w.voice.stats().liveSessions === 1, "C live");
      assert.equal(c.closed, false);
    },
    { live: t.live, deps: { connectOverlapWaitMs: 3000 } as Partial<VoiceApiDeps> },
  );
});

// ---------------------------------------------------------------------------- W4
const escalationDeps = () => ({
  recipients: async () => ({ adminIds: ["admin-1"], counsellorIds: ["counsellor-1"] }),
  classifier: { provider: kbAnswerProvider(), skillPrompt: loadSkill(SKILLS_DIR, CONCERN_CLASSIFIER_SKILL), config: loadConcernClassifierConfig({}) },
  alert: () => undefined,
});
const notifDocs = (w: VoiceWorld) => w.fakeDb.collection<any>(COLLECTION_NAMES.escalation_notifications).all();

test("p3a W4: real escalateTurns, delivered-then-thrown + retry: one record per recipient; print _ids", async () => {
  const inputs: any[] = [];
  let calls = 0;
  await withWorld(
    async (w, threadId) => {
      await w.open(adult(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => calls >= 2, "retry ran");
      await w.voice.settled();
      const ids = notifDocs(w).map((d: any) => d._id);
      say(`p3a threadId=${threadId} ids=${JSON.stringify(ids)}`);
      assert.equal(calls, 2);
      assert.equal(ids.length, 2);
      assert.ok(ids.every((id: string) => id.includes(`${threadId}:${inputs[0].turns[0].turnId}:`)));
      assert.deepEqual(inputs[0], inputs[1]);
    },
    { deps: { escalateForTenant: (_t: string, db: Db) => async (input: any) => { inputs.push(input); calls++; await escalateTurns(db, input, escalationDeps()); if (calls === 1) throw new Error("ack lost"); } } },
  );
});

test("p3b W4: a second student utterance arrives between the attempts: the retry still carries the ORIGINAL turnId; records stay one per recipient", async () => {
  const inputs: any[] = [];
  const g = gateP();
  let calls = 0;
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => calls === 1 && notifDocs(w).length === 2, "first attempt delivered, now blocked before throwing");
      speak(w, 0, "what about visa rules"); // a new user turn lands between the attempts
      await until(() => client.of("transcript.final").length >= 3, "later turn stored", 3000).catch(() => undefined);
      await sleep(150);
      g.resolve();
      await until(() => calls >= 2, "retry ran");
      await w.voice.settled();
      const ids = notifDocs(w).map((d: any) => d._id);
      say(`p3b first turnId=${inputs[0].turns[0].turnId} retry turnId=${inputs[1].turns[0].turnId} ids=${JSON.stringify(ids)}`);
      assert.equal(inputs[0].turns[0].turnId, inputs[1].turns[0].turnId);
      assert.equal(ids.length, 2);
    },
    { deps: { escalateForTenant: (_t: string, db: Db) => async (input: any) => { inputs.push(input); calls++; await escalateTurns(db, input, escalationDeps()); if (calls === 1) { await g.p; throw new Error("ack lost"); } } } },
  );
});

test("p3c W4: two DIFFERENT crises in one session (two spoken crisis utterances): two distinct record sets (4 docs)", async () => {
  let calls = 0;
  const inputs: any[] = [];
  await withWorld(
    async (w, threadId) => {
      await w.open(adult(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => calls === 1 && notifDocs(w).length === 2, "crisis 1 escalated");
      w.provider.backends[0]!.emitTurnComplete();
      await sleep(CRISIS_RESUME_GAP_MS_DEFAULT + 300);
      speak(w, 0, `${CRISIS_PHRASE} again`);
      await until(() => calls === 2, "crisis 2 escalated", 3000).catch(() => undefined);
      await w.voice.settled();
      await sleep(100);
      const ids = notifDocs(w).map((d: any) => d._id);
      say(`p3c calls=${calls} turnIds=${inputs.map((i) => i.turns[0].turnId)} ids=${JSON.stringify(ids)}`);
      assert.equal(calls, 2);
      assert.equal(ids.length, 4);
      assert.equal(new Set(ids).size, 4);
    },
    { deps: { escalateForTenant: (_t: string, db: Db) => async (input: any) => { inputs.push(input); calls++; await escalateTurns(db, input, escalationDeps()); } } },
  );
});

test("p3d W4: second crisis with NO words of its own (blank utterance flagged by detector) after a first crisis: is it a distinct record set?", async () => {
  let calls = 0;
  const inputs: any[] = [];
  await withWorld(
    async (w, threadId) => {
      await w.open(adult(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => calls === 1 && notifDocs(w).length === 2, "crisis 1 escalated");
      w.provider.backends[0]!.emitTurnComplete();
      await sleep(CRISIS_RESUME_GAP_MS_DEFAULT + 300);
      speak(w, 0, "   ");
      await until(() => calls === 2, "crisis 2 port call", 3000).catch(() => undefined);
      await w.voice.settled();
      await sleep(150);
      const ids = notifDocs(w).map((d: any) => d._id);
      say(`p3d calls=${calls} turnIds=${inputs.map((i) => i.turns[0].turnId)} ids=${JSON.stringify(ids)} flags=${flagCount(w)}`);
      assert.equal(calls, 2);
      assert.equal(ids.length, 4, "second crisis must leave its own records");
    },
    {
      deps: {
        crisis: {
          message: { text: CRISIS_TEXT_FIXED, audio: CRISIS_AUDIO },
          detect: (text: string) => (text.trim() === "" || /kill myself/.test(text) ? { crisis: true, level: "crisis" } : { crisis: false }),
        },
        escalateForTenant: (_t: string, db: Db) => async (input: any) => { inputs.push(input); calls++; await escalateTurns(db, input, escalationDeps()); },
      } as unknown as Partial<VoiceApiDeps>,
    },
  );
});

// ---------------------------------------------------------------------------- C19
test("p4a C19: never-settling sink write, small drainTimeoutMs: socket, provider session, slot freed; student can start again; time bounded", async () => {
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => flagCount(w) === 1, "flag stored; hung");
      const t0 = now();
      client.send({ type: "end" });
      await until(() => client.closed, "closed");
      await w.voice.settled();
      const took = now() - t0;
      say(`p4a end -> closed+settled in ${Math.round(took)}ms (drainTimeoutMs=150)`);
      assert.ok(took < 900);
      const s = w.voice.stats();
      assert.deepEqual([s.sockets, s.activeSessions, s.liveSessions, s.timers], [0, 0, 0, 0]);
      assert.ok(w.provider.backends[0]!.calls.some((x: any) => x.type === "close"));
      const again = await w.open(adult(), threadId);
      assert.equal(again.client.closed, false);
      assert.equal(w.voice.stats().liveSessions, 1);
    },
    { deps: { drainTimeoutMs: 150, escalateForTenant: () => () => new Promise<never>(() => undefined) } as Partial<VoiceApiDeps> },
  );
});

test("p4b C19: a NEW start supersedes a live session whose write hangs: new session live within ~drainTimeoutMs", async () => {
  await withWorld(
    async (w, threadId) => {
      const { client: a } = await w.open(adult(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => flagCount(w) === 1, "flag stored; hung");
      const t0 = now();
      const { client: b } = await w.open(adult(), threadId);
      await until(() => w.voice.stats().liveSessions === 1 && a.closed, "B live, A closed");
      const took = now() - t0;
      say(`p4b supersede with hung write: B provider session opened after ${Math.round(took)}ms (drainTimeoutMs=200)`);
      assert.ok(took < 1200);
      assert.equal(b.closed, false);
    },
    { deps: { drainTimeoutMs: 200, escalateForTenant: () => () => new Promise<never>(() => undefined) } as Partial<VoiceApiDeps> },
  );
});

test("p9 no unhandled rejection / uncaught exception in the whole probe file", async () => {
  await sleep(300);
  assert.equal(unhandled.length, 0, String(unhandled));
});
