# Starts the local Pathlynks demo stack (T-057, D-124): throwaway mongod, PA (auth), PB (school_mgt + VC quest proxy), PF (frontend).
# NOT started here: the VC API (:8787) - the main session starts it. Run: powershell -File pathlynks-up.ps1
# Logs: scratchpad\logs\<svc>.log (stdout) and <svc>.err.log (stderr). PIDs: scratchpad\logs\pids.json. Stop: pathlynks-down hint printed at the end.
$ErrorActionPreference = 'Stop'
$scratch = 'C:\Users\Lenovo\AppData\Local\Temp\claude\D--vc\3729a82a-387f-4051-a933-dfde6424d2aa\scratchpad'
$logs = Join-Path $scratch 'logs'
New-Item -ItemType Directory -Force $logs | Out-Null
$node = (Get-Command node).Source

# --- Child environment hygiene: no ambient cloud credentials may reach services that can send mail / call AWS (dotenv never overrides an existing variable).
foreach ($n in 'AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','AWS_PROFILE','NODE_TLS_REJECT_UNAUTHORIZED','NODE_ENV','NODE_OPTIONS') { Remove-Item "Env:$n" -ErrorAction SilentlyContinue }
$emptyCreds = Join-Path $scratch 'empty-aws-credentials'; if (-not (Test-Path $emptyCreds)) { Set-Content -Path $emptyCreds -Value '' }
$env:AWS_SHARED_CREDENTIALS_FILE = $emptyCreds; $env:AWS_CONFIG_FILE = $emptyCreds; $env:AWS_EC2_METADATA_DISABLED = 'true'

function Test-PortListening([int]$port) { [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) }
function Wait-Port([int]$port, [int]$seconds) {
  $end = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $end) { if (Test-PortListening $port) { return $true }; Start-Sleep -Milliseconds 500 }
  $false
}
$pids = [ordered]@{}
function Start-Svc([string]$name, [string]$file, [string[]]$argv, [string]$cwd, [int]$port) {
  if (Test-PortListening $port) { Write-Host "SKIP $name : port $port already listening"; return }
  $p = Start-Process -FilePath $file -ArgumentList $argv -WorkingDirectory $cwd -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logs "$name.log") -RedirectStandardError (Join-Path $logs "$name.err.log")
  $script:pids[$name] = $p.Id
  Write-Host "STARTED $name pid=$($p.Id) port=$port cwd=$cwd"
}

# 1) mongod: throwaway LOCAL instance on 27019 (27018 belongs to the unrelated hunt_db Windows service - never touch it).
$mongod = 'C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe'
$dbpath = Join-Path $scratch 'mongo-data'
New-Item -ItemType Directory -Force $dbpath | Out-Null
Start-Svc 'mongod' $mongod @('--dbpath', $dbpath, '--port', '27019', '--bind_ip', '127.0.0.1') $scratch 27019
if (-not (Wait-Port 27019 30)) { throw 'mongod did not open 27019 (see logs\mongod.err.log)' }

# 2) PA - Pathlynks auth service (has /api/auth/login), port 5000 (hard-coded in server.js).
Start-Svc 'pa-auth' $node @('server.js') 'D:\pathlynks_fullstack\pre_production_auth_service' 5000

# 3) PB - school_mgt backend with the VC quest proxy (/api/pathlynks-quest/ai/*), port 5001 (hard-coded in server.js).
$pbEnv = Get-Content 'D:\vc\.worktrees\quest-pathlynks-backend\.env' | Where-Object { $_ -match '^VC_PARTNER_SERVER_KEY=' }
if ($pbEnv -notmatch '^VC_PARTNER_SERVER_KEY=vck_srv_[a-z0-9-]{2,32}_[A-Za-z0-9_-]{43}$') { Write-Warning 'PB VC_PARTNER_SERVER_KEY is empty/invalid: the quest proxy will answer 503 until pathlynks-set-partner-key.ps1 has run (then restart PB).' }
Start-Svc 'pb-school' $node @('server.js') 'D:\vc\.worktrees\quest-pathlynks-backend' 5001

# 4) PF - Pathlynks frontend (native Career Quest AIChatWidget). Must be opened as http://localhost:3000 (baseUrls.js keys on hostname "localhost").
Start-Svc 'pf-frontend' $node @('node_modules\next\dist\bin\next', 'dev', '-p', '3000', '-H', 'localhost') 'D:\vc\.worktrees\quest-pathlynks-frontend' 3000

$pids | ConvertTo-Json | Set-Content -Path (Join-Path $logs 'pids.json')
Write-Host ''
Write-Host 'Wait for readiness: PA http://localhost:5000/  PB http://localhost:5001/api-docs  PF http://localhost:3000/  (VC API http://localhost:8787 is started by the main session).'
Write-Host ('Stop: Get-Content "' + (Join-Path $logs 'pids.json') + '" | ConvertFrom-Json | ForEach-Object { $_.PSObject.Properties.Value } | ForEach-Object { Stop-Process -Id $_ -Force }')
