# Senior review (read-only) — p1/u13b-ollama vs main

Worktree D:/vc/.worktrees/p1-u13b-ollama, code commit 9bc857b. Review `git -C D:/vc/.worktrees/p1-u13b-ollama diff main...HEAD -- packages`: packages/providers/src/index.ts (OllamaProvider, price table, parseRealModel, prepareOllamaProvider), packages/engine/evals/run-eval.ts (runRealPath, RunnerDeps), and the new tests.
Focus: secret handling (API key leakage), budget-cap bypasses (price parsing, NaN/0/negative, charge-before-send correctness, retries double-spend or skip charge), default-path regressions for Gemini, error/timeout handling, Ollama /api/chat request/response shape correctness, over-engineering. Read-only: do not edit, run no network calls. Return Approve / Warning / Block with file:line evidence at >80% confidence.
