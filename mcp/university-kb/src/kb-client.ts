/**
 * KnowledgeBase `/ask` client (T-026, contract B21 "Knowledge" clause + B2 citations).
 *
 * Talks to the sibling D:/KnowledgeBase service's real `POST /ask` endpoint (learned read-only
 * from that repo, D-001 — not an [ASSUMPTION]):
 *   - request:  `apps/api/src/routes/ask.ts:36-56` — `POST /ask`, `Authorization: Bearer <key>`
 *     (`apps/api/src/auth.ts`), JSON body `{ query: string }`; 401 on a missing/invalid key,
 *     403 if the key lacks the `ask` scope, 404 if the tenant has no tree index built yet.
 *   - response: `apps/web/src/api/types.ts:154-163` `AskResponse` (hand-mirrored there from
 *     `@lkb/ask`'s `AskV2Result`) — `{ answer, verdict, reason, scored, web_used,
 *     insufficient_coverage, sources: { internal, web }, auditLog }`.
 *
 * Outage handling (B21 "a KB outage degrades to 'knowledge unavailable'; it never produces an
 * uncited answer" + B14 "outcome, not construction"): `ask()` never throws for an outage. It
 * returns a typed `KbAskResult` — `{status:"ok", ...}` or `{status:"unavailable", reason, detail}`
 * — covering timeout, network error, HTTP 5xx, HTTP 401/403, a non-JSON body, a JSON body that
 * fails schema validation, AND a verdict-"correct" answer that carries zero citations in both
 * `sources.internal` and `sources.web` (B2: an uncited answer is never passed on as an answer).
 * Citations that DO exist are carried through completely verbatim (untouched) as `citations`.
 *
 * P1/U2 (plan.md U2, spec scope items 3-4, A4/A15c/A18) adds the READ side of the same service, learned
 * read-only from D:/KnowledgeBase `apps/api/src/routes/{search,brain}.ts` (the KB server was never
 * started or called): `GET /search?q&k` -> `{query, hits:[{turnId, sessionId, score, turn, session}]}`
 * (scope `search`), `GET /sessions/:id` -> `{session, page, claims, turns, ...}` (scope `sessions`),
 * `GET /sources` -> `{sources:[...]}` (scope `sources`), `GET /gaps` -> `{gaps:[...]}` (scope `gaps`).
 * All four return typed outcomes (`ok` | `unavailable`) and never throw for an outage. Sources are
 * reduced to `{id, kind}` at the boundary (rows also hold path, hash and consent: never kept).
 * `applyServeRule` is the `/ask` serve rule (G6): answer served ONLY when verdict == "correct" AND
 * insufficient_coverage == false AND web_used == false AND >=1 internal source; `sources.web` never
 * leaves this module.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Response schema — mirrors the real KB's `AskResponse` (see file docstring for the exact
// source lines). `.passthrough()` on the nested object shapes preserves any additional fields
// the real KB sends beyond this schema's minimum, so "carried through verbatim" never silently
// drops something the checker or a caller later needs.
// ---------------------------------------------------------------------------
export const AskSourceInternalSchema = z
  .object({
    node_id: z.string(),
    evidence: z.record(z.unknown()).optional(),
  })
  .passthrough();
export type AskSourceInternal = z.infer<typeof AskSourceInternalSchema>;

export const AskSourceWebSchema = z.record(z.unknown());
export type AskSourceWeb = z.infer<typeof AskSourceWebSchema>;

export const KbCitationsSchema = z.object({
  internal: z.array(AskSourceInternalSchema),
  web: z.array(AskSourceWebSchema),
});
export type KbCitations = z.infer<typeof KbCitationsSchema>;

export const AskScoredSchema = z
  .object({
    node_id: z.string().optional(),
    score: z.number().optional(),
    reason: z.string().optional(),
  })
  .passthrough();
export type AskScored = z.infer<typeof AskScoredSchema>;

export const AskAuditLogEntrySchema = z
  .object({
    step: z.string(),
    provider: z.string().optional(),
    model: z.string().optional(),
    costUsd: z.number().optional(),
  })
  .passthrough();
export type AskAuditLogEntry = z.infer<typeof AskAuditLogEntrySchema>;

export const KbAskResponseSchema = z.object({
  answer: z.string(),
  verdict: z.string(),
  reason: z.string(),
  scored: z.array(AskScoredSchema),
  web_used: z.boolean(),
  insufficient_coverage: z.boolean(),
  sources: KbCitationsSchema,
  auditLog: z.array(AskAuditLogEntrySchema),
});
export type KbAskResponse = z.infer<typeof KbAskResponseSchema>;

// ---------------------------------------------------------------------------
// Typed outcomes
// ---------------------------------------------------------------------------
export type KbUnavailableReason =
  | "timeout"
  | "network_error"
  | "http_error"
  | "unauthorized"
  | "malformed_response"
  | "invalid_schema"
  | "uncited"
  | "not_found"
  /** The circuit breaker is open for this KB: failed fast with no network call (the graph treats it like any search failure). */
  | "circuit_open";

export interface KbAskOk {
  status: "ok";
  answer: string;
  /** `sources` from the KB, carried through verbatim (B2) — never trimmed, re-shaped or summarised. */
  citations: KbCitations;
  verdict: string;
  reason: string;
  scored: AskScored[];
  webUsed: boolean;
  insufficientCoverage: boolean;
  auditLog: AskAuditLogEntry[];
  /** The exact parsed response, for a caller that needs the untouched original shape. */
  raw: KbAskResponse;
}

export interface KbAskUnavailable {
  status: "unavailable";
  reason: KbUnavailableReason;
  /** Human-readable detail, safe to log — never contains the API key (B11). */
  detail: string;
}

export type KbAskResult = KbAskOk | KbAskUnavailable;

// ---------------------------------------------------------------------------
// Named errors (repo convention — matches packages/providers/src/index.ts's
// LiteLlmTimeoutError/LiteLlmNetworkError/LiteLlmHttpError/LiteLlmMalformedResponseError family).
// These are never thrown across `ask()`'s public boundary; their `.message` becomes `detail`.
// ---------------------------------------------------------------------------
export class KbTimeoutError extends Error {
  constructor(baseUrl: string, timeoutMs: number) {
    super(`KbTimeoutError: the KnowledgeBase (${baseUrl}) did not respond within ${timeoutMs}ms`);
    this.name = "KbTimeoutError";
  }
}

export class KbNetworkError extends Error {
  constructor(baseUrl: string, reason: string) {
    super(`KbNetworkError: the KnowledgeBase (${baseUrl}) request could not be sent: ${reason}`);
    this.name = "KbNetworkError";
  }
}

export class KbHttpError extends Error {
  readonly status: number;
  constructor(baseUrl: string, status: number) {
    super(`KbHttpError: the KnowledgeBase (${baseUrl}) request failed with HTTP ${status}`);
    this.name = "KbHttpError";
    this.status = status;
  }
}

export class KbCircuitOpenError extends Error {
  constructor(baseUrl: string) {
    super(`KbCircuitOpenError: the KnowledgeBase (${baseUrl}) circuit breaker is open after repeated timeouts or 5xx; failing fast with no network call`);
    this.name = "KbCircuitOpenError";
  }
}

export class KbMalformedResponseError extends Error {
  constructor(baseUrl: string, reason: string) {
    super(`KbMalformedResponseError: the KnowledgeBase (${baseUrl}) returned an unusable response: ${reason}`);
    this.name = "KbMalformedResponseError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------
export const KB_DEFAULT_TIMEOUT_MS = 8_000;
/** T-057: the chat path never waits longer than this for `/ask` (a configured timeout above it is capped; one below it is kept). Lowered 8 s -> 4 s (kb-breaker-route-build). */
export const KB_ASK_TIMEOUT_CAP_MS = 4_000;
/** T-057 r2: the same ceiling for `/search`, which is on the chat path for every turn (a configured timeout above it is capped; one below it is kept). Lowered 8 s -> 4 s. */
export const KB_SEARCH_TIMEOUT_CAP_MS = 4_000;
/** The optional vectorless `GET /route` hits the chat path before `/search`; the KB's own hard deadline is 3 s, so the client gives it 3.5 s. */
export const KB_ROUTE_TIMEOUT_CAP_MS = 3_500;
/** After the KB answers 503 `{error:"route_timeout"}`, /route is skipped for this long (a route-only miss: it never touches the shared breaker). */
export const KB_ROUTE_SOFT_SKIP_MS = 10_000;

/** Circuit breaker defaults (env `VC_KB_BREAKER_FAILS` / `VC_KB_BREAKER_COOLDOWN_MS` override; an `options.breaker` override beats env). */
export const KB_BREAKER_DEFAULT_FAILS = 2;
export const KB_BREAKER_DEFAULT_COOLDOWN_MS = 120_000;

export interface KbBreakerOptions {
  /** Consecutive timeouts / network errors / 5xx before the breaker opens. */
  failThreshold?: number;
  /** How long the breaker stays open (and a missing `/route` stays skipped) before one probe is allowed. */
  cooldownMs?: number;
  /** How long `/route` is skipped after the KB's 503 `route_timeout` (a route-only miss; default `KB_ROUTE_SOFT_SKIP_MS`). */
  routeSkipMs?: number;
}

/** A breaker log line: event name, endpoint path (no query) and a count only. Never a query, a hit or any student text. */
export interface KbBreakerEvent {
  event: "kb_breaker_open" | "kb_breaker_half_open" | "kb_breaker_closed" | "kb_route_unsupported" | "kb_route_timeout_skip";
  endpoint: string;
  failures: number;
}

export interface KnowledgeBaseClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  /** Injectable for tests; defaults to the global `fetch` (Node >=20, per package.json engines). */
  fetchImpl?: typeof fetch;
  /** Circuit breaker thresholds; unset values fall back to env then the defaults above. */
  breaker?: KbBreakerOptions;
  /** Breaker log sink; defaults to one JSON `console.warn` line per transition. */
  onBreakerEvent?: (event: KbBreakerEvent) => void;
}

export interface KnowledgeBaseClient {
  ask(query: string): Promise<KbAskResult>;
}

/** P1/U2: the read endpoints. Kept a separate interface so an ask-only fake still satisfies `KnowledgeBaseClient`. */
export interface KnowledgeBaseReadClient {
  search(query: string, k?: number): Promise<KbSearchResult>;
  /**
   * Vectorless `GET /route?q=&k=` (k default 5, max 20; same auth/scope as /search; same hit shape, parsed by the SAME hit parser;
   * the score only orders hits within one response and is never compared with a /search score). 404/405/501 = `not_found`, skipped
   * for the cooldown. 503 `{error:"route_timeout"}` = a route-only miss: skipped for a short time and never counted by the breaker.
   */
  route(query: string, k?: number): Promise<KbSearchResult>;
  getSession(sessionId: string): Promise<KbSessionResult>;
  gaps(): Promise<KbGapsResult>;
  sources(): Promise<KbSourcesResult>;
}

/** Anonymous mode (A15c): structurally search-only. No `ask`, no `getSession`, so those calls cannot be made. (No `route` either until the KB's /route key scope is known.) */
export type KnowledgeBaseAnonymousClient = Pick<KnowledgeBaseReadClient, "search" | "sources">;

// ---------------------------------------------------------------------------
// P1/U2 read-side shapes (mirror D:/KnowledgeBase packages/core/src/generated/{sessions,turns,sources,gaps}.ts
// and apps/api/src/routes/{search,brain}.ts). `.passthrough()` keeps extra fields; only fields a
// caller needs are required. A hit/row that fails its schema is DROPPED and counted, never repaired.
// ---------------------------------------------------------------------------
export const KbSearchTurnSchema = z
  .object({
    _id: z.string().optional(),
    text: z.string(),
    speakerRef: z.string().optional(),
    speakerLabel: z.string().optional(),
    tStart: z.number().optional(),
    tEnd: z.number().optional(),
    occurredAt: z.string().optional(),
  })
  .passthrough();
export const KbSearchSessionSchema = z
  .object({
    _id: z.string(),
    title: z.string().optional(),
    date: z.string(),
    sourceId: z.string(),
  })
  .passthrough();
export const KbSearchHitSchema = z
  .object({
    turnId: z.string().min(1),
    sessionId: z.string().min(1),
    score: z.number(),
    turn: KbSearchTurnSchema,
    session: KbSearchSessionSchema,
  })
  .passthrough();
export type KbSearchHit = z.infer<typeof KbSearchHitSchema>;
const KbSearchResponseSchema = z.object({ hits: z.array(z.unknown()) }).passthrough();

export interface KbSearchOk {
  status: "ok";
  /** Hits with an inline turn AND session (the only ones a claim can be verified against). */
  hits: KbSearchHit[];
  /** Hits dropped because the turn or session was null/missing/malformed or did not match the hit's ids (B2/A13). */
  dropped: number;
}
export type KbSearchResult = KbSearchOk | KbAskUnavailable;

const KbSessionTurnSchema = z
  .object({
    _id: z.string(),
    text: z.string(),
    speakerRef: z.string().optional(),
    speakerLabel: z.string().optional(),
    tStart: z.number().optional(),
    tEnd: z.number().optional(),
    occurredAt: z.string().optional(),
  })
  .passthrough();
export type KbSessionTurn = z.infer<typeof KbSessionTurnSchema>;
const KbSessionDetailSchema = z
  .object({
    session: KbSearchSessionSchema,
    turns: z.array(z.unknown()),
  })
  .passthrough();

export interface KbSessionOk {
  status: "ok";
  session: { id: string; title?: string; date: string; sourceId: string };
  turns: KbSessionTurn[];
  /** Turns dropped because they failed the turn schema. */
  dropped: number;
}
export type KbSessionResult = KbSessionOk | KbAskUnavailable;

const KbSourcesResponseSchema = z.object({ sources: z.array(z.unknown()) }).passthrough();
const KbSourceRowSchema = z.object({ _id: z.string().min(1), kind: z.string().min(1) }).passthrough();
/** The ONLY thing kept of a `/sources` row (rows also hold path, hash, consent). */
export interface KbSourceKindRow {
  id: string;
  kind: string;
}
export interface KbSourcesOk {
  status: "ok";
  sources: KbSourceKindRow[];
  dropped: number;
}
export type KbSourcesResult = KbSourcesOk | KbAskUnavailable;

const KbGapsResponseSchema = z.object({ gaps: z.array(z.unknown()) }).passthrough();
const KbGapRowSchema = z
  .object({
    _id: z.string().min(1),
    kind: z.string().min(1),
    status: z.string().min(1),
    description: z.string().optional(),
    requestedAt: z.string().optional(),
    sla: z.object({ dueAt: z.string() }).passthrough().optional(),
  })
  .passthrough();
export interface KbGapRow {
  id: string;
  kind: string;
  status: string;
  description?: string;
  requestedAt?: string;
  dueAt?: string;
}
export interface KbGapsOk {
  status: "ok";
  gaps: KbGapRow[];
  dropped: number;
}
export type KbGapsResult = KbGapsOk | KbAskUnavailable;

// ---------------------------------------------------------------------------
// /ask serve rule (spec scope item 3, G6, A4, A18)
// ---------------------------------------------------------------------------
/** The fixed no-answer text (spec scope item 3). */
export const NO_SOURCED_ANSWER_TEXT = "I don't have a sourced answer for this yet.";

export type AskWithheldCause = "verdict_not_correct" | "insufficient_coverage" | "web_used" | "no_internal_sources";

export type ServedAsk =
  | {
      status: "answered";
      answer: string;
      citations: KbCitations;
      verdict: string;
      reason: string;
      /** A served /ask answer is restricted (non-quotable paraphrase) by default: its source kind is not tagged here. */
      sourceKind: "unknown";
    }
  | {
      status: "no_sourced_answer";
      answer: typeof NO_SOURCED_ANSWER_TEXT;
      citations: KbCitations;
      verdict: string;
      reason: "";
      withheld: AskWithheldCause[];
    }
  | {
      status: "unavailable";
      answer: typeof NO_SOURCED_ANSWER_TEXT;
      citations: KbCitations;
      verdict: "unavailable";
      reason: "";
      unavailableReason: KbUnavailableReason;
      detail: string;
    };

const EMPTY_CITATIONS: KbCitations = { internal: [], web: [] };

/**
 * Serve an `/ask` answer ONLY when verdict == "correct" AND insufficient_coverage == false AND
 * web_used == false AND at least one internal source exists (this 4th clause is deliberately stricter
 * than spec G6: a "correct" answer backed only by web sources is withheld). Anything else is the fixed
 * no-answer text with NO generated answer, NO reason text and NO citations leaking through
 * (`ask-v2.ts` returns a generated `answer` over weak context when web fallback is off or failed,
 * `web_used:false`, `insufficient_coverage:true`). `sources.web` never reaches the result, even on
 * a served answer. An outage is the same fixed text, typed `unavailable`.
 */
export function applyServeRule(result: KbAskResult): ServedAsk {
  if (result.status !== "ok") {
    return {
      status: "unavailable",
      answer: NO_SOURCED_ANSWER_TEXT,
      citations: EMPTY_CITATIONS,
      verdict: "unavailable",
      reason: "",
      unavailableReason: result.reason,
      detail: result.detail,
    };
  }
  const withheld: AskWithheldCause[] = [];
  if (result.verdict !== "correct") withheld.push("verdict_not_correct");
  if (result.insufficientCoverage) withheld.push("insufficient_coverage");
  if (result.webUsed) withheld.push("web_used");
  if (result.citations.internal.length === 0) withheld.push("no_internal_sources");
  if (withheld.length > 0) {
    return {
      status: "no_sourced_answer",
      answer: NO_SOURCED_ANSWER_TEXT,
      citations: EMPTY_CITATIONS,
      verdict: result.verdict,
      reason: "",
      withheld,
    };
  }
  return {
    status: "answered",
    answer: result.answer,
    citations: { internal: result.citations.internal, web: [] },
    verdict: result.verdict,
    reason: result.reason,
    sourceKind: "unknown",
  };
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------
type Fetched = { ok: true; json: unknown } | { ok: false; unavailable: KbAskUnavailable; tripped: boolean; soft?: "route_timeout" };

interface RequestSpec {
  method: "GET" | "POST";
  path: string;
  /** Only for POST /ask. */
  body?: unknown;
  /** GET calls carry user text in the URL: never echo the underlying error message into `detail`. */
  redactNetworkMessage?: boolean;
  /** `GET /sessions/:id` 404 = the session cannot be re-read (A13), not a generic HTTP error. */
  notFoundReason?: boolean;
  /** Extra statuses (besides a 404 under `notFoundReason`) that mean `not_found`: `GET /route` is "unsupported" on 404/405/501. */
  notFoundStatuses?: readonly number[];
  /** Per-call ceiling on the configured timeout (the lower of the two applies). */
  timeoutCapMs?: number;
  /** `GET /route`: a 503 whose body is `{error:"route_timeout"}` is a route-only miss (`soft`), not a server failure. */
  routeTimeoutIs503?: boolean;
}

// ---------------------------------------------------------------------------
// Circuit breaker (kb-breaker-route-build). One state per KB base URL, in memory, shared by every client built for that
// URL (the anonymous and the authenticated client talk to the same KB, so a hang seen by one spares the other).
// closed -> (N consecutive timeouts / network errors / 5xx) -> open for a cooldown -> half-open (ONE probe) -> closed on
// success, open again on failure. While open, calls fail fast with `circuit_open` and make NO network call.
// ---------------------------------------------------------------------------
interface KbHostState {
  failures: number;
  /** Epoch ms the breaker opened; null while closed. */
  openedAt: number | null;
  /** A half-open probe is in flight: every other call fails fast until it settles. */
  probing: boolean;
  /** Epoch ms until which `GET /route` is skipped (unsupported by the KB, or it just timed out / 5xx'd). */
  routeSkipUntil: number;
}

const kbHostStates = new Map<string, KbHostState>();

function hostState(baseUrl: string): KbHostState {
  let state = kbHostStates.get(baseUrl);
  if (!state) {
    state = { failures: 0, openedAt: null, probing: false, routeSkipUntil: 0 };
    kbHostStates.set(baseUrl, state);
  }
  return state;
}

/** Test hook: forget every breaker and every "route unsupported" mark. */
export function resetKbBreakers(): void {
  kbHostStates.clear();
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = raw === undefined ? NaN : Number(raw.trim());
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function resolveBreaker(options: KnowledgeBaseClientOptions): { failThreshold: number; cooldownMs: number; routeSkipMs: number } {
  const env = typeof process === "undefined" ? {} : process.env;
  const pick = (given: number | undefined, envValue: string | undefined, fallback: number) =>
    given !== undefined && Number.isInteger(given) && given > 0 ? given : positiveInt(envValue, fallback);
  return {
    failThreshold: pick(options.breaker?.failThreshold, env.VC_KB_BREAKER_FAILS, KB_BREAKER_DEFAULT_FAILS),
    cooldownMs: pick(options.breaker?.cooldownMs, env.VC_KB_BREAKER_COOLDOWN_MS, KB_BREAKER_DEFAULT_COOLDOWN_MS),
    routeSkipMs: pick(options.breaker?.routeSkipMs, undefined, KB_ROUTE_SOFT_SKIP_MS),
  };
}

function defaultBreakerLog(e: KbBreakerEvent): void {
  console.warn(JSON.stringify(e));
}

/** Request path without its query string: the query carries student text and must never reach a log line. */
function endpointOf(path: string): string {
  const q = path.indexOf("?");
  return q === -1 ? path : path.slice(0, q);
}

function makeTransport(options: KnowledgeBaseClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const { apiKey } = options;
  const configuredTimeoutMs = options.timeoutMs ?? KB_DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const breaker = resolveBreaker(options);
  const log = options.onBreakerEvent ?? defaultBreakerLog;

  const send = async function send(spec: RequestSpec): Promise<Fetched> {
    const fail = (reason: KbUnavailableReason, detail: string, httpStatus?: number): Fetched => ({
      ok: false,
      unavailable: { status: "unavailable", reason, detail },
      tripped: reason === "timeout" || reason === "network_error" || (reason === "http_error" && httpStatus !== undefined && httpStatus >= 500),
    });
    const timeoutMs = spec.timeoutCapMs === undefined ? configuredTimeoutMs : Math.min(configuredTimeoutMs, spec.timeoutCapMs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // T-057: the timer stays armed until the body is read (a slow body download used to run with no deadline).
    try {
      let res: Response;
      try {
        res = await fetchImpl(`${baseUrl}${spec.path}`, {
          method: spec.method,
          headers:
            spec.method === "POST"
              ? { "content-type": "application/json", authorization: `Bearer ${apiKey}` }
              : { accept: "application/json", authorization: `Bearer ${apiKey}` },
          ...(spec.method === "POST" ? { body: JSON.stringify(spec.body) } : {}),
          signal: controller.signal,
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return fail("timeout", new KbTimeoutError(baseUrl, timeoutMs).message);
        }
        const why = spec.redactNetworkMessage
          ? err instanceof Error
            ? err.name
            : "unknown"
          : err instanceof Error
            ? err.message
            : String(err);
        return fail("network_error", new KbNetworkError(baseUrl, why).message);
      }

      if (res.status === 401 || res.status === 403) {
        return fail("unauthorized", new KbHttpError(baseUrl, res.status).message);
      }
      if ((res.status === 404 && spec.notFoundReason) || spec.notFoundStatuses?.includes(res.status)) {
        return fail("not_found", new KbHttpError(baseUrl, res.status).message);
      }
      const readJson = async (): Promise<unknown> => {
        const aborted = new Promise<never>((_, reject) => {
          const onAbort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          if (controller.signal.aborted) onAbort();
          else controller.signal.addEventListener("abort", onAbort, { once: true });
        });
        aborted.catch(() => undefined);
        const body = res.json();
        body.catch(() => undefined);
        return Promise.race([body, aborted]);
      };
      if (res.status === 503 && spec.routeTimeoutIs503) {
        // The KB's /route hit its own 3 s deadline: a route-only miss. Not tripped, so the shared breaker never sees it.
        let errorCode: unknown;
        try {
          const parsed = (await readJson()) as { error?: unknown } | null;
          errorCode = parsed && typeof parsed === "object" ? parsed.error : undefined;
        } catch {
          errorCode = undefined;
        }
        if (errorCode === "route_timeout") {
          return {
            ok: false,
            unavailable: { status: "unavailable", reason: "timeout", detail: new KbHttpError(baseUrl, 503).message + " (route_timeout)" },
            tripped: false,
            soft: "route_timeout",
          };
        }
      }
      if (!res.ok) {
        return fail("http_error", new KbHttpError(baseUrl, res.status).message, res.status);
      }
      try {
        return { ok: true, json: await readJson() };
      } catch (err) {
        if (controller.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
          return fail("timeout", new KbTimeoutError(baseUrl, timeoutMs).message);
        }
        return fail("malformed_response", new KbMalformedResponseError(baseUrl, "response body was not valid JSON").message);
      }
    } finally {
      clearTimeout(timer);
    }
  };

  /** The breaker around `send`: fail fast while open, let exactly one probe through after the cooldown, settle on its outcome. */
  const request = async function request(spec: RequestSpec): Promise<Fetched> {
    const state = hostState(baseUrl);
    const endpoint = endpointOf(spec.path);
    let probe = false;
    if (state.openedAt !== null) {
      if (Date.now() - state.openedAt < breaker.cooldownMs || state.probing) {
        return {
          ok: false,
          unavailable: { status: "unavailable", reason: "circuit_open", detail: new KbCircuitOpenError(baseUrl).message },
          tripped: false,
        };
      }
      state.probing = true;
      probe = true;
      log({ event: "kb_breaker_half_open", endpoint, failures: state.failures });
    }
    let fetched: Fetched | undefined;
    try {
      fetched = await send(spec);
      return fetched;
    } finally {
      const tripped = fetched === undefined || (!fetched.ok && fetched.tripped);
      if (probe) {
        state.probing = false;
        if (tripped) {
          state.openedAt = Date.now();
          log({ event: "kb_breaker_open", endpoint, failures: state.failures });
        } else {
          state.failures = 0;
          state.openedAt = null;
          log({ event: "kb_breaker_closed", endpoint, failures: 0 });
        }
      } else if (state.openedAt === null) {
        // Closed: count consecutive failures. (A call that was already in flight when the breaker opened settles into the open state and is ignored.)
        if (tripped) {
          state.failures += 1;
          if (state.failures >= breaker.failThreshold) {
            state.openedAt = Date.now();
            log({ event: "kb_breaker_open", endpoint, failures: state.failures });
          }
        } else {
          state.failures = 0;
        }
      }
    }
  };

  return Object.assign(request, {
    /** True while `GET /route` is being skipped (unsupported by the KB, or it just failed). No network. */
    routeSkipped: (): boolean => Date.now() < hostState(baseUrl).routeSkipUntil,
    /** Skip `GET /route` for one breaker cooldown. */
    skipRoute: (): void => {
      const state = hostState(baseUrl);
      state.routeSkipUntil = Date.now() + breaker.cooldownMs;
      log({ event: "kb_route_unsupported", endpoint: "/route", failures: state.failures });
    },
    /** Skip `GET /route` for the SHORT route-timeout skip only; the shared breaker state (failures, open) is not touched. */
    skipRouteBriefly: (): void => {
      const state = hostState(baseUrl);
      state.routeSkipUntil = Math.max(state.routeSkipUntil, Date.now() + breaker.routeSkipMs);
      log({ event: "kb_route_timeout_skip", endpoint: "/route", failures: state.failures });
    },
  });
}

function invalidSchema(options: KnowledgeBaseClientOptions, message: string): KbAskUnavailable {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  return {
    status: "unavailable",
    reason: "invalid_schema",
    detail: new KbMalformedResponseError(baseUrl, `response failed schema validation: ${message}`).message,
  };
}

/**
 * The ONE hit parser/validator for `{ hits: [...] }` bodies, shared by `GET /search` and `GET /route`. A hit with no inline
 * turn/session (null in the KB response) cannot be checked against its text (A13). A hit whose inline turn/session is a
 * different record than the ids it claims (or has no turn id to compare) is likewise dropped and counted: its text cannot be
 * vouched for as that turn's text.
 */
function parseSearchBody(options: KnowledgeBaseClientOptions, json: unknown): KbSearchResult {
  const parsed = KbSearchResponseSchema.safeParse(json);
  if (!parsed.success) return invalidSchema(options, "body is not { hits: [] }");
  const hits: KbSearchHit[] = [];
  let dropped = 0;
  for (const raw of parsed.data.hits) {
    const hit = KbSearchHitSchema.safeParse(raw);
    if (hit.success && hit.data.turn._id === hit.data.turnId && hit.data.session._id === hit.data.sessionId) {
      hits.push(hit.data);
    } else {
      dropped += 1;
    }
  }
  return { status: "ok", hits, dropped };
}

/** `GET /route` statuses that mean "this KB has no vectorless route": the client falls back to `/search` and skips `/route` for the cooldown. */
const ROUTE_UNSUPPORTED_STATUSES = [404, 405, 501] as const;

const KB_ROUTE_DEFAULT_K = 5;
const KB_ROUTE_MAX_K = 20;
/** `k` for /route: default 5, at most 20, at least 1 (the KB's contract). */
function clampRouteK(k: number | undefined): number {
  if (k === undefined || !Number.isFinite(k)) return KB_ROUTE_DEFAULT_K;
  return Math.min(KB_ROUTE_MAX_K, Math.max(1, Math.floor(k)));
}

function makeReadClient(options: KnowledgeBaseClientOptions): KnowledgeBaseReadClient {
  const request = makeTransport(options);
  return {
    async search(query: string, k?: number): Promise<KbSearchResult> {
      const params = new URLSearchParams({ q: query });
      if (k !== undefined) params.set("k", String(k));
      const fetched = await request({ method: "GET", path: `/search?${params.toString()}`, redactNetworkMessage: true, timeoutCapMs: KB_SEARCH_TIMEOUT_CAP_MS });
      if (!fetched.ok) return fetched.unavailable;
      return parseSearchBody(options, fetched.json);
    },

    async route(query: string, k?: number): Promise<KbSearchResult> {
      // A route the KB does not have (or that just timed out / 5xx'd) is not retried every turn: no network until the cooldown ends.
      if (request.routeSkipped()) {
        return {
          status: "unavailable",
          reason: "not_found",
          detail: `KbHttpError: the KnowledgeBase (${options.baseUrl.replace(/\/+$/, "")}) /route is being skipped (unsupported or failing); /search is used`,
        };
      }
      // Contract (KB wave/kb-route, draft): GET /route?q=<text>&k=<n>, k default 5 max 20, same auth/scope as /search.
      const params = new URLSearchParams({ q: query, k: String(clampRouteK(k)) });
      const fetched = await request({
        method: "GET",
        path: `/route?${params.toString()}`,
        redactNetworkMessage: true,
        notFoundStatuses: ROUTE_UNSUPPORTED_STATUSES,
        timeoutCapMs: KB_ROUTE_TIMEOUT_CAP_MS,
        routeTimeoutIs503: true,
      });
      if (!fetched.ok) {
        if (fetched.soft === "route_timeout") {
          // The KB's own 3 s route deadline: a route-only miss. The caller falls back to /search at once; only a short skip, no breaker count.
          request.skipRouteBriefly();
          return fetched.unavailable;
        }
        // Unsupported (404/405/501), refused (401/403: e.g. a search-only key without the route scope) or failing (timeout/5xx):
        // skip /route for the cooldown. A breaker-open refusal is not a route verdict and is not cached here.
        if (fetched.unavailable.reason === "not_found" || fetched.unavailable.reason === "unauthorized" || fetched.tripped) request.skipRoute();
        return fetched.unavailable;
      }
      return parseSearchBody(options, fetched.json);
    },

    async getSession(sessionId: string): Promise<KbSessionResult> {
      const fetched = await request({
        method: "GET",
        path: `/sessions/${encodeURIComponent(sessionId)}`,
        redactNetworkMessage: true,
        notFoundReason: true,
      });
      if (!fetched.ok) return fetched.unavailable;
      const parsed = KbSessionDetailSchema.safeParse(fetched.json);
      if (!parsed.success) return invalidSchema(options, "body is not a session detail");
      // A different session than asked for is never passed on as the requested one.
      if (parsed.data.session._id !== sessionId) {
        return invalidSchema(options, "returned session id differs from the requested id");
      }
      const turns: KbSessionTurn[] = [];
      let dropped = 0;
      for (const raw of parsed.data.turns) {
        const turn = KbSessionTurnSchema.safeParse(raw);
        if (turn.success) turns.push(turn.data);
        else dropped += 1;
      }
      const s = parsed.data.session;
      return {
        status: "ok",
        session: { id: s._id, ...(s.title !== undefined ? { title: s.title } : {}), date: s.date, sourceId: s.sourceId },
        turns,
        dropped,
      };
    },

    async gaps(): Promise<KbGapsResult> {
      const fetched = await request({ method: "GET", path: "/gaps", redactNetworkMessage: true });
      if (!fetched.ok) return fetched.unavailable;
      const parsed = KbGapsResponseSchema.safeParse(fetched.json);
      if (!parsed.success) return invalidSchema(options, "body is not { gaps: [] }");
      const gaps: KbGapRow[] = [];
      let dropped = 0;
      for (const raw of parsed.data.gaps) {
        const row = KbGapRowSchema.safeParse(raw);
        if (!row.success) {
          dropped += 1;
          continue;
        }
        const g = row.data;
        gaps.push({
          id: g._id,
          kind: g.kind,
          status: g.status,
          ...(g.description !== undefined ? { description: g.description } : {}),
          ...(g.requestedAt !== undefined ? { requestedAt: g.requestedAt } : {}),
          ...(g.sla ? { dueAt: g.sla.dueAt } : {}),
        });
      }
      return { status: "ok", gaps, dropped };
    },

    async sources(): Promise<KbSourcesResult> {
      const fetched = await request({ method: "GET", path: "/sources", redactNetworkMessage: true });
      if (!fetched.ok) return fetched.unavailable;
      const parsed = KbSourcesResponseSchema.safeParse(fetched.json);
      if (!parsed.success) return invalidSchema(options, "body is not { sources: [] }");
      const sources: KbSourceKindRow[] = [];
      let dropped = 0;
      for (const raw of parsed.data.sources) {
        const row = KbSourceRowSchema.safeParse(raw);
        // Only { id, kind } survives: path, hash and consent are never kept (spec scope item 2).
        if (row.success) sources.push({ id: row.data._id, kind: row.data.kind });
        else dropped += 1;
      }
      return { status: "ok", sources, dropped };
    },
  };
}

/**
 * Anonymous-mode KB client (A15c). Built with its own (search-only) key. The returned object has
 * ONLY `search` and `sources`: there is no `ask` and no `getSession` to call, so egress is
 * structurally `GET /search?q=...` and `GET /sources`, with no tenant, student or thread identifier.
 */
export function createAnonymousKbClient(options: KnowledgeBaseClientOptions): KnowledgeBaseAnonymousClient {
  const read = makeReadClient(options);
  return { search: read.search, sources: read.sources };
}

export function createKnowledgeBaseClient(
  options: KnowledgeBaseClientOptions,
): KnowledgeBaseClient & KnowledgeBaseReadClient {
  const request = makeTransport(options);
  const read = makeReadClient(options);

  return {
    ...read,
    async ask(query: string): Promise<KbAskResult> {
      const fetched = await request({ method: "POST", path: "/ask", body: { query }, timeoutCapMs: KB_ASK_TIMEOUT_CAP_MS });
      if (!fetched.ok) return fetched.unavailable;

      const parsed = KbAskResponseSchema.safeParse(fetched.json);
      if (!parsed.success) return invalidSchema(options, parsed.error.message);

      const data = parsed.data;
      // G6: "no coverage" (verdict incorrect/ambiguous, insufficient_coverage, internal [] and web []) is a
      // legitimate KB answer and goes to the serve rule, which maps it to no_sourced_answer. Only a verdict
      // "correct" answer that carries no citation at all is the contract-violating uncited case (B2/B21):
      // it is an unavailable outage-class result, never passed on as an answer.
      const hasCitations = data.sources.internal.length > 0 || data.sources.web.length > 0;
      if (data.verdict === "correct" && !hasCitations) {
        return {
          status: "unavailable",
          reason: "uncited",
          detail:
            "the KnowledgeBase returned a verdict-correct answer with zero citations in both sources.internal and " +
            "sources.web -- contract B2/B21 forbids passing an uncited answer through as an answer",
        };
      }

      return {
        status: "ok",
        answer: data.answer,
        citations: data.sources,
        verdict: data.verdict,
        reason: data.reason,
        scored: data.scored,
        webUsed: data.web_used,
        insufficientCoverage: data.insufficient_coverage,
        auditLog: data.auditLog,
        raw: data,
      };
    },
  };
}

/**
 * Reads `VC_KB_BASE_URL`/`VC_KB_API_KEY` (names only in `.env.example`, contract B11) from an
 * env-shaped object. The KB client is an OPTIONAL feature of the university-kb MCP server (the
 * two existing Mongo-backed tools work with no KB configured — ARCHITECTURE.md §6 Q1 stays open):
 * absent `VC_KB_BASE_URL` returns `null` (feature off). Present `VC_KB_BASE_URL` with a missing
 * `VC_KB_API_KEY` throws rather than silently building a client with no key.
 */
export function loadKbConfigFromEnv(
  env: Record<string, string | undefined>,
): Pick<KnowledgeBaseClientOptions, "baseUrl" | "apiKey"> | null {
  const baseUrl = env.VC_KB_BASE_URL?.trim();
  if (!baseUrl) return null;
  const apiKey = env.VC_KB_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "loadKbConfigFromEnv: VC_KB_BASE_URL is set but VC_KB_API_KEY is missing -- the key is required, never defaulted (contract B11)",
    );
  }
  return { baseUrl, apiKey };
}

/**
 * Anonymous-mode config (A15c, plan U2/G4): the SAME base URL but its OWN search-only key,
 * `VC_KB_ANON_API_KEY`. It never falls back to `VC_KB_API_KEY`, so "anonymous never reaches /ask" is
 * structural (the key lacks the `ask` scope), not only asserted. Absent base URL = feature off (null);
 * base URL without the anonymous key throws.
 */
export function loadAnonymousKbConfigFromEnv(
  env: Record<string, string | undefined>,
): Pick<KnowledgeBaseClientOptions, "baseUrl" | "apiKey"> | null {
  const baseUrl = env.VC_KB_BASE_URL?.trim();
  if (!baseUrl) return null;
  const apiKey = env.VC_KB_ANON_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "loadAnonymousKbConfigFromEnv: VC_KB_BASE_URL is set but VC_KB_ANON_API_KEY is missing -- the anonymous key is required and never falls back to VC_KB_API_KEY (contract B11)",
    );
  }
  return { baseUrl, apiKey };
}
