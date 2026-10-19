# You are /checker running a Mode A feature check (eng3 crisis leftovers, single checker)
Protocol: C:/Users/Lenovo/.claude/skills/checker/SKILL.md. Read it first.

## Binding and paths
- **Project:** C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-eng3. This is the p1/eng3 worktree, and you are BOUND to it.
- **Contract:** the criteria C1-C4 in the manifest, which come from D-093 2A and 3A (D:/vc/docs/DECISIONS.md), ISS-126 and the U6h leftovers. Verify each criterion against its source text yourself.
- **Manifest:** C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-eng3/qa/manifests/p1-eng3-crisis-leftovers.md
- **Verdict path:** C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-eng3/qa/verdicts/p1-eng3-crisis-leftovers.md
- **Checkpoint:** C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-eng3/qa/checkpoints/p1-eng3-crisis-leftovers.md

## Check settings
- Tier L (crisis safety path). Single checker: no auth or tenancy trigger.
- Policy: proportional-verification/2026-10-17.14.
- Budget: wall 45 min and 135 agent-minutes. Lock waits count as blocked_min.
- Base: 52d2af5. Cycle: 0.
- Run tests through `bash D:/vc/scripts/vc-testlock.sh` with VC_TESTLOCK_TIMEOUT_SECS=7200.
- Reuse maker evidence only under full identity.
- Falsification floor: one per criterion, each in a throwaway copy.
- Review the test selection.
- Read the full diff. Anything outside packages/engine and the manifest is a finding.

## Safety probes (mandatory)
- **Crisis recall:** the D-093 phrases, with spaced, leet and Devanagari variants, must fire.
- **Precision:** study talk such as "50 kms" and "kill this exam" must NOT be flagged as crisis.
- **Stress:** stress talk gets the soft note plus Tele-MANAS 14416 and is not flagged as crisis.
- **Hostile:** try at least 3 evasions of the crisis guard. A missed crisis phrase from D-093 is a FAIL.

## Also judge
- the "kms" heuristic;
- the CORE-REQUEST for ISS-125;
- the mutant-cap-raise line.

## Rules
- No push, no merge, never edit .claude/**. Mock provider only. Kill only PIDs you started.
- Findings outside the criteria become new qa/issues.jsonl rows.

## Output
- Write and COMMIT the verdict in the worktree with a narrow pathspec. It carries Cycle checked: 0 and a Metrics line.
- Return at most 8 lines.
