# Verdict: vc-admin-control (checker A, repair check)
Cycle checked: 1
Verdict: FAIL
Bound: repair base 914a61d, code head 78ddaef (tree HEAD at write 80ec3e0 adds only qa/ files). Tier L, policy proportional-verification/2026-10-19.17. Written 2026-10-27T01:30+05:30.

## Check plan (stated before running)
1. Re-run my cycle-0 probes T6 (credential-ref exfil) and T8 (live-port takeover) against the repaired tree.
2. Read the full repair diff 914a61d..78ddaef; flag any file outside the owned list; judge the dashboard/page.tsx edit.
3. Re-run every criterion whose input files the repair touched, via vc-testlock, per package, no full suite.
4. One falsification per repaired criterion (green before, red after, in a throwaway copy outside the repo): VA1 x2, VA12, VA8, VA19.
5. VA1 hostile variants: lowercase, whitespace, unicode names, stored legacy doc, env value in error text.
6. Not re-run (inputs untouched): VA2, VA3, VA9, VA11, VA14, VA15, VA16, I1-I5, I7.

## Result
- Commands (bound tree, per package, via vc-testlock): engine 152/152, schemas 14/14, web 26/26 pass; api suites pass incl. my probes C1-T6, C1-T8, C1-VA1 matrix, C1-VA1 legacy, C1-P3 (c1-run.log.txt, 5/5 pass).
- Falsification (falsify-c1.log.txt): F1 schema allow-list removed -> R1 schema test + admin-routes R1 red. F2 credentialFor guard removed -> stored-doc R1 + legacy-doc probe red. F3 live port picks first postgres source -> R2 + C1-T8 red. F4 empty-sync guard disabled -> 3 R6 tests red. F5 metricsWindow reverted -> R3 web test + C1-P3 red. 5/5 killed; each green before. Note: the schemas copy showed 2 unrelated failures before the mutation (.env.example not in the throwaway copy); the real tree is 14/14.
- Diff scope: only the owned files plus apps/web/src/app/admin/(console)/dashboard/page.tsx (one line, `api.metrics({...metricsWindow(range),...})`, the only metrics call site). Accepted as in scope.

## Criteria
- VA1 FAIL (critical). The named exfil (VC_ADMIN_JWT_SECRET, VC_ADMIN_MASTER_KEY, MONGODB_URL) is closed, including lowercase, whitespace, unicode and stored legacy docs (refused at use time, fixed sentence, no env value in response, log or audit). But the same defect class remains through the allow-listed names. An `admin` creates a postgres source with host=attacker.example.com and passwordRef=PATHLYNKS_DB_PASSWORD, then calls Test: `credentialFor` (admin-routes.ts:428-435) resolves the real value and `createPostgresTestPort` (:972-981) hands it to pg.Client; the probe saw hosts ['attacker.example.com','attacker.example.com'] and the password equal to the real PATHLYNKS_DB_PASSWORD (and to GITHUB_TOKEN for a tokenRef). A github source with tokenRef=PATHLYNKS_DB_PASSWORD likewise sends the DB password as a GitHub token. The host is unrestricted (sources.ts HostName). Repro: chk-a-c1.test.ts "C1-RESIDUAL".
- VA12 PASS on the repaired property (admin-created postgres source, any id, no longer becomes the live Pathlynks port; seeded id keeps it; duplicate id 409). The "no secret leaves" part is still affected by the VA1 residual.
- VA8 PASS (empty or no-table or all-failing sync records error and keeps the prior artifact), subject to PROPOSED-ISSUE 3.
- VA19 PASS (default window now contains today and the last ms of today; tomorrow excluded; from==to works), through the real metrics route.
- Touched, tests green: VA4, VA5, VA6, VA7, VA10, VA13. VA6 has a contract tension (PROPOSED-ISSUE 4).

## PROPOSED-ISSUE (dual check: not written to the ledger by me)
1. [critical, VA1/VA12] Allow-listed env refs can be sent to an admin-chosen host (see VA1). Fix direction: resolve env refs only for seeded sources (admin-created ones use a stored encrypted secret), or pin postgres/github hosts to an allow-list and bind the ref prefix to the kind (PATHLYNKS_* only for postgres, GITHUB_* only for github). The same criterion failed twice in the same class: the no-progress/STALLED rule applies, so cycle 2 should be Opus-escalated with a fix that closes the class, not the instance.
2. [medium, R9] Pre-auth login lock-out. `createLoginGuard` fails closed when its table is full (`hits.size >= maxKeys`). Repro (chk-a-c1guard.test.ts): 10,000 distinct attacker-chosen e-mails fill it in about 0.5 s and a legitimate admin's first login then gets 429 without reaching the API. Fix: evict the oldest key instead of failing closed, or bound by something the attacker cannot vary.
3. [medium, R6] The `diagnostics >= files` heuristic gives a false error. Repro (chk-a-c1sync.test.ts): four valid createTable migrations, each with one raw `sequelize.query`, answer status error with tables 4.
4. [medium, VA6/R5] The contract text for VA6 does not match R5 (bounded login audit); the VA6 test is now vacuous for rate-limit rows. The contract needs a checker amendment; I did not edit qa/contracts/.
5. [low, nav] The nav catalogue loader trusts the newest nav_catalogue from any github source of the site, including admin-created ones.

## Not verified
VA9/VA2/VA3/VA11/VA14-16/I1-I5/I7 (inputs untouched). Widget toggle UI not walked this cycle. The cycle-0 evidence file falsify.log in checker-a/ was overwritten by mistake during copy-in; cycle-1 results are in falsify-c1.log.txt.

Metrics: tier=L cycle=1 criteria_rechecked=VA1,VA8,VA12,VA19 (+VA4-7,VA10,VA13 via tests) mutations=5 killed=5 suite_runs=0 probes=5 wall_min=n/a (start not stamped, est 30-55) blocked_min=unknown agents=0 PROPOSED-ISSUES=5
