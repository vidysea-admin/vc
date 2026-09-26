# Persona walk — T-021 provider failover, "school counsellor"

Contract B17. Walked live via Playwright against `next dev` (localhost:3108, demo mode), same run as
the Mode D evidence in `qa/evidence/browser-t-021-provider-failover-2026-09-26-checker/`.

| Screen | What they tried | What blocked/confused them | Severity |
|---|---|---|---|
| Home (`/`) | Distinguish the new "start a session" entry point from the 3 pre-seeded demo threads in the list | Reads fine — the link is above the list, in its own line. No confusion. | n/a |
| New session (`/sessions/new`) | Judge whether this is production data or a demo | The student is shown only as a raw id ("demo-student-4") with no name — a school counsellor used to per-student names in a SIS would notice this, but it is a pre-existing demo-fixture pattern (not introduced by this unit) and does not block the flow. | low |
| All-fail -> apology banner | Decide whether to call IT / a colleague or just try again | The apology + "Nothing you typed is lost" + a single visible Retry button reads as "just click Retry" without needing outside help — appropriate for someone without technical background. | n/a |
| Retry -> started -> approval screen | Get back to reviewing what the AI proposed, without redoing data entry | Completed the full loop unaided: Retry -> "Session submitted" -> "Open the approval screen" -> sees the same 4 proposed facts + 2 dropped facts with reasons + draft summary, ready to approve/reject per fact. | n/a |

**No high-severity finding for this persona.** The one low finding (raw student id, no name) is a
pre-existing demo-fixture limitation outside this unit's scope, noted for completeness, not filed as a
new issue against T-021.
