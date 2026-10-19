# Verdict: p1-iss303-authcap
**Verdict:** PASS
**Cycle checked:** 0
**Tier:** M (authenticated chat route, crisis safety path). One checker; Dual check: no per manifest. Policy: proportional-verification/2026-10-19.16
**Base:** c1027c9 **Head checked:** be8d547 (code 0dc9d52; the manifest commit adds no product file)
Metrics: end=2026-10-19T15:29:00+05:30 mutations=5 hostile_probes=60+ cycle=0 policy=proportional-verification/2026-10-19.16 lane=normal

## Why PASS (read first)
CAP, HELPLINE, CRISIS, RATE and REG all hold on the bound head, proven through a real node:http server (createApiServer wrapping the real chat handler via withChatRoutes), real JWTs, and raw TCP sockets for hostile framing, not the builder's in-process helper. Every positive and negative outcome in the brief matched. One low pre-existing finding (ISS-350) and one informational transport note; neither is caused by this unit.

## Reruns on the bound head (through VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh, TMP/TEMP on D:; builder evidence not reused)
- REG: pnpm -C apps/api exec tsx --test chat chat-privacy chat-profile chat-rank student-openapi anonymous-route -> tests 112, pass 112, fail 0, cancelled 0, skipped 0. The anonymous-route file is green, so the anonymous route is unchanged in behaviour. qa/evidence/p1-iss303/check/rerun-reg-112.txt
- pnpm -r typecheck -> exit 0. qa/evidence/p1-iss303/check/typecheck.txt
- Scope: git diff c1027c9 0dc9d52 = apps/api/src/chat.ts, apps/api/src/openapi.ts, apps/api/tests/chat.test.ts only. No .claude/**, no packages/*, no anonymous.ts.

## Outcome checks (HTTP; checker's own probe qa/evidence/p1-iss303/check/chk-iss303-http.test.ts.txt, run in the detached copy .worktrees/p1-iss303-chk at 0dc9d52)
- Exactly 64 KiB (65536 bytes) body, crisis phrase at start / middle / end, English ("I want to kill myself."), Hinglish ("mujhe marne ka mann hai.") and Devanagari: 9/9 -> 200, state escalated, message carries 14416. Benign exactly 64 KiB -> 400 invalid_request, no helpline, no escalation text.
- 64 KiB + 1, +2, 100 KiB, 300 KiB, 2 MiB x 3 languages x 3 positions: 413 body_too_large carrying the Tele-MANAS line (TELE_MANAS_LINE) every time; provider calls 0, chat_turns 0, student_flags 0, escalations 0.
- Over the 4000-char turn limit but inside the cap (5, 20, 50 KiB x 3 languages x 3 positions): escalated. Benign 20 KiB: plain 400, no flag.
- Rate-limited student (60 GETs first): plain message 429; crisis short (3 languages) and crisis long (10 KiB and 64 KiB x 3 languages x 3 positions) all escalated; rate-limited + 64 KiB+1 -> 413 with helpline.
- Multibyte: Devanagari (3-byte) bodies at 65534..65539 bytes: <= 65536 escalated, >= 65537 413 with helpline; astral 4-byte filler at 65536 / 65537 same split; TCP split mid-character; chunked transfer with 4-byte chunks at 65536 (200) / 65537 (413). The cap is counted in bytes, not characters. A 65536-byte body ending in an invalid UTF-8 tail is 413 (replacement-char expansion pushes it over the cap; fail-closed, with the helpline).
- Framing: chunked with no content-length: 65536 -> 200 escalated, 65537 and 300 KiB -> 413 with helpline. Content-length lying high (10 MiB declared, CAP+5000 bytes sent) -> 413 with helpline at the cap (streaming reject, no wait for the declared length). Honest content-length cap+10 -> 413 with helpline. Content-length lying low (100 on a 50 KiB crisis body) -> 400 invalid_request (the server sees truncated JSON; a client must forge this to hurt itself). Content-length low with a valid short crisis JSON then junk: the server's HTTP parser rejects the junk and closes before the first reply is flushed (no response); a client must forge this. Content-length high with fewer bytes sent: the server waits (no reply within 2.5 s); pre-existing, unrelated to this unit.
- Crisis text in a non-message field with benign text (clientTurnId, extra key): 400 invalid_request, not escalated (only text is scanned, by design). Array/object text and array body: 400. Duplicate key crisis-then-benign: JSON.parse takes the last (benign), 200 ok, consistent with what the engine sees.
- Scan count (instrumented copy, crisisGuard call-site log): handleTurn scans exactly once on every turn that reaches it (benign short, crisis short, crisis 50 KiB, benign over-long 400, rate-limited crisis 50 KiB: 1 each); 0 on the 413. The engine graph then runs its own scans (salvageCrisisInput once on the full text plus 12-26 crisisWindow scans of <= 4000 chars for a 50 KiB crisis turn). The engine is unchanged by this unit, and that is the ISS-300 residual, not new. The manifest claim "one scan instead of two" is true at the route (handleTurn); it is not a claim about the whole turn.

## Falsification (one per criterion, in the detached copy; each edit reverted with git checkout; baseline 9/9 on the probe except the 2 MiB transport row below)
| id | crit | edit to apps/api/src/chat.ts | result |
|---|---|---|---|
| M1 | CAP | 64 KiB -> 256 KiB | probe fails CHK1, CHK2, CHK4, CHK5, CHK6 (5 fail) |
| M2 | HELPLINE | opts.helpline ? respond(413...) -> false ? | CHK2, CHK4, CHK5, CHK6 fail (4 fail) |
| M3 | CRISIS | over-long exception: overlong && level === "none" -> overlong | CHK1, CHK3, CHK4, CHK5, CHK6 fail (5 fail) |
| M4 | RATE | if (!crisis) -> if (true) | CHK4 fails (1 fail) |
| M5 | scan once | second crisisGuard(text) added in handleTurn | CHK8 fails: "benign short: handleTurn scans once" |
Logs: qa/evidence/p1-iss303/check/mut-*.txt.

## Findings
- ISS-350 (low, pre-existing, NOT caused by this unit, not blocking): a turn whose text is a crisis phrase but whose body also has an unknown key, or an invalid clientTurnId (illegal chars, > 128 chars, wrong type), is a 400 invalid_request with no crisis answer and no helpline. handleTurn computes the crisis level before TurnRequestSchema.safeParse, but the strict-schema and PATH_ID_PATTERN refusals return first (chat.ts, handleTurn). The official client does not send these; a hand-crafted or buggy client would lose the safety net. Unchanged from c1027c9 (the diff only moved the level computation up).
- Informational (transport, not a defect of this change): a raw Connection: close client that keeps pushing 2 MiB after the server has already answered 413 loses the response about 4 in 30 times (TCP reset); 0 in 30 at 70 KiB, 100 KiB, 300 KiB and 1.1 MiB, and 8/8 with fetch (keep-alive) at 100 KiB, 300 KiB and 2 MiB. This is why the probe's CHK2 2 MiB row is intermittent (it passed on some runs and failed on others); the 413 + helpline is deterministic up to 1.1 MiB. A chat message is capped at 4000 characters, so a multi-MiB upload is not a real student path.
- Changed by design, for Umesh (already stated in the manifest): a body of 64-256 KiB used to be scanned and answered; it is now a 413 with the helpline.
- The fresh-context senior-software-engineer review of the diff is the caller's to dispatch (manifest, not-done list); it is not part of this verdict.

## Evidence
qa/evidence/p1-iss303/check/: chk-iss303-http.test.ts.txt (probe source), probe-full-run.txt, probe-run-1.txt, instrumentation-crisis-counter.diff (the call-site counter, used in the throwaway copy only), mut-M1cap.txt, mut-M2helpline.txt, mut-M3crisisOverlong.txt, mut-M4ratecrisis.txt, mut-M5scanTwice.txt, rerun-reg-112.txt, typecheck.txt.
