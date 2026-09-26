# Verdict: t-020-reject-reason-ui

**Date:** 2026-09-26
**Cycle checked:** 0
**Checker:** fresh Claude subagent (claude-sonnet-subagent), no ANTHROPIC_BASE_URL override — executor independence holds (manifest's own Executor: maker build subagent; self != executor).
**Bound root:** D:\vc. **Artifact tree checked:** worktree `D:\vc\.worktrees\t-020-reject-reason-ui`, branch `wave/t-020-reject-reason-ui`, commits `fe111a0` (feat) + `efe9997` (manifest/evidence), branched from main `1ce83e0`.

## What I re-ran myself (never trusted the manifest's pasted output)

- `pnpm -r typecheck` in the worktree: exit 0, all 9 workspace projects (matches manifest E1).
- `pnpm -r test` in the worktree: **524 tests, 0 fail**, counted by me package-by-package
  (providers 8, schemas 50, observability 57, db 196, apps/api 8, mcp/university-kb 9,
  mcp/student-profile 12, engine 160, apps/web 24 = 524) — matches the manifest's E2 exactly.
- `python contracts/verify_contracts.py`: "no frozen contracts yet (research phase) -- PASS by
  vacuity", exit 0 — matches E3.

## Step 4b — capability coverage, reproduced in a throwaway copy (never the bound tree)

Copy: `C:\Users\Lenovo\AppData\Local\Temp\claude\d--vc\...\scratchpad\t-020-row1` (full tree copy,
`node_modules` at every workspace level attached via Windows directory junctions to the worktree's
own `node_modules` — read-only reuse, not a modification). Confirmed the copy was real by running
the target test files GREEN in the copy first (24/24 for apps/web, 24/24 for engine's
scribe-per-fact.test.ts), before any edit — both green baselines came from the copy, not from step
3's run in the bound tree.

All 5 falsifying edits from the manifest's Method/falsification.txt were independently
re-applied (single-hunk, to the single named file) and reverted between each:

| Row | Mutation (applied by me, in the copy) | My result | Manifest claimed | Match |
|---|---|---|---|---|
| F1 | schemas.ts: removed `.max(MAX_REJECT_REASON_LENGTH, ...)` from `RejectReasonSchema` | 24 pass, 1 fail — exactly the "over limit / whitespace" test | same | yes |
| F2 | schemas.ts: removed `.trim()` from `RejectReasonSchema` | 24 pass, 2 fail — the trim test AND the limit/whitespace test (whitespace-only becomes 3 chars, passes `.min(1)` untrimmed) | same, with the same two-row explanation | yes |
| F3 | ApprovalScreen.tsx: `buildRejectDecision` always includes `reason` (never omits on empty) | 24 pass, 1 fail — exactly the "OMITTED" UI test | same | yes |
| F4 | demo/seed.ts: `readback()`'s `decisions` array hardcoded to `[]` | 24 pass, 2 fail — exactly the two audit-readback API tests | same | yes |
| F5 | graph.ts: `recordRejectReasons` called without the `{ deadlineMs }` option | 24 pass, 1 fail — exactly the ISS-t-018-rev-2 deadline-binding test | same | yes |

**CAPABILITY-COVERAGE: 6/8 rows reproduced** (F1-F5 map to 6 of the 8 capability-coverage table
rows; the other 2 rows are explicitly not falsified by a source mutation — E5/E6/E7 live-browser
outcome proof, and the build-timeout row, which the manifest itself documents as "no fast unit
falsification" with a stated reason, the same disclosure style T-018's checker accepted). No row
survived its edit; no wrong-reason red; nothing marked UNVERIFIED.

## Step 4c — diff scope

`git diff 1ce83e0..wave/t-020-reject-reason-ui --stat` and the full diff: every touched source file
(`ApprovalScreen.tsx`, `labels.ts`, `contracts.ts`, `schemas.ts`, `nodes.ts`, `graph.ts`,
`seed.ts`, `browser-evidence.ts`, plus the three test files) is listed in the manifest's "What
changed". Read every hunk: no existing function, export, test or config key is deleted or
renamed — every "-" line is a widened/replaced line inside a hunk that also adds the new
behavior (e.g. the `FactChoice` type gains `reason?`, the import line adds new named imports),
never a removal of pre-existing capability. No file outside the manifest's scope is touched.
Clean.

## Step 5 — issues addressed

- **ISS-t-018-c0-1** (medium): fixed. The reject-reason field exists, is server-validated, and the
  demo read-back now exposes `decisions`. Verified independently (F3/F4 above, plus my own live
  UI run below). Flipped to `fixed` in the ledger.
- **ISS-t-018-rev-1** (medium): fixed. `runProductionBuild` now passes `timeout: 300000` and
  checks `res.error`/`res.signal !== null` before `res.status !== 0`. Confirmed by code read; no
  fast falsification exists for this one either (a real hang would need a 300s wait or mocking
  `child_process`, and the manifest is upfront about that gap). Flipped to `fixed`.
- **ISS-t-018-rev-2** (low): fixed. Verified by F5 above. Flipped to `fixed`.

## Step 5b — Mode D, live browser (my own script, not the maker's)

Wrote `checker-t020-browser.ts` from scratch (read `browser-evidence.ts` only to learn server
startup: `next dev --webpack --port <N>`, `VC_WEB_MODE=demo`). Ran it against the **real worktree
app** (`D:\vc\.worktrees\t-020-reject-reason-ui\apps\web`), two server sessions (a fresh runtime
was needed for the whitespace-only-reason variant, since submitting resolves the thread).
**10/10 findings pass:**

1. Reject click reveals the reason input (persona discoverability).
2. The real browser's POST body (captured via `page.route`, not a mock) carries the reason.
3. `/api/demo/readback` shows the audit record with the trimmed reason, written by a real
   click-and-type UI flow, not a raw API call.
4. Hostile — over-length reason POSTed **directly, past the client's `maxLength` cap**: 400,
   and readback confirms no new audit row was written.
5. Hostile — stale tab (second submit on an already-resolved thread): 409.
6. Hostile — fenced student: GET shows `data-state="fenced"`, POST is 423.
7. Hostile — whitespace-only reason (fresh runtime): the captured request body has **no `reason`
   key at all** (not `reason: ""`), and the persisted audit record likewise has no reason field.

Console errors: 0 on every page except the fenced-thread page (2), which are the browser's own
"Failed to load resource: status of 423" log lines for a fetch that is *supposed* to 423 —
explained, not a defect (same class the manifest's own `isExpected` filter names). No leftover
`Listen` state on ports 3241/3242 after either session (`Get-NetTCPConnection`, only `TIME_WAIT`).

**LIVE-BROWSER:** `qa/evidence/browser-t-020-reject-reason-ui-2026-09-26-checker/report.json`

## Step 6 — B17 persona walk

Walked the reject-reason flow as both declared personas, live (screenshots in
`qa/evidence/persona-t-020-reject-reason-ui-screens/`):

- `qa/evidence/persona-t-020-reject-reason-ui-jaipur-counsellor/findings.md`
- `qa/evidence/persona-t-020-reject-reason-ui-school-counsellor/findings.md`

Both personas found the flow **discoverable and completable unaided**. Two real, non-blocking
gaps surfaced (neither `high`): (a) the reason `<input>` silently stops accepting keystrokes at
the 500-char cap with no counter/message — filed as **ISS-t-020-c0-1** (medium); (b) no
counsellor-facing screen shows a past decision's reason — this is the manifest's own disclosed
residual 1, not a new finding, so no new issue filed for it. No `high` persona finding, so B17
does not block PASS.

## B19 scenario matrix

`qa/scenarios/counselling-engine.csv` does not exist yet. Per B19: **SCENARIOS: n/a (matrix not
yet authored, B19)** — not a blocker.

## Criteria judged

- **B1 (no-script):** holds — the reason box is the counsellor's own free text; no suggested
  sentence anywhere (`ApprovalScreen.tsx` comment + the B1 UI tests, unchanged, still pass).
- **B3 (human approves writes):** holds — nothing new bypasses `interrupt`; the reject-reason
  audit write happens inside the same approval-node path T-018 already gated.
- **B5 (typed boundaries):** holds — `RejectReasonSchema` is a Zod schema at both the per-fact
  decision boundary and the audit-record boundary (schemas.ts), shared by both.
- **B6 (provider independence):** not touched by this unit; unaffected.
- **B15 (erasure):** not touched by this unit; unaffected.
- **B17 (persona usability):** holds — see persona walk above; no high finding.

VERDICT: PASS
SCOREBOARD: 6/6 criteria met (B1, B3, B5, B15-unaffected, B17), 0/0 invariants violated
FAILURES (if any):
- none
CAPABILITY-COVERAGE: 6/8 rows reproduced by source-mutation falsification; 2/8 not-applicable (outcome-proof rows, disclosed by the manifest as having no fast unit falsification — matches accepted T-018 precedent)
LIVE-BROWSER: qa/evidence/browser-t-020-reject-reason-ui-2026-09-26-checker/report.json (10/10 findings pass; console errors on the fenced page are the expected 423-status log lines)
ISSUES-WRITTEN: ISS-t-020-c0-1 (new, medium); ISS-t-018-c0-1, ISS-t-018-rev-1, ISS-t-018-rev-2 (flipped open -> fixed)
EXECUTOR: maker build subagent (checker: claude-sonnet-subagent)
EXPLANATION: All three targeted issues are verifiably fixed by independent re-derivation (falsification rows reproduced in a throwaway copy outside D:\vc, plus the checker's own live browser run against the real worktree app, never the maker's screenshots or scripts). Diff scope is clean (no deletions/renames beyond the manifest's claim, no files touched outside "What changed"). Both B17 personas complete the flow unaided; the one new usability gap found (silent truncation at the reason field's character cap) is medium, not high, so it does not block PASS. B19's scenario matrix does not exist yet, recorded as n/a per contract, not a blocker.
