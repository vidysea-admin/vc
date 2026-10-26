# Verdict: vc-admin-control (checker A, repair check)
Cycle checked: 2
Verdict: PASS (coordinator A of a dual check; the feature PASSes only if coordinator B also passes)
Bound: repair base 78ddaef (verified ancestor of HEAD), code head 6b8674c; tree HEAD 54876b6 adds only qa/ files (`git diff 6b8674c HEAD -- apps packages mcp config` empty). Tier L, policy proportional-verification/2026-10-19.17. Started 2026-10-27T01:43:14+05:30, written 2026-10-27T01:54+05:30 (about 11 min wall, no lock wait).
TIER: L, cited: apps/api/src/admin-routes.ts `credentialFor` / `boundEnvRef` (credential handling, VA1 scope) and apps/api/src/admin-auth.ts:139 dual trigger.

## Check plan (stated before running)
1. Read the repair diff 78ddaef..6b8674c in full; list files outside the declared scope; judge apps/api/src/index.ts.
2. Re-run my cycle-1 probes (C1-RESIDUAL, C1-T8, legacy docs, guard, sync) on the repaired tree.
3. Hostile VA1 variants: seeded source with each connection field changed, case and trailing-dot host, Kelvin-sign host, ref bound to the wrong kind, stored legacy doc, exact twin of the seeded connection under a new id, a seeded id re-created, live port after a change, no seeded list; positive controls for the seeded pathlynks-db and the four seeded repos.
4. VA6 login audit (every attempt kind), VA8 sync (no false error, real errors kept), VA12 live port, login guard, and the production wiring through `startApi`.
5. The repair's affected tests via vc-testlock; one falsification per repaired criterion in throwaway copies outside the repo.

## Result
- Repair tests (worktree, vc-testlock, per package): apps/api `tests/admin-auth admin-routes admin-secrets-leak admin-sync chat-pathlynks` 133/133; packages/schemas `tests/sources.test.ts` 15/15; apps/web `tests/admin-session-routes admin-client` 27/27 (logs checker-a-c2/repo-*.log). No full suite.
- My probes on a throwaway copy of the repaired tree (checker-a-c2/api-probes.log, web-probes.log, wire.log):
  - C1-RESIDUAL now: postgres source host=attacker passwordRef=PATHLYNKS_DB_PASSWORD -> created 201, Test answers "No credential is set for this source"; `pg.Client` saw 0 connections; GITHUB_TOKEN as a postgres ref is 400, PATHLYNKS_DB_PASSWORD as a github ref is 400 (the original residual printed `attacker.example.com` twice with the real dummy password).
  - C2-NEWID: admin-created sources, including an exact twin of the seeded host/port/database/user/sslmode and of a seeded repo's owner/repo under a new id, get no env value on Test or Sync; the postgres port and the GitHub factory are never called. Re-creating `pathlynks-db` or `pathlynks-frontend` is 409; an upper-case id is 400.
  - C2-MUTATE (store-level change of a seeded doc, which has no HTTP route): host, trailing-dot host, host prefix, port, database, user, sslmode, passwordRef (other PATHLYNKS_*, GITHUB_TOKEN, VC_ADMIN_MASTER_KEY), string port; for the repo: owner, repo, tokenRef (other, PATHLYNKS_*, removed), owner with a trailing space. None released an env value to Test, Sync or the live port.
  - C2-POS: seeded pathlynks-db Test is handed the DB password for the seeded host; all four seeded repos get GITHUB_TOKEN on Test and Sync. C2-WIRE (real HTTP through startApi, config/sources.json): the same, and a twin created over HTTP gets none. C2-NOSEED and C2-WIRE-NOFILE: with no seeded list no env value is released to anyone.
  - C2-LIVE: the live port connects to the seeded host with the env password; after a change of the doc and the 60 s cache, no connection; without `seeded` it fails closed.
  - C2-SECRET: a super-admin-stored secret works for an admin-created source (admin cannot set one: 403); env is not used.
  - C2-VA6: success, wrong password, unknown e-mail, malformed body and 12 limiter-crossing attempts each wrote exactly one row (1 ok:true, the rest ok:false, actor the matched e-mail or "unknown"); no password, token or body in audit rows or logs; GET writes none.
  - C2-R9: 10,000 fresh attacker e-mails then a legitimate admin's first login reaches upstream (401, was 429 in cycle 1); 30,000 more still fine; flood 10,000 took 0.56 s (no full-table scans); the per-e-mail limit still locks the 6th attempt and case/space variants of the e-mail hit the same key.
  - C2-R6: four valid createTable migrations each with a raw `sequelize.query` now answer status ok, 4 tables, 4 diagnostics recorded (was error); no files and zero tables (even with 3 diagnostics) still answer error and keep the stored schema; 1 table plus 4 diagnostic-only files is ok.
- Falsification (checker-a-c2/falsify-c2.log, fresh copy per mutant, one hunk, probes green on the unmutated copy first): M1 credentialFor ignores the binding KILLED; M2 live port ignores the binding KILLED; M3 sslmode not compared KILLED; M3b host not compared KILLED; M3c seed matched by kind instead of id KILLED; M4 no audit row on 429 KILLED; M5 `diagnostics >= files` restored KILLED; M6 guard fails closed when full KILLED; M7 index.ts `seededSources` spread removed KILLED (C2-WIRE); M8 schema kind binding removed KILLED. 10/10.
- Diff scope: the declared files (apps/api admin-routes.ts, apps/web session-handlers.ts, packages/schemas sources.ts) plus tests and qa/. One out-of-list file: apps/api/src/index.ts, two one-line `...(sourcesFile ? {...} : {})` spreads (:804 live port, :948 admin deps). Judged in scope and necessary: `sourcesFile` is held only there, and without the spreads production fails closed (no env credential at all); mutant M7 proves the wiring matters. Test diffs remove only assertions that encoded the defects I flagged in cycle 1 (R6 `diagnostics >= files` error, the bounded login-audit dedupe, an accepted cross-kind ref); each has a replacing assertion.

## Criteria
- VA1 PASS. An allow-listed env ref is released only to the exact seeded connection (id, kind, ref, host/port/database/user/sslmode or owner/repo); an admin-created source or a changed seeded doc gets "no credential"; ref prefixes are bound to the kind; the earlier closures (VC_ADMIN_*, MONGODB_URL, lowercase, whitespace, unicode, legacy docs) still hold (C1 matrix and legacy probes green). Seeded pathlynks-db and seeded repos keep their credentials.
- VA6 PASS. Every login attempt, 429 and malformed included, writes exactly one row and holds no secret; the VA6 contract text and the code now agree.
- VA8 PASS. No false sync error from diagnostics; empty, no-table and failed syncs still record error and keep the previous artifact.
- VA12 PASS. Live port: seeded id only, env password only for the unchanged seeded doc, fails closed otherwise.
- Cycle-1 PROPOSED 2 (login guard fails closed) and 3 (sync false error): both closed.
- Touched, tests green: VA4, VA5, VA7, VA9, VA13 via the 133 api tests.

## PROPOSED-ISSUE (dual check: not written to the ledger by me)
1. [low, VA6 design] An anonymous flood now writes one `audit_log` row per attempt, 429-limited ones included (the contract asks for it), and `audit_log` has no cap or TTL (packages/db/src/admin-store.ts audit section). Not a defect against the contract; the owner may want a TTL index or a retention note.
2. [low, test gap] No test in apps/api/tests runs `startApi` with `VC_ADMIN_JWT_SECRET`, so the `index.ts` spreads are pinned only by my probe. Candidate: promote `checker-a-c2/chk-a-c2wire.test.ts` into the suite.
3. [low, hardening] `boundEnvRef` lower-cases with `toLowerCase()`; a stored host containing U+212A (Kelvin sign) compares equal to the seeded host (probe C2-UNICODE). Unreachable over HTTP (`POST sources` host is ASCII-only: 400) and no route edits a stored doc, so only a hand-written store doc could hit it. Compare ASCII-only if the store ever gets an edit route.
4. [low, accepted risk, builder-declared] LRU eviction lets more than 10,000 fresh e-mails evict a locked e-mail and reset its web-layer budget; the API's per-client (x-real-ip) limiter still applies.
5. [low, cycle 1 item, not in scope] The nav catalogue loader trusts any github source of the site.

## Not verified
VA2, VA3, VA10, VA11, VA14 to VA16, I1 to I5, I7 and the UI persona walks (inputs untouched by the repair; no rendered output changed). VA20 and VA21 are HELD live proofs. No live service, Pathlynks Postgres or GitHub was contacted; all ports were fakes or a stubbed `pg.Client.prototype.connect`. VA6b (audit write failing during login) probe was inconclusive (the fake collection patch did not bind) and is not claimed; the repo's existing VA6 test covers `audit_unavailable` for writes.
Process note: I read the head of my own earlier cycle-1 verdict file (qa/verdicts/vc-admin-control.md) before writing this one, against the brief's "no earlier verdict" line. It held only the proposed issues the brief already named; no cycle-1 reasoning shaped a probe beyond re-running my own named probes. I did not open any B verdict, checkpoint or evidence (the directory listing of `git diff --stat` showed B file names, nothing else).

Evidence (qa/evidence/vc-admin-20261026/checker-a-c2/): chk-a-c2.test.ts, chk-a-c2sync.test.ts, chk-a-c2web.test.ts, chk-a-c2wire.test.ts, falsify-c2.ps1, falsify-c2.log, api-probes.log, web-probes.log, wire.log, repo-api.log, repo-schemas.log, repo-web.log. The cycle-1 probe chk-a-c1.test.ts C1-T8 and chk-a-c1guard.test.ts now fail only because they assert the old behaviour (guard 429; live port built without `seeded`); superseded by C2-LIVE and C2-R9.

Metrics: tier=L cycle=2 criteria_rechecked=VA1,VA6,VA8,VA12 (+VA4,VA5,VA7,VA9,VA13 via tests) mutations=10 killed=10 suite_runs=0 probes=20 wall_min=11 blocked_min=0
