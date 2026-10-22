# pc-reserved-ids evidence identity (checker A, cycle 0)
Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
Result: PASS; qa/verdicts/pc-reserved-ids.A.md
Candidate: code 11234e1, manifest e2469e7 (worktree D:/vc/.worktrees/pc-reserved-ids)
Commands (apps/api, via VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test ...): tests/partners.test.ts 55/0; tests/partner-voice.test.ts 32/0; tests/partner-openapi.test.ts 15/0; tests/auth.test.ts 15/0; tests/server.test.ts 34/0; tests/index.test.ts 8/0; tests/chat.test.ts 34 pass 1 fail (A20 baseline only); --test-name-pattern="H2|H6|G5|K2|K4" tests/anonymous-route.test.ts 9/0; pnpm exec tsc --noEmit exit 0.
Hostile test: scratchpad hostile-A.test.mts (5 tests, 5 pass) importing the worktree by absolute path; falsification copy under scratchpad fal/ (junctioned node_modules), 4 mutations red, restored identical.
No full suite, no real Mongo, no network.
