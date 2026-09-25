# Manifest: t-008-approval-ui

**Contract:** qa/contracts/counselling-engine.md (B1, B2, B3, B4, B5, B11, B12 primary; B8, B14, B15 fencing; D-012, D-014, D-015, D-016, D-017)
**Goal task:** T-008 (counsellor diff-approval UI, Next.js per docs/plan.md §5 "UI" row)
**Status:** ready-for-check
**Fix cycle:** 0
**Branch:** `wave/t-008-approval-ui` (worktree `D:/vc/.worktrees/t-008-approval-ui`), branched from main `e2257fa`
**Diff range (cycle 0):** `e2257fa..HEAD`, three commits:
- `86c8f19` feat(engine): t-008 per-fact ApprovalResponse + inspectScribe (ISS-t-013-rev-5)
- `c2bed14` feat(web): t-008 Next.js approval screen, route handlers, demo runtime, browser evidence
- the manifest commit "feat(web,engine): t-008 counsellor diff-approval UI" (this file + falsification evidence)
**Issues addressed:** ISS-t-013-rev-5 (medium, ux-safety): per-fact approve/edit/reject + needsReview rendering
**Scope:**
- `packages/engine/src/scribe/{schemas,nodes,graph}.ts` (additive), `packages/engine/package.json` (a `./scribe/schemas` subpath export), `packages/engine/tests/scribe-per-fact.test.ts` (new)
- `apps/web/**`: the stub `src/index.ts` and its test are replaced by a Next.js 16 App Router app
- `pnpm-lock.yaml`, `qa/evidence/t-008-approval-ui/`, `qa/evidence/browser-t-008-approval-ui-2026-09-25/`, this manifest
**Not touched:** `.claude/**`, `docs/DECISIONS.md`, `scripts/**`, `qa/contracts/**`, `TASKS.md`, `packages/db/**`, `packages/schemas/**`, `packages/providers/**`, `packages/observability/**`, `mcp/**`, `apps/api/**`
**Executor:** maker build subagent
**Offline:** every run is offline (B8). Nothing connected to MONGODB_URL and nothing called Gemini. The demo and the browser run use the in-process fake db, MockProvider and synthetic transcripts.

## What changed

### Engine (additive, backward compatible)
- `schemas.ts`:
  - `ApprovalFactSchema` = FactSchema + optional `needsReview` / `reviewReasons`, used by `ApprovalRequestSchema.facts`. It is optional because T-013 (not merged) sets these fields on FactSchema itself. Until then they are absent, which means "not flagged". The names match the T-013 branch (`git diff main...wave/t-013-citation-robustness -- packages/schemas`).
  - A new `per_fact` variant of `ApprovalResponseSchema`: `{ action: "per_fact", facts: [{key, decision: approve|reject|edit, value?/reason?}], summary: approve|withhold }`. An edit value must be present, non-null and non-empty. The whole-batch `approve` / `edit` / `reject` variants are unchanged.
  - `SummaryDecisionSchema`, `COUNSELLOR_WITHHELD_SUMMARY_REASON`, and an optional `summaryDecision` on `ApprovalOutputSchema` and `WriteInputSchema`.
- `nodes.ts`:
  - `decisionFromResponse` handles `per_fact` (`perFactDecision`). Every proposed key must be decided exactly once: an unknown key, a duplicate or a missing key throws `ApprovalResponseError`. resumeScribe calls this function BEFORE it takes the D-014 claim, so a refused response claims and writes nothing and the thread stays open.
  - `edits` = approved facts as proposed, plus edited facts with only `value` replaced (source, confidence and sensitivity stay those of the proposal, B2; purposeTags stay `[profile_synthesis]`, ISS-t-007-rev-5). Rejected facts are left out.
  - The decision approves when a fact or the summary is kept. Everything rejected plus the summary withheld gives `approve:false`, which is the terminal `rejected` result and writes nothing.
  - `writeApproved`: with `summaryDecision: "withhold"`, `recordApprovedSessionSummary` stores `summary: ""` plus the counsellor-withheld reason. `applyApprovedDiff` still writes exactly `decision.edits`, so only approved and edited facts are written.
- `graph.ts`:
  - a `summaryDecision` state channel, set by the approval node and passed to the write node;
  - a `per_fact` all-rejected run gets a reason on its `rejected` result;
  - a new read-only `inspectScribe(graph, threadId)` returns `not_found | fenced | in_progress | awaiting_approval | done{result, decision, summaryDecision}`. It never claims, invokes or writes. The fence is checked first (fail-safe: an unreadable fence counts as fenced), the same "fenced over already_resolved" rule as resumeScribe. A claimed thread whose decision is not recorded yet, or a pending write, is `in_progress`.

### Web (`apps/web`, Next.js 16.3 App Router, TypeScript)
- `src/server/contracts.ts`: the Zod contracts of the API (B5), shared by server and client:
  - `ThreadIdSchema`: charset, length, no `..`
  - `DecisionRequestSchema`: strict
  - `ApprovalViewSchema` (the GET reply) and `SubmitResultSchema` (the POST reply)
- `src/server/approval-service.ts`: framework-free and tested offline.
  - `getApprovalView` wraps `inspectScribe` and is read-only.
  - `submitDecision` validates the body, answers an unknown thread with 404 before anything runs, calls `resumeScribe` with `per_fact`, and maps the outcome to a status: done 200, already_resolved 409, in_progress 409, fenced 423, invalid 400, not_found 404.
  - Every reply body is Zod-parsed before it is returned.
- `src/app/api/approvals/[threadId]/route.ts`: `GET` and `POST` route handlers only. There is no other backend framework. Non-JSON input gets 400, and replies carry `no-store`.
- `src/server/runtime.ts`: one runtime per process, held on `globalThis`.
  - The default mode is `demo`. `live` runs only when `VC_WEB_MODE === "live"` exactly, so a typo cannot reach production.
  - In live mode the Db comes from `@vc/db connectFromEnv` → `getVcDb` (B12) and the checkpointer from `initScribeCheckpointer`. Nothing has exercised this path.
- `demo/seed.ts` sits outside `src/` because it is demo infrastructure that imports `@vc/db/testing`. It is the production wiring over a fake:
  - `getVcDb` on `createFakeMongoClient`, the REAL `MongoDBSaver` over that fake, and `compileScribeGraph`
  - production unique indexes from INDEX_PLAN, and MockProvider with synthetic transcripts
  - three threads, each paused by a real `startScribe`:
    - (1) paused
    - (2) paused, then `requestErasure`/`confirmErasure` gives it a real D-015 fence
    - (3) paused, with a seeded D-014 claim of a crashed winner, so it shows `in_progress`
  - A demo-only read-back route, `src/app/api/demo/readback`, returns 404 in live mode.
- `src/components/ApprovalScreen.tsx` (a client component) plus `labels.ts`.
  - Each fact card shows the key, the op, the proposed value, the current value for an update, the transcript quote, the turn, the confidence, the sensitivity, and a "Needs review" chip with its reasons.
  - It lists the dropped facts with their reasons and shows the draft summary. A summary withheld by the model under B1 shows only its reason, and approve is disabled for it.
  - Each fact has Approve / Edit / Reject radio buttons. An edit keeps the value's type: a number stays a number, and anything that is not a number is flagged.
  - The summary has Approve / Withhold.
  - Submit stays disabled until every fact and the summary are decided. Nothing is sent before Submit (B3).
  - Distinct labelled states: loading, error, fenced, in_progress, not_found, invalid, done (the written facts plus the summary decision), and already_resolved (the winner's decision, and whether it was the same decision).
- **B1:** every word the UI writes itself is a label in `labels.ts`. A test proves that every other text node on screen is proposal data.
- `next.config.ts`: `transpilePackages` covers the @vc/* packages, which ship TS source. `mongodb`/LangGraph stay external. webpack `extensionAlias` maps `.js`→`.ts`. **The scripts pass `--webpack`**, because Turbopack in Next 16.3 did not resolve the packages' NodeNext `./x.js` specifiers (it failed with "export startScribe was not found").
- Scripts: `pnpm --filter @vc/web demo` (next dev on :3108), `build`, `typecheck`, `test`, `evidence:browser`.

## Evidence

| # | Claim | Command | Result |
|---|---|---|---|
| E1 | RED before implementation (engine) | `cd packages/engine && npx tsx --test tests/scribe-per-fact.test.ts` | FAIL: `does not provide an export named 'ApprovalResponseError'` (`qa/evidence/t-008-approval-ui/red-engine.txt`) |
| E2 | RED before implementation (web) | `cd apps/web && npx tsx --test tests/*.test.ts tests/*.test.tsx` | FAIL: `Cannot find module ...src/server/approval-service` and `...src/components/ApprovalScreen` (`red-web.txt`) |
| E3 | GREEN: engine per-fact + inspect | `npx tsx --test tests/scribe-per-fact.test.ts` | 13/13 pass |
| E4 | Workspace typecheck | `pnpm -r typecheck` | exit 0, all packages incl. apps/web (`typecheck.txt`) |
| E5 | Workspace tests | `pnpm -r test` | **495 tests, 0 fail**: providers 8, schemas 50, observability 57, db 185, apps/api 8, mcp/university-kb 9, mcp/student-profile 12, engine 149 (136 before + 13 new), apps/web 17 (`test.txt`) |
| E6 | B12/D-016 scanners still clean with apps/web/src present | part of E5 (packages/db `db-scope.test.ts`) | pass: no `.db(` and no student-data writes under apps/web/src |
| E7 | Contract validator | `python contracts/verify_contracts.py` | `no frozen contracts yet (research phase) -- PASS by vacuity`, exit 0 |
| E8 | Production build compiles + typechecks | `cd apps/web && npx next build --webpack` | `✓ Compiled successfully`, `Finished TypeScript`, routes `/`, `/approvals/[threadId]`, `/api/approvals/[threadId]`, `/api/demo/readback` |
| E9 | Falsification (10 mutations) | scratchpad `falsify.py` (applies one mutation, runs the named test file, restores the file) | 10/10 CAUGHT (`falsification.txt`); the working tree was clean afterwards |
| E10 | Live browser run | `pnpm --filter @vc/web evidence:browser` | 18/18 interactions pass; 0 unexpected console errors (see below) |

## Capability coverage

| Capability | Test(s) | Falsified by |
|---|---|---|
| Per-fact approve/reject/edit writes exactly approved + edited facts | engine `per_fact: approve one, reject one, edit one`; web `POST: approve / reject / edit per fact ...`; browser E10 read-back | F1 (rejected written too), F2 (edit writes the proposed value) |
| A rejected fact is never written (no doc, no edge) | engine `a rejected fact is never written, whatever else is approved` | F1 |
| An edited value is written as edited (purpose stays profile_synthesis, source kept) | engine mixed test; web POST test; browser read-back `preferredIntake=January 2028` | F2 |
| Summary withhold stores no text, only the reason | engine `withholding the summary ...`; web POST test; browser read-back | F3 |
| Everything rejected + withheld → `rejected`, nothing written; summary-only approval → summary alone | engine two tests | F1 |
| B3 nothing written before submit (GET, repeated reads, invalid submits) | engine `B3: nothing is written before submit ...`, `inspectScribe ... reading never writes`; web `B3: reading ... writes nothing`, `B5: invalid decision bodies ...`; browser pre-submit read-back | F4 (missing-key check), F8 (GET resumes) |
| B5 request/response validation (Zod both ways) | engine `per_fact schema refuses ...`; web `B5: invalid decision bodies ...` (10 bad bodies incl. extra field, unknown/duplicate/missing key, empty edit), `not found and malformed thread ids`, route-handler non-JSON 400 | F7 (non-strict body) |
| Backward compat: whole-batch approve unchanged | engine `backward compatibility ...` + the existing 136 engine tests (all still pass) | — |
| already_resolved on a second submit (the first decision stands) | engine `a second per_fact submit is already_resolved ...`; web `POST twice ...`; browser stale-tab submit | — (resumeScribe's claim is T-007/T-016 code, unchanged) |
| in_progress state | engine `a claimed thread ... is in_progress`; web `in_progress ...`; browser | F5 |
| fenced state (no data disclosed, POST refused) | engine `a fenced student ... is reported fenced`; web `fenced ...`; browser (0 fact cards) | F6 |
| needsReview/reviewReasons optional in the schema and rendered per fact | engine `ApprovalRequestSchema keeps an optional needsReview ...`; web `pending: a needsReview fact is flagged ...` | F10 |
| B1 no-script: labels only, no composed sentences | web `B1: every UI label is a short label ...`, `B1: the only text on the screen is labels or data ...` | F9 (a "Tell the student ..." line) |
| B12 single DB helper | demo uses `getVcDb` on the fake client; live mode `connectFromEnv`; db-scope scanner covers apps/web/src (E6) | — |
| Demo never reaches production | web `runtime mode: demo unless VC_WEB_MODE is exactly 'live'` | — |

## Live browser evidence

- **Report:** `qa/evidence/browser-t-008-approval-ui-2026-09-25/report.json`, with screenshots `01-pending.png`, `02-decided.png`, `03-resolved.png`, `04-already-resolved.png`, `05-fenced.png` and `06-in-progress.png` in the same folder.
- **Setup:** `demo/browser-evidence.ts` starts `next dev --webpack` itself on :3118, drives headless Chromium 153 through the `playwright` npm package (devDependency 1.63), and stops only the server process tree it started (taskkill by that PID).
- **Warm-up:** before any tab opens, it warms every route with read-only GETs. In next dev, a route compiled for the first time hot-reloads the tabs already open, which on the first attempt silently replaced tab B's stale form.

Interactions (all `pass: true`):
1. The index lists the 3 synthetic threads.
2. The paused thread renders 4 facts (the budget quote "around 20 lakh rupees a year", t5, 66%), 2 dropped facts with reasons, and the summary.
3. Submit is disabled before any decision.
4. Approve targetCountry, reject intendedMajor, and edit preferredIntake to "January 2028". The 4th fact must be decided too, so budget is approved.
5. Withhold the summary: 4/4 decided, and Submit is enabled.
6. **Read-back BEFORE submit:** 0 facts, 0 claims, no summary (B3).
7. Submit: the outcome is `written`, and the written facts are targetCountry, preferredIntake and budget_inr_per_year.
8. **Read-back after submit** (through the fake db): the active facts are `{"targetCountry":"Canada","preferredIntake":"January 2028","budget_inr_per_year":2000000}`. There are 3 fact docs in total, intendedMajor is absent, and the summary is `""` with `withheldReason="withheld by the counsellor at approval"`.
9. Reload: the page shows the resolved state (3 written facts, summary withheld), not the form.
10. **Second submit** from tab B, which was opened before tab A submitted and made a different decision: `already_resolved`, `sameAsWinner=false`. It carries the first decision's 3 facts.
11. Read-back after the second submit: unchanged.
12. The fenced thread shows the fenced state with 0 fact cards.
13. The claimed thread shows `in_progress`.
14. An unknown thread shows `not_found`.
15. At 390px width there is no horizontal scroll (overflow 0px).

Console errors per page:

| Page | Console errors | Unexpected |
|---|---|---|
| index | 0 | 0 |
| approval (tab A) | 0 | 0 |
| approval (tab B) | 0 | 0 |
| decide + submit | 0 | 0 |
| reload | 0 | 0 |
| second submit (tab B) | 1 | 0 |
| fenced | 2 | 0 |
| in-progress | 0 | 0 |
| unknown | 2 | 0 |
| mobile | 0 | 0 |

All 5 errors are Chromium's own `Failed to load resource: ... status of 409/423/404` lines, logged for the very HTTP statuses those steps test. React StrictMode in dev fetches twice, so fenced and unknown show 2 each. The report lists every message verbatim, with `expectedStatusLogs` counted separately.

## Proposed D-entry (NOT written; for the orchestrator / Approver)

**What:** The counsellor approval contract is per fact.
- `ApprovalResponse` gains `per_fact`: every proposed key is decided exactly once (approve / edit / reject), and the summary is approved or withheld.
- An edit replaces only the value. The fact keeps its transcript source, confidence and sensitivity.
- Everything rejected plus the summary withheld is a `rejected` run.
- The web approval API is Next.js route handlers. It runs in `demo` mode (the in-process fake) unless `VC_WEB_MODE` is exactly `live`.
- The web app builds with webpack (`--webpack`) until Turbopack resolves NodeNext `.js` specifiers inside the workspace packages.

**Why:** ISS-t-013-rev-5: whole-batch approval could not hold back a flagged fact. B3 needs a per-fact decision. The default-to-demo rule keeps a misconfigured web server from writing to the production server (B8/B12).

**Open for the Approver:** see residual 2 (the provenance of an edited value).

**Links:** T-008, ISS-t-013-rev-5, T-013, D-014, D-017

## Residuals (stated gaps)

1. **needsReview renders only after T-013 merges.** On main, `FactSchema` strips unknown keys, so the scribe's `proposedFacts` never carry the flag, and the demo cannot show a flagged fact end to end. `ApprovalFactSchema` and the UI support it now; the component test and the schema test cover rendering and parsing. After the T-013 merge, re-run the browser evidence with a flagged fixture.
2. **The provenance of an edited value.** An edited fact is stored with the counsellor's value but the ORIGINAL transcript quote as its source, and the edit is not recorded as an edit. The quote can therefore contradict the stored value, for example "September 2027 intake" stored as "January 2028". A fix needs a schema change (a `counsellor-edit` source or edit-audit fields) and a D-entry. This is the same behaviour as the pre-existing whole-batch `edit` action.
3. **Per-fact reject reasons are accepted but not persisted.** Nothing is written to `decisions`, so there is no audit trail of why a fact was rejected.
4. **No authentication or counsellor identity on the route handlers.** Anyone who can reach the server can approve. This must land before any non-local deployment. `live` mode is written but has never run (B8).
5. **No recovery action for `in_progress` in the UI.** A crashed claim stays `in_progress` until an operator runs `resumeScribe(graph, null, …)`.
6. **The session row fields from D-017.** D-017 says `consentId`/`startedAt` on the session row are "optional until the session writer (T-008) fills them". This unit, as briefed, is the approval UI only and writes no session rows. Either the session writer needs its own unit, or T-008's scope should be widened by decision.
7. **The browser run used `next dev`.** The production build was checked separately (E8, `next build --webpack`) but was not driven in a browser.
8. **The demo `in_progress` thread uses a seeded claim.** It is a D-014 claim doc with an expired lease that simulates a crashed winner, not a real crash. The engine test for `in_progress` uses a real crash (an invoke that throws after the claim).
9. **Two Next bundling constraints:**
   - Next bundles each route separately, and in dev it re-evaluates modules on reload. The engine keeps each compiled graph's deps in a module-level WeakMap, so the runtime carries `{inspectScribe, resumeScribe}` from the same module instance as its graph.
   - Engine errors are matched by `name`, not `instanceof`.
   - The first dev run (without this) returned 500 "graph was not built by compileScribeGraph" on a second route.
10. **Files `next dev` generates.** When `next dev` detects an AI agent it writes `apps/web/AGENTS.md` and `apps/web/CLAUDE.md`, and it rewrites `next-env.d.ts`. All three are git-ignored in `apps/web/.gitignore` and are not committed: a generated CLAUDE.md is agent configuration, which /aios-config-auditor would need to review.
11. **Edits to object or array values.** An edited object or array value is sent as a string, because the text input does not parse JSON. Numbers and booleans keep their type.
