# P1 U10 voice WebSocket API (slug p1-u10-voice-ws), tier L security/auth/tenancy, DUAL CHECK required
Follow D:/vc/qa/evidence/p1-briefs/p1-w3-common.md first (S = the scratchpad path defined there). Policy proportional-verification/2026-10-17.14. Mock only: MockLiveProvider, no network, no real audio, no paid call (G-REAL is closed).

**Start condition (do not build before it holds)**
- U8 AND U9 are both on main (U8 merges first, after its M1/M2 repair; U9 has cycle-2 repair PASS at f42740e and merges next). Base = main at that point: `git worktree add S/p1-u10 -b p1/u10 main`.
- Earliest-start fallback, only if the maker says so: `git worktree add S/p1-u10 -b p1/u10 p1/u8 && git -C S/p1-u10 merge --no-edit p1/u9` (checked 2026-10-18: `git merge-tree p1/u8 p1/u9` is conflict-free). Then U10 merges after both.
- Step 0: the `ws` dependency needs Umesh's approval (see HUMAN_GATE). Without an `Answered:` line for it in qa/gates/ (ask the maker), return `p1-u10-voice-ws blocked ws-dependency-not-approved`. Do not hand-roll an RFC 6455 server instead.

**Contract (verbatim, spec v8 sha e183ee9a)**
- **A9** Voice wiring on a Mock Live session: WS auth/expiry, event schema, interrupt, resume from `lastEventId`, silence timeout, text fallback on same thread, numeric `confirm`, audio format PCM16 16 kHz in / 24 kHz out. MOCK, `pnpm --filter @vc/api test`; `pnpm --filter @vc/providers test`.
- **A9b** Post-hoc audit fires: a Mock Live output transcript containing an uncited number, and another naming a listed speaker, each emit an audit event (stored with the thread) and the client receives a `flag` event; a clean transcript emits none. MOCK, NEW `tests/voice-audit.test.ts`.
- **A19** Voice in history: on a Mock Live session, a voice turn (final user transcript + assistant transcript, `channel:"voice"`) appears in `GET /v1/students/{id}/chat/threads/{threadId}` in order with text turns, survives reconnect, is included in export and removed by erasure. MOCK, NEW `tests/voice-history.test.ts`; `pnpm --filter @vc/db test`. D-093 6A changes "verbatim" to REDACTED persistence: names, phones and emails are redacted before storage; D-093 4A: a minor without the guardian-consent claim persists nothing personal (text-free marker only), exactly like text.
- **A23 (voice part)** a student at 60 voice minutes in the month cannot start a voice session (text continues); a voice session ends at 20 minutes; limits overridable per tenant and an override affects only that tenant. MOCK, NEW `tests/voice-limits.test.ts` (the text 30-rpm part is U8's).
- **A12 (voice part)** voice error event on Live failure (incl. `LiveConfigError`, U9). 
- **A20** the voice flag is refused without the go-live gate and a passing A10 record (apps/api/src/go-live-gate.ts, target `voice`). Ships DISABLED behind a default-off flag; you build and mock-test, you never enable.
- Gate answers binding you: D-088 Q5 (20-min cap, 60 min/month, PCM16 16k in / 24k out, <= 2 s audio after a crisis trigger); D-096 item 3 (after a crisis the model stays muted until the student speaks again; only helpline audio plays; a tool call or end-of-turn never lifts the mute; U10 forwards exactly what LiveSession emits and synthesises no model audio); D-086 Q4 (voice transcripts persist into the same thread; audio itself is not stored); D-093 11 and P-1 (config-driven student JWT; a short-lived VC-minted WebSocket token, aud-checked); D-090 (Tavily removed).

**Criteria to split into the manifest (C1..C9)**
- C1 `POST /v1/students/{studentId}/voice/sessions` returns `{token, wsUrl}` matching `VoiceSessionResponseSchema`; student JWT only (counsellor/admin 403, no token 401, other student 404, two tenants).
- C2 WS auth: missing, wrong-audience, expired, replayed (single use) or other-student token is refused before any provider connect; no token in logs.
- C3 events validate against `VoiceServerEventSchema`/`VoiceClientEventSchema`; interrupt, `end`, numeric `confirm` (facts go through the U8 profile-fact path, confirmed only after the student confirms).
- C4 resume from `lastEventId` replays only that session's missed events; silence timeout (ASSUMPTION 60 s, configurable, record it); 20-minute cap; text fallback on the same thread.
- C5 A9b audit events + `flag` frames, stored with the thread.
- C6 A19 history, redaction, minor rule, export, erasure.
- C7 A23 voice quota and per-tenant override; minutes recorded via the U8 usage counters (`recordStudentUsage`).
- C8 A12 error event; A20 flag refusal; default-off flag.
- C9 tenancy and cleanup: one tenant's session can never emit or read another's; a closed socket releases the provider session, timers and quota reservation (no leak under 50 connect/abort cycles).

**Files you OWN (create/edit)**
1. apps/api/src/voice.ts (new): session route handler, WS token mint/verify (jose is already a dependency; keep auth.ts untouched), the WS server, event relay, audit and persistence glue.
2. apps/api/src/server.ts: the minimal mount only (an `upgrade` hook plus the session route registration); no other change. (U8 owns this file; it is merged by the start condition.)
3. apps/api/src/openapi.ts: only if the A5 route/schema check demands it for the voice routes.
4. apps/api/package.json and pnpm-lock.yaml: `ws` (exact version, no range) and `@types/ws` as devDependency, ONLY after the gate answer.
5. packages/db/src/chat-threads.ts + packages/db/tests/chat-threads.test.ts: additive only (a function to append a final voice turn pair with `channel:"voice"`, reusing `fencedStudentWrite`, redaction and the minor rule).
6. apps/api/tests/voice.test.ts, voice-audit.test.ts, voice-history.test.ts, voice-limits.test.ts (all new); tests may use packages/db/tests/fakes.ts.
7. qa/manifests/p1-u10-voice-ws.md, qa/evidence/p1-u10/**.
Manifest MUST carry `Dual check: required` and `dual-trigger: auth apps/api/src/voice.ts:<line of the WS token verify>` (and a second `dual-trigger: tenancy` line for the session/thread binding).

**Must NOT touch**: apps/api/src/chat.ts (U8 repair M1 at 401-413, M2 at 390-393 and 412-428, plus the U6b rank hook), apps/api/src/anonymous.ts (U7), apps/api/src/auth.ts, apps/api/src/go-live-gate.ts, packages/providers/** (U9; any need there is a CORE-REQUEST line), packages/engine/** (U6b/U11 own parallel work there), packages/schemas/** (voice schemas already exist; a change is a CORE-REQUEST).
File overlap with U6b and U11: none (they stay in packages/engine and the engine package.json).

**Tests (TDD, falsification: one per criterion plus one per security property, i.e. C2 each refusal reason and C9 tenancy, in throwaway copies)**
- `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C S/p1-u10/apps/api exec tsx --test tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts tests/server.test.ts tests/student-openapi.test.ts tests/go-live-gate.test.ts`
- `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C S/p1-u10/packages/db exec tsx --test tests/chat-threads.test.ts tests/erasure.test.ts`
- `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C S/p1-u10/packages/providers exec tsx --test tests/live.test.ts`
- `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C S/p1-u10 -r typecheck`. No whole-repo suite.

**HUMAN_GATE (list only)**
- Q-U10-1 (BLOCKING): approve adding the `ws` package (MIT, server-side WebSocket; Node core has no server WebSocket) to apps/api, pinned to one exact version, plus `@types/ws` in devDependencies. Alternative: a hand-rolled upgrade handler on node:http (more code, more risk). Spec scope item 1 and plan U10 both say a new dependency needs approval.
- Q-U10-2 (non-blocking, default taken): the silence-timeout value is not in D-088; use 60 s configurable per tenant and record [ASSUMPTION].
- Reminder, not a question: P-1 (token claims) is a draft until Pathlynks confirms; build the WS token and student JWT config-driven as U8 did.

**Finish**
- Manifest per p1-w3-common.md (Pre-check per C1..C9, Capability coverage table, Live browser = "not applicable, API only; WS exercised by a node test client", Metrics, `Round: est <n> min`, CORE-REQUEST lines). Lint with `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --lint-manifest qa/manifests/p1-u10-voice-ws.md` exit 0. Narrow-pathspec commit. No push/merge/checker (two blind checkers + a review are dispatched by the maker). ONE-line return: `p1-u10-voice-ws <sha> ready` or `... blocked <reason>`.
