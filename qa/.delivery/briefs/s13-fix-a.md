# s13-fix-a

S13 fix round A (persistence and chat), under D-136. TDD and edit in place. Another lane owns voice.ts, graph.ts, claims.ts, providers and index.ts/main.ts; do not touch them.
1. [security, medium] chat.ts:1100: a crisis turn must ALWAYS return its helpline reply. If completeChatTurn throws ChatTurnMemoryChanged or ChatTurnLeaseLostError on a crisis turn, log it text-free, abandon(), and respond 200 with the crisis response. Regression test: a policy change between stage and release still returns 200 with the helpline text and exactly 1 escalation.
2. [data, medium-high] chat-threads.ts:420-429: the memory marker upsert in completeChatTurn must go through fencedStudentWrite with an undoMarker (same pattern as profile-facts.ts:282-288). Regression test: erasure racing the marker write leaves zero student_usage residue (see the H4 shape in qa/evidence/s13-data-hostile.test.mts).
3. [data, medium] chat.ts:1100: recordStudentUsage, incrementGapCount and usage.record must not double-count on retry. Move them after the successful release, or key them by turnId (idempotent). Test: a 409 memory_changed followed by a retry counts once; a replay counts zero.
4. [data, low-medium] db-init.ts: add a partial index {tenantId:1, publication:1} with partialFilterExpression publication:"pending" on chat_turns, plus a db-init test. Do NOT run db-init against any real database.
5. [data, low] profile-facts.ts:157-159 discardProposal: $setOnInsert historyAfter so a new student keeps short-term context. Prove it with a test first (it is unproven).
Run: packages/db (chat-threads, student-store, erasure, profile-facts, db-init tests), apps/api (chat, chat-rank, chat-profile, chat-privacy, chat-pathlynks), tsc for db and api. Write qa/evidence/s13-fix-a.md.
