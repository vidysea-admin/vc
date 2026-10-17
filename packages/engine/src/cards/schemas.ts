/**
 * T-010: Zod contracts for every boundary of the live-cards graph (contract B5: every node's input
 * and output is a Zod schema; no free text passes between nodes). The shared shapes (Card,
 * CardSource, Fact, PreBriefCard, FeedbackEvent) come from @vc/schemas (plan.md §3 steps 1, 5-7);
 * only the live-cards envelopes live here.
 *
 * New file (new functionality): the live cards are a second graph next to the scribe, with its own
 * input (a window of live turns, not a finished session) and its own output (at most 3 verified
 * cards). The scribe's schemas are reused where they fit (ScribeTurnSchema, ScribeEscalationSchema).
 */
import { z } from "zod";
import { CardSchema, CardSourceSchema, FactSchema, PreBriefCardSchema } from "@vc/schemas";
import { ScribeEscalationSchema, ScribeTurnSchema } from "../scribe/schemas.js";

/** plan.md §3 step 7: the counsellor sees at most 3 cards at a time. */
export const MAX_VISIBLE_CARDS = 3;
/** The most turns one live-cards call takes (the caller sends the recent window, not a whole day). */
export const MAX_LIVE_TURNS = 200;
/** The most candidate cards one planner call may return (anything past it is ignored, not shown). */
export const MAX_PLANNER_CARDS = 12;
export const MAX_CARD_PROMPT_LENGTH = 300;

/** The input of one live-cards run (the API and the web side-panel send this). */
export const LiveCardsInputSchema = z
  .object({
    sessionId: z.string().min(1),
    studentId: z.string().min(1),
    turns: z.array(ScribeTurnSchema).min(1).max(MAX_LIVE_TURNS),
    /** Quiet mode (plan.md §1: seniors can turn the cards down): only a concern check-in shows. */
    quiet: z.boolean().default(false),
  })
  .strict()
  .refine((input) => new Set(input.turns.map((t) => t.turnId)).size === input.turns.length, {
    message: "turnId must be unique within the window (cards cite turns by id, B2)",
    path: ["turns"],
  });
export type LiveCardsInput = z.input<typeof LiveCardsInputSchema>;
export type LiveCardsParsedInput = z.output<typeof LiveCardsInputSchema>;

/** An approved profile fact with the id a `profile` card source cites (B2). */
export const KnownFactSchema = FactSchema.extend({ id: z.string().min(1) });
export type KnownFact = z.infer<typeof KnownFactSchema>;

/** The types the ExplorationPlanner may propose. "check-in" is never model-made: only a concern flag creates one. */
export const PlannerCardTypeSchema = z.enum(["widen", "challenge", "clarify", "compare", "evidence"]);

/**
 * One candidate from the planner, BEFORE verification. Deliberately looser than CardSchema: no B1
 * refine and `sources` may be empty, so a script-like or uncited candidate is counted and dropped by
 * the Verifier with a reason instead of failing the whole batch.
 */
export const CandidateCardSchema = z.object({
  type: PlannerCardTypeSchema,
  prompt: z.string().trim().min(1).max(2000),
  sources: z.array(CardSourceSchema).max(8),
  confidence: z.number().min(0).max(1),
});
export type CandidateCard = z.infer<typeof CandidateCardSchema>;

/** What the exploration-planner skill must return; each item is validated one by one. */
export const PlannerSkillOutputSchema = z.object({ cards: z.array(z.unknown()) });

/** Mandatory semantic judgments. Structural completeness and exact spans are checked against inputs. */
export const VerifierSkillOutputSchema = z.object({ decisions: z.array(z.object({
  cardId: z.string().min(1),
  noScript: z.enum(["clear", "violation", "uncertain"]),
  citation: z.enum(["clear", "violation", "uncertain"]),
  confidence: z.number().finite().min(0).max(1),
  offendingSpans: z.array(z.object({ start: z.number().int().min(0), end: z.number().int().min(1), text: z.string().min(1) }).strict()).max(20),
}).strict()).max(MAX_PLANNER_CARDS) }).strict();

export const DropReasonSchema = z.enum([
  "invalid_shape",
  "script_like",
  "uncited",
  "unresolved_source",
  "not_applicable",
  "already_known",
  "do_not_ask",
  "urgency_mismatch",
  "duplicate",
  "verifier_rejected",
]);
export type DropReason = z.infer<typeof DropReasonSchema>;

/** A dropped candidate: its reason only. The dropped text is never returned (it may be a script). */
export const DroppedCardSchema = z.object({
  cardId: z.string().optional(),
  type: z.string().optional(),
  reason: DropReasonSchema,
});
export type DroppedCard = z.infer<typeof DroppedCardSchema>;

export const KnowledgeStatusSchema = z.enum(["ok", "unavailable", "not_configured", "no_query"]);
export type KnowledgeStatus = z.infer<typeof KnowledgeStatusSchema>;

/** A KB /ask citation id the planner may cite as `{type:"kb", id}` (T-026, carried through verbatim). */
export const KbEvidenceSchema = z.object({ id: z.string().min(1), kind: z.enum(["internal", "web"]) });
export type KbEvidence = z.infer<typeof KbEvidenceSchema>;

export const KnowledgeOutputSchema = z.object({
  status: KnowledgeStatusSchema,
  answer: z.string().optional(),
  evidence: z.array(KbEvidenceSchema),
});
export type KnowledgeOutput = z.infer<typeof KnowledgeOutputSchema>;

/** A verified card: a CardSchema card (B1 refine included) that passed every Verifier rule. */
export const VerifiedCardSchema = CardSchema;

export const VerifyOutputSchema = z.object({
  kept: z.array(VerifiedCardSchema),
  dropped: z.array(DroppedCardSchema),
});
export type VerifyOutput = z.infer<typeof VerifyOutputSchema>;

export const LiveCardsStatusSchema = z.enum(["ok", "ai_unavailable", "planner_failed"]);

/** The result of one live-cards run. */
export const LiveCardsResultSchema = z.union([
  z.object({ status: z.literal("refused"), reason: z.string().min(1) }).strict(),
  z
    .object({
      status: z.literal("escalated"),
      escalation: ScribeEscalationSchema,
      cards: z.array(VerifiedCardSchema).max(0),
    })
    .strict(),
  z
    .object({
      status: LiveCardsStatusSchema,
      /** At most MAX_VISIBLE_CARDS verified cards, a concern check-in first. */
      cards: z.array(VerifiedCardSchema).max(MAX_VISIBLE_CARDS),
      /** Verified cards past the display cap (not shown this turn). */
      held: z.number().int().min(0),
      /** Verified cards hidden by quiet mode. */
      suppressedByQuiet: z.number().int().min(0),
      /** plan.md §3 step 6: how many candidates the Verifier removed. */
      droppedCount: z.number().int().min(0),
      dropped: z.array(DroppedCardSchema),
      knowledge: KnowledgeStatusSchema,
      quiet: z.boolean(),
      preBrief: PreBriefCardSchema,
    })
    .strict()
    .refine((r) => r.droppedCount === r.dropped.length, { message: "droppedCount must equal dropped.length", path: ["droppedCount"] }),
]);
export type LiveCardsResult = z.infer<typeof LiveCardsResultSchema>;

/** GET pre-brief (plan.md §3 step 1). */
export const PreBriefInputSchema = z.object({ studentId: z.string().min(1) }).strict();
