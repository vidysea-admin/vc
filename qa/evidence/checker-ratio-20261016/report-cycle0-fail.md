# T056 scoped report-code review
VERDICT: FAIL
Owner: p0-report-final; independent completed-feature source review and own synthetic execution.
Finding: a native open task beginning strictly after every selected window poisons a completed bounded-window report.
Source: isolated/scripts/token_scan.py:291 stores identity_candidates without checking possible interval intersection; :429-430 treats any pending owners as incomplete_active_task.
Reproduction: python -B qa/evidence/checker-ratio-20261016/independent/report-final/probe_outside_open.py
Baseline: native task 10:00:00-10:00:10; maker selection 10:00:02-10:00:08; usage at :03; separate checker usage/time. complete=True, maker active=6s, overall_tokens=27.
Only change: append task_started at 10:00:20 with a new turn, no endpoint and no usage, same session.
Observed: complete=False, unknown_reasons=['incomplete_active_task'], ratios=None; maker active=6s and overall_tokens=27 unchanged.
Expected: the later open task cannot intersect a window ending at :08 and must not invalidate its completed accounting.
Evidence: outside-open-proof.json retains both complete report objects; synthetic fixtures in outside-open-probe/.
Source SHA256: 2c07f5ec35b50806a9cd5b734b1a25a17ef42216ec030a2175df87950b214046
Tests SHA256: 0680f065493759e047f8d496eaa6f1cf19b3b2affa30f870e2efabe9b89299ec
Scope: R1/R2 selected-window isolation fails. Stop at concrete defect per continuation; no further mutation campaign or PASS claim.
Prior pytest fixture setup errors were missing basetemp parent, not product evidence. Earlier interrupted controls are not acceptance proof.
No main source/shared files, Git, settings, models, providers, real data, or web changed/read. Only owned QA artifacts written.
All T056 planning/review/checking/probe/repair costs remain cumulative. Actual aggregate efficiency ratio UNKNOWN.
This verdict is report-readiness code only; no system-wide install/adoption or actual ten-percent claim.
