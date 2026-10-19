# Manifest — p1-lk4
**Contract:** D-104, D-105 (Q1 allow-list, model-based detection with offline fallback, Q3 new file `packages/engine/src/student/lang.ts`); B24.7 / A11b (crisis defaults), A15b/B24.6 (see Open risk 1). Design row LK4 in `qa/evidence/p1-briefs/p1-lang-kg-design-result.md`; brief `qa/evidence/p1-briefs/p1-lk4-build.md`.
**Criteria:** (design row LK4 verbatim, then the D-105 additions)
- L1 detection fixtures for each script, Latin Hinglish, mixed
- L2 both `isDevanagari` copies replaced
- L3 escalation `lang` correct
- L4 vetted-language crisis message returned, other languages get English+Hindi
- L5 every entry passes the substring fixture (14416, no-counsellor statement, safe-adult question)
- L6 crisis runs on original text first and makes no model call
- L7 B24.7 and A11b forbidden tests still pass for English
- D1 (D-105) detection is model-based through an injected detector over the text chain (cheap JSON `{lang, confidence}`), with a deterministic script-based fallback used only when the model call fails, is invalid, contradicts the script, or times out (1.5 s); the detector never sees a turn before `crisisGuard` has run on the original text, and a crisis turn makes no model call
- D2 (D-105) allow-list `VC_REPLY_LANGS` default en,hi,hi-Latn; any other detected language maps to reply language en
- D3 (D-105) the crisis message catalog is en and hi only and reuses wording already approved in the repo (no new clinical wording)
**Goal task:** none
**Date:** 2026-10-19
**Status:** ready-for-check
**Fix cycle:** 0
**Policy-Version:** proportional-verification/2026-10-19.16
**Tier:** L (crisis text path plus a new engine module and two call sites)
**Dual check:** yes (crisis text)
**Persona walk:** skip (no human screen)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent (maker/builder p1-lk4-build)
**Executor rationale:** one coherent change: a new module approved by D-105 Q3, two call sites replaced in place, no cross-package redesign.

## What changed
Branch `p1/lk4` from `ae48596`. Code commit `4d20c71`; this manifest is a later commit.
- `packages/engine/src/student/lang.ts` (new, approved by D-105 Q3): `detectScript`, `detectLanguageOffline` (Unicode script by letter majority, tie to non-Latin; a Latin turn with two distinct Hinglish words is `hi-Latn`), `createModelLanguageDetector` (inline `lang-detect` prompt, 400-char prefix, 1.5 s timeout with abort; error/invalid/timeout/inconsistent fall back to offline; the reported script is always the deterministic one), `parseReplyLangs`/`resolveReplyLang` (allow-list), `FIXED_TEXTS`/`fixedText` (English only, other languages fall back to English), `CRISIS_MESSAGES`/`crisisMessageFor`. The fixed texts and crisis messages moved here from graph.ts (same bytes).
- `packages/engine/src/student/graph.ts` (in place): constants imported from lang.ts and re-exported under the same names; `isDevanagari` removed; new optional deps `detectLanguage`, `replyLangs`, `crisisMessages`; the crisis node takes its language from `detectLanguageOffline` (no model call), picks the catalog message and escalates `lang` = the detected language; the route node (after the crisis node cleared the turn) runs the detector with a hard stop; `StudentTurnResult` gains `detectedLang` and `replyLang`.
- `packages/engine/src/index.ts`: named exports of the new module (explicit names, so the graph re-exports do not clash).
- `apps/api/src/voice.ts` (in place): the inline Devanagari regex at the escalation call replaced by `detectLanguageOffline(text).lang`.
- Tests: new `packages/engine/tests/lang.test.ts` (34), one new test in `apps/api/tests/voice-crisis-turn.test.ts`.
- Not touched: `.claude/**`, ARCHITECTURE.md, docs/DECISIONS.md, qa/contracts, TASKS.md, QUEUE.md, HANDOFF.md, `skills/`, `apps/api/src/index.ts` and `anonymous.ts` (nothing is wired to a real provider; see Open risks).

## Verification scope
Round: est 30 min; targeted tests only (never the full suite).
Base / checked state: `p1/lk4` at the head commit of this manifest's parent (code `4d20c71`).
Tests[L1]: tests/lang.test.ts "C1 offline detection: <name>" x14 (English, Latin Hinglish, Devanagari, Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam, Urdu, two mixed) and "one Hinglish word stays English / digits only". — one fixture per script plus both mixed directions
Tests[L2]: tests/lang.test.ts "C7 no inline Devanagari language test is left ..."; apps/api voice-crisis-turn "LK4: the voice escalation carries the detected language". — a source check on both files plus the behaviour at the voice call site
Tests[L3]: tests/lang.test.ts "C5 escalation lang is the detected language: Devanagari hi, Latin Hinglish hi-Latn, English en"; voice-crisis-turn "LK4 ...". — chat graph and voice, original text escalated
Tests[L4]: tests/lang.test.ts "C4 catalog routing ...", "C4 catalog: the existing approved wording is the English entry ...", "C5 the crisis message for a language comes from the catalog". — an injected vetted entry is returned for hi and hi-Latn, anything else gets the English+Hindi message
Tests[L5]: tests/lang.test.ts "C4 catalog: only en and hi entries; every entry (student and anonymous) passes the substring fixture". — 14416, not-a-counsellor, no-counsellor-connected, safe-adult question, forbidden patterns, on every entry
Tests[L6]: tests/lang.test.ts "C5 crisis turns ... never reach the language detector or any model", "C5 a crisis turn is never delayed or broken by a detector that would hang or throw", "C6 the detector does not see the text before the crisis guard". — 3 crisis texts x student and anonymous, detector spy and provider call count both zero
Tests[L7]: tests/crisis-defaults.test.ts and tests/student-graph.test.ts unchanged, run in the engine regression below. — the forbidden-pattern and fixed-message equality tests are the existing ones
Tests[D1]: tests/lang.test.ts "C2 model detector ..." x2, "C2 fallback ..." x2. — error, invalid, timeout, inconsistent-with-script each fall back; the default timeout constant is 1500
Tests[D2]: tests/lang.test.ts "C3 allow-list ..." x2, "C6 an ordinary turn ..." x2. — ta/bn/te/ur/fr/mr/und map to en; narrowing the env list sends hi to en
Tests[D3]: tests/lang.test.ts "C4 catalog: only en and hi entries", "the existing approved wording is the English entry, byte for byte". — keys are exactly en and hi and the en entry equals the previous constants
Pre-check[L1]: 4d20c71 VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-timeout=30000 tests/lang.test.ts tests/crisis-defaults.test.ts -> green: 51 passed, 0 failed (lang.test.ts 34)
Pre-check[L2]: 4d20c71 same command as Pre-check[L1], plus pnpm -C apps/api exec tsx --test --test-timeout=30000 tests/voice-crisis-turn.test.ts -> green: 14 passed, 0 failed
Pre-check[L3]: 4d20c71 same two commands as Pre-check[L2] -> green: 51 + 14 passed, 0 failed
Pre-check[L4]: 4d20c71 same command as Pre-check[L1] -> green: 51 passed, 0 failed
Pre-check[L5]: 4d20c71 same command as Pre-check[L1] -> green: 51 passed, 0 failed
Pre-check[L6]: 4d20c71 same command as Pre-check[L1] -> green: 51 passed, 0 failed
Pre-check[L7]: 4d20c71 pnpm -C packages/engine exec tsx --test tests/lang.test.ts tests/student-graph.test.ts tests/crisis-defaults.test.ts tests/guard-crisis.test.ts tests/student-classify.test.ts tests/coach-first.test.ts tests/capability-manifest.test.ts tests/crisis-escalation.test.ts tests/no-quote.test.ts -> green: 767 passed, 0 failed; and pnpm -C apps/api exec tsx --test tests/voice-crisis-turn.test.ts tests/anonymous-zero-persistence.test.ts tests/anonymous-route.test.ts tests/chat.test.ts tests/chat-privacy.test.ts tests/acceptance-student-journey.test.ts tests/voice.test.ts tests/voice-wiring.test.ts -> green: 205 passed, 0 failed (both through vc-testlock.sh with VC_TESTLOCK_TIMEOUT_SECS=7200, TMP/TEMP on D:)
Pre-check[D1]: 4d20c71 same command as Pre-check[L1] -> green: 51 passed, 0 failed
Pre-check[D2]: 4d20c71 same command as Pre-check[L1] -> green: 51 passed, 0 failed
Pre-check[D3]: 4d20c71 same command as Pre-check[L1] -> green: 51 passed, 0 failed
Pre-check[types]: 4d20c71 VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C packages/engine typecheck; pnpm -C apps/api typecheck; pnpm -r --filter "!@vc/web" typecheck -> exit 0, 0, 0
mutant-cap-raise: 9 distinct falsifiers over 10 criteria, each in a detached throwaway worktree of 4d20c71 (removed afterwards); D3 shares F-L5's catalog assertion; policy .9
Metrics: start=2026-10-19T16:07:05+05:30 end=2026-10-19T16:35:57+05:30 builder_min=29 wall_min=unavailable agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=1 mutations=9 survivors_final=0 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.16 lane=normal check_s=unavailable mutants=9 defects_unit=0 defects_6c=0

## Capability coverage (one falsifying edit per criterion in a detached throwaway worktree of `4d20c71`; the bound tree was never edited)
Baseline in the copy: lang.test.ts + crisis-defaults.test.ts 51 passed 0 failed; voice-crisis-turn.test.ts 14 passed 0 failed. Each row: failing count after the edit; the file was restored (`git checkout`) and the copy re-checked clean.
| id | crit | falsifying edit | result |
|---|---|---|---|
| F-L1 | L1 | Hinglish threshold `markers >= 2` -> `>= 99` | lang.test.ts 3 fail of 34 |
| F-L2 | L2 | voice.ts back to the inline `/[\u0900-\u097F]/` test | voice-crisis-turn 1 fail of 14 |
| F-L3 | L3 | graph.ts escalation `lang: lang.lang` -> `"en"` | lang.test.ts 1 fail of 34 |
| F-L4 | L4 | `crisisMessageFor` ignores the catalog (line `if (key) return catalog[key][mode]` removed) | lang.test.ts 2 fail of 34 |
| F-L5 | L5 | `hi.student` entry shortened to "Please call 14416." | lang.test.ts 2 fail of 34 |
| F-L6 | L6 | crisis node calls the model detector (`await detectLanguage`) instead of the offline one | lang.test.ts 4 fail of 34 |
| F-L7 | L7 | " This stays confidential." appended to the crisis core | crisis-defaults.test.ts 1 fail of 17 (forbidden-pattern test) |
| F-D1 | D1 | the fallback returns `und` instead of the offline result | lang.test.ts 1 fail of 34 |
| F-D2 | D2 | `resolveReplyLang` returns the detected tag unfiltered | lang.test.ts 4 fail of 34 |
All 9 killed. The first driver run failed for harness reasons (a Windows code-page decode error, and CRLF in the copy defeating the multi-line matches); the affected file was restored with `git checkout` and the rows were re-run, so the table is the complete second run.

## Open risks / not determined
1. Contract conflict to settle at the gate: A15b / B24.6 say no LLM sees the text to classify in anonymous routing. D-105 orders a model detector. The detector is an optional dep and is NOT wired in `apps/api` (`anonymous.ts` / `index.ts` build the graph deps), so production still uses the offline script result until LK5 wires `createModelLanguageDetector` and the contract owner amends A15b/B24.6.
2. `CRISIS_MESSAGES.hi` is the same English+Hindi message as `en`: the repo has no approved fully-Hindi crisis message (`docs/consent/b13-consent-draft.md` is a DRAFT, not approved). Routing, fixture and fallback are in place; a vetted Hindi message is a one-line drop-in and must pass the same substring fixture. The fixture is English-substring based, so it cannot vouch for Hindi wording by itself.
3. The crisis language is the offline script test, so a crisis in an uncovered language is still decided by `crisisGuard` alone (design risk R1; the model safety screen is LK5). No test covers uncovered-language crisis recall.
4. `hi-Latn` is a new `lang` value in the escalation record (before: `en` for Latin Hinglish). `escalation.ts` passes `lang` to the classifier as a free string and I found nothing keyed on `en`/`hi`, but I did not grep the web app.
5. The offline Hinglish word list is a fallback heuristic (two distinct function words); a short Hinglish message with one marker reads as `en`. D-105 accepts a script-only fallback; the model detector is the primary path once wired.
6. The fixed-text catalog has English entries only and the graph's non-crisis fixed texts do not yet call `fixedText(replyLang, ...)` (no vetted non-English wording exists); LK5 is the consumer.
7. `node_modules` in the worktree came from `pnpm install --offline --frozen-lockfile` (esbuild/genai build scripts ignored; tsx ran fine).
