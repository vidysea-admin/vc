param([string]$Only)
$ErrorActionPreference='Stop'
$taskRoot='D:/vc/.worktrees/t047-crisis'
$evidenceRoot=Join-Path $taskRoot 'qa/evidence/t047-secondary-b'
$copyRoot=Join-Path $evidenceRoot 'engine'
$nodePath='C:/Program Files/nodejs/node.exe'
$tsxPath=Join-Path $taskRoot 'node_modules/tsx/dist/cli.mjs'
$cases=@(
 @{Name='strict-extra';Path='src/scribe/schemas.ts';Needle='}).strict(),';Replacement='}).passthrough(),';Pattern='B independent strict minimal schema'},
 @{Name='all-turns';Path='src/scribe/graph.ts';Needle='parsed.turns.filter(turn => guardTurn(turn).level === "crisis").map';Replacement='parsed.turns.slice(0, 1).filter(turn => guardTurn(turn).level === "crisis").map';Pattern='B independent translated multi-crisis'},
 @{Name='leaf-preflight';Path='src/guards/concern-classifier.ts';Needle='preflight: deps.preflight,';Replacement='preflight: undefined,';Pattern='B independent held private preflight'},
 @{Name='terminal-refusal';Path='src/guards/concern-classifier.ts';Needle='if (err instanceof ProviderAuthorizationRefusedError) throw err;';Replacement='if (false) throw err;';Pattern='B independent terminal leaf refusal'},
 @{Name='review-budget';Path='src/guards/escalation.ts';Needle='const reviewDeadline = classifierDeadline + (deps.writerDeadlineMs ?? 60_000);';Replacement='const reviewDeadline = classifierDeadline + (deps.writerDeadlineMs ?? 60_000) + 1000;';Pattern='B independent annotation work exhausts'},
 @{Name='ownership-token';Path='src/guards/escalation.ts';Needle='deleteMany({ _id: { $in: docs.map((d) => d._id) }, writerToken },';Replacement='deleteMany({ _id: { $in: docs.map((d) => d._id) } },';Pattern='B independent late notification cleanup'},
 @{Name='d016-fail-safe';Path='src/scribe/graph.ts';Needle='if (fenced) return { kind: "fenced" };';Replacement='if (false) return { kind: "fenced" };';Pattern='B independent D016 initial consent timeout unreadable'}
)
$unexpected=0
if($Only){$cases=@($cases | Where-Object {$_.Name -eq $Only})}
foreach($case in $cases){
 $path=Join-Path $copyRoot $case.Path
 $original=[IO.File]::ReadAllText($path)
 if(-not $original.Contains($case.Needle)){throw "Missing mutation target $($case.Name)"}
 try{
  [IO.File]::WriteAllText($path,$original.Replace($case.Needle,$case.Replacement))
  Set-Location $copyRoot
  $log=Join-Path $evidenceRoot ('mutant-'+$case.Name+'.log')
  & $nodePath $tsxPath --test --test-concurrency=1 "--test-name-pattern=$($case.Pattern)" tests/oracle.test.ts *> $log
  $status=$LASTEXITCODE
  "MUTANT $($case.Name) EXIT=$status" | Add-Content (Join-Path $evidenceRoot 'mutations.txt')
  Write-Output "MUTANT $($case.Name) EXIT=$status"
  if($status -eq 0){$unexpected++}
 }finally{[IO.File]::WriteAllText($path,$original)}
}
Set-Location $copyRoot
& $nodePath $tsxPath --test --test-concurrency=1 tests/oracle.test.ts *> (Join-Path $evidenceRoot 'oracle-engine-restored.log')
$restored=$LASTEXITCODE
"RESTORED engine EXIT=$restored" | Add-Content (Join-Path $evidenceRoot 'mutations.txt')
Write-Output "RESTORED engine EXIT=$restored"
Set-Location (Join-Path $evidenceRoot 'api')
& $nodePath $tsxPath --test --test-concurrency=1 tests/oracle.test.ts *> (Join-Path $evidenceRoot 'oracle-api-corrected.log')
$api=$LASTEXITCODE
"CORRECTED api EXIT=$api" | Add-Content (Join-Path $evidenceRoot 'mutations.txt')
Write-Output "CORRECTED api EXIT=$api"
exit ($unexpected+$restored+$api)
