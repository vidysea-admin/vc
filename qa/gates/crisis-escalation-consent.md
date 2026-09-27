# Gate: crisis-escalation-consent
**Opened:** 2026-09-27 (T-012 reviews: ai-engineer Warning + senior-software-engineer low)
**Question:** a session with **no recorded consent** that contains a crisis turn (self-harm or abuse
disclosure) currently produces **no escalation record at all**. `escalateSessionFlags` checks consent first
(B4) and stops (`packages/engine/src/scribe/graph.ts:626`). Should a crisis escalate anyway?

**Options:**
- **(a) Escalate always (recommended).** A crisis flag notifies the tenant admin and the concerned
  counsellors even without consent. The escalation record carries ids and a flag only, never transcript
  text. No other processing (facts, profile, KB) happens without consent. Basis: DPDP Act 2023 s.7 lists
  "responding to a medical emergency involving a threat to the life … of the Data Principal" as a
  legitimate use that needs no consent. The student is a minor, so missing a crisis is the worse harm.
- **(b) Consent first (the current behaviour).** No consent, no escalation. There is no record and no
  notification.
- **(c) Escalate without storing anything.** Notify the humans, but write no DB record. The SLA cannot be
  measured then, and there is no audit trail.

**Blocks:** any real-student pilot. It does not block build units: T-035 wires the escalation and implements
whichever option is chosen, with (a) behind a config flag until this is answered.
**Answer format:** chat reply. The maker appends `Answered:` here, then a DECISIONS entry.
