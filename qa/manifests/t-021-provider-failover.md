# Manifest: t-021-provider-failover

**Contract:** qa/contracts/counselling-engine.md (B6 primary; B1, B2, B5, B8, B11, B13, B14, B17)
**Goal task:** T-021 (TASKS.md line 32)
**Status:** ready-for-check
**Fix cycle:** 1 of max 3
**Design:** implements D-019 ("Runtime failover ... gated separately, in qa/gates/provider-fallback.md")
and D-020 ("Provider failover: a 3-model chain with a total retry budget of about 10 and backoff,
with no drop to the rules provider. When every model fails, engineering is alerted and the user
gets an apology plus a Retry that keeps their input."), per Umesh's answered gate
`qa/gates/provider-fallback.md` (2026-09-26): "model 1, fallback model 2, fallback 3 and with about
10 retry" / "it must need to be highlighted first for the engineering team and for the person
useing that, there should be an apologetic msg and also a retry msg so they dont have to retype".
No new ACTIVE decision is written here (D-019/D-020 already cover this unit's scope).
**Merge:** started from `main` at `0e00269` (green, T-020 done; T-023 follow-ups) via
`git -C <worktree> merge main` — already up to date, no conflicts, no new commits pulled (worktree
was branched after 0e00269 was already current).
**Diff range:** `0e00269..working tree` on branch `wave/t-021-provider-failover`, one commit to
follow this manifest.
**Scope:** `packages/providers/src/index.ts` (extended), `packages/providers/package.json`,
`packages/providers/tests/failover.test.ts` (new), `packages/observability/src/errorSpan.ts` (new),
`packages/observability/src/index.ts` (extended), `packages/observability/package.json`,
`packages/observability/tests/error-span.test.ts` (new), `apps/web/src/server/contracts.ts`
(extended), `apps/web/src/server/session-service.ts` (new), `apps/web/src/server/runtime.ts`
(extended), `apps/web/src/app/api/sessions/route.ts` (new), `apps/web/src/app/sessions/new/page.tsx`
(new), `apps/web/src/components/NewSessionForm.tsx` (new, then extended in fix cycle 1),
`apps/web/src/components/labels.ts` (extended, then extended again in fix cycle 1),
`apps/web/src/app/page.tsx` (extended), `apps/web/demo/seed.ts` (extended),
`apps/web/demo/browser-evidence-failover.ts` (new), `apps/web/package.json`,
`apps/web/tests/session-api.test.ts` (new), `apps/web/tests/new-session-ui.test.tsx` (new, then
extended in fix cycle 1), `packages/engine/scripts/smoke-litellm.ts` (new),
`packages/engine/scripts/tsconfig.json` (new), `packages/engine/package.json`,
`packages/engine/src/scribe/nodes.ts` (doc-comment only, fix cycle 1), `pnpm-lock.yaml`,
`qa/evidence/browser-t-021-provider-failover-2026-09-26/` (new, cycle 0),
`qa/evidence/browser-t-021-provider-failover-c1-2026-09-26/` (new, fix cycle 1),
`apps/web/demo/browser-evidence-failover-c1.ts` (new, fix cycle 1), this manifest.

### Fix cycle 1 (2026-09-26) — scope

Reopened by the checker/ai-engineer review on two issues, then a mid-cycle scope addition after
Umesh answered `qa/gates/failover-scope.md`:

- **ISS-t-021-rev-1** (high): worst-case wait before the apology was ~5.4 min (10 attempts x 30s
  per-attempt timeout + backoff, no request/client deadline). Fixed by a wall-clock `deadlineMs`
  independent of the attempt counter, plus a client-side `AbortController` safety net.
- **ISS-t-021-c0-1** (medium): the new-session transcript table reused the approval screen's
  "Proposed value" label (`colValue`) for plain conversation text. Fixed by a dedicated
  `colTranscriptText` label.
- **ISS-t-021-rev-2**, added mid-cycle after `qa/gates/failover-scope.md` Q2 A ("a wrong-shape
  answer now counts as FAILED"): a schema-invalid (Zod) model response was not retried within
  `FailoverProvider` and instead relied on `generateWithRetry`'s own re-ask, which issues a fresh
  top-level `provider.generate()` call — resetting the chain back to model 0 and starting a brand
  new deadline window instead of spending the same budget. Fixed by making `ZodError` retryable
  inside `FailoverProvider.isRetryableProviderError` (`packages/providers/src/index.ts:500`), the
  smallest in-place change: the failover layer now treats a wrong-shape response exactly like any
  other transient failure and fails over to the next chain member within the SAME call, same budget,
  same deadline. **ISS-t-021-rev-2 is fixed in this cycle, not merely gated** — see "What changed,
  fix cycle 1" and the two new tests below.
**Not touched:** `.claude/**`, `docs/DECISIONS.md`, `scripts/**`, `qa/contracts/**`, `TASKS.md`
(left `open` for the checker/close-out step), `packages/db/**`, `packages/schemas/**`, `mcp/**`,
`apps/api/**`, the existing `apps/web/tests/ui.test.tsx` / `apps/web/src/app/api/approvals/**`
approval flow (extended callers only, no rewrite), `demo/browser-evidence.ts` (the pre-existing
T-008 evidence script — left as-is; a separate script was added instead, per anti-drift "ADD, don't
entangle").
**Dual check:** no (no `.goal/` criticality marking on T-021; not requested in the brief)
**Executor:** claude-sonnet-subagent (maker build subagent)
**Executor rationale:** standard build unit, no specialised delegation lane needed.
**Offline:** every automated test below is offline (B8/B13). No `MONGODB_URL` connection anywhere
outside the pre-existing fake-Mongo test harnesses. The unit tests exercise `FailoverProvider`
against real in-process HTTP stub servers (`127.0.0.1`, ephemeral port) — never a real gateway. The
one place that DOES talk to a real network endpoint is `packages/engine/scripts/smoke:litellm`,
which is explicit, opt-in (`pnpm smoke:litellm`, not in the default `test` script), uses only
already-present env/.env gateway settings, prints keys never, and SKIPs (does not fake a pass) when
unconfigured — see "Live smoke run" below.

## What changed

### 1. `FailoverProvider` — the chain (`packages/providers/src/index.ts`)

New `FailoverProvider implements LlmProvider`. Wraps N `LlmProvider` instances built from
`VC_LLM_MODELS` (comma-separated, config order); round-robins through the chain on each retryable
failure, up to a total attempt budget (`maxAttempts`, default `FAILOVER_DEFAULT_MAX_ATTEMPTS = 10`,
configurable via `VC_LLM_RETRY_BUDGET`), with exponential backoff + full jitter between attempts
(`computeBackoffMs`: `round(random() * min(maxDelayMs, baseDelayMs * 2^(attempt-1)))`, base 200ms /
cap 4s by default). `isRetryableProviderError` whitelists exactly: `LiteLlmTimeoutError`,
`LiteLlmMalformedResponseError`, `LiteLlmNetworkError`, and `LiteLlmHttpError` only when
`status === 429 || status >= 500`. Anything else (auth/config errors, schema errors, an
unrecognised error) is rethrown immediately with **no retry and no failover to the next model**
(D-020 constraint). There is **no automatic drop to the `rules` provider anywhere in this chain** —
`createProvider`'s `litellm` case only ever builds a chain of `litellm`-kind providers.

Backward compatibility: `VC_LLM_MODELS`/`VC_LLM_RETRY_BUDGET` are optional. Absent, `loadProviderConfig`
and `createProvider` are byte-for-byte unchanged from before T-021 (proven by test, not asserted —
see capability coverage table). Present, `createProvider` builds a `FailoverProvider` wrapping one
`LiteLlmProvider` per model, sharing the same `baseUrl`/`apiKey`.

When the whole chain is exhausted: `emitFailoverAlert` fires (see below) and a typed
`AiUnavailableError` (carrying `modelsAttempted`, `attempts`, `lastErrorName` — never a key value)
is thrown to the caller.

### 2. The exhaustion alert (`packages/providers/src/index.ts` + `packages/observability/src/errorSpan.ts`)

`emitFailoverAlert`: (a) a structured, key-free `console.error(JSON.stringify({event:
"provider_failover_exhausted", models, attempts, lastErrorName}))` engineering log line; (b) a real
OTel ERROR span/trace via the new `recordErrorSpan` export in `packages/observability`
(`@opentelemetry/api`'s global tracer, moved from `devDependencies` to `dependencies` since it is
now used at runtime). The span carries `"gen_ai.system": "litellm"` — **required** for the existing
Langfuse OTel exporter's `shouldExportSpan` filter (`@langfuse/otel`'s `isDefaultExportSpan`) to
forward the span at all; without it the span is real and recording but silently dropped before
export (documented in a "CALLER NOTE" in `errorSpan.ts`, and proven by capability-coverage
falsification #4 below — this is the exact bug discovered and fixed during this build).

### 3. Typed "AI unavailable" error surfaced to the caller (`packages/providers/src/index.ts`,
`apps/web/src/server/{contracts,session-service}.ts`)

`AiUnavailableError` propagates up through the engine's existing scribe pipeline unmodified (no
change to `packages/engine/src/scribe/**`) to the new `POST /api/sessions` web endpoint, which
matches it **by `err.name`** (not `instanceof`, matching the pre-existing cross-bundle-copy pattern
already used in `approval-service.ts`) and returns `503 {state: "ai_unavailable", sessionId,
attempts, modelsAttempted}` — no transcript, no stack trace, no key.

### 4. Apologetic web error state + Retry that preserves input (`apps/web/**`)

New "start a new session" flow (none existed before this unit; only pre-seeded demo threads +
the approval screen did):
- `POST /api/sessions` (`apps/web/src/app/api/sessions/route.ts`) → `submitSession`
  (`session-service.ts`) validates the body against the engine's existing `ScribeInputSchema`,
  calls `SessionRuntime.startSession`, maps outcomes/errors to HTTP replies.
- `NewSessionForm.tsx` (`apps/web/src/components/`): builds the submission body **once**
  (`useState(buildDemoSubmission)`, stable across re-renders) so a Retry click resubmits the
  **identical** `sessionId`/turns — the user never retypes. On `ai_unavailable`, renders a
  short-label banner (`stateAiUnavailable` / `aiUnavailableApology` / `aiUnavailableHint`, all
  ≤6 words, no jargon, no trailing punctuation — conforms to the pre-existing B1 "short label,
  never script-like" rule in `apps/web/tests/ui.test.tsx`) plus a `Retry` button that re-POSTs the
  same stored body. A successful retry reaches the normal `awaiting_approval` flow and links to the
  real approval screen (`/approvals/<threadId>`).
- New labels added to `apps/web/src/components/labels.ts`: `newSessionTitle`, `newSessionLinkHome`,
  `sectionTranscript`, `submitSession`, `stateAiUnavailable`, `aiUnavailableApology`,
  `aiUnavailableHint`, `retry`, `stateSessionStarted`, `openApprovalScreen`.
- Home page (`apps/web/src/app/page.tsx`) gets one new entry-point link
  (`data-testid="new-session-link"`).
- `apps/web/demo/seed.ts`: a `FlakyOnceProvider` (fails once with the SAME typed
  `AiUnavailableError` a real exhausted `FailoverProvider` throws, then succeeds) wired into a
  SEPARATE demo `sessionGraph`/`startSession` sharing the existing demo DB/checkpointer, so the
  pre-existing 3 seeded demo threads are unaffected — this is what makes the all-fail-then-recover
  path browser-testable without any real network call.

### 5. Live LiteLLM smoke script (`packages/engine/scripts/smoke-litellm.ts`)

Explicit, opt-in (`pnpm --filter @vc/engine smoke:litellm`, NOT part of `pnpm -r test`). Reads
`VC_LLM_BASE_URL`/`VC_LLM_API_KEY` from `process.env` only (never hardcoded). No var set → prints
`SKIP — <why>`, exit 0. Var set but gateway unreachable → probes `<baseUrl>/models` with a 5s
timeout, prints `SKIP — <why>` on failure, exit 0. Reachable → runs the real fact-extraction
`SKILL.md` prompt through a real `LiteLlmProvider` across the 3 gateway classes named in
`D:/ai_os/litellm-config.yaml` (`fast-cheap`, `balanced`, `smart-coding`), validating each response
against `ExtractionSkillOutputSchema`, on a 100%-synthetic single-turn transcript
(`"targetCountry: Testland\nbudget_inr_per_year: 999999"` — no real student data, B13). Prints
PASS/FAIL per class, exits 1 only if a reachable gateway actually failed a class.

## What changed, fix cycle 1

### 6. Wall-clock deadline, independent of the attempt counter (`packages/providers/src/index.ts`)

- `FAILOVER_DEFAULT_DEADLINE_MS = 45_000` (`:517`), env override `VC_LLM_DEADLINE_MS` parsed in
  `loadProviderConfig` (`:170-176`, same positive-integer validation pattern as
  `VC_LLM_RETRY_BUDGET`).
- `LITELLM_DEFAULT_ATTEMPT_TIMEOUT_MS = 8_000` (`:314`) replaces the old 30s
  (`LITELLM_DEFAULT_TIMEOUT_MS`) as the **per-attempt** timeout for chain members specifically (a
  standalone, non-chained `LiteLlmProvider` is unaffected); env override
  `VC_LLM_ATTEMPT_TIMEOUT_MS` parsed the same way (`:177-183`). `createProvider`'s litellm branch
  (`:874-876`) now builds each chain member with `timeoutMs: attemptTimeoutMs`.
- New `FailoverDeadlineExceededError` (`:526-530`) and `private raceDeadline<T>()` (`:651-663`):
  races a single attempt's promise against a `setTimeout` for whatever remains of the deadline
  budget, clearing the timer in `finally` either way.
- `FailoverProvider.generate<T>()` rewritten (`:684-`...): computes `deadlineAt = Date.now() +
  this.deadlineMs` once per call; before each attempt, checks `remaining = deadlineAt - Date.now()`
  and exits immediately (folding into the same `AiUnavailableError` exit path as ordinary
  exhaustion) if `remaining <= 0`; races each attempt via `raceDeadline(provider.generate(...),
  remaining)`; on a `FailoverDeadlineExceededError`, records it as `lastError` and breaks out; caps
  the backoff sleep at `remainingForBackoff = deadlineAt - Date.now()` (`:706`) so backoff itself
  can never push the call past the deadline. The 10-attempt budget (`FAILOVER_DEFAULT_MAX_ATTEMPTS`)
  is unchanged and still enforced in parallel — whichever bound (attempts or deadline) is hit first
  ends the call.
- `FailoverProviderOptions.deadlineMs` (optional, defaults via `??`) lets `createProvider` pass
  `parsed.deadlineMs` through when `VC_LLM_DEADLINE_MS` is set.
- **New worst-case bound: ~45 seconds** (the deadline), replacing the old unbounded ~5.4-minute
  worst case (10 attempts x up to 30s each + backoff, with nothing capping the total). The bound now
  holds regardless of chain length, attempt budget, or per-attempt timeout configuration, because
  every attempt and every backoff sleep is raced/capped against the SAME remaining-budget clock.

### 7. Client-side timeout safety net (`apps/web/src/components/NewSessionForm.tsx`)

`CLIENT_TIMEOUT_MS = 50_000` (`:26`, slightly above `FAILOVER_DEFAULT_DEADLINE_MS`). `submit()`
(`:68-93`) builds an `AbortController`, arms `setTimeout(() => controller.abort(),
CLIENT_TIMEOUT_MS)`, passes `signal: controller.signal` to `fetch`, and on an `AbortError` (matched
by `err.name`, same cross-bundle pattern as elsewhere in this repo) renders the identical
`{kind: "ai_unavailable", attempts: 0}` state — same apology, same Retry button, `submission` (built
once, never rebuilt) still intact — as a server-reported exhaustion. `clearTimeout(timer)` runs in a
`finally` block either way. This covers hangs the server's own 45s deadline can never reach at all
(a proxy/load-balancer swallowing the request, a connection that never completes).

### 8. Transcript column relabel (`apps/web/src/components/labels.ts:` new `colTranscriptText` entry;
`apps/web/src/components/NewSessionForm.tsx:111`)

`ISS-t-021-c0-1`: added `colTranscriptText: "What was said"` to `LABELS`, distinct from the approval
screen's `colValue` ("Proposed value"). `NewSessionForm`'s transcript table header now reads
`{LABELS.colTranscriptText}` instead of the borrowed `{LABELS.colValue}`. Passes the existing
blanket B1 no-script-label test (`apps/web/tests/ui.test.tsx`) unmodified, plus a new dedicated test
(below) asserting the two labels are distinct and the old mislabel never renders. The 10-total
reading and ZodError/wrong-shape behavior of the transcript table are unchanged (residual: the open
human gate `qa/gates/failover-scope.md`, now answered — see item 9).

### 9. Wrong-shape (schema-invalid) output now fails over within the same call (ISS-t-021-rev-2)

**File:line changed:** `packages/providers/src/index.ts:500` —
`if (err instanceof z.ZodError) return true;` added as the final check inside
`isRetryableProviderError`, before its `return false;` fallback. Docstring at `:478-494` explains
the reasoning and cites the gate answer.

This is the entire functional fix. `packages/engine/src/scribe/nodes.ts`'s `generateWithRetry`
needed **no logic change** — only a clarifying doc-comment was added to its existing docstring,
explaining why its own same-provider re-ask path is now a no-op for `FailoverProvider`-wrapped
providers in the exhausted case: the error `generateWithRetry` ever sees from an exhausted chain is
always `AiUnavailableError`, never a `ZodError` (the `ZodError` is now consumed and failed over
*inside* `FailoverProvider.generate()`, before it can propagate up to `generateWithRetry` at all).
Per gate `failover-scope` Q1 A ("keep 10 attempts TOTAL across the chain, as built"), no budget
change was needed either — a wrong-shape response now simply counts as one more retryable attempt
against the SAME 10-attempt budget and the SAME 45s deadline, exactly like a timeout or a 5xx.

When every model in the chain returns wrong-shape output, the SAME single alert
(`emitFailoverAlert`) fires and the SAME `AiUnavailableError` is thrown — so the SAME apology +
Retry appears to the counsellor, indistinguishable from a network-outage exhaustion (matches gate
Q2 A: "a wrong-shape answer now counts as FAILED").

## Falsification per capability (B14 — outcome, not construction)

| # | Capability | Falsifying edit | Before (real check) | After (falsified) |
|---|---|---|---|---|
| 1 | A non-retryable error (401) stops immediately, no failover | in `failover.test.ts`, temporarily made the 401 stub also retryable by adding its error class to a local copy of `isRetryableProviderError`'s whitelist | `✔ a non-retryable error (HTTP 401 ...) stops immediately` | `✖ ... AssertionError: expected 1 call to the stub server, got 3` (the chain retried across all 3 stub models) — reverted, re-ran, back to `✔` |
| 2 | The exhaustion alert fires exactly once, no secrets | temporarily called `onExhausted` twice inside the retry loop | `✔ the exhaustion alert is emitted exactly once and carries no secret value` | `✖ AssertionError: expected alertCalls.length === 1, got 2` — reverted, re-ran, back to `✔` |
| 3 | `FlakyOnceProvider` genuinely fails once then recovers (demo scenario is real, not a no-op) | in `apps/web/demo/seed.ts`, temporarily changed `failCount` default from `1` to `2` | `✔ T-021: Retry — resubmitting the SAME body ... succeeds and reaches the normal awaiting_approval flow` | `✖ AssertionError: expected state "started", got "ai_unavailable"` (one retry was not enough against `failCount=2`) — reverted to `1`, re-ran, back to `✔` (3/3 in `session-api.test.ts`) |
| 4 | `gen_ai.system` is load-bearing for the Langfuse export filter, not decorative | in `packages/observability/tests/error-span.test.ts`, removed `"gen_ai.system": "litellm"` from the asserted span's attributes | `✔ T-021/B7/B14/B11/B13: recordErrorSpan exports a real ERROR span ...` | `✖ AssertionError [ERR_ASSERTION]: expected exactly one exported span, got 0` (`0 !== 1`, at `error-span.test.ts:70:10`) — reverted, re-ran, back to `✔` (2/2, confirmed again in the full-suite run below) |

All four falsifications were reverted immediately after capturing the FAIL line, and each package
was re-run to confirm a clean return to green before proceeding (observability 2/2 confirmed
standalone, then 59/59 in the full package run below; providers 43/43 in the full package run
below; web 30/30 in the full package run below).

### Fix cycle 1 falsifications (throwaway copy, `C:/Users/Lenovo/AppData/Local/Temp/claude/t021c1-copy`
— never edit-and-revert live, per the RAM/isolation rule)

A full tracked+untracked copy of the worktree was made via `git ls-files` +
`git ls-files --others --exclude-standard` piped through `tar` (avoids traversing
`node_modules`/pnpm-store symlinks). Every falsifying edit below was made, run, captured, then
reverted in that copy only — the live worktree was never touched for these rows.

| # | Capability | Falsifying edit (in the throwaway copy) | Before (real, GREEN) | After (falsified, RED) |
|---|---|---|---|---|
| 5 | The 45s wall-clock deadline actually bounds the worst case, not merely the attempt counter | bypassed `raceDeadline` in `FailoverProvider.generate` (called `provider.generate()` directly, un-raced) | `✔ T-021 fix cycle 1 (ISS-t-021-rev-1): worst case — every attempt hangs forever ...` (~0.4ms, bounded by the deadline) | test hung; bounded with `npx tsx --test --test-timeout=5000 ...` -> `'test timed out after 5000ms'` (the un-raced attempt never returns) — reverted, re-ran, back to `✔` (1/1, ~1s) |
| 6 | ISS-t-021-rev-2: a wrong-shape response fails over within the same call instead of throwing | neutralised the new line at `index.ts:500` (`if (false && err instanceof z.ZodError) return true;`) | `✔ ... model 1 returns wrong-shape JSON and model 2 is valid ...` / `✔ ... all 3 models return wrong-shape ...` | first test: an unhandled `ZodError` escaped instead of failing over; second test: `assert.ok(err instanceof AiUnavailableError)` evaluated false (the raw `ZodError` propagated instead) — reverted, re-ran, back to `✔ ✔` (16/16 in `failover.test.ts`) |
| 7 | The client-side `CLIENT_TIMEOUT_MS` safety net actually fires (not a decorative constant) | in the copy's `NewSessionForm.tsx`, changed `CLIENT_TIMEOUT_MS` from `50_000` to `999_000_000` | `demo/browser-evidence-failover-c1.ts` interaction 2: `✔` banner appears after `page.clock.fastForward(60_000)` | `page.waitForSelector: Timeout 15000ms exceeded ... waiting for [data-state="ai_unavailable"]` — the abort never fired within the fast-forwarded window — reverted to `50_000`, re-ran, back to `{"interactions":4,"passed":4,"failed":0,"consoleErrors":1}` (identical to the real-worktree run) |

Rows 5-7 were reverted immediately after capturing each RED line; the throwaway copy's final state
was re-confirmed GREEN (row 5: 1/1; row 6: 16/16; row 7: 4/4 interactions) before it was discarded.
No falsifying edit was ever applied to the live worktree.

## Verification (exact commands, run in the worktree, real output)

Per the coordinator's RAM constraint (~1.8GB free), every package was run individually — never
`pnpm -r test` in one shot.

```
pnpm --filter @vc/schemas typecheck              -> exit 0
pnpm --filter @vc/observability typecheck        -> exit 0
pnpm --filter @vc/db typecheck                   -> exit 0
pnpm --filter @vc/providers typecheck            -> exit 0
pnpm --filter @vc/api typecheck                  -> exit 0
pnpm --filter @vc/mcp-student-profile typecheck  -> exit 0
pnpm --filter @vc/mcp-university-kb typecheck    -> exit 0
pnpm --filter @vc/engine typecheck               -> exit 0 (tsc --noEmit && evals/tsconfig.json && scripts/tsconfig.json)
pnpm --filter @vc/web typecheck                  -> exit 0
  (all 9 workspace projects typecheck clean)

pnpm --filter @vc/schemas test               -> tests 50  pass 50  fail 0   (unchanged)
pnpm --filter @vc/observability test         -> tests 59  pass 59  fail 0   (+2 new: error-span.test.ts)
pnpm --filter @vc/db test                    -> tests 196 pass 196 fail 0   (unchanged)
pnpm --filter @vc/providers test             -> tests 43  pass 43  fail 0   (was 31 at T-019; +12 new: failover.test.ts)
pnpm --filter @vc/api test                   -> tests 8   pass 8   fail 0   (unchanged)
pnpm --filter @vc/mcp-student-profile test   -> tests 12  pass 12  fail 0   (unchanged)
pnpm --filter @vc/mcp-university-kb test     -> tests 9   pass 9   fail 0   (unchanged)
pnpm --filter @vc/engine test                -> tests 161 pass 161 fail 0   (unchanged: T-021 touches no engine source)
pnpm --filter @vc/web test                   -> tests 30  pass 30  fail 0   (was 24; +6 new: session-api.test.ts x3,
                                                 new-session-ui.test.tsx x3; pre-existing B1 short-label test still green)
  total 568 / 568 (0 failures, run package-by-package, 0 regressions)

python contracts/verify_contracts.py
  -> "verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity", exit 0
```

### Fix cycle 1 verification (exact commands, re-run in the worktree just before this commit, real output)

```
pnpm -r typecheck
  -> all 9 workspace projects: "Done", exit 0 (packages/schemas, observability, db, providers, api,
     mcp/student-profile, mcp/university-kb, engine [tsc --noEmit + evals/tsconfig.json +
     scripts/tsconfig.json], web)

pnpm --filter @vc/providers test
  -> tests 47  pass 47  fail 0   (was 43 at cycle 0; +4 new: 2 for ISS-t-021-rev-1 [worst-case
     deadline test, real-hung-stub-server env-var test], 2 for ISS-t-021-rev-2 [model-1-wrong-shape-
     failover, all-3-wrong-shape-single-alert]; the pre-existing "isRetryableProviderError: whitelist"
     test was updated in place, title extended, ZodError assertion flipped false->true per the gate
     answer -- same test id, not a new one)

pnpm --filter @vc/web test
  -> tests 31  pass 31  fail 0   (was 30 at cycle 0; +1 new: ISS-t-021-c0-1 dedicated label test)

pnpm --filter @vc/observability test
  -> tests 59  pass 59  fail 0   (unchanged from cycle 0 -- fix cycle 1 touches no observability code)

pnpm --filter @vc/engine test
  -> tests 276 pass 276 fail 0   (unchanged from cycle 0's 161 plus intervening units' growth;
     fix cycle 1's only engine change is a doc-comment, no logic, no new/changed test)

  fix-cycle-1 total across the four touched packages: 413 / 413 (0 failures, run package-by-package,
  never pnpm -r test, per the RAM discipline rule)
```

## Live smoke run (B13: synthetic transcripts only, approved by Umesh via qa/gates/provider-fallback.md)

```
$ grep -o "^VC_LLM[A-Z_]*" .env ../../.env /d/ai_os/.env    -> (no matches in any of the three)
$ pnpm --filter @vc/engine smoke:litellm
SKIP — VC_LLM_BASE_URL is not set in the environment/.env; no gateway configured for this smoke run.
exit: 0
```

**Gap, stated plainly:** this environment (the worktree, the repo root `.env`, and `D:/ai_os/.env`)
has no `VC_LLM_BASE_URL` configured, so the live 3-class gateway proof (fast-cheap/balanced/
smart-coding schema-valid JSON) could not be exercised here. The script is written, wired to real
`D:/ai_os/litellm-config.yaml` class names, uses only already-present env settings, never prints a
key, and correctly reports SKIP with a reason rather than faking a pass — this is a recorded gap,
not a hidden one. It is safe to run later with `pnpm --filter @vc/engine smoke:litellm` the moment
`VC_LLM_BASE_URL` (and optionally `VC_LLM_API_KEY`) are set in the environment.

## Live browser evidence (B17-adjacent UI touched -> real browser required)

`qa/evidence/browser-t-021-provider-failover-2026-09-26/report.json` (Playwright, Chromium, driven
against `next dev` on an ephemeral port, server stopped after the run — RAM discipline honoured):
- 6 interactions, **6 passed, 0 failed**
- 1 console error recorded, and it is the *expected* one (the 503 status log from the forced
  all-fail submit) — not an unexpected page error
- Flow proven end to end: index page shows the new entry link → new-session screen renders the 5
  synthetic turns + student id → first submit hits the seeded `FlakyOnceProvider` all-fail path and
  renders the `ai_unavailable` banner with **no stack trace, no vendor/model name, no "500"/"503"
  string on screen** → the same 5 turns are still visible/unchanged in the form after the failure
  (input never lost) → clicking Retry re-submits and reaches `started` with a valid thread link →
  following that link renders the real approval screen with the extracted facts (the normal flow
  completes after a successful retry).
- Screenshots: `01-idle.png`, `02-ai-unavailable.png`, `03-started.png`, `04-approval-after-retry.png`.

### Fix cycle 1 browser evidence (client-side timeout + relabelled column — a real browser required;
neither is reachable from a node:test unit test since there is no jsdom/testing-library in this repo)

`qa/evidence/browser-t-021-provider-failover-c1-2026-09-26/report.json`
(`apps/web/demo/browser-evidence-failover-c1.ts`, same structural pattern as the cycle-0 script,
Playwright/Chromium against `next dev` on an ephemeral port, server stopped after the run):
- 4 interactions, **4 passed, 0 failed**, 1 expected console error (the demo's own `FlakyOnceProvider`
  first-hit 503, logged during the Retry step, not an unexpected page error)
- `page.clock.install()` before navigation + `page.route("**/api/sessions", ...)` never fulfilled
  (a true network hang, stricter than a slow server) + `page.clock.fastForward(60_000)` — proves
  `CLIENT_TIMEOUT_MS` genuinely fires without a real 50-second wait
- Flow proven: idle screen's second column header reads "What was said", never "Proposed value" ->
  submit hangs forever at the network layer -> fast-forwarding the clock past `CLIENT_TIMEOUT_MS`
  renders the identical `ai_unavailable` banner (no stack trace, no "abort"/timeout jargon on
  screen) with exactly one Retry button -> the transcript (5 turns, `demo-student-4`) is still fully
  visible, unchanged -> unrouting and clicking Retry sends a real request again and reaches a
  server-decided state (`started` or `ai_unavailable`, either is a pass for this step — the demo's
  own fail-count behavior is already covered by `session-api.test.ts` and the cycle-0 evidence).
- Screenshots: `01-idle-relabelled.png`, `02-client-timeout-ai-unavailable.png`, `03-after-retry.png`.
- Dev server (an ephemeral-port `next dev` instance this script spawned itself) was stopped by PID
  after every run, including the throwaway-copy runs during falsification — RAM discipline honoured.

## Claims -> evidence

| Claim | Evidence |
|---|---|
| 3-model chain in config order, budget ~10, backoff+jitter | `failover.test.ts`: "first model fails, second succeeds"; "all models fail within the budget" (asserts delays == `[100,200,400,800]` for budget 5, deterministic jitter upper bound); "backoff is genuinely applied" (node:test fake timers against a pure in-memory fake, real default `sleep`) |
| Retry ONLY on timeouts/429/5xx/malformed JSON, NEVER on auth/config | `isRetryableProviderError` whitelist test + "a non-retryable error (401) stops immediately" (falsification #1) |
| NO automatic drop to `rules` | `createProvider`'s litellm branch only ever builds a chain of litellm-kind providers; "MockProvider works as a chain member too" test proves the chain is provider-agnostic by construction but nothing in `createProvider` ever inserts a `rules` instance |
| Engineering alert: structured key-free log + Langfuse error span | "the exhaustion alert is emitted exactly once and carries no secret value" (falsification #2) + `error-span.test.ts`'s outcome test (falsification #4) proving a REAL span reaches a REAL exporter with the right fields, not just that a function was called |
| Typed "AI unavailable" surfaced to the caller | `AiUnavailableError` unit tests in `failover.test.ts`; `session-api.test.ts`: "the first submit hits the exhausted failover chain and returns 503 ai_unavailable, with no key/transcript leak" |
| Apologetic, plain-language web error state, no jargon/stack traces | `new-session-ui.test.tsx`: copy checked against a jargon blacklist (litellm, gemini, failover, stack trace, 500, 503) + non-script-like; pre-existing B1 short-label test in `ui.test.tsx` still passes unmodified |
| Retry re-submits the SAME input, no retype, successful retry completes the normal flow | `session-api.test.ts`: "Retry — resubmitting the SAME body ... succeeds and reaches ... awaiting_approval" (falsification #3); browser evidence interactions 4-6 |
| Backward compatibility: `VC_LLM_MODELS` absent leaves old config/factory untouched | "T-021: VC_LLM_MODELS absent — loadProviderConfig/createProvider are BYTE-FOR-BYTE unchanged" |
| Live gateway proof or an honest, non-faked gap | `pnpm smoke:litellm` output above: real `SKIP — VC_LLM_BASE_URL is not set ...`, exit 0, not a fabricated PASS |
| ISS-t-021-rev-1: worst case bounded at ~45s, not ~5.4 min, alert fires exactly once | `failover.test.ts`: "worst case — every attempt hangs forever — still ends in AiUnavailableError within the wall-clock deadline, and the alert fires exactly once" (falsification #5) + real-hung-stub-server env-var test |
| ISS-t-021-rev-1: client-side safety net renders the same apology+Retry, input preserved | `browser-evidence-failover-c1.ts` interactions 2-3 (falsification #7) |
| ISS-t-021-c0-1: transcript table has its own label, never the approval screen's | `new-session-ui.test.tsx` dedicated test + `browser-evidence-failover-c1.ts` interaction 1 |
| ISS-t-021-rev-2: wrong-shape output fails over within the same call/budget/deadline, not a chain reset | `failover.test.ts`: "model 1 returns wrong-shape JSON and model 2 is valid ... model 2's answer is used" + "all 3 models return wrong-shape ... the SAME single alert fires and AiUnavailableError is thrown" (falsification #6) |

## Residuals (not fixed here)

1. **Live 3-class gateway smoke run could not actually be exercised in this environment** (no
   `VC_LLM_BASE_URL` configured anywhere reachable from this worktree). The script is ready; running
   it once a gateway is configured is the remaining step to fully close the "one live LiteLLM smoke
   run" clause of D-020/the gate.
2. **Persona walk / B17 usability review** is left to the checker per the contract's own division of
   labour (persona-walk is explicitly a checker responsibility, not a maker one) — not attempted
   here beyond the plain-language copy tests.
3. **No circuit breaker / cool-down memory across sessions.** Each `FailoverProvider` call starts
   its round-robin from chain position 0 (`attempt % chain.length`, `attempt` starts at 0 per call)
   — a model that just failed for every other in-flight request is retried again on the next
   request rather than being skipped for a cool-down window. Not requested by the brief; a residual
   for a future unit if the gateway shows sustained per-model outages rather than transient ones.
4. **No paging/alert-channel integration** — the "engineering alert" is a structured log line +
   Langfuse error span, matching the gate's own `[ASSUMPTION]` ("no paging channel exists yet").
   Wiring a real page (Slack/PagerDuty) is out of scope until such a channel is decided.
5. **No circuit breaker / cool-down memory across sessions for wrong-shape responses either**
   (ISS-t-021-rev-2's fix reuses the existing per-call round-robin — residual 3 above already covers
   this; a model that consistently returns wrong-shape output is retried again on the next request
   rather than skipped for a cool-down window).
6. **`qa/gates/failover-scope.md` is now answered** (2026-09-26, Q1: keep 10 attempts total across
   the chain, as built; Q2: a wrong-shape answer counts as FAILED) — both answers are reflected in
   this cycle's fix (no budget change; `ZodError` retryable). No longer an open residual; recorded
   here only for traceability.

## Status: ready-for-check
