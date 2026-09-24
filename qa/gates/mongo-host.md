# HUMAN_GATE: is MONGODB_URL a dev/work server? (ISS-012, contract B12)

**Raised:** 2026-09-25 by /checker
**Blocks:** every unit that writes to Mongo (T-003 Student Knowledge Graph onward). Units that don't use the database
(T-002b, T-004 Langfuse, T-005 skills) are not blocked.

`.env` `MONGODB_URL` has these properties:
- **scheme:** `mongodb://`, so it is self-hosted and not Atlas. There is no native `$vectorSearch`, so the plan needs a
  brute-force cosine retriever like KnowledgeBase U1.4.
- **host:** a remote public IP, port 27017.
- **credentials:** none in the URI.
- **database name:** none in the URI.

The adapter's isolation rule says "`vc_work_<slug>` on a local/dev Mongo only". The checker's read-only probe
(`listDatabases`) was blocked by the auto-mode classifier as a production read. So nothing in this session has shown
whether the host is production.

**Question (answer once, then write `Answered:` below):**
1. Is this host a dev/work server where the engine may create and write `vc_work_*` databases? Or is it a production
   server, so the engine needs a different URI?
2. Is it really open with no authentication on a public IP? If so, that is a separate security finding for whoever
   owns the server.

Answered: 2026-09-25, by the user in the checker session, verbatim: "the mongo uri in the .env is the product one,
and don't worry this one is ip protected and also i just want to make you aware that make a new db of yours and just
directly use that, name it virtual_counsellor". Resolution:
1. The host is the **production** Mongo server. Access is IP-allowlisted, and the owner accepts that its auth posture
   is out of scope for this project.
2. The engine may create and write **one** database on it, `virtual_counsellor`, and use it directly. Every other
   database on the server stays untouched, read and write (contract B12, amended as CRITICAL with human approval).

Re-confirmed: 2026-09-25, Umesh in the checker session, verbatim: "you are allowed to write in production".
The scope is unchanged: writes to the production server are allowed **only inside `virtual_counsellor`**, per contract
B12 and B8. This line is standing approval for the maker's live runs, e.g. `packages/db/scripts/db-init.ts`. The first
real run still has to wait for the B15 erasure design to land, per `dpdp-erase-design.md`. If Claude Code's
auto-mode classifier blocks a run as a "production write", the human approves that prompt; this repo's settings are
not edited to bypass it.
