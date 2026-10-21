# Brief: You are /checker running a Mode A feature check. Read your full protocol first: C:/Users/Lenovo/.claude/skills/checker/SKILL.md
Check with NO other context (no builder reasoning):
  Criteria: the "Fix" and "Tests" bullets of qa/evidence/p1-briefs/golive-json-robust.md (C1 fence/unquoted-key parse in LiteLlmProvider; C2 one bounded retry on LiteLlmMalformedResponseError in classifyConcern, then fail closed to possible/unavailable, never "clear"; C3 errorName recorded).
  Manifest: D:/vc/.worktrees/golive-json-robust/qa/manifests/golive-json-robust.md
  Project: D:/vc/.worktrees/golive-json-robust (bound)
  Verdict path: D:/vc/.worktrees/golive-json-robust/qa/verdicts/golive-json-robust.md
  Checkpoint: D:/vc/.worktrees/golive-json-robust/qa/checkpoints/golive-json-robust.md
  Tier: M (shared provider module on the safety path). Policy: proportional-verification/2026-10-19.17. Budget: wall 10 min, agent-minutes 30.
  Base: 5305e82. Integration branch: main. Cycle: 0.
Focus (safety): can any malformed or adversarial model output now parse into a "clear" that it would not have before (e.g. repair turning garbage into a valid schema object; key-quoting changing string values; fence stripping accepting trailing junk)? Does the retry stay bounded (exactly one) and respect the abort signal/deadline? Does every other path still fail closed? Callers of LiteLlmProvider.generate outside the classifier still behave the same on valid JSON.
Run the manifest's test commands yourself (touched test files + typecheck), no full suite, no live calls (deterministic only). One falsification per criterion in a copy outside the worktree. Kill only PIDs you start; never by image name; never PID 36944. No pushes.
Write the verdict (Cycle checked: 0, Metrics line), commit it on wave/golive-json-robust with a narrow pathspec. Return the verdict word + <=10 lines.
