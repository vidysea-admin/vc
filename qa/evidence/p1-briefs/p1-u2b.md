# P1 U2b — repair of p1/u2 (KB read tools) before its checker
Role: maker/builder. Worktree: S/p1-u2 (branch p1/u2, head ac67455), S = C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad.
Never touch D:\vc working tree (dirty WIP). Never edit .claude/**. Never edit qa/contracts. Dispatch no checker.
Tests: `bash D:/vc/scripts/vc-testlock.sh pnpm -C <S>/p1-u2/mcp/university-kb test` (shared lock; long waits are normal, keep waiting) + typecheck.
TDD: failing test first for each fix.

Fixes (from a fresh ai-engineer review, Warning):
1. "No coverage" must be no_sourced_answer, not unavailable. kb-client.ts:578-587 turns zero internal+web citations into unavailable/uncited before the serve rule. Real KB: verdict "incorrect" => internal []. Move the uncited check so it applies only when verdict=="correct" (a correct answer with zero internal sources is still withheld); any other combination maps to no_sourced_answer per spec G6. Make kb-fixture/ask-fallback-failed.json realistic (verdict incorrect, insufficient_coverage true, internal [], web []) and add a test asserting status no_sourced_answer. Outages (network/5xx/schema) stay unavailable.
2. search_kb / get_session: drop `speakerLabel` (set absent) unless sourceKind is seminar or toc. Applies to both profiles. Update the test at kb-tools.test.ts ~227 (intended change: label now passes only for seminar/toc) and add a whatsapp + unknown case.
3. Served ask_knowledge_base output carries `sourceKind: "unknown"` (restricted by default) at the answer level; test it.
4. ask_knowledge_base `query`: max length 1000, same as search_kb; test it.
5. Search hit cross-check: drop (and count, like null hits) a hit whose turn._id != turnId or session._id != sessionId; test it.
6. Document in the manifest that the 4th serve clause (>=1 internal source) is stricter than the spec on purpose.

Then: append a Fix-cycle: 1 section to qa/manifests/p1-u2-*.md with Repair base: ac67455, the repair SHA, one Pre-check[<id>] line per changed criterion on the final SHA, one named falsification per changed criterion (green before/red after/restored, in a copy), Policy-Version: proportional-verification/2026-10-15.12, Status: ready-for-check. Commit on p1/u2 (end commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`). Report: SHA, test counts, falsification table, in under 25 lines.
