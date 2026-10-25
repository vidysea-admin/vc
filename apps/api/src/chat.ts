/**
 * P1 U8 (plan row U8; contract B21 student routes, B24; spec A6, A16b, A20, A23; D-093 items 4A, 6A, 11): the authenticated student chat
 * routes, behind their own handler and their own student JWT.
 *
 *   POST /v1/students/{studentId}/chat/threads                                  start a thread (201 {threadId})
 *   GET  /v1/students/{studentId}/chat/threads/{threadId}                        the thread's history
 *   POST /v1/students/{studentId}/chat/threads/{threadId}/turns                  one text turn, idempotent on clientTurnId
 *   GET  /v1/students/{studentId}/chat/profile                                   facts in use + facts proposed for confirmation
 *   POST /v1/students/{studentId}/chat/profile/facts/{factId}/decision           confirm | correct | erase
 *
 * New file, on purpose: server.ts's createApiHandler is the COUNSELLOR surface (counsellor JWT, `graphForTenant` is the scribe graph).
 * A student route needs a different verifier (role "student", its own issuer/audience), a different graph (the U6 student graph) and its own
 * go-live flag, so it lives behind its own dependency type, like anonymous.ts. It reuses server.ts's `respond`, `ApiRoute`, `BodyTooLargeError`
 * and PATH_ID_PATTERN, the U6 student graph unchanged, and the @vc/db student store (this file never names a collection).
 *
 * What is guaranteed here, and what is not:
 *  - OFF by default. `createChatApi` returns `undefined` unless VC_CHAT_ENABLED=true; when on it calls the A20 go-live gate
 *    (`assertGoLive(..., "student-routes")`) and refuses to start with tracing on. A disabled route is not served: it falls through to the
 *    main handler like any unknown /v1 path.
 *  - Identity comes from the student token only (tenant, student, minor, guardian consent). A body never carries it (strict schemas), the path
 *    studentId must equal the token's, and the data layer is a tenant-scoped Db, so a tenant cannot reach another's rows (B12).
 *  - D-093 6A: stored text is REDACTED (email, phone, self-stated and Pathlynks-known names) before it is written; the live turn may still go
 *    to the model unredacted. Name redaction is a heuristic: over-redaction is accepted, an unannounced name can be missed.
 *  - D-093 4A: an under-18 student without a boolean-true guardian-consent claim (and any student whose age is not known: fail closed) gets
 *    NO model call (p1-lk9 C1): an ordinary text is answered with the fixed guardian-consent reply (`GUARDIAN_CONSENT_REPLY`), and a crisis or
 *    concern text with the vetted crisis message (the guard runs first, on the original text; the crisis node makes no model call). No turn text,
 *    answer, extracted fact or escalation record is written; the thread keeps only a text-free marker. Such a turn has no idempotent replay
 *    (a retry is answered again). Ids-and-time-only rows (safety flags, usage counters, gap counts) are kept.
 *  - A23: 30 requests per minute per student (per-tenant override); crisis text is never limited. The limiter is per process (in memory).
 *  - p1-u8r M2: a crisis message is always answered with the helpline, but its WRITES are bounded: per student and thread, the first crisis
 *    turn in a 10-minute window is stored, flagged, escalated and counted; the rest of the window is answered and stores no text. A turn whose
 *    flag or escalation write failed gives its slot back. The window is per process (in memory), like the limiter.
 *  - Cycle 1 H1: the slot is ranked by level (concern < crisis). A turn of a HIGHER level than the holder's (concern, then crisis) always runs
 *    the full path (stored, flagged, escalated, counted) and takes the slot over; only a turn of equal or lower level is quiet.
 *  - Cycle 1 race: a quiet turn that finds the holder not yet confirmed (in flight, or failed) writes a flag-only row (ids, kind, time; no text),
 *    so no crisis turn is ever unrecorded. A retry of a completed crisis turn (same clientTurnId and text) is replayed, never re-run.
 *  - p1-u8r M1: when the Pathlynks profile cannot be read, a name from it cannot be redacted, so an ordinary turn is refused 503 before any
 *    write, and a crisis turn is answered and escalated but its text is not stored. Stored text never fails open. One known gap (cycle 1,
 *    accepted, open risk in the manifest): the escalation text of a crisis turn during an outage is redacted without the profile name, because that
 *    name is unknown, so a profile-only name in that text can reach the escalation path and the classifier rationale it stores.
 *  - p1-u8r item 5: the escalation path (and so the classifier rationale it stores) is handed REDACTED text; if redacting would hide the
 *    crisis wording from the guard, the least-redacted text that still shows it is used (an escalation is never lost for privacy).
 *  - w1-chat-privacy (ISS-157, ISS-152): crisis writes are also bounded PER STUDENT across threads (CRISIS_MAX_WRITES_PER_STUDENT per window, including
 *    textless turns); past the budget a turn is answered with the helpline and writes nothing, and the first crisis turn of a window is never blocked.
 *    The escalation text is never the raw text: its last resort keeps only the email and phone redaction.
 *  - p1-lk9 C2: fact extraction (a model call) runs AFTER the reply, detached: the reply does not wait for it, and its failure (including a fence
 *    refusal after an erasure began) is one text-free log line (`chat_fact_extraction_failed` / `chat_fact_extraction_fenced`), never a turn error.
 *    A proposed fact therefore shows on GET .../chat/profile a moment after the turn, not with it.
 *  - The Pathlynks profile arrives through a port; there is no real integration here, and no voice route (U10).
 *  - p1-u6w: when the graph picks `rank_options`, the reply is ranked by the U6b `rankOptions` over THIS tenant's and THIS student's facts (their
 *    confirmed chat facts and the Pathlynks profile), through `deps.ranking`. Absent `deps.ranking`, the reply is the plain graph answer. The db
 *    label of a confirmed chat fact ("chat") is mapped to the ranker's "student-confirmed" in ONE place (`rankFactFromStored`, ISS-163); a
 *    proposed fact or any other label stays unmapped and is ignored by the ranker. Every per-option number carries "NOT PROVEN" (D-097 item 3,
 *    ISS-167: the real source of cost, scholarship chance and visa ease is not proven). A ranking failure never fails the turn: the plain reply
 *    is returned and one text-free `chat_rank_failed` line names the error class. Anonymous mode (anonymous.ts) has no such port.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import type { tenantScopedDb } from "@vc/db";
import {
  FencedWriterDeadlineError,
  ChatThreadNotFoundError,
  ChatTurnConflictError,
  ChatTurnLeaseLostError,
  ProfileFactNotFoundError,
  StudentFencedError,
  abandonChatTurn,
  claimChatTurn,
  completeChatTurn,
  createChatThread,
  decideProfileFact,
  getChatThread,
  incrementGapCount,
  listChatTurns,
  listProfileFacts,
  listStudentFlags,
  markChatThreadTextNotStored,
  proposeProfileFact,
  recordStudentFlag,
  recordStudentUsage,
  type ProfileFactDoc,
} from "@vc/db";
import {
  FactDecisionRequestSchema,
  MAX_TURN_TEXT_LENGTH,
  ProfileResponseSchema,
  ThreadCreatedSchema,
  ThreadSchema,
  TurnRequestSchema,
  TurnResponseSchema,
  isSyntheticStudentId,
  redactPii,
  resolveLimits,
  type ProfileFact,
  type TurnResponse,
} from "@vc/schemas";
import {
  StudentInputInvalidError,
  TELE_MANAS_LINE,
  crisisGuard,
  rankOptions,
  runStudentTurn,
  type OptionDataPort,
  type RankFactInput,
  type SpeakersFile,
  type StudentGraphConfig,
  type StudentGraphDeps,
  type StudentKbPort,
} from "@vc/engine";
import { emitEngineeringAlert, type EngineeringAlert, type GroundingBudget, type LlmProvider } from "@vc/providers";
import { AnonymousRateLimiter } from "./anonymous.js";
import { AuthError, bearerToken, type StudentAuthContext, type StudentJwtVerifier } from "./auth.js";
import { GATE_APPROVER_ENV, assertGoLive } from "./go-live-gate.js";
import { PartnerRegistryUnavailableError, isPartnerKeyToken, partnerStudentFromHeaders, type PartnerRegistry } from "./partners.js";
import { BodyTooLargeError, PATH_ID_PATTERN, respond, type ApiHandler, type ApiRequest, type ApiResponse, type ApiRoute } from "./server.js";

type Db = ReturnType<typeof tenantScopedDb>;

/** The explicit A20 config flag. Default off. */
export const CHAT_FLAG_ENV = "VC_CHAT_ENABLED";
/**
 * ISS-303 (D-103): 64 KiB, the same scan budget as the anonymous route (MAX_ANONYMOUS_BODY_BYTES, ISS-135/ISS-300): about 16 times the
 * 4000-character turn limit, so a crisis phrase anywhere in an over-long message is still scanned. The crisis scan runs before the limiter
 * (A23), so it is unlimited per student; the cap bounds its CPU per request (it was 256 KiB, 40-210 ms each). A larger body is a 413 on the
 * turn route that still carries the helpline, and is never scanned.
 */
export const MAX_CHAT_BODY_BYTES = 64 * 1024;
export const CHAT_WINDOW_MS = 60_000;
export const CHAT_MAX_LIMITER_KEYS = 100_000;
/** p1-u8r M2: per student and thread, one crisis turn in this window is stored, flagged, escalated and counted (a turn of a higher level than the holder's runs in full and takes over the slot: cycle 1 H1). */
export const CRISIS_WRITE_WINDOW_MS = 10 * 60_000;
export const CRISIS_MAX_TRACKED_THREADS = 100_000;
/**
 * w1-chat-privacy (ISS-157): a separate, per-student crisis write budget over the same window, across threads. The per-thread slot alone leaves crisis
 * writes unbounded (a student can open a thread per request, and a textless crisis turn never confirms a slot). A turn that would write (store, flag,
 * escalate, count) spends one unit; past the budget the turn is answered with the helpline and writes nothing. The first crisis turn of a window is never blocked.
 */
export const CRISIS_MAX_WRITES_PER_STUDENT = 10;
/** p1-u8r cycle 2: a crisis turn behind an unconfirmed holder waits at most this long for it, then escalates itself. */
export const CRISIS_QUIET_WAIT_MS = 5_000;
const LEVEL_RANK = { none: 0, concern: 1, crisis: 2 } as const;
/** p1-lk9 C1: the fixed reply to an ordinary turn from a student without guardian consent (no model is called). Student-facing; carries the helpline. */
export const GUARDIAN_CONSENT_REPLY = `To chat with me, a parent or guardian needs to give consent first. Please ask them to allow it in your account, then come back. ${TELE_MANAS_LINE}`;
/** Chat-extracted facts kept per turn (a model cannot flood a student's profile). */
export const MAX_PROPOSED_FACTS_PER_TURN = 5;

/** The closed list of chat routes; equals the draft's student paths minus voice (a test keeps them equal). */
export const CHAT_ROUTES: readonly ApiRoute[] = Object.freeze(
  (
    [
      ["createChatThread", "POST", "/v1/students/{studentId}/chat/threads"],
      ["getChatThread", "GET", "/v1/students/{studentId}/chat/threads/{threadId}"],
      ["postChatTurn", "POST", "/v1/students/{studentId}/chat/threads/{threadId}/turns"],
      ["getChatProfile", "GET", "/v1/students/{studentId}/chat/profile"],
      ["decideProfileFact", "POST", "/v1/students/{studentId}/chat/profile/facts/{factId}/decision"],
    ] as const
  ).map(([id, method, path]) => ({ id, method, path, roles: "student" }) as unknown as ApiRoute),
);

/** The Pathlynks profile port failed. A 503: an empty profile would hide what is in use. Carries no cause. */
export class ChatProfileUnavailableError extends Error {
  constructor() {
    super("ChatProfileUnavailableError: the Pathlynks profile could not be read");
    this.name = "ChatProfileUnavailableError";
  }
}

export class ChatConfigError extends Error {
  constructor(message: string) {
    super(`ChatConfigError: ${message}`);
    this.name = "ChatConfigError";
  }
}

/** Reads the flag: unset, empty and "false" are off; exactly "true" is on; anything else is a config error (never a silent on or off). */
export function chatEnabledFromEnv(env: Record<string, string | undefined>): boolean {
  const raw = env[CHAT_FLAG_ENV]; // exact, like voice: no trim, so " true" or "false " is a config error, never a silent on or off
  if (raw === undefined || raw === "" || raw === "false") return false;
  if (raw === "true") return true;
  throw new ChatConfigError(`${CHAT_FLAG_ENV} must be "true" or "false" (got a different value)`);
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/** The Pathlynks-supplied profile (read live; never stored by this service). A failing port is a 503, not an empty profile. */
export interface PathlynksProfilePort {
  facts(who: { tenantId: string; studentId: string }): Promise<readonly ProfileFact[]>;
}

/** Proposes facts heard in a stored turn. Receives the live (unredacted) text; whatever it returns is redacted before it is stored. */
export type FactExtractor = (turn: {
  tenantId: string;
  studentId: string;
  threadId: string;
  turnId: string;
  text: string;
  response: TurnResponse;
}) => Promise<ReadonlyArray<{ key: string; value: string; quote?: string; sourceLang?: string }>>;

/** The label every number the ranking puts in front of a student carries until its data source is proven (D-097 item 3, ISS-167). */
export const NOT_PROVEN_LABEL = "NOT PROVEN";
const NL2 = "\n\n";
const NOT_PROVEN_NOTICE = `${NOT_PROVEN_LABEL}: the cost, scholarship chance and visa ease figures shown for each option do not come from a verified data source yet. Check them yourself before relying on them; the decision is yours.`;

/**
 * ISS-163, the ONE mapping from the db's label to the ranker's. `proposeProfileFact` stores every chat fact with source "chat"; once the student
 * confirms it (status "confirmed") it is the student's own fact, which the ranker knows as "student-confirmed". Nothing else is relabelled: a
 * proposed fact stays "chat" and any other label is passed through, so the ranker ignores them and counts them.
 */
export function rankFactFromStored(f: Pick<ProfileFactDoc, "key" | "value" | "status" | "source">): RankFactInput {
  const confirmedInChat = f.source === "chat" && f.status === "confirmed";
  return { key: f.key, value: f.value, source: confirmedInChat ? "student-confirmed" : f.source, status: f.status };
}

/** P1 U6w: what the chat path needs to rank options. The option list is the caller's (Q-U6b-2 is undecided); the option data is fixture-backed until a real source is proven. */
export interface ChatRankingDeps {
  port: OptionDataPort;
  /** The option ids to compare for this student. Empty = nothing to rank (the plain reply is returned). */
  optionIds(who: { tenantId: string; studentId: string }): readonly string[] | Promise<readonly string[]>;
  /** Unvalidated per-tenant weight vector; absent = the default student-success weights. */
  weightsForTenant?(tenantId: string): unknown;
}

export type ChatLogLine = { level: "error"; event: string; ts: string; status?: number; error?: string; write?: string };

export interface ChatApiDeps {
  verifier: StudentJwtVerifier;
  /**
   * pc-partner-keys K3 (D-111): the partner registry. A bearer that starts with `vck_` is a partner key (never a JWT): the partner's backend vouches for the student
   * with X-VC-Student-Id / X-VC-Student-Age / X-VC-Guardian-Consent, and the tenant is the partner's id, so one partner can never reach another's students. Absent: a
   * `vck_` bearer is a 401. The JWT path is unchanged.
   */
  partners?: Pick<PartnerRegistry, "authenticate">;
  /** The tenant-scoped `virtual_counsellor` Db. Called only after the student token verified. */
  dbForTenant(tenantId: string): Db;
  kb: StudentKbPort;
  provider: LlmProvider;
  skillsDir: string;
  speakers: SpeakersFile;
  profile?: PathlynksProfilePort;
  extractFacts?: FactExtractor;
  /** p1-u6w: when set, a `rank_options` turn is answered with the ranked options. */
  ranking?: ChatRankingDeps;
  /** The tenant's escalation path (production: `(i) => escalateTurns(db, i, escalationDeps)`). Never used for an unconsented minor. */
  escalateForTenant?(tenantId: string, db: Db): StudentGraphDeps["escalate"];
  /** A6: this tenant accepts only `syn-` student ids. */
  sandboxTenantId?: string;
  /** Per-tenant override of the D-088 limits (only `requestsPerMinute` is read). */
  limitsForTenant?(tenantId: string): Parameters<typeof resolveLimits>[0];
  config?: Partial<StudentGraphConfig>;
  /**
   * P1 LK7 (D-105): the language and safety parts of the student graph's deps, passed through unchanged to every variant of the graph
   * (the model language detector, the reply-language allow-list, the LK5 safety screen). Absent = the offline script test and no screen.
   */
  graph?: Pick<StudentGraphDeps, "detectLanguage" | "replyLangs" | "safetyScreen" | "grounding">;
  /** H6: per-thread and per-day cap on grounded calls (and the spend guard); over a cap the turn falls back to the model-only guidance. Absent = uncapped. */
  groundingBudget?: GroundingBudget;
  now?: () => Date;
  nowMs?: () => number;
  /** p1-u8r cycle 2: how long a crisis turn waits for an unconfirmed slot holder before it escalates itself (default CRISIS_QUIET_WAIT_MS). */
  quietWaitMs?: number;
  /** w1-chat-privacy (ISS-157): crisis turns per student per window that may write (default CRISIS_MAX_WRITES_PER_STUDENT). */
  crisisWritesPerStudent?: number;
  /** Text-free server-side failure log. Default: one JSON line on stderr. */
  log?: (line: ChatLogLine) => void;
  /** P1 alerts A1 (D-108 item 7): the engineering-alert sink. Default: the T-021 mechanism (`emitEngineeringAlert`: stderr line plus a Langfuse error span). */
  alert?: (alert: EngineeringAlert) => void;
}

/** A1: at most one safety-screen outage alert per this many ms per process, so a long outage is one page, not one per student turn. */
export const SAFETY_SCREEN_ALERT_INTERVAL_MS = 5 * 60_000;

export interface ChatRouteConfig {
  /** From `chatEnabledFromEnv`. False -> `createChatApi` builds nothing. */
  enabled: boolean;
  gatesDir: string;
  now?: Date;
  approver?: string;
  /** Environment checked for LangChain/LangSmith tracing switches. Default: process.env. */
  env?: Record<string, string | undefined>;
}

const TRACING_VARS = ["LANGSMITH_TRACING", "LANGSMITH_TRACING_V2", "LANGCHAIN_TRACING", "LANGCHAIN_TRACING_V2"] as const;

/** The pre-connect checks of `createChatApi` (startApi runs them before it opens a Mongo connection): the A20 gate and tracing off. */
export function assertChatGoLive(route: Pick<ChatRouteConfig, "gatesDir" | "now" | "approver" | "env">): void {
  // pc-hardening-4 P1 (ISS-pc-hardening-3-1, the chat twin of pc-hardening-3 K3): the approver comes from the env the caller passed (the one startApi reads everything else from);
  // process.env is the fallback only when no env was passed. The "" (never undefined) stops assertGoLive's own process.env default from being re-read here.
  const env = route.env ?? process.env;
  assertGoLive(route.gatesDir, "student-routes", route.now, route.approver ?? env[GATE_APPROVER_ENV] ?? "");
  for (const name of TRACING_VARS) {
    if (/^(true|1|yes|on)$/i.test(env[name]?.trim() ?? "")) {
      throw new ChatConfigError(`${name} switches request tracing on; chat stores redacted text only, and a trace would hold the unredacted text, so the routes will not start`);
    }
  }
}

function defaultLog(line: ChatLogLine): void {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(line));
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

const SEG = "([A-Za-z0-9][A-Za-z0-9._-]{0,127})";
type RouteId = "createChatThread" | "getChatThread" | "postChatTurn" | "getChatProfile" | "decideProfileFact";
const MATCHERS: ReadonlyArray<{ id: RouteId; method: "GET" | "POST"; re: RegExp; names: readonly string[] }> = [
  { id: "createChatThread", method: "POST", re: new RegExp(`^/v1/students/${SEG}/chat/threads$`), names: ["studentId"] },
  { id: "getChatThread", method: "GET", re: new RegExp(`^/v1/students/${SEG}/chat/threads/${SEG}$`), names: ["studentId", "threadId"] },
  { id: "postChatTurn", method: "POST", re: new RegExp(`^/v1/students/${SEG}/chat/threads/${SEG}/turns$`), names: ["studentId", "threadId"] },
  { id: "getChatProfile", method: "GET", re: new RegExp(`^/v1/students/${SEG}/chat/profile$`), names: ["studentId"] },
  { id: "decideProfileFact", method: "POST", re: new RegExp(`^/v1/students/${SEG}/chat/profile/facts/${SEG}/decision$`), names: ["studentId", "factId"] },
];
const CHAT_PREFIX = /^\/v1\/students\/[^/]+\/chat(\/|$)/;

function pathOf(req: ApiRequest): string | undefined {
  try {
    return new URL(req.url, "http://vc-api.invalid").pathname;
  } catch {
    return undefined;
  }
}

/** Routes the chat paths to `chat` (when built) and everything else to the main handler untouched. */
export function withChatRoutes(main: ApiHandler, chat: ApiHandler | undefined): ApiHandler {
  if (!chat) return main;
  return (req) => {
    const pathname = pathOf(req);
    return pathname !== undefined && CHAT_PREFIX.test(pathname) ? chat(req) : main(req);
  };
}

interface Matched {
  id: RouteId;
  params: Record<string, string>;
}
function matchRoute(pathname: string, method: string): Matched | "method" | undefined {
  let sawPath = false;
  for (const m of MATCHERS) {
    const hit = m.re.exec(pathname);
    if (!hit) continue;
    sawPath = true;
    if (m.method !== method) continue;
    const params: Record<string, string> = {};
    m.names.forEach((n, i) => (params[n] = hit[i + 1]!));
    return { id: m.id, params };
  }
  return sawPath ? "method" : undefined;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

const NOT_FOUND = () => respond(404, { error: "not_found" });
const fail = (status: number, error: string, headers?: Record<string, string>): ApiResponse => respond(status, { error }, headers);

/** Known failures to fixed responses; null for an unexpected error (a logged 500). */
function mapError(err: unknown): ApiResponse | null {
  if (err instanceof StudentFencedError) return fail(409, "student_fenced");
  if (err instanceof FencedWriterDeadlineError) return fail(503, "writer_deadline");
  if (err instanceof ChatThreadNotFoundError || err instanceof ProfileFactNotFoundError) return NOT_FOUND();
  if (err instanceof ChatProfileUnavailableError) return fail(503, "profile_unavailable");
  if (err instanceof ChatTurnConflictError) return fail(409, "turn_id_conflict");
  if (err instanceof ChatTurnLeaseLostError) return fail(409, "turn_in_progress", { "retry-after": "2" });
  if ((err as { code?: unknown } | null)?.code === 11000) return fail(409, "conflict");
  return null;
}

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

interface Who {
  ctx: StudentAuthContext;
  db: Db;
  now: Date;
}

/**
 * Builds the chat handler, or `undefined` when `route.enabled` is false (nothing is built and the paths fall through to the main handler).
 * When enabled it first requires the A20 go-live gate (GoLiveRefusedError) and an environment with tracing off.
 */
export function createChatApi(deps: ChatApiDeps, route: ChatRouteConfig): ApiHandler | undefined {
  if (!route.enabled) return undefined;
  assertChatGoLive(route);
  const log = (line: ChatLogLine) => {
    try {
      (deps.log ?? defaultLog)(line);
    } catch {
      // a failing logger must not fail the request
    }
  };
  const nowDate = () => (deps.now ? deps.now() : new Date());
  const logEvent = (event: string, extra: Partial<ChatLogLine> = {}) => log({ level: "error", event, ts: nowDate().toISOString(), ...extra });
  // A1: the authenticated safety screen is down (every such student turn gets the fixed crisis message). The engineering alert carries no student
  // text and is rate limited per process; a throwing sink must not fail the turn, and the window opens even then so a broken sink is not retried per turn.
  let lastScreenAlertAt: number | undefined;
  const alertScreenOutage = () => {
    const at = nowDate().getTime();
    if (lastScreenAlertAt !== undefined && at - lastScreenAlertAt < SAFETY_SCREEN_ALERT_INTERVAL_MS) return;
    lastScreenAlertAt = at;
    try {
      (deps.alert ?? emitEngineeringAlert)({ event: "alert_safety_screen_outage", attributes: { write: "safety_screen" } });
    } catch {
      // alerting must never fail a student turn
    }
  };

  // One limiter per distinct limit value (a tenant override makes a new one); the key is tenant + student, salted and hashed in the limiter.
  const limiters = new Map<number, AnonymousRateLimiter>();
  const limiterFor = (limit: number): AnonymousRateLimiter => {
    let l = limiters.get(limit);
    if (!l) {
      l = new AnonymousRateLimiter({ limit, windowMs: CHAT_WINDOW_MS, maxKeys: CHAT_MAX_LIMITER_KEYS, nowMs: deps.nowMs ?? Date.now });
      limiters.set(limit, l);
    }
    return l;
  };

  // p1-u8r M2: crisis writes are bounded per student and thread (in memory, oldest evicted). Map order is insertion order, so delete + set keeps it oldest-first.
  // Cycle 1 H1: the slot remembers the level of the turn that holds it. A turn of a HIGHER level (concern, then crisis) is never quiet: it runs the
  // full path and upgrades the slot, and if it then fails the previous holder's slot is put back. Only a turn of equal or lower level is quiet.
  // Cycle 2: `confirmed` is set only when the holder's flag went through AND its escalate port was really called and succeeded. A holder that cannot
  // escalate (textless: over-long, or an unconsented minor) takes rank 0, so any later concern or crisis takes over. A failed holder's slot is marked
  // `released` and is never put back. `done` settles true on confirmation and false on release; a turn behind an unconfirmed holder awaits it (bounded).
  interface CrisisSlot {
    until: number;
    rank: number;
    confirmed: boolean;
    released: boolean;
    done: Promise<boolean>;
    settle: (escalated: boolean) => void;
  }
  const crisisSlots = new Map<string, CrisisSlot>();
  const nowMs = () => (deps.nowMs ?? Date.now)();
  const quietWaitMs = deps.quietWaitMs ?? CRISIS_QUIET_WAIT_MS;
  const takeCrisisSlot = (key: string, rank: number): { holds: boolean; slot: CrisisSlot; prev?: CrisisSlot } => {
    const t = nowMs();
    const found = crisisSlots.get(key);
    const active = found !== undefined && found.until > t && !found.released ? found : undefined;
    if (active !== undefined && rank <= active.rank) return { holds: false, slot: active };
    crisisSlots.delete(key);
    while (crisisSlots.size >= CRISIS_MAX_TRACKED_THREADS) crisisSlots.delete(crisisSlots.keys().next().value as string);
    let settle!: (escalated: boolean) => void;
    const done = new Promise<boolean>((r) => (settle = r));
    const slot: CrisisSlot = { until: t + CRISIS_WRITE_WINDOW_MS, rank, confirmed: false, released: false, done, settle };
    crisisSlots.set(key, slot);
    return { holds: true, slot, ...(active !== undefined ? { prev: active } : {}) };
  };
  /** Gives the slot back after a failed holder; a slot another turn has taken over since is left alone, and the slot it replaced returns unless it failed too. */
  const releaseCrisisSlot = (key: string, slot: CrisisSlot, prev: CrisisSlot | undefined) => {
    slot.released = true;
    slot.settle(false);
    if (crisisSlots.get(key) !== slot) return;
    crisisSlots.delete(key);
    if (prev !== undefined && !prev.released && prev.until > nowMs()) crisisSlots.set(key, prev);
  };
  // w1-chat-privacy (ISS-157): the per-student write budget. Fixed window, oldest evicted (an eviction can only hand a student a fresh budget, never block one).
  const crisisBudgets = new Map<string, { used: number; until: number }>();
  const crisisWritesMax = Math.max(1, Math.floor(deps.crisisWritesPerStudent ?? CRISIS_MAX_WRITES_PER_STUDENT));
  /** Spends one write unit for this student; false when the window's budget is used up. */
  const takeCrisisBudget = (key: string): boolean => {
    const t = nowMs();
    const found = crisisBudgets.get(key);
    if (found !== undefined && found.until > t) {
      if (found.used >= crisisWritesMax) return false;
      found.used++;
      return true;
    }
    crisisBudgets.delete(key);
    while (crisisBudgets.size >= CRISIS_MAX_TRACKED_THREADS) crisisBudgets.delete(crisisBudgets.keys().next().value as string);
    crisisBudgets.set(key, { used: 1, until: t + CRISIS_WRITE_WINDOW_MS });
    return true;
  };
  /** True when the holder escalated within the bounded wait; false when it failed or is still in flight after it. */
  const awaitHolder = async (slot: CrisisSlot): Promise<boolean> => {
    if (slot.confirmed) return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<boolean>((r) => {
      timer = setTimeout(() => r(false), quietWaitMs);
      timer.unref?.();
    });
    try {
      return await Promise.race([slot.done, timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };

  // p1-u8r item 5: the redaction of the turn in flight, read by the cached `escalate` wrapper (the graph deps are shared across students).
  // Cycle 2: the same per-turn scope records whether this turn's escalate port was really called and succeeded.
  type Redactors = { full: (s: string) => string; minimal: (s: string) => string; escalated?: boolean };
  const redactionScope = new AsyncLocalStorage<Redactors>();
  const groundingThread = new AsyncLocalStorage<string>();
  /** The most redacted text that the crisis guard still reads as at least as serious as the original; the original only as a last resort. */
  const escalationText = (raw: string): string => {
    const r = redactionScope.getStore() ?? { full: (s: string) => redactPii(s).text, minimal: (s: string) => redactPii(s, { introductions: false }).text };
    const need = LEVEL_RANK[crisisGuard(raw).level];
    for (const candidate of [r.full(raw), r.minimal(raw)]) if (LEVEL_RANK[crisisGuard(candidate).level] >= need) return candidate;
    // w1-chat-privacy (ISS-152): never the raw text. A known-name token can itself be the crisis wording ("Kill"), which hides it from the guard in both
    // views above; the last resort keeps only the email and phone redaction (which cannot hide wording), so those never reach the classifier or its rationale.
    return redactPii(raw, { introductions: false }).text;
  };

  // The U6 graph deps, cached per tenant and per variant (the compiled graph is cached per deps object). `escalate` is absent in the
  // `textless` variant: an escalation record may keep text-derived rationale, which an unconsented minor's turn must not write.
  // The `quiet` variant (a crisis turn past its window's budget) writes no flag, escalation or gap: it only answers.
  type GraphVariant = "full" | "textless" | "quiet";
  const graphDepsCache = new Map<string, StudentGraphDeps>();
  const graphDepsFor = (tenantId: string, db: Db, variant: GraphVariant): StudentGraphDeps => {
    const key = `${tenantId}|${variant}`;
    let g = graphDepsCache.get(key);
    if (!g) {
      const inner = variant === "full" ? deps.escalateForTenant?.(tenantId, db) : undefined;
      const escalate: StudentGraphDeps["escalate"] | undefined = inner
        ? async (input) => {
            const out = await inner({ ...input, turns: input.turns.map((t) => ({ ...t, text: escalationText(t.text), translatedText: escalationText(t.translatedText) })) });
            const scope = redactionScope.getStore();
            if (scope !== undefined) scope.escalated = true;
            return out;
          }
        : undefined;
      g = {
        kb: deps.kb,
        provider: deps.provider,
        skillsDir: deps.skillsDir,
        speakers: deps.speakers,
        ...(deps.config ? { config: deps.config } : {}),
        ...(deps.graph?.detectLanguage ? { detectLanguage: deps.graph.detectLanguage } : {}),
        ...(deps.graph?.replyLangs ? { replyLangs: deps.graph.replyLangs } : {}),
        ...(deps.graph?.safetyScreen ? { safetyScreen: deps.graph.safetyScreen } : {}),
        ...(deps.graph?.grounding
          ? { grounding: deps.groundingBudget ? deps.groundingBudget.bind(deps.graph.grounding, () => groundingThread.getStore() ?? "unknown") : deps.graph.grounding }
          : {}),
        ...(deps.now ? { now: deps.now } : {}),
        ...(variant === "quiet" ? {} : { recordGap: () => incrementGapCount(db, { kind: "no_sourced_answer" }, { now: nowDate() }) }),
        ...(variant === "quiet"
          ? {}
          : { logFlag: (r: Parameters<NonNullable<StudentGraphDeps["logFlag"]>>[0]) => recordStudentFlag(db, { studentId: r.studentId, threadId: r.threadId, turnId: r.turnId, kind: "crisis" }, { now: new Date(r.at) }) }),
        ...(escalate ? { escalate } : {}),
        hasPriorFlag: async (t) => (await listStudentFlags(db, { studentId: t.studentId, threadId: t.threadId })).length > 0,
        onWriteError: (write) => {
          logEvent("chat_write_failed", { write });
          if (write === "safety_screen") alertScreenOutage();
        },
      };
      graphDepsCache.set(key, g);
    }
    return g;
  };

  async function pathwaysFacts(ctx: StudentAuthContext): Promise<ProfileFact[]> {
    if (!deps.profile) return [];
    let facts: readonly ProfileFact[];
    try {
      facts = await deps.profile.facts({ tenantId: ctx.tenantId, studentId: ctx.studentId });
    } catch {
      logEvent("chat_profile_unavailable");
      throw new ChatProfileUnavailableError();
    }
    return facts.map((f) => ({ key: f.key, value: f.value, source: "pathlynks" as const }));
  }

  async function readJson(req: ApiRequest, opts: { helpline?: boolean } = {}): Promise<{ ok: true; value: unknown } | { ok: false; res: ApiResponse }> {
    // ISS-303: on the turn route a refused (too large) body is not scanned, so the 413 itself carries the static helpline, as on the anonymous route.
    const tooLarge = (): { ok: false; res: ApiResponse } => ({ ok: false, res: opts.helpline ? respond(413, { error: "body_too_large", helpline: TELE_MANAS_LINE }) : fail(413, "body_too_large") });
    let raw: string;
    try {
      raw = await req.readBody(MAX_CHAT_BODY_BYTES);
    } catch (err) {
      if (err instanceof BodyTooLargeError) return tooLarge();
      throw err;
    }
    if (Buffer.byteLength(raw, "utf8") > MAX_CHAT_BODY_BYTES) return tooLarge();
    try {
      return { ok: true, value: JSON.parse(raw) };
    } catch {
      return { ok: false, res: fail(400, "invalid_request") };
    }
  }

  async function profileView({ ctx, db }: Who): Promise<ReturnType<typeof ProfileResponseSchema.parse>> {
    const stored = await listProfileFacts(db, { studentId: ctx.studentId });
    const confirmed = stored.filter((f) => f.status === "confirmed");
    const confirmedKeys = new Set(confirmed.map((f) => f.key));
    const supplied = (await pathwaysFacts(ctx)).filter((f) => !confirmedKeys.has(f.key));
    return ProfileResponseSchema.parse({
      facts: [...supplied, ...confirmed.map((f) => ({ key: f.key, value: f.value, source: rankFactFromStored(f).source as "student-confirmed" }))],
      proposed: stored.filter((f) => f.status === "proposed").map((f) => ({ factId: f.factId, key: f.key, value: f.value, status: "proposed" as const })),
    });
  }

  /** p1-u6w: the U6b ranking merged into a `rank_options` reply. Any failure returns the plain reply and logs the error class only (no profile text). */
  async function withRanking({ ctx, db }: Who, base: TurnResponse): Promise<TurnResponse> {
    const ranking = deps.ranking;
    if (!ranking) return base;
    try {
      const stored = await listProfileFacts(db, { studentId: ctx.studentId });
      const facts = [...(await pathwaysFacts(ctx)), ...stored.map(rankFactFromStored)];
      const optionIds = await ranking.optionIds({ tenantId: ctx.tenantId, studentId: ctx.studentId });
      const weights = ranking.weightsForTenant?.(ctx.tenantId);
      const r = rankOptions({ studentId: ctx.studentId, optionIds, facts, ...(weights !== undefined ? { weights } : {}) }, ranking.port);
      if (r.status === "refused") {
        if (r.reason !== "no_options") logEvent("chat_rank_refused", { error: r.reason });
        return base;
      }
      // A number with no proven source must not carry an attributed status (D-097 item 3): every ranked number is `unverified` and keeps the label.
      const claims = r.claims.map((c) => (c.kind === "number" ? { ...c, text: `${NOT_PROVEN_LABEL}: ${c.text}`, status: "unverified" as const } : c));
      const hasNumbers = claims.some((c) => c.kind === "number");
      const known = new Set(base.sources.map((s) => s.id));
      return TurnResponseSchema.parse({
        ...base,
        message: hasNumbers ? [base.message, NOT_PROVEN_NOTICE].filter(Boolean).join(NL2) : base.message,
        claims: [...base.claims, ...claims],
        sources: [...base.sources, ...r.sources.filter((s) => !known.has(s.id))],
        profileFactsUsed: r.profileFactsUsed,
        rankingProfile: r.rankingProfile,
      });
    } catch (err) {
      logEvent("chat_rank_failed", { error: err instanceof Error ? err.name : "error" });
      return base;
    }
  }

  /**
   * p1-lk9 C2: fact extraction for a completed, stored turn, detached from the reply. It can never fail, delay or reject the turn: every error
   * (the extractor, a fact write, a fence refusal after an erasure started, even the logger) ends in one text-free log line and nothing else.
   * The fence still protects the student: `proposeProfileFact` is a fenced writer, so an erasure that begins after the reply refuses the write.
   * `now` is the turn's own clock reading. The returned promise is never awaited (`void`) and always settles without a rejection.
   */
  function proposeFactsDetached(db: Db, now: Date, extract: FactExtractor, turn: Parameters<FactExtractor>[0]): void {
    const run = async (): Promise<void> => {
      try {
        const facts = await extract(turn);
        for (const f of facts.slice(0, MAX_PROPOSED_FACTS_PER_TURN)) {
          // p1-lk6: the English value is kept with the student's original-language quote (redacted by the db); neither is logged.
          await proposeProfileFact(
            db,
            { studentId: turn.studentId, key: f.key, value: f.value, ...(f.quote !== undefined ? { quote: f.quote } : {}), ...(f.sourceLang !== undefined ? { sourceLang: f.sourceLang } : {}), threadId: turn.threadId, turnId: turn.turnId },
            { now },
          );
        }
      } catch (err) {
        logEvent(err instanceof StudentFencedError || err instanceof FencedWriterDeadlineError ? "chat_fact_extraction_fenced" : "chat_fact_extraction_failed");
      }
    };
    void run().catch(() => undefined);
  }

  async function handleTurn(req: ApiRequest, who: Who, params: Record<string, string>): Promise<ApiResponse> {
    const { ctx, db, now } = who;
    const threadId = params.threadId!;
    const body = await readJson(req, { helpline: true });
    if (!body.ok) return body.res;
    const obj = body.value;
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return fail(400, "invalid_request");
    const text = (obj as { text?: unknown }).text;
    if (typeof text !== "string") return fail(400, "invalid_request");
    // An over-long message is refused, EXCEPT that a crisis phrase anywhere in it still gets the fixed crisis answer (U6h L5). That turn is never stored.
    // ISS-303: one scan of the full text serves both the over-long exception and the rate-limit exemption below (it was two scans of up to the cap).
    const level = crisisGuard(text).level;
    const overlong = text.length > MAX_TURN_TEXT_LENGTH;
    if (overlong && level === "none") return fail(400, "invalid_request");
    const bounded = overlong ? text.slice(0, MAX_TURN_TEXT_LENGTH) : text;
    const parsed = TurnRequestSchema.safeParse({ ...(obj as object), text: bounded });
    let clientTurnId: string | undefined;
    if (parsed.success && (parsed.data.clientTurnId === undefined || PATH_ID_PATTERN.test(parsed.data.clientTurnId))) {
      clientTurnId = parsed.data.clientTurnId;
    } else {
      // ISS-350 (D-104): the crisis exemption comes before the shape checks. A malformed body (unknown key, invalid clientTurnId) whose text is a
      // crisis or concern phrase is still answered and escalated from `text` alone (reusing the one scan above); the malformed fields are dropped,
      // never stored. A valid clientTurnId is kept. A benign text stays a plain 400.
      if (level === "none") return fail(400, "invalid_request");
      const supplied = (obj as { clientTurnId?: unknown }).clientTurnId;
      const salvaged = TurnRequestSchema.safeParse({ text: bounded, ...(typeof supplied === "string" && PATH_ID_PATTERN.test(supplied) ? { clientTurnId: supplied } : {}) });
      if (!salvaged.success) return fail(400, "invalid_request");
      clientTurnId = salvaged.data.clientTurnId;
    }

    // A23: a crisis message is never rate limited; the scan runs on the full text before the limiter is consulted.
    const crisis = level !== "none";
    if (!crisis) {
      const limited = limitCheck(ctx);
      if (limited) return limited;
    }

    const thread = await getChatThread(db, { studentId: ctx.studentId, threadId });
    if (!thread) return NOT_FOUND();

    // D-093 6A: the Pathlynks name is redacted from stored text. If the profile cannot be read, that name is unknown, so redaction must not
    // fail open (p1-u8r M1): an ordinary turn is refused before anything is written, and a crisis turn is answered but stores no text.
    let knownNames: string[] = [];
    let profileDown = false;
    if (deps.profile) {
      try {
        knownNames = (await pathwaysFacts(ctx)).filter((f) => /name/i.test(f.key)).map((f) => f.value);
      } catch (err) {
        if (!(err instanceof ChatProfileUnavailableError)) throw err;
        profileDown = true;
      }
    }
    if (profileDown && !crisis) return fail(503, "profile_unavailable");

    // p1-u8r M2: one stored, flagged, escalated crisis turn per student and thread per window; the rest are answered and write nothing.
    const slotKey = crisis ? sha256(`${ctx.tenantId}\u0000${ctx.studentId}\u0000${threadId}`) : undefined;
    // Cycle 2 item 1: a turn that has no escalate port (textless: unconsented minor or over-long) holds the slot at rank 0, so it never silences
    // a concern or crisis turn that can escalate.
    const consentOk = !ctx.minor || ctx.guardianConsent;
    const slotRank = consentOk && !overlong ? LEVEL_RANK[level] : 0;
    let taken = slotKey !== undefined ? takeCrisisSlot(slotKey, slotRank) : undefined;
    // Cycle 2 item 3: behind an unconfirmed holder a turn waits (bounded) for it. If the holder failed it takes the slot; if the slot is still not
    // confirmed it runs the full path itself without the slot ("loose"). A turn is quiet only behind a holder that really escalated.
    let loose = false;
    if (slotKey !== undefined && taken !== undefined && !taken.holds && !(await awaitHolder(taken.slot))) {
      taken = takeCrisisSlot(slotKey, slotRank);
      if (!taken.holds && !taken.slot.confirmed) loose = true;
    }
    const holdsSlot = taken?.holds === true;
    // w1-chat-privacy (ISS-157): a turn that would write spends the student's window budget (tenant + student, across threads). Past it the turn is
    // quiet: answered with the helpline, nothing written, and a slot it took is given back below.
    const overBudget = slotKey !== undefined && (holdsSlot || loose) && !takeCrisisBudget(sha256(`budget\u0000${ctx.tenantId}\u0000${ctx.studentId}`));
    const quiet = (taken !== undefined && !taken.holds && !loose) || overBudget;
    let slotConfirmed = false;
    const runTurn = async (): Promise<ApiResponse> => {
      const persistText = consentOk && !overlong && !profileDown && !quiet;
      const turnId = clientTurnId ?? randomUUID();

      // Names the student states in this turn are redacted from the model's reply too (p1-u8r A2): a reply that greets "Anita" is stored without her.
      const stated = redactPii(text, { knownNames }).names;
      const allNames = [...knownNames, ...stated];
      const redact = (s: string): string => redactPii(s, { knownNames: allNames }).text;
      const redactors: Redactors = { full: redact, minimal: (s) => redactPii(s, { knownNames: allNames, introductions: false }).text };

      // Cycle 1: a retry of a crisis turn that was already completed (same clientTurnId, same redacted text) is replayed even when this retry is
      // quiet, so the graph is not run again and nothing new is written. The stored answer is what the first call returned.
      if (quiet && clientTurnId !== undefined && consentOk && !overlong && !profileDown) {
        const requestHash = sha256(redact(text));
        const rows = await listChatTurns(db, { studentId: ctx.studentId, threadId });
        const user = rows.find((r) => r.turnId === turnId && r.role === "user");
        const stored = rows.find((r) => r.turnId === turnId && r.role === "assistant");
        if (user?.status === "done" && user.requestHash === requestHash && stored?.response !== undefined) {
          const replay = TurnResponseSchema.safeParse(stored.response);
          if (replay.success) return respond(200, replay.data);
        }
      }

      let leaseToken: string | undefined;
      if (persistText) {
        const redacted = redact(text);
        const claim = await claimChatTurn(
          db,
          { studentId: ctx.studentId, threadId, turnId, text: redacted, requestHash: sha256(redacted), channel: "text" },
          { now },
        );
        if (claim.kind === "replay") {
          const replay = TurnResponseSchema.safeParse(claim.response);
          if (!replay.success) throw new TypeError("ChatStoredResponseInvalid");
          return respond(200, replay.data);
        }
        if (claim.kind === "in_progress") return fail(409, "turn_in_progress", { "retry-after": "2" });
        leaseToken = claim.leaseToken;
      } else if (!consentOk && !overlong && thread.textStored !== false) {
        await markChatThreadTextNotStored(db, { studentId: ctx.studentId, threadId });
      }

      // p1-lk9 C1 (fail closed): a turn with no guardian consent (a minor without a boolean-true claim, or no age claim) reaches NO provider. The crisis
      // guard already ran on the original text (`level`): a crisis or concern text goes on to the graph, whose crisis node answers with the vetted message
      // and makes no model call (LK4). Every other text gets the fixed consent reply; the graph, the knowledge base and the safety-screen model are not used.
      if (!consentOk && level === "none") return respond(200, TurnResponseSchema.parse({ turnId, state: "ok", message: GUARDIAN_CONSENT_REPLY, claims: [], sources: [], profileFactsUsed: [] }));

      const abandon = async () => {
        if (leaseToken !== undefined) await abandonChatTurn(db, { studentId: ctx.studentId, threadId, turnId, leaseToken }).catch(() => undefined);
      };

      const variant: GraphVariant = quiet ? "quiet" : !consentOk || overlong ? "textless" : "full";
      let result;
      try {
        result = await redactionScope.run(redactors, () =>
          groundingThread.run(`${ctx.tenantId}|${ctx.studentId}|${threadId}`, () =>
            runStudentTurn(graphDepsFor(ctx.tenantId, db, variant), {
              mode: "authenticated",
              auth: { role: "student", studentId: ctx.studentId, tenantId: ctx.tenantId },
              threadId,
              turnId,
              text,
            }),
          ),
        );
      } catch (err) {
        await abandon();
        if (err instanceof StudentInputInvalidError) return fail(400, "invalid_request");
        throw err;
      }

      const live = TurnResponseSchema.safeParse({ ...result.response, turnId });
      if (!live.success) {
        await abandon();
        throw new TypeError("ChatResponseInvalid");
      }
      let response = live.data;
      // A12: the provider chain failed. The apology is shown, nothing is kept and nothing is counted, so the retry runs again.
      if (result.retryable) {
        await abandon();
        return respond(200, response);
      }
      // M2: a crisis turn past its window's budget is answered with the helpline and stores no text. One whose flag or escalation write failed gives its slot back.
      // Cycle 2: a turn is quiet only behind a confirmed holder (one that really escalated), whose flag already covers the window.
      if (quiet) return respond(200, response);
      // Cycle 2 item 1: only a turn whose escalate port was really called and succeeded (and whose flag was written) confirms the slot.
      if (holdsSlot && variant === "full" && redactors.escalated === true && !result.flagWriteFailed) {
        slotConfirmed = true;
        taken!.slot.confirmed = true;
        taken!.slot.settle(true);
      }

      // p1-u6w: the graph only names the tool; the API layer ranks (graph.ts `executedBy: "api"`). Authenticated routes only, so this is never anonymous.
      // A turn that stores no text (an unconsented minor, an over-long message) never reaches the option port; a turn with no student text cannot pick rank_options.
      if (result.selectedTool === "rank_options" && persistText) response = await withRanking(who, response);

      let startAfterReply: (() => void) | undefined;
      if (leaseToken !== undefined) {
        const stored = TurnResponseSchema.parse({
          ...response,
          ...(response.message !== undefined ? { message: redact(response.message) } : {}),
          claims: response.claims.map((c) => ({ ...c, text: redact(c.text) })),
          // Fact values (Pathlynks or chat) can hold free text; they go through the same U8r redaction before they are stored.
          ...(response.profileFactsUsed !== undefined ? { profileFactsUsed: response.profileFactsUsed.map((f) => ({ ...f, value: redact(f.value) })) } : {}),
        });
        await completeChatTurn(db, { studentId: ctx.studentId, threadId, turnId, leaseToken, channel: "text", assistantText: stored.message ?? "", response: stored as Record<string, unknown> }, { now });
        // p1-lk9 C2: extraction (a model call) is off the reply path. It starts after the reply is ready (below), only for a turn that stores text.
        if (deps.extractFacts) {
          const extract = deps.extractFacts;
          const turn = { tenantId: ctx.tenantId, studentId: ctx.studentId, threadId, turnId, text, response };
          startAfterReply = () => proposeFactsDetached(db, now, extract, turn);
        }
      }

      await recordStudentUsage(db, { studentId: ctx.studentId, textTurns: 1 }, { now });
      if (response.state === "concern") await recordStudentFlag(db, { studentId: ctx.studentId, threadId, turnId, kind: "concern" }, { now });
      if (response.claims.some((c) => c.status === "unverified")) await incrementGapCount(db, { kind: "unverified_claim" }, { now });
      const reply = respond(200, response);
      startAfterReply?.();
      return reply;
    };
    try {
      return await runTurn();
    } finally {
      if (holdsSlot && !slotConfirmed) releaseCrisisSlot(slotKey!, taken!.slot, taken!.prev);
    }
  }

  function limitCheck(ctx: StudentAuthContext): ApiResponse | undefined {
    const limit = resolveLimits(deps.limitsForTenant?.(ctx.tenantId)).requestsPerMinute;
    const verdict = limiterFor(limit).check(`${ctx.tenantId}\u0000${ctx.studentId}`);
    return verdict.allowed ? undefined : fail(429, "rate_limited", { "retry-after": String(verdict.retryAfterSec) });
  }

  async function handle(req: ApiRequest): Promise<ApiResponse> {
    const pathname = pathOf(req);
    if (pathname === undefined) return fail(400, "invalid_request");
    const method = req.method.toUpperCase();
    const matched = matchRoute(pathname, method);
    if (matched === undefined) return NOT_FOUND();
    if (matched === "method") {
      const allowed = [...new Set(MATCHERS.filter((m) => m.re.test(pathname)).map((m) => m.method))].join(", ");
      return fail(405, "method_not_allowed", { allow: allowed });
    }

    // Authenticate: one 401 for every bad token; a validly signed token of another role is a 403.
    const header = req.headers.authorization;
    const token = bearerToken(typeof header === "string" ? header : undefined);
    if (token === undefined) return respond(401, { error: "unauthorized" }, { "www-authenticate": 'Bearer realm="vc-api"' });
    let ctx: StudentAuthContext;
    if (isPartnerKeyToken(token)) {
      // K3: a partner SERVER key (a page key is the same uniform 401). One 401 for every bad key (malformed, unknown, revoked, wrong secret, wrong scope, or no registry); the key is checked BEFORE the student headers are read.
      let partner: Awaited<ReturnType<PartnerRegistry["authenticate"]>>;
      try {
        partner = deps.partners ? await deps.partners.authenticate(token, "srv") : undefined;
      } catch (err) {
        if (err instanceof PartnerRegistryUnavailableError) return fail(503, "partner_registry_unavailable");
        throw err;
      }
      if (!partner) return respond(401, { error: "unauthorized" }, { "www-authenticate": 'Bearer realm="vc-api"' });
      const student = partnerStudentFromHeaders(req.headers);
      if (!student.ok) return fail(400, "invalid_request");
      // The tenant is the partner id (a valid tenant id by construction). Age missing or invalid = minor, and consent counts only when exactly "true" (fail closed).
      ctx = { tenantId: partner.partnerId, studentId: student.studentId, role: "student", minor: student.minor, guardianConsent: student.guardianConsent };
    } else {
      try {
        ctx = await deps.verifier.verify(token);
      } catch (err) {
        if (!(err instanceof AuthError)) throw err;
        return err.reason === "role" ? fail(403, "forbidden") : respond(401, { error: "unauthorized" }, { "www-authenticate": 'Bearer realm="vc-api"' });
      }
    }

    // A6: the sandbox tenant takes synthetic students only.
    if (deps.sandboxTenantId !== undefined && ctx.tenantId === deps.sandboxTenantId && !isSyntheticStudentId(ctx.studentId)) return fail(403, "sandbox_synthetic_only");
    // The token's student is the only student this token may act for; anything else looks like a missing resource.
    if (matched.params.studentId !== ctx.studentId) return NOT_FOUND();

    const db = deps.dbForTenant(ctx.tenantId);
    const who: Who = { ctx, db, now: nowDate() };

    if (matched.id === "postChatTurn") return handleTurn(req, who, matched.params);

    const limited = limitCheck(ctx);
    if (limited) return limited;

    switch (matched.id) {
      case "createChatThread": {
        const thread = await createChatThread(db, { studentId: ctx.studentId, textStored: !ctx.minor || ctx.guardianConsent }, { now: who.now });
        return respond(201, ThreadCreatedSchema.parse({ threadId: thread.threadId }));
      }
      case "getChatThread": {
        const threadId = matched.params.threadId!;
        const thread = await getChatThread(db, { studentId: ctx.studentId, threadId });
        if (!thread) return NOT_FOUND();
        const rows = (await listChatTurns(db, { studentId: ctx.studentId, threadId })).filter((r) => r.status !== "in_progress");
        const turns = rows.map((r) => {
          const stored = r.role === "assistant" ? TurnResponseSchema.safeParse(r.response) : undefined;
          return {
            turnId: r.turnId,
            role: r.role,
            channel: r.channel,
            text: r.text,
            at: r.at,
            ...(stored?.success ? { claims: stored.data.claims, sources: stored.data.sources } : {}),
          };
        });
        return respond(200, ThreadSchema.parse({ threadId, turns, ...(thread.textStored === false ? { textStored: false } : {}) }));
      }
      case "getChatProfile":
        return respond(200, await profileView(who));
      case "decideProfileFact": {
        const body = await readJson(req);
        if (!body.ok) return body.res;
        const decision = FactDecisionRequestSchema.safeParse(body.value);
        if (!decision.success) return fail(400, "invalid_request");
        await decideProfileFact(db, { studentId: ctx.studentId, factId: matched.params.factId!, action: decision.data.action, ...(decision.data.value !== undefined ? { value: decision.data.value } : {}) }, { now: who.now });
        return respond(200, await profileView(who));
      }
    }
  }

  return async (req) => {
    try {
      return await handle(req);
    } catch (err) {
      const mapped = mapError(err);
      if (mapped) return mapped;
      logEvent("chat_request_failed", { status: 500, error: err instanceof Error ? err.name : "error" });
      return fail(500, "internal");
    }
  };
}
