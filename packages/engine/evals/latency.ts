/**
 * P1 U4 / A8 harness: latency sampling, nearest-rank percentiles and the A8 bar (text p95 first
 * token <= 3 s, full answer <= 10 s; both [ASSUMPTION] in the spec). A mock run measures plumbing
 * only and can never PROVE A8; a real run needs >= 20 samples.
 */
export const A8_FIRST_TOKEN_P95_MS = 3000;
export const A8_FULL_P95_MS = 10_000;
export const A8_MIN_SAMPLES = 20;

export interface LatencySample {
  firstTokenMs: number;
  fullMs: number;
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error("percentile: empty input");
  if (!(p > 0 && p <= 100)) throw new RangeError(`percentile: p must be in (0, 100], got ${p}`);
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]!;
}

export interface LatencySummary {
  n: number;
  firstToken: { p50: number; p95: number; max: number };
  full: { p50: number; p95: number; max: number };
}

export function summarizeLatency(samples: readonly LatencySample[]): LatencySummary {
  const first = samples.map((s) => s.firstTokenMs);
  const full = samples.map((s) => s.fullMs);
  return {
    n: samples.length,
    firstToken: { p50: percentile(first, 50), p95: percentile(first, 95), max: Math.max(...first) },
    full: { p50: percentile(full, 50), p95: percentile(full, 95), max: Math.max(...full) },
  };
}

export interface A8Result {
  verdict: "PASS" | "FAIL" | "NOT PROVEN";
  reasons: string[];
}

export function evaluateA8(summary: LatencySummary, options: { real: boolean }): A8Result {
  if (!options.real) return { verdict: "NOT PROVEN", reasons: ["mock run: measures harness plumbing only; A8 needs a REAL run (G-REAL)"] };
  if (summary.n < A8_MIN_SAMPLES) return { verdict: "NOT PROVEN", reasons: [`only ${summary.n} samples; A8 needs >= ${A8_MIN_SAMPLES}`] };
  const reasons: string[] = [];
  if (summary.firstToken.p95 > A8_FIRST_TOKEN_P95_MS) reasons.push(`first-token p95 ${summary.firstToken.p95} ms > ${A8_FIRST_TOKEN_P95_MS} ms`);
  if (summary.full.p95 > A8_FULL_P95_MS) reasons.push(`full-answer p95 ${summary.full.p95} ms > ${A8_FULL_P95_MS} ms`);
  return { verdict: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}

export interface LatencyHooks {
  firstToken(): void;
}

/** Times one answer: `run` must call `hooks.firstToken()` when the first token arrives. */
export async function measureOnce(run: (hooks: LatencyHooks) => Promise<void>, clock: () => number = () => performance.now()): Promise<LatencySample> {
  const start = clock();
  let first: number | undefined;
  await run({
    firstToken: () => {
      first ??= clock();
    },
  });
  const end = clock();
  if (first === undefined) throw new Error("measureOnce: run finished without emitting a first token");
  return { firstTokenMs: first - start, fullMs: end - start };
}
