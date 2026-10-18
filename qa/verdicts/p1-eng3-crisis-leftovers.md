# Verdict - p1-eng3-crisis-leftovers (Mode A, single checker, tier L)
Cycle checked: 0
Date: 2026-10-18 (checks ran 04:19-04:56 and 23:36-23:52 +05:30; the session was resumed once)
Checked state: base 52d2af5, code 8512f82, manifest commit 5153e93. Policy-Version: proportional-verification/2026-10-17.14

## Plan
Read the full diff (11 files, all under packages/engine plus the manifest; nothing outside it). Verified C1-C4 against D-093 2A/3A, ISS-125/126 and the five U6h PROPOSED-ISSUEs. Ran typecheck and the manifest's 20-file set through `vc-testlock.sh`. Ran extra downstream tests the manifest left out. Wrote four safety probes. Ran falsifications in a throwaway copy.

VERDICT: FAIL
SCOREBOARD: 3/4 criteria met (C2, C3, C4 met; C1 not met), 0/1 downstream invariants hold (apps/api crisis test now red)
TIER: L (crisis safety path, student-facing guards; no dual-check trigger)

FAILURES:
- [C1] sev high · The "kms" distance heuristic suppresses real crisis statements that contain the D-093 token "kms". `crisisGuard` returns `none` for "i keep thinking about kms", "thinking about kms every day", "i was almost kms tonight", "i wanna kms from the stress", "kms from this exam pressure", "i want to kms away from here". Cause: crisis.ts:629-636 (`DISTANCE_BEFORE` holds about/around/nearly/almost/some/x, and `DISTANCE_AFTER` holds from/away/far/per). The file's own rule is "anything else is a flag (recall-only, D-020)". Fix direction: suppress only when the previous token is a number or a plain quantity word (few/several/couple/many/hundred/thousand), drop the after-word suppression and the about/around/nearly/almost/some entries, and add these sentences as tests. Repro: `cd <wt>/packages/engine; node_modules/.bin/tsx <scratchpad>/eng3chk/probe5.mts` (checker probe) -> level `none` for each sentence above, while "i will kms", "kms 5", "maybe i should just kms" are `crisis` and "5 kms" stays `none`. issue: ISS-p1eng3-1
- [C1 downstream] sev medium · The engine change breaks a green apps/api test, and the unit declares no CORE-REQUEST for it. `apps/api/tests/anonymous-zero-persistence.test.ts:621-622` sends "I am thinking about ending things, what should I study?" and expects `sign_in_required`; it now gets `escalated`. On base 52d2af5 `crisisGuard` of that text is `none`, on HEAD `crisis` (probe6). The builder fixed the engine twin (student-graph.test.ts "U7 repair D") but not this one. Repro: `bash D:/vc/scripts/vc-testlock.sh pnpm -C <wt>/apps/api exec tsx --test tests/anonymous-route.test.ts tests/anonymous-zero-persistence.test.ts tests/server.test.ts tests/index.test.ts` -> tests 85, pass 84, fail 1 ("U7 repair D (API)"). Fix direction: change that input to non-crisis text, as in the engine twin (apps/api is U7's; send it as a CORE-REQUEST or edit after U7 close-out). issue: ISS-p1eng3-2

## Evidence (all executed by me; maker evidence not reused for the verdict)
- `pnpm -C <wt>/packages/engine typecheck` via testlock -> exit 0.
- The manifest's 20-file engine set via testlock -> tests 870, pass 825, fail 0, skipped 45 (matches the manifest).
- Selection review: the set omits two engine tests that import changed modules; run by me, `capability-manifest`, `source-kind`, `cards-verifier`, `guard-citation`, `guard-no-script` -> tests 41, pass 41, fail 0. It also omits apps/api (see the second failure).
- ISS-126 test repeated 3 times on HEAD -> pass 1/fail 0 each time (no flake).
- Falsification, copy `eng3chk/fals`, restored after each; baselines green: F1 `jeena nahi hai` pattern off -> 5 red (first: 'D-093 2A: ... "ab jeena nahi hai mujhe"'). F1b kms distance check off -> 4 red (precision tests "12 kms from the city centre"). F2 soft note off -> 4 red. F3 escalation.ts reverted to base -> ISS-126 test red (1). F4a claims.ts reverted -> 4 red. F4b no-quote.ts reverted -> 1 red. F4c followUp `numberMentions` clause off -> 1 red. Floor met for C1-C4.
- Probes (scratchpad `eng3chk/probe1..6.mts`):
  - Recall: every D-093 phrase and its spaced, punctuated, leet, homoglyph, zero-width, fullwidth and Devanagari forms fired (about 80 of 95 inputs; the misses are below). Precision: "50 kms", "a few kms away", "kill this exam", "MS in CS", "I don't see the point of this course" stayed `none`. Stress: "pressure bahut hai", "bahut stress", "I am so stressed", "can't handle the pressure" are `none` in the crisis guard and true in `stressSignal`; "pressure cooker", "50 kms" are not stress.
  - Hostile evasions that missed: (1) "kms" with from/away/about/almost (the failure above); (2) elongation and splits: "kmss", "wanna kmsss", "k ms"; (3) Hinglish spelling variants of "mujhe marna hai": "mujhe marna h", "marnaa hai", "maarna hai", "mrna hai"; bare "ending things" (no tonight/thinking).
  - Evaded and caught: Cyrillic/fullwidth/math-bold letters, zero-width characters, newline, underscore, hyphen, ellipsis between words.
  - Speed: 17 pathological 100-180k-char inputs, each under 175 ms (no ReDoS).
- C4 items 1-5: `numberMentions` sees "half a million" (500000), "ek lakh", "paanch hazaar"; "(+91) 98765 43210" is redacted whole; the follow-up tests cover spelled-out figures, newline and semicolon; until/from/first/certain/selected/up to all rejected. The ISS-125 CORE-REQUEST is outside packages/engine as required.

## Judgements asked for
- "kms" heuristic: too permissive (the first failure). Keeping a number-adjacent rule is sound.
- CORE-REQUEST for ISS-125: right in substance (it matches ISS-125's own fix text and the file is outside engine). One slip: it cites `litellm.ts:509`; the line is `packages/providers/src/index.ts:509` (`onExternalAbort`).
- `mutant-cap-raise` line: not in the .9-4 form (no `file:line`), and "tier L crisis safety path" is not a reason the rule recognises. 17 mutants vs floor 4. Process note only.

## Non-blocking (ledger rows)
- ISS-p1eng3-3 (medium): recall gaps in spelling variants and elongation (listed above).
- ISS-p1eng3-4 (low): over-flagging study talk: "assignment khatam ho jana chahiye kal tak" (crisis.ts `khatam ho jana` has no first-person anchor), "I don't see the point in continuing with MBA", "kms to the nearest airport is 12". Accepted by D-020 but worth a fixture.
- ISS-p1eng3-5 (low): U6h-leftover near-misses: claims "through 2027" and "for 2 years" still verify when dropped; phones "( +91 ) 98765 43210" and "(91) ..." leave the prefix, and "(+971) 50 123 4567" is not detected.
- ISS-p1eng3-6 (low, process): manifest test selection missed apps/api and two engine tests; the CORE-REQUEST has the wrong file name; the cap-raise line is malformed.

ISSUES-WRITTEN: ISS-p1eng3-1 .. ISS-p1eng3-6 (placeholder ids in the worktree ledger; the maker renumbers at merge)
CAPABILITY-COVERAGE: 7/7 falsifications reproduced by me (maker rows C1a-C4i not rerun; floor met by F1, F1b, F2, F3, F4a-c)
LIVE-BROWSER: not-applicable (packages/engine only)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: C2, C3 and C4 are proven; C1's required phrases and variants all fire, but the new kms suppression lets real "kms" crisis sentences through, and the 2A phrase change turns a stale apps/api test red. Both are small fixes. Environment: the shared test lock queued my runs for about 25 min; no OOM or disk fault.
Metrics: start=2026-10-18T04:19:10+05:30 end=2026-10-18T23:52:32+05:30 wall_min=51 agent_min=unavailable blocked_min=25 suite_runs=0 repeat_runs=3 mutations=7 cycle=0 resumes=1 tokens=unavailable policy=proportional-verification/2026-10-17.14 lane=normal check_s=3060 mutants=7 defects_unit=2 defects_6c=0 (wall_min excludes the 19 h session break)

---

# Verdict - p1-eng3-crisis-leftovers (Mode A, single checker, tier L) - CYCLE 2 (last)
Cycle checked: 2
Date: 2026-10-19
Checked state: base 52d2af5, code ba4e2bf (cycle 1 0cc886c, cycle 0 8512f82), manifest 9abff36. Policy-Version: proportional-verification/2026-10-17.14 (.15 rules)

## Plan
Re-ran the engine/api gates myself through `vc-testlock.sh`, probed the worktree `crisis.ts` with the brief's recall, precision and speed sets, compared base / cycle 0 / cycle 1 / head to find where any defect entered, and ran one falsification per changed cycle-2 conditional on a scratch copy of `crisis.ts` plus `guard-crisis.test.ts` only (C: is nearly full).

VERDICT: FAIL
SCOREBOARD: C2, C3, C4 met; C1 recall and precision met, C1 hostile-speed requirement NOT met (1 defect)
TIER: L (crisis safety path)

FAILURES:
- [C1 speed] sev medium · `crisisGuard` is QUADRATIC on a long run of one leet digit. A 100,000-character run of "1" takes 32,161 ms, of "5" 31,215 ms ("0" is the same); 20,000 chars take about 1.1 s, 8,000 chars (the API message bound) about 170 ms. The brief requires every 100k input under 200 ms and T-033 linearity. Cause: `LEET_BEFORE_LETTER = /[013457@$!]+(?=\p{L})/gu` in `foldLeet` (crisis.ts, near line 582). With no letter after the run, the engine retries the run from every start position, so the cost is O(n^2). As a bare regex: 10k = 148 ms, 20k = 578 ms, 40k = 2463 ms. It entered in cycle 1 (0cc886c, "folds whole runs"): base 52d2af5 and cycle 0 8512f82 run "1"x20000 in 1 ms, 0cc886c in 1122 ms, ba4e2bf in 1077 ms. The cycle-0 checker and the cycle-1 review did not probe digit runs, and the T-033 linearity test only covers combining marks. Cost: a long digit message (a pasted number, a spam run) blocks the event loop for tens of seconds in the crisis path, which runs on every student turn before any KB or model call. Fix direction: anchor the run start so it cannot restart inside a run, for example `(?<![013457@$!])[013457@$!]+(?=\p{L})`; add a test that "1", "5" and "kill"+"1" runs of 100k each finish under 200 ms, plus a doubling-ratio check. Repro: `tsx` a file that imports the worktree `packages/engine/src/guards/crisis.ts` and times `crisisGuard("1".repeat(100000))` (probe: scratchpad `eng3c2/probe.mts`). issue: ISS-p1eng3-7

## Evidence (all executed by me; maker evidence not reused for the verdict)
- Via testlock (start 2026-10-19T01:11:05+05:30, end 01:11:34, lock free, free RAM 4.4 GB, no OOM):
  - `bash D:/vc/scripts/vc-testlock.sh pnpm -C <wt>/packages/engine exec tsx --test tests/guard-crisis.test.ts tests/crisis-defaults.test.ts` -> tests 403, pass 403, fail 0 (matches the manifest).
  - `... pnpm -C <wt>/apps/api exec tsx --test tests/anonymous-route.test.ts tests/anonymous-zero-persistence.test.ts tests/server.test.ts tests/index.test.ts` -> tests 85, pass 85, fail 0 (ISS-p1eng3-2 closed).
  - `... pnpm -C <wt>/packages/engine typecheck` -> exit 0.
- Recall probe (imports the worktree crisis.ts): all 13 review-table rows and "I don't see the point in continuing to live" -> crisis. Also crisis: "kill1 myself", "kil11 myself", "k1ll mys3lf", "ki11 myself", "su1c1de", "kms tonight", "i will kms", "KMS", "k.m.s", "kms!!!", "kmss", "kmsss", "mujhe kms karna hai", "ab jeena nahi hai", Devanagari "जीना नहीं है" and "मुझे मरना है", "I see no point in continuing.", "I do not see the point in going on!", "I cant see the point in going on...", "no longer see the point in continuing", "I see no point in continuing my life". My 5 new paraphrases: "I see no point in living anymore", "what's the point of anything, I can't go on", "I don't see any reason to keep going", "nothing to live for" -> crisis; "I can't see the point in carrying on" -> none.
- Recall misses, all NONE on base 52d2af5 too (not regressions; ISS-p1eng3-8): "there is no point in going on", "no point going on", "I can't see the point in carrying on", Devanagari "मैं खुद को मार डालूंगा". The bare "continuing to live" is none (no crisis cue; the review row with "I don't see the point in" is crisis).
- Precision probe, all NONE: "50 kms", "a few kms from campus", "hundreds of kms", "the campus is 3 kms away", "my commute is 5 kms", "10kms", "thousands of kms", "a couple of kms", "continuing with MBA", "going on with this course", "continuing coaching classes", "going online for classes", "kill this exam", "I am dying to see Paris", "this assignment is killing me", "I scored 100 in 10th", and "I don't see the point in continuing with MBA / going on with this course / continuing my IELTS prep / continuing coaching classes / going online for classes / continuing MBA / going on with the GRE / going on to a degree". Mixed sentences still fire ("50 kms then kms", "... but I want to kms").
- Speed, 100k chars, ms: punctuation 0.5, ". " x50k 0.4, repeated phrase 33, "l" 7, "1l" 26, "kms " 28, point + 100k "?" 1, point + 100k spaces 1, 4000x "see no point in continuing" 26, combining marks 19, "of " x33k + kms 24, letter-spaced 21: all under 200 ms. FAIL: "1"x100000 32,162; "kill"+"1"x100000 32,171; "5"x100000 31,215. The T-033 mark-cap linearity holds (100k marks 19 ms).
- Falsification (scratch copy of crisis.ts + guard-crisis.test.ts only, `eng3c2/fals/run.py`, baseline 386/386 green, restored each time): M1 default-suppress -> KILLED 2; M2 lead-in alone suppresses -> KILLED 1; M3 life words off -> KILLED 1; M4 "with things/it/everything" off -> KILLED 1; M5 punctuated check off -> KILLED 1; M6 l-run fold off -> KILLED 1 ("kill1 myself"); M7 word-end lookahead off -> KILLED 1; M8 direct study-noun suppression off -> KILLED 1. Survivors M9 "without" off, M10 "like this" off, M11 end-of-turn off are EQUIVALENT mutants: under the inverted default-fire logic an unlisted next word already returns true, so those branches are redundant (dead code, not a coverage gap).
- Judgement on the maker's [ASSUMPTION] (a lead-in word alone does not suppress; "continuing with my job search" fires): consistent with D-020 (recall only, a guard match is never suppressed, fail closed). Recorded for Umesh; not a FAIL.

## Non-blocking (ledger rows)
- ISS-p1eng3-8 (low): recall gaps on "no point" paraphrases (list above), pre-existing at base.
- ISS-p1eng3-9 (low): redundant branches in `matchPointContinuing` (without, like this, empty rest) are dead under default-fire; add a doubling-ratio test for leet runs.

ISSUES-WRITTEN: ISS-p1eng3-7 .. ISS-p1eng3-9 (placeholder ids in the worktree ledger; the maker renumbers at merge)
CAPABILITY-COVERAGE: 8/8 changed cycle-2 conditionals falsified by me (M1-M8); M9-M11 equivalent
LIVE-BROWSER: not-applicable (packages/engine only)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: The cycle-2 fix itself is proven: the review Block rows and the hostile recall variants fire, study talk stays none, and every changed conditional is falsified. The speed requirement fails: a 100k digit run takes 32 s in the crisis guard, from a quadratic regex introduced in cycle 1 (LEET_BEFORE_LETTER) and not repaired. The fix is one anchor plus a test. This was the LAST fix cycle (cap 2), so the next step is escalation to the orchestrator/Umesh, not another automatic cycle. No OOM or disk fault; the test lock was free.
Metrics: start=2026-10-19T01:09:30+05:30 end=2026-10-19T01:20:00+05:30 wall_min=11 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=11 cycle=2 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-17.14 lane=normal check_s=630 mutants=11 defects_unit=1 defects_6c=0
