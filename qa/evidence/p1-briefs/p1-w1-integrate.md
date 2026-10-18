# P1 Wave-1 integration — maker step 6c (merged-head pre-push suite + push gate)
S = C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad.
Batch (all checker-PASS, close-outs committed): p1/u2 (a342525, verdict f069b9d), p1/u4 (26ed496, verdicts p1-u4 dad6865 + p1-u4b 00f00d1), p1/u5a (bc9c656, verdict 1774a4e).
NEVER touch the D:\vc working tree (dirty WIP: no stage/stash/reset/checkout/merge there); use `git -C D:/vc` only for fetch/worktree/branch/push. Never edit .claude/**. No product-code edits except trivial merge-conflict resolution (report each). Never copy 6c stamps.
Steps:
1. `git -C D:/vc fetch origin`; create worktree S/p1-w1-int on branch p1/w1-int from origin/main. If origin/main moved past a06c150, note it.
2. Merge p1/u2, p1/u4, p1/u5a (no-ff, in that order). Conflicts in qa/ ledgers/manifests: keep both sides. Any product-code conflict: STOP and report (do not push).
3. pnpm install (offline-first) in the worktree; typecheck all packages (`pnpm -r typecheck`).
4. Full suite: `bash D:/vc/scripts/vc-testlock.sh pnpm -r --no-bail test` (no -x/--maxfail; shared lock: long waits are NORMAL, keep waiting; another builder may hold it). Save output to S/p1-w1-int/qa/evidence/p1-w1-int/suite.txt. Compare reds against qa/checkpoints/baseline-reds.md (same SHA/test id/message hash rules); any new red -> STOP, report, no push. Before the run, check C: free >= 15 GB and RAM; an OOM/env failure is environmental, not a PASS, report it.
5. Green: `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green --root <S>/p1-w1-int`, commit evidence + stamp (message ends `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`), then `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --push-gate --root <S>/p1-w1-int`. Only if the gate passes: `git -C <S>/p1-w1-int push origin HEAD:main` (fast-forward only; never force). If rejected as non-ff, fetch, re-merge origin/main, and re-run steps 3-5 once.
Report under 20 lines: pushed range, test totals (tests/pass/fail/skipped), 6c stamp id, any conflict resolutions, any skipped step.
