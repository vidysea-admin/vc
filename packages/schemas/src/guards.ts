/**
 * Pure, framework-free guard functions for the "no-script" contract rule (B1).
 *
 * A Card's `prompt` must read as a question, a comparison, or a cited evidence
 * statement the counsellor uses to steer the conversation — never a sentence
 * written for the counsellor to recite verbatim to the student (that would make
 * this a "cheating platform", ARCHITECTURE.md §1 / contract B1).
 *
 * Heuristic (documented, intentionally simple — a real classifier can replace
 * this later without changing the Card schema's refine() call site):
 *   1. Second-person recital cues ("Tell the student", "Say:", "You should
 *      tell") always flag as script-like, even if the sentence happens to end
 *      in "?" — these are direct instructions to recite, not questions.
 *   2. Otherwise, the prompt is considered script-like UNLESS it ends with "?"
 *      OR starts with one of the comparison/evidence markers ("Compare", "vs",
 *      "Evidence:").
 */

const RECITAL_CUES = ["Tell the student", "Say:", "You should tell"] as const;
const COMPARISON_MARKERS = ["Compare", "vs", "Evidence:"] as const;

export function isScriptLike(prompt: string): boolean {
  const trimmed = prompt.trim();

  const hasRecitalCue = RECITAL_CUES.some((cue) => trimmed.includes(cue));
  if (hasRecitalCue) {
    return true;
  }

  const endsWithQuestion = trimmed.endsWith("?");
  const startsWithComparisonMarker = COMPARISON_MARKERS.some((marker) =>
    trimmed.startsWith(marker),
  );

  return !endsWithQuestion && !startsWithComparisonMarker;
}
