# T-051 — classifier configuration loader hardening

Status: checked-PASS (verdict qa/verdicts/t-051-classifier-config.md, cycle 0)
Fix cycle: 0
Bound root: D:/vc
Approval: docs/plan.md loader-only approval from classifier_config_quality_plan (recorded c912705).

## Scope and goal mapping
Existing loadConcernClassifierConfig (packages/engine/src/guards/concern-classifier.ts:150) now rejects timeout values outside safe integer 1..2147483647 before callers can allocate overflowing timers. Invalid timeout/sample errors retain fixed field names and omit raw supplied keys/values, preserving student/privacy goals. Existing defaults, model overrides, partial strata and endpoint rates remain supported.
Only two existing product/test files changed. No direct injected-dependency guard, new source module/function, provider call, network, environment-file read, production write, contract/enforcement change or deployment.

## Frozen files (raw SHA256)
- packages/engine/src/guards/concern-classifier.ts: 757C876DEA64C702E76218968D75096B53E9A9887BD767A03CDFA8C8375058BD
- packages/engine/tests/concern-classifier.test.ts: 07B338A11B557ACB4DF6F069797DD2E84DA1286119063F4BCF468A815C1B4711

## Actual verification
Trusted serialized runtime: PATH includes C:/Program Files/Git/usr/bin and C:/Program Files/nodejs; C:/Program Files/Git/bin/bash.exe D:/vc/scripts/vc-testlock.sh node D:/vc/node_modules/tsx/dist/cli.mjs.

RED command suffix: --test --test-name-pattern 'config:' D:/vc/packages/engine/tests/concern-classifier.test.ts
Actual terminal exit 1; 5 tests, 3 pass, 2 fail, zero cancelled/skipped. Both reached intended assertions: oversized timeout failed to throw and synthetic raw input appeared in error. qa/evidence/classifier-loader-maker/red.log.

GREEN command suffix: --test D:/vc/packages/engine/tests/concern-classifier.test.ts
Actual terminal exit 0; 22 tests, 22 pass, 0 fail/cancelled/skipped. qa/evidence/classifier-loader-maker/green.log.
No live process/test handle remains. Installed runtime only; no install.

## Independent acceptance requested
Fresh checker independently covers defaults, valid model/timeout overrides, partial/endpoints sample rates, timeout boundaries/rejections (including unsafe integer and overflow), fixed field-name errors without synthetic supplied keys/values, and startup invalid config with counting connection factory proving zero connections. Full startup proof not maker-executed; API source untouched. Type checks and independent mutation controls remain checker-owned. Maker makes no PASS/completion claim.

## Closeout reconciliation — 2026-10-13
Saved independent bounded cycle0 PASS qa/verdicts/t-051-classifier-config.md. Current two rawSHA256 values match frozenmanifest exactly: source757C876DEA64C702E76218968D75096B53E9A9887BD767A03CDFA8C8375058BD, test07B338A11B557ACB4DF6F069797DD2E84DA1286119063F4BCF468A815C1B4711. Source0e267dc is ancestorofHEAD. No test execution/currentenvironment reuse inferred; releaseintegration remains pending.
Current full release remains FAIL under qa/verdicts/vc-release-t052-2026-10-13.md and .b.md; no push, deployment or additional acceptance claimed.
