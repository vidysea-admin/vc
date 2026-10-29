# t057-vidysea-walk-diag

Diagnose why the Vidysea headed demo walk fails at step02 'student-central'.

Facts:
- Walk script: qa/.delivery/requests/t057-walk.mjs (mode 'vidysea'). Log: qa/evidence/t057/walk-vidysea-run2.log. step01 login = OK (13.7s); step02 waits 60s for text /Open the counsellor button|temporarily unavailable/ on http://localhost:3001/student/ai-counsellor and times out.
- The FAIL screenshot (qa/evidence/t057/vidysea-02-student-central-FAIL.png) shows the Vidysea page in a LOGGED-OUT state: header shows 'Log in' / 'Sign Up', main body blank, stray text 'Sign in to u...' top-left. So the session appears lost on navigation after login, OR the page gates on auth state that is not hydrated.
- Vidysea frontend source: D:/vc/.worktrees/vc-vidysea-frontend (or find the worktree that serves port 3001; check 'netstat -ano | findstr :3001' then the process cwd). Vidysea backend: D:/vc/.worktrees/vc-vidysea-backend (port 8000). VC API log: C:/Users/Lenovo/AppData/Local/Temp/claude/D--vc/3729a82a-387f-4051-a933-dfde6424d2aa/scratchpad/logs/vc-api.log. Look for VF/VB logs in that same logs folder.

Answer:
1. Root cause, with file:line evidence: how the frontend stores the auth token after /login (cookie vs localStorage, which origin/host), how /student/ai-counsellor reads it, and why the walk's page sees logged-out (e.g. walk navigates to a different host than it logged in on, page.goto drops state, a redirect, cookie domain/secure flag on http://localhost, token-refresh call to backend failing, etc.). Use curl-only probes against localhost (no browser) where useful.
2. Whether the ChatWidget mount on that page (the 'Open the counsellor button' text) depends on /vc/runtime or the widget script URL (NEXT_PUBLIC_VC_WIDGET_SCRIPT_URL key name only), and whether those respond now (curl).
3. The minimal fix: either a walk-script change (which lines in t057-walk.mjs) or a host-config change. Do not apply it; describe it exactly.
4. Memory: list current node/python/chrome processes with working-set MB (tasklist), and which can be safely stopped for a Vidysea-only walk (PA 5000 / PB 5001 are Pathlynks and idle since Pathlynks is deferred).
Write the report to qa/evidence/t057/vidysea-walk-diagnosis.md and return it.
