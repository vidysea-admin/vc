# You are /checker running a Mode A feature check (U8 student chat API, dual check coordinator A)
Protocol: C:/Users/Lenovo/.claude/skills/checker/SKILL.md. Read it first.

## Binding and paths
- **Project:** C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u8. This is the p1/u8 worktree, and you are BOUND to it.
- **Contract:** the U8 criteria in D:/vc/qa/evidence/p1-briefs/p1-w3-u8.md, plus the U8 row of C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u8/docs/plan.md.
- **Manifest:** C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u8/qa/manifests/p1-u8-chat-api.md
- **Verdict path:** C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u8/qa/verdicts/p1-u8-chat-api.md
- **Checkpoint:** C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u8/qa/checkpoints/p1-u8-chat-api.md


## Check settings
- Tier L, dual check (dual-trigger: auth apps/api/src/auth.ts:406).
- Policy: proportional-verification/2026-10-17.14.
- Budget: wall 45 min and 135 agent-minutes. Lock waits count as blocked_min.
- Base: 52d2af5. Integration branch: main. Cycle: 0.
- Run tests through `bash D:/vc/scripts/vc-testlock.sh` with VC_TESTLOCK_TIMEOUT_SECS=7200. Long lock waits are normal.
- Reuse maker Pre-check evidence only under full identity (.9-5 / .11).
- Falsification floor: one per criterion, each in a throwaway copy, never in the bound tree.
- Review the test selection (.13-7 / .13-8).
- Read the full diff (step 4c). Any file outside the U8 scope is a finding.

## Security read (mandatory)
Read every changed line in auth and tenancy. Cover:
- the student JWT and the role gate (auth.ts:406);
- the under-18 rule;
- tenant isolation: every store call refuses an unscoped Db, and no cross-student read is possible;
- redaction before persistence (the name heuristic);
- idempotent turns;
- the 30 rpm limiter;
- erasure and export completeness for the new collections;
- the crisis path on chat turns.

## Hostile probes (at least two)
- a counsellor token or a forged token against a student route;
- student A reading student B's thread.

## Also judge
- The impact of U9's LiveConfigError (crisis audio is required whenever a detector is wired), if U8 wires the live adapter.
- The builder's open risks.

## Rules
- Security L unit: a scoped full run of the affected packages is allowed. Otherwise record `full-suite trigger:` for 6c.
- In a dual check, findings go into the verdict as PROPOSED-ISSUE lines. Write no issue rows and close no goal task.
- No push, no merge, never edit .claude/**, no network or paid model calls (mock provider only). Kill only PIDs you started.

## Output
- Write and COMMIT the verdict in the worktree with a narrow pathspec. It carries Cycle checked: 0 and a Metrics line.
- Return at most 8 lines: the verdict, each criterion's result and the findings.
