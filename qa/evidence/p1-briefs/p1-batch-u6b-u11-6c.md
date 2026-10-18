# You are /checker running close-out + merge + the 6c pre-push check for the batch U6b + U11 + U9
- Protocol C:/Users/Lenovo/.claude/skills/checker/SKILL.md (Mode A, 6c). Policy .14 with .13 pre-push rules (.13-1 behaviour-scoped set + full collection; no .13-2 trigger: U6b/U11 are engine-only, U9 is packages/providers only; tiers S/M).
- S = C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad. Use `git -C <dir>`, never `cd X && cmd`. Never `git add -A`. Never touch .claude/**. Do NOT push. Do not touch the D:\vc working tree.

## 1. Close-outs (each on its own branch)
- U6b, S/p1-u6b (p1/u6b, verdict PASS a3976d8 at qa/verdicts/p1-u6b-profile-ranking.md). U11, S/p1-u11 (p1/u11, verdict PASS d6688d9 at qa/verdicts/p1-u11-coverage-report.md).
- U9, S/p1-u9 (p1/u9, verdict PASS f53b50a at qa/verdicts/p1-u9-live-adapter.md, Cycle checked rw1; senior review Approve saved at D:/vc/qa/evidence/p1-briefs/p1-u9-rw1-review-result.md). U9 ISS ids ISS-175..ISS-182: one row per review test gap (M5, M7, M8/M9 survivors) and one per residual risk (turn-end ambiguity without a turn id, silence after crisis fails closed, mid-sentence 1.2 s pause), all low, G-REAL/A10 tagged where relevant.
- Mint qa/issues.jsonl rows from each verdict's PROPOSED-ISSUE lines and open risks. ISS ids: U6b gets ISS-163..ISS-168, U11 gets ISS-169..ISS-174 (main max is ISS-162). Copy the field names of the last row. The U6b medium (confirmed chat facts stored as source `chat` are ignored by rankOptions unless mapped) carries the note "fix: U6b wiring step (CORE-REQUEST)".
- Flip each manifest to `Status: checked-PASS`, citing its verdict path and sha. Commit narrow pathspecs on each branch: "qa: <slug> close-out (PASS)".

## 2. Integrate
- `git -C D:/vc worktree add S/int-b2 main --detach` (D:/vc main = 76b89c5: origin/main 5f4a7d1 + one qa gate commit). In S/int-b2: `git merge --no-ff p1/u11 -m "merge p1/u11: U11 coverage report (PASS d6688d9)"`, then `git merge --no-ff p1/u6b -m "merge p1/u6b: U6b profile ranking (PASS a3976d8)"`, then `git merge --no-ff p1/u9 -m "merge p1/u9: U9 live adapter crisis mute (PASS f53b50a, review Approve)"`. qa/issues.jsonl is merge=union. Any other conflict: STOP and report the files.
- Add the non-medium new rows under "Candidates (human picks)" in qa/QUEUE.md (one line each), as a separate commit in S/int-b2.

## 3. 6c (scoped)
1. `python contracts/verify_contracts.py`.
2. `pnpm install --offline --frozen-lockfile` (compare the lockfile hash with main first).
3. Collection check: every package's test files collect (exit 0 for all 9 packages).
4. Behaviour-scoped set via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh ...`: packages/engine tests/rank.test.ts, tests/capability-manifest.test.ts, tests/student-graph.test.ts, evals/coverage.test.ts, plus the whole engine package test (`pnpm -C packages/engine test`), plus the whole providers package test (`pnpm -C packages/providers test`), plus `pnpm -r typecheck`. Any new red: name its owner; STOP, no stamp.
5. Confirm with `git diff --stat origin/main...HEAD` that no file outside packages/engine, packages/providers and qa (and the one package.json script line) changed.
6. If green: `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` inside S/int-b2 (tree clean first). DO NOT COMMIT qa/.6c-green. Then `tick.mjs --push-gate` inside S/int-b2.

## Return (max 8 lines)
close-out shas, merge shas, int-b2 HEAD, validator, test totals, typecheck, diff-scope line, push-gate stdout line + exit code.
