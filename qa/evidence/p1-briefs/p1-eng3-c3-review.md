# Senior review (read-only): eng3 fix cycle 3 (extra, D-098), packages/engine/src/guards/crisis.ts
Worktree C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-eng3, diff `git -C <wt> diff ba4e2bf..798a31e`. Read your cycle-2 Warning D:/vc/qa/evidence/p1-briefs/p1-eng3-c2-review-result.md, the cycle-2 FAIL (LEET_BEFORE_LETTER quadratic) in qa/verdicts/p1-eng3-crisis-leftovers.md, D-098 and D-020 (recall over precision) in D:/vc/docs/DECISIONS.md. Your earlier probes are in scratchpad/eng3c2rev/ and scratchpad/eng3c3/; reuse them.
This is a crisis detector for students, many of them minors.
Judge:
- Does the inverted matchPointContinuing restore every base-crisis row with no new recall loss against base 559a421? Compare the base file, 0cc886c and ba4e2bf on the same inputs.
- Is the new matchPointContinuingPunctuated on the folded raw text linear, and is the normalise/foldText split behaviour-preserving for the existing views?
- Is the "ll" fold of a run of 3+ l's in the 1->l view free of a new false negative (for example "skill", "kill", "all", "will")?
- Is any test weakened?
Run tests only via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh`. Never edit the worktree. Return Approve / Warning / Block with file:line evidence.
- Also judge: the anchored LEET_BEFORE_LETTER is behaviour-identical to the old one on non-pathological text; the 240-char window and the POINT_DISTRESS set; the >20 suppressed-match cap; the removed dead branches lose no recall.
