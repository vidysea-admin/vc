# Senior review (read-only): U10 voice WebSocket, apps/api/src/voice.ts (+ server.ts onUpgrade, packages/db chat-threads.ts)
Worktree C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u10, diff `git -C <wt> diff $(git -C <wt> merge-base HEAD origin/main)..7227385`. Manifest qa/manifests/p1-u10-voice-ws.md. Students are often minors. Auth and tenancy must fail closed, a crisis must never be lost, and no raw PII may be stored.
Judge:
- WebSocket upgrade auth: is the JWT verified before the upgrade completes? Check jti single-use, the student/thread path match and origin handling.
- Resource safety: socket cap, per-student session lock, timers, provider handles and the resume log. Is anything leaked on every close or error path, including a close during provider connect? Is any in-memory map unbounded?
- Backpressure and frame-size limits, and malformed frames.
- The crisis path through the U9 live adapter: muted audio, escalation, the stored text redacted.
- Voice-minutes accounting and the crash undercount.
- The lockfile change.
- Is any test weakened?
Run tests only via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh`. Never edit the worktree. Probes go in your own scratch dir only. Return Approve / Warning / Block with file:line evidence.
