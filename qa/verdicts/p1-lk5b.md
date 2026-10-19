# Verdict p1-lk5b (cycle 0)
Date: 2026-10-20. Bound to D:/vc/.worktrees/lk5b, branch p1/lk5b, head 4a1161e (code 15a7bdc), base f53f20c. Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17 (as pinned). Checker: fresh subagent, single check (Dual check: no).

## Check plan
Tier M (lang.ts / graph.ts follow-up). Read the whole diff f53f20c..4a1161e, re-ran the manifest Pre-check commands myself through vc-testlock one file at a time (TMP/TEMP on D:), wrote 15 hostile English factual sentences plus 3 fact-free ones that the builder did not use, and falsified B1-B3 once each in a copy outside the bound tree.

## Results
- Scope: the diff has 4 files: packages/engine/src/student/lang.ts, graph.ts (one line), tests/lk5.test.ts, qa/manifests/p1-lk5b.md. No out-of-scope file. guards/crisis.ts and the crisisGuard call sites in graph.ts (first on every turn) are untouched.
- Code read: WORD_FACT_RE (cardinals zero..nineteen, tens, hundred..trillion, lakh/lac/crore, ordinals first..nineteenth and -ieth tens, months except May, bare currency words, percent / per cent) is tested case-insensitively and a hyphenated form matches on its first word; capitalised "May" only. linksIn skips URL_RE without "//" or "www.", EMAIL_RE without "@", DOMAIN_RE without ".". graph.ts localizedFollowUpOk compares with fl.normalize("NFC") (localizedClaimText returns NFC text).
- Pre-check re-run (cwd packages/engine, through vc-testlock, no lock wait): lk5 65/0, lang 34/0, student-graph 64/0, claims-guard 33/0, crisis-defaults 17/0; npx tsc --noEmit exit 0 (no output).
- B1 hostile (own file D:/tmp/lk5b-check/proof/hostile.test.mts, real exported localizedClaimText, replyLang hi with Devanagari AND hi-Latn with Hinglish copies): 15 English factual sentences, none of them the builder's, give the English wording in both scripts, 30/30, and isFactualSentence is true for all 15: "forty-two seats", "second week of September", "nine hundred pounds", "eleven students", "thirty-first of July", "three per cent", "quoted in ringgit", "every February", "five lakh", "quoted in dollars", "sixteen-month programme", "The Fifteenth of November", "Tuition: Ninety Pounds Sterling", all-caps "SEVENTY PERCENT", "three hundred and sixty-five". 3 fact-free sentences (offer to help, "take your time", "exciting plan!") stay localized in both scripts, 6/6, and isFactualSentence is false.
- B2: the new test shows a precomposed U+095B follow-up through the real runStudentTurn and passes; reverting to `=== fl` fails it.
- B3: the 2000-char unbroken Devanagari claim is classified false in under 10 ms in the real tree; a dot variant (。) and "daad.de" are still found as hosts.
- B4: fact-free controls (K2/K3/M3 in lk5, lang, student-graph, claims-guard, crisis-defaults) all green as above.
- Falsification (copy of 4a1161e under D:/tmp/lk5b-check/fal with the node_modules junction; baseline lk5 65/0, bound tree untouched): F-B1 the WORD_FACT_RE/MAY_RE line removed: 2 lk5 B1 tests plus my hostile test fail (64 pass 3 fail incl. mine); F-B2 compare back to `=== fl`: 1 fail (B2); F-B3 URL/EMAIL needle guard and the "." guard removed: 1 fail (B3 timing); restored: 65/0. Green before, red after.
- Open risks (not blocking): the builder's note stands: an unbroken 2000-char word that contains a "." or "@" still pays the backtracking regex cost; and B1 over-matches by design ("no one", "second", "won", verb "march"), which only yields the English wording, safe by D-106.
- Process note: the archived copy has CRLF line endings, so the first sed-based mutant did not apply; I switched to a node string replace and counted each mutant once.

VERDICT: PASS
SCOREBOARD: 4/4 criteria met (B1, B2, B3, B4)
TIER: M
CAPABILITY-COVERAGE: 3/3 falsified (B1, B2, B3)
LIVE-BROWSER: not-applicable (engine text guard, no UI)
ISSUES-WRITTEN: none
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
Metrics: start=2026-10-20T02:05:44+05:30 end=2026-10-20T02:10:25+05:30 wall_min=unavailable agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=3 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=unavailable mutants=0 defects_unit=0 defects_6c=0
