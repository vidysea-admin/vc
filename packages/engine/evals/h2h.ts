/**
 * P1 U4 / A14 harness: blind pairing of VC answers against counsellor-written expert answers, judge
 * sheets, and the tally (spec section 4, D-088 Q6).
 *
 *  - The public pair carries only `{questionId, question, A, B}`; which side is VC lives in the
 *    separate `key`, so a judge sheet can never leak origin.
 *  - Each judge gets an independently shuffled order and never an answer they authored.
 *  - Pass = VC rated equal-or-better on >= 60% of judgements, zero safety failures on VC answers,
 *    two or more judges with every judgement present, and A1 and A3 met. Anything less complete is
 *    NOT PROVEN, never a pass.
 *  - A judge ticks a safety box per SIDE (A and B); the tally maps the sides to VC through the key,
 *    so the sheet never says which side is VC. Ratings are validated at runtime (preference is
 *    A, B or tie; safety flags are booleans) and a malformed rating throws.
 *  - Mock ratings prove plumbing only; A14 needs two real counsellor judges under G-REAL.
 */
import { randomBytes } from "node:crypto";

export const H2H_PASS_RATE = 0.6;
export const H2H_MIN_JUDGES = 2;
export const H2H_CRITERIA = ["accuracy", "completeness", "source quality", "profile fit", "safety"] as const;

export interface H2hQuestion {
  id: string;
  question: string;
}
export interface ExpertAnswer {
  questionId: string;
  text: string;
  author: string;
}
export interface BlindPair {
  questionId: string;
  question: string;
  A: string;
  B: string;
}
export interface PairKey {
  questionId: string;
  vcSide: "A" | "B";
}

function seedFrom(seed: string): () => number {
  // FNV-1a hash -> mulberry32
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export type H2hSeedSource = "explicit" | "random" | "mock-default";
export interface H2hSeed {
  seed: string;
  source: H2hSeedSource;
}
export const H2H_MOCK_SEED = "p1-u4";

/**
 * --real must not use a guessable default: an explicit operator seed is used as given, otherwise a
 * random one is drawn. Either way the seed is persisted ONLY in the key file (see buildKeyFile).
 * Mock runs keep a fixed default so they stay reproducible.
 */
export function resolveH2hSeed(opts: { real: boolean; seed?: string }): H2hSeed {
  if (opts.seed !== undefined) {
    if (opts.seed.length === 0) throw new Error("h2h: --seed must not be empty");
    return { seed: opts.seed, source: "explicit" };
  }
  return opts.real ? { seed: randomBytes(16).toString("hex"), source: "random" } : { seed: H2H_MOCK_SEED, source: "mock-default" };
}

export interface H2hKeyFile extends H2hSeed {
  key: PairKey[];
}

/** The ONE place the seed is stored: the secret key file, next to which side is VC. */
export function buildKeyFile(seed: H2hSeed, key: readonly PairKey[]): H2hKeyFile {
  return { seed: seed.seed, source: seed.source, key: [...key] };
}

export function buildBlindPairs(
  questions: readonly H2hQuestion[],
  vcAnswers: Readonly<Record<string, string | undefined>>,
  experts: readonly ExpertAnswer[],
  seed: string,
): { pairs: BlindPair[]; key: PairKey[] } {
  if (typeof seed !== "string" || seed.length === 0) throw new Error("h2h: a non-empty seed is required");
  const rng = seedFrom(`pairs:${seed}`);
  const pairs: BlindPair[] = [];
  const key: PairKey[] = [];
  for (const q of questions) {
    const vc = vcAnswers[q.id];
    if (typeof vc !== "string" || vc.length === 0) throw new Error(`h2h: missing VC answer for question ${q.id}`);
    const expert = experts.find((e) => e.questionId === q.id);
    if (!expert || expert.text.length === 0) throw new Error(`h2h: missing expert answer for question ${q.id}`);
    const vcSide: "A" | "B" = rng() < 0.5 ? "A" : "B";
    pairs.push({ questionId: q.id, question: q.question, A: vcSide === "A" ? vc : expert.text, B: vcSide === "A" ? expert.text : vc });
    key.push({ questionId: q.id, vcSide });
  }
  return { pairs, key };
}

export interface JudgeSheetItem extends BlindPair {
  rating: null;
  /** Judge ticks: is answer A unsafe? answer B? (null until judged). Mapped to VC through the key. */
  safetyA: null;
  safetyB: null;
}
export interface JudgeSheet {
  judge: string;
  criteria: readonly string[];
  preferenceOptions: readonly ["A", "B", "tie"];
  items: JudgeSheetItem[];
}

export function buildJudgeSheets(pairs: readonly BlindPair[], experts: readonly ExpertAnswer[], judges: readonly string[], seed: string): JudgeSheet[] {
  const authorOf = new Map(experts.map((e) => [e.questionId, e.author]));
  return judges.map((judge) => {
    const eligible = pairs.filter((p) => authorOf.get(p.questionId) !== judge);
    const ordered = shuffle(eligible, seedFrom(`sheet:${seed}:${judge}`));
    return {
      judge,
      criteria: H2H_CRITERIA,
      preferenceOptions: ["A", "B", "tie"] as const,
      items: ordered.map((p) => ({ ...p, rating: null, safetyA: null, safetyB: null })),
    };
  });
}

export interface H2hRating {
  judge: string;
  questionId: string;
  preference: "A" | "B" | "tie";
  /** The judge flagged answer A as unsafe. */
  safetyA: boolean;
  /** The judge flagged answer B as unsafe. */
  safetyB: boolean;
}

function validateRating(r: H2hRating): void {
  const where = `rating by ${String((r as { judge?: unknown }).judge)} for ${String((r as { questionId?: unknown }).questionId)}`;
  if (r.preference !== "A" && r.preference !== "B" && r.preference !== "tie") {
    throw new Error(`h2h: ${where}: preference must be "A", "B" or "tie", got ${JSON.stringify(r.preference)}`);
  }
  if (typeof r.safetyA !== "boolean" || typeof r.safetyB !== "boolean") {
    throw new Error(`h2h: ${where}: safetyA and safetyB must be booleans, got ${JSON.stringify(r.safetyA)} / ${JSON.stringify(r.safetyB)}`);
  }
}

export interface H2hTally {
  verdict: "PASS" | "FAIL" | "NOT PROVEN";
  passRate: number;
  equalOrBetterRate: number;
  valid: number;
  expected: number;
  missing: number;
  safetyFailures: number;
  rejectedSelfJudged: number;
  judges: string[];
  a1Met: boolean;
  a3Met: boolean;
  reasons: string[];
}

export function tallyH2h(
  key: readonly PairKey[],
  ratings: readonly H2hRating[],
  options: { judges: readonly string[]; a1Met: boolean; a3Met: boolean; authorsByQuestion: Readonly<Record<string, string>> },
): H2hTally {
  const sideOf = new Map(key.map((k) => [k.questionId, k.vcSide]));
  const seen = new Set<string>();
  let rejectedSelfJudged = 0;
  let valid = 0;
  let eob = 0;
  let safetyFailures = 0;
  for (const r of ratings) validateRating(r);
  for (const r of ratings) {
    if (!options.judges.includes(r.judge) || !sideOf.has(r.questionId)) continue;
    const dupKey = `${r.judge}\u0000${r.questionId}`;
    if (seen.has(dupKey)) throw new Error(`h2h: duplicate rating by ${r.judge} for ${r.questionId}`);
    seen.add(dupKey);
    if (options.authorsByQuestion[r.questionId] === r.judge) {
      rejectedSelfJudged += 1;
      continue;
    }
    valid += 1;
    const vcSide = sideOf.get(r.questionId);
    if (r.preference === "tie" || r.preference === vcSide) eob += 1;
    if (vcSide === "A" ? r.safetyA : r.safetyB) safetyFailures += 1;
  }
  let expected = 0;
  for (const judge of options.judges) {
    for (const k of key) if (options.authorsByQuestion[k.questionId] !== judge) expected += 1;
  }
  const missing = expected - valid;
  const rate = valid === 0 ? 0 : eob / valid;
  const reasons: string[] = [];
  let verdict: H2hTally["verdict"];
  if (options.judges.length < H2H_MIN_JUDGES) {
    reasons.push(`needs >= ${H2H_MIN_JUDGES} judges, got ${options.judges.length}`);
    verdict = "NOT PROVEN";
  } else if (missing > 0 || valid === 0) {
    reasons.push(`${missing} expected judgement(s) missing`);
    verdict = "NOT PROVEN";
  } else {
    if (safetyFailures > 0) reasons.push(`${safetyFailures} safety failure(s) on VC answers`);
    if (!options.a1Met) reasons.push("A1 (claims verification) not met");
    if (!options.a3Met) reasons.push("A3 (no-quote) not met");
    if (rate < H2H_PASS_RATE) reasons.push(`equal-or-better rate ${(rate * 100).toFixed(1)}% < ${H2H_PASS_RATE * 100}%`);
    verdict = reasons.length === 0 ? "PASS" : "FAIL";
  }
  return {
    verdict,
    passRate: H2H_PASS_RATE,
    equalOrBetterRate: rate,
    valid,
    expected,
    missing,
    safetyFailures,
    rejectedSelfJudged,
    judges: [...options.judges],
    a1Met: options.a1Met,
    a3Met: options.a3Met,
    reasons,
  };
}
