# lab-session-start.ps1 -- Lab Protocol SessionStart hook (lifecycle layer)
#
# Fires at session start. If the repo is protocol-active (docs/DECISIONS.md exists),
# injects a CAPPED state snapshot: ARCHITECTURE sections 1-3 + 6, the full decision
# index with COMPUTED effective status (v1.1 option-b: raw headers are never edited;
# supersession is resolved from Supersedes fields), archived REJECTED lines from
# docs/archive/INDEX.md (archive-safe), the last 3 full entries, open tasks by status
# field, and a dirty-state recovery warning when the previous session did not land.
#
# AMD-3 (no double injection): when this is the MACHINE-GLOBAL copy and the repo
# carries its own committed .claude/hooks/lab-session-start.ps1, this copy exits
# silently -- the repo copy owns injection on protocol repos.
#
# Non-protocol repos: silent (the anti-drift hook owns the nudge there).
# Always exits 0; FAILS OPEN (emits nothing) on any error.
# PS 5.1-safe: no -Depth on ConvertFrom-Json, no $home reassignment, pure ASCII.

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

try {
  $cwd = ""
  if (-not [string]::IsNullOrWhiteSpace($inputJson)) {
    try { $event = $inputJson | ConvertFrom-Json; $cwd = [string]$event.cwd } catch { }
  }
  if ([string]::IsNullOrWhiteSpace($cwd)) { $cwd = (Get-Location).Path }
  if (-not (Test-Path -LiteralPath $cwd)) { exit 0 }

  # --- Find repo root (walk up looking for .git; git may not be on PATH in hooks). ---
  $root = ""
  $probe = (Resolve-Path -LiteralPath $cwd).Path
  for ($i = 0; $i -lt 12; $i++) {
    if (Test-Path -LiteralPath (Join-Path $probe ".git")) { $root = $probe; break }
    $parent = Split-Path -Path $probe -Parent
    if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $probe) { break }
    $probe = $parent
  }
  if ([string]::IsNullOrWhiteSpace($root)) { exit 0 }

  $decisionsPath = Join-Path $root "docs\DECISIONS.md"
  if (-not (Test-Path -LiteralPath $decisionsPath)) { exit 0 }   # not protocol-active -> silent

  # --- AMD-3: global copy defers to the repo-committed copy. ---
  $repoCopy = Join-Path $root ".claude\hooks\lab-session-start.ps1"
  $selfPath = $PSCommandPath
  if ((Test-Path -LiteralPath $repoCopy) -and $selfPath) {
    $selfNorm = ($selfPath -replace "/", "\").ToLowerInvariant()
    $rootNorm = (($root -replace "/", "\").TrimEnd("\") + "\").ToLowerInvariant()
    if (-not $selfNorm.StartsWith($rootNorm)) { exit 0 }   # I am the global copy; repo copy owns this repo
  }

  $out = New-Object System.Collections.Generic.List[string]
  $out.Add("=== LAB PROTOCOL ACTIVE (root: $root) ===")

  # --- Dirty-state detect at START (reliable recovery signal). ---
  try {
    $porcelain = & git -C $root status --porcelain 2>$null
    if ($porcelain) {
      $dirtyCount = @($porcelain).Count
      $out.Add("[RECOVERY] Worktree has $dirtyCount uncommitted change(s) -- previous session may not have landed. Run /landplane recovery BEFORE new work.")
    }
    $lastCommitDate = (& git -C $root log -1 --format=%cs 2>$null)
  } catch { $lastCommitDate = "" }

  # --- Parse DECISIONS.md: headers + Supersedes fields -> computed effective status. ---
  # -Encoding UTF8 everywhere: PS 5.1 default misreads BOM-less UTF-8 as ANSI (mojibake).
  $decLines = Get-Content -LiteralPath $decisionsPath -Encoding UTF8 -ErrorAction Stop
  $headerRe = '^## (D-\d+) \| (\d{4}-\d{2}-\d{2}) \| type: (\w+) \| status: (\w+)'
  $entries = @()   # ordered list of @{Id;Date;Type;Status;StartLine}
  for ($ln = 0; $ln -lt $decLines.Count; $ln++) {
    $m = [regex]::Match($decLines[$ln], $headerRe)
    if ($m.Success) {
      $entries += ,@{ Id = $m.Groups[1].Value; Date = $m.Groups[2].Value; Type = $m.Groups[3].Value; Status = $m.Groups[4].Value; StartLine = $ln }
    }
  }
  # Supersedes resolution pass (v1.1 rule 1: D-ids BEFORE the first ' -- ' separator).
  # Indexed loop so the owning entry (nearest header above) is found deterministically
  # even if identical lines repeat in the file.
  $supersededBy = @{}
  for ($ln = 0; $ln -lt $decLines.Count; $ln++) {
    $sm = [regex]::Match($decLines[$ln], '^\*\*Supersedes:\*\*\s*(.+)$')
    if (-not $sm.Success) { continue }
    $body = $sm.Groups[1].Value
    $sepIdx = $body.IndexOf(" -- ")
    $targetPart = if ($sepIdx -ge 0) { $body.Substring(0, $sepIdx) } else { $body }
    $ownerId = ""
    foreach ($e in $entries) { if ($e.StartLine -le $ln) { $ownerId = $e.Id } else { break } }
    foreach ($tm in [regex]::Matches($targetPart, 'D-\d+')) {
      if ($tm.Value -ne $ownerId) { $supersededBy[$tm.Value] = $ownerId }
    }
  }

  # --- Recovery signal 2: commits newer than the last D-entry date. ---
  if ($entries.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace($lastCommitDate)) {
    $lastEntryDate = $entries[$entries.Count - 1].Date
    if ($lastCommitDate -gt $lastEntryDate) {
      $out.Add("[RECOVERY] Last commit ($lastCommitDate) is newer than the last DECISIONS entry ($lastEntryDate) -- work was committed without landing. Run /landplane recovery.")
    }
  }

  # --- ARCHITECTURE.md sections 1-3 + 6 (capped). ---
  $archPath = Join-Path $root "ARCHITECTURE.md"
  if (Test-Path -LiteralPath $archPath) {
    $archLines = Get-Content -LiteralPath $archPath -Encoding UTF8 -ErrorAction Stop
    $keep = New-Object System.Collections.Generic.List[string]
    $inKeep = $false
    foreach ($line in $archLines) {
      if ($line -match '^## ') {
        $inKeep = ($line -match '^## (1|2|3|6)[\.\s]')
      } elseif ($line -match '^# ') { $inKeep = $false }
      if ($inKeep -or $line -match '^# ') { $keep.Add($line) }
      if ($keep.Count -ge 100) { $keep.Add("[... ARCHITECTURE excerpt capped at 100 lines -- read ARCHITECTURE.md for the rest]"); break }
    }
    $out.Add("--- ARCHITECTURE.md (sections 1-3 + 6 Open Questions; ground truth) ---")
    foreach ($l in $keep) { $out.Add($l) }
  } else {
    $out.Add("[WARN] ARCHITECTURE.md missing at repo root -- protocol expects it. Run /init-lab repair.")
  }

  # --- Decision index with COMPUTED status (live file). ---
  $out.Add("--- DECISION INDEX (computed status; raw headers keep write-time status by design) ---")
  foreach ($e in $entries) {
    $eff = $e.Status
    if ($supersededBy.ContainsKey($e.Id)) { $eff = "SUPERSEDED (by " + $supersededBy[$e.Id] + ")" }
    $out.Add(($e.Id + " | " + $e.Date + " | " + $e.Type + " | " + $eff))
  }

  # --- Archived REJECTED lines (decision #12: archive-safe relitigation index). ---
  $idxPath = Join-Path $root "docs\archive\INDEX.md"
  if (Test-Path -LiteralPath $idxPath) {
    # Only real index lines (start with a D-id) -- template prose/comments never leak in.
    $rejLines = @(Get-Content -LiteralPath $idxPath -Encoding UTF8 -ErrorAction SilentlyContinue | Where-Object { $_ -match '^D-\d+\s*\|.*(REJECTED|SUPERSEDED)' })
    if ($rejLines.Count -gt 0) {
      $out.Add("--- ARCHIVED (do NOT re-propose without flagging) ---")
      foreach ($l in $rejLines) { $out.Add($l) }
    }
  }

  # --- Last 3 full entries (capped at 60 lines total). ---
  if ($entries.Count -gt 0) {
    $from = [Math]::Max(0, $entries.Count - 3)
    $startLine = $entries[$from].StartLine
    $tailBlock = $decLines[$startLine..($decLines.Count - 1)]
    if ($tailBlock.Count -gt 60) { $tailBlock = $tailBlock[0..59] + @("[... last-entries excerpt capped at 60 lines]") }
    $out.Add("--- LAST $($entries.Count - $from) ENTRIES (full) ---")
    foreach ($l in $tailBlock) { $out.Add($l) }
  }

  # --- Open tasks by STATUS FIELD (never head-of-file). ---
  $taskLines = @()
  $goalDir = Join-Path $root ".goal"
  $tasksMd = Join-Path $root "TASKS.md"
  if (Test-Path -LiteralPath $goalDir) {
    $taskLines += "(.goal/ tracker present -- run /goal for live task state)"
  } elseif (Test-Path -LiteralPath $tasksMd) {
    $taskLines += @(Get-Content -LiteralPath $tasksMd -Encoding UTF8 -ErrorAction SilentlyContinue |
      Where-Object { $_ -match 'status:\s*(open|in[-_ ]progress)' -or $_ -match '^\s*-\s*\[ \]' } |
      Select-Object -First 10)
  }
  if ($taskLines.Count -gt 0) {
    $out.Add("--- OPEN TASKS (by status field) ---")
    foreach ($l in $taskLines) { $out.Add($l) }
  }

  $out.Add("--- PROTOCOL RULES ---")
  $out.Add("docs/DECISIONS.md is APPEND-ONLY: write entries ONLY via scripts/append_decision.ps1. Never edit ARCHITECTURE.md or contracts/ without an authorizing DECISIONS entry (enforcement paths additionally need Approved-by from the repo Approver). Re-proposing anything REJECTED/SUPERSEDED above without flagging it is a protocol violation. Pick ONE unblocked task. End the session with /landplane.")

  $ctx = ($out -join "`n")
  $payload = [ordered]@{
    hookSpecificOutput = [ordered]@{
      hookEventName     = "SessionStart"
      additionalContext = $ctx
    }
  }
  $payload | ConvertTo-Json -Depth 6 -Compress | ForEach-Object { [regex]::Replace($_, "[^\x00-\x7F]", { param($m) ("\u{0:x4}" -f [int][char]$m.Value) }) } | Write-Output   # ASCII-only JSON: under the harness PowerShell writes stdout in the OEM codepage and non-ASCII becomes 0x1a, which is invalid inside a JSON string (found 2026-09-05)
  exit 0
}
catch {
  exit 0
}
