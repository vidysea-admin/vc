param([switch]$OracleOnly)
$ErrorActionPreference='Continue'
$taskRoot='D:/vc/.worktrees/t047-crisis'
$evidenceRoot=Join-Path $taskRoot 'qa/evidence/t047-secondary-b'
$nodePath='C:/Program Files/nodejs/node.exe'
$tsxPath=Join-Path $taskRoot 'node_modules/tsx/dist/cli.mjs'
$indexPath=Join-Path $evidenceRoot 'runs.txt'
$failed=0
function Invoke-Recorded([string]$Name,[string]$Directory,[string[]]$Arguments){
 Set-Location -LiteralPath $Directory
 $logPath=Join-Path $evidenceRoot ($Name+'.log')
 $start=Get-Date
 "$Name START $($start.ToString('o')) CWD=$Directory NODE=$nodePath ARGS=$($Arguments -join ' ')" | Add-Content $indexPath
 & $nodePath @Arguments *> $logPath
 $status=$LASTEXITCODE
 "$Name EXIT=$status END=$((Get-Date).ToString('o'))" | Add-Content $indexPath
 Write-Output "$Name EXIT=$status"
 if($status -ne 0){$script:failed++}
}
Invoke-Recorded 'oracle-engine-original' (Join-Path $evidenceRoot 'engine') @($tsxPath,'--test','--test-concurrency=1','tests/oracle.test.ts')
Invoke-Recorded 'oracle-api-original' (Join-Path $evidenceRoot 'api') @($tsxPath,'--test','--test-concurrency=1','tests/oracle.test.ts')
if($OracleOnly){exit $failed}
Invoke-Recorded 'manifest-engine' (Join-Path $taskRoot 'packages/engine') @($tsxPath,'--test','--test-concurrency=1','tests/*.test.ts','evals/*.test.ts')
Invoke-Recorded 'manifest-api' (Join-Path $taskRoot 'apps/api') @($tsxPath,'--test','--test-concurrency=1','tests/*.test.ts')
$configs=@('packages/engine/tsconfig.json','packages/engine/evals/tsconfig.json','packages/engine/scripts/tsconfig.json','packages/db/tsconfig.json','packages/providers/tsconfig.json','packages/schemas/tsconfig.json','packages/observability/tsconfig.json','apps/api/tsconfig.json','apps/web/tsconfig.json','mcp/student-profile/tsconfig.json','mcp/university-kb/tsconfig.json')
foreach($config in $configs){Invoke-Recorded ('type-'+($config -replace '/','-')) $taskRoot @((Join-Path $taskRoot 'node_modules/typescript/bin/tsc'),'--noEmit','-p',$config)}
exit $failed
