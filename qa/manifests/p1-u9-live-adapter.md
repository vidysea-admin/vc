# Manifest — p1-u9-live-adapter
**Contract:** C1, C2, C3, C4, C5, C6 (unit-local ids, below). Parent criteria: spec v8 A9b (post-hoc audit fires) and A12 (voice error event) at the seam level; A10 (real Gemini voice gate) is REAL and NOT run here. Plan row U9 (plan.md line 28), brief `qa/evidence/p1-briefs/p1-w3-u9.md`.
**Criteria:** C1 interface, C2 mock, C3 gemini, C4 crisis, C5 audit, C6 sink
**Goal task:** none
**Date:** 2026-10-18
**Status:** ready-for-check
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
Round: fix cycle 1, 2 files (packages/providers/src/live.ts, tests/live.test.ts), 5 repairs on the C4 crisis-interrupt path, est 40 min; cycle 0 verdict FAIL (F1 interrupted() unmutes after a crisis, F2 half reply dropped on crisis) plus the checker's Candidates M1, M2, M3
slow-plan: five independent repairs on one path, each with a failing test first, plus one falsification each, all serialised behind the shared machine-wide test lock (cannot be split below this without leaving the crisis path half repaired).
Base / checked state: repair base a4864f8 (head the checker judged, code e80c9b3), code commit dea624f (this manifest + evidence are a second qa-only commit on top), worktree clean at the code commit
Affected tests / full-suite trigger: `@vc/providers` only (live.ts and its test file; no other package imports live.ts). Package run `qa/evidence/p1-u9/fix1-package-typecheck.txt` at dea624f: tests 117, pass 117, fail 0 (108 before + 9 new); typecheck exit 0. No whole-repo suite.
Tests[C1]: tests/live.test.ts nodes named "C1 ..." (13) — audio format, audio out, transcripts, tool call (3), interrupt (3), close (3), listener isolation; they exercise every part of the C1 interface through the Mock.
Tests[C2]: tests/live.test.ts nodes "C1|C4|C5|C6 ..." (40) — all of them drive MockLiveProvider/MockLiveBackend, so a Mock that mis-records or mis-scripts fails them.
Tests[C3]: tests/live.test.ts nodes named "C3 ..." (8) — loud failure with no connector, connect config, Gemini-shaped exchange, mic mime/base64, wrong sample rate, barge-in then close, SDK error, junk messages.
Tests[C4]: tests/live.test.ts nodes named "C4 ..." (22 = 13 existing + 9 new) — existing: split-chunk phrase, mute after trigger, thread order, no refire, recovery, detector error, typed text, Gemini-shaped crisis. New (fix cycle 1): F1 x3 (interrupted after a non-final crisis chunk, after a FINAL crisis chunk, and the mute ends at turnComplete), F2 x1 (half reply audited + stored interrupted before the student words), M1 x2 (crisis and tool call before attach, replayed on attach), M2 x2 (typed crisis after a spoken one, harmless typed text after one), M3 x1 (no audio / empty / odd-length audio refused at construction).
Tests[C5]: tests/live.test.ts nodes named "C5 ..." (10) — uncited number, listed speaker, clean answer (no flag), word boundary, allow-listed 14416, after-the-fact timing, auditor crash, interrupted reply, two findings.
Tests[C6]: tests/live.test.ts nodes named "C6 ..." (4) — slow sink keeps order, sink failure contained, injected-clock ISO timestamps, source-text import guard (no apps/api, ws or vendor SDK).
Pre-check[C1]: dea624f bash scripts/vc-testlock.sh pnpm -C packages/providers exec tsx --test tests/live.test.ts -> green: 57 passed, 0 failed (whole file; this criterion: 13 "C1 " nodes) rc=0 t=775s blobs=packages/providers/tests/live.test.ts:9e8e842,packages/providers/src/live.ts:b246dfe
Pre-check[C2]: dea624f bash scripts/vc-testlock.sh pnpm -C packages/providers exec tsx --test tests/live.test.ts -> green: 57 passed, 0 failed (the 49 C1/C4/C5/C6 nodes all drive the Mock) rc=0 t=775s blobs=packages/providers/tests/live.test.ts:9e8e842,packages/providers/src/live.ts:b246dfe
Pre-check[C3]: dea624f bash scripts/vc-testlock.sh pnpm -C packages/providers exec tsx --test tests/live.test.ts -> green: 57 passed, 0 failed (whole file; this criterion: 8 "C3 " nodes) rc=0 t=775s blobs=packages/providers/tests/live.test.ts:9e8e842,packages/providers/src/live.ts:b246dfe
Pre-check[C4]: dea624f bash scripts/vc-testlock.sh pnpm -C packages/providers exec tsx --test tests/live.test.ts -> green: 57 passed, 0 failed (whole file; this criterion: 22 "C4 " nodes) rc=0 t=775s blobs=packages/providers/tests/live.test.ts:9e8e842,packages/providers/src/live.ts:b246dfe
Pre-check[C5]: dea624f bash scripts/vc-testlock.sh pnpm -C packages/providers exec tsx --test tests/live.test.ts -> green: 57 passed, 0 failed (whole file; this criterion: 10 "C5 " nodes) rc=0 t=775s blobs=packages/providers/tests/live.test.ts:9e8e842,packages/providers/src/live.ts:b246dfe
Pre-check[C6]: dea624f bash scripts/vc-testlock.sh pnpm -C packages/providers exec tsx --test tests/live.test.ts -> green: 57 passed, 0 failed (whole file; this criterion: 4 "C6 " nodes) rc=0 t=775s blobs=packages/providers/tests/live.test.ts:9e8e842,packages/providers/src/live.ts:b246dfe
Pre-check[typecheck]: dea624f pnpm -C packages/providers typecheck (tsc --noEmit) -> exit 0, no output (qa/evidence/p1-u9/fix1-package-typecheck.txt); whole-repo `pnpm -r typecheck` not re-run (only live.ts changed, nothing else imports it)
Pre-check[package]: dea624f bash scripts/vc-testlock.sh pnpm -C packages/providers test -> green: tests 117, pass 117, fail 0 rc=0 (qa/evidence/p1-u9/fix1-package-typecheck.txt)
Pre-check[red-first]: a4864f8 + the 9 new tests only (live.ts unrepaired) -> RED: 9 run, 1 pass (the "mute ends at turnComplete" guard test), 8 fail, one per defect variant (qa/evidence/p1-u9/fix1-red.txt); the repair turned them green: tests/live.test.ts 57/57 (qa/evidence/p1-u9/fix1-live-test-green.txt)
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
- `bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/packages/providers test` -> expected: tests 108, pass 108, fail 0.
- `bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/packages/providers exec tsx --test --test-name-pattern="^C3 " tests/live.test.ts` (and C1, C4, C5, C6) -> expected counts in the Pre-check lines.
- `pnpm -C <worktree> -r typecheck` -> exit 0.
