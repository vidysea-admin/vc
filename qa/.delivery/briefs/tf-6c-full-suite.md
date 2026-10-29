# tf-6c-full-suite

Run the 6c pre-push full suite on the current uncommitted worktree, in the same format as qa/verdicts/vca-6c.md: pnpm test from each package dir, sequentially (RAM is tight; never in parallel), with no -x or --maxfail. Use the vc-testlock if the packages use it; long waits on the lock are normal.
Packages: packages/schemas, db, observability, providers, engine; apps/api, web, widget; mcp/pathlynks, student-profile, university-kb. Plus any new package with a package.json.
Also run python contracts/verify_contracts.py, and tsc --noEmit for each package.
For any failure: re-run that file alone twice. Classify it as a real defect (with file:line and which change caused it, via git diff) or environmental/flaky (memory shows OOM in the data-fence package when C: is full; check free space on C: first and report it).
Do not fix code. Do not commit. Do not touch qa/.6c-green.
Write qa/verdicts/tf-6c.md with an Overall PASS/FAIL, the table, the triage and the HEAD sha, and save the raw logs to qa/evidence/tool-first/6c-<pkg>.log.
