# Manifest — p1-u9-live-adapter
**Contract:** C1, C2, C3, C4, C5, C6 (unit-local ids, below). Parent criteria: spec v8 A9b (post-hoc audit fires) and A12 (voice error event) at the seam level; A10 (real Gemini voice gate) is REAL and NOT run here. Plan row U9 (plan.md line 28), brief `qa/evidence/p1-briefs/p1-w3-u9.md`.
**Criteria:** C1 interface, C2 mock, C3 gemini, C4 crisis, C5 audit, C6 sink
**Goal task:** none
**Date:** 2026-10-19
**Status:** checked-PASS
**Close-out:** PASS at brief rewrite 1 (cycle rw1), verdict qa/verdicts/p1-u9-live-adapter.md at f53b50a; senior review Approve (qa/evidence/p1-briefs/p1-u9-rw1-review-result.md). Review test gaps and residual risks filed as ISS-175..ISS-182 in qa/issues.jsonl (all low; G-REAL / A10 where noted).
**Brief rewrite:** 1 (reset)
**Fix cycle:** 1 of max 2
**Dual check:** no (no auth, tenancy or prod-write trigger: provider seam, mock only, no network)
**Persona walk:** skip (no human screen; the voice UI is U8/U10)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent (maker/builder p1-u9, resumed after a session restart)
**Executor rationale:** one package (`@vc/providers`), one new module plus 4 index lines; one context.

## Criteria
- **C1 interface** — audio PCM16 16 kHz in and 24 kHz out; input and output transcripts; tool calls; interrupt; close.
- **C2 mock** — the Mock implementation is fully tested (every C1/C4/C5/C6 test drives it).
- **C3 gemini** — the Gemini adapter is compile-only: translates SDK message shapes, no network, no SDK import; real use waits for G-REAL.
- **C4 crisis** — a hook on the input transcript calls an injected crisis detector, then plays the fixed message (model audio muted, backend interrupted).
- **C5 audit (A9b)** — the output-transcript audit emits a `flag` event (and an audit record for the thread); a clean transcript emits none.
- **C6 sink** — final transcripts leave through a callback interface for U8; `packages/providers` imports nothing from `apps/api`.

## What changed
Code commit `e80c9b3` on branch `p1/u9` (base origin/main 47ab62a). Owned path `packages/providers/**` only.
- `packages/providers/src/live.ts` (NEW, 821 lines) — `LiveProvider`/`LiveSession`/`LiveBackend` interface, `MockLiveProvider`/`MockLiveBackend`, `GeminiLiveProvider` (injected `GeminiLiveConnector`, no SDK import), crisis hook, output auditor hook + `createSimpleOutputAuditor`, `LiveTranscriptSink`.
- `packages/providers/src/index.ts` — 4 re-export lines.
- `packages/providers/tests/live.test.ts` (NEW, 48 tests).
- Evidence: `qa/evidence/p1-u9/`.
- No existing code or test deleted or renamed.

## Verification scope
Policy-Version: proportional-verification/2026-10-17.14
Tier: M (provider seam, mock only; no auth, tenancy, student-data write or paid call)
Round: brief rewrite 1 (reset), fix cycle 1 of max 2, 2 files (packages/providers/src/live.ts, tests/live.test.ts), H1 + Low from the cycle-2 senior review BLOCK (qa/evidence/p1-briefs/p1-u9-c2-review-result.md; same defect as the cycle-2 verdict's open risk 2), rewritten brief qa/evidence/p1-briefs/p1-u9-cycle3-rewrite.md, est 30 min; cycle-2 verdict PASS, review BLOCK. Earlier round: fix cycle 2, 2 files (packages/providers/src/live.ts, tests/live.test.ts), R1 + R2 from the cycle-1 senior review (qa/evidence/p1-briefs/p1-u9-repair-review-result.md) under the D-096 gate answer, plus 4 lows; est 30 min; cycle-1 verdict PASS (qa/verdicts/p1-u9-live-adapter.md), review Warning. Earlier round: fix cycle 1, 2 files (packages/providers/src/live.ts, tests/live.test.ts), 5 repairs on the C4 crisis-interrupt path, est 40 min; cycle 0 verdict FAIL (F1 interrupted() unmutes after a crisis, F2 half reply dropped on crisis) plus the checker's Candidates M1, M2, M3
slow-plan: five independent repairs on one path, each with a failing test first, plus one falsification each, all serialised behind the shared machine-wide test lock (cannot be split below this without leaving the crisis path half repaired).
Base / checked state (brief rewrite 1): repair base f42740e (cycle-2 checker PASS head), code commit da32f8a (this manifest + evidence are a qa-only commit on top); live.ts/live.test.ts clean at da32f8a (blobs live.ts 2e3101d, live.test.ts c157273). Earlier: repair base a4864f8 (head the checker judged, code e80c9b3), code commit dea624f (this manifest + evidence are a second qa-only commit on top), worktree clean at the code commit
Affected tests / full-suite trigger: `@vc/providers` only (live.ts and its test file; no other package imports live.ts). Package run `qa/evidence/p1-u9/fix1-package-typecheck.txt` at dea624f: tests 117, pass 117, fail 0 (108 before + 9 new); typecheck exit 0. No whole-repo suite.
Tests[C1]: tests/live.test.ts nodes named "C1 ..." (13) — audio format, audio out, transcripts, tool call (3), interrupt (3), close (3), listener isolation; they exercise every part of the C1 interface through the Mock.
Tests[C2]: tests/live.test.ts nodes "C1|C4|C5|C6 ..." (40) — all of them drive MockLiveProvider/MockLiveBackend, so a Mock that mis-records or mis-scripts fails them.
Tests[C3]: tests/live.test.ts nodes named "C3 ..." (8) — loud failure with no connector, connect config, Gemini-shaped exchange, mic mime/base64, wrong sample rate, barge-in then close, SDK error, junk messages.
Tests[C4] brief rewrite 1: +7 nodes "C4 crisis H1|Low: ...": H1 Gemini order (crisis -> turnComplete -> same-utterance chunk at 300 ms -> model audio 0, no refire); lift after a real pause (2000 ms -> 1 heard); gap measured from the LAST chunk (800 ms steps never lift); pause without a turn end stays muted; crisisResumeGapMs constructor option (5000: 2 s muted, 8 s heard); Low new-utterance refire (2 crises; same-utterance duplicates, including after a turnComplete with no pause, stay at 2; mute re-armed); Low no stale re-scan (old crisis words flushed on lift, the new utterance is its own thread turn). 4 existing tests amended, assertions unchanged (see Brief rewrite 1).
Tests[C4] cycle 2: +6 nodes: R1 (crisis -> toolCall -> same-utterance chunk -> model audio: 0 heard, no refire), R2 (crisis -> interrupted -> turnComplete -> model audio 0; next student speech -> 1 heard), low queue cap (300 pre-attach tool calls -> 256 answered from t44, dropped-warning error events, crisis interrupt still replayed once), low double attach (LiveConfigError, first backend kept), low typed-then-spoken crisis (2 crises, 2 helpline audios), low audio copy (emitted buffer is not the config buffer; mutating it leaves the next playback intact). 2 existing tests amended to the D-096 rule (see Fix cycle 2).
Tests[C4]: tests/live.test.ts nodes named "C4 ..." (22 = 13 existing + 9 new) — existing: split-chunk phrase, mute after trigger, thread order, no refire, recovery, detector error, typed text, Gemini-shaped crisis. New (fix cycle 1): F1 x3 (interrupted after a non-final crisis chunk, after a FINAL crisis chunk, and the mute ends at turnComplete), F2 x1 (half reply audited + stored interrupted before the student words), M1 x2 (crisis and tool call before attach, replayed on attach), M2 x2 (typed crisis after a spoken one, harmless typed text after one), M3 x1 (no audio / empty / odd-length audio refused at construction).
Tests[C5]: tests/live.test.ts nodes named "C5 ..." (10) — uncited number, listed speaker, clean answer (no flag), word boundary, allow-listed 14416, after-the-fact timing, auditor crash, interrupted reply, two findings.
Tests[C6]: tests/live.test.ts nodes named "C6 ..." (4) — slow sink keeps order, sink failure contained, injected-clock ISO timestamps, source-text import guard (no apps/api, ws or vendor SDK).
Pre-check[C1]: da32f8a VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh bash -c "pnpm exec tsx --test tests/live.test.ts; pnpm exec tsc --noEmit" (cwd packages/providers) -> green: 70 passed, 0 failed (whole file; this criterion: 13 "C1 " nodes) TEST_RC=0 TSC_RC=0 (2026-10-18T23:57:25+05:30..23:58:43) blobs=packages/providers/tests/live.test.ts:c157273,packages/providers/src/live.ts:2e3101d (qa/evidence/p1-u9/rw1-green.txt; working tree blobs identical to those committed in da32f8a)
Pre-check[C2]: da32f8a VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh bash -c "pnpm exec tsx --test tests/live.test.ts; pnpm exec tsc --noEmit" (cwd packages/providers) -> green: 70 passed, 0 failed (whole file; this criterion: the C1/C4/C5/C6 nodes all drive the Mock) TEST_RC=0 TSC_RC=0 (2026-10-18T23:57:25+05:30..23:58:43) blobs=packages/providers/tests/live.test.ts:c157273,packages/providers/src/live.ts:2e3101d (qa/evidence/p1-u9/rw1-green.txt; working tree blobs identical to those committed in da32f8a)
Pre-check[C3]: da32f8a VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh bash -c "pnpm exec tsx --test tests/live.test.ts; pnpm exec tsc --noEmit" (cwd packages/providers) -> green: 70 passed, 0 failed (whole file; this criterion: 8 "C3 " nodes) TEST_RC=0 TSC_RC=0 (2026-10-18T23:57:25+05:30..23:58:43) blobs=packages/providers/tests/live.test.ts:c157273,packages/providers/src/live.ts:2e3101d (qa/evidence/p1-u9/rw1-green.txt; working tree blobs identical to those committed in da32f8a)
Pre-check[C4]: da32f8a VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh bash -c "pnpm exec tsx --test tests/live.test.ts; pnpm exec tsc --noEmit" (cwd packages/providers) -> green: 70 passed, 0 failed (whole file; this criterion: 35 "C4 " nodes (28 + 7 new in brief rewrite 1)) TEST_RC=0 TSC_RC=0 (2026-10-18T23:57:25+05:30..23:58:43) blobs=packages/providers/tests/live.test.ts:c157273,packages/providers/src/live.ts:2e3101d (qa/evidence/p1-u9/rw1-green.txt; working tree blobs identical to those committed in da32f8a)
Pre-check[C5]: da32f8a VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh bash -c "pnpm exec tsx --test tests/live.test.ts; pnpm exec tsc --noEmit" (cwd packages/providers) -> green: 70 passed, 0 failed (whole file; this criterion: 10 "C5 " nodes) TEST_RC=0 TSC_RC=0 (2026-10-18T23:57:25+05:30..23:58:43) blobs=packages/providers/tests/live.test.ts:c157273,packages/providers/src/live.ts:2e3101d (qa/evidence/p1-u9/rw1-green.txt; working tree blobs identical to those committed in da32f8a)
Pre-check[C6]: da32f8a VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh bash -c "pnpm exec tsx --test tests/live.test.ts; pnpm exec tsc --noEmit" (cwd packages/providers) -> green: 70 passed, 0 failed (whole file; this criterion: 4 "C6 " nodes) TEST_RC=0 TSC_RC=0 (2026-10-18T23:57:25+05:30..23:58:43) blobs=packages/providers/tests/live.test.ts:c157273,packages/providers/src/live.ts:2e3101d (qa/evidence/p1-u9/rw1-green.txt; working tree blobs identical to those committed in da32f8a)
Pre-check[typecheck]: da32f8a pnpm exec tsc --noEmit (cwd packages/providers) -> TSC_RC=0, no output (qa/evidence/p1-u9/rw1-green.txt); whole-repo typecheck not re-run (only live.ts and its test changed, nothing else imports live.ts)
Pre-check[package]: not re-run in brief rewrite 1 or cycle 2 (brief: live.test.ts + tsc only, no full suite); last package run dea624f 117/117 (qa/evidence/p1-u9/fix1-package-typecheck.txt)
Pre-check[red-first-rw1]: f42740e live.ts + the 7 new rewrite-1 tests only -> RED: tests 7, pass 2 (the two guard tests: lift after a real pause; no lift without a turn end), fail 5 (qa/evidence/p1-u9/rw1-red.txt); after the repair all 70 green (rw1-green.txt)
Pre-check[falsify-rw1]: throwaway copy scratchpad/p1-u9-fals-rw1 (script qa/evidence/p1-u9/rw1-falsify.py, output rw1-falsification.txt, 2026-10-18T23:58:57+05:30..2026-10-19T00:00:37): BASELINE 70/70 rc=0 (green before); H1 mutant (resume-gap condition dropped) rc=1 fail=4 (3 "C4 crisis H1" + 1 "C4 crisis Low"); Low mutant (lift does not end the crisis utterance) rc=1 fail=2 ("C4 crisis Low: a second spoken crisis..." + amended "C4 crisis low: a client that mutates..."); RESTORED 70/70 rc=0
Pre-check[red-first-c2]: f2af54f + the 6 new cycle-2 tests only (live.ts unrepaired) -> RED: tests 6, pass 0, fail 6 (qa/evidence/p1-u9/fix2-red.txt); after the repair all 63 green (fix2-green.txt)
Pre-check[red-first]: a4864f8 + the 9 new tests only (live.ts unrepaired) -> RED: 9 run, 1 pass (the "mute ends at turnComplete" guard test), 8 fail, one per defect variant (qa/evidence/p1-u9/fix1-red.txt); the repair turned them green: tests/live.test.ts 57/57 (qa/evidence/p1-u9/fix1-live-test-green.txt)
Metrics[rw1]: start=2026-10-18T23:34:36+05:30 end=2026-10-19T00:02:00+05:30 builder_min=unavailable wall_min=28 agent_min=unavailable blocked_min=19 suite_runs=0 repeat_runs=1 mutations=2 cycle=1 brief_rewrite=1 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-17.14 lane=normal check_s=unavailable mutants=2 defects_unit=2 defects_6c=0 (repeat_runs=1: the first green run failed 1 of 70 on a defect in the new no-stale-re-scan test, which never ended the new utterance so it was never flushed; the test now ends it with turnComplete, assertion unchanged. blocked_min = testlock waits behind eng3/chk-a/p1-u8 runs)
Metrics[c2]: start=2026-10-18T04:15:11+05:30 end=2026-10-18T04:23:10+05:30 builder_min=unavailable wall_min=9 agent_min=unavailable blocked_min=2 suite_runs=0 repeat_runs=1 mutations=6 cycle=2 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-17.14 lane=normal check_s=unavailable mutants=6 defects_unit=2 defects_6c=0 (repeat_runs=1: falsify script crashed in its own cp1252 print before any result, re-run with -X utf8; blocked_min = testlock wait behind p1-u8)
Metrics: start=2026-10-18T02:24:26+05:30 end=2026-10-18T03:02:50+05:30 builder_min=unavailable wall_min=39 agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=1 mutations=7 cycle=1 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-17.14 lane=normal check_s=unavailable mutants=7 defects_unit=2 defects_6c=0
mutant-cap-raise: cycle 1 repairs five independent behaviours on one path (F1, F2, M1 with two sub-paths, M2, M3), so one falsification per repair, plus a C5 mutant because F2 changes audit behaviour: 7 edits in a throwaway copy, each killed by named C4 tests.
(suite_runs=0: no whole-repo suite; repeat_runs=1: the falsification script was re-run once after a Windows console-encoding crash in its own print, not a product failure. blocked_min is the testlock wait. Cycle 0 figures are in the verdict, not repeated here.)

## Capability coverage (each criterion -> a named falsification, run in a throwaway copy, never the bound tree; observed in `qa/evidence/p1-u9/falsification-summary.txt`, restored run 48/48 pass)
| Criterion | falsifying edit (src/live.ts) | observed (live.test.ts, 48 tests) |
|---|---|---|
| C1 | C1a: odd/empty PCM16 check removed in sendAudio | 1 fail |
| C1 | C1b: interrupt() no longer tells the backend | 1 fail |
| C1 | C1c: close() not idempotent | 1 fail |
| C1 | C1d: tool handler result never sent back | 2 fail |
| C1 | C1e: interrupt mute removed (model audio continues after barge-in) | 1 fail |
| C2 | C2: MockLiveBackend does not record audio in | 1 fail |
| C3 | C3a: Gemini sends mic audio with the 24 kHz mime | 1 fail |
| C3 | C3b: Gemini output sample-rate check removed | 1 fail |
| C3 | C3c: Gemini tool response not wrapped for non-objects | 1 fail |
| C4 | C4a: detector sees only the latest chunk, not the utterance | 1 fail |
| C4 | C4b/C4c/C4d: model not muted / backend not interrupted / fixed audio not played | 2 / 3 / 1 fail |
| C4 | C4e: detector error fails open | 1 fail |
| C4 | C4f: crisis refires for every chunk of the same utterance | 1 fail |
| C4 | C4g: typed text during voice not scanned | 1 fail |
| C5 | C5a: flag event never emitted | 7 fail |
| C5 | C5b: uncited numbers never flagged | 6 fail |
| C5 | C5c: auditor crash swallowed as clean | 1 fail |
| C5 | C5d: interrupted half reply not audited | 4 fail |
| C5 | C5e: audit record not handed to sink | 2 fail |
| C6 | C6a: sink failure not contained | 1 fail |
| C6 | C6b: sink writes not serialised | 1 fail |
| C4 (fix cycle 1) | F1: `interrupted()` clears `muted` unconditionally again | 2 fail (both F1 leak tests, named in qa/evidence/p1-u9/fix1-falsification.txt) |
| C4 (fix cycle 1) | F2: `fireCrisis` drops the half reply (`assistantBuf = ""`) instead of `flushAssistant(true)` | 1 fail |
| C4 (fix cycle 1) | M1a: crisis backend interrupt not queued before attach | 1 fail |
| C4 (fix cycle 1) | M1b: tool call before attach not queued | 1 fail |
| C4 (fix cycle 1) | M2: typed text skips the scan once a crisis fired for the utterance | 2 fail |
| C4 (fix cycle 1) | M3: constructor no longer requires crisis audio | 1 fail |
| C4 (fix cycle 2) | R1: toolCall ends the crisis utterance again (`flushUser(true)`) | rc=1, "C4 crisis R1" fails |
| C4 (fix cycle 2) | R2: turnComplete clears muted + crisisMute again | rc=1, "C4 crisis R2" + amended F1 fail |
| C4 (fix cycle 2) | L1a queue uncapped / L1b double attach allowed / L2 typed crisis sets the spoken flag / L3 shared audio reference | rc=1 each, its own "C4 crisis low" test fails |
| C4 (brief rewrite 1) | H1: lift condition 2 (resume gap) dropped | rc=1, 4 fail (3 "C4 crisis H1", 1 "C4 crisis Low") |
| C4 (brief rewrite 1) | Low: the lift no longer ends the crisis utterance (`flushUser(true)` removed) | rc=1, 2 fail ("C4 crisis Low: a second spoken crisis...", amended "low: a client that mutates...") |
| C5 (fix cycle 1) | F2 variant: `flushAssistant(true)` stops auditing interrupted half replies | 1 fail (the F2 test) |
(Every cycle-1 mutant failed on named assertions, not an import error; restored copy rc=0. Run in `scratchpad/p1-u9-fals`, a copy; the bound tree was never mutated. Script: `qa/evidence/p1-u9/fix1-falsify.py`.)

## Fix cycle 1 (what changed, decisions)
Code commit `dea624f` on `p1/u9`, `packages/providers/src/live.ts` (+97/-26) and `tests/live.test.ts` (+116, no existing test edited or weakened).
- **F1** `interrupted()` (live.ts, was 365-370): now keeps the mute while a new `crisisMute` flag is set. I used a separate flag, not only `!crisisFiredForUtterance` as the brief suggested, because `crisisFiredForUtterance` is reset by a FINAL transcript chunk (`flushUser(true)`), so a crisis on a final chunk followed by `interrupted` would still have reopened the audio (test F1 #2). `crisisMute` is set in `fireCrisis`, cleared by `turnComplete` and by the next non-crisis student speech (the existing un-mute path at inputTranscript).
- **turnComplete decision** (brief asked me to say what I chose): I KEPT the `turnComplete` clear, as a test pins it (the recovery test) and it is the only end-of-generation signal this seam receives; there is no playback-finished signal from the client, so "until the crisis message has fully played" cannot be measured here. Residual risk: if Gemini answers the crisis utterance as a NEW turn after `turnComplete`, that reply would be audible. That is a G-REAL / A10 live-gate question and is not provable offline (the cycle-0 verdict says the same).
- **F2** `fireCrisis`: `assistantBuf = ""` replaced by `flushAssistant(true)` before the mute, so the half reply is audited and stored as `interrupted: true`, ordered before the student words and the fixed reply (seq 1, 2, 3 in the test).
- **M1** `toolCall` and `fireCrisis` queue their backend-dependent part in `pendingBackendEvents` when no backend is attached yet; `attach` replays them (each in try/catch). The fixed crisis message still plays immediately; only the backend interrupt waits.
- **M2** `sendText` scans with `force`, bypassing the "already fired for this utterance" short-circuit (that rule is for later chunks of the same spoken utterance). A typed crisis after a spoken one fires the fixed message again and is not forwarded; harmless typed text is scanned and forwarded.
- **M3** the `LiveSession` constructor throws `LiveConfigError` if a detector is wired without non-empty, even-length `crisisMessage.audio`. The type stays optional (text-channel use). Any other caller that builds a Live session with a detector and a text-only message (U8, not in this worktree) must now supply the audio; grep found no other user of `crisisMessage` in this tree.
- Not touched (Candidates): heard partial dropped on crisis beyond F2, `interrupt()` throw, `latencyMs`, auditor comment wording.

## Fix cycle 2 (what changed, decisions)
Code commit `e1296f5` on `p1/u9` (base f2af54f), `packages/providers/src/live.ts` (+50/-21) and `tests/live.test.ts` (+91/-3). Gate answer D-096 (Umesh): after a crisis the model stays muted until the student speaks again; only the helpline audio plays; toolCall, turnComplete and interrupted never lift the mute.
- **R1** `toolCall()`: `flushUser(!this.crisisMute)` - during a crisis mute a tool call writes the user words but does not end the utterance, so `crisisFiredForUtterance` stays set and a later chunk of the same utterance neither lifts the mute nor refires.
- **R2** `turnComplete()`: `if (!this.crisisMute) this.muted = false;` and no longer clears `crisisMute`. It still ends the utterance (`flushUser(true)`), so the NEXT student speech chunk lifts both mutes in `inputTranscript` (the existing un-mute path). A final transcript chunk also ends the utterance.
- **Low queue cap** `PENDING_BACKEND_EVENTS_MAX = 256` (exported): `queueBeforeAttach` drops the oldest with an `error` event ("dropped the oldest queued event"; LiveEvent has no warning type, I did not widen the interface). The crisis backend interrupt moved out of the queue into a `pendingCrisisInterrupt` flag replayed first on attach, so a flood can never drop it.
- **Low double attach** `attach()` throws `LiveConfigError` if a backend is already attached (MockLiveProvider/GeminiLiveProvider each attach once).
- **Low typed crisis** `fireCrisis(level, started, spoken)` sets `crisisFiredForUtterance` only for spoken input, so a later spoken crisis refires the helpline audio. Consequence: after a typed crisis, the next spoken chunk lifts the mute (it is new student speech, per D-096).
- **Low audio copy** the fixed audio is emitted as `message.audio!.slice()`.
- **Existing tests amended (not weakened):** "C4 crisis: the student recovers..." and "C4 crisis F1: after crisis + interrupted the model's turn ends..." pinned the cycle-1 behaviour that turnComplete lifts a crisis mute, which D-096 forbids. Each now inserts a student utterance before the audible model reply; the F1 test also asserts 0 model audio after turnComplete and before the speech (stricter than before).
- Falsification (throwaway copy scratchpad/p1-u9-fals, script qa/evidence/p1-u9/fix2-falsify.py, output fix2-falsification.txt): each mutant reverts one repair; all 6 rc=1 on their named tests, restored copy rc=0. R1 revert -> "C4 crisis R1" fails; R2 revert -> "C4 crisis R2" and the amended F1 test fail; L1a/L1b/L2/L3 reverts -> their own "low" test fails. Green before = fix2-green.txt 63/63 on the same blobs.
- Residual (unchanged): whether Gemini actually emits turnComplete and then a fresh reply after a cancelled generation is a G-REAL/A10 question; the seam now stays muted either way.

## Brief rewrite 1 (reset; what changed, decisions)
Code commit `da32f8a` on `p1/u9` (base f42740e): `packages/providers/src/live.ts` (+49/-8) and `tests/live.test.ts` (+123/-4). Brief `qa/evidence/p1-briefs/p1-u9-cycle3-rewrite.md`; gate D-096 unchanged, refined by the brief's technical rule for "new student speech".
- **H1** `inputTranscript()`: while `crisisMute`, the mute lifts ONLY on a chunk where (1) `crisisTurnEnded` (a `turnComplete` or `interrupted` arrived since the crisis fired; reset in `fireCrisis`) AND (2) `monotonicNow() - lastStudentChunkAt >= crisisResumeGapMs`. Every chunk updates `lastStudentChunkAt`, so the gap is from the LAST student chunk. A failing chunk is the same crisis utterance: it stays muted and keeps the crisis state. No final flag is relied on; a final chunk during a crisis mute calls `flushUser(false)`.
- `turnComplete()` now calls `flushUser(!this.crisisMute)` and, during a crisis mute, only sets `crisisTurnEnded`; `interrupted()` likewise. Client-interrupt mutes behave as before.
- New optional config: `crisisResumeGapMs` (default exported `CRISIS_RESUME_GAP_MS_DEFAULT = 1200`; a non-finite or negative value throws `LiveConfigError`) and `monotonicNow` (default `performance.now()`).
- **Low** on lift the session first calls `flushUser(true)`: the crisis utterance's words go to the thread and `crisisFiredForUtterance` resets, so a crisis in the new utterance refires once, and the old crisis text is not re-scanned (no false refire). Same-utterance duplicates (including after a turnComplete with no pause) do not refire.
- **Existing tests amended (assertions unchanged, never weakened):** "C4 crisis: the student recovers...", "C4 crisis F1: after crisis + interrupted the model's turn ends..." and "C4 crisis R2: ..." each inject `monotonicNow` and advance it 3000 ms before the student's next words; "C4 crisis low: a client that mutates the helpline audio buffer..." adds a `turnComplete` + 3000 ms pause before its second crisis (under the new rule two back-to-back final chunks with no turn end are one utterance). No assertion line changed.
- Open risks: (a) `interrupted` counts for condition 1, and the backend's own confirmation of OUR crisis interrupt is an `interrupted`, so in practice condition 1 is met almost at once and the 1200 ms pause carries the rule; a student who pauses >= 1.2 s mid-sentence after a crisis lifts the mute (the brief's rule, accepted). (b) Real Gemini chunk cadence vs 1200 ms is a G-REAL/A10 question. (c) Typed input does not count as a student chunk for the gap. (d) No senior review dispatched by the maker.

## Not done / stated limits (for the checker)
- **Gemini is compile-only.** The `GeminiLiveConnector` message shapes follow the read-only reference `D:/ikigai_counsellor/server/geminiLiveService.ts`; no real socket, SDK or key was used. A10 (real voice gate: latency, 300 ms interrupt, 20-phrase crisis set with at most 2 s of model audio) is REAL and waits for G-REAL.
- **Voice crisis is enforced from the trigger on, not before it.** The model may already be speaking when the transcript chunk that triggers arrives; after the trigger no model audio is forwarded. The spec states A1/A3 are audited after the fact in voice.
- The crisis detector and the output auditor are injected. `createSimpleOutputAuditor` is a stated heuristic (uncited numbers, listed names); wiring the engine's real crisis guard and the speaker list is U8's job.
- U8 owns persistence and the WebSocket route; this unit only calls the `LiveTranscriptSink` callback.
- No `senior-software-engineer` / `ai-engineer` review was dispatched (brief: dispatch no checker); the orchestrator owns it.
- CORE-REQUEST: none.

## Live browser evidence
Not UI-touching — changed paths are `packages/providers/**` and `qa/`.

## How to verify (commands + expected)
- `bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/packages/providers test` -> expected: tests 130, pass 130, fail 0 (117 at cycle 1 + 6 cycle 2 + 7 rewrite 1; not re-run by the maker since cycle 1).
- `bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/packages/providers exec tsx --test --test-name-pattern="^C3 " tests/live.test.ts` (and C1, C4, C5, C6) -> expected counts in the Pre-check lines.
- `pnpm -C <worktree> -r typecheck` -> exit 0.
