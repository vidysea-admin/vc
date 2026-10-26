# HUMAN_GATE: vc-admin-control (batched, asked once)
Opened: 2026-10-26 · Feature: docs/features/vc-admin-control/ · Owner: Umesh

Building does not wait on these. Every unit is built and checked against fakes (fake Postgres, fake GitHub, fixture
repos). Only the **live** connection to the Pathlynks DB and a live GitHub sync are HELD until G1/G2 are answered.

## G0 — plan approval
Contract approval: Answered: 2026-10-26T21:53:50+05:30 — qa/contracts/vc-admin-control.md @1283b23 approved as is — Umesh in chat
Plan "VC Admin Control + Pathlynks sources" (A0..A11).
Answered: 2026-10-26 Umesh — "hnn tho ye plan frinal hai"; then "use the max possible subagents and build it in the best way possible".

## G1 — DB credentials hygiene (security, before any live connection)
The handover doc holds the live production DB password in plain text and is link-shared. The user it names is an
admin role.
Recommended default: Umesh (1) rotates the `pathlynksadm` password, (2) restricts the doc's sharing, (3) creates a
role `vc_readonly` with SELECT on only the tables named in `config/sources.json` `tables`, and puts its password in
`D:\vc\.env` as `PATHLYNKS_DB_PASSWORD` himself. VC refuses to start a live sync with a role that can write
(it checks `has_table_privilege(..., 'INSERT')` on connect and fails closed).
Answered: 2026-10-26T21:53:50+05:30 — use pathlynksadm FOR NOW (verbatim: "use it for now rest it all is ip protected and it will not be shared with many more others and if needed we willl later rotate it after building the product from the config file"). No rotation/readonly role now; VC still sends SELECT only + default_transaction_read_only=on; the privileged-role refusal becomes an explicit logged override PATHLYNKS_ALLOW_PRIVILEGED_ROLE=1 set by Umesh — Umesh in chat (AskUserQuestion)

## G2 — DB access method
Options: (a) RDS security-group allowlist of the VC server IP (recommended: simplest, SSL already on);
(b) SSH tunnel / bastion; (c) a read replica.
Answered: 2026-10-26T21:53:50+05:30 — (a) RDS security-group allowlist of the VC server IP — Umesh in chat (AskUserQuestion)

## G3 — Videshi
The meeting named two DBs. Only Pathlynks details were shared. Default: build for Pathlynks now; Videshi is added later
from the console as one more source, with no code change.
Answered: 2026-10-26T22:03:24+05:30 — Pathlynks now; Videshi added later from the console as one more source — Umesh in chat (AskUserQuestion)

## G4 — Pathlynks embed (A11)
Default: the Pathlynks team adds the script tag in `src/app/layout.jsx` and a `/api/vc` proxy that forwards the
Pathlynks JWT. VC ships the snippet and the proxy example in `apps/widget/README.md`. VC verifies the Pathlynks JWT
with a per-site verifier config (HS256 shared secret by env name, or JWKS URL).
Answered: 2026-10-26T22:03:24+05:30 — LATER: build VC's side now, decide the embed method when the Pathlynks team is ready — Umesh in chat (AskUserQuestion)

## G5 — Admin login method
Default: email + password (scrypt/argon2id), JWT 8 h, first super-admin created by CLI
`pnpm -C apps/api admin create <email> --role super-admin` (password typed at the prompt, never an argument).
Google SSO later.
Answered: 2026-10-26T21:53:50+05:30 — email + password now (scrypt, JWT 8 h, CLI-created super-admin), Google SSO later — Umesh in chat (AskUserQuestion)

## G6 — student data to the external LLM provider
Answered: 2026-10-26T22:03:24+05:30 — ALLOW, minimal fields only: only the fields needed to answer (career names, compare list, assessment/report status; never phone, email, address, parent data), only into that same student's own chat, chat tracing stays off. Standing approval for this feature — Umesh in chat (AskUserQuestion)

## G7 — six spec details (rate-limit store, secret separation, pop-out history, raw-SQL migrations, privilege set, INR rate/percentiles)
Answered: 2026-10-26T22:03:24+05:30 — DEFERRED: "ye sabb baad mai dekhenge like first buid the funcailtiy and once vo prooperly work krnee lgg jaaye tho ye sabb hum daal hi dengee". Build uses the simplest working behaviour now; refinements later — Umesh in chat
