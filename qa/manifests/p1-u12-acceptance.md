# Manifest — p1-u12-acceptance
**Contract:** spec v8 (sha e183ee9a) MOCK criteria A1-A7, A9, A9b, A11, A11b, A12, A13, A15a-c, A16, A16b, A17-A24 and A2a; plan row U12; D-097 item 2 (A2a closes NOT PROVEN). Source brief `qa/evidence/p1-briefs/p1-u12-build.md` with the overrides in `qa/evidence/p1-briefs/p1-u12-go.md`.
**Criteria:** one per row of `qa/evidence/p1-u12/trace.md` (30 rows: 24 MOCK, 5 REAL out of scope, A2a NOT PROVEN)
**Goal task:** none
**Date:** 2026-10-19
**Status:** ready-for-check
**Fix cycle:** 1 of max 2
**Policy-Version:** proportional-verification/2026-10-18.15
**Tier:** M (verification unit, no product code changed)
**Dual check:** no (the unit fixes nothing and touches no auth, student-data or production path; it adds tests and evidence only)
**Persona walk:** skip (no human screen)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent (maker/builder p1-u12-go)
**Executor rationale:** one coherent verification pass over the whole P1 diff; every piece reads the same trace table.

## What changed
Branch `p1/u12`, base `1c9fafb` (origin/main + U10w head). New files only, no existing file edited, no product code touched:
- `qa/evidence/p1-u12/trace.md` — the traceability matrix, computed from spec lines 29-58: criterion, class, spec command, the test files that really prove it, status, note. Ends with the run table.
- `apps/api/tests/acceptance-trace.test.ts` — 4 tests; fails if a row names a missing test file or a missing `pnpm --filter <pkg> <script>`, if a criterion is absent or has an unknown status, or if a PENDING row does not name its branch.
- `apps/api/tests/acceptance-student-journey.test.ts` — 3 tests, the only new proof (everything else is reused from existing tests, per the speed override): (1) A5/A6/A7 chain through the real chat handler: signed-in turn, published Zod response schema, redacted and tenant-stamped rows, export, request/confirm/execute erasure, read-back zero in every student collection and the API answers 404 for the erased thread, the other student untouched; (2) hostile crisis flood: 35 crisis turns in a row, all 200 with the fixed message, model never called, 35 text-free flag rows (A23 "crisis never limited" past the 31st request); (3) hostile wrong tenant plus an under-18 student without guardian consent.
- `qa/evidence/p1-u12/**` — run outputs (`runs/`), falsification outputs (`fals/`), `integration.md`.
Mapping decisions: the spec names `tests/limits.test.ts` (A23) and `tests/budget-cap.test.ts` (A24), which do not exist; the trace cites the files that prove them (`chat.test.ts` + `voice-limits.test.ts`; `evals/budget.test.ts` + `evals/p1-runners.test.ts`). A13 names the mcp package, but staleness and `date_unknown` live in `packages/engine/tests/claims-guard.test.ts`; both are cited.

## Verification scope
Round: est 40 min — read spec/plan, map 30 criteria to tests, one new journey test file and one trace test, 6 falsifications, 8 package runs and the integration view (lock waits dominated)
slow-plan: the round cannot be smaller: 30 criteria must be mapped to real test files, six package commands each wait on a shared test lock that other agents held, and the integration view needs its own install.
Affected tests / full-suite trigger: all six packages ran whole once (each package's own `test` script), plus `pnpm -r typecheck` and `eval:kb`. No whole-repo single suite.
Base / checked state: `p1/u12` at `d1e511e` for the base runs; `7eab007` is a throwaway detached merge of `1c9fafb` + `p1/u6b` (fce8f83) + `p1/u11` (06469b6) used only for A16/A17 (see `qa/evidence/p1-u12/integration.md`).
Tests[journey]: apps/api tests/acceptance-student-journey.test.ts — "acceptance A5/A6/A7: a signed-in student's real turn ...", "acceptance hostile: 35 crisis messages ...", "acceptance hostile: a student of tenant-b ...".
Tests[trace]: apps/api tests/acceptance-trace.test.ts — 4 tests (coverage of criteria, files exist, scripts exist, pending/real rows well-formed).
Tests[reuse]: every other trace row cites existing tests that already prove the criterion; none was duplicated.
Pre-check[A1]: d1e511e bash scripts/vc-testlock.sh pnpm -C packages/engine test -> green: 1123 passed, 0 failed, 45 skipped (legacy B18 NOT RUNNABLE)
Pre-check[A2a]: d1e511e bash scripts/vc-testlock.sh pnpm -C packages/engine eval:kb -> exit 0, A2a prints NOT PROVEN (synthetic fixture); D-097 item 2 closes A2a as NOT PROVEN (U3 golden set pending); evals/kb-eval.test.ts green inside the engine run above
Out-of-scope[A2b]: not run, OUT-OF-SCOPE-REAL (REAL criterion, U13b under G-REAL, D-097/D-093)
Pre-check[A3]: d1e511e bash scripts/vc-testlock.sh pnpm -C packages/engine test -> green: 1123 passed, 0 failed, 45 skipped (legacy B18 NOT RUNNABLE)
Pre-check[A4]: d1e511e bash scripts/vc-testlock.sh pnpm -C packages/engine test -> green: 1123 passed, 0 failed, 45 skipped (legacy B18 NOT RUNNABLE)
Pre-check[A5]: d1e511e bash scripts/vc-testlock.sh pnpm -C apps/api test -> green: 300 passed, 0 failed
Pre-check[A6]: d1e511e bash scripts/vc-testlock.sh pnpm -C apps/api test -> green: 300 passed, 0 failed
Pre-check[A7]: d1e511e bash scripts/vc-testlock.sh pnpm -C packages/db test -> green: 283 passed, 0 failed
Out-of-scope[A8]: not run, OUT-OF-SCOPE-REAL (REAL criterion, U13b under G-REAL, D-097/D-093)
Pre-check[A9]: d1e511e bash scripts/vc-testlock.sh pnpm -C apps/api test -> green: 300 passed, 0 failed
Pre-check[A9b]: d1e511e bash scripts/vc-testlock.sh pnpm -C apps/api test -> green: 300 passed, 0 failed
Out-of-scope[A10]: not run, OUT-OF-SCOPE-REAL (REAL criterion, U13b under G-REAL, D-097/D-093)
Pre-check[A11]: d1e511e bash scripts/vc-testlock.sh pnpm -C packages/engine test -> green: 1123 passed, 0 failed, 45 skipped (legacy B18 NOT RUNNABLE)
Pre-check[A11b-c0]: d1e511e bash scripts/vc-testlock.sh pnpm -C packages/engine test -> green: 1123 passed, 0 failed, 45 skipped (legacy B18 NOT RUNNABLE)
Pre-check[A12]: d1e511e bash scripts/vc-testlock.sh pnpm -C packages/providers test -> green: 130 passed, 0 failed
Pre-check[A13]: d1e511e bash scripts/vc-testlock.sh pnpm -C mcp/university-kb test -> green: 72 passed, 0 failed
Out-of-scope[A14]: not run, OUT-OF-SCOPE-REAL (REAL criterion, U13b under G-REAL, D-097/D-093)
Pre-check[A15a]: d1e511e bash scripts/vc-testlock.sh pnpm -C apps/api test -> green: 300 passed, 0 failed
Pre-check[A15b]: d1e511e bash scripts/vc-testlock.sh pnpm -C apps/api test -> green: 300 passed, 0 failed
Pre-check[A15c]: d1e511e bash scripts/vc-testlock.sh pnpm -C mcp/university-kb test -> green: 72 passed, 0 failed
Pre-check[A16]: 7eab007 (integration view, not a branch) bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test tests/rank.test.ts -> green: 55 passed, 0 failed (with coverage.test.ts); NOT in the p1/u12 base, so the trace row stays PENDING-INTEGRATION
Pre-check[A16b]: d1e511e bash scripts/vc-testlock.sh pnpm -C apps/api test -> green: 300 passed, 0 failed
Pre-check[A17]: 7eab007 (integration view, not a branch) bash scripts/vc-testlock.sh pnpm -C packages/engine coverage -> exit 0; and tsx --test evals/coverage.test.ts -> green: 55 passed, 0 failed (with rank.test.ts); NOT in the p1/u12 base, so the trace row stays PENDING-INTEGRATION
Pre-check[A18]: d1e511e bash scripts/vc-testlock.sh pnpm -C mcp/university-kb test -> green: 72 passed, 0 failed
Pre-check[A19]: d1e511e bash scripts/vc-testlock.sh pnpm -C apps/api test -> green: 300 passed, 0 failed
Pre-check[A20]: d1e511e bash scripts/vc-testlock.sh pnpm -C apps/api test -> green: 300 passed, 0 failed
Pre-check[A21]: d1e511e bash scripts/vc-testlock.sh pnpm -C packages/engine test -> green: 1123 passed, 0 failed, 45 skipped (legacy B18 NOT RUNNABLE)
Pre-check[A22]: d1e511e bash scripts/vc-testlock.sh pnpm -C packages/engine test -> green: 1123 passed, 0 failed, 45 skipped (legacy B18 NOT RUNNABLE)
Pre-check[A23-c0]: d1e511e bash scripts/vc-testlock.sh pnpm -C apps/api test -> green: 300 passed, 0 failed
Pre-check[A11b]: b67423a (test and trace content identical to the run tree) VC_TESTLOCK_TIMEOUT_SECS=7200 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/acceptance-*.test.ts -> green: 7 passed, 0 failed (journey test 2 now expects 1 flag per thread and window, plus 1 more for a second thread; engine half crisis-defaults.test.ts in checker run 8b3f52f, 131/131)
Pre-check[A23]: b67423a (test and trace content identical to the run tree) same command -> green: 7 passed, 0 failed (35 crisis turns all 200, never 429, model never called)
Pre-check[A24]: d1e511e bash scripts/vc-testlock.sh pnpm -C packages/engine test -> green: 1123 passed, 0 failed, 45 skipped (legacy B18 NOT RUNNABLE)
Pre-check[typecheck]: d1e511e bash scripts/vc-testlock.sh pnpm -C . -r typecheck -> exit 0 (qa/evidence/p1-u12/runs/typecheck.txt)
Pre-check[integration-api]: 7eab007 bash scripts/vc-testlock.sh pnpm -C apps/api test -> green: 293 passed, 0 failed (U6b and U11 merged in do not break the API suites)
Metrics: start=2026-10-19T09:35:40+05:30 end=2026-10-19T10:11:31+05:30 builder_min=36 wall_min=36 agent_min=unavailable blocked_min=18 suite_runs=0 repeat_runs=0 mutants=6 files=4
mutant-cap-raise: two new test files (3 journey tests, 4 trace tests) each need their own kill; 3 product-edit mutants for the journey tests and 3 trace-table edits for the trace checker are distinct tests, not repeats.

## Capability coverage (each new test -> one falsifying edit, product file edited in the worktree then restored from a saved copy; outputs in `qa/evidence/p1-u12/fals/`)
Not a separate copy of the tree: the edit was made in the p1/u12 worktree and `apps/api/src/chat.ts` was restored byte for byte from a saved copy (git status showed only the untracked new files afterwards). No product edit was committed.
| id | falsifying edit | before | after | first failing test |
|---|---|---|---|---|
| M1 | `chat.ts` `redact` returns the text unchanged (no redaction) | 3/3 | 1 fail of 3 | acceptance A5/A6/A7 (raw name/email stored) |
| M2 | `chat.ts:390` limiter consulted for crisis too (`if (true)`) | 3/3 | 1 fail of 3 | acceptance hostile: 35 crisis messages (turn 31 is 429). A first version with 25 turns survived, so it was raised to 35. |
| M3 | `chat.ts:398` `persistText = !overlong` (consent ignored) | 3/3 | 1 fail of 3 | acceptance hostile: wrong tenant and under-18 (minor text stored). A first mutant on line 531 (thread flag only) survived; line 398 is the one that stores text. |
| T1 | trace names `no-quote-GONE.test.ts` | 4/4 | 1 fail | every test file a trace row names exists |
| T2 | trace row A24 deleted | 4/4 | 1 fail | trace covers every criterion |
| T3 | trace names script `eval:nope` | 4/4 | 1 fail | every `pnpm --filter` command names a real script |
All 6 killed, 0 survivors (the two weak first attempts noted above were strengthened, not ignored).

## Live browser evidence
Not applicable (tests and evidence only; no UI or route changed).

## Findings (ISS proposals, none fixed here; this unit never fixes product code)
- ISS-proposal P12-1 (low, spec versus implementation wording): A5 reads "GET /v1/openapi.json lists every new route". The served document does not list the student routes; U5a keeps them in the separate `STUDENT_API_DRAFT` (`apps/api/src/openapi.ts`, `x-enabled: false`) until the A20 gate passes, and the plan DoD says "OpenAPI published only when the A20 script passes". Real responses ARE validated against the published Zod schema now (new journey test). Checker or Umesh to confirm A5 closes on the draft contract.
- ISS-proposal P12-2 (process): U6b (`p1/u6b`, checker-PASS) and U11 (`p1/u11`, checker-PASS) are not in this base. A16 and A17 are PASS only on the throwaway integration view `7eab007`; the trace marks them PENDING-INTEGRATION. When both reach main, move the two rows to PASS citing `packages/engine/tests/rank.test.ts` and `packages/engine/evals/coverage.test.ts` and re-run `acceptance-trace.test.ts`.
- ISS-proposal P12-3 (low): spec A7 says erased students leave gap counts at read-back zero; the implementation exempts `chat_gap_counts` with a stated reason (no student, thread or text in the row). Spec wording and code differ; the U8 decision stands, the wording should follow.
- Observation: the 45 engine skips are legacy B18 live-card adapter cases (`NOT RUNNABLE`), unrelated to P1.
- CORE-REQUEST: qa/contracts/counselling-engine.md (checker-owned) A23, A24 and A13 name `tests/limits.test.ts`, `tests/budget-cap.test.ts` and the mcp package, which do not hold those proofs; point them at the files listed in the trace (no product change needed).
- Environment: free C: was 5.4 GB (99% full) throughout; no run OOMed, no ENVIRONMENTAL result.

## Not done / stated limits (for the checker)
- A2a is NOT PROVEN by design (D-097 item 2). REAL criteria A2b, A4 probes, A8, A10, A14 are U13b and were not run (no network, no model call).
- The senior-software-engineer, data-engineer and independent-checker reviews of the whole P1 diff are dispatched by the maker after this manifest (brief), not by the builder.
- A16/A17 evidence is on a merged view, not on `p1/u12`; it will be re-pointed once U6b and U11 land on main.

## How to verify (commands + expected)
- `bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/acceptance-student-journey.test.ts tests/acceptance-trace.test.ts` -> 7 tests, 7 pass.
- `bash scripts/vc-testlock.sh pnpm -C apps/api test` -> 300 pass, 0 fail; `pnpm -C packages/engine test` -> 1168 tests, 0 fail, 45 skipped.
- `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --lint-manifest qa/manifests/p1-u12-acceptance.md` -> exit 0.

## Fix cycle 1 (ISS-237, test/trace only)
Checker cycle 0 FAIL: journey test 2 pinned the pre-U8r 35-flags behaviour. Repaired in apps/api/tests/acceptance-student-journey.test.ts: expects `flags.length === 1` for 35 same-thread turns (chat.ts:581-582 p1-u8r M2 dedup), keeps 35 x 200 / 14416 / model never called, adds a second thread -> 2 flags (per-thread keying). Trace: A16 and A17 PENDING-INTEGRATION -> PASS (checker engine run 131/131, verdict 8b3f52f); A11b and A23 rows cite the repaired test; run table extended. ISS-238/239/240 wording items left untouched (not one-line trace edits).
Falsification (copy D:/vc/.worktrees/_u12r_fals, bound tree untouched; output qa/evidence/p1-u12/check/fals-repair1.txt): R0 unmutated 1/1 green; R1 expected count set to 35 -> RED (1 !== 35); R2 chat.ts `quiet=false` (dedup broken) -> RED (35 !== 1); R3 restored -> green.
Product diff: `git diff origin/main --stat -- apps packages` lists only the two acceptance test files.
