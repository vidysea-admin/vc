# You are /checker running U8 (p1-u8-chat-api) close-out merge + the 6c pre-push integration check (FULL suite, .13-2a: auth/tenancy L)
- Protocol: C:/Users/Lenovo/.claude/skills/checker/SKILL.md (Mode A, 6c). Policy .14 with .13 pre-push rules.
- S = C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad. Use `git -C <dir>`, never `cd X && cmd`. Never `git add -A`. Never touch .claude/**. Do NOT push. Do not touch the D:\vc working tree.
- Both blind coordinators PASSED cycle 0 on p1/u8 (S/p1-u8): B = qa/verdicts/p1-u8-chat-api.b.md (86c04db), A = qa/verdicts/p1-u8-chat-api.md (b1aadea).

## 1. Close-out on p1/u8 (S/p1-u8)
- Mint qa/issues.jsonl rows from the PROPOSED-ISSUE lines in BOTH verdicts and from D:/vc/qa/evidence/p1-briefs/p1-u8-review-result.md (M1, M2, lows, test gaps). Use ids ISS-147 to ISS-170 ONLY (reserved for U8; main max is ISS-146). Copy the field names of the last row. Merge duplicates into one row citing all sources. Rows the U8 repair unit p1-u8r will fix (review M1 fail-open redaction, review M2 crisis flood, A1 lowercase names, A2 student-stated name in model reply, B medium crisis rationale text) get a note "fix: p1-u8r".
- Add the other rows under "Candidates (human picks)" in qa/QUEUE.md, one line each. That section exists only on main: if missing on p1/u8, add the candidate lines after the merge as a separate commit in the integration tree.
- Flip qa/manifests/p1-u8-chat-api.md to `Status: checked-PASS`, citing both verdict paths and shas. Mark any U8 task in TASKS.md / .goal/goal.json done, citing both verdicts.
- Commit narrow pathspecs: "qa: p1-u8-chat-api close-out (dual PASS), ISS-147.. rows".

## 2. Integrate
- `git -C D:/vc worktree add S/int-u8 main --detach` (D:/vc main = 294335c, docs only above origin/main 114b30b). In S/int-u8: `git merge --no-ff p1/u8 -m "merge p1/u8: U8 chat API (dual PASS 86c04db/b1aadea)"`. qa/issues.jsonl is merge=union. Any other conflict: STOP and report files.

## 3. 6c FULL suite
1. `python contracts/verify_contracts.py`.
2. node_modules: `pnpm install --offline --frozen-lockfile` in S/int-u8 (compare the lockfile hash with S/p1-u8 first).
3. Collection check: every package collects.
4. FULL suite: `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -r test` (no bail) + `pnpm -r typecheck`. The ~45 Mongo skips are baseline (qa/checkpoints/baseline-reds.md). Any new red: name its owner by intersecting failing files with the U8 What-changed list; STOP, no stamp.
5. If green: `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` inside S/int-u8 (tree clean first). DO NOT COMMIT qa/.6c-green. Then `tick.mjs --push-gate` inside S/int-u8.
- Kill only PIDs you started. Long lock waits are normal.

## Return (max 8 lines)
close-out sha, merge sha, int-u8 HEAD, validator, per-package suite totals, typecheck, new reds + owner, push-gate stdout line + exit code.
