# You are /checker running close-out + merge + the 6c pre-push check for eng3 (p1-eng3-crisis-leftovers)
- Protocol C:/Users/Lenovo/.claude/skills/checker/SKILL.md (Mode A, 6c). Policy .14 with the .13 pre-push rules: the .13-1 behaviour-scoped set plus a full collection check. There is no .13-2 trigger: eng3 changes only the engine crisis guard and one apps/api test input, with no auth, tenancy or prod-write.
- S = C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad. Use `git -C <dir>`, never `cd X && cmd`. Never `git add -A`. Never touch .claude/**. Do NOT push. Do not touch the D:\vc working tree. C: is nearly full: create only one new worktree.

## 1. Close-out (on p1/eng3, worktree S/p1-eng3)
- Verdict PASS f81a995 (qa/verdicts/p1-eng3-crisis-leftovers.md, Cycle checked: 3; D-098 extra cycle). Senior reviews: cycle 2 Warning (D:/vc/qa/evidence/p1-briefs/p1-eng3-c2-review-result.md) and cycle 3 Warning (D:/vc/qa/evidence/p1-briefs/p1-eng3-c3-review-result.md).
- Renumber every `ISS-p1eng3-*` row in qa/issues.jsonl to real ids starting at ISS-183, in ledger order (check D:/vc main's qa/issues.jsonl for the true max first; if it is above 182, start at max+1). Keep the closed status of the rows the checker closed.
- Add one row per open review item not already in the ledger: the cycle-3 medium vocabulary gap (severity medium, tag safety, note "priority: safety; human approval needed"), the 240-char window boundary test gap (low), the cycle-2 low "continuing MBA nobody gets jobs" over-fire (low, accepted D-020), plus the U8r-style pending [ASSUMPTION]s for Umesh (lead-in word alone does not suppress; >20 suppressed matches fire; a low row tagged "umesh-confirm").
- Flip the manifest to `Status: checked-PASS`, citing the verdict path and f81a995. Commit narrow pathspecs on p1/eng3: "qa: p1-eng3-crisis-leftovers close-out (PASS)".

## 2. Integrate
- `git -C D:/vc worktree add S/int-e3 main --detach` (D:/vc main is origin/main 279af56 plus qa-only commits). In S/int-e3: `git merge --no-ff p1/eng3 -m "merge p1/eng3: crisis leftovers (PASS f81a995, D-098 cycle 3, review Warning)"`. qa/issues.jsonl is merge=union. Any other conflict: STOP and report the files.
- Add the medium safety row at the TOP of "Candidates (human picks)" in qa/QUEUE.md, marked `priority: safety`, and the other new non-closed rows under Candidates, one line each. Make this a separate commit in S/int-e3.

## 3. 6c (scoped)
1. `python contracts/verify_contracts.py`.
2. `pnpm install --offline --frozen-lockfile` (compare the lockfile hash with main first; eng3 changes no dependency).
3. Collection check: every package's test files collect (exit 0 for all packages).
4. Run the behaviour-scoped set via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh ...`: the whole engine package (`pnpm -C packages/engine test`), the apps/api tests anonymous-route, anonymous-zero-persistence, server, index plus chat.test.ts and student-graph-dependent api tests, and `pnpm -r typecheck`. Any new red: name its owner, STOP, no stamp.
5. Run `git diff --stat origin/main...HEAD` to confirm that no file outside packages/engine, the one apps/api test file and qa changed.
6. If green: run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` inside S/int-e3 (tree clean first). DO NOT COMMIT qa/.6c-green. Then run `tick.mjs --push-gate` inside S/int-e3.

## Return (max 8 lines)
Close-out sha, ISS range used, merge sha, int-e3 HEAD, validator, test totals, typecheck, diff-scope line, and the push-gate stdout line with its exit code.
