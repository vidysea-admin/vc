---
name: evidence-card
description: Use when a claim the student or counsellor made needs grounding in a real, cited fact from the Knowledge Base or transcript — a standalone data point, not a comparison or a question.
---

## Purpose

Generate a single `Card` of `type: "evidence"` (ExplorationPlanner, docs/plan.md §3 step 5) that surfaces
one cited fact relevant to the conversation — an outcome statistic, a fee figure, a ranking, a deadline.
It is the card type most at risk of drifting into a "just trust me" statement, so citation discipline
matters most here.

## Input shape

One or more `Fact[]` / `KnowledgeBase` records that bear on the current topic.

## Output shape

One `Card` (see `CardSchema`): `{id, type: "evidence", prompt, sources: CardSource[], confidence}`.
`evidence` is a statement-type card — it may read as a statement, but `sources` must be non-empty
(contract B2) and every fact folded into the prompt must trace to one of those sources.

## Soft rules

- One fact, cleanly cited — resist folding in a second, uncited claim "because it's obviously true".
- Prefer reporting what a source says over restating it as your own claim: "Alumni say the campus is
  safe (2024 survey, n=312)" is evidence; a bare unsourced assertion is not.
- Never turn a fact into an instruction ("Let the student know the deadline is March 1" is a recital
  cue, not evidence, even though the underlying fact is true and citable).
- If the fact can't be traced to a KB record, a transcript quote, or a profile entry, don't publish
  it — hand it to the verifier to drop rather than inventing a source.
- Numbers age; carry `fetchedAt`/`validFrom` through so a stale figure can be told apart from a fresh one.

## Examples

**Good:** "80% of 2024 graduates found jobs within 6 months (source: careers office report, fetched
2026-08-15)." (single cited fact, stated plainly)

**Bad:** "Inform them the scholarship covers 50% of fees." (a true, citable fact turned into a recital
instruction — flagged as script-like even though the fact itself is fine)
