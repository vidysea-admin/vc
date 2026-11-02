# Manifest: devops-handover

Status: ready-for-check
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
Head: 987afc80
apps/api/src/server.ts (withHealthRoutes), apps/api/src/index.ts (mount), apps/api/tests/health.test.ts (new), apps/api/tests/partners.test.ts (nginx assertions), infra/ubuntu/nginx-vc.conf, infra/ubuntu/vc-api.service (comment only), infra/ubuntu/README.md, .env.example, package.json, apps/api/package.json, apps/web/package.json, pnpm-lock.yaml, docs/DEVOPS-HANDOVER.md.

## Pre-check
Pre-check[H1]: 987afc80 `pnpm exec tsx --test tests/health.test.ts tests/partners.test.ts` (cwd apps/api, via vc-testlock) -> exit 0, 86 passed, 0 failed (health.test.ts: 8 tests incl. /ready 503 on a failed ping and on a hang past 1 s; partners.test.ts asserts location = /health and = /ready carry no limit_req and no Access-Control)
Pre-check[H2]: 987afc80 same command -> exit 0, 86 passed, 0 failed; env-name coverage was cross-checked by an independent code fact-check (verdict Warning, every finding fixed in 987afc80)
Pre-check[H3]: 987afc80 `pnpm install --frozen-lockfile --offline` -> exit 0; `pnpm -C apps/api exec tsc --noEmit` -> exit 0
Pre-check[H4]: 987afc80 three independent cold-reads (30, 17, 19 open questions; each round fixed) plus the code fact-check (Warning, all items fixed in 987afc80) -> literal zero questions is not reachable with model cold-readers; the residual items are rows in section 11 Not confirmed, owned by Umesh or DevOps
Falsify[H1]: 987afc80 health.test.ts against a 200-mapping mutant -> 4 red; against a no-timer mutant -> hang caught

