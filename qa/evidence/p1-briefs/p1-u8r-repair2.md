# You are a /maker build subagent: U8r fix cycle 2 (LAST, cap 2), p1-u8r-chat-privacy, tier L, dual check
- Worktree C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u8r (branch p1/u8r, code c3d3069, manifest 37dcb65, cycle-0 code b018254). Use `git -C <wt>`, never `cd X && cmd`. Never `git add -A`. Never touch .claude/**. Do NOT push. C: is nearly full: falsify only on a scratch copy of the single file.
- The cycle-1 senior review BLOCKED c3d3069. Its probes are in scratchpad/rev-u8r-c1/ (probe-chat.test.ts, probe-redact.test.ts); turn them into real tests. The invariant: a crisis turn that is answered quietly must only ever be quiet because another turn in its window has ACTUALLY escalated. Over-redaction is acceptable; under-redaction is not.

## Fix (TDD: a failing test first for each item)
1. HIGH, chat.ts ~532, 575-578, 340: a holder whose variant is not "full" (textless: overlong or unconsented minor) has no escalate port. Yet it confirms the slot at rank 2 and silences every later crisis. Fix: only a turn that really escalated (escalate was called and succeeded) may confirm the slot. A non-full holder takes rank 0 and stays unconfirmed, so any later full-variant crisis or concern takes over and escalates. Test: an overlong crisis then "I want to kill myself" 60 s later gives 1 escalation; an unconsented-minor crisis then a full crisis behaves the same way.
2. MEDIUM, chat.ts ~351 releaseCrisisSlot: it restores `prev` even when prev already failed. Mark a slot `released = true` on release, and restore prev only if it is not released. Test: concern A in flight, crisis B takes over, A fails, B fails, then concern C escalates.
3. MEDIUM race, chat.ts ~564-573: a quiet turn that finds an in-flight holder writes only a flag-only row. If the holder then fails, nobody escalates. Fix: the slot carries `done: Promise<boolean>`. A quiet turn whose holder is unconfirmed awaits it, with a bounded wait (for example 5 s, then it escalates itself). If the holder failed, the quiet turn takes the slot and runs the full path itself. Test it with gated, deferred escalate calls.
4. LOW-MEDIUM, packages/schemas/src/redact.ts ~89 and ~154: a title uses up one of the {0,3} name tokens, so "I'm Dr. A. P. J. Abdul Kalam" leaks "Abdul Kalam". Do not count TITLES tokens against the cap. Test it.
5. LOW, record only: the limiter is charged before the 503. Note it in the manifest as an open risk.
- Do not weaken or delete any existing assertion. Keep every cycle-0 and cycle-1 test green.

## Pre-check + manifest
- Via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh ...` (long waits are normal; never quit on a busy lock): the whole apps/api, schemas and db packages, plus typecheck for those 3.
- One falsification per changed criterion, on a scratch copy of the single file.
- Manifest: `Fix cycle: 2`, add the criteria, Pre-check[<id>] lines on the final sha, keep the dual-trigger line, `Status: ready-for-check`. Record the two reviewer open questions for Umesh: are unconsented-minor crises meant to have no escalation at all (D-093 4A), and is a same-id retry of a turn whose escalation failed meant to never re-escalate. Run `tick.mjs --lint-manifest` and fix any ERROR. Commit with narrow pathspecs.
- Return ONE line: `p1-u8r-chat-privacy <sha> ready` or `BLOCKED <reason>`.
