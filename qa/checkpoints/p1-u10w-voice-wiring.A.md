# Checkpoint p1-u10w-voice-wiring A (cycle 1): COMPLETE, FAIL (W5 only)
Checker A, blind dual check, Mode A, tier L. Bound tree D:/vc/.worktrees/p1-u10w, branch p1/u10w, source head 0c2b981 (7ce9aba adds only coordinator B's qa files; src and tests byte-identical, verified by git diff --name-only 0c2b981 HEAD).
Done: baselines (api voice+chat 132/132, db 101/101, providers live 70/70, importers 78/78, typecheck exit 0); 12 hostile probes (chkA.test.ts, 12/12 at head); 17 isolated-copy falsifications, all killed green-before/red-after; scratch copies removed.
Open: none for A. Finding: W5 padded flag value (" true ") turns voice ON; manifest W5 says not exactly "true" = off.
Evidence: qa/evidence/p1-u10w-A-c1/ (written 2026-10-19T08:50:06+05:30).
