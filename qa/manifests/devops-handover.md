# Manifest: devops-handover

Status: ready-for-check
Fix cycle: 0
Policy-Version: proportional-verification/2026-10-19.17
Tier: S (health/readiness routes on the API, an nginx location, .env.example names, package.json scripts/engines; no auth, no data write)
Dual check: no (no security/auth/tenancy/prod-write trigger: the routes are unauthenticated read-only pings that return no data)
Base: b1ecb6ae
Source: Umesh 2026-11-02, approved plan "VC DevOps handover" (README + only the fixes that block DevOps). Gaps: qa/evidence/deploy-readiness.md 11, 14, 17; reviewer findings 2026-11-02 (VC_GATE_APPROVER undocumented, Node 20.16 for process.getBuiltinModule, pnpm unpinned).

Round: one round, 2 parallel builders by file ownership (A: product files; B: docs), est 6 h including 3 cold-read fix rounds.
slow-plan: the docs lane (H4) needed three independent cold-read and fact-check fix rounds; the product lane (H1-H3) was done in the first hour; H4 cannot be split off without shipping a runbook that was never read cold.

## Acceptance criteria
- H1: GET /health returns 200 {"status":"ok"} with no dependency call and no auth; GET /ready returns 200 {"status":"ready"} when a Mongo ping on the virtual_counsellor client succeeds within about 1 s, else 503 {"status":"unavailable"}. Neither body carries host, error text, env value or version; neither is throttled by the anonymous limiter; an unknown path still 404s. infra/ubuntu/nginx-vc.conf proxies both.
- H2: .env.example lists every env NAME the API process reads (incl. VC_GATE_APPROVER), names and comments only, no values beyond safe placeholders.
- H3: apps/web has a start script (next start on its port); root package.json engines.node is >=20.16 and packageManager pins pnpm; tsx is a runtime dependency of apps/api.
- H4 (docs-lane): docs/DEVOPS-HANDOVER.md is an ordered, owner-tagged runbook that a DevOps engineer can execute without asking (cold-read agent returns no open question), and every env name, command and path in it matches the repo.

## Changed files
Head: 987afc80
apps/api/src/server.ts (withHealthRoutes), apps/api/src/index.ts (mount), apps/api/tests/health.test.ts (new), apps/api/tests/partners.test.ts (nginx assertions), infra/ubuntu/nginx-vc.conf, infra/ubuntu/vc-api.service (comment only), infra/ubuntu/README.md, .env.example, package.json, apps/api/package.json, apps/web/package.json, pnpm-lock.yaml, docs/DEVOPS-HANDOVER.md.

## Pre-check
Pre-check[H1]: 987afc80 `pnpm exec tsx --test tests/health.test.ts tests/partners.test.ts` (cwd apps/api, via vc-testlock) -> exit 0, 86 passed, 0 failed
Pre-check[H2]: 987afc80 same command -> exit 0, 86 passed; and a name sweep: every UPPER_SNAKE name in docs/DEVOPS-HANDOVER.md found in the repo (91 names; the only three absent are GIT_SSH_COMMAND, GIT_TERMINAL_PROMPT, VERSION_CODENAME, which are git and os-release variables, not VC names)
Pre-check[H3]: 987afc80 `pnpm install --frozen-lockfile --offline` -> exit 0, and `pnpm -C apps/api exec tsc --noEmit` -> exit 0
Pre-check[H4]: 987afc80 path sweep of docs/DEVOPS-HANDOVER.md (every apps/, infra/, docs/, packages/, scripts/, config/, qa/ path it cites) -> exit 0, 0 missing files; three independent cold-reads and one code fact-check were run and every finding fixed in 987afc80 (the residual open items are section 11 Not confirmed rows for Umesh or DevOps)

## Tests
Tests[H1]: apps/api/tests/health.test.ts (8 tests: /health 200 with the ping never called, /ready 200 on a good ping, 503 on a rejected ping and on a ping that hangs past 1 s, fixed bodies with no error text, unknown path 404, non-GET 405, bypasses the anonymous limiter) and apps/api/tests/partners.test.ts nginx assertions (location = /health and = /ready exist, no limit_req, no Access-Control) — prove each H1 clause; the maker also ran a 200-mapping mutant (4 red) and a no-timer mutant (hang) against health.test.ts
Tests[H2]: the name sweep above plus the independent code fact-check — no unit test reads .env.example; the sweep is the proof for names, the fact-check for completeness against the code
Tests[H3]: pnpm install --frozen-lockfile (lockfile consistent with the moved tsx) and tsc --noEmit — package.json fields are config, not behaviour
Tests[H4]: docs-lane: no unit test; proof is the path sweep, the name sweep, three cold-reads and the code fact-check
