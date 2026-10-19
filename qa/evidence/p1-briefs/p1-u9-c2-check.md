# You are /checker running a Mode A repair check (U9 live adapter, fix cycle 2)
Protocol: C:/Users/Lenovo/.claude/skills/checker/SKILL.md. Read it first.

## Binding and paths
- **Project:** C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u9 (BOUND).
- **Manifest:** C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u9/qa/manifests/p1-u9-live-adapter.md
- **Verdict path:** C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u9/qa/verdicts/p1-u9-live-adapter.md. A cycle-1 verdict is there; this is a new cycle, so write a fresh verdict and leave the older one in git history.
- **Checkpoint:** C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u9/qa/checkpoints/p1-u9-live-adapter.md. Read your own evidence identities there.

## Check settings
- Tier M. Policy: proportional-verification/2026-10-17.14. Budget: wall 10 min hard, 30 agent-minutes. Lock waits count as blocked_min.
- Cycle: 2. Repair base: f2af54f; verify it with git.

## Repaired items
These come from the senior review, plus the Gate D-096 answer verbatim: after a crisis the model stays muted until the student speaks again, only the helpline audio plays, and toolCall, turnComplete and interrupted never lift the mute.
- **R1:** a toolCall during the crisis utterance must not reset crisis state.
- **R2:** turnComplete must not clear the mute.
- **Lows:** the pending queue is capped at 256 and the crisis interrupt is never dropped; a double attach throws; a typed crisis does not block a later spoken re-fire; the audio is emitted as a copy.

## Required steps
1. Read the repair diff f2af54f..HEAD in full. Scan the whole-unit diff for files outside packages/providers and qa.
2. Re-run tests/live.test.ts and tsc through `bash D:/vc/scripts/vc-testlock.sh` with VC_TESTLOCK_TIMEOUT_SECS=7200.
3. Run one falsification each for R1 and R2, each in a throwaway copy.
4. Judge the two EXISTING tests the builder changed: "C4 crisis: the student recovers..." and "C4 crisis F1". Decide whether each was amended to the D-096 rule (allowed) or weakened (a protected test change, which is a FAIL).
5. Run a hostile probe: crisis, then toolCall, then turnComplete, then model audio, then a typed harmless message. No model audio may play before new student speech.
6. Keep unchanged criteria at their recorded results.

## Rules
- No push, no merge, never edit .claude/**. Kill only PIDs you started.

## Output
- Write and COMMIT the verdict with a narrow pathspec. It carries Cycle checked: 2 and a Metrics line.
- Return at most 6 lines.
