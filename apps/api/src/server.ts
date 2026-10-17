/**
 * T-025 (contract B21, D-021): the VC HTTP API over the existing engine and @vc/db functions.
 *
 * New file (apps/api had no server). Two layers:
 *   - `createApiHandler(deps)`: a pure request -> response function (no sockets), so every rule is
 *     tested without a port;
 *   - `createApiServer(handler)`: the thin node:http adapter (1 MiB body limit).
 *
 * The order for every request is fixed, and nothing reads or writes the database before step 3:
 *   1. route match (unknown path 404, known path with another method 405 + Allow);
 *   2. bearer auth (auth.ts). EVERY failure is the same 401 body and header, and neither
 *      `dbForTenant` nor `graphForTenant` is called (the spy test proves it);
 *   3. role check (403), then path id / query / body validation (400);
 *   4. the handler, which only ever receives the TENANT-SCOPED Db and scribe graph for the token's
 *      `tenant` claim (packages/db tenant.ts): a tenant can neither see nor change another tenant's
 *      documents, and a cross-tenant id answers exactly as an id that never existed.
 *
 * Errors: known domain errors map to fixed status codes and short fixed codes. Nothing from an
 * error message, a token or a stored document is echoed back; a 5xx is logged with errorLabel
 * (name + code only, B13) and the route id.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { ZodError, z, type ZodTypeAny } from "zod";

import {
  ConsentRequiredError,
  ErasureConfigError,
  ErasureConfirmTokenError,
  ErasureExpiredError,
  ErasureIncompleteError,
  ErasureNotApprovedError,
  ErasureNotConfirmedError,
  ErasureRequestAlreadyOpenError,
  ErasureRequestNotFoundError,
  ErasureSelfApproveError,
  ErasureStateError,
  FencedWriterDeadlineError,
  StudentFencedError,
  approveErasure,
  confirmErasure,
  reconfirmErasure,
  rejectErasure,
  type ErasureWorkflowConfig,
  errorLabel,
  executeErasure,
  exportStudent,
  getErasureRequest,
  getFactsByIds,
  hasStudentSession,
  isStudentFenced,
  readActiveProfile,
  readSessionTranscript,
  requestErasure,
  tenantScopedClient,
  tenantScopedDb,
} from "@vc/db";
import {
  ApprovalResponseError,
  ApprovalResponseSchema,
  ScribeInputSchema,
  ScribeResultSchema,
  CONCERN_CLASSIFIER_SKILL,
  loadConcernClassifierConfig,
  loadSkill,
  type EscalationDeps,
  MongoWebhookEmitGapLedger,
  MongoWebhookOutbox,
  buildConcernFlaggedEvent,
  buildErasureRequestedEvent,
  buildFactApprovedEvent,
  compileScribeGraph,
  createScribeCheckpointer,
  inspectScribe,
  readStudentConcerns,
  resumeScribe,
  scribeThreadId,
  startScribe,
  type ScribeGraph,
  type WebhookEmitGapLedger,
  type WebhookEvent,
  type WebhookOutbox,
} from "@vc/engine";
import { AiUnavailableError, type LlmProvider } from "@vc/providers";
import { ErasureReasonSchema } from "@vc/schemas";
import { bearerToken, type ApiRole, type AuthContext, type JwtVerifier } from "./auth.js";
import { OPENAPI_DOCUMENT } from "./openapi.js";

// The driver types, taken from @vc/db (apps/api does not depend on the driver package itself).
type Db = ReturnType<typeof tenantScopedDb>;
type MongoClient = Parameters<typeof tenantScopedClient>[0];

/** A path id (studentId, sessionId): what the engine's own ids look like, and nothing else. */
export const PATH_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
/** An erasure request id (ObjectId hex, packages/db erasure.ts). */
export const REQUEST_ID_PATTERN = /^[0-9a-f]{24}$/;
/** A consent purpose in the profile query. */
export const PURPOSE_PATTERN = /^[a-z][a-z_]{0,63}$/;
export const MAX_BODY_BYTES = 1024 * 1024;

export interface ApiRequest {
  method: string;
  /** Path plus optional query, as sent (`/v1/...?...`). */
  url: string;
  headers: Record<string, string | string[] | undefined>;
  /** Reads the body; rejects with BodyTooLargeError past MAX_BODY_BYTES. */
  readBody(): Promise<string>;
}

export interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface ApiLogLine {
  level: "error";
  event: "api_request_failed";
  route: string;
  status: number;
  error: string;
  ts: string;
}

export interface ApiDeps {
  verifier: JwtVerifier;
  /** The tenant-scoped `virtual_counsellor` Db (tenantScopedDb). Called only after auth succeeds. */
  dbForTenant(tenantId: string): Db;
  /** The scribe graph over that tenant's Db and checkpointer. Called only after auth succeeds. */
  graphForTenant(tenantId: string): ScribeGraph;
  /** Server-side failure log (5xx only). Default: one JSON line on stderr. */
  log?: (line: ApiLogLine) => void;
  /** D-016: a writer deadline shorter than @vc/db FENCED_WRITER_DEADLINE_MS, passed to the scribe. */
  writerDeadlineMs?: number;
  /**
   * T-029: the B15 approver workflow config (@vc/db erasureConfigFromEnv: VC_AUDIT_HMAC_KEY,
   * VC_ERASURE_APPROVER_EMAIL, VC_ERASURE_AUTO_DELETE). Read only by the reconfirm route; absent or
   * throwing = 503 erasure_not_configured and nothing is written.
   */
  erasureConfig?: () => ErasureWorkflowConfig;
  /**
   * T-034 (B21 "Events"): where fact.approved / erasure.requested webhook events are enqueued after
   * their write durably succeeds (@vc/engine webhooks/schemas.ts's buildFactApprovedEvent /
   * buildErasureRequestedEvent). `outboxForTenant` mirrors `dbForTenant` / `graphForTenant`: a
   * MongoWebhookOutbox is bound to ONE tenant-scoped Db at construction (packages/db tenant.ts), so
   * it is built per-request from the verified token's tenant, never held as a single shared
   * instance. Absent = the emission hook is a no-op: no route's response ever depends on it, and
   * enqueue is best-effort even when configured — a failure is logged (api_request_failed) but
   * never turns an already-successful write into an error response (see decideApproval /
   * confirmErasure below). Delivery (actually POSTing to destinationUrl) is a separate worker
   * (@vc/engine drainWebhookOutbox), never run inline in a request — this unit ships no network
   * send.
   *
   * T-042 (ISS-085): `gapsForTenant`, mirroring `outboxForTenant`, is where a webhook emission GAP
   * is durably recorded so it is recoverable rather than silently lost — either a fact.approved
   * read-back discrepancy not explained by a concurrent B15 erasure fence (decideApproval's
   * checkFactReadbackGap, below), or an outbox.enqueue() failure that never reached webhook_outbox
   * at all (emitWebhookEvents, below). Optional and independent of `outboxForTenant`: absent keeps
   * both leaks logged (as before this unit) but not persisted anywhere recoverable — a strictly
   * more-observable degradation, never a regression, and still never turns an already-successful
   * write into an error response.
   */
  webhooks?: {
    outboxForTenant: (tenantId: string) => WebhookOutbox;
    destinationUrl: string;
    gapsForTenant?: (tenantId: string) => WebhookEmitGapLedger;
  };
}

export class BodyTooLargeError extends Error {
  constructor() {
    super(`BodyTooLargeError: the request body exceeds ${MAX_BODY_BYTES} bytes`);
    this.name = "BodyTooLargeError";
  }
}

/** A validation failure at the API boundary: 400 with the issue paths only (never the values). */
class BadRequest extends Error {
  constructor(
    readonly code: string,
    readonly issues?: { path: (string | number)[]; message: string }[],
  ) {
    super(code);
    this.name = "BadRequest";
  }
}

interface Result {
  status: number;
  body: unknown;
}

interface RouteContext {
  auth: AuthContext;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  /** The tenant-scoped Db (named `store`: B12's scanner reserves the driver's accessor name). */
  store: () => Db;
  graph: () => ScribeGraph;
  writerDeadlineMs?: number;
  /** T-029: throws ErasureConfigError when the workflow is not configured. */
  erasureConfig: () => ErasureWorkflowConfig;
  /**
   * T-034 (B21 "Events"): enqueues 0+ signed-webhook events. A no-op when `deps.webhooks` is not
   * configured, and best-effort even when it is: an enqueue failure is logged, never thrown — the
   * route's own write already durably succeeded by the time this runs, and this call must never
   * turn that success into an error response.
   */
  emitWebhookEvents: (events: WebhookEvent[]) => Promise<void>;
  /** ISS-t-034-concern-hook: whether `deps.webhooks` is configured, so a route can skip the read-back
   * that only feeds emitWebhookEvents when emission is a no-op anyway. */
  webhooksConfigured: boolean;
  /** ISS-t-034-concern-hook: a read-back needed to BUILD an event failed after the write it
   * describes succeeded. Logs `error` and, when `gapsForTenant` is configured, records a
   * "readback-gap" row (idempotent by `gapId`). Never throws. */
  recordWebhookReadbackFailure: (input: {
    studentId: string;
    sessionId: string;
    gapId: string;
    detail: string;
    error: string;
  }) => Promise<void>;
  /**
   * T-042 (ISS-085 leak 1): call after emitWebhookEvents, for a decideApproval "written" outcome,
   * with what applyApprovedDiff reported writing (`writtenFactIds`) and what getFactsByIds actually
   * read back (`written`). getFactsByIds silently omits any id it can't find (its own docstring),
   * so the two can legitimately differ in length. Equal lengths: no-op. Unequal: a concurrent B15
   * erasure fence on `studentId` explains EVERY missing id as correct behaviour (never alerted, see
   * @vc/db isStudentFenced); otherwise a structured alert is logged and one recoverable gap entry
   * is recorded per missing fact id (@vc/engine webhooks/gaps.ts). A no-op when `deps.webhooks` is
   * not configured at all — nothing is being promised to a client to fall short of.
   */
  checkFactReadbackGap: (input: {
    studentId: string;
    sessionId: string;
    writtenFactIds: readonly string[];
    written: readonly { _id: string }[];
  }) => Promise<void>;
}

export interface ApiRoute {
  id: string;
  method: "GET" | "POST";
  /** OpenAPI-style template; `{name}` segments are path params. */
  path: string;
  /** "public" only for the OpenAPI document. */
  roles: readonly ApiRole[] | "public";
  /** Present when the route reads a JSON body. */
  body?: ZodTypeAny;
}

interface RouteDef extends ApiRoute {
  run(ctx: RouteContext): Promise<Result>;
}

const ANY_ROLE = ["counsellor", "admin"] as const;
const ADMIN = ["admin"] as const;
/** T-029: only the JWT role claim "approver" may approve or reject an erasure request. */
const APPROVER = ["approver"] as const;

const StartBodySchema = z.object({ sessionEndedAt: z.unknown(), turns: z.unknown() }).strict();
const ErasureBodySchema = z.object({ reason: ErasureReasonSchema }).strict();
const ReconfirmBodySchema = z.object({ confirmToken: z.string().min(1).max(256) }).strict();

function parseWith<T extends ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw zodBadRequest(parsed.error);
  return parsed.data;
}

function zodBadRequest(err: ZodError): BadRequest {
  return new BadRequest(
    "invalid_request",
    err.issues.map((i) => ({ path: i.path, message: i.code })),
  );
}

function normaliseActor(value: string): string {
  return value.trim().toLowerCase();
}

/** A session route's path must name a session this student owns in this tenant, else 404. */
async function requireSession(ctx: RouteContext): Promise<boolean> {
  return hasStudentSession(ctx.store(), { studentId: ctx.params.studentId!, sessionId: ctx.params.sessionId! });
}

const NOT_FOUND: Result = { status: 404, body: { error: "not_found" } };

function scribeOpts(ctx: RouteContext) {
  return {
    threadId: scribeThreadId(ctx.params.sessionId!),
    counsellorId: ctx.auth.counsellorId,
    ...(ctx.writerDeadlineMs !== undefined ? { writerDeadlineMs: ctx.writerDeadlineMs } : {}),
  };
}

const ROUTES: RouteDef[] = [
  {
    id: "getOpenApi",
    method: "GET",
    path: "/v1/openapi.json",
    roles: "public",
    run: async () => ({ status: 200, body: OPENAPI_DOCUMENT }),
  },
  {
    id: "startScribe",
    method: "POST",
    path: "/v1/students/{studentId}/sessions/{sessionId}/scribe",
    roles: ANY_ROLE,
    body: StartBodySchema,
    run: async (ctx) => {
      const body = ctx.body as z.infer<typeof StartBodySchema>;
      const input = parseWith(ScribeInputSchema, {
        sessionId: ctx.params.sessionId,
        studentId: ctx.params.studentId,
        sessionEndedAt: body.sessionEndedAt,
        turns: body.turns,
      });
      const outcome = await startScribe(ctx.graph(), input, scribeOpts(ctx));
      if (outcome.kind === "done") ScribeResultSchema.parse(outcome.result);
      // ISS-t-034-concern-hook (B20/B21 "Events"): recordSessionConcerns has durably written the
      // session's concern edges by the time startScribe returns. Read back what is ACTUALLY in the
      // Student KG (not re-derived from the input), so a consent-refused, crisis, or
      // fence-compensated session announces nothing. Ids are deterministic per concern, so a
      // replayed start re-enqueues the same ids and the outbox no-ops them.
      if (ctx.webhooksConfigured && outcome.kind !== "fenced") {
        // The scribe run already succeeded, so a failed read-back must never turn it into a 500: it
        // is logged and recorded as a recoverable gap instead (T-042 ledger), and a replayed start
        // re-derives the same ids.
        let concerns: Awaited<ReturnType<typeof readStudentConcerns>> | null = null;
        try {
          concerns = await readStudentConcerns(ctx.store(), {
            studentId: ctx.params.studentId!,
            sessionId: ctx.params.sessionId!,
          });
        } catch (err) {
          await ctx.recordWebhookReadbackFailure({
            studentId: ctx.params.studentId!,
            sessionId: ctx.params.sessionId!,
            gapId: `readback-gap:${ctx.params.studentId!}:${ctx.params.sessionId!}:concerns`,
            detail: `concern-readback-failed:${errorLabel(err)}`,
            error: `webhook_readback_failed:${errorLabel(err)}`,
          });
        }
        if (concerns) {
          await ctx.emitWebhookEvents(
            concerns
              .filter((concern) => concern.level === "concern")
              .map((concern) => buildConcernFlaggedEvent({ tenantId: ctx.auth.tenantId, concern })),
          );
        }
      }
      return { status: 200, body: outcome };
    },
  },
  {
    id: "resumeScribe",
    method: "POST",
    path: "/v1/students/{studentId}/sessions/{sessionId}/scribe/resume",
    roles: ANY_ROLE,
    run: async (ctx) => {
      if (!(await requireSession(ctx))) return NOT_FOUND;
      const graph = ctx.graph();
      const seen = await inspectScribe(graph, scribeThreadId(ctx.params.sessionId!));
      if (seen.kind === "not_found") return NOT_FOUND;
      return { status: 200, body: await resumeScribe(graph, null, scribeOpts(ctx)) };
    },
  },
  {
    id: "getApproval",
    method: "GET",
    path: "/v1/students/{studentId}/sessions/{sessionId}/approval",
    roles: ANY_ROLE,
    run: async (ctx) => {
      if (!(await requireSession(ctx))) return NOT_FOUND;
      const seen = await inspectScribe(ctx.graph(), scribeThreadId(ctx.params.sessionId!));
      if (seen.kind === "not_found") return NOT_FOUND;
      return { status: 200, body: seen };
    },
  },
  {
    id: "decideApproval",
    method: "POST",
    path: "/v1/students/{studentId}/sessions/{sessionId}/approval",
    roles: ANY_ROLE,
    body: ApprovalResponseSchema,
    run: async (ctx) => {
      if (!(await requireSession(ctx))) return NOT_FOUND;
      const graph = ctx.graph();
      const seen = await inspectScribe(graph, scribeThreadId(ctx.params.sessionId!));
      if (seen.kind === "not_found") return NOT_FOUND;
      // A run that ended before any approval (refused, escalated) has nothing to decide.
      if (seen.kind === "done" && seen.decision === null) return { status: 409, body: { error: "no_pending_approval" } };
      const response = ctx.body as z.infer<typeof ApprovalResponseSchema>;
      const outcome = await resumeScribe(graph, response, scribeOpts(ctx));
      // T-034 (B21 "Events", B2 provenance): a fresh "written" outcome means applyApprovedDiff just
      // durably committed these facts. Read back what was ACTUALLY persisted (getFactsByIds) rather
      // than re-deriving the event from `response` itself — the response is the counsellor's
      // intent, not necessarily the stored shape (e.g. a superseded key, a schema default). Never
      // fires for "already_resolved" (this call's own decision was NOT applied, the winner's was;
      // the winner's own decideApproval call already emitted) or for a null result (a pending write
      // this call did not complete).
      if (outcome.kind === "done" && outcome.result.status === "written" && outcome.result.writtenFactIds.length > 0) {
        const written = await getFactsByIds(ctx.store(), ctx.params.studentId!, outcome.result.writtenFactIds);
        await ctx.emitWebhookEvents(
          written.map((fact) =>
            buildFactApprovedEvent({
              tenantId: ctx.auth.tenantId,
              sessionId: ctx.params.sessionId!,
              studentId: ctx.params.studentId!,
              fact,
            }),
          ),
        );
        // T-042 (ISS-085 leak 1): getFactsByIds silently omits any id it can't find. Without this,
        // a short read-back silently shrinks the webhook batch with no check, no log, no error.
        await ctx.checkFactReadbackGap({
          studentId: ctx.params.studentId!,
          sessionId: ctx.params.sessionId!,
          writtenFactIds: outcome.result.writtenFactIds,
          written,
        });
      }
      return { status: 200, body: outcome };
    },
  },
  {
    id: "getTranscript",
    method: "GET",
    path: "/v1/students/{studentId}/sessions/{sessionId}/transcript",
    roles: ANY_ROLE,
    run: async (ctx) => {
      if (!(await requireSession(ctx))) return NOT_FOUND;
      const turns = await readSessionTranscript(ctx.store(), { studentId: ctx.params.studentId!, sessionId: ctx.params.sessionId! });
      return { status: 200, body: { turns } };
    },
  },
  {
    id: "getProfile",
    method: "GET",
    path: "/v1/students/{studentId}/profile",
    roles: ANY_ROLE,
    run: async (ctx) => {
      const purpose = ctx.query.get("purpose");
      if (purpose === null || !PURPOSE_PATTERN.test(purpose)) {
        throw new BadRequest("invalid_request", [{ path: ["purpose"], message: "invalid" }]);
      }
      const facts = await readActiveProfile(ctx.store(), ctx.params.studentId!, purpose);
      return { status: 200, body: { purpose, facts } };
    },
  },
  {
    id: "requestErasure",
    method: "POST",
    path: "/v1/students/{studentId}/erasure-requests",
    roles: ANY_ROLE,
    body: ErasureBodySchema,
    run: async (ctx) => {
      // requireActor (packages/db) refuses a requester who IS the student with a plain Error; this
      // answers it as the caller's mistake before anything is read.
      if (normaliseActor(ctx.auth.counsellorId) === normaliseActor(ctx.params.studentId!)) {
        throw new BadRequest("actor_is_student");
      }
      const { reason } = ctx.body as z.infer<typeof ErasureBodySchema>;
      const out = await requestErasure(ctx.store(), {
        studentId: ctx.params.studentId!,
        requestedBy: ctx.auth.counsellorId,
        reason,
      });
      return { status: 201, body: { requestId: out.requestId } };
    },
  },
  {
    // T-029 step 1: the counsellor's FIRST confirmation. Fences the student, deletes nothing, and
    // returns the single-use token for the second confirmation.
    id: "confirmErasure",
    method: "POST",
    path: "/v1/erasure-requests/{requestId}/confirm",
    roles: ANY_ROLE,
    run: async (ctx) => {
      const out = await confirmErasure(ctx.store(), { requestId: ctx.params.requestId!, confirmedBy: ctx.auth.counsellorId });
      // T-034 (B21 "Events"): the first confirmation is the emission point for erasure.requested —
      // the request is now durably fenced (not merely "someone asked"), and this is the LAST moment
      // the row still carries a clear studentId (the second confirmation redacts it, see
      // ErasureRequestDoc's docstring / getErasureRequest's). Idempotent by (tenantId, requestId)
      // alone, so a retried confirm never double-enqueues.
      const row = await getErasureRequest(ctx.store(), ctx.params.requestId!);
      if (row?.studentId) {
        await ctx.emitWebhookEvents([
          buildErasureRequestedEvent({
            tenantId: ctx.auth.tenantId,
            requestId: ctx.params.requestId!,
            studentId: row.studentId,
            reason: row.reason,
            requestedAt: row.requestedAt,
          }),
        ]);
      }
      return {
        status: 200,
        body: { requestId: ctx.params.requestId, status: "confirmed", confirmToken: out.confirmToken, confirmTokenExpiresAt: out.confirmTokenExpiresAt },
      };
    },
  },
  {
    // T-029 step 2: the SECOND confirmation, same counsellor, with the token. Writes the approval
    // request to the email outbox (202, deletes nothing), or, under autoDelete, runs the purge.
    id: "reconfirmErasure",
    method: "POST",
    path: "/v1/erasure-requests/{requestId}/reconfirm",
    roles: ANY_ROLE,
    body: ReconfirmBodySchema,
    run: async (ctx) => {
      const config = ctx.erasureConfig();
      const { confirmToken } = ctx.body as z.infer<typeof ReconfirmBodySchema>;
      const out = await reconfirmErasure(
        ctx.store(),
        { requestId: ctx.params.requestId!, confirmedBy: ctx.auth.counsellorId, confirmToken },
        config,
      );
      if (out.status === "approved") {
        return { status: 200, body: { ...(await executeErasure(ctx.store(), ctx.params.requestId!)), autoDeleted: true } };
      }
      return { status: 202, body: { requestId: ctx.params.requestId, status: out.status, approvalExpiresAt: out.approvalExpiresAt } };
    },
  },
  {
    // T-029 step 3: the approver (JWT role "approver") approves; the purge runs right after.
    id: "approveErasure",
    method: "POST",
    path: "/v1/erasure-requests/{requestId}/approve",
    roles: APPROVER,
    run: async (ctx) => {
      await approveErasure(ctx.store(), { requestId: ctx.params.requestId!, approvedBy: ctx.auth.counsellorId });
      return { status: 200, body: await executeErasure(ctx.store(), ctx.params.requestId!) };
    },
  },
  {
    // T-029: the approver rejects; nothing is purged and the fence is released.
    id: "rejectErasure",
    method: "POST",
    path: "/v1/erasure-requests/{requestId}/reject",
    roles: APPROVER,
    run: async (ctx) => {
      await rejectErasure(ctx.store(), { requestId: ctx.params.requestId!, rejectedBy: ctx.auth.counsellorId });
      return { status: 200, body: { requestId: ctx.params.requestId, status: "rejected" } };
    },
  },
  {
    // Retry of an APPROVED request whose purge failed (or was interrupted). Refuses anything that is
    // not double-confirmed and approved (T-029).
    id: "executeErasure",
    method: "POST",
    path: "/v1/erasure-requests/{requestId}/execute",
    roles: ADMIN,
    run: async (ctx) => ({ status: 200, body: await executeErasure(ctx.store(), ctx.params.requestId!) }),
  },
  {
    id: "exportStudent",
    method: "GET",
    path: "/v1/students/{studentId}/export",
    roles: ADMIN,
    run: async (ctx) => ({ status: 200, body: await exportStudent(ctx.store(), ctx.params.studentId!) }),
  },
];

/** The route table (without handlers): the OpenAPI drift test and docs read it. */
export const API_ROUTES: readonly ApiRoute[] = ROUTES.map(({ id, method, path, roles, body }) => ({ id, method, path, roles, body }));

function matchPath(template: string, path: string): Record<string, string> | null {
  const want = template.split("/");
  const got = path.split("/");
  if (want.length !== got.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    const w = want[i]!;
    const g = got[i]!;
    if (w.startsWith("{") && w.endsWith("}")) {
      if (g === "") return null;
      params[w.slice(1, -1)] = g;
    } else if (w !== g) {
      return null;
    }
  }
  return params;
}

const BASE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
} as const;

function respond(status: number, body: unknown, extra: Record<string, string> = {}): ApiResponse {
  return { status, headers: { ...BASE_HEADERS, ...extra }, body: JSON.stringify(body) };
}

/** The one 401: identical for a missing, malformed, expired, forged or mis-scoped token. */
function unauthorized(): ApiResponse {
  return respond(401, { error: "unauthorized" }, { "www-authenticate": 'Bearer realm="vc-api"' });
}

function validParams(params: Record<string, string>): boolean {
  for (const [name, value] of Object.entries(params)) {
    const pattern = name === "requestId" ? REQUEST_ID_PATTERN : PATH_ID_PATTERN;
    if (!pattern.test(value)) return false;
  }
  return true;
}

function defaultLog(line: ApiLogLine): void {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(line));
}

/** T-042 (ISS-085): every WebhookEvent variant's `data` carries `studentId` (schemas.ts
 * FactApprovedDataSchema / ErasureRequestedDataSchema / ConcernFlaggedDataSchema), so the gap
 * ledger can always be given a studentId to key its erasure-covered row on. */
function eventStudentId(event: WebhookEvent): string {
  return (event.data as { studentId: string }).studentId;
}

/** Known errors to fixed responses. Returns null for an unexpected error (a logged 500). */
function mapError(err: unknown): Result | null {
  if (err instanceof BadRequest) return { status: 400, body: { error: err.code, ...(err.issues ? { issues: err.issues } : {}) } };
  if (err instanceof ApprovalResponseError) return { status: 400, body: { error: "invalid_approval" } };
  if (err instanceof ConsentRequiredError) return { status: 403, body: { error: "consent_required" } };
  if (err instanceof ErasureSelfApproveError) return { status: 403, body: { error: "self_approve_refused" } };
  if (err instanceof ErasureConfirmTokenError) return { status: 403, body: { error: "confirm_token_invalid" } };
  if (err instanceof ErasureNotApprovedError) return { status: 409, body: { error: "erasure_not_approved" } };
  if (err instanceof ErasureExpiredError) return { status: 410, body: { error: "erasure_expired" } };
  if (err instanceof ErasureConfigError) return { status: 503, body: { error: "erasure_not_configured" } };
  if (err instanceof ErasureRequestNotFoundError) return NOT_FOUND;
  if (err instanceof ErasureNotConfirmedError) return { status: 409, body: { error: "erasure_not_confirmed" } };
  if (err instanceof ErasureStateError) return { status: 409, body: { error: "erasure_state" } };
  if (err instanceof ErasureRequestAlreadyOpenError) return { status: 409, body: { error: "erasure_already_open" } };
  if (err instanceof StudentFencedError) return { status: 409, body: { error: "student_fenced" } };
  if ((err as { code?: unknown } | null)?.code === 11000) return { status: 409, body: { error: "conflict" } };
  if (err instanceof FencedWriterDeadlineError) return { status: 503, body: { error: "writer_deadline" } };
  if (err instanceof AiUnavailableError) return { status: 503, body: { error: "ai_unavailable" } };
  // Counts-only receipt (no ids, no values): the request stays retryable.
  if (err instanceof ErasureIncompleteError) return { status: 500, body: { error: "erasure_incomplete", receipt: err.receipt } };
  return null;
}

export type ApiHandler = (req: ApiRequest) => Promise<ApiResponse>;

export function createApiHandler(deps: ApiDeps): ApiHandler {
  const log = deps.log ?? defaultLog;
  return async (req) => {
    let url: URL;
    try {
      url = new URL(req.url, "http://vc-api.invalid");
    } catch {
      return respond(400, { error: "invalid_request" });
    }
    const method = req.method.toUpperCase();

    // 1. Route match.
    const onPath = ROUTES.map((r) => ({ r, params: matchPath(r.path, url.pathname) })).filter((m) => m.params !== null);
    if (onPath.length === 0) return respond(404, { error: "not_found" });
    const hit = onPath.find((m) => m.r.method === method);
    if (!hit) {
      const allow = [...new Set(onPath.map((m) => m.r.method))].join(", ");
      return respond(405, { error: "method_not_allowed" }, { allow });
    }
    const route = hit.r;
    const params = hit.params!;

    // 2. Auth: nothing below this line runs for an unauthenticated request.
    let auth: AuthContext | undefined;
    if (route.roles !== "public") {
      const header = req.headers.authorization;
      const token = bearerToken(typeof header === "string" ? header : undefined);
      if (token === undefined) return unauthorized();
      try {
        auth = await deps.verifier.verify(token);
      } catch {
        return unauthorized();
      }
      // 3. Role, then path ids.
      if (!route.roles.includes(auth.role)) return respond(403, { error: "forbidden" });
    }
    if (!validParams(params)) return respond(400, { error: "invalid_request", issues: [{ path: ["path"], message: "invalid_id" }] });

    try {
      let body: unknown;
      if (route.body) {
        const raw = await req.readBody();
        let json: unknown;
        try {
          json = JSON.parse(raw);
        } catch {
          throw new BadRequest("invalid_json");
        }
        body = parseWith(route.body, json);
      }
      const tenantId = auth?.tenantId;
      const ctx: RouteContext = {
        auth: auth!,
        params,
        query: url.searchParams,
        body,
        store: () => deps.dbForTenant(tenantId!),
        graph: () => deps.graphForTenant(tenantId!),
        ...(deps.writerDeadlineMs !== undefined ? { writerDeadlineMs: deps.writerDeadlineMs } : {}),
        erasureConfig: () => {
          if (!deps.erasureConfig) throw new ErasureConfigError("the erasure approver workflow is not configured");
          return deps.erasureConfig();
        },
        webhooksConfigured: deps.webhooks !== undefined,
        recordWebhookReadbackFailure: async ({ studentId, sessionId, gapId, detail, error }) => {
          log({ level: "error", event: "api_request_failed", route: route.id, status: 0, error, ts: new Date().toISOString() });
          const gapsForTenant = deps.webhooks?.gapsForTenant;
          if (!gapsForTenant) return;
          try {
            await gapsForTenant(tenantId!).record({ id: gapId, kind: "readback-gap", studentId, sessionId, detail });
          } catch (gapErr) {
            log({
              level: "error",
              event: "api_request_failed",
              route: route.id,
              status: 0,
              error: `webhook_emit_gap_record_failed:${errorLabel(gapErr)}`,
              ts: new Date().toISOString(),
            });
          }
        },
        emitWebhookEvents: async (events: WebhookEvent[]) => {
          if (!deps.webhooks || events.length === 0) return;
          const { outboxForTenant, destinationUrl, gapsForTenant } = deps.webhooks;
          const outbox = outboxForTenant(tenantId!);
          for (const event of events) {
            try {
              await outbox.enqueue({ id: event.id, event, destinationUrl });
            } catch (err) {
              log({
                level: "error",
                event: "api_request_failed",
                route: route.id,
                status: 0,
                error: `webhook_enqueue_failed:${errorLabel(err)}`,
                ts: new Date().toISOString(),
              });
              // T-042 (ISS-085 leak 2): the write this event describes already succeeded --
              // losing the notification silently (the pre-T-042 behaviour) would violate B21.
              // Route it somewhere recoverable: the fully built event, so a reconciliation job
              // can replay it later without rebuilding it.
              if (gapsForTenant) {
                try {
                  await gapsForTenant(tenantId!).record({
                    id: `enqueue-failed:${event.id}`,
                    kind: "enqueue-failed",
                    studentId: eventStudentId(event),
                    event,
                    destinationUrl,
                    detail: `enqueue_failed:${errorLabel(err)}`,
                  });
                } catch (gapErr) {
                  // Last line of defense: even the recovery ledger is unreachable (e.g. a full
                  // outage of the tenant's Mongo). Nothing more can be persisted without risking
                  // yet another write failure mode; this structured log is the only remaining
                  // trace (see qa/manifests/t-042-webhook-fact-loss.md Open gaps).
                  log({
                    level: "error",
                    event: "api_request_failed",
                    route: route.id,
                    status: 0,
                    error: `webhook_emit_gap_record_failed:${errorLabel(gapErr)}`,
                    ts: new Date().toISOString(),
                  });
                }
              }
            }
          }
        },
        checkFactReadbackGap: async ({ studentId, sessionId, writtenFactIds, written }) => {
          if (!deps.webhooks) return;
          if (written.length === writtenFactIds.length) return;
          const foundIds = new Set(written.map((f) => f._id));
          const missingFactIds = writtenFactIds.filter((id) => !foundIds.has(id));
          // A fence blocks every further read of this student, not just one fact -- so if it is
          // up, EVERY id missing from this batch is explained by it (correct behaviour, B15).
          // ISS-090: this check is itself a Mongo read and can throw (e.g. a transient
          // erasure_fences failure). We cannot tell whether the gap is fence-explained in that
          // case, so treat it as an unexplained gap -- alert + record -- rather than letting the
          // exception propagate and turn an already-successful, already-persisted write into a
          // 500 (the exact invariant this function exists to protect).
          let fenced: boolean;
          try {
            fenced = await isStudentFenced(deps.dbForTenant(tenantId!), studentId);
          } catch (err) {
            log({
              level: "error",
              event: "api_request_failed",
              route: route.id,
              status: 0,
              error: `webhook_fact_readback_gap_fence_check_failed:${errorLabel(err)}`,
              ts: new Date().toISOString(),
            });
            fenced = false;
          }
          if (fenced) return;
          log({
            level: "error",
            event: "api_request_failed",
            route: route.id,
            status: 0,
            error: `webhook_fact_readback_gap:${missingFactIds.length}_of_${writtenFactIds.length}_missing`,
            ts: new Date().toISOString(),
          });
          const gapsForTenant = deps.webhooks.gapsForTenant;
          if (!gapsForTenant) return;
          const ledger = gapsForTenant(tenantId!);
          for (const factId of missingFactIds) {
            try {
              await ledger.record({
                id: `readback-gap:${studentId}:${sessionId}:${factId}`,
                kind: "readback-gap",
                studentId,
                sessionId,
                factId,
                detail: "missing-on-readback",
              });
            } catch (err) {
              log({
                level: "error",
                event: "api_request_failed",
                route: route.id,
                status: 0,
                error: `webhook_emit_gap_record_failed:${errorLabel(err)}`,
                ts: new Date().toISOString(),
              });
            }
          }
        },
      };
      const out = await route.run(ctx);
      return respond(out.status, out.body);
    } catch (err) {
      if (err instanceof BodyTooLargeError) return respond(413, { error: "body_too_large" });
      const mapped = mapError(err);
      if (mapped && mapped.status < 500) return respond(mapped.status, mapped.body);
      const status = mapped?.status ?? 500;
      log({ level: "error", event: "api_request_failed", route: route.id, status, error: errorLabel(err), ts: new Date().toISOString() });
      return respond(status, mapped?.body ?? { error: "internal" });
    }
  };
}

function readLimited(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on("data", (chunk: Buffer) => {
      if (done) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        done = true;
        req.resume();
        reject(new BodyTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!done) {
        done = true;
        resolve(Buffer.concat(chunks).toString("utf8"));
      }
    });
    req.on("error", (err) => {
      if (!done) {
        done = true;
        reject(err);
      }
    });
  });
}

/** The node:http adapter. Listening is the caller's job (startApi), so creating one opens nothing. */
export function createApiServer(handler: ApiHandler): Server {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const apiReq: ApiRequest = {
      method: req.method ?? "GET",
      url: req.url ?? "/",
      headers: req.headers,
      readBody: () => readLimited(req),
    };
    handler(apiReq).then(
      (out) => {
        res.writeHead(out.status, out.headers);
        res.end(out.body);
      },
      () => {
        res.writeHead(500, BASE_HEADERS);
        res.end(JSON.stringify({ error: "internal" }));
      },
    );
  });
}

export interface TenantWiringDeps {
  /** The connected client (virtual_counsellor only, B12). Never handed to a route. */
  client: MongoClient;
  /** The unscoped `virtual_counsellor` Db from connectFromEnv. Never handed to a route. */
  db: Db;
  provider: LlmProvider;
  skillsDir: string;
  /** Trusted host factory; tenant identity comes exclusively from verified JWT wiring. */
  escalationForTenant?: (tenantId: string) => EscalationDeps;
}

/**
 * The production wiring behind `dbForTenant` / `graphForTenant`: each tenant gets its own
 * tenant-scoped Db (tenantScopedDb) and a scribe graph whose db AND checkpointer are both scoped
 * (the checkpointer is built on tenantScopedClient, so a checkpoint thread `scribe:<sessionId>` in
 * one tenant is invisible to the same thread id in another). Graphs are cached per tenant.
 *
 * T-034 also returns `webhookOutboxForTenant`: a MongoWebhookOutbox over that SAME tenant-scoped Db,
 * cached per tenant like the graph. Not part of `ApiDeps` directly (`ApiDeps.webhooks` additionally
 * needs a `destinationUrl`, which this scaffold does not own) — the caller (startApi) combines it
 * with `VC_WEBHOOK_DESTINATION_URL` from env.
 *
 * T-042 also returns `gapsForTenant`: a MongoWebhookEmitGapLedger over the same tenant-scoped Db,
 * cached the same way, for the same reason (ApiDeps.webhooks.gapsForTenant is optional and this
 * scaffold does not decide whether it's wired in — startApi does that).
 */
export function createTenantWiring(
  deps: TenantWiringDeps,
): Pick<ApiDeps, "dbForTenant" | "graphForTenant"> & {
  webhookOutboxForTenant: (tenantId: string) => WebhookOutbox;
  gapsForTenant: (tenantId: string) => WebhookEmitGapLedger;
} {
  const graphs = new Map<string, ScribeGraph>();
  const outboxes = new Map<string, WebhookOutbox>();
  const gapLedgers = new Map<string, WebhookEmitGapLedger>();
  const dbForTenant = (tenantId: string): Db => tenantScopedDb(deps.db, tenantId);
  return {
    dbForTenant,
    graphForTenant(tenantId: string): ScribeGraph {
      let graph = graphs.get(tenantId);
      if (!graph) {
        graph = compileScribeGraph(
          { db: dbForTenant(tenantId), provider: deps.provider, skillsDir: deps.skillsDir,
            escalation: deps.escalationForTenant?.(tenantId) ?? {
              recipients: async () => ({ adminIds: [], counsellorIds: [] }),
              classifier: { provider: deps.provider, skillPrompt: loadSkill(deps.skillsDir, CONCERN_CLASSIFIER_SKILL), config: loadConcernClassifierConfig({}) },
            },
          },
          { checkpointer: createScribeCheckpointer(tenantScopedClient(deps.client, tenantId)) },
        );
        graphs.set(tenantId, graph);
      }
      return graph;
    },
    webhookOutboxForTenant(tenantId: string): WebhookOutbox {
      let outbox = outboxes.get(tenantId);
      if (!outbox) {
        outbox = new MongoWebhookOutbox(dbForTenant(tenantId));
        outboxes.set(tenantId, outbox);
      }
      return outbox;
    },
    gapsForTenant(tenantId: string): WebhookEmitGapLedger {
      let ledger = gapLedgers.get(tenantId);
      if (!ledger) {
        ledger = new MongoWebhookEmitGapLedger(dbForTenant(tenantId));
        gapLedgers.set(tenantId, ledger);
      }
      return ledger;
    },
  };
}
