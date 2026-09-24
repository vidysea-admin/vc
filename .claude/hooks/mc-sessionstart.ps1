# maker-checker Layer 2 — session-start directive (pending-state aware, AUTO-CONTINUE)
# SessionStart stdout is injected into the agent's context — a directive here is read as an
# instruction, not just a status line. Adjust $LEDGER if the project's ledger differs.
$LEDGER = 'qa/issues.jsonl'
if (-not (Test-Path $LEDGER) -and (Test-Path 'qa/QA-ISSUES.jsonl')) { $LEDGER = 'qa/QA-ISSUES.jsonl' }
$ROOT = (Get-Location).Path
$n = -1
if (Test-Path $LEDGER) { $n = @(Get-Content $LEDGER | Where-Object { $_ -match '"status":\s*"(open|Open)"' }).Count }
# Pending handshake (cycle-aware): ready-for-check with no verdict, or a verdict for an older
# cycle, or a PASS verdict whose manifest was never flipped to checked-PASS.
# Dual-check siblings (qa/verdicts/<slug>.b.md, CRITICAL units — maker cycle step 7b/8b) are
# deliberately NOT tracked here: the primary verdict drives pending-detection; the maker's step 8b
# reconciles the pair. Gate files (qa/gates/<slug>.md without an `Answered:` line) are surfaced by
# sweep check 6, not by this hook.
$pending = @(); $unclosed = @()
if (Test-Path 'qa/manifests') {
  foreach ($m in Get-ChildItem 'qa/manifests' -Filter *.md -ErrorAction SilentlyContinue) {
    $v = "qa/verdicts/" + $m.Name
    if (-not (Select-String -Path $m.FullName -Pattern '(?m)^[\s\-*#>|]*Status:[\s*]*ready-for-check' -Quiet)) { continue }
    if (-not (Test-Path $v)) { $pending += $m.BaseName; continue }
    # MC-019. An UNREADABLE Fix cycle used to default to 0, so ($vc -lt $mc) was 0 -lt 0 = False and
    # the unit went UNCOUNTED -- a silent gate, the one failure direction that must never happen.
    # Unknown now means PENDING, mirroring delivery-gate-stop.ps1:166-168. Noisy beats silent.
    $mc = [int]::MaxValue; $a = Select-String -Path $m.FullName -Pattern 'Fix cycle[:*\s]+(\d+)' | Select-Object -First 1
    if ($a) { $mc = [int]$a.Matches[0].Groups[1].Value }
    $vc = -1; $b = Select-String -Path $v -Pattern '(Cycle checked|Fix cycle judged)[:*\s]+(\d+)' | Select-Object -First 1
    if ($b) { $vc = [int]$b.Matches[0].Groups[2].Value }
    if ($vc -lt $mc) { $pending += $m.BaseName; continue }
    if (Select-String -Path $v -Pattern 'VERDICT:\s*PASS' -Quiet) { $unclosed += $m.BaseName }
  }
}
$queue = 0
# MC-020. The reader counted '| TODO |' table cells; the sweep WRITES '- [ ] TODO' checklist rows.
# Writer and reader disagreed by construction, so $queue was always 0 and fed $backlog/$asleep.
if (Test-Path 'qa/QUEUE.md') { $queue = @(Select-String -Path 'qa/QUEUE.md' -Pattern '(?m)^(?:\s*[-*]\s*\[ ?\]\s*TODO\b|.*\|\s*TODO\s*\|)').Count }
function AgeMin($f) { if (Test-Path $f) { [int]((Get-Date) - (Get-Item $f).LastWriteTime).TotalMinutes } else { -1 } }
$tickAge = AgeMin 'qa/.last-tick'; $sweepAge = AgeMin 'qa/.last-sweep'
$tickTxt = 'NEVER'; if ($tickAge -ge 0) { $tickTxt = "$tickAge min ago" }
$sweepTxt = 'NEVER'; if ($sweepAge -ge 0) { $sweepTxt = "$sweepAge min ago" }
$backlog = ($n -gt 0) -or ($queue -gt 0) -or ($pending.Count -gt 0) -or ($unclosed.Count -gt 0)
$asleep = $backlog -and (($tickAge -lt 0) -or ($tickAge -gt 120))
$openTxt = 'UNKNOWN (no ledger)'; if ($n -ge 0) { $openTxt = "$n" }
$pendTxt = ''; if ($pending.Count) { $pendTxt = ' [' + ($pending -join ', ') + ']' }
Write-Output ("MAKER-CHECKER ACTIVE: substantive dev work routes through /maker (say 'normal' to opt out). Open issues: $openTxt | Checks pending: $($pending.Count)$pendTxt | PASS not closed out: $($unclosed.Count) | Queue TODO: $queue | Last tick: $tickTxt | Last sweep: $sweepTxt | Ledger: $LEDGER")
if (Test-Path 'qa/.paused') {
  Write-Output ("PAUSED by user: " + (Get-Content 'qa/.paused' -TotalCount 1) + " - auto-continue SUSPENDED. Do not run /maker continue; the user lifts it with /maker resume (or by deleting qa/.paused).")
} elseif ($pending.Count -or $unclosed.Count -or $asleep -or ($sweepAge -lt 0) -or ($sweepAge -gt 120)) {
  Write-Output ("AUTO-CONTINUE REQUIRED: pending maker-checker state found. Run /maker continue " + [char]34 + $ROOT + [char]34 + " BEFORE anything else this session (it reconciles close-outs, dispatches pending checks and the due sweep, then pulls the next unit and self-continues via ScheduleWakeup). Do not wait to be asked.")
}
exit 0
