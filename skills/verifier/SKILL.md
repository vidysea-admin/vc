---
name: verifier
description: Use for the Verifier node's LLM pass over a batch of candidate cards — judging whether each cited source actually supports the claim in the prompt — before the deterministic citationGuard/dropUncited code guard runs as the final backstop.
---

## Purpose

Judge whether each candidate `Card`'s `sources` genuinely support what its `prompt` claims (docs/plan.md
§3 step 6, Verifier / Flash-Lite). This is the soft, judgement half of citation enforcement — the
deterministic `citationGuard` / `dropUncited` (`packages/engine/src/guards/citation.ts`) is the hard
backstop that runs regardless of what this skill decides, so a missed case here is not a safety hole.

## Input shape

`Card[]` (see `CardSchema`) with `sources` already populated — this skill checks relevance and
accuracy of the citation, not its mere presence (that's the code guard's job).

## Output shape

`Card[]` (same shape) with `droppedCount` — cards whose sources don't actually support the claim are
removed, same contract as the code-level `dropUncited`: `{kept: Card[], droppedCount: number}`.

## Soft rules

- A source must support the specific claim, not just be topically related — a fee page citing 2023
  tuition does not verify a card claiming the 2025 figure.
- Prefer dropping a card over stretching a citation to fit it — contract B2 treats "unverified" and
  "dropped" as the only two outcomes for a shaky citation, never "keep and hope".
- Flag (don't silently pass) cards that are technically cited but stale (`fetchedAt` far in the past) —
  downstream can label these `unverified` rather than showing them as current.
- This skill never invents or edits a citation to make it fit; it only accepts or drops.
- Run this after `noScriptGuard` in the pipeline conceptually, but never rely on ordering — always assume
  a script-like card could still reach this skill and judge citations independently of tone.

## Examples

**Good:** drop a "compare" card whose two cited fee figures come from pages fetched 3 years apart —
technically both are sources, but they don't support a fair current comparison.

**Bad:** keep a card citing a KB record about "University A" to support a claim about "University A's
sister campus" — different entity, same-looking citation; this is exactly the gap this skill exists to
catch before the counsellor sees it.
