# Manifest: t-007-scribe-graph
**Contract:** qa/contracts/counselling-engine.md (B1, B2, B3, B4, B5, B6, B7, B8, B9, B11, B12, B13, B14; B16 context)
**Goal task:** T-007
**Date:** 2026-09-25
**Status:** ready-for-check
**Fix cycle:** 0
**Fix cycle budget:** 0 of max 3
**Design:** H1/D-002 (LangGraph.js 1.x StateGraph, thin wiring, `interrupt()` approval), H5/D-005 (SKILL.md prompts, code guards before any LLM call, provider seam), D-012 (sessionId-keyed contentHash idempotency), D-013 (open fact = `active: true`)
**Unit diff range:** `067ebb8..HEAD`. `067ebb8` = "tasks: T-003b done; T-007 carry-forward notes" (the main branch point). HEAD = the single T-007 commit "feat(engine): T-007 post-session scribe graph (...)".
**Scope:** `packages/engine/src/scribe/**` (new), `packages/engine/src/index.ts` (one additive export line), `packages/engine/tests/scribe*` (new), `packages/engine/package.json`, `packages/providers/**`, `packages/observability/src/{config,tracing}.ts` + `tests/tracing.test.ts` (ISS-025, ISS-t-004-langfuse-1), `packages/db/tests/fakes.ts` (test-only `find()`), `.env.example` (two key names, no values), `pnpm-lock.yaml`, this manifest.
**Not touched (brief constraints):** `.claude/**`, `docs/DECISIONS.md`, `scripts/**`, `packages/engine/src/guards/**` (imported only; T-005b is changing `crisis.ts` in parallel), `packages/db/src/**`.
**Dual check:** no
**Issues addressed:** ISS-025 (low), ISS-t-004-langfuse-1 (low)
**Executor:** claude-opus-subagent (maker build subagent)
**Executor rationale:** a multi-package build unit (new graph, provider seam, two observability fixes) against fixed contract rows and an existing, hardened DB API.

## What changed

- **`packages/providers/src/index.ts`** (the stub is replaced in place). `LlmProvider.generate({skillName, skillPrompt, outputSchema, input})` returns the output parsed by the caller's Zod schema (B5/B6).
  - `MockProvider` is deterministic, records every call (`calls[]`: skill, prompt, model, input), refuses output that does not match the schema, and never invents a response for an unknown skill.
  - `GeminiProvider` is a **stub**: it holds the model and key (the key sits in a `#private` field, so it never appears in JSON or String output, B11), has no network code, and `generate` throws `ProviderNotWiredError`.
  - `loadProviderConfig(env)` requires `VC_LLM_PROVIDER` ("mock" | "gemini") and has no default on purpose. Gemini also requires `VC_LLM_MODEL` + `GEMINI_API_KEY`. `createProvider(config)` picks the implementation.
- **`packages/engine/src/scribe/`** (new):
  - `schemas.ts` holds a Zod schema for each node boundary: input, consent, crisis, extract, summary, diff, the approval request, the approval **response** (a discriminated union approve / edit / reject), and the result.
  - `nodes.ts` holds the logic as plain functions with no LangGraph imports:
    - `checkConsent`: `requireConsent(db, studentId, "profile_synthesis")`. Only a `ConsentRequiredError` becomes "refused"; other errors propagate.
    - `checkCrisis`: the unchanged `routeBeforeGeneration` runs over every turn, on **both** the original `text` and `translatedText`.
    - `extractFacts`: the `fact-extraction` SKILL.md goes through the provider. Each candidate is checked in turn by shape, the existing `citationGuard` (B2), transcript-source, turn-exists and verbatim-quote checks. `validFrom` is set to `sessionEndedAt`, `profile_synthesis` is added to `purposeTags`, and duplicate keys are resolved to the higher-confidence fact.
    - `summarizeSession`: the `session-summary` SKILL.md goes through the provider, then the B1 recital check (`isScriptLike(summary, "evidence")`) withholds a script-like summary.
    - `proposeDiff`: `factsCollection.find({studentId, active: true})` feeds `proposeFactChanges`.
    - `decisionFromResponse`.
    - `writeApproved`: `applyApprovedDiff(db, diff, decision, sessionId-from-state)`. A `FactConflictError` becomes status "conflict"; any other error propagates, so LangGraph can retry from the checkpoint.
  - `graph.ts` is the thin `StateGraph` wiring: consent_gate → crisis_gate → extract_facts → summarize_session → propose_diff → counsellor_approval (`interrupt(ApprovalRequest)`, with the resume parsed by `ApprovalResponseSchema`) → write_approved. Conditional edges end the run on refused, escalated and rejected. It also provides `startScribe` / `resumeScribe` (`null` means retry from the last checkpoint; a `checkpointId` forks), `scribeRunConfig({threadId, tracing})`, which adds `createLangfuseCallbacks` callbacks, and `scribeThreadId(sessionId)`.
  - `checkpointer.ts`: `createScribeCheckpointer(client)` is `MongoDBSaver` with `dbName: VC_DB_NAME` passed explicitly (MongoDBSaver itself opens `client.db(dbName)`, so an omitted name would fall back to the URI default, which B12 forbids). The collections are `scribe_checkpoints` and `scribe_checkpoint_writes`. It is used for runtime wiring only and never in tests.
- **`packages/observability`**:
  - `config.ts`: the Cloud-host refusal is extracted from `loadTracingConfig` into `assertSelfHostedBaseUrl` with identical behaviour, and `assertValidTracingConfig(config)` is added.
  - `tracing.ts` `initTracing`: re-validates every config (ISS-t-004-langfuse-1), remembers the winning config, and **throws** on a later call with a different config (ISS-025). The error names the differing fields, never their values.
- **`packages/db/tests/fakes.ts`**: adds a test-only `find(filter).toArray()` (returns copies, equality matching). `packages/db/src` is not touched.
- **`packages/engine/package.json`** adds: `@langchain/langgraph ^1.4.17`, `@langchain/langgraph-checkpoint-mongodb ^1.4.1`, `@langchain/core ^1.2.12` (the same range as observability, so there is a single deduped `@langchain/core@1.2.12` in the lock), `@vc/{db,observability,providers}`, `mongodb`, `zod ^3.25.32` (the langgraph peer; it resolves to the already-locked 3.25.76). Dev dependencies: `@opentelemetry/core` and `sdk-trace-base` for the recording exporter. `pnpm-lock.yaml`: +148 lines, 0 removed lines. `pnpm install --frozen-lockfile` exits 0.
- **`.env.example`** adds the key names `VC_LLM_PROVIDER=` and `VC_LLM_MODEL=`, with no values.

## TDD: RED before implementation

The tests were written first and run before any `src` existed (outputs are in the maker's scratchpad `red-*.txt`):
- providers: `SyntaxError: The requested module '../src/index.js' does not provide an export named 'GeminiProvider'`, `fail 1`.
- engine: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...packages\engine\src\scribe\index.js'` on all 3 scribe test files. `tests 34 | pass 31 | fail 3`: the 31 pre-existing tests passed.
- observability: `tests 57 | pass 43 | fail 14`. All 3 ISS-025 tests and all 11 ISS-t-004-langfuse-1 tests were `✖`.

## Claims → evidence (per contract criterion)

| Criterion | Claim | Evidence (test name, file) | Status |
|---|---|---|---|
| B3 | Nothing is written before approval. | "B3: the graph pauses at interrupt() with the diff and NOTHING is written before approval". It reads back `facts.size()==0` and `edges.size()==0` while paused, and 2 provider calls have already happened (tests/scribe.test.ts). | VERIFIED |
| B3 | Approve writes the facts and edges. | "B3: approve writes the facts and their edges (read back)": 2 open facts with their values, `validFrom` from the session, 4 edges (sourced_from → `session:<input sessionId>`, student --has--> fact), and `writtenFactIds` equal the stored `_id`s. | VERIFIED |
| B3 | Reject writes nothing. | "B3: reject writes nothing": 0 facts and 0 edges. | VERIFIED |
| B3 | Edit writes the edited values. | "B3: edit writes the counsellor's edited values, not the model's": exactly 1 open fact, with value 1800000 (not the model's 2000000). | VERIFIED |
| B2 | Uncited facts are dropped using the existing guard. | "B2: uncited, fabricated-quote and unknown-turn facts from the model are dropped…": the diff and the written facts contain only `targetCountry`, and `dropped` lists the other 3 keys. Also "B2/B5: an edit carrying an uncited fact is refused and writes nothing". | VERIFIED |
| B9 | A crisis transcript makes no provider call and escalates. | "B9: a crisis transcript never calls the provider and returns an escalation": `provider.calls.length === 0`, level crisis, `turnId` t4, 0 facts. The hostile variant is "…crisis signal only in the ORIGINAL-language text…". | VERIFIED |
| B4 | No consent means refusal with zero provider calls. | "B4: no consent row -> refusal…", "B4 variants: consent for another purpose, or a minor without guardian consent…", and "B4: consent is checked before the crisis guard and the provider". | VERIFIED |
| B5 | Every node boundary is typed. | Each node function parses its input and output with schemas in `scribe/schemas.ts`, and the interrupt payload and resume value are parsed. Tests: "B5: an invalid graph input (no sessionId) is refused before any node or provider call", "B5: an unknown resume action is refused and writes nothing", and the MockProvider test "refuses an output that does not match the schema". | VERIFIED (by construction + 3 tests) |
| B6 | Prompts come from SKILL.md, through the provider seam, and the model is set by config. | "B6: the provider receives the real SKILL.md bodies…" asserts text from `skills/fact-extraction/SKILL.md` and `skills/session-summary/SKILL.md`. providers: "B6: loadProviderConfig…" and "B6: createProvider selects the implementation by config…". | VERIFIED |
| B1 | A script-like skill output is not shown. | "B1: a script-like summary from the model is withheld…" | VERIFIED |
| D-012 | sessionId is stable across checkpoint replay. | "D-012: a crash mid-write, resumed from the checkpoint, re-applies idempotently…". The first edge upsert throws after fact #1 is inserted. `resumeScribe(null)` re-runs `write_approved` from the checkpoint. The result is 2 fact docs in total (no duplicate history), 2 open, `contentHash == deriveContentHash(student, key, value, INPUT sessionId)`, and 4 edges. Also "D-012: replaying the approval from the pre-approval checkpoint (fork) writes nothing new" (same `_id` set, same edge count). | VERIFIED |
| D-013 / supersede | A second session's changed value becomes an update and keeps history. | "the second session re-confirming a changed value supersedes via the diff (update op) and keeps history" | VERIFIED |
| B7 / B14 | A scribe run exports spans through the real export path. | tests/scribe-tracing.test.ts: `initTracing(cfg, {exporter: RecordingExporter})` + `scribeRunConfig` → start + approve. Exported spans: `__start__, RunnableLambda, consent_gate, RunnableLambda, crisis_gate, extract_facts, summarize_session, propose_diff, counsellor_approval, LangGraph, RunnableLambda, counsellor_approval, write_approved, LangGraph`. The test asserts that an `extract_facts` span exists. | VERIFIED |
| B7 hostile hosts (ISS-t-004-langfuse-1) | A hand-built config can not reach Langfuse Cloud. | observability tests/tracing.test.ts has 8 hostile URLs (plain, trailing dot, mixed case, port+path, userinfo, punycode, IDN Cyrillic, apex) plus no-baseUrl, missing-key and `createLangfuseCallbacks` cases. Each throws and registers 0 processors. | VERIFIED |
| ISS-025 | A later `initTracing` with a different config is no longer silently ignored. | "ISS-025: a second initTracing call with a different config throws…", "disabled first, then enabled, also throws", "the error message never echoes a secret key" | VERIFIED |
| B12 | The runtime checkpointer uses `virtual_counsellor` only. | tests/scribe-checkpointer.test.ts: a fake client records `db()` calls, and every one is `virtual_counsellor`. `connect` is never called. The repo-wide B12 scanner (`packages/db/tests/db-scope.test.ts`) passes. It caught a `client.db(` in a docstring of mine during this unit, and the comment was reworded rather than the scanner weakened. | VERIFIED (offline) |
| B8 / B13 | Tests are offline: no Mongo URL, no Gemini, synthetic text only. | All tests use `createFakeDb`, `MemorySaver` and `MockProvider`. The transcript fixtures are synthetic (tests/scribe-fixtures.ts). `GeminiProvider.generate` is never called in any test. | VERIFIED |
| B11 | No key values are in the tree. | `.env.example` has key names only. The Gemini key is in a `#private` field (providers test "B11: the Gemini stub never exposes its key…"). Error messages name keys, never values. | VERIFIED (the checker should still grep history) |
| B14 | Integration outcomes are read back. | Every scribe assertion reads the fake collections, and the span test reads the exporter. | VERIFIED |
| Live Mongo checkpointer | `MongoDBSaver` against the real server works (setup and indexes, a checkpoint round trip). | Not run: live runs are out of scope for automated tests (B8/B12). | **UNVERIFIED** |
| Gemini provider | A real model produces schema-valid facts and a summary. | `GeminiProvider` is a stub that throws `ProviderNotWiredError`. | **UNVERIFIED (stub by design)** |
| Summary persisted | The approved summary is stored. | Not stored. `SessionDoc` has no summary field, and this slice writes facts and edges only. | **UNVERIFIED / out of scope** (see open questions) |
| B16 | The async concern classifier and admin notification. | Not in this unit (T-012). The scribe only returns an `escalated` result. | **OUT OF SCOPE** |

## Falsification (each guard reverted → RED → restored)

The engine rows ran `tests/scribe.test.ts` + `tests/scribe-tracing.test.ts` (20 tests); the observability rows ran the full observability suite (57 tests). The mutations were scripted with an assert-found replace and restored in a `finally` block.

| Guard | Mutation | Observed RED |
|---|---|---|
| F1 approval gating (B3) | `interrupt(request)` → a constant `{action:"approve"}` | fail=11, including "…NOTHING is written before approval", "reject writes nothing", "edit writes…", both D-012 tests |
| F2 crisis-before-provider order (B9) | Rewire to consent → extract → summary → crisis → diff | fail=2: "B9: a crisis transcript never calls the provider…" and the original-language hostile variant |
| F3 consent gate (B4) | `await requireConsent(...)` → `void requireConsent` | fail=3: all three B4 tests |
| F4 sessionId stability (D-012) | write node passes `${sessionId}:${randomUUID()}` (generated in-node) | fail=3: "approve writes…" (edge target), "D-012 crash mid-write…", "D-012 fork replay…" |
| F5 verbatim-quote citation check (B2) | `if (!inTurn)` → `if (false && !inTurn)` | fail=1: the B2 drop test |
| F6 original-language crisis scan (B9) | scan `translatedText` only | fail=1: the B9 hostile variant |
| F7 ISS-t-004-langfuse-1 | remove `assertValidTracingConfig(config)` from `initTracing` | fail=11: every hand-built-config test |
| F8 ISS-025 | disable the differing-config check | fail=3: all three ISS-025 tests |
| RESTORED | all originals written back | engine `tests 53 pass 53 fail 0`, observability `tests 57 pass 57 fail 0` |

## How to verify (commands + expected)

Run from the worktree root:
```
pnpm install                        # exit 0; pnpm install --frozen-lockfile also exit 0
pnpm -r typecheck                   # every package "Done", exit 0
pnpm -r test                        # 261 tests, 0 fail, exit 0
python contracts/verify_contracts.py  # "PASS by vacuity", exit 0
```

## Actual outputs (maker's own run)

- `pnpm install`: `Done in 666ms using pnpm v10.33.0`, exit 0. `pnpm install --frozen-lockfile`: exit 0.
- `pnpm -r typecheck`: exit 0. Each of apps/web, apps/api, packages/providers, observability, schemas, db, mcp/university-kb, mcp/student-profile and packages/engine printed `typecheck: Done`.
- `pnpm -r test`: exit 0.

| Package | tests | pass | fail |
|---|---|---|---|
| apps/api | 1 | 1 | 0 |
| apps/web | 1 | 1 | 0 |
| packages/providers | 8 | 8 | 0 |
| packages/schemas | 50 | 50 | 0 |
| packages/observability | 57 | 57 | 0 |
| packages/db | 70 | 70 | 0 |
| mcp/university-kb | 9 | 9 | 0 |
| mcp/student-profile | 12 | 12 | 0 |
| packages/engine | 53 | 53 | 0 |
| **Total** | **261** | **261** | **0** |

- `python contracts/verify_contracts.py`: `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`, exit 0.

## Design notes and deviations (for the checker)

- **Cross-package test import.** Engine tests import `packages/db/tests/fakes.ts` and `packages/db/scripts/db-init.ts` `INDEX_PLAN` by relative path, which deviates from T-006's package-local fake copies. The reason: the scribe's writes must run against the driver-faithful fake (11000, pre-image CAS, partial-filter validation) with the production unique indexes. A third, laxer copy would reopen ISS-t-003b-c1-3. `find()` was added to that one fake in place.
- **A concern-level turn also stops the scribe.** `routeBeforeGeneration` escalates both "concern" and "crisis", and the graph follows the guard ("false positives are the safe failure mode"). Product may want concern to continue with a flag (see open questions).
- **`profile_synthesis` is always added to `purposeTags`** on extracted facts, so the T-006 MCP reader can see what the scribe writes under the purpose it was consented for.
- **Conflict handling.** A first-fact `FactConflictError` becomes status "conflict", and the counsellor re-runs. A `PartialApplyError` and any other error propagate, so LangGraph can retry the write node from its checkpoint (the D-012 replay test proves that retry is idempotent).
- **Spans carry transcripts.** This is acceptable only because tracing is self-hosted. `initTracing` now enforces that on every config, not just env-loaded ones.

## Remaining risk / open questions

1. **Summary persistence.** The approved summary is returned to the UI but not stored, because `SessionDoc` has no field for it. Does T-008 or a follow-up add `sessions.summary` (and should the summary be approved separately)?
2. **Concern vs crisis routing** in the post-session scribe (see design notes). This needs a product call, and T-012 (B16) may refine it.
3. **Erasure of checkpoints (B15/T-011).** `scribe_checkpoints` and `scribe_checkpoint_writes` hold transcripts and facts. T-011 must purge them by `thread_id` (`scribeThreadId(sessionId)`), and they are not in `COLLECTION_NAMES` / `INDEX_PLAN`. Runtime must also call `saver.setup()` once, and `db:init` must run once before the first live write (T-003b carry-forward). Neither was run here (live).
4. **The Gemini provider is a stub.** Wiring the real client plus a live synthetic-fixture run is a follow-up unit (B13 gate on record).
5. **T-005b parallel change to `crisis.ts`.** The scribe calls `routeBeforeGeneration` unchanged. If T-005b changes its signature or return shape, `checkCrisis` needs a one-line follow-up. The F2 and F6 falsifications show the tests will catch a regression.
6. **Review agents** (senior-software-engineer, ai-engineer for the LLM-node code, data-engineer for the write path) were not dispatched by this build subagent. The brief says to return to the orchestrator.
