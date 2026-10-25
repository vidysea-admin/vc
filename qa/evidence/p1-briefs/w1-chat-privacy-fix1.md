# Repair brief: w1-chat-privacy, Fix cycle 1 (same builder, same worktree)

Keep every rule in qa/evidence/p1-briefs/w1-common-rules.md and the original brief qa/evidence/p1-briefs/w1-chat-privacy.md.
Worktree D:/vc/.worktrees/w1-chat-privacy, branch wave/w1-chat-privacy. Repair base: 8c6657e.
Round: 2 files, 1 criterion, est 25 min - one budget change in chat.ts plus tests.

## Failed criterion (both blind checkers, verdicts qa/verdicts/w1-chat-privacy.A.md and .B.md on main)
C1 FAIL: the per-student crisis write budget (apps/api/src/chat.ts ~722-725, takeCrisisBudget) is spent by concern-level turns and by textless or over-long crisis turns. Repro from the checkers:
- 10-12 concern turns ("I feel hopeless about my marks") on separate threads, then "I want to kill myself" on a new thread: helpline shown, but 0 escalations and no flag row for the rest of the window. Before this unit it escalated.
- 10 over-long crisis turns (or 12 on one thread), then a short real crisis turn: 0 escalations.
This breaks the p1-u8r cycle 2 guarantee that a textless or lower-level turn never silences a turn that can escalate.

## Fix (edit in place, cite file:line)
- A concern-level, textless or over-long turn must never consume the budget an escalation-capable crisis turn needs. Either budget per kind, or always admit the first escalation-capable crisis turn per window regardless of other spending. Keep the overall cap on writes (flood protection) and keep every turn answered with the unchanged helpline (LK10 wording untouched).
- Tests first (TDD, red then green): the two repros above, plus mixed interleavings (concern, crisis, concern...), and the existing 30-parallel / 25-sequential flood still capped.
- Do NOT fold in other findings (profile-port deadline, Hinglish names); those go to Candidates.

## Manifest
Set `Fix cycle: 1`, add a `Round:` line, update Pre-check[C1] on the final SHA, one falsification for C1 in a copy, lint with tick.mjs --lint-manifest, Status ready-for-check. Commit on the branch.

Return `READY w1-chat-privacy <sha>` plus at most 6 lines.
