export const CONCERN_CLASSIFIER_DEFAULT_MODEL = "flash-lite";
export const CONCERN_CLASSIFIER_DEFAULT_TIMEOUT_MS = 8_000;

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
    if (!Number.isSafeInteger(n) || n < 1 || n > 2147483647) {
      throw new Error("loadConcernClassifierConfig: VC_CONCERN_TIMEOUT_MS must be a safe integer in [1, 2147483647]");
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
          'loadConcernClassifierConfig: VC_CONCERN_SAMPLE_RATES must look like "latin=0.1,devanagari=0.25,other=0.25" with rates in [0, 1]',
        );
      }
      sampleRates[rawKey as SampleStratum] = rate;
    }
  }
  return { model, timeoutMs, sampleRates };
}

