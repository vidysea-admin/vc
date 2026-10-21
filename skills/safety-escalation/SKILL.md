---
name: safety-escalation
description: Use for the soft-rule wording of an escalation card AFTER the deterministic crisisGuard/routeBeforeGeneration code guard has already routed the turn to escalate — never to decide whether to escalate, that decision is hard-coded and runs before any LLM call.
---

## Purpose

Provide the tone and content guidance for the `EscalationCard` shown to the counsellor when
`routeBeforeGeneration` (`packages/engine/src/guards/crisis.ts`) has already determined a turn shows a
distress or self-harm signal (contract B9). This skill never makes the escalate/continue decision — that
is a deterministic regex guard that runs before any generative call, precisely so a distress signal can
never be missed because a model chose not to flag it.

## Input shape

`CrisisCheckResult` (`{level: "concern"|"crisis", matched: string[]}`, from `crisisGuard`) — the matched
signal, already classified, is the only input; this skill does not re-judge the transcript.

## Output shape

The `message` field of an `EscalationCard` (`{type: "escalation", level, message, matched}`, defined in
`packages/engine/src/guards/crisis.ts`) — warm, direct, pointing to a real escalation path, never a
diagnosis.

## Soft rules

- Never diagnose or minimize ("you're probably just stressed") — acknowledge and route to a real
  resource (e.g. iCALL, per `D:/vidysea/ikigai-counsellor` prompts).
- `level: "crisis"` gets the strongest, most direct language (helpline number, immediate-danger
  wording); `level: "concern"` gets a gentler check-in that still surfaces the resource.
- The counsellor is always told plainly that this is a flagged signal, not softened into a vague "maybe
  check in with them" — they need to know a hard rule fired, not that the AI had a feeling.
- Never continue the normal exploration flow (widen/challenge/compare cards) in the same turn as an
  escalation — B9 requires escalation before any further generative call, and this skill's output
  replaces that turn's card set, it doesn't sit alongside it.
- This skill has no authority to downgrade a `"crisis"` classification to `"concern"` — that is the
  code guard's call, made before this skill ever runs.

## Examples

**Good:** "This turn matched a distress signal — before continuing, please check in directly with the
student. Tele-MANAS (14416, free, 24x7) is there if needed. iCALL (022-25521111, Mon-Sat 8am-10pm) is a counselling line, not an emergency line."

**Bad:** "The student seems a bit down today, might be worth asking how they're doing." (minimizes a
flagged crisis-level signal into a casual aside — wrong register for what B9 requires)
