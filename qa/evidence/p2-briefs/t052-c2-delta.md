# Addendum 2: t-052 cycle 2, write the P0 follow-up delta for re-review (same rules as t052-c2.md and t052-c2-attempt2.md)
Your BLOCKED-PLAN-REVIEW was correct. Your P0 evidence is committed as 3cae385 (qa/evidence/t052-c2-p0/ and the manifest section).

## Task
Write ONLY qa/evidence/t052-plan-20261016/delta-c2.md, committed on main by pathspec. Make no source or test edits yet. The file gives proposed hunks, with file:line anchors at 28bb3bc, for these:

1. **C4:** the checkpointer.ts read-wrapper change that closes A-c start. The 16 post-hold provider calls were dispatched 104-154 ms before expiry. Explain why 3.9 alone does not close it, and give the falsifier: which P0 rows go green, and which mutant brings them back red.
2. **Rule (c), N-b rows 64 and 65:** the per-fact:1237 1 ms clock race. Give a root-cause hunk. If the fix is in the fixture, say whether it is a protected test change (weakening an assertion is not allowed; making the clock deterministic is).
3. **Rule (c), row 128:** the DOMException AbortError with no reason, raised from the erasure.ts:600 timer. Link it to H-005 / defect 3.8, and say whether the existing 3.8 hunk already covers it or what has to be added.
4. **The 6 files that match their pin in no commit** (openapi.ts, server.ts, server.test.ts, consent.test.ts, db-init.test.ts, checkpointer.ts): state the 28bb3bc content hashes as the new pins, with the reason.
5. **The updated P1 freeze list and expected P0/P3 outcomes per row.**

Keep the plan-v2 structure, cite review-approve-2.md C1-C6 where they apply, and mark every new hunk id. Do not edit plan-v2.md, hunks-v2.md or review files.

Return `DELTA t-052 <sha>` plus at most 5 lines. A fresh reviewer will judge the file. You will resume P1 only after that reviewer approves it.
