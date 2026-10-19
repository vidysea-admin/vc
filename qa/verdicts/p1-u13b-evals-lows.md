# Verdict: p1-u13b-evals-lows
**Verdict:** PASS
**Cycle checked:** 0
**Tier:** M. One checker, Dual check: no per manifest. Policy: proportional-verification/2026-10-19.16 (the manifest's pin)
**Base:** origin/main 48ea1c5 **Head checked:** fc34f5a (code fee7e08; fc34f5a adds only the manifest, `git diff fee7e08 fc34f5a --stat` = 1 file, qa/manifests/p1-u13b-evals-lows.md)
Metrics: start=2026-10-19T12:47:35+05:30 end=2026-10-19T12:57:00+05:30 suite_runs=0 mutations=8 cycle=0 policy=proportional-verification/2026-10-19.16 lane=normal

## Plan
Read the 6-file code diff against C1-C5. Reuse the builder's affected-test and typecheck evidence (D:/tmp/u13bl/, run at fee7e08) because the code is byte-identical at fc34f5a; rerun the C1-C5 test file myself on a fresh detached copy; add hostile variants through the real runner entries (mocked fetch); one or more falsifying edits per criterion in the same throwaway copy. No network, no paid call, no full suite in this verdict (the integration suite on int/u13b-lows is the gate for that).

## Reruns (throwaway detached worktree D:/vc/.worktrees/p1-u13b-lows-chk at fc34f5a, `pnpm install --offline --frozen-lockfile`, TMP/TEMP on D:/tmp/u13bl-chk, via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh`)
- `pnpm -C packages/engine exec tsx --test evals/real-bodies.test.ts` -> tests 20, pass 20, fail 0, exit 0 (qa/evidence/p1-u13b-lows/check/base-real-bodies.txt).
- Builder's wide-set (131 affected tests green, whole package 1332 pass / 0 fail / 45 skip, `pnpm -r typecheck` exit 0) was NOT re-run here; reused by identity (same code). The same checks run again on the integration head in Part 2.

## Outcome checks per criterion (hostile probe file: qa/evidence/p1-u13b-lows/check/chk-hostile.test.ts.txt, 5 tests, pass 5, fail 0)
- C1 golden provenance. Under `--real`, for all three runners (run-kb, run-latency, run-h2h with `--allow-placeholder-experts`), each of these is refused with ledger file absent and 0 requests: header on line 2; BOM before the header (refused as invalid JSON at line 1); "Synthetic" and "SYNTHETIC" casing; "synthetic " with a trailing space; source null / 1 / ["recorded"] (all give the clear `must be exactly "synthetic" or "recorded"` message); header-only file ("no questions found"); two header lines; a first line that has an `id` plus `source` (treated as a question, so "declares no provenance"); a `Source` key with a capital S; `{"source":"recorded"}` without `--anonymised`. Positive controls: a CRLF-terminated synthetic header loads under `--real`; recorded + `--anonymised` runs to "completed". Mock mode with and without a header gives the same A2a result (builder's test, green in the rerun).
- C2 ISS-296. Bare-array `--experts` refused with "declares no source ... {source, experts}", before any ledger line or request. Also refused: experts file that is `null`, a string, an empty array, or an object with no `source`. `{source:"recorded", experts}` without `--anonymised` is refused; with `--anonymised` it completes.
- C3 ISS-297. Golden header, KB fixture (kb and h2h), probe set and experts file with "Recorded"/"RECORDED"/"real" each give the one clear message and none shows `invalid_union` / `Invalid enum value`. (Builder's ISS-297 test, green in the rerun, plus my header variants above.)
- C4 ISS-294 / ISS-298 L3. `run-h2h --real` with neither `--experts` nor `--allow-placeholder-experts` is refused before ledger/request. With the flag: model calls 0, ledger charges 0, `h2h-pairs.json` is `[]`. Four-question run with one judgeable question, one VC fixed text (no fixture hit), one placeholder expert, one expert equal to the no-sourced-answer text: exactly 1 model call (the judgeable question), 1 charge; `h2h-pairs.json`, `h2h-key.json` and every `h2h-judge-sheet-*` contain none of the withheld ids, their question text, "PLACEHOLDER", the fixed VC text or the withheld expert text, and all still carry the judgeable id; `h2h-report.json` `withheldQuestionIds` = [g-3, g-4, g-hi]; the markdown names the withheld count.
- C5 ISS-298 L1. `words()` keeps `\p{M}`: कुत्ता vs किताब no longer match under `nearestRecordedSearch`; an identical word (पढ़ाई) still matches.

## Falsification (one or more per criterion, throwaway copy, each edit reverted from the saved original; run = real-bodies.test.ts + chk-hostile.test.ts, 25 tests unmutated; qa/evidence/p1-u13b-lows/check/fals-run.txt)
| id | crit | edit | result |
|---|---|---|---|
| F1 | C1 | `loadRealGoldenSet`: headerless file no longer refused | 2 fail (builder test + hostile) |
| F2 | C1 | `loadRealGoldenSet`: `assertRealInputAllowed` call removed (recorded needs no `--anonymised`) | 2 fail |
| F3 | C2 | `parseExpertsFile`: bare array returned as synthetic | 1 fail (ISS-296 test) |
| F4 | C3 | `ProvenanceSchema` errorMap returns zod's default message | 3 fail |
| F5 | C4 | placeholder-experts refusal removed | 2 fail |
| F6 | C4 | `withheld` forced empty (first attempt was a syntax error that failed both files, `pass=0`, and was discarded; redone as `const withheld: typeof golden = []`) | 4 fail |
| F7 | C5 | `words()` regex without `\p{M}` | 2 fail |
| F8 | C4 | placeholder-expert question still sent to the model (the pre-call skip removed) | 2 fail |
All 8 valid edits killed, 0 survivors. After the last run `git status` of the copy shows only the untracked probe file; the bound tree was never edited.

## Findings (not blocking, no new issue filed)
- A BOM-prefixed golden file (e.g. saved by Notepad) is refused, but with a raw "invalid JSON (Unexpected token ...)" message rather than a provenance message. Safe (refused before ledger/request); only a usability wart.
- A model answer that is the fixed no-sourced-answer text is withheld only on an exact string match; a near-variant from a real model is not. That is not a criterion here and withholding is a blinding aid, not a guard on spend or data.
- Both owner notes in the manifest stand (a withheld question is absent from the A14 tally; `--allow-placeholder-experts` yields a plumbing-only run with empty pairs; `coverage.ts` keeps its own enum, not a REAL input).

## Environment
C: free-space 65G, D: 93G free; no OOM or environmental failure seen. One run at a time on the shared lock. Copy left in place: D:/vc/.worktrees/p1-u13b-lows-chk (detached fc34f5a, untracked probe file packages/engine/evals/chk-hostile.test.ts).
