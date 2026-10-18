# You are /checker running close-out merge + the 6c pre-push integration check for testlock 2-slot
- Protocol: C:/Users/Lenovo/.claude/skills/checker/SKILL.md (Mode A, 6c). Policy .14 with the .13 pre-push rules.
- S = C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad
- Use `git -C <dir>`, never `cd X && cmd`. Never `git add -A`. Never touch .claude/**. Do NOT push. Do not touch the D:\vc working tree.

## 1. Close-out on p1/testlock (S/p1-testlock, head c897937, verdict PASS committed 07b0641/c897937)
- Flip qa/manifests/p1-testlock-2slot.md to `Status: checked-PASS`, citing qa/verdicts/p1-testlock-2slot.md and its sha. If the verdict has PROPOSED-ISSUE lines, append rows to qa/issues.jsonl with ids ABOVE ISS-145 (the max on origin/main; check `git -C D:/vc show origin/main:qa/issues.jsonl` for the true max) and list them under "Candidates (human picks)" in qa/QUEUE.md. Add a low row for the checker's note "control suite red once under 6 parallel copies (load sensitivity)".
- Commit narrow pathspecs: "qa: p1-testlock-2slot close-out (PASS)".

## 2. Integrate
- `git -C D:/vc worktree add S/int-tl origin/main --detach` (origin/main = 9f5bbac). In S/int-tl: `git merge --no-ff p1/testlock -m "merge p1/testlock: 2-slot test lock (PASS <verdict sha>)"`. qa/issues.jsonl is merge=union. Any other conflict: STOP and report files.

## 3. 6c (scoped per .13-1: the diff touches only scripts/vc-testlock*.sh + qa)
1. `python contracts/verify_contracts.py` in S/int-tl.
2. Behaviour-scoped set: `bash scripts/vc-testlock.test.sh` in S/int-tl, run ALONE (it is load sensitive). Record totals.
3. Confirm the diff vs origin/main touches no product package (git diff --stat origin/main...HEAD). If it does, STOP and report.
4. If green: `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` inside S/int-tl (tree clean first). DO NOT COMMIT qa/.6c-green — it must stay uncommitted (committing it invalidates the gate). Then `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --push-gate` inside S/int-tl.

## Return (max 6 lines)
close-out sha · merge sha · validator line · vc-testlock.test.sh totals · diff-scope line · push-gate stdout line + exit code.
