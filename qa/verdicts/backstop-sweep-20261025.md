# Backstop sweep (Mode B) - origin/main 1142e8b, 2026-10-25

VERDICT: PASS-WITH-LOWS (no S1/S2, no HOLD)
Cycle checked: 0
Checker: /checker Mode B, read-only toward code. Policy-Version: proportional-verification/2026-10-19.17. Backstop: yes. Stamp: 2026-10-25T09:01:21+05:30.
Target: D:/vc main (HEAD a2eed3c = 1142e8b plus 2 qa brief files; origin/main 1142e8b). Previous backstop 2026-10-22 at origin/main da227b2.
Metrics: start=2026-10-25T08:58:39+05:30 end=2026-10-25T09:01:34+05:30 wall_min=4 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=0 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=240 mutants=0 defects_unit=0 defects_6c=0

## 1. Suite identity (reused, not re-run)
- git rev-parse 1142e8b^{tree} = 25fa9c63718afe2f2326247322a628ca575e4084 (equals the 6c record). HEAD^{tree} = c7c6d368... only because a2eed3c adds two qa brief files (git diff --stat 1142e8b HEAD: 2 files, qa/evidence/p1-briefs/*), no code.
- results.tsv (scratchpad out14b): 146 rows = 128 full + 9 tsc + 8 collect + header. Every row exit 0. full rows: 3401 pass, 0 fail, 45 skip, 3446 tests. tsc: 9 of 9 exit 0.
- File-count check: git ls-tree 1142e8b lists 122 apps/packages *.test.ts + 6 *.test.tsx/.js = 128; diff of the path lists against results.tsv is empty once the 6 non-.ts files are added. No missing file.
- Figure drift: the brief and 6c record say 3449 tests; the rows sum to 3446 (ISS-sweep-20261025-3, low). Identity and green hold.
- No suite re-run (no mismatch).

## 2. Bypass detection (da227b2..1142e8b, apps/ packages/ scripts/ qa/adapter.json)
15 non-merge/merge commits touch those paths; all map to a manifest at checked-PASS or merged-no-check:
| unit | merge | manifest Status |
|---|---|---|
| w1-golive-docs | a2daf26 | merged-no-check (docs-lane); touches docs only |
| w1-data-boundary-config | 5918ec6 (faa1ff1 adapter.json) | checked-PASS c0, verdict 412e730 |
| w1-conformance | 8b18fb3 (2237880) | checked-PASS c0, verdict dc3187a |
| w1-counsellor-tenant-guard | 81f8e00 (9af98ff) | checked-PASS c0, A 087fc1e + B 7d20e53 |
| w1-erasure-outbox | 01fe789 (762ec01) | checked-PASS c0, A e778900 + B 72d181b |
| w1-cards-b1 | 0341837 (27f5418) | checked-PASS c0, verdict 82bc192 |
| w1-crisis-recall | 12f08ae (750bff6) | checked-PASS c0, verdict fc472c5 |
| w1-chat-privacy | 4df4a0e (8dba0ac, 4135e1c, a835593) | checked-PASS c2, A a88785b + B d786d19 |
The rest of the window is qa-only commits. Bypass list: none.

## 3. Crisis-path spot check (results.tsv, exit 0 each)
- 14416 / Tele-MANAS text present in packages/engine/src/guards/crisis.ts (lines 614, 623) and in 10+ apps/api/tests files.
- packages/engine: guard-crisis 790 pass, crisis-escalation 42, crisis-defaults 19, crisis-eval 5. apps/api: voice-crisis-turn 14, chat-privacy 63, chat 36, chat-profile 52. 0 fail, 0 skip.

## 4. QUEUE and inbox
- qa/QUEUE.md: the eight "TODO - W1 ..." rows flipped to "- [x] DONE - W1 ..." with the manifest status line cited. Other rows untouched. grep -c 'TODO · W1' now 0.
- qa/feedback-inbox.md: newest entry 2026-10-22T07:52 predates the last sweep; nothing to fold into Candidates.

## 5. Hook liveness (powershell -NoProfile -File .claude/hooks/mc-sessionstart.ps1, empty stdin)
- Output: Checks pending: 0 | PASS not closed out: 1 | Queue TODO: 25 (before the QUEUE flip) | Tree scan: PARTIAL (time budget).
- Reconciliation: expected 0 / 0. Pending 0 holds. The 1 unclosed is t-049-b1-recovery, found in .worktrees/b1-recovery (branch codex/b1-recovery, not on main): manifest ready-for-check, verdict cycle 1 PASS. Not a wave-1 or main file (ISS-sweep-20261025-1, low). All eight wave-1 manifests on main are closed.
- Related: w1-cards-b1 manifest keeps a stale second Status line (line 62) after the close-out at line 7 (ISS-sweep-20261025-2, low); the live hook did not flag it.
- The count was attributed with a scratch copy of the hook (scratchpad mc-debug.ps1) that only adds slug names to the output; .claude/hooks was not edited.

## Issues raised
ISS-sweep-20261025-1, -2, -3 (all low, process). No S1/S2, no HOLD.
