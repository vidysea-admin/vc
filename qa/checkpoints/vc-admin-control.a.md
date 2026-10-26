# Checkpoint: vc-admin-control checker A
- Cycle checked: 0; head 914a61d; verdict FAIL; written 2026-10-27T00:05:28+05:30
- Done: hostile probes T1-T8 (probe test copied to qa/evidence/vc-admin-20261026/checker-a/), admin UI walk per role + 360px, widget walk (toggle not walked), falsifications F1-F5 (5/5 killed), diff-scope read.
- Findings: P1 and P2 (critical, source create/live-port hijack), P3 (medium, dashboard to-exclusive). Details in qa/verdicts/vc-admin-control.md.
- Not re-run: VA2, VA3, VA7, VA9, VA10, VA11, VA14, VA15, VA16, I1-I5, I7. Servers on 4520/4521/5191 stopped.
- Resume: a cycle-1 check should re-run P1/P2 probes (T6, T8) first, then the dashboard window, then the not-re-run list.

## Cycle 1 (repair check) - 2026-10-27T01:30+05:30
- Cycle checked: 1; code head 78ddaef (repair base 914a61d); verdict FAIL.
- Done: T6/T8 re-run, VA1 hostile variants, diff-scope read, per-package tests (engine 152, schemas 14, web 26, api green), falsifications F1-F5 (5/5 killed), P3 end-to-end via the real metrics route.
- Findings: VA1 residual (allow-listed env refs reach an admin-chosen host, critical); R9 login-guard lock-out, R6 heuristic false error, VA6/R5 contract tension (medium); nav loader trust (low). Details in qa/verdicts/vc-admin-control.md.
- Evidence (qa/evidence/vc-admin-20261026/checker-a/): chk-a-c1.test.ts, chk-a-c1p3.test.ts, chk-a-c1sync.test.ts, chk-a-c1guard.test.ts, falsify-c1.ps1, falsify-c1.log.txt, c1-run.log.txt. Cycle-0 falsify.log was overwritten by mistake.
- Resume: a cycle-2 check re-runs C1-RESIDUAL first, then R9 guard and R6 heuristic, then the not-re-run list.

## Cycle 2 (repair check) - 2026-10-27T01:55+05:30
- Cycle checked: 2; code head 6b8674c (repair base 78ddaef); verdict PASS (A side).
- Done: repair diff read in full (index.ts two-spread edit judged in scope), C1-RESIDUAL/guard/sync probes re-run, VA1 hostile matrix (per-field seeded-doc changes, twins under new ids, wrong-kind refs, legacy docs, live port, no seeded list), VA6 every login kind, VA8 sync, startApi wiring over HTTP, repair tests (api 133, schemas 15, web 27), 10/10 mutants killed.
- Evidence (qa/evidence/vc-admin-20261026/checker-a-c2/): chk-a-c2*.test.ts, falsify-c2.ps1/.log, run logs.
- Findings: only low PROPOSED-ISSUEs (audit_log unbounded anonymous growth, no startApi wiring test, Kelvin-sign lowercase store-level, LRU eviction reset, nav loader).
- Resume: none needed; B's verdict decides the dual result.
