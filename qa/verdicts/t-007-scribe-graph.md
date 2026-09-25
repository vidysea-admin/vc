# Verdict: t-007-scribe-graph

**Verdict:** PASS
**Cycle checked:** 1
**Date:** 2026-09-25
**Cycle-1 diff:** `7e8474d..7045c62`
**Contract rows:** B2, B3, B4, B5, B6, B9, B14 (as touched by this cycle's fixes)
**Issues in scope:** ISS-t-007-rev-4, ISS-t-007-rev-5, ISS-t-007-c0-1, ISS-t-007-rev-1, plus the low `@vc/db/testing` export item

## 1. Verify commands (fresh, in the worktree)

```
pnpm install                          -> Done in 607ms, exit 0
pnpm install --frozen-lockfile        -> Done in 546ms, exit 0
pnpm -r typecheck                     -> 9/9 packages "Done", exit 0
pnpm -r test                          -> exit 0
python contracts/verify_contracts.py  -> "no frozen contracts yet (research phase) -- PASS by vacuity", exit 0
```

Test totals (recomputed independently, matches the manifest's table exactly — 269 total, 0 fail):

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

No regression vs cycle 0 (261 -> 269, +8 for the 8 new cycle-1 tests; every cycle-0 test name still present and green).

## 2. Own hostile probes (independent of the maker's suite)

Script: `C:\Users\Lenovo\AppData\Local\Temp\claude\d--vc\4028b141-b4f9-4793-84a0-f900414a84fb\scratchpad\t007c1-probes\checker-c1.ts`, run with `npx tsx` (cwd = the worktree root, so bare workspace specifiers resolve) against the UNMODIFIED worktree code at `7045c62`, using `@vc/db/testing`'s driver-faithful fake with `INDEX_PLAN`'s real unique indexes declared, `MockProvider`/`MemorySaver`, and (for the MCP probe) the student-profile package's own fake + a real `@modelcontextprotocol/sdk` `Client`/`InMemoryTransport` pair. Nothing touched `MONGODB_URL` or Gemini. **45/45 of my own assertions passed** (full transcript in the scratchpad script's stdout, reproduced below by section).

### rev-4 — terminal partial_conflict, correct writes, idempotent retry, non-conflict propagation
- **3-of-3 conflict** (a harder variant than the maker's 2-of-2: three facts, a rival writer takes the THIRD): terminal `partial_conflict`, `key: "intake"`, `writtenFactIds` exactly `[targetCountry._id, budget._id]` in order. Read-back: both facts 1 and 2 are open with the approved values; the rival's `intake` doc (`value: "Spring 2028"`) is untouched — no silent overwrite.
- **Repeated resume writes nothing more:** `resumeScribe(graph, null, ...)` after the terminal result returns the same `partial_conflict` without throwing; `facts.size()` unchanged.
- **A `PartialApplyError` with a non-conflict cause still propagates** (the brief's specific ask, not exercised as its own labelled case by the maker): forced `edges.updateOne` to throw a plain `Error("simulated network timeout...")` on fact 2's first edge write. `writeApproved` re-threw (did not swallow it into a `ScribeResult`); the thrown value `instanceof PartialApplyError` with `cause` **not** `instanceof FactConflictError`, confirming `nodes.ts:writeApproved`'s `else { throw err; }` branch is real, not dead code. Both fact **documents** had already landed at that point (`written.push` precedes each fact's edge writes in `facts.ts::applyApprovedDiff`), matching `PartialApplyError.writtenIds` exactly (2 ids) — read back, not assumed.

### rev-5 — purpose stripping, hostile tags, and the MCP boundary
- Hostile **model** tags (`application_filling`, `counselling_session`, a made-up `garbage-tag-xyz`) on extracted facts: both the pre-approval request and the post-approval read-back carry **exactly** `["profile_synthesis"]`.
- Hostile **edit** tags (same three, submitted by the "counsellor"): read-back is exactly `["profile_synthesis"]`.
- **MCP `get_profile_facts` with `purpose: "application_filling"`:** built a real MCP `Client`/`Server` pair over `InMemoryTransport`, seeded from the facts the scribe actually wrote, with consent covering `application_filling` too (isolating the purposeTags filter, not a consent refusal) — **zero facts returned**, confirmed against a **positive control** (the same student/purpose=`profile_synthesis` call returns both facts). This is the real end-to-end proof the brief asked for.
- **Finding surfaced while building that probe (logged ISS-t-007-c1-1, low, non-blocking):** chaining the engine fixtures' own `@vc/db/testing` fake straight into the MCP server does **not** work either way — that fake's `find()` is explicitly "equality-only matching, like findOne" (`packages/db/tests/fakes.ts:131`), so `purposeTags: "profile_synthesis"` (an array-contains-scalar query) never matches, for **any** purpose, correct or not. Proven: querying the *correct* purpose `profile_synthesis` through that same fake also returns 0 facts, which would be a false negative if read alone. Not a production bug — real Mongo and the MCP package's own separate, array-aware fake (`mcp/student-profile/tests/fakes.ts`) both handle this correctly, and the pre-existing MCP purpose-filter test already proves the read side. But it means no test in the repo can currently chain "scribe write" and "MCP purpose-filtered read" through one shared, driver-faithful fake and get a meaningful result — worth closing before anyone relies on that combination.

### c0-1 — orderings beyond approve/reject, concurrency, and bypass reachability
- **Approve then edit with a different value** at the same pre-approval checkpoint fork: `already_resolved`, `attempted.action === "edit"`, `decision.approve === true` (the original), and — critically — **Germany was never written** (`h.facts.all()` has no doc with that value); only the original approved fact docs exist.
- **Two concurrent resumes of the same paused thread** (`Promise.allSettled([resumeScribe(...approve), resumeScribe(...reject)])`): both calls settled as `"written"` (a TOCTOU race in `resumeScribe`'s `getState`-then-decide pre-check — both callers can pass it before either records a decision). The **data** stayed safe: exactly one fact doc landed (D-012's contentHash dedupe), never a double-write or mixed state. **Finding (logged ISS-t-007-c1-2, low/medium, non-blocking):** under true concurrency (not the sequential case ISS-t-007-c0-1 fixes), the losing caller's decision is silently discarded *without* an `already_resolved` signal — it is told `status: "written"` even though it submitted `"reject"`. No B3 violation (nothing unapproved was written), but it's the same class of "reported outcome doesn't match submitted decision" concern as the original c0-1 finding, one layer down at the concurrency boundary that c0-1's fix doesn't cover. Recommend closing before any caller does concurrent resumes on the same thread (unlikely today — T-008 doesn't exist yet).
- **Bypass reachability**, checked directly: `@vc/engine`'s barrel (`scribe/index.ts` -> `graph.ts`) does **not** re-export `Command` or `interrupt` — confirmed via the imported namespace (`"Command" in EngineAll` is `false`). It **does** export `compileScribeGraph` (the graph object). So the documented bypass (`graph.invoke(new Command(...))`) requires a caller to additionally import `Command` from the separate `@langchain/langgraph` package — it is not one call away through `@vc/engine`'s own surface, matching the manifest's claim.

### rev-1 — bounded retry, terminal failure, and the non-schema-error gap
- **Malformed once, recovers** (own variant, on the **summary** node, with a differently-shaped malformed payload — a missing required key, not the maker's wrong-typed field): 2 provider calls (1 try + 1 retry, checked via `MockProvider.calls` count), reaches `awaiting_approval`.
- **Always-malformed extraction** (own variant: the provider returns an array instead of an object) ends in terminal `extraction_failed`, exactly 2 calls (bounded, no runaway retry), zero facts/edges.
- **A provider that throws a non-schema error propagates** (the brief's specific ask; the maker's suite only exercises schema-shaped failures for rev-1 itself — the closest existing case is the unrelated D-012 crash test): set `fact-extraction`'s canned response to a function that throws `Error("ECONNRESET: simulated network failure...")`. `startScribe` rejects with that exact error (not a `ZodError`, message unmangled), and — checked via `MockProvider.calls` count — **exactly 1 call, no retry**, confirming `generateWithRetry`'s `if (!isSchemaError(err)) throw err;` really does skip the retry loop for non-schema failures. Repeated on the **summary** node for the same result.

## 3. Findings / issues logged this cycle

- **ISS-t-007-c1-1** (low, non-blocking) — `@vc/db/testing`'s `find()` is equality-only and cannot serve array-contains-scalar queries (`purposeTags: purpose`), so no test can currently prove the scribe-write -> MCP-purpose-read chain end-to-end through one shared, driver-faithful fake.
- **ISS-t-007-c1-2** (low/medium, non-blocking) — `resumeScribe`'s `already_resolved` guard has a TOCTOU race window under true concurrency: two callers resuming the same still-open interrupt at once can both pass the pre-check and both report a decision-matching-looking result, even though only one decision is ever actually applied (safe by D-012 idempotence, but the losing caller isn't told it lost).

## 4. Verdict rationale

Every item the brief named is verified by outcome, with hostile probes of my own that differ from the maker's own test suite in shape (3-of-3 conflict vs 2-of-2, a non-conflict-cause `PartialApplyError`, hostile tags including a made-up value plus the actual MCP tool call with a positive control, approve-then-edit and genuine `Promise.allSettled` concurrency, and a non-schema provider error on two different nodes). All 45 of my own assertions pass; the full verify suite is green at 269/269 with no regression from cycle 0's 261; `verify_contracts.py` passes by vacuity. Building the rev-5 MCP probe surfaced a real cross-package test-fake inconsistency (ISS-t-007-c1-1), and the concurrency probe surfaced a real, narrower race in the c0-1 fix (ISS-t-007-c1-2) — both are genuine, reproducible, and worth closing, but neither violates a contract row (B3's "no unapproved value is ever written" holds in every scenario I constructed, including the concurrent race) and neither is in the brief's required-before-merge scope (T-008, which would be the first real caller of concurrent/chained access, does not exist yet). ISS-t-007-rev-4, rev-5, c0-1 and rev-1 are marked fixed. The unit **PASSes** cycle 1, with ISS-t-007-c1-1 and ISS-t-007-c1-2 carried forward as non-blocking follow-ups.
