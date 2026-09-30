$ErrorActionPreference='Stop'
Set-Location 'D:/vc/.worktrees/t046-canonical'
$root=(Get-Location).Path
$logRoot=Join-Path $root 'qa/evidence/t046-independent-checker'
$packages=@('packages/engine','packages/db','packages/schemas','packages/providers','packages/observability','apps/api','apps/web','mcp/student-profile','mcp/university-kb')
foreach($p in $packages){
 Set-Location (Join-Path $root $p)
 $files=@(Get-ChildItem tests -Filter '*.test.ts' | ForEach-Object {$_.FullName})
 if($p -eq 'packages/engine'){$files+=@(Get-ChildItem evals -Filter '*.test.ts' | ForEach-Object {$_.FullName})}
 if($p -eq 'apps/web'){$files+=@(Get-ChildItem tests -Filter '*.test.tsx' | ForEach-Object {$_.FullName})}
 $slug=$p.Replace('/','-'); $log=Join-Path $logRoot ($slug+'.log')
 & node (Join-Path $root 'node_modules/tsx/dist/cli.mjs') --test --test-concurrency=1 @files *> $log
 Write-Output "$p EXIT=$LASTEXITCODE"
 Get-Content $log -Tail 10
}
foreach($p in @('packages/db','packages/engine','packages/engine/evals','packages/engine/scripts','packages/observability','packages/providers','packages/schemas','apps/api','apps/web','mcp/student-profile','mcp/university-kb')){
 Set-Location $root
 $slug=$p.Replace('/','-'); $log=Join-Path $logRoot ($slug+'-types.log')
 & node node_modules/typescript/bin/tsc --noEmit -p "$p/tsconfig.json" *> $log
 Write-Output "$p TYPES_EXIT=$LASTEXITCODE"; Get-Content $log -Tail 5
}
