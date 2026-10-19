# Verdict (coordinator B, blind) - p1-iss135-anon-crisis-budget
Result: PASS
Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.16
Checked head: 6539cc88e7a4e7400c2853d0b092d537c7a4110e (code 6f025b6, base 8efd936). Checked in the bound tree read-only; hostile probe and mutants in the separate copy D:/vc/.worktrees/p1-iss135-chkB-fals (detached at 6539cc8, mutants reverted with git checkout, tree clean afterwards).
Evidence dir: qa/evidence/p1-iss135-chkB/ (api-full.txt, probe-baseline.txt, fals-B1..B4, typecheck-api.txt, scan-timing.txt, zz-chkB-probe.test.ts.txt)

## Check plan
Tier L, dual-trigger security apps/api/src/anonymous.ts (read). Plan: (1) whole apps/api suite once; (2) diff read, product diff is one constant, its comment and one OpenAPI string; (3) hostile probe over a real node:http server with a raw TCP client; (4) one named mutant per criterion in my own copy.

## Evidence (run by me; tests through scripts/vc-testlock.sh)
- `pnpm -C apps/api test` (whole api package): tests 338 pass 338 fail 0 (api-full.txt).
- `pnpm -C apps/api typecheck`: exit 0.
- Hostile probe (8 tests, 0 fail on the unmutated head; probe-baseline.txt): real createApiServer + withAnonymousRoutes, raw sockets.
  - Exact bytes, ASCII, crisis phrase at the end: 65535 and 65536 bytes escalate (200, 14416, one crisis counter write); 65537, 65538, 100 KiB, 300 KiB, 2 MiB are 413 body_too_large with the 14416 helpline and zero model calls, zero KB calls, zero counter writes.
  - Multibyte: 3-byte and 4-byte padding, last char ending exactly at the cap = escalates; the same with the last char straddling the cap (65537) = 413; 30000 three-byte characters (fewer characters than the cap, 90000 bytes) = 413 (a character-count gate would pass it); a within-cap body split by TCP inside a multibyte character still decodes and escalates.
  - Content-Length lies: declared 10 or 65536 with 100/300 KiB streamed gives no scan and no side effect (the surplus is not a body; the socket is reset, client saw ECONNRESET, which is a harness-visible detail, not a leak); declared larger than actual with an over-cap real body = 413 + helpline; whitespace padding after a valid crisis JSON past the cap = 413 (the cap counts real bytes, not the header or the parsed JSON).
  - Chunked with no Content-Length: 100 KiB in 7919-byte chunks, cap+1 across two chunks, and one 2 MiB chunk = 413 + helpline, nothing written; exactly 65536 in chunks = escalates.
  - gzip (Content-Encoding: gzip): a 5 MiB body that compresses under the cap, and a compressed crisis message, are not decoded: 400 invalid_request, no scan, no counter, no model, no KB (no decompression-bomb path).
  - Limiter order over real HTTP, limit 1: the client is at 429 on a generic question; crisis bodies of 50 KiB, 65535 and 65536 bytes still return 200 escalated with 14416 and no model call (B24.7); an over-cap body from that client is 413 (not 429, not scanned, no counter); five over-cap requests do not spend the limiter budget (a following generic question is still 200).
- Authenticated route: git diff 8efd936..6539cc8 touches only anonymous.ts, openapi.ts, the zero-persistence test and the manifest/evidence; chat.ts is not in the diff; MAX_CHAT_BODY_BYTES is still 256 * 1024 (probe P0).
- OpenAPI: openapi.ts:613 says "Body larger than 64 KiB"; no other 256 KiB reference remains for the anonymous route (grep of apps, docs, qa/contracts, ARCHITECTURE.md; the only remaining hits are the historical note in the anonymous.ts comment and chat.ts's own constant).

## Criteria (one falsification each, in my copy, restored; baseline green)
- CAP MET - mutant B1 (byte gate replaced by a character-count gate and the readBody ceiling widened to the default 1 MiB) red: P2 and P3 fail by assertion. Mutant B3 (cap 64 KiB - 1) red: P0 and P4 fail. Baseline 8/8.
- CRISIS MET - mutant B2 (`crisisGuard(text).level === "none"` replaced by `true`, limiter before crisis) red: P6 fails by assertion (a client at 429 gets the 429, not the escalation).
- REG MET (helpline on every 413; order; typed validation) - mutant B4 (both 413 sites answer `respond(413, {error})`) red: 4 of 8 probe tests fail. The existing validation, crisis and "U7 repair A" tests are inside the 338/338 run.

## Judged
- The builder-stated limit "CPU claim is by construction, not measured at 64 KiB" is ACCEPTED as a limit, not a defect. I measured once (scan-timing.txt, cold single samples, shared machine): crisisGuard on about 64 KiB takes 23 ms (letter-spaced near-miss), 39 ms (ASCII), 105 ms (mixed Devanagari/emoji). So the per-request worst case is lower than the 256 KiB figure but not 4x lower in this sample, and it remains unlimited per client by contract B24.7.
- No code, test, contract, DECISIONS or .claude change by me; probe file lives only in my copy and is kept as .txt evidence.

PROPOSED-ISSUE: {"id":"P1","sev":"low","type":"security","title":"crisis scan up to 64 KiB still runs before the limiter, about 25-105 ms CPU per max-size request, unlimited per client","evidence":"qa/evidence/p1-iss135-chkB/scan-timing.txt (cold single samples under shared load)","direction":"B24.7 mandates the order; a per-client byte or crisis-volume budget, a bounded scan slice for a client already over budget, or an edge request limit in the deployment. Umesh's call (it changes B24.7); ISS-135's cap reduces but does not remove the cost"}
