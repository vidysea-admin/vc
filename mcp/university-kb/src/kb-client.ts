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
  | "not_found";

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

export class KbMalformedResponseError extends Error {
  constructor(baseUrl: string, reason: string) {
    super(`KbMalformedResponseError: the KnowledgeBase (${baseUrl}) returned an unusable response: ${reason}`);
    this.name = "KbMalformedResponseError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------
export const KB_DEFAULT_TIMEOUT_MS = 10_000;

export interface KnowledgeBaseClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  /** Injectable for tests; defaults to the global `fetch` (Node >=20, per package.json engines). */
  fetchImpl?: typeof fetch;
}

export interface KnowledgeBaseClient {
  ask(query: string): Promise<KbAskResult>;
}

/** P1/U2: the read endpoints. Kept a separate interface so an ask-only fake still satisfies `KnowledgeBaseClient`. */
export interface KnowledgeBaseReadClient {
  search(query: string, k?: number): Promise<KbSearchResult>;
  getSession(sessionId: string): Promise<KbSessionResult>;
  gaps(): Promise<KbGapsResult>;
  sources(): Promise<KbSourcesResult>;
}

/** Anonymous mode (A15c): structurally search-only. No `ask`, no `getSession`, so those calls cannot be made. */
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
type Fetched = { ok: true; json: unknown } | { ok: false; unavailable: KbAskUnavailable };

interface RequestSpec {
  method: "GET" | "POST";
  path: string;
  /** Only for POST /ask. */
  body?: unknown;
  /** GET calls carry user text in the URL: never echo the underlying error message into `detail`. */
  redactNetworkMessage?: boolean;
  /** `GET /sessions/:id` 404 = the session cannot be re-read (A13), not a generic HTTP error. */
  notFoundReason?: boolean;
}

function makeTransport(options: KnowledgeBaseClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const { apiKey } = options;
  const timeoutMs = options.timeoutMs ?? KB_DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;

  return async function request(spec: RequestSpec): Promise<Fetched> {
    const fail = (reason: KbUnavailableReason, detail: string): Fetched => ({
      ok: false,
      unavailable: { status: "unavailable", reason, detail },
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
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
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 || res.status === 403) {
      return fail("unauthorized", new KbHttpError(baseUrl, res.status).message);
    }
    if (res.status === 404 && spec.notFoundReason) {
      return fail("not_found", new KbHttpError(baseUrl, res.status).message);
    }
    if (!res.ok) {
      return fail("http_error", new KbHttpError(baseUrl, res.status).message);
    }
    try {
      return { ok: true, json: await res.json() };
    } catch {
      return fail("malformed_response", new KbMalformedResponseError(baseUrl, "response body was not valid JSON").message);
    }
  };
}

function invalidSchema(options: KnowledgeBaseClientOptions, message: string): KbAskUnavailable {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  return {
    status: "unavailable",
    reason: "invalid_schema",
    detail: new KbMalformedResponseError(baseUrl, `response failed schema validation: ${message}`).message,
  };
}

function makeReadClient(options: KnowledgeBaseClientOptions): KnowledgeBaseReadClient {
  const request = makeTransport(options);
  return {
    async search(query: string, k?: number): Promise<KbSearchResult> {
      const params = new URLSearchParams({ q: query });
      if (k !== undefined) params.set("k", String(k));
      const fetched = await request({ method: "GET", path: `/search?${params.toString()}`, redactNetworkMessage: true });
      if (!fetched.ok) return fetched.unavailable;
      const parsed = KbSearchResponseSchema.safeParse(fetched.json);
      if (!parsed.success) return invalidSchema(options, "body is not { hits: [] }");
      const hits: KbSearchHit[] = [];
      let dropped = 0;
      for (const raw of parsed.data.hits) {
        const hit = KbSearchHitSchema.safeParse(raw);
        // A hit with no inline turn/session (null in the KB response) cannot be checked against its text (A13).
        // A hit whose inline turn/session is a different record than the ids it claims (or has no turn id to
        // compare) is likewise dropped and counted: its text cannot be vouched for as that turn's text.
        if (hit.success && hit.data.turn._id === hit.data.turnId && hit.data.session._id === hit.data.sessionId) {
          hits.push(hit.data);
        } else {
          dropped += 1;
        }
      }
      return { status: "ok", hits, dropped };
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
      const fetched = await request({ method: "POST", path: "/ask", body: { query } });
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
