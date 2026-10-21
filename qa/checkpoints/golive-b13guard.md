# golive-b13guard evidence identity (checker, cycle 0)
Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
Result: FAIL; qa/verdicts/golive-b13guard.md
Candidate: 9e9b749 (git archive HEAD copy, throwaway dir outside the worktree; node_modules junctioned to D:/vc, not hashed)
Commands: `node --import tsx --test tests/go-live-gate.test.ts` (apps/api). HEAD: 14/14 green. B13 signed copy: 12 pass, 1 fail, 1 skipped. Guard removed + signed: same failure. CLI student-routes with signed B13: ALLOWED exit 0.
Inputs: apps/api/tests/go-live-gate.test.ts blob 2646806; qa/gates/p1-u0-amendment-signatures.md line 13 flipped in the copy only.
No full suite. Original checker: claude-sonnet-subagent.

## Cycle 1 (repair check) - 2026-10-21T17:24:19+05:30
Result: PASS; qa/verdicts/golive-b13guard.md
Candidate: aeb90f2 (test blob 3e2255e; git archive HEAD copies c1A/c1B/c1C in the checker scratchpad, node_modules junctioned to D:/vc, not hashed)
Commands: `node --import tsx --test tests/go-live-gate.test.ts` (apps/api). A (B13 PENDING): 14 pass. B (B13 SIGNED in copy): 13 pass, 1 skipped, 0 fail. C (signed, guard line replaced by `{`): 12 pass, 1 fail (CLI test, test.ts:318 status 0 vs 1), 1 skipped.
Inputs: apps/api/tests/go-live-gate.test.ts blob 3e2255e; qa/gates/p1-u0-amendment-signatures.md line 13 flipped in copies B and C only.
No full suite. Original checker: claude-sonnet-subagent (cycle 1).
