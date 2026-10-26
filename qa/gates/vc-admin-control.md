# HUMAN_GATE: vc-admin-control (batched, asked once)
Opened: 2026-10-26 · Feature: docs/features/vc-admin-control/ · Owner: Umesh

Building does not wait on these. Every unit is built and checked against fakes (fake Postgres, fake GitHub, fixture
repos). Only the **live** connection to the Pathlynks DB and a live GitHub sync are HELD until G1/G2 are answered.

## G0 — plan approval
Plan "VC Admin Control + Pathlynks sources" (A0..A11).
Answered: 2026-10-26 Umesh — "hnn tho ye plan frinal hai"; then "use the max possible subagents and build it in the best way possible".

## G1 — DB credentials hygiene (security, before any live connection)
The handover doc holds the live production DB password in plain text and is link-shared. The user it names is an
admin role.
Recommended default: Umesh (1) rotates the `pathlynksadm` password, (2) restricts the doc's sharing, (3) creates a
role `vc_readonly` with SELECT on only the tables named in `config/sources.json` `tables`, and puts its password in
`D:\vc\.env` as `PATHLYNKS_DB_PASSWORD` himself. VC refuses to start a live sync with a role that can write
(it checks `has_table_privilege(..., 'INSERT')` on connect and fails closed).
Answered:

## G2 — DB access method
Options: (a) RDS security-group allowlist of the VC server IP (recommended: simplest, SSL already on);
(b) SSH tunnel / bastion; (c) a read replica.
Answered:

## G3 — Videshi
The meeting named two DBs. Only Pathlynks details were shared. Default: build for Pathlynks now; Videshi is added later
from the console as one more source, with no code change.
Answered:

## G4 — Pathlynks embed (A11)
Default: the Pathlynks team adds the script tag in `src/app/layout.jsx` and a `/api/vc` proxy that forwards the
Pathlynks JWT. VC ships the snippet and the proxy example in `apps/widget/README.md`. VC verifies the Pathlynks JWT
with a per-site verifier config (HS256 shared secret by env name, or JWKS URL).
Answered:

## G5 — Admin login method
Default: email + password (scrypt/argon2id), JWT 8 h, first super-admin created by CLI
`pnpm -C apps/api admin create <email> --role super-admin` (password typed at the prompt, never an argument).
Google SSO later.
Answered:
