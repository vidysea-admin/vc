/**
 * Combines the per-card hard-rule guards (B1 no-script, B2 citation) into the single pass a graph
 * node runs over a candidate batch before showing anything to the counsellor, plus the max-3 display
 * cap (docs/plan.md §3 step 7 — "the counsellor sees at most 3 cards at a time"). Order matters for
 * the `reason` a dropped card gets, not for correctness: a script-like card is reported as such even
 * if it also happens to be uncited.
 */
import { noScriptGuard } from "./no-script.js";
import type { ScriptGuardInput } from "./no-script.js";
import { citationGuard } from "./citation.js";
import type { CitationGuardInput } from "./citation.js";
import type { DropResult } from "./types.js";

const MAX_CARDS = 3;

export type HardRuleInput = ScriptGuardInput & CitationGuardInput;

/**
 * Applies B1 (no-script) and B2 (citation) to every card, then caps the survivors at
 * `MAX_CARDS`. Cards cut solely by the cap still carry a reason, so a caller can tell "failed a hard
 * rule" apart from "correct, just over the display limit".
 */
export function applyHardRules<C extends HardRuleInput>(cards: C[]): DropResult<C> {
  const kept: C[] = [];
  const dropped: DropResult<C>["dropped"] = [];

  for (const card of cards) {
    const scriptResult = noScriptGuard(card);
    if (!scriptResult.ok) {
      dropped.push({ card, reason: scriptResult.reason });
      continue;
    }

    const citationResult = citationGuard(card);
    if (!citationResult.ok) {
      dropped.push({ card, reason: citationResult.reason });
      continue;
    }

    if (kept.length >= MAX_CARDS) {
      dropped.push({
        card,
        reason: `Card cleared B1/B2 but the counsellor sees at most ${MAX_CARDS} cards per turn (docs/plan.md §3 step 7) — already at the cap.`,
      });
      continue;
    }

    kept.push(card);
  }

  return { kept, dropped };
}
