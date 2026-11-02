# DevOps handover: take the Virtual Counsellor (VC) live on Ubuntu

Audience: the Vidysea DevOps team. Written 2026-11-02. This is the one ordered runbook for VC.
It names environment variables only. Values come from Umesh by a private channel, never chat, git or tickets.
Never print `/etc/vc/vc.env`.

Detail files, read only if you need them: `infra/ubuntu/README.md` (install steps), `infra/ubuntu/nginx-vc.conf`,
`infra/ubuntu/vc-api.service`, `docs/partner-integration.md` (partner keys and widget release),
`docs/go-live-checklist.md`, `docs/runbook-golive.md` (alerts), `qa/evidence/deploy-readiness.md` (the gap audit).

## Why this file exists

The Knowledge Base (KB) go-live failed in five ways. VC must not repeat them.

| KB failure | What VC does instead |
|---|---|
| Mongo was open to the internet with no password and was hit by ransomware after go-live. | Network and Mongo checks are the first block of the checklist (section 2, A). Nothing starts before they pass. |
| `docker-compose.yml` did not forward env values, so `.env` never reached the containers. | VC has no containers. systemd reads `/etc/vc/vc.env` directly (section 4). The API prints no values, but it refuses to start and names the missing variable. |
| An outer proxy redirected the public URL to a raw IP that nobody owned. | The public host is one DNS name with one nginx and one certificate. Section 7 has a check that no redirect points at an IP. |
| Values were guessed (for example `TRUST_PROXY_HOPS`). | Every value below is either read from code, supplied by a named owner, or listed in section 11 as "not confirmed". Do not guess; ask. |
| The runbook was written after the failed deploy. | This file was written before the first deploy and is checked by a cold read. |

## 1. What VC is

- A Node 20.16+ TypeScript service. It is NOT Python. Claude Code is not used at runtime.
- One process: `pnpm -C apps/api start` (runs `tsx src/main.ts`). It serves HTTP and the voice WebSocket on one port
  (default 8080) and binds `127.0.0.1` only. nginx is the only public listener.
- State lives in MongoDB database `virtual_counsellor` (and one read-only database, `pathlynks_journey`, on the same Mongo host).
- Milestones:
  - **M1** = anonymous chat behind TLS. Needs the host, the Mongo allow-list, the KB and the LLM key.
  - **M2** = embedded, personalised chat after partner keys exist, for the Vidysea and Pathlynks frontends.
- Static files served by nginx: the student UI `apps/student` and the widget `apps/widget/src`. No build step.

## 2. Checklist (owner-ordered)

Do the blocks in order. Owners: DevOps, Umesh, Pathlynks team, Vidysea team.

### A. Network and security (first)

| # | Owner | Action | Done when |
|---|---|---|---|
| A1 | DevOps | Provision the Ubuntu host and a DNS name. Firewall: default deny inbound. Allow 80 and 443 from anywhere, SSH only from admin IPs. Do not open 8080 (the API binds loopback anyway). | An external port scan shows only 80 and 443. |
| A2 | DevOps | Send Umesh the server's public egress IP. | Umesh has the IP. |
| A3 | DevOps + Umesh | Add that IP to the allow-list of the VC Mongo host. | `mongosh "$MONGODB_URL" --eval 'db.runCommand({ping:1})'` from the new server returns `ok: 1` (run it so the URL is never echoed). |
| A4 | DevOps | Confirm Mongo security on the VC Mongo host (this was the KB failure). From an IP that is NOT allow-listed: `nc -vz -w 5 <VC-MONGO-HOST> 27017` must time out or be refused. From the server without credentials: `mongosh --host <VC-MONGO-HOST> --eval 'db.adminCommand({listDatabases:1})'` must fail with an authentication error. The VC user must have rights on `virtual_counsellor` (full CRUD) and read-only on `pathlynks_journey`, and nothing else. | Both checks behave as written. If either does not, stop and tell Umesh. |
| A5 | Pathlynks team | Allow the server egress IP on the Pathlynks Postgres RDS, port 5432. Supply the AWS RDS CA bundle file. | `PATHLYNKS_DB_CA_FILE` path exists on the server (M2 only). |
| A6 | Vidysea team | Allow the server egress IP on the Vidysea Postgres RDS, port 5432, read-only role. Supply the CA file and the read-only role password. | `VIDYSEA_DB_CA_FILE` path exists on the server (M2 only). |
| A7 | Umesh + KB team | The KB service answers `/api/search` from the server (the redeploy of the KB is pending, see section 11). | `curl -sS -o /dev/null -w '%{http_code}\n' <VC-KB-BASE-URL>` from the server returns an HTTP code (not a timeout). |

### B. Server and release

| # | Owner | Action | Done when |
|---|---|---|---|
| B1 | DevOps | Packages, user, directories (section 5, steps 1 and 2). | `id vc` works. |
| B2 | Umesh | Tell DevOps the exact git commit sha to deploy, and give read access to the repo (deploy key). | DevOps has the sha. |
| B3 | DevOps | `git clone`, Node, pnpm, `pnpm install --frozen-lockfile` (section 5). | `node -v` is v20.16 or higher; install exits 0. |
| B4 | Umesh | Send the values for `/etc/vc/vc.env` by a private channel (section 4). | DevOps has them. |
| B5 | DevOps | Write `/etc/vc/vc.env` (mode 640, owner root:vc). | `ls -l /etc/vc/vc.env` shows `-rw-r----- root vc`. |
| B6 | DevOps | Pre-start gate check (section 6). | Prints `ALLOWED`. |
| B7 | DevOps | nginx site and TLS (section 7). | `nginx -t` passes; HTTPS loads. |
| B8 | DevOps | systemd unit (section 5, step 8). | `journalctl -u vc-api` shows `vc_api_listening`. |
| B9 | DevOps | Smoke checks (section 8). | All expected outputs match. |
| B10 | DevOps | Send back the items in section 13. | Umesh has them. |

### C. M2 (after M1 passes)

| # | Owner | Action | Done when |
|---|---|---|---|
| C1 | Umesh | Create the two partners on the VC server: `pnpm -C apps/api partner add` (section 9a). Keys print once. | Both partners show in `partner list`. |
| C2 | Umesh | Hand each server key to its team by a private channel. | Teams confirm receipt. |
| C3 | Pathlynks team | Deploy the Pathlynks backend with `VC_QUEST_ENABLED`, `VC_BASE_URL`, `VC_PARTNER_SERVER_KEY`, and the frontend built with `NEXT_PUBLIC_VC_WIDGET_BASE_URL` (section 9). | Pathlynks page loads the widget. |
| C4 | Vidysea team | Deploy the Vidysea backend with `VC_STUDENT_CENTRAL_ENABLED`, `VC_BASE_URL`, `VC_PARTNER_SERVER_KEY`, and the frontend built with `NEXT_PUBLIC_VC_WIDGET_SCRIPT_URL`. | Vidysea page loads the widget. |
| C5 | Umesh + both teams | Live walk with a TEST user on each host (voice and crisis only on a test user). | Umesh signs the walk. |

Order for M2 is fixed: VC up, partner keys, host deploys, live walk.

## 3. Network allow-list

Roles and ports only. Real hostnames and IPs come from Umesh.

| Direction | Target role | Port | Needed for | Who opens it |
|---|---|---|---|---|
| Out | VC Mongo host, databases `virtual_counsellor` and read-only `pathlynks_journey` | 27017 | M1 | Mongo host owner (allow-list the VC server IP) |
| Out | Knowledge Base service (`VC_KB_BASE_URL`) | the port in that URL (the KB host has answered on 8081) | M1 | KB team |
| Out | LLM: Ollama Cloud (`https://ollama.com/v1`) when the text chain or litellm is used | 443 | M1 | DevOps (egress) |
| Out | Gemini API | 443 | only if `VC_LLM_PROVIDER=gemini`, voice, or grounding is on | DevOps (egress) |
| Out | Ollama or LiteLLM gateway at `VC_LLM_BASE_URL` / `OLLAMA_BASE_URL` | per URL | only if you point them at your own gateway | DevOps |
| Out | Pathlynks Postgres RDS, verified TLS | 5432 | M2 | Pathlynks team |
| Out | Vidysea Postgres RDS, read-only role, verified TLS | 5432 | M2 | Vidysea team |
| Out | `api.github.com` | 443 | only if admin source sync is used (`GITHUB_TOKEN`) | DevOps (egress) |
| Out | `VC_WEBHOOK_DESTINATION_URL` | per URL | only if the webhook is on | the receiving team |
| In | nginx | 443 (and 80 for the redirect) | all | DevOps |
| In | API | 8080 on 127.0.0.1 only | nginx only | not public |

The origins that call VC from a browser are the registered partner origins (section 9a). nginx does not decide them.

## 4. Server env file `/etc/vc/vc.env`

Names only. Values travel by a private channel from the owner shown. Format rules for the systemd `EnvironmentFile`:
one `NAME=value` per line; no `export`; no shell expansion (no `$VAR`, no backticks); no inline comments after a value.
A PEM key goes on one line with the line breaks written as `\n`, or use a JWKS URL instead.
Mode 640, owner `root:vc`. Never commit it. The launcher refuses to start and names the missing variable (never a value).

Two settings are mandatory and easy to forget:
- `VC_GATE_APPROVER=Umesh`. It must match the name in the `qa/gates` records exactly (capital U, no spaces). Without it the go-live gate refuses.
- `VC_LLM_PROVIDER` must be `litellm` or `gemini`. It must never be `mock` or `rules` on a live server. There is no default.

### M1 required set (anonymous chat)

| Name | Value shape | Supplied by | Secret |
|---|---|---|---|
| `MONGODB_URL` | Mongo connection string, user with rights on `virtual_counsellor` | Umesh / Mongo host owner | yes |
| `VC_GATE_APPROVER` | `Umesh` | Umesh | no |
| `VC_ANONYMOUS_ENABLED` | `true` (exact; the A20 gate must also pass) | Umesh | no |
| `VC_CHAT_ENABLED` | `false` for M1 (exact `true` or `false`, no spaces) | Umesh | no |
| `VC_VOICE_ENABLED` | `false` for M1 | Umesh | no |
| `VC_JWT_ISSUER` | text | Umesh | no |
| One of `VC_JWT_PUBLIC_KEY` / `VC_JWT_JWKS_URL` / `VC_JWT_HS256_SECRET` | PEM public key on one line, an https JWKS URL, or a secret of at least 32 bytes | Umesh | the HS256 secret: yes |
| `VC_LLM_PROVIDER` | `litellm` (Ollama Cloud) or `gemini` | Umesh | no |
| `VC_LLM_MODEL` | model id | Umesh | no |
| `VC_LLM_BASE_URL`, `VC_LLM_API_KEY` | needed for `litellm`: gateway URL and key | Umesh | key: yes |
| `GEMINI_API_KEY` | needed for `gemini` (also used by voice) | Umesh | yes |
| `VC_TEXT_CHAIN` | comma list `ollama:<model>,ollama:<model>` | Umesh | no |
| `OLLAMA_API_KEY` | required when `VC_TEXT_CHAIN` is set | Umesh | yes |
| `VC_CHAIN_MONTHLY_CAP_USD` | positive number; the chain will not start without it | Umesh | no |
| `VC_KB_BASE_URL` | KB base URL | Umesh / KB team | no |
| `VC_KB_ANON_API_KEY` | search-only KB key | Umesh / KB team | yes |

The two `VC_JWT_*` lines are needed even for anonymous-only: the counsellor token verifier is built at startup.

### M2 additions

| Name | Value shape | Supplied by | Secret |
|---|---|---|---|
| `VC_CHAT_ENABLED` | `true` | Umesh | no |
| `VC_KB_API_KEY` | KB chat key (`/ask`) | Umesh / KB team | yes |
| `VC_STUDENT_JWT_ISSUER`, `VC_STUDENT_JWT_AUDIENCE` | text | Pathlynks / Vidysea teams via Umesh | no |
| One of `VC_STUDENT_JWT_PUBLIC_KEY` / `VC_STUDENT_JWT_JWKS_URL` / `VC_STUDENT_JWT_HS256_SECRET` | as above | host teams via Umesh | HS256: yes |
| `VC_STUDENT_JWT_ALGORITHMS`, `VC_STUDENT_JWT_CLOCK_SKEW_SEC`, `VC_STUDENT_JWT_CLAIM_TENANT`, `_CLAIM_STUDENT_ID`, `_CLAIM_ROLE`, `_CLAIM_IS_MINOR`, `_CLAIM_AGE`, `_CLAIM_GUARDIAN_CONSENT` | optional claim-name overrides | host teams via Umesh | no |
| `VC_PARTNER_KEY_PEPPER` | at least 32 characters. Changing it invalidates every partner key. | Umesh | yes |
| `VC_RESERVED_TENANT_IDS` | every tenant id the student JWTs carry, comma or space separated. Empty is a blocker for partner keys. | host teams via Umesh | no |
| `VC_PARTNER_OWN_TENANTS` | for example `pathlynks:pathlynks` | Umesh | no |
| `VC_AUDIT_HMAC_KEY` | at least 32 characters (erasure audit) | Umesh | yes |
| `VC_ERASURE_APPROVER_EMAIL` | email (needed while `VC_ERASURE_AUTO_DELETE` is false) | Umesh | no |
| `PATHLYNKS_DB_PASSWORD`, `PATHLYNKS_DB_CA_FILE` | password; absolute path of the CA file | Pathlynks team | password: yes |
| `VIDYSEA_DB_PASSWORD`, `VIDYSEA_DB_CA_FILE` | read-only role password; CA file path | Vidysea team | password: yes |
| `VC_PARTNER_KEY_REQUIRED` | `true` only if Umesh wants the anonymous route to need a page key. Leave unset for M1. | Umesh | no |

### Voice (gated; keep off until Umesh says go)

`VC_VOICE_ENABLED=true`, `VC_VOICE_MODEL`, `GEMINI_API_KEY`, `VC_VOICE_WS_SECRET` (at least 32 bytes, secret),
`VC_VOICE_WS_BASE_URL` (a `wss://` URL with no credentials). The voice gate and the paid allowance are Umesh's decision.

### Admin console and optional names

| Name | Note |
|---|---|
| `VC_ADMIN_JWT_SECRET` | at least 32 characters. The admin API is mounted only when it is set. Secret. |
| `VC_ADMIN_MASTER_KEY` | base64 of exactly 32 random bytes. Any other length stops startup. Secret. |
| `VC_USD_INR_RATE` | number for the cost dashboard |
| `GITHUB_TOKEN` | optional; source navigation only. Secret. |
| `VC_ADMIN_API_URL`, `VC_WEB_MODE` | read by the admin console (`apps/web`), not by the API. `VC_WEB_MODE` must be exactly `live`. |
| `VC_API_PORT` | default 8080; nginx points at 8080, so leave it |
| `VC_SPEAKERS_FILE` | `/etc/vc/speakers.json`. If set and the file is missing or invalid the launcher refuses to start. If you have no file, delete the line. |
| `VC_KB_TIMEOUT_MS`, `VC_KB_BREAKER_FAILS`, `VC_KB_BREAKER_COOLDOWN_MS`, `VC_KB_ROUTE` | KB client tuning |
| `VC_TEXT_CHAIN_HOP_TIMEOUT_MS`, `VC_TEXT_CHAIN_DEADLINE_MS`, `OLLAMA_BASE_URL` | chain tuning |
| `VC_CONCERN_MODEL`, `VC_MODEL_SUMMARY`, `VC_MODEL_ANSWER`, `VC_MODEL_ROUTER`, `VC_REPLY_LANGS`, `VC_ANONYMOUS_SAFETY_SCREEN` | model and language options |
| `MONGO_CLIENT_TIMEOUT_MS`, `VC_SKILLS_DIR`, `VC_PATHLYNKS_TIMEOUT_MS`, `PATHLYNKS_ALLOW_PRIVILEGED_ROLE` | advanced; leave unset unless Umesh says |
| `VC_WEBHOOK_SECRET`, `VC_WEBHOOK_DESTINATION_URL` | only if the webhook is turned on |

Do not set the `VC_EVIDENCE_*` names from `.env.example`; they are for local test runs only.

## 5. Host steps

Each step has its expected result. Replace `<VC-REPO-URL>` and `<SHA>` with the values Umesh gives you.

1. Packages: `sudo apt install nginx certbot python3-certbot-nginx git curl`. Expected: no error.
2. User and directories:
   ```sh
   sudo useradd --system --home /opt/vc --shell /usr/sbin/nologin vc
   sudo mkdir -p /opt/vc /etc/vc && sudo chown vc:vc /opt/vc
   ```
   Expected: `id vc` prints the user.
3. Node 20.16 or higher (for example from NodeSource). Expected: `node -v` prints `v20.16.0` or higher.
4. Code. Use `git clone`. Never copy folders by hand. The API reads `skills/`, `qa/gates/`, `qa/evidence/p1-a10-diag/` and `config/` from the checkout at boot, and a copy usually misses one.
   ```sh
   sudo -u vc git clone <VC-REPO-URL> /opt/vc
   sudo -u vc git -C /opt/vc checkout <SHA>
   sudo -u vc git -C /opt/vc rev-parse HEAD
   ```
   Expected: the last command prints `<SHA>` in full.
5. pnpm. The version is pinned by `packageManager` in the root `package.json`.
   ```sh
   sudo corepack enable
   sudo -u vc pnpm -C /opt/vc -v
   ```
   Expected: the version in `packageManager`.
6. Install on the server: `sudo -u vc pnpm -C /opt/vc install --frozen-lockfile`.
   Never use `--prod` and never copy `node_modules` from a Windows machine. Expected: exit 0.
7. Environment file: create `/etc/vc/vc.env` from section 4, then
   `sudo chown root:vc /etc/vc/vc.env && sudo chmod 640 /etc/vc/vc.env`.
   If you use a speakers file, put it at `/etc/vc/speakers.json`.
8. Service (after sections 6 and 7 pass):
   ```sh
   sudo cp /opt/vc/infra/ubuntu/vc-api.service /etc/systemd/system/
   sudo systemctl daemon-reload && sudo systemctl enable --now vc-api
   systemctl status vc-api
   journalctl -u vc-api -n 50
   ```
   Expected: `active (running)` and a line with `"event":"vc_api_listening"`. If it exits, the last journal line is
   `vc-api failed to start: ...` and names the variable. Fix `vc.env` and run `sudo systemctl restart vc-api`.

## 6. Pre-start gate check

The API refuses to serve student routes until the go-live records in `qa/gates` pass. Check before you start the service:

```sh
sudo -u vc env VC_GATE_APPROVER=Umesh pnpm -C /opt/vc/apps/api go-live-gate student-routes
sudo -u vc env VC_GATE_APPROVER=Umesh pnpm -C /opt/vc/apps/api go-live-gate anonymous
```

Allowed output (exit code 0), one `ok` line per record:

```
go-live gate (A20) target=student-routes: ALLOWED
  ok       p1-u0-amendment-signatures.md
  ok       g-publish.md
  ok       g-prod.md
  ok       nights.md
```

(`anonymous` prints the same shape with `target=anonymous`.) A refused result prints `REFUSED` and one `MISSING <file>: <reason>` line per
problem, exit code 1. Do not edit `qa/gates` to get past it. Send the output to Umesh; only he records gate decisions.
Run `anonymous` for M1; run `student-routes` before M2.

## 7. nginx and TLS

1. The request-limit zone goes at http level, once:
   `echo 'limit_req_zone $binary_remote_addr zone=vcchat:10m rate=20r/m;' | sudo tee /etc/nginx/conf.d/vc-limit.conf`
2. `sudo cp /opt/vc/infra/ubuntu/nginx-vc.conf /etc/nginx/sites-available/vc`, set `server_name`, link it into `sites-enabled`.
3. `sudo nginx -t && sudo systemctl reload nginx`, then `sudo certbot --nginx -d <VC-HOST>`.
   Expected: `nginx -t` says "syntax is ok"; certbot adds the 443 block and the redirect.
4. Check for the KB redirect failure: `curl -sI http://<VC-HOST>/ | grep -i '^location'` must show `https://<VC-HOST>/`, never an IP address.
5. nginx runs as `www-data`. `/opt/vc/apps/student`, `/opt/vc/apps/widget/src` and `/opt/vc/releases` must be world-readable
   (`chmod -R a+rX`). Expected: `curl -s -o /dev/null -w '%{http_code}\n' https://<VC-HOST>/` prints `200`.

Rules that must not be broken:
- **CORS is done by the API**, per partner key and its origin list. Never add `Access-Control-*` headers, method restrictions or `X-VC-Key` / `Authorization` rewrites at nginx, a CDN or any front proxy.
  Preflight (`OPTIONS`) requests must reach the API.
- Only the listed `/v1` locations are proxied. Every other `/v1/` path answers 404 at nginx. Do not widen it.
- The site sets `X-Real-IP` from the socket address. Do not pass a client-supplied `X-Real-IP` or rely on `X-Forwarded-For`.
- If another proxy or CDN sits in front of this nginx, tell Umesh first. The per-client rate limit reads the address nginx sees.
- `/health` and `/ready` are proxied as exact locations in `nginx-vc.conf`. Check that your copy has them (`grep -n 'health' /etc/nginx/sites-available/vc`).
- The voice stream locations write `/var/log/nginx/vc-voice-stream.access.log`. Add the logrotate entry in `docs/go-live-checklist.md` (line 59 onward).
  Do not lower `error_log` below `error`.

## 8. Smoke checks

Run on the server first, then from outside. `B=https://<VC-HOST>`.

| Check | Command | Expected |
|---|---|---|
| Health | `curl -sS -w '\n%{http_code}\n' $B/health` | `{"status":"ok"}` then `200` |
| Ready | `curl -sS -w '\n%{http_code}\n' $B/ready` | `{"status":"ready"}` then `200` (503 `{"status":"unavailable"}` means Mongo is not reachable) |
| Anonymous turn | `curl -sS -w '\n%{http_code}\n' -X POST $B/v1/public/chat/turns -H 'content-type: application/json' -d '{"text":"hello"}'` | HTTP `200` and a JSON body with `state` and `message` |
| Partner OpenAPI | `curl -sS -o /dev/null -w '%{http_code}\n' $B/v1/partner/openapi.json` | `200` |
| Unlisted path | `curl -sS -o /dev/null -w '%{http_code}\n' $B/v1/admin/x` | `404` |
| Student UI | `curl -sS -o /dev/null -w '%{http_code}\n' $B/` | `200` |

Notes: if the anonymous turn answers `404`, the route is off (`VC_ANONYMOUS_ENABLED` not `true`) or the service did not start.
If it answers a degraded "try again" reply, check the KB (`VC_KB_BASE_URL`, redeploy pending) and the LLM key; do not retry in a loop.
Alerts are one JSON line on stderr: watch `journalctl -u vc-api -f` for `"event":"alert_` (see `docs/runbook-golive.md`).

## 9. Widget release directory (M2)

Host frontends load the widget from an immutable directory built from ONE reviewed commit. Never overwrite a released directory.

```sh
SHA=$(git -C /opt/vc rev-parse HEAD)          # the same 40-character sha Umesh approved
R=/opt/vc/releases/$SHA/widget
sudo -u vc mkdir -p "$R"
sudo -u vc cp /opt/vc/apps/widget/src/vc-widget.js "$R/vc-widget.js"
sudo -u vc cp /opt/vc/apps/widget/src/vc-widget.js "$R/vc-widget.v1.js"
sudo -u vc cp /opt/vc/apps/widget/src/voice.js    "$R/vc-widget-voice.v1.js"
sudo sh -c "cd $R && sha256sum vc-widget.js vc-widget.v1.js vc-widget-voice.v1.js > SHA256SUMS"
cat "$R/SHA256SUMS"
sudo chmod -R a-w,a+rX "/opt/vc/releases/$SHA"
```

Expected: three lines of `<64 hex>  <file>`; the first two hashes are identical. Send those lines to Umesh.
Public URLs (nginx only serves these three names under `releases/<sha>/`):
`https://<VC-HOST>/widget/releases/<SHA>/vc-widget.v1.js`, `.../vc-widget.js`, `.../vc-widget-voice.v1.js`.
Check: `curl -sI $B/widget/releases/$SHA/vc-widget.v1.js` returns `200`, `Cache-Control: public, max-age=31536000, immutable`.

Host build settings (set in the host repos by the host teams, not by DevOps):
- Pathlynks: `NEXT_PUBLIC_VC_WIDGET_BASE_URL=https://<VC-HOST>/widget/releases/<SHA>`
- Vidysea: `NEXT_PUBLIC_VC_WIDGET_SCRIPT_URL=https://<VC-HOST>/widget/releases/<SHA>/vc-widget.v1.js`

### 9a. Partner records (Umesh, on the VC server, M2)

The partner command reads `MONGODB_URL`, `VC_PARTNER_KEY_PEPPER`, `VC_RESERVED_TENANT_IDS` and `VC_PARTNER_OWN_TENANTS` from its environment.
Run it as the service user with the same env file as the service (nothing is printed except the new keys):

```sh
sudo systemd-run --pipe --wait --quiet -p User=vc -p WorkingDirectory=/opt/vc -p EnvironmentFile=/etc/vc/vc.env \
  /usr/bin/env pnpm -C apps/api partner list --check
```

Then `partner add "<name>" --id <id> --origin <https origin>` in the same way (see `docs/partner-integration.md` section 4).
Keys print once; only a hash is stored. The Pathlynks origin is `https://pathlynks.vidysea.com`. The Vidysea production origin is not confirmed (section 11).

### 9b. Admin console (`apps/web`, optional for M1)

The admin console is a Next.js app (`pnpm -C apps/web build`). It has no nginx server or systemd unit yet (section 12).
It needs `VC_WEB_MODE=live`, `MONGODB_URL` (same Mongo allow-list as the API), `VC_ADMIN_API_URL` (the API on loopback), and on the API
`VC_ADMIN_JWT_SECRET` and `VC_ADMIN_MASTER_KEY`. Umesh creates the first admin account. Do not publish the console until Umesh chooses its host name and origin.

## 10. Rollback

- Code: `git -C /opt/vc checkout <previous-sha>`, `sudo -u vc pnpm -C /opt/vc install --frozen-lockfile`, `sudo systemctl restart vc-api`.
  Note the running sha before every deploy (`git -C /opt/vc rev-parse HEAD`).
- Env change that broke start: restore the previous `/etc/vc/vc.env` (keep a copy `/etc/vc/vc.env.prev`, mode 640), then restart.
- Widget: the old `/opt/vc/releases/<old-sha>/widget/` directory is still there. Host teams point their build setting back to it. Never delete or edit a released directory.
- Switch a surface off without a deploy: set `VC_CHAT_ENABLED=false` and/or `VC_VOICE_ENABLED=false` in `vc.env` and restart.
- Data: VC deploys run no migrations. Student databases are not rolled back by a code rollback. Restore Mongo from backup only with Umesh's yes.
- Never run `git clean` or delete `qa/gates` to "reset".

## 11. Not confirmed, ask Umesh

- The Vidysea production frontend origin (needed for the Vidysea partner record). Only a UAT ECR repository is known.
- The KB public base URL. `vidysea.com/knowledgebase` redirected to a raw IP on 2026-11-01. Use the base URL Umesh gives you; do not use the redirect target.
- The KB `/api/search` redeploy is pending, so every answer is "no sourced answer" until it lands.
- The student JWT issuer, key source (public key or JWKS), audience, and the tenant ids to put in `VC_RESERVED_TENANT_IDS`.
- The RDS CA files for Pathlynks and Vidysea.
- The VC Mongo host: whether authentication, bind address and firewall are already in place (check A4; this repo cannot show it).
- The git repository URL, how DevOps gets read access, and which commit sha to deploy.
- The domain name and who owns DNS.
- Whether voice is cleared to go live (paid allowance and the gate are Umesh's decision).

## 12. Known gaps (later, not blocking M1)

- No Dockerfile, no CI. The install is manual on Ubuntu with systemd.
- The widget pop-out path `/vc-popout` is not routed; it falls through to the student page.
- No widget release script; section 9 is manual.
- No production Langfuse stack. `infra/langfuse/` is development only.
- Single replica only. Rate limits and the monthly chain cap live in process memory and reset on restart. Do not run two copies.
- The API binds `127.0.0.1` only and has no setting to change it. nginx on the same host is the only way in.
- The admin console has no production host, nginx server or systemd unit.
- Alerts are JSON lines on stderr; there is no email, Slack or webhook transport. Tail journald.

## 13. What DevOps sends back

1. The public URL.
2. The server egress IP (and the IP for the admin console host, if separate).
3. `node -v` and `pnpm -v`.
4. The git sha deployed (`git -C /opt/vc rev-parse HEAD`).
5. The output of both gate checks (section 6).
6. The smoke-check output (section 8), and the `SHA256SUMS` lines (section 9) once the widget directory exists.
7. The result of the Mongo checks A3 and A4, without the connection string.

## 14. Ready-to-send request

> Subject: VC (Virtual Counsellor) go-live on Ubuntu
>
> Please deploy VC by following `docs/DEVOPS-HANDOVER.md` in the VC repository, in the order given (section 2).
> Start with the network and Mongo checks (block A). Do not start the service until the gate check (section 6) prints ALLOWED.
> Umesh will send the commit sha and the `/etc/vc/vc.env` values by a private channel; please do not ask for them in chat or tickets.
> Do not guess any value. If a step does not match what you see, stop and ask.
> When done, send back the items in section 13.
