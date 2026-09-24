# lab-session-end.ps1 -- Lab Protocol SessionEnd hook (best-effort backstop)
#
# Fires when a session ends GRACEFULLY. Warns if a protocol repo is being left with
# uncommitted work (i.e., /landplane was skipped). This is deliberately the WEAK layer:
# crashes / terminal kills / sleep never fire it -- the RELIABLE detector is the
# dirty-state check inside lab-session-start.ps1, which flags unlanded state at the
# NEXT session start. (Step 0 verification 2026-07-10: SessionEnd is listed in the
# Claude Code hook lifecycle but its payload is undocumented -- so this script assumes
# nothing about stdin, reads defensively, and emits plain text only.)
#
# Always exits 0; FAILS OPEN on any error. PS 5.1-safe, pure ASCII.

param(
  [string]$InputJson = ""
)

$ErrorActionPreference = "Stop"

try {
  if ([string]::IsNullOrWhiteSpace($InputJson)) {
    try {
      $reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput())
      $InputJson = $reader.ReadToEnd()
    } catch { }
  }

  $cwd = ""
  if (-not [string]::IsNullOrWhiteSpace($InputJson)) {
    try { $event = $InputJson | ConvertFrom-Json; $cwd = [string]$event.cwd } catch { }
  }
  if ([string]::IsNullOrWhiteSpace($cwd)) { $cwd = (Get-Location).Path }
  if (-not (Test-Path -LiteralPath $cwd)) { exit 0 }

  # Walk up to repo root.
  $root = ""
  $probe = (Resolve-Path -LiteralPath $cwd).Path
  for ($i = 0; $i -lt 12; $i++) {
    if (Test-Path -LiteralPath (Join-Path $probe ".git")) { $root = $probe; break }
    $parent = Split-Path -Path $probe -Parent
    if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $probe) { break }
    $probe = $parent
  }
  if ([string]::IsNullOrWhiteSpace($root)) { exit 0 }
  if (-not (Test-Path -LiteralPath (Join-Path $root "docs\DECISIONS.md"))) { exit 0 }

  $porcelain = & git -C $root status --porcelain 2>$null
  if ($porcelain) {
    $dirtyCount = @($porcelain).Count
    Write-Output "LAB PROTOCOL: session ending with $dirtyCount uncommitted change(s). Run /landplane (decision entry -> authorized state updates -> verification -> commit -> handoff) before you go. If you quit anyway, the next session start will flag this for recovery."
  }
  exit 0
}
catch {
  exit 0
}
