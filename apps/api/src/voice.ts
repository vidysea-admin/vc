/**
 * P1 U10 (plan row U10; spec A9, A9b, A12, A19, A20, A23 voice part; D-086 Q4, D-088 Q5, D-093 4A/6A/11, D-096 item 3, D-097 item 1):
 * the voice WebSocket API over the U9 Live seam.
 *
 *   POST /v1/students/{studentId}/chat/threads/{threadId}/voice/sessions   mint a short-lived single-use WebSocket token (201)
 *   GET  /v1/students/{studentId}/chat/threads/{threadId}/voice/stream     WebSocket upgrade; the token is the credential
 *
 * New file, on purpose: chat.ts is the text surface and anonymous.ts the public one; voice has a different transport (a WebSocket
 * upgrade, not request/response) and its own go-live target (`voice`, which also needs a passing A10 record). It reuses the student
 * JWT verifier (auth.ts), the chat store (@vc/db) and server.ts's `respond` / `ApiRoute` / `PATH_ID_PATTERN`, and edits none of them.
 * The route path is the one the U5a contract draft fixed (openapi.ts `createVoiceSession`): the session is bound to a thread.
 *
 * What is guaranteed here, and what is not:
 *  - OFF by default. `createVoiceApi` returns `undefined` unless VC_VOICE_ENABLED=true; when on it calls the A20 go-live gate
 *    (`assertGoLive(..., "voice")`, so a passing A10 record is required) and refuses to start with tracing on. Nothing here enables it.
 *  - Identity comes from the student JWT at the session route, then from a VC-minted HS256 WebSocket token (aud `vc-voice-ws`, 60 s,
 *    single use, bound to tenant + student + thread). The token travels in the `Authorization` header or the `vc-token.<jwt>`
 *    subprotocol, never in the URL, so it cannot land in an access log. Every refusal happens BEFORE the WebSocket is accepted and
 *    before any provider connect. Single use is per process (an in-memory jti set); with several API processes a replay across
 *    processes inside the 60 s lifetime is not caught (listed in the manifest).
 *  - D-096 item 3 / D-088 Q5: this module forwards exactly what `LiveSession` emits (model audio, the fixed crisis audio) and
 *    synthesises no audio of its own; the mute after a crisis, the 2 s budget and the helpline playback live in U9's LiveSession.
 *  - D-093 6A: stored transcripts are redacted (email, phone, self-stated and Pathlynks-known names) before they are written; the live
 *    transcript sent to the owning student is not. D-093 4A: an under-18 student without a boolean-true guardian-consent claim gets
 *    voice, but no turn text, audit finding or extracted fact is written; ids-and-time-only rows (the crisis flag, the usage counter) are kept.
 *  - Audio is never stored (D-086 Q4). Spoken output is audited AFTER the fact (A9b); nothing here claims pre-send enforcement.
 *  - A23: 60 voice minutes per student per month and 20 minutes per session (per-tenant override). Minutes are written once, when the
 *    connection ends. Sessions that outlive the process are lost to the counter (the counter is a ceiling, not a bill).
 */
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { SignJWT, jwtVerify } from "jose";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import type { tenantScopedDb } from "@vc/db";
import {
  ChatThreadNotFoundError,
  FencedWriterDeadlineError,
  ProfileFactNotFoundError,
  StudentFencedError,
  appendVoiceAudit,
  appendVoiceTurn,
  decideProfileFact,
  getChatThread,
  getStudentUsage,
  isStudentFenced,
  markChatThreadTextNotStored,
  profileFactId,
  proposeProfileFact,
  recordStudentFlag,
  recordStudentUsage,
  usageMonth,
} from "@vc/db";
import {
  VoiceClientEventSchema,
  VoiceServerEventSchema,
  VoiceSessionResponseSchema,
  isSyntheticStudentId,
  redactPii,
  resolveLimits,
  type Claim,
  type Source,
  type VoiceServerEvent,
} from "@vc/schemas";
import { crisisGuard, type SpeakersFile, type StudentGraphDeps } from "@vc/engine";
import {
  LiveConfigError,
  createSimpleOutputAuditor,
  type LiveAuditRecord,
  type LiveCrisisDetector,
  type LiveCrisisMessage,
  type LiveCrisisRecord,
  type LiveEvent,
  type LiveFinalTranscript,
  type LiveOutputAuditor,
  type LiveProvider,
  type LiveSession,
  type LiveSessionConfig,
  type LiveToolCall,
  type LiveToolDeclaration,
  type LiveTranscriptSink,
} from "@vc/providers";
import { AuthError, bearerToken, type StudentAuthContext, type StudentJwtVerifier } from "./auth.js";
import { AnonymousRateLimiter } from "./anonymous.js";
import { assertGoLive } from "./go-live-gate.js";
import { BodyTooLargeError, PATH_ID_PATTERN, respond, type ApiHandler, type ApiRequest, type ApiResponse, type ApiRoute } from "./server.js";

type Db = ReturnType<typeof tenantScopedDb>;

/** The explicit A20 config flag. Default off. */
export const VOICE_FLAG_ENV = "VC_VOICE_ENABLED";
export const VOICE_WS_ISSUER = "vc-api";
/** The audience of the VC-minted WebSocket token: a student (Pathlynks) JWT can never be presented as one. */
export const VOICE_WS_AUDIENCE = "vc-voice-ws";
export const VOICE_WS_TOKEN_TTL_SEC = 60;
export const VOICE_WS_SECRET_MIN_BYTES = 32;
/** The WebSocket subprotocol the server selects; the token rides in a second offered protocol `vc-token.<jwt>`. */
export const VOICE_WS_SUBPROTOCOL = "vc-voice-v1";
export const VOICE_WS_TOKEN_PROTOCOL_PREFIX = "vc-token.";
/** [ASSUMPTION] (Q-U10-2, not in D-088): no student speech and no model output for this long ends the session. Configurable per tenant. */
export const VOICE_SILENCE_TIMEOUT_MS_DEFAULT = 60_000;
/** An accepted socket that has not sent `start` by now is closed. */
export const VOICE_START_TIMEOUT_MS = 15_000;
/** One binary audio frame or JSON message at most (1 s of 16 kHz PCM16 is 32 KB). */
export const VOICE_MAX_FRAME_BYTES = 128 * 1024;
/** Bytes waiting in a connection's inbound queue before it is closed (a slow start must not buffer without limit). */
export const VOICE_MAX_QUEUED_BYTES = 1024 * 1024;
/** Server events kept per connection for `lastEventId` resume. */
export const VOICE_RESUME_EVENTS_MAX = 512;
export const VOICE_RESUME_WINDOW_MS = 5 * 60_000;
export const VOICE_RETAINED_LOGS_MAX = 1000;
export const VOICE_MAX_SOCKETS_DEFAULT = 500;
export const VOICE_MAX_USED_TOKENS = 100_000;
/** Non-fixed model audio is dropped, not queued, once a socket has this much unsent data. The fixed crisis audio is never dropped. */
export const VOICE_MAX_BUFFERED_AUDIO_BYTES = 1024 * 1024;
export const VOICE_MAX_PROPOSED_FACTS_PER_TURN = 5;
/** U10 repair 1 (D-088 Q5): the per-student session-route limiter, the same window and key bound as the text route (chat.ts). */
export const VOICE_RATE_WINDOW_MS = 60_000;
export const VOICE_MAX_LIMITER_KEYS = 100_000;
/** U10 repair 1: sockets one student may hold that have not yet started (a student must not fill the global socket cap). */
export const VOICE_MAX_PRESTART_SOCKETS_PER_STUDENT = 2;
/** U10 repair 1: a crisis flag / escalation write is tried this many times in all (one retry). */
export const VOICE_CRISIS_WRITE_ATTEMPTS = 2;
const MAX_INVALID_CLIENT_MESSAGES = 10;
const MAX_PENDING_CONFIRMS = 20;

const TRACING_VARS = ["LANGSMITH_TRACING", "LANGSMITH_TRACING_V2", "LANGCHAIN_TRACING", "LANGCHAIN_TRACING_V2"] as const;

const SEG = "([A-Za-z0-9][A-Za-z0-9._-]{0,127})";
const SESSION_RE = new RegExp(`^/v1/students/${SEG}/chat/threads/${SEG}/voice/sessions$`);
const STREAM_RE = new RegExp(`^/v1/students/${SEG}/chat/threads/${SEG}/voice/stream$`);
const VOICE_PATH_RE = /^\/v1\/students\/[^/]+\/chat\/threads\/[^/]+\/voice\/(sessions|stream)$/;
const EVENT_ID_RE = /^([0-9a-f-]{36})\.(\d{1,9})$/;
const COMPACT_JWS = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const TENANT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** The closed list of voice HTTP routes (the WebSocket stream is an upgrade, described under the draft's `x-websocket`). */
export const VOICE_ROUTES: readonly ApiRoute[] = Object.freeze([
  { id: "createVoiceSession", method: "POST", path: "/v1/students/{studentId}/chat/threads/{threadId}/voice/sessions", roles: "student" } as unknown as ApiRoute,
]);

export class VoiceConfigError extends Error {
  constructor(message: string) {
    super(`VoiceConfigError: ${message}`);
    this.name = "VoiceConfigError";
  }
}

/** Reads the flag: unset, empty and "false" are off; exactly "true" is on; anything else is a config error (never a silent on or off). */
export function voiceEnabledFromEnv(env: Record<string, string | undefined>): boolean {
  const raw = env[VOICE_FLAG_ENV]?.trim();
  if (raw === undefined || raw === "" || raw === "false") return false;
  if (raw === "true") return true;
  throw new VoiceConfigError(`${VOICE_FLAG_ENV} must be "true" or "false" (got a different value)`);
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface VoiceToolRun {
  /** What the model gets back (and what the A9b audit counts as sourced). */
  result: unknown;
  sources?: readonly Source[];
  claims?: readonly Claim[];
}

/** KB tools offered to the Live model. Absent: the model has no tools and every spoken figure is audited as uncited. */
export interface VoiceTools {
  declarations: readonly LiveToolDeclaration[];
  run(call: LiveToolCall, who: { tenantId: string; studentId: string; threadId: string }): Promise<VoiceToolRun>;
}

/** Proposes facts heard in a final user transcript. Receives the live (unredacted) text; whatever it returns is redacted before it is stored. */
export type VoiceFactExtractor = (turn: {
  tenantId: string;
  studentId: string;
  threadId: string;
  turnId: string;
  text: string;
}) => Promise<ReadonlyArray<{ key: string; value: string }>>;

export type VoiceLogLine = { level: "error"; event: string; ts: string; error?: string };

export interface VoiceTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface VoiceApiDeps {
  /** The student (Pathlynks) JWT verifier: only the session route uses it. */
  verifier: StudentJwtVerifier;
  /** The tenant-scoped `virtual_counsellor` Db. Called only after a token verified. */
  dbForTenant(tenantId: string): Db;
  /** The Live seam (U9). Production would be GeminiLiveProvider; every test here uses MockLiveProvider. */
  live: LiveProvider;
  /** HS256 key for the WebSocket token, at least 32 bytes. Separate from every JWT key in auth.ts. */
  wsSecret: Uint8Array;
  /** `wss://host[/prefix]` (or `ws://` for local tests); the stream path is appended. */
  wsBaseUrl: string;
  /** The fixed crisis message with its pre-rendered 24 kHz PCM16 audio (U9 refuses a detector without it). */
  crisis: { message: LiveCrisisMessage; detect?: LiveCrisisDetector };
  /** For the default A9b auditor: listed speakers (names and aliases) the model must never say aloud. */
  speakers?: SpeakersFile;
  /** Overrides the default `createSimpleOutputAuditor({ listedSpeakers })`. */
  auditOutput?: LiveOutputAuditor;
  tools?: VoiceTools;
  systemInstruction?: string;
  voiceName?: string;
  /** Names known from the Pathlynks profile, so a stored transcript can redact them (D-093 6A). Failure is tolerated. */
  profileNames?(who: { tenantId: string; studentId: string }): Promise<readonly string[]>;
  extractFacts?: VoiceFactExtractor;
  /**
   * The tenant's escalation path, the same optional port as the text path (chat.ts `escalateForTenant`; production:
   * `(i) => escalateTurns(db, i, escalationDeps)`). Called on a crisis with the redacted student words, and never for an unconsented
   * minor (no text is kept for them). Absent: a crisis writes the flag exactly as before.
   */
  escalateForTenant?(tenantId: string, db: Db): StudentGraphDeps["escalate"];
  /** A6: this tenant accepts only `syn-` student ids. */
  sandboxTenantId?: string;
  /** Per-tenant override of the D-088 limits (voiceMinutesPerMonth, voiceSessionMaxMinutes, requestsPerMinute are read). */
  limitsForTenant?(tenantId: string): Parameters<typeof resolveLimits>[0];
  /** Per-tenant silence timeout; undefined falls back to `silenceTimeoutMs`. */
  silenceTimeoutMsForTenant?(tenantId: string): number | undefined;
  silenceTimeoutMs?: number;
  /** When set, a browser Origin outside this list is refused at the upgrade. A request without an Origin is allowed. */
  allowedOrigins?: readonly string[];
  maxSockets?: number;
  now?: () => Date;
  nowMs?: () => number;
  /** Injectable for tests; the default uses unref'd real timers. */
  timers?: VoiceTimers;
  /** The timer that drops expired resume logs (kept apart from `timers` so the armed-timer count stays per connection). Default: unref'd real timers. */
  pruneTimers?: VoiceTimers;
  /** Text-free server-side failure log. Default: one JSON line on stderr. */
  log?: (line: VoiceLogLine) => void;
}

export interface VoiceRouteConfig {
  /** From `voiceEnabledFromEnv`. False -> `createVoiceApi` builds nothing. */
  enabled: boolean;
  gatesDir: string;
  now?: Date;
  approver?: string;
  /** Environment checked for LangChain/LangSmith tracing switches. Default: process.env. */
  env?: Record<string, string | undefined>;
}

/** The pre-connect checks of `createVoiceApi`: the A20 `voice` gate (which includes the passing A10 record) and tracing off. */
export function assertVoiceGoLive(route: Pick<VoiceRouteConfig, "gatesDir" | "now" | "approver" | "env">): void {
  assertGoLive(route.gatesDir, "voice", route.now, route.approver);
  const env = route.env ?? process.env;
  for (const name of TRACING_VARS) {
    if (/^(true|1|yes|on)$/i.test(env[name]?.trim() ?? "")) {
      throw new VoiceConfigError(`${name} switches request tracing on; voice stores redacted text only, and a trace would hold the unredacted transcript, so the routes will not start`);
    }
  }
}

export interface VoiceStats {
  /** Open WebSocket connections (accepted, not yet finalised). */
  sockets: number;
  /** Students that currently hold a voice session slot (the in-memory quota reservation). */
  activeSessions: number;
  /** Provider (Live) sessions opened and not yet closed. */
  liveSessions: number;
  /** Armed timers of this API (silence, cap, start). */
  timers: number;
  /** Closed connections whose JSON events are still kept for resume. */
  retainedLogs: number;
  /** Token ids remembered for the single-use check (expired ones are dropped lazily). */
  usedTokens: number;
}

export interface VoiceApi {
  /** The session route's handler. Compose it OUTSIDE `withChatRoutes` (chat.ts routes every /chat/ path to itself). */
  handler: ApiHandler;
  /** The `server.on("upgrade")` handler (see `createApiServer(handler, { onUpgrade })`). */
  upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void;
  stats(): VoiceStats;
  /** Resolves when every connection finalised so far has fully settled (usage written, provider session closed). */
  settled(): Promise<void>;
  /** Closes every connection and the WebSocket server. Idempotent. */
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

function pathOf(req: Pick<ApiRequest, "url">): string | undefined {
  try {
    return new URL(req.url, "http://vc-api.invalid").pathname;
  } catch {
    return undefined;
  }
}

/** Sends the session route to `voice` (when built) and everything else, chat paths included, to `main` untouched. Wrap OUTSIDE withChatRoutes. */
export function withVoiceRoutes(main: ApiHandler, voice: ApiHandler | undefined): ApiHandler {
  if (!voice) return main;
  return (req) => {
    const pathname = pathOf(req);
    return pathname !== undefined && VOICE_PATH_RE.test(pathname) ? voice(req) : main(req);
  };
}

const fail = (status: number, error: string, headers?: Record<string, string>): ApiResponse => respond(status, { error }, headers);
const NOT_FOUND = () => fail(404, "not_found");
const UNAUTHORIZED = () => respond(401, { error: "unauthorized" }, { "www-authenticate": 'Bearer realm="vc-api"' });

// ---------------------------------------------------------------------------
// The WebSocket token (VC-minted, aud-checked, short-lived, single use)
// ---------------------------------------------------------------------------

interface VoiceTokenClaims {
  tenantId: string;
  studentId: string;
  threadId: string;
  /** The voice session id; the prefix of every event id of this connection. */
  sid: string;
  minor: boolean;
  guardianConsent: boolean;
  jti: string;
  exp: number;
}

async function mintVoiceToken(secret: Uint8Array, who: StudentAuthContext, threadId: string, nowMs: number): Promise<{ token: string; exp: number }> {
  const iat = Math.floor(nowMs / 1000);
  const exp = iat + VOICE_WS_TOKEN_TTL_SEC;
  const token = await new SignJWT({
    tenant: who.tenantId,
    studentId: who.studentId,
    threadId,
    sid: randomUUID(),
    minor: who.minor,
    guardianConsent: who.guardianConsent,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(VOICE_WS_ISSUER)
    .setAudience(VOICE_WS_AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(secret);
  return { token, exp };
}

/** Verifies signature, issuer, audience, expiry and claim shape. Returns undefined for ANY failure (the caller answers one 401). */
async function verifyVoiceToken(secret: Uint8Array, token: string, nowMs: number): Promise<VoiceTokenClaims | undefined> {
  if (token.length === 0 || token.length > 4096 || !COMPACT_JWS.test(token)) return undefined;
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: VOICE_WS_ISSUER,
      audience: VOICE_WS_AUDIENCE,
      algorithms: ["HS256"],
      requiredClaims: ["exp", "iat", "jti"],
      currentDate: new Date(nowMs),
    });
    const p = payload as Record<string, unknown>;
    const { tenant, studentId, threadId, sid, minor, guardianConsent } = p;
    if (typeof tenant !== "string" || !TENANT_RE.test(tenant)) return undefined;
    if (typeof studentId !== "string" || studentId === "" || studentId.length > 128) return undefined;
    if (typeof threadId !== "string" || !PATH_ID_PATTERN.test(threadId)) return undefined;
    if (typeof sid !== "string" || !/^[0-9a-f-]{36}$/.test(sid)) return undefined;
    if (typeof minor !== "boolean" || typeof guardianConsent !== "boolean") return undefined;
    if (typeof payload.jti !== "string" || typeof payload.exp !== "number") return undefined;
    return { tenantId: tenant, studentId, threadId, sid, minor, guardianConsent, jti: payload.jti, exp: payload.exp };
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Fixed client-facing texts (never a provider or database message)
// ---------------------------------------------------------------------------

const TEXT_CONTINUES = "You can keep chatting by text in the same conversation.";
const ERROR_TEXT: Readonly<Record<string, string>> = Object.freeze({
  not_started: "Send a start message first.",
  already_started: "This voice session has already started.",
  bad_event: "That message was not understood.",
  bad_audio: "Audio must be PCM16 mono at 16 kHz, in whole samples.",
  forbidden: "That conversation is not available to this voice session.",
  not_found: "That conversation was not found.",
  student_fenced: "Voice is not available for this account right now.",
  voice_quota_exceeded: `You have used this month's voice time. ${TEXT_CONTINUES}`,
  live_unavailable: `Voice is not available right now. ${TEXT_CONTINUES}`,
  live_config: `Voice is not available right now. ${TEXT_CONTINUES}`,
  live_error: `The voice service had a problem. ${TEXT_CONTINUES}`,
  live_closed: `The voice connection ended. ${TEXT_CONTINUES}`,
  persist_failed: `Your voice history could not be saved just now. ${TEXT_CONTINUES}`,
  silence_timeout: `The voice session ended after a long silence. You can start again, or ${TEXT_CONTINUES.toLowerCase()}`,
  session_time_limit: `This voice session reached its time limit. ${TEXT_CONTINUES}`,
  superseded: "This voice session was replaced by a newer one.",
  unknown_confirm: "There is nothing waiting to be confirmed for that item.",
  resume_gap: "Some earlier events are no longer available.",
  internal: `Something went wrong. ${TEXT_CONTINUES}`,
});

type FlagReason = Extract<VoiceServerEvent, { type: "flag" }>["reason"];
function flagReasonFor(reason: string): FlagReason {
  if (reason === "uncited_number") return "uncited_number";
  if (reason === "listed_speaker") return "named_speaker";
  return "unverified_claim";
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type OutEvent = DistributiveOmit<VoiceServerEvent, "eventId">;

const clamp = (text: string, max = 8000): string => (text.length > max ? text.slice(0, max) : text);
const errMsg = (err: unknown): string => (err instanceof Error ? err.name : "error");

interface Retained {
  tenantId: string;
  studentId: string;
  threadId: string;
  log: VoiceServerEvent[];
  closedAtMs: number;
}

interface Conn {
  ws: WebSocket;
  claims: VoiceTokenClaims;
  db: Db;
  key: string;
  state: "awaiting_start" | "starting" | "active" | "closing" | "closed";
  seq: number;
  log: VoiceServerEvent[];
  session?: LiveSession;
  startedAtMs?: number;
  capMs?: number;
  persistText: boolean;
  knownNames: readonly string[];
  timers: Set<unknown>;
  silenceTimer?: unknown;
  chain: Promise<void>;
  queuedBytes: number;
  invalid: number;
  notStartedWarned: boolean;
  lastAtMs: number;
  /** `text` is the REDACTED words of the turn, kept only while the student's text may be stored; the crisis escalation reads it. */
  lastUser?: { turnId: string; at: string; answered: boolean; text?: string };
  startTimer?: unknown;
  turnBySeq: Map<number, string>;
  /** `${seq}|${reason}|${detail}` of the flags already sent: one listed speaker named under three aliases is one flag, not three. */
  flagsSent: Set<string>;
  pendingConfirms: Map<string, string>;
  finalizing?: Promise<void>;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/**
 * Builds the voice API, or `undefined` when `route.enabled` is false (nothing is built: no key is read, no server is created).
 * When enabled it first requires the A20 go-live gate for `voice` (GoLiveRefusedError) and an environment with tracing off.
 */
export function createVoiceApi(deps: VoiceApiDeps, route: VoiceRouteConfig): VoiceApi | undefined {
  if (!route.enabled) return undefined;
  assertVoiceGoLive(route);
  if (!(deps.wsSecret instanceof Uint8Array) || deps.wsSecret.byteLength < VOICE_WS_SECRET_MIN_BYTES) {
    throw new VoiceConfigError(`wsSecret must be at least ${VOICE_WS_SECRET_MIN_BYTES} bytes`);
  }
  const wsBase = deps.wsBaseUrl.replace(/\/+$/, "");
  if (!/^wss?:\/\/\S+$/.test(wsBase)) throw new VoiceConfigError("wsBaseUrl must be a ws:// or wss:// URL");

  const nowMs = deps.nowMs ?? Date.now;
  const nowDate = () => (deps.now ? deps.now() : new Date(nowMs()));
  const maxSockets = deps.maxSockets ?? VOICE_MAX_SOCKETS_DEFAULT;
  const timerApi: VoiceTimers = deps.timers ?? {
    setTimeout: (fn, ms) => {
      const t = setTimeout(fn, ms);
      t.unref?.();
      return t;
    },
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  };
  const log = (line: VoiceLogLine) => {
    try {
      (deps.log ?? ((l: VoiceLogLine) => console.error(JSON.stringify(l))))(line);
    } catch {
      // a failing logger must not fail a voice session
    }
  };
  const logEvent = (event: string, err?: unknown) =>
    log({ level: "error", event, ts: nowDate().toISOString(), ...(err !== undefined ? { error: errMsg(err) } : {}) });

  const listedSpeakers = (deps.speakers?.speakers ?? []).flatMap((s) => [s.name, ...(s.aliases ?? [])]);
  const auditOutput = deps.auditOutput ?? createSimpleOutputAuditor({ listedSpeakers });
  const detectCrisis: LiveCrisisDetector =
    deps.crisis.detect ?? ((text) => (crisisGuard(text).level === "crisis" ? { crisis: true, level: "crisis" } : { crisis: false }));

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: VOICE_MAX_FRAME_BYTES,
    perMessageDeflate: false,
    handleProtocols: (protocols) => (protocols.has(VOICE_WS_SUBPROTOCOL) ? VOICE_WS_SUBPROTOCOL : false),
  });

  const conns = new Set<Conn>();
  const activeByStudent = new Map<string, Conn>();
  const retained = new Map<string, Retained>();
  const usedTokens = new Map<string, number>();
  const allTimers = new Set<unknown>();
  const pendingFinalizers = new Set<Promise<void>>();
  /** The newest connection that is waiting its turn to take a student's slot: an older waiter steps aside for it. */
  const latestStart = new Map<string, Conn>();
  let liveOpen = 0;
  let shuttingDown = false;

  // One session-route limiter per distinct limit value (a tenant override makes a new one); the key is tenant + student, hashed inside.
  const limiters = new Map<number, AnonymousRateLimiter>();
  const limiterFor = (limit: number): AnonymousRateLimiter => {
    let l = limiters.get(limit);
    if (!l) {
      l = new AnonymousRateLimiter({ limit, windowMs: VOICE_RATE_WINDOW_MS, maxKeys: VOICE_MAX_LIMITER_KEYS, nowMs });
      limiters.set(limit, l);
    }
    return l;
  };
  const pruneTimerApi: VoiceTimers = deps.pruneTimers ?? {
    setTimeout: (fn, ms) => {
      const t = setTimeout(fn, ms);
      t.unref?.();
      return t;
    },
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  };
  let pruneTimer: unknown;

  // -- timers ---------------------------------------------------------------

  function schedule(c: Conn, ms: number, fn: () => void): unknown {
    const handle: unknown = timerApi.setTimeout(() => {
      c.timers.delete(handle);
      allTimers.delete(handle);
      fn();
    }, ms);
    c.timers.add(handle);
    allTimers.add(handle);
    return handle;
  }
  function cancel(c: Conn, handle: unknown): void {
    if (handle === undefined) return;
    timerApi.clearTimeout(handle);
    c.timers.delete(handle);
    allTimers.delete(handle);
  }
  function clearTimers(c: Conn): void {
    for (const h of c.timers) {
      timerApi.clearTimeout(h);
      allTimers.delete(h);
    }
    c.timers.clear();
    c.silenceTimer = undefined;
    c.startTimer = undefined;
  }
  const silenceMsFor = (tenantId: string): number => {
    const v = deps.silenceTimeoutMsForTenant?.(tenantId) ?? deps.silenceTimeoutMs ?? VOICE_SILENCE_TIMEOUT_MS_DEFAULT;
    return Number.isFinite(v) && v > 0 ? v : VOICE_SILENCE_TIMEOUT_MS_DEFAULT;
  };
  /**
   * An accepted socket must send `start` within VOICE_START_TIMEOUT_MS, and a start must finish connecting within the same budget:
   * a provider connect that never returns must not hold a socket slot and the student's lock for ever (U10 repair 1, item 4).
   * Armed again when the state moves to "starting", so a start that arrived late still gets its whole budget.
   */
  function armStartTimer(c: Conn): void {
    cancel(c, c.startTimer);
    c.startTimer = schedule(c, VOICE_START_TIMEOUT_MS, () => {
      c.startTimer = undefined;
      if (c.state === "awaiting_start" || c.state === "starting") void finalize(c, 1008);
    });
  }
  /** Student speech, model output or a control message restarts the silence clock (raw audio frames do not: an open microphone is not speech). */
  function armSilence(c: Conn): void {
    if (c.state !== "active") return;
    cancel(c, c.silenceTimer);
    c.silenceTimer = schedule(c, silenceMsFor(c.claims.tenantId), () => {
      sendError(c, "silence_timeout");
      void finalize(c, 1000);
    });
  }

  // -- sending --------------------------------------------------------------

  function rawSend(c: Conn, data: string | Uint8Array, binary: boolean): void {
    if (c.ws.readyState !== 1) return;
    try {
      c.ws.send(data, { binary });
    } catch {
      // a socket that cannot be written to is closed by its own 'close' event
    }
  }
  function sendEvent(c: Conn, ev: OutEvent): void {
    const full = { ...ev, eventId: `${c.claims.sid}.${++c.seq}` };
    const parsed = VoiceServerEventSchema.safeParse(full);
    if (!parsed.success) {
      logEvent("voice_event_invalid");
      return;
    }
    c.log.push(parsed.data);
    if (c.log.length > VOICE_RESUME_EVENTS_MAX) c.log.shift();
    rawSend(c, JSON.stringify(parsed.data), false);
  }
  function sendError(c: Conn, code: keyof typeof ERROR_TEXT & string): void {
    sendEvent(c, { type: "error", code, message: ERROR_TEXT[code] ?? ERROR_TEXT.internal! });
  }
  function sendAudio(c: Conn, data: Uint8Array, fixed: boolean): void {
    if (c.ws.readyState !== 1) return;
    if (!fixed && c.ws.bufferedAmount > VOICE_MAX_BUFFERED_AUDIO_BYTES) return; // a slow reader loses model audio, never the helpline audio
    rawSend(c, data, true);
  }

  // -- persistence glue -----------------------------------------------------

  const redact = (c: Conn, text: string): string => redactPii(text, { knownNames: [...c.knownNames] }).text;

  function bumpAt(c: Conn, ts: string): string {
    const parsed = Date.parse(ts);
    const ms = Math.max(Number.isNaN(parsed) ? nowMs() : parsed, c.lastAtMs + 1);
    c.lastAtMs = ms;
    return new Date(ms).toISOString();
  }

  function assignTurn(c: Conn, t: LiveFinalTranscript): { turnId: string; at: string } {
    const mk = () => `v${c.claims.sid.slice(0, 8)}${String(t.seq).padStart(6, "0")}`;
    let turn: { turnId: string; at: string };
    if (t.role === "user") {
      turn = { turnId: mk(), at: bumpAt(c, t.ts) };
      c.lastUser = { ...turn, answered: false };
    } else if (c.lastUser && !c.lastUser.answered) {
      c.lastUser.answered = true;
      turn = { turnId: c.lastUser.turnId, at: c.lastUser.at };
    } else {
      turn = { turnId: mk(), at: bumpAt(c, t.ts) };
    }
    c.turnBySeq.set(t.seq, turn.turnId);
    if (c.turnBySeq.size > 32) c.turnBySeq.delete(c.turnBySeq.keys().next().value as number);
    return turn;
  }

  /** A student that is fenced for erasure ends the session: nothing more is written for them. */
  function endIfFenced(c: Conn, err: unknown): boolean {
    if (!(err instanceof StudentFencedError || err instanceof FencedWriterDeadlineError)) return false;
    sendError(c, "student_fenced");
    void finalize(c, 1008);
    return true;
  }

  async function onFinalTranscript(c: Conn, t: LiveFinalTranscript): Promise<void> {
    const { turnId, at } = assignTurn(c, t);
    if (t.role === "user") armSilence(c);
    sendEvent(c, { type: "transcript.final", role: t.role, text: clamp(t.text), turnId });
    if (!c.persistText) return; // D-093 4A: the student is answered, nothing personal is stored
    const stored = redact(c, t.text);
    // The crisis escalation reads the words of the latest student turn; they are kept redacted and only while text may be stored.
    if (t.role === "user" && c.lastUser?.turnId === turnId) c.lastUser.text = clamp(stored, 2000);
    try {
      await appendVoiceTurn(c.db, { studentId: c.claims.studentId, threadId: c.claims.threadId, turnId, role: t.role, text: stored, at });
    } catch (err) {
      if (endIfFenced(c, err)) return;
      throw err; // LiveSession reports a sink failure as an error event
    }
    if (t.role === "user" && deps.extractFacts) await proposeFacts(c, turnId, t.text);
  }

  async function proposeFacts(c: Conn, turnId: string, text: string): Promise<void> {
    try {
      const facts = await deps.extractFacts!({ tenantId: c.claims.tenantId, studentId: c.claims.studentId, threadId: c.claims.threadId, turnId, text });
      for (const f of facts.slice(0, VOICE_MAX_PROPOSED_FACTS_PER_TURN)) {
        await proposeProfileFact(c.db, { studentId: c.claims.studentId, key: f.key, value: f.value, threadId: c.claims.threadId, turnId }, { now: nowDate() });
        // A numeric value is read back to the student for confirmation: speech recognition mishears figures. Nothing is used until they accept.
        if (/\d/.test(f.value)) {
          c.pendingConfirms.set(f.key, profileFactId(c.claims.studentId, f.key));
          if (c.pendingConfirms.size > MAX_PENDING_CONFIRMS) c.pendingConfirms.delete(c.pendingConfirms.keys().next().value as string);
          sendEvent(c, { type: "confirm", fact: { key: f.key.slice(0, 128), value: f.value.slice(0, 1000) } });
        }
      }
    } catch (err) {
      if (endIfFenced(c, err)) return;
      logEvent("voice_fact_extraction_failed", err);
    }
  }

  async function onAudit(c: Conn, r: LiveAuditRecord): Promise<void> {
    const reason = flagReasonFor(r.finding.reason);
    // The figure is shown; a listed speaker's name is never repeated (to the client or the store).
    const detail = reason === "uncited_number" ? r.finding.detail.slice(0, 64) : reason === "named_speaker" ? "a listed speaker was named" : "the answer could not be checked";
    const flagKey = `${r.seq}|${reason}|${detail}`;
    if (c.flagsSent.has(flagKey)) return;
    c.flagsSent.add(flagKey);
    if (c.flagsSent.size > 256) c.flagsSent.delete(c.flagsSent.values().next().value as string);
    sendEvent(c, { type: "flag", reason, detail });
    if (!c.persistText) return;
    const turnId = c.turnBySeq.get(r.seq);
    if (turnId === undefined) return;
    try {
      await appendVoiceAudit(c.db, {
        studentId: c.claims.studentId,
        threadId: c.claims.threadId,
        turnId,
        reason,
        ...(reason === "uncited_number" ? { detail } : {}),
        at: r.ts,
      });
    } catch (err) {
      if (endIfFenced(c, err)) return;
      throw err;
    }
  }

  /**
   * A crisis write is never lost to one blip: it is tried VOICE_CRISIS_WRITE_ATTEMPTS times in all (one retry, mirroring the text path's
   * safeWrite) and a final failure is logged text-free under `failEvent`; it never throws, so the later sink writes and the session go on.
   * A student fenced for erasure is not retried: the session ends, exactly as for every other write.
   */
  async function crisisWrite(c: Conn, failEvent: string, write: () => Promise<unknown>): Promise<void> {
    let last: unknown;
    for (let attempt = 1; attempt <= VOICE_CRISIS_WRITE_ATTEMPTS; attempt++) {
      try {
        await write();
        return;
      } catch (err) {
        if (endIfFenced(c, err)) return;
        last = err;
      }
    }
    logEvent(failEvent, last);
  }

  async function onCrisisRecord(c: Conn, r: LiveCrisisRecord): Promise<void> {
    // Ids and time only: kept even for an unconsented minor, exactly like the text path's crisis flag.
    const turnId = c.lastUser?.turnId ?? `v${c.claims.sid.slice(0, 8)}crisis`;
    await crisisWrite(c, "voice_crisis_flag_failed", () =>
      recordStudentFlag(c.db, { studentId: c.claims.studentId, threadId: c.claims.threadId, turnId, kind: "crisis" }, { now: new Date(r.ts) }),
    );
    // Parity with the text path (chat.ts escalateForTenant): the optional tenant port gets the REDACTED words of the student's turn.
    // Never for a student whose text may not be stored (an unconsented minor), and never when no words are known.
    const text = c.persistText ? c.lastUser?.text : undefined;
    if (!deps.escalateForTenant || text === undefined || text === "" || c.state === "closing" || c.state === "closed") return;
    const escalate = deps.escalateForTenant(c.claims.tenantId, c.db);
    if (!escalate) return;
    await crisisWrite(c, "voice_crisis_escalate_failed", () =>
      escalate({
        sessionId: c.claims.threadId,
        studentId: c.claims.studentId,
        turns: [{ turnId, speaker: "student", lang: /[\u0900-\u097F]/.test(text) ? "hi" : "en", text, translatedText: text }],
      }),
    );
  }

  // -- LiveSession event relay ----------------------------------------------

  function onLiveEvent(c: Conn, ev: LiveEvent): void {
    switch (ev.type) {
      case "audio":
        armSilence(c);
        sendAudio(c, ev.data, ev.fixed === true);
        return;
      case "transcript":
        // Final transcripts come from the sink (ordered, with turn ids); only partial chunks are relayed here.
        if (!ev.final) {
          armSilence(c);
          sendEvent(c, { type: "transcript.partial", role: ev.role, text: clamp(ev.text) });
        }
        return;
      case "turn_complete": {
        // After the finals queued for this turn, so a client sees transcript.final before the state.
        const session = c.session;
        const emit = () => {
          if (c.state === "active") sendEvent(c, { type: "state", state: "ok" });
        };
        if (session) void session.drain().then(emit, emit);
        else emit();
        return;
      }
      case "crisis":
        sendEvent(c, { type: "flag", reason: "crisis_detected", ...(ev.level !== undefined ? { detail: ev.level.slice(0, 64) } : {}) });
        sendEvent(c, { type: "state", state: "escalated" });
        return;
      case "error":
        sendError(c, ev.message.startsWith("transcript sink failed") ? "persist_failed" : "live_error");
        return;
      case "closed":
        // The backend ended on its own (our own close arrives while the state is already "closing").
        if (c.state === "active") {
          sendError(c, "live_closed");
          void finalize(c, 1011);
        }
        return;
      default:
        return; // tool_call, interrupted, flag: not relayed (audit flags come from the sink, in order)
    }
  }

  function liveConfig(c: Conn): LiveSessionConfig {
    const who = { tenantId: c.claims.tenantId, studentId: c.claims.studentId, threadId: c.claims.threadId };
    const sink: LiveTranscriptSink = {
      onFinalTranscript: (t) => onFinalTranscript(c, t),
      onAudit: (r) => onAudit(c, r),
      onCrisis: (r) => onCrisisRecord(c, r),
    };
    const tools = deps.tools;
    return {
      ...(deps.systemInstruction !== undefined ? { systemInstruction: deps.systemInstruction } : {}),
      ...(tools ? { tools: [...tools.declarations] } : {}),
      ...(deps.voiceName !== undefined ? { voiceName: deps.voiceName } : {}),
      onEvent: (ev) => onLiveEvent(c, ev),
      sink,
      detectCrisis,
      crisisMessage: deps.crisis.message,
      auditOutput,
      ...(tools
        ? {
            toolHandler: async (call: LiveToolCall) => {
              const out = await tools.run(call, who);
              if ((out.sources?.length ?? 0) > 0 || (out.claims?.length ?? 0) > 0) {
                sendEvent(c, { type: "answer.sources", sources: [...(out.sources ?? [])], claims: [...(out.claims ?? [])] });
              }
              return out.result;
            },
          }
        : {}),
      now: nowMs,
    };
  }

  // -- connection lifecycle -------------------------------------------------

  /** Drops every closed connection's resume log that is older than the window (insertion order is close order). */
  function pruneRetained(): void {
    const now = nowMs();
    for (const [sid, r] of retained) {
      if (now - r.closedAtMs <= VOICE_RESUME_WINDOW_MS) break;
      retained.delete(sid);
    }
  }
  /**
   * U10 repair 1 (item 7): retained logs hold transcript events, so they must not outlive the window just because nobody asked.
   * One unref'd timer, re-armed for the oldest log, drops them; it is not one of a connection's timers.
   */
  function armPrune(): void {
    if (pruneTimer !== undefined || retained.size === 0 || shuttingDown) return;
    const oldest = retained.values().next().value as Retained;
    const wait = Math.max(1_000, oldest.closedAtMs + VOICE_RESUME_WINDOW_MS + 1 - nowMs());
    pruneTimer = pruneTimerApi.setTimeout(() => {
      pruneTimer = undefined;
      pruneRetained();
      armPrune();
    }, wait);
  }

  function retain(c: Conn): void {
    if (c.seq === 0) return;
    pruneRetained();
    retained.set(c.claims.sid, { tenantId: c.claims.tenantId, studentId: c.claims.studentId, threadId: c.claims.threadId, log: c.log, closedAtMs: nowMs() });
    while (retained.size > VOICE_RETAINED_LOGS_MAX) retained.delete(retained.keys().next().value as string);
    armPrune();
  }

  /** Idempotent. Releases the provider session, every timer and the quota slot, writes the minutes, keeps the JSON events for resume, then closes the socket. */
  function finalize(c: Conn, code: number): Promise<void> {
    if (c.finalizing) return c.finalizing;
    const run = (async () => {
      const wasStarted = c.startedAtMs !== undefined;
      c.state = "closing";
      clearTimers(c);
      const session = c.session;
      if (session) {
        try {
          session.close("voice session ended");
        } catch (err) {
          logEvent("voice_session_close_failed", err);
        }
        try {
          await session.drain();
        } catch (err) {
          logEvent("voice_drain_failed", err);
        }
        liveOpen--;
        c.session = undefined;
      }
      if (wasStarted) {
        const elapsed = Math.max(0, Math.min(Math.round(nowMs() - c.startedAtMs!), c.capMs ?? Infinity));
        if (elapsed > 0) {
          try {
            await recordStudentUsage(c.db, { studentId: c.claims.studentId, voiceMs: elapsed }, { now: nowDate() });
          } catch (err) {
            logEvent("voice_usage_failed", err);
          }
        }
      }
      retain(c);
      if (activeByStudent.get(c.key) === c) activeByStudent.delete(c.key);
      if (latestStart.get(c.key) === c) latestStart.delete(c.key);
      conns.delete(c);
      c.state = "closed";
      try {
        if (c.ws.readyState === 0 || c.ws.readyState === 1) c.ws.close(code);
      } catch {
        try {
          c.ws.terminate();
        } catch {
          // already gone
        }
      }
    })();
    c.finalizing = run;
    const tracked = run.catch(() => undefined).then(() => {
      pendingFinalizers.delete(tracked);
    });
    pendingFinalizers.add(tracked);
    return run;
  }

  function replayFrom(c: Conn, lastEventId: string): void {
    const m = EVENT_ID_RE.exec(lastEventId);
    if (!m) return;
    pruneRetained(); // an expired log is dropped on the read that finds it
    const r = retained.get(m[1]!);
    // Only the SAME student's, SAME thread's, SAME tenant's earlier connection, inside the resume window; anything else replays nothing.
    if (!r || r.tenantId !== c.claims.tenantId || r.studentId !== c.claims.studentId || r.threadId !== c.claims.threadId) return;
    if (nowMs() - r.closedAtMs > VOICE_RESUME_WINDOW_MS) return;
    const after = Number(m[2]);
    const missed = r.log.filter((e) => Number(e.eventId.slice(e.eventId.lastIndexOf(".") + 1)) > after);
    const first = r.log[0] ? Number(r.log[0].eventId.slice(r.log[0].eventId.lastIndexOf(".") + 1)) : after + 1;
    if (first > after + 1) sendError(c, "resume_gap");
    for (const e of missed) rawSend(c, JSON.stringify(e), false);
  }

  async function handleStart(c: Conn, threadId: string, lastEventId: string | undefined): Promise<void> {
    if (c.state !== "awaiting_start") {
      sendError(c, "already_started");
      return;
    }
    if (threadId !== c.claims.threadId) {
      sendError(c, "forbidden");
      void finalize(c, 1008);
      return;
    }
    c.state = "starting";
    armStartTimer(c);
    const { tenantId, studentId } = c.claims;
    const now = nowDate();
    const limits = resolveLimits(deps.limitsForTenant?.(tenantId));
    let used: number;
    try {
      if (await isStudentFenced(c.db, studentId, now)) {
        sendError(c, "student_fenced");
        void finalize(c, 1008);
        return;
      }
      if ((await getChatThread(c.db, { studentId, threadId })) === null) {
        sendError(c, "not_found");
        void finalize(c, 1008);
        return;
      }
      used = (await getStudentUsage(c.db, { studentId, month: usageMonth(now) })).voiceMs;
    } catch (err) {
      logEvent("voice_start_failed", err);
      sendError(c, "internal");
      void finalize(c, 1011);
      return;
    }
    const remainingMs = limits.voiceMinutesPerMonth * 60_000 - used;
    if (remainingMs <= 0) {
      sendError(c, "voice_quota_exceeded");
      void finalize(c, 1008);
      return;
    }
    if (c.state !== "starting") return; // the socket closed while the checks ran

    // One voice session per student: a new start replaces the old one (a client that reconnects before the server noticed the drop).
    // U10 repair 1 (items 1 and 2): two starts that wait for the same old session must not both take the slot. Every await is followed by a
    // fresh look at the map; the newest waiter wins and an older waiter steps aside; and the slot is taken only by a connection that is
    // still starting, so a socket that closed while it waited can never leave itself in the map.
    latestStart.set(c.key, c);
    for (;;) {
      const previous = activeByStudent.get(c.key);
      if (!previous || previous === c) break;
      sendError(previous, "superseded");
      await finalize(previous, 4000);
      if (activeByStudent.get(c.key) === previous) activeByStudent.delete(c.key); // belt and braces: a finalize that threw must not wedge the loop
      if (c.state !== "starting") return; // the socket closed while it waited
      if (latestStart.get(c.key) !== c) {
        sendError(c, "superseded"); // a newer start for this student is queued behind the same old session
        void finalize(c, 4000);
        return;
      }
    }
    if (latestStart.get(c.key) === c) latestStart.delete(c.key);
    if (c.state !== "starting") return;
    activeByStudent.set(c.key, c);
    if (lastEventId !== undefined) replayFrom(c, lastEventId);

    if (deps.profileNames) {
      try {
        c.knownNames = [...(await deps.profileNames({ tenantId, studentId }))];
      } catch {
        c.knownNames = []; // like the text path: a failing profile port only costs name redaction
      }
    }
    if (!c.persistText) {
      try {
        await markChatThreadTextNotStored(c.db, { studentId, threadId });
      } catch (err) {
        logEvent("voice_mark_text_not_stored_failed", err);
      }
    }
    if (c.state !== "starting") return;

    let session: LiveSession;
    try {
      session = await deps.live.connect(liveConfig(c));
    } catch (err) {
      // A12: any Live failure, LiveConfigError included, is an error event; the thread and text chat are untouched.
      sendError(c, err instanceof LiveConfigError ? "live_config" : "live_unavailable");
      logEvent("voice_live_connect_failed", err);
      void finalize(c, 1011);
      return;
    }
    liveOpen++;
    if (c.state !== "starting") {
      // The socket went away during the connect: the provider session must not outlive it.
      try {
        session.close("client gone before start finished");
      } catch {
        // already closed
      }
      liveOpen--;
      return;
    }
    c.session = session;
    c.state = "active";
    cancel(c, c.startTimer);
    c.startTimer = undefined;
    c.startedAtMs = nowMs();
    c.capMs = Math.min(limits.voiceSessionMaxMinutes * 60_000, remainingMs);
    schedule(c, c.capMs, () => {
      sendError(c, "session_time_limit");
      void finalize(c, 1000);
    });
    armSilence(c);
  }

  async function handleConfirm(c: Conn, key: string, accepted: boolean): Promise<void> {
    const factId = c.pendingConfirms.get(key);
    if (factId === undefined || c.state !== "active") {
      sendError(c, "unknown_confirm");
      return;
    }
    c.pendingConfirms.delete(key);
    try {
      await decideProfileFact(c.db, { studentId: c.claims.studentId, factId, action: accepted ? "confirm" : "erase" }, { now: nowDate() });
    } catch (err) {
      if (err instanceof ProfileFactNotFoundError) {
        sendError(c, "unknown_confirm");
        return;
      }
      if (endIfFenced(c, err)) return;
      logEvent("voice_confirm_failed", err);
      sendError(c, "internal");
    }
  }

  async function handleMessage(c: Conn, data: RawData, isBinary: boolean): Promise<void> {
    if (c.state === "closing" || c.state === "closed") return;
    if (isBinary) {
      const bytes = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
      if (c.state !== "active" || !c.session) {
        if (!c.notStartedWarned) {
          c.notStartedWarned = true;
          sendError(c, "not_started");
        }
        return;
      }
      try {
        c.session.sendAudio(new Uint8Array(bytes)); // a copy: the frame buffer belongs to the socket library
      } catch (err) {
        if ((err as { name?: string }).name === "LiveSessionClosedError") return;
        if ((err as { name?: string }).name === "LiveAudioFormatError") sendError(c, "bad_audio");
        else sendError(c, "live_error");
      }
      return;
    }
    let parsedJson: unknown;
    try {
      const raw = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
      parsedJson = JSON.parse(raw.toString("utf8"));
    } catch {
      return badClientMessage(c);
    }
    const parsed = VoiceClientEventSchema.safeParse(parsedJson);
    if (!parsed.success) return badClientMessage(c);
    const ev = parsed.data;
    switch (ev.type) {
      case "start":
        await handleStart(c, ev.threadId, ev.lastEventId);
        return;
      case "interrupt":
        if (c.state !== "active" || !c.session) {
          sendError(c, "not_started");
          return;
        }
        armSilence(c);
        try {
          c.session.interrupt();
        } catch (err) {
          logEvent("voice_interrupt_failed", err);
        }
        return;
      case "end":
        await finalize(c, 1000);
        return;
      case "confirm":
        armSilence(c);
        await handleConfirm(c, ev.key, ev.accepted);
        return;
    }
  }

  function badClientMessage(c: Conn): void {
    sendError(c, "bad_event");
    if (++c.invalid > MAX_INVALID_CLIENT_MESSAGES) void finalize(c, 1008);
  }

  function onConnection(ws: WebSocket, claims: VoiceTokenClaims): void {
    const c: Conn = {
      ws,
      claims,
      db: deps.dbForTenant(claims.tenantId),
      key: `${claims.tenantId}\u0000${claims.studentId}`,
      state: "awaiting_start",
      seq: 0,
      log: [],
      persistText: !claims.minor || claims.guardianConsent,
      knownNames: [],
      timers: new Set(),
      chain: Promise.resolve(),
      queuedBytes: 0,
      invalid: 0,
      notStartedWarned: false,
      lastAtMs: 0,
      turnBySeq: new Map(),
      flagsSent: new Set(),
      pendingConfirms: new Map(),
    };
    conns.add(c);
    armStartTimer(c);
    ws.on("message", (data, isBinary) => {
      const size = Array.isArray(data) ? data.reduce((n, b) => n + b.byteLength, 0) : data.byteLength;
      c.queuedBytes += size;
      if (c.queuedBytes > VOICE_MAX_QUEUED_BYTES) {
        void finalize(c, 1009);
        return;
      }
      c.chain = c.chain
        .then(() => handleMessage(c, data, isBinary))
        .catch((err) => {
          logEvent("voice_message_failed", err);
          sendError(c, "internal");
        })
        .finally(() => {
          c.queuedBytes -= size;
        });
    });
    ws.on("close", () => void finalize(c, 1000));
    ws.on("error", (err: Error & { code?: string }) => {
      // An oversize frame: the library has already started a close with 1009; terminating here would turn that into a bare 1006.
      if (err.code !== "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH") {
        try {
          ws.terminate();
        } catch {
          // already gone
        }
      }
      void finalize(c, err.code === "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH" ? 1009 : 1006);
    });
    if (shuttingDown) void finalize(c, 1001);
  }

  // -- the upgrade ----------------------------------------------------------

  function refuse(socket: Duplex, status: number, text: string): void {
    try {
      socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n${status === 401 ? 'WWW-Authenticate: Bearer realm="vc-api"\r\n' : ""}\r\n`);
    } catch {
      // the peer is already gone
    }
    socket.destroy();
  }

  function tokenFrom(req: IncomingMessage): string | undefined {
    const auth = bearerToken(typeof req.headers.authorization === "string" ? req.headers.authorization : undefined);
    if (auth !== undefined) return auth;
    const proto = req.headers["sec-websocket-protocol"];
    if (typeof proto !== "string") return undefined;
    const hit = proto.split(",").map((p) => p.trim()).find((p) => p.startsWith(VOICE_WS_TOKEN_PROTOCOL_PREFIX));
    return hit === undefined ? undefined : hit.slice(VOICE_WS_TOKEN_PROTOCOL_PREFIX.length);
  }

  function preStartSockets(key: string): number {
    let n = 0;
    for (const c of conns) if (c.key === key && (c.state === "awaiting_start" || c.state === "starting")) n++;
    return n;
  }

  async function doUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    if (shuttingDown) return refuse(socket, 503, "Service Unavailable");
    const pathname = pathOf({ url: req.url ?? "/" });
    const m = pathname === undefined ? null : STREAM_RE.exec(pathname);
    if (!m || (req.method ?? "GET").toUpperCase() !== "GET") return refuse(socket, 404, "Not Found");
    const origin = req.headers.origin;
    if (deps.allowedOrigins && deps.allowedOrigins.length > 0 && typeof origin === "string" && !deps.allowedOrigins.includes(origin)) {
      return refuse(socket, 403, "Forbidden");
    }
    const token = tokenFrom(req);
    if (token === undefined) return refuse(socket, 401, "Unauthorized");
    const claims = await verifyVoiceToken(deps.wsSecret, token, nowMs());
    // The path names the student and thread the token was minted for. A token for anyone else is the same 401.
    if (!claims || claims.studentId !== m[1] || claims.threadId !== m[2]) return refuse(socket, 401, "Unauthorized");
    // Single use: checked and marked in one synchronous step, so two concurrent upgrades with one token cannot both pass.
    const nowSec = Math.floor(nowMs() / 1000);
    for (const [jti, exp] of usedTokens) {
      if (exp > nowSec) break; // every token lives the same time, so insertion order is expiry order
      usedTokens.delete(jti);
    }
    if (usedTokens.has(claims.jti)) return refuse(socket, 401, "Unauthorized");
    if (usedTokens.size >= VOICE_MAX_USED_TOKENS || conns.size >= maxSockets) return refuse(socket, 503, "Service Unavailable");
    // One student may hold only a few sockets that have not started: the token is not spent when this refuses.
    if (preStartSockets(`${claims.tenantId}\u0000${claims.studentId}`) >= VOICE_MAX_PRESTART_SOCKETS_PER_STUDENT) return refuse(socket, 429, "Too Many Requests");
    usedTokens.set(claims.jti, claims.exp);
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, claims));
  }

  function upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    socket.on("error", () => socket.destroy());
    doUpgrade(req, socket, head).catch((err) => {
      logEvent("voice_upgrade_failed", err);
      refuse(socket, 500, "Internal Server Error");
    });
  }

  // -- the session route ----------------------------------------------------

  async function readEmptyBody(req: ApiRequest): Promise<boolean> {
    let raw: string;
    try {
      raw = await req.readBody(1024);
    } catch (err) {
      if (err instanceof BodyTooLargeError) return false;
      throw err;
    }
    const trimmed = raw.trim();
    if (trimmed === "") return true;
    try {
      const v: unknown = JSON.parse(trimmed);
      return typeof v === "object" && v !== null && !Array.isArray(v) && Object.keys(v).length === 0;
    } catch {
      return false;
    }
  }

  async function handleSession(req: ApiRequest): Promise<ApiResponse> {
    const pathname = pathOf(req);
    if (pathname === undefined) return fail(400, "invalid_request");
    const m = SESSION_RE.exec(pathname);
    if (!m) return NOT_FOUND();
    if (req.method.toUpperCase() !== "POST") return fail(405, "method_not_allowed", { allow: "POST" });

    const header = req.headers.authorization;
    const token = bearerToken(typeof header === "string" ? header : undefined);
    if (token === undefined) return UNAUTHORIZED();
    let ctx: StudentAuthContext;
    try {
      ctx = await deps.verifier.verify(token);
    } catch (err) {
      if (!(err instanceof AuthError)) throw err;
      return err.reason === "role" ? fail(403, "forbidden") : UNAUTHORIZED();
    }
    if (deps.sandboxTenantId !== undefined && ctx.tenantId === deps.sandboxTenantId && !isSyntheticStudentId(ctx.studentId)) return fail(403, "sandbox_synthetic_only");
    // The token's student is the only student this token may act for; anything else looks like a missing resource.
    if (m[1] !== ctx.studentId) return NOT_FOUND();
    const threadId = m[2]!;
    // D-088 Q5, same limiter and 30/min default as the text route: a student cannot mint tokens (and so open sockets) without bound.
    const limit = resolveLimits(deps.limitsForTenant?.(ctx.tenantId)).requestsPerMinute;
    const verdict = limiterFor(limit).check(`${ctx.tenantId}\u0000${ctx.studentId}`);
    if (!verdict.allowed) return fail(429, "rate_limited", { "retry-after": String(verdict.retryAfterSec) });
    if (!(await readEmptyBody(req))) return fail(400, "invalid_request");

    const db = deps.dbForTenant(ctx.tenantId);
    const now = nowDate();
    if (await isStudentFenced(db, ctx.studentId, now)) return fail(409, "student_fenced");
    if ((await getChatThread(db, { studentId: ctx.studentId, threadId })) === null) return NOT_FOUND();

    // A23: a student at the monthly limit gets no session (text continues). The same check runs again at `start`.
    const limits = resolveLimits(deps.limitsForTenant?.(ctx.tenantId));
    const used = (await getStudentUsage(db, { studentId: ctx.studentId, month: usageMonth(now) })).voiceMs;
    const remainingMs = limits.voiceMinutesPerMonth * 60_000 - used;
    if (remainingMs <= 0) {
      const nextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
      return fail(429, "voice_quota_exceeded", { "retry-after": String(Math.max(1, Math.ceil((nextMonth - now.getTime()) / 1000))) });
    }

    const minted = await mintVoiceToken(deps.wsSecret, ctx, threadId, nowMs());
    return respond(
      201,
      VoiceSessionResponseSchema.parse({
        token: minted.token,
        wsUrl: `${wsBase}/v1/students/${encodeURIComponent(ctx.studentId)}/chat/threads/${encodeURIComponent(threadId)}/voice/stream`,
        expiresAt: new Date(minted.exp * 1000).toISOString(),
        sessionMaxMinutes: Math.max(1, Math.min(limits.voiceSessionMaxMinutes, Math.ceil(remainingMs / 60_000))),
        audio: limits.audio,
      }),
    );
  }

  const handler: ApiHandler = async (req) => {
    try {
      return await handleSession(req);
    } catch (err) {
      if (err instanceof StudentFencedError) return fail(409, "student_fenced");
      logEvent("voice_request_failed", err);
      return fail(500, "internal");
    }
  };

  return {
    handler,
    upgrade,
    stats: () => ({
      sockets: conns.size,
      activeSessions: activeByStudent.size,
      liveSessions: liveOpen,
      timers: allTimers.size,
      retainedLogs: retained.size,
      usedTokens: usedTokens.size,
    }),
    settled: async () => {
      while (pendingFinalizers.size > 0) await Promise.all([...pendingFinalizers]);
    },
    close: async () => {
      shuttingDown = true;
      for (const c of [...conns]) void finalize(c, 1001);
      while (pendingFinalizers.size > 0) await Promise.all([...pendingFinalizers]);
      if (pruneTimer !== undefined) pruneTimerApi.clearTimeout(pruneTimer);
      pruneTimer = undefined;
      retained.clear(); // nothing is resumable after shutdown, so no transcript events are kept
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}
