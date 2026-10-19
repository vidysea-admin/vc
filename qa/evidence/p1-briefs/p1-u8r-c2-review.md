# Senior review (read-only): U8r chat privacy repair, apps/api/src/chat.ts + packages/schemas/src/redact.ts + packages/db/src/profile-facts.ts
Worktree C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u8r, diff `git -C <wt> diff c3d3069..585f6dc (cycle-2 repair, LAST; the cycle-1 Block items are in D:/vc/qa/evidence/p1-briefs/p1-u8r-repair2.md, and earlier probes are in scratchpad/rev-u8r/ and scratchpad/rev-u8r-c1/)`. Manifest qa/manifests/p1-u8r-chat-privacy.md. The users are students, many of them minors. Privacy and crisis escalation must fail closed, and a crisis must never be lost.
Judge:
- Is the AsyncLocalStorage scope for the redacted escalation text correct across awaits and concurrent requests (no cross-request leak, nothing lost when the scope is missing)?
- Is the in-memory 10-minute crisis window correct? Check slot give-back on failure, unbounded map growth (eviction), and concurrent turns racing for one slot.
- Does the redact.ts lowercase-name heuristic have ReDoS risk, a precision failure that mangles ordinary sentences, or the sentence-swallow fix regressing?
- Is the 503 on a profile outage written before any write, and is the retry idempotent?
- Is any test weakened?
Run tests only via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh`. Never edit the worktree. Probes go only in your own scratch dir, importing the worktree files. Return Approve / Warning / Block with file:line evidence.
- Also judge the 5 s wait for an in-flight holder: no deadlock, a bounded wait and timer cleanup, and the case where the holder never settles.
