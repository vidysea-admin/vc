# Verdict B (dual check): w1-erasure-outbox
Cycle checked: 0
Checker: coordinator B (blind to A). Unit head f6d1fff (code 762ec01), branch wave/w1-erasure-outbox. Policy-Version: proportional-verification/2026-10-19.17. Checked 2026-10-25T07:26:51+05:30.

VERDICT: PASS f6d1fff

## Executed (all via vc-testlock.sh, per-package cwd, worktree read-only)
- packages/db tests/erasure.test.ts: 76 pass, 0 fail
- packages/db tests/erasure-approver.test.ts: 15 pass, 0 fail
- packages/engine tests/webhooks-outbox-mongo.test.ts: 14 pass, 0 fail
- apps/api tests/server.test.ts: 35 pass, 0 fail
- Own hostile tests in a copy (scratchpad chk-eo-B/copy; tests chkB-hostile.test.ts 9 pass/0 fail, chkB-purge.test.ts 3 pass/0 fail).
- Mutants in the copy, both killed: (M1) outbox step reverted to byEventStudent with no hold -> 6 of 9 hostile tests fail; (M2) staleness() pending branch disabled -> the E3 boundary test fails.

## Outcome proof
E1: with VC_ERASURE_AUTO_DELETE off and on, a pending or failed erasure.requested row for the student survives 3 consecutive retries (status failed, attempts 1,2,3, fence kept, receipt verified=false), while delivered rows, consents, transcripts of that student are deleted, a lookalike id (stu-A2) and student B are untouched. Once the row is delivered (or dead) the retry completes verified and no student-A row remains in outbox or students. A row of an unknown status ("sending") also holds (residue read-back), and a pending row injected after the settled delete (late arrival) is not lost and does not complete. Dead/delivered-only completes in one run. Drain has no fence check, so a fenced student's event can still be delivered. Receipt carries counts and a label held:N_undelivered only (no URL/event content); the 500 erasure_incomplete mapping pre-exists and is retryable via the execute route.
E1 protected-test edit (T-034/B15, seed pending -> delivered): NOT a weakening. The assertions are unchanged (A's event purged, B's kept); the seed changed because D-112 Q9 supersedes "purge pending". The pending case is now covered by 4 new tests that fail under M1.
E2: purgeSettled removes only delivered/dead with updatedAt strictly before cutoff, in both Mongo(fake, tenant-scoped) and in-memory: cutoff-1ms purged, exactly cutoff kept, cutoff+1ms kept; old pending and failed kept; other tenant untouched. WebhookOutbox interface unchanged (a fake typed WebhookOutbox without purgeSettled compiles). packages/db/src/outbox.ts does not exist at base or head; editing packages/engine/src/webhooks/outbox.ts is acceptable scope.
E3: pending at exactly TTL expires, TTL-1ms does not; no key leaves the slot held; confirmed, awaiting_approval, approved, failed rows with ancient requestedAt are never expired; expired row holds no raw student id (studentId/studentKey unset, studentHash set); two parallel requests on a stale pending: exactly one wins, one open row remains.

## PROPOSED-ISSUE (none blocking; do not write to qa/issues.jsonl from a dual check)
- PROPOSED-ISSUE low: a `failed` outbox row holds an erasure until an operator sweep (drain includeFailed); no age-based escalation, so a student's anchor rows (facts, sessions, students) stay while it is held. Status is visible (request failed, receipt line held:N_undelivered) but nothing alerts. Policy for failed rows is a Umesh decision (maker already flagged).
- PROPOSED-ISSUE low: purgeSettledWebhookOutbox has no caller/scheduler; E2 is met as a tested callable only.
- PROPOSED-ISSUE low (behaviour): under autoDelete the erasure.requested event is enqueued at first confirm and the drain never runs inline, so the reconfirm purge will usually return 500 erasure_incomplete first and need /execute after the drain. Retryable and leak-free, but clients see a 500 on the happy path.
- PROPOSED-ISSUE info: maker tests do not assert the exact-cutoff boundary (strict <) or the exact-TTL boundary; covered here only in the checker copy.
