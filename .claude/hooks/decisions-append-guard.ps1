# decisions-append-guard.ps1 -- Lab Protocol PreToolUse guard (safe-door + hard-wall)
#
# Two protections, both scoped to PROTOCOL-ACTIVE repos (a repo whose root has
# docs/DECISIONS.md -- detected by walking up from the target file):
#
# 1. HARD WALL (deny): Edit/Write/MultiEdit targeting docs/DECISIONS.md is DENIED --
#    the only legitimate write path is scripts/append_decision.ps1 (append-mode only).
#    Rationale (decision #9): "ask" would fire on every legitimate append because the
#    Write tool rewrites whole files -> ask-fatigue -> reflexive approval. Deny + a
#    dedicated append script removes the judgment prompt entirely.
#    Exception: initial creation is allowed when the file does not exist yet (/init-lab).
#
# 2. GUARD THE GUARDS (ask, decision #15): Edit/Write targeting the repo's enforcement
#    files (.claude/hooks/*, scripts/append_decision.ps1, .claude/settings.json) fires
#    an ASK -- edits there are rare (no fatigue) and require an authorizing DECISIONS
#    entry carrying Approved-by from the repo's named Approver (F1). The landplane
#    additions-only audit + compound git-log sweep catch anything that slips through.
#
# Bash-level bypasses (Add-Content, >>) do not hit PreToolUse for file tools -- they
# are caught by the landplane additions-only diff audit and the compound sweep.
# Always exits 0; FAILS OPEN. PS 5.1-safe, pure ASCII.

param(
  [string]$InputJson = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($InputJson)) {
  $reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput())
  $inputJson = $reader.ReadToEnd()
} else {
  $inputJson = $InputJson
}
if ([string]::IsNullOrWhiteSpace($inputJson)) { exit 0 }

try {
  $event = $inputJson | ConvertFrom-Json
} catch {
  exit 0
}

function Emit-Decision([string]$decision, [string]$reason) {
  $payload = [ordered]@{
    hookSpecificOutput = [ordered]@{
      hookEventName            = "PreToolUse"
      permissionDecision       = $decision
      permissionDecisionReason = $reason
    }
  }
  $payload | ConvertTo-Json -Depth 6 -Compress | ForEach-Object { [regex]::Replace($_, "[^\x00-\x7F]", { param($m) ("\u{0:x4}" -f [int][char]$m.Value) }) } | Write-Output   # ASCII-only JSON: under the harness PowerShell writes stdout in the OEM codepage and non-ASCII becomes 0x1a, which is invalid inside a JSON string (found 2026-09-05)
}

try {
  $toolName = [string]$event.tool_name
  if (@("Write", "Edit", "MultiEdit") -notcontains $toolName) { exit 0 }

  $toolInput = $event.tool_input
  if (-not $toolInput) { exit 0 }
  if (-not ($toolInput.PSObject.Properties.Name -contains "file_path")) { exit 0 }
  $rawPath = [string]$toolInput.file_path
  if ([string]::IsNullOrWhiteSpace($rawPath)) { exit 0 }

  $pathNorm = ($rawPath -replace "/", "\")

  # --- Find the protocol root: walk up from the target file's directory looking for docs\DECISIONS.md. ---
  $protocolRoot = ""
  $probe = Split-Path -Path $pathNorm -Parent
  for ($i = 0; $i -lt 12; $i++) {
    if ([string]::IsNullOrWhiteSpace($probe)) { break }
    if (Test-Path -LiteralPath (Join-Path $probe "docs\DECISIONS.md")) { $protocolRoot = $probe; break }
    $parent = Split-Path -Path $probe -Parent
    if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $probe) { break }
    $probe = $parent
  }

  # --- Protection 1: the DECISIONS.md hard wall. ---
  if ($pathNorm -match '\\docs\\DECISIONS\.md$') {
    if (Test-Path -LiteralPath $pathNorm) {
      Emit-Decision "deny" ("docs/DECISIONS.md is APPEND-ONLY (Lab Protocol). Direct Edit/Write is blocked -- append entries ONLY via: powershell -File scripts/append_decision.ps1 -EntryFile <entry.md>  (validates schema + Supersedes reasoning, appends atomically, never touches old entries).")
      exit 0
    }
    exit 0   # initial creation (file absent) -- allowed for /init-lab
  }

  # --- Protection 2: guard the guards (only inside a protocol-active repo). ---
  if (-not [string]::IsNullOrWhiteSpace($protocolRoot)) {
    $rootPrefix = ($protocolRoot.TrimEnd("\") + "\")
    if ($pathNorm.ToLowerInvariant().StartsWith($rootPrefix.ToLowerInvariant())) {
      $rel = $pathNorm.Substring($rootPrefix.Length)
      $relL = $rel.ToLowerInvariant()
      $isEnforcement = ($relL.StartsWith(".claude\hooks\")) -or
                       ($relL -eq "scripts\append_decision.ps1") -or
                       ($relL -eq ".claude\settings.json")
      if ($isEnforcement) {
        Emit-Decision "ask" ("Lab Protocol enforcement file: '" + $rel + "'. Changing enforcement requires an authorizing DECISIONS entry whose Changes-authorized covers this path AND carries Approved-by from the repo's named Approver (see project CLAUDE.md). /landplane will refuse the commit without it. Confirm only if that entry exists or is being prepared.")
        exit 0
      }
    }
  }

  exit 0
}
catch {
  exit 0
}
