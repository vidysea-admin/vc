# You are a /maker build subagent: U7 (p1-u7-anon-mode) close-out and merge
S = C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad.
- Use `git -C <dir>`, never `cd X && cmd`.
- Never `git add -A`; stage with narrow pathspecs only.
- Never touch .claude/**.
- Do NOT push.

Both blind coordinators PASSED at cycle 0 on branch p1/u7 (S/p1-u7, head 975ccac):
- A: qa/verdicts/p1-u7-anon-mode.md
- B: qa/verdicts/p1-u7-anon-mode.b.md

## 1. Close out, on p1/u7 in S/p1-u7
1. **Mint ISS rows.** Read the PROPOSED-ISSUE lines in BOTH verdicts, and the review D:/vc/qa/evidence/p1-briefs/p1-u7-review-result.md.
   - Append them to qa/issues.jsonl as new rows, using the existing row schema (copy the field names of the last row). Number the ids by continuing the highest ISS-<n> in the file.
   - Merge duplicates into one row: A's "crisis exemption no CPU budget", B's P1 and review M1 are ONE row (severity medium, type security), with all three cited as evidence.
   - Each remaining distinct finding gets its own row, including review L1 (crisis flood inflates the counter) and A's findings 2-5 and B's P2-P5. Drop exact duplicates only.
2. **Candidates.** In qa/QUEUE.md, under the "Candidates (human picks)" section:
   - add the security row at the TOP, marked `priority: security`;
   - add the others below it, one line each with its ISS id.
   - Do not add TODO rows.
3. **Manifest.** Flip qa/manifests/p1-u7-anon-mode.md to `Status: checked-PASS`, citing both verdict paths and SHAs (ede16bb for B, 975ccac for A). Fill `defects_unit` in Metrics if absent; leave the other fields as they are.
4. If TASKS.md or .goal/goal.json carries a U7 / anon-mode task, mark it done, citing both verdicts.
5. Commit on p1/u7: "qa: p1-u7-anon-mode close-out (dual PASS), ISS rows and candidates".

## 2. Integrate
1. `git -C D:/vc worktree add S/int-u7 main --detach`. D:/vc main is 8d82fe4, docs only above origin/main.
2. In S/int-u7, `git merge --no-ff p1/u7 -m "merge p1/u7: U7 anonymous mode (dual PASS ede16bb/975ccac)"`.
   - qa/issues.jsonl uses merge=union.
   - On any other conflict, STOP and report the files. Never force-resolve.
3. Run `python contracts/verify_contracts.py` in S/int-u7.

**Return ONE line:** `p1-u7-closeout <closeout sha> int-u7 <merge sha> ready`, or `p1-u7-closeout CONFLICT <files>`.
