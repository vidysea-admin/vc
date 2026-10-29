# integration-admin — S12 owned integration

T-057 cycle2 preserved. BUILDING; no product/checker PASS.

Stable runtime export (to be implemented): `createLiveVidyseaPort(store: Pick<AdminStore, "sources">, opts: {env: Record<string,string|undefined>; seeded?: readonly SeededSource[]; siteId: string; nowMs?:()=>number; onEvent?; connect?}): VidyseaPort`. Native raw result methods getStudentProfile/getShortlistedProgrammes/getProfileAssessment/getCompareList (unsupported)/getStatus. No career/psychometric alias. Tenant and enabled trusted seed required before credentials. Pathlynks factory remains backward compatible.

No main checkout/index, model, provider, production DB, commit/push/deploy action.

## Progress / root consumer
Factory implemented in apps/api/src/admin-routes.ts (named export). Native result envelope and synchronous getStatus retained; optional connect/onEvent/nowMs are local seams. AdminPostgresPort.test accepts an optional third server-owned context {source,seeded,defaultSiteId}; withAdminRoutes supplies it, so existing index createPostgresTestPort({env}) remains sufficient. No peer index edit needed. Existing Admin store upsert/setSecret now refuse secret destination retargets with CAS (including concurrent provision/retarget); current API has no clear/retarget operation, so a new destination requires a new source and separately provisioned secret.

UI retains existing classes/theme/layout: adds platform + site inputs and safe status attribution; disabled source Test/Sync unavailable; sync offered only on GitHub. Existing site-filtered dashboard/usage reused.

## Self-check closeout — 2026-10-27T15:35:05.570Z

Status: local implementation/self-check complete for assigned Admin slice; parent still BUILDING. No final checker/feature PASS, new cycle or reset. Bound root D:/vc/.worktrees/vc-completion; adapter coding (qa/adapter.json). Installed protocols reread at this running-session boundary; no new readiness tick success claimed.

Initial red command: `node node_modules/tsx/dist/cli.mjs --test --test-name-pattern=S12 apps/api/tests/admin-sync.test.ts packages/db/tests/admin-store.test.ts` -> exit1 tests5/pass1/fail4 (wrong-site seed, missing native factory twice, missing encrypted-secret retarget refusal). First integrated affected run -> exit1 tests149/pass147/fail2: old secret-retarget expectation and named-secret-reader allowlist. Authorized S12 assertions updated; no production safety assertion removed: explicit retarget rejection and named native factory reader added. The existing Pathlynks-source-id assertion now filters Pathlynks platform while retaining the exact legacy id assertion.

Execution limitation: unified exec failed before process creation (helper_unknown_error/setup refresh). Node child_process fallback used exact argv, no shell interpolation. One initial awaited check hit the Node tool timeout/kernel reset; a follow-up empty-output result was treated as inconclusive, never as passing evidence. Later bounded executions below contain real output and exit identities.

### Final exact command/result evidence

#### admin-final

`node node_modules/tsx/dist/cli.mjs --test apps/api/tests/admin-routes.test.ts apps/api/tests/admin-sync.test.ts apps/api/tests/admin-secrets-leak.test.ts packages/db/tests/admin-store.test.ts`

Started 2026-10-27T15:32:56.587Z; ended 2026-10-27T15:33:03.097Z; PID 73836; exit 0; signal none.

```text
✔ VA5: the test table covers exactly the routes admin-routes.ts serves (a route missing from the table is a failure) (1.9627ms)
✔ VA5/VA6: viewer GET /admin/api/me -> 200, no audit row (82.2762ms)
✔ VA5/VA6: admin GET /admin/api/me -> 200, no audit row (2.1126ms)
✔ VA5/VA6: super-admin GET /admin/api/me -> 200, no audit row (1.9414ms)
✔ VA5/VA6: viewer GET /admin/api/admins -> 403, no side effect and one ok:false audit row (2.0817ms)
✔ VA5/VA6: admin GET /admin/api/admins -> 403, no side effect and one ok:false audit row (1.4753ms)
✔ VA5/VA6: super-admin GET /admin/api/admins -> 200, no audit row (9.2421ms)
✔ VA5/VA6: viewer POST /admin/api/admins -> 403, no side effect and one ok:false audit row (1.3879ms)
✔ VA5/VA6: admin POST /admin/api/admins -> 403, no side effect and one ok:false audit row (1.092ms)
✔ VA5/VA6: super-admin POST /admin/api/admins -> 201, one ok audit row (62.9444ms)
✔ VA5/VA6: viewer PATCH /admin/api/admins/* -> 403, no side effect and one ok:false audit row (1.9615ms)
✔ VA5/VA6: admin PATCH /admin/api/admins/* -> 403, no side effect and one ok:false audit row (1.5983ms)
✔ VA5/VA6: super-admin PATCH /admin/api/admins/* -> 200, one ok audit row (1.9932ms)
✔ VA5/VA6: viewer GET /admin/api/sites -> 200, no audit row (1.2975ms)
✔ VA5/VA6: admin GET /admin/api/sites -> 200, no audit row (1.1347ms)
✔ VA5/VA6: super-admin GET /admin/api/sites -> 200, no audit row (1.2641ms)
✔ VA5/VA6: viewer POST /admin/api/sites -> 403, no side effect and one ok:false audit row (0.9194ms)
✔ VA5/VA6: admin POST /admin/api/sites -> 201, one ok audit row (1.3363ms)
✔ VA5/VA6: super-admin POST /admin/api/sites -> 201, one ok audit row (0.862ms)
✔ VA5/VA6: viewer PATCH /admin/api/sites/* -> 403, no side effect and one ok:false audit row (0.9439ms)
✔ VA5/VA6: admin PATCH /admin/api/sites/* -> 200, one ok audit row (1.1658ms)
✔ VA5/VA6: super-admin PATCH /admin/api/sites/* -> 200, one ok audit row (1.1838ms)
✔ VA5/VA6: viewer POST /admin/api/sites/*/keys/rotate -> 403, no side effect and one ok:false audit row (0.8572ms)
✔ VA5/VA6: admin POST /admin/api/sites/*/keys/rotate -> 200, one ok audit row (1.1409ms)
✔ VA5/VA6: super-admin POST /admin/api/sites/*/keys/rotate -> 200, one ok audit row (1.0567ms)
✔ VA5/VA6: viewer POST /admin/api/sites/*/revoke -> 403, no side effect and one ok:false audit row (0.9316ms)
✔ VA5/VA6: admin POST /admin/api/sites/*/revoke -> 200, one ok audit row (1.0118ms)
✔ VA5/VA6: super-admin POST /admin/api/sites/*/revoke -> 200, one ok audit row (0.83ms)
✔ VA5/VA6: viewer POST /admin/api/sites/*/unrevoke -> 403, no side effect and one ok:false audit row (0.8596ms)
✔ VA5/VA6: admin POST /admin/api/sites/*/unrevoke -> 200, one ok audit row (0.8731ms)
✔ VA5/VA6: super-admin POST /admin/api/sites/*/unrevoke -> 200, one ok audit row (0.8276ms)
✔ VA5/VA6: viewer GET /admin/api/sources -> 200, no audit row (0.9167ms)
✔ VA5/VA6: admin GET /admin/api/sources -> 200, no audit row (0.7362ms)
✔ VA5/VA6: super-admin GET /admin/api/sources -> 200, no audit row (0.7195ms)
✔ VA5/VA6: viewer POST /admin/api/sources -> 403, no side effect and one ok:false audit row (0.8575ms)
✔ VA5/VA6: admin POST /admin/api/sources -> 201, one ok audit row (0.9513ms)
✔ VA5/VA6: super-admin POST /admin/api/sources -> 201, one ok audit row (0.8478ms)
✔ VA5/VA6: viewer PUT /admin/api/sources/*/secret -> 403, no side effect and one ok:false audit row (0.6909ms)
✔ VA5/VA6: admin PUT /admin/api/sources/*/secret -> 403, no side effect and one ok:false audit row (0.6502ms)
✔ VA5/VA6: super-admin PUT /admin/api/sources/*/secret -> 200, one ok audit row (1.3544ms)
✔ VA5/VA6: viewer POST /admin/api/sources/*/test -> 403, no side effect and one ok:false audit row (0.7059ms)
✔ VA5/VA6: admin POST /admin/api/sources/*/test -> 200, one ok audit row (1.1185ms)
✔ VA5/VA6: super-admin POST /admin/api/sources/*/test -> 200, one ok audit row (1.5194ms)
✔ VA5/VA6: viewer POST /admin/api/sources/*/sync -> 403, no side effect and one ok:false audit row (1.1966ms)
✔ VA5/VA6: admin POST /admin/api/sources/*/sync -> 200, one ok audit row (3.6562ms)
✔ VA5/VA6: super-admin POST /admin/api/sources/*/sync -> 200, one ok audit row (1.6661ms)
✔ VA5/VA6: viewer GET /admin/api/metrics -> 200, no audit row (1.2818ms)
✔ VA5/VA6: admin GET /admin/api/metrics -> 200, no audit row (0.8722ms)
✔ VA5/VA6: super-admin GET /admin/api/metrics -> 200, no audit row (0.7683ms)
✔ VA5/VA6: viewer GET /admin/api/audit -> 200, no audit row (0.9071ms)
✔ VA5/VA6: admin GET /admin/api/audit -> 200, no audit row (0.7803ms)
✔ VA5/VA6: super-admin GET /admin/api/audit -> 200, no audit row (0.75ms)
✔ VA5: a viewer or admin cannot grant themselves a higher role, and nobody can change their own role (including the last super-admin) (3.199ms)
✔ VA5: an unknown route is 404, a known path with another method is 405 with Allow, and an unauthenticated caller gets 401 for both (1.155ms)
✔ VA5: an unparseable or oversized JSON body is a 400 / 413 with an ok:false audit row, not a crash (1.1244ms)
✔ VA6: validation failures and downstream errors are audited ok:false, successes ok:true, and login success, failure and rate-limit are all rows (1992.2207ms)
✔ VA6: GET audit returns rows newest first for a viewer, and a row holds only at, actorId, action, target and ok (no body, no secret) (46.7747ms)
✔ VA6: if the audit row cannot be written, a write answers 500 audit_unavailable instead of pretending it was recorded (16.7706ms)
✔ VA7: a key made in the console authenticates through the existing registry (pub on the page scope, srv on the server scope), the response shows it once, and a later list shows prefixes only (23.7007ms)
✔ VA7: rotating a key in the console stops the old one within the 60 s cache bound and the new one works; revoke kills both, unrevoke brings the same keys back (38.0709ms)
✔ VA7: the console refuses what the CLI refuses: reserved ids, bad origins, a duplicate id, an unsafe name (67.2092ms)
✔ VA7: PATCH sites/:id renames and replaces origins through normalizeOrigin, never touches the keys, and refuses what the CLI refuses (25.9926ms)
✔ VA7: updatePartner and unrevokePartner are the partners.ts functions the console calls: same store, same normalisation, idempotent, keys never minted (6.9342ms)
✔ VA7: with partner keys off (no pepper) the site write routes answer 503 and the read route still lists (15.7448ms)
✔ VA7 static: admin-routes.ts has no createHmac / timingSafeEqual and admin-auth.ts uses timingSafeEqual only for the scrypt compare (no partner-key hashing in either) (8.4951ms)
✔ VA8: POST sources validates the body with the S1 SourceConfig: a password field, a token-looking tokenRef, a connection string, unknown keys and kinds are 400 and nothing is stored (97.6096ms)
✔ VA8: PUT sources/:id/secret stores only the encrypted triple, answers hasSecret, and refuses empty, oversized and unknown-source requests (34.6164ms)
✔ VA8: without VC_ADMIN_MASTER_KEY, setting a secret answers 503 secrets_not_configured and stores nothing (18.6191ms)
✔ VA17: GET metrics returns the golden numbers for a seeded usage set (viewer allowed), filters by site, and excludes the exclusive end of the range (30.0182ms)
✔ VA17: an inverted, equal, missing or unparseable range is a 400 and a bad site id is a 400 (26.7341ms)
✔ fix1 R1: an admin creates a source naming VC_ADMIN_MASTER_KEY / VC_ADMIN_JWT_SECRET / MONGODB_URL as its credential ref: 400 and nothing is stored (41.198ms)
✔ fix2 F1: an admin creates a postgres source host=attacker.example with passwordRef PATHLYNKS_DB_PASSWORD and presses Test: the attacker's port never receives the env password (31.9347ms)
✔ fix2 F1: an admin creates a github source owner=evil with tokenRef GITHUB_TOKEN and presses Test and Sync: no token is sent to the evil repository (12.8082ms)
✔ fix2 F1: a github source whose tokenRef is PATHLYNKS_DB_PASSWORD (the DB password as a GitHub bearer) is a 400 and nothing is stored (18.5377ms)
✔ fix2 F1: the seeded pathlynks-db with its host (or port, database, user, sslmode) PATCHed to attacker.example gets no env password on Test; a seeded repo with owner/repo PATCHed gets no token (95.303ms)
✔ fix2 F1: the seeded pathlynks-db and the 4 seeded repos, unchanged, still get their env credentials on Test (37.4763ms)
✔ fix2 F1: with no seeded config handed to the admin routes, no source ever gets an env credential (fail closed) (11.2758ms)
✔ fix2 F1: an admin-created source that a super-admin gave its own encrypted secret uses that secret, never the env value (23.5897ms)
✔ fix1 R4: rotating a site key while the audit write is failing still returns the new key once, flagged auditRecorded:false and logged, instead of a 500 that loses it (15.1392ms)
✔ fix1 R4: creating a site while the audit write is failing returns both new keys with the audit flag; an ordinary write still answers 500 audit_unavailable (27.2677ms)
✔ Q13 memory policy: viewer PATCH roundtrip with isolated partner, audit and no secret (22.8853ms)
✔ Q13 memory policy: admin PATCH roundtrip with isolated partner, audit and no secret (30.906ms)
✔ Q13 memory policy: super-admin PATCH roundtrip with isolated partner, audit and no secret (25.9322ms)
✔ Q13 memory policy: PATCH rejects malformed/unknown policy without mutation and audits failure; legacy explicit initialization (39.1982ms)
✔ Q13 memory policy: actual AdminClient PATCH/store/list roundtrip and viewer forced-write refusal (121.2704ms)
✔ S12 Admin creates an explicit Vidysea source and viewer cannot write or test it (41.0307ms)
✔ VA9: no secret, password, hash, ciphertext, master key or JWT secret appears in any response, header, log, audit row (and the Db holds only ciphertext and hashes) (2699.4581ms)
✔ VA9: the secret route never answers the secret and the sources list says only hasSecret, for every role that may read it (131.7731ms)
✔ VA9 static: nothing outside the admin store calls readSecret, and the routes file never logs a request body or a thrown message (10.5974ms)
✔ VA8: syncing a backend source fetches only migrations, writes a schema_map artifact, records lastSync ok with counts, and the list shows it (99.1045ms)
✔ VA8: syncing a frontend source builds the nav_catalogue from the file TREE alone (no blob is fetched) (2.6913ms)
✔ VA8: a failed fetch records lastSync error, keeps the previous artifact, and neither the response, the audit log nor the logs carry the token (5.9543ms)
✔ VA8: a repository over the fetch limits reports a plain too-large message, and an unconfigured GitHub port reports that instead of crashing (2.4864ms)
✔ VA8: the token for a sync comes from the encrypted secret when one is set, else from the env var the source names, else none (a public repo) (4.8403ms)
✔ VA8: a postgres source cannot be synced (400 not_syncable) and an unknown source is 404, both audited ok:false (1.6818ms)
✔ VA8: Test connection for GitHub answers ok:true / false with a fixed plain message and never the underlying error text (1.8939ms)
✔ VA8: Test connection for Postgres passes only the non-secret config and the stored password to the port, and maps each failure cause to a fixed sentence (3.7991ms)
✔ VA8: a stored secret that cannot be decrypted (master key rotated) makes Test connection say so plainly instead of throwing (1.923ms)
✔ VA8: seeding config/sources.json is idempotent: a second run changes nothing and never overwrites a stored secret or lastSync (0.672ms)
✔ VA8: the real config/sources.json seeds cleanly and carries env NAMES only, never a value (1.618ms)
✔ VA8: createGithubPort sends the token only in the Authorization header, reads the recursive tree and a blob, and an HTTP error carries the status only (1.9309ms)
✔ fix1 R1: a stored source whose tokenRef names VC_ADMIN_MASTER_KEY never has that env value read: test and sync answer an error and the fake GitHub port gets no token (3.2202ms)
✔ fix1 R2: an admin-created postgres source with id aaa-evil does not become the live Pathlynks port; the seeded pathlynks-db keeps its tables (2.4161ms)
✔ fix2 F1: the seeded pathlynks-db with its host PATCHed to attacker.example never becomes a live chat connection carrying the env password; restored, it connects again (3.359ms)
✔ fix1 R2: the fixed live-port source id is the postgres entry of config/sources.json (1.2178ms)
✔ fix1 R6: a school sync that finds no migration file at all (a renamed folder) records error and keeps the previous schema_map as the latest (4.6561ms)
✔ fix1 R6: migration files that define no table (all no-ops) record error and keep the previous schema_map (2.9226ms)
✔ fix2 F4: one migration that defines a table AND has one unparsed statement is a usable sync: status ok, the diagnostic recorded, the artifact replaced (3.3267ms)
✔ fix2 F4: four valid createTable migrations, each with one raw sequelize.query, sync as ok with 4 tables, the artifact stored and 4 diagnostics recorded (no false error) (2.2201ms)
✔ fix1 R6: a migration over the size cap is counted as skipped, and the sync still succeeds for the others (2.0013ms)
✔ fix1 R6: a partial parse keeps at most 20 diagnostics in the artifact, with a token-looking file name redacted (3.5773ms)
✔ fix1 R6: a frontend sync whose tree has no page routes records error and keeps the previous nav_catalogue (3.0962ms)
✔ Q1 R4 exact table mapping requires every join and never selects a similarly named substitute (0.3405ms)
✔ S12 Admin seeding preserves site/platform/enabled rather than relabelling Vidysea (0.4042ms)
✔ S12 native stored Vidysea adapter executes bounded SQL with bound owner, encrypted secret, and explicit unavailable comparison (2.3629ms)
✔ S12 Vidysea credential canaries refuse cross-site/destination/ref/disabled before env access or SQL (2.1344ms)
✔ S12 Pathlynks factory refuses a Vidysea source even with encrypted credentials (0.6132ms)
✔ S12 Admin Vidysea test endpoint reaches the native stored adapter with env credentials and preserves site usage attribution (4.0448ms)
✔ S12 disabled trusted Vidysea seed and immediate stored disable never read credentials or reuse an active port (1.174ms)
✔ VA2: encryptSecret/decryptSecret round trip, including unicode and long plaintext (3.8584ms)
✔ VA2: a fresh random 12-byte iv per call (50 encryptions of one plaintext are all different) (1.6611ms)
✔ VA2: a flipped bit in ct, tag or iv throws and returns no plaintext (1.307ms)
✔ VA2: a truncated or padded tag, a wrong-length iv, a missing/extra field and non-canonical base64 all throw (0.6593ms)
✔ VA2: a wrong key throws; a key that is not exactly 32 bytes is refused by encrypt and decrypt (0.5405ms)
✔ VA2: the master key must be base64 of exactly 32 bytes; the refusal never echoes the value (0.7931ms)
✔ VA2: setSecret without a configured master key fails closed, naming the env var only (1.8127ms)
✔ VA2: setSecret stores only the encrypted triple; the fake Db holds no plaintext substring; get/list show hasSecret only (2.6214ms)
✔ VA2: setSecret on an unknown source, with an empty or oversized value, is refused and writes nothing (0.5783ms)
✔ VA2: a source config carrying a secret-like field or a credential URL is refused at upsert (0.6407ms)
✔ S2 users: create normalises the email, refuses a duplicate and an invalid role/email, never lists the hash (2.2588ms)
✔ S2 users: setRole and disable change the stored user; an unknown email reports false (0.5454ms)
✔ S2 audit: append-only (no update/delete on the surface), newest first, extra or oversized fields refused (1.2912ms)
✔ S2 artifacts: getLatest returns the newest build; a payload that is not a schema map / catalogue is refused (0.965ms)
✔ S2 sources.recordSync: stores at/status/counts only; counts must be non-negative integers; unknown source reports false (0.8879ms)
✔ VA9a: the five admin collections are named, indexed and erasure-exempt with a reason; none has a TTL (0.3489ms)
✔ VA16: studentKeyOf is an HMAC (64 hex), deterministic, never the raw id, and differs per site and per student (0.716ms)
✔ VA16: usage.record stores exactly the schema fields; every extra field (text, reply, claims, raw id, email) throws and writes nothing (1.4556ms)
✔ VA16: a raw student id, an email or a name in studentKey is refused (must be the 64-hex HMAC); bad numbers/enums are refused (1.2926ms)
✔ VA16: an anonymous turn may omit studentKey (no identifier at all) and is stored with none (0.3105ms)
✔ VA16: a canary sentence handed alongside a turn never reaches any stored document (0.365ms)
✔ VA17: aggregateMetrics golden table, all sites (values hand-computed from the seed above) (16.258ms)
✔ VA17: siteId filters; rows outside the range and other sites are excluded (1.2949ms)
✔ VA17: from is inclusive and to is exclusive (the boundary rows prove both) (0.9874ms)
✔ VA17: an empty range returns zeros (no NaN, no Infinity); rows without a studentKey give 0 INR per student (0.8527ms)
✔ VA17: the INR rate is a config value; the default is exported and used when none is passed (1.0211ms)
✔ VA17: an inverted, equal or unparseable range is refused (0.8429ms)
✔ VA17: nearest-rank percentile edge cases (n=0, 1, 2, 20, 100, unsorted input) (0.2664ms)
✔ S12 encrypted credentials cannot survive a kind/site/destination/ref retarget (3.8221ms)
✔ S12 source retarget racing secret provisioning cannot attach old secret to new destination (1.3051ms)
ℹ tests 149
ℹ suites 0
ℹ pass 149
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 6218.3459
```

#### admin-ui

`node node_modules/tsx/dist/cli.mjs --tsconfig apps/web/tsconfig.json --test apps/web/tests/admin-views.test.tsx apps/web/tests/admin-client.test.ts`

Started 2026-10-27T15:32:05.219Z; ended 2026-10-27T15:32:08.237Z; PID 58080; exit 0; signal none.

```text
✔ VA19 client S3 paths: every method calls the spec route with the right verb and a bearer header (18.9064ms)
✔ VA19 in-memory token: the token is only ever in the Authorization header, never a URL, query or body (0.4148ms)
✔ VA19 viewer forced write: a 403 becomes an AdminApiError the page shows as an error (no redirect) (0.5785ms)
✔ VA19 expired session: a 401 calls onUnauthorized (the page goes back to login) and still rejects (0.2407ms)
✔ VA19 client errors never surface raw server text; other statuses get a fixed sentence (0.4182ms)
✔ VA19 client path ids are encoded: a site id with a slash cannot escape its segment (0.1681ms)
✔ VA19 role matrix: viewer writes nothing, admin everything but admins + secrets, super-admin all (0.1701ms)
✔ VA19 expired / missing session: the server gate sends a missing or empty cookie to login, a present one through (0.072ms)
✔ VA19 no storage: no admin source file touches localStorage, sessionStorage, IndexedDB or document.cookie, and none puts a token in a URL (22.4043ms)
✔ fix1 R3: a usage row stamped today at noon appears in the default dashboard window (the API's `to` is exclusive, the UI's To is inclusive) (1.1748ms)
✔ fix1 R3: the dashboard page sends the exclusive end, not the raw To date (0.8885ms)
✔ Q13 memory policy: client sends and reads independent flags/zero without exposing unknown fields (1.6488ms)
✔ VA19 login: email + password form, the generic wrong-password message, no stored-credential hints (6.5208ms)
✔ VA19 viewer: sites, sources, admins and detail show the lists but every write control is absent or disabled (5.5844ms)
✔ VA19 admin: site + key + source write controls are live, the secret setter and the admins form are not (7.1583ms)
✔ VA19 super-admin: sets a source secret and creates admins with a role (3.9983ms)
✔ VA19 secrets never re-display: a stored secret shows only 'set' / 'not set', even if the payload carried one (7.7246ms)
✔ VA19 key shown once: the freshly minted key is rendered while it is held in state, and absent from every other render (3.9533ms)
✔ VA19 revoked site: the detail page offers Unrevoke instead of Revoke and no rotate (1.6266ms)
✔ VA19 dashboard: conversations per site per day, active students, chat vs voice, tokens, cost per student vs the 50 INR target, latency, guardrail hits, unanswered (20.8146ms)
✔ VA19 dashboard empty / not yet loaded: no crash and no fake numbers (2.1475ms)
✔ VA19 errors render as alerts and are escaped (a 403 sentence, hostile text) (0.5091ms)
✔ VA19 audit table lists actor, action, target and ok/failed (0.7714ms)
✔ VA19 nav: viewer and admin do not see Admins, super-admin does; every role sees Dashboard, Sites, Sources, Audit and Sign out (1.5748ms)
✔ Q13 memory policy: actual site detail exposes independent controls, hard caps and read-only viewer (5.4337ms)
✔ S12 Admin shows both platforms and disables unprovisioned source actions (2.5628ms)
ℹ tests 26
ℹ suites 0
ℹ pass 26
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2840.9886
```

#### type-db

`node node_modules/typescript/bin/tsc --noEmit -p packages/db/tsconfig.json`

Started 2026-10-27T15:32:26.589Z; ended 2026-10-27T15:32:28.836Z; PID 67216; exit 0; signal none.

```text
```

#### type-api

`node node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json`

Started 2026-10-27T15:32:14.081Z; ended 2026-10-27T15:32:42.342Z; PID 72532; exit 2; signal none.

```text
packages/engine/src/student/graph.ts(171,7): error TS2739: Type '{ kb_source_detail: string; source_freshness: string; coverage: string; rank_options: string; profile_view: string; profile_confirm: string; profile_correct: string; data_export: string; data_erasure: string; channel_switch: string; }' is missing the following properties from type 'Record<"data_erasure" | "data_export" | "profile_correct" | "profile_confirm" | "profile_view" | "rank_options" | "source_freshness" | "kb_source_detail" | "coverage" | "channel_switch" | "vidysea_profile" | "vidysea_shortlisted_programmes" | "vidysea_profile_assessment", string>': vidysea_profile, vidysea_shortlisted_programmes, vidysea_profile_assessment
packages/engine/src/student/graph.ts(929,24): error TS2366: Function lacks ending return statement and return type does not include 'undefined'.
packages/engine/src/student/graph.ts(964,19): error TS2454: Variable 'message' is used before being assigned.
```

#### type-web

`node node_modules/typescript/bin/tsc --noEmit --incremental false -p apps/web/tsconfig.json`

Started 2026-10-27T15:33:11.243Z; ended 2026-10-27T15:33:30.762Z; PID 42828; exit 2; signal none.

```text
packages/engine/src/student/graph.ts(171,7): error TS2739: Type '{ kb_source_detail: string; source_freshness: string; coverage: string; rank_options: string; profile_view: string; profile_confirm: string; profile_correct: string; data_export: string; data_erasure: string; channel_switch: string; }' is missing the following properties from type 'Record<"data_erasure" | "data_export" | "profile_correct" | "profile_confirm" | "profile_view" | "rank_options" | "source_freshness" | "kb_source_detail" | "coverage" | "channel_switch" | "vidysea_profile" | "vidysea_shortlisted_programmes" | "vidysea_profile_assessment", string>': vidysea_profile, vidysea_shortlisted_programmes, vidysea_profile_assessment
packages/engine/src/student/graph.ts(929,24): error TS2366: Function lacks ending return statement and return type does not include 'undefined'.
packages/engine/src/student/graph.ts(964,19): error TS2454: Variable 'message' is used before being assigned.
```

`git diff --check -- <the nine owned existing files listed below>` -> exit0, stdout empty; only CRLF normalization warnings on stderr. No index/stage changes.

### Interfaces and security decisions
- `createLiveVidyseaPort(store,{env,seeded,siteId,nowMs?,onEvent?,connect?}): VidyseaPort` native raw methods only. Exact trusted enabled Vidysea seed/site/id/platform/destination/ref is required before environment or encrypted-secret resolution; no cross-tenant/default fallback. Last port getStatus is synchronous; comparison explicitly unavailable/unsupported. Stored disable checked before cached use. Password cache <=60s; policy freshness remains runtime owner responsibility.
- Vidysea env object contains only its private password and fixed VIDYSEA_DB_CA_FILE; TLS/readonly native port and default privilege refusal retained. PATHLYNKS_ALLOW_PRIVILEGED_ROLE does not enter Vidysea config. No browser credential override or arbitrary CA lookup.
- Admin Postgres test optional third server context is supplied by existing route wrapper, preserving existing callers. It executes native Vidysea SQL via existing factory. Local synthetic test reaches real store -> Admin HTTP handler -> native SQL port -> mocked SELECT; no real SQL connection.
- `sources.upsert` rejects all encrypted-secret kind/site/destination/ref changes; current API has no explicit clear/retarget operation. Metadata enabled changes remain usable. Inline CAS in upsert and setSecret prevents a concurrent retarget/provision from moving a credential. No new module/helper/collection.
- Legacy Pathlynks function/method names and port behavior remain, with explicit platform/site/enabled refusal to prevent Vidysea becoming Pathlynks. Existing Pathlynks affected tests passed.
- Existing Admin form uses paired platform/site fields, config allowlist shows safe platform/enabled values and owning site. Disabled sources cannot Test/Sync; PostgreSQL never offers Sync. Dashboard continues existing site-filtered metrics, and synthetic Vidysea usage/failure site attribution was exercised. Existing theme/classes/login/dashboard retained. Shared Chat/Voice/Speak/geometry/focus untouched.

### Remaining / root-owned gates
API and web typechecks each exit2 only at packages/engine/src/student/graph.ts:171,929,964 (missing Vidysea tool labels and unfinished handling; exact output above). No error names an owned product file. Runtime peer/root must complete that integration and rerun affected typechecks. Full workspace tests/typechecks/builds, contracts validator, visible Admin/browser role interaction, final blind acceptance/SSE/data/AI and any bounded paid synthetic proof remain root-owned; no helper acceptance. SSR/client tests prove markup/transport roles only, not browser interaction. No real provider/production DB/RDS/KB call, no main checkout/index mutation, no commit/push/deploy. Team Vidysea readonly-role/credential/CA provisioning remains absent; committed disabled seed remains disabled.

Landplane boundaries read: this delegated contribution cannot close T057/append a separate parent decision or commit; explicit scoped no-commit and root-owned closeout instructions take precedence. Report is the bounded QA handback, not a full landplane or release. Current recorded test/typecheck child processes have ended; no server or socket started here.

### Final input identities (includes pre-existing peer changes, not authorship attribution)

```json
{
  "protocols": {
    "maker": "236bc0e7c075f9729ef464dbd8aa2bdbec02754e95e228c936480c96d4c8fe39",
    "checker": "835d6a2764c50567b4573c7aa8f4f991430e2240a46107256b4a07d934799cf1"
  },
  "identities": {
    "apps/api/src/admin-routes.ts": "3fcd64084febb20335e0297914f377cd60005c0dab290e54a862d256001a5c4c",
    "packages/db/src/admin-store.ts": "fee9b7c17db3b62223a1b874dcfc7782c6aeb65842ebeec5c0632f1897d504c5",
    "apps/web/src/app/admin/_components/SourcesView.tsx": "dbce0133269c33ee8a2949d41f91874af628d8a285ccd000b9c4bf0c0d2c3675",
    "apps/web/src/app/admin/_lib/types.ts": "a92b03fb33da66c63576847d8dd2ae91e64f2d6ad0a357058683714bd375af1c",
    "apps/api/tests/admin-sync.test.ts": "680bcf0fe3ae8d4c26b70efda6a37870034929723bf0dcc5fc26e3351d1ad520",
    "apps/api/tests/admin-routes.test.ts": "82f98185412cb35ad3b89085686a82a82495576641d3528d5332f6b701e09e29",
    "apps/api/tests/admin-secrets-leak.test.ts": "c65740c415d6e3e10253325b395b1df3d66f30046e18c8a94d5a096894e86739",
    "packages/db/tests/admin-store.test.ts": "55362304a1a405089ef32f86dddf7ee851065ecea4809692baeff9becc05afec",
    "apps/web/tests/admin-views.test.tsx": "5215e866f1ea857da87d19e6f676ddda11072ac9c425cae58309c788548ad180",
    "pnpm-lock.yaml": "b344f406e0b6c4beb3df693b1e67cfc7b867afd3970c580207e4203d13a1de4d",
    "docs/features/vc-admin-control/plan.md": "0e32081cad1a875de49503ce3dce1d376855f81b88d2c682c9ff76513b7de02c",
    "qa/verdicts/quest-successor-plan.md": "32dfcc5f31248c5443df58097ec23b52af0637278d6bd06469bbdc995da0cc6e"
  }
}
```
