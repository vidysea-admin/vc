# Manifest — p1-deepseek-id
**Contract:** D-100 / D-102 (paid real-model eval runs via Ollama-hosted GLM 5.3 Flash and DeepSeek; spec A24 per-model price, an unknown price refuses the REAL run, never zero); contract B13 (no live call, no paid call from tests). Source brief `qa/evidence/p1-briefs/p1-deepseek-id.md`. Builds on `p1-u13b-ollama-adapter` (checked-PASS).
**Criteria:**
- C1 `OLLAMA_PRICE_TABLE_USD_PER_MTOK` is keyed by Ollama's real DeepSeek id `deepseek-v4.1-flash` (GET /api/tags, 2026-10-19): `VC_REAL_MODEL=ollama:deepseek-v4.1-flash` resolves a price with no `OLLAMA_PRICE_USD_PER_MTOK` override, the request is sent with that id, and the old wrong id `deepseek-4.1-flash` is refused (`no price`). The `glm-5.3-flash` key matches Ollama's real id exactly (verified against the brief's id; unchanged).
- C2 A pinned `<base>:<tag>` id (e.g. `deepseek-v4.1-flash:1017`) is priced from its base id when the exact id is not in the table; the full id is still what is sent. Unknown bases, an empty tag, an empty base and prototype names (`constructor:x`) stay refused. The code had no tag rule before.
**Goal task:** none
**Date:** 2026-10-19
**Status:** checked-PASS
**Fix cycle:** 0 of max 2
**Policy-Version:** proportional-verification/2026-10-19.16
**Tier:** S (one table key and a three-line lookup in the price resolver; no auth, no production data, no network, no paid call)
**Dual check:** no (no security, auth, tenancy or production-write trigger: tests use a mocked fetch)
**Persona walk:** skip (no human screen)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent (maker/builder p1-deepseek-id)
**Executor rationale:** one table key and one resolver line in one file plus its test file; splitting would only add merge work.

## What changed
Branch `p1/deepseek-id`, base `1aefd96` (origin/main). Code and tests commit `f85d806`; the manifest is a later commit. Edited in place, no new file.
- `packages/providers/src/index.ts`: `OLLAMA_PRICE_TABLE_USD_PER_MTOK` key `"deepseek-4.1-flash"` -> `"deepseek-v4.1-flash"` (same conservative placeholder price, still [ASSUMPTION - UNVERIFIED]); `resolveOllamaPrice` looks up the exact id first, then the base id of a single `<base>:<tag>` id (`/^([^:]+):[^:]+$/`); the doc comment says the ids are now real and the prices still placeholders. The model id sent on the wire and `provider.model` stay the full id the operator typed.
- `packages/providers/tests/ollama.test.ts`: two tests added (21 total in the file): the real id resolves a table price (cost estimate equals the table price, request body carries the id) and the old id is refused; the pinned-tag cases (priced from base, full id sent, `glm-5.3-flash:latest` ok, six refusals).
- Other references to the old id: none in code (grep over the worktree finds only the superseded U13b manifest and the maker-protocol evidence copies, which are history and untouched).
- Line endings: touched files keep CRLF.

## Verification scope
Round: 2 files, 2 criteria, est 10 min - TDD two tests, whole providers package, typecheck, one falsification (lock waits dominate)
Affected tests / full-suite trigger: providers tests/ollama.test.ts (the only consumer of the price table); no full-suite trigger (tier S, no shared runtime path; engine imports `prepareOllamaProvider` unchanged in signature).
Base / checked state: `p1/deepseek-id` at `f85d806`.
Tests[C1]: providers tests/ollama.test.ts "p1-deepseek-id: ollama:deepseek-v4.1-flash resolves a price with no override; the old wrong id 'deepseek-4.1-flash' no longer does" — asserts the table keys, the wire model id, the table-priced estimate and the old id's `no price` refusal.
Tests[C2]: providers tests/ollama.test.ts "p1-deepseek-id: a pinned ':<tag>' id (deepseek-v4.1-flash:1017) is priced from its base id; the full id is still what is sent; unknown bases stay refused" — the tag rule and its hostile variants (empty tag, empty base, unknown base, old id with tag, prototype name, near-miss base).
Pre-check[C1]: f85d806 VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C packages/providers exec tsx --test tests/ollama.test.ts -> green: 21 passed, 0 failed
Pre-check[C2]: f85d806 same command as Pre-check[C1] -> green: 21 passed, 0 failed
Wide-set (whole package, informational backstop): f85d806 same lock, `pnpm -C packages/providers test` -> 151 tests, 151 passed, 0 failed.
Pre-check[typecheck]: f85d806 same lock, `pnpm -r typecheck` -> exit 0 (all workspaces).
Falsification[C1]: golden red-before/green-after - before the fix the new tests ran 21 tests with both new tests FAILED (table lacked `deepseek-v4.1-flash`; `deepseek-v4.1-flash:1017` refused `no price`); after the fix 21/21 green.
Falsification[C2]: in a copy (`packages/providers/fals-copy`, src+tests, deleted afterwards; the bound tree was never edited) the resolver line was mutated to `const base = model;` (no tag rule) -> `tsx --test fals-copy/tests/ollama.test.ts` -> 21 tests, 20 passed, 1 FAILED (the pinned-tag test); the C1 test stays green under that mutant, as it should.
Metrics: start=2026-10-19T14:30:06+05:30 end=2026-10-19T14:35:52+05:30 builder_min=unavailable wall_min=unavailable agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=1 mutations=1 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.16 check_s=unavailable mutants=1 defects_unit=0 defects_6c=0

## Not determined / for the owner
- The placeholder price (USD 1 in / 4 out per MTok) is still [ASSUMPTION - UNVERIFIED] for both models; the real Ollama price was not checked (no network, no paid call). The USD 50/run cap treats it as an over-count.
- No live check of `/api/tags` was made here; the ids come from the brief.
