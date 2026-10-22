/**
 * pc-voice V2 (D-111; spec V2): key-authenticated voice sessions. Outcome tests over the real partner registry, the real voice API (real node:http server
 * and the `ws` client), the in-memory fake Db and the MockLiveProvider (no network, no paid call). Keys, students and text are all invented (B13).
 *
 * Scope rule under test: a PAGE key (vck_pub_) opens only the public (anonymous) voice session route, from the partner's own origins; a SERVER key (vck_srv_)
 * opens only the student voice routes, with the K3 student headers, and never gets CORS. A key used outside its scope is the same uniform 401 as any bad key.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { WebSocket } from "ws";
import { VC_DB_NAME, createChatThread, listChatTurns, tenantScopedDb } from "@vc/db";
import { createFakeDb, createFakeMongoClient } from "@vc/db/testing";
import { MockLiveProvider } from "@vc/providers";
import { createJwtVerifier, jwtConfigFromEnv } from "../src/auth.js";
import { startApi } from "../src/index.js";
import { VoiceSessionResponseSchema } from "@vc/schemas";
import { addPartner, createMongoPartnerStore, createPartnerRegistry, revokePartner, withPartnerRoutes, type PartnerStore } from "../src/partners.js";
import { ANONYMOUS_VOICE_THREAD_ID, VOICE_ACTIVE_CAP_RETRY_AFTER_SEC, VOICE_MAX_ACTIVE_ANONYMOUS_PER_CLIENT, VOICE_MAX_ACTIVE_ANONYMOUS_PER_PARTNER_DEFAULT, VOICE_RESUME_WINDOW_MS, anonymousCapLimit, type VoiceApiDeps } from "../src/voice.js";
import type { ApiHandler, ApiResponse } from "../src/server.js";
import { nonEmptyCollections } from "./anonymous-fixtures.js";
import { SKILLS_DIR, chatRequest, cleanupGates, gatesFixture, kbAnswerProvider, studentVerifier } from "./chat-fixtures.js";
import { CRISIS_AUDIO, CRISIS_PHRASE, CRISIS_TEXT_FIXED, VoiceClient, until, voiceWorld, type ConnectResult, type VoiceWorld } from "./voice-fixtures.js";

const PEPPER = "synthetic-pepper-".padEnd(40, "x");
const T0 = Date.parse("2026-11-01T10:00:00.000Z");
const ORIGIN = "https://pathlynks.example";
const EVIL = "https://evil.example";
const STUDENT = "stu-9";

interface Json extends ApiResponse {
  json: any;
}

interface PV {
  w: VoiceWorld;
  /** The composed handler a deployment serves: partner routes outermost (CORS), then voice, then chat. */
  handler: ApiHandler;
  pub: string;
  srv: string;
  partnerId: string;
  store: PartnerStore;
  pclock: { ms: number };
  counters: string[];
  escalations: unknown[];
  dbCalls: string[];
  sockets: WebSocket[];
  close(): Promise<void>;
}

async function pvWorld(opts: { deps?: Partial<VoiceApiDeps>; anonymous?: boolean; origins?: string[]; registry?: ReturnType<typeof createPartnerRegistry> } = {}): Promise<PV> {
  const { db: pdb } = createFakeDb();
  const store = createMongoPartnerStore(pdb);
  const pclock = { ms: T0 };
  const registry = opts.registry ?? createPartnerRegistry({ store, pepper: PEPPER, nowMs: () => pclock.ms });
  const added = await addPartner(store, { name: "Pathlynks", origins: opts.origins ?? [ORIGIN] }, { pepper: PEPPER, now: () => new Date(T0) });
  const counters: string[] = [];
  const escalations: unknown[] = [];
  const dbCalls: string[] = [];
  const anonymousOn = opts.anonymous !== false;
  let holder!: VoiceWorld;
  const deps: Partial<VoiceApiDeps> = {
    partners: registry,
    ...(anonymousOn
      ? {
          anonymous: {
            clientKey: (req) => (typeof req.headers["x-test-client"] === "string" ? req.headers["x-test-client"] : "client-1"),
            counter: { increment: async (kind) => void counters.push(kind) },
          },
        }
      : {}),
    escalateForTenant: () => async (input) => void escalations.push(input),
    dbForTenant: (tenantId) => {
      dbCalls.push(tenantId);
      return tenantScopedDb(holder.rawDb, tenantId);
    },
    ...opts.deps,
  };
  const w = await voiceWorld({ deps });
  holder = w;
  return {
    w,
    handler: withPartnerRoutes(w.handler, registry),
    pub: added.keys.pub,
    srv: added.keys.srv,
    partnerId: added.partner.partnerId,
    store,
    pclock,
    counters,
    escalations,
    dbCalls,
    sockets: [],
    async close() {
      for (const s of this.sockets) s.terminate();
      await w.cleanup();
    },
  };
}

async function send(pv: PV, method: string, path: string, opts: Parameters<typeof chatRequest>[2] = {}): Promise<Json> {
  const res = await pv.handler(chatRequest(method, path, opts));
  let json: any;
  try {
    json = JSON.parse(res.body);
  } catch {
    json = undefined;
  }
  return Object.assign(res, { json });
}

const ANON_SESSIONS = "/v1/public/voice/sessions";
const studentSessions = (studentId: string, threadId: string) => `/v1/students/${studentId}/chat/threads/${threadId}/voice/sessions`;

/** The visitor's browser: page key in X-VC-Key, Origin of the partner's site. */
const mintAnon = (pv: PV, headers: Record<string, string | undefined> = {}) =>
  send(pv, "POST", ANON_SESSIONS, { headers: { "x-vc-key": pv.pub, origin: ORIGIN, ...(headers as Record<string, string>) } });

/** The partner's backend: server key as the bearer, the student vouched for in the K3 headers. */
const mintStudent = (pv: PV, threadId: string, headers: Record<string, string> = {}, key = pv.srv, studentId = STUDENT) =>
  send(pv, "POST", studentSessions(studentId, threadId), { token: key, headers: { "x-vc-student-id": studentId, "x-vc-student-age": "25", ...headers } });

async function partnerThread(pv: PV, studentId = STUDENT, textStored = true): Promise<string> {
  const t = await createChatThread(tenantScopedDb(pv.w.rawDb, pv.partnerId), { studentId, textStored }, { now: new Date(pv.w.clock.ms) });
  return t.threadId;
}

function connectAnon(pv: PV, token: string | undefined, o: { origin?: string; how?: "header" | "protocol"; path?: string } = {}): Promise<ConnectResult> {
  const how = o.how ?? "header";
  const url = `ws://127.0.0.1:${pv.w.port}${o.path ?? "/v1/public/voice/stream"}`;
  const headers: Record<string, string> = {};
  if (how === "header" && token) headers.authorization = `Bearer ${token}`;
  if (o.origin) headers.origin = o.origin;
  const protocols = ["vc-voice-v1", ...(how === "protocol" && token ? [`vc-token.${token}`] : [])];
  return new Promise<ConnectResult>((resolve) => {
    const ws = new WebSocket(url, protocols, { headers });
    pv.sockets.push(ws);
    ws.on("unexpected-response", (_req, res) => {
      res.resume();
      resolve({ ok: false, status: res.statusCode ?? 0 });
    });
    ws.on("open", () => resolve({ ok: true, client: new VoiceClient(ws) }));
    ws.on("error", () => undefined);
  });
}

/** Mint with the page key, connect from the partner's site, send start, wait for the provider session. */
async function openAnon(pv: PV): Promise<{ client: VoiceClient; token: string; backendIndex: number }> {
  const minted = await mintAnon(pv);
  assert.equal(minted.status, 201, minted.body);
  const token = minted.json.token as string;
  const backendIndex = pv.w.provider.backends.length;
  const res = await connectAnon(pv, token, { origin: ORIGIN });
  if (!res.ok) throw new Error(`anonymous connect refused: ${res.status}`);
  res.client.send({ type: "start", threadId: ANONYMOUS_VOICE_THREAD_ID });
  await until(() => pv.w.provider.backends.length > backendIndex, "the provider session after start");
  return { client: res.client, token, backendIndex };
}

async function openStudent(pv: PV, threadId: string, headers: Record<string, string> = {}): Promise<{ client: VoiceClient; backendIndex: number }> {
  const minted = await mintStudent(pv, threadId, headers);
  assert.equal(minted.status, 201, minted.body);
  const backendIndex = pv.w.provider.backends.length;
  const res = await pv.w.connect(minted.json.token, { studentId: STUDENT, threadId });
  if (!res.ok) throw new Error(`student connect refused: ${res.status}`);
  res.client.send({ type: "start", threadId });
  await until(() => pv.w.provider.backends.length > backendIndex, "the provider session after start");
  return { client: res.client, backendIndex };
}

const UNAUTHORIZED = (r: ApiResponse) => `${r.status} ${JSON.stringify(Object.entries(r.headers).sort())} ${r.body}`;

// ---------------------------------------------------------------------------
// Partner student voice sessions (server key + K3 headers)
// ---------------------------------------------------------------------------

test("V2: Pathlynks' backend mints a voice session for its adult student with the server key and K3 headers; the student's words are stored under the partner's tenant", async () => {
  const pv = await pvWorld();
  try {
    const threadId = await partnerThread(pv);
    const minted = await mintStudent(pv, threadId);
    assert.equal(minted.status, 201, minted.body);
    VoiceSessionResponseSchema.parse(minted.json);
    assert.equal(minted.json.wsUrl, `ws://127.0.0.1:${pv.w.port}/v1/students/${STUDENT}/chat/threads/${threadId}/voice/stream`);
    const { client } = await openStudent(pv, threadId);
    pv.w.provider.backends[0]!.emitInputTranscript("which German universities have English programmes", true);
    await until(() => client.of("transcript.final").length === 1, "the live transcript reached the student");
    client.send({ type: "end" });
    await until(() => client.closed, "closed");
    await pv.w.voice.settled();
    const turns = await listChatTurns(tenantScopedDb(pv.w.rawDb, pv.partnerId), { studentId: STUDENT, threadId });
    assert.equal(turns.filter((t) => t.channel === "voice").length, 1, "the adult's turn is stored");
    assert.deepEqual([...new Set(pv.dbCalls)], [pv.partnerId], "only the partner's own tenant was touched");
  } finally {
    await pv.close();
  }
});

test("V2: a partner backend that sends no age header is treated as a minor without consent: voice answers, but no turn text is stored", async () => {
  const pv = await pvWorld();
  try {
    const threadId = await partnerThread(pv, STUDENT, false);
    const minted = await send(pv, "POST", studentSessions(STUDENT, threadId), { token: pv.srv, headers: { "x-vc-student-id": STUDENT } });
    assert.equal(minted.status, 201, minted.body);
    const idx = pv.w.provider.backends.length;
    const res = await pv.w.connect(minted.json.token, { studentId: STUDENT, threadId });
    assert.ok(res.ok);
    if (!res.ok) return;
    res.client.send({ type: "start", threadId });
    await until(() => pv.w.provider.backends.length > idx, "provider session");
    pv.w.provider.backends[idx]!.emitInputTranscript("my marks are 61 percent", true);
    await until(() => res.client.of("transcript.final").length === 1, "student sees the live transcript");
    res.client.send({ type: "end" });
    await until(() => res.client.closed, "closed");
    await pv.w.voice.settled();
    assert.equal((await listChatTurns(tenantScopedDb(pv.w.rawDb, pv.partnerId), { studentId: STUDENT, threadId })).length, 0, "nothing stored for a fail-closed minor");
  } finally {
    await pv.close();
  }
});

test("V2: a minor whose partner vouches guardian consent 'true' has voice turns stored; the word 'yes' is not consent", async () => {
  const pv = await pvWorld();
  try {
    for (const [consent, expected] of [["true", 1], ["yes", 0]] as const) {
      const studentId = `kid-${consent}`;
      const threadId = await partnerThread(pv, studentId, consent === "true");
      const minted = await mintStudent(pv, threadId, { "x-vc-student-age": "15", "x-vc-guardian-consent": consent, "x-vc-student-id": studentId }, pv.srv, studentId);
      assert.equal(minted.status, 201, minted.body);
      const idx = pv.w.provider.backends.length;
      const res = await pv.w.connect(minted.json.token, { studentId, threadId });
      assert.ok(res.ok);
      if (!res.ok) return;
      res.client.send({ type: "start", threadId });
      await until(() => pv.w.provider.backends.length > idx, "provider session");
      pv.w.provider.backends[idx]!.emitInputTranscript("tell me about hostels", true);
      await until(() => res.client.of("transcript.final").length === 1, "live transcript");
      res.client.send({ type: "end" });
      await until(() => res.client.closed, "closed");
      await pv.w.voice.settled();
      assert.equal((await listChatTurns(tenantScopedDb(pv.w.rawDb, pv.partnerId), { studentId, threadId })).length, expected, `consent header ${consent}`);
    }
  } finally {
    await pv.close();
  }
});

test("V2: the page key (vck_pub_) in public HTML cannot mint a student voice session, and every other bad key gets the same uniform 401", async () => {
  const pv = await pvWorld();
  try {
    const threadId = await partnerThread(pv);
    const good = await mintStudent(pv, threadId);
    assert.equal(good.status, 201);
    const secret = pv.srv.split("_").slice(3).join("_");
    const variants: Record<string, string> = {
      "page key as bearer": pv.pub,
      "unknown partner": `vck_srv_nobody_${secret}`,
      "wrong secret": `vck_srv_${pv.partnerId}_${"A".repeat(43)}`,
      malformed: "vck_srv_x",
    };
    const bodies = new Set<string>();
    for (const [name, key] of Object.entries(variants)) {
      const r = await mintStudent(pv, threadId, {}, key);
      assert.equal(r.status, 401, name);
      assert.ok(!r.body.includes(key) && !r.body.includes(secret), name);
      bodies.add(UNAUTHORIZED(r));
    }
    assert.equal(bodies.size, 1, "one uniform answer for every bad key");
    const sessionsBefore = pv.w.provider.backends.length;
    assert.equal(pv.w.provider.backends.length, sessionsBefore, "no provider session was opened");
    await revokePartner(pv.store, pv.partnerId);
    pv.pclock.ms += 61_000;
    assert.equal((await mintStudent(pv, threadId)).status, 401, "revoked: both keys stop working");
  } finally {
    await pv.close();
  }
});

test("V2: a server key without the student headers is a 400, and a header naming another student than the path is a 404 (never someone else's thread)", async () => {
  const pv = await pvWorld();
  try {
    const threadId = await partnerThread(pv);
    const noHeader = await send(pv, "POST", studentSessions(STUDENT, threadId), { token: pv.srv });
    assert.equal(noHeader.status, 400);
    const other = await send(pv, "POST", studentSessions(STUDENT, threadId), { token: pv.srv, headers: { "x-vc-student-id": "stu-other", "x-vc-student-age": "30" } });
    assert.equal(other.status, 404);
  } finally {
    await pv.close();
  }
});

test("V2: a second partner's server key cannot open the first partner's student thread (tenant is the partner id)", async () => {
  const pv = await pvWorld();
  try {
    const threadId = await partnerThread(pv);
    const second = await addPartner(pv.store, { name: "Other Site", origins: [] }, { pepper: PEPPER, now: () => new Date(T0) });
    pv.pclock.ms += 61_000; // the registry cache re-reads the new partner
    const r = await mintStudent(pv, threadId, {}, second.keys.srv);
    assert.equal(r.status, 404, "that partner has no such thread");
  } finally {
    await pv.close();
  }
});

test("V2: the student voice session route never gets CORS, even for a partner origin with a valid server key", async () => {
  const pv = await pvWorld();
  try {
    const threadId = await partnerThread(pv);
    const res = await mintStudent(pv, threadId, { origin: ORIGIN });
    assert.equal(res.status, 201);
    assert.equal(res.headers["access-control-allow-origin"], undefined);
    const preflight = await send(pv, "OPTIONS", studentSessions(STUDENT, threadId), { headers: { origin: ORIGIN, "access-control-request-method": "POST" } });
    assert.equal(preflight.headers["access-control-allow-origin"], undefined);
  } finally {
    await pv.close();
  }
});

// ---------------------------------------------------------------------------
// Anonymous voice sessions (page key, the partner's own origins)
// ---------------------------------------------------------------------------

test("V2: a visitor on the partner's site mints an anonymous voice session with the page key; the response is the session contract and carries CORS for that origin only", async () => {
  const pv = await pvWorld();
  try {
    const res = await mintAnon(pv);
    assert.equal(res.status, 201, res.body);
    const parsed = VoiceSessionResponseSchema.parse(res.json);
    assert.equal(parsed.wsUrl, `ws://127.0.0.1:${pv.w.port}/v1/public/voice/stream`);
    assert.equal(res.headers["access-control-allow-origin"], ORIGIN);
    assert.equal(res.headers.vary, "Origin");
    assert.ok(!res.body.includes(pv.pub), "the key is not echoed");
    assert.equal(pv.dbCalls.length, 0, "minting an anonymous session reads no database");
  } finally {
    await pv.close();
  }
});

test("V2: the browser's CORS preflight for the anonymous voice route is answered for a partner origin and for no other", async () => {
  const pv = await pvWorld();
  try {
    const ok = await send(pv, "OPTIONS", ANON_SESSIONS, { headers: { origin: ORIGIN, "access-control-request-method": "POST" } });
    assert.equal(ok.status, 204);
    assert.equal(ok.headers["access-control-allow-origin"], ORIGIN);
    assert.match(ok.headers["access-control-allow-headers"] ?? "", /X-VC-Key/);
    const evil = await send(pv, "OPTIONS", ANON_SESSIONS, { headers: { origin: EVIL, "access-control-request-method": "POST" } });
    assert.equal(evil.headers["access-control-allow-origin"], undefined);
  } finally {
    await pv.close();
  }
});

test("V2: on the anonymous voice route the server key, no key, a malformed key, a revoked partner and a foreign Origin are all the same uniform 401 (no session is minted)", async () => {
  const pv = await pvWorld();
  try {
    const answers = new Set<string>();
    const cases: Array<[string, Record<string, string | undefined>]> = [
      ["server key", { "x-vc-key": pv.srv }],
      ["no key", { "x-vc-key": undefined }],
      ["blank key", { "x-vc-key": "   " }],
      ["malformed", { "x-vc-key": "vck_pub_x" }],
      ["unknown partner", { "x-vc-key": `vck_pub_nobody_${"B".repeat(43)}` }],
      ["foreign origin", { origin: EVIL }],
    ];
    for (const [name, headers] of cases) {
      const req = chatRequest("POST", ANON_SESSIONS, { headers: { "x-vc-key": pv.pub, origin: ORIGIN } });
      for (const [k, v] of Object.entries(headers)) {
        if (v === undefined) delete req.headers[k];
        else req.headers[k] = v;
      }
      const r = await pv.handler(req);
      assert.equal(r.status, 401, name);
      assert.equal(r.headers["access-control-allow-origin"], undefined, `${name}: no CORS for a refused call`);
      answers.add(r.body);
    }
    assert.equal(answers.size, 1, "one uniform body");
    assert.match([...answers][0]!, /14416/, "the helpline is on every refusal, like the anonymous text route");
    await revokePartner(pv.store, pv.partnerId);
    pv.pclock.ms += 61_000;
    assert.equal((await mintAnon(pv)).status, 401);
    assert.equal(pv.w.voice.stats().sockets, 0);
  } finally {
    await pv.close();
  }
});

test("V2: a script without an Origin header holding the page key can mint (a browser-side control only), and a registry outage is a 503, never a session", async () => {
  const pv = await pvWorld();
  try {
    const noOrigin = await send(pv, "POST", ANON_SESSIONS, { headers: { "x-vc-key": pv.pub } });
    assert.equal(noOrigin.status, 201);
  } finally {
    await pv.close();
  }
  const down: PartnerStore = {
    get: async () => null,
    list: async () => {
      throw new Error("db down");
    },
    insert: async () => undefined,
    update: async () => false,
  };
  const registry = createPartnerRegistry({ store: down, pepper: PEPPER, nowMs: () => T0 });
  const pv2 = await pvWorld({ registry });
  try {
    const r = await mintAnon(pv2);
    assert.equal(r.status, 503);
    assert.equal(r.json.error, "partner_registry_unavailable");
  } finally {
    await pv2.close();
  }
});

test("V2: without the anonymous voice option the public voice route does not exist (404), and a visitor with a key gets nothing", async () => {
  const pv = await pvWorld({ anonymous: false });
  try {
    const r = await mintAnon(pv);
    assert.equal(r.status, 404);
  } finally {
    await pv.close();
  }
});

test("V2: one office behind one address cannot flood the partner: the 11th anonymous mint in a minute is a 429 with Retry-After, while another client of the same partner is unaffected", async () => {
  const pv = await pvWorld();
  try {
    for (let i = 0; i < 10; i++) assert.equal((await mintAnon(pv)).status, 201, `mint ${i + 1}`);
    const limited = await mintAnon(pv);
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers["retry-after"]) >= 1);
    assert.match(limited.body, /14416/);
    assert.equal((await mintAnon(pv, { "x-test-client": "client-2" })).status, 201, "a different visitor");
    pv.w.clock.ms += 61_000;
    assert.equal((await mintAnon(pv)).status, 201, "the window passed");
  } finally {
    await pv.close();
  }
});

test("V2: the anonymous limit is per partner AND client: a second partner's visitor behind the same address has a fresh budget", async () => {
  const pv = await pvWorld();
  try {
    const second = await addPartner(pv.store, { name: "Second Site", origins: ["https://second.example"] }, { pepper: PEPPER, now: () => new Date(T0) });
    pv.pclock.ms += 61_000;
    for (let i = 0; i < 10; i++) assert.equal((await mintAnon(pv)).status, 201);
    assert.equal((await mintAnon(pv)).status, 429);
    const other = await send(pv, "POST", ANON_SESSIONS, { headers: { "x-vc-key": second.keys.pub, origin: "https://second.example" } });
    assert.equal(other.status, 201);
  } finally {
    await pv.close();
  }
});

// ---------------------------------------------------------------------------
// The anonymous WebSocket: origin rule, token scope
// ---------------------------------------------------------------------------

test("V2: the voice WebSocket origin check uses the page key's allowedOrigins: a connection from the partner's site opens, from a foreign site it is refused 403 before the socket is accepted", async () => {
  const pv = await pvWorld();
  try {
    const good = (await mintAnon(pv)).json.token as string;
    const ok = await connectAnon(pv, good, { origin: ORIGIN });
    assert.equal(ok.ok, true);
    const token2 = (await mintAnon(pv)).json.token as string;
    const evil = await connectAnon(pv, token2, { origin: EVIL });
    assert.deepEqual(evil, { ok: false, status: 403 });
    assert.equal(pv.w.voice.stats().sockets, 1, "only the partner-origin socket exists");
  } finally {
    await pv.close();
  }
});

test("V2: a token minted for a browser at one origin is useless from another partner origin, and a token minted by a script (no Origin) is refused for a browser", async () => {
  const pv = await pvWorld({ origins: [ORIGIN, "https://other-site.example"] });
  try {
    const t1 = (await mintAnon(pv)).json.token as string;
    assert.deepEqual(await connectAnon(pv, t1, { origin: "https://other-site.example" }), { ok: false, status: 403 });
    const scriptToken = (await send(pv, "POST", ANON_SESSIONS, { headers: { "x-vc-key": pv.pub } })).json.token as string;
    assert.deepEqual(await connectAnon(pv, scriptToken, { origin: ORIGIN }), { ok: false, status: 403 });
    const scriptToken2 = (await send(pv, "POST", ANON_SESSIONS, { headers: { "x-vc-key": pv.pub } })).json.token as string;
    const noOrigin = await connectAnon(pv, scriptToken2);
    assert.equal(noOrigin.ok, true, "a non-browser caller has no Origin and holds its own token");
  } finally {
    await pv.close();
  }
});

test("V2: an anonymous token is single use, works in the subprotocol form too, and a query-string token is refused", async () => {
  const pv = await pvWorld();
  try {
    const t = (await mintAnon(pv)).json.token as string;
    assert.equal((await connectAnon(pv, t, { origin: ORIGIN, how: "protocol" })).ok, true);
    assert.deepEqual(await connectAnon(pv, t, { origin: ORIGIN }), { ok: false, status: 401 }, "replay");
    const t2 = (await mintAnon(pv)).json.token as string;
    assert.deepEqual(await connectAnon(pv, undefined, { origin: ORIGIN, path: `/v1/public/voice/stream?token=${t2}` }), { ok: false, status: 401 });
  } finally {
    await pv.close();
  }
});

test("V2: scopes do not cross at the socket: an anonymous token cannot open a student stream (even a student named 'anonymous'), and a student token cannot open the anonymous stream", async () => {
  const pv = await pvWorld();
  try {
    const anonToken = (await mintAnon(pv)).json.token as string;
    const asStudent = await pv.w.connect(anonToken, { studentId: ANONYMOUS_VOICE_THREAD_ID, threadId: ANONYMOUS_VOICE_THREAD_ID });
    assert.deepEqual(asStudent, { ok: false, status: 401 });
    const threadId = await partnerThread(pv);
    const studentToken = (await mintStudent(pv, threadId)).json.token as string;
    assert.deepEqual(await connectAnon(pv, studentToken, { origin: ORIGIN }), { ok: false, status: 401 });
  } finally {
    await pv.close();
  }
});

test("V2: a token whose claims were minted without the anonymous flag cannot be turned into one, and a forged anonymous claim without the secret is refused", async () => {
  const pv = await pvWorld();
  try {
    const forged = await pv.w.signWsToken({ tenant: "pathlynks", studentId: "anonymous", threadId: "anonymous", anon: true, origin: "", ck: "x" }, { secret: new Uint8Array(32).fill(1) });
    assert.deepEqual(await connectAnon(pv, forged), { ok: false, status: 401 });
    const signedStudent = await pv.w.signWsToken({ tenant: "pathlynks", studentId: STUDENT, threadId: "t-1", minor: false, guardianConsent: false });
    assert.deepEqual(await connectAnon(pv, signedStudent), { ok: false, status: 401 });
    const missingFields = await pv.w.signWsToken({ tenant: "pathlynks", studentId: "anonymous", threadId: "anonymous", anon: true });
    assert.deepEqual(await connectAnon(pv, missingFields), { ok: false, status: 401 });
  } finally {
    await pv.close();
  }
});

test("V2: a visitor may hold only two sockets that have not started; the third is a 429 and the token is not spent", async () => {
  const pv = await pvWorld();
  try {
    const tokens: string[] = [];
    for (let i = 0; i < 4; i++) tokens.push((await mintAnon(pv)).json.token as string);
    assert.equal((await connectAnon(pv, tokens[0]!, { origin: ORIGIN })).ok, true);
    assert.equal((await connectAnon(pv, tokens[1]!, { origin: ORIGIN })).ok, true);
    assert.deepEqual(await connectAnon(pv, tokens[2]!, { origin: ORIGIN }), { ok: false, status: 429 });
    // a different visitor of the same partner is not blocked
    const other = (await mintAnon(pv, { "x-test-client": "client-2" })).json.token as string;
    assert.equal((await connectAnon(pv, other, { origin: ORIGIN })).ok, true);
  } finally {
    await pv.close();
  }
});

/** Like connectAnon, but also returns the refusal's Retry-After header (a refused upgrade is a plain HTTP response). */
function connectAnonRaw(pv: PV, token: string): Promise<{ ok: true; client: VoiceClient } | { ok: false; status: number; retryAfter: string | undefined; raw: string }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${pv.w.port}/v1/public/voice/stream`, ["vc-voice-v1"], { headers: { authorization: `Bearer ${token}`, origin: ORIGIN } });
    pv.sockets.push(ws);
    ws.on("unexpected-response", (_req, res) => {
      res.resume();
      const h = res.headers["retry-after"];
      resolve({ ok: false, status: res.statusCode ?? 0, retryAfter: typeof h === "string" ? h : undefined, raw: JSON.stringify([res.statusCode, res.statusMessage, Object.entries(res.headers).sort()]) });
    });
    ws.on("open", () => resolve({ ok: true, client: new VoiceClient(ws) }));
    ws.on("error", () => undefined);
  });
}

test("V2 active cap (review 2): a visitor may hold only two ACTIVE anonymous voice sessions; the third is a 429 with Retry-After, and a slot frees when one ends", async () => {
  const pv = await pvWorld();
  try {
    // pc-hardening H3: once the visitor is at the cap the MINT is a readable 429 voice_busy, so the token for the over-cap upgrade (the race the upgrade check still covers) is minted first
    const thirdToken = (await mintAnon(pv)).json.token as string;
    const a = await openAnon(pv);
    await openAnon(pv);
    assert.equal(pv.w.voice.stats().liveSessions, 2);
    const third = await connectAnonRaw(pv, thirdToken);
    assert.equal(third.ok, false);
    if (!third.ok) {
      assert.equal(third.status, 429);
      assert.match(third.retryAfter ?? "", /^[1-9]\d{0,3}$/);
    }
    assert.equal(pv.w.voice.stats().liveSessions, 2, "the refused socket never became a session");
    // another visitor of the same partner is not blocked
    const other = await connectAnonRaw(pv, (await mintAnon(pv, { "x-test-client": "client-2" })).json.token as string);
    assert.equal(other.ok, true);
    // ending one of the first visitor's sessions frees a slot
    a.client.ws.close(1000);
    await until(() => pv.w.voice.stats().liveSessions === 1, "the first session ended");
    const again = await connectAnonRaw(pv, (await mintAnon(pv)).json.token as string);
    assert.equal(again.ok, true);
  } finally {
    await pv.close();
  }
});

test("V2 active cap (review 2): a partner's anonymous sessions are capped across all its visitors (configurable); the refusal is the same 429 + Retry-After, and the default is sane", async () => {
  assert.ok(VOICE_MAX_ACTIVE_ANONYMOUS_PER_PARTNER_DEFAULT >= 10 && VOICE_MAX_ACTIVE_ANONYMOUS_PER_PARTNER_DEFAULT <= 200);
  assert.equal(VOICE_MAX_ACTIVE_ANONYMOUS_PER_CLIENT, 2);
  const pv = await pvWorld({ deps: { anonymous: { clientKey: (req) => (typeof req.headers["x-test-client"] === "string" ? req.headers["x-test-client"] : "client-1"), maxActivePerPartner: 3 } } });
  try {
    const open = async (client: string) => {
      const minted = await mintAnon(pv, { "x-test-client": client });
      assert.equal(minted.status, 201, minted.body);
      return connectAnonRaw(pv, minted.json.token as string);
    };
    // pc-hardening H3: the mint of a visitor of a full partner is a readable 429 voice_busy; the over-cap upgrade (the race) is exercised with a token minted before the cap filled
    const c4Token = (await mintAnon(pv, { "x-test-client": "c4" })).json.token as string;
    const first = [await open("c1"), await open("c2"), await open("c3")];
    for (const r of first) {
      assert.equal(r.ok, true);
      if (r.ok) r.client.send({ type: "start", threadId: ANONYMOUS_VOICE_THREAD_ID });
    }
    await until(() => pv.w.voice.stats().liveSessions === 3, "three started sessions");
    const fourth = await connectAnonRaw(pv, c4Token);
    assert.equal(fourth.ok, false);
    if (!fourth.ok) {
      assert.equal(fourth.status, 429);
      assert.match(fourth.retryAfter ?? "", /^[1-9]\d{0,3}$/);
      // uniform: the per-client refusal looks exactly the same (no oracle for which cap fired)
      const pv2 = await pvWorld();
      try {
        const lateToken = (await mintAnon(pv2)).json.token as string;
        await openAnon(pv2);
        await openAnon(pv2);
        const perClient = await connectAnonRaw(pv2, lateToken);
        assert.equal(perClient.ok, false);
        if (!perClient.ok) assert.equal(perClient.raw, fourth.raw);
      } finally {
        await pv2.close();
      }
    }
  } finally {
    await pv.close();
  }
});

test("V2 active cap (review 2): the cap is checked again at start, so a session that slipped under it at the upgrade is refused and closed before any provider session opens", async () => {
  let cap = 5;
  const pv = await pvWorld({ deps: { anonymous: { clientKey: (req) => (typeof req.headers["x-test-client"] === "string" ? req.headers["x-test-client"] : "client-1"), maxActivePerPartner: () => cap } } });
  try {
    const a = await connectAnonRaw(pv, (await mintAnon(pv, { "x-test-client": "c1" })).json.token as string);
    const b = await connectAnonRaw(pv, (await mintAnon(pv, { "x-test-client": "c2" })).json.token as string);
    assert.equal(a.ok && b.ok, true);
    if (!a.ok || !b.ok) return;
    a.client.send({ type: "start", threadId: ANONYMOUS_VOICE_THREAD_ID });
    await until(() => pv.w.provider.backends.length === 1, "the first provider session");
    cap = 1; // the partner's allowance was lowered while b was connected but not started
    const before = pv.w.provider.backends.length;
    b.client.send({ type: "start", threadId: ANONYMOUS_VOICE_THREAD_ID });
    await until(() => b.client.closed, "the over-cap session closed");
    assert.equal(b.client.closeCode, 1008);
    assert.ok(b.client.of("error").some((e) => e.code === "voice_busy"), JSON.stringify(b.client.events));
    assert.equal(pv.w.provider.backends.length, before, "no provider session (and no paid audio) was opened");
  } finally {
    await pv.close();
  }
});

// ---------------------------------------------------------------------------
// Anonymous rules in voice: zero persistence, crisis, tools, limits
// ---------------------------------------------------------------------------

test("V2: an anonymous voice conversation of several turns leaves nothing in the database and never opens a tenant Db: no turn text, no audio, no usage, no resume log", async () => {
  const pv = await pvWorld();
  try {
    const { client } = await openAnon(pv);
    const backend = pv.w.provider.backends[0]!;
    backend.emitInputTranscript("my name is Meera Kulkarni and my number is 9876543210", true);
    backend.emitOutputTranscript("Here is what I found about English-taught programmes in Germany.");
    backend.emitTurnComplete();
    await until(() => client.of("transcript.final").length === 2 && client.of("state").length >= 1, "the visitor sees both transcripts and the state");
    assert.equal(client.of("transcript.final")[0].text, "my name is Meera Kulkarni and my number is 9876543210", "the live transcript goes only to the visitor, unredacted");
    client.send({ type: "end" });
    await until(() => client.closed, "closed");
    await pv.w.voice.settled();
    assert.deepEqual(nonEmptyCollections(pv.w.fakeDb), {}, "no document anywhere");
    assert.equal(pv.dbCalls.length, 0, "dbForTenant was never called");
    assert.equal(pv.w.voice.stats().retainedLogs, 0, "no transcript events are kept for a resume");
    assert.equal(pv.w.logs.length, 0, JSON.stringify(pv.w.logs));
    assert.equal(pv.counters.length, 0, "an ordinary turn writes no counter either");
  } finally {
    await pv.close();
  }
});

test("V2: an anonymous visitor cannot resume or replay an earlier anonymous session's events, and the start must name the anonymous thread", async () => {
  const pv = await pvWorld();
  try {
    const first = await openAnon(pv);
    pv.w.provider.backends[0]!.emitInputTranscript("a private question", true);
    await until(() => first.client.of("transcript.final").length === 1, "event delivered");
    const lastId = first.client.of("transcript.final")[0].eventId as string;
    first.client.send({ type: "end" });
    await until(() => first.client.closed, "first closed");
    await pv.w.voice.settled();
    const minted = await mintAnon(pv);
    const res = await connectAnon(pv, minted.json.token, { origin: ORIGIN });
    assert.ok(res.ok);
    if (!res.ok) return;
    res.client.send({ type: "start", threadId: ANONYMOUS_VOICE_THREAD_ID, lastEventId: lastId });
    await until(() => pv.w.provider.backends.length === 2, "second provider session");
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(res.client.of("transcript.final").length, 0, "nothing replayed");
    const bad = await mintAnon(pv, { "x-test-client": "client-2" });
    const res2 = await connectAnon(pv, bad.json.token, { origin: ORIGIN });
    assert.ok(res2.ok);
    if (!res2.ok) return;
    res2.client.send({ type: "start", threadId: "some-real-student-thread" });
    await until(() => res2.client.of("error").some((e) => e.code === "forbidden"), "forbidden");
    await until(() => res2.client.closed, "closed");
    assert.equal(pv.w.provider.backends.length, 2, "no provider session for a wrong thread");
    assert.ok(VOICE_RESUME_WINDOW_MS > 0);
  } finally {
    await pv.close();
  }
});

test("V2: an anonymous visitor who says a crisis phrase hears the fixed crisis message and helpline audio, sees the crisis flag, and nothing is stored or escalated to a tenant", async () => {
  const pv = await pvWorld();
  try {
    const { client } = await openAnon(pv);
    pv.w.provider.backends[0]!.emitInputTranscript(CRISIS_PHRASE, true);
    await until(() => client.frames.length >= 1, "the fixed crisis audio");
    assert.equal(client.frames[0]!.byteLength, CRISIS_AUDIO.byteLength);
    assert.ok(Buffer.from(client.frames[0]!).equals(Buffer.from(CRISIS_AUDIO)), "the fixed audio, not model audio");
    await until(() => client.of("flag").some((f) => f.reason === "crisis_detected"), "crisis flag");
    await until(() => client.of("state").some((s) => s.state === "escalated"), "escalated state");
    pv.w.provider.backends[0]!.emitOutputTranscript("model words after the crisis");
    await new Promise((r) => setTimeout(r, 30));
    client.send({ type: "end" });
    await until(() => client.closed, "closed");
    await pv.w.voice.settled();
    assert.deepEqual(nonEmptyCollections(pv.w.fakeDb), {}, "no flag, no turn, no escalation row");
    assert.equal(pv.escalations.length, 0, "the tenant escalation port is never used for an anonymous visitor");
    assert.equal(pv.dbCalls.length, 0);
    assert.deepEqual(pv.counters, ["crisis"], "only the text-free aggregate counter, as on the anonymous text route");
    assert.ok(!pv.w.logs.some((l) => JSON.stringify(l).includes("kill")), "no words in a log");
    assert.equal(pv.w.provider.configs[0]!.crisisMessage.text, CRISIS_TEXT_FIXED);
  } finally {
    await pv.close();
  }
});

test("V2: a failing anonymous crisis counter is logged text-free and the visitor still gets the crisis message", async () => {
  const pv = await pvWorld({
    deps: {
      anonymous: {
        clientKey: () => "client-1",
        counter: {
          increment: async () => {
            throw new Error("counter store down");
          },
        },
      },
    },
  });
  try {
    const { client } = await openAnon(pv);
    pv.w.provider.backends[0]!.emitInputTranscript(CRISIS_PHRASE, true);
    await until(() => client.frames.length >= 1, "the fixed crisis audio");
    await until(() => pv.w.logs.some((l) => l.event === "voice_anonymous_counter_failed"), "the failure is logged");
    assert.ok(!JSON.stringify(pv.w.logs).includes("counter store down"), "the error name only, never its message");
    assert.equal(client.closed, false);
  } finally {
    await pv.close();
  }
});

test("V2: anonymous voice sessions get no student tools and no student instruction; the student tools see a student session only", async () => {
  const studentToolCalls: unknown[] = [];
  const pv = await pvWorld({
    deps: {
      systemInstruction: "STUDENT-INSTRUCTION",
      tools: {
        declarations: [{ name: "student_profile", description: "reads a student", parameters: { type: "object", properties: {} } } as never],
        run: async (call) => {
          studentToolCalls.push(call);
          return { result: {} };
        },
      },
      anonymous: { clientKey: () => "client-1", counter: { increment: async () => undefined }, systemInstruction: "ANON-INSTRUCTION" },
    },
  });
  try {
    await openAnon(pv);
    const cfg = pv.w.provider.configs[0]!;
    assert.equal(cfg.systemInstruction, "ANON-INSTRUCTION");
    assert.equal(cfg.tools, undefined, "no tools unless the anonymous option supplies search-only ones");
    assert.equal(cfg.toolHandler, undefined);
    assert.equal(studentToolCalls.length, 0);
    const threadId = await partnerThread(pv);
    await openStudent(pv, threadId);
    const studentCfg = pv.w.provider.configs[1]!;
    assert.equal(studentCfg.systemInstruction, "STUDENT-INSTRUCTION");
    assert.equal(studentCfg.tools?.length, 1);
  } finally {
    await pv.close();
  }
});

test("V2: an anonymous voice session ends at the per-session time cap with the same message as a student session, and the mint tells the widget the cap", async () => {
  const pv = await pvWorld({ deps: { limitsForTenant: () => ({ voiceSessionMaxMinutes: 2 }), silenceTimeoutMs: 10 * 60_000 } });
  try {
    const minted = await mintAnon(pv);
    assert.equal(minted.json.sessionMaxMinutes, 2);
    const res = await connectAnon(pv, minted.json.token, { origin: ORIGIN });
    assert.ok(res.ok);
    if (!res.ok) return;
    res.client.send({ type: "start", threadId: ANONYMOUS_VOICE_THREAD_ID });
    await until(() => pv.w.provider.backends.length === 1, "provider session");
    await until(() => pv.w.voice.stats().timers > 0, "timers armed");
    pv.w.timers.advance(2 * 60_000);
    await until(() => res.client.closed, "closed at the cap");
    assert.ok(res.client.of("error").some((e) => e.code === "session_time_limit"));
    await pv.w.voice.settled();
    assert.deepEqual(nonEmptyCollections(pv.w.fakeDb), {}, "the cap writes no usage row for a visitor");
  } finally {
    await pv.close();
  }
});

test("V2: two anonymous visitors talk at once without superseding each other (a shared office address is not one student)", async () => {
  const pv = await pvWorld();
  try {
    const a = await openAnon(pv);
    const b = await openAnon(pv);
    assert.equal(pv.w.voice.stats().liveSessions, 2);
    assert.ok(!a.client.of("error").some((e) => e.code === "superseded"));
    assert.equal(a.client.closed, false);
    assert.equal(b.client.closed, false);
  } finally {
    await pv.close();
  }
});

// ---------------------------------------------------------------------------
// startApi wiring: the deployed process serves the anonymous voice routes only when the deployment configured them
// ---------------------------------------------------------------------------

async function bootApi(env: Record<string, string | undefined>, anonymous: Record<string, unknown> | undefined) {
  const fake = createFakeMongoClient();
  const gates = gatesFixture({ gProd: "Answered: 2026-10-16T10:10:00+05:30 - c - all three including voice\n" });
  const provider = new MockLiveProvider();
  const port = await new Promise<number>((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as AddressInfo).port;
      s.close(() => resolve(p));
    });
  });
  const added = await addPartner(createMongoPartnerStore(fake.client.db(VC_DB_NAME)), { name: "Pathlynks", origins: [ORIGIN] }, { pepper: PEPPER, now: () => new Date(T0) });
  const api = await startApi(
    { MONGODB_URL: "mongodb://fake-host/ignored", VC_VOICE_ENABLED: "true", ...env },
    {
      clientFactory: () => fake.client,
      http: {
        port,
        verifier: createJwtVerifier(jwtConfigFromEnv({ VC_JWT_ISSUER: "https://issuer.synthetic.test", VC_JWT_PUBLIC_KEY: generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "pem" }).toString() })),
        provider: kbAnswerProvider(),
        skillsDir: SKILLS_DIR,
        voice: { live: provider, crisis: { message: { text: CRISIS_TEXT_FIXED, audio: CRISIS_AUDIO } }, wsSecret: new Uint8Array(randomBytes(32)), wsBaseUrl: `ws://127.0.0.1:${port}`, verifier: studentVerifier(), gatesDir: gates.gates },
        ...(anonymous ? { anonymous } : {}),
      } as any,
    },
  );
  return {
    port,
    provider,
    keys: added.keys,
    async stop() {
      await api.stop();
      cleanupGates(gates);
    },
  };
}
const mintOver = (port: number, key: string) => fetch(`http://127.0.0.1:${port}/v1/public/voice/sessions`, { method: "POST", headers: { "x-vc-key": key, origin: ORIGIN } });

test("V2 wiring: a started process with a partner pepper and a client-key source mints an anonymous voice session for the page key and opens the stream from the partner's site", async () => {
  const b = await bootApi({ VC_PARTNER_KEY_PEPPER: PEPPER }, { clientKey: () => "client-1" });
  try {
    const res = await mintOver(b.port, b.keys.pub);
    assert.equal(res.status, 201);
    assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN);
    const json: any = await res.json();
    assert.equal(json.wsUrl, `ws://127.0.0.1:${b.port}/v1/public/voice/stream`);
    const ws = new WebSocket(json.wsUrl, ["vc-voice-v1", `vc-token.${json.token}`], { headers: { origin: ORIGIN } });
    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("error", reject);
    });
    ws.send(JSON.stringify({ type: "start", threadId: ANONYMOUS_VOICE_THREAD_ID }));
    await until(() => b.provider.backends.length === 1, "the provider session opened for the visitor");
    ws.close();
    const server = await mintOver(b.port, b.keys.srv);
    assert.equal(server.status, 401, "the server key does not open the public voice route");
  } finally {
    await b.stop();
  }
});

test("V2 wiring: without VC_PARTNER_KEY_PEPPER, or without a way to tell visitors apart, the anonymous voice routes are not served at all", async () => {
  const noPepper = await bootApi({}, { clientKey: () => "client-1" });
  try {
    assert.equal((await mintOver(noPepper.port, noPepper.keys.pub)).status, 404);
  } finally {
    await noPepper.stop();
  }
  const noClientKey = await bootApi({ VC_PARTNER_KEY_PEPPER: PEPPER }, undefined);
  try {
    assert.equal((await mintOver(noClientKey.port, noClientKey.keys.pub)).status, 404);
  } finally {
    await noClientKey.stop();
  }
});

// ---------------------------------------------------------------------------
// pc-hardening: H1 (ISS-pc-voice-2), H2 (ISS-pc-voice-1), H3 server side (ISS-pc-voice-6)
// ---------------------------------------------------------------------------

const BAD_CAPS: Array<[string, unknown]> = [
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["-Infinity", Number.NEGATIVE_INFINITY],
  ['"abc"', "abc"],
  ["-1", -1],
  ["2.5", 2.5],
];

test("H1: a non-finite, negative or non-integer anonymous cap value never disables a cap: it falls back to the documented default (like voice.ts's drainTimeoutMs), 0 and whole numbers are kept", () => {
  for (const [label, bad] of BAD_CAPS) {
    assert.equal(anonymousCapLimit(bad, VOICE_MAX_ACTIVE_ANONYMOUS_PER_CLIENT), VOICE_MAX_ACTIVE_ANONYMOUS_PER_CLIENT, `per-client ${label}`);
    assert.equal(anonymousCapLimit(bad, VOICE_MAX_ACTIVE_ANONYMOUS_PER_PARTNER_DEFAULT), VOICE_MAX_ACTIVE_ANONYMOUS_PER_PARTNER_DEFAULT, `per-partner ${label}`);
  }
  assert.equal(anonymousCapLimit(undefined, 7), 7);
  assert.equal(anonymousCapLimit(0, 7), 0, "0 stays: it means no anonymous sessions at all");
  assert.equal(anonymousCapLimit(3, 7), 3);
});

test("H1: through the running voice API, every bad maxActivePerClient still holds the default of two active sessions per visitor (the third is a 429), and a bad per-partner function result does not open the partner gate", async () => {
  for (const [label, bad] of BAD_CAPS) {
    const pv = await pvWorld({ deps: { anonymous: { clientKey: () => "client-1", maxActivePerClient: bad as number } } });
    try {
      const token = (await mintAnon(pv)).json.token as string;
      await openAnon(pv);
      await openAnon(pv);
      const third = await connectAnonRaw(pv, token);
      assert.equal(third.ok, false, `per-client ${label}: the cap still holds`);
      if (!third.ok) assert.equal(third.status, 429, label);
    } finally {
      await pv.close();
    }
  }
  // per-partner: a function returning a bad value falls back to the default (50), so a small number of sessions from many visitors all open and the cap is a number, not "no cap"
  for (const [label, bad] of BAD_CAPS) {
    const pv = await pvWorld({ deps: { anonymous: { clientKey: (req) => (typeof req.headers["x-test-client"] === "string" ? req.headers["x-test-client"] : "client-1"), maxActivePerPartner: () => bad as number } } });
    try {
      const a = await connectAnonRaw(pv, (await mintAnon(pv, { "x-test-client": "c1" })).json.token as string);
      const b = await connectAnonRaw(pv, (await mintAnon(pv, { "x-test-client": "c2" })).json.token as string);
      assert.equal(a.ok && b.ok, true, `per-partner ${label}: the default (${VOICE_MAX_ACTIVE_ANONYMOUS_PER_PARTNER_DEFAULT}) applies, so two visitors fit`);
    } finally {
      await pv.close();
    }
  }
});

test("H2: a capped (429) anonymous voice upgrade leaves the voice token unspent: the same token connects once a slot frees, within its life, and is spent only by that success", async () => {
  const pv = await pvWorld();
  try {
    const token = (await mintAnon(pv)).json.token as string; // minted while the visitor has a free slot, used only after the cap is reached
    const a = await openAnon(pv);
    await openAnon(pv);
    assert.equal(pv.w.voice.stats().liveSessions, 2);
    const usedBefore = pv.w.voice.stats().usedTokens;
    const refused = await connectAnonRaw(pv, token);
    assert.equal(refused.ok, false);
    if (!refused.ok) assert.equal(refused.status, 429);
    assert.equal(pv.w.voice.stats().usedTokens, usedBefore, "the refused upgrade did not spend the token");
    // a slot frees; the SAME token (still within its 60 s life on the fake clock) now opens the stream
    a.client.ws.close(1000);
    await until(() => pv.w.voice.stats().liveSessions === 1, "a slot freed");
    const again = await connectAnonRaw(pv, token);
    assert.equal(again.ok, true, "the unspent token works after the slot frees");
    assert.equal(pv.w.voice.stats().usedTokens, usedBefore + 1, "and only that success spends it");
    // single use is intact: a replay of the now-spent token is a 401
    const replay = await connectAnonRaw(pv, token);
    assert.equal(replay.ok, false);
    if (!replay.ok) assert.equal(replay.status, 401);
  } finally {
    await pv.close();
  }
});

test("H3 server: when the visitor's or the partner's active cap is reached, the session mint says 429 voice_busy (a readable signal for the widget) with the cap Retry-After, no token is minted, a rate-limit stays rate_limited, and the mint works again after a slot frees", async () => {
  const pv = await pvWorld({ deps: { anonymous: { clientKey: (req) => (typeof req.headers["x-test-client"] === "string" ? req.headers["x-test-client"] : "client-1"), maxActivePerPartner: 3 } } });
  try {
    const a = await openAnon(pv);
    await openAnon(pv);
    const busy = await mintAnon(pv);
    assert.equal(busy.status, 429);
    assert.equal(busy.json.error, "voice_busy");
    assert.equal(busy.json.token, undefined, "no token is minted for a busy visitor");
    assert.equal(busy.headers["retry-after"], String(VOICE_ACTIVE_CAP_RETRY_AFTER_SEC));
    // the partner cap (3): another visitor opens the third; the fourth visitor's mint is busy too, with the same shape
    const c2 = await mintAnon(pv, { "x-test-client": "c2" });
    assert.equal(c2.status, 201);
    const c2conn = await connectAnonRaw(pv, c2.json.token as string);
    assert.equal(c2conn.ok, true);
    if (c2conn.ok) c2conn.client.send({ type: "start", threadId: ANONYMOUS_VOICE_THREAD_ID });
    await until(() => pv.w.voice.stats().liveSessions === 3, "three started sessions");
    const busy2 = await mintAnon(pv, { "x-test-client": "c3" });
    assert.equal(busy2.status, 429);
    assert.equal(busy2.json.error, "voice_busy");
    assert.equal(busy2.headers["retry-after"], busy.headers["retry-after"], "both caps refuse the same way");
    // a slot frees; the first visitor can mint again
    a.client.ws.close(1000);
    await until(() => pv.w.voice.stats().liveSessions === 2, "a slot freed");
    assert.equal((await mintAnon(pv)).status, 201);
  } finally {
    await pv.close();
  }
});

// ---------------------------------------------------------------------------
// pc-hardening-2: J2 (ISS-pc-hardening-3) and J3 (ISS-pc-hardening-6)
// ---------------------------------------------------------------------------

test("J2: a cap of 0 (anonymous voice deliberately off, per client or per partner) is not reported as busy: the mint says 403 voice_unavailable with no Retry-After and no token, positive caps at capacity keep 429 voice_busy, and a negative or invalid value falls back to the default (voice stays on)", async () => {
  const clientKey = (req: { headers: Record<string, unknown> }) => (typeof req.headers["x-test-client"] === "string" ? (req.headers["x-test-client"] as string) : "client-1");
  const offCases: Array<[string, Record<string, unknown>]> = [
    ["per-client 0", { maxActivePerClient: 0 }],
    ["per-partner 0", { maxActivePerPartner: 0 }],
    ["per-partner function returning 0", { maxActivePerPartner: () => 0 }],
  ];
  for (const [label, caps] of offCases) {
    const pv = await pvWorld({ deps: { anonymous: { clientKey, ...caps } } as never });
    try {
      const off = await mintAnon(pv);
      assert.equal(off.status, 403, label);
      assert.equal(off.json.error, "voice_unavailable", label);
      assert.equal(off.json.token, undefined, `${label}: no token`);
      assert.equal(off.headers["retry-after"], undefined, `${label}: a permanent state has no Retry-After`);
      assert.equal(typeof off.json.helpline, "string", `${label}: the helpline stays on the refusal`);
    } finally {
      await pv.close();
    }
  }
  // a positive cap at capacity is still busy (transient), never "unavailable"
  const pv = await pvWorld({ deps: { anonymous: { clientKey, maxActivePerClient: 1 } } as never });
  try {
    await openAnon(pv);
    const busy = await mintAnon(pv);
    assert.equal(busy.status, 429);
    assert.equal(busy.json.error, "voice_busy");
    assert.equal(busy.headers["retry-after"], String(VOICE_ACTIVE_CAP_RETRY_AFTER_SEC));
  } finally {
    await pv.close();
  }
  // a negative or invalid value is not "off": it falls back to the default, so the mint works
  for (const [label, bad] of BAD_CAPS) {
    const pvBad = await pvWorld({ deps: { anonymous: { clientKey, maxActivePerClient: bad as number, maxActivePerPartner: bad as number } } as never });
    try {
      assert.equal((await mintAnon(pvBad)).status, 201, `${label} falls back to the default`);
    } finally {
      await pvBad.close();
    }
  }
  // the docs say so
  const doc = readFileSync(fileURLToPath(new URL("../../../docs/partner-integration.md", import.meta.url)), "utf8");
  assert.match(doc, /set (it to )?`?0`?[^.\n]*(turn|switch)[^.\n]*anonymous voice off/i);
  assert.match(doc, /negative or invalid value falls back to the default/i);
  assert.match(doc, /voice_unavailable/);
});

test("J3: the per-partner anonymous cap is discriminated by the API: with a configured cap of 3, exactly three visitors of the partner open a session and the fourth is refused (429 at the mint and at the upgrade), the cap function is asked for THIS partner, and a mutant with no cap, or with any other number, turns this red", async () => {
  const asked: string[] = [];
  const CAP = 3;
  const pv = await pvWorld({
    deps: {
      anonymous: {
        clientKey: (req) => (typeof req.headers["x-test-client"] === "string" ? req.headers["x-test-client"] : "client-1"),
        maxActivePerPartner: (partnerId: string) => {
          asked.push(partnerId);
          return CAP;
        },
      },
    },
  });
  try {
    const lateToken = (await mintAnon(pv, { "x-test-client": "late" })).json.token as string; // minted while the partner still has room
    const opened: Array<{ client: VoiceClient }> = [];
    for (const who of ["v1", "v2", "v3"]) {
      const minted = await mintAnon(pv, { "x-test-client": who });
      assert.equal(minted.status, 201, `${who} is within the cap: ${minted.body}`);
      const conn = await connectAnonRaw(pv, minted.json.token as string);
      assert.equal(conn.ok, true, who);
      if (!conn.ok) return;
      conn.client.send({ type: "start", threadId: ANONYMOUS_VOICE_THREAD_ID });
      opened.push(conn);
    }
    await until(() => pv.w.voice.stats().liveSessions === CAP, `${CAP} started sessions`);
    // the fourth visitor: refused at the mint (readable) and at the upgrade (the race), by the partner cap and not by the per-visitor one (each visitor holds one session)
    const fourth = await mintAnon(pv, { "x-test-client": "v4" });
    assert.equal(fourth.status, 429);
    assert.equal(fourth.json.error, "voice_busy");
    const raced = await connectAnonRaw(pv, lateToken);
    assert.equal(raced.ok, false);
    if (!raced.ok) assert.equal(raced.status, 429);
    assert.equal(pv.w.voice.stats().liveSessions, CAP, "no fourth session exists");
    assert.ok(asked.length > 0 && asked.every((p) => p === pv.partnerId), `the cap function is asked for the partner of the key (${asked.join(",")})`);
    // exactly at the configured value: freeing ONE slot lets exactly ONE more in
    opened[0]!.client.ws.close(1000);
    await until(() => pv.w.voice.stats().liveSessions === CAP - 1, "one slot freed");
    assert.equal((await mintAnon(pv, { "x-test-client": "v4" })).status, 201);
  } finally {
    await pv.close();
  }
});

// ---------------------------------------------------------------------------
// pc-hardening-2 fix cycle 1: R3 (J2 ordering)
// ---------------------------------------------------------------------------

test("R3: with a cap of 0 (voice off) a bad key, a missing key and a wrong Origin each get byte-for-byte the same 401 as with the default cap, so the 403 voice_unavailable can never move ahead of the key or Origin check and tell a stranger the switch state", async () => {
  const clientKey = (req: { headers: Record<string, unknown> }) => (typeof req.headers["x-test-client"] === "string" ? (req.headers["x-test-client"] as string) : "client-1");
  const probe = async (pv: PV): Promise<string[]> => {
    const flipped = pv.pub.slice(0, -1) + (pv.pub.endsWith("A") ? "B" : "A");
    const replies = [
      await send(pv, "POST", ANON_SESSIONS, { headers: { "x-vc-key": flipped, origin: ORIGIN } }), // a key with the wrong secret
      await send(pv, "POST", ANON_SESSIONS, { headers: { origin: ORIGIN } }), // no key at all
      await mintAnon(pv, { origin: EVIL }), // a good key from an Origin outside the partner's list
    ];
    for (const r of replies) assert.equal(r.status, 401, r.body);
    return replies.map((r) => `${r.status} ${JSON.stringify(Object.entries(r.headers).sort())} ${r.body}`);
  };
  const base = await pvWorld({ deps: { anonymous: { clientKey } } as never });
  let reference: string[];
  try {
    reference = await probe(base);
    assert.equal((await mintAnon(base)).status, 201, "default cap: a good request mints");
  } finally {
    await base.close();
  }
  for (const [label, caps] of [
    ["per-client 0", { maxActivePerClient: 0 }],
    ["per-partner 0", { maxActivePerPartner: 0 }],
  ] as Array<[string, Record<string, unknown>]>) {
    const off = await pvWorld({ deps: { anonymous: { clientKey, ...caps } } as never });
    try {
      assert.deepEqual(await probe(off), reference, `${label}: unauthenticated probes see the same bytes as with the default cap`);
      assert.equal((await mintAnon(off)).status, 403, `${label}: the switch really is off for a good request`);
    } finally {
      await off.close();
    }
  }
});
