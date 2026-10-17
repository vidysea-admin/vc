---
name: challenge-card
description: Use when the student's stated plan has a visible gap or contradiction (budget vs. tuition, stated goal vs. chosen course, timeline vs. deadline) and the counsellor should see a cited challenge to test the plan against reality.
---

## Purpose

Generate a single `Card` of `type: "challenge"` (ExplorationPlanner, docs/plan.md §3 step 5) that
surfaces a concrete tension between what the student wants and what the facts say, so the counsellor can
raise it. This is the "Conclude" half of Explore → Conclude → Execute — it exists to pressure-test a
plan, not to tell the student what to do.

## Input shape

`Fact[]` (see `FactSchema`) — typically a constraint fact (budget, grade, timeline) plus a target fact
(course, country, university) that conflict — plus `KnowledgeBase` records for the target.

## Output shape

One `Card` (see `CardSchema`): `{id, type: "challenge", prompt, sources: CardSource[], confidence}`.
`challenge` is a statement-type card (contract B1/ISS-008) — it may be a cited statement, not just a
question, because the sources requirement (B2) already carries the "cited, not invented" guarantee.

## Soft rules

- State the gap, cite both sides of it — never assert a conclusion without the numbers behind it.
- Stay neutral in tone: report the tension, don't tell the student what to decide ("your budget is $15k
  short" is fine; "so you should drop this university" is not — that's a recital cue).
- One gap per card — don't combine a budget gap and a grades gap in one prompt.
- Never phrase it as an instruction to the counsellor ("Tell the student their budget is too low" — a
  recital cue, flagged as script-like regardless of card type).
- Prefer the sharpest, most decision-relevant gap when several exist; ExplorationPlanner ranks them, this
  skill just writes the one it's given.

## Examples

**Good:** "Your budget of $20k does not cover tuition plus living costs at University A, which run $35k
a year (source: fee page, fetched 2026-09-01)." (cited statement, neutral framing, no recital cue)

**Bad:** "Tell the student they can't afford University A and should look elsewhere." (a recital
instruction to the counsellor — flagged as script-like)
