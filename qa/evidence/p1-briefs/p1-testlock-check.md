# You are /checker running a Mode A feature check (2-slot test lock, single checker)
Protocol: C:/Users/Lenovo/.claude/skills/checker/SKILL.md. Read it first.

## Paths and binding
- **Project:** C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-testlock (BOUND).
- **Contract:** criteria C1-C5 in D:/vc/qa/evidence/p1-briefs/p1-testlock-build.md, which come from D-096.
- **Manifest:** C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-testlock/qa/manifests/p1-testlock-2slot.md
- **Verdict:** C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-testlock/qa/verdicts/p1-testlock-2slot.md
- **Checkpoint:** C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-testlock/qa/checkpoints/p1-testlock-2slot.md

## Check settings
- Tier: L (concurrency). One checker.
- Policy: proportional-verification/2026-10-17.14.
- Budget: 45 min wall and 135 agent-minutes.
- Base: 5feb135. Cycle: 0.

## How to run it
- **Never touch the real shared lock.** Every run sets VC_TESTLOCK_DIR to a fresh mktemp dir. The real lock is C:/Users/Lenovo/AppData/Local/Temp/claude/vc-testlock and is used by other running agents.
- Run `bash scripts/vc-testlock.test.sh` yourself. It takes about 5 minutes.
- Read the full diff.
- Run one falsification per criterion, each in a throwaway copy.

## What to check
- Tests 1-11 are unchanged apart from the added `export VC_TESTLOCK_SLOTS=1` line. Confirm that this is not a weakening (C3: SLOTS=1 behaves as before).

## Hostile probes
- Two concurrent holders plus a third waiter: at most 2 hold at once.
- Free RAM below 3 GB (via VC_TESTLOCK_FREE_GB_OVERRIDE): only slot 0 is used.
- An exclusive run while a slot is held: the exclusive run waits for the slot to drain and holds both slots.
- A stale slot-1 lock with a dead PID: the lock is broken safely.
- A timed-out exclusive run leaks no slot (the builder fixed this defect).
- A token-ownership guard per slot, as in ISS-111: a holder can never release another holder's slot.

## Rules
- No push and no merge. Never edit .claude/**.
- Kill only the PIDs you started.

## Output
- Write and COMMIT the verdict with a narrow pathspec. It must carry Cycle checked: 0 and a Metrics line.
- Return at most 6 lines.
