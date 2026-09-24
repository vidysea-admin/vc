---
name: widen-card
description: Use when the student's option set looks narrow (one country, one course type, one budget tier) and the counsellor should be offered a genuine open question that broadens it — not a recommendation, not a fact statement.
---

## Purpose

Generate a single `Card` of `type: "widen"` (ExplorationPlanner, docs/plan.md §3 step 5) that opens up
the student's thinking beyond what they have already said — a different country, course format, campus
size, or budget tier they have not considered. It exists to counter narrowing/anchoring, not to push a
specific alternative.

## Input shape

`Fact[]` (see `FactSchema`, `packages/schemas/src/schemas.ts`) drawn from the current session plus
relevant `KnowledgeBase` records for adjacent options.

## Output shape

One `Card` (see `CardSchema`): `{id, type: "widen", prompt, sources: CardSource[], confidence}`.
`prompt` MUST be a genuine question ending in `?` — the no-script guard (`isScriptLike`, contract B1)
rejects a widen/clarify-type card that is a statement, with no fallback.

## Soft rules

- Ask, never assert — a widen card poses a question the counsellor can put to the student.
- One idea per card: don't stack three alternatives into one prompt.
- Ground the question in something the student already said (budget, interest, constraint) so it reads
  as follow-up, not a random suggestion.
- Cite every fact the question leans on (contract B2) — even a widen question referencing "your budget"
  needs the budget fact's source.
- At most 3 cards total are shown to the counsellor across all types (contract, docs/plan.md §3 step 7)
  — this skill does not decide the cap, `applyHardRules` does.
- Never phrase it as a recommendation dressed as a question ("Shouldn't you apply to X, right?" —
  that is a definitive assertion with a tag question, flagged as script-like).

## Examples

**Good:** "You mentioned a $20k budget for UK universities — have you looked at any options in Germany,
where public universities charge little or no tuition?" (cites the budget fact, genuine question)

**Bad:** "You should apply to a German university instead — it's much cheaper." (a recommendation
statement, not a question — flagged as script-like by the no-script guard)
