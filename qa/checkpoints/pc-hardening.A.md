# Checkpoint - pc-hardening coordinator A (cycle 0)
- 15:48 read manifest, diff 350b4eb..ca1d0a2 (api src, widget src, scripts, docs, tests); merge-base HEAD 350b4eb = 350b4eb verified.
- 15:49-15:53 regression set via vc-testlock on the worktree (head e62395b): partners 66/0, partner-voice 36/0, partner-openapi 15/0, voice 67/0, voice-limits 10/0, voice-wiring 16/0, auth 15/0, server 34/0, index 8/0, main 10/0, chat 34 pass/1 fail (A20 baseline), anonymous-route H2|H6|G5|K2|K4 9/0, tsc --noEmit exit 0, widget node --test apps/widget/tests/*.test.js 61/0.
- 15:51-15:56 hostile suites in a scratchpad copy of ca1d0a2 (offline install): hostile-pv (5 tests), hostile-partners (3), widget hostile with a fake DOM mounting the real widget (5): all green.
- mutations (one per criterion, copy restored after each, unmutated green again): H1 x1, H2 x1, H3 server x1, H3 widget x4, H4 x1, H5 x1, H6 x1: all red.
- Verdict: qa/verdicts/pc-hardening.A.md.
