# Verdict: t-021-provider-failover

**Date:** 2026-09-26 · **Cycle checked:** 1 (manifest Fix cycle: 1) · **Checker:** fresh Claude
Sonnet subagent, no builder context, Mode A + Mode D + B17 persona check, re-check of a prior PASS
after the maker reopened on its own ai-engineer review.
**Bound root:** `D:/vc/.worktrees/t-021-provider-failover` (branch `wave/t-021-provider-failover`).
**Diff range:** `e5aaaed..7c0496e` (main merged in at `6b5ac7d`, an ancestor of `e5aaaed`, confirmed
via `git merge-base`). **Head:** `7c0496e`, confirmed via `git rev-parse HEAD`. Working tree clean
at check time.
**Reopen context:** cycle 0 PASS (this same checker, `0321d12`) stood; the maker separately reopened
after its own ai-engineer review found `ISS-t-021-rev-1` (high, unbounded ~5.4 min worst-case wait)
and `ISS-t-021-rev-2` (medium, wrong-shape output never fails over). Umesh answered gate
`qa/gates/failover-scope.md`: Q1 A — 10 attempts total across the chain; Q2 A — wrong-shape output
counts as failed (fail over, then alert + apology/Retry).

## What I re-ran myself (per package, never `pnpm -r test`, ~3GB free RAM)

- `pnpm --filter @vc/providers typecheck` → exit 0. `test` → **47/47** (matches manifest; was 43 at
  cycle 0, +4 new cycle-1 tests).
- `pnpm --filter @vc/web typecheck` → exit 0. `test` → **31/31** (matches; was 30, +1 new relabel test).
- `pnpm --filter @vc/observability test` → **59/59** (unchanged, matches).
- `pnpm --filter @vc/engine typecheck` → exit 0 (incl. `evals/tsconfig.json` + `scripts/tsconfig.json`).
  `test` → **276/276** (matches; confirmed by reading `scribe/nodes.ts` that only a doc-comment
  changed, no logic).
- All four counts reproduced **exactly** what the manifest claims. No pasted-output trust taken —
  every command re-run myself, package-by-package, servers/processes closed between packages.

## Independent code reading (not just re-running the maker's tests)

Read `git diff e5aaaed..HEAD` for `packages/providers/src/index.ts`,
`apps/web/src/components/{NewSessionForm.tsx,labels.ts}`, and `packages/engine/src/scribe/nodes.ts`
in full, hunk by hunk, before trusting any manifest claim:

- `FAILOVER_DEFAULT_DEADLINE_MS = 45_000` (`VC_LLM_DEADLINE_MS` override), `LITELLM_DEFAULT_ATTEMPT_TIMEOUT_MS = 8_000`
  (`VC_LLM_ATTEMPT_TIMEOUT_MS` override), both validated as positive integers at `loadProviderConfig`
  (throws naming the var on garbage/zero/non-integer) — confirmed by my own hostile-variant tests
  below, not just by reading the code.
- `raceDeadline<T>()` races each attempt against the remaining wall-clock budget; `generate<T>()`
  checks the remaining deadline before every attempt AND before every backoff wait, capping the
  backoff itself at whatever remains — read line-by-line, matches the manifest's description exactly.
- `isRetryableProviderError` gains exactly one new line, `if (err instanceof z.ZodError) return true;`
  — the 401/403/404 branches are untouched, so the non-retryable-auth-error behavior cannot have been
  loosened by this addition (confirmed live below too).
- `NewSessionForm.tsx`: `CLIENT_TIMEOUT_MS = 50_000`, an `AbortController` wired into the `fetch` call,
  and the catch block maps `AbortError` to the same `ai_unavailable` screen state as a server-reported
  exhaustion (never the generic error banner) — `submission` itself is untouched by this change, so
  Retry-preserves-input still holds.
- `labels.ts`: new `colTranscriptText: "What was said"`, and `NewSessionForm.tsx:111` now renders it
  instead of `LABELS.colValue`.
- `scribe/nodes.ts`: **zero logic changes**, only a doc-comment addition. Read `isSchemaError` and
  `generateWithRetry` directly — `isSchemaError(err)` is `err instanceof ZodError || err.name ===
  "ZodError"`, which the typed `AiUnavailableError` (from an exhausted `FailoverProvider`) does NOT
  satisfy, so it is rethrown unchanged at the first attempt inside `generateWithRetry`'s loop — this
  is what makes the "no chain reset" claim true, confirmed by reading the code myself, not by taking
  the doc comment's word for it.

## Capability coverage (step 4b) — reproduced in MY OWN throwaway copy, not the maker's

Copy method: `git worktree add D:/vc/.worktrees/checker-scratch-t021-c1 7c0496e --detach` +
`pnpm install --offline` (9.5s, local `D:\.pnpm-store`, no network) — my own construction, not the
maker's `git ls-files`+`tar` copy or its claimed results. Removed afterward (`git worktree remove
--force` + a manual delete of the leftover `node_modules` tree it could not clean by itself, then
`git worktree prune`).

| # | Capability | Falsifying edit (single-hunk, in MY copy) | Before (green) | After (red) | Right assertion? |
|---|---|---|---|---|---|
| 5 | 45s wall-clock deadline actually bounds a hung chain | `packages/providers/src/index.ts:697`: bypassed `raceDeadline`, called `provider.generate<T>(request)` directly, un-raced | 16/16 (`failover.test.ts`) | `test timed out after 5000ms` on the "every attempt hangs forever" test, run with `--test-timeout=5000` — matches the manifest's claimed reason exactly | **Yes** |
| 6 | Wrong-shape (ZodError) response fails over within the same call | `index.ts:500`: `if (err instanceof z.ZodError) return true;` → `if (false && err instanceof z.ZodError) return true;` | 16/16 | 3 failures: the model-1-wrong-shape/model-2-valid test threw an unhandled `ZodError` instead of returning model 2's answer; the all-3-wrong-shape test's `assert.ok(err instanceof AiUnavailableError)` evaluated false (raw `ZodError` propagated) | **Yes** |
| 7 | Client-side `CLIENT_TIMEOUT_MS` safety net actually fires | `apps/web/src/components/NewSessionForm.tsx:26`: `50_000` → `999_000_000` | Live browser (real code, real worktree, port 3211): route-intercepted hung request + `page.clock.fastForward(51_000)` → `data-state="ai_unavailable"`, apology renders | Same script against the throwaway copy (port 3212) with the falsified constant: `stateAfter: null`, no apology — the abort never fires within the fast-forwarded window | **Yes** |

All three reverted immediately after capturing the red line; rows 5 and 6 re-confirmed green
(16/16) in the throwaway copy before it was discarded; row 7 confirmed green live in the bound
worktree (see Mode D) both before and independently of the falsification. **The live bound worktree
was never edited for any of this.**

Rows 1-4 (cycle 0: 401 non-retryable, alert-fires-once, `FlakyOnceProvider` genuine recovery,
`gen_ai.system` load-bearing) were not re-falsified this cycle — nothing in the cycle-1 diff touches
those code paths, and their underlying tests were re-confirmed green in the per-package runs above
(the 401 test specifically, live-stub-server based, is part of the 47/47 providers run).

## Hostile variants required by the dispatch — all independently proven

1. **Every attempt hangs forever → `AiUnavailableError` within the deadline, alert fires exactly
   once:** the maker's own test (re-run green, part of 47/47) plus my falsification of row 5 above,
   which proves the deadline — not merely a well-behaved per-attempt timeout — is what bounds it.
2. **Deadline expires mid-backoff:** my own independent test in the throwaway copy — a chain of
   instantly-rejecting retryable failures, `baseDelayMs=10_000` (a 10s backoff) vs `deadlineMs=100`
   — settles in well under 2s, with at least one real attempt observed first. Not one of the maker's
   own tests; I wrote this to specifically target the backoff-wait branch, not the attempt branch.
3. **Model 1 wrong-shape, model 2 valid → model 2's answer used:** maker's test re-run green (part
   of 47/47); mechanism independently confirmed by falsification row 6.
4. **All 3 wrong-shape → one alert + apology:** same as above; the maker's test asserts
   `alerts.length === 1` and `err.lastErrorName === "ZodError"`, re-run green.
5. **`generateWithRetry` no longer resets the chain:** confirmed by reading `scribe/nodes.ts` myself
   (see above) — `isSchemaError` structurally cannot match `AiUnavailableError`, so no second
   top-level `provider.generate()` call is ever issued for an exhausted chain.
6. **Non-retryable 401 still stops immediately:** the pre-existing live-stub-server test
   (`failover.test.ts`, "a non-retryable error (HTTP 401...) stops immediately") re-run green as
   part of 47/47 — the ZodError whitelist addition is a separate `if` branch and does not touch the
   `LiteLlmHttpError` branch, confirmed by reading the diff.
7. **`VC_LLM_DEADLINE_MS`/`VC_LLM_ATTEMPT_TIMEOUT_MS` set to garbage or 0:** my own independent tests
   — both env vars, both `"0"` and a non-numeric string, are rejected synchronously at
   `loadProviderConfig` with an error message naming the offending variable. Not silently accepted.
8. **Keys never appear in logs, spans or the UI:** grepped the full cycle-1 diff
   (`packages/providers/src/index.ts`, `packages/engine/src/scribe/nodes.ts`,
   `apps/web/src/components/{NewSessionForm.tsx,labels.ts}`) for `apikey|api_key|secret|token` — the
   only matches are the pre-existing `apiKey` field-name pass-through (unchanged shape, now also
   carrying `timeoutMs` alongside it — a number, not a secret). No new logging or exposure surface.
   Re-ran the existing B11 tests ("apiKey never in JSON.stringify/String()", "no key value in the
   message") green as part of 47/47.

## Mode D — live browser (own session, Playwright/Chromium via MCP, including
`browser_run_code_unsafe` for `page.clock` + `page.route` control — never the maker's script,
screenshots, or report)

Started `next dev --webpack --port 3211` myself against the **real, unfalsified** bound worktree
(`VC_WEB_MODE=demo`). Drove my own browser:

1. `/sessions/new` → accessibility snapshot shows `columnheader "What was said"` — the relabel is
   real and live, not just a passing unit test.
2. Clicked Submit → `POST /api/sessions` → 503, apology + Retry banner renders, 5 transcript rows
   unchanged.
3. Pulled the failed POST's exact body from the network panel myself (request #8).
4. Clicked Retry → 200, "Session submitted". Pulled the Retry POST's exact body (request #12) and
   diffed it against #8 myself: **byte-for-byte identical.**
5. Fresh navigation; installed `page.clock`; `page.route('**/api/sessions', ...)` that never
   fulfills (a true hang — the request never reaches the server at all); clicked Submit;
   `page.clock.fastForward(51_000)` → `data-state` flips to `ai_unavailable` with the same apology.
   This proves the **client-side** `CLIENT_TIMEOUT_MS` abort fires independently of the server, not
   merely that the server's own 45s deadline eventually resolves the request.
6. Falsified `CLIENT_TIMEOUT_MS` to `999_000_000` in a **separate throwaway copy** (port 3212, never
   the bound worktree) and repeated step 5's exact script → no state change within the same 51s
   fast-forward — RED as predicted. Reverted.

Stopped both `next dev` processes by PID after use; confirmed no LISTEN sockets remained on 3211/3212.

**LIVE-BROWSER:** `qa/evidence/browser-t-021-provider-failover-c1-2026-09-26-checker/report.json`
(screenshots `01-apology-retry.png`, `02-started-after-retry.png`).

## B17 persona walk

Re-walked jaipur-counsellor and school-counsellor live (both confirm `ISS-t-021-c0-1` resolved, no
new high finding). Added gaurav-bhaiya (D-021 persona ladder, "Hindi and voice only, no typing" —
named explicitly in the coordinator's cycle-1 dispatch): this specific flow needs no typing at all
(pre-filled submission, single-tap Submit/Retry), so his no-typing constraint is not violated by
this screen; the English-only text of `apps/web` is a real gap for a Hindi-only reader, but is
explicitly out of this unit's (and this reference app's) scope per D-021/B21 — `apps/web` is VC's
reference/test UI, never the production UI a real counsellor uses (Pathlynks builds that). No high
finding filed against T-021 for this reason; recorded for visibility, not as a blocker.
`qa/adapter.json` has no `personas` field on either this worktree or `main` — T-028 (the task that
would add it) is still `open` in `TASKS.md` on `main`, confirmed via `git show main:TASKS.md`. The
persona set walked here (jaipur-counsellor, gaurav-bhaiya, school-counsellor) was drawn from the
coordinator's explicit naming plus D-021's decision text, not from the adapter.

Detail:
`qa/evidence/persona-t-021-provider-failover-jaipur-counsellor/persona-walk.md`,
`qa/evidence/persona-t-021-provider-failover-school-counsellor/persona-walk.md`,
`qa/evidence/persona-t-021-provider-failover-gaurav-bhaiya/persona-walk.md` (new).

## Diff scope

`git diff e5aaaed..HEAD --stat` — 20 files, +924/-30. Every touched file matches the manifest's
declared cycle-1 scope (`packages/providers/src/index.ts`, `apps/web/src/components/{NewSessionForm.tsx,labels.ts}`,
`packages/engine/src/scribe/nodes.ts`, their test files, `docs/{DECISIONS.md,intent.md}`,
`qa/{gates/failover-scope.md,gates/plan-approved.md,issues.jsonl,manifests/...,QUEUE.md,.last-tick}`,
`TASKS.md`, plus the maker's own new `apps/web/demo/browser-evidence-failover-c1.ts` and its evidence
PNGs/report.json) — no file outside this list, no deletions or renames of an existing export, route,
test, or config key. **No diff-scope violation.**

## Issues flipped to fixed (own reproduced evidence only)

- **`ISS-t-021-c0-1`** (medium, label mismatch) → `fixed`, verified 2026-09-26. Evidence: live
  browser snapshot + re-walked persona files + re-run `new-session-ui.test.tsx`.
- **`ISS-t-021-rev-1`** (high, unbounded ~5.4 min worst case) → `fixed`, verified 2026-09-26.
  Evidence: falsification row 5, my own mid-backoff/garbage-env hostile-variant tests, live
  client-timeout browser test + its own falsification (row 7).
- **`ISS-t-021-rev-2`** (medium, wrong-shape never fails over) → `fixed`, verified 2026-09-26.
  Evidence: falsification row 6, direct reading of `scribe/nodes.ts`'s `isSchemaError`, maker's
  live-chain wrong-shape tests re-run green.

All three overlay rows appended to `qa/issues.jsonl` with `"update": true`, each carrying its own
independently-reproduced evidence string (not copied from the manifest's claims).

## Residuals (unchanged from cycle 0, not re-litigated)

1. Live 3-class LiteLLM gateway smoke run — still genuinely un-runnable here (no `VC_LLM_BASE_URL`
   reachable), still honestly SKIPped. Not claimed as changed by fix cycle 1.
2. `qa/scenarios/counselling-engine.csv` (B19) still does not exist (T-028 open). `SCENARIOS: n/a`.

---

VERDICT: PASS
SCOREBOARD: 9/9 criteria met (B6 primary; B1, B2, B5, B8, B11, B13, B14, B17), 0/0 invariants (this contract expresses invariants as B-numbered criteria; none scored separately)
FAILURES (if any):
- none at >80% confidence
CAPABILITY-COVERAGE: 3/3 new (fix cycle 1) rows reproduced in the checker's own throwaway copy; rows 1-4 (cycle 0) re-confirmed green via the per-package test re-runs, not re-falsified (nothing in this diff touches those paths)
LIVE-BROWSER: qa/evidence/browser-t-021-provider-failover-c1-2026-09-26-checker/report.json
ISSUES-WRITTEN: none new this cycle
ISSUES-FIXED: ISS-t-021-c0-1, ISS-t-021-rev-1, ISS-t-021-rev-2 (all independently reproduced, not taken on the manifest's word)
EXECUTOR: claude-sonnet-subagent (manifest, fix cycle 1) (checker: claude-sonnet-subagent)
EXPLANATION: All manifest-claimed cycle-1 test counts (47/31/59/276) reproduced exactly, per package, never `pnpm -r test`. All three new capability-coverage rows (deadline bounds a hung chain, ZodError fails over, client-timeout safety net) independently falsified in the checker's own throwaway git-worktree copy — never the maker's copy or claimed results — with the correct assertion firing each time and a clean revert back to green. Went beyond the manifest's own falsifications with four checker-only hostile-variant tests (deadline-mid-backoff, VC_LLM_DEADLINE_MS/VC_LLM_ATTEMPT_TIMEOUT_MS garbage/zero rejection) and one checker-only live-browser falsification (CLIENT_TIMEOUT_MS in a separate throwaway copy). Mode D was driven end to end in the checker's own browser via MCP tools, including `page.clock` + `page.route` control for the client-timeout path (not a real 50s wait, not the maker's script or screenshots), plus an independent byte-for-byte diff of the pre-/post-retry request bodies. Read `scribe/nodes.ts` directly to confirm the "no chain reset" claim structurally, not just by re-running a test. B17 persona walk added gaurav-bhaiya (named in the dispatch) with a reasoned no-block judgment grounded in D-021/B21's own scope decision (apps/web is reference-only). All three reopened issues (ISS-t-021-c0-1, rev-1, rev-2) flipped to fixed only on the checker's own reproduced evidence, each cited individually in qa/issues.jsonl.
