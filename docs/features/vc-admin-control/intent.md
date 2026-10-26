# Intent — vc-admin-control (2026-10-26)

## Problem
The 26 Oct meetings ("Virtual Counsellor" doc, tabs "26 Oct1" / "26 Oct2") fixed the product shape. VC is one central
service that every Vidysea site plugs in. It shows as a small logo; a click opens a floater chat window with a
Chat|Voice toggle. It tells the student step by step how to navigate the host site (it does not click for them yet),
it reads the student's state from the host DB, and it runs guardrails before every reply.

Umesh added in his own words: "virtual counsellor ka proper login system ... admin system with API management, more
GitHub repos can be added later from the backend, connectivity with the VC from the backend, an admin controller
with a dashboard for tracking". There are two sides:
- the backend team (Umesh) uses the **Admin Console**;
- the plugged-in websites use the **Widget** (UI + tool).

Umesh then shared the "Pathlynks Production Access Handover" doc and asked: "save these details as in config file and
ye sabb mere admin control mai hongi ... inke basis mai abhi system bnaana hai". He approved the plan on 2026-10-26
("ye plan final hai") and asked to build it "in the best way possible" with maximum parallel agents.

Today the partner registry (partner-chatbot, PASS) is managed only by a CLI. There is no admin login, no dashboard,
no source registry, the VC cannot read Pathlynks data, and the widget is a fixed bubble with no header toggle.

## Proposed outcome
1. An admin logs in to the VC Admin Console (email + password; roles super-admin / admin / viewer). Every write is
   audited.
2. In the console the admin manages **sites** (host websites and their origins) and **API keys** (create once-shown,
   rotate, revoke). This reuses the partner registry, not a second key system.
3. The admin manages **knowledge sources**: add a GitHub repo + branch, or a Postgres DB (non-secret fields, secret
   held encrypted), test the connection, trigger a sync. The four Pathlynks repo branches and the Pathlynks Postgres
   are seeded from `config/sources.json`.
4. A sync of a GitHub source builds a **schema map** (from Sequelize migrations) and a **navigation catalogue** (from
   the Next.js `src/app` route tree) in Mongo. Chat never touches GitHub live.
5. Read-only **Pathlynks tools** (student profile, saved careers, compare list, assessment/report status) answer
   "about me" questions for the logged-in student, scoped to that student only.
6. A **navigation skill** turns "how do I X" into ordered steps from the catalogue.
7. A **dashboard** shows conversations per site per day, active students, chat vs voice, tokens and cost per student
   against the ₹50 target, latency, guardrail hits, and unanswered questions.
8. The **widget** becomes a floater: drag, resize, pop-out, a Chat|Voice header toggle, one shared history.

## Affected users and systems
- **Super-admin (Umesh):** creates admins, owns sources and secrets.
- **Admin (backend team):** sites, keys, syncs, guardrails, dashboard.
- **Viewer:** dashboard and read-only lists.
- **Pathlynks student (logged in):** widget with student-aware answers through proxy mode (Pathlynks backend vouches).
- **Vidysea website visitor (anonymous):** widget, general answers only.
- **Pathlynks team:** embeds the script and a `/api/vc` proxy in their repo (A11, their change).
- **Systems:** apps/api, apps/web (admin route group), apps/widget, packages/{schemas,db,engine,observability},
  a new `mcp/pathlynks`, `skills/`, a new `config/sources.json`, the `virtual_counsellor` Mongo DB.

## Constraints
- Secrets never go into a committed file, a log, a chat or a trace. `config/sources.json` holds non-secret fields and
  a `secretRef` env name; `.env.example` holds key names only. Stored secrets are AES-256-GCM encrypted with a master
  key from env.
- The Pathlynks Postgres is production: VC only reads, through parameterised queries, with a statement timeout and a
  row cap, and the VC never connects with an admin role in production (gate `vc-admin-db-access`).
- A student sees only their own Pathlynks rows. Identity comes from the host's signed token, never from the request
  body.
- Crisis handling is unchanged (crisisGuard, LK10 wording, 14416/112 footer always visible).
- Only the `virtual_counsellor` Mongo DB is written.
- Student data never leaves for an external service without per-use approval; ingestion stores schema and routes, not
  student rows.

## Decisions
- Plan approved by Umesh 2026-10-26 ("ye plan final hai"); build with maximum parallelism.
- Phase order: student widget + admin console ahead of the P1 copilot order (DECISIONS entry D-113).
- Admin auth: email + password (argon2id or scrypt) issuing short-lived VC JWTs; Google SSO deferred.

## Open questions (gated, defaults recorded in qa/gates/vc-admin-*.md)
- Read-only Postgres role + DB password rotation + doc sharing restriction (Umesh).
- DB access method: RDS security-group allowlist vs SSH tunnel (Umesh).
- Videshi repo + DB details (Umesh).
- A11 Pathlynks embed is owned by the Pathlynks team.
