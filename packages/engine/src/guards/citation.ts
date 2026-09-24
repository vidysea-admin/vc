/**
 * Hard-rule code guard for contract B2 (cited facts) — every fact/card shown or stored must carry a
 * source; uncited ones are dropped, never silently kept or invented. Pure, framework-free, no LLM
 * call (contract B6).
 */
import { CardSourceSchema } from "@vc/schemas";
import type { CardSource } from "@vc/schemas";
import type { DropResult, GuardResult } from "./types.js";

/** The minimal shape citationGuard needs — anything with a `sources` array shaped like Card.sources. */
export interface CitationGuardInput {
  sources: CardSource[];
}

function isValidSource(source: CardSource): boolean {
  return CardSourceSchema.safeParse(source).success;
}

/**
 * Rejects a card with no sources, or with any source that fails to validate (e.g. an empty `id` —
 * not actually traceable back to anything). Contract B2.
 */
export function citationGuard(card: CitationGuardInput): GuardResult {
  if (!card.sources || card.sources.length === 0) {
    return {
      ok: false,
      reason:
        "Card has no sources (contract B2) — every fact shown or stored must carry a source (KB " +
        "record id + fetchedAt, profile fact id, or transcript quote + turn).",
    };
  }

  const invalidCount = card.sources.filter((source) => !isValidSource(source)).length;
  if (invalidCount > 0) {
    return {
      ok: false,
      reason:
        `Card has ${invalidCount} invalid source(s) (contract B2) — each source needs a non-empty ` +
        "type and id to be traceable back to anything.",
    };
  }

  return { ok: true };
}

/**
 * Splits a batch of cards into `kept` (valid citations) and `dropped` (with a reason each) —
 * contract B2's "uncited facts are dropped" as a pure batch operation.
 */
export function dropUncited<C extends CitationGuardInput>(cards: C[]): DropResult<C> {
  const kept: C[] = [];
  const dropped: DropResult<C>["dropped"] = [];

  for (const card of cards) {
    const result = citationGuard(card);
    if (result.ok) {
      kept.push(card);
    } else {
      dropped.push({ card, reason: result.reason });
    }
  }

  return { kept, dropped };
}
