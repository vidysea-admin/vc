# Manifest - golive-a20
**Contract:** spec A20 (go-live gate) ; 6c red on d436e90 (apps/api/tests/go-live-gate.test.ts:61)
**Fix cycle:** 0 of max 2
**Dual check:** no (test-only protected change; no security product code touched)
Policy-Version: proportional-verification/2026-10-19.17
Tier: L (protected test change: the real-repo assertion goes from failures>=2 to "B13-signed is among failures", plus a skip when the real B13 line is no longer PENDING)
Round: 1 file, 1 criterion, est 10 min - one test edit, one checker
Base / checked state: fac81b6 -> 15e55ec
## What changed
- apps/api/tests/go-live-gate.test.ts: the real-repo A20 test now reads the real B13-signed line. While it is PENDING, every target must be refused AND B13-signed must be named. When B13 is signed, the test skips (D-103: the legal team owns that line; the fixture tests still cover the signed paths).
## Why
6c on d436e90 was red. g-publish was answered on 2026-10-21 (1d490e0), so only B13 is unmet, and the old ">=2 failures" premise ("gates unanswered") went stale. This is not a product regression.
Tests[C1]: apps/api/tests/go-live-gate.test.ts - the only test touched; the fixture tests in the same file cover the evaluator itself
Pre-check[C1]: 15e55ec pnpm -C apps/api exec tsx --test tests/go-live-gate.test.ts -> exit 0 (14 pass, 0 skipped)
Metrics: start=2026-10-21T16:30:00+05:30 end=2026-10-21T16:36:00+05:30 wall_min=6 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=0 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=0 mutants=0 defects_unit=0 defects_6c=0
## Live browser evidence
Not UI-touching - only a test file changed.
**Status:** ready-for-check
