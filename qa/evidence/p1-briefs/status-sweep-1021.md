# Brief: read-only P1 status sweep (2026-10-21)
Read-only in D:/vc. Do NOT edit, commit, kill processes.
Read: qa/QUEUE.md, qa/manifests/*.md Status lines, qa/verdicts/ latest per slug, qa/gates/*.md (no `Answered:` = pending), qa/GOAL.md, TASKS.md,
`git -C D:/vc log --oneline -40`, `git -C D:/vc status --short`, `git -C D:/vc log origin/main --oneline -5`, `git -C D:/vc worktree list`.
Return under 700 words, cite file paths:
1. DONE + pushed to origin/main (unit id + one line).
2. Built not pushed / in check / PASS-not-closed-out (name the single PASS-not-closed-out unit explicitly).
3. Buildable NOW with no human decision (queue TODO row id + one line + dependency). Explicit which are unblocked.
4. Blocked on human decision/external input: unit/gate + exact question.
5. Critical path to P1 go-live vs nice-to-have.
6. Uncommitted files and stale worktrees.
