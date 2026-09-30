Set-Location 'D:/vc/.worktrees/t046-canonical'
$dir='qa/evidence/t046-independent-checker'
$schema=Get-Content "$dir/mutant/src/scribe/schemas.ts" -Raw
$event=Get-Content "$dir/mutant/src/webhooks/schemas.ts" -Raw
Set-Content "$dir/mutant/src/scribe/schemas.ts" $schema.Replace('}).strict();','});').Replace('}).strict(),','}),')
& node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 "$dir/mutant-controls.test.ts" *> "$dir/mutation-metadata-stripping.log"
Write-Output "METADATA_MUTANT_EXIT=$LASTEXITCODE";Get-Content "$dir/mutation-metadata-stripping.log" -Tail 10
Set-Content "$dir/mutant/src/scribe/schemas.ts" $schema
Set-Content "$dir/mutant/src/webhooks/schemas.ts" $event.Replace('const fact = WebhookFactSchema.parse(input.fact);','const incoming = input.fact as any; const fact = WebhookFactSchema.parse({...incoming,source:incoming.source.type === "counsellor-edit" ? incoming.source.editedFrom : incoming.source});')
& node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 "$dir/mutant-controls.test.ts" *> "$dir/mutation-event-original-source.log"
Write-Output "EVENT_MUTANT_EXIT=$LASTEXITCODE";Get-Content "$dir/mutation-event-original-source.log" -Tail 10
Set-Content "$dir/mutant/src/webhooks/schemas.ts" $event
& node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 "$dir/mutant-controls.test.ts" *> "$dir/restored-copy-controls.log"
Write-Output "RESTORED_COPY_EXIT=$LASTEXITCODE";Get-Content "$dir/restored-copy-controls.log" -Tail 9
