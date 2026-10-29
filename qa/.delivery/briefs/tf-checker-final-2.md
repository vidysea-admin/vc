# tf-checker-final-2

Cycle-2 independent check. The prior final check FAILED only on packages/engine/src/ingest/routes.ts parseStudentHub: the keys.some de-dup was quadratic (a 120k-key navigation file took 138 s). It also proposed optional hardening: a recursive $out/$merge screen in packages/db/src/client.ts openReadOnlyDb aggregate. Both were changed by the main session (git diff these two files plus the tests appended at the end of packages/engine/tests/ingest-routes.test.ts and packages/db/tests/client.test.ts).
Prove the outcome yourself:
- time parseStudentHub on 120k and 500k unique keys within 2 MB;
- the screen must refuse write stages nested at any depth in $facet/$lookup/$unionWith sub-pipelines;
- a 10k-deep nested object must not overflow the stack (the depth cap should refuse it);
- a "$out" string VALUE must not be a false positive;
- check for any regression in the existing tests.
Everything else in the wave was already verified in the prior check (items 1, 2, 4, 5 green, D-135 applied: any admin may acceptShrink, viewer 403).
Run: packages/db (client, db-scope), packages/engine (ingest-*, routing-probe), mcp/pathlynks port, apps/api admin-sync; tsc for db and engine. End with VERDICT: PASS or VERDICT: FAIL.
