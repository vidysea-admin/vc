# Manifest — p1-iss330-bom
**Contract:** D-100 / D-101 (eval inputs and their provenance; the golden header is the B13 recorded-input guard's only source of provenance); spec A2b / A14. Source brief `qa/evidence/p1-briefs/p1-iss330-bom.md`; issue ISS-330. Builds on `p1-u13b-evals-lows` (checked-PASS, merged at 397dd4d).
**Criteria:**
- C1 ISS-330: a golden question file that starts with a UTF-8 BOM (as Windows PowerShell 5.1 and some editors write it) still parses: its `{"source": ...}` header line is read as provenance (BOM, BOM+CRLF, BOM+blank first line, plain blank first line all give `source=synthetic`); a BOM on a header-less file parses with no provenance (`source` undefined); a BOM never weakens the provenance check (a bad source value is still refused with the ProvenanceSchema message). Before the fix this was a misleading `invalid JSON` refusal.
- C2 The same one shared helper (`stripBom` in `dataset.ts`, strips exactly one leading U+FEFF) is applied to every other eval input that is JSON-parsed from file text: the sessions dataset, the KB fixture, the probe set, the `--experts` file, the coverage fixture and the KB gaps snapshot. A BOM-prefixed golden, KB fixture and experts file run end to end under `--real` (mock provider, no network).
**Goal task:** none
**Date:** 2026-10-19
**Status:** ready-for-check
**Fix cycle:** 0 of max 2
**Policy-Version:** proportional-verification/2026-10-19.16
**Tier:** S (a one-line shared helper applied at the parse step of file loaders; no auth, no production data, no network, no paid call)
**Dual check:** no (no security, auth, tenancy or production-write trigger)
**Persona walk:** skip (no human screen)
**Issues addressed:** ISS-330
**Executor:** claude-sonnet-subagent (maker/builder p1-iss330-bom)
**Executor rationale:** one coherent tiny change across one small file set; splitting would only add merge work.

## What changed
Branch `p1/iss330`, base `397dd4d` (origin/main). Code and tests commit `83456eb`; the manifest is a later commit. All edits in place in `packages/engine/evals/`, no new file.
- `dataset.ts`: new exported `stripBom(raw)` (`raw.replace(/^\uFEFF/, "")`); `parseDataset`, `parseGoldenFile` (strip before the line split, so the header line is the first line again) and `parseKbFixture` call it.
- `probes.ts` `parseProbeSet`, `coverage.ts` `parseCoverageFixture` and `parseKbGaps`: `JSON.parse(stripBom(raw))` (both import from `./dataset.js`; `probes.ts` already did, `coverage.ts` gains the import, no cycle: `dataset.ts` imports no eval module).
- `run-h2h.ts` `parseExpertsFile`: `JSON.parse(stripBom(readFileSync(...)))` (the only raw `JSON.parse` of file text that bypassed a `parse*` function).
- Tests: `dataset.test.ts` 8 -> 16 (`stripBom` unit, golden header + BOM, BOM + CRLF, blank first line with and without BOM, header-less + BOM, BOM + bad source still refused, sessions dataset + BOM, KB fixture / probe set / coverage fixture / KB gaps + BOM); `real-bodies.test.ts` 20 -> 21 (BOM-prefixed golden, KB fixture and experts file under `--real` for run-h2h and run-kb).
- Deliberately NOT touched: `run-live.ts` `loadSyntheticCrisisClips` reads the synthetic audio manifest with a raw `JSON.parse` too (same BOM gap), but it is outside the brief's list (experts, probe set, KB fixture) and the A10 live branches (`p1/a10-live`, `p1/a10-enable`) own that file; left as a follow-up. `budget.ts` `readLedger` reads a ledger this code appends itself (no BOM source).
- Line endings: touched files keep CRLF in the working copy (autocrlf).

## Verification scope
Round: 6 files, 2 criteria, est 10 min - TDD two test files, one falsification, typecheck (lock waits dominate)
Affected tests / full-suite trigger: engine evals (dataset.ts is imported by probes, coverage, run-h2h, run-kb, run-latency, run-eval); no full-suite trigger (tier S, no shared runtime path outside evals/).
Base / checked state: `p1/iss330` at `83456eb`.
Tests[C1]: engine evals/dataset.test.ts "parseGoldenFile: a header line with a leading BOM ...", "... BOM + CRLF ...", "... a blank first line (with and without BOM) ...", "... a BOM on a header-less file ...", "... a BOM does not weaken the provenance check ..." and "stripBom removes exactly one leading U+FEFF" - the header cases all assert `source === "synthetic"`, the header-less case asserts `source === undefined`.
Tests[C2]: engine evals/dataset.test.ts "parseDataset: a BOM before the first session line is stripped" and "parseKbFixture / parseProbeSet / parseCoverageFixture / parseKbGaps: a leading BOM is stripped"; evals/real-bodies.test.ts "ISS-330: a BOM-prefixed golden header, KB fixture and --experts file are all read under --real ..." (covers the experts file path in run-h2h and the golden + fixture in run-kb).
Pre-check[C1]: 83456eb VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test evals/dataset.test.ts evals/real-bodies.test.ts (TMP/TEMP under D:/vc/.tmp/iss330) -> green: 37 passed, 0 failed
Pre-check[C2]: 83456eb same command as Pre-check[C1] -> green: 37 passed, 0 failed
Wide-set (whole evals dir, informational backstop): 83456eb same lock, `pnpm -C packages/engine exec tsx --test "evals/*.test.ts"` -> 246 tests, 246 passed, 0 failed.
Pre-check[typecheck]: 83456eb same lock, `pnpm -r typecheck` -> exit 0 (all 9 workspaces, incl. `tsc --noEmit -p evals/tsconfig.json`)
Falsification[C1]: golden red-before/green-after - in a copy of the evals dir (`packages/engine/fals-evals`, deleted afterwards; the bound tree was never edited) `stripBom` was made the identity, then `tsx --test fals-evals/dataset.test.ts fals-evals/real-bodies.test.ts` -> 37 tests, 29 passed, 8 FAILED (the stripBom unit, golden header + BOM, BOM + CRLF, header-less + BOM, BOM + bad source, sessions + BOM, the four-parser test, the real-bodies ISS-330 test). The only golden test that stays green under the mutant is "blank first line", which passes without the fix too (the BOM-only line is dropped by `trim()`; the plain blank line never needed a fix) - it is a regression guard, not a falsifier.
Falsification[C2]: same mutant and run as Falsification[C1] - "parseDataset ... BOM", the four-parser test and the real-bodies ISS-330 test all fail under it.
Metrics: start=2026-10-19T12:57:17+05:30 end=2026-10-19T13:13:45+05:30 builder_min=unavailable wall_min=unavailable agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=1 mutations=1 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.16 check_s=unavailable mutants=1 defects_unit=0 defects_6c=0

## Not determined / for the owner
- `run-live.ts` audio manifest BOM gap (see above): decide whether A10 owners fold `stripBom` in.
- The ledger and the issue `ISS-330` were not touched (the checker marks it fixed).
