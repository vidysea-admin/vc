# Manifest - p1-u10-voice-ws
**Contract:** C1, C2, C3, C4, C5, C6, C7, C8, C9, C10, C11, C12, C13, C14, C15, C16, C17, C18, C19 (unit-local ids, below; C10-C13 are the cycle-1 repair criteria, C14-C19 the cycle-2 ones). Parent contract rows: `qa/contracts/counselling-engine.md` B21 (student routes), A6 (tenants, sandbox), A9b (spoken-answer audit), A12 (error events), A19 (one thread, text and voice), A20 (go-live gate), A23 (limits); decisions D-086 Q4, D-088 Q5, D-090, D-093 items 4A/6A/11 and P-1, D-096 item 3, D-097 item 1 (ws dependency). Plan row U10, brief `qa/evidence/p1-briefs/p1-u10-build.md`.
**Criteria:** C1 session route, C2 WS auth, C3 events, C4 resume/silence/cap/fallback, C5 A9b audit, C6 history, C7 limits, C8 errors+flag, C9 tenancy+cleanup, C10 one live session under concurrent starts and a start timer that covers `starting`, C11 per-student session-route and pre-start socket limits, C12 crisis durability and escalation parity, C13 resume-log expiry, C14 crisis escalation survives a socket drop, C15 quota re-read after a supersede, C16 step-aside only for a live newer start, C17 escalation port built inside the retry, C18 no earlier turn's words in an escalation, C19 bounded finalize drain
**Goal task:** none
**Date:** 2026-10-19
**Status:** ready-for-check
**Fix cycle:** 2
**Dual check:** required
dual-trigger: auth apps/api/src/voice.ts:365 (`jwtVerify` inside `verifyVoiceToken`: HS256 only, audience `vc-voice-ws`, issuer `vc-api`, required exp/jti/sub, single-use jti; the credential of the WebSocket upgrade)
dual-trigger: tenancy apps/api/src/voice.ts:1227 (the connection's Db is `deps.dbForTenant(claims.tenantId)`; resume ownership at `voice.ts:990` checks tenant, student and thread; student PII persistence and erasure)
**Persona walk:** skip (no human screen: WebSocket API only; the student UI is a later unit)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent (maker/builder p1-u10-build)
**Executor rationale:** one coherent surface (`apps/api/src/voice.ts`, a minimal `server.ts` mount, two additive `packages/db` functions) sharing one fake-DB and mock-provider test world.

## Criteria
- **C1 session route** - `POST .../chat/threads/{threadId}/voice/sessions` returns a 60 s single-use token and `wsUrl` matching `VoiceSessionResponseSchema`; student JWT only (counsellor/admin 403, no token 401, other student 404, two tenants, sandbox `syn-` rule).
- **C2 WS auth** - a missing, wrong-audience, expired, replayed or other-student/other-thread token is refused before the upgrade is accepted and before any provider connect; the token never appears in a URL or a log.
- **C3 events** - client and server events validate against `VoiceClientEventSchema` / `VoiceServerEventSchema`; interrupt, `end`, numeric `confirm` through the U8 profile-fact path; muted after a crisis (D-096 item 3).
- **C4 resume, silence, cap, text fallback** - resume from `lastEventId` replays only that session's missed events; 60 s silence timeout `[ASSUMPTION]` (Q-U10-2, configurable); 20-minute cap; text chat continues on the same thread.
- **C5 A9b audit** - the spoken answer is audited after it is spoken; a `flag` frame is sent and the finding is stored with the thread.
- **C6 history** - A19 one thread for text and voice, redacted persistence (D-093 6A), minor rule (D-093 4A), no audio stored (D-086 Q4), export and erasure cover voice rows.
- **C7 limits (A23, D-088 Q5)** - 60 voice minutes per student per month and 20 per session, per-tenant override, minutes recorded through `recordStudentUsage`, text continues at the limit.
- **C8 errors and flag** - A12 fixed error events, A20 refusal, default-off flag `VC_VOICE_ENABLED`.
- **C9 tenancy and cleanup** - a tenant's session never emits or reads another's; a closed socket releases the provider session, timers and slot; no leak under 50 connect/abort cycles.
- **C10 one live session per student under concurrency (review items 1, 2, 4)** - when B and C start together while A is active and A's drain is slow, exactly one provider session is live at the end and the loser is told `superseded` (newest start wins, so no transient paid session); a connection that closes while it waits to supersede never takes the student's slot; the start timer also covers the `starting` state (a provider connect that never returns is closed with 1008 and the slot and lock are freed) and is re-armed when the start begins, so a late start gets its own 15 s.
- **C11 per-student limits (review item 3)** - the session route is rate-limited per tenant+student with the D-088 Q5 limiter and its 30/min default (429 `rate_limited` with Retry-After; a refused request spends no budget); one student may hold at most 2 sockets that have not started, a third is refused 429 at the upgrade before the single-use token is spent.
- **C12 crisis durability and escalation parity (review items 5, 6)** - a crisis flag write is tried twice (one retry) and a final failure is logged text-free as `voice_crisis_flag_failed` without throwing; the optional `escalateForTenant(tenantId, db)` port (same shape as chat.ts) is called with the REDACTED words of the latest student turn, only when text may be stored (adult, or a minor with boolean-true guardian consent), with the same retry and a `voice_crisis_escalate_failed` log. (Cycle 2: the words are the crisis utterance's own, else the fixed marker, see C18; a skip is logged, see C14.)
- **C13 resume-log expiry (brief item 7: retained transcript events)** - an expired resume log is dropped on the read that finds it, by an unref'd injectable prune timer when nobody reads it, and on shutdown.
- **C14 a voice crisis always reaches the escalation or a log line (checker B F1, HIGH)** - a crisis whose flag write is still in flight when the socket drops, or ends gracefully, is flagged once and escalated once (the crisis record runs to completion whatever the socket state; closing only stops sending to the client). With a port configured, the only crises not escalated are a student fenced for erasure (`voice_crisis_escalate_skipped_fenced`) and an unconsented minor (`voice_crisis_escalate_skipped_text_not_stored`), each logged text-free.
- **C15 the month is read again after a supersede (review F1, A23/D-088)** - with 50 minutes used and A running 10, a start B that supersedes A re-reads the usage after A's minutes are written and is refused `voice_quota_exceeded` (1008) with no provider session.
- **C16 step-aside only for a live newer start (review F2, checker B F2)** - a waiter steps aside only when `latestStart` names another live connection; finalize removes a closing connection from it at once and the slot holder keeps its entry. A active with a slow drain, B starts, C starts and aborts: B is the one live session and is never told superseded. The supersede loop's second pass is needed: a start that went live while B re-read the month is superseded before B opens its provider session (mutant C10c is no longer equivalent).
- **C17 the escalation port is built inside the retried write (review, checker B F3, LOW)** - an `escalateForTenant` factory that throws synchronously is retried once and logged `voice_crisis_escalate_failed` (text-free), never a `persist_failed` event; a factory that throws once is retried and delivered.
- **C18 no earlier turn's words in an escalation (review, LOW)** - the escalation carries the redacted words of the crisis utterance itself (the student turn written right before the fixed reply, by seq); with none, the fixed text-free `VOICE_CRISIS_NO_WORDS_TEXT`, never an earlier turn's words.
- **C19 bounded finalize drain (review open question)** - finalize waits for the queued sink writes at most `drainTimeoutMs` (default 10 s), then logs `voice_drain_timeout` and frees the socket, the provider session and the student's slot; the writes go on in the background.

## What changed
Code commit `7227385` on branch `p1/u10` (base `d55e8fb` = main with U8 plus `p1/u9` merged, U9 head f53b50a).
- `apps/api/src/voice.ts` (NEW, 1217 lines) - `createVoiceApi(deps, route)`, `withVoiceRoutes`, `voiceEnabledFromEnv`, `assertVoiceGoLive`. Token mint (jose HS256, aud `vc-voice-ws`, iss `vc-api`, 60 s, single-use jti held in memory), the `ws` upgrade handler (`noServer`, `maxPayload`, `perMessageDeflate:false`, subprotocol `vc-voice-v1`), the U9 `LiveSession` relay, event ids `<sid>.<n>` with an owner-checked 5-minute resume log, silence and cap timers (injectable), per-student single session, socket cap, usage recording on close, A9b audit after the spoken answer (flag deduped per finding), redacted persistence with the minor/guardian rule, fenced writes, A20 gate and tracing check.
- `apps/api/src/server.ts` - `createApiServer(handler, { onUpgrade? })`: the `upgrade` listener is registered only when a handler is given (default behaviour unchanged).
- `packages/db/src/chat-threads.ts` - additive: `appendVoiceTurn` (idempotent `$setOnInsert`, `channel: "voice"`, order user 0 / assistant 1, fence-aware, owned thread only), `appendVoiceAudit` (`$addToSet voiceAudit` on the assistant row, so export and erasure already cover it), `voiceAudit?` on `ChatTurnDoc`.
- `apps/api/package.json`, `pnpm-lock.yaml` - `ws` 8.22.0 and `@types/ws` 8.18.2, exact pins (D-097 item 1). The lock also gained `(ws@8.22.0)` peer suffixes on the `@langchain/core` resolutions (pnpm bookkeeping, no version change).
- Tests (NEW): `apps/api/tests/voice.test.ts`, `voice-audit.test.ts`, `voice-history.test.ts`, `voice-limits.test.ts`, `voice-fixtures.ts`; additive in `packages/db/tests/chat-threads.test.ts` (5 tests).
- **Route path deviation (stated):** the brief names `/v1/students/{id}/voice/sessions`; the pinned openapi draft (`openapi.ts`, `student-openapi.test.ts`) names `/v1/students/{studentId}/chat/threads/{threadId}/voice/sessions` and `.../voice/stream`. I followed the pinned draft so the A5 test stays green without touching `openapi.ts`. The voice routes are wrapped outside `withChatRoutes` because chat.ts answers every `/chat/` path itself.
- Not touched: `chat.ts`, `anonymous.ts`, `auth.ts`, `go-live-gate.ts`, `index.ts`, `openapi.ts`, `packages/providers/**`, `packages/engine/**`, `packages/schemas/**`. Nothing deleted or renamed.
- Mock only: `MockLiveProvider`; no network, no real audio, no paid call, no Mongo connection (fake client).
**Repair cycle 1** - code commit `f71f387` on `p1/u10` (review of 7227385 was Block; manifest 0563712). Changed files: `apps/api/src/voice.ts` (+175 / -20), `apps/api/tests/voice.test.ts` (+388), `apps/api/tests/voice-limits.test.ts` (+60), `apps/api/tests/voice-fixtures.ts` (+5). Nothing else.
- Item 1 (concurrent starts): `handleStart` keeps a `latestStart` map; the supersede step is a loop that re-reads the slot after every drain, and an older waiter that is no longer the newest start steps aside with `superseded` (design: newest start wins, which avoids a transient second paid provider session). `finalize` clears the entry.
- Item 2 (closed waiter): after each await the waiter re-checks `c.state === "starting"`, and once more before it takes `activeByStudent`.
- Item 3 (limits): session route uses `AnonymousRateLimiter` per tenant+student (cap `VOICE_MAX_LIMITER_KEYS` = 100000, window `VOICE_RATE_WINDOW_MS` = 60 s, default `requestsPerMinute` from the tenant limits); `doUpgrade` refuses the third pre-start socket of a student (`VOICE_MAX_PRESTART_SOCKETS_PER_STUDENT` = 2) with 429 before `usedTokens.set`.
- Item 4 (start timer): `armStartTimer` replaces the connection's first timer; it closes a socket still in `awaiting_start` or `starting` after `VOICE_START_TIMEOUT_MS` and is re-armed on entering `starting`.
- Item 5 (crisis durability): `crisisWrite` tries `VOICE_CRISIS_WRITE_ATTEMPTS` = 2 times, logs the final failure text-free and never throws. Behaviour change stated: a crisis-write failure no longer sends a `persist_failed` error event (the helpline was already delivered); it is logged instead.
- Item 6 (escalation port): new optional dep `escalateForTenant?(tenantId, db): StudentGraphDeps["escalate"]`; `lastUser.text` holds the redacted, clamped words only while `persistText`; skipped for an unconsented minor and when no words are known. Done, not deferred.
- Item 7 (retained logs): `pruneRetained` on read and on `retain`, an unref'd prune timer on a separate injectable `pruneTimers` dep (so the per-connection timer counts and the existing `timers.pending === 0` assertions are unchanged), `close()` clears the timer and the map. The separate low finding (inbound audio rate) is record-only, see Not done.
**Repair cycle 2** - code commit `9067502` on `p1/u10` (checker B and the review of f71f387; manifest 0fb8b41). Changed files: `apps/api/src/voice.ts` (+121 / -27), `apps/api/tests/voice.test.ts` (+314 / -1: the one removed line is the import list, extended), `apps/api/tests/voice-limits.test.ts` (+25). Nothing else; no existing assertion weakened or deleted.
- Item 1 (HIGH, C14): `onCrisisRecord` no longer returns when the connection is `closing`/`closed`; the record and escalation run to completion inside the drain finalize already waits for. `crisisWrite` now returns `ok | fenced | failed`; with a port configured, a fenced student logs `voice_crisis_escalate_skipped_fenced`, an unconsented minor logs `voice_crisis_escalate_skipped_text_not_stored` (both text-free), and a factory returning undefined logs `voice_crisis_escalate_unavailable`. No port configured: unchanged (flag only, no log).
- Item 2 (C15): inside the supersede loop, after each predecessor is finalized the month is read again (`getStudentUsage`), `remainingMs` recomputed, and the start refused `voice_quota_exceeded` (1008) when <= 0; the cap timer uses the new `remainingMs`. The read is an await, so the loop then re-checks the map (its second pass).
- Item 3 (C16): a waiter steps aside only when `latestStart` names another connection; `finalize` deletes a closing connection from `latestStart` at its start; the slot holder keeps its entry (the old delete-on-take is gone, so an older waiter that wakes after the newest one took the slot still steps aside); a waiter that finds the entry empty claims it, so two surviving waiters cannot both proceed.
- Item 4 (C17): the `escalateForTenant` factory is called inside the `crisisWrite` thunk.
- Item 5 (C18): `onFinalTranscript` records `lastUser.seq`; when the fixed crisis reply (seq N+1) reaches the sink, `crisisWords` is the redacted text of the student turn with seq N only (LiveSession writes the crisis utterance right before the fixed reply); `onCrisisRecord` consumes it, else escalates with `VOICE_CRISIS_NO_WORDS_TEXT`. Behaviour change stated: a crisis with no words is now escalated with that marker (cycle 1 skipped it).
- Item 6 (C19, open question answered): `recordStudentFlag`, `appendVoiceTurn` and `recordStudentUsage` all go through `fencedStudentWrite` with a `WriterDeadline` (`FENCED_WRITER_DEADLINE_MS` = 60 s; packages/db/src/erasure.ts:512, chat-threads.ts:139, student-logs.ts:50); `appendVoiceTurn`'s `getChatThread` pre-read and the `escalateForTenant` port have no deadline. So `finalize` now races `session.drain()` against `drainTimeoutMs` (new optional dep, default `VOICE_DRAIN_TIMEOUT_MS_DEFAULT` = 10 s, an unref'd real timer, not counted in `stats().timers`), logs `voice_drain_timeout` and releases the socket, the provider session and the slot; the queued writes go on in the background.
CORE-REQUEST: apps/api/src/index.ts - `startApi` must read `VC_VOICE_ENABLED` (`voiceEnabledFromEnv`), call `assertVoiceGoLive` before connecting to Mongo, build `createVoiceApi(...)` with the live provider, student verifier, WS secret and crisis message, wrap `withVoiceRoutes(withChatRoutes(...), voice.handler)`, pass `createApiServer(handler, { onUpgrade: voice.upgrade })` pass `escalateForTenant` (the same tenant-scoped escalation the text path uses, so a voice crisis reaches the same counsellor channel), and close `voice` on shutdown. Until then the voice routes are not reachable from `startApi`.
CORE-REQUEST: apps/api/src/openapi.ts - none needed now (the A5 test passes against the pinned draft); listed only so the checker can see it was considered.

## Verification scope
Policy-Version: proportional-verification/2026-10-17.14
Tier: L (auth: single-use WebSocket token, tenant isolation, student PII persistence and erasure, minors)
Round: est 150 min (cycle 2 adds 12 falsifications and the C14-C19 tests) - build, 97 falsifications (testlock waits dominate), per-criterion pre-checks and this manifest; cycle 1 repair adds 23 falsifications and the C10-C13 tests
Base / checked state: base d55e8fb, cycle-0 code 7227385, cycle-1 code f71f387, cycle-2 code 9067502 (worktree clean except `qa/evidence/p1-u10/` and this manifest; line-ending stat noise only)
Affected tests / full-suite trigger: `apps/api` voice files plus `server`, `student-openapi`, `go-live-gate`; `packages/db` chat-threads and erasure; `packages/providers` live. No whole-repo suite.
Tests[C1]: apps/api tests/voice.test.ts - session mint matches VoiceSessionResponseSchema (60 s token, PCM16 16k in / 24k out, no token in the URL), refusals (no token 401, counsellor 403, other student's path 404 including the token's own thread under another student's path, unknown thread, other tenant's thread, bad body, method), fenced student 409, sandbox `syn-` rule (A6).
Tests[C2]: apps/api tests/voice.test.ts - no token, garbage token, token in the URL query, wrong audience, wrong key, wrong algorithm, alg none, expired, missing exp or jti, replay (single use) including two concurrent upgrades, token for another student or thread, Authorization header and `vc-token.` subprotocol, bad origin, no token or raw frame text in logs; every refusal happens before any provider connect.
Tests[C3]: apps/api tests/voice.test.ts - audio in and out, transcripts with monotonic event ids, odd-length audio, interrupt, end, control-message misuse, numeric confirm through the U8 profile-fact path, D-096 item 3 (muted after a crisis, only what LiveSession emits is forwarded, fixed audio within 2 s).
Tests[C4]: apps/api tests/voice.test.ts - resume from lastEventId replays only the owner's session events inside the 5-minute window, 60 s silence (speech and model output restart the clock; configurable per tenant), 20-minute cap, text fallback on the same thread.
Tests[C5]: apps/api tests/voice-audit.test.ts - uncited number and listed speaker flagged after the audio was sent and stored on the assistant row (`voiceAudit`), clean answer none, KB-cited figure not flagged, throwing auditor becomes an `unverified_claim` flag, unconsented minor: flag shown, nothing stored.
Tests[C6]: apps/api tests/voice-history.test.ts and packages/db tests/chat-threads.test.ts - voice and text in one thread, redaction (email, phone, self-stated and profile names), under-18 without boolean-true consent stores nothing, string 'true' is not consent, no audio stored, export and erasure cover voice rows, persist failure is a fixed event, fence mid-write.
Tests[C7]: apps/api tests/voice-limits.test.ts - 60-minute month: 429 voice_quota_exceeded with Retry-After and text continues, the check runs twice, session limit = min(20, remaining), minutes recorded on end and abort, per-tenant override, erasure fence leaves usage unwritten.
Tests[C8]: apps/api tests/voice.test.ts - LiveConfigError and provider failure are fixed error events with no provider detail, provider error mid-session, backend close, default off (no route, no upgrade), A20 refusal without the go-live records, tracing on refused.
Tests[C9]: apps/api tests/voice.test.ts - tenant isolation (same thread id in two tenants, resume across tenants), one session per student (a second start supersedes the first and is told why), socket cap 503, 50 connect/abort cycles leak nothing, shutdown closes every connection, a socket closing during the provider connect leaves no provider session.
Tests[C10]: apps/api tests/voice.test.ts - concurrent starts with a gated drain (exactly one live provider session, two backends ever created, the loser told superseded), a connection closed mid-supersede, a hung provider connect closed by the start timer, a late start with its own budget, a never-started socket still closed.
Tests[C11]: apps/api tests/voice-limits.test.ts - the session route is limited per student, a refused request does not spend budget, the pre-start cap of 2 (token not burned, another student unaffected, a slot reopens).
Tests[C12]: apps/api tests/voice.test.ts - crisis flag retry (once, then logged text-free), escalation port with redacted words, adult and guardian-consented minor escalated, unconsented minor not escalated (cycle 2: an empty utterance is escalated with the marker, C18), escalation retry and its own log event, session continues after a failed write.
Tests[C14]: apps/api tests/voice.test.ts - flag write gated, then the socket drops / ends gracefully, release: 1 flag and 1 escalation; erasure-fenced student not escalated, skip logged; unconsented minor skip logged.
Tests[C15]: apps/api tests/voice-limits.test.ts - usage 50 min, A runs 10 min, B supersedes A and is refused voice_quota_exceeded (1008), 1 backend ever, usage exactly 60 min.
Tests[C16]: apps/api tests/voice.test.ts - B and C wait on A (gated drain), C aborts: B live and never superseded; a start that went live while B re-read the month (gated usage read and gated drain) is superseded before B connects.
Tests[C17]: apps/api tests/voice.test.ts - factory throws always: 2 builds, voice_crisis_escalate_failed, no persist_failed; throws once: delivered on the retry.
Tests[C18]: apps/api tests/voice.test.ts - empty crisis utterance after an answered turn: escalated with VOICE_CRISIS_NO_WORDS_TEXT; crisis after an unanswered earlier turn: only the crisis words.
Tests[C19]: apps/api tests/voice.test.ts - never-settling escalation with drainTimeoutMs 100: the end closes the socket, voice_drain_timeout logged, sockets/active/live 0, the student can start again.
Tests[C13]: apps/api tests/voice.test.ts - an expired resume log is dropped on reconnect, dropped by the prune timer with nobody reading it (not counted in the per-connection timers), dropped on shutdown.
Pre-check[C1]: 9067502 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^(C1[:/]|A6:)" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 7 passed, 0 failed t=2s (`qa/evidence/p1-u10/repair2/precheck-C1.txt`)
Pre-check[C2]: 9067502 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^C2[:/]" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 12 passed, 0 failed t=2s (`qa/evidence/p1-u10/repair2/precheck-C2.txt`)
Pre-check[C3]: 9067502 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^(C3[:/]|D-096)" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 12 passed, 0 failed t=3s (`qa/evidence/p1-u10/repair2/precheck-C3.txt`)
Pre-check[C4]: 9067502 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^C4[:/]" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 8 passed, 0 failed t=3s (`qa/evidence/p1-u10/repair2/precheck-C4.txt`)
Pre-check[C5]: 9067502 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^C5[:/]" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 9 passed, 0 failed t=3s (`qa/evidence/p1-u10/repair2/precheck-C5.txt`)
Pre-check[C6]: 9067502 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^C6[:/]" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts; bash D:/vc/scripts/vc-testlock.sh pnpm -C packages/db exec tsx --test tests/chat-threads.test.ts -> green: 28 passed, 0 failed t=3s (api 11 + db 17; `qa/evidence/p1-u10/repair2/precheck-C6.txt`, `qa/evidence/p1-u10/repair2/precheck-C6-db.txt`)
Pre-check[C7]: 9067502 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^C7[:/]" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 9 passed, 0 failed t=3s (`qa/evidence/p1-u10/repair2/precheck-C7.txt`)
Pre-check[C8]: 9067502 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^C8[:/]" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 7 passed, 0 failed t=2s (`qa/evidence/p1-u10/repair2/precheck-C8.txt`)
Pre-check[C9]: 9067502 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^C9[:/]" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 9 passed, 0 failed t=3s (`qa/evidence/p1-u10/repair2/precheck-C9.txt`)
Pre-check[C10]: 9067502 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^C10[:/]" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 8 passed, 0 failed t=3s (`qa/evidence/p1-u10/repair2/precheck-C10.txt`)
Pre-check[C11]: 9067502 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^C11[:/]" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 6 passed, 0 failed t=2s (`qa/evidence/p1-u10/repair2/precheck-C11.txt`)
Pre-check[C12]: 9067502 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^C12[:/]" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 11 passed, 0 failed t=3s (`qa/evidence/p1-u10/repair2/precheck-C12.txt`)
Pre-check[C13]: 9067502 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^C13[:/]" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 6 passed, 0 failed t=2s (`qa/evidence/p1-u10/repair2/precheck-C13.txt`)
Pre-check[C14]: 9067502 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^C14[:/]" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 7 passed, 0 failed t=3s (`qa/evidence/p1-u10/repair2/precheck-C14.txt`)
Pre-check[C15]: 9067502 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^C15[:/]" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 4 passed, 0 failed t=2s (`qa/evidence/p1-u10/repair2/precheck-C15.txt`)
Pre-check[C16]: 9067502 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^C16[:/]" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 5 passed, 0 failed t=3s (`qa/evidence/p1-u10/repair2/precheck-C16.txt`)
Pre-check[C17]: 9067502 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^C17[:/]" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 5 passed, 0 failed t=2s (`qa/evidence/p1-u10/repair2/precheck-C17.txt`)
Pre-check[C18]: 9067502 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^C18[:/]" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 5 passed, 0 failed t=2s (`qa/evidence/p1-u10/repair2/precheck-C18.txt`)
Pre-check[C19]: 9067502 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^C19[:/]" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 4 passed, 0 failed t=2s (`qa/evidence/p1-u10/repair2/precheck-C19.txt`)
Pre-check[api-set]: 9067502 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts tests/server.test.ts tests/student-openapi.test.ts tests/go-live-gate.test.ts -> green: 146 passed, 0 failed (`qa/evidence/p1-u10/repair2/test-api-final.txt`; also 146/0 on the identical uncommitted tree just before the commit, `test-api-final-run1-precommit.txt`)
Pre-check[db]: 9067502 bash D:/vc/scripts/vc-testlock.sh pnpm -C packages/db exec tsx --test tests/chat-threads.test.ts tests/erasure.test.ts -> green: 88 passed, 0 failed (`qa/evidence/p1-u10/repair2/test-db-final.txt`; packages/db unchanged in cycle 2, run on the tree that became 9067502 with no further edit)
Pre-check[providers]: 9067502 bash D:/vc/scripts/vc-testlock.sh pnpm -C packages/providers exec tsx --test tests/live.test.ts -> green: 70 passed, 0 failed (`qa/evidence/p1-u10/repair2/test-providers-final.txt`; same tree as the commit)
Pre-check[typecheck]: 9067502 bash D:/vc/scripts/vc-testlock.sh pnpm -r typecheck -> exit 0, all packages and apps (`qa/evidence/p1-u10/repair2/typecheck-final.txt`; same tree as the commit)
Red-before (cycle 2): the new C14-C19 tests (12) against the f71f387 `voice.ts` plus only the new `VOICE_CRISIS_NO_WORDS_TEXT` export -> 11 fail, 1 pass (the C18 guard: an unanswered earlier turn), C19 hung the file (cleanup waits on a finalize that never ends) and the run was stopped (`qa/evidence/p1-u10/repair2/test-red-before.txt`).
Red-before (cycle 1): the new C10-C13 tests against the cycle-0 `voice.ts` from 7227385 in a scratch copy -> 19 tests, 5 pass, 14 fail (`qa/evidence/p1-u10/repair1/test-red-before.txt`).
(Per-criterion "passed" counts are the runner's totals, which include 2 or 3 file-level entries each; e.g. C10 = 8 reported = 5 tests.)
Metrics: start=2026-10-19T00:36+05:30 end=2026-10-19T05:35:38+05:30 builder_min=unavailable wall_min=unavailable agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=4 mutations=132 survivors_final=3 cycle=2 resumes=1 tokens=unavailable policy=proportional-verification/2026-10-17.14 lane=normal check_s=unavailable mutants=132 defects_unit=unavailable defects_6c=0
(cycle 2: 12 falsifications added, all killed, so survivors_final=3 = C6h, C10a, C10h; C10c is killed as C16b; resumes unchanged; end read from `date -Iseconds`; the C19 red-before run hung the shared lock until the maker stopped it, see test-red-before.txt.)
(cycle 1: 23 falsifications added to the 97; survivors_final=4 = C6h plus the three redundant single guard layers C10a, C10c, C10h, see below; the cycle-1 end time was read from `date -Iseconds` at 2026-10-19T04:39:57+05:30; suite_runs=0: no whole-repo suite; repeat_runs=2: the api set was run twice after the last test edit to rule out flakiness. start is the base merge commit time; the session was compacted once mid-build.)
mutant-cap-raise: the brief asks for one falsification per criterion plus one per security property; the criteria name many independent behaviours each (each C2 refusal reason, each timer, each tenancy path), so 97 single-line edits were run in a throwaway copy `p1-u10-fals`, never the bound tree, all under the shared test lock.

## Capability coverage (each criterion -> falsifying edits; logs `qa/evidence/p1-u10/falsify/falsify-<id>.log`, summaries `falsify-summary.json` and `falsify-summary-C1f-C4e-C9l.json`)
Column "before" is the green baseline of the same test files in the copy; "after" is the run with exactly one edit. Edits on `packages/db/src/chat-threads.ts` (C6g-C6l) run the db test file; the api tests resolve `@vc/db` to the unmutated worktree package.
| id | falsifying edit | before (pass/tests) | after | first failing test |
|---|---|---|---|---|
| C1a | flag default on: unset reads as enabled | 56/56 | 1 fail of 56 | C8/A20: default off: no flag builds nothing, no route is mounted, and the upgrade path doe |
| C1b | createVoiceApi builds even when disabled | 56/56 | 1 fail of 56 | C8/A20: default off: no flag builds nothing, no route is mounted, and the upgrade path doe |
| C1c | A20 voice gate not asked when building the routes | 56/56 | 1 fail of 56 | C8/A20: enabled without the go-live records |
| C1d | tracing switch not checked | 56/56 | 1 fail of 56 | C8/A20: enabled without the go-live records |
| C1e | session route does not require the thread to exist | 56/56 | 1 fail of 56 | C1: session route refusals: no token, wrong role, other student's path, unknown thread, ot |
| C1f | session route serves a path student other than the token student | 57/57 | 1 fail of 57 | C1: session route refusals: no token, wrong role, other student's path, unknown thread, ot |
| C1g | a role refusal is answered 401 instead of 403 | 56/56 | 1 fail of 56 | C1: session route refusals: no token, wrong role, other student's path, unknown thread, ot |
| C1h | session route mints for a fenced (erasure) student | 56/56 | 1 fail of 56 | C1: a fenced |
| C1i | sandbox tenant accepts a real-looking student id | 56/56 | 1 fail of 56 | A6: the sandbox tenant accepts only syn- student ids at the voice session route |
| C1j | ws token lives 3600 s, not 60 s | 56/56 | 3 fail of 56 | C1: POST voice/sessions mints a short-lived token with the D-088 audio format and no token |
| C1k | wsUrl carries the token in the URL | 56/56 | 1 fail of 56 | C1: POST voice/sessions mints a short-lived token with the D-088 audio format and no token |
| C2a | audience not checked | 56/56 | 2 fail of 56 | C6/D-093 4A: an under-18 student with no boolean-true guardian consent stores no turn, no  |
| C2b | issuer not checked | 56/56 | 1 fail of 56 | C2: a token with the wrong audience |
| C2c | any HMAC algorithm accepted | 56/56 | 2 fail of 56 | C6/D-093 4A: an under-18 student with no boolean-true guardian consent stores no turn, no  |
| C2d | expiry not enforced | 56/56 | 1 fail of 56 | C2: an expired token is refused |
| C2e | single use not enforced (replay allowed) | 56/56 | 1 fail of 56 | C2: a token is single use: a replay is refused, and two concurrent upgrades with one token |
| C2f | token for another student accepted on this path | 56/56 | 1 fail of 56 | C2: a token minted for one student or thread is refused on another student's or thread's p |
| C2g | token for another thread accepted on this path | 56/56 | 1 fail of 56 | C2: a token minted for one student or thread is refused on another student's or thread's p |
| C2h | missing token no longer refused cleanly | 56/56 | 1 fail of 56 | C2: no token, a garbage token and a token in the URL query are each refused with 401 |
| C2i | token accepted from the URL query string | 56/56 | 1 fail of 56 | C2: no token, a garbage token and a token in the URL query are each refused with 401 |
| C2j | Origin allow-list not enforced | 56/56 | 1 fail of 56 | C2: another path or method is 404 and an Origin outside the allowed list is 403 |
| C2k | tenant claim shape not validated | 56/56 | 2 fail of 56 | C6/D-093 4A: an under-18 student with no boolean-true guardian consent stores no turn, no  |
| C2l | the presented token is written to the server log | 56/56 | 1 fail of 56 | C2: no token and no raw frame text reaches the server log, on refusals or on a normal sess |
| C2m | subprotocol not negotiated | 56/56 | run hung, killed after 900 s (red) |  |
| C2n | vc-token subprotocol credential not read | 56/56 | 1 fail of 56 | C2: the token is accepted from the Authorization header or the vc-token subprotocol, and t |
| C2o | a student JWT accepted by the ws verifier (shared key + no aud) | 56/56 | 2 fail of 56 | C2: a token with the wrong audience |
| C3a | interrupt not forwarded to the provider | 56/56 | 1 fail of 56 | C3: interrupt reaches the provider, end closes the socket and the provider session |
| C3b | end does not close the session | 56/56 | 7 fail of 56 | C6/A19: voice turns interleave in order with text turns in one thread, survive a reconnect |
| C3c | student audio not forwarded to the provider | 56/56 | 2 fail of 56 | C3: audio in reaches the provider; model audio comes back as binary; transcripts are event |
| C3d | event ids do not advance | 56/56 | 2 fail of 56 | C3: audio in reaches the provider; model audio comes back as binary; transcripts are event |
| C3e | model audio not forwarded to the client | 56/56 | 4 fail of 56 | C5: an uncited figure in the spoken answer is flagged to the client and stored on the assi |
| C3f | numeric facts are not read back | 56/56 | 2 fail of 56 | C3: a numeric fact heard in speech is read back for confirmation; accept uses it, reject e |
| C3g | an accepted confirmation erases the fact | 56/56 | 1 fail of 56 | C3: a numeric fact heard in speech is read back for confirmation; accept uses it, reject e |
| C3h | a rejected confirmation confirms the fact | 56/56 | 1 fail of 56 | C3: rejecting a read-back figure erases the proposed fact |
| C3i | a second start opens a second provider session | 56/56 | 1 fail of 56 | C3: control-message misuse: junk, extra fields, audio before start, a second start, a wron |
| C3j | start accepts a thread other than the token thread | 56/56 | 1 fail of 56 | C3: start with a thread other than the token's is refused |
| C3k | no maximum frame size | 56/56 | 1 fail of 56 | C3: a frame over the size limit closes the socket |
| C3l | unlimited invalid client messages | 56/56 | 1 fail of 56 | C3: control-message misuse: junk, extra fields, audio before start, a second start, a wron |
| C3m | crisis flag not forwarded to the client | 56/56 | 2 fail of 56 | C6/D-093 4A: an under-18 student with no boolean-true guardian consent stores no turn, no  |
| C3n | crisis not logged as a student flag | 56/56 | 2 fail of 56 | C6/D-093 4A: an under-18 student with no boolean-true guardian consent stores no turn, no  |
| C3o | an oversize frame is answered with a bare abnormal close | 56/56 | 1 fail of 56 | C3: a frame over the size limit closes the socket |
| C4a | resume replays another owner's log | 56/56 | 2 fail of 56 | C4: resume of an expired, unknown or someone else's session id replays nothing |
| C4b | resume window not enforced | 56/56 | 1 fail of 56 | C4: resume of an expired, unknown or someone else's session id replays nothing |
| C4c | silence timeout never ends the session | 56/56 | 1 fail of 56 | C4: 60 s of silence ends the session with a fixed message; speech and model output restart |
| C4d | student speech does not restart the silence clock | 56/56 | 1 fail of 56 | C4: 60 s of silence ends the session with a fixed message; speech and model output restart |
| C4e | model output does not restart the silence clock | 57/57 | 1 fail of 57 | C4: 60 s of silence ends the session with a fixed message; speech and model output restart |
| C4f | silence default is 30 s | 56/56 | 1 fail of 56 | C4: 60 s of silence ends the session with a fixed message; speech and model output restart |
| C4g | per-tenant silence timeout ignored | 56/56 | 1 fail of 56 | C4: 60 s of silence ends the session with a fixed message; speech and model output restart |
| C4h | session cap timer never armed | 56/56 | 3 fail of 56 | C7: the session limit is the smaller of 20 minutes and what is left of the month, and the  |
| C4i | session cap is 25 minutes | 56/56 | 2 fail of 56 | C7: a per-tenant override changes the limits for that tenant only |
| C4j | session cap ignores the remaining monthly quota | 56/56 | 1 fail of 56 | C7: the session limit is the smaller of 20 minutes and what is left of the month, and the  |
| C4k | a provider failure message is sent to the client | 56/56 | 2 fail of 56 | C4: text fallback: after a voice failure, a cap or a silence end, text chat continues in t |
| C4l | a provider failure does not end the voice socket | 56/56 | 2 fail of 56 | C4: text fallback: after a voice failure, a cap or a silence end, text chat continues in t |
| C5a | audit findings are not stored | 56/56 | 2 fail of 56 | C5: an uncited figure in the spoken answer is flagged to the client and stored on the assi |
| C5b | audit flag not sent to the client | 56/56 | 5 fail of 56 | C5: an uncited figure in the spoken answer is flagged to the client and stored on the assi |
| C5c | a listed speaker name is repeated in the flag | 56/56 | 1 fail of 56 | C5: a listed speaker named aloud is flagged as named_speaker and the name is never repeate |
| C5d | listed speakers not given to the auditor | 56/56 | 1 fail of 56 | C5: a listed speaker named aloud is flagged as named_speaker and the name is never repeate |
| C5e | tool sources not relayed to the client | 56/56 | 1 fail of 56 | C5: a figure that a knowledge-base tool returned this session is cited, so it is not flagg |
| C5f | the same flag is repeated per alias | 56/56 | 1 fail of 56 | C5: a listed speaker named aloud is flagged as named_speaker and the name is never repeate |
| C5g | a failed audit finding is stored on the wrong row (text row filter) | 17/17 | 1 fail of 17 | U10: appendVoiceAudit attaches a finding to the assistant voice row once, keeps a speaker' |
| C6a | voice transcript stored unredacted | 56/56 | 1 fail of 56 | C6/D-093 6A: the stored transcript is redacted |
| C6b | profile names not used for redaction | 56/56 | 1 fail of 56 | C6/D-093 6A: the stored transcript is redacted |
| C6c | an unconsented minor has transcripts stored | 56/56 | 3 fail of 56 | C5: for an unconsented minor the flag still reaches the student but no finding or text is  |
| C6d | the ws token claims consent for everyone | 56/56 | 3 fail of 56 | C5: for an unconsented minor the flag still reaches the student but no finding or text is  |
| C6e | a voice row is written as a text turn | 17/17 | 2 fail of 17 | U10: a spoken exchange is stored as voice rows in the same thread, user before assistant,  |
| C6f | a replayed voice turn overwrites the stored one | 17/17 | 1 fail of 17 | U10: appendVoiceTurn is idempotent on |
| C6g | assistant voice row sorts with the user row | 17/17 | 1 fail of 17 | U10: a spoken exchange is stored as voice rows in the same thread, user before assistant,  |
| C6h | appendVoiceTurn accepts an unscoped Db | 17/17 | 0 fail of 17 |  |
| C6i | appendVoiceAudit accepts an unscoped Db | 17/17 | 1 fail of 17 | U10: appendVoiceTurn refuses a thread that is not the student's, bad input, and an unscope |
| C6j | voice turn written without the fence | 17/17 | 1 fail of 17 | U10: a student under erasure gets no voice row, and a fence that appears mid-write undoes  |
| C6k | audit finding added twice | 17/17 | 1 fail of 17 | U10: appendVoiceAudit attaches a finding to the assistant voice row once, keeps a speaker' |
| C6l | voice turn written to a thread the student does not own | 17/17 | 1 fail of 17 | U10: appendVoiceTurn refuses a thread that is not the student's, bad input, and an unscope |
| C7a | minutes are not recorded | 56/56 | 5 fail of 56 | C7: the session limit is the smaller of 20 minutes and what is left of the month, and the  |
| C7b | session route ignores the monthly limit | 56/56 | 3 fail of 56 | C7: a student at 60 voice minutes gets 429 voice_quota_exceeded with Retry-After, and text |
| C7c | start ignores the monthly limit | 56/56 | 1 fail of 56 | C7: a token minted before the limit was reached is still refused at start |
| C7d | per-tenant override ignored at start | 56/56 | 1 fail of 56 | C7: a per-tenant override changes the limits for that tenant only |
| C7e | per-tenant override ignored at the session route | 56/56 | 1 fail of 56 | C7: a per-tenant override changes the limits for that tenant only |
| C7f | start reads the wrong month's usage | 56/56 | 2 fail of 56 | C7: a token minted before the limit was reached is still refused at start |
| C7g | 429 carries no Retry-After | 56/56 | 1 fail of 56 | C7: a student at 60 voice minutes gets 429 voice_quota_exceeded with Retry-After, and text |
| C7h | advertised session length ignores the remaining quota | 56/56 | 1 fail of 56 | C7: the session limit is the smaller of 20 minutes and what is left of the month, and the  |
| C8a | LiveConfigError not distinguished | 56/56 | 1 fail of 56 | C8/A12: LiveConfigError is its own fixed error event |
| C8b | provider error text sent to the client | 56/56 | 2 fail of 56 | C6: a failure to store a transcript is reported as a fixed persist_failed event and the se |
| C8c | backend close does not end the session | 56/56 | 1 fail of 56 | C8/A12: a provider error mid-session is an error event and the session continues; a backen |
| C8d | a storage failure reads as a provider failure | 56/56 | 1 fail of 56 | C6: a failure to store a transcript is reported as a fixed persist_failed event and the se |
| C9a | resume ignores the tenant of the retained log | 56/56 | 1 fail of 56 | C9: tenants are isolated: a tenant-b token for tenant-a's thread finds nothing, resume acr |
| C9b | timers are not cleared when a connection ends | 56/56 | 2 fail of 56 | C4: 60 s of silence ends the session with a fixed message; speech and model output restart |
| C9c | the provider session is not closed on finalize | 56/56 | 3 fail of 56 | C3: interrupt reaches the provider, end closes the socket and the provider session |
| C9d | a finished connection stays in the socket set | 56/56 | 5 fail of 56 | C7: minutes are recorded when the connection ends |
| C9e | the live-session count is never decremented | 56/56 | 7 fail of 56 | C7: a student under erasure is not charged: the minutes write is refused by the fence, not |
| C9f | the student slot is never released | 56/56 | 3 fail of 56 | C3: interrupt reaches the provider, end closes the socket and the provider session |
| C9g | used-token memory never pruned | 56/56 | 1 fail of 56 | C9: 50 connect/abort cycles |
| C9h | a newer session does not end the older one | 56/56 | 1 fail of 56 | C9: a student has one voice session: a second start replaces the first, which is told it w |
| C9i | socket cap ignored | 56/56 | 2 fail of 56 | C6/D-093 4A: an under-18 student with no boolean-true guardian consent stores no turn, no  |
| C9j | the connection uses another tenant's Db | 56/56 | 2 fail of 56 | C7: a per-tenant override changes the limits for that tenant only |
| C9k | shutdown leaves connections open | 56/56 | run hung, killed after 900 s (red) |  |
| C9l | a session that connects after the client left is not closed | 57/57 | 1 fail of 57 | C9: a socket that closes while the provider connect is still in flight leaves no provider  |
| C9m | the superseded session is not told why | 56/56 | 1 fail of 56 | C9: a student has one voice session: a second start replaces the first, which is told it w |

Survivors: 1, an equivalent mutant. **C6h** removes `requireScopedDb(db, "appendVoiceTurn")`; `appendVoiceTurn` then calls `getChatThread`, which runs the same `requireScopedDb`, so the unscoped Db is still refused with `TenantScopeError` (test `U10: appendVoiceTurn refuses ... an unscoped Db` stays green). The explicit check is kept as defence in depth; no behaviour can differ.
First pass (97 edits) left three more survivors besides C6h, each handled before ready: **C1f** (path student other than the token student, with the token's own thread) and **C4e** (model output restarting the silence clock) and **C9l** (a socket that closes while the provider connect is in flight). C1f and C9l had no test reaching the path. C4e survived because the "not closed" assertion ran before the asynchronous close could happen, so it passed either way; the not-closed assertions in the silence, tenant-override and remaining-quota tests now wait 30 ms first. Tests added or hardened (tests only, no source change): a cross-path request (C1f), a gated-provider test (C9l). C1f, C4e and C9l were re-run: each now fails exactly one test (the rows above are the re-runs). **C9k** (shutdown leaves connections open) is red by a hang: the leak test never terminated and the driver killed it after 900 s; that counts as a kill.
Flaky assertion found on the way: the under-18 test searched the whole fake DB for the substring `9000`, which a random UUID can contain (one failure in about 20 runs); it now searches `costs 9000` (0 failures in 14 runs after).

## Repair cycle 1 capability coverage (23 single edits on `f71f387` in the throwaway copy `p1-u10-fals`; only `apps/api/src/voice.ts` mutated; logs `qa/evidence/p1-u10/repair1/falsify/falsify-<id>.log`)
Baseline of the C10-C13 test selection: 19 tests, 19 pass. "after" is the run with exactly one edit.
| id | falsifying edit | after | first failing test |
|---|---|---|---|
| C10a | a closed waiter still takes the slot (post-await state check removed) | SURVIVES | redundant layer, see below |
| C10b | an older waiter does not step aside for the newest start | 1 fail of 19 | C10: B and C start together while A is active |
| C10c | supersede loop runs once (original one-shot await) | SURVIVES | redundant layer, see below |
| C10d | start timer ignores the `starting` state | 1 fail of 19 | C10: a start whose provider connect never returns |
| C10e | start timer not re-armed when the start begins | 1 fail of 19 | C10: a start that arrived late gets its own budget |
| C10f | all three guards removed (closed-waiter check, newest-wins check, final state guard) | 2 fail of 19 | C10: B and C start together ... |
| C10g | loop runs once AND no newest-wins | 1 fail of 19 | C10: B and C start together ... |
| C10h | only the final state guard before taking the slot removed | SURVIVES | redundant layer, see below |
| C11a | session route has no per-student limiter | 1 fail of 19 | C11: the session route is limited per student |
| C11b | limiter key is the tenant, not the student | 1 fail of 19 | C11: the session route is limited per student |
| C11c | no pre-start socket cap | 1 fail of 19 | C11: one student can hold only 2 sockets |
| C11d | an active session counts as a pre-start socket | 2 fail of 19 | C11 pre-start cap; C10 concurrent starts |
| C12a | crisis write not retried | 4 fail of 19 | C12: a crisis flag write that fails once is retried once |
| C12b | crisis write retried more than once | 2 fail of 19 | C12: keeps failing is tried twice |
| C12c | final failure not logged | 2 fail of 19 | C12: keeps failing ... logged |
| C12d | escalation port never called | 4 fail of 19 | C12: a crisis is escalated through the optional port |
| C12e | escalation gets unredacted words | 1 fail of 19 | C12: escalated with the REDACTED words |
| C12f | escalation fires with no consented words known | 1 fail of 19 | C12: an under-18 student without guardian consent |
| C12g | escalation failure logged under the flag event name | 1 fail of 19 | C12: an escalation that keeps failing |
| C12h | crisis write throws again (not swallowed) | 2 fail of 19 | C12: keeps failing is tried twice |
| C13a | expired logs not dropped on read | 1 fail of 19 | C13: an expired resume log is dropped when a reconnect asks |
| C13b | prune timer never armed | 1 fail of 19 | C13: the prune timer drops an expired resume log |
| C13c | shutdown keeps retained logs | 1 fail of 19 | C13: shutdown drops every retained resume log |

Survivors (3, all equivalent as single edits): **C10a, C10c, C10h** each remove ONE of several independent guards that protect the same property (a closed or older waiter must not take the slot), so another guard still holds; removing the guards together (C10f) or the loop plus newest-wins (C10g) is killed. They are kept as defence in depth and reported as such, not as untested code. Red-before: 14 of the 19 new tests fail on the cycle-0 code (`test-red-before.txt`). First-pass anchor problems in the harness (multi-line escapes) were fixed before the recorded runs; the logs above are from the final harness.

## Repair cycle 2 capability coverage (12 single edits on `9067502` in the throwaway copy `p1-u10-fals`; only `apps/api/src/voice.ts` mutated; harness `qa/evidence/p1-u10/repair2/falsify-harness.py`, logs `qa/evidence/p1-u10/repair2/falsify/falsify-<id>.log`, summary `falsify-summary.json`)
Baseline of the C10-C19 selection (`--test-name-pattern "^C1[0-9][:/]"` on voice.test.ts and voice-limits.test.ts): 31 entries, 31 pass, 0 fail. "after" is the run with exactly one edit.
| id | falsifying edit | after | first failing test |
|---|---|---|---|
| C14a | the escalation is skipped again once the socket is closing (the cycle-1 state check restored) | 3 fail of 31 | C14: a crisis whose flag write is still in flight when the socket drops is flagged once and escalated once |
| C14b | the fenced skip leaves no log line | 1 fail of 31 | C14: a student fenced for erasure is the one crisis that is not escalated, and the skip is logged text-free (v |
| C14c | the unconsented-minor skip leaves no log line | 1 fail of 31 | C14: an unconsented minor is flagged, not escalated, and the skip is logged text-free (voice_crisis_escalate_s |
| C15a | the month is not read again after a supersede | 2 fail of 31 | C15: usage 50 min, A runs 10 min, B supersedes A: the month is read again after A's minutes are written and B  |
| C16a | step-aside when the newest start went away (undefined counts as newer, the cycle-1 rule) | 2 fail of 31 | C16: A active with a slow drain, B starts, C starts and then aborts: B (the only waiter left) becomes the one  |
| C16b | the supersede loop runs once (mutant C10c on the cycle-2 loop) | 1 fail of 31 | C16: the supersede loop's second pass is needed: a start that took the slot while B re-read the month is super |
| C16c | finalize does not drop a closing connection from latestStart at once | 1 fail of 31 | C16: the supersede loop's second pass is needed: a start that took the slot while B re-read the month is super |
| C17a | the escalation port is built outside the retried write | 2 fail of 31 | C17: a factory that throws once is retried and the escalation is delivered, with nothing logged |
| C18a | the escalation reads the latest student turn's words (the cycle-1 source), not the crisis utterance's | 1 fail of 31 | C18: a crisis with no words of its own is escalated with the fixed text-free marker, never with an earlier tur |
| C18b | the crisis words are taken from any earlier student turn (seq adjacency check removed) | 1 fail of 31 | C18: a crisis with no words of its own is escalated with the fixed text-free marker, never with an earlier tur |
| C18c | no marker: a crisis without words is not escalated (the cycle-1 skip) | 1 fail of 31 | C18: a crisis with no words of its own is escalated with the fixed text-free marker, never with an earlier tur |
| C19a | the drain wait ignores drainTimeoutMs (falls back to the 10 s default) | 1 fail of 31 | C19: a crisis sink write that never settles cannot hold the slot: finalize waits at most drainTimeoutMs, logs  |

Survivors: none (12 of 12 killed). C16b is the cycle-1 survivor C10c (the supersede loop runs once) applied to the cycle-2 loop: it is now killed by the C16 second-pass test. The cycle-1 survivors C10a and C10h were not re-run.

## Live browser evidence
Not applicable, API only; WS exercised by a node test client (`ws` against a real `http.Server` on an ephemeral port, in `voice-fixtures.ts`).

## Not done / stated limits (for the checker)
- **Silence timeout 60 s is an `[ASSUMPTION]` (Q-U10-2)**: configurable per process (`silenceTimeoutMs`) and per tenant (`silenceTimeoutMsForTenant`); not a decided number.
- **Single-use token memory is per process and in memory.** Two API processes would each accept the same token once. Same for the one-session-per-student rule, the socket cap, the resume log and the limiter. A shared store is a later unit; the deployment is one process today.
- **Usage is recorded when a connection ends.** A session that outlives the process (crash, kill) records nothing, so the monthly counter can undercount; the cap timer and the start-time check bound a single session to 20 minutes.
- **Name redaction is a heuristic (same as U8).** A name the model speaks that the student never self-stated and the profile does not supply is stored unredacted in the assistant transcript (observed in a test; the test now uses a profile-known name). The live transcript to the student is never redacted.
- **No `startApi` wiring** - see the CORE-REQUEST lines; the routes exist only in the test worlds until `index.ts` is changed by the orchestrator.
- **A20 stays closed in the repo.** With the real `qa/gates` the voice API refuses to build (the passing A10 record and B13 are pending); the open-gate tests use a temporary gates fixture with g-prod option c.
- **No real provider.** `MockLiveProvider` only; the Gemini adapter is U9's compile-only code and is not exercised. Audio is never stored (D-086 Q4) and never decoded.
- **OPEN RISK (low, record-only): inbound audio rate (the review low finding).** The relay forwards client audio frames to the provider without a per-second byte-rate cap beyond `maxPayload` per frame and the 20-minute session cap; a client can send frames faster than real time. Not fixed here by instruction.
- **Per-process, in-memory limits (cycle 1).** The session-route limiter, the pre-start socket cap, `latestStart` and the retained resume logs live in one process; two API processes would each hold their own budget. Same stated limit as the single-use token memory.
- **`index.ts` must pass `escalateForTenant`.** The port is optional in `createVoiceApi`; until `startApi` passes it (CORE-REQUEST above) a voice crisis is flagged and logged but not escalated to the counsellor channel in production.
- **Crisis write failure is logged, not shown.** A student whose crisis write fails twice gets no `persist_failed` event (the helpline message was already delivered); the failure is an operator log line, so an operator must watch `voice_crisis_flag_failed` and `voice_crisis_escalate_failed`.
- **Commit trailer:** the brief asked for `Claude Opus 5.5`; the harness attribution rule in force at commit time said `Claude Sonnet 5.5`, which is also the actual model, so the commit carries the Sonnet trailer.
- No `senior-software-engineer` review and no checker dispatched (brief: the maker dispatches two blind checkers and a review).
- **Cycle 2 stated limits:** after a `voice_drain_timeout` the queued writes (the crisis escalation included) keep running unbounded in the background against a closed connection, and an error event they send lands in the retained resume log; the 10 s default is a choice, not a decided number. `latestStart` now keeps the slot holder's entry until its finalize (one entry per live connection). The fenced skip also covers `FencedWriterDeadlineError` (the existing `endIfFenced` rule), so a flag write that times out at the 60 s writer deadline skips the escalation and logs `voice_crisis_escalate_skipped_fenced`.

## How to verify (commands + expected)
- `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/apps/api exec tsx --test tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts tests/server.test.ts tests/student-openapi.test.ts tests/go-live-gate.test.ts` -> tests 146, pass 146, fail 0 (cycle 2; 134 in cycle 1, 115 in cycle 0).
- `... pnpm -C <worktree>/packages/db exec tsx --test tests/chat-threads.test.ts tests/erasure.test.ts` -> tests 88, pass 88, fail 0.
- `... pnpm -C <worktree>/packages/providers exec tsx --test tests/live.test.ts` -> tests 70, pass 70, fail 0.
- `pnpm -C <worktree> -r typecheck` -> exit 0.
- Per-criterion: the Pre-check lines above (the name pattern selects that criterion's tests).

