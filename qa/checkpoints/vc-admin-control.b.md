# Checkpoint - vc-admin-control, coordinator B (blind)
Verdict written: FAIL (cycle 0), qa/verdicts/vc-admin-control.b.md. No resume needed.
Judged code: 914a61d (HEAD a4cbe0a adds qa files only). Base 1283b23.

## Evidence identities
- Hostile probe: scratchpad probe-b.mts (outside repo), run via vc-testlock from apps/api at 914a61d; result 49 OK / 3 BAD (2 artefacts, 1 low) ; H1 exploit reproduced (admin source passwordRef=VC_ADMIN_MASTER_KEY, host attacker.example; tokenRef=VC_ADMIN_JWT_SECRET).
- apps/api 222 tests (admin-sync, admin-secrets-leak, partners, index, main, auth, chat-privacy, anonymous-zero-persistence) pass.
- Sub-checkers: T (reruns, statics), W (browser walks), F (M1-M8 falsifications) - findings folded into the verdict.
- packages/db 141/141 with apps/web/.next moved aside (restored after).

## For the repair checker
Failed criterion: F1 (env-var and host exfiltration by role admin via source create + test/sync). Re-run: the H1 section of the probe on the repaired head, admin-routes.test.ts, admin-sync.test.ts, admin-secrets-leak.test.ts, plus one falsification of the repair.
