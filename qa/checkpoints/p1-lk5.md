# Checkpoint - p1-lk5 (cycle 1, checker, completed checks)
Head a544ba8 (code = 13ac9b7), repair base 3f746e5. Env: win32, node v24.13.1, tsx via pnpm exec, mock providers only, TMP/TEMP on D:. Lockfile unchanged.
- hostile drive (copy D:/chk-tmp/lk5c1/base, chk-hostile.test.ts): 6 tests pass; K1, crisis-first, M1 (18 cases), M2, M3 hold; probes show Devanagari spelled figure/currency bypass (ISS-386).
- falsification copies k1, m1, m2, m3: green before, red after (4/4).
- K7 scoped: engine lk5 53, lang 34, student-graph 64, crisis-defaults 17, crisis-escalation 42, claims-guard 33, capability-manifest 3, coach-first 5, index 2; api chat 32, anonymous-route 16, acceptance-student-journey 3, voice-wiring 16; typecheck engine exit 0.
Result: FAIL (K1/M1 number parity, ISS-386). Attribution: checker p1-lk5-repair1-check (this file). Cycle-0 evidence (guard-crisis, concern-classifier, voice, anonymous-zero-persistence at identical code) reused from the maker's K7 at 13ac9b7.

# Checkpoint - p1-lk5 (cycle 2, checker, completed checks)
Head 983c773 (code = 036fc87), repair base e71c8f4. Env: win32, node v24.13.1, tsx via pnpm exec, mock providers only, TMP/TEMP on D:. Lockfile unchanged. Evidence: qa/evidence/p1-lk5/repair2-check/.
- hostile table (copy D:/chk-tmp/lk5c2/base, chk-h2.test.ts, 66 localized claims + 13 magnitude probes): all brief probes and controls hold; under-blocks listed in under-blocks.txt (ISS-389/390).
- links/IDN/dots/ISS-387/crisis (chk-h3.test.ts): 4 dot variants and Devanagari IDN hosts blocked; magnitude regex source has \p escapes; crisis 4/4 with 0 provider and 0 detector calls.
- falsification: baseline 5/0; m386 2 fail, m386units 2 fail, m387 1 fail, midn 1 fail, mdot 1 fail.
- K7 scoped: engine lk5 58, lang 34, student-graph 64, claims-guard 33, crisis-defaults 17; api chat 32, anonymous-route 16; tsc engine exit 0.
Result: FAIL (K1/M1, ISS-389: lists are closed). Attribution: checker p1-lk5-repair2-check (this file).
