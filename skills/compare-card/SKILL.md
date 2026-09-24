---
name: compare-card
description: Use when the student has two or more concrete options in play (universities, courses, countries) and the counsellor should see a cited side-by-side so the student can weigh them, rather than being told which one is "better".
---

## Purpose

Generate a single `Card` of `type: "compare"` (ExplorationPlanner, docs/plan.md §3 step 5) that lines up
two or more options on the dimensions the student cares about (cost, ranking, outcomes, location). It
gives the counsellor material to explore with the student — it never picks a winner.

## Input shape

`Fact[]` for the student's stated priorities plus two or more `KnowledgeBase` records for the options
being compared.

## Output shape

One `Card` (see `CardSchema`): `{id, type: "compare", prompt, sources: CardSource[], confidence}`.
`compare` is a statement-type card — it may read as a statement of numbers, not a question.

## Soft rules

- Compare on facts the student has said they care about, not an arbitrary metric.
- Cite every figure on both sides of the comparison (contract B2) — an uncited number on either side
  gets the whole card dropped by the verifier, not just that figure.
- Present the numbers; let the counsellor and student draw the conclusion. Never close with a
  recommendation ("...so University B is the better choice" is a recital-style assertion).
- Keep it to two or three options — more than that stops being a card, it's a spreadsheet.
- A comparison with no citations on either side is not a compare card, it's a guess; drop it rather than
  publish it uncited.

## Examples

**Good:** "University A costs $20k a year with a QS rank of 45; University B costs $28k a year with a
QS rank of 30 (source: 2024 QS ranking, fee pages)." (cited numbers on both sides, no conclusion)

**Bad:** "University A is clearly the smarter pick given the cost difference." (asserts a conclusion
instead of presenting the comparison — reads as advice, not evidence)
