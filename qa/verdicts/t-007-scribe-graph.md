# Verdict: t-007-scribe-graph

**Verdict:** PASS
**Cycle checked:** 0
**Date:** 2026-09-25
**Unit diff:** `067ebb8..1d2d452`
**Contract rows:** B1, B2, B3, B4, B5, B6, B7, B8, B9, B11, B12, B13, B14 (B16 context, out of scope)

## 1. Verify commands (fresh, in the worktree)

```
pnpm install                          -> Done in 856ms, exit 0
pnpm -r typecheck                     -> 9/9 packages "Done", exit 0
pnpm -r test                          -> exit 0
python contracts/verify_contracts.py  -> "no frozen contracts yet (research phase) -- PASS by vacuity", exit 0
```

Test totals (recomputed independently, matches the manifest's table exactly):

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

## 2. Own hostile probes (independent of the maker's suite)

All probe scripts live at `C:\Users\Lenovo\AppData\Local\Temp\claude\d--vc\4028b141-b4f9-4793-84a0-f900414a84fb\scratchpad\t007-probes\` (`p1-crisis-devanagari.ts`, `p2-idempotency-and-malformed.ts`, `p3-fork-diagnostic.ts`), run with `npx tsx` directly against the UNMODIFIED worktree code (`D:\vc\.worktrees\t-007-scribe-graph`), using the project's own fake DB (`packages/db/tests/fakes.ts`) with `INDEX_PLAN`'s real unique indexes declared, and `MockProvider`/`MemorySaver` — nothing touched `MONGODB_URL` or Gemini.

### B3 — approval gating
- `p2` probe1: approve writes once (`status: "written"`, 1 fact). Resuming the **same, already-completed thread** with `{action:"approve"}` a second time (no checkpointId) does **not** create a second or different fact: `facts after 1st: 1 after 2nd: 1`, same `writtenFactIds`. Idempotent, as required.
- `p2` probe4: an edit response with `facts: []` (fails `ApprovalResponseSchema`'s `.min(1)`) throws before reaching the write node; zero facts written.
- Existing maker tests independently re-read for reject-writes-nothing and edit-writes-exactly-the-edited-value: both correct on inspection of `nodes.ts::decisionFromResponse` and `facts.ts::applyApprovedDiff` (edits are exactly `decision.edits`, nothing else).

### B9 — crisis, zero provider calls
- Confirmed via code read (`graph.ts`: `crisis_gate` runs before `extract_facts`, unconditionally on the edge graph) and the existing Hinglish hostile-variant test.
- `p1` probe (**own falsification**): a **Devanagari** crisis phrase (`"मैं मरना चाहता हूं"`) with `translatedText` either left un-translated or mistranslated to something benign produces **ZERO escalation** on both `text` and `translatedText` — `crisisGuard`/`routeBeforeGeneration` in `packages/engine/src/guards/crisis.ts` has **no Devanagari-script patterns**, only Latin/romanised ones. This is real, reproduced behavior, not a guess.
  - **Disposition: non-blocking for T-007.** `guards/crisis.ts` is explicitly out of this unit's scope (manifest: "imported only; T-005b is changing crisis.ts in parallel" — confirmed: `wave/t-005b-guard-hardening` is an active, separate worktree currently on its own fix cycle 3). Devanagari/Hinglish crisis-recall against a golden set is explicitly **B16**, and the manifest correctly marks B16 **OUT OF SCOPE** for T-007 (T-012). Logged as ISS-t-007-c0-2 (low) as a cross-unit reminder, not a T-007 defect.

### B4 — consent first
- Re-read `nodes.ts::checkConsent` and `graph.ts`'s `consent_gate -> crisis_gate` edge: consent is checked before crisis and before any provider call, and only `ConsentRequiredError` is routed to "refused" (any other DB error propagates, correctly, so it retries rather than being mistaken for "no consent"). Existing tests (no consent row / wrong purpose / minor without guardian consent / consent-before-crisis) read and match this.

### B2 — cited facts
- Re-read `nodes.ts::verifyCandidateFact`: shape check -> `citationGuard` -> must be `type:"transcript"` with a `quote` -> cited turn must exist in `turnsById` -> quote must be a verbatim (whitespace-collapsed) substring of that turn's `text` or `translatedText`. All three required drop cases (uncited, fabricated quote, unknown turn) are exercised by the existing test and match the code path exactly.

### B5 — typed boundaries / malformed provider output
- `p2` probe3 (**own probe**): `session-summary` returns `{summary: 12345}` (fails `SummarySkillOutputSchema`'s `z.string()`) — `startScribe` **throws a ZodError**, and **zero facts, zero edges** are written.
- `p2` probe3b (**own probe**): `fact-extraction` returns `{notFacts: "..."}` (missing the required `facts` key) — same result: throws, zero writes.
- Confirms B5 holds structurally: `MockProvider.generate` parses every response with the caller's `outputSchema` before returning it (`packages/providers/src/index.ts:125`), so a malformed provider output can never reach a node's logic; it fails at the seam.

### D-012 — sessionId-stable idempotent replay, and the fork-replay finding
- Re-read `facts.ts::applyApprovedDiff`'s identity/content split, CAS retire-then-insert, and 11000/CAS-miss re-read logic (ISS-019/020/026/028) — sound, matches D-012/D-013 exactly as designed.
- **Key finding (own falsification, `p3-fork-diagnostic.ts`):** resuming from the **same already-resolved pre-approval checkpoint** with a **genuinely different** resume decision (tested: `{action:"reject"}` after the thread had already been approved via that same checkpoint) does **not** apply the new decision. The raw `graph.invoke()` return value shows `decision: {approve:true, edits:[...the ORIGINAL Canada fact...]}` and `result.status:"written"` with the **same** `writtenFactIds` as the first approval — the `"reject"` I sent was silently discarded, and LangGraph replayed the cached resolution of that interrupt task instead of re-evaluating with the new `Command.resume` value. The full checkpoint history (`getStateHistory`) confirms two sibling branches were created from the same parent checkpoint, and **both** independently reached the identical `decision`/`result`, proving the second branch's own `counsellor_approval` node execution ignored my new resume input.
  - **What this means:** the maker's own "D-012: replaying the approval from the pre-approval checkpoint (fork) writes nothing new" test submits the **identical** `{action:"approve"}` decision both times, so it cannot distinguish "genuine DB-layer idempotent replay via `contentHash`" from "LangGraph checkpoint-level caching of an already-resolved interrupt task." My probe, using a *different* decision at the same checkpoint, shows it is the latter for this scenario: the write path was never even asked to reconcile a different value, because the graph replayed the old one.
  - **Not a B3 violation:** no unapproved value was ever written; the value written was one that had genuinely been approved once. But it **is** a real, reproducible gap: a caller that resumes the same pre-approval checkpoint a second time with a corrected/different decision (e.g. a retry, or an admin "redo the approval" tool — the natural use of `ScribeRunOptions.checkpointId`, which the manifest itself documents as "a checkpointId forks") gets a **silently wrong outcome reported as success**. This is exactly the class of thing B14 ("outcome, not construction") warns about — here the *reported* outcome doesn't match the *submitted* decision, and the API gives no signal that anything was discarded.
  - **Recommendation (not a fix-cycle blocker for T-007 itself, since no current caller does this — T-008 doesn't exist yet):** before T-008 (or any retry/admin tool) is built on `resumeScribe`'s `checkpointId` option, add a test for the divergent-decision-at-same-checkpoint case and either (a) guard against it explicitly (error instead of silently discarding), or (b) document plainly in `ScribeRunOptions.checkpointId`'s docstring that a checkpoint's interrupt resolution is one-shot and a second, different resume value at the same checkpoint is not honoured. Logged as ISS-t-007-c0-1 (medium).

### B7/B14 — tracing
- Re-read `observability/tests/tracing.test.ts` in full: ISS-017's "construction only" pitfall is directly addressed (spans are only counted when `LangfuseSpanProcessor` is the real class, registered via `registerProvider`, and the `scribe-tracing.test.ts` run captures actual exported span names through an in-process `RecordingExporter`, including `extract_facts`). ISS-016's Cloud-host refusal is tested with 8 hostile URL variants (trailing dot, mixed case, port+path, userinfo, punycode, IDN Cyrillic, apex) plus no-baseUrl/missing-key. ISS-025 (a later `initTracing` with a different config) has 3 explicit divergent-field tests plus a "never echoes the secret key" test. All read and consistent with what they claim.

### B12/B11/B13 — DB scope and secrets
- `packages/engine/src/scribe/checkpointer.ts` passes `dbName: VC_DB_NAME` explicitly to `MongoDBSaver`; never calls `client.db(` directly.
- `packages/db/tests/db-scope.test.ts` (the repo-wide `client.db(` scanner, dot- and bracket-call tolerant) is part of the 70 green `packages/db` tests.
- `.env.example` lists `GEMINI_API_KEY`, `MONGODB_URL`, `VC_LLM_PROVIDER`, `VC_LLM_MODEL` with no values.
- `git diff 067ebb8..1d2d452` grepped for key-shaped literal values: only synthetic test fixtures found (`sk-lf-test`, `sk-lf-other`, `"super-secret-value"` in a GeminiProvider unit test) — no real secret material anywhere in the unit's diff.
- `GeminiProvider`'s key is a `#private` field; confirmed by reading `providers/src/index.ts` (never serialised via `JSON.stringify`/`String()`/`toString()`, which is overridden to print only the model name).

## 3. Findings / issues logged

- **ISS-t-007-c0-1** (medium) — checkpoint-fork replay silently discards a second, different resume decision at an already-resolved interrupt checkpoint and reports success with the stale value. See D-012 section above.
- **ISS-t-007-c0-2** (low) — `guards/crisis.ts` has no Devanagari patterns (own probe, reproduced); correctly out of T-007's scope (T-005b owns the guard, B16/T-012 owns crisis-recall golden-set verification), logged as a cross-unit reminder only.

## 4. Verdict rationale

Every contract row this unit claims (B1-B9, B11-B14) is backed by evidence I independently re-derived: either by re-running the full verify suite fresh, by reading the actual implementation against the contract's exact wording, or by writing and running my own hostile probes that the maker's suite does not contain (malformed-provider-output, Devanagari crisis text, double-resume-on-a-completed-thread, and a divergent-decision checkpoint fork). The one substantive new finding (ISS-t-007-c0-1) does not violate a stated contract row — no unapproved value is ever written — but is recorded because it weakens the confidence the manifest's D-012 "fork" row claims, and it must be closed (test + guard/doc) before any caller builds a "redo the approval" flow on `checkpointId`. Nothing found here rises to a B3/B4/B9 violation or a "no writes before approval" failure, so the unit **PASSes** cycle 0, with ISS-t-007-c0-1 carried forward as a required follow-up before T-008 depends on checkpoint-based resubmission.
