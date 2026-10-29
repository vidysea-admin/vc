# s13-rev-sec

Tool-first files already have a checker PASS (qa/verdicts/tf-checker-final-2.md): packages/engine/src/ingest/**, tools/navigate.ts, the tool-first parts of classify.ts/graph.ts, mcp/pathlynks/src/port.ts, packages/db/src/client.ts openReadOnlyDb, schemas sources.ts, admin-routes.ts sync. Do NOT re-review those. Your scope is the REST of git diff HEAD (the S13 workstream).
Security and privacy review of the S13 code: apps/api/src (chat.ts, voice.ts, partners.ts, openapi.ts, main.ts, index.ts outside the tool-first voice-tool lines), apps/widget/src/*, apps/web admin views, packages/providers/src/live.ts, packages/db/src/profile-facts.ts, admin-store.ts, chat-threads.ts, packages/schemas student-api.ts, mcp/university-kb/src (breaker, route).
Focus:
- authz and tenant isolation on every new or changed route
- no student text in logs, metrics, URLs or the widget's storage
- token handling in voice (subprotocol token, expiry)
- CORS/origin checks in the widget and API
- the partner API
- secrets never echoed
- the crisis path is never suppressed
Also check that untracked files about to be committed contain no secret (grep for key patterns; report file names only). qa/fixtures/voice/crisis-en-24k.pcm is audio.
Find your scope with git diff --stat HEAD and git status (untracked files too), excluding the tool-first files. Re-run the focused tests for each file you review, plus tsc. Return Approve/Warning/Block with file:line, most severe first, with a concrete fix for each finding. Prove behaviour with your own hostile inputs, not by reading construction.
