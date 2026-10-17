/**
 * T-009: an INDEPENDENT verbatim-citation check, deliberately separate from
 * `packages/engine/src/scribe/nodes.ts:verifyCandidateFact`'s guard. The eval harness must be able
 * to say whether a drop was a genuine fabrication or the guard being over-strict (ISS-t-007-rev-2:
 * case- and punctuation-sensitivity), so it cannot simply trust the guard's own pass/fail — that
 * would make the scorer unable to ever disagree with the code it is grading.
 *
 * `collapseWhitespace` is intentionally the same normalisation nodes.ts uses (so "verbatim" here
 * means what the engine's guard also considers verbatim); case-folding and punctuation-stripping are
 * added ON TOP, only for classifying what kind of near-miss a non-verbatim quote is.
 */
import type { CitationClass, CitationVerdict } from "./types.js";

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const PUNCTUATION = /[.,!?;:"'()\-–—।]/g;

export function stripPunctuation(text: string): string {
  return text.replace(PUNCTUATION, "");
}

export interface RawCandidateSource {
  quote?: unknown;
  turnId?: unknown;
}

/** The minimal shape of a raw, unverified provider candidate — before verifyCandidateFact runs. */
export interface RawCandidate {
  key?: unknown;
  source?: { type?: unknown; quote?: unknown; turnId?: unknown } | null;
}

export interface TurnText {
  turnId: string;
  text: string;
  translatedText: string;
}

/**
 * Classifies one raw candidate's citation against the transcript, independently of the guard:
 * - "malformed": no usable {quote, turnId} to check at all (the guard would drop it as uncited).
 * - "verbatim": an exact (whitespace-collapsed) substring of the cited turn — the guard keeps this.
 * - "case-mismatch" / "punctuation-mismatch" / "case-and-punctuation-mismatch": a genuine quote from
 *   the turn that only fails the guard's strict `.includes()` because of case or punctuation drift
 *   (ISS-t-007-rev-2) — a FALSE drop if the guard rejects it.
 * - "fabricated": no normalisation recovers a match — a paraphrase or invention, correctly dropped.
 */
export function classifyCitation(candidate: RawCandidate, turnsById: ReadonlyMap<string, TurnText>): CitationVerdict {
  const key = typeof candidate.key === "string" ? candidate.key : "(no key)";
  const source = candidate.source;
  if (!source || typeof source !== "object" || typeof source.quote !== "string" || typeof source.turnId !== "string") {
    return { key, class: "malformed" };
  }
  const turn = turnsById.get(source.turnId);
  if (!turn) return { key, class: "malformed" };

  const quote = collapseWhitespace(source.quote);
  const haystacks = [turn.text, turn.translatedText].map(collapseWhitespace);

  if (haystacks.some((h) => h.includes(quote))) return { key, class: "verbatim" };

  const caseFixes = haystacks.some((h) => h.toLowerCase().includes(quote.toLowerCase()));
  const punctFixes = haystacks.some((h) => stripPunctuation(h).includes(stripPunctuation(quote)));
  const caseAndPunctFixes = haystacks.some((h) => stripPunctuation(h).toLowerCase().includes(stripPunctuation(quote).toLowerCase()));

  const cls: CitationClass =
    caseFixes && punctFixes
      ? "case-and-punctuation-mismatch"
      : caseFixes
        ? "case-mismatch"
        : punctFixes
          ? "punctuation-mismatch"
          : caseAndPunctFixes
            ? "case-and-punctuation-mismatch"
            : "fabricated";
  return { key, class: cls };
}
