# You are a /maker build subagent: P1 testlock, 2 slots (D-096 item 1)
Policy: proportional-verification/2026-10-18.15. Tier L (concurrency: test lock). One checker; no dual check (no security/auth/prod-write trigger).
Worktree: C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-testlock (branch p1/testlock, base = origin/main 5feb135). Work ONLY there. Never touch D:/vc's checkout or .claude/**.
Files you own: scripts/vc-testlock.sh, scripts/vc-testlock.test.sh (and a new test file next to it only if the existing one cannot be extended). Edit in place; keep every existing function, comment block and guarantee (liveness over age, token ownership ISS-111, timeout fail-loud, RAM gate).

## Acceptance criteria
- C1: `VC_TESTLOCK_SLOTS` (default 2). acquire() tries slot 0 = the current LOCK_DIR path (unchanged, so old copies still contend on it), then slot 1 = "${LOCK_DIR}.slot-1". Each slot uses the same mkdir + owner/token + stale-break logic; release() frees only the slot this process holds.
- C2: two-slot use needs RAM: when free RAM at acquire time is below `VC_TESTLOCK_TWO_SLOT_MIN_GB` (default 3.0), only slot 0 is tried. Tests drive this with a test-only override variable (e.g. `VC_TESTLOCK_FREE_GB_OVERRIDE`); never call the real RAM probe in tests.
- C3: `VC_TESTLOCK_SLOTS=1` behaves exactly as today. The existing vc-testlock.test.sh cases stay green unchanged (do not edit or weaken existing assertions).
- C4: `VC_TESTLOCK_EXCLUSIVE=1` (for a full suite) holds BOTH slots: take slot 0, then wait for slot 1 and take it, under the same timeout. It never runs while another holder has either slot.
- C5: the "[testlock] running (free RAM X GB): ..." log line keeps its exact format, plus the slot: "[testlock] running slot <n> (free RAM X GB): ...". Update the header comment with a short D-096 note.

## Rules
- TDD: write the failing tests first (2 concurrent holders get slots 0 and 1; a third waits; low RAM -> second holder waits; SLOTS=1 -> second waits; EXCLUSIVE waits for both). Every test sets VC_TESTLOCK_DIR to a temp dir; never the real shared path.
- Run only `bash scripts/vc-testlock.test.sh` (it is the affected set). Do NOT wrap it in the real lock. No full suite.
- One falsification per criterion in a throwaway copy (green before, red after on the named case); record them in the manifest.
- Kill only PIDs you started. Never kill by image name.
- Write qa/manifests/p1-testlock-2slot.md (Status: ready-for-check, Policy-Version, Tier, Round:, Pre-check[C1..C5], Tests[C1..C5], Falsification lines, Metrics, Base 5feb135, Head). Commit code + manifest with a narrow pathspec (never git add -A).
- Return ONE line: `p1-testlock-2slot <sha> ready` (or `p1-testlock-2slot BLOCKED <reason>`). Finish within this turn: nothing runs between turns, so never end on "waiting".
