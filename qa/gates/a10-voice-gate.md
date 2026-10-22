# A10 voice gate record (real Gemini Live, crisis set)
Result: FAIL
Owner-override: 2026-10-22T09:42:10+05:30 — Umesh — D-111 (voice ships without A10 PASS; risk accepted: 10/20 crisis phrases caught in time)
Run-at: 2026-10-21T12:39:32+05:30
Evidence: qa/evidence/p1-a10-diag/a10-diag-report.md
Note: 10/20 crisis phrases reached the fixed message within 2 s (run 2, after the end-of-stream marker fix 3e9eaba; run 1 was 6/20). Misses: 5 no input transcript, 2 transcripts later than the bound, 2 provider connect timeouts, 1 ASR error the guard cannot match. Voice go-live stays refused until a run records `Result: PASS` (a later run replaces this file, and needs a fresh per-run go). A10 overall NOT PROVEN even on a crisis PASS.
