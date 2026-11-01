# Deploy-readiness gap audit (brief B, 2026-11-01)

Read-only audit of `codex/vc-completion` at 2fd5e40a. Nothing is deployed: there is no VC host, image or widget release (`qa/evidence/t057-demo.md:3`). All counts below come from files in this worktree (greps and reads run this session), not from memory. No value of any secret was read or printed; env entries are names only. I did not run `go-live-gate.ts` (it needs `VC_GATE_APPROVER` set, which is the Approver's value to supply, not mine), so the gate state below is from `docs/go-live-checklist.md`, not from a gate run.

Two milestones, because "first live URL" can mean two things:

- **M1 = first live URL**: one Ubuntu host answering the anonymous chat (`POST /v1/public/chat/turns`) through nginx + TLS, with the static student UI (`apps/student`) and the widget file served. This is the path `infra/ubuntu/` already describes.
- **M2 = embedded**: the widget loaded by the Vidysea and Pathlynks frontends, with personalised (student-JWT / partner server-key) chat.

## 1. What exists (inventory)

| Area | In repo | Evidence |
|---|---|---|
| Ubuntu install steps, nginx site, systemd unit | yes | `infra/ubuntu/README.md` (8 steps), `infra/ubuntu/nginx-vc.conf` (177 lines, 14 location blocks), `infra/ubuntu/vc-api.service` (27 lines) |
| Dockerfile for any service | **no** | `git ls-files` for `Dockerfile`, `.dockerignore`, `buildspec`, `.github`, `ecosystem`, `pm2` returns nothing |
| Compose | Langfuse only, dev-only, 6 services, all bound to 127.0.0.1 | `infra/langfuse/docker-compose.yml`, `infra/langfuse/README.md` (MUST 4: "never a substitute for a real deploy") |
| CI / pipeline | **no** | no `.github/`, no buildspec in the tree |
| Health / readiness endpoint | **no** | `grep -i health apps/api/src` finds only a comment (`apps/api/src/index.ts:868`); `ROUTES` (`apps/api/src/server.ts:339-670`) lists no health route; nginx answers every unlisted `/v1/` path 404 (`nginx-vc.conf:174`) |
| Go-live checklist, runbook, partner guide | yes | `docs/go-live-checklist.md` (95 lines), `docs/runbook-golive.md` (30), `docs/partner-integration.md` (159) |

## 2. Services, ports, entrypoints

| Service | Entrypoint | Port | Notes |
|---|---|---|---|
| VC API (HTTP + voice WebSocket on the same listener) | `pnpm -C apps/api start` = `tsx src/main.ts` (`apps/api/package.json:12`) | 8080 default (`apps/api/src/index.ts:200`, `.env.example:136`), **binds 127.0.0.1 only** (`apps/api/src/main.ts:139`, `index.ts:656`); no env override exists | tsx is a devDependency; systemd unit runs `pnpm -C apps/api start` (`vc-api.service:15`) |
| nginx | `infra/ubuntu/nginx-vc.conf` | 80 now (`:19`), 443 added by certbot | only public listener |
| Student UI | static, 3 files `apps/student/{index.html,app.js,style.css}` | via nginx root `/opt/vc/apps/student` (`nginx-vc.conf:23-27`) | posts keyless to `/v1/public/chat/turns` (`apps/student/app.js:4,52`) |
| Widget | static `apps/widget/src/{vc-widget.js,voice.js}`, no build | via nginx `/widget/*` (`nginx-vc.conf:136-171`) | no runtime env (0 env reads in `apps/widget/src`) |
| Admin console (`apps/web`, Next 16) | `next build --webpack`; dev/demo scripts on 3108 (`apps/web/package.json:45-46`) | 3108 | **no `start` script** (`apps/web/package.json:44-51`), no unit, no nginx server |
| `mcp/pathlynks`, `mcp/university-kb` | libraries imported by the API (`apps/api/package.json:22-24`) | none | `university-kb` also has a stdio bin (`mcp/university-kb/package.json:12`); not a deployable service. `mcp/student-profile` is not a dependency of `apps/api` or `apps/web` |
| Langfuse (optional) | `infra/langfuse/docker-compose.yml` | web 3000, worker 3030 (127.0.0.1) | not a startup dependency: no `loadTracingConfig` call in `apps/api/src` or `apps/web/src` |

## 3. Environment variable names per service (names only)

Method: `.env.example` has 67 names (`grep -oE '^[A-Z][A-Z0-9_]*='`). Reading `apps/api/src`, `apps/web/src`, `packages/*/src`, `mcp/*/src` gives 94 names the API process can read (81 literal + 13 `VC_STUDENT_JWT_*` built from a template, `apps/api/src/auth.ts:319-320`). 31 of the 94 are not in `.env.example` (gap 17). Three `.env.example` names are evidence-run only (`VC_EVIDENCE_MODE`, `VC_EVIDENCE_PORT`, `VC_EVIDENCE_UNIT`) and are not read by any service.

**VC API process (94 names).**
- Core: `MONGODB_URL`, `MONGO_CLIENT_TIMEOUT_MS`, `VC_API_PORT`
- Counsellor JWT (required whenever the HTTP API starts: `createJwtVerifier(jwtConfigFromEnv(env))`, `apps/api/src/index.ts:657`): `VC_JWT_ISSUER`, `VC_JWT_AUDIENCE`, `VC_JWT_ALGORITHMS`, `VC_JWT_PUBLIC_KEY`, `VC_JWT_JWKS_URL`, `VC_JWT_HS256_SECRET`, `VC_JWT_CLOCK_SKEW_SEC`
- Student JWT (13, needed when `VC_CHAT_ENABLED=true`, `main.ts:160-176`): `VC_STUDENT_JWT_` + `ISSUER AUDIENCE ALGORITHMS PUBLIC_KEY JWKS_URL HS256_SECRET CLOCK_SKEW_SEC CLAIM_TENANT CLAIM_STUDENT_ID CLAIM_ROLE CLAIM_IS_MINOR CLAIM_AGE CLAIM_GUARDIAN_CONSENT`
- Models and providers: `VC_LLM_PROVIDER`, `VC_LLM_MODEL`, `VC_LLM_BASE_URL`, `VC_LLM_API_KEY`, `VC_LLM_MODELS`, `VC_LLM_DEADLINE_MS`, `VC_LLM_ATTEMPT_TIMEOUT_MS`, `VC_LLM_RETRY_BUDGET`, `VC_MODEL_SUMMARY`, `VC_MODEL_ANSWER`, `VC_MODEL_ROUTER`, `GEMINI_API_KEY`, `GEMINI_PRICE_USD_PER_MTOK`, `VC_TEXT_CHAIN`, `VC_TEXT_CHAIN_HOP_TIMEOUT_MS`, `VC_TEXT_CHAIN_DEADLINE_MS`, `OLLAMA_API_KEY`, `OLLAMA_BASE_URL`, `OLLAMA_MAX_OUTPUT_TOKENS`, `OLLAMA_PRICE_USD_PER_MTOK`, `VC_CHAIN_MONTHLY_CAP_USD`, `VC_GROUNDING`, `VC_GROUNDING_MODEL`, `VC_GROUNDING_MAX_PER_DAY`, `VC_GROUNDING_MAX_PER_SESSION`, `VC_CONCERN_MODEL`, `VC_CONCERN_TIMEOUT_MS`, `VC_CONCERN_SAMPLE_RATES`, `VC_ANONYMOUS_SAFETY_SCREEN`, `VC_REPLY_LANGS`, `VC_TURN_DEADLINE_MS`
- Knowledge base: `VC_KB_BASE_URL`, `VC_KB_API_KEY`, `VC_KB_ANON_API_KEY`, `VC_KB_TIMEOUT_MS`, `VC_KB_BREAKER_FAILS`, `VC_KB_BREAKER_COOLDOWN_MS`, `VC_KB_ROUTE`, `VC_SPEAKERS_FILE`
- Surface flags and voice: `VC_ANONYMOUS_ENABLED`, `VC_CHAT_ENABLED`, `VC_VOICE_ENABLED`, `VC_VOICE_MODEL`, `VC_VOICE_WS_SECRET`, `VC_VOICE_WS_BASE_URL`
- Partners and gates: `VC_PARTNER_KEY_PEPPER`, `VC_PARTNER_KEY_REQUIRED`, `VC_RESERVED_TENANT_IDS`, `VC_PARTNER_OWN_TENANTS`, `VC_GATE_APPROVER`
- Erasure, audit, webhook: `VC_AUDIT_HMAC_KEY`, `VC_ERASURE_APPROVER_EMAIL`, `VC_ERASURE_AUTO_DELETE`, `VC_WEBHOOK_SECRET`, `VC_WEBHOOK_DESTINATION_URL`
- Admin: `VC_ADMIN_JWT_SECRET`, `VC_ADMIN_MASTER_KEY`, `VC_USD_INR_RATE`, `VC_USD_INR`
- Platform data: `PATHLYNKS_DB_PASSWORD`, `PATHLYNKS_DB_CA_FILE`, `PATHLYNKS_ALLOW_PRIVILEGED_ROLE`, `VC_PATHLYNKS_TIMEOUT_MS`, `VIDYSEA_DB_PASSWORD`, `VIDYSEA_DB_CA_FILE`, `VIDYSEA_ALLOW_PRIVILEGED_ROLE`, `GITHUB_TOKEN`, `VC_SKILLS_DIR`
- Optional tracing (not wired from the API): `LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`

**Admin console, direct reads (4):** `MONGODB_URL`, `VC_WEB_MODE` (must be exactly `live`, `apps/web/src/server/runtime.ts:22`), `VC_ADMIN_API_URL` (`apps/web/src/app/admin/_lib/session-handlers.ts:14`), `VC_SKILLS_DIR` (`runtime.ts:37-38`). It also inherits the provider names (`VC_LLM_*`, `GEMINI_API_KEY`) through `@vc/providers`. In live mode the console connects to Mongo itself (`runtime.ts:7-10`), so it needs the same allow-list as the API.

**Widget (runtime): none.** Build-time only, in the host repos: Pathlynks `NEXT_PUBLIC_VC_WIDGET_BASE_URL`, Vidysea `NEXT_PUBLIC_VC_WIDGET_SCRIPT_URL` (`docs/partner-integration.md:152-153`).

**Langfuse stack (own file, `infra/langfuse/.env.example`, 22 names):** `POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB CLICKHOUSE_USER CLICKHOUSE_PASSWORD REDIS_AUTH MINIO_ROOT_USER MINIO_ROOT_PASSWORD SALT ENCRYPTION_KEY NEXTAUTH_SECRET NEXTAUTH_URL LANGFUSE_INIT_*` (9) plus 3 `LANGFUSE_*` app keys.

## 4. CORS, partner keys, allowed origins

- CORS is decided by the API per partner key and its origin list, not by nginx: `withPartnerRoutes` answers preflights and adds `Access-Control-Allow-Origin` only when the page key's partner lists the Origin (`apps/api/src/partners.ts:842-905`). `nginx-vc.conf:51-53` says no location may set an `Access-Control` header, restrict methods, or rewrite `X-VC-Key`/`Authorization`. DevOps must not add CORS at nginx or a CDN.
- Keyless anonymous chat works unless `VC_PARTNER_KEY_REQUIRED=true` (`apps/api/src/anonymous.ts:464`, `openapi.ts:861`). The student UI is keyless (`apps/student/app.js:52`), so M1 needs this flag unset.
- Partner keys exist only when `VC_PARTNER_KEY_PEPPER` (>= 32 chars) is set (`index.ts:421`). Records are created with `pnpm -C apps/api partner add "<name>" --id <id> --origin <https origin>` against the live `virtual_counsellor` DB (`docs/partner-integration.md:81`); keys print once.
- Origins to register: Pathlynks `https://pathlynks.vidysea.com` (`partner-integration.md:146`, deploy target of branch `production_frontend`); the Vidysea production frontend origin is **not stated anywhere I read** (UAT ECR only, `partner-integration.md:146`). DevOps/Umesh must supply it.
- `VC_RESERVED_TENANT_IDS` empty is a deploy blocker for partner keys (`docs/runbook-golive.md:117`); run `pnpm -C apps/api partner list --check` first.

## 5. Mongo allow-list and other network needs

| Direction | Target | Need | Evidence |
|---|---|---|---|
| Out | VC Mongo (`MONGODB_URL`, :27017), db `virtual_counsellor` only | the **API host IP** and, if separate, the **admin console host IP** must be on the allow-list | `docs/go-live-checklist.md:88`, `qa/gates/mongo-host.md`, `apps/web/src/server/runtime.ts:7-10` |
| Out | KnowledgeBase (`VC_KB_BASE_URL`, host :8081 per the network note) | reachable from the API host; `/api/search` redeploy pending | `qa/evidence/t057-demo.md:24`, `qa/evidence/t057/network-2026-11-01.md:10` |
| Out | Ollama Cloud `https://ollama.com/v1` (text chain) | HTTPS egress | `.env.example:112` |
| Out | Gemini Live (voice) / grounding | HTTPS egress, only when voice or grounding is on | `apps/api/src/main.ts:100-117` |
| Out | Pathlynks Postgres RDS :5432 (`verify-full`), Vidysea Postgres RDS :5432 (`verify-full`) | RDS security-group entry for the API host IP; RDS CA file on disk | `config/sources.json` (`pathlynks-db`, `vidysea-db`), `.env.example:180-185` |
| Out | `VC_WEBHOOK_DESTINATION_URL` (outbox drain) | only if the webhook is enabled | `.env.example:37` |
| In | 80/443 to nginx only | API stays on 127.0.0.1:8080 | `main.ts:139`, `vc-api.service:2` |

Port discrepancy to settle before the allow-list request is sent: `qa/evidence/t057/network-2026-11-01.md` (lines 7-8, 25) asks for the Pathlynks DB on port **27017**, but `config/sources.json` defines `pathlynks-db` as **Postgres :5432** on an RDS host, while the Pathlynks journey collections are a Mongo source on the VC `MONGODB_URL` (`pathlynks-journey`, `urlRef: MONGODB_URL`, `config/sources.json:125-138`). The request text may name the wrong port or the wrong host.

## 6. Widget asset release path

- Two ways to serve today: the aliases `/widget/vc-widget.v1.js`, `/widget/vc-widget.js` and `/widget/vc-widget-voice.v1.js` read straight from `/opt/vc/apps/widget/src/` (a git checkout, `nginx-vc.conf:136-158`); the immutable path `/widget/releases/<40-hex commit>/` reads `/opt/vc/releases/$1/widget/$2` (`nginx-vc.conf:161-166`).
- Host frontends are built against the immutable path: Pathlynks via `NEXT_PUBLIC_VC_WIDGET_BASE_URL=https://<vc-origin>/widget/releases/<sha>`, Vidysea via `NEXT_PUBLIC_VC_WIDGET_SCRIPT_URL=.../vc-widget.v1.js` (`partner-integration.md:152-154`). The release directory must hold `vc-widget.js`, `vc-widget.v1.js` (both from `vc-widget.js`) and `vc-widget-voice.v1.js` (from `voice.js`), with SHA256 values recorded.
- Nothing in the repo performs that copy or records the hashes (`grep releases/ scripts apps/widget/README.md` finds nothing); it is a manual DevOps step described in prose.
- Pop-out: the widget opens `<origin>/vc-popout?site=<id>` (`apps/widget/src/vc-widget.js:24,113-115`). nginx has no such location, so it falls to `location /` and serves the student `index.html` (`nginx-vc.conf:26-28`), and `apps/student` has no pop-out handling (`grep popout apps/student` is empty).

## 7. Dependencies and which block

| Dependency | State | Blocks M1? | Evidence |
|---|---|---|---|
| VC Mongo `virtual_counsellor` | reachable from the dev IP in run 8c; server IP not allow-listed yet | **yes** | `t057-demo.md:3-4,21`, checklist `:88` |
| KnowledgeBase `/search` | **FAIL** (unavailable, 4025 ms); redeploy pending; anonymous route refuses to start without `VC_KB_BASE_URL` and `VC_KB_ANON_API_KEY` (`main.ts:155`); without a working KB every answer is `no_sourced_answer` (checklist `:87`) | **yes** | `t057-demo.md:24,33` |
| LLM provider (Ollama Cloud key, monthly cap) | key and cap are required to start the chain (`.env.example:117-120`) | **yes** | `.env.example` |
| Pathlynks DB | **FAIL** connect_error, IP 122.161.79.226 not allow-listed | no (M2 personalised) | `t057-demo.md:23` |
| Vidysea DB | OK from the dev IP; the server IP is a separate allow-list entry | no (M2 personalised) | `t057-demo.md:24` |
| Langfuse | no production stack; not wired from API/web | no | `infra/langfuse/README.md`, grep above |
| GitHub token | source-navigation catalogue only | no | `config/sources.json` `tokenRef` |

## 8. Gap table

Legend: Owner = DevOps / Umesh / maker. Effort S (< 1 day) / M (1 to 3 days) / L (> 3 days). "Blocks M1" is whether the first live URL (anonymous chat on a TLS host) can exist without it; "Blocks M2" is the embedded, personalised milestone.

| # | Gap | Evidence | Owner | Effort | Blocks M1 | Blocks M2 |
|---|---|---|---|---|---|---|
| 1 | No host, domain or TLS. `VC_HOST` / `vc.example.org` are placeholders; nginx site, `limit_req_zone` file, certbot, `nginx -t` and logrotate (`vc-voice-stream`) not done | `nginx-vc.conf:20`, `infra/ubuntu/README.md` S13 paragraph and step 7, checklist `:58-78,89,92`, `partner-integration.md:146` | DevOps | M | **Yes** | Yes |
| 2 | Mongo allow-list: the deploy server's IP (and the admin console host, if separate) is not on the VC Mongo allow-list | checklist `:88`, `qa/gates/mongo-host.md`, `apps/web/src/server/runtime.ts:7-10` | Umesh + DevOps | S | **Yes** | Yes |
| 3 | KB not usable: base URL and keys not in a server env, KB `/api/search` redeploy pending (preflight FAIL) | checklist `:87`, `t057-demo.md:24,33`, `main.ts:155` | Umesh (keys) + DevOps (KB redeploy) | M | **Yes** | Yes |
| 4 | Server env file not written: the minimum set for M1 is `MONGODB_URL`, `VC_JWT_ISSUER` + one key source (the counsellor verifier is built at startup even for anonymous-only), `VC_LLM_PROVIDER/BASE_URL/API_KEY/MODEL`, `VC_TEXT_CHAIN`, `OLLAMA_API_KEY`, `VC_CHAIN_MONTHLY_CAP_USD`, `VC_KB_BASE_URL`, `VC_KB_ANON_API_KEY`, `VC_ANONYMOUS_ENABLED`, `VC_API_PORT`; no secret store is defined (file `chmod 640` only) | `index.ts:657`, `.env.example:106-140`, `infra/ubuntu/README.md` step 4 | DevOps + Umesh | S | **Yes** | Yes |
| 5 | Go decision and open owner records: production deploy is a separate Umesh gate; open items are the Q3 DPDP review, Tele-MANAS 14416 test-call record, switching order, Hindi/Hinglish sign-off; the gate also needs `VC_GATE_APPROVER` set exactly | checklist `:6-8,20,47-52,82,93-94` | Umesh | S | **Yes** (human gate) | Yes |
| 6 | No partner records, origins or pepper in the live DB; Vidysea prod origin unknown | `partner-integration.md:81,146`, `index.ts:421`, `runbook-golive.md:117` | Umesh (partner add) + DevOps (origins) | S | No (keyless route works) | **Yes** |
| 7 | Personalised-data connectivity: Pathlynks DB not allow-listed, Vidysea DB needs the server IP, RDS CA files absent from the server, and the port 27017 vs 5432 inconsistency in the DevOps request | `t057-demo.md:23`, `config/sources.json`, `.env.example:180-185`, `network-2026-11-01.md:7-8,25` | Umesh + DevOps | S | No | **Yes** |
| 8 | Student JWT shape and tenant values unknown (`VC_STUDENT_JWT_*`, `VC_RESERVED_TENANT_IDS`, `VC_PARTNER_OWN_TENANTS`); B15 legacy `failed` erasure rows need re-approval before live cutover | checklist `:90,95`, `main.ts:160-176`, `.env.example:124,148-151` | Pathlynks team + Umesh | M | No | **Yes** |
| 9 | Widget release procedure is prose only: no script or CI copies one reviewed commit to `/opt/vc/releases/<sha>/widget/`, makes the `vc-widget.v1.js` copy, or records SHA256 | `nginx-vc.conf:161-166`, `partner-integration.md:152-154`, grep of `scripts/` | maker (script) + DevOps (run) | S | No (aliases serve from the checkout) | **Yes** |
| 10 | Widget pop-out `/vc-popout` is not routed; it lands on the student page | `vc-widget.js:24,113-115`, `nginx-vc.conf:26-28`, empty grep in `apps/student` | maker | S | No | No (UX) |
| 11 | No health or readiness endpoint; the only signal is the `vc_api_listening` stderr line | `server.ts:339-670`, `main.ts:224`, `nginx-vc.conf:174`, `vc-api.service` (no watchdog) | maker | S | No (systemd `Restart=on-failure` suffices) | Yes if an LB or ECS target group is used |
| 12 | No Dockerfile, compose or CI for any service (API, admin console, static widget/student); Vidysea hosts ship through ECR/CodePipeline | `git ls-files` search, `partner-integration.md:146` | maker (files) + DevOps | M | No (Ubuntu path needs none) | Yes if containers are mandated |
| 13 | API bind address is hard-coded to 127.0.0.1 with no env override, so a container cannot be reached from outside its own network namespace | `main.ts:139`, `index.ts:656`, no `VC_API_HOST` anywhere in the tree | maker | S | No | Yes if containers |
| 14 | Admin console has no production target: no `start` script, no unit, no nginx server or admin host; needs `VC_WEB_MODE=live`, `VC_ADMIN_API_URL` to reach the API (loopback), `VC_ADMIN_JWT_SECRET`/`VC_ADMIN_MASTER_KEY` on the API, and an admin account created by Umesh | `apps/web/package.json:44-51`, `infra/ubuntu/README.md` step 7 last sentence, `index.ts:1093`, `t057-demo.md:47` | DevOps + maker + Umesh | M | No (`partner` and `admin` CLIs cover M1) | No |
| 15 | Voice not deployable yet: needs `VC_VOICE_WS_SECRET`, `VC_VOICE_WS_BASE_URL` (wss), `GEMINI_API_KEY`, `VC_VOICE_MODEL`; paid allowance exhausted; A10 stands on an owner override | `main.ts:96-132`, `partner-integration.md:157`, checklist `:35-37` | Umesh + DevOps | M | No (`VC_VOICE_ENABLED=false`) | No |
| 16 | No production Langfuse; the compose file is dev-only and 127.0.0.1-bound; the API/web do not call `loadTracingConfig` | `infra/langfuse/README.md`, grep of `apps/api/src`, `apps/web/src` | DevOps | L | No | No |
| 17 | `.env.example` drift: 31 of 94 readable names are undocumented (13 `VC_STUDENT_JWT_*`, 3 `LANGFUSE_*`, `VC_GROUNDING*` x4, `VC_LLM_*` x4, `VC_TURN_DEADLINE_MS`, `VC_GATE_APPROVER`, `MONGO_CLIENT_TIMEOUT_MS`, `OLLAMA_*` x2, `VC_USD_INR`, `VIDYSEA_ALLOW_PRIVILEGED_ROLE`) | `.env.example`, `auth.ts:319-320` | maker | S | No | No |
| 18 | Alerts are one JSON line on stderr (no email, Slack or webhook), so DevOps must tail journald; no log shipping or monitoring defined | `docs/runbook-golive.md:2,10` | DevOps | S | No | No |
| 19 | Per-process state: rate limits and the monthly chain cap counter live in memory and reset on restart, so only one replica is correct | `docs/runbook-golive.md:107-108,123` | maker (design) | L if scaled out | No | No (single replica) |
| 20 | Runtime hygiene: API runs on `tsx` (a devDependency) with no compiled output; `package.json` has `engines.node >=20` but no `packageManager` pin, while README says `corepack enable` (lockfile v9.0) | `apps/api/package.json:12`, `package.json:7-9`, `pnpm-lock.yaml:1`, README step 3 | maker | S | No | No |

## 9. Counts

- Gaps total: **20**.
- Block the first live URL (M1): **5** (rows 1 to 5; every one is an external or human step, none needs product code).
- Do not block M1: **15**, of which **4** block M2 (rows 6 to 9) and **3** more block only if DevOps mandates containers or an LB (rows 11 to 13). The remaining 8 (rows 10, 14 to 20) are non-blocking for both milestones.
- Product-code or file work for the maker is small: rows 9, 10, 11, 12, 13, 17, 20 (7 items, all S or M), none on the M1 path.

## 10. Shortest ordered path to a first live URL (M1)

1. **DevOps:** provision the Ubuntu host and DNS name; replace `vc.example.org` in the nginx site (gap 1).
2. **Umesh + DevOps:** add the host's public IP to the VC Mongo allow-list (gap 2).
3. **Umesh + DevOps:** supply `VC_KB_BASE_URL` and the search-only `VC_KB_ANON_API_KEY`; redeploy the KB with `/api/search`; confirm with `pnpm demo:preflight` on the host (gap 3). Verify the Pathlynks DB port in the allow-list request first (section 5) if M2 follows.
4. **DevOps:** run `infra/ubuntu/README.md` steps 1 to 8: packages, user, code, `/etc/vc/vc.env` with the gap 4 names (`VC_PARTNER_KEY_REQUIRED` unset, `VC_VOICE_ENABLED=false`, `VC_CHAT_ENABLED=false`), student UI, `limit_req_zone` file, nginx site, `nginx -t`, certbot, systemd unit.
5. **Umesh:** record the go decision and the open owner items, set `VC_GATE_APPROVER` exactly, and let the anonymous gate pass (gap 5).
6. **DevOps:** smoke test with the README step 8 curl and check journald for `vc_api_listening`.

Then for M2: partner records and origins (gap 6), platform DB access and CA files (gap 7), JWT shape and tenant ids (gap 8), widget release directory with hashes (gap 9), and, if containers or an LB are chosen, gaps 11 to 13 first.
