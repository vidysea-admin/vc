# Go-live checklist (P1 student surface)

Short list for whoever flips the switches. Gate G-PROD is answered option (c), all three including voice (D-101,
2026-10-19; restated in parser format 2026-10-21, `qa/gates/g-prod.md`). The four G-PROD records in section 2 are now on disk
(B13 signed, g-publish answered, Nights recorded, A10 voice by owner override); the production-deploy items in sections 3 to 5
are still open, each with an owner. Nothing here is done by the build; each item is a human record.
Check the current state at any time with `pnpm -C apps/api exec tsx scripts/go-live-gate.ts <student-routes|anonymous|voice|publish>`
(read-only; exit 0 = allowed, 1 = refused with the missing records named).

## 1. Environment variables (deploy config)

| Variable | Rule |
|---|---|
| `VC_CHAT_ENABLED` | Exactly the word `true` to serve the authenticated student chat routes. Unset, empty or `false` = off. |
| `VC_VOICE_ENABLED` | Exactly the word `true` to serve the voice WebSocket. Unset, empty or `false` = off. |
| `VC_VOICE_WS_SECRET`, `VC_VOICE_WS_BASE_URL` | Required when voice is on (WebSocket token secret and the public `wss://` base URL). |
| `VC_ANONYMOUS_ENABLED` | `true` to serve the public anonymous route. Unlike the two above it is trimmed, but write it exactly anyway. |
| `VC_RESERVED_TENANT_IDS` | Partner keys only (needs `VC_PARTNER_KEY_PEPPER`). Comma- or space-separated: list **every `tenant` value your student JWTs carry** (each Vidysea and Pathlynks tenant id) and the sandbox tenant. A partner id equal to a listed id is refused at `partner add` and on every request. **Empty or unset = only the built-in names (`sandbox`, `admin`, ...) and this repo's own demo and evaluation tenants are protected**; the real JWT tenants are then unprotected, and the server and `partner add`/`partner list` print a warning saying so. A malformed list stops startup when partners are on. Run `pnpm -C apps/api partner list --check` before deploy (it marks and fails on a flagged partner): any existing partner whose id is, or looks like, a listed tenant will start getting `401`. |
| `VC_PARTNER_OWN_TENANTS` | Optional, with the list above. `<partner>:<tenant>` pairs (both halves the same id, e.g. `pathlynks:pathlynks`) for a partner whose own id is also a real JWT tenant: that exact partner is not blocked by the list, because a partner key reaches only the tenant named by its own id. Any other partner on that tenant stays refused. It can never free `sandbox`, `admin`, ... or the repo's tenants, nor the sandbox tenant. |
| `VC_GATE_APPROVER` | The repo Approver's name (the go-live gate and the CLI read it). **Required for every go-live target (B13):** with it unset, empty or blank (spaces or tabs only) every target (student routes, anonymous, voice, publish) is refused with `B13-signed needs VC_GATE_APPROVER`, even when `B13-signed` is signed. It is matched **exactly**: no surrounding whitespace, and the same case as the signer in `B13-signed` (`umesh` or `UMESH` does not match `Umesh`, and `" Umesh "` or a trailing newline does not match either); the refusal never echoes the value, so check the deploy config for stray spaces. It also applies to the D-111 voice override: with it unset, empty or blank an `Owner-override:` line in `a10-voice-gate.md` is refused (`Owner-override needs VC_GATE_APPROVER`) and voice stays closed; set, the override signer must equal it exactly. |

Padding fails startup, on purpose (ISS-263): `"true "`, `" true"`, `"TRUE"` and `"1"` are not `true`, and the server
refuses to start with a `ChatConfigError` / `VoiceConfigError` rather than silently turning a flag on or off
(`apps/api/src/chat.ts` `CHAT_FLAG_ENV`, `apps/api/src/voice.ts` `voiceEnabledFromEnv`). Check the deploy config for stray
spaces or quotes. A flag set to `true` also needs its ports (knowledge base, speakers file, Live provider, crisis message)
or startup fails, and each flag additionally passes the A20 go-live gate below.

## 2. G-PROD (c) prerequisites (`qa/gates/g-prod.md`)

All of these must be on disk in `qa/gates/` before the go-live script enables anything:

- [x] B13 signed: a `B13-signed: SIGNED <ISO instant> by <Approver name>` line in `p1-u0-amendment-signatures.md`
      (minors' text and voice to Gemini and the KB's LLM provider, processor register filled in). Today: SIGNED
      2026-10-21T18:10:00+05:30 by Umesh (D-109, `qa/gates/p1-u0-amendment-signatures.md` line 13).
- [x] A10 voice: the report itself still reads `Result: FAIL` (10/20 crisis phrases reached the fixed message within 2 s).
      Voice is allowed by an owner override instead: `Owner-override: 2026-10-22T09:42:10+05:30 - Umesh - D-111` in
      `qa/gates/a10-voice-gate.md`, risk accepted. A10 stays NOT PROVEN; the override needs `VC_GATE_APPROVER` (section 1).
- [x] `g-publish.md` answered: `Answered: 2026-10-21T15:42:38+05:30 - b` (publish text only, voice and WebSocket schema left
      out of the partner copy), Umesh chat (`qa/gates/g-publish.md`; also `qa/gates/golive-launch.md` Q6).
- [x] Nights mode recorded in `nights.md`: `Nights-mode: tele-manas-disclosed`, `Mode-status: FINAL` (Umesh 2026-10-19, D-102,
      `qa/gates/nights.md`). Human-alert route NOT ENABLED.

## 3. Open owner decisions recorded with the go (not asserted by the contract)

- [x] Whether minors are served before counsel clears DPDP: anyone can use; verifiable parental consent (DPDP s.9) is owned by
      the consent team (`qa/gates/g-prod.md`, Answered 2026-10-19, D-102).
- [ ] Whether the Q3 DPDP legal review must finish before a Pathlynks-supplied profile reaches VC. Not recorded: OPEN, owner Umesh.
- [x] Who owns the clinical-safety policy: Umesh, interim owner; signs off the LK10 Hindi/Hinglish/English crisis wording (D-108 item 1).
- [ ] Tele-MANAS 14416 test call for adolescents, and Hindi/Hinglish coverage. D-108 item 6 says the team did the call, but no
      record or evidence is on disk. OPEN, owner: Umesh (the team's test-call record is the missing artifact).
- [ ] Whether authenticated-student exposure, the anonymous route and voice go live together or one at a time. OPEN, owner: Umesh
      (voice is allowed by override D-111, but its own flag and the order of switching are not recorded).

## 4. nginx deploy steps (voice, `infra/ubuntu/nginx-vc.conf`)

Done on the server by a person; the tests only read the conf file, they never run nginx.

- [ ] `sudo nginx -t` after copying the conf (before `systemctl reload nginx`). It must print `syntax is ok` and `test is successful`; reload only then.
- [ ] Logrotate entry for the voice access log. The two voice stream locations write `/var/log/nginx/vc-voice-stream.access.log` (a path, not the stock `access.log`, so the distro's nginx rotation does not cover it). Create `/etc/logrotate.d/vc-voice-stream` with:

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

  Check it with `sudo logrotate -d /etc/logrotate.d/vc-voice-stream` (dry run). Adjust the owner and group to the account your nginx runs as.
- [ ] Keep nginx's `error_log` at its default level (`error`) or higher (`crit`, `alert`, `emerg`). On a `limit_req` rejection nginx's error log prints the request line (the URL with its query string). The two voice stream locations set `limit_req_log_level warn;`, so a rejection is logged below `error` and is NOT written to the error log while `error_log` is at `error` or higher. If an operator sets `error_log ... warn;` (or `notice`, `info`, `debug`) the request line comes back; do not. The 429 is still recorded in the voice access log, which logs the path (`$uri`) and never the query string. Other locations are unchanged and still log rejections at `error`.

## 5. Still OPEN before production (owner named; none is done by the build)

Per D-109 (domain, TLS, server env and deploy stay with the devops team) and D-111 (production deploy is a separate Umesh gate).
Today's answers (D-112, 2026-10-25) closed code and policy questions only; they did not close any item below.

| Item | Owner | Source |
|---|---|---|
| KB keys: `VC_KB_BASE_URL`, `VC_KB_API_KEY`, `VC_KB_ANON_API_KEY` (anonymous key search-only) in the server `.env`. Without them every answer is `no_sourced_answer`. | Umesh provides the keys | `qa/gates/golive-launch.md` Q4, `qa/gates/g-kb.md` Q2 |
| Mongo allowlist: the production Mongo host is IP-protected; the deploy server's address must be on it. Writes only inside `virtual_counsellor`. | Umesh / server owner | `qa/gates/mongo-host.md` (answered 2026-09-25) |
| Domain and TLS for the Ubuntu server behind nginx. | devops team | D-109, `qa/gates/golive-launch.md` Q7 |
| Pathlynks JWT format: the `tenant` claim values the student JWTs carry (feeds `VC_RESERVED_TENANT_IDS`, section 1) and the claim shape the verifier expects. | Pathlynks team with Umesh | `qa/gates/counsellor-jwt-partner-tenant.md` (D-112 answer a covers the counsellor/admin verifier only) |
| Environment variables on the server (section 1), including `VC_GATE_APPROVER=Umesh` exactly, the text chain `VC_TEXT_CHAIN` and `VC_CHAIN_MONTHLY_CAP_USD=50` (D-108 items 2 and 3). | devops team | D-108, D-109 |
| `nginx -t` and `logrotate -d` output (section 4) pasted as evidence. | devops team | section 4 |
| Tele-MANAS 14416 test call record (section 3). | Umesh | D-108 item 6 |
| Hindi text sign-off: Umesh signed off the LK10 crisis wording (D-108 item 1); any other Hindi or Hinglish student-facing text still needs a named sign-off. | Umesh | D-108 item 1 |
| OPEN (B15 erasure, ISS-t-029-rev-2): legacy erasure request rows with status `failed` that pre-date T-029 lack `approvedBy`, so `executeErasure` refuses them (fail-safe, `packages/db/src/erasure.ts:1711`). Before live cutover each such row in the live `virtual_counsellor` DB needs a re-approval or a gated migration. A migration is a production write and so a human gate; nothing runs now and no DB query was made for this note. Related: `failed` webhook_outbox rows hold an erasure until drained (`qa/gates/erasure-failed-hold.md`). | Umesh | `qa/issues.jsonl` ISS-t-029-rev-2, `qa/manifests/w1-erasure-outbox.md`, `qa/gates/erasure-failed-hold.md` |
