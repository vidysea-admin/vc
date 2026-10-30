# Verdict: t059-promise-floor

Cycle checked: 1
Checked: 2026-10-30T23:33:00+05:30
Verdict: PASS
Artifact: worktree D:/vc/.worktrees/vc-completion/.worktrees/t059-promise-floor, branch wave/t059-promise-floor, repair base d79b49f8 (cycle-0 PASS, renamed to t059-promise-floor.r0-1.md), head e048c2ff. Mode A repair check, tier M, single checker.
Policy-Version: proportional-verification/2026-10-19.17

## Scope scan
`git diff --stat d79b49f8..e048c2ff` = packages/engine/src/student/graph.ts (promise section only: CLAUSE_BREAK, IDIOMATIC_NEGATION, NOBODY_BEFORE/GUARANTEE_WORD, negatedBefore, one call site), packages/engine/tests/student-graph.test.ts (+13, 0 deletions), qa/manifests/t059-promise-floor.md. Nothing outside D-142 authorization. Repair diff read in full. No test removed or weakened (only appended sentences). The stray zz-probe-tmp.ts is absent; `git status` empty before and after.

## Executed checks (this checker)
- `cd packages/engine && npx tsx --test tests/student-graph.test.ts` on head -> tests 142, pass 142, fail 0 (flag, neutral and linear-time tests ok; linear guard 6.2 ms vs 50 ms).
- Importers (lk5, coach-first, crisis-defaults, lang, pathlynks-tools, capability-manifest, evals/coverage) -> tests 232, pass 232, fail 0.
- Throwaway copy of the promise section (scratchpad/t059r1, outside the root), head vs base (d79b49f8), my own probe:
  - R1 base MISS -> head flagged "No 2.5 GPA needed admission guaranteed"; neutral "There is no 99.9 percent guarantee", "Not 99.9 percent guaranteed" stay neutral.
  - R2 base MISS -> head flagged "Aap join kar lo na pakka milega", "Aao na guaranteed admission", "ye admission hai na pakka"; "Na pakka hai", "Na pakka hai, koi guarantee nahi" neutral.
  - R3 base MISS -> head flagged "Nobody will definitely get rejected here"; "Nobody can guarantee admission", "Nobody will guarantee a seat", "None can guarantee a visa" neutral.
  - R4 base MISS -> head flagged "कोई भी आए। एडमिशन पक्का" (also the no-danda and "कोई नहीं आया।" forms); "कोई भी गारंटी नहीं दे सकता", "कोई गारंटी नहीं। सब मेहनत पर है" neutral.
- Falsification, one per criterion, each in its own copy (judged the builder's Falsification[R1..R4]; they hold):
  - R1: decimal rule back to `\.(?!\d)` -> "No 2.5 GPA needed admission guaranteed" UNFLAGGED (red).
  - R2: `na` right before the phrase negates again -> all three R2 promises UNFLAGGED (red).
  - R3: NOBODY_BEFORE applied without GUARANTEE_WORD -> "Nobody will definitely get rejected here" UNFLAGGED (red).
  - R4: danda removed plus `कोई\s+भी` removed -> the R4 acceptance sentence UNFLAGGED (red). Removing only the idiom leaves the danda sentence flagged (the danda pins the second form), removing only the danda leaves it flagged via the idiom; both facts match the builder's note.

## Hostile variants (ad-hoc, not left in the tree)
Held neutral on head (and on base): "admission na mile to bhi chalega", "Admission na mile to koi baat nahi", "Is baar admission na hua to bhi theek hai", "Na guarantee, na pakka", "Koi bhi guarantee nahi de sakta", "Tuition is 2.5 lakh. Nobody can guarantee a seat", "CGPA 3.5 aur admission guarantee nahi hai", "We charge 2.5 percent, no guarantee of admission", "The 99.9 percent figure is not a guarantee", "There is no 100 percent guarantee", "Version 2.5 does not guarantee admission", "In 2.5 years nobody can guarantee a job", "कोई भी एडमिशन की गारंटी नहीं दे सकता", "कोई नहीं बता सकता कि एडमिशन पक्का होगा", "मैं गारंटी नहीं दे सकता। एडमिशन मेहनत से मिलता है". Promises still flagged: "Bhai na, admission guaranteed", "Version 2.5 is out and admission is guaranteed", "GPA 3.5. Admission guaranteed", "आप आइए॥ एडमिशन पक्का", "Aap na aaiye, admission pakka hai".

## Criteria
- R1 PASS, R2 PASS, R3 PASS, R4 PASS: each failed sentence flagged, each paired neutral unflagged, red under mutation.
- No regression PASS: all cycle-0 T059_PROMISES/T059_NEUTRAL and every existing test green, linear-time guard holds, scope inside D-142.

## Findings (non-blocking, PROPOSED ledger rows, severity low)
All are new over-flags on warning text versus base, the flag-over-miss direction the manifest and cycle-0 verdict document, and each is the inverse of a required R fix (the same surface form cannot be told apart without semantics):
- F1 (R1 cost) "No 2.5 GPA guarantee exists" and "There is no 2.5 guarantee" are now flagged (a decimal not followed by percent is a clause break, so an earlier "no" no longer reaches the phrase). Same structure as the R1 promise.
- F2 (R2 cost) "Admission ke liye na guarantee hai na pakka" and "Yahan na guarantee hai, na kuch pakka" ("neither ... nor", neutral) are now flagged. Same structure as "Aao na guaranteed admission".
- F3 pre-existing, unchanged by this repair (flagged on base too): "Nobody can say admission is guaranteed", "Nobody can promise a seat; nothing is guaranteed", "Nobody will say it is guaranteed", "कोई भी यह नहीं कह सकता कि एडमिशन पक्का है".
None of F1-F3 is a false positive on reassuring advice: all are cautionary text routed to the safe (flagged) side. Not a FAIL.

Metrics: start=2026-10-30T23:23:26+05:30 end=2026-10-30T23:33:00+05:30 wall_min=10 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=4 cycle=1 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=574 mutants=0 defects_unit=0 defects_6c=0
slow: probe-harness 4 (a mis-escaped mutation string cost one rerun; the first R1/R2/R4c mutants did not apply and were redone)
