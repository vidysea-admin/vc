# Checkpoint - pc-reserved-ids-2 coordinator A (cycle 0)
- 14:53 read manifest, diff eb2c132..eaeab58 (src, script, docs, .env.example).
- Scope claim traced in chat.ts, voice.ts, anonymous.ts, server.ts, packages/db tenant.ts.
- Regression set run via vc-testlock (clean re-run 14:58): partners 63/0, partner-voice 32/0, partner-openapi 15/0, auth 15/0, server 34/0, index 8/0, main 10/0, chat 34/1 (A20 baseline), anonymous-route 9/0, tsc exit 0.
- Hostile suite (scratchpad copy, tests/zz-hostile-a.test.ts, 8 tests): green 8/0.
- Mutations M1a M1b M2a M2b M3 M4 M5: all red; restored; green 8/0 after.
- Verdict: qa/verdicts/pc-reserved-ids-2.A.md PASS.
