# S13 data-engineer review (2026-10-29, D-136)

Fresh read-only data-engineer review, saved by the main session.

**Verdict: Warning.** No Block. Erase completeness, idempotency and B12 all hold.

## Findings
1. **[medium-high] chat-threads.ts:420-429.** The memory marker upsert in completeChatTurn is not fenced. A race with erasure leaves `student_usage:<tenant>:memory:<studentId>` behind (hostile test H4, `qa/evidence/s13-data-hostile.test.mts`).
   - Fix: wrap it in fencedStudentWrite with an undoMarker, the same pattern as profile-facts.ts:282-288.
2. **[medium] chat.ts:1100.** recordStudentUsage, incrementGapCount and usage.record run before completeChatTurn and are not keyed by turnId, so a retry (409, lost lease, crash) double-counts the quota and usage.
   - Fix: move them after the release CAS, or key them by turnId.
3. **[low-medium] chat-threads.ts:120.** invalidatePendingPublications scans unindexed.
   - Fix: add a partial index {tenantId:1, publication:1} where publication is "pending" (db-init.ts).
4. **[low] profile-facts.ts:157-159.** discardProposal upserts the marker without historyAfter, so historyUsable is false (fails closed). Unproven; from reading the code.
   - Fix: add $setOnInsert historyAfter.

## Cleared
- Erase covers all 5 collections; export filters the internal fields.
- Hostile tests: H1 (5 parallel claims, exactly 1 wins), H2 (same turn id with a different hash conflicts), H3 (lease takeover), H5 (erase before the CAS leaves zero residue).
- Both STALLED counterexamples pass.
- B12 holds.

## Re-runs
| Suite | Result |
|---|---|
| db | 178/178 |
| api chat* | 191/191 |
| engine scribe | 50/50 |

tsc is clean.
