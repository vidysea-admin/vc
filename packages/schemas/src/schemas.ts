/**
 * Zod source of truth for the Vidysea AI Counselling Engine.
 *
 * Shapes mirror docs/plan.md §3 (Phase 1 — counsellor session) and §4 (Phase 2
 * — application filling) Module I/O sections, and encode contract rules from
 * qa/contracts/counselling-engine.md section B as schema constraints wherever
 * that is cheap (see the B1/B2/B4 refine() calls below). TS types are inferred
 * from each schema, never hand-duplicated.
 *
 * This package is a skeleton for later units: no LangGraph graph, no Mongo, no
 * Langfuse, no network calls live here — only the typed boundary.
 */
import { z } from "zod";
import { isScriptLike } from "./guards.js";

// ---------------------------------------------------------------------------
// Fact (plan.md §3 step 4) — every fact must carry a source (contract B2) and
// a non-empty purposeTags array (contract B4 / D-003, DPDP purpose-tagging).
// ---------------------------------------------------------------------------

// ISS-009: a discriminated union so each source `type` requires exactly the
// fields that make it a real citation — a "transcript" source with no quote/
// turnId, or a "kb" source with no fetchedAt, is not actually traceable back
// to anything and now fails to parse instead of silently passing.
export const FactSourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("transcript"),
    quote: z.string().min(1),
    turnId: z.string().min(1),
  }),
  z.object({
    type: z.literal("kb"),
    id: z.string().min(1),
    fetchedAt: z.string().datetime(),
  }),
  z.object({
    type: z.literal("profile"),
    id: z.string().min(1),
  }),
  z.object({
    // The answer record for a fact the student gave directly (e.g. in a form
    // or a direct prompt outside the transcript flow).
    type: z.literal("student-direct"),
    id: z.string().min(1),
  }),
]);
export type FactSource = z.infer<typeof FactSourceSchema>;

export const SensitivitySchema = z.enum(["low", "medium", "high"]);
export type Sensitivity = z.infer<typeof SensitivitySchema>;

/**
 * T-013 (D-020, citation-guarantee-scope): how strongly a transcript quote matched its cited turn.
 * - "verbatim": the quote is a substring of the turn after only Unicode NFC + whitespace collapse
 *   (canonically-equivalent text, i.e. the same characters).
 * - "normalised": the quote only matched after ALSO casefolding and turning a fixed punctuation set
 *   into token breaks. Still a STRICT substring (never fuzzy), but weaker evidence than verbatim, so
 *   the counsellor and the audit trail can see it.
 */
export const CitationMatchSchema = z.enum(["verbatim", "normalised"]);
export type CitationMatch = z.infer<typeof CitationMatchSchema>;

/**
 * T-013 (D-020): a fact is either a "value" (the default — a discrete piece of information) or a
 * "reasoning" fact — a citable INFERENCE about why a value holds (e.g. "why UK: sister lives
 * there"), never a literal value itself. A reasoning fact always carries `explains` (the key of the
 * value fact it accounts for) and is always kept `needsReview` (B2 amendment log 2026-09-26).
 */
export const FactKindSchema = z.enum(["value", "reasoning"]);
export type FactKind = z.infer<typeof FactKindSchema>;

export const FactSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  // B2: every fact carries a source. Required (not optional) so a fact with
  // no source object fails to parse at all.
  source: FactSourceSchema,
  confidence: z.number().min(0).max(1),
  // ISS-010: an ISO-8601 datetime string, not just any non-empty string — a
  // fact with validFrom: "banana" no longer parses.
  validFrom: z.string().datetime(),
  validTo: z.string().datetime().optional(),
  // B4: purposeTags must be non-empty — a fact with purposeTags: [] fails parse.
  purposeTags: z.array(z.string().min(1)).min(1),
  sensitivity: SensitivitySchema,
  // T-013 (additive, optional — NOT .default() on purpose: a default would make `kind` REQUIRED on
  // every existing Fact object literal across the tree, breaking unrelated call sites and test
  // fixtures that predate T-013 for no functional gain). Absent means "value", the same as
  // `kind: "value"` explicitly; every call site that cares reads it as `fact.kind ?? "value"`. See
  // FactKindSchema. A "reasoning" fact names the value-fact key it explains via `explains`.
  kind: FactKindSchema.optional(),
  explains: z.string().min(1).optional(),
  // T-013 (additive, optional): the citation match tier for a transcript-sourced fact. Absent on
  // facts from other sources and on facts written before T-013.
  citationMatch: CitationMatchSchema.optional(),
  // T-013 (additive, optional): the scribe sets `needsReview: true` (plus the reasons) on every fact
  // whose value is not on the closed auto-verify surface (a typed number or the fixed country/alias
  // vocabulary, matched as a whole word) — never dropped, per B2's 2026-09-26 amendment (D-020,
  // citation-guarantee-scope). A later UI gates on `needsReview === true`. Absent means "not
  // flagged"; facts written before this cycle parse unchanged.
  needsReview: z.boolean().optional(),
  reviewReasons: z.array(z.string().min(1)).optional(),
});
export type Fact = z.infer<typeof FactSchema>;

// ---------------------------------------------------------------------------
// Card (plan.md §3 step 5/6) — type widen|challenge|clarify|compare|evidence.
// B1: prompt must not be script-like (isScriptLike guard). B2: sources must be
// a non-empty array — a card with sources: [] fails parse.
// ---------------------------------------------------------------------------

export const CardTypeSchema = z.enum(["widen", "challenge", "clarify", "compare", "evidence"]);
export type CardType = z.infer<typeof CardTypeSchema>;

export const CardSourceSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
  quote: z.string().optional(),
});
export type CardSource = z.infer<typeof CardSourceSchema>;

export const CardSchema = z
  .object({
    // ISS-011: every card needs a stable id (feedback events key off it —
    // FeedbackEventSchema.cardId — and a card with no id can't be cited back).
    id: z.string().min(1),
    type: CardTypeSchema,
    prompt: z.string().min(1),
    sources: z.array(CardSourceSchema).min(1),
    confidence: z.number().min(0).max(1),
  })
  .refine((card) => !isScriptLike(card.prompt, card.type), {
    message:
      "Card.prompt reads as a script (a sentence for the counsellor to recite) rather than a question, comparison or evidence prompt — see contract B1",
    path: ["prompt"],
  });
export type Card = z.infer<typeof CardSchema>;

// ---------------------------------------------------------------------------
// PreBriefCard (plan.md §3 step 1)
// ---------------------------------------------------------------------------

export const PreBriefCardSchema = z.object({
  knownFacts: z.array(FactSchema),
  openQuestions: z.array(z.string()),
  doNotAsk: z.array(z.string()),
});
export type PreBriefCard = z.infer<typeof PreBriefCardSchema>;

// ---------------------------------------------------------------------------
// TranscriptTurn (plan.md §3 step 3)
// ---------------------------------------------------------------------------

export const TranscriptTurnSchema = z.object({
  text: z.string(),
  lang: z.string().min(1),
  translatedText: z.string(),
  ts: z.number(),
  speaker: z.enum(["student", "counsellor"]),
});
export type TranscriptTurn = z.infer<typeof TranscriptTurnSchema>;

/**
 * T-024 / ISS-t-013r-c0-3 (D-020): one transcript turn as it is PERSISTED for the counsellor to read
 * (packages/db session_transcripts) — the turn verbatim plus the `turnId` every fact citation names.
 */
export const TranscriptTurnRecordSchema = TranscriptTurnSchema.extend({
  turnId: z.string().min(1),
});
export type TranscriptTurnRecord = z.infer<typeof TranscriptTurnRecordSchema>;

// ---------------------------------------------------------------------------
// ConcernRecord (T-022 / D-020 / B20): a concern-level wellbeing signal the crisis guard found in a
// session. It is FLAGGED and the session CONTINUES (never a stop, never hidden). It is stored in the
// Student KG as a cited edge (student --concern_flagged--> transcript_turn), so erasure and export
// cover it through the existing edges collection (B15). This is also the typed surface T-012
// (escalation as severity rises) reads. Deterministic: no timestamp, so a replay writes nothing new.
// ---------------------------------------------------------------------------

export const ConcernLevelSchema = z.enum(["concern", "crisis"]);
export type ConcernLevel = z.infer<typeof ConcernLevelSchema>;

export const ConcernRecordSchema = z
  .object({
    /** `${sessionId}:${turnId}` — one record per flagged turn. */
    concernId: z.string().min(1),
    studentId: z.string().min(1),
    sessionId: z.string().min(1),
    level: ConcernLevelSchema,
    /** Fixed descriptive text for the counsellor (what was detected), never a script for the student. */
    reason: z.string().min(1),
    /** The guard patterns that fired. */
    matched: z.array(z.string().min(1)).min(1),
    detector: z.literal("crisis-guard"),
    /** B2: the transcript span the flag rests on (resolves into session_transcripts). */
    citation: z.object({
      type: z.literal("transcript"),
      quote: z.string().min(1),
      turnId: z.string().min(1),
    }),
  })
  .strict()
  .refine((r) => r.concernId === `${r.sessionId}:${r.citation.turnId}`, {
    message: "concernId must be `${sessionId}:${citation.turnId}`",
    path: ["concernId"],
  });
export type ConcernRecord = z.infer<typeof ConcernRecordSchema>;

// ---------------------------------------------------------------------------
// AudioChunk metadata (plan.md §3 step 2) — META ONLY. No raw audio field is
// modelled here on purpose (see UNIT brief): the graph never needs raw PCM to
// flow through a Zod-validated boundary, and keeping audio bytes out of this
// package keeps it free of binary payloads in tests/tooling.
// ---------------------------------------------------------------------------

export const AudioChunkMetaSchema = z.object({
  sessionId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  ts: z.number(),
});
export type AudioChunkMeta = z.infer<typeof AudioChunkMetaSchema>;

// ---------------------------------------------------------------------------
// FeedbackEvent (plan.md §3 step 7)
// ---------------------------------------------------------------------------

export const FeedbackEventSchema = z.object({
  cardId: z.string().min(1),
  action: z.enum(["up", "down"]),
  ts: z.number(),
  note: z.string().optional(),
});
export type FeedbackEvent = z.infer<typeof FeedbackEventSchema>;

// ---------------------------------------------------------------------------
// FactChange + ProfileDiff (plan.md §3 step 8)
// ---------------------------------------------------------------------------

export const FactChangeSchema = z.object({
  op: z.enum(["add", "update", "remove"]),
  key: z.string().min(1),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
});
export type FactChange = z.infer<typeof FactChangeSchema>;

export const ProfileDiffSchema = z.object({
  studentId: z.string().min(1),
  summary: z.string(),
  changes: z.array(FactChangeSchema),
  citedFactIds: z.array(z.string()),
});
export type ProfileDiff = z.infer<typeof ProfileDiffSchema>;

// ---------------------------------------------------------------------------
// CounsellorDecision (plan.md §3 step 9) — B3: no write happens without this.
// ---------------------------------------------------------------------------

export const CounsellorDecisionSchema = z.object({
  approve: z.boolean(),
  edits: z.array(FactSchema).optional(),
});
export type CounsellorDecision = z.infer<typeof CounsellorDecisionSchema>;

// ---------------------------------------------------------------------------
// Consent (contract B4, D-003 DPDP purpose/consent) — a minor's consent row
// must carry guardianConsent: true, enforced via refine.
// ---------------------------------------------------------------------------

export const ConsentSchema = z
  .object({
    studentId: z.string().min(1),
    guardianConsent: z.boolean(),
    purposes: z.array(z.string().min(1)).min(1),
    recordedAt: z.string().min(1),
    minor: z.boolean(),
  })
  .refine((consent) => !consent.minor || consent.guardianConsent, {
    message: "Consent for a minor requires guardianConsent: true",
    path: ["guardianConsent"],
  });
export type Consent = z.infer<typeof ConsentSchema>;

// ---------------------------------------------------------------------------
// Decision (plan.md §4 step 1)
// ---------------------------------------------------------------------------

export const DecisionSchema = z.object({
  studentId: z.string().min(1),
  universityId: z.string().min(1),
  courseId: z.string().min(1),
  rationale: z.string(),
  alternativesConsidered: z.array(z.string()),
});
export type Decision = z.infer<typeof DecisionSchema>;

// ---------------------------------------------------------------------------
// RequirementSpec (plan.md §4 step 2) / GapList (step 3)
// ---------------------------------------------------------------------------

export const FieldSpecSchema = z.object({
  name: z.string().min(1),
  required: z.boolean(),
});
export type FieldSpec = z.infer<typeof FieldSpecSchema>;

export const DocSpecSchema = z.object({
  name: z.string().min(1),
  required: z.boolean(),
});
export type DocSpec = z.infer<typeof DocSpecSchema>;

export const RequirementSpecSchema = z.object({
  fields: z.array(FieldSpecSchema),
  documents: z.array(DocSpecSchema),
});
export type RequirementSpec = z.infer<typeof RequirementSpecSchema>;

export const GapListSchema = z.object({
  missingFields: z.array(z.string()),
});
export type GapList = z.infer<typeof GapListSchema>;

// ---------------------------------------------------------------------------
// ApplicationPacket (plan.md §4 assembly)
// ---------------------------------------------------------------------------

export const ApplicationPacketSchema = z.object({
  fields: z.record(z.string(), z.unknown()),
  documents: z.array(z.string()),
  lang: z.string().min(1),
});
export type ApplicationPacket = z.infer<typeof ApplicationPacketSchema>;

// ---------------------------------------------------------------------------
// FillResult (plan.md §4 steps 7a/7b)
// ---------------------------------------------------------------------------

export const FillResultSchema = z.object({
  filledFields: z.array(z.string()),
  failedFields: z.array(z.string()),
  screenshots: z.array(z.string()),
  actionsLog: z.array(z.string()).optional(),
});
export type FillResult = z.infer<typeof FillResultSchema>;

// ---------------------------------------------------------------------------
// DraftReport (plan.md §4 step 8) — B10: draft-only, never auto-submitted.
// ---------------------------------------------------------------------------

export const DraftReportEntrySchema = z.object({
  field: z.string().min(1),
  expected: z.unknown(),
  actual: z.unknown(),
  match: z.boolean(),
});
export type DraftReportEntry = z.infer<typeof DraftReportEntrySchema>;

export const DraftReportSchema = z.array(DraftReportEntrySchema);
export type DraftReport = z.infer<typeof DraftReportSchema>;

// ---------------------------------------------------------------------------
// AuditEvent (plan.md §4 step 9)
// ---------------------------------------------------------------------------

export const AuditEventSchema = z.object({
  who: z.string().min(1),
  ts: z.number(),
  portalId: z.string().min(1),
  result: z.string(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

// ---------------------------------------------------------------------------
// DPDP erasure (contract B15, T-011, qa/gates/dpdp-erase-design.md)
// ---------------------------------------------------------------------------

/**
 * Why an erasure was requested: a closed set of codes, never free text. The request row
 * outlives the erasure (it is the audit log), so a free-text "reason" field would be a
 * place for personal data to survive the purge.
 */
export const ErasureReasonSchema = z.enum([
  "student_request",
  "guardian_request",
  "account_closure",
  "legal_order",
]);
export type ErasureReason = z.infer<typeof ErasureReasonSchema>;

/**
 * Lifecycle of an erasure request row (B15 approver workflow, T-029, gate erasure-fencing):
 * pending → confirmed (first confirmation, fence set) → awaiting_approval (second confirmation, an
 * approval request in the email outbox) → approved (the approver approved, or `autoDelete` skipped
 * the approver) → completed, or failed (retryable). `rejected` (by the approver) and `expired` (the
 * confirm token or the approval request timed out) are terminal and purge nothing.
 */
export const ErasureStatusSchema = z.enum([
  "pending",
  "confirmed",
  "awaiting_approval",
  "approved",
  "completed",
  "failed",
  "rejected",
  "expired",
]);
export type ErasureStatus = z.infer<typeof ErasureStatusSchema>;

/**
 * One collection's line in an erasure receipt. `outcome`:
 *  - purged: deleteMany ran without error;
 *  - failed: deleteMany threw (only the error's name/code is kept, never its message,
 *    because driver messages can echo filter values such as ids);
 *  - deferred: not attempted this run, because it is an anchor collection (facts,
 *    sessions, scribe_resolutions, students) needed to resolve the other collections'
 *    selectors on a retry, and an earlier step failed.
 * `remaining` is the read-back count with the same selector after the purge.
 */
export const ErasureCollectionLineSchema = z.object({
  collection: z.string().min(1),
  outcome: z.enum(["purged", "failed", "deferred"]),
  deleted: z.number().int().min(0),
  remaining: z.number().int().min(0),
  error: z.string().optional(),
});
export type ErasureCollectionLine = z.infer<typeof ErasureCollectionLineSchema>;

/** The verification receipt: counts and times only, no personal data (B15). */
export const ErasureReceiptSchema = z
  .object({
    requestId: z.string().min(1),
    attempt: z.number().int().min(1),
    verified: z.boolean(),
    totalRemaining: z.number().int().min(0),
    collections: z.array(ErasureCollectionLineSchema).min(1),
    /**
     * T-011 cycle 1 (ISS-t-011-rev-3): purge rounds this attempt ran. The purge re-resolves and
     * re-purges until a read-back finds nothing (a writer can add documents mid-erasure), bounded;
     * `deleted` sums every round. Optional so receipts stored before cycle 1 still parse.
     */
    rounds: z.number().int().min(1).optional(),
    startedAt: z.string().datetime(),
    verifiedAt: z.string().datetime(),
  })
  .strict();
export type ErasureReceipt = z.infer<typeof ErasureReceiptSchema>;

/**
 * T-011 cycle 2 (ISS-t-011-c1-rev-2): the hard cap on each id list an erasure attempt accumulates
 * and carries on a failed audit row (`carriedSelectors`). It bounds the audit row's size (Mongo's
 * 16 MB document limit) and the `$in` selectors. An attempt that would exceed it stops before
 * deleting anything more and ends `failed` with the distinct label `selectors:over_cap`.
 */
export const MAX_CARRIED_IDS = 20_000;

/**
 * The ids a failed erasure attempt resolved, stored on the audit row so a retry can still find a
 * dependent whose anchor was already deleted. Validated on read: a corrupted row is refused, never
 * silently merged.
 */
export const ErasureCarriedSelectorsSchema = z
  .object({
    factIds: z.array(z.string().min(1)).max(MAX_CARRIED_IDS),
    sessionIds: z.array(z.string().min(1)).max(MAX_CARRIED_IDS),
    threadIds: z.array(z.string().min(1)).max(MAX_CARRIED_IDS),
  })
  .strict();
export type ErasureCarriedSelectors = z.infer<typeof ErasureCarriedSelectorsSchema>;
