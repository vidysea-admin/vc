# d-drive-survey

READ-ONLY survey of the D: drive (477 GB, about 300 MB free). Find what is taking space. Do NOT delete, move or modify anything.
Method (a single du over D: timed out at 10 min, so be fast):
1. Size each D: top-level folder in parallel (PowerShell Start-ThreadJob or background jobs; Get-ChildItem -LiteralPath <dir> -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum), with a per-folder time cap. Report a folder that does not finish as "> N GB (timed out)".
2. Drill 2 levels deeper into the 5 biggest.
3. Look specifically for regenerable hogs: node_modules, .pnpm-store, .next/dist/build/.turbo, __pycache__/.venv/pip caches, .cache, Temp, *.log over 100 MB, MongoDB data dirs (WiredTiger files), docker/WSL vhdx, *.dmp, browser/Playwright caches, old worktrees under D:c.worktrees, D:idysea*, D:ai_os, archives (*.zip *.7z *.tar.gz *.iso) over 500 MB, git count-objects -vH for the biggest .git dirs, and any single file over 2 GB.
4. Classify each: (a) safely regenerable (cache, build output, node_modules, logs); (b) data that may matter (DB data dirs, archives, vhdx, user files); (c) unknown. Say whether a running process holds it (check mongod/node/python CommandLine via Get-CimInstance Win32_Process).
Return a table sorted by size (path, size, a/b/c, why) and the total reclaimable in category (a). Keep it under 50 lines. Never print file contents or secrets.
