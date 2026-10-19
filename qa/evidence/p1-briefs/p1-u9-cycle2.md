# You are a /maker build subagent: U9 fix cycle 2 (p1-u9-live-adapter)
- Worktree: C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u9 (branch p1/u9, head f2af54f). Work ONLY there. Never `git add -A`. Never touch .claude/**.
- Policy: proportional-verification/2026-10-17.14 (the manifest's pin). Tier M. Fix cycle 2 of max 2: this is the last cycle.
- Cycle-1 verdict: qa/verdicts/p1-u9-live-adapter.md (PASS). Senior review findings: D:/vc/qa/evidence/p1-briefs/p1-u9-repair-review-result.md. Read both.
- Gate answer (D-096, Umesh, verbatim intent): after a crisis the model stays muted until the student speaks again; only the helpline audio plays. toolCall, turnComplete and interrupted never lift the mute.

## Fix (packages/providers live adapter, live.ts, plus its tests)
1. **R1:** toolCall() -> flushUser(true) must not reset crisis state while crisisMute is set. The mute lifts ONLY on new student speech (a new user utterance chunk after the crisis utterance has ended). Add a test: crisis chunk -> toolCall -> non-crisis chunk of the SAME utterance -> zero model audio emitted.
2. **R2:** turnComplete() must not clear crisisMute. Add a test: crisis -> interrupted -> turnComplete -> model audio -> zero emitted; then the next student speech -> model audio is heard.
3. **Lows:**
   - cap pendingBackendEvents (e.g. 256, drop the oldest with a logged warning), and add a double-attach guard;
   - a typed crisis must not block a later spoken crisis from re-firing helpline audio;
   - emit a copy of the crisis audio Uint8Array, not the shared reference.
   Each low fix gets its own test.
- TDD: write the failing test first. Add new tests; do not weaken existing ones. One falsification per fixed item (R1, R2), each in a throwaway copy: green before, red after.
- Tests: `bash D:/vc/scripts/vc-testlock.sh` wrapping `pnpm --filter <providers pkg> exec tsx --test tests/live.test.ts` plus `tsc --noEmit`. No full suite. The lock is shared, so long waits are normal: set VC_TESTLOCK_TIMEOUT_SECS=7200 and wait.
- Never kill a process by image name.

## Finish
- Update qa/manifests/p1-u9-live-adapter.md:
  - `Fix cycle: 2 of max 2`;
  - a `Round:` line;
  - `Pre-check[<id>]` lines on the final sha, with t=;
  - `Tests[<id>]` lines;
  - the falsifications;
  - a Metrics line;
  - Status: ready-for-check.
- Commit with narrow pathspecs and return ONE line: `p1-u9-live-adapter <sha> ready`.
