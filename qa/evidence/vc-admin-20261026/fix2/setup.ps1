param([string]$Src = "D:\vc\.worktrees\vca-int", [string]$Dst = "C:\Users\Lenovo\AppData\Local\Temp\claude\d--vc\fe5889a6-130f-4952-9226-886a6cea9053\scratchpad\fx2\copy")
$ErrorActionPreference = "Stop"
if (Test-Path $Dst) { cmd /c rmdir /s /q "$Dst" }
New-Item -ItemType Directory -Force $Dst | Out-Null
foreach ($f in Get-ChildItem $Src -File) { Copy-Item $f.FullName $Dst }
foreach ($d in "config") { robocopy "$Src\$d" "$Dst\$d" /E /NFL /NDL /NJH /NJS | Out-Null }
robocopy "$Src\packages\engine\tests\fixtures" "$Dst\packages\engine\tests\fixtures" /E /NFL /NDL /NJH /NJS | Out-Null
foreach ($p in "apps\api", "apps\web", "packages\schemas") {
  robocopy "$Src\$p" "$Dst\$p" /E /XD node_modules .next /NFL /NDL /NJH /NJS | Out-Null
  cmd /c mklink /J "$Dst\$p\node_modules" "$Src\$p\node_modules" | Out-Null
}
cmd /c mklink /J "$Dst\node_modules" "$Src\node_modules" | Out-Null
"copied to $Dst"
