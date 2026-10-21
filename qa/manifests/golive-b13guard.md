# Manifest — golive-b13guard
**Contract:** qa/contracts/ (spec A20 go-live gate)
**Goal task:** none
**Date:** 2026-10-21
**Fix cycle:** 1 of max 2
**Dual check:** no — test-only diff, no security/prod-write product code changed
**Persona walk:** skip (test-only, no UI)
**Issues addressed:** ISS-golive-a20-1
**Executor:** claude-opus-main (one-line edit)

## What changed
- apps/api/tests/go-live-gate.test.ts:314-322,334 — c1: the real-gate student-routes refusal block and the default-target exit-1 assertion run only while the real B13 line is PENDING (c0 guarded only the b13 line; checker showed exit 0 with B13 signed). The voice refusal (A10), fixture ALLOWED and usage exit 2 stay unconditional.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Tier: L (protected test change: an assertion made conditional)
Round: 1 files, 1 criteria, est 10 min — c1 repair per verdict: guard the real-gate student-routes refusal block (:314-321) and the default-target run([]) assertion on REAL_B13_PENDING; fixture ALLOWED, voice A10 refusal and usage exit 2 stay unconditional
Base / checked state: 28dc4ff
Gate answers: none applicable (the B13 line itself is owned by Umesh/legal; this unit never edits qa/gates)
Affected tests / full-suite trigger: apps/api/tests/go-live-gate.test.ts; none
Tests[C1]: apps/api/tests/go-live-gate.test.ts — the only file holding the A20 CLI test and the REAL_B13_PENDING guard
Sibling: apps/api/tests/go-live-gate.test.ts:~180 — already guarded (golive-a20, verdict qa/verdicts/golive-a20.md)
Pre-check[C1]: b9963faa5a node --import tsx --test apps/api/tests/go-live-gate.test.ts -> exit 0 (14 pass, 0 skipped) t=3 blobs=apps/api/tests/go-live-gate.test.ts:3e2255e
Metrics: start=2026-10-21T17:15:55+05:30 end=2026-10-21T17:15:55+05:30 wall_min=2 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=0 cycle=1 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=0 mutants=0 defects_unit=0 defects_6c=0

## Acceptance
- [C1] With qa/gates B13 PENDING the A20 CLI test passes and still asserts B13 is named; with B13 changed to `SIGNED <ISO> by Umesh` (in a copy) the A20 CLI test still passes and still asserts exit 1 + REFUSED for student-routes.

## How to verify
- `node --import tsx --test apps/api/tests/go-live-gate.test.ts` (cwd apps/api) → exit 0
- In a throwaway copy, flip the B13 line to `SIGNED 2026-10-21T17:00:00+05:30 by Umesh` and rerun → exit 0 (the real-repo A20 test skips, the CLI test passes).

## Capability coverage
| Criterion | capability | check | falsifying edit | observed |
|---|---|---|---|---|
| C1 | CLI test survives a signed B13 | A20 CLI test | remove the `if (REAL_B13_PENDING)` guard, with B13 signed in a copy | to be shown by the checker in a copy (maker did not edit the real gate) |

## Live browser evidence
Not UI-touching — only apps/api/tests/go-live-gate.test.ts changed.

## Status: checked-PASS (qa/verdicts/golive-b13guard.md, f17eafe, cycle 1)
