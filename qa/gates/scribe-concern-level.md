# Gate: scribe-concern-level
**Opened:** 2026-09-25
**Question:** The post-session scribe (T-007) stops for a "concern"-level turn (e.g. "I feel hopeless", "bahut tension hai"), the same way it stops for "crisis". Should it?
**Options:**
- (a) **Concern = flag and continue (recommended).** The scribe still produces the facts, summary and profile diff for the counsellor to approve, and puts a visible concern flag on the session. The counsellor is present and is the human decider. B16's async classifier and escalation (T-012) handle the follow-up. Only "crisis" stops generation and escalates (B9).
- (b) Concern = stop, as built. This is safer, but many ordinary exam-stress sessions would produce no scribe output.
- (c) Concern = continue with no flag.
**Blocks:** nothing now. T-007 ships as built (option b); switching to (a) is a small follow-up.

Answered:
