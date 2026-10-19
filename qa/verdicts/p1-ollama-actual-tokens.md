# /checker verdict - p1-ollama-actual-tokens (tier M, single checker)

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.16
VERDICT: PASS
CHECKED-STATE: head 553660d (code identical to 18da02d: `git diff --stat 18da02d 553660d` touches only qa/manifests/p1-ollama-actual-tokens.md), base a555a90, detached copy D:/vc/.worktrees/chk-otok2 (installed offline, frozen lockfile). Source files untouched by the checker; mutants ran in the copy and were reverted (`git status` clean except the checker test file).
CHECK-PLAN: outcome proof with mocked fetch through the real runners (run-kb, run-probes, run-latency REAL bodies under VC_REAL_MODEL=ollama:glm-5.3-flash, synthetic 2-item sets, scratch ledgers) plus a checker-authored test file (qa/evidence/p1-otok-check/chk-otok.test.ts, 12 tests) written without reading the builder tests' assertions; one falsification per criterion.
SCOREBOARD: C1 PASS, C2 PASS, C3 PASS, C4 PASS, C5 PASS. 12/12 checker tests green; 9 mutants (C1, C2, C3a, C3b, C4, C5a, C5b, fail-closed, plus the first C3b variant) - every real mutant killed.

## Evidence (all via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C <copy>/packages/engine exec tsx --test evals/chk-otok.test.ts`, TMP/TEMP on D:)
Result: tests 12, pass 12, fail 0 (log: qa/evidence/p1-otok-check/chk-otok-run.log).
- C2/C4 per runner (kb 1 call, probes 2, latency 20): varying mocked counts (in=100+7n, out=3n+1); ledger body is strictly charge,actual,charge,actual...; each actual's tokens equal the mocked counts, reservedUsd equals the charge before it, actualUsd = (in*1+out*4)/1e6; report json usage sums equal the ledger sums; the md file on disk carries the sums and "notional"; usdBasis "notional"; spentUsd and monthSpendUsd equal the charge-line sum.
- C2 invalid shapes (15, run-latency, through the real body): missing, only-prompt, only-eval, negative x2, float, string, null, "NaN", 2^60 literal, MAX_SAFE+1, 1e999 (Infinity), array, boolean, object -> every one `actual:"unreported"`, no token/usd fields, reservedUsd equals its charge (>0); report unreportedCalls 15, unreportedReservedUsd equals the reservation sum; valid zero counts (0,0) stay `reported`.
- C3: reservation over the per-run cap -> 0 fetch calls and an aborted-budget report with no actual lines; ~20.5 USD reservation with 1-token actuals -> exactly 2 sends, third refused, spend equals the reservation sum. Month: seeded 190 USD charge plus an actual line with actualUsd 0.000001 and with 1000 -> monthSpendUsd stays 190, request refused before sending (0 fetch), cap "per-month".
- Corrupt actual line (6 shapes incl. torn JSON) -> readLedger throws "corrupt"; a run-kb on that ledger rejects with 0 fetch calls.
- Crash: a child process (node --import tsx) dies with exit 77 inside fetch right after the charge -> ledger readable as [start, charge], the reservation counts toward month spend, the next run completes and appends [start, charge, actual, end].
- Default path (no VC_REAL_MODEL): no `usage` key in the report or json file, no actual lines, no "notional". The provider diff touches only Ollama regions (OllamaActualUsage, OllamaProvider, prepareOllamaProvider); the Gemini adapter is untouched.
- C5: OllamaProvider with afterResponse throwing Error / string / Error(EROFS) / null -> response returned, beforeRequest 1, fetch 1, afterResponse 1, actualHookFailures 1 each. Runner path with the ledger made read-only after charge 2 (3 sequential asks): all 3 responses returned, fetch 3, ledger kinds [start, charge, actual, charge, charge, actual, end] (exactly one charge per call), usage reported 2 / unreported 1 with unreportedReservedUsd equal to charge 2, spent equals the 3 reservations. A torn trailing actual line (no newline) -> readLedger throws; a following run-kb is refused with 0 fetch calls.

## Falsification (mutants in the detached copy, each reverted; logs qa/evidence/p1-otok-check/mut-*.log)
- C1 invalid counts coerced to 0 -> 4 failed (C2 shapes + 3 reported-sum tests).
- C2 runner hook passes `?? 0` for missing figures -> 1 failed (shapes test).
- C3a reservation hook (`run.charge`) made a no-op -> 8 failed (per-run, month, ordering, crash, C5 tests).
- C3b month spend also sums actual lines' actualUsd -> 4 failed (month test + 3 per-runner spend==ledger sum checks). Note: the first C3b mutant (summing the actual line's `usd`, which actual lines do not have) was an equivalent mutant and survived; replaced by this one.
- C4 usage section dropped from reports -> 6 failed.
- C5a provider rethrows from the catch -> 2 failed (provider test, runner-path test).
- C5b recordActual stops catching the append error (tally skipped) -> 1 failed (runner-path test).
- Fail-closed: validateActualEntry call removed from readLedger -> 1 failed (corrupt-line test).

## Reused (identity matches: code tree 18da02d == 553660d)
Builder Pre-check[C1] providers tests 158/158 and Pre-check[C2..C5] engine importers 163/163 plus `pnpm -r typecheck` exit 0, all at 18da02d. The integration run below re-executes the full suite on the merged tree.

## Not determined / for the owner
- No real Ollama call was made (none permitted); the field names prompt_eval_count / eval_count come from the documented /api/chat shape. A response that omits them is recorded unreported with its reservation.
- The ledger-lock-timeout variant of the C5 failure was not forced; the append-I/O-error variant (read-only ledger) was. Both go through the same catch.
- actualUsd is notional (table/override price x tokens) and may exceed the reservation if an endpoint ignores the output cap; caps use the reservation only, as specified.
ISSUES-WRITTEN: none
Metrics: start=2026-10-19T15:49:37+05:30 end=2026-10-19T15:58:24+05:30 cycle=0 mutants=9 tests=12 policy=proportional-verification/2026-10-19.16
