# Verdict: vc-admin-control (checker A, dual check, Mode A)

**Cycle checked: 0**  |  Feature head checked: 914a61d (code unchanged through 84697fd; later commits are qa files only)  |  Contract: qa/contracts/vc-admin-control.md @1283b23  |  Policy-Version proportional-verification/2026-10-19.17

CHECK PLAN (opened first): (1) blind hostile probes of the auth/route/source surface against HEAD in a scratch copy; (2) own browser walks, VA19 per role and VA18 floater, against the real `withAdminRoutes` API and `next dev`; (3) falsification floor in the scratch copy (green, red, restored) for VA4, VA5, VA13, G6, G1; (4) diff-scope read of 9cc4c73...HEAD. Not re-run: criteria whose only evidence is the maker's own pre-check lines (listed under SCOREBOARD).

VERDICT: FAIL

SCOREBOARD (criterion: result, how)
- VA1 (C): FAIL. Server env secrets can be exfiltrated by an `admin` role (P1). Scoped static/leak tests still pass.
- VA4 (C): PASS. Probes T1-T5 (alg none, wrong secret, missing/other typ, expired, voice ticket, replay, per-IP limiter, role from store not claim) hold; F1 below.
- VA5 (C): PASS. Role matrix 70/70; F2; browser: admin has no Admins link and 403 on admins/secret routes, viewer 403 on all 6 write routes via the proxy, cookie alone authorises nothing (401).
- VA6 (C): PASS (role-matrix audit rows ran inside the 70/70 suite; not separately falsified).
- VA8 (H): FAIL via P1 (arbitrary host/ref accepted by POST sources); Test/Sync themselves work (Test "Connection works.", Sync ok).
- VA12 (C) / VA13 (C): VA13 PASS (F3). VA12 FAIL via P2 (live port hijack). G6 allow-list PASS (F4); G1 exact-"1" override PASS (F5).
- VA17 (H) / VA19 (H): VA19 FAIL on one item (P3); everything else in the walk passed. VA17 aggregation math correct when the window includes the day (900 tokens, 0.06 USD, 3 students = 1.70 INR).
- VA18 (H): PARTIAL PASS. Walked at 1280x800 and 360x640: drag clamps in viewport, resize floors at exactly 300x380, pop-out URL is `/vc-popout?site=demo` only, no local/sessionStorage/cookies, no horizontal scroll; widget unit tests 69/69. NOT walked: Chat|Voice toggle with shared history (the voice add-on is not served by the stub, so the toggle stays hidden); maker screenshots exist but I did not verify them.
- VA2, VA3, VA7, VA9, VA10, VA11, VA14, VA15, VA16, I1-I5, I7: NOT RE-RUN (time budget); maker pre-checks not accepted as evidence. I6: breached in spirit by P1/P2 (DB credentials and student-id queries can be sent to an attacker host); no production write observed.
- VA20 HELD (G1/G2). VA21 HELD.

TIER: L. Falsification floor met for 5 changed C/H criteria (F1-F5, 5/5 red after mutation, green before and after restore).

FAILURES
- P1 (critical, VA1/VA8/I6): `POST /admin/api/sources` is `minRole: "admin"` (admin-routes.ts ~:517-534). `PostgresSourceConfig` accepts any host and any `passwordRef` env name, `GithubSourceConfig` any `tokenRef` (packages/schemas/src/sources.ts). `credentialFor` (admin-routes.ts:389-394) resolves that name from the server env and the Test/Sync route hands it to the port. Reproduced (chk-a-probe.test.ts T6): pg.Client was constructed with host attacker.example.com and a password equal to the server env secret (the admin JWT secret, which lets an admin forge a super-admin token); the GitHub port token equalled the env secret. Fix: super-admin-only source create, or an allow-list of hosts and refs.
- P2 (critical, VA12/I6): `createLivePathlynksPort.build` (admin-routes.ts:853-865) takes the first postgres source by id across all sources (`store.sources.list()` is sorted by id, admin-store.ts:343-347). An admin-created postgres source with id `aaa-evil` takes over the live chat port; the real PATHLYNKS_DB_PASSWORD and each student-id query go to the attacker host. Reproduced (T8). Fix: bind the live port to the seeded source id and site; add edit/delete audit.
- P3 (medium, VA19/VA17): the dashboard's default window sends `to=<today UTC>` (apps/web/src/app/admin/_lib/format.ts:25-29, client.ts:~203) but `aggregateMetrics` treats `to` as exclusive (admin-store.ts:452-475), so today's usage never shows. Browser: default range shows tokens 0 and "No conversations in this range."; setting To to tomorrow shows tokens 900, cost per student 1.70, 1 row. The maker's walk used a stub API, so it could not see this.
- Observation, not blocking (code read only): voice usage rows store session length in `latencyMs` (voice.ts, ~19-line diff), which would skew latency p50/p95 once real voice sessions land.

CAPABILITY-COVERAGE: admin UI per role (super-admin, admin, viewer, anonymous, tampered cookie) and floater walked; hostile proxy paths (`..%2f`, `//host`, `http://host`, NUL) returned 400/404, never 200; Chat|Voice toggle, voice sessions, key rotation under live traffic, real Postgres/GitHub NOT exercised (fakes only, by constraint).
LIVE-BROWSER: yes. Admin: `qa/evidence/vc-admin-20261026/checker-a/ui/` (step-log.md is run 2; run 1 was 29/32 and its 3 fails were my proxy helper omitting the Authorization header, fixed in run 2; run 2 repeated state-dependent steps that had already PASSed in run 1). Widget: `.../checker-a/widget/`. Falsification log: `.../checker-a/falsify.log`.
ISSUES-WRITTEN: none (checker A writes PROPOSED-ISSUE lines only).
EXECUTOR: checker A (Sonnet 5.5), solo; no sub-agents.

EXPLANATION: The auth, role gate, tenant gate, G6 and G1 controls are real and each mutation turns the suite red. The failure is one level up: the same `admin` role that may add a source can point it at any host and any env-secret name, and the live Pathlynks port trusts the first source it finds, so a mid-privilege account can steal the admin signing secret and the production DB password (criticality C, I6). The dashboard default window also hides today's traffic.

PROPOSED-ISSUE: {"id":"P1","sev":"critical","crit":"C","criterion":"VA1,VA8,I6","title":"admin role can create postgres/github source with arbitrary host and env-ref, exfiltrating server env secrets on Test/Sync","evidence":"apps/api/tests/chk-a-probe.test.ts T6 (scratch copy); admin-routes.ts:389-394,517-534; schemas/src/sources.ts","fix":"super-admin-only create or host/ref allow-list; audit"}
PROPOSED-ISSUE: {"id":"P2","sev":"critical","crit":"C","criterion":"VA12,I6","title":"live Pathlynks port picks first postgres source by id; admin-created source hijacks DB password and student queries","evidence":"T8; admin-routes.ts:853-865; admin-store.ts:343-347","fix":"bind to seeded source id/site; no ref reuse"}
PROPOSED-ISSUE: {"id":"P3","sev":"medium","crit":"H","criterion":"VA19,VA17","title":"dashboard default range to=today excludes today (to exclusive); shows zero for live traffic","evidence":"browser super-dashboard.png vs super-dashboard-to-plus1.png; format.ts:25-29; admin-store.ts:452-475","fix":"send to = day after, or make to inclusive; add a real-API UI test"}
Metrics: start=2026-10-26T23:25:32+05:30 end=2026-10-27T00:05:28+05:30 wall_min=41 agent_min=41 blocked_min=6 suite_runs=17 repeat_runs=3 mutations=5 cycle=0 resumes=1 tokens=n/a policy=proportional-verification/2026-10-19.17 check_s=2460 mutants=5/5 killed defects_unit=0 defects_6c=3
