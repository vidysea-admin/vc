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
 *  - D-093 4A: an under-18 student without a boolean-true guardian-consent claim (and any student whose age is not known: fail closed) still
 *    gets answers, but no turn text, answer, extracted fact or escalation record is written; the thread keeps only a text-free marker. Such a
 *    turn has no idempotent replay (a retry runs the model again). Ids-and-time-only rows (safety flags, usage counters, gap counts) are kept.
 *  - A23: 30 requests per minute per student (per-tenant override); crisis text is never limited. The limiter is per process (in memory).
 *  - The Pathlynks profile arrives through a port; there is no real integration here, and no voice route (U10).
 */
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
  crisisGuard,
  runStudentTurn,
  type SpeakersFile,
  type StudentGraphConfig,
  type StudentGraphDeps,
  type StudentKbPort,
} from "@vc/engine";
import type { LlmProvider } from "@vc/providers";
import { AnonymousRateLimiter } from "./anonymous.js";
import { AuthError, bearerToken, type StudentAuthContext, type StudentJwtVerifier } from "./auth.js";
import { assertGoLive } from "./go-live-gate.js";
import { BodyTooLargeError, PATH_ID_PATTERN, respond, type ApiHandler, type ApiRequest, type ApiResponse, type ApiRoute } from "./server.js";

type Db = ReturnType<typeof tenantScopedDb>;

/** The explicit A20 config flag. Default off. */
export const CHAT_FLAG_ENV = "VC_CHAT_ENABLED";
/** 256 KiB: far above the 4000-character turn limit, so a crisis phrase anywhere in an over-long message is still scanned. */
export const MAX_CHAT_BODY_BYTES = 256 * 1024;
export const CHAT_WINDOW_MS = 60_000;
export const CHAT_MAX_LIMITER_KEYS = 100_000;
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
}) => Promise<ReadonlyArray<{ key: string; value: string }>>;

export type ChatLogLine = { level: "error"; event: string; ts: string; status?: number; error?: string; write?: string };

export interface ChatApiDeps {
  verifier: StudentJwtVerifier;
  /** The tenant-scoped `virtual_counsellor` Db. Called only after the student token verified. */
  dbForTenant(tenantId: string): Db;
  kb: StudentKbPort;
  provider: LlmProvider;
  skillsDir: string;
  speakers: SpeakersFile;
  profile?: PathlynksProfilePort;
  extractFacts?: FactExtractor;
  /** The tenant's escalation path (production: `(i) => escalateTurns(db, i, escalationDeps)`). Never used for an unconsented minor. */
  escalateForTenant?(tenantId: string, db: Db): StudentGraphDeps["escalate"];
  /** A6: this tenant accepts only `syn-` student ids. */
  sandboxTenantId?: string;
  /** Per-tenant override of the D-088 limits (only `requestsPerMinute` is read). */
  limitsForTenant?(tenantId: string): Parameters<typeof resolveLimits>[0];
  config?: Partial<StudentGraphConfig>;
  now?: () => Date;
  nowMs?: () => number;
  /** Text-free server-side failure log. Default: one JSON line on stderr. */
  log?: (line: ChatLogLine) => void;
}

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
  assertGoLive(route.gatesDir, "student-routes", route.now, route.approver);
  const env = route.env ?? process.env;
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

  // The U6 graph deps, cached per tenant and per variant (the compiled graph is cached per deps object). `escalate` is absent in the
  // `textless` variant: an escalation record may keep text-derived rationale, which an unconsented minor's turn must not write.
  const graphDepsCache = new Map<string, StudentGraphDeps>();
  const graphDepsFor = (tenantId: string, db: Db, textless: boolean): StudentGraphDeps => {
    const key = `${tenantId}|${textless ? "textless" : "full"}`;
    let g = graphDepsCache.get(key);
    if (!g) {
      const escalate = textless ? undefined : deps.escalateForTenant?.(tenantId, db);
      g = {
        kb: deps.kb,
        provider: deps.provider,
        skillsDir: deps.skillsDir,
        speakers: deps.speakers,
        ...(deps.config ? { config: deps.config } : {}),
        ...(deps.now ? { now: deps.now } : {}),
        recordGap: () => incrementGapCount(db, { kind: "no_sourced_answer" }, { now: nowDate() }),
        logFlag: (r) => recordStudentFlag(db, { studentId: r.studentId, threadId: r.threadId, turnId: r.turnId, kind: "crisis" }, { now: new Date(r.at) }),
        ...(escalate ? { escalate } : {}),
        hasPriorFlag: async (t) => (await listStudentFlags(db, { studentId: t.studentId, threadId: t.threadId })).length > 0,
        onWriteError: (write) => logEvent("chat_write_failed", { write }),
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

  async function readJson(req: ApiRequest): Promise<{ ok: true; value: unknown } | { ok: false; res: ApiResponse }> {
    let raw: string;
    try {
      raw = await req.readBody(MAX_CHAT_BODY_BYTES);
    } catch (err) {
      if (err instanceof BodyTooLargeError) return { ok: false, res: fail(413, "body_too_large") };
      throw err;
    }
    if (Buffer.byteLength(raw, "utf8") > MAX_CHAT_BODY_BYTES) return { ok: false, res: fail(413, "body_too_large") };
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
      facts: [...supplied, ...confirmed.map((f) => ({ key: f.key, value: f.value, source: "student-confirmed" as const }))],
      proposed: stored.filter((f) => f.status === "proposed").map((f) => ({ factId: f.factId, key: f.key, value: f.value, status: "proposed" as const })),
    });
  }

  async function handleTurn(req: ApiRequest, who: Who, params: Record<string, string>): Promise<ApiResponse> {
    const { ctx, db, now } = who;
    const threadId = params.threadId!;
    const body = await readJson(req);
    if (!body.ok) return body.res;
    const obj = body.value;
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return fail(400, "invalid_request");
    const text = (obj as { text?: unknown }).text;
    if (typeof text !== "string") return fail(400, "invalid_request");
    // An over-long message is refused, EXCEPT that a crisis phrase anywhere in it still gets the fixed crisis answer (U6h L5). That turn is never stored.
    const overlong = text.length > MAX_TURN_TEXT_LENGTH;
    if (overlong && crisisGuard(text).level === "none") return fail(400, "invalid_request");
    const parsed = TurnRequestSchema.safeParse({ ...(obj as object), text: overlong ? text.slice(0, MAX_TURN_TEXT_LENGTH) : text });
    if (!parsed.success) return fail(400, "invalid_request");
    const clientTurnId = parsed.data.clientTurnId;
    if (clientTurnId !== undefined && !PATH_ID_PATTERN.test(clientTurnId)) return fail(400, "invalid_request");

    // A23: a crisis message is never rate limited; the scan runs on the full text before the limiter is consulted.
    if (crisisGuard(text).level === "none") {
      const limited = limitCheck(ctx);
      if (limited) return limited;
    }

    const thread = await getChatThread(db, { studentId: ctx.studentId, threadId });
    if (!thread) return NOT_FOUND();

    const persistText = (!ctx.minor || ctx.guardianConsent) && !overlong;
    const turnId = clientTurnId ?? randomUUID();

    let knownNames: string[] = [];
    if (deps.profile) {
      try {
        knownNames = (await pathwaysFacts(ctx)).filter((f) => /name/i.test(f.key)).map((f) => f.value);
      } catch (err) {
        if (!(err instanceof ChatProfileUnavailableError)) throw err;
      }
    }
    const redact = (s: string): string => redactPii(s, { knownNames }).text;

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
    } else if (!overlong && thread.textStored !== false) {
      await markChatThreadTextNotStored(db, { studentId: ctx.studentId, threadId });
    }

    const abandon = async () => {
      if (leaseToken !== undefined) await abandonChatTurn(db, { studentId: ctx.studentId, threadId, turnId, leaseToken }).catch(() => undefined);
    };

    let result;
    try {
      result = await runStudentTurn(graphDepsFor(ctx.tenantId, db, !persistText), {
        mode: "authenticated",
        auth: { role: "student", studentId: ctx.studentId, tenantId: ctx.tenantId },
        threadId,
        turnId,
        text,
      });
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
    const response = live.data;
    // A12: the provider chain failed. The apology is shown, nothing is kept and nothing is counted, so the retry runs again.
    if (result.retryable) {
      await abandon();
      return respond(200, response);
    }

    if (leaseToken !== undefined) {
      const stored = TurnResponseSchema.parse({
        ...response,
        ...(response.message !== undefined ? { message: redact(response.message) } : {}),
        claims: response.claims.map((c) => ({ ...c, text: redact(c.text) })),
      });
      await completeChatTurn(db, { studentId: ctx.studentId, threadId, turnId, leaseToken, channel: "text", assistantText: stored.message ?? "", response: stored as Record<string, unknown> }, { now });
      if (deps.extractFacts) {
        try {
          const facts = await deps.extractFacts({ tenantId: ctx.tenantId, studentId: ctx.studentId, threadId, turnId, text, response });
          for (const f of facts.slice(0, MAX_PROPOSED_FACTS_PER_TURN)) {
            await proposeProfileFact(db, { studentId: ctx.studentId, key: f.key, value: f.value, threadId, turnId }, { now });
          }
        } catch (err) {
          if (err instanceof StudentFencedError || err instanceof FencedWriterDeadlineError) throw err;
          logEvent("chat_fact_extraction_failed");
        }
      }
    }

    await recordStudentUsage(db, { studentId: ctx.studentId, textTurns: 1 }, { now });
    if (response.state === "concern") await recordStudentFlag(db, { studentId: ctx.studentId, threadId, turnId, kind: "concern" }, { now });
    if (response.claims.some((c) => c.status === "unverified")) await incrementGapCount(db, { kind: "unverified_claim" }, { now });
    return respond(200, response);
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
    try {
      ctx = await deps.verifier.verify(token);
    } catch (err) {
      if (!(err instanceof AuthError)) throw err;
      return err.reason === "role" ? fail(403, "forbidden") : respond(401, { error: "unauthorized" }, { "www-authenticate": 'Bearer realm="vc-api"' });
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
