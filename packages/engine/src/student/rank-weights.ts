/**
 * P1 U6b ranking weights (D-086 Q3, signature sheet P-8, contract B24.8): configurable, default goal
 * "student success" = fit / cost / scholarship chance / visa ease at 0.40 / 0.25 / 0.20 / 0.15. The default is
 * a configurable PLACEHOLDER (P-8), not a product claim. Pure, no I/O.
 *
 * Validation (fail closed, never guess): the vector must be a plain object with EXACTLY the four keys, each a
 * finite number >= 0, not all zero. A vector that does not sum to 1 is scaled to sum 1 and `normalised` says so.
 * The reported `rankingProfile` follows the numbers, not a caller-supplied label: the default vector (after
 * scaling) is "student-success"; any other vector is "custom-<8 hex of sha256 over the canonical vector>".
 */
import { createHash } from "node:crypto";

export const RANK_COMPONENTS = ["fit", "cost", "scholarshipChance", "visaEase"] as const;
export type RankComponent = (typeof RANK_COMPONENTS)[number];
export type RankWeights = Record<RankComponent, number>;

export const DEFAULT_RANKING_PROFILE = "student-success";
export const DEFAULT_RANK_WEIGHTS: Readonly<RankWeights> = Object.freeze({ fit: 0.4, cost: 0.25, scholarshipChance: 0.2, visaEase: 0.15 });

export type WeightsValidation =
  | { ok: true; weights: RankWeights; normalised: boolean; rankingProfile: string }
  | { ok: false; detail: string };

const EPS = 1e-9;
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/** Name of an (already scaled) weight vector: the default's name, or a short hash of the canonical numbers. */
export function rankingProfileFor(weights: RankWeights): string {
  if (RANK_COMPONENTS.every((k) => Math.abs(weights[k] - DEFAULT_RANK_WEIGHTS[k]) < EPS)) return DEFAULT_RANKING_PROFILE;
  const canonical = RANK_COMPONENTS.map((k) => `${k}=${round6(weights[k]).toFixed(6)}`).join(";");
  return `custom-${createHash("sha256").update(canonical).digest("hex").slice(0, 8)}`;
}

export function validateRankWeights(input: unknown): WeightsValidation {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, detail: "weights must be an object with fit, cost, scholarshipChance and visaEase" };
  }
  const obj = input as Record<string, unknown>;
  const unknownKeys = Object.keys(obj).filter((k) => !(RANK_COMPONENTS as readonly string[]).includes(k));
  if (unknownKeys.length > 0) return { ok: false, detail: `unknown weight key: ${unknownKeys.slice(0, 5).join(", ")}` };
  for (const k of RANK_COMPONENTS) {
    const v = obj[k];
    if (typeof v !== "number" || !Number.isFinite(v)) return { ok: false, detail: `weight ${k} must be a finite number` };
    if (v < 0) return { ok: false, detail: `weight ${k} must not be negative` };
  }
  const raw = RANK_COMPONENTS.map((k) => obj[k] as number);
  const sum = raw.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(sum) || sum <= 0) return { ok: false, detail: "weights are all zero (or overflow): at least one must be above zero" };
  const normalised = Math.abs(sum - 1) > EPS;
  const weights = Object.fromEntries(RANK_COMPONENTS.map((k, i) => [k, normalised ? raw[i]! / sum : raw[i]!])) as RankWeights;
  return { ok: true, weights, normalised, rankingProfile: rankingProfileFor(weights) };
}
