# t057-r3b-restart-probe

Ops lane. You MAY restart ONLY the VC API on 8787 (now pid 23912). Capture its command line first; launch cwd is D:/vc/.worktrees/vc-completion/apps/api with tsx --env-file=../../.env src/main.ts. Rotate the logs in C:/Users/Lenovo/AppData/Local/Temp/claude/D--vc/3729a82a-387f-4051-a933-dfde6424d2aa/scratchpad/logs/ and relaunch detached with Start-Process and redirected output.
Then rerun the scratchpad probe-r3.mjs (in C:/Users/Lenovo/AppData/Local/Temp/claude/D--vc/5cb4b5fc-43e3-495f-b365-682dd35b364f/scratchpad/) with the same 6 turns, plus 'which services do you have?' and 'what services are available'.
Append the results as 'R3b' to qa/evidence/t057/fix-round-live.md. Do not send hostile ReDoS inputs to the live server.
