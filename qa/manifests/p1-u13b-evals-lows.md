# Manifest — p1-u13b-evals-lows
**Contract:** D-100 / D-101 (paid real-model eval runs via Ollama; the leftover lows of the U13b REAL bodies); spec A14 (blind head-to-head), A2b; contract B13 (no live call, no paid call from tests; synthetic fixtures only). Source brief `qa/evidence/p1-briefs/p1-u13b-evals-lows.md`. Builds on `p1-u13b-wire-real` (checked-PASS, merged at 649273f).
**Criteria:**
- C1 The `--golden` question file is covered by the B13/D-100 recorded-input guard: under `--real` (run-kb, run-latency, run-h2h) it must open with a `{"source": "synthetic"|"recorded"}` header line; a headerless file is refused ("declares no provenance"), a `recorded` one needs `--anonymised`; all refusals come before any ledger line or request. Mock mode is unchanged (a header-less file still loads; a header line is never read as a question). The shipped `golden.sample.jsonl` carries `{"source":"synthetic"}`.
- C2 ISS-296: a bare-array `--experts` file is refused under `--real` with a message asking for the `{source, experts}` form, before any ledger line or request.
- C3 ISS-297: a mixed-case or unknown `source` value (golden header, KB fixture, probe set, experts file) gives one clear refusal naming the two accepted values, not a raw schema dump.
- C4 ISS-294 / ISS-298 L3: `run-h2h --real` without `--experts` is refused unless `--allow-placeholder-experts`; and any question whose VC side is the fixed no-sourced-answer text or whose expert side is a `[PLACEHOLDER...]` text is withheld from `h2h-pairs.json`, the key and every judge sheet (so wording cannot reveal which side is VC); the report lists the withheld ids. A placeholder question makes no model call.
- C5 ISS-298 L1: `run-kb` `words()` keeps Devanagari combining marks (`\p{M}`), so distinct words no longer collapse to shared consonant fragments in the rewrite match.
**Goal task:** none
**Date:** 2026-10-19
**Status:** ready-for-check
**Fix cycle:** 0 of max 2
**Policy-Version:** proportional-verification/2026-10-19.16
**Tier:** M (eval-harness guards on the code path that sends text to a paid provider; no production data, no network, no auth)
**Dual check:** no (no security, auth, tenancy or production-write trigger: tests use a mocked fetch, synthetic fixtures only)
**Persona walk:** skip (no human screen)
**Issues addressed:** ISS-294, ISS-296, ISS-297, ISS-298
**Executor:** claude-sonnet-subagent (maker/builder p1-u13b-lows)
**Executor rationale:** one coherent change in one small file set; the five lows share `run-eval.ts`, `dataset.ts` and `run-h2h.ts`, so splitting would only add merge work.

## What changed
Branch `p1/u13b-lows`, base `e448791` (main). Code and tests head `fee7e08`; the manifest is a later commit. All edits are in place in `packages/engine/evals/`.
- `dataset.ts`: new `ProvenanceSchema` (exactly `"synthetic"|"recorded"`, with a clear error message) used by `KbFixtureSchema`; `parseGoldenFile`/`loadGoldenFile` return `{source, questions}` and read an optional first-line `{"source"}` header (an object with `source` and no `id`); `parseGoldenSet`/`loadGoldenSet` keep their signature and drop the header.
- `probes.ts`: `ProbeSetSchema.source` uses `ProvenanceSchema` (C3).
- `run-eval.ts`: `assertRealInputAllowed` also rejects any source that is not exactly `synthetic`/`recorded`; new `loadRealGoldenSet(runner, args)` (header required, then the recorded check); `P1Args.allowPlaceholderExperts` and the `--allow-placeholder-experts` flag.
- `run-kb.ts` `realKbBody`, `run-latency.ts` `realLatencyBody`, `run-h2h.ts` `realH2hBody`: load the golden set through `loadRealGoldenSet` (mock paths untouched). `run-kb.ts` `words()` regex gains `\p{M}` (C5).
- `run-h2h.ts`: `ExpertsFileSchema` is the `{source, experts}` object only; new `parseExpertsFile` (bare array refused, source errors one line); `realH2hBody` refuses missing `--experts` unless the flag is set, skips the model call for a placeholder question, withholds fixed-text questions from the pairs/key/sheets, lists them in the report JSON (`withheldQuestionIds`) and markdown.
- `fixtures/golden.sample.jsonl`: first line `{"source":"synthetic"}`.
- Tests: `real-bodies.test.ts` 16 -> 20 (golden provenance, ISS-296, ISS-297, Devanagari words), and the three existing h2h tests follow the new contract (`{source, experts}` form, `--allow-placeholder-experts`, withheld g-hi). No other test file edited.
- Not touched: `run-live.ts`, `packages/providers/src/live.ts` (another builder owns A10), `.claude/**`, `.env`, contracts.

## Verification scope
Round: 8 files, 5 criteria, est 25 min - read the five guards and the h2h body, TDD new tests, 7 falsifications (lock waits dominate)
Affected tests / full-suite trigger: engine evals (`run-eval.ts` is the entry all five REAL runners share) plus the engine whole package and `pnpm -r typecheck`.
Base / checked state: `p1/u13b-lows` at `fee7e08`.
Tests[C1]: engine evals/real-bodies.test.ts "golden provenance (B13/D-100): a REAL run refuses a --golden with no source header, a 'recorded' one without --anonymised, and a bad source value; mock mode and an anonymised recorded set are unchanged"; evals/kb-eval.test.ts (the shipped sample with its header still loads, 60 questions); evals/p1-runners.test.ts (mock and REAL-gate behaviour unchanged) — the three runners are driven under --real with no header, a recorded header and a mixed-case header, and mock mode is compared with and without the header.
Tests[C2]: engine evals/real-bodies.test.ts "ISS-296: a bare-array --experts is refused under --real ..." — asserts the refusal text, no ledger line, no request, and that the {source, experts} form still runs.
Tests[C3]: engine evals/real-bodies.test.ts "ISS-297: a mixed-case or unknown source gives one clear refusal ..." (kb fixture, h2h fixture, probes, experts mixed, experts unknown) and the golden-header "mixed case" leg of the C1 test — each input kind is refused with the clear message and none shows the raw schema text.
Tests[C4]: engine evals/real-bodies.test.ts "run-h2h REAL (ollama): without --experts the run is refused (ISS-294) unless --allow-placeholder-experts, and then no placeholder text reaches the pairs or sheets ..." and "run-h2h REAL (ollama): VC answers come from the provider, pairs stay blind ..." (fixed no-sourced-answer text withheld; pairs and every sheet checked for the text) — the refusal, the flag, and the absence of both fixed texts from every blinded file are asserted.
Tests[C5]: engine evals/real-bodies.test.ts "run-kb words() keeps Devanagari combining marks ..." — a pair of distinct Devanagari words that matched under the old split must not match, and an identical word still does.
Pre-check[C1]: fee7e08 VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test evals/real-bodies.test.ts evals/p1-runners.test.ts evals/budget.test.ts evals/probes.test.ts evals/h2h.test.ts evals/kb-eval.test.ts (TMP/TEMP under D:/tmp/u13bl) -> green: 131 passed, 0 failed
Pre-check[C2]: fee7e08 same command as Pre-check[C1] -> green: 131 passed, 0 failed
Pre-check[C3]: fee7e08 same command as Pre-check[C1] -> green: 131 passed, 0 failed
Pre-check[C4]: fee7e08 same command as Pre-check[C1] -> green: 131 passed, 0 failed
Pre-check[C5]: fee7e08 same command as Pre-check[C1] -> green: 131 passed, 0 failed
Wide-set (whole package, the shared-entry backstop): fee7e08 same lock, `pnpm -C packages/engine test` -> 1377 tests, 1332 passed, 0 failed, 45 skipped (a skip count the base branch also carries). One informational whole-package run, as in p1-u13b-wire-real; `suite_runs` counts gating full-suite runs, so it stays 0.
Pre-check[typecheck]: fee7e08 same lock, `pnpm -r typecheck` -> exit 0
Metrics: start=2026-10-19T12:29:24+05:30 end=2026-10-19T12:44:29+05:30 builder_min=unavailable wall_min=unavailable agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=1 mutations=7 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.16 check_s=unavailable mutants=7 defects_unit=0 defects_6c=0

mutant-cap-raise: one falsifying edit per criterion (.8-4) is 5; C4 has two independent behaviours (the refusal and the withholding) and C1 two (header required, recorded needs --anonymised), so 7 mutants.

## Capability coverage (one falsifying edit per criterion, in a second detached worktree at `fee7e08` (`p1-u13b-lows-fals`), restored after each run; the bound tree was never edited)
Each row: the edit, then `tsx --test evals/real-bodies.test.ts` (20 tests, 20 green unmutated).
| id | crit | falsifying edit | result |
|---|---|---|---|
| F1 | C1 | `loadRealGoldenSet`: headerless file no longer refused | 1 fail of 20 |
| F2 | C1 | `loadRealGoldenSet`: the recorded/`--anonymised` check removed | 1 fail of 20 |
| F3 | C2 | `parseExpertsFile`: bare array accepted as synthetic | 1 fail of 20 |
| F4 | C3 | `ProvenanceSchema` message back to zod's default | 2 fail of 20 |
| F5 | C4 | placeholder-experts refusal removed | 1 fail of 20 |
| F6 | C4 | fixed-text questions no longer withheld | 1 fail of 20 |
| F7 | C5 | `words()` regex without `\p{M}` | 1 fail of 20 |
All 7 killed, 0 survivors. (A first F6 attempt produced a syntax error in the mutant, which fails the whole file and proves nothing; it was redone with a well-formed edit.)

## Not determined / for the owner
- A question withheld for a fixed or placeholder text is simply absent from the pairs, key and sheets; the A14 tally is over the judgeable questions only. Whether a VC "no sourced answer" should count as a lost pair in the real A14 verdict is a product decision, not made here. `h2h-report.json` lists `withheldQuestionIds`.
- Under `--allow-placeholder-experts` every question is withheld (all experts are placeholders), so that run only checks plumbing: empty pairs and sheets.
- `coverage.ts` `CoverageFixtureSchema` still uses its own `z.enum(["synthetic","recorded"])` (not a REAL-run input; left as is).
- Line endings: the touched files keep CRLF in the working copy (autocrlf).
