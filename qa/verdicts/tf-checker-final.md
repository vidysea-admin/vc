# Tool-first final check, cycle 1 (2026-10-29)

Independent senior-software-engineer check, saved by the main session.

**Cycle checked: 1. Verdict: FAIL**

## Items that passed
| Item | Evidence |
|---|---|
| openReadOnlyDb option allow-list | hostile, polluted and odd-type options all tried |
| database name screen | all variants refused |
| verified edges | model-only edges are verified=false |
| stacked decorators | 100k lines in 106 ms |
| acceptShrink under D-135 | admin honoured, viewer 403, non-boolean 400, audit row written before the artifact |
| routing probe | 39/39 tool asks routed, 0 of 22 stolen |

All suites green; tsc is clean.

## Findings
- **[medium] routes.ts ~179 parseStudentHub (the cause of the FAIL).** The keys.some de-dup is quadratic: 120k keys took 138 s.
- **[low] client.ts:172-174.** The $out/$merge screen checks top-level stages only, so a write stage nested in $facet, $lookup or $unionWith passes. Not exploitable today, because all current pipelines are constants.
- **[low]** readPyCall is bounded at 3.2 s. Acceptable.

## Fix by the main session
- parseStudentHub now de-dups with a Set.
- The write-stage screen is now recursive and depth-capped.
- Tests were added for both.

Fix results:
| Suite | Result |
|---|---|
| ingest | 65/65 |
| db | 67/67 |

tsc is clean. Cycle 2 check dispatched.
