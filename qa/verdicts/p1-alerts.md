# p1-alerts - independent check (Tier M, single checker)

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
VERDICT: PASS
CHECKED-STATE: branch p1/alerts, code commit a9533e87fd71ad7468afff45d9a422573638f3dd (worktree clean, read-only for the checker). Falsifications ran in a copy at D:/tmp-chk-alerts (apps/api copied, node_modules a junction to the worktree's); the copy's chat.ts/index.ts were restored and `cmp`-verified byte-identical to the worktree after each mutant. Maker evidence not reused; everything below was executed by the checker on 2026-10-21 (IST) via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 <cmd>`, TMP/TEMP=D:/tmp-chk-alerts/tmp.
Checker-authored outcome test: `qa/evidence/p1-alerts/chk-alerts.test.ts` (10 tests; run from a copy of apps/api/tests).

## Criteria

### A1 - authenticated safety-screen outage alert: PASS
Driven over real HTTP through `startApi` with NO `alert` injected (so the production default sink `emitEngineeringAlert` ran), a screen provider that throws an Error whose message embeds the student's input (hostile), student text `... ZEBRA-42-SECRET`, fake clock via `chat.now/nowMs`:
- turn 1: HTTP 200, reply == STUDENT_CRISIS_MESSAGE (fail closed); exactly 1 stderr line `{"level":"error","event":"alert_safety_screen_outage","write":"safety_screen"}`.
- turn 2 at +2 min: none; turn at +4:59.999: none; turn at +5:00: second alert (total 2). Fail-closed reply on every turn.
- the whole captured stderr contains neither `ZEBRA-42-SECRET` nor the provider error text `upstream 500`.
- sink throws (error message also embeds the text): turn still 200 + crisis reply, sink called once.
- control: healthy screen -> normal reply, zero `alert_` lines (the instrument can see a negative).
Falsifications (copy): M1 remove `if (write === "safety_screen") alertScreenOutage()` -> 2 of my tests fail; M2 default sink replaced by a no-op `(deps.alert ?? (() => undefined))` -> the production-wiring test fails (so a silent no-op in prod wiring would be caught).

### A2 - chain monthly cap alerts: PASS
`createChainSpendGuard` with the real `parseChainMonthlyCap({VC_CHAIN_MONTHLY_CAP_USD:"50"})`:
- 39.99 -> none; 40.00 (exactly 80%) -> `alert_chain_cap_80pct` once; 5 more reservations to 45 -> none; to exactly 50 -> allowed, no exhausted; next 3 refusals -> `alert_chain_cap_exhausted` once. Order [80pct, exhausted].
- rollover: 2026-11-30T23:59:59.999Z stays latched (no alerts); 2026-12-01T00:00:00.000Z re-arms both (month attr "2026-12"). IST: 05:29 / 05:29:30 IST Dec 1 (= 23:59Z Nov 30) stays latched; 05:31 IST (= 00:01Z Dec 1) re-arms both.
- a settle for a reservation made in the old month, applied after rollover, raises nothing.
- Hostile jumps (recorded, FAIL only if exhausted missed): 60% then +60% in one `beforeRequest` -> fires `["alert_chain_cap_exhausted"]` only (no 80pct; acceptable, exhausted not missed). Single `onUsage` settle from <80% to 140% -> `alert_chain_cap_80pct` fires at the settle, then the next request fires `alert_chain_cap_exhausted`.
- Production wiring: `startApi` with VC_TEXT_CHAIN + CHAIN_ENV, cap 0.03 / 0.2, no `alert` injected, stub Ollama, real HTTP turns: stderr carries each of `alert_chain_cap_80pct` and `alert_chain_cap_exhausted` exactly once. Observation: at the tiny 0.03 cap the order was [exhausted, 80pct] (a reservation overshoot refused first, then a settle up-crossed 80%); at cap 0.2 the order was [80pct, exhausted]. Both once, nothing missed.
Falsifications (copy): M3 remove `raise("alert_chain_cap_exhausted")` -> 6 of my tests fail; M4 chain-guard default sink replaced with a no-op -> production-wiring test fails.

### Production wiring reaches the T-021 mechanism: PASS
`chat.ts` default `deps.alert ?? emitEngineeringAlert`; `startApi` passes `chat.alert` only when supplied; chain guard `options.alert ?? emitEngineeringAlert` with `startApi` spreading only the optional `http.chainSpend`. `emitEngineeringAlert` = console.error JSON line + `recordErrorSpan` (same pair as `emitFailoverAlert`). Proven by the two production-wiring runs above plus mutants M2/M4. Not proven: live Langfuse delivery of the `vc.alert_*` span (no network; same `recordErrorSpan` call shape as the failover alert) - accepted, listed by the maker.

### A3 - .env.example and runbook: PASS
- `.env.example`: DeepSeek-first line is the go-live default (D-108), GLM first marked "config only"; the cap line carries `VC_CHAIN_MONTHLY_CAP_USD=50` as the example (the assignment itself stays empty, as before). No non-empty assignment at all; grep for sk-/AIza/eyJ/BEGIN/32+ char tokens: no hits.
- `docs/runbook-golive.md` alert names (`alert_safety_screen_outage`, `alert_chain_cap_80pct`, `alert_chain_cap_exhausted`) equal the emitted event strings in apps/api/src (set-compared by grep); attributes `write` / `month, capUsd, spentUsd` match the code.

## Commands executed (all pass)
- baseline copy: `npx tsx --test tests/alerts.test.ts` -> 14 tests, 14 pass, 0 fail.
- checker test (copy): `npx tsx --test tests/chk-alerts.test.ts` -> 10 tests, 10 pass, 0 fail (the first run's order assertion was mine and too strict; relaxed to set equality, order recorded above).
- worktree, affected: `npx tsx --test tests/alerts.test.ts tests/chat-profile.test.ts tests/chat.test.ts tests/index.test.ts tests/anonymous-route.test.ts` (apps/api) -> 122 tests, 122 pass, 0 fail.
- `npx tsc --noEmit` in apps/api -> exit 0; in packages/providers -> exit 0.
- Mutants: M1 2 fail, M2 1 fail, M3 6 fail, M4 1 fail; restored copy 10/10 pass. No full suite (per brief).

## PROPOSED-ISSUE (out of scope, not blocking)
- PROPOSED-ISSUE: anonymous route safety-screen outage is not alerted. When `VC_ANONYMOUS_SAFETY_SCREEN=true`, `apps/api/src/anonymous.ts` `onWriteError` logs the outage as `anonymous_forbidden_write` (write="safety_screen") with no `alert_safety_screen_outage`. Default is off, so no impact at go-live as configured.
- PROPOSED-ISSUE: voice has no screen outage alert (no safety_screen path wired in `apps/api/src/voice.ts`).
- PROPOSED-ISSUE (low): at a very small cap a settle can fire `alert_chain_cap_80pct` after `alert_chain_cap_exhausted` in the same month; harmless at the 50 USD go-live cap but the runbook says "warning only" for 80pct; consider noting that order can invert.
- PROPOSED-ISSUE (low): a non-finite or negative cost estimate takes the refusal branch and raises `alert_chain_cap_exhausted` with a small `spentUsd`, which reads as a cap hit though it is an estimate fault.
- Per-process, in-memory latches (restart or second replica re-alerts): already stated in the runbook.
