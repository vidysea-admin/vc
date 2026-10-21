# Brief LK8: add khudkushi / खुदकुशी (and close variants) to crisisGuard (maker build unit, policy .17)
Base: origin/main a11653e. NEW worktree D:/vc/.worktrees/lk8 on branch p1/lk8. Never touch .claude/**, never git add -A, never kill processes, never print API keys.
Finding: qa/verdicts/p1-lk6.md finding 1, crisisGuard returns level none for "khudkushi". Add romanised (khudkushi, khudkhushi, khud kushi) and Devanagari (खुदकुशी, ख़ुदकुशी) forms at the same level as the existing English suicide terms. Do not change the crisis reply text (Hindi text vetting is a separate human decision). Own only the crisisGuard module + its tests.
TDD failing test first; include negative tests so unrelated words don't trigger. Pre-check + 1 falsification per criterion. Affected tests only via
`VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 <cmd>`, TMP/TEMP on D:. Long lock waits are normal.
Deliver: commits on p1/lk8, manifest qa/manifests/p1-lk8.md at Status: ready-for-check (Policy-Version .17, Tier L safety). Do not merge or push. Report sha.
