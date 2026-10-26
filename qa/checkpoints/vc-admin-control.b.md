# Checkpoint - vc-admin-control, coordinator B (blind)
Cycle 0: FAIL (verdict superseded at the same path by cycle 1; cycle 0 is in git history, commit 84697fd).
Cycle 1: FAIL, qa/verdicts/vc-admin-control.b.md, Cycle checked: 1. No resume needed.
Judged code: 78ddaef (HEAD b54c11f adds qa files only). Repair base 914a61d. Base 1283b23.

## Evidence identities (cycle 0)
- Hostile probe: scratchpad probe-b.mts (outside repo), run via vc-testlock from apps/api at 914a61d; result 49 OK / 3 BAD (2 artefacts, 1 low) ; H1 exploit reproduced (admin source passwordRef=VC_ADMIN_MASTER_KEY, host attacker.example; tokenRef=VC_ADMIN_JWT_SECRET).
- apps/api 222 tests pass; packages/db 141/141 with apps/web/.next moved aside.

## Evidence identities (cycle 1, head 78ddaef)
- probe-b.mts re-run: H1/H1b exfil closed (create 400). qa/evidence/vc-admin-20261026/checker-b-c1/probe-b-original-rerun.log
- probe-h1-c1.mts (new): H1a/H1b/H1c pass, H1d residual host exfil FAILS (admin + PATHLYNKS_DB_PASSWORD + host attacker.example -> port got the secret). .../probe-h1-c1.log
- apps/api admin-auth/routes/secrets-leak/sync 112/112; apps/web 26/26; engine 152/152; schemas sources 14/14. Static VA1 greps clean.
- Falsification m1-m4 in throwaway copies, green-before / red-after: .../falsify-m1-m4.log, falsify-driver2-m2.sh (m2 rebuilt after a missing fixture dir).

## For the next repair checker (cycle 2)
Failed: VA1, VA8 (P1 host binding of env-ref credentials), plus VA6 (P2). Re-run probe-h1-c1.mts H1d and the VA1 variants in H1a-H1c; do not re-prove VA5 unless admin-routes.ts route table changes.

## Cycle 2 (head 6b8674c, repair base 78ddaef): PASS, qa/verdicts/vc-admin-control.b.md, Cycle checked: 2. No resume needed.
Evidence identities (all under qa/evidence/vc-admin-20261026/checker-b-c2/, run via vc-testlock on 6b8674c tree):
- probe-h1-c2.mts (P0-P7): 8/8 pass; command `pnpm exec tsx --test <probe>` from apps/api; log probe-h1-c2.log.
- probe-startapi-c2.mts: startApi over HTTP with the real config/sources.json and fake mongo/github/postgres: 1/1; log probe-startapi-c2.log.
- affected-tests-c2.log: apps/api admin-auth/admin-routes/admin-secrets-leak/admin-sync/chat-pathlynks 133/133; packages/schemas tests/sources.test.ts 15/15; apps/web admin-session-routes + admin-client 27/27; tsc --noEmit exit 0 in schemas, api, web.
- Falsification, copies in scratchpad/fb2b (outside repo): m1 boundEnvRef host check removed, m2 429 login audit removed, m3 index.ts seededSources spread removed; each green-before, red-after (falsify-c2.run1.log m1+m2, falsify-c2.m3.log m3; run1 m3 was an invalid setup). m3-repo-suite.log: the repo's api suite stays green (152/152) with the wiring removed.
- Static VA1 greps: clean (env names only).
Not re-proved (inputs untouched by the repair): VA2-VA4, VA7, VA9-VA19 other than VA12/VA5; they keep cycle-1 results.
