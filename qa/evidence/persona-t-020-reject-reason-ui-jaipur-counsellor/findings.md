# B17 persona walk — an average counsellor in a tier-2 city (Jaipur), 1-2 years' experience

Unit: t-020-reject-reason-ui. Walked live (checker's own browser session, screenshots in
`qa/evidence/persona-t-020-reject-reason-ui-screens/`), not the maker's report.

| Screen | What the persona tried | What confused or blocked them | Severity |
|---|---|---|---|
| Approval screen, `intendedMajor` card, before any decision | Scans the card: value, evidence quote, turn, confidence %, sensitivity, then Approve / Edit / Reject buttons. | Nothing -- the three-button choice reads plainly even without training; "Reject" is an ordinary English word. | none |
| Same card, right after clicking Reject | Clicks Reject, expecting either nothing else to happen or a confirmation prompt. | The "Reason (optional)" input appears immediately below the now-highlighted Reject button (see `02-reject-clicked-reason-field.png`) -- close enough to the click that it reads as "this is more about the choice I just made", not a separate unrelated field. Found it without hunting. | none |
| Typing into the reason box | Types a short explanation of why the fact is wrong. | The field is a single-line text box, not a multi-line note area -- for a longer explanation the visible text scrolls sideways inside a narrow box instead of wrapping. Workable, but harder to re-read before submitting than a textarea. | low |
| Typing a long reason (near/at the 500-character cap) | Keeps typing a detailed reason. | The input silently stops accepting new characters at the cap (`maxLength`) with **no counter, no message, no visual cue**. A counsellor who does not notice the cursor stopped moving may believe the app is lagging or broken, not that they hit a length limit. This is the field's only usability gap found in this walk. | medium |
| Reading the label itself | Tries to infer why this box exists / who reads it. | "Reason (optional)" says *that* a reason can be given, but not *why* (e.g. "kept as an audit note; not shown to the student") -- a first-year counsellor could reasonably wonder whether this note goes to the student, a supervisor, or nowhere. Did not block the walk (the field is optional and self-explanatory enough to skip or fill), but it's the one place a first-time user might hesitate. | low |
| Submitting the batch with the reason set | Clicks "Submit decisions" once all four facts are decided. | Straightforward -- the submit button is disabled until every fact has a decision (`Decided 1/4` counter is visible and self-explanatory), and the screen resolves normally. No confusion. | none |

## Verdict for this persona

The reject-reason flow is **discoverable and completable unaided**. No finding here reaches
`high`; the two real gaps (silent truncation at the cap, and the label not stating the reason's
audience) are workable annoyances, not blockers, for a counsellor without training on this
specific screen.
