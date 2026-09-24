/**
 * Shared result shapes for the engine's hard-rule code guards (contract B6 — deterministic code,
 * no LLM call). Every guard in this directory returns one of these two shapes so callers can branch
 * on `result.ok` uniformly instead of learning a bespoke shape per guard.
 */

/** A guard either passes, or fails with a human-readable reason a counsellor/log can show as-is. */
export type GuardResult = { ok: true } | { ok: false; reason: string };

/** The outcome of running a guard over a batch: what survives, and why each dropped item was cut. */
export interface DropResult<C> {
  kept: C[];
  dropped: { card: C; reason: string }[];
}
