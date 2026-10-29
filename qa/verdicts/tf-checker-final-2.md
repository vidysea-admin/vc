# Tool-first final check, cycle 2 (2026-10-29)

Independent senior-software-engineer check, saved by the main session.

**Cycle checked: 2. Verdict: PASS**

## parseStudentHub (routes.ts:173-186)
- The de-dup now uses a Set.
- Timings:

  | Input | One key per line | All on one line |
  |---|---|---|
  | 120k keys | 78 ms | 177 ms |
  | 227k keys (2 MB cap) | 61 ms | 397 ms |

  The old code took 138 s on 120k keys.

## Recursive write-stage screen (client.ts:161-167)
- **Refused:**
  - $out or $merge nested in $facet, $lookup and $unionWith, at any depth
  - a 10k-deep nested object or array, and a cyclic object (the depth cap fails closed, with no stack overflow)
- **Allowed** (no false positive): "$out" used as a value, and a key with a leading space.

## Regression runs
| Suite | Result |
|---|---|
| db | 67 pass |
| engine ingest + routing-probe | 80 pass (39/39 routed) |
| pathlynks port | 73 pass, 1 skip |
| api admin-sync | 52 pass |

tsc is clean for db and engine.

Items 1, 2, 4 and 5 passed in cycle 1 (tf-checker-final.md).
