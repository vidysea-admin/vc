$src='D:\vc'; $dst='C:\Users\Lenovo\AppData\Local\Temp\claude\d--vc\2b04f90e-6b56-4682-a76c-d8515b93405c\scratchpad\t052c2\f36'
New-Item -ItemType Junction -Path "$dst\node_modules" -Target "$src\node_modules" | Out-Null
$pk = Get-ChildItem "$src\apps","$src\packages","$src\mcp" -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path "$($_.FullName)\node_modules" }
foreach ($p in $pk) {
  $rel = $p.FullName.Substring($src.Length+1); $wt = "$dst\$rel"
  if (-not (Test-Path $wt)) { "skip $rel (absent in worktree)"; continue }
  $nm = "$wt\node_modules"; New-Item -ItemType Directory -Force $nm | Out-Null
  foreach ($e in Get-ChildItem "$($p.FullName)\node_modules" -Force) {
    if ($e.Name -eq '.bin') { continue }
    if ($e.LinkType) { $t = [string]$e.Target; New-Item -ItemType Junction -Path "$nm\$($e.Name)" -Target $t | Out-Null; continue }
    New-Item -ItemType Directory -Force "$nm\$($e.Name)" | Out-Null
    foreach ($s in Get-ChildItem $e.FullName -Force) {
      $t = [string]$s.Target
      if ($e.Name -eq '@vc' -and $t.StartsWith("$src\")) { $t = "$dst\" + $t.Substring($src.Length+1) }
      New-Item -ItemType Junction -Path "$nm\$($e.Name)\$($s.Name)" -Target $t | Out-Null
      "$rel $($e.Name)/$($s.Name) -> $t" | Where-Object { $e.Name -eq '@vc' }
    }
  }
}

