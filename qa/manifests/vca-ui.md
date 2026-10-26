# Manifest - vca-ui
Policy-Version: proportional-verification/2026-10-19.17
**Contract:** VA19 in qa/contracts/vc-admin-control.md @1283b23 (Admin UI browser walk for the three roles). Spec S8 (calls S3). Feature intent#1, #2, #3, #7. Not an edit to qa/contracts.
**Date:** 2026-10-26T22:10:00+05:30
**Fix cycle:** 0
**Status:** built-unit
**Executor:** claude-sonnet-subagent (maker role, unit vca-ui of vc-admin-control)
**Base:** wave/vca-ui from 9cc4c73, worktree D:/vc/.worktrees/vca-ui. Code commit 274ff15 (code + tests + browser-walk evidence); this manifest is the next commit.
**Tier:** M (admin UI)
**Dual check:** not required (no auth code of its own: the session handlers only relay S3 login, hold a cookie and forward a Bearer header; the real S3 auth is unit vca-api).
**Persona walk:** the three admin roles were walked by the maker against a STUB admin API (smoke only). The real per-role walk is the checker's, after integration.
**Live browser:** run, see "Live browser evidence".

## Criterion owned (verbatim, qa/contracts/vc-admin-control.md @1283b23)
- **[VA19]. Admin UI browser walk for the three roles.** criticality H. Pages `login`, `dashboard`, `sites` (keys inside `sites/[id]`), `sources`, `admins`, `audit` exist under `apps/web/src/app/admin/**`. JWT in memory plus an httpOnly cookie set by the Next route handler `apps/web/src/app/api/admin-session/**`; never in `localStorage` / `sessionStorage` or a URL; cookie `HttpOnly`, `SameSite` set, `Secure` outside localhost. Walk per role against the dev server with a stub admin API (super-admin, admin, viewer paths as written); wrong password generic; expired / missing session redirects to login; dashboard fields; a secret field never re-displays; 360 px without horizontal scroll.

## What changed (new files only; no existing file edited)
All under apps/web. Line counts at 274ff15.
- src/app/admin/_lib/session-cookie.ts (53): cookie name `vc_admin_session`, `buildSessionCookie` (:29 `HttpOnly; SameSite=Strict`, `Secure` flag), `clearSessionCookie`, `isLocalHost` (exact loopback names), `cookieOptionsFor` (Secure unless plain http on loopback; honours x-forwarded-proto), token-shape check (a token that could split a header is refused).
- src/app/admin/_lib/session-handlers.ts (150): `handleSessionLogin` (:77, POST /admin/api/login, fixed error codes, never echoes upstream text), `handleSessionGet` (:107, re-validates the cookie with GET /admin/api/me, clears it on 401), `handleSessionDelete`, `handleProxy` (:124, same-origin pass-through to /admin/api/*; authorised by the Authorization header ONLY, so the cookie alone authorises nothing; segment allow-list, 64 KiB body cap, 5xx -> fixed 502).
- src/app/api/admin-session/route.ts (19) and src/app/api/admin-session/proxy/[...path]/route.ts (20): thin Next route handlers over the above.
- src/app/admin/_lib/client.ts (216): browser client for the S3 paths (`PROXY_BASE`), token only in the Authorization header, `AdminApiError` with fixed sentences (403 -> "You are not allowed to do that.", 401 -> `onUnauthorized`).
- src/app/admin/_lib/session.tsx (133): `SessionProvider`, token in a React ref, rehydrate from the cookie on load, login / logout. permissions.ts (22): role matrix mirror. gate.ts (6): server gate target. types.ts (97), format.ts (29, `COST_TARGET_INR = 50`), use-load.ts (59).
- src/app/admin/_components/*.tsx: LoginView, ConsoleNav, ConsoleShell, DashboardView, SitesView, SiteDetailView, SourcesView, AdminsView, AuditView, ui (error banner, key-reveal panel).
- src/app/admin/layout.tsx, page.tsx, login/page.tsx, (console)/layout.tsx (server gate: no cookie -> /admin/login), (console)/{dashboard,sites,sites/[id],sources,admins,audit}/page.tsx, admin.css (72, plain CSS, mobile first).
- tests/admin-session-routes.test.ts (222), admin-client.test.ts (167), admin-views.test.tsx (207): 34 tests, each named for the scenario that reaches it. tests/admin-stub-api.ts (201) and tests/admin-walk.ts (355): the stub S3 API and the Playwright walk (not matched by the `tests/admin-*.test.ts*` glob).
- qa/evidence/vc-admin-20261026/vca-ui/: step-log.md / .json and 34 screenshots.

## CORE-REQUEST (files I do not own; nothing was edited there)
- CORE-REQUEST: apps/api/src/admin-routes.ts "S3 lists only `GET|POST admins`; the UI's Set role calls `PATCH admins/:id` with `{role}` -> `{admin}`. Add it, or tell vca-ui to switch to a POST-upsert."
- CORE-REQUEST: apps/api/src/admin-routes.ts "S3 does not fix response bodies; the UI reads: login `{token, role, email}`; me `{email, role}`; `GET sites` `{sites: PartnerSummary[]}` (partners.ts shape: partnerId, name, keys{pub,srv}{prefix,rotatedAt}, allowedOrigins, status, createdAt); `POST sites` body `{name, origins, id?}` -> `{partner, keys:{pub,srv}}`; `PATCH sites/:id` `{name?, origins?}` -> `{partner}`; `POST sites/:id/keys/rotate` `{scope:'pub'|'srv'}` -> `{partner, key, scope}`; revoke / unrevoke -> `{partner}`; `GET sources` `{sources:[{id,siteId,kind,config,hasSecret,lastSync?}]}`; `POST sources` body = one S1 SourceConfig (no siteId) -> `{source}`; `PUT sources/:id/secret` `{secret}`; test -> `{ok, message}`; sync -> `{status, counts}`; `GET metrics?from&to&siteId` = S2 aggregateMetrics; `GET audit` `{entries:[{at,actorId,action,target,ok}]}`; `GET admins` `{admins:[{id,email,role,disabled,createdAt}]}`. Readers are lenient (a missing field becomes empty), so a shape change degrades to an empty page, not a crash."
- CORE-REQUEST: apps/api/src/admin-auth.ts "The Next proxy forwards the caller's address in `x-real-ip` (from its own x-real-ip / x-forwarded-for) so the 5/min/IP login limit sees the user, not the web server; the API should trust it only from the web host."
- CORE-REQUEST: .env.example "Add the NAME `VC_ADMIN_API_URL` (origin of the admin API, read by the Next route handlers; no default, unset gives 503 `admin_api_not_configured`)."
- CORE-REQUEST: apps/web/src/app/layout.tsx "The root layout renders the counsellor `LocaleSelector` on every page, including /admin (a stray 'Language' control above the nav), and its effect resets document.title. Skip it under /admin. Cosmetic; not needed for VA19."

## Tests / Pre-check
Environment: the worktree has no node_modules of its own; directory junctions to D:\vc\node_modules, apps/web/node_modules and packages/*/node_modules were created (git-ignored, no lockfile or package.json change).
- Tests[VA19]: 274ff15 `cd apps/web && bash ../../scripts/vc-testlock.sh pnpm exec tsx --test tests/admin-*.test.ts*` -> tests 34, pass 34, fail 0 t=4.1 (run 2026-10-26T22:05:41+05:30, after the last source edit).
- Pre-check[VA19]: 274ff15 `bash scripts/vc-testlock.sh pnpm -C apps/web typecheck` -> tsc --noEmit exit 0 t=9.3 (22:06:06).
- Pre-check[VA19]: 274ff15 `bash scripts/vc-testlock.sh pnpm -C apps/web build` -> "Compiled successfully", TypeScript finished, routes /admin, /admin/{admins,audit,dashboard,login,sites,sites/[id],sources}, /api/admin-session, /api/admin-session/proxy/[...path] listed, exit 0 t=47.5 (22:07:45).
- Not run (not mine): other apps/web tests, other packages, the full suite. No existing file was changed.

Scenarios the tests name: cookie flags on localhost and https; forged-host Secure rule; header-splitting token refused; wrong password generic + no cookie; 429 and upstream-down fixed codes; malformed login bodies never reach the upstream; upstream 200 without token/role refused; reload re-validates and returns the token; expired cookie cleared; logout; proxy forwards verb/body/query and passes a 403 through; proxy refuses cookie-only requests, traversal and odd segments, oversize bodies; client calls each S3 path with the right verb and bearer; token never in URL/body; 403 -> "not allowed" error (no redirect); 401 -> onUnauthorized; raw server text never shown; ids encoded; role matrix; server gate; source scan for localStorage / sessionStorage / indexedDB / document.cookie / `?token=`; per-role control presence; secret never re-displayed (hostile payload carrying secret fields); key shown once then absent; revoked site; dashboard fields incl. 50 INR over/under; empty and loading dashboard; escaped error alert; audit table; nav per role.

## Capability coverage (one falsification per criterion, in a throwaway copy outside the worktree)
Copy: C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/fe5889a6-130f-4952-9226-886a6cea9053/scratchpad/falsify (src/app/admin, src/app/api/admin-session, tests/admin-*.test.ts*, junctioned node_modules). Command: `node node_modules/tsx/dist/cli.mjs --test tests/admin-client.test.ts tests/admin-session-routes.test.ts tests/admin-views.test.tsx` under scripts/vc-testlock.sh.
- Green before: `ℹ tests 34 / ℹ pass 34 / ℹ fail 0` (2026-10-26T22:04:38+05:30).
- F1 drop `HttpOnly` from `buildSessionCookie` (session-cookie.ts:29): red after: `✖ VA19 cookie flags: login on localhost sets HttpOnly + SameSite=Strict + Path=/ + Max-Age, no Secure` and `✖ VA19 cookie builders: ...`, `ℹ pass 32 / ℹ fail 2`.
- F2 let a viewer write (`can()` returns `role === "viewer"` at its final return): red after: `✖ VA19 role matrix: viewer writes nothing, ...` and `✖ VA19 viewer: sites, sources, admins and detail show the lists but every write control is absent or disabled`, `ℹ pass 32 / ℹ fail 2`.
- F3 render a stored `secret` field in the sources card: red after: `✖ VA19 secrets never re-display: a stored secret shows only 'set' / 'not set', even if the payload carried one`, `ℹ pass 33 / ℹ fail 1`.
- Restored copy: `ℹ pass 34 / ℹ fail 0`. The worktree files were never mutated.

## Live browser evidence (stub API smoke; the real walk is the checker's, after integration)
- Setup: `VC_STUB_PORT=3119 pnpm exec tsx tests/admin-stub-api.ts` (accounts super@ / admin@ / viewer@vc.test, one stub password, in-memory), `VC_ADMIN_API_URL=http://127.0.0.1:3119 pnpm exec next dev --webpack --port 3118` (apps/web), then `VC_WALK_OUT=<dir> pnpm exec tsx tests/admin-walk.ts` (headless Chromium via Playwright). Both servers were stopped by PID afterwards.
- Result (2026-10-26T22:06:20+05:30, after the last source edit): `done: 34/34 passed; console errors 27`. Step log: qa/evidence/vc-admin-20261026/vca-ui/step-log.md and step-log.json; screenshots beside them.
- Walked: anonymous (no cookie -> /admin/login; wrong password and unknown email give the same sentence, no cookie); super-admin (login, cookie HttpOnly + SameSite=Strict, no Secure on localhost, localStorage / sessionStorage empty, no token in URL, cookie unreadable by script; dashboard tiles + per-site-per-day rows + 50 INR status; Admins create + set role, survives reload; Sources set secret -> "set", secret text absent from the DOM after save and reload; sign out); admin (no Admins link, /admin/admins denied; Sites add with origins, pub + srv key shown once and absent after reload; rotate with confirm, new key once; revoke -> no rotate, unrevoke; Sources add GitHub, Test, Sync, no secret setter; stale-role forced write -> 403 shown in the alert "You are not allowed to do that."); viewer (dashboard; sites, site detail, sources show lists with zero enabled write controls; forced POST through the proxy -> HTTP 403; after the API invalidates tokens the next click lands on /admin/login with the cookie cleared); 360 px: no horizontal scroll on login and on every console page for all three roles (scrollWidth 360 <= clientWidth 360).
- Console errors 27: 24 are the browser's own log of the expected 401 from the session probe (GET /api/admin-session with no or expired cookie), 2 are the expected 403s, 1 is a hydration notice whose only diff is Playwright's injected `caret-color: transparent` on an input during a screenshot (harness artifact, not app code).
- Limits: the API is a stub, so this proves the UI and the Next handlers, not S3. The Secure-cookie-on-https branch is proven by the unit test, not in the browser (no TLS in the walk).

## Assumptions and open points for the checker
- The viewer's "forced write" is shown two ways: a direct call through the proxy (403, status asserted) and the stale-role case through the UI (an admin whose role is downgraded server-side clicks Add site and sees the 403 as an error). A viewer has no write button at all, so there is nothing to click.
- Admin role change and every response shape above are my reading of S3 (see CORE-REQUEST); the stub implements the same reading, so a real-API mismatch will surface only in the post-integration walk.
- Gates G1 / G2 untouched: no live Pathlynks Postgres, no GitHub API call; the Sources page only talks to the stub.
- Senior-software-engineer review was not dispatched by this build unit (brief: no checker); the orchestrator's review stage still applies.

Metrics: files 37 new + 34 screenshots + 2 step logs, 0 existing files edited, ~3030 lines (src ~1,750, tests ~1,150), tests 34, typecheck 9.3 s, build 47.5 s, targeted tests 4.1 s, walk 34 steps, wall ~35 min of 45.
