# vca-fix1-eng: fix cycle 1, ENGINE group (maker evidence)
Branch wave/vca-fix-eng, base 994e79f. Gates: G6 "ALLOW, minimal fields only ... only into that same student's own chat"; G7 "simplest working behaviour now".

## E1 (review-de #1) packages/engine/src/ingest/migrations.ts parseOne (scan loop ~494, createTable ~527)
- Scan loop now diagnoses `recv` used as a value (helper call / alias) and `recv.x.y(` member chains that are not direct calls (e.g. `queryInterface.sequelize.query`), code `unknown_method`. The benign `recv.sequelize.transaction(` wrapper is exempt (its body is scanned; fixture create-posts.js).
- createTable: `objectEntries().skipped > 0` -> one `skipped_columns` diag naming the count; a `value === null` shorthand/method property -> `dropped_column` diag naming `table.key`. No column is invented.
- Tests (ingest-migrations.test.ts, appended): spread base, shorthand, raw sequelize.query + helper, mixed (parsed + skipped + dropped == 5 source entries), clean createTable stays diagnostic-free.
- RED before the fix: 4 E1 tests failed on unmodified source. GREEN after.

## E2 (review-ai #2) packages/engine/src/student/graph.ts:228 namesAnotherStudent
- Added he, she, they, him, them, hers, theirs to the third-person pattern. "what careers did she save" now gets PATHLYNKS_OWN_DATA_ONLY_TEXT and the port is not called; "what careers did I save" still answers from stu-A.
- Tests (pathlynks-tools.test.ts, appended): she/he/they/her cases refused with 0 port calls; own question answered. RED before fix, GREEN after.
- Known tradeoff: fail-closed, so an ordinary "they" in a Pathlynks ask is refused with the own-data line.

## E3 (review-ai #7, G6) test only
- New test: a row with phone, email, dob, guardian_name, address, tenant_id, password_hash through all four tools; message and whole stored response contain none of the values. No defect found (allow-list holds).
- Falsified: widening the allow-list (phone/email/dob/guardianname/address) in graph.ts made the E3 test FAIL (pass 0 / fail 1); source restored from backup (graph.ts diff = the E2 line only).

## Commands and results
- `bash D:/vc/scripts/vc-testlock.sh pnpm exec tsx --test tests/ingest-migrations.test.ts tests/pathlynks-tools.test.ts tests/student-graph.test.ts tests/ingest-routes.test.ts tests/ingest-github.test.ts` (packages/engine): tests 174, pass 174, fail 0.
- `bash D:/vc/scripts/vc-testlock.sh pnpm -C . typecheck` (packages/engine): exit 0.
- Falsification run: `--test-name-pattern=E3` with widened allow-list: fail 1.
