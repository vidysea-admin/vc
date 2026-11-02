# DevOps handover: take the Virtual Counsellor (VC) live on Ubuntu

Audience: the Vidysea DevOps team. Written 2026-11-02. This is the one ordered runbook for VC.
It names environment variables only. Values come from Umesh by a private channel, never chat, git or tickets. Never print `/etc/vc/vc.env`. Never paste a connection string into a command line you type; the commands below read it from the env file.
`systemctl` and `journalctl` need `sudo` here, and the examples add `--no-pager` so output never opens a pager. Supported OS: Ubuntu 22.04 LTS or 24.04 LTS.

Detail files: `infra/ubuntu/README.md` (install steps), `infra/ubuntu/nginx-vc.conf`, `infra/ubuntu/vc-api.service`, `docs/partner-integration.md` (partner keys and widget release), `docs/go-live-checklist.md`, `docs/runbook-golive.md` (alerts), `qa/evidence/deploy-readiness.md` (the gap audit).

## Why this file exists

The Knowledge Base (KB) go-live failed in five ways, and each has an answer here: Mongo open to the internet (section 2, A and B6); env values never reaching the process (section 4: systemd reads `/etc/vc/vc.env` directly, no containers); a redirect to a raw IP (section 7, step 4); guessed values (every value is read from code, named to an owner, or listed in section 11; do not guess, ask); a runbook written after the deploy (this one was written before and cold-read).

## 1. What VC is

- A Node TypeScript service (not Python). Claude Code is not used at runtime.
- One process: `pnpm -C apps/api start` (runs `tsx src/main.ts`). It serves HTTP and the voice WebSocket on one port (default 8080) and binds `127.0.0.1` only. nginx is the only public listener.
- State lives in MongoDB database `virtual_counsellor`, plus one read-only database, `pathlynks_journey`, on the same Mongo host.
- **M1** = anonymous chat behind TLS. Needs the host, the Mongo allow-list, the KB and the LLM key.
- **M2** = embedded, personalised chat after partner keys exist, for the Vidysea and Pathlynks frontends.
- nginx serves the student UI `apps/student` as static files, no build step. The widget: hosts load only the three files under `/widget/releases/<sha>/` (section 9, built at M2). `apps/widget/src` is the build source copied into that directory in section 9; the nginx file also aliases three unversioned `/widget/*.js` names straight to it (section 7). VC itself (M1) loads no widget.

## 2. Checklist (owner-ordered)

Do the blocks in order. Owners: DevOps, Umesh, Pathlynks team, Vidysea team.

### A. Network and security (first; needs no secret values)

| # | Owner | Action | Done when |
|---|---|---|---|
| A1 | DevOps | Provision the Ubuntu host and a DNS name. Firewall: default deny inbound. Allow 80 and 443, SSH only from admin IPs. Do not open 8080. | An external port scan shows only 80 and 443 (and SSH from admin IPs). |
| A0 | DevOps | Install the tools: `curl`, `nc`, `mongosh` (section 5, steps 1 and 1b). A2 and A4 need them. | `curl --version`, `mongosh --version` and `nc -h` run. |
| A2 | DevOps | Find the server's public egress IP and send it to Umesh. On the server run `curl -sS https://checkip.amazonaws.com` (or any public IP echo service your team accepts), or read the NAT gateway / Elastic IP address in the cloud console. It must be static: a fixed Elastic IP or NAT gateway. If it can change, say so, because the Mongo and RDS allow-lists break when it does. | Umesh has the IP and DevOps confirms it is static. |
| A3 | Umesh + Mongo host owner | Add that IP to the Mongo host allow-list. | The Mongo owner confirms. The ping test is B6, after `vc.env` exists. |
| A4 | DevOps | Prove Mongo is closed (this was the KB failure). The Mongo host name comes from the Mongo owner (a host name is not secret; do not read it from `vc.env`). **Probe 1, run by DevOps from a machine outside the allow-list** (for example a laptop on a mobile hotspot, or a cloud VM in another account; never the VC server and never an admin IP that was allow-listed): `nc -vz -w 5 <VC-MONGO-HOST> 27017` must time out or be refused. **Probe 2, run by DevOps on the new VC server** (A0 done), with no credentials: `mongosh --host <VC-MONGO-HOST> --eval 'db.adminCommand({listDatabases:1})'` must fail with an authentication error. If probe 2 fails with a TLS or handshake error instead, the server may accept only TLS: repeat it as `mongosh --tls --host <VC-MONGO-HOST> --eval '...'` (add `--tlsCAFile <file>` if the Mongo owner uses a private CA) and expect the authentication error. A TLS error alone does not prove auth is on; the authentication error does. | Both behave as written. If either does not, stop and tell Umesh. |
| A5 | Pathlynks team | Allow the server egress IP on the Pathlynks Postgres RDS, port 5432. Supply the AWS RDS CA bundle file. | DevOps has received the CA file. Step 9 of section 5 installs it as `/etc/vc/ca/pathlynks-rds-ca.pem`, the value of `PATHLYNKS_DB_CA_FILE` (M2 only). |
| A6 | Vidysea team | Allow the server egress IP on the Vidysea Postgres RDS, port 5432, read-only role. Supply the CA file and the role password. | DevOps has received the CA file. Step 9 of section 5 installs it as `/etc/vc/ca/vidysea-rds-ca.pem`, the value of `VIDYSEA_DB_CA_FILE` (M2 only). |
| A7 | Umesh + KB team | The KB team confirms the KB service is up and gives Umesh the base URL (section 11). | Umesh has the URL. The reachability test is B6. |

### B. Server and release

| # | Owner | Action | Done when |
|---|---|---|---|
| B1 | DevOps | User and directories (section 5, step 2; packages were A0). | `id vc` works. |
| B2 | Umesh | Give DevOps the exact git sha and the clone access (section 5, step 4). | DevOps has both. |
| B3 | DevOps | Node, clone access, clone, pnpm, `pnpm install --frozen-lockfile` (section 5, steps 3 to 7). | `node -v` prints `v22.x` (a preinstalled Node 20, or any version below 22, must be replaced: step 3); install exits 0. |
| B4 | Umesh | Send the `vc.env` values by a private channel (section 4). | DevOps has them. |
| B5 | DevOps | Write `/etc/vc/vc.env` (section 5, step 9). | `ls -l /etc/vc/vc.env` shows `-rw-r----- root vc`; the name check (step 9) finds no missing name. |
| B6 | DevOps | Reachability from the server, reading the URLs from `vc.env` (section 5, step 10): Mongo ping, Mongo roles, KB. | Ping prints `1`; roles are as stated; KB prints an HTTP code. Send the output (no URL) to Umesh. |
| B7 | DevOps | Pre-start gate check (section 6). | `anonymous` prints `ALLOWED`. |
| B8 | DevOps | nginx site and TLS (section 7, steps 1 to 5). | `nginx -t` passes; HTTPS loads. |
| B8b | DevOps | Logrotate entry for the voice log (section 7, step 6). Do it at M1 too: the voice routes exist in nginx at M1, and any request to them is logged there, even when voice is off. It is required before voice is switched on. | `sudo logrotate -d /etc/logrotate.d/vc-voice-stream` prints no error. |
| B9 | DevOps | systemd unit (section 5, step 11). | `sudo journalctl --no-pager -u vc-api -n 50` shows `vc_api_listening`. |
| B10 | DevOps | Smoke checks (section 8). | All expected outputs match. |
| B11 | DevOps | Send back the items in section 13. | Umesh has them. |

### C. M2 (after M1 passes)

| # | Owner | Action | Done when |
|---|---|---|---|
| C0 | DevOps builds; Umesh gives the sha | Build the widget release directory (section 9) from the sha Umesh approved. Do it before C5 and C6: the host builds need its URL. | Three-line `SHA256SUMS` sent to Umesh; `curl -sI https://<VC-HOST>/widget/releases/<SHA>/vc-widget.v1.js` returns `200` and `immutable`. |
| C1 | DevOps | Run the `student-routes` gate (section 6) before any M2 variable is written. | Prints `ALLOWED` with four `ok` lines. |
| C2 | DevOps (one owner). Umesh does not log in unless section 11 row 21 says so | Do not start until section 11 rows 14 and 23 (student-JWT values, KB chat key) are answered: a missing value crash-loops the one process and takes M1 down too (`apps/api/src/main.ts` lines 161 to 173); `vc.env.prev` is the way back. Copy `vc.env` to `vc.env.prev` (section 4a). Write the M2 variables (section 4d) on the server from the values Umesh sent over the private channel, including `VC_CHAT_ENABLED=true` and one admin-store variable (4d), then `sudo systemctl restart vc-api`. | `sudo systemctl --no-pager status vc-api` is `active (running)` and the journal shows a new `vc_api_listening`. |
| C3 | The person with shell and sudo on the VC server (section 9a) | `partner list --check`, then `partner add` for the two partners (section 9a). Keys print once. | Both partners show in `partner list`. |
| C4 | Umesh | Hand each server key to its team by a private channel. | Teams confirm receipt. |
| C5 | Pathlynks team | Deploy the Pathlynks backend with `VC_QUEST_ENABLED`, `VC_BASE_URL`, `VC_PARTNER_SERVER_KEY`, and the frontend built with `NEXT_PUBLIC_VC_WIDGET_BASE_URL` (section 9). | Pathlynks page loads the widget. |
| C6 | Vidysea team | Deploy the Vidysea backend with `VC_STUDENT_CENTRAL_ENABLED`, `VC_BASE_URL`, `VC_PARTNER_SERVER_KEY`, and the frontend built with `NEXT_PUBLIC_VC_WIDGET_SCRIPT_URL`. | Vidysea page loads the widget. |
| C7 | Umesh + both teams | Live walk with a TEST user on each host (voice and crisis only on a test user). | Umesh signs the walk. A personal question shows the test user's own data, not an "unavailable" reply. |

**M2 order (the one order; section 6 and section 5 step 11 point here).** Do the steps in this order and no other:
1. M1 has passed and Umesh has declared it (section 11, "who declares M1 passed").
2. C0: the widget release directory exists.
3. C1: `student-routes` prints `ALLOWED`. If it prints `REFUSED`, stop here and send the output to Umesh.
4. C2: `vc.env.prev`, M2 variables (with the admin-store variable, 4d), restart, `vc_api_listening`. `VC_CHAT_ENABLED=true` is written only now. Written earlier, with the gate refused, the service does not start (section 6).
5. C3: `partner list --check`, then `partner add` x2.
6. C4: keys handed to the teams.
7. C5 and C6: host deploys (may run in parallel).
8. C7: live walk.

## 3. Network allow-list

Roles and ports only. Real hostnames and IPs come from Umesh.

| Direction | Target role | Port | Needed for | Who opens it |
|---|---|---|---|---|
| Out | VC Mongo host, databases `virtual_counsellor` and read-only `pathlynks_journey` | 27017 | M1 | Mongo host owner (allow-list the VC server IP) |
| Out | Knowledge Base service (`VC_KB_BASE_URL`) | the port in that URL (the KB host has answered on 8081) | M1 | KB team |
| Out | LLM: Ollama Cloud (`https://ollama.com/v1`) when the text chain or litellm is used | 443 | M1 | DevOps (egress) |
| Out | Gemini API | 443 | only if `VC_LLM_PROVIDER=gemini`, voice, or `VC_GROUNDING=gemini` (grounding, section 4e) is on | DevOps (egress) |
| Out | The JWKS host of each `VC_JWT_JWKS_URL` / `VC_STUDENT_JWT_JWKS_URL` | 443, per URL | only if that variable is set instead of a public key | DevOps (egress) |
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

**The rule.** Put every value in double quotes if it has a backslash, dollar sign, hash, semicolon, space or quote character in it. What systemd documents for `EnvironmentFile=` (systemd.exec): `$VAR` is not expanded and `$` has no special meaning; quotes are supported; leading and trailing whitespace of an unquoted value is trimmed. How a backslash, a backtick, `~` or `%` is treated is **Not confirmed** here (section 11), so keep them out of secrets, or quote them and prove the value works with the B6 ping test.

| Rule | Detail |
|---|---|
| Line shape | One `NAME=value` per line. No `export`. Blank lines are fine; a line starting with `#` or `;` is a comment. No comment after a value. The unit has no `-` prefix on `EnvironmentFile`, so a missing file fails the start. |
| Quotes | Optional for plain values. systemd removes one pair of surrounding quotes. Never leave a quote unclosed. |
| Characters to avoid in secrets | Backslash, `$`, `"`, `'`, backtick, `#`, `;`, `%`, spaces, line breaks and non-ASCII. Ask the supplier for hex or base64url secrets. If a value must hold one, double-quote the value. |
| Mongo password in the URL | The supplier (Umesh or the Mongo owner) percent-encodes the password inside the connection string before it is written to `vc.env` (for example `@` becomes `%40`). DevOps never edits it. So `MONGODB_URL` may hold `%`: double-quote it, and the B6 ping proves it. |
| Line endings and spaces | LF only (a CRLF file puts a carriage return in every value). No spaces around `=`. No trailing spaces: systemd trims them from unquoted values, but a quoted value keeps them. |
| PEM public key | One line, in double quotes, with each line break written as the two characters backslash and `n`: `VC_JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIB...\n-----END PUBLIC KEY-----"`. This is the one place a backslash is expected. The API replaces each literal `\n` (backslash, n) with a newline before it reads the key (`jwtConfigFromEnv` in `apps/api/src/auth.ts`) and a real newline is accepted too, so the key works whichever way systemd reads the `\n` inside double quotes. A wrong key stops the start with `VC_JWT_PUBLIC_KEY is not a readable PEM public key`. |
| `%` in units and `systemd-run` | systemd treats `%` as a specifier in unit files and in `systemd-run` command lines (`%n`, `%H`, ...). Write `%%` for a literal percent sign, or avoid it. No command in this runbook that goes through `systemd-run` holds one. Commands you type in your own shell (section 8, `curl -w '%{http_code}'`) are not affected. |

Write the file without shell-history leakage (never `echo VALUE >> vc.env`, never a value on a command line). **Before every edit** keep the working copy, so a bad edit can be undone:

```sh
sudo install -m 640 -o root -g vc /etc/vc/vc.env /etc/vc/vc.env.prev   # skip on the very first write (no file yet)
sudo install -m 640 -o root -g vc /dev/null /etc/vc/vc.env             # first write only
sudoedit /etc/vc/vc.env            # type or paste the lines; nothing enters shell history
# or, if Umesh sends a finished file: sudo install -m 640 -o root -g vc ./received.env /etc/vc/vc.env && shred -u ./received.env
```

- `vc.env.prev` is kept only from the edit until the next successful smoke check (section 8) after it. Then run `sudo shred -u /etc/vc/vc.env.prev`. Never keep older copies.
- `sudoedit` and editors leave temporary, swap or backup files. After every edit list them and delete each one with `sudo shred -u <file>`:
  `sudo find /etc/vc /tmp /var/tmp \( -name 'vc.env*' -o -name '.vc.env*' \) -not -name vc.env -not -name vc.env.prev`

### 4b. What the service unit does (`infra/ubuntu/vc-api.service`)

| Setting | Value |
|---|---|
| User / Group / WorkingDirectory | `vc` / `vc` / `/opt/vc` |
| ExecStart / EnvironmentFile | `/usr/bin/env pnpm -C apps/api start` / `/etc/vc/vc.env` |
| Restart | `on-failure`, `RestartSec=5` |
| Stop / hardening | `KillSignal=SIGTERM`, `TimeoutStopSec=30`; `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=full`, `ProtectHome=true`. `StartLimit` is not set; the systemd default (5 starts in 10 s) is never reached with a 5 s delay. |

**A missing or bad variable crash-loops.** The launcher exits with `vc-api failed to start: <variable> ...` and systemd restarts it every 5 s forever.
It does not give up. Watch `sudo journalctl -u vc-api -f`, fix `vc.env` (copy it to `vc.env.prev` first, section 4a), then `sudo systemctl restart vc-api`.

Two settings are mandatory and easy to forget:
- `VC_GATE_APPROVER=Umesh`. It must match the name in the `qa/gates` records exactly (capital U, no spaces). Without it the go-live gate refuses.
- `VC_LLM_PROVIDER` must be `litellm` or `gemini`. Never `mock` or `rules` on a live server. There is no default.

### 4c. M1 required set (anonymous chat)

Pick the column for the provider Umesh names (section 11). "chain" means: only if `VC_TEXT_CHAIN` is set.

| Name | gemini | litellm | Value shape | Supplied by | Secret |
|---|---|---|---|---|---|
| `MONGODB_URL` | yes | yes | connection string; user with rights on `virtual_counsellor` | Umesh / Mongo owner | yes |
| `VC_GATE_APPROVER` | yes | yes | `Umesh` | Umesh | no |
| `VC_ANONYMOUS_ENABLED` | yes | yes | `true` (lower case; surrounding spaces are trimmed, `True` or `1` stops the start). The A20 gate must also pass. | Umesh | no |
| `VC_JWT_ISSUER` | yes | yes | text | Umesh | no |
| `VC_JWT_AUDIENCE` | optional | optional | text. The only audience variable for counsellor tokens (`apps/api/src/auth.ts`). When set, a token's `aud` must include it; when unset, `aud` is not checked. Whether Umesh sets it: section 11. | Umesh | no |
| `VC_JWT_ALGORITHMS` | optional | optional | default `RS256,ES256` (allowed: `RS256`, `ES256`, `HS256`). `HS256` must be the only entry and needs the HS256 secret. | Umesh | no |
| exactly one of `VC_JWT_PUBLIC_KEY` / `VC_JWT_JWKS_URL` / `VC_JWT_HS256_SECRET` | yes | yes | PEM on one line, an https JWKS URL, or a secret of 32+ bytes (needs `VC_JWT_ALGORITHMS=HS256`) | Umesh | HS256: yes |
| `VC_LLM_PROVIDER` | `gemini` | `litellm` | exact word | Umesh | no |
| `VC_LLM_MODEL` | yes | yes | model id | Umesh | no |
| `GEMINI_API_KEY` | yes | no | key | Umesh | yes |
| `VC_LLM_BASE_URL` | no | yes | gateway URL | Umesh | no |
| `VC_LLM_API_KEY` | no | optional | gateway key | Umesh | yes |
| `VC_TEXT_CHAIN` | ignored | optional | `ollama:<model>,ollama:<model>` | Umesh | no |
| `OLLAMA_API_KEY` | no | chain | key | Umesh | yes |
| `VC_CHAIN_MONTHLY_CAP_USD` | no | chain | positive number; with a chain the API refuses to start without it | Umesh | no |
| `OLLAMA_PRICE_USD_PER_MTOK` | no | chain, only if needed | `<input>,<output>` USD per million tokens. Needed only when a `VC_TEXT_CHAIN` model has no built-in price (built in: `glm-5.3-flash`, `deepseek-v4.1-flash`); otherwise the API refuses to start (`packages/providers/src/index.ts` lines 2092 to 2108) | Umesh | no |
| `VC_KB_BASE_URL` | yes | yes | KB base URL | Umesh / KB team | no |
| `VC_KB_ANON_API_KEY` | yes | yes | search-only KB key | Umesh / KB team | yes |

How the provider and the chain interact (`apps/api/src/index.ts` lines 669 to 671, `packages/providers/src/index.ts` line 216):
- `gemini`: one vendor for every student-facing role. A `VC_TEXT_CHAIN` left in the file is not read (one warning, `text_chain_ignored`), so `OLLAMA_API_KEY` and the cap are not needed.
- `litellm` without a chain: the litellm provider answers students.
- `litellm` with a chain: the chain answers students, but `VC_LLM_MODEL` and `VC_LLM_BASE_URL` are still required (the scribe and the safety classifier use the provider).
- `VC_CHAT_ENABLED` and `VC_VOICE_ENABLED` are off when unset. Writing `false` is allowed; any other word (including a space) stops the start.
- The `VC_JWT_*` lines are needed even for anonymous-only: the counsellor token verifier is built at startup. Never invent a placeholder HS256 secret; ask Umesh (section 11).
- The tracing variables `LANGSMITH_TRACING`, `LANGSMITH_TRACING_V2`, `LANGCHAIN_TRACING` and `LANGCHAIN_TRACING_V2` must not be `true` (also `1`, `yes`, `on`): the anonymous, chat and voice surfaces then refuse to start. Leave them unset.

### 4d. M2 additions

| Name | Value shape | Supplied by | Secret |
|---|---|---|---|
| `VC_CHAT_ENABLED` | `true` | Umesh | no |
| at least one of `VC_ADMIN_MASTER_KEY` / `VC_ADMIN_JWT_SECRET` (details in 4e) | Required for M2 personal answers: the Pathlynks and Vidysea Postgres reads and the Mongo reads are built only when the admin store exists, and the store exists only if one of them is set (`apps/api/src/index.ts` lines 892 and 901). Without it the service starts but a personal answer does not work. Which one: section 11 row 24. | Umesh | yes (both are secrets) |
| `VC_KB_API_KEY` | KB chat key (`/ask`) | Umesh / KB team | yes |
| `VC_STUDENT_JWT_ISSUER`, `VC_STUDENT_JWT_AUDIENCE` | text | Pathlynks / Vidysea teams via Umesh | no |
| exactly one of `VC_STUDENT_JWT_PUBLIC_KEY` / `VC_STUDENT_JWT_JWKS_URL` / `VC_STUDENT_JWT_HS256_SECRET` | as above | host teams via Umesh | HS256: yes |
| `VC_STUDENT_JWT_ALGORITHMS`, `VC_STUDENT_JWT_CLOCK_SKEW_SEC`, `VC_STUDENT_JWT_CLAIM_TENANT`, `_CLAIM_STUDENT_ID`, `_CLAIM_ROLE`, `_CLAIM_IS_MINOR`, `_CLAIM_AGE`, `_CLAIM_GUARDIAN_CONSENT` | optional claim-name overrides | host teams via Umesh | no |
| `VC_PARTNER_KEY_PEPPER` | 32+ characters. Changing it invalidates every partner key. | Umesh | yes |
| `VC_RESERVED_TENANT_IDS` | every tenant id the student JWTs carry, comma or space separated. Empty is accepted with a warning only (`apps/api/src/partners.ts` lines 133 to 135, 576), but then a partner id can collide with a real tenant, so list every tenant id. | host teams via Umesh | no |
| `VC_PARTNER_OWN_TENANTS` | for example `pathlynks:pathlynks` | Umesh | no |
| `VC_AUDIT_HMAC_KEY` | 32+ characters (erasure audit) | Umesh | yes |
| `VC_ERASURE_APPROVER_EMAIL` | email, needed while `VC_ERASURE_AUTO_DELETE` is false | Umesh | no |
| `PATHLYNKS_DB_PASSWORD`, `PATHLYNKS_DB_CA_FILE` | password; absolute path of the CA file | Pathlynks team | password: yes |
| `VIDYSEA_DB_PASSWORD`, `VIDYSEA_DB_CA_FILE` | read-only role password; CA file path | Vidysea team | password: yes |
| `VC_PARTNER_KEY_REQUIRED` | `true` only if Umesh wants the anonymous route to need a page key. Leave unset for M1. | Umesh | no |

The Postgres host, port, database and user are not env values: they are fixed in `config/sources.json` in the checkout (ids `pathlynks-db` and `vidysea-db`, `sslmode` `verify-full`). Only the password and the CA file path come from `vc.env`.
`VC_ERASURE_AUTO_DELETE` defaults to false (`packages/db/src/erasure.ts` lines 277 to 284): erasure then waits for the approver email above.

### 4e. Voice, admin console and optional names

Voice stays off until Umesh says go: `VC_VOICE_ENABLED=true`, `VC_VOICE_MODEL`, `GEMINI_API_KEY`, `VC_VOICE_WS_SECRET` (32+ bytes, secret),
`VC_VOICE_WS_BASE_URL` (a `wss://` URL with no credentials). Voice also needs the full `VC_STUDENT_JWT_*` set of 4d, including `VC_STUDENT_JWT_AUDIENCE` (`apps/api/src/index.ts` line 842, `apps/api/src/auth.ts` line 388), and, for personal answers, one admin-store variable. The voice gate and the paid allowance are Umesh's decision.

| Name | Note |
|---|---|
| `VC_ADMIN_JWT_SECRET` | 32+ characters. Either this or `VC_ADMIN_MASTER_KEY` creates the admin store that M2 needs (4d). This one also mounts the admin API (`index.ts` line 1095); the admin console itself is out of scope (section 9b). Secret. |
| `VC_ADMIN_MASTER_KEY` | base64 of exactly 32 random bytes. Any other length stops startup. Creates the admin store without mounting the admin API, and enables the usage log. Secret. |
| `VC_USD_INR_RATE` | number for the cost dashboard |
| `GITHUB_TOKEN` | optional; source navigation only. Secret. |
| `VC_GROUNDING` | Web grounding for a question the KB cannot source. Default off: unset, empty or `off` is off; exactly `gemini` turns it on and then needs `GEMINI_API_KEY` (any other value stops the start). Only then is the Gemini egress of section 3 needed. Optional: `VC_GROUNDING_MODEL`, `VC_GROUNDING_MAX_PER_SESSION` (default 5), `VC_GROUNDING_MAX_PER_DAY` (default 500). Leave off unless Umesh says (row 26). |
| `VC_API_PORT` | default 8080; nginx points at 8080, so leave it |
| `VC_SPEAKERS_FILE` | `/etc/vc/speakers.json`. If set and the file is missing or invalid the launcher refuses to start. With no file, delete the line. |
| `VC_KB_TIMEOUT_MS`, `VC_KB_BREAKER_FAILS`, `VC_KB_BREAKER_COOLDOWN_MS`, `VC_KB_ROUTE` | KB client tuning (`VC_KB_TIMEOUT_MS` is 1000 to 30000) |
| `VC_TEXT_CHAIN_HOP_TIMEOUT_MS`, `VC_TEXT_CHAIN_DEADLINE_MS`, `OLLAMA_BASE_URL` | chain tuning |
| `VC_CONCERN_MODEL`, `VC_MODEL_SUMMARY`, `VC_MODEL_ANSWER`, `VC_MODEL_ROUTER`, `VC_REPLY_LANGS`, `VC_ANONYMOUS_SAFETY_SCREEN` | model and language options |
| `MONGO_CLIENT_TIMEOUT_MS`, `VC_SKILLS_DIR`, `VC_PATHLYNKS_TIMEOUT_MS`, `PATHLYNKS_ALLOW_PRIVILEGED_ROLE` | advanced; leave unset unless Umesh says |
| `VC_WEBHOOK_SECRET`, `VC_WEBHOOK_DESTINATION_URL` | only if the webhook is turned on |

Do not set the `VC_EVIDENCE_*` names from `.env.example`; they are for local test runs only.

## 5. Host steps

Each step has its expected result. Use `sudo -H -u vc` for everything that runs as the service user (`-H` sets `HOME=/opt/vc`). Run every `sudo -u vc` command from `/` or `/opt/vc` (`cd /opt/vc` first), because sudo keeps your current directory and `vc` may not be allowed to enter it. Use bash (the Ubuntu login shell), not `sh`/dash: the `$'...'` syntax in step 9 needs bash. Replace each placeholder with the value from its source:

| Placeholder | Meaning | From |
|---|---|---|
| `<VC-HOST>` | the public DNS name of VC | Umesh / DevOps (section 11) |
| `<VC-REPO-URL>` | git clone URL; no token inside (HTTPS form: user name only, `https://<USER>@<git host>/<path>`) | Umesh |
| `<SHA>`, `<NEW-SHA>`, `<OLD-SHA>` | full 40-character git commits to deploy, to upgrade to, and currently running | Umesh; the running one from `git rev-parse HEAD` |
| `<GIT-HOST>` | host name of the git server in `<VC-REPO-URL>` | read from the URL |
| `<VC-MONGO-HOST>` | the Mongo host name (not secret) | Mongo owner |
| `<OPS-EMAIL>` | an ops mailbox the DevOps team reads (shared, not a person); Let's Encrypt sends expiry warnings to it | DevOps fills it in |

1. Ubuntu 22.04 LTS or 24.04 LTS only (`lsb_release -rs` prints `22.04` or `24.04`). Packages: `sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx git curl gnupg ca-certificates netcat-openbsd`.
   - 1b. `mongosh` (MongoDB's published apt repo, which has `jammy` and `noble`; if the repo line fails, install the `.deb` from the MongoDB download page):
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
   Expected: `id vc` prints the user; `ls -ld /opt/vc` shows `drwxr-xr-x vc vc`. Keep `/opt/vc` empty until step 5, or the clone fails. `/etc/vc` stays `root:root`, mode 755 (the `vc` user must be able to enter it).
3. Node. The repo allows `>=20.16`. Node 20 is past end of life, so this runbook decides Node 22 LTS (the repo's `@types/node` is 22), from NodeSource. If Ubuntu or an image already has Node 20 or any version below 22, replace it with this one:
   ```sh
   curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh   # read it, then:
   sudo bash /tmp/nodesource_setup.sh && sudo apt install -y nodejs
   ```
   Expected: `node -v` prints `v22.x`.
4. Clone access, kept outside `/opt/vc`. Umesh gives either a deploy key or an HTTPS token (section 11). **Decision: the secret file stays on the server, owned by `root:root`, mode 600, readable by root only, and every clone or fetch runs through `sudo` as root.** The `vc` user never reads it. Create files with `sudoedit` and delete editor leftovers (section 4a).
   - Git host key (both forms): `ssh-keyscan <GIT-HOST> | sudo tee /etc/vc/known_hosts >/dev/null`, then `ssh-keygen -lf /etc/vc/known_hosts`. Compare the fingerprint with the one **the owner of the git host publishes** (for a private git host, the person named in section 11). Do not go on until they match.
   - Deploy key (SSH): `sudo install -m 600 -o root -g root /dev/null /etc/vc/deploy_key`, then `sudoedit /etc/vc/deploy_key` and paste the private key.
   - HTTPS token: `sudo install -m 600 -o root -g root /dev/null /etc/vc/git_token`, then `sudoedit /etc/vc/git_token` (the token only, one line). The token never goes on a command line, where `ps` would show it. Git reads it through a small script (`GIT_ASKPASS`):
     ```sh
     printf '#!/bin/sh\nexec cat /etc/vc/git_token\n' | sudo tee /etc/vc/git_askpass.sh >/dev/null
     sudo chown root:root /etc/vc/git_askpass.sh && sudo chmod 700 /etc/vc/git_askpass.sh
     ```
5. Code. Use `git clone`; never copy folders by hand. The API reads `skills/`, `qa/gates/` and `config/` from the checkout at boot, and a copy usually misses one. `qa/evidence/p1-a10-diag/` is read only by the voice gate, and only when its record `a10-voice-gate.md` says `Result: PASS` (the record points at an evidence file there); it is part of the checkout too.
   ```sh
   # SSH deploy key:
   sudo env GIT_SSH_COMMAND='ssh -i /etc/vc/deploy_key -o IdentitiesOnly=yes -o UserKnownHostsFile=/etc/vc/known_hosts' git clone <VC-REPO-URL> /opt/vc
   # or HTTPS token (the script supplies the token; nothing secret is on the command line):
   sudo env GIT_ASKPASS=/etc/vc/git_askpass.sh GIT_TERMINAL_PROMPT=0 git clone <VC-REPO-URL> /opt/vc
   # both: hand the checkout to the service user, then pin the sha
   sudo chown -R vc:vc /opt/vc
   sudo -H -u vc git -C /opt/vc checkout <SHA>
   sudo -H -u vc git -C /opt/vc rev-parse HEAD
   ```
   Expected: the last command prints `<SHA>` in full. Later fetches use the same `sudo env ...` prefix, then `chown -R vc:vc /opt/vc` again (section 10).
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
   Duplicate names are forbidden (the systemd documentation I know does not say which line wins inside one file), so the second check lists them and you remove the extra line. Check without printing values (each prints names or line numbers only):
   ```sh
   sudo grep -vE '^[[:space:]]*([#;]|$)' /etc/vc/vc.env | cut -d= -f1 | sort            # names (comment lines skipped): compare with section 4c
   sudo grep -vE '^[[:space:]]*([#;]|$)' /etc/vc/vc.env | cut -d= -f1 | sort | uniq -d  # duplicate names: must print nothing
   sudo grep -c $'\r' /etc/vc/vc.env                  # must print 0 (no CRLF); needs bash
   sudo grep -nE '[[:space:]]+$' /etc/vc/vc.env | cut -d: -f1   # must print nothing (no trailing spaces)
   ```
   RDS CA files (M2 only, supplied by the Pathlynks and Vidysea teams). Path convention: the `/etc/vc/ca/` folder, owner `root:vc`, files mode 640:
   ```sh
   sudo install -d -m 750 -o root -g vc /etc/vc/ca
   sudo install -m 640 -o root -g vc ./<received-pathlynks-file> /etc/vc/ca/pathlynks-rds-ca.pem
   sudo install -m 640 -o root -g vc ./<received-vidysea-file>   /etc/vc/ca/vidysea-rds-ca.pem
   # vc.env: PATHLYNKS_DB_CA_FILE=/etc/vc/ca/pathlynks-rds-ca.pem   VIDYSEA_DB_CA_FILE=/etc/vc/ca/vidysea-rds-ca.pem
   sudo -H -u vc grep -c 'BEGIN CERTIFICATE' /etc/vc/ca/pathlynks-rds-ca.pem /etc/vc/ca/vidysea-rds-ca.pem
   ```
   Expected: the `grep` runs as `vc` and prints a count of 1 or more for each file (a bundle prints many). A "Permission denied" or a count of 0 means the file is not readable or not a certificate. A wrong CA path does **not** stop the start: `buildPgConfig` in `mcp/pathlynks/src/connect.ts` returns no connection when the path is unset, unreadable or holds no certificate, so that site's personal reads do not work. What a student sees then is Not confirmed (section 11); check this grep before M2 instead.
10. Reachability from the server (B6). These read the URLs from `vc.env` with the same parser as the service, so the URL is never typed or echoed. The status line is printed without `curl -w`, because `%` is a systemd specifier (section 4a):
    ```sh
    # Mongo ping: must print 1
    sudo systemd-run --pipe --wait --quiet -p User=vc -p EnvironmentFile=/etc/vc/vc.env -p PrivateTmp=yes -p Environment=HOME=/tmp \
      /bin/sh -c 'exec mongosh "$$MONGODB_URL" --quiet --eval "db.runCommand({ping:1}).ok"'
    # Mongo roles: must list readWrite on virtual_counsellor, read on pathlynks_journey, nothing else
    sudo systemd-run --pipe --wait --quiet -p User=vc -p EnvironmentFile=/etc/vc/vc.env -p PrivateTmp=yes -p Environment=HOME=/tmp \
      /bin/sh -c 'exec mongosh "$$MONGODB_URL" --quiet --eval "printjson(db.runCommand({connectionStatus:1}).authInfo.authenticatedUserRoles)"'
    # KB: must print an HTTP status line such as "HTTP/1.1 200 OK" (any code is fine); a timeout prints no status line and is a failure
    sudo systemd-run --pipe --wait --quiet -p User=vc -p EnvironmentFile=/etc/vc/vc.env \
      /bin/sh -c 'curl -sS -m 10 -o /dev/null -D - "$$VC_KB_BASE_URL" | head -1'
    ```
    Write `$$` exactly as shown: `systemd-run` expands `$NAME` itself and would put the value on the command line, while `$$` reaches `sh` as `$` so the shell reads the variable. The Mongo URL is briefly visible to local users in the process list while `mongosh` runs; that is acceptable on a host used only for VC. `/ready` (section 8) repeats the ping later.
    The roles command prints a list; expected shape `[ { role: 'readWrite', db: 'virtual_counsellor' }, { role: 'read', db: 'pathlynks_journey' } ]` (the exact spacing and quotes are Not confirmed: section 11 row 25). A role on any other database, or any other role name, counts as too wide. If a roles entry is missing or too wide, stop and tell Umesh. A KB timeout blocks M1 only if Umesh says so (section 11).
11. Service (after sections 6 and 7 pass; at M2 follow the M2 order in section 2, where this restart is step 4 and may run only after step 3, the `student-routes` gate, printed `ALLOWED`):
    ```sh
    sudo cp /opt/vc/infra/ubuntu/vc-api.service /etc/systemd/system/    # first install only; upgrades merge by hand (section 10)
    sudo systemctl daemon-reload && sudo systemctl enable --now vc-api
    sudo systemctl --no-pager status vc-api
    sudo journalctl --no-pager -u vc-api -n 50
    ```
    Expected: `active (running)` and a line with `"event":"vc_api_listening"`. If it exits, the last journal line is
    `vc-api failed to start: ...` and names the variable (section 4b). Fix `vc.env` and run `sudo systemctl restart vc-api`.

## 6. Pre-start gate check

The gate records are human-written files in `qa/gates` (a signature line, two answered decision files and a Nights-mode line; the header of `apps/api/src/go-live-gate.ts` lists them). They are part of the git checkout, so the sha you deploy carries them. The gate command only reads them. DevOps never edits `qa/gates`.

**Does the service start run the gate? Yes, per surface** (`apps/api/src/anonymous.ts`, `chat.ts`, `voice.ts` call `assertGoLive` when their flag is on):

| Flag in `vc.env` | Gate target the start runs |
|---|---|
| `VC_ANONYMOUS_ENABLED=true` | `anonymous` |
| `VC_CHAT_ENABLED=true` | `student-routes` |
| `VC_VOICE_ENABLED=true` | `voice` (also needs the A10 record or the D-111 owner-override line) |

**On refusal the whole process fails to start** (it is not "student routes off, rest running"). `apps/api/src/main.ts` prints `vc-api failed to start: GoLiveRefusedError: go-live refused for <target>: ...` and exits 1; `Restart=on-failure` then restarts it every 5 s (the crash loop in section 4b). So run the CLI check below first, and write `VC_CHAT_ENABLED=true` (or the voice flag) only after its target prints `ALLOWED`.

**What the result depends on.** Only (1) the files in `/opt/vc/qa/gates`, which come with the sha; (2) the variable `VC_GATE_APPROVER`, which must equal the signer name in the `B13-signed` line (the CLI reads it from its own environment, not from `vc.env`, so pass the same value as in `vc.env`); (3) the server clock: a gate record dated more than 5 minutes in the future is refused (`FUTURE_SKEW_MS` in `apps/api/src/go-live-gate.ts`). Check it with `timedatectl status`; it must show `System clock synchronized: yes` (keep NTP on). No other `vc.env` value matters.

**One rule.** M1 may start only when the `anonymous` check prints `ALLOWED`. The `student-routes` check must print `ALLOWED` before M2 only. At M1 it may print `REFUSED`; that is fine because `VC_CHAT_ENABLED` is unset. For M2 follow the M2 order in section 2 (this gate is step 3, the restart is step 4).

```sh
sudo -H -u vc env VC_GATE_APPROVER=Umesh pnpm -C /opt/vc/apps/api go-live-gate anonymous
sudo -H -u vc env VC_GATE_APPROVER=Umesh pnpm -C /opt/vc/apps/api go-live-gate student-routes
```

`pnpm` prints a short banner above the gate output (lines that start with `>`, with the package name, the script and the path). The banner is not exact and may differ by pnpm version; the gate lines below are exact. Expected output for `anonymous` (exit code 0). The four record names and their order come from `requirements()` in `apps/api/src/go-live-gate.ts`; `student-routes` prints the same four `ok` lines under `target=student-routes`:

```
go-live gate (A20) target=anonymous: ALLOWED
  ok       p1-u0-amendment-signatures.md
  ok       g-publish.md
  ok       g-prod.md
  ok       nights.md
```

(`voice` adds `a10-voice-gate.md`, and a `NOTE  a10-voice-gate.md: A10 OVERRIDDEN by owner (D-111)` line when the override is used.) A refused result prints `REFUSED` and one `MISSING <file>: <reason>` line per problem, exit code 1. Send the output to Umesh; only he records gate decisions, and a new sha carries them.

## 7. nginx and TLS

**Install once, then never overwrite.** Steps 1 to 3 create the live nginx file the first time only. After certbot has edited it (the 443 block, certificate paths, the redirect), that file is the live truth. Never `cp` the repo file over it. An upgrade that changes `infra/ubuntu/nginx-vc.conf` is merged by hand (section 10).
Fields DevOps edits in the first install: only `server_name` (replace `vc.example.org`; it also appears in comments, which is harmless). Do not add certificate paths (certbot writes them). There is no `upstream`: the API is `http://127.0.0.1:8080` in each `proxy_pass`; change nothing unless `VC_API_PORT` was changed. If the copy on the server lacks the `/health` and `/ready` locations, merge them from the deployed sha (section 10); do not retype them.
**Limit zone.** `nginx-vc.conf` defines no zone. It uses exactly one name, `vcchat`, declared once in step 1 at http level. Create no other `limit_req_zone`.

1. The request-limit zone goes at http level, once:
   `echo 'limit_req_zone $binary_remote_addr zone=vcchat:10m rate=20r/m;' | sudo tee /etc/nginx/conf.d/vc-limit.conf`
2. Install the site and remove the stock one (first install only):
   ```sh
   sudo cp /opt/vc/infra/ubuntu/nginx-vc.conf /etc/nginx/sites-available/vc
   sudo sed -i 's/vc\.example\.org/<VC-HOST>/' /etc/nginx/sites-available/vc
   sudo ln -s /etc/nginx/sites-available/vc /etc/nginx/sites-enabled/vc
   sudo rm -f /etc/nginx/sites-enabled/default
   ```
3. Test, reload, then certificate (the DNS name must already resolve to this server). `<OPS-EMAIL>` is the ops mailbox from section 5:
   ```sh
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d <VC-HOST> --non-interactive --agree-tos -m <OPS-EMAIL> --redirect
   sudo certbot renew --dry-run
   systemctl --no-pager list-timers | grep -i certbot
   ```
   Expected: `nginx -t` says "syntax is ok"; certbot adds the 443 block and the redirect; the dry run says "all simulated renewals succeeded"; a certbot timer is listed.
   **Port 80 must be reachable from the whole internet** for issue and every renewal (certbot's HTTP-01 check comes from Let's Encrypt, from changing addresses), even if 443 is restricted to named IPs. If port 80 cannot be open, use the DNS-01 challenge with your DNS provider's certbot plugin instead; the provider and plugin are Not confirmed (section 11).
4. Check for the KB redirect failure: `curl -sI http://<VC-HOST>/ | grep -i '^location'` must show `https://<VC-HOST>/`, never an IP address.
5. nginx runs as `www-data` and must read the static files: `/opt/vc/apps/student` and `/opt/vc/apps/widget/src` are in the checkout (world-readable by default).
   Only when the widget release directory exists (M2, section 9): `[ -d /opt/vc/releases ] && sudo chmod -R a+rX /opt/vc/releases || true`.
   Expected: `curl -s -o /dev/null -w '%{http_code}\n' https://<VC-HOST>/` prints `200`.
6. Logrotate for the voice log (checklist row B8b). Copied from `docs/go-live-checklist.md` section 4. The voice locations write `/var/log/nginx/vc-voice-stream.access.log`, a path the distro's nginx rotation does not cover. Create the file with `sudoedit /etc/logrotate.d/vc-voice-stream` (delete editor leftovers, section 4a):
   ```
   /var/log/nginx/vc-voice-stream.access.log {
       daily
       rotate 14
       missingok
       notifempty
       compress
       delaycompress
       create 0640 www-data adm
       sharedscripts
       postrotate
           [ ! -f /run/nginx.pid ] || kill -USR1 "$(cat /run/nginx.pid)"
       endscript
   }
   ```
   Done when `sudo logrotate -d /etc/logrotate.d/vc-voice-stream` (a dry run) prints no error. Required before voice is switched on; do it at M1 too (see B8b). `www-data adm` fits Ubuntu's nginx; change them only if nginx runs as another account.

What serves the widget (read from `infra/ubuntu/nginx-vc.conf`):
- Host frontends use only the release URL: `https://<VC-HOST>/widget/releases/<SHA>/<file>` is `/opt/vc/releases/<SHA>/widget/<file>`, for `<file>` = `vc-widget.v1.js`, `vc-widget.js` or `vc-widget-voice.v1.js`. `<SHA>` is 40 lowercase hex characters. These three files are the public, immutable widget.
- `apps/widget/src` is only the build source: section 9 copies it into the release directory. It is not a URL to hand out.
- The nginx file also still has three exact aliases, `/widget/vc-widget.v1.js`, `/widget/vc-widget.js` and `/widget/vc-widget-voice.v1.js`, that read `apps/widget/src` of the live checkout directly. They answer `200` from the first install, M1 included, and change with every checkout. Do not give them to host teams; keep or remove them is section 11 row 27. Any other name under `/widget/` answers 404.
- VC (M1) serves no widget page of its own.

Rules that must not be broken:
- **CORS is done by the API**, per partner key and its origin list. Never add `Access-Control-*` headers, method restrictions or `X-VC-Key` / `Authorization` rewrites at nginx, a CDN or any front proxy. Preflight (`OPTIONS`) requests must reach the API.
- Only the listed `/v1` locations are proxied. Every other `/v1/` path answers 404 at nginx. Do not widen it.
- The site sets `X-Real-IP` from the socket address. Do not pass a client-supplied `X-Real-IP` or rely on `X-Forwarded-For`. The API has no trust-proxy setting: it reads only `X-Real-IP`.
- If another proxy or CDN sits in front of this nginx, tell Umesh first. The per-client rate limit reads the address nginx sees.
- `/health` and `/ready` are exact locations with no rate limit. Check your copy: `grep -n 'health' /etc/nginx/sites-available/vc`.
- Voice logs. `/var/log/nginx/vc-voice-stream.access.log` uses the `vc_voice_stream` format of the nginx file: client address, time, method, path without query string (`$uri`), protocol, status and bytes. No token, key or query string. It is written only by the two voice stream locations, which set their own `access_log`, so the default `access.log` does not record those two. `POST /v1/public/voice/sessions` has no own `access_log`, so the default `access.log` records it, in nginx's default format (which has no token). Only the DevOps team may read both files: they are `0640 www-data adm` (the logrotate entry above), so keep the `adm` group to DevOps.
- Leave `error_log` at nginx's default level. `grep -n error_log /etc/nginx/nginx.conf` must show no level or `error` (or `crit`, `alert`, `emerg`). Never set `warn`, `notice`, `info` or `debug`: they would print request lines that hold voice tokens.

## 8. Smoke checks

Run on the server first, then from outside. `B=https://<VC-HOST>`. These run in your own shell, so `%` in `curl -w` is safe (it is only a problem inside `systemd-run` or a unit, section 4a).

| Check | Command | Expected |
|---|---|---|
| Health | `curl -sS -w '\n%{http_code}\n' $B/health` | `{"status":"ok"}` then `200` |
| Ready | `curl -sS -w '\n%{http_code}\n' $B/ready` | `{"status":"ready"}` then `200` (503 `{"status":"unavailable"}` means Mongo is not reachable) |
| Anonymous turn | `curl -sS -w '\n%{http_code}\n' -X POST $B/v1/public/chat/turns -H 'content-type: application/json' -d '{"text":"hello"}'` | HTTP `200` and a JSON body with `state`, and `message` when there is one (`apps/api/src/anonymous.ts` line 533) |
| Partner OpenAPI | `curl -sS -o /dev/null -w '%{http_code}\n' $B/v1/partner/openapi.json` | `200` at M1 too (see note) |
| Unlisted path | `curl -sS -o /dev/null -w '%{http_code}\n' $B/v1/admin/x` | `404` |
| Student UI | `curl -sS -o /dev/null -w '%{http_code}\n' $B/` | `200` |

Rate limit: the `vcchat` zone allows 20 requests a minute per client address with a burst of 10 (`rate=20r/m`, `burst=10 nodelay` in the nginx file). Over the limit nginx answers `429` (`limit_req_status 429` in the file, not nginx's default 503). The anonymous turn and the OpenAPI checks share that zone, so wait a minute between repeated runs of them. `/health`, `/ready` and the static pages are not limited.

Notes: the partner OpenAPI is a static, public document. `withPartnerRoutes` in `apps/api/src/partners.ts` always serves it, with or without any M2 variable or partner record, and `apps/api/tests/partners.test.ts` (K5) checks that a GET returns the document. Call it from any network that can reach `https://<VC-HOST>` (the server itself, then a machine outside); nginx rate-limits it with the `vcchat` zone. If the anonymous turn answers `404`, the route is off (`VC_ANONYMOUS_ENABLED` not `true`) or the service did not start. If it answers a degraded "try again" reply, check the KB (`VC_KB_BASE_URL`, redeploy pending) and the LLM key; do not retry in a loop. Whether a degraded reply counts as M1 passed is Umesh's call (section 11). Alerts are one JSON line on stderr: watch `sudo journalctl -u vc-api -f` for `"event":"alert_` (see `docs/runbook-golive.md`).

## 9. Widget release directory (M2)

Applies at M2 (checklist row C0): **DevOps builds it; Umesh gives the sha.** Build it before the host builds in C5 and C6, which need its URL. At M1 skip it (nginx simply has no such directory). Host frontends load the widget from an immutable directory built from ONE reviewed commit. Never overwrite a released directory. Done when the three `SHA256SUMS` lines are with Umesh and the `curl -sI` check below returns `200`.

```sh
SHA=<the 40-character sha Umesh approved>   # typed here, never read from the checkout
( set -eu
  echo "$SHA" | grep -Eq '^[0-9a-f]{40}$' || { echo "SHA is not 40 lowercase hex"; exit 1; }
  [ "$(sudo -H -u vc git -C /opt/vc rev-parse HEAD)" = "$SHA" ] || { echo "checkout is not the approved sha: stop"; exit 1; }
  R=/opt/vc/releases/$SHA/widget
  sudo -H -u vc mkdir -p "$R"
  sudo -H -u vc cp /opt/vc/apps/widget/src/vc-widget.js "$R/vc-widget.js"
  sudo -H -u vc cp /opt/vc/apps/widget/src/vc-widget.js "$R/vc-widget.v1.js"
  sudo -H -u vc cp /opt/vc/apps/widget/src/voice.js    "$R/vc-widget-voice.v1.js"
  sudo sh -c "cd $R && sha256sum vc-widget.js vc-widget.v1.js vc-widget-voice.v1.js > SHA256SUMS"
  cat "$R/SHA256SUMS"
  sudo chmod -R a-w,a+rX "/opt/vc/releases/$SHA"
)
```

The block stops with a message, and builds nothing, unless `git rev-parse HEAD` equals `SHA`.

Expected: three lines of `<64 hex>  <file>`; the first two hashes are identical. Send those lines to Umesh. The URL to disk mapping is in section 7. Each release directory is named by the sha of the checkout it was built from, and is built per approved sha, independent of the sha the API runs. Check: `curl -sI $B/widget/releases/$SHA/vc-widget.v1.js` returns `200`, `Cache-Control: public, max-age=31536000, immutable`.

Host build settings (set in the host repos by the host teams, not by DevOps):
- Pathlynks: `NEXT_PUBLIC_VC_WIDGET_BASE_URL=https://<VC-HOST>/widget/releases/<SHA>`
- Vidysea: `NEXT_PUBLIC_VC_WIDGET_SCRIPT_URL=https://<VC-HOST>/widget/releases/<SHA>/vc-widget.v1.js`

### 9a. Partner records (M2, on the VC server)

The partner command reads `MONGODB_URL`, `VC_PARTNER_KEY_PEPPER`, `VC_RESERVED_TENANT_IDS` and `VC_PARTNER_OWN_TENANTS` from its environment (`apps/api/scripts/partner.ts`). The M2 variables are already in `vc.env` and the API was restarted (M2 order step 4: it reads the pepper and tenant list at start).
**Who runs it.** The person needs a shell and `sudo` on the VC server for `systemd-run`. DevOps has that. Whether Umesh gets his own account, or DevOps runs the commands while Umesh watches and receives the keys, is Not confirmed (section 11).
Run the command as the service user with the same env file. Keep `--pipe`: it sends the output to your terminal. Without it the output goes to the journal.

```sh
sudo systemd-run --pipe --wait --quiet -p User=vc -p WorkingDirectory=/opt/vc -p EnvironmentFile=/etc/vc/vc.env \
  /usr/bin/env pnpm -C apps/api partner list --check
sudo systemd-run --pipe --wait --quiet -p User=vc -p WorkingDirectory=/opt/vc -p EnvironmentFile=/etc/vc/vc.env \
  /usr/bin/env pnpm -C apps/api partner add "<NAME>" --id <ID> --origin <ORIGIN>
```

What `list --check` prints (`runPartnerCli` in `apps/api/src/partners.ts`, `apps/api/scripts/partner.ts`): on pass, exit 0 and one line per partner (id, status, key prefixes, origins, name; never a key), or `(no partners)` before the first `add`. On fail, exit 1 and one message on standard error: `N active partner(s) have an id that is currently reserved ...`, naming each id and why. With `VC_RESERVED_TENANT_IDS` empty it also prints a `warning:` line on standard error (and for `add`); that warning is not a failure, but fix it (section 4d). Later: `partner rotate <ID> --scope pub` (or `srv`) prints one new key, once; the old one stops within 60 s. `partner revoke <ID>` stops both keys within 60 s. Both run with the same `systemd-run` prefix.

Values (see `docs/partner-integration.md` section 4; an id is lower-case letters, digits and hyphens, 2 to 32):

| Partner | `<NAME>` | `<ID>` | `<ORIGIN>` |
|---|---|---|---|
| Pathlynks | Not confirmed (`Pathlynks` is the obvious name) | Not confirmed (`pathlynks` is the id the docs use as their example; if it is also a JWT tenant, `VC_PARTNER_OWN_TENANTS=pathlynks:pathlynks`) | `https://pathlynks.vidysea.com` |
| Vidysea | Not confirmed | Not confirmed | Not confirmed (section 11) |

**Capturing the keys.** `partner add` prints a page key and a server key once, to standard output only (`console.log` in `partner.ts`; warnings and errors go to standard error and hold no key). The database keeps a hash only. So: run it in a plain terminal with session logging off (no `script`, no `tee`, no `> file`, no terminal recorder), copy each key straight into the private channel or a password manager, then clear the screen. The keys must never reach the journal, a ticket or chat; a lost key is rotated, not recovered. Where each key goes (`partner.ts` output and `docs/partner-integration.md`): the **page key** is public; it goes into the host's web page markup for the widget and works only on the public chat route from the registered origins, so it is not a secret. The **server key** is secret; it goes only into the host backend's `VC_PARTNER_SERVER_KEY` and never into a browser, repo or log.

### 9b. Admin console (`apps/web`)

For this go-live, do nothing for the admin console. It is out of scope for M1 and M2, has no unit, nginx server or host name, and is not published. Do not build, start or expose it, and do not set `VC_WEB_MODE` or `VC_ADMIN_API_URL`. The only admin-related value the API needs is the admin-store variable of 4d.

## 10. Rollback and upgrade

Always note the running sha first: `sudo -H -u vc git -C /opt/vc rev-parse HEAD` (that is `<OLD-SHA>`).

**Upgrade to a new sha** (Umesh gives `<NEW-SHA>`). Stop-first form: the service is stopped before the checkout, because a checkout and install under a running process is unsafe (files change under it). **The outage is from step 2 to step 8: about the install time** (a minute or more; nginx answers 502 meanwhile). There is one copy only.

| Step | Command |
|---|---|
| 1. Fetch as root (safe while the service runs), with the clone access of section 5 step 5 | `sudo env <the same GIT_SSH_COMMAND= or GIT_ASKPASS= prefix> git -c safe.directory=/opt/vc -C /opt/vc fetch origin`, then `sudo chown -R vc:vc /opt/vc` |
| 2. Stop the service (the outage starts) | `sudo systemctl stop vc-api` |
| 3. Check out | `sudo -H -u vc git -C /opt/vc checkout <NEW-SHA>` |
| 4. Install | `sudo -H -u vc pnpm -C /opt/vc install --frozen-lockfile` |
| 5. Which live files changed? | `sudo -H -u vc git -C /opt/vc diff --stat <OLD-SHA> <NEW-SHA> -- infra/ubuntu/nginx-vc.conf infra/ubuntu/vc-api.service .env.example package.json` (table below) |
| 6. Merge changed blocks by hand | per the table below; never `cp` a repo file over a live one |
| 7. Gate re-check | section 6, `anonymous` must print `ALLOWED` |
| 8. Start (the outage ends) | `sudo systemctl start vc-api`, then check `vc_api_listening` in the journal |
| 9. Smoke | section 8 |

If step 3 or 4 fails, do the code rollback below. The widget release directory is built per approved sha, independent of the API sha: build a new one (section 9) only when Umesh says the widget changed in `<NEW-SHA>`, right after step 4 with `SHA=<NEW-SHA>`, and leave the old one in place. Umesh tells the host teams the new release URL; DevOps does not.

**Files to diff on every upgrade.** Show the change with `git diff <OLD-SHA> <NEW-SHA> -- <repo file>`, then apply only those hunks to the live file with `sudoedit`. For a sanity look, `diff -u <repo file> <live file>` also shows what certbot and `server_name` changed; those differences are expected and stay.

| Repo file | Live file | After merging |
|---|---|---|
| `infra/ubuntu/nginx-vc.conf` | `/etc/nginx/sites-available/vc` (keep a copy first: `sudo cp -a /etc/nginx/sites-available/vc /root/vc-nginx.bak`) | `sudo nginx -t && sudo systemctl reload nginx`. If `nginx -t` fails, put the copy back. |
| `infra/ubuntu/vc-api.service` | `/etc/systemd/system/vc-api.service` | `sudo systemctl daemon-reload`, then step 8 (start) |
| `.env.example` (new names only) | `/etc/vc/vc.env` | copy to `vc.env.prev` first (section 4a); ask Umesh for new values; then step 8 |
| the `limit_req_zone` line (section 7 step 1) | `/etc/nginx/conf.d/vc-limit.conf` | only if this runbook or `infra/ubuntu/README.md` changed it |
| `package.json` (`engines`, `packageManager`) | none | if Node or pnpm moved, section 5 steps 3 and 6 |

After a good smoke check delete `/root/vc-nginx.bak` and `vc.env.prev` (`sudo shred -u`). Also delete editor leftovers (section 4a).

**Rollback:**
- Code: `sudo systemctl stop vc-api`, `sudo -H -u vc git -C /opt/vc checkout <OLD-SHA>`, `sudo -H -u vc pnpm -C /opt/vc install --frozen-lockfile`, `sudo systemctl start vc-api`, then section 8. If the upgrade merged nginx or unit changes, undo those hunks from the copy you kept, then reload or `daemon-reload`.
- Env change that broke start: restore the previous file (`sudo install -m 640 -o root -g vc /etc/vc/vc.env.prev /etc/vc/vc.env`; section 4a says when it is created), then restart.
- Widget: the old `/opt/vc/releases/<old-sha>/widget/` directory is still there. Host teams point their build setting back to it. Never delete or edit a released directory.
- Switch a surface off without a deploy: set `VC_CHAT_ENABLED=false` and/or `VC_VOICE_ENABLED=false` in `vc.env` and restart.
- **M1 kill switch.** Set `VC_ANONYMOUS_ENABLED=false` (or remove the line) in `vc.env`, copy to `vc.env.prev` first, and `sudo systemctl restart vc-api`. With every surface flag off, `buildLauncherConfig` in `apps/api/src/main.ts` (line 143) returns the bare config and the service still starts: it answers `/health` and `/ready`, the anonymous route is not served (`POST /v1/public/chat/turns` answers 404 from the API), and the other `vc.env` names are still checked at start. Undo by setting the flag back to `true` (the gate must still print `ALLOWED`).
- Data: VC deploys run no migrations. Student databases are not rolled back by a code rollback. Restore Mongo from backup only with Umesh's yes.
- Never run `git clean` or delete `qa/gates` to "reset".

## 11. Not confirmed

Nothing here is guessed. Each row needs an answer from the owner shown. "Blocks M1" means DevOps cannot finish M1 without it.

| # | Question | Who answers | Blocks M1 |
|---|---|---|---|
| 1 | Host name for VC and who owns its DNS | Umesh / DevOps | yes |
| 2 | Cloud or on-prem; sizing; admin IPs for SSH; which firewall tool | DevOps | yes |
| 3 | Mongo: self-hosted or Atlas; `mongodb://` or `mongodb+srv://`; TLS CA file if private; who owns the Mongo host | Umesh / Mongo owner | yes |
| 4 | Who creates the Mongo users (`virtual_counsellor` readWrite, `pathlynks_journey` read). DevOps runs the role check (B6) | Mongo owner | yes |
| 5 | KB scheme, base URL and port; is plain `http` acceptable on that link; does A7 (KB redeploy pending) block M1. `vidysea.com/knowledgebase` redirected to a raw IP on 2026-11-01: do not use it | Umesh / KB team | yes |
| 6 | Repo URL, the sha to deploy, and the clone method (deploy key or HTTPS token) | Umesh | yes |
| 7 | The private channel for secrets and who sends the `vc.env` values | Umesh | yes |
| 8 | `VC_LLM_PROVIDER` (gemini or litellm), model ids, whether a `VC_TEXT_CHAIN` is used, and the `VC_CHAIN_MONTHLY_CAP_USD` value; for a chain model other than `glm-5.3-flash` or `deepseek-v4.1-flash`, its `OLLAMA_PRICE_USD_PER_MTOK` | Umesh | yes |
| 9 | Real counsellor-JWT keys for `VC_JWT_ISSUER` and `VC_JWT_*`, and whether `VC_JWT_AUDIENCE` is set. Never invent a placeholder HS256 secret; ask Umesh | Umesh | yes |
| 10 | Whether 443 may be public at M1 before sign-off, or should be restricted to named IPs (port 80 stays open for certbot, section 7) | Umesh | yes |
| 11 | Who declares M1 passed, and whether a degraded anonymous reply counts as a pass | Umesh | yes |
| 12 | Backup and restore of `virtual_counsellor`; on-call contact; journald retention; whether logs may hold personal data | Umesh / DevOps | no |
| 13 | `VC_ERASURE_AUTO_DELETE` intended value (the code default is false; section 4d) and the `VC_ERASURE_APPROVER_EMAIL` address | Umesh | no (M2) |
| 14 | Student JWT issuer, key source (public key or JWKS), audience, and tenant ids for `VC_RESERVED_TENANT_IDS` | Pathlynks / Vidysea teams via Umesh | no (M2) |
| 15 | The Vidysea production frontend origin (only a UAT ECR repository is known) | Vidysea team | no (M2) |
| 16 | RDS CA files for Pathlynks and Vidysea; the Vidysea read-only role; what a student sees when a CA path is wrong (the code only returns no connection, section 5 step 9) | Pathlynks / Vidysea teams | no (M2) |
| 17 | Whether voice is cleared to go live (paid allowance and the gate) | Umesh | no |
| 18 | Contacts: KB team, Mongo owner, Pathlynks team, Vidysea team | Umesh | yes |
| 19 | For a private git host: who publishes its SSH host-key fingerprint, to compare in section 5 step 4 | Git host owner (via Umesh) | yes |
| 20 | If port 80 cannot be open to the internet: the DNS provider and its certbot DNS-01 plugin | DevOps | only then |
| 21 | Who runs `partner add` (shell + sudo), and the names and ids of the Pathlynks and Vidysea partners (section 9a) | Umesh / DevOps | no (M2) |
| 22 | How the Ubuntu systemd version treats a backslash, backtick, `~` or `%` in `vc.env` values (section 4a), and which line wins for a duplicate name in one file. DevOps proves it with the B6 ping and the start itself; run `systemctl --version` and send it | DevOps | no |
| 23 | The KB chat key `VC_KB_API_KEY` (4d) and the student-JWT values (row 14) must be in hand before C2 starts | Umesh / KB team | no (M2) |
| 24 | Which admin-store variable Umesh sets for M2: `VC_ADMIN_MASTER_KEY` (store and usage log, no admin API) or `VC_ADMIN_JWT_SECRET` (also mounts the admin API), or both (4d) | Umesh | no (M2) |
| 25 | The exact printed shape of the Mongo roles probe (section 5 step 10). The shape given is derived from the command, not from a run | DevOps (send the real output once) | no |
| 26 | Whether `VC_GROUNDING=gemini` (web grounding) is on at go-live; default is off | Umesh | no |
| 27 | Keep or remove the three unversioned `/widget/*.js` aliases in `infra/ubuntu/nginx-vc.conf` that serve `apps/widget/src` directly (section 7). Removing them is a change to that file, which this runbook does not make | Umesh | no |

Answered from code, so not open: Ubuntu 22.04 or 24.04 and Node 22 are decided (section 5); no trust-proxy setting exists (the API reads `X-Real-IP` only); `VC_ERASURE_AUTO_DELETE` defaults to false; the Postgres host, database and user are fixed in `config/sources.json` (section 4d); an empty `VC_RESERVED_TENANT_IDS` only warns (4d); `VC_GROUNDING` is off by default (4e); the gate clock limit is 5 minutes (section 6).

## 12. Known gaps (later, not blocking M1)

- No Dockerfile, no CI, no widget release script (section 9 is manual): the install is manual on Ubuntu with systemd. The widget pop-out path `/vc-popout` is not routed; it falls through to the student page.
- No production Langfuse stack (`infra/langfuse/` is development only). Alerts are JSON lines on stderr, with no email, Slack or webhook transport: tail journald.
- Single replica only. Rate limits and the monthly chain cap live in process memory and reset on restart. Do not run two copies. The API binds `127.0.0.1` only and has no setting to change it.
- The admin console is out of scope for this go-live (section 9b).

## 13. What DevOps sends back

1. The public URL.
2. The server egress IP.
3. `node -v` and `pnpm -v`.
4. The git sha deployed (`sudo -H -u vc git -C /opt/vc rev-parse HEAD`).
5. The output of the gate checks (section 6).
6. The smoke-check output (section 8), and the `SHA256SUMS` lines (section 9) once the widget directory exists.
7. The result of the Mongo checks A4 and B6 (ping, roles, KB code), without any connection string.

## 14. Ready-to-send request

> Subject: VC (Virtual Counsellor) go-live on Ubuntu
>
> Please deploy VC by following `docs/DEVOPS-HANDOVER.md` in the VC repository, in the order given (section 2), starting with the network and Mongo checks (block A).
> Do not start the service until the gate check (section 6) prints ALLOWED. Umesh will send the commit sha and the `/etc/vc/vc.env` values by a private channel; do not ask for them in chat or tickets.
> Do not guess any value. If a step does not match what you see, stop and ask. When done, send back the items in section 13.
