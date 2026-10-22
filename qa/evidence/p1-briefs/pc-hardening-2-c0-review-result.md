# Review result: pc-hardening-2 cycle 0 (senior-software-engineer, read-only)
Verdict: Approve. widget voice.test 38/0; partners J4|J5|K1 16/0; partner-voice J2|J3 2/0 (ran outside vc-testlock: process slip, harmless). Mutants not re-run by the reviewer.
- low: apps/api/src/index.ts:539 the server's default PartnerStore wrapper drops the new expect argument of update (only revoke uses it server-side today; rotate runs via the CLI Mongo store). Forward expect.
- low: apps/widget/src/vc-widget.js:126 Hindi helpline wording (आपातकाल) is new; engine Hindi crisis text says '112 पर फ़ोन करें'; lang.ts:60 Hindi still pending clinical safety owner sign-off.
Confirmed: CAS filter {_id, keys.<scope>.hash} / $exists:false correct on real Mongo shape, matchedCount test; K1 (c1) change is a strictly stronger replacement; voice_unavailable only after key/Origin/rate checks; CLI failure line prints name/code only.
REVIEW pc-hardening-2-c0 Approve
