# You are a /maker build subagent: U10w, wire the U10 voice WebSocket into apps/api/src/index.ts (CORE-REQUEST)
- Protocol C:/Users/Lenovo/.claude/skills/maker/SKILL.md, policy proportional-verification/2026-10-18.15. Use `git -C <dir>`, never `cd X && cmd`. Never `git add -A`. Never touch .claude/**. Do NOT push. Tests ONLY via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh ...` (long waits on the shared lock are normal; never quit on a busy lock).
- C: is nearly full, so the worktree goes on D: only: `git -C D:/vc worktree add D:/vc/.worktrees/p1-u10w -b p1/u10w p1/u10` (p1/u10 = 4371264, U10 cycle 2, under dual check right now; do NOT edit apps/api/src/voice.ts. If you find a voice.ts defect, record it in the manifest as a finding and stop short of fixing it). Then run `pnpm install --offline --frozen-lockfile` there.
- Read first: ARCHITECTURE.md, qa/manifests/p1-u10-voice-ws.md, qa/gates/p1-u10-ws.md, apps/api/src/index.ts (startApi), apps/api/src/server.ts (onUpgrade), and how chat.ts gets its escalateForTenant port.

## Goal
Voice is reachable in a real startApi process only when it is enabled and allowed, and a voice crisis escalates the same way chat does.
1. `VC_VOICE_ENABLED` unset or not exactly "true": no voice route, an upgrade is refused, and nothing voice-related is constructed. This is the default.
2. Enabled: call `assertVoiceGoLive` at startup BEFORE listening. If it fails, startup fails with a clear error (fail closed). Then `createVoiceApi` gets the same db, auth, providers and the `escalateForTenant` port as chat; register it with `withVoiceRoutes` and pass `onUpgrade: voice.upgrade` to the server.
3. Shutdown: close voice (finalize live sessions, drain within its timeout) before the db closes. Test: a live fake session is finalized and its usage is recorded on shutdown.
4. A voice crisis in a started process (fake provider) reaches the same escalateForTenant port as chat (one flag, one escalation).
5. No real provider, network or paid model call in any test (fake providers only; G-REAL is not granted).
- TDD: write a failing test first for each item. Do not weaken or delete any existing assertion.

## Manifest + pre-check
- Create qa/manifests/p1-u10w-voice-wiring.md (copy the layout of qa/manifests/p1-u10-voice-ws.md). Pin `Policy-Version: proportional-verification/2026-10-18.15`, one criterion per item verbatim, tier from the triggers. If the change touches auth or config, add `dual-trigger: auth <path.ext:line>` and `Dual check: required`. Add Tests[<id>] lines.
- Pre-check[<id>] lines on the final sha: the index/server tests, the voice test files, chat.test.ts, and `pnpm -r typecheck`. Record one falsification per criterion, on a scratch copy UNDER D:/vc/.worktrees/.
- Set `Status: ready-for-check` and run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --lint-manifest <manifest>`; fix every ERROR. Commit with narrow pathspecs ON THE BRANCH p1/u10w (check `git -C <wt> branch --show-current` before committing; never commit on a detached HEAD).
- Return ONE line: `p1-u10w-voice-wiring <sha> ready (tier X, dual yes|no)` or `BLOCKED <reason>`.
