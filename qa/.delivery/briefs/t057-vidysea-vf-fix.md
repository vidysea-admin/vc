# t057-vidysea-vf-fix

Apply the preferred fix from qa/evidence/t057/vidysea-walk-diagnosis.md (read it first) to the Vidysea frontend at D:/vc/.worktrees/vc-vidysea-frontend.
1. In next.config.mjs, add skipTrailingSlashRedirect to the base config, gated on the SAME demo env flag that already gates the demo CSP additions for localhost:8787 (grep near line 252 for the flag name; do not invent a new one). Edit in place, minimal diff, flag-off behaviour unchanged.
2. Restart ONLY the Vidysea frontend on port 3001 (currently pid 11344). First capture its exact command line and cwd and env-file usage (Get-CimInstance Win32_Process), stop it, and relaunch it identically in the background with output to the logs folder C:/Users/Lenovo/AppData/Local/Temp/claude/D--vc/3729a82a-387f-4051-a933-dfde6424d2aa/scratchpad/logs/ (vf.log). Do not touch any other service.
3. Verify: curl -i http://localhost:3001/api/v1/session/ must NOT return 308 or a location to :8000 (expect 401 without auth, or 200). Also curl /student/ai-counsellor returns 200 after compile.
4. If skipTrailingSlashRedirect does not stop the redirect, revert your edit, then apply the fallback instead (add http://localhost:8000 http://127.0.0.1:8000 to the demo connect-src) and re-verify; report which one is in place.
Do NOT run the walk or open a browser. Append a short "Fix applied" section (file:line, commands, curl status lines, no secrets) to qa/evidence/t057/vidysea-walk-diagnosis.md.
