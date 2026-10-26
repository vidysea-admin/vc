# Gate — plan-approved (PLAN phase: intent · spec · plan)
**Opened:** 2026-09-26 (ISS-059; maker tick step 2b backfill)
**Blocks:** new build units (T-012, T-022, T-023, T-025..T-028), not the units already in flight.

Backfilled: 2026-09-26 — t-001-plan-doc, t-002-scaffold, t-002b-schema-hardening, t-003-student-kg, t-003b-db-hardening, t-004-langfuse, t-005-skills-guards, t-005c-recall-only-guard, t-006-mcp-servers, t-007-scribe-graph, t-008-approval-ui, t-009-scribe-eval, t-011-dpdp-erasure, t-014-erasure-followups, t-015-erasure-hardening, t-016-scribe-persistence, t-017-residuals, t-018-approval-followups, t-019-provider-independence, t-020-reject-reason-ui, t-013-citation-rescope, t-021-provider-failover

**Question:** approve the backfilled plan set as this project's PLAN artifacts?
- intent → `docs/intent.md` (drafted 2026-09-26 from goal.md, the CEO transcript, D-002..D-021 and the contract)
- spec → `qa/contracts/counselling-engine.md` (B1..B22, already checker-maintained and answered gate by gate)
- plan → `docs/plan.md` (T-001, checker PASS) + `TASKS.md` (T-000..T-028)

Answer format: approve all three, or name what to change. Recorded below as `Answered: <ISO> — <intent|spec|plan> — <where>`.

Answered: 2026-09-26T20:12:31+05:30 — intent — approved (docs/intent.md as drafted d592317) — Umesh in chat to the checker session ("approve all")
Answered: 2026-09-26T20:12:31+05:30 — spec — approved (qa/contracts/counselling-engine.md B1..B22) — Umesh in chat ("approve all")
Answered: 2026-09-26T20:12:31+05:30 — plan — approved (docs/plan.md + TASKS.md T-000..T-028) — Umesh in chat ("approve all"). Follow-up, not a condition: ISS-061 (add O8 personalisation/skip-known per CEO north star + B18; close the answered failover-scope question; add Non-goals).

---

## P1 — Student Virtual Counsellor (opened 2026-10-17T13:41:09+05:30)

**Question:** approve the P1 plan set (v8) so the build can start with U0 (contract amendments)?
- intent → `qa/evidence/p1-plan-draft-20261017/intent.md`
- user types → `qa/evidence/p1-plan-draft-20261017/user-types.md`
- spec → `qa/evidence/p1-plan-draft-20261017/spec.md` (v8, sha256 e183ee9a3af0e3a0096e55b84583a25ac42a456f1a23a1af7d8033941d3b9b4f)
- plan → `qa/evidence/p1-plan-draft-20261017/plan.md` (v8, sha256 3ab92f77b1101886b2df19c3546a1f207690d73cf562399dc47387251b225fd9)

**Inputs:** Umesh's answers D-086, D-087; maker decisions under his delegation D-088. Independent review: v7 APPROVE conditional on E1-E3 (scratchpad p1-v7-review.md), all three applied in v8.
**Blocks:** every P1 build unit (U0..U13b).
**Answer format:** "approve" (all three), or name what to change. Recorded as `Answered: <ISO> — <intent|spec|plan> — <where>`.

Answered: 2026-10-17T13:57:53+05:30 — intent — approved (qa/evidence/p1-plan-draft-20261017/intent.md + user-types.md) — Umesh in chat ("Approve all")
Answered: 2026-10-17T13:57:53+05:30 — spec — approved (spec.md v8 e183ee9a) — Umesh in chat ("Approve all")
Answered: 2026-10-17T13:57:53+05:30 — plan — approved (plan.md v8 3ab92f77) — Umesh in chat ("Approve all")

---

## partner-chatbot (opened 2026-10-22T07:29:11+05:30)
Answered: 2026-10-22T07:29:11+05:30 — intent — approved via mini-grill answers (Widget + API; simple api key; Voice without A10; Vidysea website + Pathlynks) — Umesh in chat, D-111
Answered: 2026-10-22T07:29:11+05:30 — spec — docs/features/partner-chatbot/spec.md drafted verbatim from those answers; Umesh "continue now" — D-111
Answered: 2026-10-22T07:29:11+05:30 — plan — docs/features/partner-chatbot/plan.md; Umesh "continue now" — D-111

## vc-admin-control (opened 2026-10-26T21:31:57+05:30)
Answered: 2026-10-26 — intent — docs/features/vc-admin-control/intent.md from Umesh's 26 Oct asks; plan approved "hnn tho ye plan frinal hai" — qa/gates/vc-admin-control.md G0, D-113
Answered: 2026-10-26 — spec — docs/features/vc-admin-control/spec.md derived 1:1 from the approved plan A1-A10 + fact pass; Umesh "build it in the best way possible" — G0, D-113
Answered: 2026-10-26 — plan — docs/features/vc-admin-control/plan.md (waves B1-B7, B2) from the approved plan order — G0, D-113
