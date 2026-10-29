# t057-r3-restart-probe

Ops lane. You MAY restart ONLY the VC API on 8787 (now pid 34360). First capture its command line via Get-CimInstance Win32_Process. Launch cwd: D:/vc/.worktrees/vc-completion/apps/api, command: node_modules.bin	sx --env-file=../../.env src/main.ts. Rotate vc-api.log to vc-api.prev.log in C:/Users/Lenovo/AppData/Local/Temp/claude/D--vc/3729a82a-387f-4051-a933-dfde6424d2aa/scratchpad/logs/. Relaunch detached with Start-Process and redirected output.
Then rerun the R2 live probe exactly as before (reuse the scratchpad probe-r2.mjs used for qa/evidence/t057/fix-round-live.md: Vidysea TEST student via gateway :8000), with these turns:
'do you help with education loans?'
'what services do you offer?'
'can vidysea help me with my visa?'
'can you help me understand visa requirements for Germany?'
'give me the best universities in Canada'
'i want to make an entire journey map for study abroad'
Record HTTP status, ms and the bot reply. Do not run the walk. Append the results under an 'R3' heading in qa/evidence/t057/fix-round-live.md.
