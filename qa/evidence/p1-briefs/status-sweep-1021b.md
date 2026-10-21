# A. Status sweep: queue and goal rows. READ-ONLY on D:/vc: never edit, never run tests, never print secrets.
Read qa/QUEUE.md (all sections: TODO, in-progress, DONE, Candidates, HOLD lines), qa/GOAL.md if present, TASKS.md, and the Status lines in qa/manifests/*.md.
Answer in max 30 lines, citing file:line: (1) done units, count plus the last ~10; (2) remaining buildable TODO rows (id, what, after/blocked-by); (3) Candidates awaiting a human pick (count, top 8, marking S1/S2/security); (4) manifests not closed out, and HOLD lines.
# B. Status sweep: open issues. READ-ONLY on D:/vc: never edit, never print secrets.
Parse qa/issues.jsonl (JSON lines) with a short python or node one-liner. Count open issues by severity. List EVERY open high or critical issue (id, one-line summary, feature). List the open medium issues grouped by feature with counts.
Flag the issues that are security, auth, privacy, crisis or minors-safety, or that block go-live. Answer in max 35 lines.
# C. Status sweep: human gates and production inputs. READ-ONLY on D:/vc: never edit, never print secret VALUES (names only).
Read qa/gates/* (OPEN, PENDING, Answered, SIGNED and Status lines). Search docs/ and qa/ for go-live, g-prod, g-publish, launch block and deploy. Read .env.example or the launch env list.
Answer in max 30 lines, citing file:line: (a) gates closed or signed; (b) gates still open, with what is needed and the owner (Umesh, devops, legal, Pathlynks); (c) production env vars or inputs still missing (KB URL and key, Mongo allowlist, Gemini terms, domain/TLS/nginx, Pathlynks JWT).
# D. Status sweep: git branches and worktrees. READ-ONLY: never edit, merge, push, delete or prune. Use `git -C D:/vc ...` only.
Check `git -C D:/vc worktree list`. For each branch: commits not on main, and whether it is merged. Check whether origin/main equals local main and whether anything is unpushed.
List the unmerged branches with non-qa/docs code commits (branch, commit count, last subject, code files touched). List fully-merged worktrees as cleanup candidates only.
wave/p1-nosource-grounded is being built now: report it, don't flag it. Answer in max 30 lines.
# E. Status sweep: requirement coverage. READ-ONLY on D:/vc: never edit, never run tests.
Read qa/contracts/*.md (acceptance criteria), docs/spec.md, docs/plan.md (P1 units U0..U13 and scope items), and qa/verdicts/*.md (PASS verdicts naming units and criteria).
Answer in max 35 lines, citing file:line: (1) P1 units with a PASS; (2) units or scope items with no PASS yet, and their blockers (voice U9/U10, U3 KB keys, U13a rubric, Pathlynks); (3) contract criteria unmet or unverified; (4) what remains for a text-only go-live versus the full P1.
