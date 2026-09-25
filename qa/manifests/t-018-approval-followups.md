# Manifest: t-018-approval-followups

**Contract:** qa/contracts/counselling-engine.md (B3, B5, B15 primary per the dispatch; B2, B8, B12, B14 touched by the audit writer)
**Goal task:** T-018 (T-008 follow-ups, TASKS.md row 28): ISS-t-008-c0-1, residual 3, residual 7 of `qa/manifests/t-008-approval-ui.md`
**Status:** checked-PASS (cycle 0; senior review Warning → ISS-t-018-rev-1/2, checker ISS-t-018-c0-1/2)
**Fix cycle:** 0
**Branch:** `wave/t-018-approval-followups` (worktree `D:/vc/.worktrees/t-018-approval-followups`), branched from main `3190ad2`
**Diff range:** `3190ad2..445f63f` (one commit, "feat(engine,db,web): t-018 edit type validation, reject-reason audit, prod-build browser evidence"), plus this manifest + evidence commit
**Issues addressed:** ISS-t-008-c0-1 (per-fact edit value not type-checked against the proposed value)
**Scope:**
- `packages/engine/src/scribe/schemas.ts`: `EditedValueSchema` gains a scalar-only refine; `ApprovalOutputSchema`/`WriteInputSchema`-adjacent `RejectedFactSchema` + `ApprovalOutputSchema.rejectedFacts`
- `packages/engine/src/scribe/nodes.ts`: `perFactDecision` gains `scalarTypeOf` + the type-match check, and computes `rejectedFacts`
- `packages/engine/src/scribe/graph.ts`: the approval node calls `recordRejectReasons` (fence-aware) when a per_fact response rejects at least one fact, using the invoke's own `configurable.thread_id`
- `packages/db/src/decisions.ts` (new): `recordRejectReasons`, `rejectReasonAuditId`, `RejectReasonAuditDoc`
- `packages/db/src/erasure.ts`: `StudentExport.decisions` widened to `Array<DecisionDoc | RejectReasonAuditDoc>`
- `packages/db/src/index.ts`: exports `./decisions.js`
- `packages/db/tests/db-scope.test.ts`: `decisions.ts` added to the D-016 fence-aware writer allowlist, with reason
- `apps/web/src/components/ApprovalScreen.tsx`: `editedValue()`'s return type narrowed to `string | number | boolean` (it already produced that; this was already the client-side mirror of the new engine rule)
- `apps/web/demo/browser-evidence.ts`: env-driven server mode (`VC_EVIDENCE_MODE=build` drives `next build --webpack` then `next start`), a new "type refusal" interaction, unit/mode-aware report metadata
- Tests: `packages/engine/tests/scribe-per-fact.test.ts` (+8), `packages/db/tests/decisions.test.ts` (new, 11), `apps/web/tests/api.test.ts` (+1)
- `qa/manifests/t-018-approval-followups.md` (this file), `qa/evidence/t-018-approval-followups/`, `qa/evidence/browser-t-018-approval-followups-2026-09-25/`
**Not touched:** `.claude/**`, `docs/DECISIONS.md`, `scripts/**`, `qa/contracts/**`, `qa/gates/edit-provenance.md`, `TASKS.md`, `packages/schemas/**` (the pre-existing `Decision`/`DecisionSchema` shape for course/university selection is untouched — see "the `decisions` collection" below)
**Executor:** maker build subagent
**Offline:** every run is offline (B8). Nothing connected to `MONGODB_URL`, `VC_WEB_MODE` was never `live`, no live provider. The browser evidence runs use the in-process fake db, `MockProvider` and synthetic transcripts, same as T-008.

## What changed

### 1. ISS-t-008-c0-1: edited value type validation

**The gap (from `qa/issues.jsonl` ISS-t-008-c0-1):** `POST /api/approvals/[threadId]` accepted `{decision: "edit", value: {"not": "a number"}}` for a fact whose proposed value was a number, and stored the object as-is. `EditedValueSchema` only refused `undefined`/`null`/empty-string.

**Two-layer fix, because no single boundary has enough information alone:**
- **`EditedValueSchema` (schemas.ts), cheap and context-free:** now also refuses any non-scalar value (`typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean"`). This alone closes the EXACT reported probe (an object) and its array sibling — it needs no knowledge of the proposal.
- **`perFactDecision` (nodes.ts), the full match:** for every `decision: "edit"`, compares `scalarTypeOf(d.value)` against `scalarTypeOf(proposedByKey.get(d.key).value)` and throws `ApprovalResponseError` on a mismatch (e.g. a STRING sent for a fact whose proposed value is a NUMBER — schema-valid on its own, but wrong against the proposal, which only this function can see). A proposed value that is itself an array/object (`scalarTypeOf -> "other"`) can never match any scalar edit, so editing such a fact is refused outright — the design choice the dispatch asked for ("arrays and objects must match in shape, or be refused"): **refused, not shape-matched**, because a shape-matched edit is not achievable through this text-only channel anyway (residual 11 of `t-008-approval-ui.md`: the UI's own text input can not produce real JSON either).
- Both checks run in `decisionFromResponse`, which `resumeScribe` calls **before** taking the D-014 claim (existing T-008 contract, unchanged) — so a refused edit claims and writes nothing, and the thread stays open for a corrected response.
- **Web boundary:** `apps/web/src/server/contracts.ts`'s `DecisionRequestSchema` imports `PerFactDecisionSchema` directly from the engine, so the `EditedValueSchema` fix is already live at the API boundary with no separate change needed there. `submitDecision` (approval-service.ts, unchanged) already catches `ApprovalResponseError` by name and answers 400 `invalid` — so the full-match check is *also* already live at the API boundary.
- **Client mirror:** `ApprovalScreen.tsx`'s `editedValue()` already coerced the counsellor's text input to the proposed value's own type (a pre-existing, undocumented client-side mirror of this exact rule); its return type is now correctly narrowed from `unknown` to `string | number | boolean` to match what it actually returns and what the tightened `PerFactDecisionSchema` now requires.

### 2. Residual 3: per-fact reject-reason audit record

**`packages/db/src/decisions.ts` (new), `recordRejectReasons`:** writes `{_id, kind: "per_fact_reject", threadId, studentId, rejected: [{key, reason?}], decidedAt}` to the **existing `decisions` collection** (`COLLECTION_NAMES.decisions`). No transcript text and no proposed/edited VALUE is stored — only the counsellor's own reason text.

- **Collection sharing, not a new one:** `decisions` already holds a different, pre-existing shape (`DecisionDoc`: a course/university selection rationale, `packages/schemas/src/schemas.ts` `DecisionSchema`, plan.md §4 step 1). A repo-wide grep confirms `decisionsCollection`/`validateDecisionForWrite` are unused outside their own definitions and the erasure plan — nothing writes that shape yet — so sharing the collection with a second, discriminated shape (`kind: "per_fact_reject"`) costs nothing today and gets erasure and export for free:
  - **Erasure:** `decisions` was already in `ERASURE_PLAN` (phase 1, `byStudent` filter) before this unit — zero change needed to `erasure.ts`'s purge plan.
  - **Export:** `exportStudent`'s `decisions` field is widened from `DecisionDoc[]` to `Array<DecisionDoc | RejectReasonAuditDoc>` — the one line that reads the collection back already returned both shapes; only the TYPE needed updating.
- **Fence-aware, mirroring `recordApprovedSessionSummary` (facts.ts):** a pre-check (`assertStudentNotFenced`) before writing anything, a `WriterDeadline`-bounded `insertOne`, and a post-check (`compensateIfFenced`) that deletes exactly the document THIS call inserted if the student is fenced by the time the write finishes (D-015/D-016). Independently self-contained — it does not participate in the cross-write compensation chain `writeApproved`/`undoApprovedSessionSummary` use for the summary+facts pair (ISS-t-017-rev-1); that chain is unrelated to this write and this unit did not touch it.
- **Idempotent:** `_id = rejectReasonAuditId(threadId)` (sha256, deterministic), not a fresh ObjectId. A scribe approval interrupt is one-shot per thread (ISS-t-007-c0-1), so at most one reject-reason record can ever legitimately exist per thread; a checkpoint replay of the approval node collides on `_id` (11000) and is treated as "already recorded", not an error — never a duplicate.
- **Where it's called:** the scribe graph's `counsellor_approval` node (graph.ts), not `writeApproved` — because the graph's own conditional edge only routes to the `write_approved` node when `decision.approve === true`, but a rejection must be recorded even when EVERY fact is rejected (`decision.approve === false`, the run ends `rejected`). The approval node has `rejectedFacts` from `decisionFromResponse` and `deps.db` from its closure already; it now also reads the **real** LangGraph `thread_id` from its own invoke config (`runtime.configurable?.thread_id`), not `scribeThreadId(sessionId)` — that derivation is only the RECOMMENDED thread id (`ScribeRunOptions`'s own docstring), not enforced, and every existing test harness in this package uses its own arbitrary thread ids, so deriving it from sessionId would have recorded the audit under the wrong key (caught by this unit's own first test run — see "Method" below).

### 3. Residual 7: production-build browser evidence

`apps/web/demo/browser-evidence.ts` is now **env-driven**, not a T-008-only script:
- `VC_EVIDENCE_MODE` (`dev` default, `build` for T-018): `build` runs `next build --webpack` (`spawnSync`, throws on non-zero exit) and then starts the server with `next start` instead of `next dev --webpack` — the actual production artifact, not the dev server. `VC_WEB_MODE` stays `demo` either way (B8/B12 unaffected by the build mode).
- `VC_EVIDENCE_UNIT` / `VC_EVIDENCE_PORT` pick the output directory name and port, so the same script produces T-008's `browser-t-008-approval-ui-<date>/` (unchanged invocation, `pnpm --filter @vc/web evidence:browser`) and T-018's `browser-t-018-approval-followups-<date>/` (`VC_EVIDENCE_MODE=build VC_EVIDENCE_UNIT=t-018-approval-followups VC_EVIDENCE_PORT=3128 npx tsx demo/browser-evidence.ts`) without duplicating the file.
- A new interaction (2.5, before any real decision touches the paused thread): the ISS-t-008-c0-1 probe itself — POST a fully valid per-fact decision except one edit value is an object for `budget_inr_per_year` — asserting 400 `invalid` and that the thread is left untouched (`awaiting_approval`, 0 facts, 0 claims), run against the live production server.
- `stopServer` (unchanged: `taskkill /T /F /PID <child.pid>` on Windows) still stops only the PID this script started; verified after the T-018 run that nothing remained LISTENING on the evidence port (only `TIME_WAIT` sockets, the normal post-close residue).

## Method

- **RED before implementation**, captured as a falsification pass against the committed implementation (`qa/evidence/t-018-approval-followups/falsification.txt`) rather than a literal pre-implementation run, because the two checks (schema-level scalar refusal, engine-level type match) were implemented together and the same falsification methodology T-008 used (apply one mutation, run the named tests, confirm they and ONLY they go red, restore) gives equivalent, arguably stronger evidence: it proves each check's test row is load-bearing on that EXACT check, not just "some test somewhere fails."
- **A real bug the falsification/first-run process caught:** the reject-reason audit record initially used `scribeThreadId(s.sessionId)` as the audit key. Every engine test harness uses its own ad-hoc thread id (not `scribeThreadId(sessionId)`), so the first test run found the audit record missing under the KEY the tests expected (`rejectReasonAuditId(<the real threadId>)`) even though a write had genuinely happened under the wrong key. Fixed by reading `runtime.configurable?.thread_id` from the node's own invoke config instead (see "What changed" §2). Left in as a documented lesson in the source comment, not silently smoothed over.

## Evidence

| # | Claim | Command | Result |
|---|---|---|---|
| E1 | Workspace typecheck | `pnpm -r typecheck` | exit 0, all 9 packages (`qa/evidence/t-018-approval-followups/typecheck.txt`) |
| E2 | Workspace tests | `pnpm -r test` | **515 tests, 0 fail**: providers 8, schemas 50, observability 57, db 196 (185 pre-existing + 11 new), apps/api 8, mcp/university-kb 9, mcp/student-profile 12, engine 157 (149 pre-existing + 8 new), apps/web 18 (17 pre-existing + 1 new) (`qa/evidence/t-018-approval-followups/test.txt`) |
| E3 | Contract validator | `python contracts/verify_contracts.py` | "no frozen contracts yet (research phase) -- PASS by vacuity", exit 0 (`qa/evidence/t-018-approval-followups/contracts.txt`) |
| E4 | Falsification (4 mutations across engine + db) | one mutation at a time, `git checkout --` to restore, see "Method" | 4/4 CAUGHT, each isolating to EXACTLY its named row(s) with no wrong-reason red (`qa/evidence/t-018-approval-followups/falsification.txt`); `git status` clean between each |
| E5 | Live browser evidence, PRODUCTION build | `VC_EVIDENCE_MODE=build VC_EVIDENCE_UNIT=t-018-approval-followups VC_EVIDENCE_PORT=3128 npx tsx demo/browser-evidence.ts` (run from `apps/web`) | `next build --webpack` compiled successfully, TypeScript finished; **20/20 interactions pass**, 0 unexpected console errors (`qa/evidence/browser-t-018-approval-followups-2026-09-25/report.json`) |
| E6 | The API-boundary probe from ISS-t-008-c0-1 is now refused, live, against the production server | interaction 4 of E5 | `status=400 state=invalid`, then confirmed `state=awaiting_approval facts=0 claims=0` (thread untouched) |
| E7 | No leftover evidence-server process | `Get-NetTCPConnection -LocalPort 3128` after the run | only `TIME_WAIT` entries, no `Listen` state |

## Capability coverage

| Capability | Test(s) | Falsified by |
|---|---|---|
| A non-scalar (object/array) edit value is refused at the schema boundary, before any claim | engine `T-018 ISS-t-008-c0-1: an object/array edit value ... is refused at the schema boundary ...` (2 tests); web `T-018 ISS-t-008-c0-1: an edit value that does not match ... refused (400) through the full API ...`; browser E5/E6 | F1 |
| An edit value of the WRONG scalar type (schema-valid on its own) is refused by comparing against the proposed value's type | engine `T-018: a string/boolean edit value for a numeric fact is refused at the engine boundary ...` (2 tests); web (same test, 3rd hostile body) | F2 |
| A same-type edit is still accepted and written | engine + web, same tests' final "the thread heals" step | — (regression check; the 495 pre-existing tests, esp. the T-008 `edit` tests, also cover this) |
| A per-fact rejection writes an audit record (threadId, studentId, rejected keys+reasons, decidedAt, no transcript text), whether or not the overall decision approves anything | engine `T-018 residual 3: a per_fact rejection writes an audit record ...`, `... even when EVERY fact is rejected ...`, `... no rejections -> no audit record ...` | F3 |
| The audit write is fence-aware (pre-check refuses; post-check + compensation undoes a mid-write fence; a different student's record is untouched) | db `decisions.test.ts` (6 fencing tests, mirroring facts.test.ts's `recordApprovedSessionSummary` suite) | F4 |
| The audit write is idempotent under a checkpoint replay (deterministic `_id`, no duplicate) | engine `T-018 residual 3: the audit write is idempotent under a checkpoint replay ...`; db `idempotent under the SAME threadId ...` | — |
| The audit record is erased (read-back zero) and can not be resurrected after the fence | db `B15: a reject-reason record is erased ... and never re-created by a retry` | — |
| The audit record is exported, scoped to its own student, and disappears after erasure | db `B15 export: exportStudent's decisions array carries a reject-reason record ...` | — |
| The browser evidence script drives the PRODUCTION build (`next build --webpack` then `next start`), not `next dev` | E5 (`serverMode: "build"` in the report; the build log itself in the run output) | — (a `next dev` run of the same script, T-008's own invocation, still passes unchanged — see E2's apps/web 18 count includes the dev-mode `runtime mode: demo unless VC_WEB_MODE is exactly 'live'` test, which is orthogonal) |

## Live browser evidence

- **Report:** `qa/evidence/browser-t-018-approval-followups-2026-09-25/report.json`, screenshots `01-pending.png` … `06-in-progress.png` in the same folder (same 6 screenshots as T-008; the new interaction is API-only, no new screenshot).
- **Server:** `next build --webpack` (production build, compiled successfully) then `next start --port 3128`, `VC_WEB_MODE=demo` (the default; never set to `live`). This script started and stopped that server itself (verified no leftover `Listen` state on the port afterward).
- **Interactions:** all 15 of T-008's original interactions, unchanged, **plus** interaction 2.5 (the type-refusal probe). **20/20 pass**, 0 unexpected console errors (3 expected `409/423/404 Failed to load resource` lines, same as T-008's own report, for the same steps that test those exact HTTP statuses).

## Residuals (stated gaps)

1. **No package.json script for the build-mode evidence run.** `VC_EVIDENCE_MODE`/`VC_EVIDENCE_UNIT`/`VC_EVIDENCE_PORT` are documented in `browser-evidence.ts`'s own header comment and in this manifest's E5 row rather than added as a `pnpm` script, to avoid a cross-platform (`cross-env`) dependency neither package.json currently has. A future unit could add `"evidence:browser:build"` once that's decided.
2. **The reject-reason audit record's own provenance is not itself re-exposed anywhere in the UI.** The counsellor's rejection reason is recorded (this unit's whole point) but there is no screen that reads it back; that would be a new feature, not a follow-up fix.
3. **Edit provenance (T-008 residual 2 / `qa/gates/edit-provenance.md`) is unchanged, as directed.** This unit does not touch how an edited fact's `source` is stored — the gate is still open, still blank, and this unit's dispatch explicitly excluded it ("Do NOT change edit provenance").
4. **`recordRejectReasons` does not participate in the summary+facts cross-write compensation chain** (`writeApproved`/`undoApprovedSessionSummary`, ISS-t-017-rev-1). It is called earlier, independently fence-aware, and before either of those writes; if a fence lands strictly between the audit write's own post-check and the LATER summary/facts writes, the audit record (already legitimately recorded) is correctly left in place — it describes a decision that really was made, not a write racing the fence the way the facts/summary are. Documented here rather than silently assumed.
5. **The falsification pass (E4) covers the 4 highest-value mutations** (schema-level type refusal, engine-level type match, the audit call itself, the audit's post-check) rather than every line changed — matching the depth T-008's own falsification.txt used (5 mutations for a larger diff).
