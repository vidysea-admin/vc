# Verdict - pc-partner-keys (checker B, blind second check)
Cycle checked: 0
Checked state: wave/pc-partner-keys, code cfb70c3. Result: **FAIL** (1 blocking defect, K1).
TIER: L - authentication / API-key issuance; partners.ts:381 (CLI rotate path) and the whole of partners.ts. Dual check.

## Check plan
Run tsc and the builder's 42; run the named anonymous/profile/privacy invariants; write hostile variants the builder did not (outside the tree); one falsification per K1-K5 in a copy; read the rotate/revoke write path for races.

## Blocking defect
- **K1 (rotate): two overlapping rotates of the two scopes of one partner lose an update, and a rotated-out key comes back to life.** `rotatePartner` (apps/api/src/partners.ts:286-300) reads the whole partner, builds `keys = {...existing.keys, [scope]: record}` and writes `$set: {keys}` (store.update, line 154) which replaces the whole `keys` object. Two rotates that both read before either writes (two operators, or two CLI processes) end with the second writer's stale copy of the other scope. Executed (qa/evidence/pc-partner-keys-b/hostile-B-race.test.mts, race.out.txt): rotate pub and rotate srv in parallel -> the printed NEW page key does not authenticate, the OLD page key (the one being rotated away, perhaps because it leaked) authenticates again; the srv rotation took effect. Contract K1: "rotate invalidates the old key immediately". This is outcome-level: ops sees two success lines and a revived old key. The builder's sequential rotate test passes because it never overlaps writes.
- Suggested fix (maker decides): write `$set: {"keys.pub": record}` (dotted path, atomic per scope) or a conditional update on the old hash; add an overlapping-rotate test.

## Criteria (executed)
- K1: sequential add/rotate/revoke/list OK (42/42, plus H1 malformed keys: extra underscores, unicode, 10 KB header, uniform 401). Raw key absent from Mongo docs, logs, listings, CLI output across a battery (H6). Falsification: rotate drops the other scope's key (mutant: `keys = {...existing.keys}`) -> test K1 rotating red. **Fails on the concurrent rotate above.**
- K2: pub key on the public route; srv key or pub key outside scope gets the uniform 401 (H2); no-key and REQUIRED=true behave as specified; cache bound at 60 s incl. clock going backwards, store outage then recovery, coalesced reads (H3); timing: equal cost for unknown id / wrong secret / wrong scope / revoked (H7, statistical, 6000 samples; timingSafeEqual with dummy hash, partners.ts); revoke within 60 s. Falsification: drop the status check -> K2 revoked-while-open red.
- K3: srv key on student routes; tenant = partnerId; cross-partner student gives 404 for thread, history and profile (H2); missing/garbage/repeated/unicode age -> minor, consent only exact "true", no model call (H5). Falsification: tenant fixed to a shared id -> K3 cross-partner red.
- K4: look-alike origins (vidysea.com.evil.io, http vs https, trailing slash, other port, null), preflight from an unlisted origin -> 204 without CORS headers, never *, no CORS on student/voice routes (H4, H4b). Falsification: startsWith match -> K4 preflight red on the look-alike.
- K5: openapi route serves PARTNER_OPENAPI (green); nginx static assertions green (no nginx binary; no live check). Falsification: route disabled -> K5 red. Accepted deviation: voice session route not CORS-eligible.
- I1-I4: crisisGuard/LK10, D-110, zero persistence, grounding: anonymous "H2|H6|G5" 9/9, chat-profile 6/6, chat-privacy 39/39. Existing JWT paths: K3 builder test "student JWT keeps working" green.
- Large-header robustness through real HTTP (10 KB X-VC-Key, 10 KB Authorization, 20 KB header): server stays up (H8).

## Not verified
Real Mongo (duplicate-key 11000 path, whether $set on a dotted path behaves), real nginx, live multi-process CLI race (reproduced with an injected read barrier on the real store code), and a real browser.

## PROPOSED-ISSUE (proposals only; no issues.jsonl rows)
- PROPOSED-ISSUE pck-B1 (high, blocking): rotate lost update, as above (partners.ts:286-300).
- PROPOSED-ISSUE pck-B2 (low): voice session/stream routes are still JWT-only; pc-voice V2 owns them.
- PROPOSED-ISSUE pck-B3 (low): no check that a new partner id does not collide with an existing JWT or sandbox tenant id.
- PROPOSED-ISSUE pck-B4 (low): a page key with no Origin header is accepted on the public route (browser-side control only; server callers should use the srv key route).
- PROPOSED-ISSUE pck-B5 (low): nginx limit_req is per IP, so a partner backend's traffic shares one bucket.
- PROPOSED-ISSUE pck-B6 (info): the builder's recorded --test-name-pattern after the file does not filter under npx/cmd in this environment; "9 passed" reproduced only with the pattern before the file.
- full-suite trigger: .13-2(a) tier L security/auth unit (for the maker's 6c step).

Metrics: start=2026-10-22T07:59:25+05:30 end=2026-10-22T08:19:14+05:30 wall_min=21 blocked_min=1 mutations=5 suite_runs=0 repeat_runs=0 mutants=0 defects_unit=1 check_s=1260
