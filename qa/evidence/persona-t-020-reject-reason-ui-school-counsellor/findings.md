# B17 persona walk — a school counsellor

Unit: t-020-reject-reason-ui. Walked live (checker's own browser session, screenshots in
`qa/evidence/persona-t-020-reject-reason-ui-screens/`), not the maker's report. This persona
differs from the Jaipur/tier-2 counsellor in likely context: works with many students in a
single sitting, less time per student, and is used to paper/registers rather than software
audit trails.

| Screen | What the persona tried | What confused or blocked them | Severity |
|---|---|---|---|
| Approval screen, full page on load | Scans facts, dropped facts, and the draft summary in one pass before deciding anything. | The dense single page (4 fact cards + dropped table + summary + submit bar) is a lot to read for someone moving fast between students, but nothing is hidden or mislabeled -- everything a school counsellor would want to check (evidence quote, turn, confidence) is visible without extra clicks. Not a blocker, just a pace concern. | low |
| Deciding to reject `intendedMajor` and explain why | Clicks Reject, then looks for where to note "family wants to re-check this major with the school counsellor first" -- exactly the kind of institutional coordination note this persona would want to leave. | Found the reason field immediately below Reject, same as the other persona. No hunting needed. | none |
| Judging whether the reason is really optional | Considers leaving the reason blank because they're moving fast between students. | The label says "(optional)" plainly, and skipping it does not block the Submit button (`Decided 1/4` only counts a decision being made, not a reason being typed) -- confirmed by this walk's own request capture: an empty/whitespace reason is silently omitted rather than sent as `reason: ""`, so declining to type a reason produces exactly the record shape a school counsellor would expect ("rejected, no note"), not an error or a blank-looking note. | none |
| Looking for a record of what they just did | After submitting, wants to confirm the rejection + reason was actually saved (this persona is used to a paper trail). | There is **no in-app screen that shows the counsellor their own past decisions or the reason they typed** -- the "done" state shows only the outcome status, not a readback of what was written (this is a stated residual of the unit, not a hidden gap: only the demo read-back API route exposes it, and that is a QA/dev tool, not a counsellor-facing screen). For a persona whose trust model is "I can look it up later," this is a real gap, but it is disclosed rather than silently missing, and the unit's own scope explicitly does not claim to close it. | medium |
| Re-reading the typed reason before submitting | Wants to proof-read the note (school counsellors sometimes write institution-facing notes they're careful about). | The single-line input keeps the full text but only shows the visible slice at the current scroll position for a long reason -- same finding as the other persona, same severity. | low |

## Verdict for this persona

Nothing here reaches `high`. The one gap specific to this persona's expectations (no
counsellor-facing "what did I write" screen) is a known, disclosed residual of the unit
(manifest residual 1), not a silent defect discovered by this walk -- it does not block PASS,
but is worth surfacing as a real product gap for this persona's workflow.
