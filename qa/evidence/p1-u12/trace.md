# P1 U12 traceability matrix (spec v8 sha e183ee9a, plan row U12, D-097 item 2)

Computed from the spec table `qa/evidence/p1-plan-draft-20261017/spec.md` lines 29-58, not from memory. Base = `1c9fafb` (origin/main + U10w head) plus this unit's two new test files.
`apps/api/tests/acceptance-trace.test.ts` parses the table below and FAILS if a row names a test file or a `pnpm --filter` script that does not exist, or if a criterion is missing.
Columns: ID | Class | Command (spec, with the file it names where that differs) | Test files (exist on base) | Status | Note.
Status words: `PASS` (executed green at the sha in the run table), `NOT PROVEN` (cannot be proven on mock data), `PENDING-INTEGRATION` (proof exists on a checker-PASSed branch that is not in this base), `OUT-OF-SCOPE-REAL` (REAL criterion, U13b under G-REAL).

| ID | Class | Command | Test files | Status | Note |
|---|---|---|---|---|---|
| A1 | MOCK | `pnpm --filter @vc/engine test` | `packages/engine/tests/claims-guard.test.ts`, `packages/engine/tests/student-graph.test.ts` | PASS | REAL half on h2h is A14 (U13b) |
| A2a | MOCK | `pnpm --filter @vc/engine eval:kb` | `packages/engine/evals/kb-eval.test.ts` | NOT PROVEN | D-097 item 2: U3 golden set and recorded KB fixture pending (KB keys, Sapna ma'am's rubric). `eval:kb` on the synthetic sample prints NOT PROVEN by design (run output in `eval-kb.txt`). |
| A2b | REAL | `pnpm --filter @vc/engine eval:kb` | | OUT-OF-SCOPE-REAL | U13b under G-REAL |
| A3 | MOCK | `pnpm --filter @vc/engine test` | `packages/engine/tests/no-quote.test.ts` | PASS | secondary REAL half is U13b |
| A4 | MOCK + REAL | `pnpm --filter @vc/engine test` | `packages/engine/tests/student-graph.test.ts`, `mcp/university-kb/tests/kb-tools.test.ts` | PASS | MOCK half only; the 30 real-model probes (`evals/run-probes.ts`) are U13b |
| A5 | MOCK | `pnpm --filter @vc/api test` | `apps/api/tests/student-openapi.test.ts`, `apps/api/tests/server.test.ts`, `apps/api/tests/acceptance-student-journey.test.ts` | PASS | Draft contract + schema parity + real response parsed by the published Zod schema. NOTE: the SERVED `/v1/openapi.json` does not list the student routes; U5a keeps them in a separate draft until the A20 gate passes (plan DoD "OpenAPI published only when A20 passes"). Literal reading of A5 is therefore met only for the draft. |
| A6 | MOCK | `pnpm --filter @vc/api test` | `apps/api/tests/student-auth.test.ts`, `apps/api/tests/chat.test.ts`, `apps/api/tests/chat-privacy.test.ts`, `apps/api/tests/acceptance-student-journey.test.ts`, `packages/db/tests/tenant.test.ts`, `packages/db/tests/db-scope.test.ts` | PASS | |
| A7 | MOCK | `pnpm --filter @vc/db test` | `packages/db/tests/erasure.test.ts`, `packages/db/tests/student-store.test.ts`, `apps/api/tests/chat-privacy.test.ts`, `apps/api/tests/voice-history.test.ts`, `apps/api/tests/acceptance-student-journey.test.ts` | PASS | Gap counts are exempt from erasure with a stated reason (no student, thread or text in the row), not "read back zero". |
| A8 | REAL | `pnpm --filter @vc/engine eval:latency` | | OUT-OF-SCOPE-REAL | U13b under G-REAL |
| A9 | MOCK | `pnpm --filter @vc/api test` | `apps/api/tests/voice.test.ts`, `apps/api/tests/voice-wiring.test.ts`, `apps/api/tests/voice-limits.test.ts`, `apps/api/tests/voice-crisis-turn.test.ts`, `packages/providers/tests/live.test.ts` | PASS | |
| A9b | MOCK | `pnpm --filter @vc/api test` | `apps/api/tests/voice-audit.test.ts`, `packages/providers/tests/live.test.ts` | PASS | |
| A10 | REAL | `pnpm --filter @vc/engine eval:live` | | OUT-OF-SCOPE-REAL | U13b under G-REAL; voice stays disabled until it passes |
| A11 | MOCK | `pnpm --filter @vc/engine test` | `packages/engine/tests/crisis-escalation.test.ts`, `packages/engine/tests/guard-crisis.test.ts`, `packages/engine/tests/crisis-eval.test.ts`, `packages/engine/tests/crisis-defaults.test.ts` | PASS | |
| A11b | MOCK | `pnpm --filter @vc/engine test` | `packages/engine/tests/crisis-defaults.test.ts`, `apps/api/tests/acceptance-student-journey.test.ts` | PASS | Crisis flood dedup: journey test 2 (repaired, fix cycle 1) expects ONE flag for 35 same-thread crisis turns in one window (chat.ts p1-u8r M2) plus one more flag for a second thread; all 35 turns 200 with 14416 and the model never called. |
| A12 | MOCK | `pnpm --filter @vc/providers test` | `packages/providers/tests/failover.test.ts`, `packages/engine/tests/student-graph.test.ts`, `packages/providers/tests/live.test.ts` | PASS | |
| A13 | MOCK | `pnpm --filter @vc/mcp-university-kb test` | `mcp/university-kb/tests/kb-tools.test.ts`, `packages/engine/tests/claims-guard.test.ts` | PASS | Spec names the mcp package; staleness and date_unknown flags live in the engine claims guard, the not-re-readable session in the mcp `get_session` 404 test. Both cited. |
| A14 | REAL | `pnpm --filter @vc/engine eval:h2h` | | OUT-OF-SCOPE-REAL | U13b under G-REAL |
| A15a | MOCK | `pnpm --filter @vc/api test` | `apps/api/tests/anonymous-zero-persistence.test.ts`, `apps/api/tests/anonymous-route.test.ts` | PASS | |
| A15b | MOCK | `pnpm --filter @vc/api test` | `apps/api/tests/anonymous-zero-persistence.test.ts` | PASS | |
| A15c | MOCK | `pnpm --filter @vc/mcp-university-kb test` | `mcp/university-kb/tests/kb-tools.test.ts`, `apps/api/tests/anonymous-zero-persistence.test.ts` | PASS | |
| A16 | MOCK | `pnpm --filter @vc/engine test` | `packages/engine/tests/rank.test.ts` | PASS | U6b ranking is on the merged head: checker engine run of cycle 0 (verdict 8b3f52f) executed rank.test.ts with five sibling engine files, 131 pass, 0 fail. |
| A16b | MOCK | `pnpm --filter @vc/api test` | `apps/api/tests/chat-profile.test.ts`, `packages/db/tests/student-store.test.ts` | PASS | Chat and db halves on base. The engine ranking half (unconfirmed fact never reaches ranking) is `rank.test.ts` on `p1/u6b`, see A16. |
| A17 | MOCK | `pnpm --filter @vc/engine coverage` | `packages/engine/evals/coverage.test.ts` | PASS | U11 coverage report is on the merged head (`coverage` script at packages/engine/package.json:23): checker engine run of cycle 0 (verdict 8b3f52f) executed evals/coverage.test.ts, 131 pass, 0 fail. |
| A18 | MOCK | `pnpm --filter @vc/mcp-university-kb test` | `mcp/university-kb/tests/kb-tools.test.ts`, `packages/engine/tests/student-graph.test.ts` | PASS | repo scan = the `kb-fixture/` declared-synthetic test in kb-tools |
| A19 | MOCK | `pnpm --filter @vc/api test` | `apps/api/tests/voice-history.test.ts`, `packages/db/tests/chat-threads.test.ts` | PASS | |
| A20 | MOCK | `pnpm --filter @vc/api test` | `apps/api/tests/go-live-gate.test.ts` | PASS | the real repo gates refuse every target today, as intended |
| A21 | MOCK | `pnpm --filter @vc/engine test` | `packages/engine/tests/coach-first.test.ts`, `packages/engine/tests/capability-manifest.test.ts` | PASS | (a) also REAL on h2h, U13b |
| A22 | MOCK | `pnpm --filter @vc/engine test` | `packages/engine/tests/source-kind.test.ts`, `mcp/university-kb/tests/source-kind.test.ts` | PASS | |
| A23 | MOCK | `pnpm --filter @vc/api test` | `apps/api/tests/chat.test.ts`, `apps/api/tests/voice-limits.test.ts`, `apps/api/tests/acceptance-student-journey.test.ts` | PASS | Crisis never limited: journey test 2 (repaired, fix cycle 1) runs 35 crisis turns, all 200, expects 1 flag per thread and window. Spec names `tests/limits.test.ts`, which does not exist; the criterion is proven by these three files. |
| A24 | MOCK | `pnpm --filter @vc/engine test` | `packages/engine/evals/budget.test.ts`, `packages/engine/evals/p1-runners.test.ts` | PASS | Spec names `tests/budget-cap.test.ts`, which does not exist; the cap lives in `evals/budget.ts` and its test. |

## Run table (commands executed through `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh`, TMP/TEMP under `D:/vc/.worktrees/`)
Base run sha `d1e511e` (branch `p1/u12` = origin/main + U10w head `1c9fafb` + this unit's two new test files + trace). Raw output in `qa/evidence/p1-u12/runs/`.

| Command | Result | Criteria it carries |
|---|---|---|
| `pnpm -C packages/schemas test` | 90 tests, 90 pass, 0 fail | A5 (schemas), A6, A16b |
| `pnpm -C packages/db test` | 283 tests, 283 pass, 0 fail | A6, A7, A16b, A19 |
| `pnpm -C packages/providers test` | 130 tests, 130 pass, 0 fail | A9, A9b, A12 |
| `pnpm -C mcp/university-kb test` | 72 tests, 72 pass, 0 fail | A4, A13, A15c, A18, A22 |
| `pnpm -C packages/engine test` | 1168 tests, 1123 pass, 0 fail, 45 skipped | A1, A3, A4, A11, A11b, A12, A13, A18, A21, A22, A24 |
| `pnpm -C apps/api test` | 300 tests, 300 pass, 0 fail (incl. 7 new: 3 journey + 4 trace) | A5, A6, A7, A9, A9b, A15a-c, A16b, A19, A20, A23 |
| `pnpm -r typecheck` | exit 0 | all |
| `pnpm -C packages/engine eval:kb` | exit 0, prints `NOT PROVEN (synthetic fixture)` for A2a and `NOT PROVEN` for A2b | A2a |
| Integration view `7eab007` (= `1c9fafb` + `p1/u6b` fce8f83 + `p1/u11` 06469b6, throwaway detached worktree, not a branch): `tests/rank.test.ts evals/coverage.test.ts` | 55 tests, 55 pass, 0 fail | A16, A16b (engine), A17 |
| Integration view `7eab007`: `pnpm -C packages/engine coverage -- --out <tmp>` | exit 0, report written | A17 |
| Integration view `7eab007`: `pnpm -C apps/api test` | 293 tests, 293 pass, 0 fail | A5-A23 still green with U6b and U11 merged in |

The 45 engine skips are the legacy B18 live-card adapter cases printed `NOT RUNNABLE` (pre-existing, no P1 criterion).
| Fix cycle 1 (repaired journey test 2): `pnpm -C apps/api exec tsx --test tests/acceptance-*.test.ts` | 7 tests, 7 pass, 0 fail | A5, A6, A7, A11b, A23 |
| Fix cycle 1: checker engine run `rank.test.ts evals/coverage.test.ts source-kind budget p1-runners crisis-defaults` (verdict 8b3f52f) | 131 tests, 131 pass, 0 fail | A16, A17 |
