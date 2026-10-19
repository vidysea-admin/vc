# /checker Mode B backstop sweep on main (read-only toward code; due: last sweep ~18 days ago)

Target: origin/main (fetch first; currently d7319b9 or later). Work in a NEW detached worktree: `git -C D:/vc worktree add --detach D:/vc/.worktrees/sweep-20261019 origin/main`. Never edit D:/vc main tree or any p1-* worktree.
Do, fast and proportionate:
1. `pnpm install --offline --frozen-lockfile` (TMP/TEMP on D:), `pnpm -r typecheck`, full suite via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -r --workspace-concurrency=1 test`. Another checker shares the lock; long waits are normal. Load-flake rule applies (passes alone + timing/deadline assertion + file unchanged → low row).
2. Bypass detection: commits on origin/main since the last `backstop:` stamp in qa/.last-sweep that touch apps/ or packages/ without a checked-PASS manifest or merged-no-check status. List them.
3. Crisis-path spot check: confirm the 14416 helpline text and crisis escalation tests are present and green in apps/api and packages/engine.
4. Fold qa/feedback-inbox.md items (if any) into Candidates.
Any concrete regression traced to a feature's changed files → S1/S2 qa/issues.jsonl row + `HOLD: <feature> - <issue-id>` in qa/QUEUE.md. Otherwise low rows only.
Write qa/verdicts/backstop-sweep-20261019.md and update qa/.last-sweep with `backstop: $(date -Iseconds) <tree-hash>`. Commit those qa files on a branch `qa/sweep-20261019` in the sweep worktree (narrow pathspecs). Do not push or merge. Report: suite counts, bypass list, any HOLD, commit sha.
