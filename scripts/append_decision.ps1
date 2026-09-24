# append_decision.ps1 -- the ONLY legitimate write path to docs/DECISIONS.md
#
# Lab Protocol safe-door (decision #9): validates one entry against the B3 schema +
# the v1.1 Section-1 resolver contract, then appends it atomically. NEVER modifies
# existing content -- supersession is expressed solely by the NEW entry's Supersedes
# field; effective status is computed by consumers (injector/archive), decision #14.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/append_decision.ps1 -EntryFile <path-to-entry.md> [-RepoRoot <path>]
#
# Validations (all failures exit 1 with "APPEND-DECISION REFUSED:"):
#   V1  entry contains exactly one entry (one '## D-' header, first non-empty line)
#   V2  header format: ## D-NNN | YYYY-MM-DD | type: decision|experiment|fix|session | status: ACTIVE|REJECTED
#       (v1.1 rule 4: SUPERSEDED is NEVER a write-time status -- computed only)
#   V3  sequential ID: exactly max(existing live + archived IDs) + 1; never reused
#   V4  required fields: **What:**, **Why:**, **Result:**, **Links:**
#   V5  type experiment -> **Verdict:** required (PROCEED/ROLLBACK/PIVOT)
#   V6  if **Supersedes:** present -> v1.1 rule 1 format: 'D-NNN[, D-NNN] -- <reasoning>'
#       (ASCII ' -- ' separator; >= 20 chars of comparative reasoning; targets must
#       exist; no self-reference)
#   V7  F1: if **Changes-authorized:** references an enforcement path
#       (.claude/hooks, append_decision.ps1, .claude/settings.json) -> **Approved-by:** required
#
# PS 5.1-safe, pure ASCII. Exit 0 = appended; exit 1 = refused; exit 2 = usage error.

param(
  [Parameter(Mandatory = $true)][string]$EntryFile,
  [string]$RepoRoot = ""
)

$ErrorActionPreference = "Stop"

function Refuse([string]$msg) {
  Write-Output ("APPEND-DECISION REFUSED: " + $msg)
  exit 1
}

# --- Resolve repo root (default: parent of this script's folder -- script lives at <root>/scripts/). ---
if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = Split-Path -Path $PSScriptRoot -Parent
}
if (-not (Test-Path -LiteralPath $RepoRoot)) { Write-Output "APPEND-DECISION USAGE ERROR: repo root not found: $RepoRoot"; exit 2 }
$decisionsPath = Join-Path $RepoRoot "docs\DECISIONS.md"
if (-not (Test-Path -LiteralPath $decisionsPath)) { Write-Output "APPEND-DECISION USAGE ERROR: $decisionsPath does not exist (run /init-lab first)"; exit 2 }
if (-not (Test-Path -LiteralPath $EntryFile)) { Write-Output "APPEND-DECISION USAGE ERROR: entry file not found: $EntryFile"; exit 2 }

$entryRaw = Get-Content -LiteralPath $EntryFile -Raw
if ([string]::IsNullOrWhiteSpace($entryRaw)) { Refuse "entry file is empty" }
$entryText = $entryRaw.Trim()
$entryLines = $entryText -split "`r?`n"

# --- V1: exactly one entry, header first. ---
$headerLines = @($entryLines | Where-Object { $_ -match '^## D-\d+' })
if ($headerLines.Count -ne 1) { Refuse "entry must contain exactly ONE '## D-NNN' header (found $($headerLines.Count))" }
if ($entryLines[0] -notmatch '^## D-\d+') { Refuse "the '## D-NNN' header must be the first line of the entry" }

# --- V2: header format + write-time status set. ---
$headerRe = '^## (D-\d{3,}) \| (\d{4}-\d{2}-\d{2}) \| type: (decision|experiment|fix|session) \| status: (\w+)\s*$'
$hm = [regex]::Match($entryLines[0], $headerRe)
if (-not $hm.Success) { Refuse "header must match '## D-NNN | YYYY-MM-DD | type: decision|experiment|fix|session | status: ...' -- got: $($entryLines[0])" }
$newId   = $hm.Groups[1].Value
$newType = $hm.Groups[3].Value
$newStatus = $hm.Groups[4].Value
if (@("ACTIVE", "REJECTED") -notcontains $newStatus) {
  Refuse "write-time status must be ACTIVE or REJECTED. 'SUPERSEDED' is never written into the raw file -- it is COMPUTED by consumers from Supersedes fields (v1.1 rule 4). Got: $newStatus"
}

# --- Collect existing IDs: live file + archive INDEX (IDs are never reused, even after archiving). ---
$existingIds = New-Object System.Collections.Generic.List[int]
$liveLines = Get-Content -LiteralPath $decisionsPath
foreach ($l in $liveLines) {
  $m = [regex]::Match($l, '^## D-(\d+) \|')
  if ($m.Success) { $existingIds.Add([int]$m.Groups[1].Value) }
}
$idxPath = Join-Path $RepoRoot "docs\archive\INDEX.md"
if (Test-Path -LiteralPath $idxPath) {
  foreach ($l in (Get-Content -LiteralPath $idxPath -Encoding UTF8)) {
    # Anchored like the injector: only REAL index lines count (never comments/prose).
    $m = [regex]::Match($l, '^D-(\d+)\s*\|')
    if ($m.Success) { $existingIds.Add([int]$m.Groups[1].Value) }
  }
}

# --- V3: strictly sequential ID. ---
$newNum = [int]($newId -replace 'D-', '')
$maxNum = -1
if ($existingIds.Count -gt 0) { $maxNum = ($existingIds | Measure-Object -Maximum).Maximum }
$expected = $maxNum + 1
if ($newNum -ne $expected) {
  $expectedId = "D-" + $expected.ToString("000")
  Refuse "ID must be strictly sequential: expected $expectedId (max existing is D-$($maxNum.ToString('000'))), got $newId. IDs are never reused, even after archiving."
}

# --- V4: required fields. ---
foreach ($field in @('\*\*What:\*\*', '\*\*Why:\*\*', '\*\*Result:\*\*', '\*\*Links:\*\*')) {
  if (-not ($entryText -match $field)) {
    $pretty = $field -replace '\\\*', '*'
    Refuse "required field missing: $pretty"
  }
}

# --- V5: experiments need a Verdict. ---
if ($newType -eq "experiment" -and -not ($entryText -match '\*\*Verdict:\*\*\s*(PROCEED|ROLLBACK|PIVOT)')) {
  Refuse "type 'experiment' requires '**Verdict:** PROCEED|ROLLBACK|PIVOT -- <reasoning>' approved by the repo's named Approver"
}

# --- V6: Supersedes format (v1.1 rule 1) + target existence. ---
$supLine = ($entryLines | Where-Object { $_ -match '^\*\*Supersedes:\*\*' } | Select-Object -First 1)
if ($supLine) {
  $supBody = ($supLine -replace '^\*\*Supersedes:\*\*\s*', '')
  $sepIdx = $supBody.IndexOf(" -- ")
  if ($sepIdx -lt 0) { Refuse "Supersedes must use the ASCII ' -- ' separator: '**Supersedes:** D-NNN[, D-NNN] -- <comparative reasoning>' (v1.1 rule 1)" }
  $targetPart = $supBody.Substring(0, $sepIdx)
  $reasonPart = $supBody.Substring($sepIdx + 4).Trim()
  $targets = @([regex]::Matches($targetPart, 'D-(\d+)') | ForEach-Object { [int]$_.Groups[1].Value })
  if ($targets.Count -eq 0) { Refuse "Supersedes names no D-NNN target before the ' -- ' separator" }
  if ($reasonPart.Length -lt 20) { Refuse "Supersedes reasoning too thin ('$reasonPart'). State why the old approach was removed AND why the new one is better -- comparative reasoning is mandatory" }
  foreach ($t in $targets) {
    if ($t -eq $newNum) { Refuse "an entry cannot supersede itself (D-$($t.ToString('000')))" }
    if ($existingIds -notcontains $t) { Refuse "Supersedes target D-$($t.ToString('000')) does not exist in the live log or archive INDEX" }
  }
}

# --- V7: F1 -- enforcement-path authorization needs human approval. ---
$caMatch = [regex]::Match($entryText, '(?s)\*\*Changes-authorized:\*\*(.*?)(\r?\n\*\*[A-Z][\w-]*:\*\*|$)')
if ($caMatch.Success) {
  $caText = $caMatch.Groups[1].Value.ToLowerInvariant()
  $enforcementSignals = @(".claude/hooks", ".claude\hooks", "append_decision.ps1", ".claude/settings.json", ".claude\settings.json")
  $touchesEnforcement = $false
  foreach ($sig in $enforcementSignals) { if ($caText.Contains($sig)) { $touchesEnforcement = $true; break } }
  if ($touchesEnforcement -and -not ($entryText -match '\*\*Approved-by:\*\*\s*\S')) {
    Refuse "Changes-authorized touches an ENFORCEMENT path (.claude/hooks / append_decision.ps1 / .claude/settings.json) -- '**Approved-by:** <Approver>' is mandatory and may be recorded only after explicit confirmation from the repo's named Approver (F1: authorization is not approval)"
  }
}

# --- All validations passed: append atomically, never touching existing bytes. ---
$existingRaw = Get-Content -LiteralPath $decisionsPath -Raw
$prefix = ""
if ($existingRaw.Length -gt 0 -and -not $existingRaw.EndsWith("`n")) { $prefix = "`r`n" }
$toAppend = $prefix + "`r`n" + $entryText + "`r`n"
[System.IO.File]::AppendAllText($decisionsPath, $toAppend, (New-Object System.Text.UTF8Encoding($false)))

Write-Output ("APPENDED: " + $newId + " | type: " + $newType + " | status: " + $newStatus + " -> " + $decisionsPath)
exit 0
