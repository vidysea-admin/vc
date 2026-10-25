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
 *        - explain/inform aimed at the student: "Explain to the student",
 *          "Explain them", "Inform them", "Inform the student"
 *          (ISS-t-002b-schema-hardening-2)
 *        - "let the student/them/him/her know" (ISS-t-002b-schema-hardening-2)
 *        - a leading script-label cue: "Your line:", "Script:", "Say this:"
 *          (ISS-t-002b-schema-hardening-2)
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
  // ISS-t-002b-schema-hardening-2: bare explain/inform aimed at the student —
  // distinct from the "you must/should ... explain/inform" combinator above,
  // which requires a leading "you" modal that these do not have.
  /\b(explain|inform)( to)? (the student|them|him|her)\b/i,
  /\blet (the student|them|him|her) know\b/i,
  // a leading script-label cue, e.g. "Your line: University A is better."
  /^(your line|script|say this)\s*:/i,
];

// A leading definitive assertion ("definitely" / "certainly" / "clearly" /
// "obviously" / "surely") closed with a tag question ("right?", "isn't it?",
// "don't you think?", "correct?") reads as a statement wearing a question
// mark, not a genuine open question — flag it regardless of type.
const DEFINITIVE_TAG_QUESTION =
  /\b(definitely|certainly|clearly|obviously|surely)\b.*,\s*(right|isn't it|don't you think|correct)\?$/i;

const COMPARISON_MARKERS = ["Compare", "vs", "Evidence:"] as const;

const QUESTION_TYPES: ReadonlySet<CardType> = new Set(["widen", "clarify", "check-in"]);

// w1-cards-b1 (ISS-t-010-c0-1): "ends with ?" tests punctuation, not interrogative form, so an
// instruction to the counsellor became a question card the moment a "?" was appended. These are
// the verbs that open an instruction aimed at the counsellor ("Explain the fees to the family").
// Exported so the live-cards verifier (packages/engine/src/cards/verifier.ts) uses the same list.
export const INSTRUCTION_VERB_ALTERNATION =
  "advise|ask|assure|brief|clarify|convince|describe|discuss|emphasi[sz]e|encourage|explain|highlight|inform|let|mention|outline|persuade|reassure|remind|say|share|show|spell|stress|summari[sz]e|tell|walk|warn";
const INSTRUCTION_LEAD = new RegExp(
  "^(?:(?:please|kindly|now|first|then|next|also|maybe|perhaps|just)[,\\s]+)*(?:" +
    INSTRUCTION_VERB_ALTERNATION +
    ")(?![\\p{L}\\p{N}'-])",
  "iu",
);
const STATEMENT_TYPES: ReadonlySet<CardType> = new Set(["compare", "challenge", "evidence"]);

export function isScriptLike(prompt: string, type?: CardType): boolean {
  const trimmed = prompt.trim();

  const hasRecitalCue = RECITAL_CUES.some((cue) => cue.test(trimmed));
  if (hasRecitalCue || DEFINITIVE_TAG_QUESTION.test(trimmed)) {
    return true;
  }

  const endsWithQuestion = trimmed.endsWith("?");

  if (type && QUESTION_TYPES.has(type)) {
    // widen/clarify cards must be genuine questions: a "?" is necessary, not sufficient - an
    // instruction-led prompt ("Explain the fees to the family?") is still an instruction.
    return !endsWithQuestion || INSTRUCTION_LEAD.test(trimmed);
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
