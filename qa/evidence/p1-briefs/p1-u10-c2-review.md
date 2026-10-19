# Senior review (read-only): U10 voice WebSocket cycle 2 (LAST), apps/api/src/voice.ts
Worktree C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u10, diff `git -C <wt> diff f71f387..9067502` (repair of your cycle-1 Warning, D:/vc/qa/evidence/p1-briefs/p1-u10-c1-review-result.md, and checker B's F1-F3; brief D:/vc/qa/evidence/p1-briefs/p1-u10-repair2.md). Your cycle-1 probes are in scratchpad/probe-u10/c1.probe.test.mts: re-run PROBE1 and PROBE2 against 9067502. Manifest qa/manifests/p1-u10-voice-ws.md (C14-C19). Students are often minors. A crisis must never be lost, the monthly cap must hold, auth and tenancy fail closed, and no raw PII is stored.
Judge:
- onCrisisRecord on a closing or closed socket: does it complete, with no double escalation and no send to a dead socket?
- The usage re-read inside the supersede loop: is there a race with a concurrent usage write, does the loop terminate, and are the newest-wins and step-aside rules correct?
- The latestStart bookkeeping change in finalize: can a waiter starve, or can two sessions go live?
- The drain timeout: are the background writes after the timeout unbounded, is the 10 s default safe, and does a deadline-hit flag write being treated as fenced lose a crisis?
- C18's seq matching and VOICE_CRISIS_NO_WORDS_TEXT: does any text from an earlier turn or another student leak?
- Is any test weakened (git diff of the tests: only additions)?
Run tests only via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh`. Never edit the worktree. Probes go in your own dir under D:/vc/.worktrees/ (C: is full). Return Approve / Warning / Block with file:line evidence.
