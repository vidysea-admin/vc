# You are /checker running close-out + merge + the 6c pre-push check for U6w (p1-u6w-rank-wiring)
- Protocol C:/Users/Lenovo/.claude/skills/checker/SKILL.md (Mode A, 6c). Policy .15 with the .13 pre-push rules. U6w is tier L with a tenancy dual-trigger (apps/api/src/chat.ts ranking reads), a .13-2a trigger, so the FULL SUITE runs before the push.
- C: is FULL (tens of MB). Everything goes on D:. Use `git -C <dir>`, never `cd X && cmd`. Never `git add -A`. Never touch .claude/**. Do NOT push. Do not touch the D:\vc working tree. If a tool fails with "No space left on device", that is ENVIRONMENTAL: report it, stamp nothing.

## 1. Close-out (on p1/u6w, worktree D:/vc/.worktrees/p1-u6w)
- `git -C D:/vc/.worktrees/p1-u6w status --porcelain` and `git -C D:/vc/.worktrees/p1-u6w diff cb1ad5b -- apps packages`: the code must equal cb1ad5b. Any code diff: STOP and report.
- Verdicts, both Cycle checked 1: A PASS 02a187c (qa/verdicts/p1-u6w-rank-wiring.A.md), B PASS 64f53f9 (qa/verdicts/p1-u6w-rank-wiring.B.md). Senior reviews: cycle 0 Warning (D:/vc/qa/evidence/p1-briefs/p1-u6w-review-result.md), cycle 1 Approve (D:/vc/qa/evidence/p1-briefs/p1-u6w-c1-review-result.md).
- Mint qa/issues.jsonl rows (copy the field names of the last row on D:/vc main; start at max+1 of D:/vc main's ISS ids) from every PROPOSED-ISSUE still open in both sides' cycle-0 and cycle-1 verdicts (the cycle-0 verdicts are in git history of p1/u6w), and from the open lows, test gaps and open questions of both reviews. Rows already fixed by the repair (A P1, A P4, B P1-P3, the vacuous C5 spy, the attributed-status medium) are NOT re-minted. Dedupe identical findings across sources into one row citing all sources. ISS-163 is FIXED by this unit: flip it to fixed citing both verdicts (do not create a duplicate).
- Flip the manifest to `Status: checked-PASS`, citing both verdict paths and shas. Commit narrow pathspecs on p1/u6w: "qa: p1-u6w-rank-wiring close-out (dual PASS)".

## 2. Integrate
- `git -C D:/vc worktree add D:/vc/.worktrees/int-u6w main --detach`. In it: `git merge --no-ff p1/u6w -m "merge p1/u6w: U6w rank wiring (dual PASS 02a187c/64f53f9, review Approve)"`. qa/issues.jsonl is merge=union. Any other conflict: STOP and report the files.
- Add new medium-or-higher rows at the top of "Candidates (human picks)" in qa/QUEUE.md and the rest under Candidates, one line each, as a separate commit.

## 3. 6c (full suite, .13-2a)
1. `python contracts/verify_contracts.py`.
2. `pnpm install --offline --frozen-lockfile` (compare the lockfile hash with main first; with C: full, set the pnpm store/virtual-store and TMP/TEMP to D: paths if needed; if install would need C: space, STOP and report).
3. Collection check across all packages.
4. FULL suite via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -r test` (no -x or maxfail), with TMP/TEMP pointed at D:, plus `pnpm -r typecheck`. Mongo-dependent skips are the known baseline (45 in engine). Any new red: name its owner, STOP, no stamp. An OOM or disk failure is ENVIRONMENTAL: report it, PASS nothing.
5. `git diff --stat origin/main...HEAD` to confirm only apps/api and qa changed (plus already-pushed-equal paths).
6. If green: run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` inside D:/vc/.worktrees/int-u6w (tree clean first). DO NOT COMMIT qa/.6c-green. Then run `tick.mjs --push-gate` there.

## Return (max 8 lines)
Close-out sha, ISS range, merge sha, int-u6w HEAD, validator, full-suite totals per package, typecheck, diff-scope line, and the push-gate stdout line with its exit code.
