# /maker build subagent — U13b: wire the REAL text runner bodies to the Ollama provider (mock-tested, NO paid call)

Authority D-100. Keep it small; no over-engineering. Worktree: `git -C D:/vc worktree add D:/vc/.worktrees/p1-u13b-wire -b p1/u13b-wire main` (main = d7319b9, has the Ollama adapter).

## Scope
1. In packages/engine/evals/run-eval.ts and the text runners (run-h2h A14, run-probes A4, run-latency A8, eval:kb --real A2b): supply real bodies that, when `provider` is defined (VC_REAL_MODEL=ollama:<id>), run the runner's existing fixture set through `provider` and score with the runner's existing scorer/report. Every model call goes through the passed `provider` (charge hook). If a body is asked to run REAL with provider undefined (Gemini selected), keep the current RealNotWiredError — Gemini comes later. run-live (A10 voice) stays unwired.
2. Before-first-paid-run fixes in packages/providers/src/index.ts (edit in place): ISS-273 keep the abort timer until `res.json()` resolves; ISS-274 max output tokens configurable (env `OLLAMA_MAX_OUTPUT_TOKENS`, positive int, default 2048); ISS-271 price floor (refuse prices below 0.01 USD/MTok); ISS-272 trim the key and refuse whitespace-only; ISS-270 input estimate = UTF-8 byte length.
3. Inputs: synthetic/anonymised fixtures only (B13). Never production student text.
4. TDD with mocked fetch only. No network, no paid call. Tests via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C packages/providers test` and the engine evals tests you touch; `pnpm -r typecheck` exit 0. TMP/TEMP on D:. Long lock waits are normal; wait.
5. 1 falsification per criterion in a copy (never the bound tree).
6. Manifest qa/manifests/p1-u13b-wire-real.md (current Policy-Version, criteria, Tests[<id>], Pre-check[<id>], tier L config/provider, `Dual check: no`), `Status: ready-for-check`, `tick.mjs --lint-manifest` exit 0. Narrow-pathspec commits. No push/merge. No edits to .claude/** or .env.
Report: head sha, files, test counts, the exact command Umesh would run for each paid runner (with env vars), and an estimated max cost per run at the placeholder prices.
