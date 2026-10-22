# Checkpoint: pc-hardening-2 cycle 0, coordinator A

Worktree D:/vc/.worktrees/pc-hardening-2, head 76b5a92 (code 23ccf93), merge-base with main 02483f6 (verified). Policy-Version: proportional-verification/2026-10-19.17. Tier L.
Clock: started 2026-10-22T16:28:12+05:30, verdict written 2026-10-22T16:3x (read from `date -Iseconds`).

## Executed (all in apps/api unless noted, via vc-testlock; results are actual counts)
- partners.test.ts 69/69; partner-voice.test.ts 38/38; partner-openapi 15/15; voice 67/67; voice-limits 10/10; voice-wiring 16/16; auth 15/15; server 34/34; index 8/8; main 10/10.
- chat.test.ts 35 tests, 34 pass, 1 fail = "A20 flag on but gate closed" (known baseline, ISS-pc-partner-keys-8).
- anonymous-route.test.ts pattern "H2|H6|G5|K2|K4": 9/9.
- widget `node --test "apps/widget/tests/*.test.js"` 64/64. `tsc --noEmit` exit 0.
- Probe scripts (scratchpad probe/): J5 hostile error shapes (15 shapes, 0 leaks) and two real CLI runs with credentialed MONGODB_URL (MongoParseError, MongoServerSelectionError): exit 1, no URI/host/password. J1 widget language matrix. J4 probes (3-way race, pub vs srv, rotate vs revoke). J2 no-oracle probe (cap 0: bad/missing/garbage key, wrong Origin, srv key as page key all 401 with the same body as cap>0).

## Falsifications (copy under scratchpad fals/, green before, red after, restored; diff -rq vs worktree clean)
- J1: no helpline on mint busy fallback: 2 red; error-frame busy: 3 red; Hindi uses English helpline: 2 red.
- J2: no 403: red (429 !== 403); 403 with Retry-After: red; only per-client off: red; widget off to unavailable: red; off note without helpline: red.
- J3: no per-partner cap: red (201 !== 429); cap 3->4: red; cap 3->2: red.
- J4: unconditional update: 2 red; expect always null: 5 red; Mongo store ignoring expect: 2 red.
- J5: helper printing message: red; script bypassing helper: red.
