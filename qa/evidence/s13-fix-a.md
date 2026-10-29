# s13-fix-a evidence (D-136, TDD, edit in place)

Each finding: failing test first (red, run on the unfixed code), then the fix (green). Fake Db only; no real database touched, db-init not run.

| # | Finding | Test (red then green) | Fix |
|---|---|---|---|
| 1 | crisis turn loses its helpline when the pair is withdrawn (security, medium) | apps/api/tests/chat.test.ts "S13 fixA-1" (red: 409 !== 200) | apps/api/src/chat.ts ~1105-1120: completeChatTurn wrapped; for a crisis turn ChatTurnMemoryChanged / ChatTurnLeaseLostError is logged text-free (`chat_crisis_publish_withdrawn`), abandon(), and the 200 helpline reply goes out; exactly 1 escalation asserted. Non-crisis turns still throw (409). |
| 2 | unfenced memory-marker upsert (data, medium-high) | packages/db/tests/chat-threads.test.ts "S13 fixA-2" (red: residue `student_usage:tenantA:memory:stu-1`) | packages/db/src/chat-threads.ts ~418-440: marker upsert via fencedStudentWrite with undoMarker (same pattern as profile-facts.ts decide/discard); erasure racing it now leaves zero student_usage/chat residue and the writer gets StudentFencedError. |
| 3 | usage / gap double count on retry (data, medium) | apps/api/tests/chat.test.ts "S13 fixA-3" (red: textTurns 1 !== 0 after a 409) | apps/api/src/chat.ts ~1123-1140: recordStudentUsage, usage.record and both gap counts run after the release CAS. The graph's `no_sourced_answer` recordGap (chat.ts ~625) only marks the turn scope (`gapPending`), counted after release. Replay returns before counting (zero). Post-commit count failures are logged, never refuse a committed answer; fence errors still propagate. |
| 4 | unindexed invalidatePendingPublications scan (data, low-medium) | packages/db/tests/db-init.test.ts "S13 fixA-4" (red: no index) | packages/db/scripts/db-init.ts ~198: `chat_turns_tenantId_publication_pending` {tenantId:1, publication:1}, partialFilterExpression {publication:"pending"}. |
| 5 | discardProposal leaves a new student with unusable history (data, low) | packages/db/tests/student-store.test.ts "S13 fixA-5" (red: historyUsable false; the finding was real) | packages/db/src/profile-facts.ts ~160: the discard marker upsert adds `$max: { historyAfter: "1970-01-01T00:00:00.000Z" }` (sets a missing cutoff, never lowers a real decision cutoff, cuts no history). Used `$max` rather than `$setOnInsert` so a pre-existing publication-only marker is covered too. |

Supporting edits (tests only):
- packages/db/tests/fakes.ts: the fake's upsert-insert path now applies `$max` to the inserted document, as the server does (needed by #5).
- apps/api/tests/chat-rank.test.ts: dropped the pre-release "usage" boundary from the S12/S13 race loop; by design (#3) the usage write is now after release, so that boundary no longer exists (the "completion" and "release" boundaries remain).

## Follow-up from main: consent withdrawn mid-turn on a crisis turn
- Test (red first: 409 !== 200): apps/api/tests/chat.test.ts "S13 fixA-1b". The thread is marked no-text (markChatThreadTextNotStored) while a crisis turn is staged; expected 200, state escalated, STUDENT_CRISIS_MESSAGE, exactly 1 escalation, no chat_turns rows and no student text anywhere in the store, text-free logs.
- Fix: apps/api/src/chat.ts (the S13 fix A1 catch, ~1108-1125) now also treats TypeError "ChatThreadTextNotStored" as a withdrawn publication for a crisis turn (log `chat_crisis_publish_withdrawn` error=text_not_stored, abandon(), 200 helpline). completeChatTurn had already deleted the staged rows, so nothing is stored. Non-crisis turns still get the 409.

## Commands and results
- `packages/db`: `npx tsx --test tests/chat-threads.test.ts tests/student-store.test.ts tests/erasure.test.ts tests/facts.test.ts tests/db-init.test.ts` -> tests 236, pass 236, fail 0
- `apps/api`: `npx tsx --test tests/chat.test.ts tests/chat-rank.test.ts tests/chat-profile.test.ts tests/chat-privacy.test.ts tests/chat-pathlynks.test.ts tests/chat-usage.test.ts` (final, after the follow-up) -> tests 214, pass 214, fail 0
- `npx tsc --noEmit` in packages/db and apps/api: clean (no output)

## Notes
- No commits, no push, no stash, no service restart, no browser, no full workspace suite.
