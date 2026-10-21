/**
 * P1 U7 (plan row U7; contract B24.6, B24.7, B21 anonymous-route exception, B24.9; spec A15a-c, A20; D-085, D-088 Q7, D-092):
 * the public, unauthenticated, text-only anonymous chat route `POST /v1/public/chat/turns`.
 *
 * New file, on purpose: server.ts's createApiHandler is JWT-first and tenant-bound by construction (every route
 * gets a verifier, `dbForTenant` and `graphForTenant`), which is exactly what an anonymous route must NOT have. The
 * criterion "the handler is built with no Db, checkpointer, outbox or tracer except one text-free counter writer"
 * is only structural if the anonymous handler lives behind its own dependency type. It reuses server.ts's `respond`,
 * `ApiRoute`, `BodyTooLargeError` and the U6 student graph (`runStudentTurn`'s anonymous path) unchanged.
 *
 * What is guaranteed here, and what is not:
 *  - OFF by default. `createAnonymousApi` returns `undefined` unless the explicit flag is on (VC_ANONYMOUS_ENABLED=true);
 *    when on it calls the A20 go-live gate (`assertGoLive(..., "anonymous")`) and throws GoLiveRefusedError unless every
 *    record holds. A disabled route is not served at all: the path is an ordinary 404.
 *  - The ONLY dependencies are a search-only KB port, the model provider, the skills dir, the speakers file and ONE counter
 *    writer. There is no Db, checkpointer, outbox or tracer field in `AnonymousApiDeps`; the graph's gap-log, flag-log and
 *    escalation ports are throwing proxies (AnonymousForbiddenWriteError), and `hasPriorFlag` is a stateless reader that
 *    returns false: anonymous mode has no student, tenant or thread, so there is no earlier flag to read (the graph never
 *    consults it for an anonymous turn; a durable reader would need an identity this route must not have).
 *  - The ONLY write is `counter.increment(kind)`: a document per (UTC date, kind) with a count (packages/db
 *    anonymous_counters). No text, IP, tenant, student or thread identifier.
 *  - The limiter is in-memory, text-free, TTL-based, 10 requests per minute per client (DEFAULT_LIMITS). Its key is the
 *    socket peer address run through a salted SHA-256 held only in memory; the raw address is never stored or logged. It
 *    does NOT read X-Forwarded-For: behind a proxy the deployment passes `clientKey` explicitly (the header is
 *    attacker-controlled unless a trusted proxy owns it).
 *  - Nothing this module logs carries request text or an error message: only event names, a counter kind, the error NAME.
 *
 * Honest limits: provider and KB handling of the question text (`q` to /search; the text to the model for a generic
 * question) is outside VC storage and is disclosed in the B13 amendment, not claimed away. The body is read up to
 * MAX_ANONYMOUS_BODY_BYTES (64 KiB, ISS-135) so a crisis phrase deep in a long message is still scanned (U6h L5); a larger
 * body is a 413 that still carries the helpline, and is not scanned.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import { AnonymousTurnResponseSchema, ANONYMOUS_COUNTER_KINDS, resolveLimits } from "@vc/schemas";
import type { AnonymousCounterDoc } from "@vc/db";
import {
  StudentInputInvalidError,
  TELE_MANAS_LINE,
  crisisGuard,
  runStudentTurn,
  compileStudentGraph,
  type AnonymousCounterKind,
  type SpeakersFile,
  type StudentGraphConfig,
  type StudentGraphDeps,
  type StudentKbPort,
} from "@vc/engine";
import type { GroundedAnswerer, GroundingBudget, LlmProvider } from "@vc/providers";
import { assertGoLive } from "./go-live-gate.js";
import { BodyTooLargeError, respond, type ApiHandler, type ApiRequest, type ApiRoute } from "./server.js";

export const ANONYMOUS_PATH = "/v1/public/chat/turns";
/** The closed list of routes served without a JWT (B21 anonymous-route exception). There is no anonymous voice route. */
export const ANONYMOUS_ROUTES: readonly ApiRoute[] = Object.freeze([{ id: "postAnonymousTurn", method: "POST", path: ANONYMOUS_PATH, roles: "public" } as ApiRoute]);

/** The explicit A20 config flag. Default off. */
export const ANONYMOUS_FLAG_ENV = "VC_ANONYMOUS_ENABLED";
/**
 * P1 LK7: whether the LK5 model safety screen also runs on anonymous turns. Default OFF: contract A15b / B24.6 say no model sees an anonymous
 * text to classify it, and D-105 orders a screen on every student turn; which wins is an open decision for Umesh, so nothing changes until he says.
 */
export const ANONYMOUS_SAFETY_SCREEN_ENV = "VC_ANONYMOUS_SAFETY_SCREEN";
/** Repo qa/gates (apps/api/src -> repo root): where the A20 gate records live. */
export const DEFAULT_GATES_DIR = fileURLToPath(new URL("../../../qa/gates", import.meta.url));
/**
 * ISS-135 (D-101): 64 KiB, about 16 times the 4000-character turn limit, so a crisis phrase anywhere in an over-long message is still
 * scanned. The crisis scan runs before the limiter (B24.7) and so is unlimited per client; the cap bounds its CPU per request
 * (it was 256 KiB, 40-210 ms each). A larger body is a 413 with the helpline and is never scanned.
 */
export const MAX_ANONYMOUS_BODY_BYTES = 64 * 1024;
export const ANONYMOUS_WINDOW_MS = 60_000;
export const ANONYMOUS_MAX_LIMITER_KEYS = 50_000;
/** U7 repair 1: a counter write not finished by then counts as failed; the reply (a crisis message included) never waits longer. */
export const DEFAULT_COUNTER_DEADLINE_MS = 750;
/** U7 repair 4: the full-table sweep is O(n); it runs at most this often. */
export const MIN_SWEEP_INTERVAL_MS = 1_000;

export class AnonymousConfigError extends Error {
  constructor(message: string) {
    super(`AnonymousConfigError: ${message}`);
    this.name = "AnonymousConfigError";
  }
}

/** Thrown by the throwing proxies handed to the graph's gap-log, flag-log and escalation ports. */
export class AnonymousForbiddenWriteError extends Error {
  constructor(readonly port: string) {
    super(`AnonymousForbiddenWriteError: anonymous mode may not use the ${port} port`);
    this.name = "AnonymousForbiddenWriteError";
  }
}

/** Reads the flag: unset, empty and "false" are off; exactly "true" is on; anything else is a config error (never a silent on or off). */
export function anonymousEnabledFromEnv(env: Record<string, string | undefined>): boolean {
  const raw = env[ANONYMOUS_FLAG_ENV]?.trim();
  if (raw === undefined || raw === "" || raw === "false") return false;
  if (raw === "true") return true;
  throw new AnonymousConfigError(`${ANONYMOUS_FLAG_ENV} must be "true" or "false" (got a different value)`);
}

/** Reads the anonymous safety-screen flag like `anonymousEnabledFromEnv`: unset, empty and "false" are off, exactly "true" is on, anything else is a config error. */
export function anonymousSafetyScreenFromEnv(env: Record<string, string | undefined>): boolean {
  const raw = env[ANONYMOUS_SAFETY_SCREEN_ENV]?.trim();
  if (raw === undefined || raw === "" || raw === "false") return false;
  if (raw === "true") return true;
  throw new AnonymousConfigError(`${ANONYMOUS_SAFETY_SCREEN_ENV} must be "true" or "false" (got a different value)`);
}

// ---------------------------------------------------------------------------
// The counter writer (the one permitted write, B24.6)
// ---------------------------------------------------------------------------

export interface AnonymousCounterWriter {
  increment(kind: AnonymousCounterKind): Promise<void>;
}

/** The slice of a Mongo collection the counter needs (packages/db `anonymousCountersCollection(db)` satisfies it). */
export interface AnonymousCounterStore {
  updateOne(
    filter: { _id: string },
    update: { $inc: { count: number }; $setOnInsert: { date: string; kind: AnonymousCounterDoc["kind"] } },
    options: { upsert: true },
  ): Promise<unknown>;
}

/**
 * Atomic `$inc` upsert of the (UTC date, kind) document. The document holds exactly ANONYMOUS_COUNTER_FIELDS. A racing first
 * insert (11000) is retried once as a plain increment.
 */
export function createMongoAnonymousCounter(store: AnonymousCounterStore, now: () => Date = () => new Date()): AnonymousCounterWriter {
  return {
    async increment(kind) {
      if (!(ANONYMOUS_COUNTER_KINDS as readonly string[]).includes(kind)) throw new TypeError("anonymous counter: unknown kind");
      const date = now().toISOString().slice(0, 10);
      const run = () => store.updateOne({ _id: `${date}:${kind}` }, { $inc: { count: 1 }, $setOnInsert: { date, kind } }, { upsert: true });
      try {
        await run();
      } catch (err) {
        if ((err as { code?: unknown } | null)?.code !== 11000) throw err;
        await run();
      }
    },
  };
}

// ---------------------------------------------------------------------------
// The limiter
// ---------------------------------------------------------------------------

export interface AnonymousLimiterOptions {
  limit: number;
  windowMs: number;
  maxKeys: number;
  nowMs: () => number;
}
export type LimiterVerdict = { allowed: true } | { allowed: false; retryAfterSec: number };

/**
 * In-memory sliding-window limiter. Keys are salted SHA-256 digests (the salt is per process and never leaves it), values
 * are request timestamps only: no text, no raw address. A rejected request is not recorded. Expired keys are purged lazily
 * (every 256 checks, when the table is full, and on `sweep()`); there is no timer. A table full of LIVE keys refuses a
 * NEW key (fail closed) and never evicts a live one, so a flood cannot reset another client's budget.
 */
export class AnonymousRateLimiter {
  private readonly salt = randomBytes(16);
  private readonly buckets = new Map<string, number[]>();
  private checks = 0;
  private lastSweepMs = Number.NEGATIVE_INFINITY;

  constructor(private readonly opts: AnonymousLimiterOptions) {
    if (![opts.limit, opts.windowMs, opts.maxKeys].every((n) => Number.isInteger(n) && n >= 1)) throw new RangeError("AnonymousRateLimiter: limit, windowMs and maxKeys must be positive integers");
  }

  private digest(raw: string | undefined): string {
    return createHash("sha256").update(this.salt).update(raw ?? "\u0000unknown").digest("base64url");
  }

  check(rawKey: string | undefined): LimiterVerdict {
    const now = this.opts.nowMs();
    if (++this.checks % 256 === 0) this.maybeSweep();
    const key = this.digest(rawKey);
    let stamps = this.buckets.get(key);
    if (stamps) {
      const cutoff = now - this.opts.windowMs;
      while (stamps.length > 0 && stamps[0]! <= cutoff) stamps.shift();
      if (stamps.length === 0) {
        this.buckets.delete(key);
        stamps = undefined;
      }
    }
    if (!stamps) {
      if (this.buckets.size >= this.opts.maxKeys) {
        this.maybeSweep();
        if (this.buckets.size >= this.opts.maxKeys) return { allowed: false, retryAfterSec: Math.ceil(this.opts.windowMs / 1000) };
      }
      stamps = [];
      this.buckets.set(key, stamps);
    }
    if (stamps.length >= this.opts.limit) {
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((stamps[0]! + this.opts.windowMs - now) / 1000)) };
    }
    stamps.push(now);
    return { allowed: true };
  }

  /** Rate-limited sweep (U7 repair 4): a flood of new keys against a full table cannot make every request O(n). */
  private maybeSweep(): void {
    const now = this.opts.nowMs();
    if (now - this.lastSweepMs < MIN_SWEEP_INTERVAL_MS) return;
    this.lastSweepMs = now;
    this.sweep();
  }

  /** Drops every key whose newest request is outside the window (TTL). */
  sweep(): void {
    const cutoff = this.opts.nowMs() - this.opts.windowMs;
    for (const [key, stamps] of this.buckets) if (stamps.length === 0 || stamps[stamps.length - 1]! <= cutoff) this.buckets.delete(key);
  }

  size(): number {
    return this.buckets.size;
  }
}

// ---------------------------------------------------------------------------
// Dependencies and construction
// ---------------------------------------------------------------------------

export type AnonymousLogLine =
  | { level: "error"; event: "api_request_failed"; status: number; error: string; ts: string }
  | { level: "error"; event: "anonymous_counter_failed"; kind: string; ts: string }
  | { level: "error"; event: "anonymous_forbidden_write"; write: string; ts: string };

/**
 * Everything the anonymous handler may be built with. There is deliberately no Db, checkpointer, outbox or tracer here.
 */
export interface AnonymousApiDeps {
  /** Only `searchKb` is ever called (the handler hands the graph a port with that one method). */
  kb: Pick<StudentKbPort, "searchKb">;
  provider: LlmProvider;
  skillsDir: string;
  speakers: SpeakersFile;
  /** The single permitted writer: a text-free aggregate counter. */
  counter: AnonymousCounterWriter;
  /**
   * P1 LK7: the LK5 model safety screen. Absent = no screen (the default, see ANONYMOUS_SAFETY_SCREEN_ENV). Supplying it turns the screen ON for
   * anonymous turns. There is deliberately no language-detector option: the anonymous route never sends a text to a model to classify its language.
   */
  safetyScreen?: Omit<NonNullable<StudentGraphDeps["safetyScreen"]>, "anonymous" | "authenticated"> & {
    /**
     * p1-nosource-grounded G5: "all" (default) screens every cleared anonymous turn; "no_source" screens only a turn that reaches the no-source reply,
     * before anything is sent to a model or the web (the production default when VC_ANONYMOUS_SAFETY_SCREEN is not "true").
     */
    scope?: "all" | "no_source";
  };
  /** p1-nosource-grounded G1: Gemini with Google Search grounding for a no-source question (VC_GROUNDING=gemini). It receives the redacted question only. Absent = off. */
  grounding?: GroundedAnswerer;
  /** H6: per-client and per-day cap on grounded calls (and the spend guard). Over a cap the turn falls back to the model-only guidance. Absent = uncapped. */
  groundingBudget?: GroundingBudget;
  config?: Partial<StudentGraphConfig>;
  /** Per-deployment override of the D-088 limits (only `anonymousRequestsPerMinute` is read). */
  limits?: Parameters<typeof resolveLimits>[0];
  /** A counter write not finished by this deadline counts as failed (default DEFAULT_COUNTER_DEADLINE_MS). */
  counterDeadlineMs?: number;
  /** Tests inject a limiter; default: 10 requests per minute per client. */
  limiter?: AnonymousRateLimiter;
  now?: () => Date;
  nowMs?: () => number;
  /** The limiter key source. Default: the socket peer address through `normalizeClientAddress`. Behind a proxy the deployment supplies its own. */
  clientKey?: (req: ApiRequest) => string | undefined;
  /** Text-free server-side failure log. Default: one JSON line on stderr. */
  log?: (line: AnonymousLogLine) => void;
}

export interface AnonymousRouteConfig {
  /** From `anonymousEnabledFromEnv`. False -> `createAnonymousApi` builds nothing. */
  enabled: boolean;
  gatesDir: string;
  /** Gate evaluation clock and approver (tests); defaults as assertGoLive. */
  now?: Date;
  approver?: string;
  /** Environment checked for LangChain/LangSmith tracing switches. Default: process.env. */
  env?: Record<string, string | undefined>;
}

const TRACING_VARS = ["LANGSMITH_TRACING", "LANGSMITH_TRACING_V2", "LANGCHAIN_TRACING", "LANGCHAIN_TRACING_V2"] as const;

function assertNoTracing(env: Record<string, string | undefined>): void {
  for (const name of TRACING_VARS) {
    if (/^(true|1|yes|on)$/i.test(env[name]?.trim() ?? "")) {
      throw new AnonymousConfigError(`${name} switches request tracing on; anonymous mode stores and traces no student text, so the route will not start`);
    }
  }
}

/** Rejects when `p` has not settled within `ms`. The late result (or rejection) of `p` is ignored, never unhandled. */
function withDeadline(p: Promise<void>, ms: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("AnonymousCounterTimeout")), ms);
    p.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * U7 repair 3: the limiter key source. IPv4-mapped IPv6 (::ffff:a.b.c.d, and its hex form) is the IPv4 address; any other IPv6
 * address is reduced to its /64 prefix (a client controls the low 64 bits, so rotating them must not buy a fresh budget or fill
 * the table); a zone id is dropped. An unparseable value is kept verbatim (one shared bucket; never throws).
 */
export function normalizeClientAddress(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  let a = raw.trim();
  const zone = a.indexOf("%");
  if (zone >= 0) a = a.slice(0, zone);
  if (isIP(a) === 4) return a;
  if (isIP(a) !== 6) return raw;
  const groups = expandIpv6(a);
  if (!groups) return raw;
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return `${groups[6]! >> 8}.${groups[6]! & 255}.${groups[7]! >> 8}.${groups[7]! & 255}`;
  }
  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(":")}::/64`;
}

function expandIpv6(a: string): number[] | undefined {
  let text = a;
  if (text.includes(".")) {
    const colon = text.lastIndexOf(":");
    const v4 = text.slice(colon + 1).split(".").map(Number);
    if (v4.length !== 4 || v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return undefined;
    text = `${text.slice(0, colon + 1)}${((v4[0]! << 8) | v4[1]!).toString(16)}:${((v4[2]! << 8) | v4[3]!).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return undefined;
  const part = (s: string) => (s === "" ? [] : s.split(":"));
  const head = part(halves[0]!);
  const tail = halves.length === 2 ? part(halves[1]!) : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 1 ? fill !== 0 : fill < 0) return undefined;
  const all = [...head, ...Array<string>(fill).fill("0"), ...tail].map((h) => parseInt(h, 16));
  return all.length === 8 && all.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? all : undefined;
}

function defaultLog(line: AnonymousLogLine): void {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(line));
}

/** H6: the client the current anonymous turn belongs to, read by the shared grounded-call budget (the graph deps are built once, not per request). */
const groundingClient = new AsyncLocalStorage<string>();

/** The U6 graph deps for anonymous mode: search-only KB, one counter writer, throwing proxies for every other port. */
export function buildAnonymousGraphDeps(deps: AnonymousApiDeps, onForbidden?: (port: string) => void): StudentGraphDeps {
  const log = deps.log ?? defaultLog;
  const forbidden = (port: string) => async (): Promise<never> => {
    onForbidden?.(port);
    throw new AnonymousForbiddenWriteError(port);
  };
  return {
    // A fresh object with ONE method: even a caller that passes a full KB client cannot reach /ask or get_session.
    kb: { searchKb: (query: string) => deps.kb.searchKb(query) },
    provider: deps.provider,
    skillsDir: deps.skillsDir,
    speakers: deps.speakers,
    ...(deps.config ? { config: deps.config } : {}),
    ...(deps.now ? { now: deps.now } : {}),
    ...(deps.safetyScreen
      ? (() => {
          const { scope, ...screen } = deps.safetyScreen;
          return { safetyScreen: { ...screen, anonymous: scope === "no_source" ? ("no_source" as const) : true, authenticated: false } };
        })()
      : {}),
    ...(deps.grounding ? { grounding: deps.groundingBudget ? deps.groundingBudget.bind(deps.grounding, () => groundingClient.getStore() ?? "unknown") : deps.grounding } : {}),
    recordGap: forbidden("recordGap"),
    logFlag: forbidden("logFlag"),
    escalate: forbidden("escalate"),
    // U7 repair 1/B: EVERY counter await (crisis, sign-in, answered, no-answer) is bounded; a timeout is a failed write (safeWrite in the graph).
    countAnonymous: (kind) => withDeadline(Promise.resolve().then(() => deps.counter.increment(kind)), deps.counterDeadlineMs ?? DEFAULT_COUNTER_DEADLINE_MS),
    hasPriorFlag: async () => false,
    onWriteError: (write) => {
      const ts = new Date().toISOString();
      try {
        if (write.startsWith("counter:")) log({ level: "error", event: "anonymous_counter_failed", kind: write.slice("counter:".length), ts });
        else log({ level: "error", event: "anonymous_forbidden_write", write, ts });
      } catch {
        // a failing logger must not fail the turn
      }
    },
  };
}

/**
 * Builds the anonymous handler, or `undefined` when `route.enabled` is false (then nothing is built and the path is an
 * ordinary 404). When enabled it first requires the A20 go-live gate (throws GoLiveRefusedError) and an environment with
 * request tracing off, then compiles the graph so a configuration error surfaces at start, not on the first request.
 */
export function createAnonymousApi(deps: AnonymousApiDeps, route: AnonymousRouteConfig): ApiHandler | undefined {
  if (!route.enabled) return undefined;
  assertGoLive(route.gatesDir, "anonymous", route.now, route.approver);
  assertNoTracing(route.env ?? process.env);
  const graphDeps = buildAnonymousGraphDeps(deps);
  compileStudentGraph(graphDeps);
  const log = deps.log ?? defaultLog;
  const limiter =
    deps.limiter ??
    new AnonymousRateLimiter({
      limit: resolveLimits(deps.limits).anonymousRequestsPerMinute,
      windowMs: ANONYMOUS_WINDOW_MS,
      maxKeys: ANONYMOUS_MAX_LIMITER_KEYS,
      nowMs: deps.nowMs ?? Date.now,
    });
  const clientKey = deps.clientKey ?? ((req: ApiRequest) => normalizeClientAddress(req.remoteAddress));
  // Every non-200 body carries the static helpline (AI review A): a student in distress who meets any refusal still sees it.
  const fail = (status: number, error: string, headers?: Record<string, string>) => respond(status, { error, helpline: TELE_MANAS_LINE }, headers);

  return async (req) => {
    try {
      let pathname: string;
      try {
        pathname = new URL(req.url, "http://vc-api.invalid").pathname;
      } catch {
        return fail(400, "invalid_request");
      }
      if (pathname !== ANONYMOUS_PATH) return respond(404, { error: "not_found" });
      if (req.method.toUpperCase() !== "POST") return fail(405, "method_not_allowed", { allow: "POST" });

      let raw: string;
      try {
        raw = await req.readBody(MAX_ANONYMOUS_BODY_BYTES);
      } catch (err) {
        if (err instanceof BodyTooLargeError) return fail(413, "body_too_large");
        throw err;
      }
      if (Buffer.byteLength(raw, "utf8") > MAX_ANONYMOUS_BODY_BYTES) return fail(413, "body_too_large");

      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        return fail(400, "invalid_request");
      }
      // The body is exactly {"text": <string>}. Length is the graph's call (an over-long crisis message must still be
      // scanned before it is refused, U6h L5), so it is not checked here. Any other field, including a tenant or student id, is refused.
      if (typeof json !== "object" || json === null || Array.isArray(json)) return fail(400, "invalid_request");
      const keys = Object.keys(json);
      const text = (json as { text?: unknown }).text;
      if (typeof text !== "string") return fail(400, "invalid_request");
      // ISS-350 (D-104): the crisis exemption comes before the shape check. A body with extra keys whose text is a crisis or concern phrase is still
      // answered (from `text` alone; the extra keys are never read or kept). One scan serves this check and the limiter exemption below.
      const level = crisisGuard(text).level;
      if ((keys.length !== 1 || keys[0] !== "text") && level === "none") return fail(400, "invalid_request");

      // AI review A: a crisis message is never rate limited. The scan runs on the FULL text before the limiter is consulted; the graph
      // then answers it with the fixed message (no model, no KB, one text-free counter write), so it costs nothing worth limiting.
      if (level === "none") {
        const verdict = limiter.check(clientKey(req));
        if (!verdict.allowed) return fail(429, "rate_limited", { "retry-after": String(verdict.retryAfterSec) });
      }

      let result;
      try {
        result = await groundingClient.run(clientKey(req) || "unknown", () => runStudentTurn(graphDeps, { mode: "anonymous", text }));
      } catch (err) {
        if (err instanceof StudentInputInvalidError) return fail(400, "invalid_request");
        throw err;
      }
      const r = result.response;
      const parsed = AnonymousTurnResponseSchema.safeParse({ state: r.state, ...(r.message !== undefined ? { message: r.message } : {}), claims: r.claims, sources: r.sources });
      if (!parsed.success) throw new TypeError("AnonymousResponseInvalid");
      return respond(200, parsed.data);
    } catch (err) {
      try {
        log({ level: "error", event: "api_request_failed", status: 500, error: err instanceof Error ? err.name : "error", ts: new Date().toISOString() });
      } catch {
        // never fail the response because the logger failed
      }
      return fail(500, "internal");
    }
  };
}

/** Routes the one anonymous path to `anonymous` (when built) and everything else to the authenticated handler untouched. */
export function withAnonymousRoutes(main: ApiHandler, anonymous: ApiHandler | undefined): ApiHandler {
  if (!anonymous) return main;
  return (req) => {
    let pathname: string | undefined;
    try {
      pathname = new URL(req.url, "http://vc-api.invalid").pathname;
    } catch {
      pathname = undefined;
    }
    return pathname === ANONYMOUS_PATH ? anonymous(req) : main(req);
  };
}
