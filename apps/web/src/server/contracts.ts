/**
 * T-008: the Zod contracts of the approval API (B5). The route handlers parse every request with
 * them and parse every response body before sending it; the UI parses every response it receives.
 * Client-safe: imports only zod, @vc/schemas and the engine's schema module (no db, no graph).
 */
import { z } from "zod";
import { CounsellorDecisionSchema } from "@vc/schemas";
import {
  ApprovalRequestSchema,
  MAX_REJECT_REASON_LENGTH,
  PerFactDecisionSchema,
  ScribeInputSchema,
  ScribeResultSchema,
  SummaryDecisionSchema,
} from "@vc/engine/scribe/schemas";

/** T-020: re-exported so the (client-safe) UI can cap the reason input at the same length the server enforces. */
export { MAX_REJECT_REASON_LENGTH };

/** A scribe thread id as it appears in a URL: `scribe:<sessionId>`-style, no spaces or slashes. */
export const ThreadIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9:_\-.]*$/, "thread id: letters, digits, ':', '_', '-', '.' only")
  .refine((id) => !id.includes(".."), "thread id: no '..'");

/** POST body: one decision per proposed fact, plus the summary choice. */
export const DecisionRequestSchema = z
  .object({
    facts: z.array(PerFactDecisionSchema),
    summary: SummaryDecisionSchema,
  })
  .strict();
export type DecisionRequest = z.infer<typeof DecisionRequestSchema>;

const threadId = ThreadIdSchema;

const DoneSchema = z.object({
  state: z.literal("done"),
  threadId,
  result: ScribeResultSchema,
  decision: CounsellorDecisionSchema.nullable(),
  summaryDecision: SummaryDecisionSchema.optional(),
});
const InProgressSchema = z.object({ state: z.literal("in_progress"), threadId });
const FencedSchema = z.object({ state: z.literal("fenced"), threadId });
/** `threadId` is a plain string here: a malformed id is reported back as it was received. */
const NotFoundSchema = z.object({ state: z.literal("not_found"), threadId: z.string() });
const InvalidSchema = z.object({ state: z.literal("invalid"), issues: z.array(z.string()).min(1) });

/** GET /api/approvals/[threadId] */
export const ApprovalViewSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("awaiting_approval"), threadId, request: ApprovalRequestSchema }),
  DoneSchema,
  InProgressSchema,
  FencedSchema,
  NotFoundSchema,
  InvalidSchema,
]);
export type ApprovalView = z.infer<typeof ApprovalViewSchema>;

/** POST /api/approvals/[threadId] */
export const SubmitResultSchema = z.discriminatedUnion("state", [
  DoneSchema,
  z.object({
    state: z.literal("already_resolved"),
    threadId,
    decision: CounsellorDecisionSchema,
    result: ScribeResultSchema.nullable(),
    sameAsWinner: z.boolean(),
  }),
  InProgressSchema,
  FencedSchema,
  NotFoundSchema,
  InvalidSchema,
]);
export type SubmitResult = z.infer<typeof SubmitResultSchema>;

// ---------------------------------------------------------------------------
// T-021 (D-020, contract B6 "runtime failover"): POST /api/sessions starts a new scribe run from a
// transcript. Its only NEW outcome, relative to the approval endpoints above, is "ai_unavailable" —
// the typed error the provider failover chain raises when every model in it failed within the retry
// budget. The client keeps the exact request body it sent (client state, per B6/D-020) so Retry can
// resubmit it unchanged — the counsellor never retypes anything.
// ---------------------------------------------------------------------------

/** POST /api/sessions body: the engine's own ScribeInputSchema (sessionId, studentId, sessionEndedAt, turns). */
export const StartSessionRequestSchema = ScribeInputSchema;
export type StartSessionRequest = z.infer<typeof StartSessionRequestSchema>;

const AiUnavailableSchema = z.object({
  state: z.literal("ai_unavailable"),
  sessionId: z.string(),
  /** Total attempts actually made across the whole failover chain (<= its configured budget). */
  attempts: z.number().int().nonnegative(),
  /** Model names only (never a key value, B11) — the chain FailoverProvider exhausted, config order. */
  modelsAttempted: z.array(z.string()),
});
const StartedSchema = z.object({ state: z.literal("started"), threadId, sessionId: z.string() });
const StartDoneSchema = z.object({ state: z.literal("done"), threadId, result: ScribeResultSchema });

/** POST /api/sessions response. */
export const StartSessionResultSchema = z.discriminatedUnion("state", [
  StartedSchema,
  StartDoneSchema,
  AiUnavailableSchema,
  InProgressSchema,
  FencedSchema,
  InvalidSchema,
]);
export type StartSessionResult = z.infer<typeof StartSessionResultSchema>;
