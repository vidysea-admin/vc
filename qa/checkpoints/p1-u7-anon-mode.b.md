# Checkpoint B - p1-u7-anon-mode (cycle 0)
Head f1d762653ba5c33a339815ba8b2339849c06be5d, base 0e62084. All mandatory checks complete, nothing remaining.
- api: tsx --test tests/anonymous-route.test.ts tests/anonymous-zero-persistence.test.ts -> 43/43; engine student-graph + student-classify -> 67/67
- pnpm -r typecheck exit 0; suites api 124, db 253, engine 1002 pass 45 skipped
- falsification: 25 mutants, qa/evidence/p1-u7-check-b/fals-summary.json (the last 2 A15c rows are in the run output), node v24.13.1, tsx 4.23.15, lockfile unchanged
- probes: probe.mts, probe2.mts, probe3.mts, probe5.mts (probe4 inline), outputs in probe-out.txt
- result PASS
