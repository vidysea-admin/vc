# Execute landing steps 1-2 for the D:\vc dirty tree (D-093 item 14)
You are a /maker build subagent. S = C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad.
Plan: S/landplan-20261017.md. Read it first; it names the groups and the exact paths.

**Hard limits in D:\vc**
- Never run checkout, reset, stash, clean, merge, rebase, `git add`, or any write to its index.
- Never delete or move files.
- Never touch .claude/**.
- Never push.

**Step 1. Save the G4 T-052 WIP to its own branch.** Use a temporary index only, so the checkout and its normal index are never touched:
```
export GIT_INDEX_FILE=S/wip.idx
git -C D:/vc read-tree 36bae79
git -C D:/vc add -- <G4 paths>          # this goes into the temporary index only
T=$(git -C D:/vc write-tree)
C=$(git -C D:/vc commit-tree $T -p 36bae79 -m "wip: T-052 cycle2 working tree (not checker-PASS; never merge to main)")
git -C D:/vc update-ref refs/heads/wip/t052-cycle2 $C
```
Then prove it: for every G4 path, `git -C D:/vc rev-parse wip/t052-cycle2:<path>` must equal `git -C D:/vc hash-object <path>`. Report the count that match and any that don't.

**Step 2. Land G1, G2 and G3 on a branch off main.**
- Create the worktree with `git -C D:/vc worktree add S/land-20261017 -b land/20261017 origin/main`.
- One commit per group, each with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

- **G2 evidence and the plan-draft v8 files:** copy them over from the D:\vc working tree.
- **G1 qa state:**
  - qa/issues.jsonl is the union: origin's lines in their order, plus the local lines that origin lacks, appended.
  - Copy feedback-inbox.md, gates/plan-approved.md and .last-tick only if origin's content is a prefix of the local content, after CRLF normalisation. Otherwise stop and report.
- **G3 docs/DECISIONS.md:** first verify that origin's file is a byte prefix of the local file after CRLF normalisation. Only then copy the local file. If not, stop and report the first differing line.
- **Audit:** `git -C S/land-20261017 diff origin/main -- docs/DECISIONS.md` must show zero removed lines.

**Return** at most 10 lines: the wip sha and its match count, the three land commit shas, and anything you stopped on.
