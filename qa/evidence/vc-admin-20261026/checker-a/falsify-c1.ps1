$ErrorActionPreference = 'Continue'
$S = 'C:\Users\Lenovo\AppData\Local\Temp\claude\d--vc\fe5889a6-130f-4952-9226-886a6cea9053\scratchpad'
$BASE = "$S\ck"
$O = 'D:\vc\.worktrees\vca-int'
$bash = 'C:\Program Files\Git\bin\bash.exe'
$out = "$S\chk-a-tools\falsify.log"
"" | Set-Content $out -Encoding utf8
function L($m) { Add-Content $out $m -Encoding utf8 }

function Make-Copy($name) {
  $dst = "$S\chk-a-tools\$name"
  if (Test-Path $dst) { cmd /c rmdir /s /q "$dst" }
  robocopy $BASE $dst /E /XD node_modules /NFL /NDL /NJH /NJS /NP | Out-Null
  New-Item -ItemType Junction -Path "$dst\node_modules" -Target "$O\node_modules" | Out-Null
  $pk = 'apps\api','apps\web','packages\db','packages\engine','packages\schemas','packages\observability','packages\providers','mcp\pathlynks'
  $map = @{ 'db'='packages\db';'engine'='packages\engine';'schemas'='packages\schemas';'providers'='packages\providers';'observability'='packages\observability';'mcp-pathlynks'='mcp\pathlynks' }
  foreach ($p in $pk) {
    $src = "$O\$p\node_modules"; $nm = "$dst\$p\node_modules"
    if (-not (Test-Path $src)) { continue }
    New-Item -ItemType Directory -Path $nm -Force | Out-Null
    foreach ($e in Get-ChildItem $src -Force) {
      if ($e.Name -eq '.bin') { New-Item -ItemType Junction -Path "$nm\.bin" -Target $e.FullName | Out-Null; continue }
      if ($e.LinkType -eq 'Junction') { New-Item -ItemType Junction -Path "$nm\$($e.Name)" -Target ($e.Target | Select-Object -First 1) | Out-Null }
      elseif ($e.PSIsContainer) {
        New-Item -ItemType Directory -Path "$nm\$($e.Name)" -Force | Out-Null
        foreach ($c in Get-ChildItem $e.FullName -Force) {
          $tgt = ($c.Target | Select-Object -First 1)
          if ($e.Name -eq '@vc' -and $map.ContainsKey($c.Name)) { $tgt = "$dst\$($map[$c.Name])" }
          New-Item -ItemType Junction -Path "$nm\$($e.Name)\$($c.Name)" -Target $tgt | Out-Null
        }
      }
    }
  }
  return $dst
}

function Run-Test($dst, $pkg, $targs, $label) {
  Push-Location "$dst\$pkg"
  $r = & $bash /d/vc/scripts/vc-testlock.sh pnpm exec tsx --test @targs 2>&1 | Out-String
  Pop-Location
  $pat = '^(' + [char]0x2139 + ' (tests|pass|fail) |' + [char]0x2716 + ' )'
  $sum = ($r -split "`n" | Where-Object { $_ -match $pat } | ForEach-Object { if ($_.Length -gt 160) { $_.Substring(0,160) } else { $_.Trim() } } | Select-Object -First 8) -join ' | '
  L "[$label] $sum"
}

function Mutate($file, $old, $new) {
  $t = [IO.File]::ReadAllText($file)
  if (-not $t.Contains($old)) { L "MUTATION TARGET NOT FOUND in $file"; return $false }
  [IO.File]::WriteAllText($file, $t.Replace($old, $new))
  return $true
}

$muts = @(
  @{ id='F1-VA1-schema'; pkg='packages\schemas'; file='packages\schemas\src\sources.ts';
     old='  .regex(CREDENTIAL_REF_PATTERN, "must name a PATHLYNKS_* or GITHUB_* environment variable");'; new='  ;';
     runs=@(@{pkg='packages\schemas'; a=@('tests/sources.test.ts','--test-name-pattern','fix1 R1')}, @{pkg='apps\api'; a=@('tests/admin-routes.test.ts','--test-name-pattern','fix1 R1')}) },
  @{ id='F2-VA1-credentialFor'; file='apps\api\src\admin-routes.ts';
     old='if (typeof ref !== "string" || !CREDENTIAL_REF_PATTERN.test(ref)) throw new CredentialRefError();'; new='if (typeof ref !== "string") throw new CredentialRefError();';
     runs=@(@{pkg='apps\api'; a=@('tests/admin-sync.test.ts','--test-name-pattern','fix1 R1: a stored')}, @{pkg='apps\api'; a=@('tests/chk-a-c1.test.ts','--test-name-pattern','legacy stored docs')}) },
  @{ id='F3-VA12-liveport-id'; file='apps\api\src\admin-routes.ts';
     old='const src = await store.sources.get(opts.sourceId ?? PATHLYNKS_POSTGRES_SOURCE_ID);
      if (!src || src.kind !== "postgres") return none;'; new='const src = (await store.sources.list()).find((s) => s.kind === "postgres");
      if (!src) return none;';
     runs=@(@{pkg='apps\api'; a=@('tests/admin-sync.test.ts','--test-name-pattern','fix1 R2: an admin-created')}, @{pkg='apps\api'; a=@('tests/chk-a-c1.test.ts','--test-name-pattern','C1-T8')}) },
  @{ id='F4-VA8-empty-sync'; file='apps\api\src\admin-routes.ts';
     old='if (problem !== undefined) return fail(problem, counts, diagnostics);'; new='if (false as boolean) return fail(problem as string, counts, diagnostics);';
     runs=@(@{pkg='apps\api'; a=@('tests/admin-sync.test.ts','--test-name-pattern','fix1 R6')}) },
  @{ id='F5-VA19-metricsWindow'; file='apps\web\src\app\admin\_lib\format.ts';
     old='to: Number.isFinite(t) ? isoDay(new Date(t + 86_400_000)) : r.to'; new='to: r.to';
     runs=@(@{pkg='apps\web'; a=@('tests/admin-client.test.ts','--test-name-pattern','fix1 R3: a usage row')}, @{pkg='apps\api'; a=@('tests/chk-a-c1p3.test.ts')}) }
)
foreach ($m in $muts) {
  L "=== $($m.id) $($m.file)"
  $dst = Make-Copy $m.id
  foreach ($r in $m.runs) { Run-Test $dst $r.pkg $r.a "BEFORE green expected: $($r.pkg) $($r.a -join ' ')" }
  $ok = Mutate "$dst\$($m.file)" $m.old $m.new
  if ($ok) { foreach ($r in $m.runs) { Run-Test $dst $r.pkg $r.a "AFTER red expected: $($r.pkg) $($r.a -join ' ')" } }
}
L "DONE"
