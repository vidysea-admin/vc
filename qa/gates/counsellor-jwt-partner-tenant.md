# HUMAN_GATE: counsellor/admin JWT and partner-id tenants (ISS-pc-hardening-3-3)
Opened: 2026-10-22T18:41:14+05:30
Question: should the counsellor/admin JWT verifier (apps/api/src/index.ts:522) also refuse a tenant claim that folds to a partner id, like the student verifier now does?
Options: (a, recommended) wrap it too: same refuseTenantClaims guard, small L unit, dual check; (b) do not wrap: record that the counsellor IdP never mints partner-id tenants (a trust assumption on the IdP).
Answer format: reply "counsellor guard: a" or "counsellor guard: b".
Blocks: only ISS-pc-hardening-3-3; no other unit waits on it.
