# You are /checker running close-out + merge + the 6c pre-push check for U10w (p1-u10w-voice-wiring, combined U10 C1-C19 + W1-W10)
- Protocol C:/Users/Lenovo/.claude/skills/checker/SKILL.md (Mode A, 6c). Policy .15 with .13 pre-push rules. Tier L security dual-trigger (voice flag/WS auth/crisis) = .13-2a, so the FULL SUITE runs before the push.
- Everything on D: (TMP/TEMP, pnpm store/virtual store if needed). Use `git -C <dir>`, never `cd X && cmd`. Never `git add -A`. Never touch .claude/**. Do NOT push. Do not touch the D:\vc working tree. "No space left on device"/OOM = ENVIRONMENTAL: report, stamp nothing. Long test-lock waits are normal (other agents use it); keep waiting.

## 1. Close-out (on p1/u10w, worktree D:/vc/.worktrees/p1-u10w)
- `git -C D:/vc/.worktrees/p1-u10w diff 1c9fafb -- apps packages` must be empty. Any code diff: STOP and report.
- Verdicts, both Cycle checked 2: A PASS 1d28387 (qa/verdicts/p1-u10w-voice-wiring.A.md), B PASS ee0e5a1 (qa/verdicts/p1-u10w-voice-wiring.B.md). Cycle-1 FAIL verdicts: *.A.r1-1.md / *.B.r1-1.md. Reviews: D:/vc/qa/evidence/p1-briefs/p1-u10w-c1-review-result.md (Warning) and cycle-2 Approve (lows: chat.ts:124 trims flag; voice.ts:270 trims TRACING_VARS, safe).
- Commit (narrow pathspec) any untracked/staged checker files on p1/u10w first: qa/evidence/p1-u10w-A-c2/, the staged B.r1-1.md rename, etc. — only qa/ paths.
- Mint qa/issues.jsonl rows (field names of the last row on D:/vc main; ids from max+1 of D:/vc main ISS ids) from every PROPOSED-ISSUE in all four verdicts (A/B cycle 1 and 2) and the review lows. Dedupe identical findings into one row citing all sources. Rows that p1/u10s is fixing right now (redact-throw at voice.ts:801-802, no-words crisis turnId reuse voice.ts:804, chat.ts:124 trim) get `"status":"open"` plus `"note":"fix in flight: p1/u10s"`. The prefix-words medium (voice.ts:529-533 + live.ts:386-388) is `priority: security`, `"note":"product decision for Umesh"`.
- Flip qa/manifests/p1-u10w-voice-wiring.md to `Status: checked-PASS` citing both verdict paths+shas; the U10 manifest stays superseded-by. Commit: "qa: p1-u10w-voice-wiring close-out (dual PASS cycle 2)".

## 2. Integrate
- `git -C D:/vc worktree add D:/vc/.worktrees/int-u10w main --detach`. In it: `git merge --no-ff p1/u10w -m "merge p1/u10w: U10+U10w voice wiring (dual PASS 1d28387/ee0e5a1, review Approve), voice OFF"`. qa/issues.jsonl is merge=union. Any other conflict in apps/ or packages/: STOP and report the files (qa/ conflicts: keep both sides' lines).
- Add new medium+ rows (and the priority: security ones) at the TOP of "Candidates (human picks)" in qa/QUEUE.md, the rest under Candidates, one line each, separate commit.

## 3. 6c (full suite, .13-2a)
1. `python contracts/verify_contracts.py`.
2. `pnpm install --offline --frozen-lockfile` (store/virtual-store/TMP on D: if needed; if it would need C: space, STOP).
3. Collection check across all packages.
4. FULL suite via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -r --workspace-concurrency=1 test` (no -x/maxfail), TMP/TEMP on D:, plus `pnpm -r typecheck`. Mongo-dependent skips are the known baseline (45 in engine). New red: name owner, STOP, no stamp. A red that passes alone on rerun with TMP on D: and is an ENOSPC/OOM in its message is environmental: rerun that package once.
5. `git diff --stat origin/main...HEAD` — only apps/api, packages/db, packages/providers, pnpm-lock.yaml (if changed by U10w), qa/.
6. If green: `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` inside D:/vc/.worktrees/int-u10w (tree clean first). DO NOT COMMIT qa/.6c-green. Then `tick.mjs --push-gate` there.

## Return (max 8 lines)
Close-out sha, ISS range, merge sha, int-u10w HEAD, validator, full-suite totals per package, typecheck, diff-scope line, push-gate stdout line + exit code.
