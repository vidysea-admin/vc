/**
 * Zod contracts for every boundary of the post-session scribe graph (contract B5: every node's
 * input and output is a Zod schema; no free text passes between nodes). Shared shapes (Fact,
 * ProfileDiff, CounsellorDecision, TranscriptTurn) come from @vc/schemas; only the scribe-specific
 * envelopes live here.
 */
import { z } from "zod";
import {
  CounsellorDecisionSchema,
  FactSchema,
  ProfileDiffSchema,
  SensitivitySchema,
  TranscriptTurnSchema,
} from "@vc/schemas";

/**
 * The consent purpose the scribe processes a session under (B4). It matches the
 * `profile_synthesis` purpose the student-profile MCP boundary already uses (T-006), so facts the
 * scribe writes are visible to that purpose's readers.
 */
export const SCRIBE_PURPOSE = "profile_synthesis";

/** A transcript turn plus the stable id facts cite (plan.md step 3 output + a turn id for B2). */
export const ScribeTurnSchema = TranscriptTurnSchema.extend({
  turnId: z.string().min(1),
});
export type ScribeTurn = z.infer<typeof ScribeTurnSchema>;

/**
 * Graph input. `sessionId` comes from the caller and is carried in state, never generated inside a
 * node: D-012's idempotency hashes it into every fact's contentHash, so it must be identical on a
 * checkpoint replay. `sessionEndedAt` is the facts' validFrom (deterministic, never model-chosen).
 */
export const ScribeInputSchema = z
  .object({
    sessionId: z.string().min(1),
    studentId: z.string().min(1),
    sessionEndedAt: z.string().datetime(),
    turns: z.array(ScribeTurnSchema).min(1),
  })
  .refine((input) => new Set(input.turns.map((t) => t.turnId)).size === input.turns.length, {
    message: "turnId must be unique within a session (facts cite turns by id, B2)",
    path: ["turns"],
  });
export type ScribeInput = z.infer<typeof ScribeInputSchema>;

// --- (a) consent gate -------------------------------------------------------

export const ConsentGateInputSchema = z.object({ studentId: z.string().min(1) });
export const ConsentGateOutputSchema = z.object({
  consent: z.enum(["granted", "refused"]),
  refusalReason: z.string().optional(),
});
export type ConsentGateOutput = z.infer<typeof ConsentGateOutputSchema>;

// --- (b) crisis gate --------------------------------------------------------

export const ScribeEscalationSchema = z.object({
  type: z.literal("escalation"),
  level: z.enum(["concern", "crisis"]),
  message: z.string().min(1),
  matched: z.array(z.string()),
  turnId: z.string().min(1),
});
export type ScribeEscalation = z.infer<typeof ScribeEscalationSchema>;

export const CrisisGateInputSchema = z.object({ turns: z.array(ScribeTurnSchema).min(1) });
export const CrisisGateOutputSchema = z.object({ escalation: ScribeEscalationSchema.nullable() });
export type CrisisGateOutput = z.infer<typeof CrisisGateOutputSchema>;

// --- (c) fact extraction ----------------------------------------------------

/**
 * What the fact-extraction skill must return. Each item is validated one by one
 * (`CandidateFactSchema`) so one malformed or uncited fact is dropped with a reason instead of
 * failing the whole batch.
 */
export const ExtractionSkillOutputSchema = z.object({ facts: z.array(z.unknown()) });

/** One model-proposed fact before citation checks. `source` is optional here ON PURPOSE: an
 * uncited fact must reach the citation guard and be dropped there (B2), not crash the parse. */
export const CandidateFactSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  source: z.unknown().optional(),
  confidence: z.number().min(0).max(1),
  purposeTags: z.array(z.string().min(1)).default([]),
  sensitivity: SensitivitySchema,
});
export type CandidateFact = z.infer<typeof CandidateFactSchema>;

export const DroppedFactSchema = z.object({ key: z.string(), reason: z.string().min(1) });
export type DroppedFact = z.infer<typeof DroppedFactSchema>;

export const ExtractInputSchema = z.object({
  turns: z.array(ScribeTurnSchema).min(1),
  sessionEndedAt: z.string().datetime(),
});
export const ExtractOutputSchema = z.object({
  facts: z.array(FactSchema),
  dropped: z.array(DroppedFactSchema),
});
export type ExtractOutput = z.infer<typeof ExtractOutputSchema>;

// --- (d) session summary ----------------------------------------------------

export const SummarySkillOutputSchema = z.object({ summary: z.string() });
export const SummaryInputSchema = z.object({
  turns: z.array(ScribeTurnSchema).min(1),
  facts: z.array(FactSchema),
});
export const SummaryOutputSchema = z.object({
  summary: z.string(),
  summaryWithheldReason: z.string().optional(),
});
export type SummaryOutput = z.infer<typeof SummaryOutputSchema>;

// --- (e) profile diff -------------------------------------------------------

export const DiffInputSchema = z.object({
  studentId: z.string().min(1),
  summary: z.string(),
  facts: z.array(FactSchema),
});
export const DiffOutputSchema = z.object({
  diff: ProfileDiffSchema,
  /** The extracted facts behind the diff's add/update changes; what "approve" writes. */
  proposedFacts: z.array(FactSchema),
});
export type DiffOutput = z.infer<typeof DiffOutputSchema>;

// --- (f) counsellor approval (interrupt) -------------------------------------

/** The payload the counsellor UI receives at `interrupt()`. */
export const ApprovalRequestSchema = z.object({
  sessionId: z.string().min(1),
  studentId: z.string().min(1),
  summary: z.string(),
  summaryWithheldReason: z.string().optional(),
  diff: ProfileDiffSchema,
  facts: z.array(FactSchema),
  dropped: z.array(DroppedFactSchema),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

/** The typed response the counsellor sends back to resume the graph (`interrupt(response_schema)`). */
export const ApprovalResponseSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("edit"), facts: z.array(FactSchema).min(1) }),
  z.object({ action: z.literal("reject"), reason: z.string().optional() }),
]);
export type ApprovalResponse = z.infer<typeof ApprovalResponseSchema>;

export const ApprovalOutputSchema = z.object({ decision: CounsellorDecisionSchema });
export type ApprovalOutput = z.infer<typeof ApprovalOutputSchema>;

// --- (g) write --------------------------------------------------------------

export const WriteInputSchema = z.object({
  sessionId: z.string().min(1),
  diff: ProfileDiffSchema,
  decision: CounsellorDecisionSchema,
});

// --- result -----------------------------------------------------------------

export const ScribeResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("refused"), reason: z.string().min(1) }),
  z.object({ status: z.literal("escalated"), escalation: ScribeEscalationSchema }),
  z.object({ status: z.literal("rejected"), reason: z.string().optional() }),
  z.object({
    status: z.literal("written"),
    writtenFactIds: z.array(z.string()),
    supersededKeys: z.array(z.string()),
  }),
  z.object({ status: z.literal("conflict"), key: z.string().min(1), message: z.string().min(1) }),
]);
export type ScribeResult = z.infer<typeof ScribeResultSchema>;
