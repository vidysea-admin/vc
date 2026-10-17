FLAKY_FIX: PASS
Checker: c9b-flaky-checker, 2026-10-17. Commit faed073 (parent 13207bd), worktree at scratchpad/c9b (D:/vc tree untouched).

(1) DIFF: `git diff --name-only 13207bd faed073` = packages/engine/tests/concern-classifier.test.ts + crisis-escalation.test.ts only (28+/14-). No assert removed or loosened; all assert messages intact. Changes: deadlines raised (50->500, 20/80/60/100 -> 100/1000/300/1200 keeping the same ordering recipient-delay > writer budget AND > remaining budget after annotation; 50ms classify timeout -> 1500 with provider timeout 5000 -> 20000), fixed sleeps replaced by awaited events (stub close event bounded 10s; hold.applied promise; poll 30->1000 iterations). holdSafetyUpdate still calls the original updateOne after release, same product path. Product code untouched.
(2) DISCRIMINATION (product mutated in worktree, restored via git checkout after each; final git status clean):
 M1 remove controller.abort() in classifyConcern timeout timer: 3 RED (real in-flight LiteLLM cancel control, signal-abort control, T047 held classifier authority). 60/63 pass.
 M2 remove late-settlement compensation in fencedWrite (both settled branches): 6 RED incl. "late notification/annotation/acknowledgement settlement compensates", "late newly inserted notifications are deleted", "background late annotation compensation failure emits alert". 57/63 pass.
 M3b reviewDeadline +600s (writer-budget expiry removed): T047 publication budget RED (also RED on ORIGINAL test).
 M3c recipients not raced + publication write without budget: T047 publication budget RED (also RED on original, 40/41).
 M3a (reviewDeps drops budget only): GREEN on both new AND original test -> pre-existing blind spot, not introduced by faed073 (outer review wrapper covers that path).
 Baseline unmutated: 63/63 pass.
(3) STABILITY: 6 parallel runs of both files: 6/6 exit 0, each 63 tests 63 pass 0 fail. Full `bash scripts/vc-testlock.sh pnpm --filter @vc/engine test`: tests 816, pass 771, fail 0, cancelled 0, skipped 45 (skips originate in untouched files b18-suppression-outcome/loader tests), 98.8s. C: at 97% used but no OOM seen.
Risks: only M3a undetected (pre-existing). The 10s bounded wait in the cancel test makes a RED case slow (20s) but not flaky.
