# t057-frontends-up

Context: this is the local demo stack for T-057 (contract = source 2). The backends are already UP and must NOT be restarted: VC API 8787, Pathlynks auth 5000, Pathlynks backend 5001, Vidysea backend 8000, widget server 8790, mongod 27019. Both frontends are DOWN: the Pathlynks frontend (port 3000) and the Vidysea frontend (port 3001).

Task:
1. Read the previous session's launch scripts, C:/Users/Lenovo/AppData/Local/Temp/claude/D--vc/3729a82a-387f-4051-a933-dfde6424d2aa/scratchpad/pathlynks-up.ps1 and C:/Users/Lenovo/AppData/Local/Temp/claude/D--vc/3729a82a-387f-4051-a933-dfde6424d2aa/scratchpad/vidysea-up.ps1, and the logs dir C:/Users/Lenovo/AppData/Local/Temp/claude/D--vc/3729a82a-387f-4051-a933-dfde6424d2aa/scratchpad/logs (pf-frontend*.log, vidysea-frontend*.log), to find the exact frontend start commands, cwd and env. Start ONLY the two frontends, detached/in the background, appending to the same log files. Never start a second copy of any backend.
2. Wait until http://localhost:3000/signin and http://localhost:3000/career-quest return 200, and the Vidysea frontend login page on 3001 returns 200 (the pre-warm compiles the pages). Report the timings.
3. Read C:/Users/Lenovo/AppData/Local/Temp/claude/D--vc/3729a82a-387f-4051-a933-dfde6424d2aa/scratchpad/walk.mjs, C:/Users/Lenovo/AppData/Local/Temp/claude/D--vc/3729a82a-387f-4051-a933-dfde6424d2aa/scratchpad/walk-brief.md and C:/Users/Lenovo/AppData/Local/Temp/claude/D--vc/3729a82a-387f-4051-a933-dfde6424d2aa/scratchpad/walk-brief-rev.md. Report:
   - whether walk.mjs supports a 'vidysea' mode;
   - which steps/criteria it covers (the C4..C11 mapping);
   - its exact run command (cwd D:/vc/.worktrees/vc-completion/apps/web);
   - any change needed for the Vidysea walk.
   Do NOT run the walk and do not edit walk.mjs.
4. Report the PIDs of the frontends you started.
