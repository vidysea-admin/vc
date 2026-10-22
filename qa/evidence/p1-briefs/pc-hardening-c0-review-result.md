# Review result: pc-hardening cycle 0 (senior-software-engineer, read-only)
Verdict: Approve. diff --stat equals diff -w --stat (12 files, +377/-29; no whitespace noise). widget voice.test 35/0; partners + partner-voice 102/0 (ran outside vc-testlock: process slip, harmless).
- low: voice.ts ~:157 a negative cap now falls back to the default (2/50) instead of clamping to 0; operators meaning off must set 0. Doc note suggested.
- low: cap 0 returns voice_busy at mint, so a deliberately closed config shows the busy note (cosmetic).
Confirmed: mint pre-check after page-key/Origin/rate checks; identical 429 for both caps; the 3 changed partner-voice tests are equivalent, not weakened; HELP/crisis text unchanged; guard and isReservedPartnerId share foldId; --check uses reservedPartnerIdReason, exit 1 on flagged active, usage 2, no key material.
REVIEW pc-hardening-c0 Approve
