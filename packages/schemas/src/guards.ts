/**
 * Pure, framework-free guard functions for the "no-script" contract rule (B1).
 *
 * A Card's `prompt` must read as a question, a comparison, or a cited evidence
 * statement the counsellor uses to steer the conversation — never a sentence
 * written for the counsellor to recite verbatim to the student (that would make
 * this a "cheating platform", ARCHITECTURE.md §1 / contract B1).
 *
 * ISS-008 made this type-aware: the old heuristic ("script-like unless it ends
 * in '?' or starts with a comparison marker") wrongly flagged legitimate
 * evidence/challenge statements (e.g. a cited ranking fact, a budget-gap
 * challenge) as scripts, because those card types are allowed to be
 * statements — contract B2's sources requirement already carries the "this
 * is cited, not invented" guarantee for them.
 *
 * Heuristic v2 (documented, intentionally simple — a real classifier can
 * replace this later without changing the Card schema's refine() call site):
 *   1. Recital cues always flag as script-like, regardless of `type` or
 *      punctuation — these are direct instructions to recite, or a definitive
 *      assertion dressed up as a tag question, never a genuine question,
 *      comparison, or evidence statement:
 *        - second-person recital verbs: "Tell the student", "Tell them",
 *          "Say:", "Say to", "You should tell", "Ask them to agree",
 *          "Convince", "Reassure them that"
 *        - a leading definitive assertion closed with a tag question, e.g.
 *          "This is definitely your best option, right?"
 *   2. Otherwise, behaviour depends on the card's `type`:
 *      - widen | clarify: must be a genuine question — script-like unless the
 *        prompt ends with "?".
 *      - compare | challenge | evidence: may be a statement (contract B2's
 *        sources requirement carries the "not invented" guarantee for these
 *        types) — script-like only on a recital cue (step 1), never merely
 *        for lacking "?".
 *      - no `type` given (legacy callers): falls back to the v1 behaviour —
 *        script-like unless it ends with "?" or starts with a
 *        comparison/evidence marker ("Compare", "vs", "Evidence:").
 */

import type { CardType } from "./schemas.js";

// Case-insensitive patterns (ISS-t-002b-schema-hardening-1): statement-type cards have no "?"
// fallback, so a missed cue is their only defence. Third-party reporting verbs in cited evidence
// ("Alumni say ...", "Recruiters tell us ...") are deliberately NOT matched.
const RECITAL_CUES: readonly RegExp[] = [
  /\btell (the student|them|him|her)\b/i,
  /^say\b/i, // leading imperative: "Say the deadline is ..."
  /\bsay(:|\s+to\b|\s+that\b)/i,
  /\byou (should|must|need to|have to|ought to) (tell|say|inform|explain)\b/i,
  /\bask them to agree\b/i,
  /\bconvince\b/i,
  /\breassure (them|the student|him|her)\b/i,
];

// A leading definitive assertion ("definitely" / "certainly" / "clearly" /
// "obviously" / "surely") closed with a tag question ("right?", "isn't it?",
// "don't you think?", "correct?") reads as a statement wearing a question
// mark, not a genuine open question — flag it regardless of type.
const DEFINITIVE_TAG_QUESTION =
  /\b(definitely|certainly|clearly|obviously|surely)\b.*,\s*(right|isn't it|don't you think|correct)\?$/i;

const COMPARISON_MARKERS = ["Compare", "vs", "Evidence:"] as const;

const QUESTION_TYPES: ReadonlySet<CardType> = new Set(["widen", "clarify"]);
const STATEMENT_TYPES: ReadonlySet<CardType> = new Set(["compare", "challenge", "evidence"]);

export function isScriptLike(prompt: string, type?: CardType): boolean {
  const trimmed = prompt.trim();

  const hasRecitalCue = RECITAL_CUES.some((cue) => cue.test(trimmed));
  if (hasRecitalCue || DEFINITIVE_TAG_QUESTION.test(trimmed)) {
    return true;
  }

  const endsWithQuestion = trimmed.endsWith("?");

  if (type && QUESTION_TYPES.has(type)) {
    // widen/clarify cards must be genuine questions.
    return !endsWithQuestion;
  }

  if (type && STATEMENT_TYPES.has(type)) {
    // compare/challenge/evidence cards may be statements — B2's sources
    // requirement already carries the "cited, not invented" guarantee.
    return false;
  }

  // No type given: fall back to the original v1 heuristic.
  const startsWithComparisonMarker = COMPARISON_MARKERS.some((marker) =>
    trimmed.startsWith(marker),
  );
  return !endsWithQuestion && !startsWithComparisonMarker;
}
