/**
 * T-009: types for the scribe golden-session eval harness. Kept separate from the graph's own
 * schemas.ts on purpose — this is eval tooling, not a graph boundary (B5 does not apply here), but
 * the gold fixture shape still needs a Zod schema so a malformed sessions.jsonl fails loudly instead
 * of silently scoring garbage.
 */
import { z } from "zod";
import { ScribeInputSchema, type ScribeResult } from "../src/scribe/index.js";

export const SensitivityLevelSchema = z.enum(["low", "medium", "high"]);

/** One hand-labelled fact the scribe is expected to extract, with its verbatim source. */
export const GoldFactSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  turnId: z.string().min(1),
  /** Must be a verbatim substring (after whitespace collapse) of the cited turn's text or translatedText. */
  quote: z.string().min(1),
  sensitivity: SensitivityLevelSchema.default("low"),
  /** True when correctly interpreting this fact needs an earlier turn for context (contextTurnId). */
  multiTurn: z.boolean().default(false),
  contextTurnId: z.string().optional(),
});
export type GoldFact = z.infer<typeof GoldFactSchema>;

export const CrisisLevelSchema = z.enum(["none", "concern", "crisis"]);

export const GoldSessionSchema = z
  .object({
    id: z.string().min(1),
    /** Stratification tags: pure-english, romanised-hinglish, devanagari, code-mixed, multi-turn,
     *  concern, crisis, distractor-chatter. A session may carry more than one. */
    strata: z.array(z.string().min(1)).min(1),
    input: ScribeInputSchema,
    goldFacts: z.array(GoldFactSchema),
    /** Case-insensitive substring checks the generated summary is expected to cover. */
    goldSummaryChecklist: z.array(z.string().min(1)),
    expectedCrisisLevel: CrisisLevelSchema,
    expectedEscalationTurnId: z.string().optional(),
    /** Turns with no gold facts, included on purpose so recall is measured against real noise. */
    distractorTurnIds: z.array(z.string()).default([]),
  })
  .refine((s) => s.expectedCrisisLevel === "none" || !!s.expectedEscalationTurnId, {
    message: "a concern/crisis session must name expectedEscalationTurnId",
    path: ["expectedEscalationTurnId"],
  });
export type GoldSession = z.infer<typeof GoldSessionSchema>;

// ---------------------------------------------------------------------------
// Scoring output
// ---------------------------------------------------------------------------

export type CitationClass =
  | "verbatim"
  | "case-mismatch"
  | "punctuation-mismatch"
  | "case-and-punctuation-mismatch"
  | "fabricated"
  | "malformed";

export interface CitationVerdict {
  key: string;
  class: CitationClass;
}

export interface FalseDrop {
  key: string;
  class: "case-mismatch" | "punctuation-mismatch" | "case-and-punctuation-mismatch";
  reason: string;
}

export interface SessionScore {
  sessionId: string;
  strata: string[];
  crisis: {
    expected: z.infer<typeof CrisisLevelSchema>;
    actual: z.infer<typeof CrisisLevelSchema>;
    correct: boolean;
    providerCalledDespiteEscalation: boolean;
  };
  /** null when the session escalated before extraction ever ran (nothing else to score). */
  extraction: {
    goldFactCount: number;
    recalledCount: number;
    omittedKeys: string[];
    falseDrops: FalseDrop[];
    citationVerdicts: CitationVerdict[];
    citationPrecision: number | null;
    multiTurn: { goldCount: number; recalledCount: number };
    /**
     * T-013 (D-020, citation-guarantee-scope): every fact the graph actually KEPT (never dropped for
     * a value-support reason — only a genuinely fabricated citation drops a fact), split by whether
     * it auto-verified or was flagged for the counsellor. `fabricatedVerified` is always 0 by
     * construction (a fact only reaches this tally after clearing the citation-location check;
     * kept as an explicit, checkable claim rather than an implicit one).
     */
    reviewCounts: { kept: number; verified: number; needsReview: number; reasoning: number; fabricatedVerified: number };
  } | null;
  summary: {
    text: string;
    withheldReason: string | undefined;
    scriptLike: boolean;
    checklistTotal: number;
    checklistCovered: number;
  } | null;
  result: ScribeResult | null;
}

export interface AggregateScore {
  sessionCount: number;
  crisisRouting: { correct: number; total: number; accuracy: number };
  extraction: {
    /** Precision over every candidate fact that carried a source+quote, across all scored sessions. */
    citationPrecision: number | null;
    citationCounts: Record<CitationClass, number>;
    recall: number | null;
    goldFactTotal: number;
    recalledTotal: number;
    falseDropCounts: { caseMismatch: number; punctuationMismatch: number; caseAndPunctuationMismatch: number };
    multiTurn: { goldCount: number; recalledCount: number; recall: number | null };
    /** T-013: rolled up across every scored session's SessionScore.extraction.reviewCounts. */
    reviewCounts: { kept: number; verified: number; needsReview: number; reasoning: number; fabricatedVerified: number };
  };
  summary: { scriptLikeLeaks: number; scored: number; checklistCoverage: number | null };
}

export interface EvalReport {
  generatedAt: string;
  providerMode: string;
  datasetPath: string;
  aggregate: AggregateScore;
  sessions: SessionScore[];
}
