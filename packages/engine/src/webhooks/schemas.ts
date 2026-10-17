/**
 * B21 signed webhooks (D-021): the event envelope + per-type payload shapes VC emits to a client's
 * HTTP endpoint (Pathlynks first) so the client keeps its own copy of approved facts, erasure
 * requests and concern flags (contract B21 "Events"). T-027 (core) built the schemas; T-034 adds the
 * emission-hook builders below (`buildFactApprovedEvent`, `buildErasureRequestedEvent`,
 * `buildConcernFlaggedEvent`), called from apps/api/src/server.ts's decideApproval, confirmErasure
 * and startScribe routes after the write they describe has durably succeeded (decideApproval reads
 * back what applyApprovedDiff wrote via @vc/db getFactsByIds; confirmErasure reads the request row
 * via @vc/db getErasureRequest, the last point it still carries a clear studentId — see
 * getErasureRequest's own docstring; startScribe reads back the concern edges recordSessionConcerns
 * wrote via readStudentConcerns, so a fence-compensated concern is never announced).
 * ISS-t-034-concern-hook wired the concern.flagged builder.
 *
 * B2 provenance is canonical in @vc/schemas: actual persisted counsellor edits carry
 * trusted actor/time and bounded original editedFrom; builders forward it unchanged.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { ConcernRecordSchema, ErasureReasonSchema, FactSourceSchema, type ConcernRecord, type ErasureReason } from "@vc/schemas";

/** The shared canonical source, including bounded counsellor-edit provenance. */
export const WebhookFactSourceSchema = FactSourceSchema;
export type WebhookFactSource = z.infer<typeof WebhookFactSourceSchema>;

export const WebhookFactSensitivitySchema = z.enum(["low", "medium", "high"]);

/** The wire fact subset uses the shared canonical source without rebuilding provenance. */
export const WebhookFactSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  source: WebhookFactSourceSchema,
  confidence: z.number().min(0).max(1),
  purposeTags: z.array(z.string().min(1)).min(1),
  sensitivity: WebhookFactSensitivitySchema,
});
export type WebhookFact = z.infer<typeof WebhookFactSchema>;

export const FactApprovedDataSchema = z.object({
  sessionId: z.string().min(1),
  studentId: z.string().min(1),
  fact: WebhookFactSchema,
});
export type FactApprovedData = z.infer<typeof FactApprovedDataSchema>;

export const ErasureRequestedDataSchema = z.object({
  requestId: z.string().min(1),
  studentId: z.string().min(1),
  reason: ErasureReasonSchema,
  requestedAt: z.string().datetime(),
});
export type ErasureRequestedData = z.infer<typeof ErasureRequestedDataSchema>;

/** Concern-level only (B20). A crisis-level signal (B9) stops generation and escalates through a
 * different, synchronous path — it is not one of this unit's three webhook event types. */
export const ConcernFlaggedDataSchema = z.object({
  sessionId: z.string().min(1),
  studentId: z.string().min(1),
  turnId: z.string().min(1),
  matched: z.array(z.string().min(1)).min(1),
  message: z.string().min(1),
});
export type ConcernFlaggedData = z.infer<typeof ConcernFlaggedDataSchema>;

const WebhookEnvelopeBaseSchema = z.object({
  /** The idempotency key. Delivery (delivery.ts) reuses this verbatim across every retry attempt
   * and sends it as the X-VC-Event-Id header. */
  id: z.string().min(1),
  occurredAt: z.string().datetime(),
  tenantId: z.string().min(1),
});

export const WEBHOOK_EVENT_TYPES = ["fact.approved", "erasure.requested", "concern.flagged"] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export const WebhookEventSchema = z.discriminatedUnion("type", [
  WebhookEnvelopeBaseSchema.extend({ type: z.literal("fact.approved"), data: FactApprovedDataSchema }),
  WebhookEnvelopeBaseSchema.extend({ type: z.literal("erasure.requested"), data: ErasureRequestedDataSchema }),
  WebhookEnvelopeBaseSchema.extend({ type: z.literal("concern.flagged"), data: ConcernFlaggedDataSchema }),
]);
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

// ---------------------------------------------------------------------------
// T-034: emission-hook builders. Pure functions (no I/O, no outbox access) that turn a call site's
// already-durably-written data into a validated WebhookEvent envelope, with a DETERMINISTIC id
// (WebhookOutbox.enqueue is idempotent by id, B21) so a caller that retries the same logical write
// — a replayed approval, a retried erasure request — enqueues the SAME event id and the outbox
// no-ops the duplicate instead of double-delivering. Callers (apps/api/src/server.ts) are
// responsible for calling these AFTER the write they describe has durably succeeded, and for never
// letting an enqueue failure roll that write back (see server.ts's emitFactApprovedEvents /
// emitErasureRequestedEvent docstrings).
// ---------------------------------------------------------------------------

/** A stable hex digest over JSON-stable-enough inputs (object key order here is always the same
 * literal shape at each call site, so JSON.stringify is deterministic in practice). Never used for
 * anything security-sensitive — only to make a repeat call idempotent. */
function stableEventId(prefix: string, parts: unknown[]): string {
  return `${prefix}:${createHash("sha256").update(JSON.stringify(parts)).digest("hex")}`;
}

export interface BuildFactApprovedEventInput {
  tenantId: string;
  sessionId: string;
  studentId: string;
  /** The counsellor-approved Fact (packages/schemas FactSchema) as it was durably written. Extra
   * fields (e.g. `kind`, `explains`) are dropped by WebhookFactSchema.parse — only the wire shape
   * travels. */
  fact: unknown;
  /** Default: now. Tests pass a fixed value. */
  occurredAt?: string;
}

/** B21 "Events": approved facts (with provenance, B2). The id is derived from the fact's own
 * identity (tenant + session + student + key + value + source) rather than a random uuid, so
 * re-approving the exact same content (a checkpoint replay, a retried request) is a no-op at the
 * outbox, never a duplicate delivery. A genuinely edited or re-approved value hashes differently
 * (its value or source differs) and gets its own event, as it should. */
export function buildFactApprovedEvent(input: BuildFactApprovedEventInput): WebhookEvent {
  const fact = WebhookFactSchema.parse(input.fact);
  const id = stableEventId("fact.approved", [input.tenantId, input.sessionId, input.studentId, fact.key, fact.value, fact.source]);
  return WebhookEventSchema.parse({
    id,
    type: "fact.approved",
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    tenantId: input.tenantId,
    data: { sessionId: input.sessionId, studentId: input.studentId, fact },
  });
}

export interface BuildErasureRequestedEventInput {
  tenantId: string;
  requestId: string;
  studentId: string;
  reason: ErasureReason;
  requestedAt: string;
}

/** B21 "Events": erasure requests. The id is derived from `requestId` alone (already a unique,
 * per-request Mongo ObjectId, D-016's one-open-request-per-student index makes it the natural key)
 * so a defensive double-call at the emission call site (never expected in normal operation —
 * requestErasure itself refuses a second open request for the same student) still enqueues once. */
export function buildErasureRequestedEvent(input: BuildErasureRequestedEventInput): WebhookEvent {
  const id = stableEventId("erasure.requested", [input.tenantId, input.requestId]);
  return WebhookEventSchema.parse({
    id,
    type: "erasure.requested",
    occurredAt: input.requestedAt,
    tenantId: input.tenantId,
    data: {
      requestId: input.requestId,
      studentId: input.studentId,
      reason: input.reason,
      requestedAt: input.requestedAt,
    },
  });
}

export interface BuildConcernFlaggedEventInput {
  tenantId: string;
  /** A ConcernRecord (packages/schemas) exactly as recordSessionConcerns durably wrote it to the
   * Student KG (read back via readStudentConcerns). */
  concern: ConcernRecord;
  /** Default: now. Tests pass a fixed value. */
  occurredAt?: string;
}

/** B20/B21 "Events": a concern-level flag (ISS-t-034-concern-hook). Wire shape only: the student and
 * session ids, the flagged turn's id, the guard patterns that fired and the fixed descriptive
 * `reason` as `message` — NOT the cited transcript quote (the client reads the turn through the
 * authenticated transcript API; the webhook is a signal, not a copy of what the student said).
 * Crisis-level records are refused: they escalate synchronously (B9/B16), never through this
 * event. The id is derived from (tenant, student, concernId) — concernId is already
 * `${sessionId}:${turnId}` — so a replayed scribe start, which re-derives the same concern edges,
 * enqueues the SAME id and the outbox no-ops it. */
export function buildConcernFlaggedEvent(input: BuildConcernFlaggedEventInput): WebhookEvent {
  const concern = ConcernRecordSchema.parse(input.concern);
  if (concern.level !== "concern") throw new Error("buildConcernFlaggedEvent: only concern-level records are webhook events");
  const id = stableEventId("concern.flagged", [input.tenantId, concern.studentId, concern.concernId]);
  return WebhookEventSchema.parse({
    id,
    type: "concern.flagged",
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    tenantId: input.tenantId,
    data: {
      sessionId: concern.sessionId,
      studentId: concern.studentId,
      turnId: concern.citation.turnId,
      matched: concern.matched,
      message: concern.reason,
    },
  });
}
