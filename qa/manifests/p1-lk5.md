# Manifest — p1-lk5
**Contract:** D-104, D-105 (Q1 allow-list, Q2 runtime English query rewrite, safety screen next to the crisisGuard floor); design rows LK5 and sections 1B, 1D, R1 in `qa/evidence/p1-briefs/p1-lang-kg-design-result.md`; brief `qa/evidence/p1-briefs/p1-lk5-build.md`; coordinator addendum from the LK4 senior review (detector robustness, dropped `VC_REPLY_LANGS` entries); A15b / B24.6 (see Open risk 1).
**Criteria:**
- K1 reply language: the answer prompt gets `replyLang`; claims are written twice (English `text` for every guard, `localized` for the student); guards that need English check the English claims; a reply that drifts to a language other than the one asked, or whose localized copy fails the language-neutral checks (script, number parity, restricted verbatim run, link/e-mail), is the English reply
- K2 query rewrite: a non-English turn is searched with a one-off English rewrite (one cheap call, nothing stored); on error, empty answer or timeout the original text is used; an English turn makes no rewrite call
- K3 model safety screen: `concern-classifier` runs on every non-crisis turn in parallel with the answer call; the reply is held until it returns; "possible" (severity at or above the escalation line), error, timeout or invalid output returns the fixed crisis message; option defaults ON for authenticated and OFF for anonymous; crisis turns never reach it
- K4 a reply to a student writing a language outside the allow-list always carries the English+Hindi helpline line
- K5 (addendum) the standalone model language detector falls back to the offline result when `provider.generate` throws synchronously or resolves null
- K6 (addendum) dropped `VC_REPLY_LANGS` entries are logged by tag only
- K7 no regression: crisisGuard first and unweakened, LK4 and student-graph suites, typecheck
**Goal task:** none
**Date:** 2026-10-19
**Status:** ready-for-check
**Fix cycle:** 0
**Policy-Version:** proportional-verification/2026-10-19.16
**Tier:** L (safety path in graph.ts plus a new live safety screen)
**Dual check:** brief says single checker; a second look at the crisis-adjacent paths is the orchestrator's call
**Persona walk:** skip (no human screen)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent (maker/builder p1-lk5-build)
**Executor rationale:** one coherent change in graph.ts / lang.ts / concern-classifier.ts, all call-site level on top of LK4.

## What changed
Branch `p1/lk5` from `d057b13` (p1/lk4 head). Code commit `090b558`; this manifest is a later commit.
- `packages/engine/src/student/graph.ts` (in place): `KbAnswerOutputSchema` gains optional `replyLang`, `claims[].localized`, `followUpLocalized`; `answerFromKb` rewrites the search query for a non-English turn (`searchKb` only; the `ask` fallback and the answer prompt keep the original text), passes `replyLang` to the model and swaps in the localized copies through the new `localizedMessage` (only when every shown claim passes `localizedClaimOk` and the model reported the asked language; a non-English reply never mixes in the English follow-up; names and phones redacted as in the English path); the crisis node body moved unchanged into `crisisResult` (also used by the screen override); the route node starts the safety screen before it awaits anything, the finish node awaits it and replaces the reply with the fixed crisis message on "possible" or an outage; `finish()` appends the English+Hindi helpline line outside the allow-list. New optional deps `safetyScreen` and `rewriteTimeoutMs`; new text-free write kind `safety_screen`.
- `packages/engine/src/guards/concern-classifier.ts` (in place, appended): `safetyScreen()` over `classifyConcern`, fail closed (`SAFETY_SCREEN_BLOCK_AT` = `ESCALATE_AT` = high).
- `packages/engine/src/student/lang.ts` (in place): `HELPLINE_GLOSS` (verbatim from the approved crisis wording; `CRISIS_CORE` reuses it, same bytes) and `HELPLINE_LINE_EN_HI`; `isOutsideAllowList`, `isNonEnglish`, `replyScript`, `replyLangIs`, `localizedClaimOk`, `rewriteToEnglishQuery`; detector robustness fix (sync throw, null result); `parseReplyLangs(raw, onDropped)` logs dropped tags (default `console.warn`, tags only).
- `packages/engine/src/student/claims.ts` (in place, 3 lines): `DraftClaim.localized` / `GuardedClaim.localized` ride through `guardClaims` untouched (the guards still read `text`).
- `packages/engine/src/index.ts`: new lang.ts names exported. `skills/kb-answer/SKILL.md`: language rule, `replyLang`, `localized`, `followUpLocalized` in the input and output shapes.
- Tests: new `packages/engine/tests/lk5.test.ts` (34), all mocked providers, no network.
- Not touched: `.claude/**`, ARCHITECTURE.md, docs/DECISIONS.md, qa/contracts, TASKS.md, QUEUE.md, HANDOFF.md, `apps/api` (nothing wired, see Open risk 2).

## Verification scope
Round: est 30 min; targeted tests only, never the full suite. Base / checked state: `p1/lk5` at `090b558`.
Tests[K1]: tests/lk5.test.ts "R1 ..." x11 (replyLang in prompt input, Hindi and Hinglish localized shown, claims stay English, unsupported English claim not shown, model-language drift, wrong script, number parity, restricted verbatim run, link, allow-list narrowing, follow-up)
Tests[K2]: tests/lk5.test.ts "R2 ..." x3 (rewrite used for searchKb only and not in the response; English turn no call; error/empty/hang fall back)
Tests[K3]: tests/lk5.test.ts "R3 ..." x12 (clear/possible/low/moderate, error, invalid output, timeout, PARALLEL, HELD, default ON/OFF and both switches, anonymous crisis count, crisis turn never reaches it, no option = no screen)
Tests[K4]: tests/lk5.test.ts "R4 ..." x4 (ok answer, no-answer, provider failure, anonymous sign-in and no-answer with gloss once, allow-listed and English unchanged, crisis messages untouched)
Tests[K5]: tests/lk5.test.ts "D a provider that throws synchronously ...", "D a provider that resolves null ..."
Tests[K6]: tests/lk5.test.ts "D dropped VC_REPLY_LANGS ...", "D the default dropped-entry logger ..."
Tests[K7]: existing suites unchanged: lang, student-graph, crisis-defaults, guard-crisis, student-classify, coach-first, capability-manifest, crisis-escalation, no-quote, concern-classifier, claims-guard, loader, index; apps/api voice-crisis-turn, anonymous-*, chat*, acceptance-student-journey, voice*
Pre-check[K1]: 090b558 VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C D:/vc/.worktrees/lk5/packages/engine exec tsx --test --test-timeout=30000 tests/lk5.test.ts -> green: 34 passed, 0 failed
Pre-check[K2]: 090b558 same command as Pre-check[K1] -> green: 34 passed, 0 failed
Pre-check[K3]: 090b558 same command as Pre-check[K1] -> green: 34 passed, 0 failed
Pre-check[K4]: 090b558 same command as Pre-check[K1] -> green: 34 passed, 0 failed
Pre-check[K5]: 090b558 same command as Pre-check[K1] -> green: 34 passed, 0 failed
Pre-check[K6]: 090b558 same command as Pre-check[K1] -> green: 34 passed, 0 failed
Pre-check[K7]: 090b558 through vc-testlock.sh (TMP/TEMP on D:): engine `tsx --test` over lk5, lang, student-graph, crisis-defaults, guard-crisis, student-classify, coach-first, capability-manifest, crisis-escalation, no-quote, concern-classifier, claims-guard, loader, index -> green: 881 passed, 0 failed; apps/api `tsx --test` over voice-crisis-turn, anonymous-zero-persistence, anonymous-route, chat, chat-privacy, acceptance-student-journey, voice, voice-wiring -> green: 205 passed, 0 failed
Pre-check[types]: 090b558 pnpm -C packages/engine typecheck; pnpm -C apps/api typecheck; pnpm -r --filter "!@vc/web" typecheck -> exit 0, 0, 0
Metrics: start=2026-10-19T16:38:00+05:30 end=2026-10-19T18:20:00+05:30 builder_min=102 wall_min=unavailable agent_min=unavailable blocked_min=about 60 (waiting for the shared test lock) suite_runs=0 repeat_runs=2 mutations=12 survivors_final=0 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.16 lane=normal check_s=unavailable mutants=12 defects_unit=0 defects_6c=0

## Capability coverage (one falsifying edit per criterion in a detached throwaway worktree `D:/vc/.worktrees/lk5-fals` of `090b558`; the bound tree was never edited)
Baseline in the copy: lk5.test.ts 34 passed 0 failed. Each row: failing count after the edit; the file was restored and the copy re-checked clean.

| id | crit | falsifying edit | result |
|---|---|---|---|
| F-R1 | K1 | `localizedMessage` no longer requires the model's `replyLang` to be the asked one | 2 fail of 34 |
| F-R1b | K1 | `localizedClaimOk` drops the number-parity check | 1 fail of 34 |
| F-R1c | K1 | `localizedClaimOk` drops its restricted-run check only | SURVIVED 0 of 34: the second restricted-run check on the joined localized message in `localizedMessage` still catches it (two layers by design) |
| F-R1c-both | K1 | both restricted-run checks removed | 1 fail of 34 |
| F-R2 | K2 | `searchKb(input.text)` instead of the rewrite | 1 fail of 34 |
| F-R3a | K3 | screen outage counts as "clear" | 3 fail of 34 |
| F-R3b | K3 | finish stops waiting for the screen after 50 ms | 1 fail of 34 (the HELD test) |
| F-R3c | K3 | authenticated default ON -> OFF | 7 fail of 34 |
| F-R4 | K4 | `outside` forced false | 3 fail of 34 |
| F-D5a | K5 | detector's generate call no longer wrapped (sync throw escapes) | 1 fail of 34 |
| F-D5b | K5 | null-result guard removed | 1 fail of 34 |
| F-D6 | K6 | dropped-entry callback never fires | 2 fail of 34 |

K7 needs no mutant (it is the existing suites). All falsifiers are killed (F-R1c is a designed redundancy, killed once both layers are removed).

## Open risks / not determined
1. A15b / B24.6 conflict: those lines say no LLM sees anonymous text to classify; D-105 orders a screen on every turn. The option defaults OFF for anonymous turns as the brief says; the contract owner and Umesh decide. The model detector, the rewrite and the answer call still send anonymous text to a model.
2. Nothing is wired in `apps/api` (`index.ts` / `anonymous.ts`): `safetyScreen` is an optional dep and `createModelLanguageDetector` is still unwired, as in LK4. With no `safetyScreen` option no screen runs, so "default ON for authenticated" holds once the option is supplied, not by mere absence. Wiring (a screen provider, `VC_REPLY_LANGS` through `parseReplyLangs`) is a follow-up.
3. "Possible" has no verdict in the classifier; it is mapped to severity at or above `high` (`SAFETY_SCREEN_BLOCK_AT`, injectable as `blockAt`). `moderate` is NOT blocked. A lower line is a threshold decision for Umesh; every blocked ordinary turn is a false crisis message.
4. The screen gates every authenticated reply: a slow or down screen model yields the fixed crisis message (D-105), default timeout 8 s. A cheap chain with p95 above that will show crisis messages to healthy students. Needs LK9 latency data before it is switched on.
5. Meaning drift between `text` and `localized` is not checkable by code (design R2). Name or fact differences in Devanagari / Hinglish cannot be caught by the no-quote guard (Latin speaker lists) beyond redaction. Eval and per-language rollout stay with the allow-list.
6. A prior-flag thread (authenticated) gets the English forbidden-pattern check on the English message only; the localized message cannot be pattern-checked.
7. The "(unverified)" suffix and the helpline gloss are English fixed text inside an otherwise Hindi reply (no vetted Hindi fixed text exists, LK4 risk 6).
8. When the screen overrides a completed answer, side effects of that answer path (authenticated gap record, anonymous "answered"/"no_answer" counter) have already happened.
9. Trimming to 8000 characters to keep the helpline line could cut a sentence.
10. The dropped-entry log uses `console.warn`; `parseReplyLangs` has no caller in apps/api yet.
11. A `senior-software-engineer` review is still due (orchestrator's single checker); a crisis-adjacent dual check is recommended.
12. Environment: the shared test lock sat on a stale owner (PID 36944, no child process) for about an hour; runs went through slot 1 once the script's own stale handling released it. I did not touch the lock.
