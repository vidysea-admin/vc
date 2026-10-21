# golive-b13guard evidence identity (checker, cycle 0)
Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
Result: FAIL; qa/verdicts/golive-b13guard.md
Candidate: 9e9b749 (git archive HEAD copy, throwaway dir outside the worktree; node_modules junctioned to D:/vc, not hashed)
Commands: `node --import tsx --test tests/go-live-gate.test.ts` (apps/api). HEAD: 14/14 green. B13 signed copy: 12 pass, 1 fail, 1 skipped. Guard removed + signed: same failure. CLI student-routes with signed B13: ALLOWED exit 0.
Inputs: apps/api/tests/go-live-gate.test.ts blob 2646806; qa/gates/p1-u0-amendment-signatures.md line 13 flipped in the copy only.
No full suite. Original checker: claude-sonnet-subagent.
