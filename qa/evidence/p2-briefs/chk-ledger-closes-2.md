# Checker brief: ledger-closes-2 (/checker, ledger maintenance, sole writer of qa/issues.jsonl)
Policy-Version: proportional-verification/2026-10-19.17. Work on main in D:/vc, read-only except appending to qa/issues.jsonl and writing qa/verdicts/ledger-closes-2.md (Cycle checked: 0).

Rows:
- ISS-t-034-de-1, ISS-t-034-de-2
- ISS-t-029-rev-1 (built by w1-erasure-outbox E3: ERASURE_PENDING_TTL_MS, expireStalePending)
- ISS-t-010-c0-1 (w1-cards-b1 K2)
- ISS-t-010-c0-2 (cards relevance.ts:202 leak, reported removed from main)
- ISS-t-012-rev-1
- ISS-sweep-20261025-2 (stale second Status line in qa/manifests/w1-cards-b1.md, relabelled by the maker at line 61)

For each: read the latest row, find the cited fix, verify the OUTCOME independently (re-run the narrow test by name when one exists, or a hostile probe for the leak), then append `fixed`/`verified` with command + result + sha, or record STILL-OPEN <reason>. A commit message is not proof.

Tests only via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test [--test-name-pattern=...] <file>`; long lock waits are normal. Never: full suite, python, live calls, Mongo, edits to code/.claude/**/gates/DECISIONS, git add -A, push. Commit only the two files by name, message ending Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>. Return `DONE <sha>` + one line per row.
