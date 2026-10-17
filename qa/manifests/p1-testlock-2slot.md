# Manifest — p1-testlock-2slot
**Status:** ready-for-check
**Policy-Version:** proportional-verification/2026-10-18.15
**Tier:** L (concurrency: test lock)
**Round:** 1
**Fix cycle:** 0
**Dual check:** no (no security/auth/prod-write trigger)
**Base:** 5feb135
**Head:** ad7030e (branch p1/testlock; code commit, this manifest lands in the next commit on the same branch)
**Date:** 2026-10-18
**Decision:** D-096 item 1
**Files:** scripts/vc-testlock.sh, scripts/vc-testlock.test.sh (both edited in place; no new file)

## What changed
`scripts/vc-testlock.sh`: `LOCK_DIR` split into `BASE_LOCK_DIR` (slot 0, the unchanged original path) and `LOCK_DIR` (the slot this process holds). The old `acquire()` body became `claim_dir <dir> primary|extra` (same mkdir, owner/token, ISS-111 enrich check, unconditional timeout check, liveness stale-break, per directory); `acquire()` now tries slot 0, then slot `${LOCK_DIR}.slot-1` only when `two_slot_ram_ok` (free RAM >= `VC_TESTLOCK_TWO_SLOT_MIN_GB`, default 3.0, test override `VC_TESTLOCK_FREE_GB_OVERRIDE`, unmeasurable = too low) and slot 0's owner is not `EXCLUSIVE=1`. `VC_TESTLOCK_EXCLUSIVE=1` takes slot 0 then waits for slot 1 under one timeout. `release()` is unchanged (token-checked, frees only `LOCK_DIR`); new `release_extras()` frees exclusive extras by token. `wait_for_ram` now calls the new `probe_free_gb` (same PowerShell command). Log line is `[testlock] running slot <n> (free RAM X GB): ...` (`0+1` for exclusive). Header carries a D-096 note.
`scripts/vc-testlock.test.sh`: one line pins `export VC_TESTLOCK_SLOTS=1` before Test 1 so Tests 1-11 run unchanged (no assertion edited or weakened); Tests 12-16 are new and set slots/RAM explicitly.

## Pre-check / Tests (command: `bash scripts/vc-testlock.test.sh`, run in the worktree, NOT wrapped in the real lock, every test on `mktemp` dirs)
Pre-check[C1]: green run `57 passed, 0 failed` exit 0. Test 12: holders get `lock` and `lock.slot-1`, both held at once, third times out 75, first release frees slot 0 and leaves slot 1.
Pre-check[C2]: Test 13: override 1.0 GB -> second holder exit 75 and no slot-1 dir; override 3.0 (the floor) -> exit 0.
Pre-check[C3]: Tests 1-11 (original assertions, untouched) green under SLOTS=1; Test 14: SLOTS=1 with 8 GB free -> second holder exit 75, no slot-1 dir.
Pre-check[C4]: Test 15: exclusive times out 75 with both slots held, and with only slot 1 held (command never ran, its slot 0 released, other's slot 1 untouched); exclusive on a free lock sees both dirs while running and frees both. Test 16: ordinary waiter does not take slot 1 behind an `EXCLUSIVE=1` slot-0 holder.
Pre-check[C5]: Tests 12 and 15 match `running slot 0 (free RAM ...): sleep 8`, `running slot 1 (...)`, `running slot 0+1 (...)` with anchored greps.
Tests[C1..C5]: all above in the one green run: `== Summary: 57 passed, 0 failed ==`, exit 0 (log: scratchpad/run-green.log).
Defect found by the tests and fixed before the green run: the first run had 56 passed / 1 failed ("C4: the timed-out exclusive released the slot 0 it had taken"): `exit 75` inside `claim_dir` for the extra slot left `LOCK_DIR` on slot 1, so the EXIT trap compared slot 0's token to slot 1 and leaked slot 0. Fixed by restoring `LOCK_DIR` before the exit.

## Falsification (throwaway copies in scratchpad fal1..fal5, full suite each; green before = 57/0)
- C1: `SLOTS=1` hard-coded -> RED: 11 failed, first "C1: second concurrent holder took slot 1".
- C2: `two_slot_ram_ok() { return 0 ...` -> RED: 1 failed, "C2: with 1.0 GB free (< 3.0) the second holder waits and times out" (got 0).
- C3: slot-1 attempt made independent of `SLOTS` (`true && ...`, `n<2`) -> RED: 3 failed, "C3: SLOTS=1 with plenty of RAM: the second holder still waits" plus the old "live PID ... exit 75" and "Site 1" cases. (A first attempt that only dropped the `SLOTS -gt 1` test stayed green because the loop bound `n<SLOTS` already blocked it; that mutant was equivalent, so the stronger one was used.)
- C4: exclusive extra-slot wait replaced by `until true` -> RED: 3 failed, "C4: exclusive with only slot 1 held by another still times out" (got 0).
- C5: log line reverted to the old format -> RED: 3 failed, the three "C5: ... running slot ..." greps.

## Metrics
Suite runtime about 5 minutes (new tests add about 100 s; timing-based, 1 s poll). Diff: 2 files, +237 -20.

## Notes and open risks
- TDD order slip: implementation was written before Tests 12-16; the red evidence is the five falsifications above rather than a pre-implementation red run.
- Working-tree line endings: the two files were CRLF in the worktree (index LF, autocrlf); they were normalised to LF, so the diff is content-only.
- Incident: while probing line endings I ran `bash scripts/vc-testlock.sh true` WITHOUT `VC_TESTLOCK_DIR`, which queued on the real shared lock (held by another session's run_all.sh), acquired it after that holder released, ran `true`, and released by token. No other session was harmed; no test touched the real path after that.
- Residual: exclusive waiters hold slot 0 while waiting for slot 1, so ordinary waiters stall until the exclusive run ends (intended; stops slot-1 starvation). Slot-1 stale lock left by a dead holder is broken by the same liveness logic as slot 0 (not separately falsified).
- Not run: full repo suite, real-RAM probe path (`probe_free_gb` unchanged command, exercised only in `wait_for_ram` at MIN_FREE_GB=0).
