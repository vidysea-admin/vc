/**
 * B21 signed webhooks (D-021), CORE ONLY (T-027): the event envelope + per-type payload shapes VC
 * emits to a client's HTTP endpoint (Pathlynks first) so the client keeps its own copy of approved
 * facts, erasure requests and concern flags (contract B21 "Events"). No emission wiring lives here
 * yet — the Mongo outbox collection and the approval/erasure/concern flow hooks land after
 * T-025/T-022/T-029 (out of this unit's scope by design).
 *
 * Provenance note (B2, gate qa/gates/edit-provenance.md): @vc/schemas' `FactSourceSchema` does not
 * yet carry a `counsellor-edit` variant — that lands with T-023's edit-provenance work, which is a
 * sibling unit in the same parallel wave and must not be touched here (anti-drift: no editing a file
 * another in-flight unit owns). Until T-023 lands, this module defines its own
 * `WebhookFactSourceSchema` — a superset of `FactSourceSchema` with the counsellor-edit variant
 * added locally — so the wire shape the edit-provenance gate describes ("source counsellor-edit,
 * counsellorId, time, editedFrom") already exists at the webhook boundary. Residual: once T-023
 * extends `FactSourceSchema` itself, prefer that shared schema here and drop this local duplicate
 * (see the manifest's Open gaps).
 */
import { z } from "zod";
import { ErasureReasonSchema, FactSourceSchema } from "@vc/schemas";

/** Every citation shape a fact can carry today, PLUS the counsellor-edit provenance shape B2 adds
 * at approval time: the original citation is kept verbatim under `editedFrom`, never discarded. */
export const WebhookFactSourceSchema = z.union([
  FactSourceSchema,
  z.object({
    type: z.literal("counsellor-edit"),
    counsellorId: z.string().min(1),
    editedAt: z.string().datetime(),
    editedFrom: FactSourceSchema,
  }),
]);
export type WebhookFactSource = z.infer<typeof WebhookFactSourceSchema>;

export const WebhookFactSensitivitySchema = z.enum(["low", "medium", "high"]);

/** The fact shape carried on the wire — a subset of @vc/schemas' FactSchema fields plus the wider
 * WebhookFactSourceSchema in place of FactSchema's own `source` (see module docstring). */
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
