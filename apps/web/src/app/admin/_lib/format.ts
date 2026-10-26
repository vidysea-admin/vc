/** S8: the dashboard compares cost per student with the 50 INR target. */
export const COST_TARGET_INR = 50;

export function formatInt(n: number): string {
  return Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "0";
}

export function formatInr(n: number): string {
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

export function formatUsd(n: number): string {
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

export function costStatus(costPerStudentInr: number): "under" | "over" {
  return costPerStudentInr <= COST_TARGET_INR ? "under" : "over";
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Default dashboard window: the last 7 days ending today (UTC). */
export function defaultRange(now: Date = new Date()): { from: string; to: string } {
  const to = isoDay(now);
  const from = isoDay(new Date(now.getTime() - 6 * 86_400_000));
  return { from, to };
}
