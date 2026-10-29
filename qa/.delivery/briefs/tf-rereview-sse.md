# tf-rereview-sse

Fresh re-review of fix round 1 for the tool-first wave (uncommitted, worktree). Prior verdicts: qa/verdicts/tf-review-sse.md and tf-review-ai.md. Fix evidence: kg-fix-1, route-fix-1, wire-fix-1, pl-mongo.
Check every prior finding is actually fixed. Prove the outcome, not the construction: run hostile inputs yourself (5000-char inputs for the new navigate/classify regexes and the Python parsers) and the frozen routing probe.
Review the new code hard:
- the Mongo read-only opener packages/db/src/client.ts openReadOnlyDb: can any write be reached through the returned handle or the raw driver? Does the database allow-list hold against a trailing dot or case variants?
- the quest reader in mcp/pathlynks/src/port.ts: owner binding, projection allow-list, no shareToken/reflection/proof fields, outage vs zero rows
- publicNavigate: an anonymous visitor can never get a student-auth recipe or student data
- the voice tool exposure in apps/api/src/index.ts createQuestVoiceTools: no identity argument, owner-bound
- the sources schema mongo kind
Re-run the flaky apps/api voice.test.ts C16 three times alone and say whether it is flaky in code not touched by this wave.
Tests: the engine focused set incl. routing-probe, ingest-*, pathlynks-tools; mcp/pathlynks; db client/db-scope; schemas; api admin-sync, admin-routes, chat-pathlynks, voice-wiring. tsc for each package. Return Approve/Warning/Block.
