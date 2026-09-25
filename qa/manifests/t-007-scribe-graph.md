# Manifest: t-007-scribe-graph
**Contract:** qa/contracts/counselling-engine.md (B1, B2, B3, B4, B5, B6, B7, B8, B9, B11, B12, B13, B14; B16 context)
**Goal task:** T-007
**Date:** 2026-09-25
**Status:** checked-PASS (verdict cycle 2, f217e81; senior + data-engineer Warning, no Block; follow-ups ISS-t-007-rev-6,7,9,10 gate T-008)
**Fix cycle:** 2 of max 3 (cycle-1 checker PASS 4916102 overridden by senior Block: ISS-t-007-rev-8 concurrent-resume race, reproduced)
**Fix cycle budget:** 2 of max 3
**Design:** H1/D-002 (LangGraph.js 1.x StateGraph, thin wiring, `interrupt()` approval), H5/D-005 (SKILL.md prompts, code guards before any LLM call, provider seam), D-012 (sessionId-keyed contentHash idempotency), D-013 (open fact = `active: true`)
**Cycle-2 diff range:** `d80dc43..HEAD` (see "Fix cycle 2"). **Cycle-1 diff range:** `7e8474d..HEAD` (the single commit "fix(engine): t-007 cycle 1 — ..."; `7e8474d` = "qa: t-007 fix cycle 1 (review findings before merge)"). **Cycle-0 unit diff range:** `067ebb8..1d2d452`. `067ebb8` = "tasks: T-003b done; T-007 carry-forward notes" (the main branch point); `1d2d452` = the single cycle-0 T-007 commit "feat(engine): T-007 post-session scribe graph (...)".
**Scope:** `packages/engine/src/scribe/**` (new), `packages/engine/src/index.ts` (one additive export line), `packages/engine/tests/scribe*` (new), `packages/engine/package.json`, `packages/providers/**`, `packages/observability/src/{config,tracing}.ts` + `tests/tracing.test.ts` (ISS-025, ISS-t-004-langfuse-1), `packages/db/tests/fakes.ts` (test-only `find()`), `.env.example` (two key names, no values), `pnpm-lock.yaml`, this manifest.
**Not touched (brief constraints):** `.claude/**`, `docs/DECISIONS.md`, `scripts/**`, `packages/engine/src/guards/**` (imported only; T-005b is changing `crisis.ts` in parallel), `packages/db/src/**`.
**Dual check:** no
**Issues addressed:** ISS-025 (low), ISS-t-004-langfuse-1 (low); cycle 1: ISS-t-007-rev-4 (high), ISS-t-007-rev-5 (medium), ISS-t-007-c0-1 (medium), ISS-t-007-rev-1 (medium), review low item (`@vc/db/testing` subpath)
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

## Fix cycle 1 (review findings + checker ISS-t-007-c0-1)

**Files in the cycle-1 diff:**
- `packages/engine/src/scribe/{schemas,nodes,graph}.ts`
- `packages/engine/tests/{scribe.test.ts,scribe-fixtures.ts,scribe-checkpointer.test.ts}`
- `packages/db/src/testing.ts` (new, a test-only subpath)
- `packages/db/package.json` (one `exports` entry)
- `packages/db/tests/fakes.ts` (a comment only)
- this manifest

**Not touched:** `.claude/**`, `docs/DECISIONS.md`, `scripts/**`, `packages/engine/src/guards/**`, and `pnpm-lock.yaml` (unchanged; `pnpm install --frozen-lockfile` exits 0).

**TDD.** The 8 new tests were appended to `tests/scribe.test.ts` and run before any src change: `tests 26 | pass 18 | fail 8`. All 8 new tests were RED, each for its intended reason:
- rev-4: an uncaught `PartialApplyError`.
- rev-5 (extraction): `actual: ['application_filling','profile_synthesis']` where `['profile_synthesis']` was expected.
- rev-5 (edit): `actual: ['application_filling','counselling_session']` where `['profile_synthesis']` was expected.
- c0-1 (both tests): `actual: 'done'` where `'already_resolved'` was expected.
- rev-1 (all three tests): an uncaught `ZodError`.

Every test runs over the real graph with `MemorySaver` and the driver-faithful fake, with INDEX_PLAN's unique indexes declared.

| Issue | Fix (file:function) | Evidence (test, tests/scribe.test.ts) | Status |
|---|---|---|---|
| ISS-t-007-rev-4 (high) | `nodes.ts:writeApproved` maps a `PartialApplyError` whose `cause` is a `FactConflictError` to a new terminal `ScribeResult` variant, `partial_conflict {key, writtenFactIds, message}` (`schemas.ts:ScribeResultSchema`). A `PartialApplyError` with any other cause still propagates, so it retries from the checkpoint (idempotent by D-012). | "ISS-t-007-rev-4: a genuine conflict on fact 2 ...": a rival writer opens `budget_inr_per_year` (value 999, foreign contentHash) between our read and our insert, and the real partial unique index returns 11000. The result is `partial_conflict` with `key` budget and `writtenFactIds == [targetCountry._id]`. Read back: targetCountry=Canada is open, and budget is still the rival's doc, untouched. A later `resumeScribe(null)` returns the same terminal result without throwing, and `facts.size()==2`. | VERIFIED |
| ISS-t-007-rev-5 (DPDP) | `nodes.ts:verifyCandidateFact` sets `purposeTags: [profile_synthesis]` and discards the model's tags instead of merging them. In `nodes.ts:decisionFromResponse`, "edit" rewrites every edited fact's `purposeTags` to `[profile_synthesis]`. "Approve" writes `proposedFacts`, which come from extraction. | "ISS-t-007-rev-5: scribe-extracted facts carry EXACTLY [profile_synthesis]...": the model supplies `application_filling` and `marketing`, and both the approval request and the read-back docs are exactly `[profile_synthesis]`. "ISS-t-007-rev-5: the counsellor edit path cannot add purposes...": an edit carrying `application_filling` and `counselling_session` reads back as `[profile_synthesis]`. | VERIFIED |
| ISS-t-007-c0-1 | `graph.ts:resumeScribe` reads the thread's latest state before it resumes with a response. If a decision is already recorded, it returns a new `ScribeOutcome` kind, `already_resolved {decision (original), result, attempted}`, and does not invoke the graph. The behaviour is documented on `ScribeRunOptions.checkpointId` ("one-shot per thread"). A `null` resume (the crash retry) is unaffected. | "ISS-t-007-c0-1: approve, then fork-resume the SAME pre-approval checkpoint with reject ...": `kind already_resolved`, `decision.approve true`, `attempted.action reject`, `result.status written`, the same fact `_id` set, and 2 facts still open. "...already-completed thread (no checkpointId) ...": reject, then approve, gives `already_resolved` with `decision.approve false` and 0 facts. The old D-012 fork test (an identical approve) now asserts `already_resolved` with the original `written` result, and it still asserts no new docs or edges. | VERIFIED |
| ISS-t-007-rev-1 | `nodes.ts:generateWithRetry` is used by `extractFacts` and `summarizeSession`. On a schema error (`ZodError`) it re-asks at most `PROVIDER_OUTPUT_RETRIES = 1` time, appending `previousAttemptError` (a list of path: message) to the input. After that it returns `failedReason`, and the graph maps that to a terminal `extraction_failed` / `summary_failed` result and routes to END. A non-schema provider error still propagates. | "...retried ONCE ... then succeeds": 2 extraction calls, the 2nd call's `previousAttemptError` matches /facts/, and the run reaches approval. "...always-malformed extraction ... extraction_failed": 2 extraction calls, 0 summary calls, 0 facts, 0 edges. "...malformed summary retried once; always-malformed ends in summary_failed": both cases write nothing. | VERIFIED |
| low: cross-package relative imports | `packages/db/package.json` gets `exports["./testing"] = "./src/testing.ts"`. `src/testing.ts` re-exports `tests/fakes.ts`, plus `INDEX_PLAN`/`IndexSpec` from `scripts/db-init.ts` (importing it has no side effects). `src/index.ts` does not re-export it. Engine `scribe-fixtures.ts` and `scribe-checkpointer.test.ts` now import `@vc/db/testing`, and `grep "../../db" packages/engine/{src,tests}` returns nothing. packages/db's own tests are unchanged (70/70). | `pnpm -r typecheck` exits 0; db now typechecks `src/testing.ts` and, through it, `tests/fakes.ts`. engine 61/61; db 70/70. | VERIFIED |

**Not in this cycle** (not in the brief):
- ISS-t-007-rev-2: citation normalisation.
- rev-3: waiting on the gate `scribe-concern-level`.
- rev-6: checkpoint collections (live wiring + T-011).
- rev-7: summary persistence (T-008).
- c0-2: Devanagari crisis patterns (T-005b/T-012).

### Falsification, cycle 1

The script is `scratchpad/t007c1-falsify.py`. For each guard it makes an assert-found replace, runs `tests/scribe.test.ts`, and restores the original in a `finally` block.

| Guard | Mutation | Observed RED |
|---|---|---|
| F1 rev-4 mapping | `if (false && err instanceof PartialApplyError ...)` | fail=1: the rev-4 partial_conflict test |
| F2 rev-5 extraction strip | `purposeTags: [...new Set([...candidate.purposeTags, SCRIBE_PURPOSE])]` (the cycle-0 merge) | fail=1: the rev-5 extraction test |
| F3 rev-5 edit strip | `response.facts.map((f) => ({ ...f }))` | fail=1: the rev-5 edit test |
| F4 c0-1 guard | `if (false && latest.decision)` | fail=3: both c0-1 tests + the D-012 fork test |
| F5 rev-1 bounded retry | `PROVIDER_OUTPUT_RETRIES = 0` | fail=3: all three rev-1 tests |
| F6 rev-1 terminal status | schema error rethrown (`throw err;`) | fail=3: all three rev-1 tests |
| RESTORED | originals written back | `tests 26 pass 26 fail 0`; the src `git diff --stat` is identical before and after |

### Actual outputs, cycle 1 (the maker's own run, from the worktree root)

- `pnpm install`: `Done in 672ms using pnpm v10.33.0`, exit 0. `pnpm install --frozen-lockfile`: exit 0.
- `pnpm -r typecheck`: exit 0, with 9 x `typecheck: Done`.
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
| packages/engine | 61 | 61 | 0 |
| **Total** | **269** | **269** | **0** |

- `python contracts/verify_contracts.py`: `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`, exit 0.

### Notes for the checker (cycle 1)

- `resumeScribe` (the API) decides `already_resolved`, not the graph. A caller that bypasses `resumeScribe` and calls `graph.invoke(new Command(...))` directly still gets LangGraph's cached replay. The supported entry point is guarded and documented.
- After a crashed write, the decision is recorded but there is no result. A resume with a response then returns `already_resolved` with `result: null`, and the retry path is `resumeScribe(graph, null, ...)`.
- The schema-error check is `instanceof ZodError || name === "ZodError"`, so a duplicated zod copy in the provider package cannot turn a schema error into a throw that is never retried.

## Fix cycle 2 (ISS-t-007-rev-8 high / ISS-t-007-c1-2, ISS-t-007-c1-1)

**Cycle-2 diff range:** `d80dc43..HEAD`. This is the single commit "fix(engine,db): t-007 cycle 2 — atomic resume claim (scribe_resolutions unique threadId), array-contains fake". `d80dc43` is "qa: t-007 fix cycle 2 (senior Block overrides cycle-1 PASS)".

**Files in the cycle-2 diff:**
- `packages/db/src/collections.ts`: `COLLECTION_NAMES.scribe_resolutions`, `ScribeResolutionDoc`, `scribeResolutionsCollection`.
- `packages/db/scripts/db-init.ts`: INDEX_PLAN gets `scribe_resolutions_threadId_unique` (unique `{threadId:1}`, no partial filter) and `scribe_resolutions_studentId` (the ISS-027 plain index, used for B15/T-011 erasure).
- `packages/db/tests/fakes.ts`: `matchesFilter` now uses `valueMatches`, which follows Mongo array semantics.
- `packages/db/tests/db-init.test.ts`: 3 new tests, and `scribe_resolutions` is added to the ISS-027 studentId list.
- `packages/engine/src/scribe/graph.ts`: `resumeScribe`, `compileScribeGraph`, `approvalResponseHash`, and the `already_resolved.sameAsWinner` field.
- `packages/engine/tests/scribe.test.ts`: 6 new tests.
- This manifest.

This cycle deliberately touches `packages/db/src/**`, because the brief requires the new collection and accessor there.

**Not touched:** `.claude/**`, `docs/DECISIONS.md`, `scripts/**`, `packages/engine/src/guards/**`, `pnpm-lock.yaml`, and `qa/issues.jsonl`, which the checker owns.

**TDD RED.** The tests were written first, and their outputs are in the scratchpad (`t007c2-red-db.txt`, `t007c2-red-engine.txt`).
- db: `tests 73 | fail 4`:
  - ISS-027 failed on `collection "undefined"`.
  - The rev-8 name test failed with `actual: undefined, expected: 'scribe_resolutions'`.
  - The rev-8 fake-index test failed with `Cannot read properties of undefined (reading 'keys')`.
  - c1-1 failed with `the correct purpose must NOT come back empty: actual [], expected ['f1','f2']`.
- engine `tests/scribe.test.ts`: `tests 32 | pass 27 | fail 5`.
  - (a) and (b) failed with `exactly one caller may be told its decision was applied, got done,done`. This reproduces the senior's finding.
  - (d) failed with `got done,done,done,done,done`.
  - The crash-after-claim test failed.
  - c1-1 failed with `the consented purpose must not silently return zero`.
  - (c), the identical approves, was already green: both calls returned done and D-012 prevented a double write.

| Issue | Fix (file:function) | Evidence (tests) | Status |
|---|---|---|---|
| ISS-t-007-rev-8 / c1-2 | `graph.ts:resumeScribe`. With a response, it keeps the c0-1 pre-check: a decision already recorded in state means `already_resolved`. If an interrupt is pending, it computes `decisionFromResponse(parsed, proposedFacts)` and then **`insertOne`s the claim** `{_id: threadId, threadId, studentId, decision, response, responseHash: sha256(canonical JSON), claimedAt}` into `scribe_resolutions` **before** `graph.invoke`. On 11000 it re-reads the claim and returns `already_resolved` with the **winner's** `decision`, its own `attempted` response, `result` (null while the winner is in flight), and `sameAsWinner` (true when the hashes are equal). The loser never invokes, so there is one claim, one invoke and no double write. Non-11000 errors propagate. A graph that was not built by `compileScribeGraph` is refused (fail closed, WeakMap lookup of the Db). | tests/scribe.test.ts, every one with `Promise.allSettled`: **(a)** two different edits: exactly 1 `done`, the other is `already_resolved` with the winner's edit values, and the read-back open budget equals the winner's value with no double write. **(b)** approve vs reject, in both orders: the same property; persisted = winner (0 facts if reject won, 2 facts and 4 edges if approve won). **(c)** two identical approves: one `done` and one `already_resolved` with `sameAsWinner: true`; 2 facts, 4 edges. **(d)** 5 concurrent mixed resumes (2 different edits, 2 rejects, 1 approve): exactly 1 `done`, 4 `already_resolved` all carrying the winner's decision, persisted = winner; a later resume is also `already_resolved`. Stability: `scribe.test.ts` was run 8 times in a row, 32/32 each time. | READY FOR CHECK |
| Crash after the claim, before the invoke | `resumeScribe(null)`: if there is **no decision in state, an interrupt is still pending and a claim exists**, it resumes with `Command({resume: <the CLAIMED response>})`, so exactly the decision that won the claim is applied. Every other null resume behaves as before (`invoke(null)`, the D-012 write retry). The claim is never deleted, so a crashed claim cannot be re-won by a different decision. The docstring notes that recovery is not itself claimed (run it from the retry job, not concurrently with an in-flight winner); even then, D-012 keeps the write idempotent. | "ISS-t-007-rev-8: a crash AFTER the claim but BEFORE graph.invoke ...": the first invoke throws after the claim, and 0 facts are written. A rival approve gets `already_resolved`, `result: null`, the CLAIMED edit value `[1800000]` and `sameAsWinner: false`, and still 0 facts. Then `resumeScribe(null)` returns `done` / `written`, and the read-back budget is 1800000 with 1 fact. The existing sequential tests still pass: c0-1 (both), D-012 crash mid-write, and D-012 fork. | READY FOR CHECK |
| ISS-t-007-c1-1 | `packages/db/tests/fakes.ts:valueMatches`, used by `find`, `findOne`, `findOneAndUpdate`, `updateOne` and the partial-index filter. A scalar filter against an array field matches when the array contains it. An array filter matches an exactly-equal (order-sensitive) array or an equal element. Everything else is strict equality, as before. | db: "ISS-t-007-c1-1: find({purposeTags: scalar}) matches ...": profile_synthesis gives f1,f2; application_filling gives f2,f3; marketing gives 0; exact-array equality matches, and reordered does not. engine: "ISS-t-007-c1-1: the scribe's written facts are found by a purpose-filtered find() ...": profile_synthesis gives 2 and application_filling gives 0. packages/db stays green at 73/73 (70 existing + 3 new). | READY FOR CHECK |

### Falsification, cycle 2

The script is `scratchpad/t007c2_falsify.py`. For each guard it makes an assert-found replace, runs the package suite through `pnpm --filter`, and restores the original in a `finally` block. `md5sum -c` confirmed all 3 mutated files were byte-identical afterwards.

| Guard | Mutation | Observed RED |
|---|---|---|
| F1 atomic claim | `await claims.insertOne(claim);` becomes `void claim;` | engine fail=4: (a), (b), (d), and crash-after-claim |
| F2 winner's decision to the loser | the 11000 branch returns the loser's OWN decision instead of the re-read claim's | engine fail=4: (a), (b), (d), and crash-after-claim |
| F3 crash recovery via claim | `if (claim)` becomes `if (false && claim)` in the null path | engine fail=1: crash-after-claim |
| F4 array-contains match | `valueMatches` array branch becomes `return false` | db fail=1 (c1-1); engine fail=1 (c1-1 read-back) |
| F5 unique index | `unique: true` dropped from `scribe_resolutions_threadId_unique` | db fail=2: both rev-8 db tests |
| RESTORED | originals written back | db `tests 73 pass 73 fail 0`, engine `tests 67 pass 67 fail 0` |

### Actual outputs, cycle 2 (the maker's own run, from the worktree root)

- `pnpm install`: `Done in 608ms using pnpm v10.33.0`, exit 0. `pnpm install --frozen-lockfile`: exit 0.
- `pnpm -r typecheck`: exit 0, with 9 x `typecheck: Done`.
- `pnpm -r test`: exit 0.

| Package | tests | pass | fail |
|---|---|---|---|
| apps/api | 1 | 1 | 0 |
| apps/web | 1 | 1 | 0 |
| packages/providers | 8 | 8 | 0 |
| packages/schemas | 50 | 50 | 0 |
| packages/observability | 57 | 57 | 0 |
| packages/db | 73 | 73 | 0 |
| mcp/university-kb | 9 | 9 | 0 |
| mcp/student-profile | 12 | 12 | 0 |
| packages/engine | 67 | 67 | 0 |
| **Total** | **278** | **278** | **0** |

- `python contracts/verify_contracts.py`: `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`, exit 0.

### Notes for the checker (cycle 2)

- **The fake's atomicity is faithful.** `FakeCollection.insertOne` checks and sets in one synchronous step, with no `await` between them, the same way a single server-side unique-index insert is atomic. The race is real: the RED run shows both callers passing `getState` before either invoked.
- **Live DB.** `scribe_resolutions` and its indexes exist only after `db:init` runs, which is a human-gated live step and was not run here. Without the unique index, `_id = threadId` still gives the same one-claim guarantee through Mongo's built-in `_id` index. The explicit threadId index is belt and braces, and it is what INDEX_PLAN declares.
- **B15/T-011.** Claim docs hold the decision's fact values. They carry `studentId`, which has a plain index, so erasure can find them. Add `scribe_resolutions` to the T-011 purge list together with the checkpoint collections.
- **Remaining behaviour, documented.**
  - A recovery `resumeScribe(null)` that runs concurrently with an in-flight winner is not claimed. D-012 keeps its write idempotent.
  - A caller that bypasses `resumeScribe` (`graph.invoke(new Command(...))`) bypasses the claim. That entry point is not exported.

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
pnpm -r test                        # 269 tests, 0 fail, exit 0 (cycle 1; cycle 0 was 261)
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
