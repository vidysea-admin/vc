# Verdict: t061-voice-crisis-lang (T-061 / D-143, voice crisis reply in the student's language)

**Cycle checked:** 0
**Checker:** /checker (fresh context, Mode A, single checker; tier M, no auth/tenancy/prod-write)
**Code HEAD tested:** 941a682e (base 66eef499); worktree clean for code, nothing in it edited by the checker
**Policy-Version:** proportional-verification/2026-10-19.17
**Run at:** 2026-10-30T23:17+05:30
**Overall: PASS**

Metrics: suite_runs=0, tests_run=21 builder+existing (voice-crisis-lang 6, voice-crisis-turn 15) + 12 checker-authored hostile cases in a throwaway copy (deleted), files_read=voice.ts diff, live.ts call sites, lang.ts crisisMessageFor/detectLanguageOffline, graph.ts crisisResult, tsc=0.

## Diff and scope
`git diff 66eef499..941a682e` = apps/api/src/voice.ts (+13/-2), apps/api/tests/voice-crisis-lang.test.ts (new), the manifest. Nothing else; packages/providers (T-060's live.ts) and packages/engine untouched. Inside Changes-authorized (D-143: voice.ts crisis path + its tests). `crisisMessageFor` was already exported from @vc/engine (index.ts:38). No new crisis text. In place edit at voice.ts (Conn.crisisLang, detectForConn capture, liveConfig getter), no duplicate function.

## Getter safety at the live.ts read site
live.ts reads `config.crisisMessage.text` only at the constructor non-empty check (:315, sees "en" so non-empty) and in `fireCrisis` (:588+), which runs synchronously right after `detect(text)` returns (scanForCrisis :553-570). `crisisLang` is set inside the same synchronous detector call, so the three reads in fireCrisis (transcript, crisis event, sink) see one consistent value. `crisisMessageFor` never returns empty: unknown or other-script language falls to the English constant (lang.ts:1047-1052). A throwing `detectLanguageOffline` sets undefined, so "en". The provider does not copy/spread the config (grep: no `...config`/clone), so the getter stays live. The scan text is `userBuf` (the whole utterance so far, live.ts:440) or the typed text, not a short chunk, so language is judged on the full utterance as in chat.

## Criteria
- C1 PASS. Outcome proven by driving the real voice API with MockLiveProvider and reading the final assistant transcript the student receives: Devanagari -> `crisisMessageFor("hi","student")`, Hinglish -> `crisisMessageFor("hi-Latn","student")`, each exactly once, flag and escalation still once. Also with the REAL default detector (crisisGuard, no stub): `मैं मरना चाहता हूँ` -> hi message, `main marna chahta hoon yaar mujhe jeena nahi hai` -> hi-Latn message. RED on base 66eef499 (restored voice.ts from git): real-detector Devanagari, real-detector Hinglish, throwing-detector Hindi, Hindi-Hinglish-Hindi sequence, anonymous Devanagari and anonymous Hinglish all fail with the English text; English cases stay green. GREEN on head.
- C2 PASS. English unchanged (STUDENT_CRISIS_MESSAGE once; session configured with `{text: STUDENT_CRISIS_MESSAGE}` before any crisis); existing voice-crisis-turn tests 15/15 + new 6/6 = 21/21 pass on head. Flag and escalation counts asserted 1 per crisis, including three crises in one session (Hindi, Hinglish, Hindi: 3 flags, 3 escalations, each reply follows its own utterance). A model final equal to the crisis text is relayed as an ordinary reply with a turn id, no flag, no escalation (builder test, re-run green). Anonymous route (builder did not test; I did, by extending a throwaway copy of partner-voice.test.ts): Devanagari -> `CRISIS_MESSAGES.hi.anonymous`, Hinglish -> `CRISIS_MESSAGES["hi-Latn"].anonymous`, English -> anonymous English; one flag, counters exactly ["crisis"], zero tenant escalations. The anonymous variant is never swapped for the student one.
- Diff read in full; out-of-scope scan clean.

## Hostile variants (all in a throwaway copy outside the root, deleted)
- Detector throws on Hindi text: one non-empty Hindi vetted message, escalation once. On English text: English message.
- `detectLanguageOffline` itself throws (copy edited to force it): English constant, non-empty, escalation once (falls back safely, never empty/undefined).
- Mixed: English crisis phrase + Devanagari words -> detectLanguageOffline says "en", so English reply (identical to what chat would pick, same function; see observation). English phrase + one Hinglish marker -> en. Tamil text -> en fallback, non-empty.
- Hindi then English crisis in one session (builder test) and Hindi/Hinglish/Hindi (mine): language follows the latest crisis utterance.

## Falsifications (one per criterion, judged)
- C1: base restore (above) red; getter hard-wired to `crisisMessageFor("hi",...)` -> English crisis, mixed-Roman, English-throw, three-crisis sequence, anonymous English all red. Builder's recorded falsifications (4 of 6 red; text-equality fixedCrisis red on the model-final test) are consistent with my re-derivation and I judge them adequate.
- C2: lang-detection-throws variant stays English/non-empty (my H8).

## Findings (none blocking)
1. Observation, not a defect of this change: a mixed utterance with an English crisis phrase plus Hindi words in Devanagari is classified "en" by detectLanguageOffline (Latin majority), so the voice reply is English, same as chat does for that text. Parity with chat is the D-143 acceptance; improving mixed-script handling would be a separate engine change.
2. Low, doc staleness: voice.ts header comment (:27) and the config doc (:311-312) still say the message is the engine's STUDENT_CRISIS_MESSAGE / ANONYMOUS_CRISIS_MESSAGE constant and "not configurable"; now it is language-selected. No behaviour impact; fold into the next edit of that file.
3. The Hindi and Hinglish wording remains HELD for clinical safety owner and native-speaker read (lang.ts note, qa/evidence/hindi-crisis-validation.md); this verdict checks selection and delivery, not the clinical wording.
4. The C16 load-timing flake in voice.test.ts was not hit (I ran no full suite); the rule was not needed.

## Commands run
- `cd apps/api && npx tsx --test tests/voice-crisis-lang.test.ts` -> 6/6 pass; `npx tsx --test tests/voice-crisis-turn.test.ts tests/voice-crisis-lang.test.ts` -> 21/21 pass; `npx tsc --noEmit -p .` -> exit 0.
- Throwaway copy (scratchpad, node_modules junction, removed with `rmdir` on the junction only): hostile.test.ts 9/9 pass on head; same set red 6 of 7 on base; anonymous 3/3 on head, 2 of 3 red on base.
