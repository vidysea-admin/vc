# T-052 — independent completion check, cycle 0

Date: 2026-10-01
Bound root: D:/vc
Cycle checked: 0

VERDICT: FAIL
SCOREBOARD: B23.6 failed; B23.1–B23.5/B23.7 independently comprehensive acceptance incomplete after confirmed-defect stop. Required regression commands passed, but do not substitute for independent full outcome acceptance.
FAILURES:
- [B23.6] sev: high · Actual student export discloses internal recovery lease ownership token via raw approvalClaims · Project public claim content and omit internal lease authority before serialization · issue: ISS-119
LIVE-BROWSER: SKIP (confirmed source defect; checker stopped before Mode D as dispatched)
ISSUES-WRITTEN: ISS-119

## Independently reached evidence

Read checker skill, ARCHITECTURE.md, goal.md, adapter, full counselling contract including B23 and globals, D032–D038, ready Fix cycle 0 manifest and current source diff. Root AGENTS.md absent; user-level instructions supplied in dispatch context apply. Maker narration, screenshots and outputs were not used as acceptance evidence.

Commands ran serially using trusted installed Node and `C:/Program Files/Git/bin/bash.exe -l D:/vc/scripts/vc-testlock.sh`; PATH prepended Git usr/bin and Node. Full commands and output are in checker logs.

- Enumerated `(Get-ChildItem packages/db/tests/*.test.ts).FullName` and passed exact paths to `node D:/vc/node_modules/tsx/dist/cli.mjs --test`: terminal 15d23d exit 0, 263 tests / 263 pass / 0 fail / 0 skip. `qa/evidence/t052-checker/db.log`.
- Enumerated `(Get-ChildItem apps/api/tests/*.test.ts).FullName`, same runner: terminal 44be9e exit 0, 52 tests / 52 pass / 0 fail / 0 skip. `qa/evidence/t052-checker/api.log`.
- Enumerated `(Get-ChildItem packages/engine/tests/*.test.ts).FullName`, same runner: exec handle 59567 actually polled to terminal 81de2f exit 0, 810 tests / 765 pass / 0 fail / 45 existing skips. `qa/evidence/t052-checker/engine.log`.
- Independently authored `qa/evidence/t052-checker/export-oracle.ts`, direct actual `exportStudent` with an offline database and synthetic claim carrying the internal private lease. Ran `node D:/vc/node_modules/tsx/dist/cli.mjs qa/evidence/t052-checker/export-oracle.ts` through same lock. Terminal 5f04f1 exit 1: public decision preserved; `privateLeaseLeaked:true`; strict B23.6 assertion actual true, expected false. `qa/evidence/t052-checker/export-oracle.log`.

`packages/db/src/erasure.ts:1908` returns `scribe_resolutions` collection rows directly without projection. `packages/db/src/collections.ts:199` defines `lease.token` as run lease; current graph authority checks this exact token. It is internal ownership authority, and the contract requires all such authority hidden at every nesting level. A real in-flight/recovering approval naturally contains that lease; the direct test proves the actual exporter leaks it, without relying on hand-written serialization or fixture labels.

After root notification, stopped further test/mutation activity according to dispatch's confirmed-source-defect instruction. No live checker exec handles remain. No product file was edited; independently hashed all 17 frozen manifest files: 17/17 match, evidence `qa/evidence/t052-checker/product-hashes.json`.

## Unreached required acceptance

11 configurations, fresh independent signed-JWT lifecycle/readback adversarial matrix, independent graph/saver late-driver/recreated-winner controls, semantic mutants with actual copied-module resolution, indirect reference UI/approval/Retry Mode D and scenario matrix were not completed in this cycle. Existing full suite success does not fill these gaps. Repair must be checked in a new matching manifest cycle; plan approval is not completion PASS.

Scope remains an offline prerequisite. No full counselling/feedback/personalization/voice, external model, live Mongo/index promotion or actual Pathlynks grant-writer completion is certified. No production connection, paid call, source mutation, install or deployment occurred.
