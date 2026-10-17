HOOKS: PASS

Checker: c4-hook-bundle-checker (independent; did not build the bundle). Checked 2026-10-17T07:11+05:30. Nothing under any .claude directory was written; all runs used scratch dirs and a redirected TEMP.

## (1) Diff vs live originals
- Parse check of all 5 replacements with the PowerShell parser: 0 errors each.
- The resolver block (BEGIN/END handshake-resolver) is byte-identical across all 5 files (one sha1, count 5).
- Outside the block, the only changes per file:
  - vc/mc-sessionstart.ps1 and ai_os/mc-sessionstart.ps1: the ledger count line now calls Get-OpenIssueSummary, the per-manifest loop is replaced by Resolve-Handshake, and the output line gains the severity text and an optional "Tree scan: PARTIAL" note. Nothing else differs (ai_os keeps Holds and tick logic).
  - vc/mc-precommit.ps1 and ai_os/mc-precommit.ps1: the root-only Status scan is replaced by `Resolve-Handshake (Get-Location).Path`.Ready count. The ai_os file's duplicate Get-ManifestStatus is removed in favour of the shared block. ai_os is CRLF in both the original and the replacement, and the vc files are LF.
  - ai_os/delivery-gate-stop.ps1: the standalone Get-ManifestStatus is removed (the shared one replaces it), and the MAKER predicate's per-manifest loop is replaced by `Resolve-Handshake $cwd` feeding pend/unclosed/fixgap. The rest (ROUNDCAP, markers, other predicates) is untouched.
- grep of the new code for Invoke-WebRequest/RestMethod, curl, Start-Process, iex, Net.*, Set/Add-Content, Out-File, New/Remove/Copy/Move-Item, WriteAll: no hits in the resolver block. It only reads (ReadAllText/ReadAllLines/GetFiles/GetDirectories, .git metadata) and spawns no process. Pre-existing marker writes under TEMP in the Stop hook are unchanged. No command injection surface: paths are never passed to a shell or Invoke-Expression.
- Non-blocking observation: Resolve-Handshake in the Stop hook is not wrapped in its own try. The hooks fail open, so an exception there would only lose that one predicate. (Session-start and pre-commit do wrap it.)

## (2) Own oracle (C:/.../scratchpad/c4/c4_oracle.py, fresh Python, uses `git worktree list`) vs hooks on live D:/vc
Oracle: 19 git worktrees, 19 with qa; open 150 (high 25 / medium 58 / low 67), 299 ids from 626 rows; ready = [t-010-live-cards, t-049-b1-recovery]; pending 0; unclosed [t-049-b1-recovery]; fixgap [t-010-live-cards].
- vc/mc-sessionstart.ps1: "Open issues: 150 (by severity: high 25, low 67, medium 58) | Checks pending: 0 | PASS not closed out: 1". Matches. The original printed 322 / 0 / 0.
- ai_os/mc-sessionstart.ps1: same three numbers. Matches.
- vc and ai_os mc-precommit.ps1: "WARN ... 2 unit(s)". Matches the oracle's ready=2. Silent on a non-commit command. The originals are silent.
- delivery-gate-stop.ps1 (TEMP redirected, cwd D:/vc): log pend=0 unclosed=1 queue=21 fixgap=1. Matches. The original: unclosed=0, fixgap=0.
- Synthetic hostile repo (git init + worktree; header status twice, newest-first verdict cycles, unreadable Fix cycle, fenced status, worktree-only manifest and verdict, partial ledger rows): oracle gives open 2 (high 1, unrated 1), ready [b,c,e,f], pending [c], unclosed [b,f], fixgap [e]. Session-start (pending [c], unclosed 2, open 2 high 1/unrated 1), pre-commit (4 units) and the Stop hook (pend=1 unclosed=2 fixgap=1) all agree.

## (3) hook-fixtures.ps1 against the replacements (scratch copy of D:/ai_os/.claude/hooks with the 3 ai_os files swapped; run serially)
- Baseline (originals): 8 FAILED, exit 8.
- With replacements: 8 FAILED, exit 8. The output is line-for-line identical to the baseline after normalising temp ids (diff empty), 207 PASS lines each.
- The 8 failures are the same in both: ISS-186 "FAIL verdict not reported as PASS-not-closed-out" and 7 D-029 guard checks ("unparsed"). They are pre-existing and not caused by the bundle. A first run with both suites in parallel showed 4 flipped lines in both directions (shared state, concurrency flake). It was discarded and the serial rerun is the evidence.
- The ROUNDCAP, SERIAL-MC and config-audit fixtures are unchanged in the serial run.

## (4) Session-start wall time (D:/vc, `powershell -NoProfile -File`)
- Quiet machine, vc replacement: 6.7 (cold), 4.0, 3.3, 2.9, 3.2 s. Earlier 3 runs: 4.7, 4.5, 4.4 s. The original takes 1.8-3.0 s.
- ai_os replacement: 5.2, 10.6 (with fixtures running), 5.0 s.
- Right after the fixture suites (disk and AV load): vc 11.9, 11.9, 13.5 s and ai_os 12.5, 9.2, 5.3 s. This is the main risk below.
- Phase split: ledger parse 0.5-1.0 s, tree scan about 1.1-1.6 s for 19 trees, so about 2 s of real work plus about 1 s PowerShell start. Never PARTIAL in my runs.

## Open risks / warnings (none blocking)
1. Latency under load: 11.9-13.5 s was seen once against the 15 s hook timeout. The 8 s budget covers only the tree loop, not the ledger parse or PowerShell start. Consider a similar guard on Get-OpenIssueSummary, or accept it. Normal cost is about 3-5 s.
2. The "manifest of record = highest Fix cycle, ties to root" rule is the builder's [ASSUMPTION], not in the contract. My oracle used the same rule, so it is not independently validated. Umesh should confirm it.
3. Behaviour changes to expect (all intended): open issues 322 -> 150, PASS-not-closed 0 -> 1, Stop-hook fix-gap 0 -> 1, pre-commit WARN 0 -> 2 units.
4. Session-start still does not surface fix-gaps (as before).
5. Disk: C: had about 7.7 GB free during the checks.
