# Verdict p1-lk5 (cycle 1, repair check)
Date: 2026-10-19. Bound to D:/vc/.worktrees/lk5, head a544ba8 (code identical to 13ac9b7), Repair base 3f746e5 (ancestor of HEAD, verified). Cycle checked: 1
Policy-Version: proportional-verification/2026-10-19.16 (as pinned). Checker: fresh subagent, single check (Dual check: no).

## Check plan
Tier L (safety path, graph.ts/lang.ts). Re-run: K1 (failed), M1/M2/M3 (repair touches their input files), K1-K7 scoped tests. Repair diff 6c30cf3..a544ba8 read in full (graph.ts +42, lang.ts +133, lk5.test.ts +153, qa bookkeeping); whole-unit diff outside qa/ touches only manifest-listed files; no export, test or config key removed. Drove the real runStudentTurn with fake providers in a copy outside the bound tree (D:/chk-tmp/lk5c1), hostile variants in qa/evidence/p1-lk5/repair1-check/chk-hostile.test.ts.txt.

VERDICT: FAIL
SCOREBOARD: K1 not met (number parity), K2-K7 met; M2 and M3 hold; M1 partly holds. crisisGuard first and unweakened: holds.
TIER: L (safety path: reply gating on a student-facing answer, graph.ts / lang.ts)

FAILURES:
- [K1/M1] sev: medium - the number-parity and unit checks of a localized claim cannot see Devanagari spelled-out figures or Devanagari currency words, so a figure the English claim does not carry reaches the student. lang.ts:337-341 `figures()` counts digits and Latin number words only; lang.ts:359 runs the Devanagari magnitude check only when the English claim has NO figure and only for सौ/हज़ार/लाख/करोड़/मिलियन/बिलियन; lang.ts:360-361 unit check uses the Latin unit list only. Ran (real runStudentTurn, probes.txt): English "no tuition" + localized "... पर पचास यूरो लगते हैं।" -> shown; English "about 300 euros" + localized "... और सालाना पाँच हज़ार यूरो।" -> shown; "... और कुल दस लाख।" -> shown; same "300" with "रुपये" or "डॉलर" instead of euros -> shown. The brief's hostile variant "a different figure ... as a spelled-out Hindi number" and "a new unit" therefore pass through when the spelled figure is added to a matching digit, is a bare number word, or the unit is written in Devanagari. Fix direction: any Devanagari number word (1-99 plus magnitudes) or Devanagari currency/unit word that the English claim does not carry means the English reply, whether or not English has a figure (safe direction). issue: ISS-386

K1 repair itself holds. M1 caught: scheme-less evil.test (and with path), e-mail, https link when English has none, a different https link when English has one, evil.test when English has one, English link plus evil.test, different figure in Devanagari digits and ASCII, dropped figure, Devanagari magnitude word when English has no figure, Hinglish "teen sau" replacing 300, Hinglish "paanch hazaar" added, swapped and added country in Devanagari, new units USD and %.

CAPABILITY-COVERAGE: 4/4 repaired criteria reproduced (one falsification each, copies outside the bound tree, qa/evidence/p1-lk5/repair1-check/falsification.txt)
- K1: localized `.catch(undefined)` removed -> "K1 hostile" green 1/0 before, red 0/1 after
- M1: link comparison line removed (lang.ts:365) -> green before, red after
- M2: shown-text crisis check removed (graph.ts:838) -> green before, red after
- M3: localizedFollowUpOk call removed (graph.ts:753) -> green before, red after
LIVE-BROWSER: not-applicable (no UI paths changed)
ISSUES-WRITTEN: ISS-386 (medium, the FAIL), ISS-387 (low), ISS-388 (low)

## Evidence (all through vc-testlock, one file at a time, timeout 600, TMP/TEMP on D:)
- Hostile drive "chk-hostile.test.ts" (copy): 6 tests, 6 pass, the asserting ones cover K1, crisis-first (0 provider calls, 0 detector calls, CRISIS message), M1 (18 cases), M2 (prior-flag student; localized-only secret / between us / therapy / lethal dose -> fixed crisis message; no-flag control shown; clean control shown), M3 (two questions, two sentences, phone number, country Devanagari and Latin, not a question, Latin script in a Devanagari reply, Devanagari follow-up in a Hinglish reply -> each the whole English reply with the English follow-up; clean follow-up still shown). K1 controls: empty English `text` stays the apology (schema strict), good localized shown.
- K7 scoped tests on the bound head: engine lk5 53, lang 34, student-graph 64, crisis-defaults 17, crisis-escalation 42, claims-guard 33, capability-manifest 3, coach-first 5, index 2; apps/api chat 32, anonymous-route 16, acceptance-student-journey 3, voice-wiring 16; all 0 failed. Engine typecheck exit 0. guard-crisis, concern-classifier, voice, anonymous-zero-persistence not re-run: the repair diff does not touch crisis.ts, concern-classifier.ts or their inputs (maker's K7 at 13ac9b7 stands, code identical).
- Design ruling (localized follow-up fails -> whole English reply incl. English follow-up): ACCEPTED. Safe (the English follow-up already passed safeFollowUp), coherent (matches K1's "is the English reply"), observed in every M3 case above.

## Non-blocking (ledger)
- ISS-387 low: lang.ts:331-334 builds DEVANAGARI_MAGNITUDE with new RegExp over a plain string, so `\p{L}\p{M}` lose their backslash (re.source is `(?<![p{L}p{M}])...`); words containing सौ (सौंदर्य) match and fall back to English when English has no figure. Fails closed.
- ISS-388 low (process): the repair edited the cycle-0 verdict and ledger rows to renumber ISS-380..382; accepted, the collision with main was real.
- Open risks 1-14 in the manifest read; 1 and 3 remain Umesh decisions.

EXPLANATION: The K1 schema repair, M2 and M3 are sound and each falsifies cleanly; the link, country, Latin-unit and digit checks of M1 hold. The figure/unit guard still lets a Devanagari-written figure or currency word through, which is exactly the spelled-out Hindi figure and new-unit variant the brief asked to be hostile, so K1's number parity is not fully met. The fix is a few lines in lang.ts localizedClaimOk.

Metrics: start=2026-10-19T21:40:17+05:30 end=2026-10-19T21:57:00+05:30 wall_min=17 agent_min=unavailable blocked_min=about 4 (shared lock held by PID 36944, not touched) suite_runs=0 repeat_runs=0 mutations=4 tokens=unavailable cycle=1 resumes=0 policy=proportional-verification/2026-10-19.16 check_s=1000 mutants=0 defects_unit=1 defects_6c=0
slow: hostile-driver authoring and copies 8 min
