# T-057 D-126 local demo patches: senior review

Reviewer: fresh-context senior-software-engineer agent (read-only), 2026-10-28.
The main session saved this file because the reviewer had no Write tool.

**VERDICT: Warning** (no Block)

## Findings
1. **[medium] `vc-vidysea-backend/app/api/v1/student_sso/router.py:149-179,225-231`.** `/student-sso/consume` makes production writes that D-124/D-125 do not list, and `VC_DEMO_NO_PROD_WRITES` does not gate them:
   - `upsert_link`, which writes `pathlynks_student_link`;
   - `drain_cross_assignment`, which can write `counsellor_student_request` and `student_counselor`;
   - the `pathlynks_student_snapshot` upsert;
   - the `/consent` rows.

   **Disposition:** the demo walk logs in directly at Vidysea `/login`, not through SSO consume, so it does not reach these writes. Running SSO consume against production needs the Approver's decision first.
2. **[medium] `ai_counsellor_router.py:159`.** The grade fallback parsed free text out of `grade_label`. **FIXED** in the main session: it now uses `p.grade + 5 ... WHERE p.grade IS NOT NULL`. `grade` is INTEGER per `migration/0067_pathlynks_student_snapshot.py:42`.
3. **[low] `security.py:69`.** `isdigit()` accepted non-ASCII digits, which would make `int()` raise. **FIXED**: the check is now `isascii() and isdecimal()`.
4. **[low] Pathlynks `vcQuestHeaders` DOB branch.** It reads a local-midnight DATE through `getUTC*`, so the age is off by one day around birthdays on an IST host. Open (personalisation only).
5. **[low]** The demo flags have no environment guard. Optional hardening: require a loopback `VC_BASE_URL` when the flags are on. Open.

## Answers to the brief
- With `VC_DEMO_NO_PROD_WRITES=1`, every startup and background write in `app/main.py` and `deps.py:256` is guarded. The only remaining writes are the request-time SSO writes in finding 1.
- With the flags unset, the demo behaviour is unchanged. Two `next.config.mjs` changes are not demo-gated:
  - `microphone=(self)` on `/student/*`, which needs product sign-off;
  - `NEXT_PUBLIC_VC_WIDGET_SCRIPT_URL`, which defaults to empty.
- `vc_eligibility` is minted only for student access tokens with a valid `vck_srv_` key. It is owner-bound and expires with the token.
- The age derivation is owner-bound and read-only. A minor with neither a DOB nor a grade defaults to 18, which is accepted under D-126.

## Commands
- Vidysea backend `python -m pytest tests/test_student_fixes.py -k vc_`: 28 passed (re-run after the fixes, still 28 passed).
- Pathlynks backend `node --test tests/parent-journey-regression.test.js`: 33 pass, 1 fail. The failure is an environment gap (`initdb.exe` is missing), not a code defect.

## Test gaps (backlog)
None of these have tests yet: `VC_DEMO_ELIGIBILITY` minting, the startup-task suppression, the age-derivation edge cases, or the Pathlynks `VC_DEMO_ELIGIBILITY=1` path.
