# T-052 P0 result (owner t052-p0) -- ENVIRONMENTAL-BLOCKED

Verdict: **ENVIRONMENTAL-BLOCKED**. The quiet gate Q (plan-v2 section 2) never held, so P0 was NOT run.
No test was executed, no row is classified, nothing is PASS. No repo source was edited, staged, stashed or reset.

Gate window: 2026-10-17T13:11:07+05:30 to 2026-10-17T13:56:06+05:30 (45 min, 29 samples of ~60-150 s, sampler script slowed by load).
Raw readings with timestamps: qa/evidence/t052-p0-20261017/quiet-gate.log (all 29 samples pass=0, consecutive=0 throughout).

Q requires: lock absent, node.exe <= 12, CPU <= 25%, free RAM >= 6 GB, C: >= 15 GB, on 3 samples 60 s apart.

Observed range: lock=held in all samples; node.exe 26-75; CPU 100% in all samples; free RAM 3.35-7.03 GB; C: free 41.1-41.2 GB (C: was never the problem).

Cause (read from the lock owner file and process list, not guessed): the ISS-124 / T-035 maker lane holds scripts/vc-testlock.sh
(owner DESC load124.sh base, then load124.sh fixed, w124 scratch worktree) and runs 20-40 synthetic busy-spin node processes
(node -e "while(Date.now()<e){}", 1500 s each) to measure under load, plus a full suite lane. Other lanes (maker tick lint, an erp e2e) add more node.exe.
That is deliberate load from another agent, so Q cannot hold while it runs. This is ENVIRONMENTAL, not a product signal.

## Per-row classification (nothing measured)

| Rows | Count | Class |
|---|---|---|
| F-a (facts summary receipt) | 14 | UNCLASSIFIED (P0 not run) |
| F-b (facts partial wrapper) | 2 | UNCLASSIFIED (P0 not run) |
| A-a (adapter, quiet FAIL would go PRODUCT per C3) | 12 | UNCLASSIFIED (P0 not run) |
| N-c | 4 | UNCLASSIFIED (P0 not run) |
| N-e | 1 | UNCLASSIFIED (P0 not run) |
| N-a, N-b (C3 extension) | 6 | UNCLASSIFIED (P0 not run) |
| A-b, A-c (C3 extension) | 4 + start/resume rows | UNCLASSIFIED (P0 not run) |
| C4 msPastExpiry check | n/a | not measured; 3.9 closure of the late-call item remains unproven |

Counts as printed: none (no node:test output exists for this run). The only prior counts are R1 128 tests / 74 pass / 54 fail (plan-v2 section 1), which are NOT quiet-lane.

## Next step
Per plan-v2 section 2: Q not met in 1 attempt of 45 min. Rule: raise HUMAN_GATE to the coordinator if Q cannot be met in 2 attempts within 4 h.
Needed: the coordinator stops the ISS-124 load lanes (load124.sh and its 20-40 spin processes) and any full-suite lane, then re-dispatch P0.
Prepared command (unchanged R1, run from D:/vc, inside the lock, with VC_TESTLOCK_TIMEOUT_SECS raised; abort/mark NOT-QUIET if > 150 s):
  bash scripts/vc-testlock.sh node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 --test-timeout=120000 --test-reporter=tap --test-name-pattern '^(?:D068 .+|D058 (?:transcript|concern) rejected receipt: actual late (?:owned insertion leaves zero residue|matched recreated winner preserves full rows)|D059 applyApprovedDiff dynamic postcheck: (?:successful|failed) work then expired budget preserves exact read undo priority|D059 applyApprovedDiff actual partial wrapper: (?:clean-own-expiry|unexpected-raw) preserves provenance and immutable primary)$' packages/db/tests/facts.test.ts packages/db/tests/decisions.test.ts packages/engine/tests/scribe-persistence.test.ts packages/engine/tests/scribe-checkpointer.test.ts packages/engine/tests/scribe-per-fact.test.ts
Then the second diagnostic pass over failing names (scratchpad copy + diag_patch.py with msPastExpiry added to DIAG-PROV).
