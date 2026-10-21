/**
 * P1 U5a: the Zod source of truth for the student-facing API contract (spec v8 scope items 4, 10-12,
 * criteria A1, A6, A9, A15a, A16b, A22, A23; D-086..D-089).
 *
 * CONTRACT ONLY. No route, handler or WebSocket server uses these yet and none is enabled: the go-live
 * gate (apps/api/src/go-live-gate.ts, A20) refuses until the signed B13 amendment, G-PUBLISH, G-PROD and a
 * recorded Nights mode exist. Constants are exported as `as const` tuples so apps/api/src/openapi.ts reuses
 * the exact enum values instead of retyping them.
 *
 * Tenant and student identity come from the JWT, never from a body, so every request schema is strict.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// claims[] (spec scope item 4, A1)
// ---------------------------------------------------------------------------

export const CLAIM_KINDS = ["number", "country", "fact"] as const;
/** verified = source text supports it; attributed = source present, text not proven; unverified = shown flagged. */
export const CLAIM_STATUSES = ["verified", "attributed", "unverified"] as const;

export const ClaimSchema = z
  .object({
    text: z.string().min(1).max(2000),
    kind: z.enum(CLAIM_KINDS),
    /** KB `node_id` of this turn's /ask sources, or the `turnId` of a /search hit (G5). */
    sourceIds: z.array(z.string().min(1).max(256)).max(20),
    status: z.enum(CLAIM_STATUSES),
  })
  .strict()
  .refine((c) => c.status === "unverified" || c.sourceIds.length >= 1, {
    message: "a verified or attributed claim needs at least one sourceId",
    path: ["sourceIds"],
  });
export type Claim = z.infer<typeof ClaimSchema>;

/** "web" is a Google Search grounding link on a no-source answer (p1-nosource-grounded); it always carries `url`. */
export const SOURCE_KINDS = ["internal-seminar", "toc", "whatsapp", "unknown", "web"] as const;

export const SourceSchema = z
  .object({
    id: z.string().min(1).max(256),
    kind: z.enum(SOURCE_KINDS),
    title: z.string().max(500).optional(),
    /** https only; set on `web` sources (grounding links) and on nothing else. */
    url: z.string().url().max(2048).startsWith("https://").optional(),
    stale: z.boolean().optional(),
    dateUnknown: z.boolean().optional(),
  })
  .strict()
  .refine((s) => (s.kind === "web") === (s.url !== undefined), { message: "a web source needs a url and only a web source may carry one", path: ["url"] });
export type Source = z.infer<typeof SourceSchema>;

// ---------------------------------------------------------------------------
// Profile facts (scope item 10, A16b)
// ---------------------------------------------------------------------------

export const PROFILE_FACT_SOURCES = ["pathlynks", "student-confirmed"] as const;

export const ProfileFactSchema = z
  .object({
    key: z.string().min(1).max(128),
    value: z.string().min(1).max(1000),
    source: z.enum(PROFILE_FACT_SOURCES),
  })
  .strict();
export type ProfileFact = z.infer<typeof ProfileFactSchema>;

/** A chat-extracted fact proposed back to the student; never used until confirmed. */
export const ProposedFactSchema = z
  .object({
    factId: z.string().min(1).max(128),
    key: z.string().min(1).max(128),
    value: z.string().min(1).max(1000),
    status: z.enum(["proposed", "confirmed"]),
  })
  .strict();
export type ProposedFact = z.infer<typeof ProposedFactSchema>;

export const ProfileResponseSchema = z
  .object({ facts: z.array(ProfileFactSchema), proposed: z.array(ProposedFactSchema) })
  .strict();

export const FACT_DECISION_ACTIONS = ["confirm", "correct", "erase"] as const;

export const FactDecisionRequestSchema = z
  .object({
    action: z.enum(FACT_DECISION_ACTIONS),
    /** The corrected value; required for `correct`, ignored otherwise. */
    value: z.string().min(1).max(1000).optional(),
  })
  .strict()
  .refine((d) => d.action !== "correct" || d.value !== undefined, { message: "correct needs a value", path: ["value"] });

// ---------------------------------------------------------------------------
// Chat (authenticated)
// ---------------------------------------------------------------------------

export const TURN_STATES = ["ok", "concern", "escalated", "no_sourced_answer", "sign_in_required"] as const;
export const TURN_CHANNELS = ["text", "voice"] as const;
export const MAX_TURN_TEXT_LENGTH = 4000;

export const TurnRequestSchema = z
  .object({
    text: z.string().min(1).max(MAX_TURN_TEXT_LENGTH),
    /** Idempotency key: a retry with the same key returns the same turn instead of creating one. */
    clientTurnId: z.string().min(1).max(128).optional(),
  })
  .strict();

export const TurnResponseSchema = z
  .object({
    turnId: z.string().min(1).max(128).optional(),
    state: z.enum(TURN_STATES),
    /** The student-facing message, including the fixed no-answer and crisis texts. */
    message: z.string().max(8000).optional(),
    claims: z.array(ClaimSchema),
    sources: z.array(SourceSchema),
    profileFactsUsed: z.array(ProfileFactSchema),
    /** Set when options were ranked against the profile (e.g. "student-success"). */
    rankingProfile: z.string().min(1).max(64).optional(),
  })
  .strict();
export type TurnResponse = z.infer<typeof TurnResponseSchema>;

export const ThreadCreatedSchema = z.object({ threadId: z.string().min(1).max(128) }).strict();

export const ThreadTurnSchema = z
  .object({
    turnId: z.string().min(1).max(128),
    role: z.enum(["user", "assistant"]),
    channel: z.enum(TURN_CHANNELS),
    text: z.string().max(8000),
    at: z.string().datetime(),
    claims: z.array(ClaimSchema).optional(),
    sources: z.array(SourceSchema).optional(),
  })
  .strict();

/** One history of text and voice turns in order (A19). */
export const ThreadSchema = z
  .object({
    threadId: z.string().min(1).max(128),
    turns: z.array(ThreadTurnSchema),
    /**
     * P1 U8 (D-093 4A): false when any turn was answered without storing its text (an under-18 student with no guardian-consent
     * signal). Those turns come back with empty `text`; absent means every turn's (redacted) text is stored.
     */
    textStored: z.boolean().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Anonymous mode (scope item 2, A15a-c)
// ---------------------------------------------------------------------------

export const ANONYMOUS_STATES = ["ok", "no_sourced_answer", "sign_in_required", "escalated"] as const;
export const ANONYMOUS_COUNTER_KINDS = ["answered", "no_answer", "sign_in_required", "crisis"] as const;

export const AnonymousTurnRequestSchema = z.object({ text: z.string().min(1).max(MAX_TURN_TEXT_LENGTH) }).strict();

export const AnonymousTurnResponseSchema = z
  .object({
    state: z.enum(ANONYMOUS_STATES),
    message: z.string().max(8000).optional(),
    claims: z.array(ClaimSchema),
    sources: z.array(SourceSchema),
  })
  .strict();

/**
 * The ONLY thing anonymous mode may persist: date, kind, count. Strict, so a text, IP or identifier
 * field cannot be added without this test-guarded schema changing (D-088 Q7; A15a).
 */
export const AnonymousCounterSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    kind: z.enum(ANONYMOUS_COUNTER_KINDS),
    count: z.number().int().min(0),
  })
  .strict();

// ---------------------------------------------------------------------------
// Limits (scope items 1, 11; D-088 Q5; A23)
// ---------------------------------------------------------------------------

export const AudioFormatSchema = z
  .object({
    format: z.literal("pcm16"),
    inputSampleRateHz: z.literal(16000),
    outputSampleRateHz: z.literal(24000),
  })
  .strict();

const positiveInt = z.number().int().positive();

export const LimitsConfigSchema = z
  .object({
    requestsPerMinute: positiveInt,
    anonymousRequestsPerMinute: positiveInt,
    voiceMinutesPerMonth: positiveInt,
    voiceSessionMaxMinutes: positiveInt,
    crisisMaxAudioMsAfterTrigger: positiveInt,
    audio: AudioFormatSchema,
  })
  .strict();
export type LimitsConfig = z.infer<typeof LimitsConfigSchema>;

/** D-088 defaults. Per-tenant overrides go through resolveLimits; this object is never mutated. */
export const DEFAULT_LIMITS: LimitsConfig = Object.freeze({
  requestsPerMinute: 30,
  anonymousRequestsPerMinute: 10,
  voiceMinutesPerMonth: 60,
  voiceSessionMaxMinutes: 20,
  crisisMaxAudioMsAfterTrigger: 2000,
  audio: Object.freeze({ format: "pcm16", inputSampleRateHz: 16000, outputSampleRateHz: 24000 } as const),
});

export const LimitsOverrideSchema = LimitsConfigSchema.omit({ audio: true })
  .extend({ audio: AudioFormatSchema.partial().strict() })
  .partial()
  .strict();

/** Defaults overlaid with one tenant's overrides. Throws on an unknown key or an invalid value. */
export function resolveLimits(overrides?: z.input<typeof LimitsOverrideSchema>): LimitsConfig {
  if (overrides === undefined) return DEFAULT_LIMITS;
  const o = LimitsOverrideSchema.parse(overrides);
  return LimitsConfigSchema.parse({ ...DEFAULT_LIMITS, ...o, audio: { ...DEFAULT_LIMITS.audio, ...(o.audio ?? {}) } });
}

// ---------------------------------------------------------------------------
// Synthetic ids (A6, A23): the sandbox tenant accepts only these
// ---------------------------------------------------------------------------

export const SYNTHETIC_STUDENT_ID_PREFIX = "syn-";

export function isSyntheticStudentId(studentId: string): boolean {
  return typeof studentId === "string" && studentId.startsWith(SYNTHETIC_STUDENT_ID_PREFIX) && studentId.length > SYNTHETIC_STUDENT_ID_PREFIX.length;
}

// ---------------------------------------------------------------------------
// Voice (scope item 1, A9, A9b, A19)
// ---------------------------------------------------------------------------

export const VoiceSessionResponseSchema = z
  .object({
    token: z.string().min(1).max(4096),
    wsUrl: z.string().regex(/^wss?:\/\/\S+$/),
    expiresAt: z.string().datetime(),
    sessionMaxMinutes: positiveInt,
    audio: AudioFormatSchema,
  })
  .strict();

export const VOICE_FLAG_REASONS = ["uncited_number", "named_speaker", "crisis_detected", "unverified_claim"] as const;
export const VOICE_SERVER_EVENT_TYPES = [
  "transcript.partial",
  "transcript.final",
  "answer.sources",
  "state",
  "flag",
  "confirm",
  "error",
] as const;
export const VOICE_CLIENT_EVENT_TYPES = ["start", "interrupt", "end", "confirm"] as const;

const eventId = z.string().min(1).max(128);
const role = z.enum(["user", "assistant"]);

/** Server -> client. Audio travels as binary PCM16 frames outside this JSON union. Each event carries an id for `lastEventId` resume. */
export const VoiceServerEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("transcript.partial"), eventId, role, text: z.string().max(8000) }).strict(),
  z.object({ type: z.literal("transcript.final"), eventId, role, text: z.string().max(8000), turnId: z.string().min(1).max(128).optional() }).strict(),
  z.object({ type: z.literal("answer.sources"), eventId, sources: z.array(SourceSchema), claims: z.array(ClaimSchema) }).strict(),
  z.object({ type: z.literal("state"), eventId, state: z.enum(TURN_STATES) }).strict(),
  z.object({ type: z.literal("flag"), eventId, reason: z.enum(VOICE_FLAG_REASONS), detail: z.string().max(500).optional() }).strict(),
  z.object({ type: z.literal("confirm"), eventId, fact: z.object({ key: z.string().min(1).max(128), value: z.string().min(1).max(1000) }).strict() }).strict(),
  z.object({ type: z.literal("error"), eventId, code: z.string().min(1).max(64), message: z.string().max(500) }).strict(),
]);
export type VoiceServerEvent = z.infer<typeof VoiceServerEventSchema>;

/** Client -> server control messages (audio is binary PCM16 frames). */
export const VoiceClientEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), threadId: z.string().min(1).max(128), lastEventId: eventId.optional() }).strict(),
  z.object({ type: z.literal("interrupt") }).strict(),
  z.object({ type: z.literal("end") }).strict(),
  z.object({ type: z.literal("confirm"), key: z.string().min(1).max(128), accepted: z.boolean() }).strict(),
]);
export type VoiceClientEvent = z.infer<typeof VoiceClientEventSchema>;
