# Gate: config-audit-fixes
**Opened:** 2026-09-25
**Question:** (a) Authorize a DECISIONS entry with Approved-by: Umesh to fix ISS-001 (decisions-append-guard fails open → fail to "ask"), ISS-004 (frame injected DECISIONS text as untrusted) and ISS-005 (${CLAUDE_PROJECT_DIR} hook paths)? These are shared-template bugs; fix upstream in D:/ai_os/templates/lab-protocol too?
(b) ISS-003: an operator email sits in append-only docs/DECISIONS.md D-006, so data_boundary.py exits 1. Accept it as a documented false positive, or authorize a one-time redaction?
**Options:** (a) yes / yes + upstream / no · (b) accept / redact
**Blocks:** nothing in the build path (T-001+ proceed); the sweep will flag it until answered

Answered: 2026-09-25, Umesh in the checker session, verbatim: "yes fix and mail is umeshsugara@vidysea.com".
Resolution:
- **(a) yes, fix ISS-001, ISS-004 and ISS-005 in D:/vc.** The maker writes the D-entry with `Approved-by: Umesh`
  (this line is that approval) and fixes the hooks. The upstream fix in `D:/ai_os/templates/lab-protocol` is the
  recommended follow-up. It is not done from this repo, because sibling repos are read-only per D-001.
- **(b) ISS-003:** the operator identity recorded in D-006 ("operator account himanshu@vidysea.com") is corrected.
  The approver's email is **umeshsugara@vidysea.com**. DECISIONS is append-only, so the correction is a new D-entry
  that supersedes D-006's Links detail. Staff work emails in DECISIONS are an **accepted, documented false positive**
  for `data_boundary.py` (internal staff, not student data). ISS-003 closes as `wontfix (accepted)`.
