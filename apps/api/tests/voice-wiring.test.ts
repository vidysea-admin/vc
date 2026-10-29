/**
 * P1 U10w: (A) the four voice.ts fixes from the U10 cycle-2 senior review (W1 crisis deadline, W2 late work at shutdown, W3 connect
 * overlap, W4 escalation retry idempotency) and (B) the wiring of the voice WebSocket into a real `startApi` process (W5 flag off,
 * W6 fail closed, W7 reachable, W8 shutdown, W9 one flag / one escalation). SYNTHETIC only: loopback sockets, MockLiveProvider, the in-memory
 * fake Mongo client; no network, no real provider, no paid call (G-REAL is not granted).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { WebSocket } from "ws";
import type { Db } from "mongodb";
import { COLLECTION_NAMES, FencedWriterDeadlineError, VC_DB_NAME, createChatThread, getStudentUsage, tenantScopedDb, usageMonth } from "@vc/db";
import { createFakeMongoClient } from "@vc/db/testing";
import { escalateTurns, loadConcernClassifierConfig, loadSkill, CONCERN_CLASSIFIER_SKILL } from "@vc/engine";
import { MockLiveProvider, type LiveProvider } from "@vc/providers";
import { createJwtVerifier, jwtConfigFromEnv } from "../src/auth.js";
import { GoLiveRefusedError } from "../src/go-live-gate.js";
import { startApi, createQuestVoiceTools } from "../src/index.js";
import { VoiceConfigError, voiceEnabledFromEnv, type VoiceApiDeps } from "../src/voice.js";
import { CRISIS_PHRASE, adult, newThread, studentToken, until, voiceWorld, type VoiceWorld, type VoiceWorldOptions } from "./voice-fixtures.js";
import { SKILLS_DIR, SPEAKERS, cleanupGates, gatesFixture, kbAnswerProvider, recordingKb, studentVerifier } from "./chat-fixtures.js";

const VOICE_GATES = { gProd: "Answered: 2026-10-16T10:10:00+05:30 - c - all three including voice\n" };

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

test("Q5: Quest voice tools use the verified tenant/student, redact columns and reject identity arguments", async () => {
  const seen: string[] = [];
  const tools = createQuestVoiceTools("pathlynks", {
    kb: recordingKb(), provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, speakers: SPEAKERS,
    hasPriorFlag: async () => false,
    pathlynks: {
      getStudentProfile: async (id) => { seen.push(id); return { status: "ok", data: { grade: "12", email: "SECRET@private.test" } }; },
      getSavedCareers: async (id) => { seen.push(id); return { status: "ok", data: [] }; },
      getCompareList: async () => ({ status: "ok", data: [] }),
      getAssessmentStatus: async () => ({ status: "ok", data: { completed: 4, inProgress: 0, reportsAvailable: 4, totalResponses: 4, status: "completed" } }),
    },
    navCatalogue: async () => ({ routes: [{ path: "/career-quest/career-selection" }, { path: "/career-repository" }] }),
  });
  const who = { tenantId: "pathlynks", studentId: "stu-A", threadId: "th-A" };
  const profile = await tools.run({ id: "1", name: "pathlynks_profile", args: {} }, who);
  assert.match(JSON.stringify(profile.result), /12/);
  assert.doesNotMatch(JSON.stringify(profile), /SECRET|private.test/);
  const assessment = await tools.run({ id: "2", name: "pathlynks_assessment", args: {} }, who);
  assert.match(JSON.stringify(assessment.result), /4 completed/);
  const nav = await tools.run({ id: "3", name: "navigate_steps", args: { intent: "mujhe career select karna hai" } }, who);
  assert.match(JSON.stringify(nav.result), /career-quest\/career-selection/);
  await tools.run({ id: "4", name: "pathlynks_profile", args: { studentId: "stu-B" } }, who);
  await tools.run({ id: "5", name: "pathlynks_profile", args: {} }, { ...who, tenantId: "other" });
  assert.deepEqual(seen, ["stu-A"]);
});

// ---------------------------------------------------------------------------
// (A1) W1: a writer-deadline error on the crisis write is not a fence
// ---------------------------------------------------------------------------

test("W1: a crisis flag write that dies with FencedWriterDeadlineError (student NOT fenced) is retried, the crisis is still escalated once, the student is not ejected, and the log names the deadline, not a fence", async () => {
  const escalations: any[] = [];
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      let attempts = 0;
      (w.fakeDb.collection("student_flags") as any).updateOne = async () => {
        attempts++;
        throw new FencedWriterDeadlineError();
      };
      speak(w, 0, CRISIS_PHRASE);
      await until(() => escalations.length > 0, "escalated despite the flag deadline");
      await w.voice.settled();
      assert.equal(escalations.length, 1);
      assert.equal(attempts, 2, "the flag write is retried once");
      assert.ok(w.logs.some((l) => l.event === "voice_crisis_flag_deadline"), "the deadline is logged under its true reason");
      assert.ok(!w.logs.some((l) => l.event === "voice_crisis_escalate_skipped_fenced"), "a deadline is not reported as a fence");
      assert.ok(!client.of("error").some((e) => e.code === "student_fenced"), "the student is not told they are fenced");
      assert.equal(client.closed, false, "the session is not ended");
      assert.ok(!JSON.stringify(w.logs).includes("kill"), "text-free");
    },
    { deps: { escalateForTenant: () => async (input: any) => void escalations.push(input) } },
  );
});

test("W1: a flag write that hits the deadline once and then succeeds stores the flag once and escalates once, logging nothing", async () => {
  const escalations: any[] = [];
  await withWorld(
    async (w, threadId) => {
      await w.open(adult(), threadId);
      const flags = w.fakeDb.collection("student_flags") as any;
      const real = flags.updateOne.bind(flags);
      let n = 0;
      flags.updateOne = async (...a: unknown[]) => {
        if (++n === 1) throw new FencedWriterDeadlineError();
        return real(...a);
      };
      speak(w, 0, CRISIS_PHRASE);
      await until(() => escalations.length === 1, "delivered");
      await w.voice.settled();
      assert.equal(w.fakeDb.collection<any>("student_flags").all().length, 1);
      assert.equal(escalations.length, 1);
      assert.ok(!w.logs.some((l) => l.event.startsWith("voice_crisis")));
    },
    { deps: { escalateForTenant: () => async (input: any) => void escalations.push(input) } },
  );
});

test("W1: an escalation port that dies with FencedWriterDeadlineError once is retried and delivered; the student is not ejected", async () => {
  const delivered: any[] = [];
  let calls = 0;
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => delivered.length === 1, "delivered on the retry");
      await w.voice.settled();
      assert.equal(calls, 2);
      assert.ok(!client.of("error").some((e) => e.code === "student_fenced"));
      assert.equal(client.closed, false);
      assert.ok(!w.logs.some((l) => l.event === "voice_crisis_escalate_skipped_fenced"));
    },
    {
      deps: {
        escalateForTenant: () => async (input: any) => {
          if (++calls === 1) throw new FencedWriterDeadlineError();
          delivered.push(input);
        },
      },
    },
  );
});

// ---------------------------------------------------------------------------
// (A2) W2: work still running after the drain timeout is waited for (bounded) by close()
// ---------------------------------------------------------------------------

test("W2: an escalation still running after the drain timeout is awaited by voice.close(), so a shutdown does not lose it", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const delivered: any[] = [];
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => w.fakeDb.collection<any>("student_flags").all().length === 1, "flag stored; the escalation now waits on the gate");
      client.send({ type: "end" });
      await until(() => client.closed, "closed after the drain timeout");
      await w.voice.settled();
      assert.ok(w.logs.some((l) => l.event === "voice_drain_timeout"));
      assert.equal(delivered.length, 0, "still in flight");
      let closed = false;
      const closing = w.voice.close().then(() => (closed = true));
      await sleep(150);
      assert.equal(closed, false, "close() waits for the late escalation");
      release();
      await closing;
      assert.equal(delivered.length, 1, "the escalation was delivered before close() returned");
    },
    {
      deps: {
        drainTimeoutMs: 500,
        escalateForTenant: () => async (input: any) => {
          await gate;
          delivered.push(input);
        },
      } as Partial<VoiceApiDeps>,
    },
  );
});

test("W2: the wait for late work at shutdown is bounded: a write that never settles delays close() by at most drainTimeoutMs and is logged", async () => {
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => w.fakeDb.collection<any>("student_flags").all().length === 1, "flag stored; the escalation hangs");
      client.send({ type: "end" });
      await until(() => client.closed, "closed after the drain timeout");
      await w.voice.settled();
      const t0 = Date.now();
      await w.voice.close();
      const took = Date.now() - t0;
      assert.ok(took < 1500, `close() returned in ${took} ms`);
      assert.ok(took >= 40, `close() did wait for the late work (${took} ms)`);
      assert.ok(w.logs.some((l) => l.event === "voice_shutdown_drain_timeout"));
    },
    { deps: { drainTimeoutMs: 60, escalateForTenant: () => () => new Promise<never>(() => undefined) } as Partial<VoiceApiDeps> },
  );
});

// ---------------------------------------------------------------------------
// (A3) W3: a superseded start that is still connecting never overlaps the new paid session
// ---------------------------------------------------------------------------

function trackedLive(hangFirst: "gate" | "forever"): { live: LiveProvider; inner: MockLiveProvider; entered: () => number; maxOpen: () => number; release: () => void } {
  const inner = new MockLiveProvider();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let entered = 0;
  let open = 0;
  let max = 0;
  const live = {
    kind: "mock",
    connect: async (cfg: Parameters<MockLiveProvider["connect"]>[0]) => {
      const n = ++entered;
      open++;
      max = Math.max(max, open);
      if (n === 1) await (hangFirst === "gate" ? gate : new Promise<never>(() => undefined));
      const session = await inner.connect(cfg);
      const close = session.close.bind(session);
      let counted = false;
      session.close = ((reason?: string) => {
        if (!counted) {
          counted = true;
          open--;
        }
        return close(reason);
      }) as typeof session.close;
      return session;
    },
  } as unknown as LiveProvider;
  return { live, inner, entered: () => entered, maxOpen: () => max, release };
}

test("W3: a start superseded while its provider connect is still in flight is closed before the newer start opens its own provider session (never two paid sessions at once)", async () => {
  const t = trackedLive("gate");
  await withWorld(
    async (w, threadId) => {
      const a = await w.connect(await w.mint(adult(), threadId), { threadId });
      assert.ok(a.ok);
      if (!a.ok) return;
      a.client.send({ type: "start", threadId });
      await until(() => t.entered() === 1, "A's provider connect in flight");
      const c = await w.connect(await w.mint(adult(), threadId), { threadId });
      assert.ok(c.ok);
      if (!c.ok) return;
      c.client.send({ type: "start", threadId });
      await until(() => a.client.of("error").some((e) => e.code === "superseded"), "A told superseded");
      await sleep(150);
      assert.equal(t.entered(), 1, "the newer start waits for A's connect to finish and be closed before it connects");
      t.release();
      await until(() => t.inner.backends.length === 2, "C's own provider session");
      await until(() => w.voice.stats().liveSessions === 1, "exactly one live session");
      assert.equal(t.maxOpen(), 1, "never more than one provider session open or connecting at once");
      assert.ok(t.inner.backends[0]!.calls.some((x) => x.type === "close"), "A's late session was closed");
      assert.equal(c.client.closed, false);
    },
    { live: t.live },
  );
});

test("W3: if the superseded connect never returns, the newer start waits at most connectOverlapWaitMs, the overlap is logged, and it still becomes the live session", async () => {
  const t = trackedLive("forever");
  await withWorld(
    async (w, threadId) => {
      const a = await w.connect(await w.mint(adult(), threadId), { threadId });
      assert.ok(a.ok);
      if (!a.ok) return;
      a.client.send({ type: "start", threadId });
      await until(() => t.entered() === 1, "A's provider connect in flight");
      const c = await w.connect(await w.mint(adult(), threadId), { threadId });
      assert.ok(c.ok);
      if (!c.ok) return;
      c.client.send({ type: "start", threadId });
      await until(() => t.inner.backends.length === 1, "C connected after the bounded wait", 3000);
      assert.ok(w.logs.some((l) => l.event === "voice_connect_overlap"), "the bounded overlap is logged");
      assert.equal(c.client.closed, false);
    },
    { live: t.live, deps: { connectOverlapWaitMs: 100 } as Partial<VoiceApiDeps> },
  );
});

// ---------------------------------------------------------------------------
// (A4) W4: the C17 retry cannot escalate twice (the real port dedupes by session + turn id)
// ---------------------------------------------------------------------------

test("W4: the retry after a delivered-then-thrown escalation reuses the same session and turn id, and the real escalateTurns port writes each recipient record once", async () => {
  const inputs: any[] = [];
  let calls = 0;
  const escalationDeps = () => ({
    recipients: async () => ({ adminIds: ["admin-1"], counsellorIds: ["counsellor-1"] }),
    classifier: { provider: kbAnswerProvider(), skillPrompt: loadSkill(SKILLS_DIR, CONCERN_CLASSIFIER_SKILL), config: loadConcernClassifierConfig({}) },
    alert: () => undefined,
  });
  await withWorld(
    async (w, threadId) => {
      await w.open(adult(), threadId);
      speak(w, 0, CRISIS_PHRASE);
      await until(() => calls >= 2, "the retry ran");
      await w.voice.settled();
      assert.equal(calls, 2, "delivered, then thrown, then retried once");
      assert.equal(inputs[0].sessionId, inputs[1].sessionId);
      assert.equal(inputs[0].turns[0].turnId, inputs[1].turns[0].turnId, "the retry carries the same dedupe key");
      const docs = w.fakeDb.collection<any>(COLLECTION_NAMES.escalation_notifications).all();
      assert.equal(docs.length, 2, "one record for the admin and one for the counsellor, not four");
      assert.equal(new Set(docs.map((d: any) => d._id)).size, 2);
    },
    {
      deps: {
        escalateForTenant: (_tenantId: string, db: Db) => async (input: any) => {
          inputs.push(input);
          calls++;
          await escalateTurns(db, input, escalationDeps());
          if (calls === 1) throw new Error("acknowledgement lost after delivery");
        },
      },
    },
  );
});

// ---------------------------------------------------------------------------
// (B) startApi wiring
// ---------------------------------------------------------------------------

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
const counsellorVerifier = createJwtVerifier(jwtConfigFromEnv({ VC_JWT_ISSUER: "https://issuer.synthetic.test", VC_JWT_PUBLIC_KEY: PEM }));
const CRISIS = {};

async function freePort(): Promise<number> {
  const s: Server = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as AddressInfo).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

interface Boot {
  api: Awaited<ReturnType<typeof startApi>>;
  fake: ReturnType<typeof createFakeMongoClient>;
  provider: MockLiveProvider;
  port: number;
  db: Db;
  gates: ReturnType<typeof gatesFixture>;
  stop(): Promise<void>;
}

async function boot(env: Record<string, string | undefined>, voice: Record<string, unknown> | undefined, extra: { chat?: Record<string, unknown>; fake?: ReturnType<typeof createFakeMongoClient> } = {}): Promise<Boot> {
  const fake = extra.fake ?? createFakeMongoClient();
  const gates = gatesFixture(VOICE_GATES);
  const provider = new MockLiveProvider();
  const port = await freePort();
  const api = await startApi(
    { MONGODB_URL: "mongodb://fake-host/ignored", VC_GATE_APPROVER: "Umesh", ...env },
    {
      clientFactory: () => fake.client,
      http: {
        port,
        verifier: counsellorVerifier,
        provider: kbAnswerProvider(),
        skillsDir: SKILLS_DIR,
        ...(voice
          ? { voice: { live: provider, crisis: CRISIS, wsSecret: new Uint8Array(randomBytes(32)), wsBaseUrl: `ws://127.0.0.1:${port}`, verifier: studentVerifier(), gatesDir: gates.gates, ...voice } }
          : {}),
        ...(extra.chat ? { chat: { gatesDir: gates.gates, ...extra.chat } } : {}),
      } as any,
    },
  );
  const db = tenantScopedDb(fake.dbFor(VC_DB_NAME) as unknown as Db, "tenant-a");
  let stopped = false;
  return {
    api,
    fake,
    provider,
    port,
    db,
    gates,
    async stop() {
      if (!stopped) {
        stopped = true;
        await api.stop();
      }
      cleanupGates(gates);
    },
  };
}

const sessionUrl = (port: number, threadId: string) => `http://127.0.0.1:${port}/v1/students/stu-1/chat/threads/${threadId}/voice/sessions`;
const streamUrl = (port: number, threadId: string) => `ws://127.0.0.1:${port}/v1/students/stu-1/chat/threads/${threadId}/voice/stream`;

async function mintToken(b: Boot, threadId: string): Promise<{ status: number; token?: string }> {
  const jwt = await studentToken(adult());
  const res = await fetch(sessionUrl(b.port, threadId), { method: "POST", headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" }, body: "{}" });
  const json: any = await res.json().catch(() => ({}));
  return { status: res.status, token: json.token };
}

function openSocket(b: Boot, threadId: string, token: string): Promise<{ ws: WebSocket; events: any[] } | { status: number }> {
  return new Promise((resolve) => {
    const events: any[] = [];
    const ws = new WebSocket(streamUrl(b.port, threadId), ["vc-voice-v1"], { headers: { authorization: `Bearer ${token}` } });
    ws.on("message", (data, isBinary) => {
      if (!isBinary) events.push(JSON.parse((data as Buffer).toString("utf8")));
    });
    ws.on("unexpected-response", (_q, res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0 });
    });
    ws.on("open", () => resolve({ ws, events }));
    ws.on("error", () => resolve({ status: 0 }));
  });
}

async function startedSession(b: Boot): Promise<{ ws: WebSocket; events: any[]; threadId: string }> {
  const threadId = "th-w";
  await createChatThread(b.db, { studentId: "stu-1", textStored: true, threadId });
  const m = await mintToken(b, threadId);
  assert.equal(m.status, 201);
  const sock = await openSocket(b, threadId, m.token!);
  assert.ok("ws" in sock, "the upgrade was accepted");
  if (!("ws" in sock)) throw new Error("unreachable");
  sock.ws.send(JSON.stringify({ type: "start", threadId }));
  await until(() => b.provider.backends.length === 1, "the provider session after start");
  return { ws: sock.ws, events: sock.events, threadId };
}

test("W5: VC_VOICE_ENABLED unset, empty or 'false' -> no voice route, an upgrade is refused, no gate is read, nothing voice-related is built or connected", async () => {
  for (const env of [{}, { VC_VOICE_ENABLED: "" }, { VC_VOICE_ENABLED: "false" }]) {
    // The voice options are deliberately unusable (bogus gates dir, 3-byte secret, bad URL): with the flag off none of it may be looked at.
    const b = await boot(env, { gatesDir: "Z:/does/not/exist", wsSecret: new Uint8Array(3), wsBaseUrl: "not-a-url" });
    try {
      const threadId = "th-off";
      const jwt = await studentToken(adult());
      const res = await fetch(sessionUrl(b.port, threadId), { method: "POST", headers: { authorization: `Bearer ${jwt}` }, body: "{}" });
      assert.notEqual(res.status, 201, JSON.stringify(env));
      assert.ok([401, 403, 404].includes(res.status), `status ${res.status} for ${JSON.stringify(env)}`);
      await res.arrayBuffer();
      const sock = await openSocket(b, threadId, "anything");
      assert.ok(!("ws" in sock), "an upgrade is refused");
      assert.equal(b.provider.backends.length, 0, "no provider session was ever created");
    } finally {
      await b.stop();
    }
  }
});

test("W5: voiceEnabledFromEnv - exactly 'true' is on; unset, empty and 'false' are off; padded, cased or other values throw VoiceConfigError (never on)", () => {
  assert.equal(voiceEnabledFromEnv({ VC_VOICE_ENABLED: "true" }), true);
  for (const env of [{}, { VC_VOICE_ENABLED: "" }, { VC_VOICE_ENABLED: "false" }]) assert.equal(voiceEnabledFromEnv(env), false);
  for (const v of [" true", "true ", "\ttrue\n", " true ", "TRUE", "1", "yes"]) {
    assert.throws(() => voiceEnabledFromEnv({ VC_VOICE_ENABLED: v }), VoiceConfigError, JSON.stringify(v));
  }
});

test("W6: flag on -> startApi fails closed BEFORE connecting to Mongo or listening, for each of: no go-live gate, tracing on, no live provider, no crisis message, short secret, bad base URL, bad flag value", async () => {
  const cases: Array<{ name: string; env: Record<string, string>; voice: Record<string, unknown> | "failed-a10"; want: new (...a: never[]) => Error }> = [
    // The repo's real qa/gates now carry the D-111 owner override (voice is allowed there, see go-live-gate.test.ts), so the closed-gate case uses a gates directory whose A10 record FAILED with no override.
    { name: "A10 FAIL and no owner override (A20 gate not satisfied)", env: { VC_VOICE_ENABLED: "true" }, voice: "failed-a10", want: GoLiveRefusedError },
    { name: "tracing on", env: { VC_VOICE_ENABLED: "true", LANGSMITH_TRACING: "true" }, voice: {}, want: VoiceConfigError },
    { name: "no live provider", env: { VC_VOICE_ENABLED: "true" }, voice: { live: undefined }, want: VoiceConfigError },
    { name: "no crisis message", env: { VC_VOICE_ENABLED: "true" }, voice: { crisis: undefined }, want: VoiceConfigError },
    { name: "short secret", env: { VC_VOICE_ENABLED: "true" }, voice: { wsSecret: new Uint8Array(8) }, want: VoiceConfigError },
    { name: "bad base url", env: { VC_VOICE_ENABLED: "true" }, voice: { wsBaseUrl: "https://nope.example" }, want: VoiceConfigError },
    { name: "bad flag value", env: { VC_VOICE_ENABLED: "TRUE" }, voice: {}, want: VoiceConfigError },
    // W5 repair (cycle 2): only the exact string "true" enables voice. A padded or differently-cased value is NOT trimmed into "true"; it fails closed.
    ...[" true", "true ", "\ttrue\n", " true ", "1", "yes"].map((v) => ({
      name: `bad flag value ${JSON.stringify(v)}`,
      env: { VC_VOICE_ENABLED: v },
      voice: {} as Record<string, unknown>,
      want: VoiceConfigError,
    })),
  ];
  for (const c of cases) {
    const fake = createFakeMongoClient();
    let connected = 0;
    (fake.client as unknown as { connect: () => Promise<void> }).connect = async () => {
      connected += 1;
    };
    const gates = gatesFixture(c.voice === "failed-a10" ? { ...VOICE_GATES, a10: "# A10\nResult: FAIL\n" } : VOICE_GATES);
    const port = await freePort();
    try {
      const voice =
        c.voice === "failed-a10"
          ? { live: new MockLiveProvider(), crisis: CRISIS, wsSecret: new Uint8Array(randomBytes(32)), wsBaseUrl: `ws://127.0.0.1:${port}`, verifier: studentVerifier(), gatesDir: gates.gates }
          : { live: new MockLiveProvider(), crisis: CRISIS, wsSecret: new Uint8Array(randomBytes(32)), wsBaseUrl: `ws://127.0.0.1:${port}`, verifier: studentVerifier(), gatesDir: gates.gates, ...c.voice };
      await assert.rejects(
        startApi(
          { MONGODB_URL: "mongodb://fake-host/ignored", VC_GATE_APPROVER: "Umesh", ...c.env },
          { clientFactory: () => fake.client, http: { port, verifier: counsellorVerifier, provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, voice } as any },
        ),
        c.want as any,
        c.name,
      );
      assert.equal(connected, 0, `${c.name}: refused before connecting`);
      // and nothing is listening
      const probe = await new Promise<string>((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/x`);
        ws.on("open", () => resolve("open"));
        ws.on("error", () => resolve("refused"));
        ws.on("unexpected-response", (_q, r) => {
          r.resume();
          resolve("http");
        });
      });
      assert.equal(probe, "refused", `${c.name}: nothing is listening`);
    } finally {
      cleanupGates(gates);
    }
  }
});

test("W7: flag on and gates open -> in a started process the session route mints a token, the WebSocket upgrades, a start reaches the provider, and a wrong token is refused", async () => {
  const b = await boot({ VC_VOICE_ENABLED: "true" }, {});
  try {
    const s = await startedSession(b);
    await until(() => s.events.length > 0 || b.provider.backends.length === 1, "session relayed");
    assert.equal(b.provider.backends.length, 1);
    // an upgrade with a bad token never reaches the provider
    const bad = await openSocket(b, s.threadId, "not.a.token");
    assert.ok(!("ws" in bad));
    assert.equal(b.provider.backends.length, 1);
    s.ws.close();
  } finally {
    await b.stop();
  }
});

test("W7: the WebSocket secret and base URL default to VC_VOICE_WS_SECRET and VC_VOICE_WS_BASE_URL when the options are not supplied", async () => {
  const b = await boot(
    { VC_VOICE_ENABLED: "true", VC_VOICE_WS_SECRET: "an-env-secret-of-at-least-32-bytes-long!!", VC_VOICE_WS_BASE_URL: "wss://voice.example.test/ws" },
    { wsSecret: undefined, wsBaseUrl: undefined },
  );
  try {
    const threadId = "th-env";
    await createChatThread(b.db, { studentId: "stu-1", textStored: true, threadId });
    const jwt = await studentToken(adult());
    const res = await fetch(sessionUrl(b.port, threadId), { method: "POST", headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" }, body: "{}" });
    assert.equal(res.status, 201);
    const json: any = await res.json();
    assert.ok(String(json.wsUrl).startsWith("wss://voice.example.test/ws/"), String(json.wsUrl));
  } finally {
    await b.stop();
  }
});

test("W8: stop() finalizes a live voice session before the database client closes, and its usage is recorded", async () => {
  const fake = createFakeMongoClient();
  const order: string[] = [];
  const realClose = fake.client.close.bind(fake.client);
  let usageAtDbClose = -1;
  const b = await boot({ VC_VOICE_ENABLED: "true" }, {}, { fake });
  (fake.client as unknown as { close: () => Promise<void> }).close = async () => {
    order.push("db-close");
    usageAtDbClose = (await getStudentUsage(b.db, { studentId: "stu-1", month: usageMonth(new Date()) })).voiceMs;
    return realClose();
  };
  try {
    const s = await startedSession(b);
    const closed = new Promise<number>((r) => s.ws.on("close", (code) => r(code)));
    await sleep(30);
    await b.api.stop();
    assert.equal(await closed, 1001, "the live socket was closed by the shutdown");
    assert.ok(order.includes("db-close"), "the db client was closed");
    assert.ok(usageAtDbClose > 0, `usage (${usageAtDbClose} ms) was written before the db client closed`);
    assert.ok(b.provider.backends[0]!.calls.some((x) => x.type === "close"), "the provider session was closed");
  } finally {
    await b.stop();
  }
});

test("W9: a voice crisis in a started process reaches the SAME escalateForTenant port the text chat uses (one flag, one escalation)", async () => {
  const seen: Array<{ tenantId: string; input: any }> = [];
  const port = (tenantId: string) => async (input: any) => void seen.push({ tenantId, input });
  const b = await boot(
    { VC_VOICE_ENABLED: "true", VC_CHAT_ENABLED: "true" },
    {},
    { chat: { kb: recordingKb(), speakers: SPEAKERS, verifier: studentVerifier(), escalateForTenant: (tenantId: string) => port(tenantId) } },
  );
  try {
    const s = await startedSession(b);
    b.provider.backends[0]!.emitInputTranscript(CRISIS_PHRASE, true);
    await until(() => seen.length >= 1, "escalated through the chat port");
    await sleep(100);
    assert.equal(seen.length, 1, "one escalation");
    assert.equal(seen[0]!.tenantId, "tenant-a");
    assert.equal(seen[0]!.input.sessionId, s.threadId);
    assert.equal(b.fake.dbFor(VC_DB_NAME).collection<any>("student_flags").all().length, 1, "one flag");
    s.ws.close();
  } finally {
    await b.stop();
  }
});

test("W9: with chat off, a voice crisis goes through the engine's escalateTurns exactly like the text path default (notification records are written)", async () => {
  const b = await boot({ VC_VOICE_ENABLED: "true" }, {});
  try {
    const s = await startedSession(b);
    b.provider.backends[0]!.emitInputTranscript(CRISIS_PHRASE, true);
    await until(() => b.fake.dbFor(VC_DB_NAME).collection<any>(COLLECTION_NAMES.escalation_notifications).all().length > 0, "escalation records written");
    const docs = b.fake.dbFor(VC_DB_NAME).collection<any>(COLLECTION_NAMES.escalation_notifications).all();
    assert.ok(docs.every((d: any) => d.kind === "crisis_escalation" && d.sessionId === s.threadId));
    assert.equal(b.fake.dbFor(VC_DB_NAME).collection<any>("student_flags").all().length, 1);
    s.ws.close();
  } finally {
    await b.stop();
  }
});

test("S12 runtime voice tools: verified tenant selects native data and navigation without cross-platform fallback", async () => {
 const seen:string[]=[];
 const common={kb:recordingKb(),provider:kbAnswerProvider(),skillsDir:SKILLS_DIR,speakers:SPEAKERS,hasPriorFlag:async()=>false};
 const tools=createQuestVoiceTools(tenant=>tenant==="vidysea"?{...common,vidysea:{
  getStudentProfile:async(id)=>{seen.push(id);return {ok:true,rows:[{academic_level:"Undergraduate"}],truncated:false};},
  getShortlistedProgrammes:async(id)=>{seen.push(id);return {ok:true,rows:[{programme_name:"Native MSc",university_name:"Native University"}],truncated:false};},
  getProfileAssessment:async()=>({ok:true,rows:[],truncated:false})
 },navCatalogue:async()=>({routes:[{path:"/student/shortlist"}]})}:undefined,common);
 const who={tenantId:"vidysea",studentId:"synthetic-owner",threadId:"owned"};
 const out=await tools.run({id:"s12",name:"vidysea_shortlisted_programmes",args:{}},who);
 assert.match(JSON.stringify(out.result),/Native MSc/);assert.doesNotMatch(JSON.stringify(out.result),/career|Pathlynks/);
 const before=seen.length;await tools.run({id:"other",name:"vidysea_profile",args:{}},{...who,tenantId:"pathlynks"});assert.equal(seen.length,before);
 await tools.run({id:"bad",name:"vidysea_profile",args:{studentId:"other"}},who);assert.equal(seen.length,before);
 const unsupported=await tools.run({id:"career",name:"pathlynks_saved_careers",args:{}},who);assert.match(JSON.stringify(unsupported.result),/can't see/);assert.equal(seen.length,before);
 assert.deepEqual(seen,["synthetic-owner"]);
});

// ---------------------------------------------------------------------------
// wire-fix-1 (D-134): the Vidysea tracking tools and the Career Quest tools are voice tools too, with the same owner binding as chat.
// ---------------------------------------------------------------------------

test("wire-fix-1: voice declares and runs the vidysea_* tracking tools and the pathlynks_* Career Quest tools, bound to the verified student; an identity argument or a foreign tenant reads nothing", async () => {
  const seen: string[] = [];
  const common = { kb: recordingKb(), provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, speakers: SPEAKERS, hasPriorFlag: async () => false };
  const rows = (tag: string, row: Record<string, unknown>) => async (id: string) => { seen.push(`${tag}:${id}`); return { ok: true, rows: [row], truncated: false }; };
  const vidysea = {
    getStudentProfile: rows("profile", { academic_level: "Undergraduate" }),
    getShortlistedProgrammes: rows("shortlist", { programme_name: "Synthetic MSc", university_name: "Synthetic University" }),
    getProfileAssessment: async () => ({ ok: true, rows: [], truncated: false }),
    getJourneyMaps: rows("journey", { program_name: "Synthetic Journey MSc", university_name: "Journey University", country_name: "Canada" }),
    getApplications: rows("applications", { program_name: "Synthetic App MSc", university_name: "App University", application_status: "submitted" }),
    getVisaApplications: rows("visa", { visa_type: "Study permit", country: "Canada", status: "in_progress" }),
    getFavourites: rows("favourites", { item_type: "university", item_name: "Favourite Synthetic University" }),
    getSavedScholarships: rows("scholarships", { name: "Synthetic Scholarship", provider: "Synthetic Trust", country: "Canada" }),
  };
  const quest = {
    getStudentProfile: async () => ({ status: "ok" as const, data: { grade: "11" } }),
    getSavedCareers: async () => ({ status: "ok" as const, data: [] }),
    getCompareList: async () => ({ status: "ok" as const, data: [] }),
    getAssessmentStatus: async () => ({ status: "ok" as const, data: { completed: 1, inProgress: 0, reportsAvailable: 1, totalResponses: 1, status: "completed" } }),
    getQuestProfile: async (id: string) => { seen.push(`quest:${id}`); return { status: "ok" as const, data: { gradeLabel: "Grade 11", level: 3, xp: 240, shareToken: "SECRET-SHARE" } }; },
    getQuestGoals: async (id: string) => { seen.push(`goals:${id}`); return { status: "ok" as const, data: [{ title: "Win a synthetic science fair", status: "active" }] }; },
    getQuestPlan: async (id: string) => { seen.push(`plan:${id}`); return { status: "ok" as const, data: { planTitle: "Synthetic year plan", stepsTotal: 4, stepsCompleted: 1 } }; },
  };
  const tools = createQuestVoiceTools((tenant) => (tenant === "vidysea" ? { ...common, vidysea } : tenant === "pathlynks" ? { ...common, pathlynks: quest } : undefined), common);
  const wanted = ["vidysea_journey_maps", "vidysea_applications", "vidysea_visa", "vidysea_favourites", "vidysea_saved_scholarships", "vidysea_progress", "pathlynks_quest_progress", "pathlynks_goals", "pathlynks_year_plan"];
  const declared = new Set(tools.declarations.map((d) => d.name));
  for (const name of wanted) assert.ok(declared.has(name), `${name} is declared`);
  for (const d of tools.declarations.filter((x) => wanted.includes(x.name))) assert.deepEqual(d.parameters, { type: "object", properties: {}, additionalProperties: false }, `${d.name} accepts no arguments, so no identity`);

  const v = { tenantId: "vidysea", studentId: "synthetic-owner", threadId: "t-v" };
  const expectV: [string, RegExp][] = [
    ["vidysea_journey_maps", /Synthetic Journey MSc/],
    ["vidysea_applications", /Synthetic App MSc/],
    ["vidysea_visa", /Study permit/],
    ["vidysea_favourites", /Favourite Synthetic University/],
    ["vidysea_saved_scholarships", /Synthetic Scholarship/],
  ];
  for (const [name, re] of expectV) assert.match(JSON.stringify((await tools.run({ id: name, name, args: {} }, v)).result), re, name);
  const progress = await tools.run({ id: "p", name: "vidysea_progress", args: {} }, v);
  assert.doesNotMatch(JSON.stringify(progress.result), /can't see/, "vidysea_progress reaches the graph, not the outage line");
  assert.match(JSON.stringify(progress.result), /journey|application|visa|shortlist/i);

  const p = { tenantId: "pathlynks", studentId: "synthetic-student", threadId: "t-p" };
  const qp = await tools.run({ id: "q1", name: "pathlynks_quest_progress", args: {} }, p);
  assert.match(JSON.stringify(qp.result), /Level 3/);
  assert.doesNotMatch(JSON.stringify(qp), /SECRET-SHARE/);
  assert.match(JSON.stringify((await tools.run({ id: "q2", name: "pathlynks_goals", args: {} }, p)).result), /Win a synthetic science fair/);
  assert.match(JSON.stringify((await tools.run({ id: "q3", name: "pathlynks_year_plan", args: {} }, p)).result), /Synthetic year plan/);

  assert.deepEqual(seen.filter((x) => /^(quest|goals|plan):/.test(x)), ["quest:synthetic-student", "goals:synthetic-student", "plan:synthetic-student"]);
  assert.ok(seen.every((x) => x.endsWith(":synthetic-owner") || x.endsWith(":synthetic-student")), "every read used the verified student id");
  const before = seen.length;
  for (const name of wanted) {
    await tools.run({ id: "x", name, args: { studentId: "someone-else" } }, v);
    await tools.run({ id: "y", name, args: {} }, { ...v, tenantId: "unknown-tenant" });
  }
  assert.equal(seen.length, before, "an identity argument, or a tenant with no platform, reads nothing");
  const crossed = await tools.run({ id: "z", name: "pathlynks_goals", args: {} }, v);
  assert.match(JSON.stringify(crossed.result), /Career Quest is part of Pathlynks/, "a quest tool on a Vidysea tenant says so and reads nothing");
  assert.equal(seen.length, before);
});
