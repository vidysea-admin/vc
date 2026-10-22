# pc-hardening-3: checker coordinator A (blind dual check), cycle 0

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
VERDICT: PASS
CHECK-PLAN: Tier L, dual-trigger tenancy apps/api/src/auth.ts:435-446. Read the whole diff fa1d1aa..66d6d7d; executed hostile variants of K1 through a real startApi (chat, profile, turn, voice session), parsed the nginx conf myself, re-ran K3/K4, falsified each criterion in a copy, ran the full regression list, and checked the two known reds against base fa1d1aa.
CHECKED-STATE: worktree D:/vc/.worktrees/pc-hardening-3, head cf8ab0d (code 66d6d7d); git status clean of product changes before and after. Written 2026-10-22T18:32+05:30 (read from `date -Iseconds`).

## Result per criterion
- K1 PASS. A student JWT whose tenant folds (NFKC + lower case) to an existing partner id (any status) gets a response byte-identical to the garbage-token 401 on chat thread create, profile, turn and voice session, with nothing written; covers exact, upper, mixed, full-width, and trailing space/dot/newline/NUL/zero-width variants (the JWT tenant pattern stops the non-foldable ones earlier, same 401). The bound pair's exact id is allowed; its upper-case or full-width look-alike is refused. Unrelated tenants allowed. Unreadable store: uniform 401 (fail closed), recovers next window. Every student-JWT verify site (chat.ts:858, voice.ts:1737) goes through the wrapped verifier, injected or default; the counsellor verifier (server.ts:680) is a separate identity space. Falsified three ways (no wiring, no fold, fail-open), all red.
- K2 PASS. Both voice stream locations: limit_req zone=vcchat burst=10 nodelay + 429, one location-level access_log with format vc_voice_stream (no $request, $request_uri, $args, $query_string, Sec-WebSocket-Protocol, Authorization, Cookie, X-VC-Key; logs $uri); no other location lost limit_req or logging versus base. Falsified (limit_req removed; $request_uri in the format), red.
- K3 PASS. Approver only in the passed env: allowed; only in process.env with a passed env lacking it (or blank): refused; no env passed: process.env; explicit approver decides; nothing anywhere: refused. Falsified two ways, red.
- K4 PASS. The widget test pins helpHi === approved gloss + " · " + approved 112 clause cut from lang.ts; the shortened-fragment mutant is red. HELP_HI, lang.ts, crisis path, anonymous.ts, chat.ts unchanged vs base; LK10 wording and anonymous zero persistence untouched.
- Regression PASS apart from the two known baseline reds (see Metrics).

## Metrics
partners 72/72, partner-voice 40/40, partner-openapi 15/15, voice 67/67, voice-limits 10/10, voice-wiring 16/16, auth 15/15, student-auth 11/11, server 34/34, index 9/9, main 10/10, go-live-gate 21 pass 0 fail 1 skipped, chat-privacy 39/39, anonymous-route H2|H6|G5|K2|K4 9/9, widget 65/65, tsc exit 0. chat.test.ts 34/35 and chat-profile.test.ts 47/48: the one failure in each ("A20 flag on but gate closed"; "flag on with the real repo gates refuses to start, BEFORE connecting to Mongo") ALSO fails on base fa1d1aa (copy of the base tree, same qa/gates): baseline. My hostile-A probe 6/6. Mutants: 10 run, 10 red, all restored.

## Residual observations (not FAIL)
- PROPOSED-ISSUE: assertChatGoLive (chat.ts:277) passes route.approver to assertGoLive without the passed env, so it still falls back to process.env for the approver: the same defect K3 fixed for voice (the builder noted it too).
- PROPOSED-ISSUE: chat-profile.test.ts "flag on with the real repo gates refuses..." and chat.test.ts A20 are stale against the current qa/gates (baseline); the chat-profile one also leaves a server open so the process only ends on the timeout (exit 124).
- Accepted residual: a partner added within the 60 s registry window is not refused as a student tenant until the window ends (same window as its own key); a registry outage is a student-route outage by design; nginx's error log prints the request line on a limit_req rejection (not fixable in config); `nginx -t` not run (no nginx started).
