# Persona walk — jaipur-counsellor (T-023 c0, checker)

Persona: jaipur-counsellor -- a tier-2-city counsellor with 1-2 years' experience; goal: approve the
scribe's facts after a session quickly; blocks_on: unclear labels, long review lists.

This is the exact persona whose walk (T-020) raised ISS-t-020-c0-1 (the reject-reason box silently
stopped accepting keystrokes at the cap, with no counter/message).

## Walk (own browser session, http://localhost:3163/approvals/scribe:demo-session-1)

1. Screen: approval screen, intendedMajor fact -> selected Reject. Tried: typed a reason. What they
   saw: "Reason (optional)" label, plain box, and immediately a live "Characters left 0/500" counter
   next to it, in plain English, updating on every keystroke. Severity: none (this is the fix).
2. Screen: same box, typed up to the 500-char cap. What they saw: the counter flips to
   "500/500 - Limit reached" the moment the cap is hit; the box stops accepting more keys but the
   counsellor now has an explicit, in-place reason instead of the app looking frozen/broken.
   Severity: none.
3. Screen: same box, deleted one character. What they saw: "Limit reached" disappears immediately,
   counter shows "499/500". Confirms the notice is live and correct, not stuck.
4. Confusion check: the label wording ("Characters left", "Limit reached") is plain English, no
   jargon, matches the persona's blocks_on ("unclear labels"). No hidden step, no icon-only cue.

## Finding

None at `high` or above. The unit visibly fixes the exact ISS-t-020-c0-1 defect for this persona.
One usability note, not a blocker: the counter and its labels are English-only text; jaipur-counsellor
is not flagged as needing Hindi in qa/adapter.json (only gaurav-bhaiya/govt-teacher are `language: hi`),
so this is consistent with the persona's declared scope, not a gap.

Severity: none / informational only.
