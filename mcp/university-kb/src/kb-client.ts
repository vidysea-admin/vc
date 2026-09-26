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
 * fails schema validation, AND an otherwise-valid answer that carries zero citations in both
 * `sources.internal` and `sources.web` (B2: an uncited answer is never passed on as an answer).
 * Citations that DO exist are carried through completely verbatim (untouched) as `citations`.
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
  | "uncited";

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

export function createKnowledgeBaseClient(options: KnowledgeBaseClientOptions): KnowledgeBaseClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const { apiKey } = options;
  const timeoutMs = options.timeoutMs ?? KB_DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async ask(query: string): Promise<KbAskResult> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetchImpl(`${baseUrl}/ask`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ query }),
          signal: controller.signal,
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return { status: "unavailable", reason: "timeout", detail: new KbTimeoutError(baseUrl, timeoutMs).message };
        }
        return {
          status: "unavailable",
          reason: "network_error",
          detail: new KbNetworkError(baseUrl, err instanceof Error ? err.message : String(err)).message,
        };
      } finally {
        clearTimeout(timer);
      }

      if (res.status === 401 || res.status === 403) {
        return { status: "unavailable", reason: "unauthorized", detail: new KbHttpError(baseUrl, res.status).message };
      }
      if (!res.ok) {
        return { status: "unavailable", reason: "http_error", detail: new KbHttpError(baseUrl, res.status).message };
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch {
        return {
          status: "unavailable",
          reason: "malformed_response",
          detail: new KbMalformedResponseError(baseUrl, "response body was not valid JSON").message,
        };
      }

      const parsed = KbAskResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          status: "unavailable",
          reason: "invalid_schema",
          detail: new KbMalformedResponseError(baseUrl, `response failed schema validation: ${parsed.error.message}`)
            .message,
        };
      }

      const data = parsed.data;
      const hasCitations = data.sources.internal.length > 0 || data.sources.web.length > 0;
      if (!hasCitations) {
        return {
          status: "unavailable",
          reason: "uncited",
          detail:
            "the KnowledgeBase returned an answer with zero citations in both sources.internal and " +
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
