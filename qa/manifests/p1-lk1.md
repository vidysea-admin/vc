# Manifest - p1-lk1
**Contract:** design row LK1 (`qa/evidence/p1-briefs/p1-lang-kg-design-result.md`, commit 29dcb51, section 3 "Model chain"); decision D-105 (Q4 chain is a reusable seam any AI call opts into after its own eval; Q5 retryable failures go to the next hop, 400/401 and budget stops do not; chain order GLM then DeepSeek, Gemini Lite slot reserved); D-104; contract B6 (model by config), B13 (no live or paid call from tests). Source brief `qa/evidence/p1-briefs/p1-lk1-build.md`.
**Criteria:** (C1-C7 verbatim from the design row; C8 is the D-105 addition)
- C1 Mocked-fetch tests: GLM timeout, 5xx, 429, malformed JSON, wrong-shape output each fail over to hop 2.
- C2 400/401 do not (fail over).
- C3 Single pass.
- C4 Deadline honoured.
- C5 Budget stop does not fail over.
- C6 Usage hook gets actual counts or `unreported`.
- C7 Existing LiteLLM chain tests unchanged and green.
- C8 (D-105) `VC_TEXT_CHAIN` is the chain config: `default` is `ollama:glm-5.3-flash,ollama:deepseek-v4.1-flash`; a `gemini:` entry is refused (slot reserved, LK3 held), not ignored; the chain is an opt-in seam (`loadTextChainConfig(env) ?? loadProviderConfig(env)`) and is NOT reachable through `VC_LLM_PROVIDER`, so the concern classifier and scribe, which derive from that config, never inherit it (D-105 Q4).
**Goal task:** none
**Date:** 2026-10-19
**Status:** ready-for-check
**Fix cycle:** 0 of max 2
**Policy-Version:** proportional-verification/2026-10-19.16
**Tier:** M (one source file plus its tests; provider seam that will carry real student text once enabled; no production data, no network, no paid call, no auth or tenancy change)
**Dual check:** no (no auth, tenancy or production-write trigger; the chain is off unless `VC_TEXT_CHAIN` is set and nothing in apps/ reads it yet)
**Persona walk:** skip (no human screen)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent (maker/builder p1-lk1)
**Executor rationale:** a single-file provider change (config loader, retry whitelist, failover option, factory); splitting would only add merge work.

## What changed
Branch `p1/lk1`, base `ae48596`. Code and tests commits `9b4b032` and `27fdb9e` (head `27fdb9e` before this manifest commit). Edited in place; no new module besides this manifest. Tests are appended to the existing `packages/providers/tests/ollama.test.ts` (its subject already is the Ollama adapter); no other test file changed.
- `packages/providers/src/index.ts`:
  - `ProviderConfigSchema` gets an `ollama` variant (`chain` of priced hops, `apiKey`, optional `baseUrl`, `maxOutputTokens`, `hopTimeoutMs`, `deadlineMs`).
  - New `loadTextChainConfig(env)` reads `VC_TEXT_CHAIN` (+ `VC_TEXT_CHAIN_HOP_TIMEOUT_MS`, `VC_TEXT_CHAIN_DEADLINE_MS`, `OLLAMA_API_KEY`, `OLLAMA_BASE_URL`, the existing price and max-output env); prices every hop at load (unknown price refused, never zero); constants `TEXT_CHAIN_DEFAULT_SPEC`, `TEXT_CHAIN_DEFAULT_DEADLINE_MS` (12000), `TEXT_CHAIN_DEFAULT_HOP_TIMEOUT_MS` (8000). `loadProviderConfig` is untouched.
  - `isRetryableProviderError`: `OllamaTimeoutError`, `OllamaMalformedResponseError`, `OllamaNetworkError`, `OllamaHttpError` 429 or >=500 are retryable; `OllamaAbortedError`, `OllamaRefusedError`, other 4xx and unknown errors (a budget stop) are not.
  - `FailoverProviderOptions.singlePass` (attempt budget capped at `chain.length`, default off, so the LiteLLM chain is byte-for-byte as before); `FailoverExhaustedInfo.kind` so the exhaustion alert names the real provider (`gen_ai.system`) instead of always "litellm".
  - `createProvider` builds the `ollama` case: one `OllamaProvider` per hop (per-hop timeout, shared `beforeRequest` / `onUsage` hooks, injectable `fetchImpl`) under a `FailoverProvider` with `singlePass`, product deadline, and no inter-hop backoff (the next hop is a different model). New `CreateProviderDeps` fields: `beforeRequest`, `onUsage`, `onExhausted`, `fetchImpl`.
- Not changed: `apps/api` (see Not determined: the student-surface wiring), the concern classifier, the scribe, the LiteLLM path, `docs/`, `.claude/`, contracts.

## Verification scope
Round: 2 files, 8 criteria, est 25 min - TDD (red = import failure before the code, then green), providers package tests, typecheck of the four dependents, 10 falsification mutants in a copy (lock waits dominate)
Affected tests / full-suite trigger: all of `packages/providers/tests/*.test.ts` (ollama, failover, litellm, index, rules, live); typecheck of providers, engine, apps/api and apps/web (they import the changed `ProviderConfig` union). No full-suite run by the builder; no full-suite trigger (tier M, opt-in code path, nothing reads `VC_TEXT_CHAIN` yet).
Base / checked state: `p1/lk1` at `27fdb9e`.
Tests[C1]: `ollama.test.ts` "p1-lk1 C1: GLM timeout | HTTP 500 | HTTP 503 | HTTP 429 | malformed JSON | wrong-shape output | network error fails over to hop 2 (deepseek) ..." (7 tests) - each asserts the wire order [glm, deepseek], deepseek's answer is returned and no exhaustion alert fires.
Tests[C2]: "p1-lk1 C2: HTTP 400 | 401 | 403 | 404 on hop 1 does NOT fail over ..." (4 tests) - assert `OllamaHttpError` with that status surfaces and only GLM was called; "p1-lk1 C8: isRetryableProviderError whitelist ..." asserts 400/401/403/404/422 non-retryable, 429/500/599, timeout, network, malformed retryable, abort and refusal not.
Tests[C3]: "p1-lk1 C3: single pass ..." - both hops fail retryably: wire order is exactly [glm, deepseek] (a second lap would show glm again), `AiUnavailableError`, one alert with `attempts: 2`.
Tests[C4]: "p1-lk1 C4: the product deadline is honoured ..." - 120 ms deadline over 5000 ms hop timeouts and hanging hops: rejects `AiUnavailableError` in under 2 s, `lastErrorName` is `FailoverDeadlineExceededError`, the in-flight request's signal was aborted; "p1-lk1 C4b" asserts the defaults 12000 and 8000 and the env overrides.
Tests[C5]: "p1-lk1 C5: a budget stop (beforeRequest throws) does NOT fail over ..." - the thrown error surfaces and zero requests are sent (hop 2 never tried); "p1-lk1 C7: a caller abort is not failed over" asserts `OllamaAbortedError` and only GLM called.
Tests[C6]: "p1-lk1 C6: the per-hop usage hook ..." - hop 1 answers 200 with unusable content and `prompt_eval_count: 900, eval_count: 40`, hop 2 answers without counts: hook called twice, first `reported` 900/40 for glm, second `unreported` with no token figure for deepseek, and the final answer is deepseek's.
Tests[C7]: the existing `failover.test.ts`, `litellm.test.ts`, `index.test.ts` and `live.test.ts` files are unmodified (`git diff ae48596 --stat` lists only `index.ts` and `ollama.test.ts`) and run green in Pre-check[C7].
Tests[C8]: "p1-lk1 C9: loadTextChainConfig ..." (absent/blank undefined, order, price from table, base URL, missing key refused without echoing it, unknown model price refused, `gemini:` refused, bare or empty entry refused, bad numbers refused); "p1-lk1 C12: VC_TEXT_CHAIN=default ..." (constant and parsed order); "p1-lk1 C10: ... VC_LLM_PROVIDER=ollama is still refused by loadProviderConfig"; "p1-lk1 C11: the chain provider never exposes the key in toString/inspect".
Pre-check[C1]: 27fdb9e `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C D:/vc/.worktrees/lk1/packages/providers exec tsx --test tests/ollama.test.ts tests/failover.test.ts tests/litellm.test.ts tests/index.test.ts tests/rules.test.ts tests/live.test.ts` -> green: 180 tests, 180 passed, 0 failed (ollama.test.ts alone 50 tests, includes 7 for C1)
Pre-check[C2]: 27fdb9e same command as Pre-check[C1] -> green: 180 passed, 0 failed
Pre-check[C3]: 27fdb9e same command as Pre-check[C1] -> green: 180 passed, 0 failed
Pre-check[C4]: 27fdb9e same command as Pre-check[C1] -> green: 180 passed, 0 failed
Pre-check[C5]: 27fdb9e same command as Pre-check[C1] -> green: 180 passed, 0 failed
Pre-check[C6]: 27fdb9e same command as Pre-check[C1] -> green: 180 passed, 0 failed
Pre-check[C7]: 27fdb9e same command as Pre-check[C1] -> green: 180 passed, 0 failed (failover + litellm + index + rules + live, unmodified: 130 tests); earlier at 9b4b032 the first five files ran 109 passed and live.test.ts 70 passed
Pre-check[C8]: 27fdb9e same command as Pre-check[C1] -> green: 180 passed, 0 failed
Pre-check[typecheck]: 27fdb9e same lock, `tsc --noEmit` in packages/providers, packages/engine, apps/api, apps/web -> exit 0 each; a throwaway tsconfig that also included `tests/ollama.test.ts` typechecked clean at 9b4b032 (file deleted afterwards)
Red-before: the new tests were written first; against the unchanged source `ollama.test.ts` failed at import (`The requested module '../src/index.js' does not provide an export named 'TEXT_CHAIN_DEFAULT_DEADLINE_MS'`, 0 tests run). The first green run then had 48 of 49 passing; the one failure (C7) was a test-harness error (the mock aborted the signal before the hang helper had registered its listener) and was fixed in the test, not the source. The C12 default-spec test was added with its code in one step; its red is the Falsification[C8a] run.
Falsification[C1]: in a copy (`packages/providers/fals-lk1`, src + tests, deleted afterwards) the four Ollama error classes were made non-retryable -> `ollama.test.ts` 49 tests, 40 passed, 9 FAILED (the six C1 failover tests incl. malformed, network, timeout, 429, 500, 503, plus C3, C6 and C8).
Falsification[C2]: same copy, every `OllamaHttpError` made retryable -> 49 tests, 44 passed, 5 FAILED (the four C2 status tests and C8).
Falsification[C3]: same copy, `singlePass: true` -> `false` in the factory -> 49 tests, 48 passed, 1 FAILED (C3 single pass).
Falsification[C4]: same copy, product deadline replaced by the 45 s LiteLLM default -> 49 tests, 48 passed, 1 FAILED (C4 deadline, took 10 s).
Falsification[C5]: same copy, a thrown `BudgetStop` made retryable -> 49 tests, 48 passed, 1 FAILED (C5 budget stop).
Falsification[C6]: same copy, the `onUsage` hook no longer passed to the hops -> 49 tests, 48 passed, 1 FAILED (C6 usage hook).
Falsification[C7]: same copy, `singlePass` made the default -> `failover.test.ts` + `litellm.test.ts` + `index.test.ts` 49 tests, 45 passed, 4 FAILED (the T-032 deadline-between-attempts test, the T-045 schema-failure test, the attempt-budget test and the real-timers backoff test), so the existing LiteLLM chain tests do guard the default behaviour.
Falsification[C8]: same copy, (a) default chain order flipped -> `ollama.test.ts` 50 tests, 49 passed, 1 FAILED (C12); (b) `gemini:` entries no longer refused -> 50 tests, 49 passed, 1 FAILED (C9).
Restored: every mutant ran in a fresh copy re-made from the committed `src` and `tests`; the copy was deleted at the end and `git status` in the worktree was clean afterwards (the real tree was never mutated).
Metrics: start=2026-10-19T16:07:02+05:30 end=2026-10-19T16:27:32+05:30 builder_min=20 wall_min=20 agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=1 mutations=10 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.16 check_s=unavailable mutants=10 defects_unit=0 defects_6c=0

## Not determined / for the owner
- Student-surface wiring is not done. `apps/api/src/index.ts:262` builds one provider with `createProvider(loadProviderConfig(env))` and hands the same object to the tenant wiring (`:375`), the anonymous route (`:289`) and chat (`:406`), which also reaches the counsellor scribe. Switching that line to `loadTextChainConfig(env) ?? loadProviderConfig(env)` would move the scribe onto the chain too, which D-105 Q4 does not allow until its eval passes. A split (student provider vs. scribe provider) is a multi-file change in `apps/api` and `packages/engine`, outside this unit's file list; the seam is ready for it. Proposed target: `apps/api/src/index.ts` `startApi` (`httpSetup.provider`) plus the call sites that take `provider`.
- The `VC_TEXT_CHAIN_REAL_STUDENTS` processor-register flag the design mentions (privacy section) is not part of the LK1 acceptance and is not built; the chain is inert until something calls `loadTextChainConfig`, but once wired for real student text the B13 processor register applies (D-104 Result).
- Per-hop failover reasons (text-free counters for the `llm_usage` ledger) are not emitted; only the exhaustion alert exists. The usage hook covers token counts. A small `onFailover` hook can be added in the unit that writes the ledger.
- Timeouts are total per hop, not first-token (streaming is LK2). Defaults 8000 ms per hop and 12000 ms overall are the builder's reading of the design's "suggest 12 s"; GLM's non-streamed p95 was 9.3 s, so with these defaults a slow GLM answer is cut at 8 s and DeepSeek gets the remaining time. Chain order is unchanged from D-105; the LK9 probe decides any flip.
- `concernClassifierProviderConfig` (`packages/engine/src/guards/concern-classifier.ts:181`) spreads any non-litellm base config and overrides only `model`; given an `ollama` chain config it would keep the chain. This cannot happen today because `loadProviderConfig` never returns an `ollama` config (test C10), but a future caller that passes a chain config there would silently keep the chain. Not touched (outside the file list).
- No real Ollama call was made (mocked fetch only). The senior-software-engineer review required by the lifecycle was not run by this builder (the writer does not review its own output). Line endings: `ollama.test.ts` keeps its working-tree endings; git warns LF to CRLF on that file.
