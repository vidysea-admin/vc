# Senior review (read-only): eng3 fix cycle 2, packages/engine/src/guards/crisis.ts
Worktree C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-eng3, diff `git -C <wt> diff 0cc886c..ba4e2bf`. Read the cycle-1 Block D:/vc/qa/evidence/p1-briefs/p1-eng3-c1-review-result.md and D-020 (recall over precision) in D:/vc/docs/DECISIONS.md. Your earlier probes are in scratchpad/eng3c1rev/; reuse them.
This is a crisis detector for students, many of them minors.
Judge:
- Does the inverted matchPointContinuing restore every base-crisis row with no new recall loss against base 559a421? Compare the base file, 0cc886c and ba4e2bf on the same inputs.
- Is the new matchPointContinuingPunctuated on the folded raw text linear, and is the normalise/foldText split behaviour-preserving for the existing views?
- Is the "ll" fold of a run of 3+ l's in the 1->l view free of a new false negative (for example "skill", "kill", "all", "will")?
- Is any test weakened?
Run tests only via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh`. Never edit the worktree. Return Approve / Warning / Block with file:line evidence.
