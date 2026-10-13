$ErrorActionPreference = 'Stop'
$t054root = 'D:\vc\qa\evidence\t054-checker'
$t054runtime = Get-CimInstance Win32_OperatingSystem
$t054before = [pscustomobject]@{utc=[DateTime]::UtcNow.ToString('o'); freeGB=[math]::Round($t054runtime.FreePhysicalMemory/1MB,3); lockPresent=Test-Path 'C:\Users\Lenovo\AppData\Local\Temp\claude\vc-testlock'; node=(& node --version); tsx=(& node -p "require('./node_modules/tsx/package.json').version"); typescript=(& node -p "require('./node_modules/typescript/package.json').version"); os=$t054runtime.Caption; ownerPsPid=$PID}
$t054before | ConvertTo-Json | Set-Content -LiteralPath "$t054root\runtime-before.json"
$t054commands = @(
  @{id='acceptance';cmd='bash scripts/vc-testlock.sh node --import tsx qa/evidence/t054-checker/acceptance.ts'},
  @{id='engine';cmd='bash scripts/vc-testlock.sh node --import tsx --test --test-concurrency=1 --test-timeout=30000 packages/engine/tests/webhooks-outbox.test.ts packages/engine/tests/webhooks-outbox-mongo.test.ts packages/engine/tests/webhooks-delivery-drain.test.ts packages/engine/tests/webhooks-delivery.test.ts'},
  @{id='api';cmd="bash scripts/vc-testlock.sh node --import tsx --test --test-concurrency=1 --test-timeout=30000 --test-name-pattern='(webhook|outbox)' apps/api/tests/server.test.ts"},
  @{id='engine-types';cmd='bash scripts/vc-testlock.sh node node_modules/typescript/bin/tsc --noEmit -p packages/engine/tsconfig.json'},
  @{id='api-types';cmd='bash scripts/vc-testlock.sh node node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json'}
)
$t054results = @()
foreach ($t054entry in $t054commands) {
  $t054info = [Diagnostics.ProcessStartInfo]::new('C:\Program Files\Git\bin\bash.exe')
  $t054info.ArgumentList.Add('-lc'); $t054info.ArgumentList.Add($t054entry.cmd)
  $t054info.WorkingDirectory='D:\vc'; $t054info.UseShellExecute=$false; $t054info.CreateNoWindow=$true
  $t054info.RedirectStandardOutput=$true; $t054info.RedirectStandardError=$true
  $t054info.Environment['VC_TESTLOCK_TIMEOUT_SECS']='900'
  $t054proc=[Diagnostics.Process]::new(); $t054proc.StartInfo=$t054info
  $t054start=[DateTime]::UtcNow; [void]$t054proc.Start()
  $t054out=$t054proc.StandardOutput.ReadToEndAsync();$t054err=$t054proc.StandardError.ReadToEndAsync()
  Add-Content -LiteralPath "$t054root\owned-handles.jsonl" -Value (@{id=$t054entry.id;pid=$t054proc.Id;start=$t054start.ToString('o');command=$t054entry.cmd}|ConvertTo-Json -Compress)
  try {
  if (!$t054proc.WaitForExit(180000)) { throw "Owned process $($t054proc.Id) exceeds 180s; no PASS" }
  $t054end=[DateTime]::UtcNow
  $t054out.Result | Set-Content -LiteralPath "$t054root\$($t054entry.id).stdout.log"
  $t054err.Result | Set-Content -LiteralPath "$t054root\$($t054entry.id).stderr.log"
  $t054row=@{id=$t054entry.id;cmd=$t054entry.cmd;pid=$t054proc.Id;exit=$t054proc.ExitCode;terminal=$t054proc.HasExited;start=$t054start.ToString('o');end=$t054end.ToString('o');wall_s=($t054end-$t054start).TotalSeconds}
  $t054results += $t054row
  $t054results | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath "$t054root\commands.json"
  $t054row | ConvertTo-Json -Compress
  if ($t054proc.ExitCode -ne 0 -and $t054entry.id -ne 'lane') { break }
  } finally {
    if (!$t054proc.HasExited) {
      # This Process object was started and recorded by this script. .NET owns its
      # handle; tree cleanup targets only this still-live process and descendants.
      Add-Content -LiteralPath "$t054root\owned-handles.jsonl" -Value (@{id=$t054entry.id;pid=$t054proc.Id;cleanup='owned started process tree only';utc=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Compress)
      $t054proc.Kill($true)
      [void]$t054proc.WaitForExit(10000)
      if (!$t054proc.HasExited) { throw "Owned cleanup incomplete for $($t054proc.Id)" }
    }
    # A forced Windows process termination cannot execute a JavaScript finally.
    # Restore only this checker's isolated red-copy directories from bound bytes.
    $t054copyRoot = Join-Path $t054root 'copies'
    if (Test-Path -LiteralPath $t054copyRoot) {
      $t054tenantUri = ([Uri]'D:\vc\packages\db\src\tenant.ts').AbsoluteUri
      foreach ($t054redDir in (Get-ChildItem -LiteralPath $t054copyRoot -Directory | Where-Object { $_.Name -match '^C[1-4]-red$' })) {
        foreach ($t054sourceName in @('outbox','delivery','signing')) {
          $t054copyBytes = [IO.File]::ReadAllText("D:\vc\packages\engine\src\webhooks\$t054sourceName.ts")
          if ($t054sourceName -eq 'outbox') { $t054copyBytes = $t054copyBytes.Replace('from "@vc/db"', "from `"$t054tenantUri`"") }
          [IO.File]::WriteAllText((Join-Path $t054redDir.FullName "$t054sourceName.ts"),$t054copyBytes,[Text.UTF8Encoding]::new($false))
        }
      }
    }
  }
}
$t054runtimeAfter=Get-CimInstance Win32_OperatingSystem
[pscustomobject]@{utc=[DateTime]::UtcNow.ToString('o');freeGB=[math]::Round($t054runtimeAfter.FreePhysicalMemory/1MB,3);lockPresent=Test-Path 'C:\Users\Lenovo\AppData\Local\Temp\claude\vc-testlock';allOwnedHandlesTerminal=(@($t054results | Where-Object { !$_.terminal }).Count -eq 0)} | ConvertTo-Json | Set-Content -LiteralPath "$t054root\runtime-after.json"
