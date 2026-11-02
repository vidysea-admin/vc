# Manifest: time-bombs-6c

Status: merged-no-check (test-lane)
Fix cycle: 0
Policy-Version: proportional-verification/2026-10-19.17
Tier: S (test-only: fixture dates and clock injection in three existing test files; no product file)
Dual check: no (no security/auth/tenancy/prod-write trigger in the diff)
Base: 904d3b81
Source: qa/QUEUE.md row 6c-time-bombs-20261102, approved by Umesh 2026-11-02 in chat; evidence qa/verdicts/devops-handover-6c.md.
Round: 3 files, 3 criteria, est 20 min - read three failing tests, pass an injected now, run three touched files once.
Owners: tests-owner
SERIAL: none, a single builder owns all three test files

## Acceptance criteria
- T1: packages/db/tests/student-store.test.ts "S12: stale extraction successful cleanup never rewinds the explicit forget history cutoff" passes on the real clock today (2026-11-02) and would still pass on any later date, because every clock-stamping call in it receives the test's own fixed now.
- T2: apps/api/tests/chat-profile.test.ts "Q10-Q14: actual handler passes only owned completed context and confirmed memory..." passes the same way (no dependence on the real clock).
- T3: apps/api/tests/voice-history.test.ts "Q14/I1 repair: voice memory numbers remain untrusted..." passes the same way.
- T4 (scope): the diff touches only test files; no product file, no assertion deleted or weakened, no skip or xfail added; sibling tests that mix a fixed date with real-clock calls are listed, not silently fixed beyond these three.

## Changed files
- packages/db/tests/student-store.test.ts:306 (test at :298) - completeChatTurn now receives {now:new Date("2026-11-01T10:00:01Z")}, the same instant as the claim.
- apps/api/tests/chat-profile.test.ts:1241-1243 (test at :1236) - proposeProfileFact and decideProfileFact receive {now:new Date(w.clock.ms)}; w.clock.ms+=1000 added after the confirm so the confirm cutoff precedes the first turn (the fake clock, not the real one, now orders cutoff vs turns).
- apps/api/tests/voice-history.test.ts:171-173 (test at :168) - same as above for the voice test: both calls get {now:new Date(w.clock.ms)}, then w.clock.ms += 1000 before the first voice open.
- No helper (chat-fixtures.ts, voice-fixtures.ts) held the fixed date as a bug; no helper edited. No product file, contract, assertion, skip or xfail touched. qa/manifests/time-bombs-6c.md (this file) filled.

Red (before, base 1e868eef, real clock 2026-11-02): T1 "AssertionError: Expected values to be strictly deep-equal" (listChatContext returned the assistant row with completedAt 2026-11-02T07:48:46Z > cutoff 2026-11-01T10:00:02Z); T2 `assert.ok(requests.some(...memory?.messages.length===2))` falsy at chat-profile.test.ts:1247; T3 "The input did not match the regular expression /876542/" at voice-history.test.ts:184 (tool_response messages:[]).
Product cutoff semantics checked: chat-threads.ts completedAt <= after is correct (a turn completed at or before the forget instant is excluded); the defect was only that the test stamped the real clock. No product change.

Pre-check[T1]: 1e868eef+unit-diff bash scripts/vc-testlock.sh pnpm -C packages/db exec tsx --test tests/student-store.test.ts -> exit 0, 29 passed, 0 failed.
Pre-check[T2]: 1e868eef+unit-diff bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/chat-profile.test.ts -> exit 0, 73 passed, 0 failed.
Pre-check[T3]: 1e868eef+unit-diff bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/voice-history.test.ts -> exit 0, 27 passed, 0 failed.

Date-independence grep: grep -rn "new Date()\|Date.now()" over packages/db/src/{chat-threads,profile-facts,student-logs}.ts and apps/api/src: the only db-side reads of the real clock are the `options.now ?? new Date()` defaults (chat-threads.ts:198,275,367; profile-facts.ts:107,261,323; student-logs.ts:56,77) and every call in the three tests now passes its own now; the handler paths in chat.ts/voice.ts pass deps.now (chat.ts:460,790,1108,1264; voice.ts nowDate()); the only other Date.now in the path is chat.ts:984-985, a relative deadline probe that is not persisted or compared with fixture dates. Test files themselves: Date.now only in JWT expiry (chat-fixtures.ts:31, chat-profile.test.ts:1149) and until() polling (voice-fixtures.ts:75-77), neither compared to a fixture date.

Falsify[T1]: throwaway copy (outside repo, scratchpad falsify/) tests/student-store.test.ts S12 stale-extraction test with the fix -> pass 1 fail 0; same copy with the now arg removed from completeChatTurn -> pass 0 fail 1.
Falsify[T2]: same copy, chat-profile.test.ts Q10-Q14 test with fix -> pass 1 fail 0; with the now args removed from proposeProfileFact and decideProfileFact (clock bump kept) -> pass 0 fail 1.
Falsify[T3]: same copy, voice-history.test.ts Q14/I1 test with fix -> pass 1 fail 0; with the now args removed from proposeProfileFact and decideProfileFact (clock bump kept) -> pass 0 fail 1.
(Each run: bash scripts/vc-testlock.sh pnpm -C <copy>/<pkg> exec tsx --test --test-name-pattern=<test> <file>. The bound tree was never falsified.)

Sibling scan (read-only, static; packages/*/tests and apps/*/tests files with a 2026-10/11 literal, test blocks that also call completeChatTurn/proposeProfileFact/decideProfileFact/recordStudentUsage/appendVoiceTurn without now; all of these files passed in this session except the not-run chat-threads.test.ts, judged statically):
Sibling: packages/db/tests/chat-threads.test.ts:162 - not affected because claims carry fixed now, completeChatTurn without now only stamps completedAt, and the test checks lease tokens and replay, with no completedAt vs cutoff comparison.
Sibling: packages/db/tests/chat-threads.test.ts:196 - not affected because history order comes from claim order, listChatTurns has no `after`.
Sibling: packages/db/tests/chat-threads.test.ts:284 - not affected because it asserts turn order only, no cutoff.
Sibling: packages/db/tests/chat-threads.test.ts:300 - not affected because appendVoiceTurn takes an explicit `at`.
Sibling: packages/db/tests/chat-threads.test.ts:311 - not affected because appendVoiceTurn takes an explicit `at` and the test checks refusals.
Sibling: packages/db/tests/chat-threads.test.ts:349 - not affected because appendVoiceAudit takes an explicit `at`.
Sibling: packages/db/tests/chat-threads.test.ts:409 - not affected because voice rows carry explicit `at` and listChatContext is called without `after`.
Sibling: packages/db/tests/chat-threads.test.ts:708 - not affected because the takeover uses fixed claim times and completeChatTurn is token-checked, with no cutoff comparison (the test passes on the 2026-11-02 clock, so lease expiry is not read from the real clock).
Sibling: packages/db/tests/student-store.test.ts:347 - not affected because the decide calls that set historyAfter carry fixed now; the no-now proposes only stamp proposedAt.
Sibling: packages/db/tests/student-store.test.ts:413 - not affected because the fixed date is a legacy proposedAt and nothing compares it with a stamp.
Sibling: packages/db/tests/student-store.test.ts:423 (S13 fixA-5) - not affected today (asserts historyAfter notEqual null and historyUsable true after a discard; context read has no `after`); it mixes a fixed-date claim with a real-clock completeChatTurn and propose, so a future assertion comparing historyAfter with the fixed turn would be at risk. Queue as low-risk hardening.
Sibling: apps/api/tests/chat-profile.test.ts:1280 - not affected because the fixed date is a legacy proposedAt on an inserted row, the rest goes through the handler with deps.now.
Sibling: apps/api/tests/{chat,main,partner-voice,voice-wiring,voice}.test.ts - not affected because they hold a fixed date but make no no-now call to the stamping functions.

Tests[T1]: packages/db/tests/student-store.test.ts "S12: stale extraction successful cleanup never rewinds the explicit forget history cutoff" - asserts the forget cutoff (t2) hides the t1 turn, which only holds when the turn is stamped at t1, not the real clock.
Tests[T2]: apps/api/tests/chat-profile.test.ts "Q10-Q14: actual handler passes only owned completed context and confirmed memory; missing/off policy stops retrieval and extraction" - asserts the handler passes 2 context messages and the confirmed fact, which needs the confirm cutoff earlier than the fake-clock turns.
Tests[T3]: apps/api/tests/voice-history.test.ts "Q14/I1 repair: voice memory numbers remain untrusted and cannot source factual speech" - asserts the voice memory tool returns history numbers 876542 and 987651 and they are flagged uncited, which needs the confirm cutoff earlier than the fake-clock voice turn.
Metrics: suite_runs=0
