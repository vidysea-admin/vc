# tf-checker-final

Independent final check of the tool-first wave after fix round 2 (uncommitted, worktree). Prove the outcome, not the construction:
1. openReadOnlyDb (packages/db/src/client.ts): write a throwaway script that drives the real mongodb driver against a local fake or a mocked collection, or reason over the driver source. Show that no option or pipeline reaches a write: out, merge, $out/$merge stages incl. nested in $facet/$lookup pipelines, writeConcern, session, plus prototype-polluted options objects. Try trailing-dot and case variants of the database name.
2. verified edges: model-only edges are verified=false in the stored and joined output; recount from the test fixtures.
3. The stacked-decorator scan and all ingest parsers: run 100k-line hostile files yourself and time them.
4. acceptShrink: plain admin 403, super-admin honoured only for shrink/skipped reasons, audit row written before the artifact, and no bypass via string "true", arrays or extra keys.
5. Re-run the full routing probe test and confirm 0 KB near-misses are stolen.
Run: packages/db (client, db-scope), packages/engine (ingest-*, routing-probe, navigate, student-classify, pathlynks-tools, capability-manifest, student-graph), mcp/pathlynks, apps/api (admin-sync, admin-routes, chat-pathlynks, voice-wiring), schemas sources; tsc for each. Return PASS or FAIL with evidence, in the form VERDICT: PASS|FAIL.
