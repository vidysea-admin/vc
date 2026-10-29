# T-057 local Vidysea stack launcher (D-125). Starts: Vidysea backend :8000, Vidysea frontend :3001, widget static :8790.
# VC itself (:8787) is started separately by the main session. Logs: scratchpad/logs/<svc>.log (+ .err.log).
$ErrorActionPreference = "Stop"
$Scratch = "C:\Users\Lenovo\AppData\Local\Temp\claude\D--vc\3729a82a-387f-4051-a933-dfde6424d2aa\scratchpad"
$VB = "D:\vc\.worktrees\vc-vidysea-backend"
$VF = "D:\vc\.worktrees\vc-vidysea-frontend"
$Logs = Join-Path $Scratch "logs"
New-Item -ItemType Directory -Force $Logs | Out-Null

# Guard: the proxy needs the partner server key (vck_srv_<id>_<43 chars>) in VB .env
$keyLine = Select-String -Path (Join-Path $VB ".env") -Pattern '^VC_PARTNER_SERVER_KEY=vck_srv_' -Quiet
if (-not $keyLine) { Write-Warning "VC_PARTNER_SERVER_KEY is empty in VB .env: the VC proxy will answer 503 until it is set (re-run build_vidysea_env.py after writing the key file)." }

# Every service below inherits these (belt and braces: they are also in VB .env)
$env:VC_DEMO_NO_PROD_WRITES = "1"
$env:VC_DEMO_ELIGIBILITY = "1"
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

# 1. Vidysea backend (FastAPI), cwd = checkout so .env is read
$vbArgs = "-m uvicorn app.main:app --host 127.0.0.1 --port 8000"
Start-Process -FilePath (Join-Path $VB ".venv\Scripts\python.exe") -ArgumentList $vbArgs -WorkingDirectory $VB `
  -RedirectStandardOutput (Join-Path $Logs "vidysea-backend.log") -RedirectStandardError (Join-Path $Logs "vidysea-backend.err.log") -WindowStyle Hidden

# 2. widget static server (loopback)
Start-Process -FilePath "node" -ArgumentList ("`"" + (Join-Path $Scratch "widget-static.mjs") + "`"") -WorkingDirectory $Scratch `
  -RedirectStandardOutput (Join-Path $Logs "widget-static.log") -RedirectStandardError (Join-Path $Logs "widget-static.err.log") -WindowStyle Hidden

# 3. Vidysea frontend (Next dev, webpack). VC_DEMO_LOCAL=1 comes from .env.local (rewrites /api/v1 -> localhost:8000)
Start-Process -FilePath "cmd.exe" -ArgumentList "/c node_modules\.bin\next.cmd dev --webpack -p 3001" -WorkingDirectory $VF `
  -RedirectStandardOutput (Join-Path $Logs "vidysea-frontend.log") -RedirectStandardError (Join-Path $Logs "vidysea-frontend.err.log") -WindowStyle Hidden

Write-Host "started: backend http://localhost:8000/health | frontend http://localhost:3001 | widget http://localhost:8790/vc-widget.js"
Write-Host "logs in $Logs"
