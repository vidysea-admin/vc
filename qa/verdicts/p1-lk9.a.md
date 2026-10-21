# Verdict: p1-lk9 (coordinator a, blind dual check, Mode A)
**Verdict:** PASS
**Cycle checked:** 0
**Checked state:** branch p1/lk9, code `1f63e76` (C1 `9f3de14`, C2 `1f63e76`), manifest `5bf2d7f`, base `8b485a2`
**Policy:** proportional-verification/2026-10-19.17, Tier L, dual-trigger security `apps/api/src/chat.ts:695`
**Checked at:** 2026-10-21T13:30:27+05:30 (read with `date -Iseconds`)

## Commands run (all through `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh`, TMP/TEMP on D:)
1. `pnpm -C D:/vc/.worktrees/lk9/apps/api exec tsx --test tests/chat-privacy.test.ts tests/chat.test.ts tests/chat-rank.test.ts tests/chat-profile.test.ts` -> 111 tests, 111 pass, 0 fail.
2. `pnpm -C D:/vc/.worktrees/lk9/apps/api typecheck` (tsc --noEmit) -> exit 0, no errors.
3. Own hostile suite `apps/api/tests/hostile-lk9a.test.ts` in a throwaway detached worktree at `5bf2d7f` (removed afterwards; the artifact worktree was never edited): 6 tests, 6 pass, 0 fail.
4. Falsifications in that copy (each reverted by `git checkout`), run over hostile suite + chat-privacy + chat-profile (72 tests):
   - F1 guard disabled (`if (false && ...)`) -> 4 fail (2 mine, 2 maker C1 tests).
   - F2 guard widened to `if (!consentOk)` -> 4 fail (crisis reply for minors: 2 mine/maker C1 crisis test, 2 existing crisis-minor tests).
   - F3 extraction awaited before the reply -> 4 fail (3 maker C2 `did not return within 3000 ms`, plus my erasure test hung to the 600 s timeout).
   - F4 error rethrown / `.catch` removed -> 9 fail (my 2, maker C2 reject/sync-throw/fence tests, p1-lk6 failure-log test, startApi test, 2 LK1w tests).

## C1 (fail closed): PASS
Outcome proven, not construction:
- `consentOk = !ctx.minor || ctx.guardianConsent` (chat.ts:637); `guardianConsent` is `=== true` only (auth.ts:415) and a missing/odd age or `isMinor` makes `minor` true (auth.ts:414). 14 hostile claim shapes (`guardianConsent` null/undefined/1/"yes"/["true"]/{v:true}/"true"; `age` "25" string, NaN, null, 17.9 with `isMinor:false`; `isMinor` "false"/0; no age claim) each got the fixed `GUARDIAN_CONSENT_REPLY`, with provider calls + KB calls unchanged (0).
- Ordinary English, Devanagari, Hinglish, a stress phrase and "50 kmss" (not crisis) from unconsented minors and no-age tokens: reply is the consent reply, 0 provider/KB calls, extractor never started, 0 rows in chat_turns. Replay (same clientTurnId twice): same consent reply, 0 calls.
- Crisis/concern from the same students, 17 phrases (English, leet `ki11`/`k1ll`/`su1c1de`/`kmss`, Devanagari, Hinglish `marna h`/`marnaa`, `khudkushi`/`khudkhushi`/`खुदकुशी`, "hopeless", "no point going on"), also embedded after ordinary text, over-long (MAX_TURN_TEXT_LENGTH + 5000 chars then crisis phrase), and a malformed body (unknown key, bad clientTurnId): all `state: escalated` with `14416`, 0 provider/KB calls, 0 escalations, no student text stored. Over-long benign text stays 400.
- The crisis exception uses `level` from `crisisGuard(text)` on the FULL original text (chat.ts:591, before truncation); the graph crisis node uses the same function on the same text and makes no model call (graph.ts crisis node), so the two cannot disagree. Gate sits at chat.ts:695, after the thread marking and before any graph/KB/detector call. chat.ts graphDepsFor wires no `safetyScreen`, so C1 removes no live screen in the chat route.
- Controls: adult and consented minor still answered via the provider (claims >= 1, provider count rises); adult crisis still escalates once.
- Replaced protected test: the only removed assertions are the old "under-18 still gets answer" test's (`claims.length >= 1` and the phrase text of one stored-check); the replacement keeps the no-stored-text/textStored:false checks and adds the zero-call and consent-reply assertions. All other 4A tests are untouched; no weakening elsewhere (diff of chat-profile/chat-privacy/chat-rank shows only additions plus `settle()` and an import line).

## C2 (detached extraction): PASS
- Never-resolving extractor: reply returns 200 complete, turn stored and counted, extractor started once (F3 proves the test bites).
- Hostile extractor outcomes (reject with string / undefined / plain object, resolve undefined / null, sync throw, list of 50, a fact with empty key): turn 200 every time; no `unhandledRejection` or `uncaughtException`; log lines are `chat_fact_extraction_failed` with no student text or secret marker; 50 proposals capped at 5 rows. Throwing logger + sync throw: no unhandled rejection (maker test, plus F4 bites).
- Erasure requested+confirmed after the reply while extraction is pending: 0 fact rows, `chat_fact_extraction_fenced` logged, no unhandled rejection (the write is refused by `fencedStudentWrite`, unchanged db code).
- Extraction started for adult and consented minor only; never for unconsented-minor ordinary or crisis turns, nor replay (extractor counter checked).

## Findings (none blocking)
- N1 (observation, out of scope) `apps/api/src/voice.ts` is not touched; its unconsented-minor handling (persistText false only) was not examined by this unit and is not covered by C1. If the brief's intent includes voice, that needs its own unit.
- N2 (inherited, not a regression) in `proposeFactsDetached` (chat.ts:560-576) a throwing `proposeProfileFact` for one fact (e.g. an empty key) aborts the remaining facts of that turn, same as the old inline loop.
- N3 (manifest risk 1, orchestrator) D-093 4A behaviour change for unconsented under-18 / unknown-age students: they now get no answers. Whether a superseding DECISIONS entry is needed is the orchestrator's call.
- N4 (manifest risk 4) `settle()` is timing based (8 setImmediate turns); passed in every run here.

No test or product defects found. Verdict sha: this file's commit on p1/lk9.
