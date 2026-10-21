# Verdict p1-lk7 (cycle 1)
Date: 2026-10-21T13:42:59+05:30. Bound to D:/vc/.worktrees/lk7, branch p1/lk7, head 3afca5a (fix d55bbad; repair base 0d3441c). Cycle checked: 1
Policy-Version: proportional-verification/2026-10-19.17 (Tier L, single checker). Prior verdict kept as qa/verdicts/p1-lk7.r0-1.md. Verdict: **PASS**

## Scope
Failed criterion re-checked: S-default-safety (chat on + screen on + base provider that cannot serve concern-classifier). Repair diff 0d3441c..3afca5a read in full: apps/api/src/index.ts (+11, block at lines 536-546, before connectFromEnv at 556), apps/api/tests/chat-profile.test.ts (+4 tests R1..R4), qa evidence/manifest/cycle-0 verdict. No out-of-scope file (no engine/providers/db/.claude/contracts change).

## Executed checks (TMP/TEMP on D:, via vc-testlock)
- `tsx --test tests/chat-profile.test.ts tests/anonymous-route.test.ts` (apps/api): 62 tests, 62 pass, 0 fail (39 + 23, matches manifest). R1-R4 green.
- `npx tsc --noEmit` (apps/api): exit 0.
- Own hostile probe (tests/hostile-c1.test.ts, in a detached copy of 3afca5a, not in the artifact), real startApi: 6 tests, 6 pass.
  - H1 no injected provider, env VC_LLM_PROVIDER=rules (real createProvider path), VC_LLM_API_KEY set: ChatConfigError, message names the screen and concern-classifier, key text absent, connect count 0.
  - H2 VC_LLM_PROVIDER=mock starts. H3 safetyScreen object with no provider over a rules base: refuses (falls back to the base). H4 escalationForTenant injected + rules base: refuses.
  - H5 chat.safetyScreen=false + rules base starts; VC_CHAT_ENABLED empty + rules starts.
  - H6 capable provider through real HTTP: 200, state "ok", ordinary Germany answer, not escalated, not the crisis message.
- Falsification (copy, restored after each; diff -q vs original = identical), chat-profile.test.ts 39 tests:
  - F1 refusal never fires: 2 fail (R1, R3). KILLED
  - F2 ignore the screen option's provider: 1 fail (R3). KILLED
  - F3 refuse even with safetyScreen=false: 1 fail (R2). KILLED
  - F4 refuse every provider kind: 17 fail (R3, R4, L1, L2, C1, E1, E2, LK1w...). KILLED
  0 survivors.

## Findings
None blocking. Non-blocking, already recorded by the maker and confirmed by me: the startup check covers kind "rules" only (src/index.ts:540-541); a mock without a classifier response, wrong key or a down proxy still starts and fails closed at runtime with the crisis message (needs an operator alert on chat_write_failed write=safety_screen in the go-live runbook). A failover chain's .kind is chain[0].kind (packages/providers/src/index.ts:862), so a chain whose first hop is rules would also be refused; a chain with rules in a later hop would not (not a reachable config via loadProviderConfig). Cap-burn-on-outage risk from cycle 0 unchanged and out of scope.

## Verdict
PASS for fix cycle 1. The cycle-0 FAIL (S-default-safety) is closed: a rules screen provider now refuses startup before connecting, the screen's own provider is what is checked, off/chat-off start, capable provider answers normally.
