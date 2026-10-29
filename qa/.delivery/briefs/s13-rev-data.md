# s13-rev-data

Tool-first files already have a checker PASS (qa/verdicts/tf-checker-final-2.md): packages/engine/src/ingest/**, tools/navigate.ts, the tool-first parts of classify.ts/graph.ts, mcp/pathlynks/src/port.ts, packages/db/src/client.ts openReadOnlyDb, schemas sources.ts, admin-routes.ts sync. Do NOT re-review those. Your scope is the REST of git diff HEAD (the S13 workstream).
Data review of the S13 persistence code: packages/db/src (chat-threads.ts, profile-facts.ts, admin-store.ts and any new collection or index), the memory cutoff/publication/erase logic in apps/api/src/chat.ts and packages/engine/src/scribe/**, the two STALLED counterexamples (cutoff rollback; erase during ranking) noted in qa/evidence/s13-root-integration.md.
Focus:
- idempotency of turn and fact writes (clientTurnId replay)
- erase completeness across every collection
- index coverage for the hot queries
- the Mongo writes go only to virtual_counsellor (contract B12)
- no silent record loss on retries
Re-run the counterexample tests.
Find your scope with git diff --stat HEAD and git status (untracked files too), excluding the tool-first files. Re-run the focused tests for each file you review, plus tsc. Return Approve/Warning/Block with file:line, most severe first, with a concrete fix for each finding. Prove behaviour with your own hostile inputs, not by reading construction.
