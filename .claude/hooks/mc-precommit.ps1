# maker-checker Layer 3 — commit guard (warn, not deny)
$in = [Console]::In.ReadToEnd()
if ($in -match 'git\s+commit') {
  $u = 0
  if (Test-Path 'qa/manifests') {
    $u = (Get-ChildItem 'qa/manifests' -Filter *.md -ErrorAction SilentlyContinue | Select-String -Pattern '(?m)^[\s\-*#>|]*Status:[\s*]*ready-for-check' -List | Measure-Object).Count
  }
  if ($u -gt 0) { Write-Output ("WARN maker-checker: $u unit(s) still awaiting /checker verdict. Commit should follow a PASS.") }
}
exit 0
