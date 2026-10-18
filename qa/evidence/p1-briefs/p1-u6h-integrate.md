# P1 U6h integration — maker step 6c (merged-head pre-push suite + push gate)
S = C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad.
Batch (checker-PASS, close-out committed): p1/u6h at its close-out HEAD (verdict cb93500, Cycle checked: 1). Base 41c2252 = U6, already on origin/main (38fd98d).
NEVER touch the D:\vc working tree (dirty WIP: no stage/stash/reset/checkout/merge there); use `git -C D:/vc` only for fetch/worktree/branch/push. Never edit .claude/**. No product-code edits except trivial merge-conflict resolution (report each). Never copy or commit 6c stamps: the stamp stays UNTRACKED in the worktree.
Steps:
1. `git -C D:/vc fetch origin`; create worktree S/p1-u6h-int on branch p1/u6h-int from origin/main (expected 38fd98d; note if it moved).
2. Merge p1/u6h (no-ff). Conflicts in qa/ ledgers/manifests: keep both sides. Any product-code conflict: STOP and report (no push).
3. pnpm install (offline-first); `pnpm -r typecheck`.
4. Full suite: `bash D:/vc/scripts/vc-testlock.sh pnpm -r --no-bail test` (no -x/--maxfail; the shared lock may be held by another builder, long waits are NORMAL, keep waiting). Save to S/p1-u6h-int/qa/evidence/p1-u6h-int/suite.txt. Compare reds against qa/checkpoints/baseline-reds.md; any new red -> STOP, report, no push. First check C: free >= 15 GB; OOM/env failure is environmental, report it, no PASS.
5. Green: commit the suite evidence (message ends `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`), THEN `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green --root <S>/p1-u6h-int` (leave stamp untracked), then `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --push-gate --root <S>/p1-u6h-int`. Only if the gate passes: `git -C <S>/p1-u6h-int push origin HEAD:main` (fast-forward only; never force). Non-ff: fetch, re-merge origin/main, re-run 3-5 once.
Report under 20 lines: pushed range, test totals (tests/pass/fail/skipped), 6c stamp id, conflict resolutions, any skipped step.
