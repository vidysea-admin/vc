# Manifest - p1-lk1w
**Contract:** design row LK1 follow-up (LK1 open risk 1, `qa/manifests/p1-lk1.md` "Not determined"); decision D-105 (Q4: a task moves onto the text chain only after its own eval; chain order is config); contract B13 (no live or paid call from tests). Source brief `qa/evidence/p1-briefs/p1-lk1w-build.md`.
**Criteria:**
- C1 The student chat turn uses the `VC_TEXT_CHAIN` chain when it is set, and the current provider when it is unset.
- C2 The anonymous route does the same; crisisGuard still runs first (a crisis text escalates with zero chain calls).
- C3 The scribe and the concern classifier keep the current provider: the chain is not reachable through the `VC_LLM_*` provider config, so the scribe base is still required from it.
- C4 `concernClassifierProviderConfig` refuses an ollama chain base (latent trap from the LK1 review).
- C5 A bad chain (no `OLLAMA_API_KEY`, unknown price) is a startup config error before anything connects; no key value in the message.
- C6 `.env.example` documents both chain orders (GLM first, DeepSeek first), names only, no key.
**Goal task:** none
**Date:** 2026-10-19
**Status:** checked-PASS (verdict 50a96a5)
**Fix cycle:** 0 of max 2
**Policy-Version:** proportional-verification/2026-10-19.17
**Tier:** M (one wiring site in apps/api plus one guard line in engine; no new module; chain stays off unless `VC_TEXT_CHAIN` is set; no production data, network or paid call)
**Dual check:** no (no auth, tenancy or production-write change)
**Persona walk:** skip (no human screen)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent (maker/builder p1-lk1w)
**Executor rationale:** a small wiring change across two files plus tests; splitting would only add merge work.

## What changed
Branch `p1/lk1w`, base `p1/lk1` head `5310e8f`. Code commits `1cfcd45`, `6b54f0f`, `e13f850` (tested head `e13f850`). All edits in place; no new module besides this manifest.
- `apps/api/src/index.ts` (`startApi`): `httpSetup` is now built from `httpBase` plus `studentProvider = textChain ? createProvider(textChain) : httpBase.provider`, with `textChain = loadTextChainConfig(env)`. `studentProvider` feeds `createAnonymousApi` and `createChatApi`. `httpSetup.provider` is unchanged and still feeds `createTenantWiring` (scribe) and the classifier base. Voice uses the injected Live provider and is untouched. A bad chain throws during config, before `client.connect()`.
- `packages/engine/src/guards/concern-classifier.ts` `concernClassifierProviderConfig`: throws on an `ollama` base instead of keeping the chain.
- `.env.example`: `VC_TEXT_CHAIN`, `OLLAMA_API_KEY`, `VC_TEXT_CHAIN_HOP_TIMEOUT_MS`, `VC_TEXT_CHAIN_DEADLINE_MS`, `OLLAMA_BASE_URL` (names only) and both chain orders in comments.
- Tests (appended to existing files): `packages/engine/tests/concern-classifier.test.ts` (+1), `apps/api/tests/chat-profile.test.ts` (+4, plus a `mustRefuseWith` helper that stops a wrongly started server), `apps/api/tests/anonymous-route.test.ts` (+2), `apps/api/tests/anonymous-fixtures.ts` (`CHAIN_ENV`, `stubOllamaFetch`: replaces `globalThis.fetch` for the invented Ollama host only, passes every other URL through; no network).

## Verification scope
Round: 7 files, 6 criteria - TDD, each affected test file run singly under the lock, typecheck of api and engine, 7 falsification mutants in a separate worktree copy (lock waits dominate)
Affected tests / full-suite trigger: the five api test files that call `startApi` (chat-profile, anonymous-route, index, server, voice-wiring) and engine `concern-classifier.test.ts`; typecheck of apps/api and packages/engine. No full suite run by the builder; no trigger (tier M, opt-in path).
Base / checked state: `p1/lk1w` at `e13f850`.
Tests[C1]: `chat-profile.test.ts` "LK1w: VC_TEXT_CHAIN set -> a student chat turn is answered by the chain..." (the Ollama URL `/api/chat` is hit, body model is `glm-5.3-flash`, the injected provider has 0 calls) and "...unset -> the student chat turn uses the current provider and nothing is sent to Ollama" (injected provider called, 0 Ollama calls).
Tests[C2]: `anonymous-route.test.ts` "LK1w: VC_TEXT_CHAIN set -> an anonymous question is answered by the chain...; a crisis text still escalates with zero model calls" and "...unset -> the anonymous route uses the current provider and nothing goes to Ollama".
Tests[C3]: `chat-profile.test.ts` "LK1w: VC_TEXT_CHAIN does not replace the scribe provider config..." (classifier injected so only the scribe base is read; chain env set, no `VC_LLM_PROVIDER`: startApi refuses naming `VC_LLM_PROVIDER` and never connects).
Tests[C4]: `concern-classifier.test.ts` "P1 LK1w config: an ollama text-chain base is refused...".
Tests[C5]: `chat-profile.test.ts` "LK1w: a bad chain (no OLLAMA_API_KEY) is a startup config error before connecting..." (`connected` stays 0, message names `OLLAMA_API_KEY`).
Tests[C6]: grep of `.env.example` (below).
Pre-check[C1]: e13f850 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh bash D:/tmp_lk1w/final.sh` (runs `timeout 600 npx tsx --test tests/<file>.test.ts` per file, unpiped to a file) -> chat-profile 14 tests, 14 passed, 0 failed
Pre-check[C2]: e13f850 same run -> anonymous-route 18 tests, 18 passed, 0 failed
Pre-check[C3]: e13f850 same run -> chat-profile 14 passed (includes the C3 test)
Pre-check[C4]: e13f850 same run -> engine `concern-classifier.test.ts` 23 tests, 23 passed, 0 failed
Pre-check[C5]: e13f850 same run -> chat-profile 14 passed (includes the C5 test)
Pre-check[C6]: e13f850 `grep -c "ollama:glm-5.3-flash,ollama:deepseek-v4.1-flash\|ollama:deepseek-v4.1-flash,ollama:glm-5.3-flash" .env.example` -> 2; `grep -nE "^(VC_TEXT_CHAIN|OLLAMA_API_KEY)=" .env.example` -> lines 78 and 80, both empty values
Pre-check[existing startApi users]: e13f850 same run -> index.test.ts 8/8, server.test.ts 34/34, voice-wiring.test.ts 16/16 passed, 0 failed
Pre-check[typecheck]: e13f850 same lock, `tsc --noEmit` in apps/api -> exit 0; `pnpm run typecheck` in packages/engine (tsc for src, evals and scripts) -> no error output
Red-before: the new tests were written before the source edits. A first combined run of chat-profile + anonymous-route piped through `tail` ran while the source edit was landing and hung for over 19 minutes: the test files had started against unedited source, where the "bad chain" and "does not replace scribe" tests saw `startApi` start a real server that was never stopped, so the node process never exited. Run singly and unpiped on the final source, the same files finish in about 8 s. The two refusal tests now use `mustRefuseWith`, which stops a wrongly started server, so a red run fails instead of hanging (Falsification[C3]/[C5] ran in 1 test each, no hang). One test (C3) was also found vacuous by Falsification[C3] first run (the classifier base alone already required `VC_LLM_PROVIDER`); it now injects `escalationForTenant` so only the scribe base is read.
Falsification[C1]: in a separate worktree copy (`D:/vc/.worktrees/lk1w-fals`, restored with `git checkout -- .` after each mutant, clean afterwards) chat `provider: httpSetup.studentProvider` -> `httpSetup.provider` -> chat-profile 14 tests, 13 passed, 1 FAILED (the chain-set chat test).
Falsification[C2]: same copy, anonymous `provider: httpSetup.studentProvider` -> `httpSetup.provider` -> anonymous-route 18 tests, 17 passed, 1 FAILED (the chain-set anonymous test).
Falsification[C3]: same copy, scribe base `http.provider ?? createProvider(loadTextChainConfig(env) ?? loadProviderConfig(env))` -> chat-profile 14 tests, 13 passed, 1 FAILED (the scribe-base test). (The first attempt with the original, vacuous test survived; fixed as noted in Red-before.)
Falsification[C4]: same copy, the ollama guard disabled (`if (false as boolean)`) -> concern-classifier 23 tests, 22 passed, 1 FAILED (the LK1w guard test).
Falsification[C5]: same copy, chain config never read (`textChain = undefined`) -> chat-profile + anonymous-route 32 tests, 29 passed, 3 FAILED (both chain-set tests and the bad-chain test).
Falsification[unset fallback]: same copy, unset fallback replaced by `undefined` -> chat-profile + anonymous-route 32 tests, 28 passed, 4 FAILED (both unset tests and two existing startApi tests).
Falsification[C6]: same copy, `grep -v "DeepSeek first" .env.example | grep -c <order pattern>` -> 1 (not 2), so dropping the DeepSeek-first line is detected by the C6 count.
Restored: each source mutant ran in the `lk1w-fals` worktree, restored after every run; `git status` there was clean; the real worktree was never mutated. That worktree and `D:/tmp_lk1w` are scratch and can be deleted.
Metrics: start=2026-10-19T16:37:42+05:30 end=2026-10-19T20:22:10+05:30 builder_min=unavailable wall_min=224 agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=2 mutations=7 cycle=0 resumes=2 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=unavailable mutants=7 defects_unit=0 defects_6c=0

## Not determined / for the owner
- The crisis half of C2 (zero chain calls on a crisis text) is asserted but was not falsified: crisisGuard lives in the engine graph and is untouched by this unit.
- Whether the chain is the right model for the student surfaces in production is the LK9/eval question; this unit only makes it a config switch. The scribe and classifier move only after their own eval (D-105 Q4).
- The senior-software-engineer review was not run by this builder (the writer does not review its own output).
- One diagnostic `npx tsx --test tests/chat-profile.test.ts` run was made once outside the test lock while hunting the hang (14/14 passed); all recorded results above are from lock runs.
- Hung process PID 47984 from the first run was left alive per the coordinator; it still holds slot 0 of the test lock.
