# Verdict p1-lk5 (cycle 3, repair check after the D-106 brief rewrite)
Date: 2026-10-20. Bound to D:/vc/.worktrees/lk5, head e5b5d6f (code af84edb), Repair base 82d2470 (verified ancestor of HEAD). Cycle checked: 3
Policy-Version: proportional-verification/2026-10-19.16 (as pinned). Checker: fresh subagent, single check (Dual check: no). The cycle-2 verdict stays in git history (d907e64).

## Check plan
Tier L (safety path, lang.ts / graph.ts localized reply). Failed list from cycle 2: K1/M1 (ISS-389). Re-ran: the manifest pre-check files one at a time through vc-testlock, the repair diff in full (6a7a547..af84edb; the rest of 82d2470..e5b5d6f is merged-in main work and the manifest), the whole-unit diff 115e511..HEAD for out-of-scope files, hostile sentences I wrote myself, the 7 protected assertion changes, crisis-first, one falsification per brief criterion K1-K4 (K1..K4 here are the rewrite brief's ids, all inside contract K1).

## Results
- Scope: product files in the whole-unit diff are concern-classifier.ts, index.ts, claims.ts, graph.ts, lang.ts, kb-answer SKILL.md and lk5.test.ts only. guards/crisis.ts is untouched since base. No out-of-scope file.
- Code read (lang.ts:331-375, graph.ts:715-760): `localizedClaimText` fails closed (reply language en, empty, script mismatch, sentence count differs), else per aligned pair shows the English sentence when either side is factual, the localized one when neither is. `localizedFollowUpOk` requires `localizedClaimText(...) === fl`. The deleted lists and parity code are gone; no Hindi/Hinglish word list remains.
- K1/K2 hostile (chk-h3, real runStudentTurn, 14 NEW factual sentences, none in lk5.test.ts): digits, Devanagari digits plus euro sign, "तीन सौ", "साढ़े तीन सौ", "तीन सौ यूआन", "0.3 हज़ार", rupee symbol, EUR code, Roman "takriban teen sau", "three hundred", and four country-naming sentences (Devanagari, Latin, Roman "Jarmani", "डॉयचलैंड") all show the English wording, 14/14, localized text absent. Also 13 of 15 fact-free-English probes with a detectable localized fact (digits in 2 scripts, ₹, %, daad.de, www host, e-mail, country, 12 months, USD/INR, 2nd, "fifty euro", "two hundred") give English.
- claims.ts coverage sweep (chk-h5, 373 localized probes against a fact-free English sentence): all 23 NUMBER_WORDS, all 16 x 15 Hindi-word + magnitude/currency pairs, "a lakh/an crore/half a million/one month" forms, digits in 8 systems, currency symbols, 13 ISO codes, 10 link forms and 30+ country names (Latin and Devanagari) give English wording or the English reply. Shown localized (11): 三百, daad[.]de, Deutschland, five city names before a postposition (Berlin mein), three Devanagari city names. All are outside what the rule claims (claims.ts list, listed countries); ISS-392 (low).
- K3: greeting, encouragement, question back, a fact-free tuition sentence, Roman Hinglish question stay localized; a mixed 3-sentence claim gives Hindi + English fact sentence + Hindi (exact string); fact-free localized follow-up shown, one with "2027" gives the English reply.
- K4: 1 vs 2 and 2 vs 1 sentences give undefined; a 2-claim turn with one misaligned claim gives the whole English reply (both claims English); a localized 2nd sentence "सेमेस्टर शुल्क सत्तर है" against one English sentence never reaches the student.
- Protected changes (7, git diff 6a7a547..af84edb lk5.test.ts): fixture without Germany (a country sentence is English by D-106), Devanagari-digit control and "lagbhag 300 euros" control now expect English wording, country swap built by prefix, localizedClaimOk link/IDN/dot tests rewritten against localizedClaimText / isFactualSentence with the same hosts (now stronger: any link means English), ISS-386/387 tests removed with the deleted lists and their fact-free controls kept in K3, M2 bad phrase moved inside the one aligned sentence (a mutant dropping the shown-text crisis check fails it). Each is justified by D-106, none weakens a behaviour that still exists.
- crisisGuard first: English, Devanagari and Roman crisis turns give STUDENT_CRISIS_MESSAGE with 0 provider calls and 0 detector calls (crisis-run.txt).
- Falsification (copies of HEAD under D:/chk-tmp/lk5c3, bound tree untouched; baseline lk5 61/0, chk-h3 6/0): K1 aligned-pair test off 10+2 fail; K2 spelled-figure and country detection removed 2 fail; K3 every sentence factual 13+2 fail; K4 sentence-count equality dropped 6+1 fail; M2 shown-text crisis check removed 1 fail. Green before, red after.
- Pre-check re-run through vc-testlock, one file at a time (no lock wait): lk5 61/0, lang 34/0, student-graph 64/0, claims-guard 33/0, crisis-defaults 17/0; engine tsc --noEmit exit 0.
- R-a (fact invented only in the localized copy of a fact-free English sentence, e.g. "सत्तर युआन", "Ye sirf pachaas euro hai"): reproduced, accepted design by D-106 (translation drift, design R2). I found no leak among the forms the rule claims to cover, so it is not a FAIL.
- Process note: my first K2 mutant did not apply (CRLF in the archived copy); rerun with a tolerant pattern, counted once.

VERDICT: PASS
SCOREBOARD: 7/7 criteria met (K1 incl. M1 sub-claim closed), invariants K7 hold
TIER: L (safety path; unchanged)
CAPABILITY-COVERAGE: 5/5 falsified (K1-K4, M2)
LIVE-BROWSER: not-applicable (engine text guard, no UI)
ISSUES-WRITTEN: ISS-392 (low); ISS-389 set fixed, ISS-390 set wontfix-accepted (D-106 R-a)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
Metrics: start=2026-10-20T01:42:59+05:30 end=2026-10-20T01:54:40+05:30 wall_min=12 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=5 cycle=3 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.16 check_s=701 mutants=0 defects_unit=0 defects_6c=0
