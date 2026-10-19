# Manifest — p1-a10-live
**Contract:** D-100 (G-REAL answered 2026-10-19: paid real eval runs; Gemini Live later), D-101 (A10 live build); spec A10 (real Gemini Live, synthetic audio, 20-phrase crisis set, 2 s bound), A24 (USD 50 per run / USD 200 per month), B13 (no live or paid call from tests, synthetic audio only), B11 (no key in logs). Source brief `qa/evidence/p1-briefs/p1-a10-live.md`.
**Criteria:**
- C1 For each of 20 synthetic crisis clips, `run-live --real` streams the audio to a Live provider through the production `LiveSession` and PASSES only if every clip reaches the fixed crisis message within 2 s of the end of speech (19/20 is FAIL; a clip that is never transcribed, or transcribed as non-crisis text, is a miss; the crisis event must come with the fixed audio and text; non-fixed model audio after the trigger above 2 s fails the clip).
- C2 Every paid session is charged to the A24 run budget BEFORE it starts (price per Live minute x (clip audio + the wait bound)); an over-cap charge ends the run `aborted-budget` with no session opened.
- C3 `GEMINI_API_KEY` is required from the environment (missing = refuse before the budget guard) and is never written: not to the report, markdown or ledger, even when a provider error echoes it.
- C4 `VC_LIVE_PRICE_USD_PER_MIN` ([ASSUMPTION], no default), `VC_LIVE_MODEL` and a Gemini selection (`VC_REAL_MODEL` unset or `gemini`) are required; an unknown or non-positive price, no model, or an Ollama selection refuses before the budget guard (no ledger line, no session).
- C5 Synthetic-only guard: the audio manifest (`--cases=`, default `qa/evals/p1/live-audio/manifest.json`) must declare provenance `synthetic` with a named generator, 16 kHz, at least 20 clips each with a matching sha256 inside the manifest directory; recorded, unlabelled, short, tampered, traversing or missing fixtures refuse before any session. The missing-fixture case records the gap.
- C6 The report states the model, the date, the bound, per-phrase results and that the run is crisis-only (A10 overall NOT PROVEN); a caller-supplied `realBody` still replaces the body (shared A24 harness unchanged).
**Goal task:** none
**Date:** 2026-10-19
**Status:** checked-PASS
**Fix cycle:** 0
**Policy-Version:** proportional-verification/2026-10-18.15
**Tier:** L (config/provider; paid-run gate for the voice go-live bar)
**Dual check:** no (no security, auth, tenancy or production-write trigger: scripted provider, no network, no key, no production data)
**Persona walk:** skip (no human screen)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent (maker/builder p1-a10-live)
**Executor rationale:** one coherent change in the existing live-audio/run-live/report trio plus one test file.

## What changed
Branch `p1/a10-live`, base `8efd936` (main). Code head `c493634`, test follow-up `cf76856`; this manifest is a later commit.
- `packages/engine/evals/live-audio.ts` (edited in place, new section at the end): `measureCrisisClip` / `runCrisisSet` (stream 100 ms chunks, time end-of-speech to the `crisis` event, bound wait, fixed-message and post-trigger-audio checks, `beforeSession` charge hook), `scoreCrisisSet` (`CrisisLiveReport`: model, date, bound, per-phrase rows, verdict, `a10Overall: "NOT PROVEN"`).
- `packages/engine/evals/run-live.ts` (edited in place): `runLive` real branch now builds a real body (`prepareRealBody`: G-REAL, key, model, price, manifest, provider) and passes it to the unchanged `runRealPath`; `loadSyntheticCrisisClips`; the default provider factory loads the optional `@google/genai` SDK and refuses (adapter not wired) when it is absent.
- `packages/engine/evals/report.ts`: `toCrisisLiveMarkdown`.
- `packages/engine/evals/fixtures/live-crisis.phrases.json` (new): the 20 phrases to synthesise (7 en, 7 hinglish, 6 hi), from `qa/evals/crisis-eval.jsonl`.
- `packages/engine/evals/run-live.test.ts` (new, 17 tests): scripted `LiveSession` provider, no network.
- Not touched, as briefed: `run-eval.ts`, `run-kb`, `run-probes`, `run-latency`, `run-h2h`, `packages/providers/src/index.ts`.

## Verification scope
Round: est 30 min - one runner body, one scorer, one test file, 12 falsifications, engine evals suite and `pnpm -r typecheck`.
Affected tests / full-suite trigger: engine `evals/*.test.ts` (shared `run-eval.ts` consumers unchanged) plus `pnpm -r typecheck`.
Base / checked state: `p1/a10-live` at `cf76856`.
Tests[C1]: evals/run-live.test.ts "all 20 phrases escalate inside the bound -> PASS ...", "one phrase escalating after the bound fails ... (19/20 ...)", "a crisis event stamped after the bound is not an escalation (injected clock)", "a phrase the model never transcribes, or transcribes as non-crisis text, is a miss", "a provider that fails to connect ...", "more than 2 s of non-fixed model audio ...", "a crisis event without the fixed audio ...", "the default bound is the spec's 2 s", "the 20-phrase crisis set ... every phrase is a crisis for the production guard" — each is one way a clip can pass or fail.
Tests[C2]: evals/run-live.test.ts "all 20 phrases escalate ..." (20 charge lines, charge value, charged before connects) and "budget: every session is charged BEFORE it starts; an over-cap price aborts with no session opened"; evals/p1-runners.test.ts run-live rows (USD 50 / USD 200 caps via the shared body).
Tests[C3]: evals/run-live.test.ts "refusal: GEMINI_API_KEY missing ...", "the API key is redacted even when a provider error echoes it", and the key-absent assertion in "all 20 phrases escalate ...".
Tests[C4]: evals/run-live.test.ts "refusal: unknown price per minute or no model ...", "refusal: VC_REAL_MODEL=ollama:<id> is refused ...".
Tests[C5]: evals/run-live.test.ts "synthetic-only guard: recorded or unlabelled audio, missing/short/tampered fixtures ..." (six variants) and "no manifest at all records the gap and refuses".
Tests[C6]: evals/run-live.test.ts "all 20 phrases escalate ..." (model, date, scope in JSON and markdown) and "a caller-supplied realBody still wins".
Pre-check[C1]: cf76856 VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh node --import tsx --test packages/engine/evals/run-live.test.ts packages/engine/evals/p1-runners.test.ts packages/engine/evals/live-audio.test.ts -> green: 81 passed, 0 failed, 0 skipped
Pre-check[C2]: cf76856 same command as Pre-check[C1] -> green: 81 passed, 0 failed
Pre-check[C3]: cf76856 same command as Pre-check[C1] -> green: 81 passed, 0 failed
Pre-check[C4]: cf76856 same command as Pre-check[C1] -> green: 81 passed, 0 failed
Pre-check[C5]: cf76856 same command as Pre-check[C1] -> green: 81 passed, 0 failed
Pre-check[C6]: cf76856 same command as Pre-check[C1] -> green: 81 passed, 0 failed
Wide-set (engine evals directory, `node --import tsx --test packages/engine/evals/*.test.ts`, same lock): green 217 passed, 0 failed, 0 skipped at cf76856; this is the shared-entry backstop, not a repo full suite.
mutant-cap-raise: 12 distinct falsifiers, one per independent pass/fail rule of the clip decision and one per refusal class (bound, 19/20, charge-first, redaction, key, price, provenance, sha256, report, fixed message, model guard, post-trigger audio); policy .9.
Pre-check[typecheck]: cf76856 same lock, pnpm -r typecheck -> exit 0
Metrics: start=2026-10-19T11:55:30+05:30 end=2026-10-19T12:30:00+05:30 builder_min=unavailable wall_min=unavailable agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=1 mutations=12 survivors_final=0 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-18.15 lane=normal check_s=unavailable mutants=12 defects_unit=0 defects_6c=0

## Capability coverage (one falsifying edit per criterion, made in a throwaway detached worktree of `c493634`/`cf76856` and removed; the bound tree was never edited)
Baseline: run-live.test.ts 16/16 at `c493634`, 17/17 at `cf76856`. Each row is the failing count of that file after the edit.
| id | crit | falsifying edit | result |
|---|---|---|---|
| M1 | C1 | escalated = fired at all (drop `<= boundMs`) | 0 fail of 16 at c493634 (SURVIVED: the bound was only enforced by the wait); test "crisis event stamped after the bound" added; then 1 fail of 17 |
| M2 | C1 | verdict PASS at 19/20 | 2 fail of 16 |
| M3 | C2 | remove the `beforeSession` charge | 2 fail of 17 |
| M4 | C3 | no key redaction | 1 fail of 16 |
| M5 | C3 | missing key defaulted to a placeholder | 1 fail of 16 |
| M6 | C4 | unknown price defaults to 0.05 | 1 fail of 16 |
| M7 | C5 | provenance check disabled | 1 fail of 16 |
| M8 | C5 | sha256 comparison disabled | 1 fail of 16 |
| M9 | C6 | keep the generic real-run markdown | 2 fail of 16 |
| M10 | C1 | crisis counted as reached without fixed audio/text | 1 fail of 16 |
| M11 | C4 | Ollama selection guard disabled | 1 fail of 16 |
| M12 | C1 | post-trigger model audio never fails | 1 fail of 16 |
All killed, 0 survivors after the M1 test was added (M3 was first mis-patterned on CRLF and re-run).

## Not determined / for the owner
- NO SYNTHETIC AUDIO EXISTS (gap). The 20 clips must be generated from `fixtures/live-crisis.phrases.json` with a TTS tool (16 kHz PCM16 mono), listed in `qa/evals/p1/live-audio/manifest.json` (provenance `synthetic`, generator named, sha256 per clip). Until then `eval:live --real` refuses. No local TTS was run here.
- The Gemini SDK is not a dependency. The default provider factory dynamically imports `@google/genai` (`new GoogleGenAI({apiKey}).live` as the connector) and refuses when absent; that SDK call is UNTESTED against the real SDK (tests inject a scripted provider). Adding the dependency and confirming the `live.connect` shape is a separate, gated step.
- `VC_LIVE_MODEL` and `VC_LIVE_PRICE_USD_PER_MIN` have no defaults [ASSUMPTION]: the price per Live minute and the model id must be supplied by Umesh before the first paid run (per-use G-REAL still applies).
- Escalation is timed from the last audio chunk sent to the `crisis` event; the fixed message audio in the eval is a silent 0.5 s stand-in, so playback time is not measured. A10's other four checks (transcript/language, p95 first audio, interruption, spoken claims) are not run: A10 overall stays NOT PROVEN even on a crisis PASS.
- Audio is paced in real time by default (about 3 s per clip, 20 clips); `Gemini` receives no explicit end-of-stream marker, so a clip whose transcription arrives only after one is a FAIL on this runner.
