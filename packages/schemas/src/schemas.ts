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

export const FactSourceSchema = z.object({
  type: z.enum(["transcript", "profile", "kb", "student-direct"]),
  id: z.string().min(1),
  quote: z.string().optional(),
  turnId: z.string().optional(),
  fetchedAt: z.string().optional(),
});
export type FactSource = z.infer<typeof FactSourceSchema>;

export const SensitivitySchema = z.enum(["low", "medium", "high"]);
export type Sensitivity = z.infer<typeof SensitivitySchema>;

export const FactSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  // B2: every fact carries a source. Required (not optional) so a fact with
  // no source object fails to parse at all.
  source: FactSourceSchema,
  confidence: z.number().min(0).max(1),
  validFrom: z.string().min(1),
  validTo: z.string().optional(),
  // B4: purposeTags must be non-empty — a fact with purposeTags: [] fails parse.
  purposeTags: z.array(z.string().min(1)).min(1),
  sensitivity: SensitivitySchema,
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
    type: CardTypeSchema,
    prompt: z.string().min(1),
    sources: z.array(CardSourceSchema).min(1),
    confidence: z.number().min(0).max(1),
  })
  .refine((card) => !isScriptLike(card.prompt), {
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
