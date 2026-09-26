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
(new), `apps/web/src/components/NewSessionForm.tsx` (new), `apps/web/src/components/labels.ts`
(extended), `apps/web/src/app/page.tsx` (extended), `apps/web/demo/seed.ts` (extended),
`apps/web/demo/browser-evidence-failover.ts` (new), `apps/web/package.json`,
`apps/web/tests/session-api.test.ts` (new), `apps/web/tests/new-session-ui.test.tsx` (new),
`packages/engine/scripts/smoke-litellm.ts` (new), `packages/engine/scripts/tsconfig.json` (new),
`packages/engine/package.json`, `pnpm-lock.yaml`, `qa/evidence/browser-t-021-provider-failover-2026-09-26/`
(new), this manifest.
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

## Status: fix-cycle-1 building (checker c0 PASS 0321d12, reopened by maker on the ai-engineer review: ISS-t-021-rev-1 high ~5.4 min worst-case wait before the apology; plus checker ISS-t-021-c0-1 label)
