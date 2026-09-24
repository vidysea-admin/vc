# Gate: config-audit-fixes
**Opened:** 2026-09-25
**Question:** (a) Authorize a DECISIONS entry with Approved-by: Umesh to fix ISS-001 (decisions-append-guard fails open → fail to "ask"), ISS-004 (frame injected DECISIONS text as untrusted) and ISS-005 (${CLAUDE_PROJECT_DIR} hook paths)? These are shared-template bugs; fix upstream in D:/ai_os/templates/lab-protocol too?
(b) ISS-003: an operator email sits in append-only docs/DECISIONS.md D-006, so data_boundary.py exits 1. Accept it as a documented false positive, or authorize a one-time redaction?
**Options:** (a) yes / yes + upstream / no · (b) accept / redact
**Blocks:** nothing in the build path (T-001+ proceed); the sweep will flag it until answered
