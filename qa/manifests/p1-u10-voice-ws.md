# Manifest - p1-u10-voice-ws
**Contract:** C1, C2, C3, C4, C5, C6, C7, C8, C9 (unit-local ids, below). Parent contract rows: `qa/contracts/counselling-engine.md` B21 (student routes), A6 (tenants, sandbox), A9b (spoken-answer audit), A12 (error events), A19 (one thread, text and voice), A20 (go-live gate), A23 (limits); decisions D-086 Q4, D-088 Q5, D-090, D-093 items 4A/6A/11 and P-1, D-096 item 3, D-097 item 1 (ws dependency). Plan row U10, brief `qa/evidence/p1-briefs/p1-u10-build.md`.
**Criteria:** C1 session route, C2 WS auth, C3 events, C4 resume/silence/cap/fallback, C5 A9b audit, C6 history, C7 limits, C8 errors+flag, C9 tenancy+cleanup
**Goal task:** none
**Date:** 2026-10-19
**Status:** ready-for-check
**Fix cycle:** 0 of max 2
**Dual check:** required
dual-trigger: auth apps/api/src/voice.ts:337 (`jwtVerify` inside `verifyVoiceToken`: HS256 only, audience `vc-voice-ws`, issuer `vc-api`, required exp/jti/sub, single-use jti; the credential of the WebSocket upgrade)
dual-trigger: tenancy apps/api/src/voice.ts:1009 (the connection's Db is `deps.dbForTenant(claims.tenantId)`; resume ownership at `voice.ts:817` checks tenant, student and thread; student PII persistence and erasure)
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
CORE-REQUEST: apps/api/src/index.ts - `startApi` must read `VC_VOICE_ENABLED` (`voiceEnabledFromEnv`), call `assertVoiceGoLive` before connecting to Mongo, build `createVoiceApi(...)` with the live provider, student verifier, WS secret and crisis message, wrap `withVoiceRoutes(withChatRoutes(...), voice.handler)`, pass `createApiServer(handler, { onUpgrade: voice.upgrade })` and close `voice` on shutdown. Until then the voice routes are not reachable from `startApi`.
CORE-REQUEST: apps/api/src/openapi.ts - none needed now (the A5 test passes against the pinned draft); listed only so the checker can see it was considered.

## Verification scope
Policy-Version: proportional-verification/2026-10-17.14
Tier: L (auth: single-use WebSocket token, tenant isolation, student PII persistence and erasure, minors)
Round: est 120 min - build, 97 falsifications (testlock waits dominate), per-criterion pre-checks and this manifest
Base / checked state: base d55e8fb, code 7227385, worktree clean except `qa/evidence/p1-u10/` and this manifest
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
Pre-check[C1]: 7227385 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^(C1[:/]|A6:)" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 7 passed, 0 failed t=3s
Pre-check[C2]: 7227385 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^C2[:/]" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 12 passed, 0 failed t=4s
Pre-check[C3]: 7227385 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^(C3[:/]|D-096)" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 12 passed, 0 failed t=4s
Pre-check[C4]: 7227385 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^C4[:/]" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 8 passed, 0 failed t=4s
Pre-check[C5]: 7227385 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^C5[:/]" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 9 passed, 0 failed t=4s
Pre-check[C6]: 7227385 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^C6[:/]" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts; bash D:/vc/scripts/vc-testlock.sh pnpm -C packages/db exec tsx --test tests/chat-threads.test.ts -> green: 28 passed, 0 failed t=5ss (api 11 + db 17)
Pre-check[C7]: 7227385 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^C7[:/]" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 9 passed, 0 failed t=4s
Pre-check[C8]: 7227385 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^C8[:/]" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 7 passed, 0 failed t=4s
Pre-check[C9]: 7227385 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern "^C9[:/]" tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts -> green: 9 passed, 0 failed t=4s
Pre-check[api-set]: 7227385 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts tests/server.test.ts tests/student-openapi.test.ts tests/go-live-gate.test.ts -> green: 115 passed, 0 failed (`qa/evidence/p1-u10/test-api-final.txt`; run twice after the last test edit, both green)
Pre-check[db]: 7227385 bash D:/vc/scripts/vc-testlock.sh pnpm -C packages/db exec tsx --test tests/chat-threads.test.ts tests/erasure.test.ts -> green: 88 passed, 0 failed (`qa/evidence/p1-u10/test-db-final.txt`)
Pre-check[providers]: 7227385 bash D:/vc/scripts/vc-testlock.sh pnpm -C packages/providers exec tsx --test tests/live.test.ts -> green: 70 passed, 0 failed (`qa/evidence/p1-u10/test-providers-final.txt`)
Pre-check[typecheck]: 7227385 bash D:/vc/scripts/vc-testlock.sh pnpm -r typecheck -> exit 0, all packages and apps (`qa/evidence/p1-u10/typecheck-final.txt`)
Metrics: start=2026-10-19T00:36+05:30 end=2026-10-19T02:05+05:30 builder_min=unavailable wall_min=unavailable agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=2 mutations=97 survivors_final=1 cycle=0 resumes=1 tokens=unavailable policy=proportional-verification/2026-10-17.14 lane=normal check_s=unavailable mutants=97 defects_unit=unavailable defects_6c=0
(suite_runs=0: no whole-repo suite; repeat_runs=2: the api set was run twice after the last test edit to rule out flakiness. start is the base merge commit time; the session was compacted once mid-build.)
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
- **Commit trailer:** the brief asked for `Claude Opus 5.5`; the harness attribution rule in force at commit time said `Claude Sonnet 5.5`, which is also the actual model, so the commit carries the Sonnet trailer.
- No `senior-software-engineer` review and no checker dispatched (brief: the maker dispatches two blind checkers and a review).

## How to verify (commands + expected)
- `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/apps/api exec tsx --test tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts tests/server.test.ts tests/student-openapi.test.ts tests/go-live-gate.test.ts` -> tests 115, pass 115, fail 0.
- `... pnpm -C <worktree>/packages/db exec tsx --test tests/chat-threads.test.ts tests/erasure.test.ts` -> tests 88, pass 88, fail 0.
- `... pnpm -C <worktree>/packages/providers exec tsx --test tests/live.test.ts` -> tests 70, pass 70, fail 0.
- `pnpm -C <worktree> -r typecheck` -> exit 0.
- Per-criterion: the Pre-check lines above (the name pattern selects that criterion's tests).

