# p1-nosource-expert - Mode A feature check (cycle 0)

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
VERDICT: PASS
CHECK-PLAN: Tier M (multi-file behaviour, public API summary, prompt text). Bound to D:/vc/.worktrees/p1-nosource-expert, branch wave/p1-nosource-expert, head 8353602 (code 0cdbb07), base 03f475a. Steps: whole-diff read (9 files, all in the manifest's list, no out-of-scope file); re-run of the Pre-check files one at a time under vc-testlock (TMP/TEMP on D:); engine and api tsc; baseline reds shown on base 03f475a (git archive copy); outcome proof through the real runStudentTurn graph with a fake LLM (authenticated and anonymous); one falsification per criterion in a copy outside the bound tree. Persona walk: skip (backend-only, no screen or flow changed). No live LLM calls.
SCOREBOARD: C1 PASS, C2 PASS, C3 PASS, C4 PASS. Floor met (4 falsifications). New reds: none.

## Re-run (my own, 2026-10-21 20:02-20:04)
- engine student-graph 75/75, lk5 65/65, crisis-defaults 19/19, lang 36/36 (195 pass, 0 fail, matches manifest). engine and api `tsc --noEmit` exit 0.
- api anonymous-zero-persistence 33/33, acceptance-student-journey 3/3, student-openapi 10/10, chat-privacy 39/39, chat.test 32/33 (one red, baseline), anonymous-route 21/23 (2 reds, baseline), chat-profile 44/45 (1 red, baseline).
- Baseline reds shown on base 03f475a (git archive copy, node_modules junctions, base engine src): chat.test "A20 flag on but gate closed" 31/32 (1 fail); anonymous-route "A20 state ON but gate closed" and "startApi: flag on with the real repo gates refuses to start" 21/23 (2 fail); chat-profile "startApi: flag on ..." 44/45 (1 fail). Same four tests, same messages on base and head; the two files hang to the 200 s timeout after printing (exit 124) on both. Excluded as pre-existing (B13 signed in D-109). Output: qa/evidence/p1-nosource-expert-check/baseline-reds-at-03f475a.out.txt

## Outcome proof (fake LLM, real runStudentTurn graph; qa/evidence/p1-nosource-expert-check/outcome.test.ts.txt, 9 tests, 9 pass)
- C1: for 3 no-source questions (2 English, 1 Hinglish) x authenticated and anonymous: state no_sourced_answer, claims [], sources [], message = disclaimer + answer, exactly one guidance call, gap (auth) / no_answer counter (anon) recorded once. Hostile LLM output, both modes, all returned state no_sourced_answer, empty claims/sources, fixed refusal text, no crash: prose string instead of JSON, thrown OllamaMalformedResponseError-style error, empty string, whitespace, null, undefined, wrong shape, non-string answer, https URL, bare www. address, e-mail address, schema-length overflow (1500), and a 10,800-char reply from a non-validating provider (graph cap).
- C2: 3 neutral no-source questions (en, en, Hinglish) x both modes carry no 14416 / Tele-MANAS. 3 distress phrasings ("Mujhe bahut stress hai, kuch accha nahi lag raha", "I am so stressed about the pressure ...", "bahut pressure hai yaar ...") x both modes carry the helpline exactly once. Crisis: 3 phrasings (en, Hinglish x2) x both modes -> state escalated with zero guidance calls (crisisGuard still first). The LK10 crisis constants are not touched: `git diff 03f475a..8353602 -- packages/engine/src` has no hunk in CRISIS_MESSAGES / STUDENT_CRISIS_MESSAGE / ANONYMOUS_CRISIS_MESSAGE, and the escalated message equals the exported constants.
- C3: distress reply starts with STRESS_CHECK_IN, then (for no-source) the disclaimer + answer, and ends with TELE_MANAS_LINE; anonymous sign-in order empathy, sign-in sentence, helpline. Index order asserted.
- C4: openapi diff is one summary string (apps/api/src/openapi.ts:571), no schema/field change; student-openapi 10/10, acceptance-student-journey 3/3; the anonymous personal-question redirect (no model call) is covered by the maker's C4 test and falsified below.

## Falsification (copy D:/vc_tmp_chk/copy, equal to bound graph.ts, restored and equality-verified; pattern D-110|D-093|U7 over student-graph + crisis-defaults, 20 tests)
- Baseline green 20/20.
- C1 drop the disclaimer: red 15 pass/5 fail (first: "D-110 C1: authenticated, no servable source ..."); restored 20/20.
- C2 append the helpline to every no-source reply: red 14/6 (first: "U7 repair D"); restored 20/20.
- C3 helpline placed before the reply: red 17/3 (first: "D-093 3A ... soft check-in and Tele-MANAS"); restored 20/20.
- C4 anonymous personal-question redirect disabled: red 15/5 (first: "D-093 3A: a stress phrase alone"); restored 20/20.

## Non-blocking findings (low ledger rows, none is a FAIL)
1. A model-written "Tele-MANAS ... 14416" or bare "14416" inside the answer on a neutral no-source turn is shown as is (outcome "observe" lines): the guard does not strip it. The prompt forbids phone numbers; C2 is about the sentence the system appends, so low.
2. A prose citation inside the model answer ("According to ... (Source: Vidysea KB, doc #4411)", "[1] Vidysea Verified Source") passes through; sources [] and claims [] stay empty so no structured source is fabricated, but the text could contradict the disclaimer. Not covered by the link/e-mail/draft/redaction guards.
3. English-only disclaimer for hi / hi-Latn replies (known, manifest risk).
4. skills/kb-answer/SKILL.md has one stale sentence about the old fixed no-answer text (known).
5. D-105 Q1 uncovered-language path still appends the English+Hindi helpline to every reply, including non-distress ones; kept on purpose, owner call needed.

Process note: wall 12 min (20:02:08 to 20:14:30), over the 5 min S/M target and past the 10 min hard checkpoint, no lock wait (blocked_min=0). slow: base-copy build and two api files that hang to the 200 s timeout, run in parallel with falsification. Process ledger row filed.
ISSUES-WRITTEN: ISS-p1-nosource-expert-1..5 (low) plus ISS-proc-p1-nosource-expert-1 (process).
SERIAL: test files ran one at a time per lock; the base-red chain and head chain used the 2 slots, falsification alongside. No provider calls, no production Mongo, no source edit in the bound tree, no process killed.
Metrics: start=2026-10-21T20:02:08+05:30 end=2026-10-21T20:14:30+05:30 wall_min=12 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=4 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=742 mutants=4 defects_unit=0 defects_6c=0 slow: base-archive+timeouts 8
