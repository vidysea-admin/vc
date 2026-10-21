# Manifest — p1-alerts
**Contract:** brief `qa/evidence/p1-briefs/alerts.md`; D-108 item 7 (Umesh: "go now"); mechanism = T-021 failover alert (`emitFailoverAlert`: structured text-free stderr line + Langfuse error span via `recordErrorSpan`)
**Criteria:**
- A1 authenticated chat safety-screen outage emits `alert_safety_screen_outage` (no student text), at most once per 5 minutes per process; fail-closed reply and the `chat_write_failed` log line unchanged
- A2 chain monthly cap: `alert_chain_cap_80pct` once per UTC month per process, `alert_chain_cap_exhausted` once per UTC month per process; refusal behaviour and the `chain_cap_exhausted` log line unchanged
- A3 `.env.example` says DeepSeek first (D-108) and shows `VC_CHAIN_MONTHLY_CAP_USD=50` as the example; `docs/runbook-golive.md` lists the alert names, meaning and first action
**Goal task:** none
**Date:** 2026-10-21
**Status:** checked-PASS (verdict b081d73, cycle 0)
**Fix cycle:** 0
**Policy-Version:** proportional-verification/2026-10-19.17
**Tier:** M (shared observability wiring)
**Round:** 1 (targeted: new alerts test file plus the 4 existing apps/api test files that exercise the touched modules; apps/api and providers typecheck; no full suite)
**Dual check:** no (no auth/tenancy/prod-write change)
**Persona walk:** skip (no human screen)
**Executor:** claude-sonnet-subagent (maker/builder alerts)
**Executor rationale:** one in-place wiring change in two apps/api modules plus a small emitter next to the existing failover alert.

## What changed
Branch `p1/alerts` from `3979595`, worktree `D:/vc/.worktrees/alerts`.
- `packages/providers/src/index.ts`: new `EngineeringAlert` type and `emitEngineeringAlert()` beside `emitFailoverAlert` (same two outputs: `console.error` JSON line, `recordErrorSpan` span `vc.<event>` with a `gen_ai.system` attribute so the Langfuse filter forwards it). No new transport. Exported from the package entry file.
- `apps/api/src/chat.ts`: `ChatApiDeps.alert` (default `emitEngineeringAlert`); `onWriteError` now also calls `alertScreenOutage()` when `write === "safety_screen"`; per-process window `SAFETY_SCREEN_ALERT_INTERVAL_MS = 5 * 60_000` using the injected clock; the window opens before the sink is called so a throwing sink is not retried on every turn; sink errors are swallowed.
- `apps/api/src/index.ts` `createChainSpendGuard`: `ChainSpendGuardOptions.alert`; `warnIfNear()` after a reservation and after a settle (latch `warnedFor`, per UTC month, fires at spend >= 80% of cap, 1e-9 tolerance); `alert_chain_cap_exhausted` raised inside the existing once-per-month `loggedFor` block. Attributes are `month`, `capUsd`, `spentUsd` (rounded to 1e-6). `StartApiHttpOptions.chainSpend` accepts `alert`; `StartApiChatOptions.alert` is passed to `createChatApi`.
- `.env.example`: chain-order comment now DeepSeek first (D-108), GLM first marked "config only"; cap example 50 and the two alert names noted.
- `docs/runbook-golive.md` (new): alert table (event, trigger, rate limit, attributes, first action).
- `apps/api/tests/alerts.test.ts` (new): 14 tests.
- Not touched: `.claude/**`, ARCHITECTURE.md, docs/DECISIONS.md, contracts/, qa/contracts, TASKS.md, QUEUE.md, HANDOFF.md, packages/observability. `pnpm install --offline --frozen-lockfile` run in the worktree only (node_modules is untracked/ignored).
- The `emitEngineeringAlert` default path was not run against a live Langfuse exporter (no network); it is the same `recordErrorSpan` call shape as `emitFailoverAlert`, and the tests capture the stderr line.

## Verification scope
Round: as above. Base / checked state: `p1/alerts` code commit (see git log), TMP/TEMP on `D:/tmp-alerts`, all test commands via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh`.
Tests[A1]: tests/alerts.test.ts "A1: when the authenticated safety screen is down...", "A1: an outage lasting many turns is one alert per 5 minutes...", "A1: a healthy screen (and a turn with no screen at all) raises no alert", "A1: a throwing alert sink never fails...", "A1: the default sink is the existing engineering-alert line on stderr", "A1 wiring: startApi passes http.chat.alert..."
Tests[A2]: tests/alerts.test.ts "A2: crossing 80%...", "A2: a reported usage that settles spend UP...", "A2: a settle that brings spend back down does not clear the once-per-month latch", "A2: hitting the cap raises alert_chain_cap_exhausted once that month...", "A2: a request that jumps straight past the cap...", "A2: both alerts re-arm in a new UTC month, and only then", "A2: a throwing alert sink never turns a reservation into a crash...", "A2: the default sink is the existing engineering-alert line on stderr"
Pre-check[A1]: tests first, no src change: `cd D:/vc/.worktrees/alerts/apps/api && ... npx tsx --test tests/alerts.test.ts` -> 14 tests, 2 pass, 12 fail (the 2 passes are the no-alert regression guards: healthy screen, throwing sink with no emitter). After the change: 14 tests, 14 pass, 0 fail. Evidence `D:/tmp-alerts/red.txt`, `D:/tmp-alerts/green1.txt`.
Pre-check[A2]: same red run (all 7 behavioural A2 tests fail before the change) and the same green run after.
Pre-check[affected]: `... npx tsx --test tests/alerts.test.ts tests/chat-profile.test.ts tests/chat.test.ts tests/index.test.ts tests/anonymous-route.test.ts` -> 122 tests, 122 pass, 0 fail. `... npx tsc --noEmit` in apps/api -> exit 0; in packages/providers -> exit 0.
Metrics: start=2026-10-21T14:02:44+05:30 end=2026-10-21T14:10:12+05:30 builder_min=8 wall_min=8 agent_min=unavailable blocked_min=0 suite_runs=3 repeat_runs=0 mutations=4 survivors_final=0 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 lane=normal check_s=unavailable mutants=4 defects_unit=0 defects_6c=0

## Capability coverage (one falsifying edit per criterion, in the worktree with the two source files copied to `D:/tmp-alerts/orig` and restored byte-identical after each; baseline alerts.test.ts 14/0)
| id | crit | falsifying edit | result |
|---|---|---|---|
| F-A1a | A1 | 5-minute rate-limit `return` removed in `alertScreenOutage` | 2 fail (rate-limit test, throwing-sink test) |
| F-A1b | A1 | `if (write === "safety_screen") alertScreenOutage();` removed | 5 fail |
| F-A2a | A2 | `warnedFor !== month` latch removed from `warnIfNear` | 2 fail |
| F-A2b | A2 | `raise("alert_chain_cap_exhausted")` removed | 4 fail |

## Open risks
1. Limits and latches are per process and in memory: a restart or a second replica re-alerts (stated in the runbook). The cap counter itself was already in-process (LK7).
2. Only the authenticated chat screen alerts. The anonymous route's screen (default off, `VC_ANONYMOUS_SAFETY_SCREEN`) and voice are not wired, per the brief.
3. `emitEngineeringAlert` lives in `packages/providers` next to `emitFailoverAlert` because `apps/api` does not depend on `@vc/observability`; a provider-agnostic alert in that package is a small naming stretch, kept to avoid a new dependency edge.
4. No independent review agent ran in this unit: the in-unit `senior-software-engineer` dispatch was refused by the compact-handoff hook (no handoff bundle available to a build subagent), so the independent check is left to /checker.
5. Live Langfuse delivery of the new span name is untested (no network); same code path as the failover alert.
