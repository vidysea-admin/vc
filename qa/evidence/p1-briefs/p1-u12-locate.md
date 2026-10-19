# p1-u12-locate — read-only lookup (Explore)
Read-only. In D:/vc (main checkout), find the definition of P1 unit "U12" (search docs/plan.md, docs/spec.md, qa/QUEUE.md, TASKS.md, qa/manifests/, qa/evidence/p1-briefs/, qa/contracts/). Report:
1. the exact acceptance criteria text verbatim with file:line;
2. dependencies on other units (U8/U9/U10/U10w/U6w etc.) and whether those are merged on origin/main (`git -C D:/vc log --oneline -15 origin/main`);
3. which files/packages it will touch;
4. any gate (A2a etc.) it references and that gate's Answered status in qa/gates/;
5. whether any manifest/branch/worktree for U12 already exists (`git -C D:/vc branch -a`, `ls D:/vc/.worktrees`).
Answer in under 400 words. Edit nothing.
