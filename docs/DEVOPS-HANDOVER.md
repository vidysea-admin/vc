# DevOps handover: take the Virtual Counsellor (VC) live on Ubuntu

Audience: the Vidysea DevOps team. Written 2026-11-02. This is the one ordered runbook for VC.
It names environment variables only. Values come from Umesh by a private channel, never chat, git or tickets.
Never print `/etc/vc/vc.env`. Never paste a connection string into a command line you type; the commands below read it from the env file.

Detail files, read only if you need them: `infra/ubuntu/README.md` (install steps), `infra/ubuntu/nginx-vc.conf`,
`infra/ubuntu/vc-api.service`, `docs/partner-integration.md` (partner keys and widget release),
`docs/go-live-checklist.md`, `docs/runbook-golive.md` (alerts), `qa/evidence/deploy-readiness.md` (the gap audit).

## Why this file exists

The Knowledge Base (KB) go-live failed in five ways. VC must not repeat them.

| KB failure | What VC does instead |
|---|---|
| Mongo was open to the internet with no password and was hit by ransomware after go-live. | Network and Mongo checks come first (section 2, A and B6). The service starts only after they pass. |
| `docker-compose.yml` did not forward env values, so `.env` never reached the containers. | VC has no containers. systemd reads `/etc/vc/vc.env` directly (section 4). The API prints no values, but it refuses to start and names the missing variable. |
| An outer proxy redirected the public URL to a raw IP that nobody owned. | One DNS name, one nginx, one certificate. Section 7 has a check that no redirect points at an IP. |
| Values were guessed (for example `TRUST_PROXY_HOPS`). | Every value below is read from code, supplied by a named owner, or listed in section 11 as "not confirmed". Do not guess; ask. |
| The runbook was written after the failed deploy. | This file was written before the first deploy and was checked by a cold read. |

## 1. What VC is

- A Node TypeScript service (not Python). Claude Code is not used at runtime.
- One process: `pnpm -C apps/api start` (runs `tsx src/main.ts`). It serves HTTP and the voice WebSocket on one port
  (default 8080) and binds `127.0.0.1` only. nginx is the only public listener.
- State lives in MongoDB database `virtual_counsellor`, plus one read-only database, `pathlynks_journey`, on the same Mongo host.
- **M1** = anonymous chat behind TLS. Needs the host, the Mongo allow-list, the KB and the LLM key.
- **M2** = embedded, personalised chat after partner keys exist, for the Vidysea and Pathlynks frontends.
- nginx serves the student UI `apps/student` and the widget `apps/widget/src` as static files. No build step.

## 2. Checklist (owner-ordered)

Do the blocks in order. Owners: DevOps, Umesh, Pathlynks team, Vidysea team.

### A. Network and security (first; needs no secret values)

| # | Owner | Action | Done when |
|---|---|---|---|
| A1 | DevOps | Provision the Ubuntu host and a DNS name. Firewall: default deny inbound. Allow 80 and 443, SSH only from admin IPs. Do not open 8080. | An external port scan shows only 80 and 443 (and SSH from admin IPs). |
| A2 | DevOps | Send Umesh the server's public egress IP. | Umesh has the IP. |
| A3 | Umesh + Mongo host owner | Add that IP to the Mongo host allow-list. | The Mongo owner confirms. The ping test is B6, after `vc.env` exists. |
| A4 | DevOps | Prove Mongo is closed (this was the KB failure). The Mongo host name comes from the Mongo owner (a host name is not secret; do not read it from `vc.env`). From an IP that is NOT allow-listed: `nc -vz -w 5 <VC-MONGO-HOST> 27017` must time out or be refused. From the new server, with no credentials: `mongosh --host <VC-MONGO-HOST> --eval 'db.adminCommand({listDatabases:1})'` must fail with an authentication error. Install `nc` and `mongosh` first (section 5, step 1b). | Both behave as written. If either does not, stop and tell Umesh. |
| A5 | Pathlynks team | Allow the server egress IP on the Pathlynks Postgres RDS, port 5432. Supply the AWS RDS CA bundle file. | The CA file exists on the server; its path becomes `PATHLYNKS_DB_CA_FILE` (M2 only). |
| A6 | Vidysea team | Allow the server egress IP on the Vidysea Postgres RDS, port 5432, read-only role. Supply the CA file and the role password. | The CA file exists on the server; its path becomes `VIDYSEA_DB_CA_FILE` (M2 only). |
| A7 | Umesh + KB team | The KB team confirms the KB service is up and gives Umesh the base URL (section 11). | Umesh has the URL. The reachability test is B6. |

### B. Server and release

| # | Owner | Action | Done when |
|---|---|---|---|
| B1 | DevOps | Packages, `nc`, `mongosh`, user, directories (section 5, steps 1 to 3). | `id vc` works. |
| B2 | Umesh | Give DevOps the exact git sha and the clone access (section 5, step 4). | DevOps has both. |
| B3 | DevOps | Node, clone access, clone, pnpm, `pnpm install --frozen-lockfile` (section 5, steps 3 to 7). | `node -v` is v20.16 or higher; install exits 0. |
| B4 | Umesh | Send the `vc.env` values by a private channel (section 4). | DevOps has them. |
| B5 | DevOps | Write `/etc/vc/vc.env` (section 5, step 9). | `ls -l /etc/vc/vc.env` shows `-rw-r----- root vc`; the name check (step 9) finds no missing name. |
| B6 | DevOps | Reachability from the server, reading the URLs from `vc.env` (section 5, step 10): Mongo ping, Mongo roles, KB. | Ping prints `1`; roles are as stated; KB prints an HTTP code. Send the output (no URL) to Umesh. |
| B7 | DevOps | Pre-start gate check (section 6). | `anonymous` prints `ALLOWED`. |
| B8 | DevOps | nginx site and TLS (section 7). | `nginx -t` passes; HTTPS loads. |
| B9 | DevOps | systemd unit (section 5, step 11). | `journalctl -u vc-api` shows `vc_api_listening`. |
| B10 | DevOps | Smoke checks (section 8). | All expected outputs match. |
| B11 | DevOps | Send back the items in section 13. | Umesh has them. |

### C. M2 (after M1 passes)

| # | Owner | Action | Done when |
|---|---|---|---|
| C0 | Umesh + DevOps | Add the M2 variables to `vc.env` (section 4) and restart: `sudo systemctl restart vc-api`. Run the `student-routes` gate (section 6). | Gate prints `ALLOWED`; the service is `active (running)`. |
| C1 | Umesh | Create the two partners with the `systemd-run` form in section 9a. Keys print once. | Both partners show in `partner list`. |
| C2 | Umesh | Hand each server key to its team by a private channel. | Teams confirm receipt. |
| C3 | Pathlynks team | Deploy the Pathlynks backend with `VC_QUEST_ENABLED`, `VC_BASE_URL`, `VC_PARTNER_SERVER_KEY`, and the frontend built with `NEXT_PUBLIC_VC_WIDGET_BASE_URL` (section 9). | Pathlynks page loads the widget. |
| C4 | Vidysea team | Deploy the Vidysea backend with `VC_STUDENT_CENTRAL_ENABLED`, `VC_BASE_URL`, `VC_PARTNER_SERVER_KEY`, and the frontend built with `NEXT_PUBLIC_VC_WIDGET_SCRIPT_URL`. | Vidysea page loads the widget. |
| C5 | Umesh + both teams | Live walk with a TEST user on each host (voice and crisis only on a test user). | Umesh signs the walk. |

Order for M2 is fixed: VC up (M1), M2 variables, gate, partner keys, host deploys, live walk.

## 3. Network allow-list

Roles and ports only. Real hostnames and IPs come from Umesh.

| Direction | Target role | Port | Needed for | Who opens it |
|---|---|---|---|---|
| Out | VC Mongo host, databases `virtual_counsellor` and read-only `pathlynks_journey` | 27017 | M1 | Mongo host owner (allow-list the VC server IP) |
| Out | Knowledge Base service (`VC_KB_BASE_URL`) | the port in that URL (the KB host has answered on 8081) | M1 | KB team |
| Out | LLM: Ollama Cloud (`https://ollama.com/v1`) when the text chain or litellm is used | 443 | M1 | DevOps (egress) |
| Out | Gemini API | 443 | only if `VC_LLM_PROVIDER=gemini`, voice, or grounding is on | DevOps (egress) |
| Out | Your own Ollama or LiteLLM gateway at `VC_LLM_BASE_URL` / `OLLAMA_BASE_URL` | per URL | only if used | DevOps |
| Out | Pathlynks Postgres RDS, verified TLS | 5432 | M2 | Pathlynks team |
| Out | Vidysea Postgres RDS, read-only role, verified TLS | 5432 | M2 | Vidysea team |
| Out | `api.github.com` | 443 | only if admin source sync is used (`GITHUB_TOKEN`) | DevOps (egress) |
| Out | `VC_WEBHOOK_DESTINATION_URL` | per URL | only if the webhook is on | the receiving team |
| Out | Install time only: `registry.npmjs.org` (pnpm and packages), the git host of the repo, NodeSource or the apt mirrors, MongoDB's apt repo, Let's Encrypt ACME | 443 (git over SSH: 22) | B1 to B3, B8, upgrades | DevOps (egress) |
| In | nginx | 443 (and 80 for the redirect and certbot) | all | DevOps |
| In | API | 8080 on 127.0.0.1 only | nginx only | not public |

The origins that call VC from a browser are the registered partner origins (section 9a). nginx does not decide them.

## 4. Server env file `/etc/vc/vc.env`

Names only. Values travel by a private channel from the owner shown. Mode 640, owner `root:vc`. Never commit it.

### 4a. systemd file rules (exact)

systemd reads the file itself. It is not a shell script.

| Rule | Detail |
|---|---|
| Line shape | One `NAME=value` per line. No `export`. Blank lines are fine; a line starting with `#` or `;` is a comment. No comment after a value. |
| Quotes | Optional. systemd removes one pair of surrounding single or double quotes. Quote a value only if it has spaces. Never leave a quote unclosed. |
| Expansion | None. `$VAR`, `${VAR}`, backticks and `~` are kept literally. A password with `$` or `\` is kept as typed (ask Umesh to avoid them; a Mongo password in the URL must be percent-encoded). |
| Line endings | LF only. A CRLF file puts a carriage return in every value. |
| Spaces | No spaces around `=`. No trailing spaces: systemd trims them from unquoted values, but a quoted value keeps them. |
| PEM public key | One line. Put it in double quotes with the line breaks written as the two characters backslash and `n`: `VC_JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIB...\n-----END PUBLIC KEY-----"`. The API replaces each literal `\n` with a newline before it reads the key (`apps/api/src/auth.ts` line 198), and a real newline is also accepted, so the key works whichever way systemd treats the `
`. A wrong key stops the start with `VC_JWT_PUBLIC_KEY is not a readable PEM public key`. Without the double quotes systemd may drop the backslashes. |
| Missing file | The unit has no `-` prefix on `EnvironmentFile`, so a missing file fails the start. |

Write the file without shell-history leakage (never `echo VALUE >> vc.env`, never a value on a command line):

```sh
sudo install -m 640 -o root -g vc /dev/null /etc/vc/vc.env
sudoedit /etc/vc/vc.env            # type or paste the lines; nothing enters shell history
# or, if Umesh sends a finished file: sudo install -m 640 -o root -g vc ./received.env /etc/vc/vc.env && shred -u ./received.env
```

### 4b. What the service unit does (`infra/ubuntu/vc-api.service`)

| Setting | Value |
|---|---|
| User / Group | `vc` / `vc` |
| WorkingDirectory | `/opt/vc` |
| ExecStart | `/usr/bin/env pnpm -C apps/api start` |
| EnvironmentFile | `/etc/vc/vc.env` |
| Restart | `on-failure`, `RestartSec=5` |
| StartLimit | not set, so the systemd default applies (5 starts in 10 s); with a 5 s delay it is never reached |
| Stop | `KillSignal=SIGTERM`, `TimeoutStopSec=30` |
| Hardening | `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=full`, `ProtectHome=true` |

**A missing or bad variable crash-loops.** The launcher exits with `vc-api failed to start: <variable> ...` and systemd restarts it every 5 s forever.
It does not give up. Watch `journalctl -u vc-api -f`, fix `vc.env`, then `sudo systemctl restart vc-api`.

Two settings are mandatory and easy to forget:
- `VC_GATE_APPROVER=Umesh`. It must match the name in the `qa/gates` records exactly (capital U, no spaces). Without it the go-live gate refuses.
- `VC_LLM_PROVIDER` must be `litellm` or `gemini`. Never `mock` or `rules` on a live server. There is no default.

### 4c. M1 required set (anonymous chat)

Pick the column for the provider Umesh names (section 11). "chain" means: only if `VC_TEXT_CHAIN` is set.

| Name | gemini | litellm | Value shape | Supplied by | Secret |
|---|---|---|---|---|---|
| `MONGODB_URL` | yes | yes | connection string; user with rights on `virtual_counsellor` | Umesh / Mongo owner | yes |
| `VC_GATE_APPROVER` | yes | yes | `Umesh` | Umesh | no |
| `VC_ANONYMOUS_ENABLED` | yes | yes | `true` (exact). The A20 gate must also pass. | Umesh | no |
| `VC_JWT_ISSUER` | yes | yes | text | Umesh | no |
| exactly one of `VC_JWT_PUBLIC_KEY` / `VC_JWT_JWKS_URL` / `VC_JWT_HS256_SECRET` | yes | yes | PEM on one line, an https JWKS URL, or a secret of 32+ bytes (needs `VC_JWT_ALGORITHMS=HS256`) | Umesh | HS256: yes |
| `VC_LLM_PROVIDER` | `gemini` | `litellm` | exact word | Umesh | no |
| `VC_LLM_MODEL` | yes | yes | model id | Umesh | no |
| `GEMINI_API_KEY` | yes | no | key | Umesh | yes |
| `VC_LLM_BASE_URL` | no | yes | gateway URL | Umesh | no |
| `VC_LLM_API_KEY` | no | optional | gateway key | Umesh | yes |
| `VC_TEXT_CHAIN` | ignored | optional | `ollama:<model>,ollama:<model>` | Umesh | no |
| `OLLAMA_API_KEY` | no | chain | key | Umesh | yes |
| `VC_CHAIN_MONTHLY_CAP_USD` | no | chain | positive number; with a chain the API refuses to start without it | Umesh | no |
| `VC_KB_BASE_URL` | yes | yes | KB base URL | Umesh / KB team | no |
| `VC_KB_ANON_API_KEY` | yes | yes | search-only KB key | Umesh / KB team | yes |

How the provider and the chain interact (`apps/api/src/index.ts` lines 664 to 670, `packages/providers/src/index.ts` line 212):
- `gemini`: one vendor for every student-facing role. A `VC_TEXT_CHAIN` left in the file is not read (one warning, `text_chain_ignored`), so `OLLAMA_API_KEY` and the cap are not needed.
- `litellm` without a chain: the litellm provider answers students.
- `litellm` with a chain: the chain answers students, but `VC_LLM_MODEL` and `VC_LLM_BASE_URL` are still required (the scribe and the safety classifier use the provider).
- `VC_CHAT_ENABLED` and `VC_VOICE_ENABLED` are off when unset. Writing `false` is allowed; any other word (including a space) stops the start.
- The `VC_JWT_*` lines are needed even for anonymous-only: the counsellor token verifier is built at startup. Never invent a placeholder HS256 secret; ask Umesh (section 11).

### 4d. M2 additions

| Name | Value shape | Supplied by | Secret |
|---|---|---|---|
| `VC_CHAT_ENABLED` | `true` | Umesh | no |
| `VC_KB_API_KEY` | KB chat key (`/ask`) | Umesh / KB team | yes |
| `VC_STUDENT_JWT_ISSUER`, `VC_STUDENT_JWT_AUDIENCE` | text | Pathlynks / Vidysea teams via Umesh | no |
| exactly one of `VC_STUDENT_JWT_PUBLIC_KEY` / `VC_STUDENT_JWT_JWKS_URL` / `VC_STUDENT_JWT_HS256_SECRET` | as above | host teams via Umesh | HS256: yes |
| `VC_STUDENT_JWT_ALGORITHMS`, `VC_STUDENT_JWT_CLOCK_SKEW_SEC`, `VC_STUDENT_JWT_CLAIM_TENANT`, `_CLAIM_STUDENT_ID`, `_CLAIM_ROLE`, `_CLAIM_IS_MINOR`, `_CLAIM_AGE`, `_CLAIM_GUARDIAN_CONSENT` | optional claim-name overrides | host teams via Umesh | no |
| `VC_PARTNER_KEY_PEPPER` | 32+ characters. Changing it invalidates every partner key. | Umesh | yes |
| `VC_RESERVED_TENANT_IDS` | every tenant id the student JWTs carry, comma or space separated. Empty blocks partner keys. | host teams via Umesh | no |
| `VC_PARTNER_OWN_TENANTS` | for example `pathlynks:pathlynks` | Umesh | no |
| `VC_AUDIT_HMAC_KEY` | 32+ characters (erasure audit) | Umesh | yes |
| `VC_ERASURE_APPROVER_EMAIL` | email, needed while `VC_ERASURE_AUTO_DELETE` is false | Umesh | no |
| `PATHLYNKS_DB_PASSWORD`, `PATHLYNKS_DB_CA_FILE` | password; absolute path of the CA file | Pathlynks team | password: yes |
| `VIDYSEA_DB_PASSWORD`, `VIDYSEA_DB_CA_FILE` | read-only role password; CA file path | Vidysea team | password: yes |
| `VC_PARTNER_KEY_REQUIRED` | `true` only if Umesh wants the anonymous route to need a page key. Leave unset for M1. | Umesh | no |

The Postgres host, port, database and user are not env values: they are fixed in `config/sources.json` in the checkout (ids `pathlynks-db` and `vidysea-db`, `sslmode` `verify-full`). Only the password and the CA file path come from `vc.env`.
`VC_ERASURE_AUTO_DELETE` defaults to false (`packages/db/src/erasure.ts` line 233): erasure then waits for the approver email above.

### 4e. Voice, admin console and optional names

Voice stays off until Umesh says go: `VC_VOICE_ENABLED=true`, `VC_VOICE_MODEL`, `GEMINI_API_KEY`, `VC_VOICE_WS_SECRET` (32+ bytes, secret),
`VC_VOICE_WS_BASE_URL` (a `wss://` URL with no credentials). The voice gate and the paid allowance are Umesh's decision.

| Name | Note |
|---|---|
| `VC_ADMIN_JWT_SECRET` | 32+ characters. The admin API is mounted only when it is set. Secret. |
| `VC_ADMIN_MASTER_KEY` | base64 of exactly 32 random bytes. Any other length stops startup. Secret. |
| `VC_USD_INR_RATE` | number for the cost dashboard |
| `GITHUB_TOKEN` | optional; source navigation only. Secret. |
| `VC_ADMIN_API_URL`, `VC_WEB_MODE` | read by the admin console (`apps/web`), not by the API. `VC_WEB_MODE` must be exactly `live`. |
| `VC_API_PORT` | default 8080; nginx points at 8080, so leave it |
| `VC_SPEAKERS_FILE` | `/etc/vc/speakers.json`. If set and the file is missing or invalid the launcher refuses to start. With no file, delete the line. |
| `VC_KB_TIMEOUT_MS`, `VC_KB_BREAKER_FAILS`, `VC_KB_BREAKER_COOLDOWN_MS`, `VC_KB_ROUTE` | KB client tuning (`VC_KB_TIMEOUT_MS` is 1000 to 30000) |
| `VC_TEXT_CHAIN_HOP_TIMEOUT_MS`, `VC_TEXT_CHAIN_DEADLINE_MS`, `OLLAMA_BASE_URL` | chain tuning |
| `VC_CONCERN_MODEL`, `VC_MODEL_SUMMARY`, `VC_MODEL_ANSWER`, `VC_MODEL_ROUTER`, `VC_REPLY_LANGS`, `VC_ANONYMOUS_SAFETY_SCREEN` | model and language options |
| `MONGO_CLIENT_TIMEOUT_MS`, `VC_SKILLS_DIR`, `VC_PATHLYNKS_TIMEOUT_MS`, `PATHLYNKS_ALLOW_PRIVILEGED_ROLE` | advanced; leave unset unless Umesh says |
| `VC_WEBHOOK_SECRET`, `VC_WEBHOOK_DESTINATION_URL` | only if the webhook is turned on |

Do not set the `VC_EVIDENCE_*` names from `.env.example`; they are for local test runs only.

## 5. Host steps

Each step has its expected result. Replace `<VC-REPO-URL>` and `<SHA>` with the values Umesh gives you.
Use `sudo -H -u vc` for everything that runs as the service user (`-H` sets `HOME=/opt/vc`).

1. Packages: `sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx git curl gnupg ca-certificates netcat-openbsd`.
   - 1b. `mongosh` (MongoDB's published apt repo; if the repo line fails, install the `.deb` from the MongoDB download page):
     ```sh
     curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | sudo gpg --dearmor -o /usr/share/keyrings/mongodb-server-8.0.gpg
     echo "deb [signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg] https://repo.mongodb.org/apt/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME)/mongodb-org/8.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
     sudo apt update && sudo apt install -y mongodb-mongosh
     ```
   Expected: `mongosh --version` and `nc -h` run. No compiler or `build-essential` is needed: the lockfile has no package that builds native code (`esbuild` ships prebuilt binaries). If install ever shows a compile error, stop and send the output to Umesh.
2. User and directories:
   ```sh
   sudo useradd --system --home /opt/vc --shell /usr/sbin/nologin vc
   sudo mkdir -p /opt/vc /etc/vc && sudo chown vc:vc /opt/vc && sudo chmod 755 /opt/vc
   ```
   Expected: `id vc` prints the user; `ls -ld /opt/vc` shows `drwxr-xr-x vc vc`. Keep `/opt/vc` empty until step 5, or the clone fails.
3. Node. The repo allows `>=20.16`. Node 20 is past end of life, so install 22 LTS (the repo's `@types/node` is 22) from NodeSource:
   ```sh
   curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh   # read it, then:
   sudo bash /tmp/nodesource_setup.sh && sudo apt install -y nodejs
   ```
   Expected: `node -v` prints `v22.x`, which is above v20.16. If Umesh names another major, use that.
4. Clone access, outside `/opt/vc`. Umesh gives either a deploy key or an HTTPS token URL (section 11).
   - Deploy key (SSH): save the private key as `/etc/vc/deploy_key`, then
     `sudo chown vc:vc /etc/vc/deploy_key && sudo chmod 600 /etc/vc/deploy_key`. Record the git host's key once: `ssh-keyscan <GIT-HOST> | sudo tee /etc/vc/known_hosts >/dev/null` and compare its fingerprint with the host's published one.
   - HTTPS token: save the whole clone URL (token inside) as the only line of `/etc/vc/git_url`, owned by `vc`, mode 600. Never type the token on a command line.
5. Code. Use `git clone`; never copy folders by hand. The API reads `skills/`, `qa/gates/`, `qa/evidence/p1-a10-diag/` and `config/` from the checkout at boot, and a copy usually misses one.
   ```sh
   # SSH deploy key:
   sudo -H -u vc env GIT_SSH_COMMAND='ssh -i /etc/vc/deploy_key -o IdentitiesOnly=yes -o UserKnownHostsFile=/etc/vc/known_hosts' git clone <VC-REPO-URL> /opt/vc
   # or HTTPS token (then strip the token from the remote):
   sudo -H -u vc sh -c 'exec git clone "$(cat /etc/vc/git_url)" /opt/vc'
   sudo -H -u vc git -C /opt/vc remote set-url origin <VC-REPO-URL-WITHOUT-TOKEN>
   # both:
   sudo -H -u vc git -C /opt/vc checkout <SHA>
   sudo -H -u vc git -C /opt/vc rev-parse HEAD
   ```
   Expected: the last command prints `<SHA>` in full. Any later `git fetch` needs the same access (the `GIT_SSH_COMMAND` prefix, or the token URL set again for the fetch).
6. pnpm. The version is pinned by `packageManager` in the root `package.json`.
   ```sh
   sudo corepack enable
   sudo -H -u vc pnpm -C /opt/vc -v
   ```
   Expected: `10.33.0` (the pinned version). The first run downloads it from `registry.npmjs.org` into `/opt/vc/.cache`; `.cache` and `.local` appear as untracked folders in `/opt/vc`, which is normal.
7. Install: `sudo -H -u vc pnpm -C /opt/vc install --frozen-lockfile`. Never use `--prod`, and never copy `node_modules` from a Windows machine. Expected: exit 0.
   If it fails, **stop** and send the full output to Umesh. Never delete or edit `pnpm-lock.yaml` and never drop `--frozen-lockfile`.
8. Keep the output of `node -v` and `pnpm -C /opt/vc -v`; B11 asks for it.
9. Environment file: create `/etc/vc/vc.env` as in section 4a, then
   `sudo chown root:vc /etc/vc/vc.env && sudo chmod 640 /etc/vc/vc.env`. A speakers file, if any, goes to `/etc/vc/speakers.json`.
   Check without printing values (each prints names or line numbers only):
   ```sh
   sudo cut -s -d= -f1 /etc/vc/vc.env | sort          # names: compare with section 4c
   sudo grep -c $'\r' /etc/vc/vc.env                  # must print 0 (no CRLF)
   sudo grep -nE '[[:space:]]+$' /etc/vc/vc.env | cut -d: -f1   # must print nothing (no trailing spaces)
   ```
10. Reachability from the server (B6). These read the URLs from `vc.env` with the same parser as the service, so the URL is never typed or echoed:
    ```sh
    # Mongo ping: must print 1
    sudo systemd-run --pipe --wait --quiet -p User=vc -p EnvironmentFile=/etc/vc/vc.env -p PrivateTmp=yes -p Environment=HOME=/tmp \
      /bin/sh -c 'exec mongosh "$MONGODB_URL" --quiet --eval "db.runCommand({ping:1}).ok"'
    # Mongo roles: must list readWrite on virtual_counsellor, read on pathlynks_journey, nothing else
    sudo systemd-run --pipe --wait --quiet -p User=vc -p EnvironmentFile=/etc/vc/vc.env -p PrivateTmp=yes -p Environment=HOME=/tmp \
      /bin/sh -c 'exec mongosh "$MONGODB_URL" --quiet --eval "printjson(db.runCommand({connectionStatus:1}).authInfo.authenticatedUserRoles)"'
    # KB: must print an HTTP code (any code; a timeout prints 000 and is a failure)
    sudo systemd-run --pipe --wait --quiet -p User=vc -p EnvironmentFile=/etc/vc/vc.env \
      /bin/sh -c 'exec curl -sS -m 10 -o /dev/null -w "%{http_code}\n" "$VC_KB_BASE_URL"'
    ```
    The Mongo URL is briefly visible to local users in the process list while `mongosh` runs; that is acceptable on a host used only for VC. `/ready` (section 8) repeats the ping later.
    If a roles entry is missing or too wide, stop and tell Umesh. A KB timeout blocks M1 only if Umesh says so (section 11).
11. Service (after sections 6 and 7 pass):
    ```sh
    sudo cp /opt/vc/infra/ubuntu/vc-api.service /etc/systemd/system/
    sudo systemctl daemon-reload && sudo systemctl enable --now vc-api
    systemctl status vc-api
    journalctl -u vc-api -n 50
    ```
    Expected: `active (running)` and a line with `"event":"vc_api_listening"`. If it exits, the last journal line is
    `vc-api failed to start: ...` and names the variable (section 4b). Fix `vc.env` and run `sudo systemctl restart vc-api`.

## 6. Pre-start gate check

The gate records are human-written files in `qa/gates` (a signature line, two answered decision files and a Nights-mode line; the header of `apps/api/src/go-live-gate.ts` lists them).
They are part of the git checkout, so the sha you deploy carries them. The gate command only reads them. DevOps never edits `qa/gates`.

**One rule.** M1 may start only when the `anonymous` check prints `ALLOWED`. The `student-routes` check must print `ALLOWED` before M2 only.
If `student-routes` prints `REFUSED` at M1, that is expected and the service still starts (student chat is off).

```sh
sudo -H -u vc env VC_GATE_APPROVER=Umesh pnpm -C /opt/vc/apps/api go-live-gate anonymous
sudo -H -u vc env VC_GATE_APPROVER=Umesh pnpm -C /opt/vc/apps/api go-live-gate student-routes
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
problem, exit code 1. Send the output to Umesh; only he records gate decisions, and a new sha carries them.

## 7. nginx and TLS

Fields in `infra/ubuntu/nginx-vc.conf` that DevOps edits: only `server_name` (replace `vc.example.org`; it also appears in comments, which is harmless).
Do not add certificate paths (certbot writes them). There is no `upstream`: the API is `http://127.0.0.1:8080` in each `proxy_pass`; change nothing unless `VC_API_PORT` was changed.
If the copy on the server lacks the `/health` and `/ready` locations, do not edit by hand: take the file from the deployed sha.

1. The request-limit zone goes at http level, once:
   `echo 'limit_req_zone $binary_remote_addr zone=vcchat:10m rate=20r/m;' | sudo tee /etc/nginx/conf.d/vc-limit.conf`
2. Install the site and remove the stock one:
   ```sh
   sudo cp /opt/vc/infra/ubuntu/nginx-vc.conf /etc/nginx/sites-available/vc
   sudo sed -i 's/vc\.example\.org/<VC-HOST>/' /etc/nginx/sites-available/vc
   sudo ln -s /etc/nginx/sites-available/vc /etc/nginx/sites-enabled/vc
   sudo rm -f /etc/nginx/sites-enabled/default
   ```
3. Test, reload, then certificate (the DNS name must already resolve to this server and port 80 be open):
   ```sh
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d <VC-HOST> --non-interactive --agree-tos -m <OPS-EMAIL> --redirect
   sudo certbot renew --dry-run
   systemctl list-timers | grep -i certbot
   ```
   Expected: `nginx -t` says "syntax is ok"; certbot adds the 443 block and the redirect; the dry run says "all simulated renewals succeeded"; a certbot timer is listed.
4. Check for the KB redirect failure: `curl -sI http://<VC-HOST>/ | grep -i '^location'` must show `https://<VC-HOST>/`, never an IP address.
5. nginx runs as `www-data` and must read the static files: `/opt/vc/apps/student` and `/opt/vc/apps/widget/src` are in the checkout (world-readable by default).
   Only when the widget release directory exists (M2, section 9): `[ -d /opt/vc/releases ] && sudo chmod -R a+rX /opt/vc/releases || true`.
   Expected: `curl -s -o /dev/null -w '%{http_code}\n' https://<VC-HOST>/` prints `200`.

Public URL to disk, from the last `location ~ "^/widget/releases/..."` block:

| Public URL | File on disk |
|---|---|
| `https://<VC-HOST>/widget/releases/<SHA>/vc-widget.v1.js` | `/opt/vc/releases/<SHA>/widget/vc-widget.v1.js` |
| `.../vc-widget.js` | `/opt/vc/releases/<SHA>/widget/vc-widget.js` |
| `.../vc-widget-voice.v1.js` | `/opt/vc/releases/<SHA>/widget/vc-widget-voice.v1.js` |

`<SHA>` is 40 lowercase hex characters. Any other name under `/widget/releases/` or `/widget/` answers 404.

Rules that must not be broken:
- **CORS is done by the API**, per partner key and its origin list. Never add `Access-Control-*` headers, method restrictions or `X-VC-Key` / `Authorization` rewrites at nginx, a CDN or any front proxy.
  Preflight (`OPTIONS`) requests must reach the API.
- Only the listed `/v1` locations are proxied. Every other `/v1/` path answers 404 at nginx. Do not widen it.
- The site sets `X-Real-IP` from the socket address. Do not pass a client-supplied `X-Real-IP` or rely on `X-Forwarded-For`. The API has no trust-proxy setting: it reads only `X-Real-IP`.
- If another proxy or CDN sits in front of this nginx, tell Umesh first. The per-client rate limit reads the address nginx sees.
- `/health` and `/ready` are exact locations with no rate limit. Check your copy: `grep -n 'health' /etc/nginx/sites-available/vc`.
- The voice stream locations write `/var/log/nginx/vc-voice-stream.access.log`. Add the logrotate entry in `docs/go-live-checklist.md` (line 59 onward).
- Leave `error_log` at nginx's default level. `grep -n error_log /etc/nginx/nginx.conf` must show no level or `error` (or `crit`, `alert`, `emerg`). Never set `warn`, `notice`, `info` or `debug`: they would print request lines that hold voice tokens.

## 8. Smoke checks

Run on the server first, then from outside. `B=https://<VC-HOST>`.

| Check | Command | Expected |
|---|---|---|
| Health | `curl -sS -w '\n%{http_code}\n' $B/health` | `{"status":"ok"}` then `200` |
| Ready | `curl -sS -w '\n%{http_code}\n' $B/ready` | `{"status":"ready"}` then `200` (503 `{"status":"unavailable"}` means Mongo is not reachable) |
| Anonymous turn | `curl -sS -w '\n%{http_code}\n' -X POST $B/v1/public/chat/turns -H 'content-type: application/json' -d '{"text":"hello"}'` | HTTP `200` and a JSON body with `state`, and `message` when there is one (`apps/api/src/anonymous.ts` line 533) |
| Partner OpenAPI | `curl -sS -o /dev/null -w '%{http_code}\n' $B/v1/partner/openapi.json` | `200` |
| Unlisted path | `curl -sS -o /dev/null -w '%{http_code}\n' $B/v1/admin/x` | `404` |
| Student UI | `curl -sS -o /dev/null -w '%{http_code}\n' $B/` | `200` |

Notes: if the anonymous turn answers `404`, the route is off (`VC_ANONYMOUS_ENABLED` not `true`) or the service did not start.
If it answers a degraded "try again" reply, check the KB (`VC_KB_BASE_URL`, redeploy pending) and the LLM key; do not retry in a loop. Whether a degraded reply counts as M1 passed is Umesh's call (section 11).
Alerts are one JSON line on stderr: watch `journalctl -u vc-api -f` for `"event":"alert_` (see `docs/runbook-golive.md`).

## 9. Widget release directory (M2)

Applies only at M2, when the release directory is built. At M1 skip it (nginx simply has no such directory).
Host frontends load the widget from an immutable directory built from ONE reviewed commit. Never overwrite a released directory.

```sh
SHA=$(sudo -H -u vc git -C /opt/vc rev-parse HEAD)   # the same 40-character sha Umesh approved
R=/opt/vc/releases/$SHA/widget
sudo -H -u vc mkdir -p "$R"
sudo -H -u vc cp /opt/vc/apps/widget/src/vc-widget.js "$R/vc-widget.js"
sudo -H -u vc cp /opt/vc/apps/widget/src/vc-widget.js "$R/vc-widget.v1.js"
sudo -H -u vc cp /opt/vc/apps/widget/src/voice.js    "$R/vc-widget-voice.v1.js"
sudo sh -c "cd $R && sha256sum vc-widget.js vc-widget.v1.js vc-widget-voice.v1.js > SHA256SUMS"
cat "$R/SHA256SUMS"
sudo chmod -R a-w,a+rX "/opt/vc/releases/$SHA"
```

Expected: three lines of `<64 hex>  <file>`; the first two hashes are identical. Send those lines to Umesh.
The URL to disk mapping is in section 7. Check: `curl -sI $B/widget/releases/$SHA/vc-widget.v1.js` returns `200`, `Cache-Control: public, max-age=31536000, immutable`.

Host build settings (set in the host repos by the host teams, not by DevOps):
- Pathlynks: `NEXT_PUBLIC_VC_WIDGET_BASE_URL=https://<VC-HOST>/widget/releases/<SHA>`
- Vidysea: `NEXT_PUBLIC_VC_WIDGET_SCRIPT_URL=https://<VC-HOST>/widget/releases/<SHA>/vc-widget.v1.js`

### 9a. Partner records (Umesh, on the VC server, M2)

The partner command reads `MONGODB_URL`, `VC_PARTNER_KEY_PEPPER`, `VC_RESERVED_TENANT_IDS` and `VC_PARTNER_OWN_TENANTS` from its environment (`apps/api/scripts/partner.ts`).
The M2 variables must already be in `vc.env` (step C0). Restart the API after adding them (`sudo systemctl restart vc-api`): it reads the pepper and tenant list at start.
Run the command as the service user with the same env file (nothing is printed except the new keys):

```sh
sudo systemd-run --pipe --wait --quiet -p User=vc -p WorkingDirectory=/opt/vc -p EnvironmentFile=/etc/vc/vc.env \
  /usr/bin/env pnpm -C apps/api partner list --check
```

Then `partner add "<name>" --id <id> --origin <https origin>` the same way (see `docs/partner-integration.md` section 4).
Keys print once; only a hash is stored. The Pathlynks origin is `https://pathlynks.vidysea.com`. The Vidysea production origin is not confirmed (section 11).

### 9b. Admin console (`apps/web`, optional for M1)

The admin console is a Next.js app. It has no nginx server or systemd unit, and it is **not published**: do not expose it.
Build with `sudo -H -u vc pnpm -C /opt/vc/apps/web build`; start with `sudo -H -u vc pnpm -C /opt/vc/apps/web start`. The start script is
`next start --hostname 127.0.0.1 --port 3108`, so it listens on loopback only.
It needs `VC_WEB_MODE=live`, `MONGODB_URL` (same Mongo allow-list as the API), `VC_ADMIN_API_URL` (the API on loopback), and on the API
`VC_ADMIN_JWT_SECRET` and `VC_ADMIN_MASTER_KEY`. Umesh creates the first admin account. Do not publish the console until Umesh chooses its host name and origin.

## 10. Rollback and upgrade

Always note the running sha first: `sudo -H -u vc git -C /opt/vc rev-parse HEAD`.

**Upgrade to a new sha** (Umesh gives the sha; expect about 30 s of 502 from nginx while the old process drains and the new one starts, because there is one copy only):

| Step | Command |
|---|---|
| 1. Fetch (needs the same clone access as step 5) | `sudo -H -u vc git -C /opt/vc fetch origin` |
| 2. Check out | `sudo -H -u vc git -C /opt/vc checkout <NEW-SHA>` |
| 3. Install | `sudo -H -u vc pnpm -C /opt/vc install --frozen-lockfile` |
| 4. Gate re-check | section 6, `anonymous` must print `ALLOWED` |
| 5. Restart | `sudo systemctl restart vc-api` |
| 6. Smoke | section 8 |

**Rollback:**
- Code: `sudo -H -u vc git -C /opt/vc checkout <previous-sha>`, `sudo -H -u vc pnpm -C /opt/vc install --frozen-lockfile`, `sudo systemctl restart vc-api`, then section 8.
- Env change that broke start: restore the previous file (keep `/etc/vc/vc.env.prev`, mode 640, owner `root:vc`), then restart.
- Widget: the old `/opt/vc/releases/<old-sha>/widget/` directory is still there. Host teams point their build setting back to it. Never delete or edit a released directory.
- Switch a surface off without a deploy: set `VC_CHAT_ENABLED=false` and/or `VC_VOICE_ENABLED=false` in `vc.env` and restart.
- Data: VC deploys run no migrations. Student databases are not rolled back by a code rollback. Restore Mongo from backup only with Umesh's yes.
- Never run `git clean` or delete `qa/gates` to "reset".

## 11. Not confirmed

Nothing here is guessed. Each row needs an answer from the owner shown. "Blocks M1" means DevOps cannot finish M1 without it.

| # | Question | Who answers | Blocks M1 |
|---|---|---|---|
| 1 | Host name for VC and who owns its DNS | Umesh / DevOps | yes |
| 2 | Cloud or on-prem; Ubuntu version; sizing; admin IPs for SSH; which firewall tool | DevOps | yes |
| 3 | Mongo: self-hosted or Atlas; `mongodb://` or `mongodb+srv://`; TLS CA file if private; who owns the Mongo host | Umesh / Mongo owner | yes |
| 4 | Who creates the Mongo users (`virtual_counsellor` readWrite, `pathlynks_journey` read) and who runs the role check in step 10 | Mongo owner | yes |
| 5 | KB scheme, base URL and port; is plain `http` acceptable on that link; does A7 (KB redeploy pending) block M1. `vidysea.com/knowledgebase` redirected to a raw IP on 2026-11-01: do not use it | Umesh / KB team | yes |
| 6 | Repo URL, the sha to deploy, and the clone method (deploy key or HTTPS token) | Umesh | yes |
| 7 | The private channel for secrets and who sends the `vc.env` values | Umesh | yes |
| 8 | `VC_LLM_PROVIDER` (gemini or litellm), model ids, whether a `VC_TEXT_CHAIN` is used, and the `VC_CHAIN_MONTHLY_CAP_USD` value | Umesh | yes |
| 9 | Real counsellor-JWT keys for `VC_JWT_ISSUER` and `VC_JWT_*`. Never invent a placeholder HS256 secret; ask Umesh | Umesh | yes |
| 10 | Node major to install (22 recommended here; 24 also satisfies `>=20.16`) | Umesh | no |
| 11 | Whether 443 may be public at M1 before sign-off, or should be restricted to named IPs | Umesh | yes |
| 12 | Who declares M1 passed, and whether a degraded anonymous reply counts as a pass | Umesh | yes |
| 13 | Backup and restore of `virtual_counsellor`; on-call contact; journald retention; whether logs may hold personal data | Umesh / DevOps | no |
| 14 | `VC_ERASURE_AUTO_DELETE` intended value (the code default is false) and `VC_ERASURE_APPROVER_EMAIL` | Umesh | no (M2) |
| 15 | Student JWT issuer, key source (public key or JWKS), audience, and tenant ids for `VC_RESERVED_TENANT_IDS` | Pathlynks / Vidysea teams via Umesh | no (M2) |
| 16 | The Vidysea production frontend origin (only a UAT ECR repository is known) | Vidysea team | no (M2) |
| 17 | RDS CA files for Pathlynks and Vidysea; the Vidysea read-only role | Pathlynks / Vidysea teams | no (M2) |
| 18 | Whether voice is cleared to go live (paid allowance and the gate) | Umesh | no |
| 19 | Contacts: KB team, Mongo owner, Pathlynks team, Vidysea team | Umesh | yes |

Answered from code, so not open: no trust-proxy setting exists (the API reads `X-Real-IP` only); `VC_ERASURE_AUTO_DELETE` defaults to false;
the Postgres host, database and user are fixed in `config/sources.json` (section 4d).

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
4. The git sha deployed (`sudo -H -u vc git -C /opt/vc rev-parse HEAD`).
5. The output of the gate checks (section 6).
6. The smoke-check output (section 8), and the `SHA256SUMS` lines (section 9) once the widget directory exists.
7. The result of the Mongo checks A4 and B6 (ping, roles, KB code), without any connection string.

## 14. Ready-to-send request

> Subject: VC (Virtual Counsellor) go-live on Ubuntu
>
> Please deploy VC by following `docs/DEVOPS-HANDOVER.md` in the VC repository, in the order given (section 2).
> Start with the network and Mongo checks (block A). Do not start the service until the gate check (section 6) prints ALLOWED.
> Umesh will send the commit sha and the `/etc/vc/vc.env` values by a private channel; please do not ask for them in chat or tickets.
> Do not guess any value. If a step does not match what you see, stop and ask.
> When done, send back the items in section 13.
