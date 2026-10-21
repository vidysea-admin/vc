# Checkpoint — p1-grounding-hardening (cycle 0, checker)
Head d04b754 (code 00a671a), base 3772f4a. All mandatory checks completed; verdict FAIL (H1).

Evidence identity (all runs by the checker, `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 <cmd>`, TMP/TEMP on D:, in the bound tree for re-runs and in a git-archive copy for proofs and falsifications):
- Re-runs: summary in qa/evidence/p1-grounding-hardening-check/summary.txt, logs `<name>.log`. Code hashes: packages/engine/tests blobs per manifest Pre-check lines (student-graph 6ba7b43, lang 829eea4, lk5 734ebf6), same tree at d04b754.
- Outcome proof: qa/evidence/p1-grounding-hardening-check/checker-proof.test.ts.txt (proof1.log), probe2/3/4.
- Falsification: fals.txt, fals2.txt and the fal-*/fal2-* logs.
- Environment: Windows 11, node tsx test runner, C: 70 GB free (no environmental failure seen).
Result: H2 H3 H4 H5 H6 H7 evidenced; H1 failed on lower-case "I am <name>" and "pin code is <PIN>" (lang.ts:783, :823).
Repair checker (cycle 1) should re-run: H1 (student-graph H1, lang H1, checker-proof H1 probes) plus any criterion whose input files the repair touches (lang.ts is shared with H4 and H5: re-run lang.test.ts and the H4 student-graph tests).
