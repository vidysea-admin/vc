/**
 * Hard-rule code guard for contract B1 (no-script) — the pure decision function that a graph node
 * calls before showing a card to the counsellor. Delegates the actual heuristic to
 * `isScriptLike` (@vc/schemas, packages/schemas/src/guards.ts) so the classification logic has one
 * home; this module only adapts that boolean into the engine's shared `GuardResult` shape with a
 * human-readable reason (contract B6: hard rules are deterministic code, no LLM call involved).
 */
import { isScriptLike } from "@vc/schemas";
import type { CardType } from "@vc/schemas";
import type { GuardResult } from "./types.js";

/** The minimal shape noScriptGuard needs — a full Card is not required (only its type + prompt). */
export interface ScriptGuardInput {
  type: CardType;
  prompt: string;
}

/**
 * Rejects a card whose `prompt` reads as a script (a sentence for the counsellor to recite) rather
 * than a genuine question, comparison, or cited evidence statement (contract B1).
 */
export function noScriptGuard(card: ScriptGuardInput): GuardResult {
  if (isScriptLike(card.prompt, card.type)) {
    return {
      ok: false,
      reason:
        `Card.prompt reads as a script for type "${card.type}" (contract B1) — it must be a genuine ` +
        "question, comparison, or cited evidence statement, never a sentence written for the " +
        "counsellor to recite verbatim.",
    };
  }
  return { ok: true };
}
