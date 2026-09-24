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

Answered:
