# Checkpoint: pc-partner-keys, coordinator A (cycle 0)

Bound root: D:/vc/.worktrees/pc-partner-keys (branch wave/pc-partner-keys, HEAD cfb70c312bb8507924d487ce62e6541c9da9f3da, base 3a70309f3528f78612b7fe94a32a3f2a52c2ea23).
Policy-Version: proportional-verification/2026-10-19.17. Tier L, dual check (coordinator A). Evidence dir: qa/evidence/pc-partner-keys-c0-check-A/.

## Evidence identity (applies to every row below unless stated)
- Code blobs at HEAD: partners.ts 28d95e4f, anonymous.ts 908105f3, chat.ts 71cc9f5a, index.ts 0f5b7a16, openapi.ts 03bcce0f, tests/partners.test.ts 468cead1, nginx-vc.conf c083e4b7.
- Dependency lock: pnpm-lock.yaml blob 2e4e31a3 (unchanged vs base). Runtime: node v24.13.1, pnpm 10.33.0, tsx 4.23.15, Windows 11; free RAM about 2.0 GB at run (C: not full, no OOM).
- Every run through `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm -C <dir>/apps/api exec tsx --test ...`, one file at a time. No full suite, no real Mongo, no live LLM.
- Attribution: this checker (coordinator A), agent id pck-check-A. Hostile/falsification tests ran in copies under scratchpad/pckA-* (node_modules junctioned to the worktree's); the bound tree was never edited.

## Completed checks
| id | command (scope) | result | log |
|---|---|---|---|
| c1 | tests/partners.test.ts (42 collected) | 42 pass / 0 fail | partners.log |
| c2 | tests/anonymous-route.test.ts -test-name-pattern "H2\|H6\|G5" | 9/0 | anon.log |
| c3 | tests/chat-profile.test.ts -test-name-pattern "H2\|LK7 C1-fix" | 6/0 | chatprofile.log |
| c4 | tests/chat-privacy.test.ts | 39/0 | chatprivacy.log |
| c5 | tsc --noEmit (apps/api) | exit 0, no output | tsc.log |
| c6 | tests/anonymous-zero-persistence.test.ts (I3, D-110, LK10 wording) | 36/0 | out4-anon-zero-persistence.log |
| c7 | tests/chat.test.ts (JWT chat path) | 34 pass / 1 fail (A20, pre-existing red, see c9) | out4-chat.log |
| c8 | student-openapi 10/0, main 10/0, index 8/0, packages/db db-scope 11/0 | all green | out4-*.log |
| c9 | A20 "flag on but gate closed" on a base-3a70309 copy | RED on base too (B13 was signed in 5424862/D-109, the test still expects pending); qa/gates and go-live-gate.ts have no diff base..HEAD | out4-base-A20.log |
| c10 | hostile-A.test.ts (checker-authored, 11 tests) in a pristine copy | 10 pass / 1 fail: H9 (concurrent rotate lost update, see verdict) | out4-hostile.log, out4-hostile-H9.log |
| c11 | green-before: partners.test.ts in pristine copy | 42/0 | out3-green-all.log |
| c12 | red-after K1 (rotate stores no new key), K2 (drop status check), K3 (tenant "shared-tenant"), K5 (drop nginx Upgrade header): the named K tests | red: 1, 2, 2, 1 failing | out3-red-K*.log, falsification-hunks.diff |
| c13 | red-after K4 (startsWith instead of includes): builder K4 tests | STILL GREEN 6/6 (survivor); checker H5 | red 1 | out3-red-K4.log, out3-red-K4-hostileH5.log |

## Not done / not needed
- Full suite: not run (policy .7/.13). Trigger recorded for 6c: auth (tier L security trigger) means 6c runs the full sharded suite (.13-2a) for this batch.
- Real Mongo duplicate-key 11000 and a real nginx load: not available here (fake Db and text assertions only), same as the builder.
