# Build brief: w1-counsellor-tenant-guard (/maker build subagent)

**Slug:** w1-counsellor-tenant-guard. Follow every rule in qa/evidence/p1-briefs/w1-common-rules.md. Read that file first.

- **Tier:** L.
- **Dual check:** required. `dual-trigger: tenancy apps/api/src/index.ts:522`.
- **Gate answer (verbatim):** "Answered: 2026-10-25 — (a) wrap the counsellor/admin JWT verifier in refuseTenantClaims (small L unit, dual check)".

## Read first
- `qa/gates/counsellor-jwt-partner-tenant.md`
- `qa/issues.jsonl` row ISS-pc-hardening-3-3
- `qa/manifests/pc-hardening-3.md`. Its K1 is the student-verifier twin of this unit.
- `apps/api/src/index.ts` ~500-560, and `refuseTenantClaims`

## Acceptance

### T1 (ISS-pc-hardening-3-3)
Make the counsellor/admin JWT verifier behave exactly as the student verifier does:
- It refuses a token whose tenant claim folds to an existing partner id or a reserved id. Folding uses the same NFKC normalization and case fold. The refusal is a uniform 401 with no detail.
- Exception: a tenant listed in VC_PARTNER_OWN_TENANTS as the partner's own bound tenant is allowed.
- An unrelated tenant is allowed.

Tests use a fake partner store and cover every counsellor/admin route family. Each family needs four cases:
- an equal tenant id
- a case or width variant
- a bound pair, which is allowed
- an unrelated tenant, which is allowed

### T2
- No new Mongo connection.
- With the partner registry off (VC_PARTNER_KEY_PEPPER unset), behaviour matches the student path's existing off-mode: a log line and no block.

## Regression
- Test files: auth, student-auth, server, index, main, partners, partner-voice, chat, go-live-gate.
- Typecheck: tsc for apps/api.
