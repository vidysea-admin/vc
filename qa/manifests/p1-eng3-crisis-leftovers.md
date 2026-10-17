# Manifest - p1-eng3-crisis-leftovers
**Contract:** `qa/contracts/counselling-engine.md` (A11, A11b). Brief `qa/evidence/p1-briefs/p1-w3-eng.md` (+ `p1-w3-common.md`, resume `p1-resume-eng3.md`). Decisions D-093 2A / 3A.
**Date:** 2026-10-18
**Fix cycle:** 0
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

CORE-REQUEST: packages/providers/tests (litellm external-abort test, ISS-125) assert abort-to-settle well under timeoutMs so a no-op onExternalAbort (litellm.ts:509) cannot hide behind the 5 s deadline abort

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
Round: 11 files, 4 criteria, est 150 min - crisis guard + stress tier + 5 claim/PII leftovers, tests first, falsification per criterion in a copy, resumed once after a restart
Base / checked state: base 52d2af5, code 8512f82
Tests[C1]: tests/guard-crisis.test.ts and tests/crisis-defaults.test.ts, names "D-093 2A: ..." - every phrase, spaced/punctuated evasion forms, kms token, study talk stays none, fixed message with zero KB/model calls (authenticated and anonymous)
Tests[C2]: tests/guard-crisis.test.ts and tests/crisis-defaults.test.ts, names "D-093 3A: ..." - stress signal is not a crisis/concern flag, normal answer + note + 14416 once, no escalation, note passes the forbidden-phrase list
Tests[C3]: tests/crisis-escalation.test.ts "ISS-126: ..." - held review insert outliving a 50 ms writer deadline with the budget expiring at the same time, no unhandledRejection
Tests[C4]: tests/claims-guard.test.ts, tests/no-quote.test.ts, tests/student-graph.test.ts, names "P1 W3 U6h leftover(s) 1..5" - one test per leftover item
Pre-check[C1]: 8512f82 bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="D-093 2A" tests/guard-crisis.test.ts tests/crisis-defaults.test.ts -> pass 54, 0 failed t=28 blobs=guard-crisis:3a15c96,crisis-defaults:2ce8d05
Pre-check[C2]: 8512f82 bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="D-093 3A" tests/guard-crisis.test.ts tests/crisis-defaults.test.ts -> pass 24, 0 failed t=4 blobs=guard-crisis:3a15c96,crisis-defaults:2ce8d05
Pre-check[C3]: 8512f82 bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="ISS-126" tests/crisis-escalation.test.ts -> pass 1, 0 failed t=4 blobs=crisis-escalation:792ec5d
Pre-check[C4]: 8512f82 bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="U6h leftover" tests/claims-guard.test.ts tests/no-quote.test.ts tests/student-graph.test.ts -> pass 5, 0 failed t=51 blobs=claims-guard:a71dd7a,no-quote:d39e748,student-graph:b36857e
Metrics: start=2026-10-18T01:53:55+05:30 end=2026-10-18T04:16:00+05:30 builder_min=142 suite_runs=0 mutants=17 survivors_final=0 cycle=0 policy=proportional-verification/2026-10-17.14 tokens=unavailable
mutant-cap-raise: tier L crisis safety path, 16 criteria-level falsifications (C1 has 5 phrase families, C4 has 5 leftover items with 8 independent edits) plus 1 repeat after two surviving mutants were strengthened

## How to verify (commands + expected)
- `pnpm -C <worktree>/packages/engine typecheck` -> exit 0.
- `bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/packages/engine exec tsx --test tests/guard-crisis.test.ts tests/crisis-defaults.test.ts tests/crisis-escalation.test.ts tests/crisis-eval.test.ts tests/claims-guard.test.ts tests/no-quote.test.ts tests/student-graph.test.ts tests/student-classify.test.ts tests/scribe-erasure-fence.test.ts tests/scribe-concern.test.ts tests/concern-classifier.test.ts tests/coach-first.test.ts tests/guard-hard-rules.test.ts tests/cards-graph.test.ts tests/index.test.ts tests/b18-suppression-outcome.test.ts tests/scribe.test.ts tests/scribe-rules-e2e.test.ts evals/*.test.ts` -> tests 870, pass 825, fail 0, skipped 45 (the same 45 skips as the U6h baseline).
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
- Crisis recall is intentionally broad (D-020): "ending things" and "marna hai" can fire on ordinary talk. The "kms" distance-unit suppression (number or quantity word before, distance word after) is a heuristic.
- The leet fold reads a digit or symbol beside a letter as the letter it imitates; a bare number is untouched.
- 45 engine tests are skipped (Mongo-dependent), same as the U6h baseline.
- ISS-125 not fixed here (CORE-REQUEST above).
- Review agents (senior-software-engineer, ai-engineer) not dispatched by the builder; the orchestrator owns that.
