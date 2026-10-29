Task t057-d126-review: fresh-context read-only senior review of LOCAL-DEMO-ONLY patches made for decision D-126 (Umesh: for this demo age/consent are NOT a gate; use real age from DOB, else approximate from grade (+5), else placeholder 18, consent true; all behind env flags, default unset = production behaviour unchanged). These patches live in host checkouts and must never be pushed.

Files (use `git -C <checkout> diff` to see the exact changes):
1. D:/vc/.worktrees/vc-vidysea-backend/app/core/security.py `create_token` lines ~59-80: env-gated `vc_eligibility` claim (VC_DEMO_ELIGIBILITY=1, VC_PARTNER_SERVER_KEY regex for tenantId, VC_DEMO_ELIGIBILITY_AGE).
2. D:/vc/.worktrees/vc-vidysea-backend/app/api/v1/student/ai_counsellor_router.py `vc_student_proxy`: under VC_DEMO_ELIGIBILITY=1 a read-only SELECT derives the age (students.date_of_birth, else pathlynks_student_snapshot.grade_label digits + 5) and sends X-VC-Student-Age.
3. D:/vc/.worktrees/vc-vidysea-backend/app/main.py (~line 159, `_DEMO_NO_PROD_WRITES`) and app/deps.py (~256): VC_DEMO_NO_PROD_WRITES=1 skips startup writes + login streak.
4. D:/vc/.worktrees/quest-pathlynks-backend/controllers/pathlynks_quest_controller.js `vcQuestHeaders` (~1093-1112): VC_DEMO_ELIGIBILITY=1 defaults age 18 + consent true.

Check: default-off is truly unchanged; SQL is parameterised and read-only, and errors/no-row fall back safely without 500s; the age value is bounded and integer; no secret or student data logged; no production write path left unguarded in item 3; no way the flag gets enabled accidentally in production config (look for committed env/sample files); correctness bugs (regex, grade_label like "Grade 10" / "XII", int bounds). Return Approve / Warning / Block per file with file:line, confidence >80% only.
