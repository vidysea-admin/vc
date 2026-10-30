# t061-voice-crisis-lang - T-061 / D-143, voice crisis reply in the student's language

Status: ready-for-check
Fix cycle: 0
Policy-Version: proportional-verification/2026-10-19.17
Tier: M (student safety path, shared module apps/api/src/voice.ts)
Round: est 20 min (round 1)
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

## Tests / Pre-check (one line per criterion; the sha is the code commit)

Tests[C1]: apps/api/tests/voice-crisis-lang.test.ts "C1: a Hindi (Devanagari) voice crisis ..." and "C1: a Hinglish (Roman-script) voice crisis ..." — each opens a real voice session, speaks a crisis utterance and asserts the final assistant transcript equals crisisMessageFor(lang, "student") (the chat function), differing from the English constant; red on the base (English), green after.
Tests[C2]: apps/api/tests/voice-crisis-lang.test.ts "C2: an English voice crisis is unchanged", "C2: before any crisis the session is configured with the English message", "C2: a later English crisis after a Hindi one ...", "C2: a model final whose text equals the crisis message ..." — English text, config, per-utterance language, and the ordinary-model-reply path (turn id, no flag, no escalation) are all asserted; the flag/escalation counts are asserted in the C1 tests and the existing voice-crisis-turn tests.
Pre-check[C1]: fa973f8d cd apps/api && npx tsx --test tests/voice-crisis-lang.test.ts -> pass 6 of 6 (RED first on the base: both C1 tests and the Hindi-then-English test failed)
Pre-check[C2]: fa973f8d cd apps/api && npx tsx --test tests/voice-crisis-lang.test.ts tests/voice-crisis-turn.test.ts tests/partner-voice.test.ts tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts tests/voice-usage.test.ts && npx tsc --noEmit -p . -> pass 176 of 176, tsc exit 0 (an earlier combined run had one load-timing flake in voice.test.ts C16, unrelated; green on rerun); existing deepEqual of the crisisMessage text in voice-crisis-turn and partner-voice stays green

## Capability coverage (one falsification per criterion, throwaway copy of apps/api/src+tests, node_modules junction, deleted after)

```
C1 BASE (no src edit): hi test red (actual English), hi-Latn test red, Hindi-then-English test red (timeout)
C1 FALSIFY getter hard-wired to crisisMessageFor("hi",...): tests 6 | pass 2 | fail 4  (hi-Latn, English, pre-crisis config, Hindi-then-English red)
C2 FALSIFY fixedCrisis also true when t.text === STUDENT_CRISIS_MESSAGE (the old text-equality idea): tests 6 | pass 5 | fail 1  (the model-final test red: reply not relayed)
GREEN (worktree): tests 6 | pass 6 | fail 0
```

CORE-REQUEST: none.

Metrics: suite_runs=0, files_changed=2 (+1 manifest), tests_added=6, src_lines_added=13.
