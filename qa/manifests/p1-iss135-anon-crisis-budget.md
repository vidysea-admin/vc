# Manifest — p1-iss135-anon-crisis-budget
**Contract:** none yet for this unit (checker-owned). Criteria come from the source brief `qa/evidence/p1-briefs/p1-iss135.md`, issue ISS-135 (`qa/issues.jsonl`), contract `qa/contracts/counselling-engine.md` B24.6 / B24.7, gate D-101. Parent unit: `p1-u7-anon-mode` (checked-PASS).
**Date:** 2026-10-19
**Fix cycle:** 0
**Dual check:** required
dual-trigger: security apps/api/src/anonymous.ts:405 (public unauthenticated route; the body-size gate in front of the pre-limiter crisis scan)
**Persona walk:** skip (API-only, no screen)
**Issues addressed:** ISS-135
**Executor:** claude-sonnet-subagent (maker/builder p1-iss135)

Status: ready-for-check

## Criteria
- **CAP** — the anonymous body cap is 64 KiB (`MAX_ANONYMOUS_BODY_BYTES`, was 256 KiB). A body over it is a 413 `body_too_large` that still carries the 14416 helpline, and is rejected BEFORE the crisis scan: a 100 KiB and a 300 KiB body that end with a crisis phrase get 413 (not an escalated 200), with zero model calls, zero KB calls and zero counter writes.
- **CRISIS** — B24.7 order is kept: a crisis message inside the cap (about 50 KiB) still escalates with the fixed message and 14416, including for a client that is already rate limited (crisis scan before the limiter).
- **REG** — no regression: the existing validation (400/413 with no echo), crisis (9 tests) and "U7 repair A" (helpline on every non-200) tests stay green. The OpenAPI 413 description now says 64 KiB.

## What changed
Code commit `6f025b6` on `p1/iss135` (base 8efd936). Edited in place, no new source file:
- `apps/api/src/anonymous.ts` (constant `MAX_ANONYMOUS_BODY_BYTES`, lines 62-68, and the header comment): 256 KiB -> 64 KiB. The two existing 413 checks (the `readBody(MAX_ANONYMOUS_BODY_BYTES)` catch and the byte-length check at line ~405) already use the constant, already answer through `fail()` (helpline) and already run before `crisisGuard`, so no handler logic changed.
- `apps/api/src/openapi.ts:613`: 413 description 256 -> 64 KiB.
- `apps/api/tests/anonymous-zero-persistence.test.ts`: the "near-limit body (about 190 KB)" test shrunk to about 48 KB (it is now under the cap); two new ISS-135 tests; no other test touched.
- Not changed on purpose: `apps/api/src/chat.ts:111` (the authenticated route has its own 256 KiB constant; ISS-135 is the anonymous route only).

## Verification scope
Policy-Version: proportional-verification/2026-10-19.16
Tier: L (public unauthenticated endpoint; crisis safety path)
Round: 3 files, 3 criteria, est 20 min — red test first, one-constant fix, 4 falsifications in a copy, the two anonymous API test files whole, repo typecheck
Base / checked state: base 8efd936, code 6f025b6, a manifest-and-evidence-only commit on top
Affected tests / full-suite trigger: `apps/api` anonymous test files only (`anonymous-zero-persistence.test.ts`, `anonymous-route.test.ts`); no `packages/*` file changed, so no engine/db suite and no full-suite trigger.
Tests[CAP]: apps/api/tests/anonymous-zero-persistence.test.ts ("ISS-135: the body cap is 64 KiB...") — constant is 64 KiB; 100 KiB and 300 KiB bodies with a trailing crisis phrase give 413 + helpline, no model, no KB, no counter write
Tests[CRISIS]: apps/api/tests/anonymous-zero-persistence.test.ts ("ISS-135: a crisis message within the cap...") — about 50 KiB crisis message escalates for a client already at 429
Tests[REG]: apps/api/tests/anonymous-zero-persistence.test.ts (filtered by "validation|crisis|U7 repair A") and apps/api/tests/anonymous-route.test.ts — existing behaviour unchanged
Pre-check[CAP]: 6f025b6 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern="ISS-135: the body cap" tests/anonymous-zero-persistence.test.ts -> pass 1 (0 failed) blobs=apps/api/tests/anonymous-zero-persistence.test.ts:553593671747e0b45d5072d2ea7234e25fefeddd,apps/api/src/anonymous.ts:5a84fbea9ed9a87490a3480cb57779da1d761c54
Pre-check[CRISIS]: 6f025b6 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern="ISS-135: a crisis message within the cap" tests/anonymous-zero-persistence.test.ts -> pass 1 (0 failed) blobs=apps/api/tests/anonymous-zero-persistence.test.ts:553593671747e0b45d5072d2ea7234e25fefeddd,apps/api/src/anonymous.ts:5a84fbea9ed9a87490a3480cb57779da1d761c54
Pre-check[REG]: 6f025b6 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern="validation|crisis|U7 repair A" tests/anonymous-zero-persistence.test.ts -> pass 11 (0 failed) blobs=apps/api/tests/anonymous-zero-persistence.test.ts:553593671747e0b45d5072d2ea7234e25fefeddd,apps/api/src/anonymous.ts:5a84fbea9ed9a87490a3480cb57779da1d761c54

## How to verify (commands + expected)
- Per criterion: the Pre-check lines above (cwd = worktree root); logs `qa/evidence/p1-iss135/precheck-<id>.txt`.
- Both anonymous API test files whole: `bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/anonymous-zero-persistence.test.ts tests/anonymous-route.test.ts` -> tests 45 pass 45 fail 0 (`qa/evidence/p1-iss135/green-both.txt`).
- `bash scripts/vc-testlock.sh pnpm -r typecheck` -> exit 0 (`qa/evidence/p1-iss135/typecheck.txt`).

## Actual outputs
- Red first (TDD): `qa/evidence/p1-iss135/red.txt` — the CAP test failed on the 256 KiB code (the 100 KiB crisis-at-end body was an escalated 200, not a 413); the CRISIS and near-cap tests were already green (they guard the order and the bounded scan and must stay green).
- Green: `green-both.txt` (45/45), the three Pre-check logs, `typecheck.txt`.

## Capability coverage (one falsification per criterion, in a COPY: detached worktree `.worktrees/p1-iss135-fals` at 6f025b6, never the bound tree)
Baseline in the copy: `base-green.txt` (ISS-135 tests pass 2 fail 0). Restored after each mutant (`git checkout`): `restored-green.txt` pass 2 fail 0.
| Criterion | mutation (apps/api/src/anonymous.ts) | after (red) | log |
|---|---|---|---|
| CAP | constant back to 256 KiB | 1 fail of 2 | fals-M1-cap-256.txt |
| CAP helpline | 413 byte-length branch answers `respond(413, {error})` with no helpline | 1 fail of 2 | fals-M2-413-no-helpline.txt |
| CRISIS order | `if (crisisGuard(text).level === "none")` -> `if (true)` (limiter before crisis) | 1 fail of 2 | fals-M3-limiter-before-crisis.txt |
| CRISIS in-cap | constant cut to 16 KiB (a 50 KiB crisis message refused) | 2 fail of 2 | fals-M4-cap-16k.txt |

REG is covered by the existing tests, unchanged except the one shrunk test; no separate mutant (floor: the four mutants above are caught by the same files).

## Not done / stated limits
- The CPU claim is by construction (a 4x smaller maximum scan input), not a new timing benchmark; scan time at 64 KiB was not re-measured. The 40-210 ms figure in ISS-135 is for 256 KiB.
- Still unlimited per client: crisis requests up to 64 KiB are scanned before the limiter by contract B24.7. The cap bounds that cost, it does not remove it. A per-client crisis budget was NOT added (it would change B24.7; Umesh's call).
- Per-process in-memory limiter and a proxy-supplied `clientKey` are unchanged U7 limits.
- No senior-software-engineer review dispatched by this builder (the orchestrator owns it). `qa/contracts/` untouched. Mock provider and fake Mongo only; no network.

## Live browser evidence
Not UI-touching: no `apps/web` file changed.

Metrics: start=2026-10-19T11:55+05:30 end=2026-10-19T12:10+05:30 wall_min=unavailable agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=4 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.16 check_s=unavailable mutants=4 defects_unit=0 defects_6c=0
