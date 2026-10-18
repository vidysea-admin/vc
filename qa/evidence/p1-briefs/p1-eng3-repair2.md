# You are a /maker build subagent: eng3 fix cycle 2 (LAST cycle, cap 2), p1-eng3-crisis-leftovers, tier L
- Worktree C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-eng3 (branch p1/eng3, code 0cc886c, manifest 2c5d97c). Use `git -C <wt>`, never `cd X && cmd`. Never `git add -A`. Never touch .claude/**. Do NOT push. C: is nearly full: no throwaway copies of the whole worktree; for falsification copy only packages/engine/src/guards/crisis.ts to a scratch file and import it from a probe.
- Read: senior review result D:/vc/qa/evidence/p1-briefs/p1-eng3-c1-review-result.md (BLOCK), the cycle-1 brief D:/vc/qa/evidence/p1-briefs/p1-eng3-repair1.md, the cycle-0 verdict qa/verdicts/p1-eng3-crisis-leftovers.md, D-020 (recall over precision) in D:/vc/docs/DECISIONS.md.

## Fix (crisis.ts matchPointContinuing ~655-674, POINT_CLAUSE_WORDS)
- INVERT the logic. "point in going on / continuing" FIRES by default: end of input, punctuation, and any next word. It is suppressed ONLY when the next word is a study-object lead-in: `with, my, the, this, these, those, a, an, our, his, her, their, your, to` or a study noun (ielts, gre, gmat, toefl, sat, mba, ms, btech, course, degree, prep, preparation, studies, study, college, application, applications, coaching, exam, exams).
- Always fire, even after a suppress word: `living, life, live, alive, existing, exist` anywhere in the next 4 words ("continuing to live", "going on with life"). Also fire on `with things`, `with it`, `with everything`, `like this`, `without` (maker decision under D-020, fail closed; record it in the manifest as [ASSUMPTION] for Umesh).
- Keep all five W1 "none" tests passing ("continuing with MBA", "going on with this course", etc.).

## Tests (TDD: add first, see red on 0cc886c, then fix)
- Add every row of the review's table as a crisis test in packages/engine/tests/guard-crisis.test.ts: "...going on at all / without her / feeling like this / , nothing matters / everything is pointless / today / here / in this world / . Please help / my family would be better off / lol / with things / when nobody cares", "I don't see the point in continuing to live".
- Low (from the review): "kill1 myself" should be crisis (trailing 1 after "kill"). Fix it if it is a small, contained change to the leet view; otherwise leave it and note it.
- Do not weaken or delete any existing assertion.

## Pre-check + manifest
- Run via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh ...` (long waits are normal; never quit on a busy lock): engine tests/guard-crisis.test.ts and tests/crisis-defaults.test.ts, the 4 apps/api tests named in the manifest, plus engine typecheck.
- One falsification per changed criterion (green before, red after, restored), on a scratch copy of crisis.ts only.
- Update the manifest: `Fix cycle: 2`, Pre-check[<id>] lines on the final sha, `Status: ready-for-check`. Run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --lint-manifest <manifest>` and fix any ERROR. Commit with narrow pathspecs.
- Return ONE line: `p1-eng3-crisis-leftovers <sha> ready` or `BLOCKED <reason>`.
