# Manifest — p1-u9-live-adapter
**Contract:** C1, C2, C3, C4, C5, C6 (unit-local ids, below). Parent criteria: spec v8 A9b (post-hoc audit fires) and A12 (voice error event) at the seam level; A10 (real Gemini voice gate) is REAL and NOT run here. Plan row U9 (plan.md line 28), brief `qa/evidence/p1-briefs/p1-w3-u9.md`.
**Criteria:** C1 interface, C2 mock, C3 gemini, C4 crisis, C5 audit, C6 sink
**Goal task:** none
**Date:** 2026-10-18
**Status:** ready-for-check
**Fix cycle:** 0 of max 2
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
Round: 3 files, 6 criteria, est 25 min — one new module with its test file and a 4-line index re-export; resumed after a restart to run the per-criterion pre-checks and write this manifest
Base / checked state: base 47ab62a, code e80c9b3, worktree clean except the evidence files and this manifest
Affected tests / full-suite trigger: `@vc/providers` only (the new files sit in that package; nothing outside imports them yet). Package run `qa/evidence/p1-u9/providers-test.txt`: tests 108, pass 108, fail 0. No whole-repo suite.
Tests[C1]: tests/live.test.ts nodes named "C1 ..." (13) — audio format, audio out, transcripts, tool call (3), interrupt (3), close (3), listener isolation; they exercise every part of the C1 interface through the Mock.
Tests[C2]: tests/live.test.ts nodes "C1|C4|C5|C6 ..." (40) — all of them drive MockLiveProvider/MockLiveBackend, so a Mock that mis-records or mis-scripts fails them.
Tests[C3]: tests/live.test.ts nodes named "C3 ..." (8) — loud failure with no connector, connect config, Gemini-shaped exchange, mic mime/base64, wrong sample rate, barge-in then close, SDK error, junk messages.
Tests[C4]: tests/live.test.ts nodes named "C4 ..." (13) — split-chunk phrase, mute after trigger, thread order, no refire, recovery, detector error, typed text, and the Gemini-shaped crisis case.
Tests[C5]: tests/live.test.ts nodes named "C5 ..." (10) — uncited number, listed speaker, clean answer (no flag), word boundary, allow-listed 14416, after-the-fact timing, auditor crash, interrupted reply, two findings.
Tests[C6]: tests/live.test.ts nodes named "C6 ..." (4) — slow sink keeps order, sink failure contained, injected-clock ISO timestamps, source-text import guard (no apps/api, ws or vendor SDK).
Pre-check[C1]: e80c9b3 bash scripts/vc-testlock.sh pnpm -C packages/providers exec tsx --test --test-name-pattern="^C1 " tests/live.test.ts -> green: 13 passed, 0 failed rc=0 t=291s blobs=packages/providers/tests/live.test.ts:5226e99,packages/providers/src/live.ts:3cea3c1
Pre-check[C2]: e80c9b3 bash scripts/vc-testlock.sh pnpm -C packages/providers exec tsx --test --test-name-pattern="^C[1456] " tests/live.test.ts -> green: 40 passed, 0 failed rc=0 t=6s blobs=packages/providers/tests/live.test.ts:5226e99,packages/providers/src/live.ts:3cea3c1
Pre-check[C3]: e80c9b3 bash scripts/vc-testlock.sh pnpm -C packages/providers exec tsx --test --test-name-pattern="^C3 " tests/live.test.ts -> green: 8 passed, 0 failed rc=0 t=33s blobs=packages/providers/tests/live.test.ts:5226e99,packages/providers/src/live.ts:3cea3c1
Pre-check[C4]: e80c9b3 bash scripts/vc-testlock.sh pnpm -C packages/providers exec tsx --test --test-name-pattern="^C4 " tests/live.test.ts -> green: 13 passed, 0 failed rc=0 t=70s blobs=packages/providers/tests/live.test.ts:5226e99,packages/providers/src/live.ts:3cea3c1
Pre-check[C5]: e80c9b3 bash scripts/vc-testlock.sh pnpm -C packages/providers exec tsx --test --test-name-pattern="^C5 " tests/live.test.ts -> green: 10 passed, 0 failed rc=0 t=85s blobs=packages/providers/tests/live.test.ts:5226e99,packages/providers/src/live.ts:3cea3c1
Pre-check[C6]: e80c9b3 bash scripts/vc-testlock.sh pnpm -C packages/providers exec tsx --test --test-name-pattern="^C6 " tests/live.test.ts -> green: 4 passed, 0 failed rc=0 t=8s blobs=packages/providers/tests/live.test.ts:5226e99,packages/providers/src/live.ts:3cea3c1
Pre-check[typecheck]: e80c9b3 pnpm -r typecheck (qa/evidence/p1-u9/typecheck.txt) -> exit 0, all 9 workspace projects Done
Metrics: start=2026-10-17T23:41:44+05:30 end=2026-10-18T01:59:00+05:30 builder_min=unavailable wall_min=137 agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=0 mutations=23 cycle=0 resumes=1 tokens=unavailable policy=proportional-verification/2026-10-17.14 lane=normal check_s=unavailable mutants=23 defects_unit=unavailable defects_6c=0
mutant-cap-raise: the brief asks for one falsification per criterion and C1, C4 and C5 each name several independent behaviours (interface of 5 parts, crisis hook of 7 cases, audit of 5 cases); the 23 edits were run in a throwaway copy, one per behaviour, each killed by one named test.
(suite_runs=0: only per-criterion filters and the one providers package run, no whole-repo suite.) (start = the `.start` file in qa/evidence/p1-u9; the session restarted once after the commit; the per-criterion pre-checks were re-run on resume. Lock waits dominate the times.)

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
