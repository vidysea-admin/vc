# Checkpoint p1-nosource-grounded (checker, cycle 0) — evidence identity
Head caa02d1 (code 6a501bd), base 8d0d529, runtime node v24.13.1 + tsx via worktree node_modules, lockfile unchanged by the diff, env Windows, no VC_GROUNDING, no live call.
- engine tests/student-graph.test.ts (blob 5ab26ff) 102/102; tests/lang.test.ts (b2ca697) 42/42, exit 0
- providers tests/index.test.ts (3c5c635) 22/22; api anonymous-zero-persistence (5490fc9) 36/36; student-openapi (a103dd7) 10/10; chat (fbca7f5) 33/34 baseline red; anonymous-route targeted (ef22f6e) 10/10
- tsc --noEmit providers, schemas, engine, api: exit 0
- checker proof tests/chk-proof.test.ts (copy of the 6a501bd tree outside the bound root) 6/6; falsifications g1-g6 red-after in isolated copies
- Mode D: report.json under qa/evidence/browser-p1-nosource-grounded-2026-10-22-checker/, page apps/student/app.js at 6a501bd, stub /v1
Attribution: claude-sonnet-subagent checker; files under qa/evidence/p1-nosource-grounded-check/.
