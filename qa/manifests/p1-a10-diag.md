# Manifest — p1-a10-diag
**Contract:** brief `qa/evidence/p1-briefs/a10-diagnose.md`; D-100 / G-REAL (a); A10 crisis check (spec section 3, 2 s bound unchanged).
**Criteria:**
- D1 the runner records per clip: input transcripts with arrival times, whole-transcript crisisGuard result, end-of-stream time, speech end, crisis time, derived cause
- D2 the end-of-stream marker (`LiveSession.endAudio`, Gemini `audioStreamEnd`) is sent after every clip's last chunk, and a fake provider that only releases the transcript on it proves the difference (with and without)
- D3 the diagnostic tail never changes escalated/pass; the 2 s bound and the 20-phrase set are unchanged
- D4 exactly one real run, per-clip causes classified in qa/evidence/p1-a10-diag/a10-diag-report.md; qa/gates/a10-voice-gate.md records the Result honestly
**Goal task:** none
**Date:** 2026-10-21
**Status:** checked-PASS (verdict c6a6dd1)
**Fix cycle:** 0
**Policy-Version:** proportional-verification/2026-10-19.17
**Tier:** M (voice safety evaluation tooling; no production write)
**Dual check:** no
**Persona walk:** skip (no human screen)
**Executor:** claude-sonnet-subagent (maker a10-diagnose)
**Executor rationale:** in-place additions to the live runner and Live adapter plus one approved real run.

## What changed
Branch `p1/a10-real` (main merged at 0c5a00a). Code commit `3e9eaba`; this manifest and the evidence are a later commit.
- packages/providers/src/live.ts: `LiveBackend.endAudio?`, `LiveSession.endAudio`, Gemini + Mock implementations.
- packages/engine/evals/live-audio.ts (`measureCrisisClip`): end-of-stream call, per-clip diagnostics, `diagnosticTailMs`, `sendEndOfStream` test switch.
- packages/engine/evals/run-live.ts: tail default 4000 ms for the real provider (charged to the budget guard); report.ts: per-clip diagnostics table.
- Tests: packages/providers/tests/live.test.ts (+2), packages/engine/evals/live-audio.test.ts (+5).
- Not touched: crisis.ts, .claude/**, ARCHITECTURE.md, docs/DECISIONS.md, qa/contracts, TASKS.md, QUEUE.md, HANDOFF.md.

## Verification scope
Tests[D1,D2,D3]: `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm -C D:/vc/.worktrees/a10real/packages/engine exec tsx --test evals/run-live.test.ts evals/live-audio.test.ts evals/live-audio-gen.test.ts evals/p1-runners.test.ts` -> 125 tests, 125 pass, 0 fail (120 before the unit)
Tests[providers]: same lock, `tsx --test tests/live.test.ts` in packages/providers -> 72 tests, 72 pass, 0 fail
Typecheck: `tsc --noEmit -p .` in engine and providers, and `-p evals/tsconfig.json` in engine -> no errors (scripts tsconfig and full suite not run)
Real run[D4]: qa/evidence/p1-a10-diag/a10-diag-report.md: 10/20, FAIL; cost est USD 0.1444
Metrics: end=2026-10-21T12:41:50+05:30 suite_runs=3 repeat_runs=0 real_runs=1
Not independently reviewed yet: the checker re-runs the verify commands and reads the raw JSON.
