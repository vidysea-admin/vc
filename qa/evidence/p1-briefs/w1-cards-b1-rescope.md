# Re-scope: w1-cards-b1 (orchestrator decision, 2026-10-25)

Your BLOCKED report was correct. Option 1 (merging wave/t-010-live-cards) is dropped. Do NOT merge that branch. Main's T-049 cards code (fe0937e, D-079) is the base.

Keep using the same worktree D:/vc/.worktrees/w1-cards-b1 and the same branch wave/w1-cards-b1. Keep every rule in qa/evidence/p1-briefs/w1-common-rules.md.

## New acceptance

**K1 (read-only comparison, no code).**
- Write `qa/evidence/w1-cards-b1-t010-vs-main.md`.
- Give one line for each of the 13 T-010 criteria, taken from qa/manifests/t-010-live-cards.md on that branch. Each line names the criterion id and says whether main already meets it, and the evidence: the main file:line or test name.
- Mark each line `ON-MAIN`, `MISSING` or `PARTIAL`.
- Read the T-010 side with `git show wave/t-010-live-cards:<path>` only.
- Port nothing in this unit. The missing items become a later queue row, which the orchestrator writes.

**K2 (ISS-t-010-c0-1, B1), on main's current code.**
- An imperative or script-like sentence that only ends in "?" is never shown as a question card. The QUESTION_TYPES checks are semantic, not punctuation-only.
- You are allowed to edit, in place, `packages/schemas/src/guards.ts` (QUESTION_TYPES and its check) and the cards verifier/nodes under `packages/engine/src/cards/**`. Cite file:line for each edit.
- Tests:
  - At least 10 imperative phrasings that end in "?" are rejected. Use both English and Hinglish.
  - Genuine questions are accepted.
  - The existing cards tests stay green.

## Check

- Dual check: no. This is not auth, tenancy or prod-write; record that reason.
- Tier: L.
- Regression: the cards tests, the schemas guard/card tests, and tsc for packages/schemas and packages/engine.

## Return

`READY w1-cards-b1 <sha>`, followed by the K1 tally (counts of ON-MAIN, MISSING and PARTIAL).
