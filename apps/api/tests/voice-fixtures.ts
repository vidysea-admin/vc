/**
 * P1 U10 shared SYNTHETIC fixtures for the voice WebSocket tests (not a test file: `tsx --test tests/*.test.ts` skips it).
 * Real node:http server on a loopback port 0 + the `ws` client, MockLiveProvider (no network, no audio, no paid call), the in-memory
 * fake Db, fake timers tied to one fake clock. All keys, tokens, students and text are invented (B13).
 */
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { SignJWT } from "jose";
import { WebSocket } from "ws";
import { MockLiveProvider, type LiveProvider } from "@vc/providers";
import { tenantScopedDb } from "@vc/db";
import { ANONYMOUS_CRISIS_MESSAGE, STUDENT_CRISIS_MESSAGE } from "@vc/engine";
import { createFakeDb, type FakeDb } from "@vc/db/testing";
import { withChatRoutes } from "../src/chat.js";
import { createVoiceApi, withVoiceRoutes, VOICE_WS_AUDIENCE, VOICE_WS_ISSUER, type VoiceApi, type VoiceApiDeps, type VoiceLogLine } from "../src/voice.js";
import { createApiServer, type ApiHandler } from "../src/server.js";
import {
  APPROVER,
  NOW,
  adult,
  call,
  chatWorld,
  cleanupGates,
  gatesFixture,
  newThread,
  studentToken,
  studentVerifier,
  turnsPath,
  type ChatWorld,
  type Json,
} from "./chat-fixtures.js";

export { adult, call, cleanupGates, gatesFixture, newThread, studentToken, turnsPath };
export const minorNoConsent = (studentId = "stu-1", tenant = "tenant-a") => ({ tenant, studentId, role: "student", isMinor: true });
export const minorConsent = (studentId = "stu-1", tenant = "tenant-a") => ({ tenant, studentId, role: "student", isMinor: true, guardianConsent: true });

/** voice-crisis-same-as-chat: the voice crisis message IS the chat one (one engine constant). There is no crisis audio. */
export const CRISIS_TEXT_FIXED = STUDENT_CRISIS_MESSAGE;
export const CRISIS_TEXT_ANONYMOUS = ANONYMOUS_CRISIS_MESSAGE;
export const CRISIS_PHRASE = "I want to kill myself";
export const SPEAKER_NAME = "Arjun Mehrotra";

export class FakeTimers {
  private items = new Map<number, { at: number; fn: () => void }>();
  private next = 1;
  constructor(private readonly clock: { ms: number }) {}
  setTimeout = (fn: () => void, ms: number): unknown => {
    const id = this.next++;
    this.items.set(id, { at: this.clock.ms + ms, fn });
    return id;
  };
  clearTimeout = (h: unknown): void => {
    this.items.delete(h as number);
  };
  get pending(): number {
    return this.items.size;
  }
  /** Moves the clock forward, firing due timers in time order. */
  advance(ms: number): void {
    const target = this.clock.ms + ms;
    for (;;) {
      let best: { id: number; at: number; fn: () => void } | undefined;
      for (const [id, it] of this.items) if (it.at <= target && (!best || it.at < best.at)) best = { id, ...it };
      if (!best) break;
      this.items.delete(best.id);
      this.clock.ms = Math.max(this.clock.ms, best.at);
      best.fn();
    }
    this.clock.ms = target;
  }
}

export async function until(fn: () => boolean, what: string, ms = 4000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 4));
  }
}

export class VoiceClient {
  events: any[] = [];
  frames: Buffer[] = [];
  closeCode: number | undefined;
  constructor(readonly ws: WebSocket) {
    ws.on("message", (data, isBinary) => {
      if (isBinary) this.frames.push(Buffer.from(data as Buffer));
      else this.events.push(JSON.parse((data as Buffer).toString("utf8")));
    });
    ws.on("close", (code) => {
      this.closeCode = code;
    });
    ws.on("error", () => undefined);
  }
  send(o: unknown): void {
    this.ws.send(JSON.stringify(o));
  }
  sendRaw(s: string): void {
    this.ws.send(s);
  }
  sendAudio(bytes = 640): void {
    this.ws.send(Buffer.alloc(bytes, 1), { binary: true });
  }
  of(type: string): any[] {
    return this.events.filter((e) => e.type === type);
  }
  get closed(): boolean {
    return this.closeCode !== undefined;
  }
  abort(): void {
    this.ws.terminate();
  }
}

export type ConnectResult = { ok: true; client: VoiceClient } | { ok: false; status: number };

export interface VoiceWorld {
  fakeDb: FakeDb;
  rawDb: ReturnType<typeof createFakeDb>["db"];
  /** The composed handler (voice outside chat), for direct calls. */
  handler: ApiHandler;
  chat: ChatWorld;
  voice: VoiceApi;
  server: Server;
  port: number;
  provider: MockLiveProvider;
  timers: FakeTimers;
  /** The resume-log prune timer source (separate from `timers`, so the per-connection timer count is unchanged). */
  pruneTimers: FakeTimers;
  clock: { ms: number };
  logs: VoiceLogLine[];
  wsSecret: Uint8Array;
  deps: VoiceApiDeps;
  /** POST the session route with a student JWT built from `claims`; returns the response. */
  session(claims: Record<string, unknown>, threadId: string, studentId?: string): Promise<Json>;
  /** Mints a WebSocket token (asserts 201) and returns it. */
  mint(claims: Record<string, unknown>, threadId: string, studentId?: string): Promise<string>;
  /** Opens the WebSocket for `token` (default: header). The client is tracked and aborted at cleanup. */
  connect(token: string | undefined, opts?: { how?: "header" | "protocol" | "query"; studentId?: string; threadId: string; origin?: string }): Promise<ConnectResult>;
  /** mint + connect + send `start` + wait for the provider session. */
  open(claims: Record<string, unknown>, threadId: string, extra?: { studentId?: string; lastEventId?: string }): Promise<{ client: VoiceClient; token: string; sid: string; backendIndex: number }>;
  signWsToken(claims: Record<string, unknown>, over?: { aud?: string; iss?: string; secret?: Uint8Array; expSec?: number; jti?: string; alg?: "HS256" }): Promise<string>;
  cleanup(): Promise<void>;
}

export interface VoiceWorldOptions {
  deps?: Partial<VoiceApiDeps>;
  live?: LiveProvider;
  gProd?: string;
  /** Shared Db across two worlds is not needed; one world = one fake Db. */
}

export async function voiceWorld(opts: VoiceWorldOptions = {}): Promise<VoiceWorld> {
  const { db, fakeDb } = createFakeDb();
  const clock = { ms: Date.parse("2026-11-01T10:00:00.000Z") };
  const timers = new FakeTimers(clock);
  const pruneTimers = new FakeTimers(clock);
  const logs: VoiceLogLine[] = [];
  const gates = gatesFixture({ gProd: opts.gProd ?? "Answered: 2026-10-16T10:10:00+05:30 - c - all three including voice\n" });
  const provider = new MockLiveProvider();
  const wsSecret = new Uint8Array(randomBytes(32));
  // The chat world shares the SAME fake Db, so text turns and voice turns land in one store.
  const chat = chatWorld({ deps: { dbForTenant: (tenantId: string) => tenantScopedDb(db, tenantId), now: () => new Date(clock.ms), nowMs: () => clock.ms } });
  let voice!: VoiceApi;
  const mainStub: ApiHandler = async () => ({ status: 404, headers: {}, body: "{}" });
  const handler: ApiHandler = withVoiceRoutes(withChatRoutes(mainStub, chat.handler), (req) => voice.handler(req));
  const server = createApiServer(handler, { onUpgrade: (req, socket, head) => voice.upgrade(req, socket, head) });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const deps: VoiceApiDeps = {
    verifier: studentVerifier(),
    dbForTenant: (tenantId) => tenantScopedDb(db, tenantId),
    live: opts.live ?? provider,
    wsSecret,
    wsBaseUrl: `ws://127.0.0.1:${port}`,
    crisis: {},
    speakers: chat.deps.speakers,
    now: () => new Date(clock.ms),
    nowMs: () => clock.ms,
    timers,
    pruneTimers,
    log: (line) => logs.push(line),
    memoryPolicyForTenant: async () => ({ shortTermEnabled: true, longTermEnabled: true, learningEnabled: true, contextMessages: 12, maxFacts: 20 }),
    ...opts.deps,
  };
  const built = createVoiceApi(deps, { enabled: true, gatesDir: gates.gates, now: NOW, approver: APPROVER, env: {} });
  if (!built) throw new Error("voice api not built");
  voice = built;

  const clients: VoiceClient[] = [];
  const sessionPath = (studentId: string, threadId: string) => `/v1/students/${studentId}/chat/threads/${threadId}/voice/sessions`;
  const w: VoiceWorld = {
    fakeDb,
    rawDb: db,
    handler,
    chat,
    voice,
    server,
    port,
    provider,
    timers,
    pruneTimers,
    clock,
    logs,
    wsSecret,
    deps,
    async session(claims, threadId, studentId) {
      const token = await studentToken(claims);
      return call({ handler }, "POST", sessionPath(studentId ?? String(claims.studentId), threadId), { token });
    },
    async mint(claims, threadId, studentId) {
      const res = await w.session(claims, threadId, studentId);
      if (res.status !== 201) throw new Error(`mint failed: ${res.status} ${res.body}`);
      return res.json.token as string;
    },
    connect(token, o) {
      const how = o?.how ?? "header";
      const studentId = o?.studentId ?? "stu-1";
      const threadId = o?.threadId;
      if (!threadId) throw new Error("connect needs a threadId");
      const base = `ws://127.0.0.1:${port}/v1/students/${studentId}/chat/threads/${threadId}/voice/stream`;
      const url = how === "query" && token ? `${base}?token=${token}` : base;
      const headers: Record<string, string> = {};
      if (how === "header" && token) headers.authorization = `Bearer ${token}`;
      if (o?.origin) headers.origin = o.origin;
      const protocols = ["vc-voice-v1", ...(how === "protocol" && token ? [`vc-token.${token}`] : [])];
      return new Promise<ConnectResult>((resolve) => {
        const ws = new WebSocket(url, protocols, { headers });
        ws.on("unexpected-response", (_req, res) => {
          res.resume();
          resolve({ ok: false, status: res.statusCode ?? 0 });
        });
        ws.on("open", () => {
          const client = new VoiceClient(ws);
          clients.push(client);
          resolve({ ok: true, client });
        });
        ws.on("error", () => undefined);
      });
    },
    async open(claims, threadId, extra) {
      const studentId = extra?.studentId ?? String(claims.studentId);
      const token = await w.mint(claims, threadId, studentId);
      const backendIndex = provider.backends.length;
      const res = await w.connect(token, { studentId, threadId });
      if (!res.ok) throw new Error(`connect refused: ${res.status}`);
      res.client.send({ type: "start", threadId, ...(extra?.lastEventId !== undefined ? { lastEventId: extra.lastEventId } : {}) });
      await until(() => provider.backends.length > backendIndex, "the provider session after start");
      const sid = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")).sid as string;
      return { client: res.client, token, sid, backendIndex };
    },
    async signWsToken(claims, over = {}) {
      const iat = Math.floor(clock.ms / 1000);
      return new SignJWT({ sid: "11111111-1111-4111-8111-111111111111", minor: false, guardianConsent: false, ...claims })
        .setProtectedHeader({ alg: over.alg ?? "HS256" })
        .setIssuer(over.iss ?? VOICE_WS_ISSUER)
        .setAudience(over.aud ?? VOICE_WS_AUDIENCE)
        .setJti(over.jti ?? `jti-${Math.random().toString(16).slice(2)}-0000-4000-8000-000000000000`)
        .setIssuedAt(iat)
        .setExpirationTime(over.expSec ?? iat + 60)
        .sign(over.secret ?? wsSecret);
    },
    async cleanup() {
      for (const c of clients) c.abort();
      await voice.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      chat.cleanup();
      cleanupGates(gates);
    },
  };
  return w;
}

export { chatWorld, type ChatWorld };
export { adult as adultClaims };
