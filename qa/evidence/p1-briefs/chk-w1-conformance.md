# Checker brief: w1-conformance (/checker, Mode A, single coordinator)

Policy-Version: proportional-verification/2026-10-19.17. Tier M (qa tooling script, multi-behaviour). Dual check: no (no auth/tenancy/prod-write).

## Unit facts
- Worktree D:/vc/.worktrees/w1-conformance, branch wave/w1-conformance, base da2faad.
- Code commit 2237880; tip 08fe8af adds the manifest.
- Manifest: qa/manifests/w1-conformance.md (in the worktree), Fix cycle 0.
- Build brief: qa/evidence/p1-briefs/w1-conformance.md (criteria Q1-Q4).
- Changed files: scripts/vc-regression-check-conformance.py, scripts/vc-regression-check-conformance.test.sh.

## Rules
- Read-only toward the artifact. Write ONLY qa/verdicts/w1-conformance.md on main in D:/vc, with `Cycle checked: 0`, and commit it by name (no `git add -A`). End the commit with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests only via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 <cmd>`; long lock waits are normal.
- Python only as `python -I <script> ...`; never `python -` or stdin. No full suite. No live LLM calls. Never edit .claude/** or qa/issues.jsonl rows other than new finding rows (ISS-w1-conformance-<n>).
- Kill only PIDs you started. Leave PIDs 36452 and 23868 alone.

## Prove the outcome, not the construction
- Q1: build your own ledger fixture where a fixed row is targeted by an unresolved `type: decorative-regression-check` finding; show it is non-conforming, and that resolving the finding clears it.
- Q2: fixtures for (a) a test file touching nothing the row cites -> coverage-absence, (b) a row citing nothing -> unassessable, (c) zero-byte and comments-only test files -> never pass.
- Q3: identical duplicate rows counted once; an identical copy re-landing after a different row for the same id -> STALE.
- Q4: the three lists print separately with counts; recompute the main-ledger counts (4 / 109 / 57, 126/170 conforming) yourself against da2faad's ledger.
- Hostile variant per criterion (e.g. target id with trailing whitespace or different case; a test file with only a shebang). Report what happens; FAIL only on a criterion.
- One falsification per criterion in a copy outside D:/vc (scratchpad), green-before/red-after.
- Judge whether the 6 new coverage-absence hits on main are true positives (read 2 of them); false positives are a low PROPOSED row, not a FAIL.

## Return
`VERDICT <PASS|FAIL> <sha>` plus at most 6 lines.
