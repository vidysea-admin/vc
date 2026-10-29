# t057-r4-model-restart-probe

Ops lane. The worktree .env now sets VC_LLM_MODEL, VC_CONCERN_MODEL and VC_GROUNDING_MODEL to gemini-3.5-flash-lite. You MAY restart ONLY the VC API on 8787 (now pid 23808). Capture its command line first. Launch cwd D:/vc/.worktrees/vc-completion/apps/api with tsx --env-file=../../.env src/main.ts. Rotate the logs in C:/Users/Lenovo/AppData/Local/Temp/claude/D--vc/3729a82a-387f-4051-a933-dfde6424d2aa/scratchpad/logs/ and relaunch detached.
Check the startup log for model and grounding lines, with key names only.
Rerun the scratchpad probe-r3b.mjs (8 turns; in C:/Users/Lenovo/AppData/Local/Temp/claude/D--vc/5cb4b5fc-43e3-495f-b365-682dd35b364f/scratchpad/). Then send one crisis-safe check: a mild benign message, 'i am feeling a bit stressed about exams, any tips?'. It must not get the crisis reply unless the screen says possible; record what it got.
Compare the timings with R3b and append the results as 'R4 (3.5-flash-lite)' to qa/evidence/t057/fix-round-live.md. If any turn returns 4xx/5xx or an apology, capture the API log lines (no student text, no secrets).
