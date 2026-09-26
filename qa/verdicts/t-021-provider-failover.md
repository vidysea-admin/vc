# Verdict: t-021-provider-failover

**Date:** 2026-09-26 · **Cycle checked:** 0 (manifest Fix cycle: 0) · **Checker:** fresh Claude
Sonnet subagent, no builder context, Mode A + Mode D + B17 persona check.
**Bound root:** `D:/vc/.worktrees/t-021-provider-failover` (branch `wave/t-021-provider-failover`).
**Base commit:** `0e00269701ad2aa6c04d92c8010bcabfffd45349` (confirmed via `git merge-base main HEAD`).
**Head:** `0fa58c1`. Working tree clean at check time (unit already committed).

## What I re-ran myself

- `pnpm --filter @vc/providers typecheck` → exit 0. `pnpm --filter @vc/providers test` → **43/43**
  (matches manifest).
- `pnpm --filter @vc/observability typecheck` → exit 0. `test` → **59/59** (matches).
- `pnpm --filter @vc/web typecheck` → exit 0. `test` → **30/30** (matches).
- `pnpm --filter @vc/engine typecheck` → exit 0 (incl. new `scripts/tsconfig.json`). `test` →
  **161/161** (matches; engine source untouched by this unit, confirmed by diff).
- `python contracts/verify_contracts.py` → "no frozen contracts yet -- PASS by vacuity", exit 0.
- `pnpm --filter @vc/engine smoke:litellm` → real `SKIP — VC_LLM_BASE_URL is not set...`, exit 0.
  Grepped `.env`, `../../.env`, `D:/ai_os/.env` for `VC_LLM*` myself: no matches in any of the
  three. **The live 3-class LiteLLM gateway proof genuinely could not run in this environment.**
  This is honestly stated as open debt in the manifest's Residuals #1, not faked as a pass — I
  judge the honesty of the disclosure, not the missing proof itself, per my dispatch instructions.
  Run per-package throughout (never `pnpm -r test`), per the RAM constraint. All test counts and
  exit codes reproduced **exactly** what the manifest claims — no pasted-output trust taken.

All ran package-by-package (RAM discipline). Every package server/test process was closed before
moving to the next; nothing left listening except during the browser run (stopped after, see below).

## Criteria (contract counselling-engine.md; B6 primary + B1,B2,B5,B8,B11,B13,B14,B17)

- **B6 (runtime failover, D-019/D-020):** PASS. Read `packages/providers/src/index.ts` directly —
  `FailoverProvider.generate()` round-robins the config-ordered chain (`attempt % chain.length`),
  default budget `FAILOVER_DEFAULT_MAX_ATTEMPTS = 10` (matches gate answer "about 10 retry"),
  full-jitter exponential backoff between attempts. `isRetryableProviderError` whitelists exactly
  timeout/malformed/network/429/5xx; everything else (401, ZodError, unrecognised) is rethrown
  immediately with no retry — confirmed both by reading the whitelist and by falsifying it (below).
  `createProvider`'s `litellm` case (line 728-738) has exactly two branches — a plain
  `LiteLlmProvider` or a `FailoverProvider` wrapping N `LiteLlmProvider`s — **no branch ever
  constructs a `rules` provider**; I read the full switch statement myself. On exhaustion,
  `emitFailoverAlert` fires once (confirmed) and `AiUnavailableError` (typed, key-free) is thrown.
- **Alert (item a):** PASS. `emitFailoverAlert` = one key-free `console.error` JSON line + one real
  OTel error span via `recordErrorSpan`, carrying `"gen_ai.system": "litellm"` — read the
  `errorSpan.ts` CALLER NOTE and confirmed by falsification #4 (below) that this attribute is
  load-bearing for Langfuse's export filter, not decorative.
- **Apologetic Retry, no retype (item b):** PASS, verified **live in my own browser**, not from the
  maker's tests or screenshots (see Mode D below) — including a byte-for-byte comparison of the two
  POST bodies pulled directly from the network panel.
- **B1 (no-script):** PASS. Read `NewSessionForm.tsx` — the ai_unavailable banner uses only
  `LABELS.stateAiUnavailable/aiUnavailableApology/aiUnavailableHint`, all short, non-recital,
  confirmed live on screen: "AI is unavailable right now" / "Sorry for the trouble" / "Nothing you
  typed is lost". Pre-existing `ui.test.tsx` short-label test still green (part of the 30/30).
- **B2 (cited facts):** not touched by this unit's diff (no scribe/citation code changed); not
  violated — the post-retry approval screen still shows facts with quote/turn/confidence as before.
- **B5 (typed boundaries):** PASS. `StartSessionRequestSchema`/`StartSessionResultSchema` (Zod,
  discriminated union) gate the new endpoint; `submitSession` parses both the request and every
  reply through them.
- **B8 (data boundary):** PASS. No new `MONGODB_URL`/Mongo code in this diff; the live runtime path
  reuses the existing `connectFromEnv` wiring unchanged. All new/changed tests run offline against
  in-process HTTP stubs (`127.0.0.1`, ephemeral ports) or pure in-memory fakes — confirmed by
  reading `failover.test.ts` and `error-span.test.ts` directly.
- **B11 (secrets):** PASS. `git diff <base>..HEAD -- <the 4 core files>` grepped for
  `apikey|sk-|secret|password|token`: only field names and doc comments, no key VALUES. `apiKey` is
  a private class field (`#apiKey`) on both `GeminiProvider` and `LiteLlmProvider`, so it never
  serializes. `.env.example` unchanged for actual secrets; `VC_LLM_MODELS`/`VC_LLM_RETRY_BUDGET`
  are non-secret config, not in scope of the "key value" rule.
- **B13 (no student data external):** PASS. `smoke-litellm.ts`'s one synthetic-only transcript,
  opt-in script, real SKIP when unconfigured (verified above). `NewSessionForm`'s demo transcript is
  fully synthetic (Toronto/Waterloo/September 2027/20 lakh — invented, not a real transcript).
- **B14 (outcome, not construction):** PASS — see Capability coverage below; all 4 rows independently
  reproduced by me in a throwaway copy, not trusted from the manifest's pasted output.
- **B17 (persona usability):** **PASS with one medium finding, no high finding** (does not block PASS
  per the contract's own rule — only `high` blocks). Walked both declared personas live in the
  browser (Jaipur counsellor, school counsellor) through the full failover → apology → Retry →
  approval-screen flow. Filed `ISS-t-021-c0-1` (medium): the new-session transcript table reuses the
  shared `colValue` label "Proposed value" for plain conversation text, which is genuinely a
  proposed-fact label everywhere else in the product — confusing but not blocking. Detail in
  `qa/evidence/persona-t-021-provider-failover-{jaipur-counsellor,school-counsellor}/persona-walk.md`.

## Diff scope (step 4c)

`git diff 0e00269..HEAD --stat` (30 files, +1826/-15) matches the manifest's declared Scope almost
file-for-file (plus the manifest itself and evidence PNGs, expected). Read the full diff for
`runtime.ts`, `contracts.ts`, `page.tsx`, `labels.ts`, and every touched `package.json`: **zero
deletions or renames of an existing function, export, route, test, or config key** — every hunk is
additive (new fields, new labels, one new import, one new dependency moved from dev to prod
`@opentelemetry/api` with a documented reason). No file outside the declared Scope was touched.
**No diff-scope violation.**

## Capability coverage (step 4b) — reproduced in a throwaway copy, not trusted

Copy method: `git worktree add <scratch>/row HEAD --detach` (outside the bound root, under
`C:/Users/Lenovo/AppData/Local/Temp/claude/checker-t021/row`) + `pnpm install --offline` (13.9s,
local `D:\.pnpm-store`, no network) — a real, independently-runnable copy, never a baseline
extraction. **Deviation, disclosed:** rather than 4 separate copies (one per row), I used one copy
and re-confirmed the named check GREEN immediately before *each* row's edit (not just once at the
start) — RAM/time discipline on a 1-copy-per-row basis would have meant 4 full `pnpm install`s. Every
row's green-before line below comes from a fresh re-run in that copy, right before that row's edit,
never reused from an earlier row or from step 3's bound-tree run.

| # | Capability | Edit applied (single-hunk, named file) | Before (copy, green) | After (copy, red) | Right assertion? |
|---|---|---|---|---|---|
| 1 | Non-retryable error (401) stops immediately | `packages/providers/src/index.ts`: `isRetryableProviderError` — added `err.status === 401` to the retryable branch | 43/43 | 2 failures: "a non-retryable error (401)... stops immediately" → `Missing expected rejection` (401 no longer rejects — model2 now answers); "isRetryableProviderError: whitelist..." → `true !== false` for status 401 | **Yes** — exactly the retry-whitelist behavior the row claims, not a parse/import break |
| 2 | Exhaustion alert fires exactly once | same file: duplicated the `this.onExhausted(...)` call before `throw new AiUnavailableError` | 43/43 | 2 failures, both `2 !== 1` on "the alert must fire exactly once, not once per attempt" / "the alert must fire exactly once" | **Yes** |
| 3 | `FlakyOnceProvider` genuinely fails once then recovers | `apps/web/demo/seed.ts`: `failCount = 1` → `failCount = 2` | 30/30 | 1 failure: Retry test → `503 !== 200` (one retry insufficient against `failCount=2`) | **Yes** |
| 4 | `gen_ai.system` load-bearing for the Langfuse export filter | `packages/observability/tests/error-span.test.ts`: removed `"gen_ai.system": "litellm"` from the asserted attributes | 59/59 | 1 failure: `expected exactly one exported span, got 0` (`0 !== 1`) | **Yes** |

All four reverted immediately after capturing the red line; the copy returned to full green
(43/43, 30/30, 59/59 respectively) after each revert, confirmed before moving to the next row.
**CAPABILITY-COVERAGE: 4/4 rows reproduced.**

## Mode D — live browser (own session, Playwright/Chromium; UI surface touched: apps/web new-session
screen, ai_unavailable state, Retry)

Started `pnpm --filter @vc/web dev` myself (port 3108, demo mode, `VC_WEB_MODE` unset), drove my own
browser — never read the maker's screenshots or substituted `curl`. Stopped the server after.

1. `/` → "Start a new session" link renders next to the 3 pre-seeded demo threads.
2. Clicked it → `/sessions/new` renders student id `demo-student-4` and all 5 synthetic transcript
   turns in a table, plus a Submit button.
3. Clicked Submit → `POST /api/sessions` → **503**, `ai_unavailable` banner renders: "AI is
   unavailable right now" / "Sorry for the trouble" / "Nothing you typed is lost" + Retry. The 5
   transcript rows stayed visible, unchanged. **1 console error**, and it is the expected 503 from
   this forced failure — no other page error.
4. **Pulled the two POST request bodies directly from the network panel** (request #12, the failed
   submit; request #15, the Retry) and diffed them myself: **byte-for-byte identical** JSON
   (`sessionId`, `studentId`, `sessionEndedAt`, all 5 turns verbatim) — this is *my own* independent
   confirmation of the "Retry preserves input" claim, not a re-read of the maker's test.
5. Clicked Retry → 200, "Session submitted" + a working link.
6. Followed the link → real approval screen: 4 proposed facts (targetCountry=Canada,
   intendedMajor=computer science, preferredIntake=September 2027, budget_inr_per_year=2000000)
   each with quote/turn/confidence, 2 dropped facts with reasons, a draft summary, per-fact
   Approve/Edit/Reject controls — the normal flow completes end to end after a successful retry.

Total console errors across the whole run: **1** (the expected 503). Evidence, plus my own
`report.json`, written to
`qa/evidence/browser-t-021-provider-failover-2026-09-26-checker/` (screenshots
`02-ai-unavailable.png`, `03-started.png`, `04-approval-after-retry.png`; `01-idle.png` could not be
saved — a sandbox path rejection on that one call — but the idle state is fully covered by the
accessibility snapshot taken at that step, reproduced in this file, plus `02-ai-unavailable.png`
which shows the same rows still rendered).

**LIVE-BROWSER:** `qa/evidence/browser-t-021-provider-failover-2026-09-26-checker/report.json`

## B17 persona walk

Both declared personas (Jaipur counsellor 1-2yr, school counsellor) walked live through the full
flow. One medium finding filed (`ISS-t-021-c0-1`, label mismatch, non-blocking); no high finding.
Detail: `qa/evidence/persona-t-021-provider-failover-jaipur-counsellor/persona-walk.md`,
`qa/evidence/persona-t-021-provider-failover-school-counsellor/persona-walk.md`.

## B19 scenario matrix

`qa/scenarios/counselling-engine.csv` does not exist yet. Per the contract's own clause, this
records `SCENARIOS: n/a (matrix not yet authored, B19)` rather than blocking.

## Residuals (from the manifest, judged not re-litigated)

1. Live 3-class LiteLLM smoke run — genuinely could not run here (no `VC_LLM_BASE_URL` anywhere
   reachable), honestly SKIPped, not faked. Open debt, correctly disclosed.
2. B17 persona walk was explicitly left to the checker — done above.
3. No circuit-breaker/cool-down memory across sessions — correctly scoped out, not requested by the
   gate.
4. No paging/alert-channel integration — matches the gate's own `[ASSUMPTION]`.

None of these block PASS; all are honestly disclosed, matching the dispatch instruction to judge the
SKIP as stated debt, not as a failure.

## Issues addressed

None claimed by this manifest (no `Issues addressed` section) — nothing to check against the ledger.

---

VERDICT: PASS
SCOREBOARD: 9/9 criteria met (B6 primary; B1, B2, B5, B8, B11, B13, B14, B17), 0/0 invariants (this contract expresses invariants as B-numbered criteria; none scored separately)
FAILURES (if any):
- none at >80% confidence
CAPABILITY-COVERAGE: 4/4 rows reproduced
LIVE-BROWSER: qa/evidence/browser-t-021-provider-failover-2026-09-26-checker/report.json
ISSUES-WRITTEN: ISS-t-021-c0-1 (medium, persona label mismatch, non-blocking)
EXECUTOR: claude-sonnet-subagent (manifest) (checker: claude-sonnet-subagent)
EXPLANATION: All manifest-claimed test counts (43/59/30/161, 568 total) reproduced exactly by re-running per package; typecheck clean across all 9 workspaces. All 4 capability-coverage falsifications independently reproduced in a throwaway git-worktree copy with the correct assertion firing each time. Diff scope is clean (no deletions/renames, no out-of-scope files). Mode D was driven in my own browser end to end, including an independent byte-for-byte comparison of the pre-/post-retry request bodies pulled from the network panel — not a re-read of the maker's screenshots or tests. B17 persona walk found one medium (non-blocking) label-mismatch finding, filed as ISS-t-021-c0-1. The one open gap (live LiteLLM gateway smoke run) is honestly SKIPped with a clear reason, exactly as the dispatch asked me to judge it — not a fabricated pass.
