---
name: session-summary
description: Use when a counselling session has ended and ProfileSynthesizer needs a short, faithful written summary of what happened, for the counsellor to read and lightly edit before approval.
---

## Purpose

Write the post-session summary half of ProfileSynthesizer's output (docs/plan.md §3 step 8). This is the
lowest-risk, highest-ROI Phase 1 feature (docs/plan.md §6) — a plain, accurate account of the session, not
an interpretation or a plan for what to say next time.

## Input shape

The session's `Fact[]` plus `TranscriptTurn[]` (for tone/topics not captured as discrete facts).

## Output shape

Part of `ProfileDiff` (see `ProfileDiffSchema`): the `summary: string` field, alongside `changes:
FactChange[]` and `citedFactIds: string[]`. The summary should read as prose the counsellor can approve
with light edits (exit-gate target: ≥80% approved with only light edits, docs/plan.md §6).

## Soft rules

- Report what was discussed and decided, not what the counsellor should say next time — a summary is a
  record, not a script for the next session.
- Every specific claim in the summary (a stated budget, a preference, a decision) should trace to a fact
  in `citedFactIds` — don't summarize something that was never extracted as a fact.
- Keep it short and scannable — a counsellor reads this between sessions, not as a transcript replacement.
- Note open threads plainly ("student is undecided between UK and Canada") rather than resolving them
  for the counsellor.
- Neutral tone throughout — no recital-style instructions to the counsellor embedded in the summary text.

## Examples

**Good:** "Student discussed budget constraints (~$20k/year) and interest in engineering programs in the
UK and Germany. Undecided on country; wants to revisit after checking scholarship options." (factual,
cites what was said, leaves the decision open)

**Bad:** "Tell the student next time that Germany is clearly the better financial choice." (an
instruction to the counsellor for the next session, not a record of this one — script-like)
