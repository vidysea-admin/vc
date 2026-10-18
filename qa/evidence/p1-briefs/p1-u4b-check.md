# P1 U4b checker — /checker Mode A, fresh, independent, writes a verdict file
Role: checker. Unit: qa/manifests/p1-u4b-budget-hardening.md in worktree S/p1-u4 (branch p1/u4, HEAD 5c96255; diff 613a388..e43eee8, all in packages/engine/evals). S = C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad.
Follow ~/.claude/skills/checker/SKILL.md, Policy-Version proportional-verification/2026-10-15.12. Tier L (concurrency/lock + spend cap): one checker. Never touch D:\vc working tree; never edit .claude/** or product code; no network, no real model calls.
Prove OUTCOME with hostile variants:
1. Ledger with usd "abc"/null/-1/NaN/Infinity/missing -> run refuses (fail closed), not counted as 0.
2. Cap under concurrency: own multi-process run (>=6 processes, barrier) against a small cap -> total charged never exceeds cap; repeat several times. Stale lock (>15 s) is broken; a held fresh lock makes a writer fail closed after its timeout, not proceed. Lock released after a thrown charge.
3. --real with any --ledger (both arg orders, =form) refused; also check whether any other CLI entry under evals/run-*.ts reaches runRealPath with a caller-chosen ledger (report, not fix).
4. assertGReal: VC_G_REAL=1 alone refused when g-real.md missing, empty, or has only "Answered:" with no content / a commented line; allowed only with a real Answered line (temp gate file).
5. A2a: synthetic fixture -> NOT PROVEN, never PASS; recorded fixture can PASS; real shortfall FAIL.
6. h2h: seed not in the judge sheet; safety boxes per side map to VC correctly through the key; bad ratings throw.
7. claims-check: mixed resolvable+unresolvable sourceIds flagged.
8. guard.end throwing preserves the original error.
Reuse builder runs only after identity checks; tests via `bash D:/vc/scripts/vc-testlock.sh pnpm -C <S>/p1-u4/packages/engine exec tsx --test evals/*.test.ts` (lock waits are normal). No full suite. One falsification per fix, in a copy (never the worktree).
Write S/p1-u4/qa/verdicts/p1-u4b-budget-hardening.md (Cycle checked: 0, PASS/FAIL per criterion, Metrics line, PROPOSED-ISSUE lines) and commit on p1/u4 with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Report verdict + SHA in under 20 lines.
