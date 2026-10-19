# You are a /maker build subagent: U8r fix cycle 1 (p1-u8r-chat-privacy), tier L, dual check
- Worktree C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u8r (branch p1/u8r, code b018254, manifest a76bf38, base b1aadea). Use `git -C <wt>`, never `cd X && cmd`. Never `git add -A`. Never touch .claude/**. Do NOT push. C: is nearly full: falsify only by copying a single file to scratch.
- The senior review BLOCKED b018254. Its probes are in the scratchpad at rev-u8r/ (probe.ts, probe2.ts, probe3.test.ts); reuse them as the start of your tests. Students are often minors. A crisis must never go unescalated, and redaction may over-redact but never under-redact.

## Fix (TDD: a failing test first for each item)
1. HIGH, apps/api/src/chat.ts takeCrisisSlot ~322 / `crisis = level !== "none"` ~434 / quiet variant ~352-367: a "concern" turn takes the slot, so a following "crisis" turn in the window runs the quiet graph with no escalation. Fix: rank the levels. A turn whose level is higher than the level that holds the slot always runs the full path (stored, flagged, escalated, counted) and upgrades the slot. Only a turn of equal or lower level is quiet. Test: concern, then crisis 60 s later, gives 2 escalations; crisis then crisis gives 1; crisis then concern gives 1.
2. MEDIUM race (~455-460): when the slot holder fails and releases its slot, a concurrent quiet turn was already answered without a record. Fix: a quiet turn writes a minimal flag-only record (level plus timestamp, no student text) so no crisis turn is ever unrecorded. Also: a retry with the same clientTurnId of a completed crisis turn must replay, not rerun the model. Test both.
3. MEDIUM, packages/schemas/src/redact.ts sentence-swallow break: titles leak names ("My name is Dr. Anita Verma" becomes "[NAME]. Anita Verma"). Do not break on title tokens (Dr, Mr, Mrs, Ms, Prof, Shri, Smt, Sri, Kumari, Km, case-insensitive). Test "My name is Dr. Anita Verma", "I am Mr. Rao from Pune", "my name is prof. sharma".
4. MEDIUM, redact.ts EMAIL regex is quadratic with no "@" (100k chars took 5 s). Fix: skip the email pass when the text has no "@", and bound the local part to {1,64}. Test that 200k characters of "a." redact in under 200 ms.
5. MEDIUM, accept and document (no code change): in the profile-outage crisis path the escalation text lacks the profile name. Correct the header comment that says "redaction never fails open" so it states this case. Record it as an open risk in the manifest.
- Do not weaken or delete any existing assertion.

## Pre-check + manifest
- Via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh ...` (long waits are normal; never quit on a busy lock): apps/api chat-privacy, chat and chat-profile tests; schemas redact.test.ts; db student-store.test.ts; the whole schemas, db and api packages; typecheck for those 3.
- One falsification per changed criterion, on a scratch copy of the single file.
- Manifest: `Fix cycle: 1`, add the new criteria, Pre-check[<id>] lines on the final sha, keep the dual-trigger line, `Status: ready-for-check`. Run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --lint-manifest <manifest>` and fix any ERROR. Commit with narrow pathspecs.
- Return ONE line: `p1-u8r-chat-privacy <sha> ready` or `BLOCKED <reason>`.
