# Verdict: devops-handover

Date: 2026-11-02 (end 13:05 +05:30)
Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
Checked commit: 0182a899 (content head 987afc80, base b1ecb6ae). Bound to D:/vc/.worktrees/vc-completion.
Checker: fresh Sonnet subagent, read-only toward the artifact. No network, no .env values read. Nginx is not installed here.

## Check plan (step 0)
Tier S (health routes, an nginx location, env names, package.json fields; no auth/data write). Checks: H1 tests + hostile HTTP variants + 3 mutants in a scratch copy; H2 own env-name sweep; H3 package/lock facts; H4 own path/name sweep + 15 code-backed claims + gate CLI run. Dual check not required (manifest: no trigger; none found: routes are unauthenticated read-only pings).

VERDICT: PASS (H1, H2, H3 PASS; H4 PASS on everything mechanical, plus one wording item for Umesh, see HUMAN_GATE-REQUEST)
SCOREBOARD: 4/4 criteria met (H4 with the residual below)
TIER: S (no security/auth/tenancy/prod-write line changed; the two new routes sit before auth by design and return fixed bodies)
CAPABILITY-COVERAGE: 3/3 mutants reproduced (green-before in the scratch copy, red-after)
LIVE-BROWSER: not-applicable (no UI file changed; apps/web/package.json gained a script only)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)

## H1 PASS
- Tests, via `bash scripts/vc-testlock.sh pnpm exec tsx --test tests/health.test.ts tests/partners.test.ts` (cwd apps/api): tests 86, pass 86, fail 0, EXIT 0.
- Mount order read: apps/api/src/index.ts:1123 `createApiServer(withHealthRoutes(mountedHandler, ...))`. `mountedHandler` is the admin wrapper around `publicHandler` (anonymous, chat, voice, partner), so health is outermost, before auth, CORS and the anonymous limiter. `createApiServer` is the only `createServer` use in apps/api/src.
- Own raw-socket run of withHealthRoutes over a real http server (/scratchpad/hostile.mts), 29 variants. Intended handler only for exact `/health`, `/ready`, with a query string, `/./health`, `/x/../health`, `#frag`, absolute-form `http://evil/health` (all 200, main never called). HEAD, POST, PUT, DELETE, OPTIONS on the two paths: 405 and main never called. `/HEALTH`, `/Ready`, `/health/`, `/ready/`, `//health`, `//ready`, `/healthz`, `/readyz`, `/health;a=b`, `/%68ealth`, `/ready%2f`, `*`: fall through to main (404 here). Lowercase `get`: 400 from node. No variant reaches a side-effect handler through the health branch.
- Body leak: a ping rejecting with `mongodb://u:s3cr3t@internal-host...` gave 503 `{"status":"unavailable"}`, no secret or host in the response. Bodies are fixed literals; headers only content-type, cache-control, nosniff.
- Hung ping: 503 in 1007 ms. `/health` on the same server stays 200.
- nginx (infra/ubuntu/nginx-vc.conf:33,43): `location = /health` and `location = /ready`, each `proxy_pass http://127.0.0.1:8080`, no `limit_req`, no Access-Control (parsed the blocks: both False). Braces 17 open / 17 close after comment strip. Not run through `nginx -t` (not installed). partners.test.ts asserts the same blocks (in the 86 green).
- Falsification (copy at scratchpad/mut, node_modules junctioned; health.test.ts green 8/8 in the copy before): M1 503 mapped to 200 -> 4 red on the 503 assertions; M2 405 line removed -> 1 red (405 test); M3 index.ts mount moved to the inner `handler` -> 1 red (anonymous limiter test). Copy discarded; bound tree untouched (`git status` shows only the pre-existing `?? apps/api/qa/`).

## H2 PASS
Own sweep: `env.X`/`env["X"]` reads and every quoted UPPER_SNAKE literal in apps/api/src, mcp/*/src, packages/{db,providers,engine,schemas,observability}/src, compared with names in .env.example. Absent from .env.example: only (a) LANGFUSE_* (packages/observability/src/config.ts:55-57; `loadTracingConfig` has no caller outside tests, the API never reads them), (b) VC_REAL_MODEL (providers/src/index.ts:2084, eval runners only), (c) VC_USD_INR (apps/api/src/admin-routes.ts:1042, a documented alias of VC_USD_INR_RATE, which is listed), the rest are code constants. VC_GATE_APPROVER present (.env.example, new block). No secret values: only `<placeholder>` text and non-secret defaults.

## H3 PASS
- apps/web/package.json:11 `"start": "next start --hostname 127.0.0.1 --port 3108"` (same port as `dev`/`demo`). nginx-vc.conf has no location for the web app at all (README step 7 says Admin is separate), so the port cannot "match nginx"; low note, not a defect (runbook 9b: console out of scope).
- package.json: `engines.node ">=20.16"`, `packageManager "pnpm@10.33.0"`. apps/api/package.json: tsx under `dependencies`; pnpm-lock apps/api importer lists tsx (specifier ^4.21.0) under `dependencies` only.
- `bash scripts/vc-testlock.sh pnpm install --frozen-lockfile --offline --lockfile-only` -> "Done in 499ms using pnpm v10.33.0", EXIT 0. (`--lockfile-only` added so shared node_modules was not relinked; lockfile consistency is what the clause tests.)

## H4 PASS on evidence (one clause for Umesh)
- Own sweep: 26 repo paths cited -> 0 missing; 91 UPPER_SNAKE names -> all found in the repo; pnpm subcommands used (`install --frozen-lockfile`, `start`, `go-live-gate`, `partner`) all exist as scripts. Ordered A0-A7, B1-B11, C0..; every checklist row is owner-tagged (DevOps/Umesh/Pathlynks/Vidysea).
- 15 claims checked against code: gate CLI really run (`VC_GATE_APPROVER=Umesh pnpm go-live-gate anonymous` -> `go-live gate (A20) target=anonymous: ALLOWED` plus the four `ok` lines, EXIT 0, byte-for-byte as section 6); FUTURE_SKEW_MS 5 min (go-live-gate.ts:48); systemd unit values (RestartSec=5, TimeoutStopSec=30, ProtectSystem=full, ProtectHome=true, KillSignal, no `-` on EnvironmentFile); VC_API_PORT default 8080 (index.ts:200); VC_ANONYMOUS_ENABLED trimmed, exact "true" (anonymous.ts:99-103); VC_CHAT_ENABLED exact, untrimmed (chat.ts:193); VC_KB_TIMEOUT_MS 1000..30000 (main.ts:146); VC_ERASURE_AUTO_DELETE default false (erasure.ts:277); grounding caps 5/500 (providers:1222); VC_ADMIN_JWT_SECRET >=32 chars (admin-auth.ts:26), VC_ADMIN_MASTER_KEY base64 of exactly 32 bytes (secrets.ts:40); pepper and audit key >=32 (partners.ts:144, erasure.ts:192); VC_LLM_PROVIDER has no default (providers:205); text-chain cap required with a chain (index.ts:237); built-in prices glm-5.3-flash and deepseek-v4.1-flash (providers:1852); PEM `\n` replaced (auth.ts:198); tracing switches `true|1|yes|on` (anonymous.ts:309); nginx `rate=20r/m`, `burst=10`, 429 and `/v1/` -> 404 (nginx-vc.conf:197). Zero wrong.
- No leaks: only 127.0.0.1, `checkip.amazonaws.com`, `deb.nodesource.com`, `repo.mongodb.org`, `ollama.com/v1`, `pathlynks.vidysea.com` (a public partner origin example). No IPs, tokens, DB credentials or connection strings in the runbook, HANDOFF.md or .env.example (pattern scan).
- Section 11 (27 rows): honest on the whole; rows 1-11, 14-15, 17-19, 21, 24, 26, 27 are inputs or decisions only Umesh/DevOps/other teams hold. Weak rows (low, not blocking): 16 (what a student sees on a wrong CA path is already answered by the code in step 9), 23 (a precondition, not a question), 13 and 22 partly answerable from docs (code default stated; systemd behaviour is external, not repo). None is answerable from the repo in a way that changes a step.
- The literal clause "cold-read agent returns no open question" was not reachable by the maker and I did not run a fourth cold read. What I can show: the remaining rows are external inputs, none blocks execution order. Whether that reading of the clause is acceptable is Umesh's call.

HUMAN_GATE-REQUEST: Accept H4's wording "a cold-read agent returns no open question" as met by "three cold-reads fixed; residual = section 11 rows that only Umesh or DevOps can answer"? (checker recommends yes).

## Scope (git diff b1ecb6ae..HEAD --name-only)
All manifest files present. Extra, not listed in Changed files: HANDOFF.md (doc, session handoff rewrite, no secrets) and qa/ bookkeeping (qa/.delivery briefs and requests, qa/evidence/reviews t059/t060/t061/voice-inner-caps, the manifest). No product file outside the list; no deletions of existing functions (diff of src/ is additive: +54 server.ts, 5 lines index.ts). apps/api/tests changes additive.

## Low findings (ledger rows, none blocking)
1. HEAD /health and /ready return 405 (server.ts withHealthRoutes `method !== GET`); a load balancer or uptime tool using HEAD would report failure. Runbook does not say GET only. Evidence: hostile run above.
2. Runbook 4e lists `VC_SKILLS_DIR` (read only by apps/web/demo/seed.ts, not the API) and `VC_WEBHOOK_SECRET`/`VC_WEBHOOK_DESTINATION_URL` (.env.example:35 says the drain worker is a separate process); harmless, over-listed names.
3. HANDOFF.md edited but absent from the manifest's Changed files.

Metrics: start=unavailable end=2026-11-02T13:05:16+05:30 wall_min=unavailable agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=3 cycle=0 resumes=0 tokens=unavailable policy=2026-10-19.17 check_s=unavailable mutants=2 defects_unit=0 defects_6c=0
