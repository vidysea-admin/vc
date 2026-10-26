$ErrorActionPreference = "Continue"
$root = "C:\Users\Lenovo\AppData\Local\Temp\claude\d--vc\fe5889a6-130f-4952-9226-886a6cea9053\scratchpad\fx2"
$copy = "$root\copy"
$bash = "C:\Program Files\Git\bin\bash.exe"
$muts = @(
  @{ id = "M1-F1-api"; pkg = "apps\api"; file = "apps\api\src\admin-routes.ts"; tests = "tests/admin-routes.test.ts"; pattern = "fix2 F1";
     old = "    const bound = boundEnvRef(src, d.seededSources);`n    if (bound === undefined) throw new NoCredentialError();`n    const value = (d.env ?? process.env)[bound];";
     new = "    const bound = ref;`n    const value = (d.env ?? process.env)[bound];" },
  @{ id = "M1b-F1-schema"; pkg = "packages\schemas"; file = "packages\schemas\src\sources.ts"; tests = "tests/sources.test.ts"; pattern = "fix2 F1";
     old = "    .regex(credentialRefPatternFor(kind), kind";
     new = "    .regex(CREDENTIAL_REF_PATTERN, kind" },
  @{ id = "M2-F2"; pkg = "apps\api"; file = "apps\api\src\admin-routes.ts"; tests = "tests/admin-routes.test.ts tests/admin-auth.test.ts"; pattern = "VA6|fix2 F2";
     old = "    if (!verdict.allowed) {`n      await auditFailedLogin(UNKNOWN_ACTOR);";
     new = "    if (!verdict.allowed) {" },
  @{ id = "M3-F3"; pkg = "apps\web"; file = "apps\web\src\app\admin\_lib\session-handlers.ts"; tests = "tests/admin-session-routes.test.ts"; pattern = "fix2 F3";
     old = "      for (const k of hits.keys()) {`n        if (hits.size < maxKeys) break;`n        hits.delete(k);`n      }";
     new = "      if (hits.size >= maxKeys) return false;" },
  @{ id = "M4-F4"; pkg = "apps\api"; file = "apps\api\src\admin-routes.ts"; tests = "tests/admin-sync.test.ts"; pattern = "fix2 F4";
     old = "            : undefined;`n      if (problem !== undefined) return fail(problem, counts, diagnostics);";
     new = "            : schema.diagnostics.length >= files.length ? `"Too many migration files could not be parsed.`" : undefined;`n      if (problem !== undefined) return fail(problem, counts, diagnostics);" }
)
function RunTests($m) {
  Push-Location "$copy\$($m.pkg)"
  $args2 = @("D:/vc/scripts/vc-testlock.sh", "pnpm", "exec", "tsx", "--test", "--test-name-pattern", $m.pattern) + ($m.tests -split " ")
  $out = & $bash @args2 2>&1 | Out-String
  Pop-Location
  $pass = if ($out -match "(?m)^. pass (\d+)") { [int]$Matches[1] } else { -1 }
  $fail = if ($out -match "(?m)^. fail (\d+)") { [int]$Matches[1] } else { -1 }
  $failed = ([regex]::Matches($out, "(?m)^\S+ (fix2 [^\r\n]{0,90}|VA6[^\r\n]{0,60})") | Where-Object { $_.Value.StartsWith([char]0x2716) } | ForEach-Object { $_.Value }) -join " | "
  return @{ pass = $pass; fail = $fail; failed = $failed }
}
foreach ($m in $muts) {
  & "$root\setup.ps1" | Out-Null
  $before = RunTests $m
  $path = "$copy\$($m.file)"
  $text = [IO.File]::ReadAllText($path)
  $old = $m.old -replace "`r", ""
  $norm = $text -replace "`r`n", "`n"
  if (-not $norm.Contains($old)) { "$($m.id): MUTATION DID NOT APPLY (UNVERIFIED)"; continue }
  [IO.File]::WriteAllText($path, $norm.Replace($old, $m.new))
  $after = RunTests $m
  $verdict = if ($before.fail -eq 0 -and $before.pass -gt 0 -and $after.fail -gt 0) { "KILLED" } else { "SURVIVED/UNVERIFIED" }
  "$($m.id): before pass=$($before.pass) fail=$($before.fail); after pass=$($after.pass) fail=$($after.fail) -> $verdict"
  "   red: $($after.failed)"
}
