# Senior review: t059-promise-floor (fa678fb4..dc3f33b6)
Date: 2026-10-30 · reviewer: senior-software-engineer agent (fresh) · VERDICT: Warning
Reviewer's run: student-graph.test.ts 142/142, plus 29 ad-hoc probes compared against base.

## Medium
- M1 graph.ts:758 NA_NEGATION: a `na` directly before the phrase still cancels a promise. "Aap join kar lo na pakka milega", "Aao na guaranteed admission" and "ye admission hai na pakka" are all missed (also missed at base; same class as T-059). Fix: drop NA_NEGATION or require a clause-initial `na`; add these sentences to T059_PROMISES.
- M2 graph.ts:~744 CLAUSE_BREAK decimal change: REGRESSION. "No 2.5 GPA needed admission guaranteed" was flagged at base and is missed now (an earlier "no" spans the decimal).

## Low
- L1 NOBODY_BEFORE: "Nobody will definitely get rejected here" is flagged at base and missed now. Option: limit it to guarant/garanti/assur phrases.
- L2 Devanagari: the danda "।" is not a clause break, and "कोई भी" is not an idiom, so "कोई भी आए। एडमिशन पक्का" is missed (also missed at base).
- L3 `^\s*na` at the cut edge of the window: theoretical, not reproduced.

Linear time: pass (0.4-7 ms on 20k-character hostile input).
Hygiene: an untracked packages/engine/tests/zz-probe-tmp.ts is in the worktree; it must not be committed.
