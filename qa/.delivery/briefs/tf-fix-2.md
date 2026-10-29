# tf-fix-2

Fix round 2 for the tool-first wave. Clear the Block and the medium findings in the two re-review verdicts. TDD, edit in place.
1. [high, Block] packages/db/src/client.ts:154-162 openReadOnlyDb: stop spreading caller options. Allow-list them per method:
   - find: maxTimeMS, projection, sort, limit, skip, hint
   - aggregate: maxTimeMS, allowDiskUse
   - countDocuments: maxTimeMS, limit, skip
   Always force readPreference secondaryPreferred. Add tests that {out:"x"}, {merge:...}, writeConcern, bypassDocumentValidation and session never reach the driver (use a fake driver collection that records the options it receives), and keep the existing $out/$merge stage screen.
2. [medium] packages/engine/src/ingest/routes.ts:387-388 and migrations.ts:1172: verified and writerFound must be true only for verifiedBy router|service. Model-only edges get verified=false plus a separate definedInModel=true. Update the tests, and recount: the honest number should be 40 of 59. Make sure joinProductKg and the admin-sync tests still pass.
3. [medium] migrations.ts:944-952: the stacked-decorator scan is quadratic (100k decorator lines took 89.6 s). Make it a single pass or cap the lookahead, with a hostile test (100k lines in under 500 ms).
4. [medium] apps/api/src/admin-routes.ts: add an explicit admin override for keep-last-good, e.g. an acceptShrink=true flag on the sync request. It is honoured only for the super-admin role (follow the existing role checks in this file) and audit-logged with counts. Without it, behaviour is unchanged. Also gate on skippedServices the same way as skipped. Tests.
Run: packages/db (client, db-scope), packages/engine (ingest-*), apps/api (admin-sync, admin-routes); tsc for db, engine, api. Write qa/evidence/tool-first/tf-fix-2.md.
