# Manifest: t057-c6-late-proposal

Status: ready-for-check
Fix cycle: 0
Policy-Version: proportional-verification/2026-10-19.17
Tier: S (one widget product file plus its test and the walk harness; no API, no security/auth/data write)
Dual check: no (no security/auth/tenancy/prod-write trigger; the server publish rule is unchanged)
Base: bf5e0d4a
Candidate: 8ea575d7
Source: E2E checker verdict qa/verdicts/t057-e2e-local.md (FAIL cycle 1): C6 overstated. Root cause found in walks 8h to 8l: the API publishes a proposed fact (proposalPending cleared) some 25 s AFTER the reply (detached extraction, apps/api/src/chat.ts:781), but the widget refreshed the memory panel only right after the turn, a thread load or a decision (apps/widget/src/vc-widget.js). The Confirm button never appeared in a running session; a reload or the next turn showed it. Evidence: qa/evidence note in the walk logs (8l: API view had target-country and budget_inr proposed from +25 s; the browser's last profile responses did not).

## Acceptance criteria
- L1: After a chat turn completes, the widget re-fetches the profile at the delays in profilePollMs (default 6, 15, 30, 60 s); a proposal published after the reply then appears in the memory panel with Confirm, without a reload.
- L2: The delayed refresh does nothing when the widget is destroyed, busy, on another thread, or when focus is inside the memory panel (a visitor typing a correction). destroy clears the timers.
- L3 (harness): walk 8m, Vidysea: c6-propose, c6-confirm (2xx on POST decision, own fact only), c6-new-thread-recall (reply mentions the confirmed country) all OK.

## Changed files
- apps/widget/src/vc-widget.js (pollProfileAfterTurn, destroy)
- apps/widget/tests/floater.test.js (new test; setup passes profilePollMs)
- qa/.delivery/requests/t057-walk.mjs

Tests[L1,L2]: cd apps/widget && npm test

Pre-check[L1]: 8ea575d7 cd apps/widget && node --test tests/floater.test.js -> pass 56 fail 0 (new test red before the change)
Pre-check[L2]: 8ea575d7 cd apps/widget && npm test -> pass 134 fail 0
Pre-check[L3]: 8ea575d7 node qa/.delivery/requests/t057-walk.mjs vidysea -> step08 c6-confirm OK 13532ms, step09 recall OK, C5 FAIL (KB search down, DevOps, not this unit)

## Falsification
- L1: the test was written first and was red (pass 55 fail 1), then green after pollProfileAfterTurn.
- L2: not separately falsified by the maker; the checker should mutate each guard (destroyed, busy, thread, focus) in a copy.

## Review
Independent review not yet run (writer does not review own output).

## Metrics
builder_min=45
