/**
 * T-012 (contract B16, D-020, gates crisis-guard-precision + crisis-safety-layers): the async concern
 * classifier — the SECOND safety layer, behind the recall-only keyword guard (crisis.ts, B9).
 *
 * New file, on purpose: nothing in the engine owned a model-based concern review. crisis.ts is the
 * deterministic guard and must stay LLM-free (it runs before any generative call); this module is
 * the layer that runs AFTER it, never on the live path.
 *
 * What it may do (B16 "downgrade, never hide"):
 *   - add a severity and a "likely benign" annotation to a guard-flagged turn, for the counsellor's
 *     view;
 *   - RAISE severity (a concern that reads as serious, or a sampled unflagged turn that reads as a
 *     crisis) so escalation follows as a concern deepens (B20).
 * What it can never do: hide, drop or lower a guard flag. That is not a promise the classifier
 * keeps — the functions below never read the classifier's output when deciding whether a flag is
 * visible or whether a guard crisis escalates. `reviewedFlagView` takes the guard result and the
 * annotation separately and the guard fields pass through untouched; `escalationDecision` returns
 * "escalate" for a guard crisis before it looks at the annotation at all.
 *
 * Which turns it sees (gate crisis-safety-layers option (b)): every turn the guard flagged
 * (concern or crisis), plus a STRATIFIED, deterministic sample of unflagged student turns. The
 * strata are the turn's script (latin / devanagari / other), because the guard's keyword coverage
 * differs by script; each stratum has its own rate (config). Selection is a hash of
 * `${sessionId}:${turnId}`, so a replay selects the same turns.
 *
 * Provider-agnostic: the model is whatever `LlmProvider` the caller builds, by config. The default
 * model tier name is "flash-lite" (VC_CONCERN_MODEL); tests pass a MockProvider. The prompt lives in
 * skills/concern-classifier/SKILL.md (B6).
 *
 * Fail-open (brief item 3): `classifyConcern` never throws. A timeout or provider error comes back as
 * an `unavailable` annotation, and `escalationDecision` escalates a guard-flagged turn on the flag
 * alone when the classifier could not review it. Never fail-silent.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import type { LlmProvider, ProviderConfig } from "@vc/providers";
import type { CrisisLevel } from "./crisis.js";

export const CONCERN_CLASSIFIER_SKILL = "concern-classifier";
/** The default model tier name (B16: "Flash-Lite"); a deployment maps it through its provider config. */
export const CONCERN_CLASSIFIER_DEFAULT_MODEL = "flash-lite";
export const CONCERN_CLASSIFIER_DEFAULT_TIMEOUT_MS = 8_000;

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

export const SEVERITIES = ["none", "low", "moderate", "high", "critical"] as const;
export const SeveritySchema = z.enum(SEVERITIES);
export type Severity = z.infer<typeof SeveritySchema>;

export function severityRank(severity: Severity): number {
  return SEVERITIES.indexOf(severity);
}

export function maxSeverity(a: Severity, b: Severity): Severity {
  return severityRank(a) >= severityRank(b) ? a : b;
}

/** The severity the guard alone guarantees; no classifier output can take a flag below it. */
export function guardSeverityFloor(level: CrisisLevel): Severity {
  if (level === "crisis") return "critical";
  if (level === "concern") return "moderate";
  return "none";
}

/** A classifier severity at or above this escalates a turn the guard did not rate crisis. */
export const ESCALATE_AT: Severity = "high";

// ---------------------------------------------------------------------------
// Model I/O (B5: typed on both sides of the provider seam)
// ---------------------------------------------------------------------------

export const ConcernClassifierInputSchema = z
  .object({
    text: z.string(),
    translatedText: z.string(),
    lang: z.string(),
    guardLevel: z.enum(["none", "concern", "crisis"]),
    guardMatched: z.array(z.string()),
  })
  .strict();
export type ConcernClassifierInput = z.infer<typeof ConcernClassifierInputSchema>;

export const ConcernClassifierOutputSchema = z
  .object({
    severity: SeveritySchema,
    likelyBenign: z.boolean(),
    rationale: z.string().min(1).max(500),
  })
  .strict();
export type ConcernClassifierOutput = z.infer<typeof ConcernClassifierOutputSchema>;

export type ClassifierAnnotation =
  | {
      status: "classified";
      model: string;
      severity: Severity;
      likelyBenign: boolean;
      rationale: string;
      classifiedAt: string;
    }
  | {
      status: "unavailable";
      model: string;
      reason: "timeout" | "error";
      /** The error's class name only — never its message (it could echo a key or the transcript). */
      errorName: string;
      attemptedAt: string;
    };

// ---------------------------------------------------------------------------
// Config (B6: the model is chosen by config; names only in .env.example)
// ---------------------------------------------------------------------------

export const SAMPLE_STRATA = ["latin", "devanagari", "other"] as const;
export type SampleStratum = (typeof SAMPLE_STRATA)[number];
export type SampleRates = Record<SampleStratum, number>;

/**
 * Default per-stratum sample rates for UNFLAGGED student turns. Non-Latin strata are sampled more
 * because the keyword guard's coverage there is thinner (qa/evals/crisis-eval-heldout.jsonl). These
 * are a cost/recall knob, not a measured optimum; the manifest's Open gaps carries the decision.
 */
export const DEFAULT_SAMPLE_RATES: SampleRates = { latin: 0.1, devanagari: 0.25, other: 0.25 };

export interface ConcernClassifierConfig {
  model: string;
  timeoutMs: number;
  sampleRates: SampleRates;
}

export interface ConcernClassifierEnv {
  VC_CONCERN_MODEL?: string;
  VC_CONCERN_TIMEOUT_MS?: string;
  VC_CONCERN_SAMPLE_RATES?: string;
  [key: string]: string | undefined;
}

/** Reads the classifier config from an env-like object (never reads process.env itself). */
export function loadConcernClassifierConfig(env: ConcernClassifierEnv): ConcernClassifierConfig {
  const model = env.VC_CONCERN_MODEL?.trim() || CONCERN_CLASSIFIER_DEFAULT_MODEL;
  let timeoutMs = CONCERN_CLASSIFIER_DEFAULT_TIMEOUT_MS;
  if (env.VC_CONCERN_TIMEOUT_MS !== undefined && env.VC_CONCERN_TIMEOUT_MS !== "") {
    const n = Number(env.VC_CONCERN_TIMEOUT_MS);
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`loadConcernClassifierConfig: VC_CONCERN_TIMEOUT_MS must be a positive integer (got ${JSON.stringify(env.VC_CONCERN_TIMEOUT_MS)})`);
    }
    timeoutMs = n;
  }
  const sampleRates: SampleRates = { ...DEFAULT_SAMPLE_RATES };
  if (env.VC_CONCERN_SAMPLE_RATES !== undefined && env.VC_CONCERN_SAMPLE_RATES !== "") {
    for (const part of env.VC_CONCERN_SAMPLE_RATES.split(",")) {
      const [rawKey, rawValue] = part.split("=").map((s) => s.trim());
      const rate = Number(rawValue);
      if (!(SAMPLE_STRATA as readonly string[]).includes(rawKey ?? "") || !Number.isFinite(rate) || rate < 0 || rate > 1) {
        throw new Error(
          `loadConcernClassifierConfig: VC_CONCERN_SAMPLE_RATES must look like "latin=0.1,devanagari=0.25,other=0.25" with rates in [0, 1] (bad part ${JSON.stringify(part)})`,
        );
      }
      sampleRates[rawKey as SampleStratum] = rate;
    }
  }
  return { model, timeoutMs, sampleRates };
}

/**
 * The provider config for the classifier: the deployment's own provider config with the model
 * swapped for the classifier tier. A litellm failover chain is dropped on purpose — the classifier is
 * off the live path and fails open to escalation, so one bounded attempt is the right cost.
 */
export function concernClassifierProviderConfig(base: ProviderConfig, config: Pick<ConcernClassifierConfig, "model">): ProviderConfig {
  if (base.provider === "litellm") {
    const { models: _chain, maxAttempts: _budget, ...single } = base;
    return { ...single, model: config.model };
  }
  return { ...base, model: config.model } as ProviderConfig;
}

// ---------------------------------------------------------------------------
// Selection: every guard flag + a stratified sample of unflagged student turns
// ---------------------------------------------------------------------------

const DEVANAGARI = /\p{Script=Devanagari}/u;
const LATIN_LETTER = /\p{Script=Latin}/u;

/** The script stratum of a turn's original-language text. */
export function sampleStratum(text: string): SampleStratum {
  if (DEVANAGARI.test(text)) return "devanagari";
  if (LATIN_LETTER.test(text)) return "latin";
  return "other";
}

/** A deterministic number in [0, 1) for a key (sha256), so a replay samples the same turns. */
export function sampleUnit(key: string): number {
  const hex = createHash("sha256").update(key).digest("hex").slice(0, 13);
  return parseInt(hex, 16) / 2 ** 52;
}

export type ReviewSelection = "guard_flag" | "stratified_sample";

export interface SelectionResult {
  selected: boolean;
  selection: ReviewSelection | null;
  stratum: SampleStratum;
}

export function selectForReview(
  turn: { sessionId: string; turnId: string; speaker: string; text: string },
  guardLevel: CrisisLevel,
  rates: SampleRates,
): SelectionResult {
  const stratum = sampleStratum(turn.text);
  if (guardLevel !== "none") return { selected: true, selection: "guard_flag", stratum };
  if (turn.speaker !== "student") return { selected: false, selection: null, stratum };
  const picked = sampleUnit(`${turn.sessionId}:${turn.turnId}`) < rates[stratum];
  return { selected: picked, selection: picked ? "stratified_sample" : null, stratum };
}

// ---------------------------------------------------------------------------
// The call (never throws; fail-open)
// ---------------------------------------------------------------------------

export class ConcernClassifierTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`concern classifier timed out after ${timeoutMs}ms`);
    this.name = "ConcernClassifierTimeoutError";
  }
}

export interface ClassifyDeps {
  provider: LlmProvider;
  /** The body of skills/concern-classifier/SKILL.md (loaded by the caller, B6). */
  skillPrompt: string;
  timeoutMs: number;
  now?: () => Date;
}

/**
 * Runs the classifier on one turn. Resolves to a `classified` annotation, or to an `unavailable` one
 * on a timeout, a provider error or a schema-invalid answer. Never rejects.
 */
export async function classifyConcern(rawInput: ConcernClassifierInput, deps: ClassifyDeps): Promise<ClassifierAnnotation> {
  const now = deps.now ?? (() => new Date());
  const model = deps.provider.model;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const input = ConcernClassifierInputSchema.parse(rawInput);
    const call = deps.provider.generate({
      skillName: CONCERN_CLASSIFIER_SKILL,
      skillPrompt: deps.skillPrompt,
      outputSchema: ConcernClassifierOutputSchema,
      input,
    });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ConcernClassifierTimeoutError(deps.timeoutMs)), deps.timeoutMs);
    });
    const out = ConcernClassifierOutputSchema.parse(await Promise.race([call, timeout]));
    return { status: "classified", model, ...out, classifiedAt: now().toISOString() };
  } catch (err) {
    return {
      status: "unavailable",
      model,
      reason: err instanceof ConcernClassifierTimeoutError ? "timeout" : "error",
      errorName: err instanceof Error ? err.name : typeof err,
      attemptedAt: now().toISOString(),
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Downgrade, never hide (B16 / D-020)
// ---------------------------------------------------------------------------

export interface GuardFlag {
  level: CrisisLevel;
  matched: string[];
}

export const LIKELY_BENIGN_LABEL = "reviewed, likely benign";

export interface FlagView {
  /** The guard's own result, copied verbatim. Never derived from the classifier. */
  guardLevel: CrisisLevel;
  guardMatched: string[];
  /** A guard flag is ALWAYS visible; a sampled unflagged turn becomes visible only if raised. */
  visible: boolean;
  /** max(guard floor, classifier severity): the classifier can raise it, never lower it. */
  effectiveSeverity: Severity;
  /** The downgrade annotation: shown next to the flag, never instead of it. */
  annotation: typeof LIKELY_BENIGN_LABEL | null;
  classifier: ClassifierAnnotation | null;
}

export function reviewedFlagView(guard: GuardFlag, classifier: ClassifierAnnotation | null): FlagView {
  const floor = guardSeverityFloor(guard.level);
  const classified = classifier?.status === "classified" ? classifier : null;
  const effectiveSeverity = classified ? maxSeverity(floor, classified.severity) : floor;
  return {
    guardLevel: guard.level,
    guardMatched: [...guard.matched],
    visible: guard.level !== "none" || severityRank(effectiveSeverity) >= severityRank(ESCALATE_AT),
    effectiveSeverity,
    annotation: guard.level !== "none" && classified?.likelyBenign === true ? LIKELY_BENIGN_LABEL : null,
    classifier,
  };
}

export type EscalationReason = "guard_crisis" | "classifier_unavailable" | "classifier_severity";

export type EscalationDecision = { escalate: true; reason: EscalationReason; severity: Severity } | { escalate: false };

/**
 * Whether a reviewed turn escalates. The guard crisis branch is decided FIRST and does not read the
 * classifier at all: a "likely benign" answer can not stop it. A guard-flagged concern whose review
 * failed escalates on the flag alone (fail-open). Otherwise the classifier may raise to escalation.
 */
export function escalationDecision(guard: GuardFlag, classifier: ClassifierAnnotation | null): EscalationDecision {
  if (guard.level === "crisis") return { escalate: true, reason: "guard_crisis", severity: "critical" };
  if (guard.level !== "none" && (classifier === null || classifier.status === "unavailable")) {
    return { escalate: true, reason: "classifier_unavailable", severity: guardSeverityFloor(guard.level) };
  }
  if (classifier?.status === "classified") {
    const severity = maxSeverity(guardSeverityFloor(guard.level), classifier.severity);
    if (severityRank(severity) >= severityRank(ESCALATE_AT)) return { escalate: true, reason: "classifier_severity", severity };
  }
  return { escalate: false };
}
