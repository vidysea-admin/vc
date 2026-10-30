# t061-voice-crisis-lang - T-061 / D-143, voice crisis reply in the student's language

Status: ready-for-check
Fix cycle: 0
Policy-Version: proportional-verification/2026-10-19.17
Tier: M (student safety path, shared module apps/api/src/voice.ts)
Round: 1
Worktree: D:/vc/.worktrees/vc-completion/.worktrees/t061-voice-crisis-lang, branch wave/t061-voice-crisis-lang, base 66eef499
Dual check: no (no auth, tenancy or production-write change; a message-text selection on an existing safety path)

## What changed

- apps/api/src/voice.ts (edited in place; imports `crisisMessageFor` from @vc/engine, the function chat uses at packages/engine/src/student/graph.ts:1180 and :1218)
  - `Conn.crisisLang?` (new optional field, near crisisTurnIds)
  - `detectForConn` capture(): on a detected crisis (or a throwing detector) sets `c.crisisLang = detectLanguageOffline(text).lang` (try/catch, falls back to unset = English)
  - `liveConfig`: `crisisMessage` is now `{ get text() { return crisisMessageFor(c.crisisLang ?? "en", c.anon ? "anonymous" : "student") } }`. LiveSession reads `config.crisisMessage.text` only at fireCrisis (packages/providers/src/live.ts:588+) plus the constructor non-empty check, which sees English. No new crisis text; no change to packages/providers (live.ts is T-060's file).
- apps/api/tests/voice-crisis-lang.test.ts: NEW (6 tests)
- Unchanged: the flag, state, escalation, zero-LLM crisis rules, the fixed=true path (voice.ts onFinalTranscript), audio, redaction, all other files.

Design note: the language is the language of the crisis utterance (latest crisis), not a session property, so a Hindi crisis followed by an English one is answered in English. The anonymous route uses the same getter with mode "anonymous" (chat's anonymous crisis is also language-aware); it is not exercised with a Hindi utterance in a test (the partner-voice harness is heavy), only its English text is, by the existing partner-voice test (deepEqual crisisMessage text) which stays green.

## Tests[C1]

- 66eef499+worktree `cd apps/api && npx tsx --test tests/voice-crisis-lang.test.ts` -> tests 6, pass 6, fail 0
- RED first (TDD), before the src edit: the two C1 tests failed (actual = English STUDENT_CRISIS_MESSAGE, expected CRISIS_MESSAGES.hi / hi-Latn student text) and the mixed-language test timed out waiting for the Hindi message.

## Tests[C2]

- same command: C2 tests (English unchanged; session configured with English before any crisis; Hindi-then-English in one session; model final equal to STUDENT_CRISIS_MESSAGE is relayed as an ordinary reply with a turn id, no crisis flag, no escalation) -> green.

## Pre-check[C1]

- 66eef499+worktree `cd apps/api && npx tsx --test tests/voice-crisis-turn.test.ts tests/partner-voice.test.ts tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts tests/voice-usage.test.ts` -> tests 170, pass 169, fail 1 in the first combined run (voice.test.ts "C16 supersede loop" timing test, unrelated to crisis); rerun alone: voice.test.ts 67/67 pass, C16 pass; voice-limits 10/10 twice. Existing assertions kept green: voice-crisis-turn deepEqual crisisMessage `{ text: STUDENT_CRISIS_MESSAGE }`, partner-voice deepEqual `{ text: CRISIS_TEXT_ANONYMOUS }`.

## Pre-check[C2]

- 66eef499+worktree `cd apps/api && npx tsc --noEmit -p .` -> exit 0, no output.

## Capability coverage (one falsification per criterion, throwaway copy of apps/api/src+tests, node_modules junction, deleted after)

```
C1 BASE (no src edit): hi test red (actual English), hi-Latn test red, Hindi-then-English test red (timeout)
C1 FALSIFY getter hard-wired to crisisMessageFor("hi",...): tests 6 | pass 2 | fail 4  (hi-Latn, English, pre-crisis config, Hindi-then-English red)
C2 FALSIFY fixedCrisis also true when t.text === STUDENT_CRISIS_MESSAGE (the old text-equality idea): tests 6 | pass 5 | fail 1  (the model-final test red: reply not relayed)
GREEN (worktree): tests 6 | pass 6 | fail 0
```

CORE-REQUEST: none.

Metrics: suite_runs=0, files_changed=2 (+1 manifest), tests_added=6, src_lines_added=13.
