# Verdict p1-lk5 (cycle 2, repair check, last cycle)
Date: 2026-10-19. Bound to D:/vc/.worktrees/lk5, head 983c773 (code 036fc87), Repair base e71c8f4 (verified ancestor). Cycle checked: 2
Policy-Version: proportional-verification/2026-10-19.16 (as pinned). Checker: fresh subagent, single check (Dual check: no). Earlier verdict kept as qa/verdicts/p1-lk5.r1-1.md.

## Check plan
Tier L (safety path, lang.ts figure/link guards). Re-ran: K1/M1 (failed), ISS-387, IDN-host and dot-variant detection, crisis-first, one falsification per repaired criterion, scoped K7. Read `git diff e71c8f4..983c773` in full (lang.ts +125, lk5.test.ts +61, evidence, manifest) and scanned the whole-unit diff: files outside the unit's scope are only merged-in main work (LK1 providers, ISS-350 api), no LK5 commit touches them.

## Results
- Probes: every probe in repair1-check/probes.txt now gives the English reply; so do the cycle-1 list plus mine: सत्तर/बारह/नब्बे/पचास/सौ/एक सौ पचास with no English figure, a differing word figure (चार सौ, तीन सौ पचास, तीन हज़ार vs 300), पाँच हज़ार पचास vs 5000, रुपये/पाउंड/येन for euros, Devanagari digits extra, ₹/$/£/GBP symbols, ordinals, glued words, Hinglish teen sau/chaar sau/paanch hazaar/do lakh/bees/dollar.
- Controls still shown: Devanagari digits ३००, तीन सौ यूरो = 300, पाँच हज़ार यूरो = 5000, पांच हजार, figure-free claim, bare एक, "300" with no currency word.
- Magnitude after digits ("3 लाख" vs English "300,000" or "3 million", "5 हज़ार" vs "5000", "3 हज़ार" vs "3 lakh"): English reply; shown only when English carries the same magnitude word ("3 लाख" vs "3 lakh rupees", "3 हज़ार" vs "3k"). Safe (over-blocks, ISS-391).
- ISS-387: DEVANAGARI_MAGNITUDE.source = `(?<![\p{L}\p{M}])(?:सौ(?![\p{L}\p{M}])|...`; सौंदर्य, सौहार्द, सौम्य, सौर no match; सौ matches.
- IDN host and dots: शिक्षा.संस्थान, example.शिक्षा, सेवा.संस्थान/fees and evil。/．/｡/․ test (also in URL, www, e-mail forms) are links and give the English reply; the same link with fullwidth dots is shown (equals English link). Not links by design: ZWJ/ZWNJ/zero-width inside a host, U+FE52/2027/2E33 (not browser host separators): low.
- crisisGuard first: 4 crisis turns (English, Hindi, Hinglish) give the fixed crisis message with 0 provider calls and 0 detector calls.
- Perf: localizedClaimOk on 2000-char worst cases 0.04-218 ms.
- Falsification (copies D:/chk-tmp/lk5c2/f-*, bound tree untouched; falsification.txt): baseline 5 pass 0 fail; word figures ignored -> 2 fail; unit check removed -> 2 fail; plain-string magnitude regex -> 1 fail; \p{M} removed from DOMAIN_RE -> 1 fail; dot fold removed -> 1 fail. Green before, red after for ISS-386, ISS-387, IDN, dots.
- K7 scoped, one file at a time through vc-testlock (k7-summary.txt): engine lk5 58/0, lang 34/0, student-graph 64/0, claims-guard 33/0, crisis-defaults 17/0; api chat 32/0, anonymous-route 16/0; engine tsc --noEmit exit 0.

## FAIL
Closed hand-written lists leave the cycle-1 defect open in a narrower form. Real runStudentTurn, fake providers, English "about 300 euros" or no figure; each localized text is SHOWN to the student (evidence: under-blocks.txt, hostile-table-run.txt):
- currency/unit the English lacks: "300 डॉलर्स" (plural of the listed डॉलर), "रु. 300", "300 वॉन", "300 युआन", "300 फ्रैंक", "300 क्रोना"; HI_UNIT in lang.ts lists 7 currencies only.
- magnitude/figure the English lacks: "300 अरब यूरो", "300 खरब यूरो" (HI_MAGNITUDE stops at करोड़), "एक दर्जन कोर्स", "आधा सेमेस्टर", "हज़ारों छात्र".
- Hinglish (claims.ts, unchanged): "Sirf sattar euro", "Barah courses", "Nabbe percent", "pachaas euro", "panch hajar", "300 rupaye" for euros.
FAILURES:
- [K1/M1] sev: medium · localized claim still shows a currency, magnitude or number word the English claim lacks, when the word is outside the lists · direction: stop extending lists; fail closed on any word after a figure that is not on a short benign allow-list, or compare structured unit/figure fields, or owner-accept the limit · issue: ISS-389 (Hinglish part ISS-390)
Open risks 13 and 15 in the manifest disclose this list limit; it is still content shown to the student, which the dispatch judging rule makes a FAIL. Fix cycle 2 is the cap, so the next step is STALLED/HUMAN_GATE: Umesh decides between a structural fix and accepting the list limit.
Low rows (not FAILs): ISS-391 over-blocking (दो/दिन/साल, यू.एस.ए, "5 हज़ार" vs "5 thousand", Hinglish teen sau fail closed), zero-width characters inside a host.

VERDICT: FAIL
SCOREBOARD: 6/7 criteria met (K1 not met via M1 sub-claim), invariants K7 hold
TIER: L (safety path; unchanged)
CAPABILITY-COVERAGE: 4/4 repaired criteria falsified (ISS-386, ISS-387, IDN, dots)
LIVE-BROWSER: not-applicable (engine text guard, no UI)
ISSUES-WRITTEN: ISS-389, ISS-390, ISS-391
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
Metrics: start=2026-10-19T22:28:58+05:30 end=2026-10-19T22:41:42+05:30 wall_min=12 agent_min=unavailable blocked_min=1 suite_runs=0 repeat_runs=0 mutations=5 cycle=2 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.16 check_s=700 mutants=0 defects_unit=1 defects_6c=0
