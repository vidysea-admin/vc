# Checkpoint - p1-eng3-crisis-leftovers (cycle 0, checker, completed checks)
Base 52d2af5, code 8512f82, manifest 5153e93. Lockfile pnpm-lock.yaml unchanged by the diff. Env: win32, node v24.13.1, tsx 4.23.15, mock provider only.
- typecheck: pnpm -C packages/engine typecheck (via vc-testlock) -> exit 0.
- main set: 20 engine test files per manifest (via vc-testlock) -> tests 870 pass 825 fail 0 skipped 45.
- extra engine: capability-manifest source-kind cards-verifier guard-citation guard-no-script -> 41/41.
- apps/api: anonymous-route anonymous-zero-persistence server index -> tests 85 pass 84 fail 1 (anonymous-zero-persistence.test.ts:621).
- ISS-126 test x3 -> pass 1 each.
- falsification (copy eng3chk/fals, restored): F1 5 red, F1b 4 red, F2 4 red, F3 1 red, F4a 4 red, F4b 1 red, F4c 1 red. Baselines green.
- probes: eng3chk/probe1..6.mts (scratchpad). Result: FAIL (kms suppression; apps/api test).
Attribution: checker p1-eng3-check (this file).
