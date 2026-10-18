# Manifest - p1-eng3-crisis-leftovers
**Contract:** `qa/contracts/counselling-engine.md` (A11, A11b). Brief `qa/evidence/p1-briefs/p1-w3-eng.md` (+ `p1-w3-common.md`, resume `p1-resume-eng3.md`). Decisions D-093 2A / 3A.
**Date:** 2026-10-18
**Fix cycle:** 3 (extra cycle, D-098)
**Dual check:** no
**Persona walk:** skip (engine-only, no screen)
**Executor:** claude-sonnet-subagent (maker/builder p1-eng3, resumed after a session restart)
Sessions: 2b04f90e-6b56-4682-a76c-d8515b93405c

Status: ready-for-check

## Criteria
- **C1** (D-093 2A) - every proposed Hindi/Hinglish crisis phrase incl. "kms" is in the crisis guard (spaced, letter, leet and Devanagari variants); a crisis turn is the fixed message + Tele-MANAS 14416 before any KB or model call; study talk ("kill this exam", "50 kms", "MS") stays non-crisis.
- **C2** (D-093 3A) - stress phrases ("pressure bahut hai", "bahut stress", "I am so stressed", "can't handle the pressure") append a soft check-in + Tele-MANAS 14416 to a normal answer; not the crisis message, no flag.
- **C3** - ISS-125 and ISS-126 inside packages/engine. ISS-126 fixed. ISS-125 is `providers/tests` (litellm external-abort test): outside packages/engine, CORE-REQUEST below.
- **C4** - the 5 U6h PROPOSED-ISSUEs: all five are inside packages/engine and fixed (1 followUp spelled-out figure, 2 half a million + Hindi figures, 3 followUp second sentence after newline/semicolon, 4 "(+91) 98765 43210", 5 temporal/partial qualifiers).

CORE-REQUEST: packages/providers/tests (external-abort test, ISS-125) assert abort-to-settle well under timeoutMs so a no-op onExternalAbort (packages/providers/src/index.ts:509) cannot hide behind the 5 s deadline abort

## What changed
Code commit `8512f82` on `p1/eng3` (base `52d2af5`). 11 files edited in place, no new src module, no `.claude`, `qa/contracts`, DECISIONS, ARCHITECTURE edit; `apps/api` untouched.
- `packages/engine/src/guards/crisis.ts` - new CRISIS_PATTERNS (marna hai, khatam ho jana, marne ki iccha, jeena nahi hai, jaan dena hai, "see no point", "ending things" and Devanagari forms); `TOKEN_CRISIS_PHRASES` + `matchTokens` for "kms" (whole token, distance-unit suppression); typographic-apostrophe fold; leet-folded second view in `normalise`/`crisisGuard`; `STRESS_PATTERNS`, `STRESS_CHECK_IN`, `stressSignal` (C2). "jaan lena" is left out on purpose (it also means "to find out").
- `packages/engine/src/student/graph.ts` - `finish` appends the soft note (or only the check-in when the helpline line is already present; skipped if it would pass the 8000 char bound); `safeFollowUp` rejects spelled-out figures and newline/semicolon second sentences.
- `packages/engine/src/guards/escalation.ts` - `fencedWrite` observes every deadline race (`bounded`) so a budget that refuses early leaves no unhandled rejection (ISS-126).
- `packages/engine/src/guards/no-quote.ts` - PHONE_CC accepts "(+91)".
- `packages/engine/src/student/claims.ts` - million/billion/half a million/Hindi figures; until/till/since/starting conditions, dated bounds, extra scope words and comparators.
- Tests edited in place (additions only): guard-crisis, crisis-defaults, crisis-escalation, claims-guard, no-quote, student-graph.

## Verification scope
Policy-Version: proportional-verification/2026-10-17.14
Tier: L (crisis safety path: A11/A11b fixed message, student-facing guards)
Round: cycle 0 was 11 files, 4 criteria, est 150 min. Fix cycle 1 (this round): 3 files (crisis.ts, guard-crisis.test.ts, apps/api anonymous-zero-persistence.test.ts), est 40 min - 6 checker/review fixes (ISS-p1eng3-1..3), tests first, falsification per changed criterion in a copy
Base / checked state: base 52d2af5, code 798a31e (cycle 3; cycle 2 ba4e2bf, cycle 1 0cc886c, cycle 0 8512f82). Cycle 3 round: 2 files (crisis.ts, guard-crisis.test.ts), est 45 min, tests first, falsification per changed criterion in a scratch copy of crisis.ts
Tests[C1]: tests/guard-crisis.test.ts and tests/crisis-defaults.test.ts, names "D-093 2A: ..." and (fix cycle 1) "D-093 2A repair: ..." - kms next to about/almost/from/away still crisis, kms after a number or quantity word (incl. "thousands of kms") none, kmss/kmsss, "mujhe marna h"/"marnaa hai", "ki11 myself", and "see the point in going on/continuing" only for the bare or life form, - every phrase, spaced/punctuated evasion forms, kms token, study talk stays none, fixed message with zero KB/model calls (authenticated and anonymous)
Tests[C2]: tests/guard-crisis.test.ts and tests/crisis-defaults.test.ts, names "D-093 3A: ..." - stress signal is not a crisis/concern flag, normal answer + note + 14416 once, no escalation, note passes the forbidden-phrase list
Tests[C3]: tests/crisis-escalation.test.ts "ISS-126: ..." - held review insert outliving a 50 ms writer deadline with the budget expiring at the same time, no unhandledRejection
Tests[C4]: tests/claims-guard.test.ts, tests/no-quote.test.ts, tests/student-graph.test.ts, names "P1 W3 U6h leftover(s) 1..5" - one test per leftover item
Pre-check[C1]: 798a31e bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="D-093 2A" tests/guard-crisis.test.ts tests/crisis-defaults.test.ts -> pass 65, 0 failed t=68 blobs=guard-crisis:f4173e3,crisis-defaults:2ce8d05 (cycle 2: ba4e2bf pass 62)
Pre-check[C1]: 798a31e bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test tests/guard-crisis.test.ts tests/crisis-defaults.test.ts -> pass 406, 0 failed t=20 blobs=guard-crisis:f4173e3,crisis-defaults:2ce8d05
Pre-check[C1]: 798a31e bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/anonymous-route.test.ts tests/anonymous-zero-persistence.test.ts tests/server.test.ts tests/index.test.ts -> pass 85, 0 failed t=15 blobs=anonymous-zero-persistence:fe6692e (downstream)
Pre-check[C2]: 798a31e bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="D-093 3A" tests/guard-crisis.test.ts tests/crisis-defaults.test.ts -> pass 24, 0 failed t=4 blobs=guard-crisis:f4173e3,crisis-defaults:2ce8d05
Pre-check[C3]: 798a31e bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="ISS-126" tests/crisis-escalation.test.ts -> pass 1, 0 failed t=4 blobs=crisis-escalation:792ec5d
Pre-check[C4]: 798a31e bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="U6h leftover" tests/claims-guard.test.ts tests/no-quote.test.ts tests/student-graph.test.ts -> pass 5, 0 failed t=5 blobs=claims-guard:a71dd7a,no-quote:d39e748,student-graph:b36857e
Metrics: cycle=3 start=2026-10-19T04:01:28+05:30 end=2026-10-19T04:13:00+05:30 builder_min=12 mutants=5 survivors_final=0 (cycle 2: start=2026-10-19T00:55:26+05:30 end=2026-10-19T01:01:50+05:30 mutants=8 survivors_final=0 (cycle 1: start=2026-10-19T00:24:37+05:30 end=2026-10-19T00:46:45+05:30 builder_min=26 suite_runs=0 mutants=11 survivors_final=0 cycle=1 policy=proportional-verification/2026-10-17.14 tokens=unavailable (cycle 0: start=2026-10-18T01:53:55+05:30 end=2026-10-18T04:16:00+05:30 builder_min=142 mutants=17)
mutant-cap-raise: packages/engine/src/guards/crisis.ts:640-675 the cycle-1 diff changes 4 independent conditionals/constants in two functions (matchTokens quantity set, 'of' look-back, elongation; matchPointContinuing clause words) plus the 1->l fold and the marna regex, so 11 single-edit falsifications (cap 10 at L) are needed for one per changed conditional; cycle 0's 17 was likewise one per changed criterion item

## Fix cycle 1 (checker FAIL cycle 0 + ai-engineer review) - what changed, code commit `0cc886c` on `p1/eng3`
Test-first: the 6 new "D-093 2A repair" tests were red on 559a421 and green after (first red: "'1' read as 'l'" and "see the point ... (review W1)"). Files: `packages/engine/src/guards/crisis.ts`, `packages/engine/tests/guard-crisis.test.ts`, `apps/api/tests/anonymous-zero-persistence.test.ts`. Nothing under `.claude`, `qa/contracts`, DECISIONS, ARCHITECTURE.
- **ISS-p1eng3-1 (C1, high)** `matchTokens` (crisis.ts:640): "kms" is suppressed ONLY when the word before it is a number or a plain quantity word (few, several, couple, many, hundred(s), thousand(s)), or "of" after one ("thousands of kms"). DISTANCE_AFTER is gone; about/around/nearly/almost/some/x are gone from the before set. "i keep thinking about kms", "i was almost kms tonight", "i wanna kms from the stress", "kms away from here" now fire; "50 kms", "a few kms from campus" stay none.
- **ISS-p1eng3-2 (downstream)** TEST-INPUT CHANGE, not a weakened assertion: apps/api `anonymous-zero-persistence.test.ts:621` sent "I am thinking about ending things, what should I study?" and expected `sign_in_required`; that text is now a D-093 2A crisis phrase. The input became "I am thinking about my future, what should I study?" (the same change the engine twin got in cycle 0). The assertions (state, message, helpline) are unchanged.
- **Review W1** `matchPointContinuing` (crisis.ts:666) plus two life-form patterns: "I don't see the point in going on / continuing" fires when it ends the turn, runs into a clause word ("anymore", "because", "I ...") or takes the life form ("with my life"); "... continuing with MBA / going on with this course / continuing my IELTS prep" is none. The old plain alternation could not be kept (a lookahead breaks the generated-pattern tests), so the bare form is a code check with a squeezed end-of-turn twin.
- **Review I1** `foldLeet` (crisis.ts:580) folds whole runs and takes an `oneAs` reading; `crisisGuard` adds a third view/twin with 1 -> l ("ki11 myself", "k1ll myself"). The 1 -> i reading ("su1c1de") is unchanged.
- **ISS-p1eng3-3 (partial)** `marna+ ... (hai|hain|h)`: "mujhe marna h", "mujhe marnaa hai" fire; "kmss"/"kmsss" fire as the kms token. Not done (judged a larger recall question, left in the ledger): "maarna hai" (also means "to hit"), "mrna hai", "k ms", bare "ending things".
- **Manifest** ISS-125 CORE-REQUEST now cites `packages/providers/src/index.ts:509`; the mutant-cap-raise line carries file:line + reason; the selection below gains the 5 engine tests and the 4 apps/api tests the checker found missing.
- **Falsification (copy `scratchpad/eng3r1-fals`, junctioned node_modules, restored after each; baseline 384/384 green on guard-crisis.test.ts; log `scratchpad/eng3r1-fal.log`)**: K1 after-word suppression restored -> KILLED 1 ("kms next to about/almost/from/away"); K2 about/almost back in the before set -> KILLED 1; K3 elongation off -> KILLED 1; K4 "thousands of" off -> KILLED 1; W1a matchPointContinuing never fires -> KILLED 1; W1b always fires -> KILLED 1; W1c life-form patterns broken -> KILLED 2; I1 view dropped alone -> SURVIVED (the leet-l squeezed twin still caught it), I1c view AND twin dropped -> KILLED 1; I1b l-reading maps 1 to i -> KILLED 1; M1 marna variants off -> KILLED 1. survivors_final=0 after strengthening I1 to drop both the view and the twin.

## Fix cycle 2 (senior review c1 BLOCK, high recall regression) - code commit `ba4e2bf` on `p1/eng3`
Test-first: two new "D-093 2A repair ... (review c1 ...)" tests in `packages/engine/tests/guard-crisis.test.ts` were red on 0cc886c (pass 0, fail 2) and are green on ba4e2bf. Files: `packages/engine/src/guards/crisis.ts`, `packages/engine/tests/guard-crisis.test.ts` (additions only). Nothing under `.claude`, `qa/contracts`, DECISIONS, ARCHITECTURE.
- **Review c1 High** `matchPointContinuing` (crisis.ts, after `matchTokens`) is INVERTED: "see the point in going on / continuing" fires by default (end of turn, any next word). It is suppressed only by a study object: a study noun right after it, or a lead-in (with, my, the, this, these, those, a, an, our, his, her, their, your, to) followed within 3 words by a study noun (ielts, gre, gmat, toefl, sat, mba, ms, btech, course, degree, prep, preparation, studies, study, college, application(s), coaching, exam(s)). It always fires on living/life/live/alive/existing/exist in the next 4 words, and on `without`, `with things / it / everything`, `like this`. A word-end lookahead stops "going online" matching. New `matchPointContinuingPunctuated` fires when punctuation follows directly ("... continuing. My IELTS prep ...") on the folded raw text (the normalised views fold punctuation away). All 13 review rows + "continuing to live" are now crisis; the 5 W1 "none" cases stay none.
- [ASSUMPTION] (maker decision under D-020, fail closed, for Umesh): a lead-in word alone does NOT suppress, it needs a study noun after it. The brief said "suppress when the next word is a lead-in", but that would keep the review row "I don't see the point in going on my family would be better off" none. Cost: "... continuing with my job search" is now flagged crisis. Also [ASSUMPTION]: `with things / it / everything`, `like this`, `without` always fire.
- `normalise` was split in place: its fold steps moved to `foldText` (same order, mark-run cap first) so the punctuated check reuses the linear mark cap. First attempt called `text.normalize("NFKC")` on the raw text and failed T-033 linearity (11.6 s on 100k combining marks); with `foldText` T-033 passes (100k = 12.5 ms, ratio 1.76-1.99).
- **Review c1 Low** "kill1 myself": in the 1 -> l view, a run of 3+ l's folds to "ll" ("killl" -> "kill"). Only the l-view changes (additive). "kill1 myself", "kil11 myself" are crisis; "I will fill11 forms" none.
- **Falsification** (scratch copy of crisis.ts only, `scratchpad/eng3r2-fals/`, probe of the new test inputs + W1 cases, driver `run.py`, log `fal.log`; baseline FAILS 0, restored after): F1 default suppress -> KILLED 11; F2 lead-in alone suppresses -> KILLED 2; F3 life words off -> KILLED 1; F4 with-things/it/everything off -> KILLED 1; F5 punctuated check off -> KILLED 1; F6 l-run fold off -> KILLED 3; F7 word-end lookahead off -> KILLED 1; F8 direct study-noun suppress off -> first SURVIVED, a none case ("I see no point in continuing coaching classes") was added, then KILLED 1. survivors_final=0.

## Fix cycle 3 (extra cycle approved by Umesh, D-098: cycle-2 checker FAIL b4a1e5b + cycle-2 senior review) - code commits `587a6e2` + `798a31e` (final) on `p1/eng3`
Test-first: three new "D-093 2A cycle 3" tests in `packages/engine/tests/guard-crisis.test.ts` were red on b4a1e5b (leet fold 29987 ms on "1"x100000; "continuing college i hate myself" none; repeated phrase 847 ms) and are green on 798a31e. Files: `packages/engine/src/guards/crisis.ts`, `packages/engine/tests/guard-crisis.test.ts` (additions only). Nothing under `.claude`, `qa/contracts`, DECISIONS, ARCHITECTURE. If the lint rejects cycle 3 because of the cap, D-098 (docs/DECISIONS.md) authorises it.
- **FAIL item (cycle-2 verdict)** `LEET_BEFORE_LETTER` (crisis.ts:588) is now `(?<![013457@$!])[013457@$!]+(?=\p{L})`: the run start is anchored, so a run is scanned once. "1"x100000, "5"x100000, "kill"+"1"x100000, "!"x100000, "@$"x50000 each finish in 13-25 ms (limit 200). The other regexes in foldLeet/normalise were reviewed: `LEET_AFTER_LETTER` starts only after a letter (run consumed once, no backtrack), `l{3,}`, `NON_WORD_RUN` are single greedy runs: linear.
- **D-098 item 2** `matchPointContinuing` (crisis.ts:~700) now runs `pointRestHasDistress` on the next 240 characters before any study-object suppression: a life word, a hard-distress phrase (`POINT_DISTRESS`: hate myself, worthless, hopeless, burden, hurts, pain, alone, nobody, ...) or any CRISIS_PATTERNS / CONCERN_PATTERNS match fires. The 5 D-098 phrases are crisis; the W1 none cases stay none.
- **Low (review)** "going onward(s)" matches again (`going\s*on(?:wards?)?`, the word-end lookahead still stops "going online"); the per-match `split` of the whole remainder is replaced by a 240-char slice. [ASSUMPTION] (fail closed, D-020, for Umesh): more than 20 study-suppressed matches in one view are flagged crisis, which bounds the cost on a turn that repeats the phrase; 3 repeats stay none.
- **ISS-p1eng3-9 dead branches** `without`, `like this` and the empty-rest early return were dead (any first word that is not a study noun or lead-in already returned true). Removed; no test could kill them. The `with things/it/everything` branch is alive ("continuing with it my exams are over") and is kept.
- **Recall grid** (`scratchpad/eng3c3/cmp.ts`, reviewer's cases.json, 1773 rows; base vs c2 vs c3): regress-vs-c2 0, gained 0; 168 rows are crisis at base and none at c2 and c3 (all study talk, the cycle-1 W1 change, unchanged).
- **Falsification** (scratch copies of crisis.ts only, `scratchpad/eng3c3/m1..m5.ts`, driver `fals.mts`, log `fals.out`; baseline c3 all expected, worktree untouched): m1 unanchored leet regex -> KILLED ("1" x100k 31948 ms); m2 distress check removed -> KILLED (hate, the course of my life now none); m3 "onwards" removed -> KILLED (now none); m4 suppressed-match cap removed -> KILLED (30 repeats now none, the test asserts crisis); m5 whole-remainder slice -> first SURVIVED (169 ms under the 500 ms bound), the bound was tightened to 120 ms in 798a31e (c3 24 ms), then KILLED (143 ms). survivors_final=0.
- Verification at 798a31e: engine guard-crisis + crisis-defaults pass 406/0; crisis-escalation, crisis-eval, student-graph, concern-classifier, guard-hard-rules, scribe-concern pass 150/0; apps/api four tests pass 85/0; engine typecheck exit 0.

## How to verify (commands + expected)
- `pnpm -C <worktree>/packages/engine typecheck` -> exit 0.
- `bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/packages/engine exec tsx --test tests/guard-crisis.test.ts tests/crisis-defaults.test.ts tests/crisis-escalation.test.ts tests/crisis-eval.test.ts tests/claims-guard.test.ts tests/no-quote.test.ts tests/student-graph.test.ts tests/student-classify.test.ts tests/scribe-erasure-fence.test.ts tests/scribe-concern.test.ts tests/concern-classifier.test.ts tests/coach-first.test.ts tests/guard-hard-rules.test.ts tests/cards-graph.test.ts tests/index.test.ts tests/b18-suppression-outcome.test.ts tests/scribe.test.ts tests/scribe-rules-e2e.test.ts evals/*.test.ts` -> tests 870, pass 825, fail 0, skipped 45 (the same 45 skips as the U6h baseline) at cycle 0.
- Fix cycle 1 set (the 20 files above + `tests/capability-manifest.test.ts tests/source-kind.test.ts tests/cards-verifier.test.ts tests/guard-citation.test.ts tests/guard-no-script.test.ts`, run through the same wrapper at 0cc886c) -> tests 919, pass 874, fail 0, skipped 45 (870 + 41 added-file tests + 8 new repair tests).
- apps/api (the checker's four): `bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/apps/api exec tsx --test tests/anonymous-route.test.ts tests/anonymous-zero-persistence.test.ts tests/server.test.ts tests/index.test.ts` -> tests 85, pass 85, fail 0 (cycle 0 checker saw 84/1).
- `bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/packages/engine typecheck` at 0cc886c -> exit 0.
- No whole-repo or whole-engine suite was run (brief rule). Wall time of the build includes about 100 min of test-lock queueing.

## Capability coverage (each criterion -> a falsification in COPY `eng3-fals`, never the bound tree; green before, red after, restored)
Driver `scratchpad/eng3_falsify.py`, logs `scratchpad/eng3-fal-<id>.log`. Baseline in the copy: 529/529 green on the 5 files.
| Criterion | falsifying edit (file) | observed |
|---|---|---|
| C1 | C1a: `TOKEN_CRISIS_PHRASES = []` (crisis.ts) | KILLED 7 fail, first "'kms' is flagged as a letter-spaced..." |
| C1 | C1b: "marna hai" Latin pattern disabled | KILLED 6 fail, first "mujhe marna hai is level 'crisis'" |
| C1 | C1c: "marna hai" Devanagari pattern disabled | KILLED 5 fail |
| C1 | C1d: leet folding switched off (`normalise(text)` for the leet view) | KILLED 7 fail, first "1 w4nt to die". The first mutation (dropping only the extra view) SURVIVED because the squeezed twin still carried it and the old inputs ("i w4nt to d1e") were caught by older patterns; three leet-only inputs were added |
| C1 | C1e: "ending things tonight" pattern disabled | KILLED 5 fail, first "i am ending things tonight" |
| C2 | C2: `stressSignal` always false | KILLED 17 fail (first attempt ran student-graph only and showed 0 fail; rerun on crisis-defaults + guard-crisis) |
| C3 | C3: `raced.catch(() => undefined)` removed (escalation.ts) | KILLED 1 fail, "ISS-126: a budget that refuses early..." |
| C4 item 1 | C4a: `numberMentions(f)` dropped from `safeFollowUp` | KILLED 1 fail |
| C4 item 3 | C4b: newline/semicolon rule dropped | KILLED 1 fail |
| C4 item 4 | C4c: PHONE_CC back to "+91" only | KILLED 1 fail |
| C4 item 2 | C4d: "half a million" alternation removed | KILLED 1 fail, after adding the assertion `n == 500000` (first version survived: bare "million" still matched) |
| C4 item 2 | C4e: Hindi figure words disabled | KILLED 3 fail |
| C4 item 5 | C4f: until/till/since conditions removed | KILLED 1 fail |
| C4 item 5 | C4g: dated bound ("from 2027") removed | KILLED 1 fail |
| C4 item 5 | C4h: first/certain/selected scope words removed | KILLED 1 fail |
| C4 item 5 | C4i: up/upto/capped/max comparators removed | KILLED 1 fail |

## Live browser evidence
Not UI-touching: changed paths are `packages/engine/**` and `qa/` only.

## Not done / stated limits
- Mock provider only; no real-model run, no network (G-REAL closed). C1 proves the guard + graph route, not a live end-to-end call.
- Crisis recall is intentionally broad (D-020): "ending things" and "marna hai" can fire on ordinary talk. The "kms" distance-unit suppression is now narrow (number or quantity word directly before; cycle 1). "marna h" widens the squeezed twin: a letter-spaced "marna h..." glues to any h-word (accepted, D-020). "mujhe maarna hai", "mrna hai", "k ms" and bare "ending things" are still unflagged (ISS-p1eng3-3 residue).
- The leet fold reads a digit or symbol beside a letter as the letter it imitates; a bare number is untouched.
- 45 engine tests are skipped (Mongo-dependent), same as the U6h baseline.
- ISS-125 not fixed here (CORE-REQUEST above).
- Review agents (senior-software-engineer, ai-engineer) not dispatched by the builder; the orchestrator owns that.
