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
