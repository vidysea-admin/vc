# Tool-first re-review, fix round 1: senior (2026-10-29)

**Verdict: Block**

## Fixed
- **SSE1-4:** fixed.
- **Broken save_type tests:** fixed.
- **Voice exposure:** fixed.
- **AI findings 1-4:** fixed.
- **Hostile inputs:** 5000, 20k and 80k chars all stay fast.
- **Anonymous navigation:** reaches only auth:"public" recipes and reads no student data.

## New findings
- **[high] packages/db/src/client.ts:154-162.** openReadOnlyDb spreads caller options. AggregateOptions.out makes the driver append $out (mongodb lib/operations/aggregate.js:22-23), which is a write through the read-only facade. No current caller passes it, but the B12 guarantee is false.
  - Fix: allow-list options per method, and test that out/merge are dropped.
- **[medium] routes.ts:387-388, migrations.ts:1172.** verified and writerFound are true for verifiedBy "model".
  - Fix: count router or service only.
- **[medium] migrations.ts:944-952.** Stacked decorators are quadratic: 100k lines take 89.6 s.
  - Fix: do one pass, or cap the lookahead.
- **[low]** query(T) costs 0.7 ms per 2000-char line. Acceptable.

## Other checks
- The database allow-list is an exact match and hostile names are refused.
- The quest reader is owner-bound, its projection is allow-listed, and an outage is not reported as zero rows.
- The mongo source kind is strict.
- voice.test C16 passed 3 of 3 (not reproduced).

## Tests
| Package | Result |
|---|---|
| engine | 308 pass |
| pathlynks | 81 pass, 1 skip |
| db | 62 pass |
| schemas | 23 pass |
| api | 169 pass |

tsc is clean.
