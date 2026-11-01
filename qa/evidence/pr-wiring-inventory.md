# PR wiring inventory (Brief D, the "PR yes" gate)

Taken 2026-11-01T15:52+05:30 from `git status`, `git diff`, `git log`, `git rev-list` run read-only in each sibling worktree under `D:/vc/.worktrees/` (VC worktree HEAD `2fd5e40a`). Nothing was committed, pushed, started or run in the sibling repos. Test counts are `grep` counts of added `test(` / `def test_vc` lines, not test runs. No secret value or student text is reproduced here.

## Totals

| Item | Count |
|---|---|
| Wiring worktrees | 4 (2 Vidysea, 2 Pathlynks Quest) |
| Uncommitted files (git status) | 21 (5 + 5 + 4 + 7) |
| Files with a content diff | 20 (quest frontend `tsconfig.json` is EOL-only) |
| Lines added / removed | 2565 / 67 |
| Unpushed commits | 0 in all four |
| Untracked files | 0 in all four |
| Worktrees safe to PR as-is | 0 |
| Worktrees safe after a strip | 4 |
| Blockers | 7 (listed at the end) |

Other worktrees that look related (`vca-pathlynks`, `pc-widget`, `vca-widget`) are VC-repo wave branches, not host wiring. They are out of scope.

## 1. vc-vidysea-backend

- Path `D:/vc/.worktrees/vc-vidysea-backend`, remote `vidysea-admin/vidysea-main-service-backend`.
- Branch `codex/vc-integration` (no upstream), HEAD `5c377ea`. Base is local `prod`, tracking `origin/prod`: 0 commits ahead and 0 behind either, so the whole wiring is uncommitted.
- Uncommitted: 5 files modified, +565 / -14. Unpushed commits: 0.

| File group | Purpose |
|---|---|
| `app/api/v1/student/ai_counsellor_router.py` (+227) | New `vc_student_proxy` route `/vc/{resource}` (GET and POST allow-list). It checks the student session and a signed `vc_eligibility` claim, then forwards to central VC with the server key. Legacy chat returns 409 `central_session_required` when the flag is on. |
| `app/core/security.py` (+20) | DEMO ONLY: `create_token` mints a `vc_eligibility` claim (age placeholder, `guardianConsent` true) when `VC_DEMO_ELIGIBILITY=1`. |
| `app/main.py` (+41/-14), `app/deps.py` (+1/-1) | DEMO ONLY: `VC_DEMO_NO_PROD_WRITES=1` disables 11 startup background loops, the startup migration listing and the template seed, and the login-streak wallet credit. |
| `tests/test_student_fixes.py` (+289) | 14 new `test_vc_*` functions. They exec the router source with the app imports stripped and mock httpx, so no DB or network. |

- Tests: yes, 14 new (some parametrized). Command, not run: `.venv/Scripts/python -m pytest tests/test_student_fixes.py -k "vc_" -q` from the worktree root. The fixtures are offline mocks.
- The demo flags in `security.py`, `deps.py`, `main.py` and the router's `VC_DEMO_ELIGIBILITY` block (router lines 151-163) have no test coverage. The 14 tests exercise the production path only.
- Secret-looking strings in added lines: none. `.env` exists and is git-ignored, not in the diff.
- Env var names, production: `VC_STUDENT_CENTRAL_ENABLED`, `VC_PARTNER_SERVER_KEY`, `VC_BASE_URL`. Demo only: `VC_DEMO_ELIGIBILITY`, `VC_DEMO_ELIGIBILITY_AGE`, `VC_DEMO_NO_PROD_WRITES`. Existing switches referenced by the demo gate: `B2C_REPORTS_INPROCESS_WORKER`, `SCHOOL_PAYMENT_EMAIL_WORKER`, `NOTIFICATION_INPROCESS_CRON`, `JOURNEY_WAIVER_RESTORE_INPROCESS`, `WEBHOOK_DISPATCH_INPROCESS`, `SLA_SWEEP_INPROCESS`, `DP_DAILY_DIGEST_INPROCESS`.
- Safe to PR: NO. Strip first:
  - All of the `security.py` hunk (it mints a consent-true eligibility claim from an env flag).
  - The `deps.py` hunk.
  - Every `_DEMO_NO_PROD_WRITES` hunk in `main.py`.
  - The `VC_DEMO_ELIGIBILITY` block in the router (lines 151-163).
  - After the strip, the router file plus its tests are the PR.
- Production gap: with the demo claim stripped, the proxy needs a team-provisioned `vc_eligibility` claim minted by the real gateway. The proxy's own comment says the gateway "never mints" it in production. The PR is inert (404 with the flag off) until that exists.

PR draft:
- Title: `feat(student): central Virtual Counsellor proxy behind VC_STUDENT_CENTRAL_ENABLED`
- Bullets:
  - Adds `GET|POST /api/v1/student/ai-counsellor/vc/{resource}` with a strict allow-list: profile, threads, runtime, turns, voice session, fact decision.
  - Requires an authenticated active student plus a signed `vc_eligibility` claim (student, tenant, purpose, expiry, age, guardian consent for minors). Browser-supplied identity, age, consent and history are dropped.
  - Forwards with a server-held partner key to `VC_BASE_URL` (https, or loopback http). No redirects, a 256 KiB response cap, and sanitized 403/404/409/429/503 errors.
  - The legacy `/chat` returns 409 `central_session_required` for students when the flag is on. With the flag off, existing behaviour is unchanged and `/vc` returns 404.
  - Adds 14 offline tests: owner binding, the eligibility matrix, error mapping, size and redirect fail-closed, voice mint binding, and flag-off parity.

## 2. vc-vidysea-frontend

- Path `D:/vc/.worktrees/vc-vidysea-frontend`, remote `vidysea-admin/vidysea-user-frontend`.
- Branch `codex/vc-integration` (no upstream), HEAD `bac1ae6f`. Base is local `prod`, tracking `origin/prod`: 0 ahead.
- Uncommitted: 5 files modified, +125 / -6. Unpushed commits: 0.

| File group | Purpose |
|---|---|
| `src/components/student/ChatWidget.tsx` (+102, replaces a one-line stub) | Thin host mount: calls `/student/ai-counsellor/vc/runtime`, loads the widget SDK from the configured URL (https or loopback), and sends all traffic through `apiCall` with session fences. Voice is attached lazily. |
| `src/app/student/(main)/ai-counsellor/page.tsx` (+2/-1) | Renders `ChatWidget` when `NEXT_PUBLIC_VC_STUDENT_CENTRAL_ENABLED === "true"`, else the existing `VideoCounsellor`. |
| `next.config.mjs` (+22) | CSP `script-src` adds the widget origin. `/student/:path*` gets a Permissions-Policy that allows the microphone. DEMO ONLY: `VC_DEMO_LOCAL=1` proxyTimeout, localhost `connect-src`, drops `upgrade-insecure-requests`, and rewrites `/api/v1` to `localhost:8000`. |
| `Dockerfile`, `buildspec.yml` (+2 each) | Pass the build arg `NEXT_PUBLIC_VC_WIDGET_SCRIPT_URL` through. |

- Tests: none cover the new component. No `ChatWidget` or `ai-counsellor/vc` test exists in `tests/` or `src/`. Available checks, not run: `npm run lint` and `npm run build` (`next build --webpack`).
- Secret-looking strings: none. `.env.local` is git-ignored.
- Env var names: `NEXT_PUBLIC_VC_WIDGET_SCRIPT_URL`, `NEXT_PUBLIC_VC_STUDENT_CENTRAL_ENABLED`. Demo only: `VC_DEMO_LOCAL`.
- Note: `NEXT_PUBLIC_VC_STUDENT_CENTRAL_ENABLED` is read in `page.tsx`. It is not in the `Dockerfile` or `buildspec.yml` build args (only the script URL is), so a hosted build cannot turn the flag on without a further change. This is a wiring gap, not a leak.
- Safe to PR: NO. Strip the three `VC_DEMO_LOCAL` hunks in `next.config.mjs` (proxyTimeout, the `connect-src` localhost list plus the `upgrade-insecure-requests` toggle, and the rewrite destination ternary). Restore the plain `https://devapinew.vidysea.com/api/v1/:path*` destination. Keep the widget-origin CSP and Permissions-Policy hunks.

PR draft:
- Title: `feat(student): mount central Virtual Counsellor widget on /student/ai-counsellor`
- Bullets:
  - Replaces the empty `ChatWidget` stub with a thin host mount that discovers `runtime` through the authenticated proxy and loads the widget SDK.
  - All widget traffic goes through `apiCall`, so token refresh and session-change fences stay in the host. A session change tears the widget down.
  - `ai-counsellor/page.tsx` shows the widget only when `NEXT_PUBLIC_VC_STUDENT_CENTRAL_ENABLED=true`; otherwise it keeps `VideoCounsellor`.
  - CSP allows the configured widget origin, and `/student/*` allows the microphone for voice. Other routes keep the deny policy.
  - Dockerfile and buildspec pass `NEXT_PUBLIC_VC_WIDGET_SCRIPT_URL` as a build arg.

## 3. quest-pathlynks-backend

- Path `D:/vc/.worktrees/quest-pathlynks-backend`, remote `Himanshu-Vidysea/vidyaksh-backend`.
- Branch `production_school_mgt_service`, HEAD `61429a0`, equal to `origin/production_school_mgt_service` (0 ahead, 0 behind).
- Uncommitted: 4 files modified, +857 / -3. Unpushed commits: 0.

| File group | Purpose |
|---|---|
| `controllers/pathlynks_quest_controller.js` (+342/-3) | Quest AI chat, session, threads, profile, fact decision and voice-session handlers, which call central VC with a server key. They are gated by `VC_QUEST_ENABLED` and validate role, island and ids. Parent consent and `canAccessStudent` are used for headers. |
| `routes/pathlynks_quest_router.js` (+5) | New routes: `/ai/threads` (GET, POST), `/ai/profile`, `/ai/profile/facts/:factId/decision`, `/ai/voice/session`, all behind `verifyToken`. |
| `services/navIntent.js` (+2) | `careerSelection` and `careerCompare` intents (English, Hindi, Hinglish). |
| `tests/parent-journey-regression.test.js` (+511) | 26 new `test(` blocks. |

- Tests: yes, 26 new. Command, not run: `node --test tests/parent-journey-regression.test.js`. Caution: `tests/helpers/isolatedPostgres.js` spawns a throwaway local Postgres cluster and writes under `D:/vc/outputs/paperflow-review-20261021/`. It never reads the app `.env`, but it does start a process and write files, so it was not run per the brief.
- Secret-looking strings: none. One regex false positive at `tests/parent-journey-regression.test.js:77` (a URL regex). `.env` is git-ignored.
- Env var names: `VC_QUEST_ENABLED`, `VC_PARTNER_SERVER_KEY`, `VC_BASE_URL`. Demo only: `VC_DEMO_ELIGIBILITY`. Hard-coded allow-lists: `VC_QUEST_ROLES`, `VC_QUEST_ISLANDS` (not env).
- Safe to PR: NO. Strip the `VC_DEMO_ELIGIBILITY === '1'` block in `vcQuestHeaders` (controller lines 1104-1108). It forces age 18 and guardian consent true.
- Note: `pathlynks_ai_sessions` is read and written in the Quest DB (`getQuestDB()`), so this PR does write Pathlynks data once enabled. That is expected for a host, but it needs a human review.

PR draft:
- Title: `feat(quest): route Quest AI chat, threads, memory and voice through central VC`
- Bullets:
  - With `VC_QUEST_ENABLED=true`, `/ai/chat`, `/ai/session` and the new `/ai/threads`, `/ai/profile`, `/ai/profile/facts/:id/decision` and `/ai/voice/session` call central VC with the server partner key.
  - Student age and guardian consent come from DOB and `getParentConsentStatus`, never from browser context. Role, island and every id are allow-list or regex validated.
  - The upstream is called with `redirect: 'error'` and a 120 s timeout. Only 403/404/409 (and `memory_changed` with `retryWithNewTurn`) are surfaced, and everything else becomes "VC unavailable".
  - Adds `careerSelection` and `careerCompare` nav intents in English, Hindi and Hinglish.
  - Adds 26 regression tests for the parent journey, access and consent, thread ownership and the nav intents.

## 4. quest-pathlynks-frontend

- Path `D:/vc/.worktrees/quest-pathlynks-frontend`, remote `Himanshu-Vidysea/vidyaksh-frontend`.
- Branch `production_frontend`, HEAD `1b47de3`, equal to `origin/production_frontend` (0 ahead, 0 behind).
- Uncommitted: 7 files modified (6 with a content diff), +1018 / -44. Unpushed commits: 0.

| File group | Purpose |
|---|---|
| `src/components/career-quest/AIChatWidget.jsx` (+518 net) | Quest chat rebuilt around threads, a memory panel, voice, and loading the central widget assets (origin from `NEXT_PUBLIC_VC_WIDGET_BASE_URL`, https or loopback, no credentials, query or hash). |
| `src/services/pathlynksQuestService.js` (+10/-2) | New API calls: `aiVoiceSession`, `listAIThreads`, `createAIThread`, `getAIMemory`, `decideAIMemory`. `aiChat` now sends `clientTurnId`, `threadId` and `memoryConfirmation` and no longer sends `studentContext`. |
| `src/components/career-quest/navRegistry.js` (+1) | Adds the `careerCompare` route. |
| `Dockerfile`, `.github/workflows/prod_deploy.yml` | Build arg `NEXT_PUBLIC_VC_WIDGET_BASE_URL`, from the repo variable of the same name. The workflow's `docker build` line now passes it. |
| `scripts/student-contract-browser.test.cjs` (+524) | 31 new `test(` blocks, driven by headless Chromium. |
| `tsconfig.json` | No content change (EOL-only). Unrelated. |

- Tests: yes, 31 new. Command, not run: `node --test scripts/student-contract-browser.test.cjs`. It needs the `playwright` package and local Chrome (`CHROME_PATH`, default `C:/Program Files/Google/Chrome/Application/chrome.exe`). It bundles the JSX in memory, with no app server and no DB. It was not run per the brief. `package.json` has no `test` script. `npm run lint` is `next lint`.
- Secret-looking strings: none in added lines. Pre-existing: `.env` is tracked in this repo at HEAD (last touched at `1b47de3abc`). It is not in the diff and I did not open it. Worth Umesh's separate attention.
- Env var names: `NEXT_PUBLIC_VC_WIDGET_BASE_URL` (a repo Actions variable, not a secret). The test uses `CHROME_PATH`.
- Safe to PR: NO as is. Revert `tsconfig.json` and the CRLF-only `Dockerfile` `CMD` line change so the PR holds only intended files. Also confirm the repo variable `NEXT_PUBLIC_VC_WIDGET_BASE_URL` exists, or the build arg is empty and the widget stays unavailable.

PR draft:
- Title: `feat(career-quest): central Virtual Counsellor chat, memory and voice in the Quest widget`
- Bullets:
  - Reworks `AIChatWidget` for server-owned threads: a thread list, a create-thread call, history by `threadId`, and `clientTurnId` on every turn.
  - Adds a memory panel with confirm, correct and reject decisions (`decideAIMemory`) using server-issued candidate and version ids.
  - Adds voice session minting and loads the central widget and voice assets from `NEXT_PUBLIC_VC_WIDGET_BASE_URL`, with origin validation.
  - Stops sending browser-side `studentContext`. Identity, consent and thread ownership are resolved by the host backend.
  - Adds the Career Compare nav entry, the `NEXT_PUBLIC_VC_WIDGET_BASE_URL` build arg in `Dockerfile` and `prod_deploy.yml`, and 31 Chromium-driven contract tests.

## Blockers (count 7)

1. vc-vidysea-backend: `security.py` demo minting of a consent-true `vc_eligibility` claim must be removed before any PR.
2. vc-vidysea-backend: the `VC_DEMO_ELIGIBILITY` block in the router (lines 151-163), the `deps.py` hunk and the `main.py` `_DEMO_NO_PROD_WRITES` hunks must be removed.
3. vc-vidysea-backend: production has no minter for `vc_eligibility`, so with the demo code removed the proxy returns 403 `eligibility_required` for every student. This needs a gateway change or a decision.
4. vc-vidysea-frontend: the three `VC_DEMO_LOCAL` hunks in `next.config.mjs` must be removed.
5. vc-vidysea-frontend: `NEXT_PUBLIC_VC_STUDENT_CENTRAL_ENABLED` is not passed as a build arg, so the hosted flag cannot be enabled. Add it to the `Dockerfile` and `buildspec.yml`, or confirm another path.
6. quest-pathlynks-backend: the `VC_DEMO_ELIGIBILITY` block in `vcQuestHeaders` (lines 1104-1108) must be removed.
7. quest-pathlynks-frontend: revert the EOL-only `tsconfig.json` and `Dockerfile` `CMD` changes. Separately, `.env` is tracked at HEAD (pre-existing, outside this wiring).

No PR has been opened or prepared in any repo.
