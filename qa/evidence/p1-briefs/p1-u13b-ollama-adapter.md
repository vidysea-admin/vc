# /maker build subagent — U13b prep: Ollama-hosted model adapter (mock-tested, NO paid calls)

Authority: D-100 (G-REAL answered 2026-10-19). Keep it small; no over-engineering.
Worktree: create `git -C D:/vc worktree add D:/vc/.worktrees/p1-u13b-ollama -b p1/u13b-ollama main`.

## Goal
The REAL eval runners (U13b: run-h2h, run-probes, run-latency, eval:kb --real) can target Ollama-hosted API-key models (GLM 5.3 Flash, DeepSeek 4.1 Flash) in addition to Gemini, selected by env/config.

## Do
1. Read packages/providers/src (how Gemini text generation is wired, the provider interface, budget/spend recording per spec A24, tests/budget-cap.test.ts) and where the REAL runners pick a provider (packages/engine evals). Add ONE adapter that implements the existing text-provider interface against Ollama's HTTP API with a Bearer API key: env `OLLAMA_API_KEY`, `OLLAMA_BASE_URL` (default `https://ollama.com`), model id from config/env (e.g. `VC_REAL_MODEL=ollama:<model-id>`). Use fetch; no new dependency unless the repo already has one for this.
2. Wire selection so the REAL runners can choose `ollama:<id>` or the existing Gemini; default unchanged (Gemini). The budget cap (USD 50/run, 200/month) must apply to Ollama runs too: spend recorded per run with a per-model price table entry (put prices as config with an [ASSUMPTION] comment; unknown price → refuse to run REAL, never assume zero).
3. Missing OLLAMA_API_KEY → clear error before any run. Never log the key.
4. TDD with a mocked fetch only: request shape (auth header, model, messages), response parsing, error/timeout path, budget refusal, unknown-price refusal, selection default unchanged. NO real network call, NO paid call (each paid run needs a separate go from Umesh).
5. Tests only via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C packages/providers test` (and the engine evals tests you touch), TMP/TEMP on D:. Long lock waits are normal; wait. `pnpm -r typecheck` exit 0.
6. One falsification per criterion in a copy (never the bound tree).
7. Manifest qa/manifests/p1-u13b-ollama-adapter.md (pin current Policy-Version, criteria, Tests[<id>], Pre-check[<id>] lines, tier: L config/provider, `Dual check: no` — no security/auth/tenancy/prod-write trigger), `Status: ready-for-check`. `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --lint-manifest <manifest>` exit 0. Commit narrow pathspecs, never git add -A. Do not push or merge. Do not edit .claude/** or .env.
Report: branch head sha, files changed, test counts, the env vars Umesh must set, and anything you could not determine (e.g. exact Ollama model ids).
