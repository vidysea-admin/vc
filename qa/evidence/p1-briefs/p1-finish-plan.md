# P1 finish plan: U7, eng3, U9, U8 (+ testlock), written 2026-10-18T03:45:19+05:30
Standing rule (D-096): each unit is pushed the moment it has its checker PASS, a green 6c and push-gate exit 0. No per-push question.

| Unit | Now | Next steps, in order | Done when |
|---|---|---|---|
| U7 anon text | checker B PASS (ede16bb); checker A running | 1. A's verdict. 2. Both PASS: mint ISS rows from P1-P5 + review M1/L1 to Candidates. 3. Merge p1/u7 onto origin/main, 6c check, push-gate, push. Either FAIL: one repair round with the union of the failures, re-check, then the same steps. | pushed, manifest checked-PASS |
| eng3 crisis leftovers (based on U7) | code written, builder running its tests | 1. Builder commits + manifest. 2. One checker + senior review in one message. 3. PASS: merge after U7 (same 6c run when possible), push. | pushed after U7 |
| U9 live voice | cycle-1 repair checker running; review: R1 + R2 crisis-audio leaks | 1. Repair verdict. 2. Cycle 2 (Opus builder): fix R1 (toolCall must not clear crisis state), R2 per D-096 (mute until the next student speech; only helpline audio), the checker's failures if any, a test for each, and the 3 lows. 3. Repair checker + review. 4. PASS: merge, 6c, push. A cycle-2 FAIL = STALLED, handed to Umesh with the evidence. | pushed |
| U8 chat API | builder running (auth -> dual check) | 1. Builder ready. 2. Two blind checkers + review in one message; also check U9's new LiveConfigError against U8's callers. 3. Both PASS: merge, 6c (full suite, auth = .13-2), push. | pushed |
| testlock 2 slots (D-096) | builder dispatched | 1. Builder ready. 2. One checker. 3. PASS: merge, push; every later test run uses 2 slots. | pushed |

After these: U6b + U11 (need U8), U10 (needs U8 + U9), U12 (needs everything). U3/U13a wait on the KB keys + rubric. Go-live waits on G-PROD, G-REAL, B13 legal, A20 (Umesh).
