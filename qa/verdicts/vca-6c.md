# Verdict: vca-6c (6c pre-push integration check, main after vc-admin-control merge)

**Overall:** PASS
**Code HEAD tested:** 303e5cf (working tree: qa bookkeeping only)
**Policy-Version:** proportional-verification/2026-10-19.17
**Mode:** full suite (.13-2a: batch holds a security/auth L unit; .13-2b also applies: pnpm-lock.yaml and 4 package.json files changed). No -x/--maxfail.
**Run at:** 2026-10-27T01:59 to 2026-10-27T02:06:54+05:30

## Per-package counts (final run, under vc-testlock, `pnpm test` from each package dir)
| Package | tests | pass | fail | skipped |
|---|---|---|---|---|
| packages/schemas | 117 | 117 | 0 | 0 |
| packages/db | 324 | 324 | 0 | 0 |
| packages/observability | 59 | 59 | 0 | 0 |
| packages/providers | 201 | 201 | 0 | 0 |
| packages/engine | 2137 | 2092 | 0 | 45 (pre-existing; batch diff adds no skip/todo) |
| apps/api | 778 | 778 | 0 | 0 |
| apps/web | 83 | 83 | 0 | 0 |
| apps/widget | 95 | 95 | 0 | 0 |
| mcp/pathlynks | 37 | 37 | 0 | 0 |
| mcp/student-profile | 12 | 12 | 0 | 0 |
| mcp/university-kb | 77 | 77 | 0 | 0 |
| Total | 3920 | 3875 | 0 | 45 |
apps/student is static (no package.json, no tests).

## Other commands
- `bash scripts/vc-testlock.sh pnpm -r typecheck`: rc=0 (11 projects).
- `python contracts/verify_contracts.py`: rc=0 ("no frozen contracts yet, PASS by vacuity").
- Collection check: node:test has no collect-only; every test file is imported by the full run (no file-level import failure in the final run).
- qa/checkpoints/baseline-reds.md does not exist; no baseline reds were needed (0 fails).

## Process note: first run was environmental, not a code red
The first full run was RED for apps/api (15 fails, 4 admin files + others: ERR_MODULE_NOT_FOUND '@vc/mcp-pathlynks'), mcp/pathlynks (3 file fails: cannot find '@modelcontextprotocol/sdk') and typecheck (TS2307 'pg'). Cause: the main checkout's node_modules predated this batch's lockfile change (mcp/pathlynks 'node_modules missing'), not a code defect. Remedy: `bash scripts/vc-testlock.sh pnpm install --offline --frozen-lockfile` (15 packages added from the local store, no network, lockfile and git tree unchanged). Then the WHOLE suite was re-run from scratch (the table above is that run; suite_runs=2, full-suite reruns=1 within the .17-2 cap). Log of the first run is not part of the verdict.

Metrics: start=2026-10-27T01:59:27+05:30 end=2026-10-27T02:06:54+05:30 wall_min=9 agent_min=unavailable blocked_min=0 suite_runs=2 repeat_runs=0 mutations=0 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=540 mutants=0 defects_unit=0 defects_6c=0 prepush_wall_min=3 tests=3920 mode=full shards=1
