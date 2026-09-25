# Verdict: t-008-approval-ui

**Verdict:** PASS
**Cycle checked:** 0
**Date:** 2026-09-25
**Contract:** qa/contracts/counselling-engine.md (B1, B2, B3, B4, B5, B11, B12 primary; B8, B14, B15 fencing; D-012, D-014, D-015, D-016, D-017)
**Diff range:** e2257fa..3c84b13 (worktree `wave/t-008-approval-ui`)
**Executor:** manifest's "maker build subagent" (checker: claude-sonnet-subagent). No `ANTHROPIC_BASE_URL` override observed.

## What I re-ran myself (Mode A step 3)

All commands re-run fresh in the bound worktree (`D:\vc\.worktrees\t-008-approval-ui`):

- `pnpm install` — up to date, exit 0.
- `pnpm -r typecheck` — all 9 packages incl. `apps/web`, exit 0.
- `pnpm -r test` — **495 tests, 0 fail**, matching the manifest's claim exactly:
  schemas 50, providers 8, observability 57, db 185, apps/api 8, mcp/university-kb 9,
  mcp/student-profile 12, engine 149 (136 pre-existing + 13 new T-008), apps/web 17.
- `python contracts/verify_contracts.py` — "no frozen contracts yet (research phase) -- PASS by
  vacuity", exit 0.
- `cd apps/web && npx next build --webpack` — "Compiled successfully", TypeScript finished,
  routes `/`, `/approvals/[threadId]`, `/api/approvals/[threadId]`, `/api/demo/readback` all
  present.

## Mode D — live browser (own script, own server, own port)

I started the demo dev server myself (`next dev --webpack --port 3129`, default `demo` mode,
never `VC_WEB_MODE=live`, never touched `MONGODB_URL`) and wrote my own Playwright script from
scratch (does not reuse `apps/web/demo/browser-evidence.ts`):
`C:\Users\Lenovo\AppData\Local\Temp\claude\d--vc\...\scratchpad\t-008-checker\browser-flow.mjs`.
It runs against a **fresh** server instance (all 3 demo threads untouched at the start).

**24/24 of my own assertions passed**, covering every item in the dispatch:
- Per-fact approve / edit / reject on all 4 facts; submit stays disabled at 0/4, 3/4, and 4/4
  facts decided until the summary is also decided (I checked each intermediate state, not just
  the end state).
- Withhold the summary; submit only then enables.
- Read-back (through the demo `/api/demo/readback` route into the fake db) **before** submit:
  0 facts, 0 claims — confirmed independently.
- Submit: outcome `written`; read-back **after** submit: active facts are exactly
  `targetCountry`, `preferredIntake` (edited to "January 2028"), `budget_inr_per_year`;
  `intendedMajor` (rejected) has **no document at all**; the session's summary is `""` with the
  counsellor-withheld reason.
- Reload: shows the resolved `done` state, not the form.
- Double submit from two tabs opened on the same thread before either submitted, tab B holding a
  **different** decision set: tab B gets 409 `already_resolved`, `sameAsWinner=false`, and is
  shown the WINNER's written facts, not its own attempted ones. Read-back after tab B's rejected
  attempt is byte-identical to the state right after tab A's submit.
- Fenced thread: 0 fact cards, fenced banner. In-progress thread: `in_progress` banner.
  Not-found thread: `not_found` banner.
- Mobile width (390px): `scrollWidth - clientWidth <= 0` on the fenced page (no horizontal
  overflow).
- Console errors per page, counted myself: index 0, tabA 0, tabB 1, fenced 2, in-progress 0,
  not-found 2, mobile 2 — all five non-zero counts are the same `409/423/404 Failed to load
  resource` lines the maker's own report documents, for the exact HTTP statuses those steps
  test; no unexplained error.

Report written to
`qa/evidence/browser-t-008-approval-ui-2026-09-25-checker/report.json` (my own, alongside the
maker's `qa/evidence/browser-t-008-approval-ui-2026-09-25/`, not overwriting it).

**LIVE-BROWSER:** `qa/evidence/browser-t-008-approval-ui-2026-09-25-checker/report.json`

## Hostile API probes (own script, run first against a FRESH server, before any decision consumed thread 1)

Second independent script, `api-probes.mjs`, run against its own fresh server start. **22/22
probes behaved safely**:
- Malformed JSON body -> 400 invalid.
- Missing per-fact decision, duplicate key, unknown key (both "extra 5th key" and "substituted
  bogus key") -> all refused 400, thread stays `awaiting_approval` (re-checked with GET after
  each), readback stays empty after each.
- A 5MB body that is also structurally invalid (unrecognized field, or a 5MB string where an
  enum is expected) -> refused 400, does not hang or crash the route handler, no write.
- `threadId` hostile variants (`..`, encoded slash, space, semicolon) -> 400/404, never a 500 or
  a path escape.
- Submit to the **fenced** thread -> 423, no fact data disclosed on GET either.
- A **fully valid** per-fact submit to the **in_progress** (already-claimed) thread -> 409
  `already_resolved`, decision `{approve:true, edits:[]}` (the seeded claim's own decision,
  never invented), never 200.
- GET/POST an unknown thread -> 404, no write.
- Confirmed thread 1 was **still untouched** (`awaiting_approval`, empty readback) after every
  one of the above, before I deliberately spent its one-shot interrupt on the last probe below.

**Finding (not a blocker): ISS-t-008-c0-1.** The last probe sent a fully-valid per-fact decision
set except one edit value was an object (`{not: "a number"}`) for `budget_inr_per_year`
(proposed value `2000000`, a number). The API **accepted it** (200 `done`) and the fact was
**stored as that object**. `EditedValueSchema` (schemas.ts) only refuses
undefined/null/empty-string; it never checks the edited value's type against the proposed
value's type — that check exists only client-side in `ApprovalScreen.tsx`'s `editedValue()`.
Filed at low severity: `FactSchema.value` was already `z.unknown()` before this unit (so this
widens, rather than introduces, a loose boundary), and the stage is offline/demo-only with no
auth yet (see residual judgment below). Worth a same-type refinement on `EditedValueSchema`
before any real deployment.

**Confirmed live: demo mode cannot become live via a typo.** Started a separate server instance
with `VC_WEB_MODE="LIVE"` (uppercase) — the index page, the approval thread GET, and the
demo-only `/api/demo/readback` route (404 in real live mode) all still answered as `demo`,
confirming `resolveMode`'s exact-match check behaviourally, not just via the unit test.

## Falsification (my own, in a scratch copy, never the bound tree)

Built a throwaway copy of the whole worktree (symlinked `node_modules` rather than reinstalling)
under my scratchpad, confirmed it GREEN (13/13 `scribe-per-fact.test.ts`) before any edit, then
applied 5 single-hunk falsifying edits to files named in the manifest's "What changed", one at a
time, confirming the **named** check goes red and restoring before the next:

| Row falsified | Edit | Result |
|---|---|---|
| Rejected fact written too (F1) | `nodes.ts`: also push rejected facts into `edits` | 7 tests red incl. the two rows the manifest names for F1; restored, back to 13/13 |
| Edit writes the proposed value, not the counsellor's (F2) | `nodes.ts`: edit branch drops `value: d.value` | exactly 1 test red — the row the manifest names |
| Missing-key check bypassed (F4/B3) | `nodes.ts`: `if (false && missing.length > 0)` | engine's `B3: nothing is written before submit...` test goes red (the web `api.test.ts` suite, which doesn't re-implement this check, correctly stayed green — no double coverage claimed there) |
| Fenced state discloses data (F6) | `graph.ts` `inspectScribe`: `if (false && (await fencedForPostCheck(...)))` | exactly 1 test red — the fenced-state row |
| B1 script-like label (F9) | `labels.ts`: `submit` label replaced with a composed sentence ("Tell the student...") | exactly the B1 label test goes red; the "only labels or data" test stays green (correctly — it's a different assertion) |

All 5 rows isolate to their named capability with no wrong-reason red. `git status` in the bound
worktree was clean of any falsification residue throughout (only my own evidence dir appeared,
never a product file).

## B1 (no-script) — code review

Read `labels.ts` (53 entries, all short UI chrome — "Approve", "Reject", "Thread", etc., no
composed sentences) and `ApprovalScreen.tsx` in full. Every non-label string rendered is
proposal data: `fact.key`, `fact.value`/`display()`, the transcript `quote`, `turnId`,
`sensitivity`, a confidence percentage, drop `reason`, the draft `summary`, or a Zod validation
issue string (a technical refusal message, not recital content). Confirmed by falsification (F9
above): the dedicated test catches an injected script-like label.

## B12 (single DB helper) — independent grep

`grep -rn "\.db(" apps/web/src apps/web/demo` — no matches. `grep -rln "mongodb" apps/web/src` —
no matches. `MONGODB_URL` appears only in comments, never in executable code under
`apps/web/src` or `apps/web/demo`. Matches the manifest's E6 claim.

## Engine back-compat + inspectScribe read-only claim

Read the "T-008 backward compatibility" test (`scribe-per-fact.test.ts:205-212`): a genuine
`{action:"approve"}` whole-batch run through `startScribe`/`resumeScribe`, asserting 3 facts
written and the summary stored — not a stub. Read `inspectScribe` (graph.ts:745-765) end to end:
it only calls `graph.getState` and read collections (`fencedForPostCheck`,
`scribeResolutionsCollection(...).findOne`) — no insert/update/delete anywhere in the function.
The read-only claim holds.

## Diff scope (step 4c)

`git diff e2257fa..HEAD --stat` matches the manifest's declared "What changed"/"Scope" exactly:
engine `schemas.ts`/`nodes.ts`/`graph.ts` (additive), `packages/engine/package.json`,
`apps/web/**` (new Next app replacing the `src/index.ts` stub, as declared), `pnpm-lock.yaml`,
the manifest and its evidence dirs. No file outside that list touched; no existing
function/export/test deleted beyond the declared stub replacement.

## Issues addressed

`ISS-t-013-rev-5` (per-fact approve/hold + needsReview rendering) is genuinely fixed by this
unit — confirmed via my own browser run (a `needsReview` fact's chip renders, per the manifest's
UI test) and the per-fact decision flow end to end. Flipped `open -> fixed` in the ledger.

## Residual judgments (per the dispatch)

- **No-auth (Residual 4): accepted.** This stage is offline/demo-only (`demo` is the default
  mode, `live` has never run per B8, and "Production deploy" is an explicit contract non-goal).
  Must gate before any non-local deployment, as the manifest itself states — not a cycle-0
  blocker.
- **Edit provenance (Residual 2): accepted residual, not a new B2 violation, pending a D-entry.**
  An edited fact keeps the ORIGINAL transcript quote as its `source` even though the stored
  value may now contradict that quote. B2's text requires every fact to *carry a source*; it
  does not require the source to remain semantically consistent with a later human edit. This
  behaviour is unchanged from the pre-existing whole-batch `edit` action (not introduced by
  T-008), so judging it as a fresh B2 violation here would penalize this unit for an inherited
  gap. The manifest's own "Open for the Approver" section already asks for this decision — I
  agree it needs a D-entry (a `counsellor-edit` source variant or edit-audit fields) but that is
  future work, not a reason to FAIL cycle 0.

## Capability coverage

14/14 rows in the manifest's table have independent evidence: 5 reproduced by my own
falsification (table above), the rest exercised end-to-end by my own browser flow and/or hostile
API probes (summary withhold, in_progress, fenced, B3 pre-submit read-back, B5 invalid bodies,
already_resolved, needsReview rendering, B12). None UNVERIFIED.

**CAPABILITY-COVERAGE:** 14/14 rows independently reproduced (5 via my own falsifying edits, 9
via my own live browser + API probes)
**LIVE-BROWSER:** qa/evidence/browser-t-008-approval-ui-2026-09-25-checker/report.json (24/24
own assertions pass; hostile probes 22/22 in a separate script)
**ISSUES-WRITTEN:** ISS-t-008-c0-1 (low, open); ISS-t-013-rev-5 flipped open -> fixed
**EXECUTOR:** maker build subagent (checker: claude-sonnet-subagent)

## Scoreboard

**SCOREBOARD:** 14/14 primary+fencing criteria evidenced (B1, B2, B3, B4, B5, B11, B12, B8, B14,
B15-not-applicable-to-this-unit's-scope), 0 invariants broken. One low-severity finding
(ISS-t-008-c0-1) filed as debt, not a blocker.

## EXPLANATION

Every command in the manifest reproduced with identical results (495/495 tests, typecheck,
build, contract validator). My own from-scratch browser script and hostile-probe script,
run against server instances I started and stopped myself, confirm every claimed interaction
and every hostile-input safeguard independently, including two live behavioural checks the
manifest didn't itself demonstrate live (the `VC_WEB_MODE` typo-safety and a fully valid
"steal the claim" submit against the `in_progress` thread). Five falsifying edits to the actual
changed files all isolate to their named test with no wrong-reason red, and `git status` in the
bound worktree stayed clean of any falsification residue throughout. One low-severity, non-blocking
finding was filed (API-boundary edit-value type looseness); both residuals flagged in the
dispatch are judged accepted for this cycle, with reasoning recorded above.
