# maker-checker Layer 3 - commit guard (warn, not deny)
# 2026-10-16 (Approved-by: Umesh; ISS-054+ISS-056+ISS-095+ISS-084): counts units across the root AND every worktree
# using the shared resolver (LAST status line, MAX cycle, root preferred). Replaces the root-only unanchored scan.
# ==== BEGIN handshake-resolver (ISS-054 + ISS-056 + ISS-084 + ISS-095; Approved-by: Umesh 2026-10-16) ====
# Identical body in mc-sessionstart.ps1, mc-precommit.ps1 and delivery-gate-stop.ps1. Edit all three together.
# Why one block: the readers of this surface were each written separately and each was wrong in its own way
# (anchored bare-word / first-wins / last-wins / beside-the-manifest). The contract below is the one in
# qa/QUEUE.md (ISS-056 residual + ISS-095 + ISS-084).
#   Status      : tiers closing '## Status:' > '**Status:**' header > list-marker > bare. WITHIN a tier the LAST
#                 line wins (a close-out appends a new Status line without removing the stale one). Fenced blocks
#                 are skipped. Case-insensitive, markdown-prefix tolerant.
#   Cycle       : verdict cycle = MAX of every 'Cycle checked' / 'Fix cycle judged' stamp, never positional
#                 (t-017-residuals.md is written newest-first). Manifest cycle = MAX 'Fix cycle:' stamp.
#   Trees       : the main worktree, the current directory and EVERY other worktree (git worktree list, plus
#                 .worktrees/* and .claude/worktrees/*). A verdict may live in a tree other than its manifest's.
#   Copies      : verdict cycle = MAX across all copies; on a tie the ROOT copy (main worktree first) is
#                 authoritative. The manifest of record for a slug is the copy with the highest Fix cycle,
#                 ties to the root copy, so a stale branch copy never overrides a merged root copy while a
#                 worktree-only manifest (t-020, ISS-054) is still seen.
#   Open issues : qa/issues.jsonl is an append-only log of partial updates. Resolve each id by MERGING its rows
#                 in file order, per-field last-value-wins (a row omitting a field does not erase it), then
#                 count ids whose merged status is 'open'. Severity uses the same merge.
function Get-ManifestStatus([string[]]$Lines) {
  $closing = $null; $header = $null; $listed = $null; $bare = $null; $fence = $false
  foreach ($l in $Lines) {
    if (-not (($l.IndexOf('status', [StringComparison]::OrdinalIgnoreCase) -ge 0) -or $l.Contains('```') -or $l.Contains('~~~'))) { continue }   # cheap prefilter
    if ($l -match '^\s*(```|~~~)') { $fence = -not $fence; continue }
    if ($fence) { continue }
    if ($l -match '^##\s+(?:\*\*)?(?:Handshake\s+)?Status(?::\*\*|\*\*:|:)\s*(.*?)\s*$') { $closing = $Matches[1] }
    elseif ($l -match '^\*\*(?:Handshake\s+)?Status(?::\*\*|\*\*:)\s*(.*?)\s*$') { $header = $Matches[1] }   # ISS-056: LAST header line, not the first
    elseif ($l -match '^\s*[-*+]\s+(?:\*\*(?:Handshake\s+)?Status(?::\*\*|\*\*:)|(?:Handshake\s+)?Status:)\s*(.*?)\s*$') { $listed = $Matches[1] }
    elseif ($l -match '^\s*(?:Handshake\s+)?Status:\s*(.*?)\s*$') { $bare = $Matches[1] }
  }
  $s = $closing; if ($null -eq $s) { $s = $header }; if ($null -eq $s) { $s = $listed }; if ($null -eq $s) { $s = $bare }
  if ($null -eq $s) { return 'none' }
  if ($s -match '(?i)closed-as-delivered|superseded|stalled') { return 'closed' }
  if ($s -match '(?i)^ready-for-check\b') { return 'ready-for-check' }
  return 'other'
}
# Markdown code is not a stamp (same rules as Strip-Code in delivery-gate-stop.ps1, ISS-192/205).
function Strip-HsCode([string]$t) {
  if ($null -eq $t) { return '' }
  $t = [regex]::Replace($t, '```.*?```', '~', 'Singleline')
  $t = [regex]::Replace($t, '(?ms)^[ \t]*~~~.*?(?:^[ \t]*~~~[ \t]*$|\z)', '~')
  $t = [regex]::Replace($t, '(?ms)^[ \t]*```.*\z', '~')
  $t = [regex]::Replace($t, '`[^`]*`', '~', 'Singleline')
  return [regex]::Replace($t, '(?m)^(?:[ ]{4,}|\t).*$', '~')
}
# Ordered, de-duplicated list of working trees that carry qa/manifests or qa/verdicts. Index 0 = the ROOT
# (main worktree), then the current directory, then every other worktree. Reads .git metadata directly (no git
# process: a spawn costs seconds on this machine and the hooks have a 15 s budget).
function Get-QaTrees([string]$Cwd) {
  $cand = New-Object System.Collections.Generic.List[string]
  $reg = New-Object System.Collections.Generic.List[string]
  $main = $Cwd
  try {
    $g = Join-Path $Cwd '.git'
    $common = $null
    if ([IO.Directory]::Exists($g)) { $common = $g }
    elseif ([IO.File]::Exists($g)) {
      $first = ([IO.File]::ReadAllLines($g) | Select-Object -First 1)
      if ($first -match '^gitdir:\s*(.+?)\s*$') {
        $gd = [IO.Path]::GetFullPath($Matches[1])                      # <main>\.git\worktrees\<name>
        $common = [IO.Path]::GetFullPath((Join-Path $gd '..\..'))      # <main>\.git
      }
    }
    if ($common) {
      $main = Split-Path -Parent $common
      $wt = Join-Path $common 'worktrees'
      if ([IO.Directory]::Exists($wt)) {
        $wds = [IO.Directory]::GetDirectories($wt); [Array]::Sort($wds)
        foreach ($wd in $wds) {
          $gf = Join-Path $wd 'gitdir'
          if ([IO.File]::Exists($gf)) {
            $p = ([IO.File]::ReadAllLines($gf) | Select-Object -First 1)
            if ($p) { $p = $p.Trim() -replace '[\/]\.git$', ''; $reg.Add($p) }
          }
        }
      }
    }
  } catch {}
  $cand.Add($main); $cand.Add($Cwd)
  foreach ($r in $reg) { $cand.Add($r) }
  foreach ($sub in @('.worktrees', '.claude\worktrees')) {
    $d = Join-Path $main $sub
    if ([IO.Directory]::Exists($d)) {
      $xs = [IO.Directory]::GetDirectories($d); [Array]::Sort($xs)
      foreach ($x in $xs) { $cand.Add($x) }
    }
  }
  $seen = @{}; $out = New-Object System.Collections.Generic.List[string]
  foreach ($c in $cand) {
    try { $full = [IO.Path]::GetFullPath($c).TrimEnd('\', '/') } catch { continue }
    $k = $full.ToLowerInvariant()
    if ($seen.ContainsKey($k)) { continue }
    $seen[$k] = $true
    if ([IO.Directory]::Exists((Join-Path $full 'qa\manifests')) -or [IO.Directory]::Exists((Join-Path $full 'qa\verdicts'))) { $out.Add($full) }
  }
  return $out.ToArray()   # callers wrap in @() so a single tree stays an array
}
# Returns Ready / Pending / Unclosed / FixGap (slug arrays) resolved across every tree.
function Resolve-Handshake([string]$Cwd, [int]$BudgetMs = 8000) {
  $clock = [Diagnostics.Stopwatch]::StartNew(); $truncated = $false
  $trees = @(Get-QaTrees $Cwd)
  $man = @{}; $stCache = @{}; $keyCache = @{}; $vCache = @{}
  for ($i = 0; $i -lt $trees.Count; $i++) {
    if ($i -gt 0 -and $clock.ElapsedMilliseconds -gt $BudgetMs) { $truncated = $true; break }   # 15 s hook budget: never trade the root answer for a slow worktree scan; flagged PARTIAL
    $md = Join-Path $trees[$i] 'qa\manifests'
    if (-not [IO.Directory]::Exists($md)) { continue }
    $mfiles = @(); try { $mfiles = [IO.Directory]::GetFiles($md, '*.md') } catch { continue }
    foreach ($fp in $mfiles) {
      $txt = $null; try { $txt = [IO.File]::ReadAllText($fp) } catch { continue }
      if ($null -eq $txt) { continue }
      $slug = [IO.Path]::GetFileNameWithoutExtension($fp)
      if (-not $man.ContainsKey($slug)) { $man[$slug] = New-Object System.Collections.Generic.List[object] }
      # Cheap gate: a copy that never mentions ready-for-check cannot BE at ready-for-check (status needs no parse).
      $st = 'other'
      if (($txt.IndexOf('eady-for-check', [StringComparison]::Ordinal) -ge 0) -or ($txt.IndexOf('EADY-FOR-CHECK', [StringComparison]::Ordinal) -ge 0)) {
        $ck = "{0}:{1}" -f $txt.Length, $txt.GetHashCode()
        if ($stCache.ContainsKey($ck) -and [string]::Equals($stCache[$ck].Text, $txt, [StringComparison]::Ordinal)) { $st = $stCache[$ck].Status }
        else { $st = Get-ManifestStatus ($txt -split '\r?\n'); $stCache[$ck] = [pscustomobject]@{ Text = $txt; Status = $st } }   # worktree copies are mostly byte-identical: parse each distinct text once
      }
      $man[$slug].Add([pscustomobject]@{ Idx = $i; Status = $st; Text = $txt; Known = $false; Key = -1 })
    }
  }
  # Fix cycle is parsed only for slugs where some copy is at ready-for-check (the only ones that can count).
  foreach ($slug in @($man.Keys)) {
    $anyReady = $false; foreach ($c in $man[$slug]) { if ($c.Status -eq 'ready-for-check') { $anyReady = $true; break } }
    foreach ($c in $man[$slug]) {
      if ($anyReady) {
        $ck = "{0}:{1}" -f $c.Text.Length, $c.Text.GetHashCode()
        if (-not ($keyCache.ContainsKey($ck) -and [string]::Equals($keyCache[$ck].Text, $c.Text, [StringComparison]::Ordinal))) {
          $plain = Strip-HsCode ($c.Text -replace '\*\*', '')
          $kn = $false; $kk = -1
          foreach ($mm in [regex]::Matches($plain, '(?m)^[\s\-*#>|]*Fix cycle:[^\S\r\n]*(\d+)')) {
            $n = 0; if ([int]::TryParse($mm.Groups[1].Value, [ref]$n)) { $kn = $true; if ($n -gt $kk) { $kk = $n } }
          }
          $keyCache[$ck] = [pscustomobject]@{ Text = $c.Text; Known = $kn; Key = $kk }
        }
        $c.Known = $keyCache[$ck].Known; $c.Key = $keyCache[$ck].Key
      }
      $c.Text = $null
    }
    if (-not $anyReady) { $man.Remove($slug) }
  }
  $ready = @(); $pending = @(); $unclosed = @(); $fixgap = @()
  foreach ($slug in ($man.Keys | Sort-Object)) {
    $rec = @($man[$slug] | Sort-Object @{ Expression = { $_.Key }; Descending = $true }, @{ Expression = { $_.Idx }; Descending = $false })[0]
    if ($rec.Status -ne 'ready-for-check') { continue }
    $ready += $slug
    $mcEff = [int]::MaxValue; if ($rec.Known) { $mcEff = $rec.Key }   # unreadable Fix cycle -> PENDING (noisy beats silent)
    $vcs = @()
    for ($i = 0; $i -lt $trees.Count; $i++) {
      $vp = Join-Path $trees[$i] ("qa\verdicts\{0}.md" -f $slug)
      if (-not [IO.File]::Exists($vp)) { continue }
      $vt = $null; try { $vt = [IO.File]::ReadAllText($vp) } catch { continue }
      if ($null -eq $vt) { continue }
      $ck = "{0}:{1}" -f $vt.Length, $vt.GetHashCode()
      if (-not ($vCache.ContainsKey($ck) -and [string]::Equals($vCache[$ck].Text, $vt, [StringComparison]::Ordinal))) {
        $vp2 = Strip-HsCode ($vt -replace '\*\*', '')
        $vc = -1
        foreach ($mm in [regex]::Matches($vp2, '(?im)(?:^|\()[\s\-*#>|]*(?:Cycle checked|Fix cycle judged):?[^\S\r\n]*(\d+)')) {
          $n = 0; if ([int]::TryParse($mm.Groups[1].Value, [ref]$n)) { if ($n -gt $vc) { $vc = $n } }
        }
        $vCache[$ck] = [pscustomobject]@{ Text = $vt; Cycle = $vc; Pass = [bool]($vp2 -match '(?im)^[\s\-*#>|]*VERDICT:?\s*PASS') }
      }
      $vcs += [pscustomobject]@{ Idx = $i; Cycle = $vCache[$ck].Cycle; Pass = $vCache[$ck].Pass }
    }
    if ($vcs.Count -eq 0) { $pending += $slug; continue }
    $best = @($vcs | Sort-Object @{ Expression = { $_.Cycle }; Descending = $true }, @{ Expression = { $_.Idx }; Descending = $false })[0]
    if ($best.Cycle -lt $mcEff) { $pending += $slug }
    elseif ($best.Pass) { $unclosed += $slug }
    else { $fixgap += $slug }
  }
  return [pscustomobject]@{ Truncated = $truncated; Trees = $trees; Ready = $ready; Pending = $pending; Unclosed = $unclosed; FixGap = $fixgap }
}
# ISS-084. Distinct ids, merged in file order, per-field last-value-wins. Returns Open (int), Total (ids),
# Rows, SevText (open ids by merged severity).
function Get-OpenIssueSummary([string]$Path) {
  $st = @{}; $sv = @{}; $rows = 0
  foreach ($line in [IO.File]::ReadLines($Path)) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $id = $null; $s = $null; $v = $null
    try {
      $o = $line | ConvertFrom-Json
      if ($null -ne $o) {
        if ($null -ne $o.id) { $id = [string]$o.id }
        if ($null -ne $o.status) { $s = [string]$o.status }
        if ($null -ne $o.severity) { $v = [string]$o.severity }
      }
    } catch {
      if ($line -match '"id"\s*:\s*"((?:[^"\\]|\\.)*)"') { $id = $Matches[1] }
      if ($line -match '"status"\s*:\s*"((?:[^"\\]|\\.)*)"') { $s = $Matches[1] }
      if ($line -match '"severity"\s*:\s*"((?:[^"\\]|\\.)*)"') { $v = $Matches[1] }
    }
    if ([string]::IsNullOrWhiteSpace($id)) { continue }
    $rows++
    $id = $id.Trim()
    if (-not $st.ContainsKey($id)) { $st[$id] = ''; $sv[$id] = '' }
    if (-not [string]::IsNullOrWhiteSpace($s)) { $st[$id] = $s.Trim().ToLowerInvariant() }
    if (-not [string]::IsNullOrWhiteSpace($v)) { $sv[$id] = $v.Trim().ToLowerInvariant() }
  }
  $open = 0; $by = @{}
  foreach ($k in $st.Keys) {
    if ($st[$k] -eq 'open') {
      $open++
      $sk = $sv[$k]; if ([string]::IsNullOrEmpty($sk)) { $sk = 'unrated' }
      if ($by.ContainsKey($sk)) { $by[$sk]++ } else { $by[$sk] = 1 }
    }
  }
  $parts = @(); foreach ($sk in ($by.Keys | Sort-Object)) { $parts += ("{0} {1}" -f $sk, $by[$sk]) }
  $txt = ''; if ($parts.Count) { $txt = ' (by severity: ' + ($parts -join ', ') + ')' }
  return [pscustomobject]@{ Open = $open; Total = $st.Count; Rows = $rows; SevText = $txt; Severity = $by }
}
# ==== END handshake-resolver ====
$in = [Console]::In.ReadToEnd()
if ($in -match 'git\s+commit') {
  $u = 0
  try { $u = @((Resolve-Handshake (Get-Location).Path).Ready).Count } catch { $u = 0 }
  if ($u -gt 0) { Write-Output ("WARN maker-checker: $u unit(s) still awaiting /checker verdict. Commit should follow a PASS.") }
}
exit 0
