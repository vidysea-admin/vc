# Checker brief: w1-ledger-closes (/checker, ledger maintenance)

**Role.** You are /checker, the sole writer of `qa/issues.jsonl`.
- Work on main in `D:/vc`.
- Read only, except for:
  - appending rows to `qa/issues.jsonl`
  - writing `qa/verdicts/w1-ledger-closes.md`

**Never:**
- edit code, `.claude/**`, gates or `DECISIONS.md`
- run a full suite
- run live LLM calls
- run `git add -A`

**Policy:** `Policy-Version: proportional-verification/2026-10-19.17`.

**Lock.** If you run any test, use `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test [--test-name-pattern=...] <file>`. Long waits on the lock are normal.

## The rows

Each row below is believed to be fixed already, but its ledger row is still open. For each one:
1. Read the latest row in `qa/issues.jsonl`.
2. Find the cited fix commit or verdict.
3. Verify the outcome independently. Re-running the narrow regression test is enough when one exists. A commit message alone is not proof.
4. Then do exactly one of these:
   - Append a status row: `fixed` / `verified`, with the evidence (command + result + sha).
   - Record `STILL-OPEN <reason>`.

**Rows to check:**
- **ISS-051, ISS-052:** fixed by earlier hardening per the queue notes.
- **ISS-t-005c-c0-1**
- **ISS-t-012-rev-3:** confirm on the current crisis heldout eval.
- **ISS-t-034-concern-hook:** fixed by 975a606, verdict `verdicts-20261017-c8b` CONCERN_FIX PASS.
- **ISS-pc-widget-1**
- **ISS-golive-a20-1:** A20 all-targets were unskipped in 173bd45.

## Output

Write `qa/verdicts/w1-ledger-closes.md` with:
- one line per row: id, verdict, evidence
- `Cycle checked: 0`

Commit only `qa/issues.jsonl` and that verdict, naming each file. End the commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

Return `DONE <sha>` followed by one line per row.
