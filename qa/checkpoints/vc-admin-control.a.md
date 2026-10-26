# Checkpoint: vc-admin-control checker A
- Cycle checked: 0; head 914a61d; verdict FAIL; written 2026-10-27T00:05:28+05:30
- Done: hostile probes T1-T8 (probe test copied to qa/evidence/vc-admin-20261026/checker-a/), admin UI walk per role + 360px, widget walk (toggle not walked), falsifications F1-F5 (5/5 killed), diff-scope read.
- Findings: P1 and P2 (critical, source create/live-port hijack), P3 (medium, dashboard to-exclusive). Details in qa/verdicts/vc-admin-control.md.
- Not re-run: VA2, VA3, VA7, VA9, VA10, VA11, VA14, VA15, VA16, I1-I5, I7. Servers on 4520/4521/5191 stopped.
- Resume: a cycle-1 check should re-run P1/P2 probes (T6, T8) first, then the dashboard window, then the not-re-run list.
