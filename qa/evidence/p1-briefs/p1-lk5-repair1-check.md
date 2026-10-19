You are /checker running a Mode A repair check, cycle 1. Read your full protocol first:
C:/Users/Lenovo/.claude/skills/checker/SKILL.md

Contract:  D:/vc/qa/contracts/ (the P1 rows cited in the manifest), plus D-105 in D:/vc/docs/DECISIONS.md
Manifest:  D:/vc/.worktrees/lk5/qa/manifests/p1-lk5.md
Project:   D:/vc/.worktrees/lk5 (bound; read and write only inside it)
Verdict path: D:/vc/.worktrees/lk5/qa/verdicts/p1-lk5.md (a cycle-0 verdict is there; it is a different cycle, so write a fresh cycle-1 verdict over it. Do NOT read its narrative.)
Checkpoint:   D:/vc/.worktrees/lk5/qa/checkpoints/p1-lk5.md (your own prior evidence identities; reuse only where identity is unchanged)
Tier:      L (crisis-adjacent reply gating). Policy: proportional-verification/2026-10-19.16, as pinned. Dual check: no.
Budget:    wall 45 min, agent-minutes 135. Lock waits count as blocked_min.
Cycle:     1
Repair base: 3f746e5 (the head the previous check judged). The repair diff is 6c30cf3..a544ba8. 6c30cf3 is the merge of origin/main, which brings LK1 and LK4 code.
Failed criteria: K1 (ISS-383: an empty, null or over-long localized/followUpLocalized/replyLang failed the whole kb-answer schema, and the student got the apology instead of the English reply).
Also re-check, because the repair diff touches their input files:
- M1: the localized claim must pass the same figure, unit, country and link guards as the English claim. That includes scheme-less domains such as `evil.test`, and a different link even when the English claim has one.
- M2: the crisis-rule check runs on the shown text after the localized swap.
- M3: the localized follow-up goes through noScriptGuard, the country check and the personal-identifier check.
These sit in packages/engine/src/student/lang.ts and graph.ts. Any criterion whose input files are touched (K1-K7 share graph.ts and lang.ts) is re-validated by its scoped tests.
Prove the OUTCOME by driving the real runStudentTurn with fake providers. Hostile variants:
- for K1: localized "", null, 2001 chars; followUpLocalized of 501 chars; replyLang of 17 chars; and the English turn with localized "";
- for M1: `evil.test`, a different https link, an e-mail, a different figure in Devanagari digits and as a spelled-out Hindi number, a swapped country in Devanagari, and a new unit;
- for M2: a prior-flag student whose localized text alone carries a forbidden crisis pattern;
- for M3: a localized follow-up with two questions, a phone number, a country, or a script mismatch.
crisisGuard must still fire first on the original text, with 0 model calls.
Rule on one design choice: when the localized follow-up fails, the builder shows the whole English reply. Accept it if it is safe and coherent; otherwise FAIL it with file:line.
Run tests one file at a time, unpiped, inside `timeout 600`, only through `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh <cmd>`, with TMP/TEMP on D:. Lock waits are long and normal. Never run a full suite. Do one falsification per repaired criterion, in a copy outside the bound tree.
Never kill a PID you did not start (leave 47984 and 36944 alone).
Write the verdict with `Cycle checked: 1` and a Metrics line, and commit it with a narrow pathspec. Return PASS or FAIL, with each failure's file:line.
