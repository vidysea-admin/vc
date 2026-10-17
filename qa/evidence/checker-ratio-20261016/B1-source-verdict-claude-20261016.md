B1_SOURCE_VERDICT: PASS

Checked 2026-10-16 (Claude Sonnet checker, no sandbox limits).
- Source hash: sha256 of qa/evidence/checker-ratio-20261016/isolated/tools/tick.mjs = 5d20aeb61ebb5636e0b80d1ee54467330e0f1c2ad537aad4a5701c18dc6b5ed9 (matches expected).
- Command run once from D:/vc: node --test --test-name-pattern="native final artifact capture|rejecting lost-plan-session|rejecting final-maker-session|generic execution cannot" qa/evidence/checker-ratio-20261016/isolated/tools/tests/tick-modes.test.mjs
  Result: exit 0, tests 4, pass 4, fail 0, cancelled 0, skipped 0 (44s). Log: C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/b1-run.txt
- Hostile variant (scratch copy C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/hostile, isolated source untouched; copy hash 4f0941e7...): in the copy, tick.mjs line 2107 (original maker independent of plan reviewers) and line 2506 (native final reviewer cannot be original maker session) were changed to deliveryNeed(true, ...), removing both rejections. Same 4-test command: exit 1, pass 2, fail 2. Failing: "rejecting lost-plan-session" and "rejecting final-maker-session", both "AssertionError: Missing expected exception." Log: C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/b1-hostile-run.txt
- Conclusion: the controls execute and can fail. The other 2 controls (native final artifact capture, generic execution cannot inject) were not exercised by this particular mutation.
