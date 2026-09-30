# Manifest — t-035-safety-lifecycle

**Contract:** qa/contracts/counselling-engine.md (B15 lifecycle/access/erasure; B16 preserved guard/classifier behavior; B4/B9 consent and safety boundaries; B21 export description)
**Goal task:** T-035 lifecycle subunit; full T-035 remains in_progress
**Date:** 2026-09-30
**Fix cycle:** 0 of max 3
**Dual check:** no — no .goal/goal.json task binding; native thread goal remains active
**Issues addressed:** ISS-t-012-rev-1 lifecycle only. ISS-t-012-rev-2/API-recipient-delivery and ISS-t-012-rev-3/no-consent end-to-end remain outstanding.
**Plan approval:** docs/plan.md independent T-035 approval at line 366; authoritative rationale clarification at line 397. D-030 records delegated plan approval; plan approval is not completion verification.

## What changed

Nine existing files only, edited in place:
- packages/db/src/collections.ts — register escalation_notifications and crisis_flag_reviews.
- packages/db/scripts/db-init.ts — tenant-leading student/session indexes for both safety collections.
- packages/db/src/erasure.ts — direct student purge/read-back entries independent of sessions; typed projected escalation/review access arrays.
- packages/engine/src/guards/escalation.ts — bounded pre/write/finally-post fencing for initial reviews, notifications, classifier annotation and acknowledgement; late settlement compensation; atomic insert ownership and snapshot/CAS rollback; observable compensation failures.
- packages/db/tests/db-init.test.ts — index-plan behavior.
- packages/db/tests/db-scope.test.ts — existing scope scanner safety names and behavioral writer registration.
- packages/db/tests/erasure.test.ts — raw two-tenant identical-ID no-session-anchor purge/access outcome, empty/deterministic/projected arrays, failures and receipt counts.
- packages/engine/tests/crisis-escalation.test.ts — held writes, replay ownership, late settlement, newer mutations, fresh classifier fence, failure visibility, already-fenced dispatch and applied-write-then-reject outcomes.
- apps/api/src/openapi.ts — document safety access fields in existing export description.

## Scope and authoritative acceptance

This is a backend lifecycle subunit, not a claim of delivered crisis notifications, no-consent processing compliance, crisis recall >=0.95, real Mongo validation, live deployment or full counselling-goal completion. No production DB/provider/network access is authorized by this manifest. Only synthetic offline tests.

Conserved B15 behavior: existing confirmation/approval workflow and fence duration stay unchanged. Purge must leave zero raw safety documents for tenant A even without session anchors while tenant B with identical IDs remains byte-identical. Access export is tenant-scoped, deterministic and projected; exclude staff/provider/ownership metadata. Consented classifier rationale is untrusted personal data: a valid quotation survives access export and is fully erased. This does not permit rationale or any classifier call in the separate no-consent follow-up.

For all four mutations, precheck must prevent driver dispatch if already fenced, finally-postcheck must compensate this invocation if a fence lands, and a deadline must observe actual late settlement rather than treating Promise.race as cancellation. Atomic insertion tokens may delete only newly owned inserts; replay must preserve legitimate prior rows. Annotation/ack rollback must compare this invocation's token and restore its own snapshot only, without resurrection or overwriting newer changes. Public and late compensation failures must remain observable without raw input/provider messages. Classifier executes outside writer deadline, followed by a fresh fence check. Guard visibility, immediate crisis handling and severity floors remain intact.

## How to verify (commands + expected)

Use PowerShell login:false with the existing machine-wide test mutex; no dependency installation:

```powershell
$env:PATH='C:\Program Files\Git\usr\bin;C:\Program Files\nodejs;'+$env:PATH
& 'C:/Program Files/Git/bin/bash.exe' scripts/vc-testlock.sh node C:/Users/Lenovo/AppData/Roaming/npm/node_modules/pnpm/bin/pnpm.cjs --config.verifyDepsBeforeRun=false --filter @vc/db exec tsx --test tests/db-init.test.ts tests/db-scope.test.ts tests/erasure.test.ts
& 'C:/Program Files/Git/bin/bash.exe' scripts/vc-testlock.sh node C:/Users/Lenovo/AppData/Roaming/npm/node_modules/pnpm/bin/pnpm.cjs --config.verifyDepsBeforeRun=false --filter @vc/engine exec tsx --test tests/crisis-escalation.test.ts
& 'C:/Program Files/Git/bin/bash.exe' scripts/vc-testlock.sh node C:/Users/Lenovo/AppData/Roaming/npm/node_modules/pnpm/bin/pnpm.cjs --config.verifyDepsBeforeRun=false -r typecheck
python contracts/verify_contracts.py
git diff --check
```

Expected: DB and complete current crisis-escalation suites exit0 with no skipped tests; repository typecheck completes all nine project scripts exit0; validator exit0 (vacuous while frozen contracts empty, not substantive product proof); whitespace check exit0. pnpm typecheck compiles production/eval/scripts according existing tsconfigs, not all unit-test files; tsx executes tests without static test-file typechecking.

Checker must derive its own raw outcomes and test valid quoted rationale plus invalid classifier shapes/safety floors. Independently mutate isolated copies removing each safety purge entry, writer precheck and ownership qualification; every mutant must reach and fail its relevant runtime outcome assertion, not merely fail compilation. Never mutate the shared worktree. Inspect source/test coverage before crediting an outcome.

Post-integration full nine-script test run is separately required before closeout. Existing main baseline: 1237 total, 1191 pass, one concern-classifier load/timing failure, 45 skips (T-044 default run); do not erase this failure using targeted reruns or claim full-goal green. Any current default failure needs exact identity and evidence, not assumed baseline equivalence.

## Actual outputs (maker observations; checker must rerun independently)

- Measured baseline fake runtime exit0: export omitted safety arrays; approved erasure returned completed while one A notification and one A review remained; B documents byte-identical. Recorded docs/plan.md.
- Red index test exit1 and raw erasure test exit1 reached their intended failing assertions before repair.
- DB relevant run session20110: exit0; tests108/pass108/fail0/skipped0; duration21639.7446ms.
- Engine run session94304: exit0; tests28/pass28/fail0/skipped0; duration126274.2751ms. This predates the final two appended outcome tests and is not a full-current-file result.
- Already-fenced driver-dispatch targeted run session42561: exit0; tests1/pass1/fail0/skipped0; duration99653.2883ms.
- Repository typecheck session79404: terminal exit0; all nine scoped workspace projects Done, no errors.
- Applied-write-then-reject targeted run session8962: terminal exit0; tests1/pass1/fail0/skipped0; duration103497.4712ms. Final nine-file snapshot frozen; maker has no live sessions and test lock released.
- Contract validator session95559: exit0, PASS by vacuity (no frozen contracts).
- Root git diff --check: exit0 after checker-owned QUEUE EOF whitespace cleanup.

## Live browser evidence

Not UI-touching — no component, reference UI, browser route or interaction changed. Nine changed product paths are backend DB/engine code and tests plus existing OpenAPI export-description text. Live API privacy/export behavior and production delivery remain unverified by these fake-backed checks. Checker independently assesses whether any indirect changed UI surface requires Mode D; no browser PASS is claimed here.

## Status: ready-for-check
