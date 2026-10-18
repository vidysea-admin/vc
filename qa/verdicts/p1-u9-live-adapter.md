# Verdict p1-u9-live-adapter (repair check, brief rewrite 1)
Cycle checked: rw1 (brief rewrite 1, fix cycle 1 of max 2)
Date: 2026-10-19 · Checker: /checker Mode A repair subagent (fresh context) · Policy: proportional-verification/2026-10-17.14 (+.15 rules at dispatch)
Base 47ab62a · Repair base f42740e (verified with git; cycle-2 PASS head) · Code da32f8a · Head 73dc74f (git rev-parse; worktree clean; live.ts blob 2e3101d, live.test.ts blob c157273, both read from git, equal to the manifest's) · Integration branch main

VERDICT: PASS
SCOREBOARD: 6/6 criteria met (C4 re-proved for H1 and Low; C1, C2, C3, C5, C6 keep recorded results, whole file re-run green 70/70)
TIER: M (provider seam, mock only; no auth, tenancy or prod-write trigger in the repair diff)
FAILURES: none

## Plan
Repair diff f42740e..da32f8a read in full: live.ts and live.test.ts (172 insertions, 12 deletions across the two files). `git diff --name-only 47ab62a..HEAD | grep -v -E '^(packages/providers/|qa/)'` printed nothing (no file outside the declared scope). Repaired: H1 (crisis mute lifts only on a student chunk after a turnComplete/interrupted AND >= crisisResumeGapMs since the LAST student chunk; turnComplete and a final flag no longer end the utterance while muted) and Low (a spoken crisis in a new utterance refires; same-utterance duplicates do not).

## Evidence (clean copy outside the bound tree, via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh python -X utf8 chk-u9rw1/run.py`; files in qa/evidence/p1-u9-check/rw1/)
- Clean copy `tsx --test tests/live.test.ts`: tests 70, pass 70, fail 0. `tsc --noEmit`: rc 0, no output. (Maker's evidence rw1-green.txt agrees: same counts; I re-ran rather than reuse.)
- My own hostile probes chkrw1.test.ts (13 tests, mine, injected monotonic clock): pass 13, fail 0. Coverage of the brief's variants:
  - a. crisis -> turnComplete -> same-utterance chunk at 300 ms -> model audio: 0 emitted, 1 crisis, 1 fixed audio; same with final=true on the chunk; dense chunks every 100 ms for 5 s after turnComplete never lift (a2).
  - b. crisis -> interrupted -> chunk at 1300 ms: heard (1). Boundary: gap 1200 exactly heard, 1199 muted. b2: no turnComplete/interrupted, chunk after 60 s and 120 s (also final=true): still muted.
  - c. crisis -> toolCall -> turnComplete -> chunk 100 ms later: 0 model audio, 1 crisis. c2: crisis -> toolCall only -> chunk after 9 s: muted.
  - d. new-utterance second crisis refires (lift chunk itself a crisis: 2 crises, 2 fixed audios); duplicates in that utterance stay at 2 (even "I will kill myself" repeated); re-armed mute; a third crisis after another turn end + pause fires (3). d2: harmless lift chunk (model heard), crisis in a later chunk of the new utterance refires once, further chunk does not.
  - e. a typed harmless message after crisis + turnComplete + 10 s and again at 20 s never lifts the mute and the model's reply words are not stored; a typed crisis during the spoken-crisis mute fires again and does not lift.
  - no-regression: client interrupt() mute with no crisis still lifts at turnComplete; no detector configured -> model audio passes; crisisResumeGapMs of -1, NaN, Infinity throws LiveConfigError; default performance.now() clock: crisis -> turnComplete -> immediate chunk stays muted in real time.
- Falsification, one isolated copy per mutant, whole live.test.ts + my probes (83 tests) against each, clean copy green first (above):
  - H1a (turnComplete back to `flushUser(true)`, the reviewer's original defect): rc 1, 1 fail: "C4 crisis Low: ... duplicate in that utterance does not". Note: the mute itself holds without H1a because the gap rule guards it, so this mutant bites the no-double-fire half (a refire of stale crisis words), which is the right consequence.
  - H1b (lift condition 1 dropped, gap only): rc 1, 3 fail: my b2 and c2 plus the maker's "C4 crisis H1: ...backend never ended its turn; still muted".
  - Low (the lift no longer ends the crisis utterance, `flushUser(true)` removed): rc 1, 3 fail: my d, the maker's "C4 crisis Low: a second spoken crisis ..." and "C4 crisis low: a client that mutates the helpline audio buffer".
  - All failed on named assertions, not import errors. The maker's own record (rw1-falsification.txt: H1 gap dropped rc=1 fail=4, Low rc=1 fail=2, restored 70/70) was read and is consistent; its H1 mutant differs from mine, so H1 is falsified three ways in total.

## Existing tests changed by the builder (f): ALLOWED, none weakened
`git diff f42740e..da32f8a -- tests/live.test.ts | grep '^-[^-]'` prints exactly 4 removed lines, all the same `rig({ detectCrisis, crisisMessage: FIXED })` line, each replaced by the same call plus `monotonicNow: () => mono` (and a `let mono = 0;`). The only other additions in those 4 tests are `mono = 3000;` pause lines, plus one `r.backend.emitTurnComplete();` in "a client that mutates the helpline audio buffer" (a precondition so the second crisis counts as a new utterance under the rewritten rule). Every assertion is unchanged; no assertion deleted, no threshold lowered, no skip/xfail added.

## Non-blocking observations (low, no FAIL)
- L1: the `interrupted` event that Gemini echoes after OUR crisis backend-interrupt counts as the turn end (rule 1 says "turnComplete (or interrupted)"). A student who pauses 1.2 s or more mid-sentence after that echo lifts the mute for the rest of the same sentence. By the brief's wording; a G-REAL / A10 live question (is 1200 ms the right gap on real Gemini), not provable offline.
- L2: a typed message never updates the resume-gap clock or lifts the mute (D-096 as worded); unchanged from cycle 2.
- Carried: cycle-1 lows (close-before-attach replay; M3 byteLength check).

Metrics: start=2026-10-19T00:22:16+05:30 end=2026-10-19T00:27:30+05:30 wall_min=6 agent_min=unavailable blocked_min=1 suite_runs=0 repeat_runs=1 mutations=3 cycle=1 brief_rewrite=1 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-17.14 lane=normal check_s=unavailable mutants=3 defects_unit=0 defects_6c=0
(repeat_runs=1: my first run crashed on a backslash escape in my own runner script before any test ran; fixed and re-run, not a product failure. blocked_min = testlock wait behind a p1-u11 coverage run. mutants=3 are the floor (1 per changed criterion H1, Low) plus one extra H1 mutant; slow: none.)
