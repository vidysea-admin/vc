# You are a /maker planning subagent: specs + build briefs for P1 U6b, U11, U10, U12 (read-only toward code)
- Repo D:/vc (main 9f5bbac). Do not edit code, do not commit, never touch .claude/**.
- Find where P1 units U6b, U10, U11, U12 are defined: search docs/plan.md, docs/spec.md, docs/intent.md, qa/QUEUE.md, qa/GOAL.md, qa/contracts/, qa/evidence/p1-briefs/*.md (esp. p1-finish-plan.md and any earlier P1 plan/wave docs), TASKS.md, docs/DECISIONS.md (D-08x..D-096). Use git log --all --oneline | grep -i "U6b\|U10\|U11\|U12" too.
- Known deps (p1-finish-plan.md): U6b + U11 need U8 (chat API, branch p1/u8 head e2b805d, worktree S/p1-u8), U10 needs U8 + U9 (live adapter, p1/u9), U12 needs everything.

For EACH unit write a build brief file D:/vc/qa/evidence/p1-briefs/p1-<unit>-build.md in the same style as D:/vc/qa/evidence/p1-briefs/p1-u9-cycle2.md, containing:
- contract row / acceptance criteria verbatim with ids, and applicable qa/gates Answered lines;
- tier (S/M/L per the maker triggers) and whether a dual-check trigger (security/auth/tenancy/prod-write with file:line) applies;
- exact files it will own (so parallel builders don't collide) and files it must NOT touch (U8 repair owns apps/api chat.ts M1/M2 areas);
- base branch (p1/u8 for U6b/U11; note U10 waits on U9) and worktree path S/p1-<unit>;
- test commands through `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh ...`, TDD, falsification floor, manifest finish lines, ONE-line return.
- any HUMAN_GATE question (unresolved product intent) — list it, do not invent answers.

Return: one line per unit `<unit> brief=<path> base=<branch> tier=<S|M|L> files=<n> gate=<none|question>`, plus a one-line file-overlap check between U6b and U11 and the U8 repair (M1/M2 in apps/api chat.ts). If a unit has no spec anywhere, say `NO-SPEC` and quote what little exists.
