# Read-only: landing plan for the D:\vc dirty tree (D-093 item 14)
S = C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad.

**Situation.** The D:\vc main checkout is behind origin/main (the pushed head is 47ab62a). It holds about 33 modified tracked files plus many untracked directories, left by Codex and peer sessions from 10-14 to 10-17.

**Read only.** Never run git add, commit, stash, checkout or reset.

**Write S/landplan-20261017.md.** Group every modified or untracked path into path-scoped commits by where it came from (task id or session). To trace that, use git log, HANDOFF.md, the qa/.delivery records, DECISIONS D-042..D-093 and TASKS.md. For each group give:
- whether it is already on origin/main (compare blobs with `git show origin/main:<path>`);
- whether it conflicts with origin/main;
- whether it is junk to ignore (.pnpm-store, .playwright-mcp, candidate.zip);
- the exact commit command.

Flag anything that looks like a secret.

**Return**, in under 25 lines: the group count, the conflicts, the risky items, and the path to the plan.
