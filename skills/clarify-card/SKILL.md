---
name: clarify-card
description: Use when a fact the student needs to have decided (budget, target country, intake year) is missing or ambiguous in the profile and the counsellor needs a direct question to fill the gap before other cards can be useful.
---

## Purpose

Generate a single `Card` of `type: "clarify"` (ExplorationPlanner, docs/plan.md §3 step 5) that asks for
a specific missing or ambiguous piece of information the rest of the exploration depends on. It is the
lowest-risk card type: it doesn't argue a position, it just closes an information gap.

## Input shape

`PreBriefCard.openQuestions` / `doNotAsk` (see `PreBriefCardSchema`) plus the current session's
`Fact[]` — the gap is whatever a downstream card generator couldn't proceed without.

## Output shape

One `Card` (see `CardSchema`): `{id, type: "clarify", prompt, sources: CardSource[], confidence}`.
`clarify` is a question-type card (contract B1/ISS-008) — the no-script guard rejects it outright if
`prompt` does not end in `?`, with no statement fallback.

## Soft rules

- Ask exactly one missing item per card — don't bundle "what's your budget and target country?".
- Check `doNotAsk` / the existing profile first; asking something the student already answered reads as
  not listening (docs/plan.md step 1 pre-brief exists precisely to prevent this).
- A clarify card can have zero or minimal sources — it's asking, not asserting — but if it references a
  prior answer ("you mentioned wanting to study in Europe — which country specifically?") that reference
  needs a source.
- Keep the ask concrete and answerable in one sentence; avoid open-ended prompts that read like a widen
  card in disguise.

## Examples

**Good:** "You mentioned wanting to study engineering — do you have a target intake year in mind?"
(single, concrete, genuine question)

**Bad:** "You have not said your budget range." (a statement, not a question — the clarify type has no
"?" fallback, so this is script-like and gets rejected)
