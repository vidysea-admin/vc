# Manifest - p1-u10s-voice-hardening
**Contract:** H1, H3, H4 (unit-local ids, below; H2 is the deferred product call). Parent contract rows: `qa/contracts/counselling-engine.md` B21, A12, A20 (go-live gate, default-off flag), A9b; decisions D-087 (fail-closed crisis), D-093 4A, D-096 item 3, D-099. Brief `qa/evidence/p1-briefs/p1-u10s-build.md`; source findings `qa/evidence/p1-briefs/p1-u10w-c1-review-result.md` (two mediums, recorded as "fix before A20/voice go-live").
**Criteria:** H1 a throwing redaction never loses the crisis flag or escalation, H3 every crisis escalates under its own id, H4 chat flag is exact-"true" like voice
**Goal task:** none
**Date:** 2026-10-19
**Status:** checked-PASS
**Fix cycle:** 0
**Dual check:** required
dual-trigger: security apps/api/src/voice.ts:801 (`onCrisisRecord`: the crisis flag and escalation path; the redaction-failure fallback and the per-crisis turn id are decided here)
**Persona walk:** skip (no human screen: voice crisis path and a config flag reader)
**Issues addressed:** none (ISS ids are the orchestrator's to assign)
**Executor:** claude-opus-subagent (maker/builder p1-u10s-build2)
**Executor rationale:** one surface: a few lines in `voice.ts` `onCrisisRecord`, one line in `chat.ts` `chatEnabledFromEnv`, new cases in two existing test files.

## Criteria
- **H1 redact throw does not lose the crisis (review MEDIUM, `voice.ts` ~801-802)** - if `redactPii` throws while building the escalation words, the crisis flag is still written, the escalation is still delivered with the fixed text-free `VOICE_CRISIS_NO_WORDS_TEXT` (never the raw words), and a text-free `voice_crisis_redact_failed` is logged.
- **H2 (DEFERRED: product decision, not code)** - the escalated words may be a prefix of the crisis utterance (`voice.ts:529-533`, `live.ts:386-388`: the words are the buffer at the first triggering chunk). Behaviour unchanged by this unit; the alert still fires. Left for Umesh.
- **H3 each crisis escalates under its own id (`voice.ts` ~804)** - a no-words crisis no longer reuses the previous turn's `turnId`; a second no-words crisis in one session is its own flag and its own escalation (the real port keys each record on `sessionId:turnId:role:recipient` and the flag on `threadId:turnId:crisis`, both `$setOnInsert` upserts, so a reused id silently drops the second). A crisis that has its own spoken turn keeps that turn's id the first time it is used (flag and stored turn agree); a reused id gets a fresh one.
- **H4 chat flag exact (`chat.ts:124` `chatEnabledFromEnv`)** - `VC_CHAT_ENABLED` is no longer trimmed: unset, "" and "false" are off, exactly "true" is on, anything else (including " true", "true ", " false ", " ") throws the existing `ChatConfigError`, exactly like `voiceEnabledFromEnv`.

## What changed
Code commit `651d08e` on branch `p1/u10s` (base `1c9fafb`).
- `apps/api/src/voice.ts` `onCrisisRecord` (line 801): `redact(c, raw)` is inside try/catch (H1); `turnId` is now the spoken turn's id only when the crisis has an utterance of its own and that id was not already used by a crisis on this connection, else `v<sid8>crisis<uuid8>` (H3); new `Conn.crisisTurnIds: Set<string>` records the ids used (initialised in the connection literal).
- `apps/api/src/chat.ts` `chatEnabledFromEnv` (line 124): removed `?.trim()` (H4).
- `apps/api/tests/voice-crisis-turn.test.ts`: +2 tests (H1: a non-string profile name makes `redactPii` throw for real, no mock; H3: two no-words crises in one session).
- `apps/api/tests/chat.test.ts` A20 flag test: one existing assertion changed on purpose: `" false "` was listed as OFF (the old trim behaviour); it is now in the throws list, with more padded cases (" true", "true ", " false", "false ", " ", tab-true-newline). No other test changed or deleted.
- Not touched: `packages/**`, `index.ts`, `.claude/**`, `qa/contracts/`, `qa/verdicts/`, `TASKS.md`.

## Verification scope
Policy-Version: proportional-verification/2026-10-18.15
Tier: L (crisis escalation path and a config flag gate)
Round: 4 files (2 src, 2 test), 3 criteria (H1, H3, H4), est 30 min - 3 red tests, 3 fixes, 3 falsifications, voice+chat set, typecheck
Base / checked state: base 1c9fafb, code 651d08e
Affected tests / full-suite trigger: apps/api `tests/voice*.test.ts` and `tests/chat*.test.ts` (160 tests; includes voice-wiring and chat-profile, the other callers of the two flag readers). No full suite (per brief); `packages/**` unchanged.
Tests[H1]: apps/api tests/voice-crisis-turn.test.ts "H1: redaction throws ..." - flag row written, one escalation with the marker, no raw words in the escalation or in any log line, `voice_crisis_redact_failed` logged.
Tests[H3]: apps/api tests/voice-crisis-turn.test.ts "H3: two crises with no words ..." - two escalations with different `turnId`, two flag rows; the existing C18 (a)-(e) still pass (they assert words/marker, one flag).
Tests[H4]: apps/api tests/chat.test.ts "A20: chat is OFF by default ..." - unset/""/"false" off, "true" on, 12 other values including padded ones throw `ChatConfigError`.
Pre-check[H1]: 651d08e VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm exec tsx --test tests/voice*.test.ts tests/chat*.test.ts (cwd apps/api, TMP/TEMP under D:/vc/.worktrees/p1-u10s-tmp) -> green: 160 passed, 0 failed
Pre-check[H3]: 651d08e same command as Pre-check[H1] -> green: 160 passed, 0 failed (alone with chat.test.ts: `tests/voice-crisis-turn.test.ts tests/chat.test.ts` -> 31 passed, 0 failed)
Pre-check[H4]: 651d08e same command as Pre-check[H1] -> green: 160 passed, 0 failed
Pre-check[typecheck]: 651d08e VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -r typecheck (cwd worktree root) -> exit 0, all packages and apps
Red first: before the fix, `tsx --test tests/voice-crisis-turn.test.ts tests/chat.test.ts` failed exactly 3: "Missing expected exception (ChatConfigError)" (H4), "timed out waiting for: escalated despite the redaction failure" (H1), "each crisis escalation has its own turn id" (H3).
Falsification (isolated copy `D:/vc/.worktrees/p1-u10s-fals`, fixed src swapped for one mutant at a time, then restored and re-run 31/31):
- M1 (redact try/catch removed): H1 test FAILS (7 of 8 pass in voice-crisis-turn).
- M3 (turnId back to `c.lastUser?.turnId ?? v<sid8>crisis`): H3 test FAILS (7 of 8).
- M4 (`?.trim()` restored in chatEnabledFromEnv): A20 flag test FAILS (22 of 23 in chat.test.ts).
Metrics: start=2026-10-19T09:35:43+05:30 end=2026-10-19T09:52:18+05:30 builder_min=unavailable wall_min=unavailable agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=1 mutations=3 survivors_final=0 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-18.15 lane=normal check_s=unavailable mutants=3 defects_unit=0 defects_6c=0
(start and end read from `date -Iseconds`.)

## Not done / stated limits (for the checker)
- **H2 deferred: product decision.** Escalated words can be a prefix of the crisis utterance; unchanged on purpose.
- **Flag turn id changes for a no-words crisis.** The flag now also gets the fresh id for a no-words crisis (it previously borrowed the previous turn's id, so a second no-words crisis lost its flag too). A crisis with its own utterance keeps the spoken turn's id (including an unconsented minor, ids only).
- **Redaction failure drops all the words.** On a throw the marker is escalated (no partial or raw text). The same throw on the stored-transcript path is outside this unit (it is already caught as `persist_failed`).
- **Chat flag behaviour change:** an env value with stray whitespace (for example `VC_CHAT_ENABLED="true "`) used to enable chat; it now fails startup with `ChatConfigError`, like voice. Deploy configs should be exact.
- No push or merge. C: was near full (2.9 GB free at start); the suite ran fine, no environmental failures seen.

## Close-out
- checked-PASS (cycle 0, dual): A PASS 5c2f245 `qa/verdicts/p1-u10s-voice-hardening.A.md`; B PASS a8b141b `qa/verdicts/p1-u10s-voice-hardening.B.md`; review Approve `qa/evidence/p1-briefs/p1-u10s-review-result.md`. Ledger: ISS-219, ISS-228, ISS-234 fixed; ISS-260..263 minted (low). ISS-229 stays open (product decision).
