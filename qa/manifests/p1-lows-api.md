# Manifest — p1-lows-api
**Contract:** none new (low leftovers). Criteria are the issue ids below; brief `qa/evidence/p1-briefs/p1-lows-api.md`; decision D-101.
**Criteria:** ISS-260, ISS-261, ISS-262, ISS-263
**Goal task:** none
**Date:** 2026-10-19
**Status:** ready-for-check
**Fix cycle:** 0
**Dual check:** no (test and docs only; no src change)
**Persona walk:** skip (no screen)
**Issues addressed:** ISS-260, ISS-261, ISS-262, ISS-263
**Executor:** claude-sonnet-subagent (maker/builder p1-lows-api)
**Executor rationale:** one test file plus one doc; one context.
**Note:** test-only (plus one doc). Per the test lane no checker is needed; the orchestrator sets the final status.

## Criteria
- **ISS-260** — a committed test pins the voice H3 unique crisis turn ids for an unconsented minor (flag keeps the spoken id once, a second crisis gets a fresh id, nothing escalated or stored).
- **ISS-261** — tests for two worded crises, a worded crisis then a no-words crisis on the same turn, and a throwing redaction followed by a second crisis.
- **ISS-262** — investigation only (findings below); one ordering test pins the conclusion.
- **ISS-263** — `docs/go-live-checklist.md`: the exact-`true` env flags and the G-PROD (c) prerequisites.

## What changed
Commit `df5059e` on branch `p1/lows-api` (base main 8efd936). No src change.
- `apps/api/tests/voice-crisis-turn.test.ts` — `runWith` takes an optional `claims` (default `adult()`); +5 tests ("ISS-260 ...", "ISS-261 ..." x3, "ISS-262 ordering ..."); +`minorNoConsent` import.
- `docs/go-live-checklist.md` (NEW, short).
- Evidence: `qa/evidence/p1-lows-api/green.txt`, `qa/evidence/p1-lows-api/falsification.txt`.

## ISS-262 findings (investigate only, no product change)
`onCrisisRecord` reads `c.lastUser` (voice.ts ~818). The order is guaranteed, so it cannot read the previous turn's id when the crisis has words:
1. `LiveSession.fireCrisis` (packages/providers/src/live.ts ~535-546) calls `flushUser(false)` BEFORE it queues `onCrisis`; `flushUser` queues the user `onFinalTranscript` when the utterance has words.
2. Sink writes run on one serial chain (`writeSink`, live.ts ~345): the user transcript, the fixed assistant reply, then `onCrisis`, in that order, each awaited.
3. `onFinalTranscript` calls `assignTurn` (sets `c.lastUser`) as its first statement, before any await (voice.ts ~710).
4. The only case where no user transcript is queued is an utterance with no words (`userBuf` empty); then `lastUser` is the older turn, but `raw === ""` makes `ownTurn` false, so the flag gets a fresh crisis id and never borrows it (covered by C18 (a)/(c) and H3, and by the new "worded then no-words" test).
5. For an unconsented minor `raw` is `undefined` (not `""`), so `ownTurn` is true and a no-words crisis can borrow `lastUser`'s id once, if that id has not been used by a crisis. That is a flag keyed by an earlier turn's id, text-free and harmless (ids and time only); the reuse guard makes a second crisis fresh. Not a bug; noted, no change.
Verdict: ordering confirmed by source and by the new ISS-262 test; falsified by M5. No code change needed.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.16
Tier: S (test and doc only, no src change)
Round: fix cycle 0, 2 files (apps/api/tests/voice-crisis-turn.test.ts, docs/go-live-checklist.md), est 30 min.
Affected tests / full-suite trigger: `apps/api/tests/voice-crisis-turn.test.ts` only (test-only diff; nothing imports it). No whole-repo suite.
Tests[ISS-260]: apps/api/tests/voice-crisis-turn.test.ts node "ISS-260 H3 for an unconsented minor ..." (1)
Tests[ISS-261]: apps/api/tests/voice-crisis-turn.test.ts nodes "ISS-261 ..." (3): two worded crises, worded then no-words, throwing redaction then a second crisis
Tests[ISS-262]: apps/api/tests/voice-crisis-turn.test.ts node "ISS-262 ordering ..." (1)
Tests[ISS-263]: no test node, docs only — a checklist; the flag behaviour it describes is already pinned by the existing exact-"true" flag tests in chat and voice
Pre-check[ISS-260]: df5059e VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh bash -c "pnpm -C apps/api exec tsx --test tests/voice-crisis-turn.test.ts; pnpm -r typecheck" -> green: 13 passed, 0 failed (whole file; this criterion: 1 node) TEST_RC=0 TSC_RC=0 (2026-10-19T12:12:51+05:30..12:14:20) blobs=apps/api/tests/voice-crisis-turn.test.ts:ec7785b (qa/evidence/p1-lows-api/green.txt)
Pre-check[ISS-261]: df5059e same command -> green: 13 passed, 0 failed (whole file; this criterion: 3 nodes) TEST_RC=0 TSC_RC=0 (qa/evidence/p1-lows-api/green.txt)
Pre-check[ISS-262]: df5059e same command -> green: 13 passed, 0 failed (whole file; this criterion: 1 node) TEST_RC=0 TSC_RC=0 (qa/evidence/p1-lows-api/green.txt)
Pre-check[ISS-263]: df5059e pnpm -r typecheck (docs-only criterion, nothing else to run) -> green: TSC_RC=0 (qa/evidence/p1-lows-api/green.txt)
Falsification: throwaway detached copy D:/vc/.worktrees/p1-lows-api-fals (script-free sed mutants, output qa/evidence/p1-lows-api/falsification.txt): BASELINE 13/13; M1 (ISS-260) fail 1; M2 (ISS-261 ids) fail 4; M3 (ISS-261 worded+no-words) fail 3; M4 (ISS-261 redaction) fail 2; M5 (ISS-262) fail 4; every mutant killed, tree restored after each
mutant-cap-raise: four low issues each need a named falsification (ISS-260 minor id, ISS-261 worded ids plus redaction, ISS-262 ordering): 5 one-line edits in a throwaway copy, each killed by named new tests.
Metrics: start=2026-10-19T11:55:34+05:30 end=2026-10-19T12:15:02+05:30 builder_min=unavailable wall_min=21 agent_min=unavailable blocked_min=1 suite_runs=0 repeat_runs=1 mutations=5 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.16 lane=test check_s=unavailable mutants=5 defects_unit=0 defects_6c=0 (repeat_runs=1: the first run failed on a missing `minorNoConsent` import in my own new test, fixed and re-run)
