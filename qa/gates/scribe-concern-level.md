# Gate: scribe-concern-level
**Opened:** 2026-09-25
**Question:** The post-session scribe (T-007) stops for a "concern"-level turn (e.g. "I feel hopeless", "bahut tension hai"), the same way it stops for "crisis". Should it?
**Options:**
- (a) **Concern = flag and continue (recommended).** The scribe still produces the facts, summary and profile diff for the counsellor to approve, and puts a visible concern flag on the session. The counsellor is present and is the human decider. B16's async classifier and escalation (T-012) handle the follow-up. Only "crisis" stops generation and escalates (B9).
- (b) Concern = stop, as built. This is safer, but many ordinary exam-stress sessions would produce no scribe output.
- (c) Concern = continue with no flag.
**Blocks:** nothing now. T-007 ships as built (option b); switching to (a) is a small follow-up.

Answered: 2026-09-26 — flag and continue, plus KG + gentle check-in + escalate if serious — Umesh via AskUserQuestion (maker session 6c22744a), verbatim: "again knowledgegraph and also it should try to ask for it and console in friendly manner and also it will update the concerned person if things loook more serious like counsellor or admin". Maker reading: concern never stops the scribe; the concern is written into the KG with its citation; a gentle check-in is a live-card QUESTION (T-010, never a script) and a direct console in P3; escalation to counsellor/admin on rising severity goes through the T-012 classifier (B16).
