# Manifest: t-020-reject-reason-ui

**Contract:** qa/contracts/counselling-engine.md (B1 no-script, B3 human approves writes, B5 typed boundaries, B15 erasure/export)
**Goal task:** T-020 (T-018 follow-ups, TASKS.md row 30): ISS-t-018-c0-1, ISS-t-018-rev-1, ISS-t-018-rev-2
**Status:** checked-PASS (cycle 0; verdict qa/verdicts/t-020-reject-reason-ui.md fd6fa06; senior review Approve)
**Fix cycle:** 0
**Branch:** `wave/t-020-reject-reason-ui` (worktree `D:/vc/.worktrees/t-020-reject-reason-ui`), branched from main `1ce83e0`
**Diff range:** `1ce83e0..fe111a0` (one commit, "feat(web,db,engine): t-020 reject-reason UI, audit read-back, lease-bound audit deadline"), plus this manifest + evidence commit. **Merge-base verified with `git merge-base main wave/t-020-reject-reason-ui`** (T-018's own checker cycle 0 flagged a manifest that stated the wrong branch point — this one is computed, not eyeballed). `main` has advanced past `1ce83e0` since this worktree was created (now at `ec2a54f`, unrelated concurrent work); `git merge-tree --write-tree wave/t-020-reject-reason-ui main` resolves to a single clean tree (no conflict markers), and `git diff 1ce83e0..wave/t-020-reject-reason-ui -- qa/ TASKS.md .claude scripts docs/DECISIONS.md` is empty — nothing gated touched.
**Issues addressed:** ISS-t-018-c0-1 (medium), ISS-t-018-rev-1 (medium), ISS-t-018-rev-2 (low)
**Scope:**
- `packages/engine/src/scribe/schemas.ts`: `MAX_REJECT_REASON_LENGTH` + `RejectReasonSchema` (trim, min(1), max), applied to `PerFactDecisionSchema`'s `reject` variant and `RejectedFactSchema`
- `packages/engine/src/scribe/nodes.ts`: `boundedDeadlineMs` exported (was file-private)
- `packages/engine/src/scribe/graph.ts`: the approval node's `runtime.configurable` type widened to carry `writerDeadlineExpiresAt`; `recordRejectReasons` now called with `{ deadlineMs: boundedDeadlineMs(...) }`
- `apps/web/src/components/labels.ts`: `rejectReason` label
- `apps/web/src/server/contracts.ts`: re-exports `MAX_REJECT_REASON_LENGTH`
- `apps/web/src/components/ApprovalScreen.tsx`: a reject-reason text input (revealed only when a fact is marked reject), `buildRejectDecision` (exported, pure), `FactChoice.reason`, `setReason`
- `apps/web/demo/seed.ts`: `DemoReadback.decisions` (the `decisions` collection's `per_fact_reject` rows for the student)
- `apps/web/demo/browser-evidence.ts`: `runProductionBuild` gets a `timeout` + treats a signal/spawn-error as failure; `readback()`'s type carries `decisions`; a new interaction types a reject reason and reads the audit record back
- Tests: `packages/engine/tests/scribe-per-fact.test.ts` (+4), `apps/web/tests/ui.test.tsx` (+4), `apps/web/tests/api.test.ts` (+2)
- `qa/manifests/t-020-reject-reason-ui.md` (this file), `qa/evidence/t-020-reject-reason-ui/`, `qa/evidence/browser-t-020-reject-reason-ui-2026-09-25/`, `qa/evidence/browser-t-020-reject-reason-ui-build-2026-09-25/`
**Not touched:** `.claude/**`, `docs/DECISIONS.md`, `scripts/**`, `qa/contracts/**`, `qa/gates/edit-provenance.md`, `TASKS.md` (verified empty diff above). Edit provenance (T-008 residual 2) is unchanged, as directed.
**Executor:** maker build subagent
**Offline:** every run is offline (B8). Nothing connected to `MONGODB_URL`, `VC_WEB_MODE` was never `live`, no live provider. Both browser-evidence runs (dev and production build) use the in-process fake db, `MockProvider` and synthetic transcripts.

## What changed

### 1. ISS-t-018-c0-1: a reject-reason field in ApprovalScreen, sent and audited, and the demo read-back now exposes it

**The gap (checker's finding on T-018):** `ApprovalScreen.tsx` had no input anywhere for a rejection reason — a real counsellor using the shipped UI could never populate the audit trail T-018 built. Separately, `DemoReadback` didn't expose the `decisions` collection at all, so even an API-written reason couldn't be observed through the running app.

- **The field:** when a fact is marked `reject`, a text input appears (mirroring the existing `edit` input's reveal-on-choice pattern) labelled from `LABELS.rejectReason` ("Reason (optional)") — a free-text box the counsellor types into, never a suggested sentence (B1). It is capped client-side at `maxLength={MAX_REJECT_REASON_LENGTH}` (a UX nicety; the server is the actual length authority).
- **`buildRejectDecision(key, reason)`** (exported, pure): trims the typed text and OMITS the `reason` field entirely when it trims to empty — the server's `RejectReasonSchema` refuses a *present-but-empty* reason (its own `min(1)` runs after its own `trim()`), so an untouched or blanked box must be sent as no reason at all, never `reason: ""`.
- **Server-side validation (B5), shared by both boundaries:** `RejectReasonSchema` (schemas.ts) — `.trim()` then `.min(1)` then `.max(MAX_REJECT_REASON_LENGTH)`, `.optional()`. Applied to `PerFactDecisionSchema`'s `reject` variant (what the counsellor sends) and `RejectedFactSchema` (what `recordRejectReasons` persists), so both the per-fact response and the audit record agree on one length and one normalization rule. Because `apps/web/src/server/contracts.ts`'s `DecisionRequestSchema` imports `PerFactDecisionSchema` directly from the engine (T-008's own design), the web API boundary gets the trim + length limit with no separate change.
- **The demo read-back (`apps/web/demo/seed.ts`):** `DemoReadback.decisions` now returns the `decisions` collection's `kind: "per_fact_reject"` rows for the student (`threadId`, `rejected` keys+reasons, `decidedAt`). `/api/demo/readback` returns the whole `DemoReadback` object unchanged, so this field is live with no route-handler edit.

### 2. ISS-t-018-rev-1: a hung `next build` no longer blocks the evidence script forever

`runProductionBuild` (browser-evidence.ts) now passes `timeout: BUILD_TIMEOUT_MS` (300s) to `spawnSync`, and — because a `spawnSync` timeout does not set `status` to a non-zero code, it leaves `status` `null` and sets `signal`/`error` instead — checks `res.error` and `res.signal !== null` explicitly, before the pre-existing `res.status !== 0` check. All three failure shapes (spawn error, timeout/signal, non-zero exit) now throw.

### 3. ISS-t-018-rev-2: `recordRejectReasons`' own write is bound to the run lease, like `writeApproved`'s inner writes already are (ISS-t-016-c0-1 pattern)

`boundedDeadlineMs` (nodes.ts) is now exported (it was already exactly the function `writeApproved` uses to bind `recordApprovedSessionSummary` and `applyApprovedDiff` to `writerDeadlineExpiresAt`). The approval node's `runtime.configurable` type gained `writerDeadlineExpiresAt?: number` (the write node already declared this; `runnableConfig` in the same file already puts it on every invoke's `configurable`, so it was already available to the approval node — it just wasn't read there before this unit), and the `recordRejectReasons` call now passes `{ deadlineMs: boundedDeadlineMs(runtime.configurable?.writerDeadlineExpiresAt) }`. `recordRejectReasons` (packages/db/src/decisions.ts) already accepted `deadlineMs` as an option (T-018 built it that way); this unit is only the missing call-site wiring, mirroring `writeApproved`'s own pattern exactly.

## Method

- **Falsification instead of a literal pre-implementation RED run**, the same methodology T-018's own manifest used and its checker accepted as equivalent-or-stronger evidence: one mutation at a time, restored via `git checkout --` against the COMMITTED implementation (`fe111a0`) between each, run the full suite, confirm exactly the predicted row(s) redden and nothing else. Full log: `qa/evidence/t-020-reject-reason-ui/falsification.txt`.
- A real lesson from the falsification pass itself: F2 (removing `RejectReasonSchema`'s `.trim()`) reddened **two** tests, not one — the trim test (leading/trailing whitespace no longer stripped) AND the limit/whitespace test (a whitespace-only reason, e.g. `"   "`, is 3 characters long and so passes `.min(1)` once un-trimmed, so the "whitespace-only is refused" half of that assertion also fails). Recorded as-is rather than narrowed to fit a one-row-per-mutation narrative: `.trim()` is genuinely load-bearing for both properties.
- ISS-t-018-rev-1 (the build-timeout fix) has no fast unit-test falsification: it is QA-tooling code (a script, not library code under `pnpm -r test`), and reproducing a genuine `spawnSync` timeout deterministically would mean either a 300s wait or mocking `child_process` in a way nothing else in this codebase does. Verified instead by (a) `pnpm --filter @vc/web typecheck` passing clean (the `demo/**/*.ts` include in `apps/web/tsconfig.json` already type-checks `res.error`/`res.signal` against Node's real `SpawnSyncReturns` type), and (b) two full live `browser-evidence.ts` runs below, one of them in `VC_EVIDENCE_MODE=build` — the exact code path this fix touches — completing normally (build succeeds, no premature timeout misfire).

## Evidence

| # | Claim | Command | Result |
|---|---|---|---|
| E1 | Workspace typecheck | `pnpm -r typecheck` | exit 0, all 9 packages (`qa/evidence/t-020-reject-reason-ui/typecheck.txt`) |
| E2 | Workspace tests | `pnpm -r test` | **524 tests, 0 fail**: providers 8, schemas 50, observability 57, db 196, apps/api 8, mcp/university-kb 9, mcp/student-profile 12, engine 160 (157 pre-existing from T-018 + 3 new), apps/web 24 (18 pre-existing from T-018 + 6 new) — 515 (T-018 baseline) + 3 + 6 = 524 (`qa/evidence/t-020-reject-reason-ui/test.txt`) |
| E3 | Contract validator | `python contracts/verify_contracts.py` | "no frozen contracts yet (research phase) -- PASS by vacuity", exit 0 (`qa/evidence/t-020-reject-reason-ui/contracts.txt`) |
| E4 | Falsification (5 mutations across engine + web) | one mutation at a time, `git checkout --` to restore against the committed `fe111a0`, see "Method" | 5/5 CAUGHT — F1, F3, F4, F5 isolate to exactly their named row(s); F2 isolates to exactly the two rows `.trim()` is responsible for (see "Method"); no wrong-reason red anywhere; `git status` clean between each (`qa/evidence/t-020-reject-reason-ui/falsification.txt`) |
| E5 | Live browser evidence, DEV mode | `VC_EVIDENCE_UNIT=t-020-reject-reason-ui VC_EVIDENCE_PORT=3138 npx tsx demo/browser-evidence.ts` (from `apps/web`) | **22/22 interactions pass**, 0 unexpected console errors (`qa/evidence/browser-t-020-reject-reason-ui-2026-09-25/report.json`) |
| E6 | Live browser evidence, PRODUCTION build (exercises the ISS-t-018-rev-1 code path on its happy path) | `VC_EVIDENCE_MODE=build VC_EVIDENCE_UNIT=t-020-reject-reason-ui-build VC_EVIDENCE_PORT=3139 npx tsx demo/browser-evidence.ts` | `next build --webpack` compiled successfully; **22/22 interactions pass**, 0 unexpected console errors (`qa/evidence/browser-t-020-reject-reason-ui-build-2026-09-25/report.json`) |
| E7 | The reject-reason audit record, written by a REAL UI reject+submit (not a raw API call), is readable through the demo route in both E5 and E6 | interaction "read back the reject-reason audit record ..." in both reports | `decisions=[{"threadId":"scribe:demo-session-1","rejected":[{"key":"intendedMajor","reason":"family wants to re-check this major with the school counsellor first"}],"decidedAt":"..."}]` |
| E8 | No leftover evidence-server process after either run | `Get-NetTCPConnection -LocalPort 3138,3139` after both runs | only `TIME_WAIT` entries, no `Listen` state |

## Capability coverage

| Capability | Test(s) | Falsified by |
|---|---|---|
| A reject reason is trimmed at the schema boundary before it reaches the audit record | engine `T-020 ISS-t-018-c0-1: a reject reason is trimmed by the schema ...` | F2 |
| A reject reason over `MAX_REJECT_REASON_LENGTH`, or whitespace-only, is refused; exactly the limit is accepted; absent stays accepted | engine `T-020 ISS-t-018-c0-1: a reject reason over MAX_REJECT_REASON_LENGTH, or whitespace-only, is refused ...` | F1 (limit half), F2 (whitespace half) |
| The UI never sends `reason: ""` — an empty/whitespace-only typed reason is omitted, not sent blank | web `buildRejectDecision: an empty or whitespace-only reason is OMITTED ...` | F3 |
| The demo read-back exposes the `decisions` collection (reject-reason audit records), scoped to the student | web `T-020 ISS-t-018-c0-1: a per-fact reject with a typed reason writes an audit record the demo read-back exposes ...` | F4 |
| A too-long reason is refused (400) through the full API, writes nothing, records no audit; the thread heals with a shortened reason | web `T-020 ISS-t-018-c0-1: a reject reason over MAX_REJECT_REASON_LENGTH is refused (400) ...` | F4 (both halves of this test depend on the same read-back path) |
| `recordRejectReasons`' own insert is bound to the outer `writerDeadlineMs`, not the package default | engine `ISS-t-018-rev-2: recordRejectReasons' own insert is bound to the SAME (short) outer writerDeadlineMs ...` | F5 |
| A real counsellor click-and-type reject-reason flow, through the actual UI, writes and reads back the audit record | E5, E6, E7 (live browser, both dev and production build) | — (not falsified by a source mutation; this is the outcome proof B14 asks for) |
| The production-build evidence script fails loudly on a build timeout/signal, not just a non-zero exit | code reading + typecheck + E6's happy-path run (see "Method") | — (no fast unit falsification; documented, not silently assumed) |

## Live browser evidence

- **Reports:** `qa/evidence/browser-t-020-reject-reason-ui-2026-09-25/report.json` (dev mode) and `qa/evidence/browser-t-020-reject-reason-ui-build-2026-09-25/report.json` (production build mode).
- **Servers:** dev — `next dev --webpack --port 3138`; build — `next build --webpack` (compiled successfully) then `next start --port 3139`. Both `VC_WEB_MODE=demo` (never `live`). Both started and stopped by the script itself; no leftover `Listen` state on either port afterward (E8).
- **Interactions:** all of T-018's original 20, unchanged, **plus** 2 new: typing a reject reason into the field the reject choice reveals, and reading the resulting audit record back through `/api/demo/readback`. **22/22 pass** in both modes, 0 unexpected console errors.

## Residuals (stated gaps)

1. **The reject-reason audit record is exposed by the demo read-back route, not by any counsellor-facing screen.** This unit closes the checker's finding that the reason could not be observed *at all*; a real "view past decisions" screen for a counsellor is a new feature, not a follow-up fix (same framing as T-018 residual 2, now narrowed).
2. **No `pnpm` script for the production-build evidence run**, unchanged from T-018 residual 1 — still documented in the script's own header comment and this manifest's E6 row.
3. **Edit provenance (T-008 residual 2 / `qa/gates/edit-provenance.md`) is unchanged, as directed** by this unit's own dispatch ("Do NOT change edit provenance").
4. **The falsification pass covers the 5 highest-value mutations** (schema max, schema trim, UI omission, demo read-back exposure, deadline binding) rather than every line changed — matching the depth T-018's own falsification used.
5. **ISS-t-018-rev-1 has no fast automated falsification**, only code reading + typecheck + a happy-path live run in build mode (see "Method"). A slow, deliberately-hung-build test was judged not worth the wall-clock cost for a QA-tooling script; flagged here rather than silently assumed complete.
