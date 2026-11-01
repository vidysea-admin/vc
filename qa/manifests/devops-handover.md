# Manifest: devops-handover

Status: in-progress
Fix cycle: 0
Policy-Version: proportional-verification/2026-10-19.17
Tier: S (health/readiness routes on the API, an nginx location, .env.example names, package.json scripts/engines; no auth, no data write)
Dual check: no (no security/auth/tenancy/prod-write trigger: the routes are unauthenticated read-only pings that return no data)
Base: b1ecb6ae
Source: Umesh 2026-11-02, approved plan "VC DevOps handover" (README + only the fixes that block DevOps). Gaps: qa/evidence/deploy-readiness.md 11, 14, 17; reviewer findings 2026-11-02 (VC_GATE_APPROVER undocumented, Node 20.16 for process.getBuiltinModule, pnpm unpinned).

Round: one round, 2 parallel builders by file ownership (A: product files; B: docs).

## Acceptance criteria
- H1: GET /health returns 200 {"status":"ok"} with no dependency call and no auth; GET /ready returns 200 {"status":"ready"} when a Mongo ping on the virtual_counsellor client succeeds within about 1 s, else 503 {"status":"unavailable"}. Neither body carries host, error text, env value or version; neither is throttled by the anonymous limiter; an unknown path still 404s. infra/ubuntu/nginx-vc.conf proxies both.
- H2: .env.example lists every env NAME the API process reads (incl. VC_GATE_APPROVER), names and comments only, no values beyond safe placeholders.
- H3: apps/web has a start script (next start on its port); root package.json engines.node is >=20.16 and packageManager pins pnpm; tsx is a runtime dependency of apps/api.
- H4 (docs-lane): docs/DEVOPS-HANDOVER.md is an ordered, owner-tagged runbook that a DevOps engineer can execute without asking (cold-read agent returns no open question), and every env name, command and path in it matches the repo.

## Changed files
(filled at ready-for-check)
