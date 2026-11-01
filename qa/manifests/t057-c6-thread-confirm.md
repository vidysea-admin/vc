# Manifest: t057-c6-thread-confirm

Status: checked-PASS (verdict bf5e0d4a)
Fix cycle: 0
Policy-Version: proportional-verification/2026-10-19.17
Tier: S (one widget product file plus the T-057 walk harness; no API, no security/auth/data write)
Dual check: no (no security/auth/tenancy/prod-write trigger; the server-side thread rule is unchanged)
Base: 12927df2
Candidate: a8b86f8e (commits 8eaf5b33 + a8b86f8e)
Source: E2E checker verdict qa/verdicts/t057-e2e-local.md (FAIL, 826e216b): the C6 confirm returns 409 memory_changed and the walk false-passes C6. The widget offered Confirm for a candidate proposed in another thread. The API decides a candidate only from its proposing thread: packages/db/src/profile-facts.ts:256-257 throws ProfileFactChanged under requireCandidateThread (apps/api/src/chat.ts:1264), and chat.ts:426 maps that to 409.

## Acceptance criteria
- T1: A memory row whose pendingChange.threadId is missing, empty, or different from the selected thread shows no Confirm and no Reject, shows "Proposed in another chat; open that chat to confirm or reject it.", and keeps Forget. This holds for status confirmed and proposed.
- T2: A row whose pendingChange.threadId equals the selected thread still confirms with {action:'confirm', threadId, value, candidateId, expectedVersion}.
- T3 (harness): the walk's c6-confirm step fails unless the POST .../decision response is 2xx.

## Changed files
- apps/widget/src/vc-widget.js
- apps/widget/tests/floater.test.js
- qa/.delivery/requests/t057-walk.mjs

Tests[T1,T2]: cd apps/widget && npm test

Pre-check[T1]: a8b86f8e node --test tests/floater.test.js ("t057 run8 C6: a candidate proposed in another thread...") -> pass
Pre-check[T2]: a8b86f8e npm test (apps/widget) -> pass 132 fail 0
Pre-check[T3]: a8b86f8e node --check qa/.delivery/requests/t057-walk.mjs -> ok (live headed walk is run 8c)

## Falsification
- T1/T2: the C6 test was written first and was red on 8eaf5b33^ ("confirmed: no Confirm/Reject for another thread's candidate"), then green.
- T1 threadless case: added to the test before a8b86f8e and red on 8eaf5b33 (pass 53 fail 1), then green.

## Review
senior-software-engineer on 8eaf5b33: Approve.
- Low: a pendingChange with no threadId still showed Confirm/Reject and would 409. Fixed in a8b86f8e; the pendingProfile fixture now carries the threadId both server writers set (chat.ts:792, voice.ts:1035-1040).
- Noted gaps, not built: a thread-switch flip test; the walk's .first() Confirm proves some decision succeeded, not which fact (acceptable for the walk).

## Metrics
builder_min=20
