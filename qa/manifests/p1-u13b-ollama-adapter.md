# Manifest — p1-u13b-ollama-adapter
**Contract:** D-100 (G-REAL answered 2026-10-19: paid real-model eval runs via Ollama-hosted GLM 5.3 Flash and DeepSeek 4.1 Flash, Gemini later); spec A24 (USD 50 per run / USD 200 per month, spend recorded per run); contract B13 (no live call, no paid call from tests), B11 (no key in logs). Source brief `qa/evidence/p1-briefs/p1-u13b-ollama-adapter.md`.
**Criteria:**
- C1 One adapter implements the existing `LlmProvider` interface against Ollama's HTTP API with a Bearer key (`OLLAMA_API_KEY`, `OLLAMA_BASE_URL` default `https://ollama.com`, model id from `VC_REAL_MODEL=ollama:<id>`).
- C2 The REAL runners (`run-h2h`, `run-probes`, `run-latency`, `run-live`, `eval:kb --real`, all via `runRealPath`) can select `ollama:<id>`; the default (unset or `gemini`) is unchanged.
- C3 The A24 caps apply to Ollama runs: each request is charged BEFORE it is sent, using a per-model price; an unknown price refuses the REAL run (never zero).
- C4 A missing `OLLAMA_API_KEY` (or unknown price, or junk `VC_REAL_MODEL`) refuses before any run starts (no ledger line, no request); the key is never logged.
- C5 Response and error handling: JSON parse, Zod output schema, HTTP error, network error, timeout and caller abort are typed errors.
**Goal task:** none
**Date:** 2026-10-19
**Status:** ready-for-check
**Fix cycle:** 0 of max 2
**Policy-Version:** proportional-verification/2026-10-18.15
**Tier:** L (config/provider seam; pins the budget gate for paid runs)
**Dual check:** no (no security, auth, tenancy or production-write trigger: tests use a mocked fetch, no network, no production data)
**Persona walk:** skip (no human screen)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent (maker/builder p1-u13b-ollama)
**Executor rationale:** one coherent change across the provider seam and the one shared REAL-runner entry; two files of product code, two of tests.

## What changed
Branch `p1/u13b-ollama`, base `08b23f0` (main). Head `9bc857b` (code and tests); the manifest is a later commit.
- `packages/providers/src/index.ts` (edited in place, new section before "Factory"): `ProviderKind` gains `"ollama"`; `OllamaProvider` (POST `{base}/api/chat`, `stream:false`, `format:"json"`, `options.num_predict` cap, system+user messages, `Authorization: Bearer`, private `#apiKey`); typed errors `OllamaRefusedError/HttpError/TimeoutError/AbortedError/MalformedResponseError/NetworkError`; `OLLAMA_PRICE_TABLE_USD_PER_MTOK` (**[ASSUMPTION - UNVERIFIED]** ids `glm-5.3-flash`, `deepseek-4.1-flash`, placeholder USD 1 in / 4 out per MTok, conservative) plus the `OLLAMA_PRICE_USD_PER_MTOK="<in>,<out>"` override; `parseRealModel`; `prepareOllamaProvider(env)` (validates selection, key and price up front, returns a factory or `undefined` for the default). `beforeRequest(estimate)` is called after authorization and before `fetch`; the estimate is an UPPER BOUND (one token per prompt character + the full `num_predict` output), so spend is never under-counted. Spend is not trued-up from the response (append-only ledger; over-counting is the safe side).
- `packages/engine/evals/run-eval.ts` `runRealPath` / `RunnerDeps` (edited in place): validates the selection before `executeReal` (so a bad config touches no ledger), then passes the body `realBody(run, provider?)`; the provider's `beforeRequest` is `run.charge(estimate.estimatedCostUsd)`, so a `BudgetExceededError` stops the request unsent and the run ends `aborted-budget` with the abort report. Default: `provider` is `undefined` and nothing else changes. `fetchImpl` in `RunnerDeps` is for tests only.
- Tests: `packages/providers/tests/ollama.test.ts` (13 tests, mocked fetch), and 4 tests x 5 runners + 1 monthly-cap test appended to `packages/engine/evals/p1-runners.test.ts`.
No production code path outside the REAL eval runners selects this provider; `createProvider`, `ProviderConfigSchema` and the failover chain are untouched.

## Verification scope
Round: est 45 min - read the provider seam and budget guard, one adapter, one shared wiring edit, 13+21 tests, 10 falsifications, full engine + providers suites and `pnpm -r typecheck` (lock waits dominated)
slow-plan: the round cannot be smaller: the shared test lock serialises every run, each falsification re-runs two test files, and the engine suite alone takes about 95 s.
Affected tests / full-suite trigger: providers whole package and engine whole package (the shared `run-eval.ts` is used by all five REAL runners), plus `pnpm -r typecheck`.
Base / checked state: `p1/u13b-ollama` at `9bc857b`.
Tests[C1]: providers tests/ollama.test.ts "request shape: POST {base}/api/chat, Bearer key, model, system+user messages, stream off, JSON format"; "custom base URL is used and a trailing slash is tolerated" — the wire shape (URL, auth header, body) and the base-URL handling are exactly what the adapter adds.
Tests[C2]: providers tests/ollama.test.ts "selection: unset / empty / gemini keep the default ..."; engine evals/p1-runners.test.ts, for each of the 5 runners, "U13b VC_REAL_MODEL=ollama:<id> hands the body an Ollama provider ..." and "U13b default unchanged ..." — selection is decided in parseRealModel/prepareOllamaProvider and consumed in runRealPath, which all five runners share.
Tests[C3]: providers tests/ollama.test.ts "budget: beforeRequest gets an upper-bound estimate BEFORE fetch ..."; "prepareOllamaProvider: missing OLLAMA_API_KEY and unknown-price models are refused ..."; engine evals/p1-runners.test.ts, for each runner, "U13b the USD 50 per-run cap stops an Ollama run before the request that would pass it is sent", and "U13b the USD 200 per-month cap also stops Ollama runs across runs" — the charge-before-send hook, the price refusal and the engine caps are the three links of the budget chain.
Tests[C4]: providers tests/ollama.test.ts "constructor refuses a missing key and a non-positive or non-finite price"; "the key never appears in toString / JSON / inspect output"; engine evals/p1-runners.test.ts, for each runner, "U13b missing OLLAMA_API_KEY, unknown model price or a junk VC_REAL_MODEL refuse before any run (no ledger, no request)" and the key-not-in-reports assertion in "... charged to the ledger BEFORE it is sent" — each refusal path is asserted to leave the ledger and the network untouched, and the key out of every artifact.
Tests[C5]: providers tests/ollama.test.ts "response parsing ...", "error path ...", "timeout path ...", "caller signal ...", "authorization preflight refusal sends nothing and charges nothing" — one test per failure class the adapter maps to a typed error.
Pre-check[C1]: 9bc857b VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C D:/vc/.worktrees/p1-u13b-ollama/packages/providers test (TMP/TEMP under D:/vc/.tmp/u13b) -> green: 143 passed, 0 failed (13 of them in ollama.test.ts)
Pre-check[C2]: 9bc857b same lock, pnpm -C packages/engine exec tsx --test evals/p1-runners.test.ts evals/budget.test.ts -> green: 73 passed, 0 failed
Pre-check[C3]: 9bc857b same command as Pre-check[C2] -> green: 73 passed, 0 failed
Pre-check[C4]: 9bc857b same command as Pre-check[C2] -> green: 73 passed, 0 failed
Pre-check[C5]: 9bc857b same command as Pre-check[C1] -> green: 143 passed, 0 failed
Wide-set (engine package whole, run once more as the shared-entry backstop): 9bc857b same lock, pnpm -C packages/engine test -> green on the rerun: 1357 tests, 1312 passed, 0 failed, 45 skipped. The first full run had 1 failure, `tests/guard-crisis.test.ts` "T-033 ... stay linear" (timing ratio 4.01 under load, a file this unit does not touch); `tsx --test tests/guard-crisis.test.ts` alone then passed 389/389 and the whole suite passed on the rerun.
Pre-check[typecheck]: 9bc857b same lock, pnpm -C . -r typecheck -> exit 0 (9 workspace projects)
Metrics: start=2026-10-19T10:43:00+05:30 end=2026-10-19T10:58:00+05:30 builder_min=unavailable wall_min=unavailable agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=1 mutations=10 survivors_final=0 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-18.15 lane=normal check_s=unavailable mutants=10 defects_unit=0 defects_6c=0

## Capability coverage (one falsifying edit per criterion, made in a throwaway detached worktree of `9bc857b` and discarded; the bound tree was never edited)
Each row: the edit, then the failing counts. Baseline: providers ollama.test.ts 13/13, engine p1-runners.test.ts 51/51.
| id | crit | falsifying edit | result |
|---|---|---|---|
| M1 | C1 | drop the `Authorization: Bearer` header | providers 1 fail of 13 |
| M2 | C3 | remove the `beforeRequest` call (no charge before the request) | providers 2 fail of 13; engine 11 fail of 51 |
| M3 | C3 | unknown price falls back to USD 1/1 | providers 1 fail of 13 |
| M4 | C4 | missing `OLLAMA_API_KEY` defaulted to a placeholder | providers 1 fail of 13 |
| M5 | C2 | an unset `VC_REAL_MODEL` selects ollama | providers 1 fail of 13 |
| M6 | C3 | `runRealPath` hook does not charge (`() => {}`) | engine 11 fail of 51 |
| M7 | C4 | selection validated inside the body, after the ledger `start` line | engine 5 fail of 51 |
| M8 | C5 | an internal timeout reported as a caller abort | providers 1 fail of 13 |
| M9 | C4 | key interpolated into `toString()` | providers 1 fail of 13 |
| M10 | C5 | model output returned without the Zod schema | providers 1 fail of 13 |
All 10 killed, 0 survivors.

## Not determined / for the owner
- Exact Ollama model ids and prices. The table ids (`glm-5.3-flash`, `deepseek-4.1-flash`) and the USD 1 / 4 per MTok figures are placeholders [ASSUMPTION]; the real ids (Ollama cloud names may carry a tag such as `:cloud`) and the real per-token price must be set before the first paid run, either in `OLLAMA_PRICE_TABLE_USD_PER_MTOK` or with `OLLAMA_PRICE_USD_PER_MTOK="<in>,<out>"`. Ollama may also bill by plan rather than per token; if so the per-token price is only a budget proxy.
- The runners' REAL bodies are still not wired (`RealNotWiredError`, U13b proper). This unit only supplies the selected, budget-charging provider to `realBody(run, provider)`. The default Gemini provider is still the unwired stub.
- Env vars Umesh must set for an Ollama REAL run: `VC_G_REAL=1` (as before), `VC_REAL_MODEL=ollama:<model-id>`, `OLLAMA_API_KEY=<key>`; optional `OLLAMA_BASE_URL` (default `https://ollama.com`) and `OLLAMA_PRICE_USD_PER_MTOK`. Each paid run still needs its own go from Umesh (g-real.md per-use rule).
- Worst-case per-request charge is about USD 0.01 at the placeholder price (2048 output tokens max); the USD 50 per run cap is therefore reached only by thousands of requests, but the cost is an upper bound, not the metered bill.
