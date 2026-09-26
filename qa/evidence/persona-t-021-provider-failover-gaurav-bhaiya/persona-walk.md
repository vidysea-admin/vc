# Persona walk — T-021 provider failover, "gaurav-bhaiya" (D-021 persona ladder: Hindi and voice only, no typing)

Contract B17 + D-021 (persona ladder, T-028 not yet materialized into `qa/adapter.json` — this
persona was named explicitly in the coordinator's cycle-1 dispatch, walked from the D-021 decision
text since the adapter's structured `personas` array does not exist yet). Walked live via
Playwright against `next dev` (localhost:3211, demo mode), checker's own browser session — same
run as `qa/evidence/browser-t-021-provider-failover-c1-2026-09-26-checker/report.json`.

**Scope note (important for judging severity):** `apps/web` is explicitly VC's reference/test UI,
never the production UI a counsellor like gaurav-bhaiya would actually use — D-021/B21: "The
production UI is the client's [Pathlynks]; apps/web stays VC's reference and test UI." A Hindi
voice-over already covers his one documented human-facing touchpoint today (D-021: "the release
video goes to Sapna ma'am and Gaurav bhaiya with a Hindi voice-over"). So this walk judges the
MECHANISM (does the failover/apology/retry pattern work for someone who cannot type and reads no
English), not whether `apps/web` itself is his production surface — it is not, by design.

| Screen | What they tried | What blocked/confused them | Severity |
|---|---|---|---|
| New session (`/sessions/new`) | Complete the flow with NO typing at all | This specific flow needs zero typing today — it is a pre-filled synthetic submission with only a Submit button and (on failure) a Retry button, both single-tap actions. Gaurav-bhaiya's "no typing" constraint is not violated by this screen's interaction model. | n/a for this screen's interaction model |
| Every screen's text | Understand "New session" / "What was said" / "Submit for scribe review" / "AI is unavailable right now" / "Sorry for the trouble" / "Retry" | All English-only, no Hindi, no voice/audio affordance. A Hindi-and-voice-only user cannot read any of it unaided. This is a real, blocking usability gap FOR A HINDI-ONLY READER — but it is not introduced by T-021, is not specific to the failover feature, and is not `apps/web`'s job to fix (see scope note above: this reference UI is not his production surface; Pathlynks's own UI, which VC does not build, is). Recorded for completeness, not filed as a new issue against T-021. | high-if-this-were-his-production-UI, but out of this unit's (and this app's) scope by architecture decision (B21) |
| The apology + Retry mechanism itself, considered language-agnostically | Judge whether the PATTERN (short wait, one clear apology, one Retry that doesn't lose input, no jargon/model names) would translate/voice cleanly into Hindi | The pattern is simple enough to translate or voice directly: three short phrases + one action, no branching logic, no technical vocabulary to localize awkwardly. The cycle-1 shortened worst-case wait (~45-50s instead of an unbounded ~5.4 min) is a strict improvement for ANY persona, including one on a live voice call who cannot silently wait through a multi-minute hang. | n/a (positive finding) |

**Cycle-1 outcome:** no high-severity finding is filed against T-021 for this persona. The
language/typing gap is a pre-existing, product-architecture-level fact (apps/web is reference-only;
B21 assigns the production UI to Pathlynks), not a defect this unit introduced or could fix, and is
recorded here for visibility rather than as a blocking issue.
