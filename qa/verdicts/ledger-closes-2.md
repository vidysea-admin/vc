# Verdict: ledger-closes-2 (ledger maintenance)

**Cycle checked:** 0
**Checker:** /checker (fresh context), read-only except `qa/issues.jsonl` and this file
**Code HEAD tested:** 9033d80 (code unchanged through d48bd74, which adds only docs/go-live-checklist.md and a qa manifest)
**Policy-Version:** proportional-verification/2026-10-19.17
**Run at:** 2026-10-25T09:08 to 09:12 +05:30
**Overall:** 7 of 7 rows verified (ISS-t-034-de-1 and ISS-t-034-de-2 with tracked residuals); 0 left open.

## One line per row

| Id | Verdict | Evidence |
|---|---|---|
| ISS-t-034-de-1 | VERIFIED (residual tracked) | drain query is status-scoped in Mongo and memory: webhooks-outbox-mongo 14/14, webhooks-delivery-drain 5/5. Retention: purgeSettledWebhookOutbox tested but has no production caller (grep), so settled rows still accumulate; tracked by ISS-w1-erasure-outbox-2 |
| ISS-t-034-de-2 | VERIFIED (residual tracked) | erasure.test.ts 76/76 incl. four E1 tests (pending/failed row, autoDelete on/off: erasure held, retryable, fence kept, row kept; retry completes after delivery); server.test.ts -pattern erasure 6/6. Needs a drain scheduler before VC_ERASURE_AUTO_DELETE is enabled (ISS-w1-erasure-outbox-2) |
| ISS-t-029-rev-1 | VERIFIED | erasure-approver -pattern W1-E3 2/2; api E3 case (201 after TTL, 409 fresh, fail-safe unconfigured) inside the 6/6 erasure run |
| ISS-t-010-c0-1 | VERIFIED | cards-verifier 26/26; own hostile probe 0 of 14 instruction-with-? rows shown (English, Hinglish, Devanagari), 0 of 4 genuine controls over-suppressed |
| ISS-t-010-c0-2 | VERIFIED | no live `\|\| citedTopics.size > 0` on main (comments only; relevance.ts:316 uses citedTopics.has(topic)); own hostile probe 0 of 6 re-ask rows shown, control kept |
| ISS-t-012-rev-1 | VERIFIED | both collections in COLLECTION_NAMES, db-init plan, ERASURE_PLAN; erasure 76/76, db-init 26/26, db-scope 11/11, crisis-escalation 42/42 |
| ISS-sweep-20261025-2 | VERIFIED | one Status header line left (line 7 checked-PASS); line 62 relabelled "Hand-in state (superseded...)"; live mc-sessionstart hook: Checks pending 0, w1-cards-b1 not named |

## Commands run (each under `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm -C <pkg> exec tsx --test ...`)
- engine tests/webhooks-outbox-mongo.test.ts: 14 tests, 14 pass, 0 fail
- engine tests/webhooks-delivery-drain.test.ts: 5/5
- db tests/erasure.test.ts: 76/76
- db tests/erasure-approver.test.ts --test-name-pattern=W1-E3: 2/2
- engine tests/cards-verifier.test.ts: 26/26
- engine tests/crisis-escalation.test.ts: 42/42
- db tests/db-init.test.ts: 26/26; db tests/db-scope.test.ts: 11/11
- api tests/server.test.ts --test-name-pattern=erasure: 6/6
- engine hostile probe (scratchpad hostile-cards.test.ts, imports main's src, 20 new rows plus controls, not in D:/vc): 2/2 pass; printed C01_LEAKS 0 of 14, C01_OVERSUPPRESSED 0 of 4, C02_LEAKS 0 of 6, C02_CONTROL_KEPT 1
- `.claude/hooks/mc-sessionstart.ps1` (read-only): `Checks pending: 0`
No full suite, python, live calls or Mongo. No mutants were run by this checker for the TTL boundary; the boundary pins are thin (ISS-w1-erasure-outbox-3), the earlier dual verdict w1-erasure-outbox.A killed the TTL and purge-cutoff mutants.

## Open risks
- Settled outbox rows still accumulate and the reconfirm returns 500 until a drain runs: ISS-w1-erasure-outbox-2 (open, medium).
- Homograph B1 residual: ISS-w1-cards-b1-1 (open, low).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
