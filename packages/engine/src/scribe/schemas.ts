/**
 * Zod contracts for every boundary of the post-session scribe graph (contract B5: every node's
 * input and output is a Zod schema; no free text passes between nodes). Shared shapes (Fact,
 * ProfileDiff, CounsellorDecision, TranscriptTurn) come from @vc/schemas; only the scribe-specific
 * envelopes live here.
 */
import { z } from "zod";
import {
  CounsellorDecisionSchema,
  FactKindSchema,
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
  // T-013 (D-020): a candidate may declare itself a "reasoning" fact (default "value" when absent —
  // legacy provider output that never mentions kind keeps working unchanged). `explains` names the
  // value-fact key a reasoning fact accounts for; verifyCandidateFact (nodes.ts) drops a reasoning
  // candidate that omits it.
  kind: FactKindSchema.optional(),
  explains: z.string().min(1).optional(),
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

/**
 * An edited value: present, not null, not an empty string, and a SCALAR (string, number or
 * boolean) — never an array or object.
 *
 * T-018 / ISS-t-008-c0-1: a hostile probe sent `{not: "a number"}` as the edited value for a
 * numeric fact and the API accepted it (this schema previously only refused
 * undefined/null/empty-string). Refusing every non-scalar edited value here is a CHEAP, static
 * check (it needs no knowledge of the proposed fact's own type) that already closes the exact
 * probe. It does not by itself catch a same-shape-of-type mismatch (a STRING sent for a NUMERIC
 * fact) — that needs the proposed value to compare against, so the full match is enforced one
 * level up, in perFactDecision (nodes.ts), which has both sides. Design choice (residual 1 of
 * qa/manifests/t-008-approval-ui.md, "arrays and objects must match in shape, or be refused"):
 * REFUSED, not shape-matched — an edit to an array/object-valued fact is never well-formed
 * through this text-only channel (the UI's own text input can not produce real JSON either, see
 * that manifest's residual 11), so the counsellor must reject the fact and add a new one by hand
 * instead.
 */
const EditedValueSchema = z
  .unknown()
  .refine((v) => v !== undefined && v !== null && !(typeof v === "string" && v.trim() === ""), {
    message: "an edited fact needs a non-empty value",
  })
  .refine((v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean", {
    message: "an edited fact's value must be a string, number or boolean (arrays and objects are refused; reject the fact and add a new one instead)",
  });

/**
 * T-020 / ISS-t-018-c0-1: the maximum length of a counsellor's own typed reject reason (a short
 * note, never a transcript or a generated sentence — B1). Shared by the per-fact decision and the
 * reject-reason audit record so both boundaries agree on one number.
 */
export const MAX_REJECT_REASON_LENGTH = 500;

/**
 * T-020 / ISS-t-018-c0-1: an optional reject reason, TRIMMED first (so surrounding whitespace never
 * counts toward the length or the emptiness check), then refused if it trims to empty (send no
 * reason at all instead of a blank one) or exceeds MAX_REJECT_REASON_LENGTH. `.trim()` runs before
 * `.min`/`.max` in Zod's own check order, so the value a caller sees after `.parse()` is already
 * the trimmed string (B5: one boundary owns both the shape and the normalization).
 */
const RejectReasonSchema = z
  .string()
  .trim()
  .min(1, "a reject reason cannot be empty or whitespace-only (omit it instead)")
  .max(MAX_REJECT_REASON_LENGTH, `a reject reason must be ${MAX_REJECT_REASON_LENGTH} characters or fewer`)
  .optional();

/**
 * T-008 / ISS-t-013-rev-5: one decision per proposed fact, by key. `edit` replaces only the value;
 * the fact's cited source, confidence and sensitivity stay those of the proposal (B2).
 */
export const PerFactDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ key: z.string().min(1), decision: z.literal("approve") }),
  z.object({ key: z.string().min(1), decision: z.literal("reject"), reason: RejectReasonSchema }),
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

/**
 * T-018 / residual 3 (qa/manifests/t-008-approval-ui.md): one rejected fact from a per_fact
 * response, with the counsellor's (optional, free-text-but-never-transcript) reason. Used only to
 * build the reject-reason audit record; never stored on the written Fact itself (edit provenance
 * stays gated separately, qa/gates/edit-provenance.md).
 */
export const RejectedFactSchema = z.object({ key: z.string().min(1), reason: RejectReasonSchema });
export type RejectedFact = z.infer<typeof RejectedFactSchema>;

export const ApprovalOutputSchema = z.object({
  decision: CounsellorDecisionSchema,
  /** T-008: absent for the whole-batch actions (the summary follows the batch decision). */
  summaryDecision: SummaryDecisionSchema.optional(),
  /** T-018: set only by a per_fact response that rejected at least one proposed fact. */
  rejectedFacts: z.array(RejectedFactSchema).optional(),
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
