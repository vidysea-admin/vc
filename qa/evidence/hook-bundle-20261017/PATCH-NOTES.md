# Hook-counter bundle: ISS-054 + ISS-056 + ISS-095 + ISS-084 (Approved-by: Umesh, 2026-10-16)

Proposal only. Nothing under any `.claude` directory was edited. Bundle root:
`C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/hook-bundle/`

## Which hook files are actually invoked

| Event in a D:/vc session | Command (settings file) | Real file |
|---|---|---|
| SessionStart | `$CLAUDE_PROJECT_DIR/.claude/hooks/mc-sessionstart.ps1` (`D:/vc/.claude/settings.json`) | **D:/vc/.claude/hooks/mc-sessionstart.ps1** (older, 4241 B copy) |
| PreToolUse Bash/PowerShell | `$CLAUDE_PROJECT_DIR/.claude/hooks/mc-precommit.ps1` (same settings) | **D:/vc/.claude/hooks/mc-precommit.ps1** (older, 493 B copy) |
| Stop | `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` (`C:/Users/Lenovo/.claude/settings.json:185`) | **D:/ai_os/.claude/hooks/delivery-gate-stop.ps1** |
| (ai_os-rooted sessions only) | `D:/ai_os/.claude/settings.json:46,66` | D:/ai_os/.claude/hooks/mc-sessionstart.ps1, mc-precommit.ps1 |

The user settings do not wire mc-sessionstart/mc-precommit. The D:/vc and D:/ai_os copies of those two have
drifted (the ai_os copies carry ISS-416 status tiers, stamp-age, Holds, Candidates policy). I therefore ship a fix for
**both** lineages, each built from its own current file, so no unrelated behaviour changes.

## Files -> target paths (full replacements, parse-checked)

| Bundle file | Target |
|---|---|
| `replacements/vc/mc-sessionstart.ps1` | `D:/vc/.claude/hooks/mc-sessionstart.ps1` |
| `replacements/vc/mc-precommit.ps1` | `D:/vc/.claude/hooks/mc-precommit.ps1` |
| `replacements/ai_os/delivery-gate-stop.ps1` | `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` |
| `replacements/ai_os/mc-sessionstart.ps1` | `D:/ai_os/.claude/hooks/mc-sessionstart.ps1` (keeps the 2026-10-04 marker reset) |
| `replacements/ai_os/mc-precommit.ps1` | `D:/ai_os/.claude/hooks/mc-precommit.ps1` |

All five carry one identical block between `==== BEGIN handshake-resolver` and `==== END handshake-resolver`
(source: `_src/resolver.ps1.frag`; `python -I _src/build.py` regenerates the five files from the CURRENT installed
originals, so re-run it if an original changes before you apply).
Line endings and BOM follow each original (only ai_os/mc-precommit.ps1 is CRLF).

## What changed (contract from qa/QUEUE.md lines 88-89)

* **ISS-056 Status**: tiers unchanged (closing `## Status:` > `**Status:**` header > list item > bare), but inside every
  tier the LAST line wins (the header tier used first-wins). Also accepts `**Status**:`; fences skipped; case-insensitive.
* **ISS-095 cycle**: verdict cycle = MAX of all `Cycle checked` / `Fix cycle judged` stamps (never positional);
  manifest cycle = MAX `Fix cycle:`; markdown-prefix tolerant; code spans/fences stripped (same rules as Strip-Code).
  Unreadable Fix cycle stays PENDING (noisy beats silent).
* **ISS-054 trees**: root = main worktree (found from `.git`, no process spawn), plus the cwd, every `.git/worktrees/*`
  entry, `.worktrees/*`, `.claude/worktrees/*`. Verdicts are searched in EVERY tree; max cycle across copies; ties go to the root copy.
* **Manifest of record per slug** `[ASSUMPTION, not in the contract]`: the copy with the highest Fix cycle, ties to the
  root. This keeps worktree-only manifests visible (t-020 case) while a stale branch copy cannot override a merged root copy.
* **ISS-084 open issues**: ids merged in file order, per-field last-value-wins, count merged `status == open`.
  Session line now reads `Open issues: N (by severity: high H, low L, medium M)`. The `Open issues: N` prefix is
  unchanged for the existing fixture regexes.
* Session-start prints ` | Tree scan: PARTIAL (time budget)` if the 8 s scan budget is hit (root is always scanned first).
  A resolver exception prints `Checks pending: 1 [RESOLVER-ERROR]` rather than 0.
* Stop hook: only the MAKER predicate's pend/unclosed/fixgap counters use the resolver. The ROUNDCAP predicate is
  untouched except that it now uses the shared last-wins `Get-ManifestStatus`.
* Pre-commit counts units whose manifest of record is `ready-for-check` across all trees (was root-only text match).

## Behaviour changes you will see on the live repo today

* Open issues 322 -> 150 (ledger rows are partial updates).
* PASS not closed out 0 -> 1 (`t-049-b1-recovery`, PASS verdict at cycle 1, manifest only in `.worktrees/b1-recovery`).
* Stop-hook fix-gap 0 -> 1 (`t-010-live-cards`, FAIL verdict at its current cycle 3). Session-start still does not
  surface fix-gaps (it never did); only the Stop hook does.
* Checks pending stays 0: t-010's cycle-3 verdict now resolves from its own worktree, so the two ISS-054/ISS-095 errors no longer cancel.
* Pre-commit WARN 0 -> 2 units.
* Cost: session-start ~5 s vs ~2 s (reads ~870 manifests across 18 trees). The 15 s hook timeout is guarded by the 8 s budget.

## Apply order (gated: edits to `.claude/hooks/**` need the DECISIONS entry with `Approved-by: Umesh` written FIRST)

1. Append the D-entry via `scripts/append_decision.ps1` (record that the pending count changes direction, per QUEUE row 88).
2. Copy the five files to the targets above in ONE change (the three-reader contract must land together).
3. Re-run `python -I run_bundle_test.py D:/vc` and `python -I run_synthetic_fixture.py`; both must exit 0.
4. Run `D:/ai_os/.claude/hooks/tests/hook-fixtures.ps1` (NOT run by this bundle) and `/aios-config-auditor` before the commit.

## Evidence scripts

* `independent_oracle.py` - Python, shares no code with the PowerShell; trees via `git worktree list`.
* `run_bundle_test.py` - OLD installed vs NEW bundle hooks (real executions, Stop hook with redirected TEMP) vs oracle on the live repo.
* `run_synthetic_fixture.py` - 10 hostile handshake cases + 5 ledger-merge cases against hand-written expectations.
