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
  /** Set when the provider output stayed schema-invalid after the bounded retry (ISS-t-007-rev-1). */
  failedReason: z.string().min(1).optional(),
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
  /** Set when the provider output stayed schema-invalid after the bounded retry (ISS-t-007-rev-1). */
  failedReason: z.string().min(1).optional(),
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

/**
 * T-008 / ISS-t-013-rev-5: a proposed fact as the counsellor sees it. `needsReview`/`reviewReasons`
 * are OPTIONAL and additive: T-013 (citation robustness, not merged yet) sets them on FactSchema
 * itself; until then they are simply absent ("not flagged"). The UI renders the flag per fact.
 */
export const ApprovalFactSchema = FactSchema.extend({
  needsReview: z.boolean().optional(),
  reviewReasons: z.array(z.string().min(1)).optional(),
});
export type ApprovalFact = z.infer<typeof ApprovalFactSchema>;

/** The payload the counsellor UI receives at `interrupt()`. */
export const ApprovalRequestSchema = z.object({
  sessionId: z.string().min(1),
  studentId: z.string().min(1),
  summary: z.string(),
  summaryWithheldReason: z.string().optional(),
  diff: ProfileDiffSchema,
  facts: z.array(ApprovalFactSchema),
  dropped: z.array(DroppedFactSchema),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

/** T-008: the counsellor's choice for the draft session summary. */
export const SummaryDecisionSchema = z.enum(["approve", "withhold"]);
export type SummaryDecision = z.infer<typeof SummaryDecisionSchema>;

/** The reason stored on the session row when the counsellor withholds the draft summary (T-008). */
export const COUNSELLOR_WITHHELD_SUMMARY_REASON = "withheld by the counsellor at approval";

/** An edited value: present, not null, not an empty string. */
const EditedValueSchema = z
  .unknown()
  .refine((v) => v !== undefined && v !== null && !(typeof v === "string" && v.trim() === ""), {
    message: "an edited fact needs a non-empty value",
  });

/**
 * T-008 / ISS-t-013-rev-5: one decision per proposed fact, by key. `edit` replaces only the value;
 * the fact's cited source, confidence and sensitivity stay those of the proposal (B2).
 */
export const PerFactDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ key: z.string().min(1), decision: z.literal("approve") }),
  z.object({ key: z.string().min(1), decision: z.literal("reject"), reason: z.string().optional() }),
  z.object({ key: z.string().min(1), decision: z.literal("edit"), value: EditedValueSchema }),
]);
export type PerFactDecision = z.infer<typeof PerFactDecisionSchema>;

/**
 * The typed response the counsellor sends back to resume the graph (`interrupt(response_schema)`).
 * T-008 adds `per_fact` (additive: the three whole-batch actions are unchanged). A per_fact
 * response must decide every proposed fact exactly once; decisionFromResponse enforces that
 * against the thread's proposal and throws ApprovalResponseError before anything is claimed.
 */
export const ApprovalResponseSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("edit"), facts: z.array(FactSchema).min(1) }),
  z.object({ action: z.literal("reject"), reason: z.string().optional() }),
  z.object({
    action: z.literal("per_fact"),
    facts: z.array(PerFactDecisionSchema),
    summary: SummaryDecisionSchema,
  }),
]);
export type ApprovalResponse = z.infer<typeof ApprovalResponseSchema>;

export const ApprovalOutputSchema = z.object({
  decision: CounsellorDecisionSchema,
  /** T-008: absent for the whole-batch actions (the summary follows the batch decision). */
  summaryDecision: SummaryDecisionSchema.optional(),
});
export type ApprovalOutput = z.infer<typeof ApprovalOutputSchema>;

// --- (g) write --------------------------------------------------------------

export const WriteInputSchema = z.object({
  sessionId: z.string().min(1),
  /** T-016 / ISS-t-007-rev-7: the approved summary is stored on this student's session row. */
  studentId: z.string().min(1),
  diff: ProfileDiffSchema,
  decision: CounsellorDecisionSchema,
  /** The summary the counsellor saw and approved ("" when it was withheld, B1). */
  summary: z.string(),
  summaryWithheldReason: z.string().optional(),
  /** T-008: "withhold" stores no summary text, only COUNSELLOR_WITHHELD_SUMMARY_REASON. Absent = approve. */
  summaryDecision: SummaryDecisionSchema.optional(),
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
  /**
   * ISS-t-007-rev-4: a genuine conflict on fact 2+ of a multi-fact approval. The facts in
   * `writtenFactIds` are durably committed (no cross-document transaction, D-008/D-009); `key` is the
   * fact another writer holds with a different value. Terminal: re-running the write cannot succeed,
   * so the counsellor sees what landed and re-reviews `key`.
   */
  z.object({
    status: z.literal("partial_conflict"),
    key: z.string().min(1),
    writtenFactIds: z.array(z.string()).min(1),
    message: z.string().min(1),
  }),
  /** ISS-t-007-rev-1: the extraction skill's output stayed schema-invalid after one retry. Nothing written. */
  z.object({ status: z.literal("extraction_failed"), reason: z.string().min(1) }),
  /** ISS-t-007-rev-1: the summary skill's output stayed schema-invalid after one retry. Nothing written. */
  z.object({ status: z.literal("summary_failed"), reason: z.string().min(1) }),
]);
export type ScribeResult = z.infer<typeof ScribeResultSchema>;
