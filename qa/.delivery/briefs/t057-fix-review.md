# t057-fix-review

Read-only senior review of the main session fixes made on 2026-10-28 (never edit, never start/stop services, never touch DBs):
1. packages/engine/src/guards/concern-classifier.ts ~lines 310-330: Gemini malformed-reply retry (GeminiMalformedResponseError retried once like LiteLlmMalformedResponseError) and Gemini error names added to the errorName allow-list. New test in packages/engine/tests/concern-classifier.test.ts ("T-057 W1"), MalformedThenValidProvider errorName param.
2. packages/engine/src/cards/nodes.ts:189 AI_DOWN_ERRORS now includes GeminiHttpError/NetworkError/TimeoutError/MalformedResponseError (Aborted excluded on purpose).
3. D:/vc/.worktrees/vc-vidysea-backend/app/api/v1/student/ai_counsellor_router.py:155-165 grade fallback now (SELECT p.grade + 5 FROM pathlynks_student_snapshot p WHERE p.vidysea_user_id = s.id AND p.grade IS NOT NULL ...); grade is INTEGER per migration 0067.
4. D:/vc/.worktrees/vc-vidysea-backend/app/core/security.py:69 age parse: isascii() and isdecimal() and int(...) <= 120 else 18.
Check correctness, fail-closed safety (a benign student must not see the crisis reply on one malformed reply; a real crisis must still be caught), test quality (would the W1 test fail without the fix? verify by reasoning or by temporarily-not-editing: just read), SQL safety (read-only, owner-bound, no injection).
Re-run: node --import tsx --test packages/engine/tests/concern-classifier.test.ts ; the cards tests; and in vc-vidysea-backend: python -m pytest tests/test_student_fixes.py -k vc_ -q.
Return Approve / Warning / Block with file:line evidence, most severe first. Do not write files.
