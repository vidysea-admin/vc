# Review result: pc-hardening-3 c0 — Warning (senior-software-engineer, read-only)
- medium index.ts:568,646: guard installed only when VC_PARTNER_KEY_PEPPER is set (partners off = no guard); document or log.
- medium index.ts:522: counsellor/admin createJwtVerifier not wrapped; K1 scope is student JWT; decide (wrap or record IdP trust).
- low partners.ts:146,659: 60 s partner cache window (known).
- low auth.ts:441-445: store outage on claim check gives 401 not 503 (fail-closed, no leak).
- low partners.test.ts K2 SECRET_VARS misses $request_body, $cookie_*, $http_*.
- low nginx-vc.conf:14: error_log on limit_req and fallback locations still log the request line (no token in URL by design).
- note chat.ts:278 assertChatGoLive has the same env bug K3 fixed in voice.
Checks OK: fold parity, exact bound pair, fail-closed uniform 401, all student routes wrapped, log_format context valid.
REVIEW pc-hardening-3-c0 Warning
