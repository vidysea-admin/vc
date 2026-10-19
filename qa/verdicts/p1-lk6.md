# Verdict - p1-lk6 (Mode A, cycle 0): PASS
Cycle checked: 0
Bound to: D:/vc/.worktrees/lk6 (branch p1/lk6). Judged range ae48596..c54f7a2 (133634d is the qa-only manifest commit). Contract rows cited in the manifest plus D-104 and D-105. Policy-Version: proportional-verification/2026-10-19.17. Checker: claude-sonnet-subagent, fresh context, tier L, no dual check.
Evidence dir: qa/evidence/p1-lk6-check/ (run logs, hostile-probe logs, mutant log, probe sources saved as .txt so they are not collected as tests).

## Check plan (step 0)
Logic change, tier L: a student-turn fact extractor (engine), two optional store fields (db), two wiring sites plus a default (api). One checker. Instruments: (1) re-run the manifest pre-checks through vc-testlock.sh (slot 1, TMP/TEMP on D:, one job at a time, no full suite); (2) hostile probes written by the checker in a throwaway copy at D:/lk6-chk/copy (outside the bound tree) that drive the real extractor, the chat route and the voice route with a fake provider and read what lands in the fake store and in the logs; (3) one falsification per criterion in its own isolated copy (D:/lk6-chk/m/M1..M10b), green-before / red-after; (4) reference-hit tests for the touched exports; (5) tsc per package. The bound tree was never edited.

## Step 3 - pre-checks re-run (testlock slot 1, unpiped, log files)
engine 15 files: 423 tests, 378 pass, 0 fail, 45 skipped (matches the manifest). api 11 files: 247/247 pass. db 3 files: 47/47 pass. tsc --noEmit: engine rc 0, api rc 0, db rc 0, engine evals tsconfig rc 0. Reference hits (touched exports used elsewhere): db erasure + db-init 97/97, api acceptance-student-journey 3/3, providers rules 11/11, engine evals/providers 5/5.

## Outcome proof (hostile probes; logs h-engine.log, h-db.log, h-api.log, final3.log)
- Quotes: a translation ("Germany" for a Hindi turn), Latin case drift, a quote from another turn or a wrong turnId, a spliced quote, an ellipsis-joined quote, a 501-char quote: all dropped. A trailing space beyond the text end is dropped; a trailing space inside the text is kept and trimmed. An NFC quote against NFD text (including U+0958 nukta forms) is dropped, never fuzzily accepted (strict includes), so no unverified quote is stored.
- Values and keys: Devanagari, Greek, Cyrillic, Arabic-Indic, Devanagari and full-width digits, a Devanagari word mixed with Latin, object, array, null, empty and blank values are all dropped; boolean, number and a Latin diacritic word are kept. Keys with spaces, hyphen, non-ASCII, leading digit, 65 chars, empty, "__proto__" are dropped; 64 chars kept. The uppercase key "Target_Country" is kept (the slug regex allows A-Z).
- Store (real chat route, fake Mongo): email, ASCII phone and Devanagari-digit phone in value and quote are stored as [EMAIL] and [PHONE]; the key is redacted too. Arabic-Indic digits are NOT redacted by redactPii (stored as written in value and quote).
- Failures: provider throws (message and name both carry the student's words), TimeoutError, malformed JSON, wrong shapes, null: the engine returns a text-free StudentFactExtractionError (no cause, name is the failure class) or an empty result. Chat returns 200 state ok, log event chat_fact_extraction_failed or none, and the log has no student words, no quote and no phone (leaks=false in all three modes).
- Zero provider calls: the six explicit Hindi and Hinglish self-harm phrases crisisGuard flags (chat state=escalated, extractCalls 0, facts 0); voice Hindi and Hinglish crisis (extractCalls 0); unconsented under-18 on chat and voice (0); blank text "", "   ", "\n\t" (0).
- Re-propose: the same key later with a different quote or none leaves no stale quote or sourceLang (raw doc checked); an over-long new quote does not keep the old one; sourceLang without a quote is not stored. Legacy rows without quote/sourceLang: the fields are optional, covered by the existing student-store tests (47/47 green).
- Voice default (probe chk-voice-default, startApi with NO injected extractFacts): a Hindi utterance lands as target_country=Germany, quote "जर्मनी में", sourceLang hi (1 row). With the default wiring removed (copy M5) the row count is 0. Behaviour correct on the bound tree.
- Audit proposal script: reviewed in full; it calls only read methods, and the repo test fails if a write method is touched (F10 killed).

## Criteria
C1 MET. C2 MET. C3 MET. C4 MET. C5 MET (chat default pinned by the repo; voice default proven by the checker probe, see finding 2). C6 MET. C7 MET. C8 MET. C9 MET. C10 MET (see findings 1 and 3).

## Falsification (checker copies, each isolated; baseline engine 13/13, db 19/19, api 134/134 on the files named)
| id | crit | edit | result |
|---|---|---|---|
| M1 | C1 | value-language guard disabled | red 12/1, "a value or key that is not English" |
| M2 | C2 | substring check disabled | red 12/1, "quote not a verbatim substring" |
| M3 | C3 | translatedText filled | red 12/1, "translatedText is empty" |
| M4a | C4 | store quote unredacted | red 18/1 (db) |
| M4b | C4 | original error rethrown | red 12/1 |
| M5 | C5 | voice default extractor wiring removed in index.ts | repo tests 134/134 STILL GREEN (survived); checker probe red (0 rows) |
| M6 | C6 | persistText ignores consent | red 131/3 |
| M7 | C7 | voice rethrows extraction error | red 133/1 |
| M8 | C8 | corrected fact keeps the quote | red 18/1 (db) |
| M9 | C9 | audit script issues a delete | red 12/1 |
| M10 | C10 | skip only on level === "crisis" (concern no longer skipped) | 13/13 STILL GREEN (survived); concern text then makes 1 call |
| M10b | C10 | the whole crisisGuard skip removed | red 12/1 (engine); chat-profile 17/17 stays green (chat has its own crisis path before extraction) |

10 of 12 checker mutants were killed by the repo tests. The two survivors are test-strength gaps, not behaviour defects: the behaviour is correct on the bound tree (probes above). The maker's own "18 killed, 0 survivors" table covers the chat default wiring (F5c) but not the voice default line, and not the concern-versus-crisis level split.

## Findings (none blocks; all PROPOSED-ISSUE lines, not written to qa/issues.jsonl)
1. PROPOSED-ISSUE medium: crisisGuard (not changed by this diff) does not flag the explicit Hinglish and Hindi suicide word "khudkushi" / "खुदकुशी" ("main khudkushi karunga", "मैं खुदकुशी करना चाहता हूँ": level none, 1 provider call, 1 fact stored in the probe). LK6 reuses crisisGuard exactly as D-105 says (offline floor) and model-based detection is LK4, so this is an owner gap for LK4 and the crisisGuard vocabulary, not an LK6 defect.
2. PROPOSED-ISSUE low: the voice default wiring in apps/api/src/index.ts (`...(passThrough.extractFacts === undefined && defaultExtractFacts ? { extractFacts: defaultExtractFacts } : {})`) is pinned by no repo test (mutant M5 survived). Add a startApi voice test with no injected extractor.
3. PROPOSED-ISSUE low: the concern-level skip in extractStudentTurnFacts (`crisisGuard(text).level !== "none"`, packages/engine/src/scribe/nodes.ts, about line 1284) is not distinguished from a crisis-only skip by any test (mutant M10 survived). Add a concern-level case to tests/student-fact-extractor.test.ts.
4. PROPOSED-ISSUE low: redactPii does not redact Arabic-Indic digit phone numbers; the new quote field (and the value) stores them as written. Pre-existing redactor scope, now more reachable because a verbatim quote is stored.
5. PROPOSED-ISSUE low: uppercase keys pass the slug regex (/^[A-Za-z][A-Za-z0-9_]{0,63}$/), so "Target_Country" and "target_country" are different facts. Lower-case the key or tighten the regex.
6. PROPOSED-ISSUE low: a text of only a zero-width space (U+200B) is not blank by trim() and makes one provider call. Harmless (no fact) but an avoidable call.
7. PROPOSED-ISSUE low (process): the manifest lacks the .13 "Test selection" section and the "Sibling:" and "Owners/Fan-out" sections, and the maker's independent senior-software-engineer review was not run (the manifest says so). This check read the diff fresh; no separate review exists.
8. OWNER DECISION (not a defect): with no flag, the default extractor sends every stored, non-crisis student turn to the default text provider. The processor register (B13) and the chain (LK1) are not in place; the manifest already states this. It needs an explicit owner yes before real traffic.

## Not determined
No real provider, network or production Mongo was touched. Quote quality against a real model was not measured (fake provider only). The legacy-row read was judged from the existing student-store tests, not from a checker probe (my hand-built legacy row had a tenant mismatch and returned []).

Metrics: start=2026-10-19T20:15:00+05:30 end=2026-10-19T21:45:00+05:30 wall_min=90 agent_min=unavailable blocked_min=unavailable (lock waits on slot 1 behind the stale lk1w holder PID 36944 are inside wall_min) suite_runs=0 repeat_runs=1 mutations=12 survivors_final=2 (both test-strength gaps) cycle=0 tokens=unavailable policy=proportional-verification/2026-10-19.17
