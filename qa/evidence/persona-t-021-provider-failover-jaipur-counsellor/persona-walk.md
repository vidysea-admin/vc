# Persona walk — T-021 provider failover, "average counsellor, tier-2 city (Jaipur), 1-2 years' experience"

Contract B17. Walked live via Playwright against `next dev` (localhost:3108, demo mode), same run as
the Mode D evidence in `qa/evidence/browser-t-021-provider-failover-2026-09-26-checker/`.

| Screen | What they tried | What blocked/confused them | Severity |
|---|---|---|---|
| Home (`/`) | Look for a way to start a new counselling session, not just open an old one | None — "Start a new session" reads as plain, obvious text | n/a |
| New session (`/sessions/new`) | Read the screen to understand what they're about to submit | The table header reads **"Turn" / "Proposed value"** over what is actually the raw spoken conversation (student/counsellor lines), not a proposed fact. Everywhere else in this same product ("Proposed profile changes" on the approval screen) "Proposed value" means a fact the AI is asking them to approve. Reusing that exact label for plain transcript text is a real label mismatch a first-year counsellor would notice and could pause on ("proposed value of what?") — but the "Turn" column and the obviously conversational text still let them work out it's just the conversation. Did not block completion. | medium |
| New session, all-fail submit | Understand why nothing happened after clicking Submit | Banner "AI is unavailable right now / Sorry for the trouble / Nothing you typed is lost" is short, plain Hinglish-compatible English, no jargon, no error code visible on screen. Read as intended immediately. | n/a |
| New session, Retry | Trust that clicking Retry won't make them redo the form | The 5 transcript rows stayed visible and unchanged the whole time (verified byte-identical POST body), so nothing suggested re-entry was needed. Clear. | n/a |
| Approval screen (post-retry) | Confirm the session actually went through | "Session submitted" + a working link to the approval screen with the extracted facts (targetCountry, intendedMajor, preferredIntake, budget) landed correctly. Clear outcome. | n/a |

**Finding filed:** `colValue` label ("Proposed value") is reused from the approval screen for the new-session
transcript table, where the content is not a proposed fact but the raw conversation. Confusing, not
blocking — the counsellor still completes the flow unaided. Ledger issue below (medium, not high, so it
does not block PASS per B17).
