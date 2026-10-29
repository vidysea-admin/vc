# tf-rereview-data

Fresh data-engineering re-review of fix round 1 (prior verdict qa/verdicts/tf-review-data.md).
Verify:
1. keep-last-good in apps/api/src/admin-routes.ts (~:816, :870) with shouldKeepLastGood: hub missing, >30% shrink, skipped>0, empty. Run the tests and reason about the edge cases (first-ever sync with no prior artifact; a legitimate large refactor, and how an admin forces it).
2. Provenance: listTree returns the commit and tree sha, and they are stored in data.source.
3. Edge verification: the verifiedBy semantics in packages/engine/src/ingest. Is "model" verification honestly labelled (it only proves the table is defined)? Do the 56/59 counts hold?
4. port.ts next_due filter (end_date >= today IST): correct for a date vs timestamptz column? Check the column type read-only on the Vidysea DB (information_schema only).
5. Quest reads: read-only Mongo against pathlynks_journey through openReadOnlyDb for the walk test student, counts and key shapes only, no values. Is the owner field mapping (Postgres users id vs Mongo studentId) correct?
Read-only Mongo/PG allowed (information_schema, counts). Return Approve/Warning/Block.
