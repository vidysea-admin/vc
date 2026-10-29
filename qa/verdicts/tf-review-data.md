# Tool-first data-engineer review (2026-10-29)

Fresh read-only data-engineer review. The reviewer could not write files, so the main session saved it.

**Verdict: Warning.** No critical issue, no write path to production.

## Findings
1. **[high]** admin-routes.ts:779-795. The frontend KG sync writes a graph-less or shrunken nav_catalogue when the hub or nav file is missing. Keep-last-good runs only inside that branch. The backend (:824-825) accepts partial parses. `skipped` is never gated.
   - Fix: keep last good on hub missing, on a >30% shrink, or when skipped > 0.
2. **[high]** admin-routes.ts:948-951. listTree returns no commit or tree sha, so a real admin Sync loses the commit provenance that only t8-live-sync.ts injected.
3. **[medium]** migrations.ts:1014. 42 of 59 edges are unverified.
   - The check can never verify the 12 model seeds or the 3 service seeds.
   - The check is file-level, not per tool.
   - False negative: shortlist_router -> student_shortlisted_courses is marked unverified although that router writes it.
   - The visa, favourites and saved-scholarships edges are unverified.
4. **[medium]** Nothing consumes the KG yet (joinProductKg is used only by tests and the live script). Any consumer must treat verified=false as "do not route".
5. **[medium]** port.ts:461 + graph.ts:468. next_due_date is the MIN end_date of any open milestone, so it can be in the past but is labelled "next due". Possible UTC/IST day shift. The journey aggregate was never run on non-empty data: do a count-only bucket-sum check.
6. **[low]** Drift is checked once only. schema_map stores the tables twice (505 KB).

## Re-runs
| Suite | Result |
|---|---|
| ingest | 48/48 |
| pathlynks port | 61 pass, 1 skip |
| api admin-sync | 40/40 |
