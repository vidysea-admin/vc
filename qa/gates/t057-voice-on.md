# Gate: T-057 local demo, voice on (A20 voice go-live record)
Opened: 2026-10-29
Question: enable voice (VC_VOICE_ENABLED=true) for the local T-057 demo, paid Gemini Live on TEST users only?
Evidence: qa/evidence/t057/voice-start-diag.md (mint 404 because voice was off); qa/evidence/t057/voice-on.md (enablement proof).
Links: G2 in qa/gates/vc-admin-control.md (paid Live allowed on TEST users, no cost cap); D-111 (A10 owner override, qa/gates/a10-voice-gate.md Owner-override line); D-122 (live-data gate, T-057 = local demo).
Scope: local demo only; TEST users only. No production enablement, no real student voice.
Note: `evaluateGoLive(qa/gates, "voice")` already returns ALLOWED from the existing records (B13 D-109, g-publish b, g-prod c, Nights tele-manas-disclosed, A10 override D-111). This file records the 2026-10-29 enablement approval only; it adds no signature that the gate parser reads.
Answered: 2026-10-29 - voice on - Umesh, 2026-10-29: "voice on krr" (chat; relayed in qa/.delivery/briefs/t057-voice-on.md)
