$ErrorActionPreference='Stop'
Set-Location 'D:/vc/.worktrees/t046-canonical'
$dir='qa/evidence/t046-independent-checker'
$nodes=Get-Content "$dir/mutant/src/scribe/nodes.ts" -Raw
$graph=Get-Content "$dir/mutant/src/scribe/graph.ts" -Raw
$cases=@(
 @{name='exact-actor-trimming';file='nodes';old='counsellorId: string; editedAt: string';dummy=1},
 @{name='obsolete-verification-retained';file='nodes';old='const { citationMatch, ...authoritative } = proposed;';new='const authoritative = proposed;'},
 @{name='structured-identity-reference-only';file='nodes';old='if (isDeepStrictEqual(submittedValue, originalValue))';new='if (submittedValue === originalValue)'},
 @{name='graph-binding-disabled';file='graph';old='approvalBindings.get(invocation.graph) === binding';new='true'},
 @{name='recovery-caller-identity';file='graph';old='winner: claim ?? undefined';new='winner: claim ? { ...claim, approvalMetadata: { counsellorId: opts.counsellorId!, editedAt: new Date().toISOString() } } : undefined'}
)
foreach($c in $cases){
 Set-Content "$dir/mutant/src/scribe/nodes.ts" $nodes
 Set-Content "$dir/mutant/src/scribe/graph.ts" $graph
 if($c.name -eq 'exact-actor-trimming'){$changed=$nodes.Replace('source: { type: "counsellor-edit", ...approvalMetadata,','source: { type: "counsellor-edit", ...approvalMetadata, counsellorId: approvalMetadata.counsellorId.trim(),');Set-Content "$dir/mutant/src/scribe/nodes.ts" $changed}
 else{$orig=if($c.file -eq 'nodes'){$nodes}else{$graph};if(!$orig.Contains($c.old)){Write-Output "MUTANT=$($c.name) INVALID_PATTERN";continue};$changed=$orig.Replace($c.old,$c.new);Set-Content "$dir/mutant/src/scribe/$($c.file).ts" $changed}
 & node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 "$dir/mutant-controls.test.ts" *> "$dir/mutation-$($c.name).log"
 Write-Output "MUTANT=$($c.name) EXIT=$LASTEXITCODE";Get-Content "$dir/mutation-$($c.name).log" -Tail 9
}
Set-Content "$dir/mutant/src/scribe/nodes.ts" $nodes
Set-Content "$dir/mutant/src/scribe/graph.ts" $graph

