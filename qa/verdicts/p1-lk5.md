# Verdict - p1-lk5 (Mode A, cycle 0)
Date: 2026-10-19. Bound to D:/vc/.worktrees/lk5. Checked 3f746e5 (code 090b558); judged d057b13..HEAD. Policy proportional-verification/2026-10-19.16.
Cycle checked: 0

## Check plan
Tier L (safety screen gating replies, parallel/hold concurrency). Single checker (no dual-trigger). Plan: pre-checks K1-K6 and K7 through vc-testlock (TMP on D:), real runStudentTurn driven with fake providers for every hostile variant in the brief, step 4c diff read, one falsification per criterion in copies outside the bound tree. No UI, no live provider. PID 47984 not touched.

VERDICT: FAIL
SCOREBOARD: 6/7 criteria met (K2-K7), K1 not met; invariants: crisisGuard first and unweakened holds
TIER: L (concurrency: safety screen started in route, awaited in finish; graph.ts:549-571, 649-662)
FAILURES:
- [K1] sev: medium - a model-emitted localized "" / null / >2000 chars (or followUpLocalized >500, replyLang >16) fails the whole kb-answer schema, so the student gets the provider apology instead of the English reply, and so does an English turn if the model emits localized "" or null. packages/engine/src/student/graph.ts:392-406 read in this check. Real providers validate (packages/providers/src/index.ts:282). Ran: probe-hostile.txt "empty-string localized", "null localized", "localized too long (2001)", "EN turn localized empty/null" all state=ok message "Sorry, I couldn't put an answer together just now. Please try again."; repro qa/evidence/p1-lk5/repro-k1-empty-localized.test.ts.txt. localizedClaimOk/localizedMessage already treat empty as "show English", so the intent is K1's English reply. Fix: make the three localized fields tolerant (undefined on empty/null/over-long), keep text/kind/sourceIds strict. issue: ISS-383
CAPABILITY-COVERAGE: 6/6 reproduced (K1-K6; K7 is the existing suites)
LIVE-BROWSER: not-applicable (no UI paths changed)
ISSUES-WRITTEN: ISS-383 (medium), ISS-384 (low), ISS-385 (low)
EXECUTOR: claude-sonnet-subagent (maker/builder p1-lk5-build) (checker: claude-sonnet-subagent)
EXPLANATION: Everything except one robustness case holds with fake providers: the screen, the held reply, the rewrite, the helpline line and the detector fixes. The K1 gap is narrow but the brief listed the empty string explicitly, and the code's own empty-string handling is unreachable behind the schema. A repair should be a few lines in graph.ts.

## Evidence (files under qa/evidence/p1-lk5/)
- Pre-check K1-K6 rerun: tests/lk5.test.ts 34 pass 0 fail (precheck-k1.txt). K7: engine 14 files 881 pass 0 fail (k7-engine.txt); apps/api 8 files 205 pass 0 fail (k7-api.txt); typecheck engine exit 0, apps/api exit 0 (tc-*.txt). The manifest's third typecheck (pnpm -r --filter) was not rerun; engine and api cover the changed code.
- Hostile drive of runStudentTurn (probe-hostile.txt, probe-hostile-k2.txt; probe source in a deleted throwaway copy): 
  K1: new https and www URL, e-mail, different number, Latin text claiming hi, whitespace-only -> English reply (OK); "" / null / 2001 chars -> apology (FAIL above); replyLang HI / hi-IN accepted, "" -> English; empty followUpLocalized -> Hindi reply without follow-up.
  K2: injected rewrite text reaches only searchKb (not the response, not the answer prompt question, ask fallback keeps the original); error, empty, wrong shape, >300, number, hang (130 ms with 100 ms cap) -> original text; English turn 0 rewrite calls, Hinglish 1.
  K3: high/critical -> fixed crisis message with flag+escalation; moderate/none -> answer; malformed shape, bogus severity, throw, sync throw, null, undefined, timeout (91 ms at 60 ms cap) -> crisis message with no flag/escalation; late resolve after timeout stays crisis; screen pending 400 ms -> reply not released, then high -> crisis message; screen sees the original text.
  crisisGuard: 7 Hindi/Hinglish/English explicit phrases, authenticated and anonymous -> escalated, 0 screen calls, 0 answer-provider calls.
  K4 (detected ta): ok answer, stress signal, prior flag, coach, anonymous sign-in, anonymous no-answer, provider failure, long message, screen "possible": gloss count 1 and the 14416 line once each; en/hi/hi-Latn: 0 extra lines.
  K5: sync throw, reject, null, undefined, {}, lang number -> offline result, reasons error/invalid. K6: dropped tags only; throwing logger does not break parsing.
- Falsification (falsification.txt; copies D:/chk-tmp/fals/k1..k6, all green before, removed after): K1 script check removed -> 1 fail; K2 rewrite on English turn -> 1 fail; K3 blockAt >= to > -> 1 fail; K4 isOutsideAllowList false -> 3 fail; K5 null guard removed -> 1 fail; K6 dropped log disabled -> 2 fail. Mutants beyond the floor: 0.
- Step 4c: diff d057b13...HEAD touches only the manifest's listed files plus the manifest; no deletion of existing exports; crisis node body moved unchanged into crisisResult (same writes, same flagWriteFailed logic); packages/engine/src/guards/crisis.ts untouched.

## Proposed non-blocking (ledger rows written)
ISS-384 link check narrow (scheme-less domain shown in a Hindi reply; a different link when English also has one passes). ISS-385 detected "und" counts as outside the allow-list. Manifest open risks 1-12 read; risk 1 (A15b/B24.6) and 3 (threshold) remain Umesh decisions, not a FAIL.

Metrics: start=2026-10-19T18:28:16+05:30 end=2026-10-19T20:29:30+05:30 wall_min=unavailable agent_min=unavailable blocked_min=about 95 (shared lock wait from 18:29 to about 20:12, includes a network outage; not separately timed) suite_runs=0 repeat_runs=0 mutations=6 tokens=unavailable cycle=0 resumes=0 policy=proportional-verification/2026-10-19.16 check_s=unavailable mutants=0 defects_unit=1 defects_6c=0
