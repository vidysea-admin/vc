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

# Checkpoint - p1-eng3-crisis-leftovers (cycle 2, checker, completed checks)
Base 52d2af5, code ba4e2bf, manifest 9abff36. Env: win32, C: 99 percent full, mock only.
- testlock: engine guard-crisis + crisis-defaults -> 403/403; apps/api four tests -> 85/85; engine typecheck -> exit 0.
- recall/precision probes (eng3c2/probe.mts): all review rows and hostile variants as briefed pass; 4 own-paraphrase misses are pre-existing at base (ISS-190).
- speed: "1"x100000 = 32.2 s, "5"x100000 = 31.2 s (quadratic LEET_BEFORE_LETTER, entered in 0cc886c; base and 8512f82 take 1 ms at 20k). All other 100k inputs under 35 ms.
- falsification (eng3c2/fals, restored): M1-M8 killed, M9-M11 equivalent.
- Result: FAIL (C1 speed requirement), ISS-189..9. Last fix cycle used.
Attribution: checker p1-eng3-c2-check (this file).


# Checkpoint - p1-eng3-crisis-leftovers (cycle 3, checker, completed checks)
Base 52d2af5, code 798a31e, manifest 127a074. Env: win32, C: 99 percent full, mock only.
- testlock: engine guard-crisis + crisis-defaults -> 406/406; apps/api four tests -> 85/85; engine typecheck -> exit 0.
- probes (eng3c3chk/probe.mts, cmp.mts, drop.mts): recall, precision, D-098, onwards/online as briefed pass; pre-existing misses unchanged; 59 speed cases all under 200 ms (max 56); doubling ratios linear; reviewer grid regress-vs-c2 0.
- falsification (eng3c3chk/fals, restored): K1-K6, K8 killed; K2b, K3b, K9 survive (test gaps, ISS-192/11); K7 equivalent.
- Result: PASS. ISS-189 closed.
Attribution: checker p1-eng3-c3-check (this file).
