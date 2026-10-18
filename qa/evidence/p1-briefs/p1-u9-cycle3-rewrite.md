# You are a /maker build subagent: U9 rewritten-brief repair (p1-u9-live-adapter), Opus
- Worktree: C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u9 (branch p1/u9, head f42740e = cycle-2 checker PASS). Work ONLY there. Never `git add -A`. Never touch .claude/**. Do NOT push.
- Policy pin: the manifest's (.14) with .15 rules. Fix cycles 1-2 are used; this is the ONE brief-rewrite reset (cycle counter resets to 1 of max 2 under the rewritten brief). Record `Brief rewrite: 1 (reset)` in the manifest.
- Read: D:/vc/qa/evidence/p1-briefs/p1-u9-c2-review-result.md (senior review BLOCK, H1 + Low), and the cycle-2 verdict qa/verdicts/p1-u9-live-adapter.md (its open risk 2 is the same defect as H1).
- Gate (D-096, Umesh): after a crisis the model stays muted until the student speaks again; only helpline audio plays; toolCall, turnComplete and interrupted never lift the mute.

## The defect (H1)
live.ts ~402: turnComplete calls flushUser(true), which resets crisisFiredForUtterance mid-utterance; the next chunk at ~348 (`muted && !crisisFiredForUtterance`) unmutes. Reviewer probe: crisis -> turnComplete -> "because of exams" (same utterance continuing) -> 1 model audio chunk leaked (expected 0).

## Technical rule for "new student speech" (implement exactly; it refines D-096, does not change it)
The crisis mute lifts ONLY on the first student input chunk that satisfies BOTH:
1. a turnComplete (or interrupted) has been observed since the crisis fired, AND
2. at least `crisisResumeGapMs` (default 1200, constructor option) have passed since the LAST student input chunk (monotonic clock, injectable for tests).
A chunk failing either condition is the same crisis utterance: it stays muted and does not reset crisis state. turnComplete must use `flushUser(!this.crisisMute)` (or equivalent) so it never resets crisis state while muted. Works on the Gemini path where translateGeminiMessage always sends final=false (do not rely on a final flag).

## Also fix (reviewer Low, live.ts ~458)
A second spoken crisis within a new utterance (after the mute lifted, or after rule 1+2 above) must refire the helpline audio. Same-utterance duplicates must not double-fire.

## Tests (TDD: failing test first, add, never weaken)
- H1 probe: crisis -> turnComplete -> same-utterance chunk within gap -> model audio -> 0 emitted.
- crisis -> turnComplete -> chunk after gap -> model audio -> heard.
- crisis -> chunk after gap but NO turnComplete -> still muted.
- Low: second crisis in a new utterance refires helpline once; duplicate in same utterance does not.
- Keep all 63 existing live.test.ts tests green.
- One falsification per changed criterion (H1, Low), each in a throwaway copy: green before, red after, restored.
- Run: `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm --filter <providers pkg> exec tsx --test tests/live.test.ts` plus `tsc --noEmit`. No full suite. Long lock waits are normal; wait.

## Finish
Manifest qa/manifests/p1-u9-live-adapter.md: `Brief rewrite: 1 (reset)`, `Fix cycle: 1 of max 2`, Round line, Pre-check[<id>] lines on final sha, Tests[<id>] lines, falsifications, Metrics, Status: ready-for-check. Commit narrow pathspecs. Return ONE line: `p1-u9-live-adapter <sha> ready`.
