# You are /checker running close-out + merge + the 6c pre-push check for U10s (p1-u10s-voice-hardening, H1 H3 H4)
- Protocol C:/Users/Lenovo/.claude/skills/checker/SKILL.md (Mode A, 6c). Policy .15 with .13 pre-push rules. Tier L security dual-trigger (crisis escalation + flag gates) = .13-2a, so the FULL SUITE runs before the push.
- Everything on D: (TMP/TEMP, pnpm store/virtual store if needed). Use `git -C <dir>`, never `cd X && cmd`. Never `git add -A`. Never touch .claude/**. Do NOT push. Do not touch the D:\vc working tree. "No space left on device"/OOM = ENVIRONMENTAL: report, stamp nothing. Long test-lock waits are normal (other agents use it); keep waiting.

## 1. Close-out (on p1/u10s, worktree D:/vc/.worktrees/p1-u10s)
- `git -C D:/vc/.worktrees/p1-u10s diff c0237b7 -- apps packages` must be empty. Any code diff: STOP and report.
- Verdicts, both Cycle checked 0: A PASS 5c2f245 (qa/verdicts/p1-u10s-voice-hardening.A.md), B PASS a8b141b (qa/verdicts/p1-u10s-voice-hardening.B.md). Review Approve: D:/vc/qa/evidence/p1-briefs/p1-u10s-review-result.md.
- Commit (narrow pathspec) any untracked checker files on p1/u10s first (qa/ paths only).
- Mint qa/issues.jsonl rows (field names of the last row on origin/main; ids from max+1 of origin/main ISS ids, i.e. >= ISS-237; the U12 checker may also mint from ISS-237 on another branch — to avoid collision start this unit at ISS-260) from every PROPOSED-ISSUE in both verdicts and the review lows; dedupe. Flip ISS-228 (redact-throw), ISS-219 (turnId reuse) and ISS-234 (chat.ts trim) to fixed citing both verdicts (append updated rows per the ledger's existing convention; do not duplicate ids). ISS-229 (prefix-words) stays open, product decision. Add a low row: deploy configs must set VC_CHAT_ENABLED / VC_VOICE_ENABLED to the exact word "true" (startup now fails on padded values) — go-live checklist item.
- Flip qa/manifests/p1-u10s-voice-hardening.md to `Status: checked-PASS` citing both verdict paths+shas. Commit: "qa: p1-u10s-voice-hardening close-out (dual PASS)".

## 2. Integrate
- `git -C D:/vc worktree add D:/vc/.worktrees/int-u10s main --detach`. In it: `git merge --no-ff p1/u10s -m "merge p1/u10s: U10s voice safety hardening H1 H3 H4 (dual PASS 5c2f245/a8b141b, review Approve), voice OFF"`. qa/issues.jsonl is merge=union. Any other conflict in apps/ or packages/: STOP and report the files (qa/ conflicts: keep both sides' lines).
- Add new medium+ rows (and the priority: security ones) at the TOP of "Candidates (human picks)" in qa/QUEUE.md, the rest under Candidates, one line each, separate commit.

## 3. 6c (full suite, .13-2a)
1. `python contracts/verify_contracts.py`.
2. `pnpm install --offline --frozen-lockfile` (store/virtual-store/TMP on D: if needed; if it would need C: space, STOP).
3. Collection check across all packages.
4. FULL suite via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -r --workspace-concurrency=1 test` (no -x/maxfail), TMP/TEMP on D:, plus `pnpm -r typecheck`. Mongo-dependent skips are the known baseline (45 in engine). New red: name owner, STOP, no stamp. A red that passes alone on rerun with TMP on D: and is an ENOSPC/OOM in its message is environmental: rerun that package once.
5. `git diff --stat origin/main...HEAD` — only apps/api and qa/.
6. If green: `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` inside D:/vc/.worktrees/int-u10s (tree clean first). DO NOT COMMIT qa/.6c-green. Then `tick.mjs --push-gate` there.

## Return (max 8 lines)
Close-out sha, ISS range, merge sha, int-u10s HEAD, validator, full-suite totals per package, typecheck, diff-scope line, push-gate stdout line + exit code.
