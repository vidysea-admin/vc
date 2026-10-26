$ErrorActionPreference = 'Continue'
$S = 'C:\Users\Lenovo\AppData\Local\Temp\claude\d--vc\fe5889a6-130f-4952-9226-886a6cea9053\scratchpad'
$A2 = "$S\a2"
$O = 'D:\vc\.worktrees\vca-int'
$E = "$O\qa\evidence\vc-admin-20261026"
$out = "$A2\falsify-c2.log"
"" | Set-Content $out -Encoding utf8
function L($m) { Add-Content $out $m -Encoding utf8 }

function Mutate($file, $old, $new) {
  $t = [IO.File]::ReadAllText($file)
  if (-not $t.Contains($old)) { L "MUTATION TARGET NOT FOUND in $file"; return $false }
  [IO.File]::WriteAllText($file, $t.Replace($old, $new))
  return $true
}

$muts = @(
  @{ id='M1-VA1-credentialFor-ignores-binding'; file='apps\api\src\admin-routes.ts';
     old="const bound = boundEnvRef(src, d.seededSources);`r`n    if (bound === undefined) throw new NoCredentialError();"; old2="const bound = boundEnvRef(src, d.seededSources);`n    if (bound === undefined) throw new NoCredentialError();"; new='const bound = ref;';
     pkg='apps\api'; tests=@('tests/chk-a-c2.test.ts','--test-name-pattern','C2-NEWID|C2-MUTATE') },
  @{ id='M2-VA12-live-port-ignores-binding'; file='apps\api\src\admin-routes.ts';
     old='const bound = src.hasSecret ? undefined : boundEnvRef(src, opts.seeded);'; new='const bound = src.hasSecret ? undefined : (src.config as { passwordRef?: string }).passwordRef;';
     pkg='apps\api'; tests=@('tests/chk-a-c2.test.ts','--test-name-pattern','C2-MUTATE|C2-LIVE') },
  @{ id='M3-VA1-sslmode-not-compared'; file='apps\api\src\admin-routes.ts';
     old='c.sslmode === seed.sslmode && '; new='';
     pkg='apps\api'; tests=@('tests/chk-a-c2.test.ts','--test-name-pattern','C2-MUTATE') },
  @{ id='M3b-VA1-host-not-compared'; file='apps\api\src\admin-routes.ts';
     old='lower(c.host) === seed.host.toLowerCase() && '; new='';
     pkg='apps\api'; tests=@('tests/chk-a-c2.test.ts','--test-name-pattern','C2-MUTATE') },
  @{ id='M3c-VA1-id-not-compared'; file='apps\api\src\admin-routes.ts';
     old='const seed = seeded?.find((s) => s.id === src.id);'; new='const seed = seeded?.find((s) => s.kind === src.kind);';
     pkg='apps\api'; tests=@('tests/chk-a-c2.test.ts','--test-name-pattern','C2-NEWID') },
  @{ id='M4-VA6-no-audit-on-429'; file='apps\api\src\admin-routes.ts';
     old="await auditFailedLogin(UNKNOWN_ACTOR);`r`n      return respond(429"; old2="await auditFailedLogin(UNKNOWN_ACTOR);`n      return respond(429"; new='return respond(429';
     pkg='apps\api'; tests=@('tests/chk-a-c2.test.ts','--test-name-pattern','C2-VA6$') },
  @{ id='M5-VA8-diagnostics-ge-files'; file='apps\api\src\admin-routes.ts';
     old=": undefined;`r`n      if (problem !== undefined) return fail(problem, counts, diagnostics);"; old2=": undefined;`n      if (problem !== undefined) return fail(problem, counts, diagnostics);"; new=': schema.diagnostics.length >= files.length ? "Too many migration files could not be parsed." : undefined; if (problem !== undefined) return fail(problem, counts, diagnostics);';
     pkg='apps\api'; tests=@('tests/chk-a-c2sync.test.ts') },
  @{ id='M6-guard-fails-closed'; file='apps\web\src\app\admin\_lib\session-handlers.ts';
     old='      for (const k of hits.keys()) {'; new='      if (hits.size >= maxKeys) return false; for (const k of hits.keys()) {';
     pkg='apps\web'; tests=@('tests/chk-a-c2web.test.ts') },
  @{ id='M7-wiring-drop-seededSources-spread'; file='apps\api\src\index.ts';
     old='...(sourcesFile ? { seededSources: sourcesFile.sources } : {}),'; new='';
     pkg='apps\api'; tests=@('tests/chk-a-c2wire.test.ts') },
  @{ id='M8-schema-kind-binding-removed'; file='packages\schemas\src\sources.ts';
     old='return kind === "github" ? GITHUB_REF_PATTERN : PATHLYNKS_REF_PATTERN;'; new='return CREDENTIAL_REF_PATTERN;';
     pkg='apps\api'; tests=@('tests/chk-a-c2.test.ts','--test-name-pattern','C2-NEWID') }
)

foreach ($m in $muts) {
  & "$S\a2-mkcopy.ps1" -Name 'mut' | Out-Null
  $dst = "$A2\mut"
  robocopy "$O\skills" "$dst\skills" /E /NFL /NDL /NJH /NJS /NP | Out-Null
  Copy-Item "$E\checker-a-c2\chk-a-c2.test.ts","$E\checker-a-c2\chk-a-c2sync.test.ts","$E\checker-a-c2\chk-a-c2wire.test.ts" "$dst\apps\api\tests\"
  Copy-Item "$E\checker-a-c2\chk-a-c2web.test.ts" "$dst\apps\web\tests\"
  $ok = Mutate "$dst\$($m.file)" $m.old $m.new
  if (-not $ok -and $m.old2) { $ok = Mutate "$dst\$($m.file)" $m.old2 $m.new }
  if (-not $ok) { L "[$($m.id)] NOT APPLIED"; continue }
  $env:CHK_ROOT = ($dst -replace '\\','/')
  Push-Location "$dst\$($m.pkg)"
  $r = & 'C:\Program Files\Git\bin\bash.exe' /d/vc/scripts/vc-testlock.sh pnpm exec tsx --test @($m.tests) 2>&1 | Out-String
  Pop-Location
  $pat = '^(' + [char]0x2139 + ' (tests|pass|fail) |' + [char]0x2716 + ' )'
  $sum = ($r -split "`n" | Where-Object { $_ -match $pat } | ForEach-Object { if ($_.Length -gt 130) { $_.Substring(0,130) } else { $_.Trim() } } | Select-Object -First 8) -join ' | '
  L "[$($m.id)] $sum"
}
L "DONE $(Get-Date -Format o)"
