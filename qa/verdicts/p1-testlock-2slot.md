# Verdict: p1-testlock-2slot
**Verdict:** PASS
**Cycle checked:** 0
**Tier:** L (concurrency, test lock). One checker, no dual check. Policy: proportional-verification/2026-10-18.15
**Base:** 5feb135 **Head checked:** 4bb0dd5 (code at ad7030e)
Metrics: start=2026-10-18T04:33:37+05:30 end=2026-10-18T04:54:48+05:30 wall_min=21 agent_min=unavailable blocked_min=0 suite_runs=1 repeat_runs=0 mutations=5 cycle=0 resumes=1 tokens=unavailable policy=proportional-verification/2026-10-18.15 lane=normal check_s=1271 mutants=0 defects_unit=0 defects_6c=0

## Plan
Full diff read (scripts/vc-testlock.sh, scripts/vc-testlock.test.sh, manifest); full test script run on a fresh mktemp VC_TESTLOCK_DIR; hostile probes in a throwaway copy; one falsification per criterion C1-C5 in throwaway copies (trimmed to Tests 12-16). The real lock was never touched.

## Evidence
- Full run: `bash scripts/vc-testlock.test.sh` -> `== Summary: 57 passed, 0 failed ==`, EXIT=0 (04:34 to 04:40, ~5.5 min).
- C3 / Tests 1-11: the test-file diff has exactly one change in that region, `export VC_TESTLOCK_SLOTS=1`; no assertion edited, removed or weakened. Pinning SLOTS=1 is what C3 specifies ("SLOTS=1 behaves as before"), and Test 14 checks it directly. Not a weakening.
- Hostile probes (copy of the script, real concurrency):
  - P1: 4 holders staggered, max concurrent = 2, 8 log lines, no leftover dirs.
  - P2: free RAM override 2.9 (< 3.0): 3 holders, max concurrent = 1.
  - P3: A (slot 0), B (slot 1), then exclusive X, then ordinary Y: X ran alone (no overlap), saw both slot dirs while running; Y ran outside X. Y won the slot-0 race against X once A freed it (both poll); that is queueing order, not an exclusivity breach.
  - P4: stale slot 1 (dead PID 999999) with slot 0 held live: "lock is stale", "breaking stale lock ... slot-1", new holder ran on slot 1, live slot-0 holder untouched.
  - P5: exclusive with timeout 3 and (only slot 0 held | only slot 1 held | both held): exit 75, command never ran, after the timeout only the other holder's dirs remain (no leaked slot 0).
  - P6a: slot-1 holder's TOKEN replaced mid-run: release logs "token changed -- not removing", dir kept. P6b: exclusive with slot-1 token replaced: slot 0 freed, slot 1 kept with the "no longer ours" message.
- Falsifications (copy, Tests 12-16 only; green control alone: 27 passed, 0 failed):
  - C1 `SLOTS=1`: RED "C1: second concurrent holder took slot 1" (+ 11 more).
  - C2 `two_slot_ram_ok() { return 0`: RED "C2: with 1.0 GB free (< 3.0) the second holder waits and times out" (got 0).
  - C3 slot-1 attempt ignores SLOTS: RED "C3: SLOTS=1 with plenty of RAM: the second holder still waits" (got 0).
  - C4 exclusive extra-slot wait `until true`: RED "C4: exclusive with BOTH slots held ... times out" and "only slot 1 held ..." (got 0), "BOTH slot dirs are held" (notboth).
  - C5 log line reverted: RED three "C5: ... running slot ..." greps.

## Findings (none blocking)
- Low (process): under 6 parallel copies of the suite (my first falsification batch) the unmutated control showed one red, "C1: a third holder ... times out (exit 75)" got 0, and the same red sat in every mutant. The control re-run alone is green (27/0), the full suite was green, and the mutants' named reds are distinct from it. This is the known load sensitivity of the timing/tasklist-based tests; run this suite alone, as the manifest says.
- Low: an exclusive run competes for slot 0 with ordinary waiters on equal terms, so a steady stream of ordinary jobs can delay it (no fairness). It is by design and it never breaks exclusivity.
- Manifest note confirmed: the TDD order slip (implementation before Tests 12-16) is not a correctness issue; the five falsifications supply the red evidence.
Note: session was suspended after 04:54:48 (last run read) until the resume; end= is the last active read, verdict committed 2026-10-18T23:32+05:30.
