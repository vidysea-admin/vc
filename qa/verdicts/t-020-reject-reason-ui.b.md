# Verdict: t-020-reject-reason-ui

> Second independent checker verdict (session 6c22744a re-dispatch, commit fd6fa06 on wave/t-020-reject-reason-ui). The primary verdict is qa/verdicts/t-020-reject-reason-ui.md (5f14801); both PASS at cycle 0. Evidence: qa/evidence/browser-t-020-reject-reason-ui-2026-09-26-checker-b/report.json

**Cycle checked:** 0
**Date:** 2026-09-26
**Checker:** fresh Claude subagent (claude-sonnet-subagent), no builder context, Mode A + Mode D
**Bound root:** `D:/vc/.worktrees/t-020-reject-reason-ui`
**Contract:** `qa/contracts/counselling-engine.md` (B1, B3, B5, B15) + B17 (persona usability) + B14 (outcome, not construction) applied per dispatch
**Manifest:** `qa/manifests/t-020-reject-reason-ui.md` (Fix cycle: 0, Status: ready-for-check)

## What I re-ran myself (never trusted the pasted manifest output)

- `pnpm -r typecheck` in the bound tree: **exit 0**, all 9 packages — matches E1.
- `pnpm -r test` in the bound tree: **524/524 pass, exit 0** (providers 8, schemas 50, observability 57, db 196, apps/api 8, mcp/university-kb 9, mcp/student-profile 12, engine 160, apps/web 24) — matches E2 exactly.
- `python contracts/verify_contracts.py`: "no frozen contracts yet (research phase) -- PASS by vacuity", exit 0 — matches E3.
- Full diff `1ce83e0..HEAD --stat`: matches the manifest's "What changed" file list exactly. No unrelated file touched, no existing function/test/export deleted. `qa/`, `TASKS.md`, `.claude`, `scripts`, `docs/DECISIONS.md` untouched, confirming the manifest's own claim. No CONTRACT_MISMATCH.

## Capability coverage (step 4b) — reproduced in a THROWAWAY COPY outside the bound root

Copied the working tree (excluding `.git` and all `node_modules`) via `robocopy /MIR` to a scratch
dir outside the bound root, then `pnpm install --offline` (all packages reused from the local
store, 0 downloads) to materialize correct pnpm-workspace symlinks pointing inside the copy — the
copied tree, not a baseline extraction. Confirmed GREEN before any edit: `pnpm --filter @vc/engine
test` (160/160) and `pnpm --filter @vc/web test` (24/24) both passed clean in the copy first.

All 5 falsifying edits are single-hunk edits to files named in "What changed". Applied one at a
time, ran the exact named check, confirmed the exact predicted row(s) reddened with the assertion
message the row is named for, then reverted and re-confirmed green before the next:

| # | Edit (single file, single hunk) | Check run | Result |
|---|---|---|---|
| F1 | `schemas.ts`: removed `.max(MAX_REJECT_REASON_LENGTH, ...)` from `RejectReasonSchema` | `scribe-per-fact.test.ts` | 23/24 pass; the ONE failure is exactly "...over MAX_REJECT_REASON_LENGTH, or whitespace-only, is refused...", assertion `a reason 1 character over the limit must be refused` — isolates correctly |
| F2 | `schemas.ts`: removed `.trim()` from `RejectReasonSchema` | `scribe-per-fact.test.ts` | 22/24 pass; reddens exactly the "trimmed" test (whitespace not stripped) AND the whitespace half of the limit test — matches the manifest's own honest two-row disclosure |
| F3 | `ApprovalScreen.tsx`: `buildRejectDecision` always includes `reason` (never omits empty) | `ui.test.tsx` | 10/11 pass; the ONE failure is exactly "...OMITTED, never sent as reason: \"\"", actual `{..., reason: ''}` vs expected `{...}` — isolates correctly |
| F4 | `demo/seed.ts`: `readback()` omits the `decisions` field | `api.test.ts` | 11/13 pass; the TWO failures are exactly the two audit-readback tests, both `TypeError: Cannot read properties of undefined (reading 'length')` on `rb.decisions.length` — isolates correctly |
| F5 | `graph.ts`: approval node calls `recordRejectReasons` WITHOUT the `deadlineMs` option | `scribe-per-fact.test.ts` | 23/24 pass; the ONE failure is exactly the ISS-t-018-rev-2 deadline test, message shows `got 60000ms` (fallback to package default) — isolates correctly |

Restored all 5 files; re-ran both suites in the copy: 160/160 and 24/24 clean again.

**Capability coverage: 6/6 falsifiable rows reproduced correctly** (the manifest's own table has 8
rows; the 2 remaining rows are explicitly outcome-only, not falsifiable by a source mutation, per
the manifest's own residual 5 — I independently verified these instead: row 7 (real UI flow, outcome
proof) via my own live browser session below; row 8 (build-timeout script) via re-reading the
`runProductionBuild` code myself — `res.error`, then `res.signal !== null`, then `res.status !== 0`,
all three throw, all three legal orderings — plus my own green `pnpm -r typecheck`). No unenumerated
claim, no row surviving its edit.

## Mode D — live browser (I drove my own Playwright session; never read the maker's screenshots or `browser-evidence.ts`)

Started `apps/web`'s own `next dev --webpack --port 3108` (`VC_WEB_MODE=demo`) myself, stopped it
myself when done, confirmed the port was clear afterward. 12 interactions, all pass, 0 unexpected
console errors (only expected 423-status resource logs on the fenced check + a benign favicon 404,
same classification the maker's own evidence script uses):

1. Index lists all 3 seeded threads.
2. Paused thread renders 4 facts / 2 dropped / draft summary, Submit disabled.
3. Clicking Reject on `intendedMajor` reveals the "Reason (optional)" textbox (B17).
4. **Hostile — 600-char paste:** client `maxLength` truncates to exactly 500; a counsellor can never even exceed the limit through the UI.
5. **Hostile — whitespace-only reason:** the fact still counts as decided; nothing blocks submit.
6. **Hostile — `<script>...</script><img onerror=...>` as the reason:** never executes (`window.__xss`/`__xss2` stayed `undefined`) — it is a plain input value, never an HTML sink.
7. Decide the remaining 3 facts + withhold summary + submit → resolved, 0 console errors.
8. Read back `/api/demo/readback` → the `decisions` collection exposes the record, `rejected=[{key: intendedMajor, reason: <the exact hostile string>}]`, stored verbatim as inert text.
9. Fenced thread (`session-2`): "Erasure in progress", 0 fact cards leaked.
10. In-progress thread (`session-3`): "Decision recorded, write pending".
11. **Hostile — reason on an APPROVED fact, via a raw POST** (bypassing the UI, which structurally cannot produce this): the stray `reason` key is silently stripped by the non-strict Zod object (B5); the approve proceeds normally; `decisions: []` stays empty — no bogus audit row is fabricated for a non-reject decision.
12. **Mobile (390×844) with the reject-reason field open:** `scrollWidth - clientWidth = 0`, no horizontal overflow.

Evidence: `qa/evidence/browser-t-020-reject-reason-ui-2026-09-26-checker/report.json` +
`mobile-reject.png`.

**Note, not a failure:** the hostile HTML/script reason is stored byte-for-byte in the audit
record. This is not currently exploitable — nothing in the app renders this field via
`dangerouslySetInnerHTML` or any other unescaped sink (grepped `ApprovalScreen.tsx`: none), and the
manifest's own residual 1 states no counsellor-facing screen reads this collection back yet. Flagged
here so a future "view past decisions" screen (residual 1) renders it as text, not HTML — worth a
line in that future unit's own manifest, not a defect in this one.

## Issues ledger

`ISS-t-018-c0-1`, `ISS-t-018-rev-1`, `ISS-t-018-rev-2` were all `open`. All three are verifiably
fixed by this unit (reject-reason field + read-back exposure; build timeout/signal handling;
deadline binding) — confirmed above, independent of the manifest's own claim. Flipped all three to
`fixed` in `qa/issues.jsonl` with evidence notes citing this verdict.

## B17 persona usability (average counsellor, tier-2 city, e.g. Jaipur)

Label is short ("Reason (optional)"), reveal-on-reject mirrors the pre-existing edit-value pattern
already in production use, no jargon, optional (never blocks the workflow), client-side length cap
prevents ever hitting a server error from typing too much, whitespace-only is silently treated as
"no reason" with no confusing error message, and the field is fully usable at mobile width with no
overflow. No persona-usability finding.

## Scoreboard

SCOREBOARD: 6/6 criteria met (B1, B3, B5, B14, B15-unaffected, B17), 0/0 invariants broken
CAPABILITY-COVERAGE: 6/6 rows reproduced; 2/2 remaining rows independently outcome-verified (not falsifiable by source mutation, as the manifest itself discloses)
LIVE-BROWSER: qa/evidence/browser-t-020-reject-reason-ui-2026-09-26-checker/report.json — 12/12 interactions pass, 0 unexpected console errors

## Verdict

```
VERDICT: PASS
SCOREBOARD: 6/6 criteria met, 0/0 invariants broken (none applicable to this unit's scope)
FAILURES (if any):
- none
CAPABILITY-COVERAGE: 6/6 rows reproduced (2/2 remaining rows independently outcome-verified, not falsifiable by source mutation)
LIVE-BROWSER: qa/evidence/browser-t-020-reject-reason-ui-2026-09-26-checker/report.json
ISSUES-WRITTEN: none new; ISS-t-018-c0-1, ISS-t-018-rev-1, ISS-t-018-rev-2 moved open -> fixed
EXECUTOR: maker build subagent (checker: claude-sonnet-subagent)
EXPLANATION: Every verify command reproduced green in the bound tree (typecheck, 524/524 tests, contract validator). All 5 falsifiable capability-coverage rows reproduced in a throwaway offline-reinstalled copy outside the bound root, isolating exactly as the manifest claims (including F2's honest two-row disclosure). Diff scope is clean against the manifest's "What changed". Drove a real browser myself (never the maker's script/screenshots) through 12 interactions including hostile variants (600-char paste, whitespace-only, HTML/script injection, reason-on-an-approved-fact, mobile width) -- all handled safely, 0 unexpected console errors. The one observation (hostile reason stored verbatim, currently inert since nothing renders it as HTML) is noted for a future read-back screen, not scored as a failure of this unit.
```
