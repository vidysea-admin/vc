# Manifest — p1-a10-enable
**Contract:** D-100 (G-REAL answered 2026-10-19), D-101 (A10 live build); spec A10 (20-phrase synthetic crisis set, 2 s bound), B13 (synthetic audio only, no live or paid call from tests), B11 (no key in logs). Source brief `qa/evidence/p1-briefs/p1-a10-enable.md`; review fixes from `qa/evidence/p1-briefs/p1-a10-live-review-result.md`; ISS-330 run-live follow-up (BOM).
**Criteria:**
- C1 (review M2) `loadSyntheticCrisisClips` ties the manifest to `fixtures/live-crisis.phrases.json` (ids, langs and text equal, all 20 present) and requires distinct sha256 values: 20 duplicate clips, a renamed id, a swapped language or different text refuse before any session.
- C2 (review M3) timing starts at the END OF SPEECH: every clip declares `speechEndMs`, the loader recomputes it from the audio (last non-silent sample) and refuses a mismatch, and `measureCrisisClip` times speech end to the crisis event, so trailing TTS silence is not credited.
- C3 (review M1) `CRISIS_NOTE` states the fixed-message and post-trigger-audio columns are structural (LiveSession sends the fixed message and mutes) and the real check is timing; the report columns are labelled "(structural)".
- C4 (review lows) the bound timer is cleared, `provider.connect` has a timeout (a late session is closed), the audio format is verified (no WAV/RIFF header, `durationMs` equals the bytes at 16 kHz PCM16 mono, non-silent), a symlink escaping the manifest directory is refused, the stale header comment is refreshed.
- C5 20 synthetic clips exist in `qa/evals/p1/live-audio/` (7 en, 7 hinglish, 6 hi), generated OFFLINE (Windows OneCore voices through Windows.Media.SpeechSynthesis, no network), 16 kHz PCM16 mono, trimmed with a fixed lead and trailing silence, `manifest.json` provenance "synthetic" with the generator named, sha256, durationMs and speechEndMs per clip; `pnpm --filter @vc/engine gen:live-audio` regenerates them; a language with no local voice is recorded under `gaps` and the loader then refuses.
- C6 `@google/genai` 2.30.0 is a pinned dependency of `@vc/engine`; the `GoogleGenAI(...).live` connector is type-checked against `GeminiLiveConnector` (any shape drift fails `pnpm -r typecheck`), no network call to Gemini.
- C7 (ISS-330 follow-up) a manifest with one leading UTF-8 BOM loads exactly like one without.
**Goal task:** none
**Date:** 2026-10-19
**Status:** ready-for-check
**Fix cycle:** 0
**Policy-Version:** proportional-verification/2026-10-19.16
**Tier:** L (dependency add + provider/paid-run gate for the voice go-live bar; depends on the checked-PASS unit p1-a10-live)
**Dual check:** no (no security, auth, tenancy or production-write trigger: scripted provider, offline TTS, no network, no key, no production data)
**Persona walk:** skip (no human screen)
**Issues addressed:** ISS-330 (run-live BOM follow-up only)
**Executor:** claude-sonnet-subagent (maker/builder p1-a10-enable)
**Executor rationale:** one coherent change in the existing live-audio/run-live/report trio plus an offline generator; small.

## What changed
Branch `p1/a10-enable`, branched from `p1/a10-live` (code identical to the checked 781565a; the later commits there are qa-only). Commits in order: `c40e846` dependency, `80561d8` review fixes, `a74d312` generator, `15d0b24` clips, `ede1e42` BOM; this manifest is a later commit.
- `packages/engine/evals/live-audio.ts` (in place): `measureSpeechEndMs`, `SPEECH_PEAK_THRESHOLD`, cancellable `timer`, `LIVE_CONNECT_TIMEOUT_MS`; `CrisisClip.speechEndMs`; `measureCrisisClip` times from the end of speech, clears the bound timer, times out `provider.connect` (and closes a late session), fails a clip with an unusable `speechEndMs` without opening a session; `CRISIS_NOTE` (M1); header comment refreshed.
- `packages/engine/evals/run-live.ts` (in place): manifest-vs-fixture match, distinct sha256, RIFF/other container refusal, `durationMs`, `speechEndMs` vs measured, silent-clip refusal, realpath/symlink check, BOM strip (ISS-330); the Gemini factory uses a typed `import("@google/genai")` with a compile-time `GeminiLiveConnector` conformance assignment.
- `packages/engine/evals/report.ts`: "(structural)" column labels.
- `packages/engine/scripts/gen-live-audio.ts` + `synth-live-audio.ps1` (new, briefed: "add a script"): the offline generator (WAV parse, windowed-sinc resample to 16 kHz, trim/pad, voice plan with gaps, manifest). `package.json` script `gen:live-audio`.
- `packages/engine/evals/live-audio-gen.test.ts` (new), plus new tests in `live-audio.test.ts` and `run-live.test.ts`.
- `qa/evals/p1/live-audio/` 20 `.pcm` clips (1.7 MB total) + `manifest.json`.
- `packages/engine/package.json`, `pnpm-lock.yaml`: `@google/genai` 2.30.0 (released 2026-10-15, latest stable at install).
- Not touched: `run-eval.ts`, `packages/providers`, `.claude/**`, `.env`, qa/verdicts, qa/checkpoints.

## Verification scope
Round: est 40 min - review fixes, offline generator and clips, dependency and shape check, BOM follow-up; engine evals files only plus `pnpm -r typecheck`.
Affected tests / full-suite trigger: engine `evals/run-live.test.ts`, `evals/live-audio.test.ts`, `evals/live-audio-gen.test.ts`, `evals/p1-runners.test.ts` (shared `run-eval.ts` consumers unchanged) plus `pnpm -r typecheck`.
Base / checked state: `p1/a10-enable` at the head commit of this manifest's parent.
Tests[C1]: evals/run-live.test.ts "M2: the manifest must match fixtures/live-crisis.phrases.json ... distinct audio" (renamed id, swapped lang, different text, 20 duplicates), "the committed synthetic crisis clips ... satisfy the loader". — each refusal class (id, lang, text, duplicate audio) is one assertion in the M2 test and the committed set is loaded for real
Tests[C2]: evals/live-audio.test.ts "M3: escalation is timed from the END OF SPEECH ...", "M3: a crisis event during the speech itself is 0 ms", "M3: a clip with no usable speechEndMs fails ...", "measureSpeechEndMs ..."; evals/run-live.test.ts "M3: every clip declares speechEndMs and it must match the audio", "M3: the report times from the end of speech". — the clocked provider separates end-of-speech timing from end-of-file timing; the loader tests cover the declared-vs-measured check
Tests[C3]: evals/live-audio.test.ts "M1: the crisis report says the fixed-message and post-trigger-audio columns are structural ..."; evals/run-live.test.ts "M1: the markdown labels the fixed-message and post-trigger-audio columns structural". — the note and the markdown headers are the only places the claim is made
Tests[C4]: evals/live-audio.test.ts "low: the bound timer is cleared ...", "low: a provider.connect that never answers ..."; evals/run-live.test.ts "M2/low: audio format is verified ..." (WAV header, sample rate, duration, silence), "symlink escape ...". — one test per low (timer, connect timeout) and one per format refusal
Tests[C5]: evals/live-audio-gen.test.ts (all six: parseWav, resampleTo16k, shapeClip, planJobs, planJobs gap, buildManifest); evals/run-live.test.ts "the committed synthetic crisis clips ...", "the committed clips drive a full scripted run through the default manifest path". — the pure generator steps are tested offline and the committed set is loaded and run through the default path
Tests[C6]: none — type-level only: the conformance assignment is compiled by the typecheck in Pre-check[C6]; no runtime test may call Gemini (B13)
Tests[C7]: evals/run-live.test.ts "ISS-330: a manifest saved with a leading UTF-8 BOM loads exactly like one without". — red before the one-line fix, green after
Pre-check[C1]: ede1e42 VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test evals/run-live.test.ts evals/live-audio.test.ts evals/live-audio-gen.test.ts evals/p1-runners.test.ts -> green: 103 passed, 0 failed, 0 skipped
Pre-check[C2]: ede1e42 same command as Pre-check[C1] -> green: 103 passed, 0 failed, 0 skipped
Pre-check[C3]: ede1e42 same command as Pre-check[C1] -> green: 103 passed, 0 failed, 0 skipped
Pre-check[C4]: ede1e42 same command as Pre-check[C1] -> green: 103 passed, 0 failed, 0 skipped
Pre-check[C5]: ede1e42 same command as Pre-check[C1] -> green: 103 passed, 0 failed, 0 skipped
Pre-check[C6]: ede1e42 VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -r typecheck -> exit 0
Pre-check[C7]: ede1e42 same command as Pre-check[C1] -> green: 103 passed, 0 failed, 0 skipped
mutant-cap-raise: 16 distinct falsifiers, one per independent rule or refusal class over 7 criteria (C1-C7), one equivalent mutant noted and replaced; policy .9
Metrics: start=2026-10-19T12:43:17+05:30 end=2026-10-19T13:56:23+05:30 builder_min=unavailable wall_min=unavailable agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=1 mutations=16 survivors_final=0 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.16 lane=normal check_s=unavailable mutants=16 defects_unit=0 defects_6c=0

## Capability coverage (one falsifying edit per criterion, in a detached throwaway worktree of the pre-BOM head `15d0b24`; the bound tree was never edited)
Baseline: the four test files above, 103 passed, 0 failed at `ede1e42`. Each row is the failing count of the named file after the edit (a hung test counts as killed through `--test-timeout=30000`). Rows F1-F11 and F15 were first run at `15d0b24`/`ede1e42` in a throwaway detached worktree that was removed afterwards.
| id | crit | falsifying edit | result |
|---|---|---|---|
| F1 | C1 | drop the duplicate-sha256 check | 1 fail of 26 (run-live.test.ts) |
| F2 | C1 | drop the id/lang/text-vs-fixture match | 1 fail of 26 |
| F3 | C2 | (first attempt) take end of speech at the end of the file but keep the chunk-remainder correction | SURVIVED 0 fail of 20: an equivalent mutant (the correction makes it the same number); not a defect |
| F3b | C2 | stamp speech end at the end of the file, no correction (the old behaviour) | 1 fail of 20 (live-audio.test.ts) |
| F4 | C2 | do not compare declared speechEndMs with the measured one | 1 fail of 26 |
| F5 | C3 | CRISIS_NOTE says "fine" instead of "structural" | 1 fail of 20 |
| F5b | C3 | report column labels without "(structural)" | 1 fail of 26 |
| F6 | C4 | do not cancel the bound timer | 1 fail of 20 |
| F7 | C4 | remove the connect timeout | killed (the never-answering connect test hangs until the test timeout) |
| F8 | C4 | accept a RIFF header | 1 fail of 26 |
| F9 | C4 | skip the durationMs check | 1 fail of 26 |
| F10 | C5 | plan a stand-in voice for a language with none instead of recording the gap | 1 fail of 6 (live-audio-gen.test.ts) |
| F11 | C5 | no trailing silence after the speech | 1 fail of 6 |
| F12 | C5 | flip one byte of a committed clip | 2 fail of 26 (sha mismatch) |
| F13 | C6 | rename `connect` in `GeminiLiveConnector` | typecheck fails: `Property 'connectX' is missing in type 'Live'` |
| F14 | C6 | type `audio.data` as number in the connection interface | typecheck fails: `Type 'Live' is not assignable to type 'GeminiLiveConnector'` |
| F15 | C7 | remove the BOM strip | 1 fail of 26 (also red before the fix was written) |
All killed; the one survivor (F3) is equivalent and was replaced by F3b.

## Evidence the clips are real speech
Local faster-whisper large-v3-turbo (CPU, offline) transcribed all 20 clips back: the 7 English clips and the 6 Hindi clips matched the fixture text (one-word spelling variants only), and the 7 Hinglish clips (spoken from a Devanagari rendering by the Hindi voices) came back as the same sentences in Devanagari. This is a sanity check on the audio, not part of the gate.

## Not determined / for the owner
- Hinglish: Latin-script Hindi cannot be read by an English voice, so the Hindi voices speak a hand-written Devanagari rendering (`ttsInput` in the manifest). Gemini will probably transcribe these in Devanagari, and the production crisis guard does not flag two of the seven renderings in Devanagari (checked offline with `crisisGuard`): crisis-08 "सब खत्म कर दूंगा, ..." and crisis-14 "... पिटाई होती है ...". A real run would FAIL those two on the guard, not on voice timing. That is a guard-coverage finding for a separate unit; this unit did not touch the guard.
- The OneCore voices were bit-identical across repeated runs of the same job list and across 4 consecutive generator runs, but one earlier generator run produced slightly different audio for clips 09-12 (lengths within 14 ms) for a reason not found. If regeneration is needed, re-run the loader test; the committed manifest is the source of truth.
- `VC_LIVE_MODEL` and `VC_LIVE_PRICE_USD_PER_MIN` still have no defaults ([ASSUMPTION], to be supplied by Umesh); per-use G-REAL still applies. The first paid run is also the first real-SDK exercise: the SDK shape is confirmed by types only (no network call to Gemini was made).
- A10's other four checks stay unrun; A10 overall remains NOT PROVEN even on a crisis PASS.
