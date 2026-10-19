# Verdict: p1-iss330-bom
**Verdict:** PASS
**Cycle checked:** 0
**Tier:** S. One checker, Dual check: no per manifest. Policy: proportional-verification/2026-10-19.16 (the manifest's pin)
**Base:** origin/main 397dd4d **Head checked:** da13e70 (code 83456eb; da13e70 adds only the manifest)
Metrics: start=2026-10-19T13:14:43+05:30 end=2026-10-19T13:31:46+05:30 suite_runs=0 mutations=2 cycle=0 policy=proportional-verification/2026-10-19.16 lane=normal

## Plan
Read the 6-file code diff (`git diff 397dd4d 83456eb`) against C1/C2. Rerun the builder's two test files on a fresh detached copy (D:/vc/.worktrees/p1-iss330-chk at da13e70, `pnpm install --offline --frozen-lockfile`, TMP/TEMP on D:/vc/.tmp/iss330chk, every run via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh`). Add an outcome probe through the REAL runner entries (run-kb, run-latency, run-h2h, run-probes; `--real`, mock Ollama fetch, no network, no paid call). One falsification per criterion in the copy. Typecheck and full suite are the Part 2 integration gate (not repeated here).

## Reruns
- `pnpm -C packages/engine exec tsx --test evals/dataset.test.ts evals/real-bodies.test.ts` -> tests 37, pass 37, fail 0 (qa/evidence/p1-iss330/check/builder-tests-rerun.txt). Matches the manifest's 37/0.
- Builder's wide-set (246/246) and `pnpm -r typecheck` not rerun here: reused by identity (code unchanged at da13e70); both rerun on the integration head in Part 2.

## Outcome checks (probe: qa/evidence/p1-iss330/check/chk-iss330.test.ts.txt, 4 tests, pass 4, fail 0; log chk-hostile-run.txt)
- C1/C2 equivalence: with a BOM prefix on the golden (LF and CRLF), KB fixture, probe set and experts file, run-kb (twice), run-latency, run-h2h and run-probes under `--real` return the same status/mode/report as the BOM-less files, with the same number of model requests and ledger charges (the plain run really called the provider: requests > 0, charges > 0).
- C1 bad provenance after a BOM: for run-kb, run-latency and run-h2h, a BOM + `{"source":"Recorded"}` header (LF and CRLF) is refused with the ProvenanceSchema message; BOM + `recorded` without `--anonymised` is refused; BOM + header-less file is refused "declares no provenance". Ledger file absent and 0 requests after all 12 refusals.
- C2 bad provenance after a BOM: BOM KB fixture with source "Recorded" / "recorded" (no `--anonymised`), BOM probe set "Recorded", BOM bare-array experts ("declares no source") and BOM experts "Recorded" are each refused before any ledger line or request.
- Hostile, stated behaviour (all refused, nothing sent): double BOM (golden, fixture, probe set, experts) -> `invalid JSON (Unexpected token BOM)` at line 1, so the second BOM is not silently accepted; BOM at the start of line 2 or inside a line -> invalid JSON at that line; BOM inside the header's source value -> `got "syn<BOM>thetic"` refused; BOM-only file -> "no questions found"; UTF-16 LE and BE files with their BOM (golden and fixture) -> invalid JSON (replacement characters), never parsed as provenance.

## Falsification (qa/evidence/p1-iss330/check/falsification.txt; run = probe + dataset.test + real-bodies = 41 tests, 41 pass unmutated)
| id | crit | edit (copy only) | result |
|---|---|---|---|
| M1 | C1 | parseGoldenFile: `stripBom(raw)` -> `raw` | 7 fail (equivalence, bad-provenance-after-BOM, 4 dataset golden BOM tests, builder real-bodies ISS-330 test) |
| M2 | C2 | stripBom removed from probes.ts, coverage.ts (both parsers), parseKbFixture, run-h2h parseExpertsFile | 4 fail (equivalence, C2 bad-provenance-after-BOM, dataset four-parser test, builder real-bodies ISS-330 test) |
Both killed, 0 survivors. Each edit reverted with `git checkout`; the bound tree p1/iss330 was never edited.

## Findings (not blocking)
- ISS-335 (low, filed): `run-live.ts` `loadSyntheticCrisisClips` raw `JSON.parse(readFileSync(manifest))` has the same BOM gap. Fail-closed (invalid JSON), outside the brief's list, owned by the A10 live branches; manifest already disclosed it.
- ISS-330 was never on this branch's ledger (it lived only in the main tree's uncommitted qa/issues.jsonl); the close-out appends it here as fixed.
- The builder's "blank first line" test is a regression guard, not a falsifier (stated in the manifest, confirmed: the same test passes under both mutants).

## Environment
No OOM or environmental failure seen; one run at a time on the shared lock (waited behind a live-audio test run once). Copy left in place: D:/vc/.worktrees/p1-iss330-chk (detached da13e70, untracked chk-iss330.test.ts).
