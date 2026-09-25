# Verdict: t-018-approval-followups

**Verdict:** PASS
**Cycle checked:** 0
**Date:** 2026-09-25
**Checker:** fresh Claude subagent, bound to `D:\vc`, worktree `D:/vc/.worktrees/t-018-approval-followups` (branch `wave/t-018-approval-followups`)
**Contract:** qa/contracts/counselling-engine.md (B3, B5, B14, B15)
**LIVE-BROWSER:** `qa/evidence/browser-t-018-approval-followups-2026-09-25-checker/report.json` (own Playwright session, own production build/server, never read the maker's report)

## What I re-ran myself

1. `pnpm install` — clean, lockfile up to date.
2. `pnpm -r typecheck` — 9/9 packages, exit 0.
3. `pnpm -r test` — **515/515, 0 fail** across schemas 50, providers 8, observability 57, db 196, apps/api 8, mcp/student-profile 12, mcp/university-kb 9, engine 157, apps/web 18. Matches the manifest's E2 exactly.
4. `python contracts/verify_contracts.py` — "no frozen contracts yet (research phase) -- PASS by vacuity".
5. `pnpm --filter @vc/web build` — `next build --webpack`, compiled successfully, typecheck clean, all 6 routes generated.

## Diff scope (4c)

The manifest claims "branched from main `3190ad2`" and "Diff range: `3190ad2..445f63f`". **This is factually wrong** — `git merge-base --is-ancestor 3190ad2 HEAD` fails; the real branch point is `e02d0ff`, 3 commits earlier on main (missing 29d8d0b, e938755, 3190ad2 — a sweep + 2 hygiene fixes for ISS-044/045). Diffing against the *stated* base makes `qa/issues.jsonl`, `qa/QUEUE.md`, `qa/.last-sweep`, `qa/.last-tick` and `qa/token-ledger.jsonl` look reverted to an earlier state, which reads like ledger data loss.

**Verified this is not a real merge hazard:** `git merge-tree --write-tree wave/t-018-approval-followups main` resolves cleanly with no conflict markers, and the resulting tree's `qa/` files are byte-identical to main's current versions (main advanced them; wave never touched them since `e02d0ff`, so a real 3-way `git merge` correctly keeps main's side). Filed as **ISS-t-018-c0-2 (low)** — a caution for whatever performs the close-out: use a genuine `git merge`, never a squash/rebase/force-overwrite, and re-run `git merge-tree` before merging.

Diffed against the *real* base `e02d0ff..HEAD`: the file list matches the manifest's "Scope" section exactly (`packages/engine/src/scribe/{schemas,nodes,graph}.ts`, `packages/db/src/{decisions.ts (new),erasure.ts,index.ts}`, `packages/db/tests/{db-scope,decisions}.test.ts`, `apps/web/src/components/ApprovalScreen.tsx`, `apps/web/demo/browser-evidence.ts`, three test files, evidence/manifest additions). Nothing deleted or renamed outside the claim; nothing touched outside "What changed".

## Capability coverage (4b) — reproduced independently, own edits, own scratch copy

Copied the working tree (excluding `.git`/`node_modules`) to a scratch dir outside the bound root, ran `pnpm install` there, confirmed the named tests GREEN in the copy first (21/21 engine, 11/11 db), then applied **my own** single-hunk falsifying edits (not the maker's `falsification.txt`, independently authored), one at a time, reverting between each:

| Row | My edit | Result | Matches manifest's F-row? |
|---|---|---|---|
| F1 — non-scalar refused at schema boundary | `EditedValueSchema`'s second `.refine` replaced with `() => true` | 19/21 pass, exactly the 2 object/array tests go red, nothing else | Yes, exact match |
| F2 — wrong-scalar-type refused at engine boundary | `perFactDecision`'s `if (editedType !== proposedType)` guarded with `if (false && ...)` | 19/21 pass, exactly the string/boolean-edit tests go red | Yes, exact match |
| F3 — audit write happens | `recordRejectReasons` call in `graph.ts`'s approval node commented out | 18/21 pass, exactly the 3 residual-3 write/idempotency tests go red (the "no rejections" test correctly stays green) | Yes, exact match |
| F4 — audit write is fence-aware (post-check) | `compensateIfFenced(...)` call in `decisions.ts` removed | 9/11 pass in `decisions.test.ts`, exactly the 2 mid-write-fence tests go red; erasure/export tests correctly stay green (separate purge path) | New row I added beyond the manifest's own falsification.txt (which covered this via a 5th, undocumented mutation) — confirms the fencing claim independently |

4/4 rows CAPABILITY-COVERAGE reproduced, none UNVERIFIED. All greens/reds obtained from the COPY, never from the bound tree; copy confirmed real (green-before-edit) for every row; tree restored and re-confirmed green (21/21, 11/11) after all four.

## Hostile probes (own, live, against the production build)

Read `packages/db/tests/decisions.test.ts` in full (11 tests): fence pre-check, mid-write fence + compensation (undo by `_id`, cross-student isolation), writer-deadline timeout + undo-on-settle, oversized-deadline `RangeError`, idempotent duplicate `_id`, B15 erasure read-back=0 with no resurrection by retry, B15 export inclusion + post-erasure exclusion, no transcript text in the stored doc (`Object.keys` assertion). All meaningful, none tautological.

Traced the fence-integration path in `graph.ts`'s `invokeFenceAware`: a `StudentFencedError` thrown by `recordRejectReasons` inside the approval node propagates out of `graph.invoke`, is caught, correctly resolves to the standard `fenced` outcome, and triggers the SAME compensation (checkpoint/claim/session deletion) every other fence-aware writer gets — confirmed by code reading, since no test exercises this exact interleaving (audit-fenced-inside-a-live-resumeScribe) end-to-end; noted, not blocking (the mechanism is proven-correct shared code, exercised by many other writers' tests).

Drove my **own** production build + server (fresh `next build --webpack`, then `next start --port 3129`, `VC_WEB_MODE` unset → demo) with my own Playwright MCP session — never read or reused the maker's `browser-evidence.ts` run. 14/14 interactions passed (full detail in `report.json`):
- 8 hostile edit-value types against the live API, each refused 400 with **zero** writes and **zero** claims, verified cumulatively: object, array, boolean, `null`, empty string, a **numeric string** (`"2000000"`) for a numeric fact (confirms the match is by type, not content), a wrong-type string, and a raw `NaN` literal (refused earlier, as malformed JSON — confirms the dispatch's own "if JSON allows" caveat: NaN/Infinity are not reachable through this API at all).
- The real per-fact flow, driven by UI clicks (not just API calls): approve one fact, **reject** one, edit one, approve the summary, submit → 200/written, exactly the 3 non-rejected facts written, the rejected one correctly absent.
- Fence pre-check (423 on the pre-fenced demo thread) and idempotent resubmit (409 `already_resolved`, no duplicate claim/write) — regression-checked, unaffected by this unit.
- Console errors: 11, all explained (the deliberate 400s/409), zero unexpected.

**New finding surfaced by the live UI walk — ISS-t-018-c0-1 (medium):** `ApprovalScreen.tsx` has no input field for a rejection reason anywhere in the component (`buildResponse()` returns `{key, decision}` only for a reject). A real counsellor using the shipped product can never supply the reason this audit trail is built to capture — every real-world record will carry `rejected:[{key}]` with no `reason`, which undercuts the feature's own framing ("records the counsellor's own reason text", "this unit's whole point"). Not disclosed as a residual in the manifest. Related: `DemoReadback`/`/api/demo/readback` doesn't expose the `decisions` collection at all, so the audit record can't be observed through the running app by any means — confirmed live (interaction 12's readback has no `decisions` field) — broader than the manifest's own disclosed residual 2.

Neither finding contradicts an evidenced capability-coverage row or a contract criterion (B15 only requires the record be written, with an *optional* reason) — filed to the ledger as follow-up, not a blocker.

## Issues addressed (ledger check)

`ISS-t-008-c0-1` (the manifest's sole claimed fix): confirmed fixed by both my falsification (F1/F2) and 8 independent live hostile probes exceeding the original probe's scope. Marked `fixed` in `qa/issues.jsonl` (not yet `verified` — this is the fix's own verifying check, per protocol `fixed → verified` is a *later* re-check).

## Residuals — judged

Manifest residuals 1–5 read as honest and correctly scoped (no package.json script, edit provenance out of scope by explicit direction, falsification depth matches T-008's own precedent, compensation-chain independence is correctly reasoned per the `invokeFenceAware` trace above). Residual 2 ("no screen reads it back") is real but understates the gap — see ISS-t-018-c0-1 above, which also covers that the UI cannot *write* a reason, not just that it can't *read* one back.

## Scoreboard

SCOREBOARD: 4/4 criteria met (B3 nothing written before a refused edit; B5 typed boundary now closes the reported gap; B14 outcome proven end-to-end live, not just constructed; B15 fence/idempotency/erasure/export all reproduced), 4/4 capability-coverage rows independently reproduced.

FAILURES: none at >80% confidence.

CAPABILITY-COVERAGE: 4/4 rows reproduced (own falsifying edits, own scratch copy).
LIVE-BROWSER: `qa/evidence/browser-t-018-approval-followups-2026-09-25-checker/report.json` (14/14 interactions, own production build + server, own Playwright session).
ISSUES-WRITTEN: ISS-t-018-c0-1 (medium, new), ISS-t-018-c0-2 (low, new), ISS-t-008-c0-1 (updated open→fixed).
EXECUTOR: maker build subagent (checker: claude-sonnet-subagent — independent, no `ANTHROPIC_BASE_URL` override).

EXPLANATION: Every verify command reproduces exactly what the manifest claims (515/515 tests, clean typecheck, clean production build), and all four capability-coverage rows plus eight additional hostile-probe variants hold up under my own, independently authored falsifying edits and live browser testing — no wrong-reason failures anywhere. The unit does what it says: it closes ISS-t-008-c0-1 at both the schema and engine boundaries, and it adds a genuinely fence-aware, idempotent, erasable, exportable reject-reason audit record. The two new findings (no UI path to ever populate the reason field; the manifest's wrong stated branch point) are real and worth fixing, but neither falsifies an evidenced claim or a contract criterion, so they are follow-up debt, not a block.
