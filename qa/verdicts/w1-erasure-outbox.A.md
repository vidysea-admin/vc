# Verdict (dual check, coordinator A): w1-erasure-outbox
Cycle checked: 0
Checked head: f6d1fff (code 762ec01), worktree D:/vc/.worktrees/w1-erasure-outbox, Tier L, Policy-Version: proportional-verification/2026-10-19.17
Checked at: 2026-10-25T07:29:41+05:30
VERDICT: PASS (no side effects in a dual check; findings below are PROPOSED-ISSUE lines only)

## Commands run (all via vc-testlock.sh, long waits; fakes only, no real Mongo/LLM)
- packages/db tests/erasure.test.ts: 76 tests, 76 pass, 0 fail
- packages/db tests/erasure-approver.test.ts: 15 pass, 0 fail
- packages/db tests/db-scope.test.ts: 11 pass, 0 fail
- packages/engine tests/webhooks-outbox-mongo.test.ts: 14 pass, 0 fail
- apps/api tests/server.test.ts: 35 pass, 0 fail
- pnpm exec tsc --noEmit in packages/db, packages/engine, apps/api: exit 0 each
- Hostile tests (scratch copy chk-eo-A/copy, tests/hostile-A.test.ts): db 5 of 5 pass, engine 2 of 2 pass
- Mutants (scratch copy-m): M2 hold count disabled -> 2 hostile FAIL; M3 settled filter deletes every status -> 3 FAIL; M4 pending TTL boundary <= to < -> 1 FAIL; M5 purge cutoff <= -> 2 FAIL; M6 purge also removes pending -> 1 FAIL; M1 failed not held -> hostile survives (see note 1)

## Outcome proof
E1: with a pending (and a second fact.approved pending) row, under VC_ERASURE_AUTO_DELETE on and off, 3 consecutive retries each throw ErasureIncompleteError (verified=false), the outbox rows are byte-identical after every retry, request status failed, attempts increments, student stays fenced, student anchor and facts are NOT deleted (phase 2 deferred), so there is no partial erasure reported as success. Flip one row to delivered and the other to failed: delivered row purged, failed row kept, still incomplete. Flip to dead: erasure completes, no identifier left in any collection. Unknown/missing/null/"sending"/"PENDING" status rows are never deleted and never allow success (residue read-back catches them). A pending row injected after the settled delete and before the hold count is kept and held. The hold is visible, not silent: request status failed, receipt line outcome failed with error held:N_undelivered, API 500 erasure_incomplete.
T-034/B15 protected-test edit: only the seeded A event status pending to delivered; the deletion and sibling-untouched assertions are unchanged, and the pending case is now covered by 5 stricter new tests. Not a weakening.
E2: purge removes only delivered/dead rows with updatedAt strictly before the cutoff (a row at exactly the cutoff is kept; 1 ms older is purged) in both MongoWebhookOutbox (tenant-scoped, other tenant untouched) and InMemoryWebhookOutbox; pending and failed never purged however old. WebhookOutbox interface unchanged (diff adds only SettledPurgingOutbox, a separate interface).
E3: pending exactly at TTL expires (<=), TTL-1ms does not; expired row has status expired, studentId/studentKey unset, HMAC studentHash written, no raw student id in the JSON; without the audit key behaviour is unchanged (409 / ErasureRequestAlreadyOpenError); awaiting_approval and confirmed never touched however old; malformed requestedAt is treated as not stale (fail safe); closeUnpurged CAS pins status so a concurrent confirm wins and the new request is refused.
Route: reconfirm 500 erasure_incomplete is the pre-existing mapError (server.ts:653), counts-only receipt (collection names, counts, held:N label), no student id or event content; request stays failed and retryable via POST /execute. Brief-named packages/db/src/outbox.ts does not exist at base da2faad; editing packages/engine/src/webhooks/outbox.ts is acceptable scope.

## Notes
1. M1 (failed rows not counted as held) still ends incomplete via the residue read-back (the failed row is kept and the erasure loops to max rounds then fails), only the held: label differs; the author's tests assert the label. Defense in depth, not a defect.

## PROPOSED-ISSUE (none blocks PASS)
- PROPOSED-ISSUE low (policy, needs Umesh): a failed (non-retryable 4xx) outbox row holds the erasure until an operator sweeps with includeFailed; if the partner keeps rejecting, the erasure never completes and the student stays fenced. Manifest already flags it. Suggest an alert/listing of failed erasure requests older than N days.
- PROPOSED-ISSUE low (ops): no drain scheduler exists, and under VC_ERASURE_AUTO_DELETE the erasure.requested event is queued at the first confirm, so the reconfirm route will return 500 erasure_incomplete until a drain runs. Do not enable auto-delete in production before a drain scheduler (and purgeSettledWebhookOutbox schedule) exist.
- PROPOSED-ISSUE info: purging delivered rows after 30 days drops the outbox id used for enqueue idempotency; a re-emit of the same event id after retention would re-enqueue. Acceptable at 30 days; record it.
- PROPOSED-ISSUE info: E3 expires only on a new request for the same student; abandoned pending rows for students nobody re-requests keep the clear studentId (as before).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
