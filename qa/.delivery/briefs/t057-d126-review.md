# t057-d126-review

Read-only senior review (never edit, never start servers, never touch DBs) of the LOCAL demo patch in the Vidysea backend checkout D:/vc/.worktrees/vc-vidysea-backend (see `git -C D:/vc/.worktrees/vc-vidysea-backend diff`) and frontend D:/vc/.worktrees/vc-vidysea-frontend (`git diff next.config.mjs`).
Intent: env switch VC_DEMO_NO_PROD_WRITES=1 must skip EVERY startup write/loop and the login-streak wallet credit (app/main.py ~159-711, app/api/deps.py ~256); unset must leave behaviour byte-for-byte unchanged. VC_DEMO_ELIGIBILITY=1 adds a vc_eligibility claim to student ACCESS tokens only (app/core/security.py create_token ~60-75), tenantId parsed from VC_PARTNER_SERVER_KEY. Frontend: VC_DEMO_LOCAL=1 rewrites /api/v1 to localhost:8000 and widens CSP connect-src to loopback VC.
Check: (1) any startup/background write to production still reachable with the flag set (grep lifespan/on_event/create_task/scheduler/INSERT/UPDATE/commit in startup paths); (2) flag-unset behaviour unchanged; (3) the eligibility claim cannot be minted for non-students or refresh tokens and is not enabled in any non-local env by default; (4) VC_DEMO_ELIGIBILITY_AGE defaults to 20 - flag whether this misstates a minor's age to VC (VC stores no text for minors) and whether the real age from the user record should be used instead; (5) the frontend change cannot affect a production build when VC_DEMO_LOCAL is unset.
Return Approve / Warning / Block with file:line evidence, most severe first.


UPDATE after the brief above was written (D-126, Umesh, 2026-10-28): age and guardian consent are deliberately NOT an eligibility gate for the local demo. With VC_DEMO_ELIGIBILITY=1, the Vidysea backend mints vc_eligibility for every student access token, with guardianConsent=true and a placeholder age of 18. For personalisation only, the VC proxy (app/api/v1/student/ai_counsellor_router.py, vc_student_proxy) replaces that age with one from students.date_of_birth; failing that, grade_label+5 from pathlynks_student_snapshot; failing that, the placeholder stays. Do NOT block on the relaxed gate, because that is the Approver's decision. DO check:
- the age computation is correct;
- the snapshot/DOB lookup is owner-bound (only the token's own student);
- these reads are read-only;
- nothing is enabled when the flags are unset;
- no production write path is reachable.
Also review the Pathlynks backend checkout D:/vc/.worktrees/quest-pathlynks-backend (git -C <dir> diff), especially vcQuestHeaders. Write your verdict to D:/vc/.worktrees/vc-completion/qa/verdicts/t057-d126-review.md. That single file is the only file you may write.
