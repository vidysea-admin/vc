# vca-fix1-api: fix cycle 1, owner group API (maker evidence)
Written 2026-10-27T00:35:40+05:30. Worktree D:/vc/.worktrees/vca-int, branch wave/vc-admin-control, base a575a46. Policy proportional-verification/2026-10-19.17, Tier L.

## Items and where fixed
- R1 (VA1/VA5/VA8): packages/schemas/src/sources.ts (CREDENTIAL_REF_PATTERN = ^(PATHLYNKS|GITHUB)_[A-Z0-9_]+$ on tokenRef/passwordRef); apps/api/src/admin-routes.ts credentialFor re-checks it before reading env and throws CredentialRefError (fixed message, no env read, port never built); createLivePathlynksPort also ignores a non-allow-listed passwordRef.
- R2 (VA12): createLivePathlynksPort uses store.sources.get(PATHLYNKS_POSTGRES_SOURCE_ID = "pathlynks-db", the id in config/sources.json), never first postgres by list order. opts.sourceId is an optional override.
- R3 (VA17/VA19): apps/web/src/app/admin/_lib/format.ts metricsWindow() sends the day after the inclusive To date as the API's exclusive end; apps/web/src/app/admin/(console)/dashboard/page.tsx (one line, not in the brief's file list, needed so the helper has a caller) calls it. The picker still shows today as To.
- R4: apps/api/src/admin-routes.ts: sites.create and sites.rotate results carry oneTimeKey; if the audit write fails after the mutation the response is returned with auditRecorded:false (log admin_audit_failed already emitted). Any other write still answers 500 audit_unavailable.
- R5: apps/api/src/admin-routes.ts login(): 429-limited and malformed/oversize anonymous attempts write no row; a failed well-formed login writes at most one row per client+e-mail per 60 s window (map capped at LOGIN_MAX_AUDIT_KEYS=10000, full table writes nothing). Header comment fixed. Success is always audited. apps/api/src/admin-auth.ts exports LOGIN_MAX_AUDIT_KEYS.
- R6: apps/api/src/admin-routes.ts syncGithubSource: schema sync with files=0, tables=0, or diagnostics>=files, and frontend sync with routes=0, put NO artifact and record status "error" with counts and a reason message; fetchRepoFiles onSkip -> counts.skipped; up to 20 diagnostics (token and secret-looking words scrubbed, length-capped) are stored in the schema_map artifact (data.diagnostics) on success and returned in the response also on the error path (lastSync only holds numeric counts, so they are not stored on an error). Status vocabulary is ok/error/held, so "error" is used.
- R9: apps/web/src/app/admin/_lib/session-handlers.ts: clientAddress uses only x-real-ip (no X-Forwarded-For fallback; a Next Route Handler has no socket address, so with no x-real-ip nothing is forwarded); createLoginGuard (5 per 60 s per e-mail, in memory) wired through SessionDeps.loginGuard, shared instance in defaultDeps(), checked before the upstream call. The per-client limit stays in the API.

## Failing test first (red on the pre-fix tree)
Scratchpad logs: red1.txt (R1 x2, R2: 3 fail), red2-api.txt (R4 x2, R5 x2, R6 x6, R2: 11 fail / 98 pass), red2-web.txt (R3 x2, R9 x2: 4 fail / 22 pass). Each run was on the unchanged src for that item with only the new tests added (a stub export where the test imports a new symbol).

## Green on the fixed tree (all via bash D:/vc/scripts/vc-testlock.sh pnpm exec tsx --test, from the package dir)
- apps/api: tests/admin-auth.test.ts tests/admin-routes.test.ts tests/admin-secrets-leak.test.ts tests/admin-sync.test.ts tests/chat-pathlynks.test.ts tests/chat-usage.test.ts -> 127 pass / 1 fail on the first run (the R2 test I wrote asserted on the wrong SELECT; fixed the test) then tests/admin-sync.test.ts alone -> 21 pass / 0 fail. Existing tests changed because they encoded the old behaviour: admin-routes.test.ts seeded() fake repo now holds a real createTable migration (an empty file is now correctly "error"), and the VA6 audit-failure test uses PATCH sites (a key-carrying POST now survives an audit failure by design).
- apps/web: tests/admin-client.test.ts tests/admin-session-routes.test.ts tests/admin-views.test.tsx -> 38 pass / 0 fail.
- packages/schemas: tests/sources.test.ts -> 14 pass / 0 fail.
- pnpm exec tsc --noEmit in apps/api, packages/db, packages/schemas, apps/web -> exit 0 each.
- No full suite was run (brief).

## Falsification (throwaway copy under scratchpad/fals, outside the repo, node_modules junctioned; fix reverted in the copy only, same tests, --test-name-pattern)
R1 schema allow-list removed: pass=0 fail=1 | R1 credentialFor re-check removed: pass=0 fail=1 | R2 first-postgres-by-list: pass=0 fail=1 | R3 metricsWindow identity: pass=1 fail=1 (page-source test still passes, the window test fails) | R4 no unaudited() branch: pass=0 fail=2 | R5 audit every failed/limited login: pass=0 fail=2 | R6 problem-check removed: pass=2 fail=4 | R6 onSkip + cap removed: pass=4 fail=2 | R9 XFF fallback restored: pass=0 fail=1 | R9 per-email guard removed: pass=0 fail=1. The same tests are green on the real tree above.

## Open risks / notes
- R9 "else the socket address" is not possible in a Next Route Handler; without x-real-ip the API sees no client key (its limiter then uses its own no-key bucket). The e-mail guard bounds guessing per account regardless; it also lets an attacker lock a named admin out for the window (accepted trade-off, in-memory per web process).
- Login failure audit dedupe state is per API process (in memory); a restart resets it.
- qa/manifests/vc-admin-control.md was already modified in the worktree before this work (not by this builder); it is not part of this commit.
