# Verdict — t-002b-schema-hardening

**Cycle checked: 1**
**Date:** 2026-09-25
**Checker:** fresh Claude Sonnet subagent (no builder context), bound to
`D:\vc\.worktrees\t-002b-schema-hardening` (branch `wave/t-002b-schema-hardening`)

## What I re-ran myself

- `pnpm install` — exit 0, lockfile unchanged.
- `pnpm -r typecheck` — exit 0, all 7 workspace packages "Done".
- `pnpm -r test` — run TWICE as the manifest's disclosed anomaly asked: **exit 0 both times**,
  every package `fail 0` both times (schemas 45/45, engine 2/2, 5×1 stubs). Could not reproduce
  the manifest's disclosed one-off `test exit=1`; treating it as a flake the maker already
  disclosed, not hidden.
- `python contracts/verify_contracts.py` — exit 0, "PASS by vacuity".
- `git diff --stat 4290c6d a180142` (unit build scope) — 16 files (incl. untracked
  `fact-source.test.ts` and the manifest), additions/edits only, matches manifest exactly. No
  deletion/rename of any existing function/export/test.
- `git diff 044b4f6 8421c1a` (cycle-1 fix scope) — **exactly** `packages/schemas/src/guards.ts`,
  `packages/schemas/tests/guards.test.ts`, and the manifest. Nothing else touched — matches the
  dispatch's stated scope.

## Cycle-0 FAIL re-verified fixed

Cycle 0 FAILed on `ISS-t-002b-schema-hardening-1`: case-sensitive, position-anchored recital cues
missed lowercase/mid-sentence "tell the student" and plain-imperative "Say the X is Y." forms for
statement-type cards. I re-ran the exact recorded repro strings directly against the **worktree's
own** `guards.ts` (read-only `tsx` execution, no edit):

```
isScriptLike("Say the international office deadline is March 1.", "evidence")        -> true  (was false)
isScriptLike("You must tell the student their application is rejected.", "evidence") -> true  (was false)
```

Both now correct. ISS-008's reviewer strings and the definitive-tag-question case still classify
correctly (unchanged from cycle 0).

## Capability coverage — cycle-1 rows (2/2) + cycle-0 spot-check (2/2), all independently reproduced

Own throwaway copy (`scratchpad/checker-copy-c1`, tar from worktree excluding `.git`/
`node_modules`, `pnpm install`), never the worktree. GREEN-before confirmed for every row before
each edit, edit applied as a single hunk exactly as the manifest/prior verdict described, RED
confirmed, then reverted and diffed clean against the worktree before the next row.

- **Cycle-1 row 1** (drop `i` flag on the `tell(...)`/`you (should|must...)` regexes): before
  `# pass 14 # fail 0`; after `not ok 3`, `not ok 11`, `not ok 12`, `# pass 11 # fail 3` — exactly
  matches the manifest's claimed row.
- **Cycle-1 row 2** (delete the leading `/^say\b/i` cue): before `# pass 14 # fail 0`; after
  `not ok 13` only, `# pass 13 # fail 1` — exactly matches.
- **Cycle-0 spot-check, ISS-011** (remove `Card.id`): before `card.test.ts` 11/11 green; after
  exactly `not ok 4`, `not ok 5` (the two ISS-011 tests), `# pass 9 # fail 2` — matches prior
  verdict.
- **Cycle-0 spot-check, ISS-007** (remove `exports`+`types` from `packages/schemas/package.json`):
  before `engine/tests/index.test.ts` 2/2 green; after `ERR_MODULE_NOT_FOUND` at tsx's resolver,
  `not ok 1`, `# pass 0 # fail 1` — matches prior verdict, import-resolution failure specifically,
  not an unrelated crash.

No regression found in either cycle-0 row spot-checked.

## New finding — a DIFFERENT B1 false-negative gap, not the one that was fixed

The dispatch asked for fresh hostile probes beyond the reviewer's 3 strings and cycle-0's
recorded repro strings. Run directly against the worktree's own `guards.ts` (read-only, no edit):

```
isScriptLike("Let the student know LSE is better.", "evidence")                        -> false
isScriptLike("Inform them the deadline passed.", "evidence")                           -> false
isScriptLike("Explain to the student that the scholarship covers half the fees.", "evidence") -> false
isScriptLike("Alumni say the campus is safe (2024 survey).", "evidence")               -> false (control, correct — not a script)
```

**Reasoning on FAIL-worthiness (per dispatch instruction to decide and state it):** these three
use verbs ("let ... know", bare "inform", "explain to ... that") that were **never** in any
version of `RECITAL_CUES`, in any cycle. This is not a regression of the case-sensitivity/
position bug cycle-0 FAILed on and cycle-1 fixed — that specific defect is verified fixed above,
with tests. This is a different, pre-existing gap in a documented heuristic (`guards.ts`'s own
comment: "a real classifier can replace this later") — the guard is a fixed cue list, and B1's
contract text requires "a code guard enforces this and a test covers it," not exhaustive recall of
every English synonym for "tell." Treating every new synonym found by hostile probing as unit-
blocking would make this specific unit's FAIL condition unbounded (whack-a-mole), and cycle-1's
fix is not what introduced this gap. I am filing it as `ISS-t-002b-schema-hardening-2` (open,
medium — one severity step below the original because it's incremental heuristic debt, not a
defect in what this unit shipped) rather than failing cycle 1 on it. B1 is judged **met** for this
unit's own claims and fixes; the new gap is tracked, not blocking.

## Criteria judged (per dispatch: B1, B2, B4, B5, B8)

- **B1 (no-script): met.** Cycle-0's FAIL is verifiably fixed (recorded repro strings + both
  capability rows reproduced). ISS-008's reviewer strings still correct. New gap found by fresh
  probing is a different, non-regressing heuristic-coverage issue — filed as follow-up
  `ISS-t-002b-schema-hardening-2`, not blocking (reasoning above).
- **B2 (cited facts): met, unchanged.** `schemas.ts` untouched by cycle 1 (confirmed via diff
  scope); `fact-source.test.ts` (12/12) still passes in the full suite run.
- **B4 (consent first): met, unchanged.** `consent.test.ts` rows still green in the full suite;
  no code in this cycle touched consent/purposeTags.
- **B5 (typed boundaries): met, unchanged.** No schema shape changed this cycle; only the guard
  function's internals (regex vs substring) and its tests changed.
- **B8 (data boundary): met.** All tests remain offline unit tests over pure functions/Zod
  schemas — no Mongo, no network. `data_class: synthetic` holds.

## Issues ledger

Flipped `open → fixed`: `ISS-t-002b-schema-hardening-1` (verified via direct re-probe + both
cycle-1 capability rows). New: `ISS-t-002b-schema-hardening-2` (open, medium, contract-B1,
follow-up, not blocking).

## Live browser

Not applicable. Confirmed from both diff scopes: cycle-1 touched only
`packages/schemas/src/guards.ts`, `packages/schemas/tests/guards.test.ts`, and the manifest — no
`apps/web` or browser-reachable surface.

---

```
VERDICT: PASS
SCOREBOARD: 5/5 criteria met, 0/0 invariants hold (contract has no [I*] items)
CAPABILITY-COVERAGE: 4/4 rows reproduced (2 cycle-1 + 2 cycle-0 spot-check)
LIVE-BROWSER: not-applicable (changed paths: packages/schemas/src/guards.ts, packages/schemas/tests/guards.test.ts)
ISSUES-WRITTEN: ISS-t-002b-schema-hardening-1 (fixed); ISS-t-002b-schema-hardening-2 (new, open, medium, follow-up)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: Cycle-0's FAIL (isScriptLike case-sensitivity/position false negatives) is verifiably
fixed — I re-ran the exact recorded repro strings directly against the worktree's own guards.ts
and both now correctly flag as script-like, and both cycle-1 capability-coverage rows reproduce
exactly as the manifest claims in my own throwaway copy. Two cycle-0 rows (ISS-007, ISS-011)
spot-checked with no regression. Full verify suite green twice (the manifest's disclosed flaky
test-exit anomaly did not reproduce). Diff scope for this fix cycle is exactly the three files
disclosed, nothing else touched. Fresh hostile probing found a further B1 gap on different recital
verbs ("let...know", "inform", "explain to...that") never covered by any prior cycle — judged as
non-blocking follow-up debt (ISS-t-002b-schema-hardening-2, medium) rather than a cycle-1 FAIL,
since it is not a regression of what this cycle fixed and the contract's B1 text requires a guard
+ test, not exhaustive synonym recall.
```
