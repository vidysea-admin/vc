# vc-admin-control fix cycle 2 (vca-fix2), maker build evidence
Branch wave/vc-admin-control, worktree D:/vc/.worktrees/vca-int, base 9813512. Written 2026-10-27T01:40+05:30 (read with Get-Date).
Policy proportional-verification/2026-10-19.17, Tier L. Builder: Opus subagent (root cause Sonnet already failed on).

## F1 (VA1/VA8/VA12, critical): env credentials bound to the exact seeded connection (closes the class)
- apps/api/src/admin-routes.ts `boundEnvRef(src, seeded)` (new export, near the top): returns the env NAME only when the stored source has the
  seeded id AND kind AND the same ref AND (postgres) host (case-insensitive)/port/database/user/sslmode or (github) owner/repo (case-insensitive).
  No seeded list = nothing qualifies (fail closed).
- `credentialFor` (buildRoutes): encrypted secret first (unchanged); else re-check the ref against the KIND's prefix; else `boundEnvRef`;
  unbound -> `NoCredentialError` -> Test answers "No credential is set for this source. A super-admin can store one for it.", Sync records error with
  the same sentence. The ports (postgres / GitHub factory) are never called with an env value for an unbound source.
- `createLivePathlynksPort` takes `seeded`; the env password is used only while the stored pathlynks-db doc is the exact seeded connection.
- `AdminRoutesDeps.seededSources` (new). Wiring: apps/api/src/index.ts, the two config/sources.json consumers (createLivePathlynksPort opts and the
  withAdminRoutes deps) get `sourcesFile.sources`. This is a 2-spread edit OUTSIDE the owned list, required because index.ts is where the loaded
  config/sources.json is held ("the config/sources.json loader if needed"); without it production would fail closed (no env password at all).
- packages/schemas/src/sources.ts: `GITHUB_REF_PATTERN`, `PATHLYNKS_REF_PATTERN`, `credentialRefPatternFor(kind)`; github `tokenRef` must be
  GITHUB_*, postgres `passwordRef` must be PATHLYNKS_*. `CREDENTIAL_REF_PATTERN` kept (exported, union).
- Tests (named after the attack): admin-routes.test.ts "fix2 F1" x6 (attacker.example postgres + a same-host twin id; github owner=evil Test+Sync;
  cross-kind refs 400; seeded pg doc PATCHed on host/port/database/user/sslmode/passwordRef and seeded repo PATCHed on owner/repo; seeded
  pathlynks-db + the 4 seeded repos still get credentials; no seeded list = none; admin-created source with super-admin secret uses that secret).
  admin-sync.test.ts "fix2 F1" live-port PATCH test; fixture `worldWith` now seeds its sources through seedSourcesFromConfig with `seededSources`.
  R1 test updated: pg-ok (host db.example) still 201 on create, but its Test now answers ok:false. schemas sources.test.ts "fix2 F1".

## F2 (VA6): one audit row per login attempt
- admin-routes.ts `login`: per-client+e-mail dedupe map removed (`failedLoginSeen`, LOGIN_MAX_AUDIT_KEYS/LOGIN_WINDOW_MS imports dropped). A 429 and a
  malformed/oversize body each write one ok:false row (actor "unknown", target "login", no body or password). Header comment rewritten.
- admin-routes.test.ts VA6 test: now asserts the rate-limited attempt adds exactly one row (6 login rows total) and no row holds the password.
  admin-auth.test.ts: the two fix1 R5 tests replaced by three fix2 F2 tests (50 attempts -> 50 rows: 5x401 + 45x429; malformed -> 1 row; rotating).

## F3 (R9): createLoginGuard never fails closed
- apps/web/src/app/admin/_lib/session-handlers.ts `createLoginGuard`: map kept in LRU order (delete + re-insert on touch); when full, evict from the
  LRU end until below maxKeys (O(1) amortised, no full-table scan per check). Per-e-mail 5/60 s limit unchanged.
- Test admin-session-routes.test.ts "fix2 F3": 10,000 distinct e-mails, then a legit admin login reaches upstream (401, not 429); 10,000 more, a new
  e-mail still allowed; a guessed-at e-mail still locks at 6.

## F4 (R6): no false sync error from diagnostics
- admin-routes.ts `syncGithubSource`: `diagnostics >= files` rule dropped; error only for files=0, tables=0 (schema) or routes=0 (frontend).
- admin-sync.test.ts: the fix1 "diagnostics >= files" test now asserts ok + diagnostic recorded + artifact replaced; new "fix2 F4" test: 4 valid
  createTable migrations each with one raw sequelize.query -> ok, 4 tables, artifact stored, >=4 diagnostics.

## Commands (all via D:/vc/scripts/vc-testlock.sh, from the package dir, Git bash)
- packages/schemas: `pnpm exec tsx --test tests/sources.test.ts` -> tests 15 pass 15 fail 0
- apps/api: `pnpm exec tsx --test tests/admin-auth.test.ts tests/admin-routes.test.ts tests/admin-secrets-leak.test.ts tests/admin-sync.test.ts tests/chat-pathlynks.test.ts` -> tests 133 pass 133 fail 0
- apps/web: `pnpm exec tsx --test tests/admin-session-routes.test.ts tests/admin-client.test.ts` -> tests 27 pass 27 fail 0
- `pnpm run typecheck` in packages/schemas, apps/api, apps/web -> tsc --noEmit exit 0 each
- No full suite (per brief).

## Falsification (fix2/falsify.ps1 + setup.ps1; log fix2/falsify.log)
Fresh throwaway copy per mutant at scratchpad/fx2/copy (outside the repo; node_modules junctioned), green before, one hunk, red after:
- M1 F1 api: credentialFor reads the stored ref directly (cycle-1 behaviour) -> 7 pass/0 fail before; 4 fix2 F1 tests red after. KILLED
- M1b F1 schema: kind binding replaced by CREDENTIAL_REF_PATTERN -> fix2 F1 schema test red. KILLED
- M2 F2: no audit row on 429 -> VA6 + 2 fix2 F2 tests red. KILLED
- M3 F3: guard fails closed when full -> fix2 F3 red. KILLED
- M4 F4: diagnostics >= files rule restored -> both fix2 F4 tests red. KILLED

## Open risks
- F3 LRU eviction: a flood of >10,000 fresh e-mails can evict a locked e-mail's entry and reset its 5/min budget at the web layer; the API's
  per-client limiter (5/min per X-Real-IP) still applies. Chosen per brief (never fail closed).
- F2: an anonymous flood now writes one row per attempt (contract VA6); the API per-client limiter does not cap rows for 429s.
- Low (checker A #5, not in scope): the nav catalogue loader trusts any github source of the site.
- Senior-engineer review not dispatched by this builder (the maker owns review/checker dispatch).
