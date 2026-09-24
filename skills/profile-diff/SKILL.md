---
name: profile-diff
description: Use when ProfileSynthesizer needs to propose the set of Student Knowledge Graph changes from a session, for the counsellor to review and approve (or edit) before anything is written.
---

## Purpose

Produce the `changes: FactChange[]` half of `ProfileDiff` (docs/plan.md §3 step 8) — the proposed adds,
updates and removes to the Student Knowledge Graph from this session. Nothing here is written to the
graph directly; contract B3 requires a counsellor `interrupt()` approval first (docs/plan.md §3 step 9).

## Input shape

The session's newly extracted `Fact[]` plus the student's existing profile facts (to detect
updates/contradictions, not just additions).

## Output shape

`FactChange[]` (see `FactChangeSchema`): `{op: "add"|"update"|"remove", key, before?, after?}[]`, plus
`citedFactIds: string[]` on the parent `ProfileDiff` so every change traces back to a sourced fact.

## Soft rules

- Propose, never commit — this skill's output is a draft for `CounsellorDecision` (contract B3); it must
  never be treated as already applied.
- Flag contradictions explicitly as `update` ops with both `before` and `after`, not as a silent
  overwrite — the counsellor needs to see what changed and why.
- Every proposed change must be backed by a fact with a real source; a change with no corresponding
  entry in `citedFactIds` should not be proposed.
- Prefer fewer, higher-confidence changes over padding the diff with speculative updates.
- `remove` ops need the same evidentiary bar as `add` — don't drop a fact just because it wasn't
  mentioned again this session; only remove it if the student explicitly contradicted it.

## Examples

**Good:** `{op: "update", key: "budget_usd", before: 15000, after: 20000}` with `citedFactIds`
including the new fact's id — the student explicitly revised their budget this session, cited.

**Bad:** Silently changing `target_country` from "UK" to "Canada" with no `before` field and no
corresponding cited fact — looks like a fabricated or inferred change, not something the student said.
