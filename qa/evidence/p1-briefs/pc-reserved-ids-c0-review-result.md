# Review result: pc-reserved-ids cycle 0 (senior-software-engineer, read-only)
Verdict: Warning. Key-auth coverage, uniform 401, CORS exclusion, env parsing and the NFKC fold are sound. R1|R2 run: 7/7 pass.
- medium: index.ts:530-532, .env.example:131-133, partners.ts:75-76 — empty VC_RESERVED_TENANT_IDS leaves real student-JWT tenants unprotected, silently; no startup/CLI warning; docs section 4 does not say empty = built-ins only.
- low: index.ts:532 malformed list throws at startup even when partners are disabled (pepper unset).
- low: partners.ts:65-71,:484 fold recomputed per request (negligible).
- low: rotate on a legacy reserved-id partner mints a key that can never authenticate, with no operator warning.
- open: reverse direction (a JWT tenant claim equal to a partner id); KNOWN_TENANT_IDS hand-copied from seed/evals with no test tie.
REVIEW pc-reserved-ids-c0 Warning
