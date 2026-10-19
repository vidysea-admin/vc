# Manifest - p1-u10w-voice-wiring
**Contract:** W1, W2, W3, W4, W5, W6, W7, W8, W9, W10 (unit-local ids, below). Parent contract rows: `qa/contracts/counselling-engine.md` B21 (student routes), A20 (go-live gate), A19 (one thread, text and voice), A12 (error events), A23 (limits); decisions D-097 item 1 (ws), the U10 manifest `qa/manifests/p1-u10-voice-ws.md` (CORE-REQUEST lines for `apps/api/src/index.ts`), and the U10 cycle-2 senior review `qa/evidence/p1-briefs/p1-u10-c2-review-result.md` (W1-W4). Plan row U10w, brief `qa/evidence/p1-briefs/p1-u10w-build.md`.
**Criteria:** W1 crisis writer deadline is not a fence, W2 late work awaited at shutdown, W3 no overlapping paid provider sessions, W4 escalation retry idempotent, W5 default off, W6 fail closed, W7 reachable in a started process, W8 shutdown order and usage, W9 one flag one escalation, W10 no real provider or network
**Goal task:** none
**Date:** 2026-10-19
mutant-cap-raise: 23 mutants, one or two per criterion across ten criteria and two files (voice.ts, index.ts); each is a one-edit run of a 15-test file (about 1 to 12 min, test-lock bound), cheaper than reading the diff for the crisis-safety and shutdown paths.
**Status:** ready-for-check
**Fix cycle:** 0
**Dual check:** required
dual-trigger: auth apps/api/src/index.ts:325 (`startApi` builds the student verifier for the voice session route with `createStudentJwtVerifier(studentJwtConfigFromEnv(env))` and passes the HS256 WebSocket secret (`wsSecret`, `index.ts:345`, default `VC_VOICE_WS_SECRET`) to `createVoiceApi`; the credential of the WebSocket upgrade is now configured here)
dual-trigger: config apps/api/src/index.ts:323 (`assertVoiceGoLive` on `VC_VOICE_ENABLED`: the A20 `voice` gate and the tracing-off check decide at startup whether voice exists at all)
**Persona walk:** skip (no human screen: WebSocket API wiring only)
**Issues addressed:** none (the four U10 cycle-2 review rows are addressed here as W1-W4: ISS ids are the orchestrator's to assign)
**Executor:** claude-sonnet-subagent (maker/builder p1-u10w-build)
**Executor rationale:** one coherent surface (`apps/api/src/index.ts` wiring plus four small `voice.ts` changes) sharing the U10 fake-DB and mock-provider test world.

## Criteria
- **W1 crisis writer deadline is not a fence (review MEDIUM, scope change item 1)** - a `FencedWriterDeadlineError` on the crisis flag write is retried like any failure, the crisis is still escalated once, the student is not ejected, and the log names the deadline (`voice_crisis_flag_deadline`), not `skipped_fenced`. Escalation is skipped ONLY on `StudentFencedError`. (`PROBE3` of the review is the first test.)
- **W2 late work is awaited at shutdown (review LOW, item 2)** - writes still running after `drainTimeoutMs` are tracked; `voice.close()` waits for them, bounded by `drainTimeoutMs` (`voice_shutdown_drain_timeout` when it expires), so a SIGTERM after the timeout does not lose an in-flight escalation.
- **W3 no overlapping paid provider sessions (review LOW, item 3)** - a start superseded while its provider connect is still in flight is closed before the next start opens its own provider session; if the connect never returns, the next start waits at most `connectOverlapWaitMs` (default 2 s) and logs `voice_connect_overlap`.
- **W4 the C17 retry cannot escalate twice (open question, item 4)** - the retry carries the same `sessionId` (thread id) and `turnId`; the real port `escalateTurns` writes each recipient record with `_id = sessionId:turnId:role:recipient` and `$setOnInsert` upsert, so a delivered-then-thrown first attempt followed by the retry leaves one record per recipient. A custom port must dedupe by that key (stated limit).
- **W5 default off (brief item 1)** - `VC_VOICE_ENABLED` unset or not exactly "true": no voice route, an upgrade is refused, and nothing voice-related is constructed. This is the default.
- **W6 fail closed (brief item 2, first half)** - Enabled: call `assertVoiceGoLive` at startup BEFORE listening. If it fails, startup fails with a clear error (fail closed).
- **W7 reachable (brief item 2, second half)** - Then `createVoiceApi` gets the same db, auth, providers and the `escalateForTenant` port as chat; register it with `withVoiceRoutes` and pass `onUpgrade: voice.upgrade` to the server.
- **W8 shutdown (brief item 3)** - Shutdown: close voice (finalize live sessions, drain within its timeout) before the db closes. Test: a live fake session is finalized and its usage is recorded on shutdown.
- **W9 one flag, one escalation (brief item 4)** - A voice crisis in a started process (fake provider) reaches the same escalateForTenant port as chat (one flag, one escalation).
- **W10 no real provider (brief item 5)** - No real provider, network or paid model call in any test (fake providers only; G-REAL is not granted).

## What changed
Code commit `4b299de` on branch `p1/u10w` (base `4371264` = `p1/u10` cycle 2, voice.ts `9067502`).
- `apps/api/src/index.ts` - `StartApiVoiceOptions` and `StartApiHttpOptions.voice`; `VOICE_WS_ENV` (`VC_VOICE_WS_SECRET`, `VC_VOICE_WS_BASE_URL`, used only when the options are absent); `startApi` reads the flag (`voiceEnabledFromEnv`), calls `assertVoiceGoLive` and checks the required Live provider and crisis message BEFORE connecting, builds `createVoiceApi` after `connectFromEnv` and before `client.connect()` (so a bad secret or base URL is a startup error with nothing connected), mounts `withVoiceRoutes(withChatRoutes(...), voice.handler)` and `onUpgrade: voice.upgrade`; `stop()` awaits `voice.close()` before the server and the db client close; the failure path closes voice too. One shared `sharedEscalateForTenant` (explicit chat port, else the engine's `escalateTurns` over the tenant's deps) is used by chat and, unless overridden, by voice. `export * from "./voice.js"` added. Chat behaviour is unchanged (same default expression, moved to one const).
- `apps/api/src/voice.ts` (scope change, only for the four items): `crisisWrite` skips only on `StudentFencedError` and logs a deadline as `<event>_deadline` (W1); `lateWork` set plus a bounded wait in `close()` (W2); `Conn.connecting/connectDone`, a `lingering` map and `settleLingering` in the supersede loop, new dep `connectOverlapWaitMs` and `VOICE_CONNECT_OVERLAP_WAIT_MS_DEFAULT` (W3). No existing test or assertion changed.
- `apps/api/tests/voice-wiring.test.ts` (NEW, 15 tests): W1 x3, W2 x2, W3 x2, W4, W5, W6, W7 x2, W8, W9 x2.
- Not touched: `server.ts`, `chat.ts`, `auth.ts`, `go-live-gate.ts`, `openapi.ts`, `packages/**`, `.claude/**`, `TASKS.md`, `qa/contracts/`. The `ws` dependency was already in `apps/api/package.json` and the lock (D-097 item 1); the install fetched only the approved `ws@8.22.0` tarball, which was missing from the offline store.
- **Design call (W3):** waiting in `finalize` itself for a hung connect would have held the socket and the student's slot for as long as the provider hangs (the existing C10 start-timer test requires them freed), so the wait is placed in the NEXT start's supersede loop and is bounded to 2 s; the first full run of the api suite showed exactly that regression (`test-api-full-first-run-C10-regression.txt`, 284/285) and the bound was added.
- **Design call (W2):** the shutdown wait reuses `drainTimeoutMs` (default 10 s) rather than a new constant.

## Verification scope
Policy-Version: proportional-verification/2026-10-18.15
Tier: L (auth: the WebSocket credential configuration and student JWT verifier are wired here; config: the A20 voice gate decides at startup whether voice exists; crisis safety and student PII paths in voice.ts)
Round: est 120 min - build, 23 falsifications (test-lock waits dominate), pre-checks and this manifest
Base / checked state: base 4371264, code 4b299de (worktree clean except `qa/evidence/p1-u10w/` and this manifest)
Affected tests / full-suite trigger: all of `apps/api/tests/*.test.ts` (286 tests, includes index/server/chat/anonymous/voice files) plus `pnpm -r typecheck`. No whole-repo suite: `packages/**` unchanged.
Tests[W1]: apps/api tests/voice-wiring.test.ts - flag write throws FencedWriterDeadlineError twice (PROBE3): 2 attempts, 1 escalation, `voice_crisis_flag_deadline`, no `skipped_fenced`, no `student_fenced` event, socket stays open, text-free; deadline once then success: 1 flag, 1 escalation, nothing logged; the escalation port throws the deadline once: retried and delivered, student not ejected. The existing C14 fenced-student test (StudentFencedError still skips and logs) is unchanged and green.
Tests[W2]: apps/api tests/voice-wiring.test.ts - a gated escalation outlives `drainTimeoutMs`; `close()` does not return until it is delivered; a never-settling one delays `close()` by at most the bound and logs `voice_shutdown_drain_timeout`.
Tests[W3]: apps/api tests/voice-wiring.test.ts - a gated first connect, a second start for the same student: the second connect is not entered until the first resolves and its session is closed (max one open or connecting provider session, 2 backends ever, 1 live at the end); a connect that never returns: the second start proceeds after `connectOverlapWaitMs` and logs `voice_connect_overlap`. The existing C10 hung-connect/start-timer test is unchanged and green.
Tests[W4]: apps/api tests/voice-wiring.test.ts - the real `escalateTurns` port wrapped so the first call delivers and then throws: 2 calls with the same sessionId and turnId, exactly 2 notification records (admin, counsellor), not 4.
Tests[W5]: apps/api tests/voice-wiring.test.ts - unset, empty and "false" with deliberately unusable voice options (bogus gates dir, 3-byte secret, bad URL): starts, the session route is not served (401/403/404), an upgrade is refused, no provider session.
Tests[W6]: apps/api tests/voice-wiring.test.ts - real repo gates (GoLiveRefusedError), tracing on, no Live provider, no crisis message, short secret, non-ws base URL, flag value "TRUE" (VoiceConfigError): each rejects, `connect` is never called, and nothing is listening on the port.
Tests[W7]: apps/api tests/voice-wiring.test.ts - over real HTTP and a real WebSocket: session mint 201, upgrade accepted, `start` reaches the provider, a bad token is refused before any provider connect; the secret and base URL default to `VC_VOICE_WS_SECRET` / `VC_VOICE_WS_BASE_URL`.
Tests[W8]: apps/api tests/voice-wiring.test.ts - a live session, `api.stop()`: the socket is closed 1001, the provider session closed, and the student's usage is already written when the db client's `close` runs.
Tests[W9]: apps/api tests/voice-wiring.test.ts - chat and voice enabled, an explicit chat port: a voice crisis reaches it once with tenant `tenant-a` and the thread id, one flag; chat off: the default `escalateTurns` writes the notification records for the thread.
Tests[W10]: structural, see the Pre-check line (no `GeminiLiveProvider`/connector/`createProvider` for Live in `index.ts`; the tests inject `MockLiveProvider` and `kbAnswerProvider()`; sockets are loopback only).
Pre-check[W1]: 4b299de bash D:/vc/scripts/vc-testlock.sh pnpm -C D:/vc/.worktrees/p1-u10w/apps/api exec tsx --test tests/*.test.ts -> green: 286 passed, 0 failed (`qa/evidence/p1-u10w/test-api-full-final.txt`; W1 tests are 3 of them)
Pre-check[W2]: 4b299de same run -> green (W2 x2)
Pre-check[W3]: 4b299de same run -> green (W3 x2; the C10 start-timer test green)
Pre-check[W4]: 4b299de same run -> green
Pre-check[W5]: 4b299de same run -> green
Pre-check[W6]: 4b299de same run -> green
Pre-check[W7]: 4b299de same run -> green (W7 x2)
Pre-check[W8]: 4b299de same run -> green
Pre-check[W9]: 4b299de same run -> green (W9 x2)
Pre-check[W10]: 4b299de git -C D:/vc/.worktrees/p1-u10w grep -n GeminiLiveProvider -- apps/api/src/index.ts apps/api/tests/voice-wiring.test.ts -> green: 0 matches for a Live provider; the only createProvider calls are the existing text-provider lines 262 and 268 (`qa/evidence/p1-u10w/grep-w10.txt`); tests inject MockLiveProvider
Pre-check[index-server-chat]: 4b299de VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C D:/vc/.worktrees/p1-u10w/apps/api exec tsx --test tests/*.test.ts -> green: 286 passed, 0 failed (index, server, chat, anonymous-route, voice*, student-openapi, go-live-gate files all inside)
Pre-check[typecheck]: 4b299de bash D:/vc/scripts/vc-testlock.sh pnpm -C D:/vc/.worktrees/p1-u10w -r typecheck -> exit 0, all packages and apps (`qa/evidence/p1-u10w/typecheck-final.txt`)
Red-before: the new tests against `4371264` `voice.ts` and the unchanged `index.ts` (tests written first, before any source edit) -> 14 tests, 2 pass (W4: the real port was already idempotent; W5: default off is trivially true while the voice options are ignored), 12 fail (`qa/evidence/p1-u10w/test-red-before.txt`; the file hung after the run because the un-wired startApi tests left servers listening and the maker stopped the process; since then W2/W3 timings were adjusted and the W7 env test added, the red evidence is for the earlier text of the same tests).
Metrics: start=2026-10-19T05:40:27+05:30 end=2026-10-19T06:07:22+05:30 builder_min=unavailable wall_min=unavailable agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=2 mutations=23 survivors_final=2 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-18.15 lane=normal check_s=unavailable mutants=23 defects_unit=1 defects_6c=0
(defects_unit=1: the first full api run found the C10 start-timer regression from an unbounded wait in the first W3 design; fixed before the commit. repeat_runs=2: the api suite ran twice after the first regression fix.)

## Capability coverage (each criterion -> falsifying edits on `4b299de` in the throwaway copy `D:/vc/.worktrees/p1-u10w-fals`; harness `qa/evidence/p1-u10w/falsify-harness.py`, logs `qa/evidence/p1-u10w/falsify/falsify-<id>.log`)
Column "after" is the run of `tests/voice-wiring.test.ts` (15 tests) with exactly one edit (W6a also edits two lines of one mutation: both env arguments); the unmutated file is 15/15.
| id | criterion | edit | pass/fail after | result |
|---|---|---|---|---|
| W1a | W1 | crisisWrite also skips (fences) on FencedWriterDeadlineError | 12/3 | killed |
| W1b | W1 | deadline logged as `_failed`, not `_deadline` | 14/1 | killed |
| W1c | W1 | crisis flag write attempted once (no retry) | 11/4 | killed |
| W2a | W2 | late drain promise not tracked in lateWork | 13/2 | killed |
| W2b | W2 | shutdown wait for late work effectively unbounded (1 h) | 14/0, 1 cancelled | killed (the bound test hit its 12 s test timeout and was cancelled) |
| W2c | W2 | `voice_shutdown_drain_timeout` not logged | 14/1 | killed |
| W3a | W3 | supersede loop never waits for a lingering connect | 13/2 | killed |
| W3b | W3 | `voice_connect_overlap` not logged | 14/1 | killed |
| W3c | W3 | finalize never registers the in-flight connect | 13/2 | killed |
| W3d | W3 | overlap wait unbounded (1 h) | 14/1 | killed |
| W4a | W4 | retry uses a fresh turnId | 14/1 | killed |
| W5a | W5 | voice enabled unless the flag is exactly "false" | 13/2 | killed |
| W6a | W6 | assertVoiceGoLive (both calls) sees an empty env | 14/1 | killed |
| W6b | W6 | no check for the Live provider / crisis message | 14/1 | killed |
| W6c | W6 | client.connect() before voice is built | 14/1 | killed |
| W6d | W6 | explicit assertVoiceGoLive line in startApi removed | 15/0 | SURVIVES, by design: `createVoiceApi` asserts the same gate (stated limit) |
| W7a | W7 | `onUpgrade` not passed to the server | 11/4 | killed |
| W7b | W7 | `withVoiceRoutes` handler not mounted | 10/5 | killed |
| W7c | W7 | env secret ignored | 14/1 | killed |
| W7d | W7 | env base URL ignored | 14/1 | killed |
| W8a | W8 | voice closed after the db client (order swapped) | 14/0, 1 cancelled | killed (the W8 test hit its 12 s test timeout and was cancelled) |
| W9a | W9 | voice gets the default port, not the shared chat port | 14/1 | killed |
| W9b | W9 | chat's own fallback port replaced by a no-op | 15/0 | SURVIVES: chat always receives its explicit port in this file; the chat-default path is covered by chat.test.ts, not by a voice test (stated limit) |

W10 is structural (no mutant): it is read off the Pre-check grep. Total 23 mutants, 21 killed, 2 survive (W6d, W9b). All mutants were applied only in the throwaway worktree; it is clean afterwards (`git status` empty).


## Live browser evidence
Not applicable, API only; the WebSocket is exercised by a node `ws` client against the real `startApi` server on a loopback port.

## Not done / stated limits (for the checker)
- **Survivors W6d and W9b** are stated in the table (redundant gate line; chat-default port not exercised by a voice test).
- **A20 stays closed in the repo.** With the real `qa/gates` a flag-on `startApi` refuses to start (W6 proves it); the open-gate tests use a temporary gates fixture with g-prod option c. Nothing here turns voice on.
- **Live provider and crisis audio are injected, not built.** `startApi` has no default Live provider (G-REAL is not granted); a deployment must pass `http.voice.live` and `http.voice.crisis`. There is no `VC_*` env path for them.
- **`wsBaseUrl` must be known before listening.** With `port: 0` the real port is only known after listen, so tests pre-pick a free port; a deployment sets the public `wss://` URL.
- **The explicit `assertVoiceGoLive` call in `startApi` is a redundant first line of defence**: `createVoiceApi` asserts the same gate before building (mutant W6d is expected to survive for that reason, see the table).
- **W4 is idempotent only for the engine port.** `escalateTurns` dedupes by `sessionId:turnId`; a custom `escalateForTenant` supplied by a deployment must do the same or accept a possible second delivery after a delivered-then-thrown attempt.
- **W3 overlap is bounded, not impossible.** A connect that hangs for longer than `connectOverlapWaitMs` (2 s) lets the next start connect while the old attempt is still pending; it is logged as `voice_connect_overlap` and the late session closes itself when its connect returns. The provider's own connect timeout is not set here.
- **W2 waits at most `drainTimeoutMs` more at shutdown.** Work still running after that is abandoned and logged.
- **Single process, in memory** (token memory, one-session-per-student, limiter) exactly as stated in the U10 manifest.
- No `senior-software-engineer` review and no checker dispatched by this build agent (the orchestrator owns both; the manifest is `Dual check: required`).
- **Commit trailer:** `Claude Sonnet 5.5`, per the harness attribution rule at commit time.

## How to verify (commands + expected)
- `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/apps/api exec tsx --test tests/*.test.ts` -> tests 286, pass 286, fail 0.
- `... pnpm -C <worktree>/apps/api exec tsx --test tests/voice-wiring.test.ts` -> tests 15, pass 15, fail 0.
- `... pnpm -C <worktree> -r typecheck` -> exit 0.
- Per-criterion: the Pre-check lines above; falsification: `python qa/evidence/p1-u10w/falsify-harness.py <id>` against a throwaway copy.
