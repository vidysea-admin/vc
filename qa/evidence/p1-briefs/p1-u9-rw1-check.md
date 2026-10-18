# You are /checker: U9 repair check, rewritten brief cycle 1 (p1-u9-live-adapter), tier M, fresh context
- Protocol C:/Users/Lenovo/.claude/skills/checker/SKILL.md Mode A. Policy: the manifest pin (.14) with .15 rules.
- Worktree C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u9 (p1/u9 head 73dc74f; code da32f8a). Read-only toward code; write only your verdict, checkpoint and evidence. Never touch .claude/**. Do NOT push.
- Contract: D:/vc/qa/evidence/p1-briefs/p1-u9-cycle3-rewrite.md and D-097 item 4 (D:/vc/docs/DECISIONS.md). Gate: D-096 item 3.
- Prove OUTCOMES, not construction. Hostile variants are REQUIRED, as your own tests in a throwaway COPY of the worktree:
  a. crisis -> turnComplete -> same-utterance chunk within 1200 ms -> model audio: 0 emitted.
  b. crisis -> interrupted -> chunk after 1300 ms -> model audio heard; with no turnComplete/interrupted before the gap chunk -> still muted.
  c. crisis -> toolCall -> turnComplete -> chunk 100 ms later -> 0 model audio.
  d. a second crisis in a new utterance refires the helpline once; a duplicate in the same utterance does not.
  e. a typed message after a crisis does not lift the mute (D-096 as worded).
  f. the 4 amended existing tests: confirm no assertion was weakened (diff f42740e..da32f8a), only timing injection and a pause added.
- Reuse maker evidence only after identity validation. Rerun tests/live.test.ts + tsc --noEmit via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh ...`. One falsification each for H1 and Low, in a copy.
- Write qa/verdicts/p1-u9-live-adapter.md (Cycle checked: rw1), checkpoint, Metrics. Commit narrow pathspecs. Return ONE line: PASS/FAIL + sha + one-line reason.
