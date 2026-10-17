# Checkpoint A - p1-u7-anon-mode (cycle 0)
Head f1d762653ba5c33a339815ba8b2339849c06be5d, base 0e62084a1491b878cbe87b89455681baa5353b77. All mandatory checks complete, nothing remaining.
- api: tsx --test anonymous-route + anonymous-zero-persistence -> 43/43; engine student-graph + student-classify -> 67/67
- scoped full: apps/api 124/124, packages/db 253/253, packages/engine 1002 pass 45 skipped (1047), `pnpm -r typecheck` exit 0
- falsification: 33 rows in a throwaway copy, driver `chkA/driver.py`, output `chkA/driver.out`, `chkA/fals/summary.json`; copy restored (0 diffs vs bound tree)
- hostile probes: `zz-hostile-a.test.ts`, `zz-hostile-b.test.ts` (12 cases), outputs `chkA/hostile.txt`, `chkA/hostile-h4.txt`
- scratch root: C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/chkA
- result PASS, 5 PROPOSED-ISSUE (1 medium, 3 low, 1 info)
