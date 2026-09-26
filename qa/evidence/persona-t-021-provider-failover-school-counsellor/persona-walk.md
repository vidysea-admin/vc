# Persona walk — T-021 provider failover, "school counsellor"

Contract B17. Fix cycle 1 re-walk, live via Playwright against `next dev` (localhost:3211, demo
mode), checker's own browser session — same run as
`qa/evidence/browser-t-021-provider-failover-c1-2026-09-26-checker/report.json`.

| Screen | What they tried | What blocked/confused them | Severity |
|---|---|---|---|
| Home (`/`) | Distinguish the new-session entry point from pre-seeded threads | Unchanged from cycle 0 — reads fine. | n/a |
| New session (`/sessions/new`) | Read the transcript table | Header now says "What was said" (was "Proposed value" in cycle 0) — for this persona the old label was less confusing than for the Jaipur counsellor (a school counsellor is less familiar with the approval screen's vocabulary in the first place), but the new label is still a clear improvement and no worse. Raw student id ("demo-student-4") with no name remains, unchanged, pre-existing, out of this unit's scope. | low (pre-existing, unchanged) |
| All-fail -> apology banner | Decide whether to call for help or just retry | Same plain apology as cycle 0. The shortened worst-case wait (server ~45s + client ~50s ceiling, replacing the old unbounded ~5.4 min tail) means this persona is less likely to abandon the flow or assume the system is broken before the apology even appears. | n/a |
| Retry -> started -> approval screen | Get back to reviewing the AI's proposal | Completed the full loop unaided, same as cycle 0. | n/a |

**Cycle-1 outcome:** no new high-severity finding for this persona. The one low finding (raw
student id) is unchanged, pre-existing, and outside this unit's scope, as recorded in cycle 0.
