# Verdict: p1-u11-coverage-report
**Verdict:** PASS
**Cycle checked:** 0
**Tier:** S (mock-only eval script in packages/engine/evals; no auth, data write or outward action). One checker. Policy: proportional-verification/2026-10-17.14
**Base:** 82db70f **Head checked:** 9509c35 (code at 13ad807)
Metrics: start=2026-10-19T00:22:17+05:30 end=2026-10-19T00:33:05+05:30 wall_min=11 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=1 mutations=6 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-17.14 lane=normal check_s=648 mutants=0 defects_unit=0 defects_6c=0
slow: falsification batch (7 serial test runs of coverage.test.ts) 5 min; typecheck of 10 workspace projects 2 min

## Plan
Read coverage.ts and run-coverage.ts in full and the A17 criteria (brief C1..C6). Run the 22 tests, the A17 command twice, `--real`, a hostile PII fixture, the typecheck, the diff-scope check, and one fresh falsification per criterion in throwaway copies (not the maker's edits). Nothing run under the maker's evidence.

## Evidence (all on 9509c35, all via vc-testlock.sh, no full suite)
- Tests: `pnpm -C <wt>/packages/engine exec tsx --test evals/coverage.test.ts` -> tests 22, pass 22, fail 0, EXIT=0.
- A17 command `pnpm -C <wt>/packages/engine coverage -- --out <dir>` run twice into dirs a and b: EXIT 0 twice; `cmp` of coverage-report.json and coverage-report.md: byte-identical (sha256 json 9db34a70..., md 9350dc79..., equal to the maker's recorded hashes). The pnpm stdout differs only in the echoed `--out` path (identical after path normalisation).
- C6 text-free: `grep -c SENTINEL` on json, md and stdout = 0, while the fixture holds 172 SENTINEL turn texts. Hostile fixture (my copy, 172 hits each carrying PII-like text in turn.text, turn.speaker, hit.text, studentId, threadId, question, session.title/studentName/notes; probe notes; VC gap rows with studentId/text): CLI EXIT 0; grep for the PII markers = 0 in json, md and stdout; the hostile reports are byte-identical to the clean-fixture reports.
- `--real`: EXIT 1, throws "coverage --real: there is no live mode ...", writes no report.
- Typecheck `pnpm -C <wt> -r typecheck`: EXIT 0.
- Scope: `git diff --name-only 82db70f..9509c35` = packages/engine/evals/{coverage.ts,run-coverage.ts,coverage.test.ts,fixtures/coverage-probes.sample.json}, packages/engine/package.json (1 insertion, the `coverage` script line), qa/evidence/p1-u11/*, qa/manifests/p1-u11-coverage-report.md. Nothing in apps/api, packages/db, packages/schemas, packages/engine/src, mcp.
- Criteria read against code: C1 coverage.ts hit loop (threshold, stale `>` months, dateUnknown) ; C2 no_probe/unrecorded/unanswered rows and roster refusal (buildCoverageReport); C3 parseKbGaps keeps null for missing fields, markdown prints `(none)`; C4 readVcGaps (port per sorted date, zero-filled totalsByDate, count validation); C5 no clock, asOf input defaulting to fixture recordedAt; C6 HitSchema and the port-row projection.

## Falsification floor (throwaway copies packages/engine/chk_<id>, removed afterwards; control green 22/22; my own edits)
| id | edit (coverage.ts) | result | first red test |
|---|---|---|---|
| C1 | stale test `> staleAfterMonths` -> `>=` | 1 fail / 21 pass | C1 staleness boundary follows asOf ... |
| C2 | unrecorded row `unanswered: true` -> `false` | 1 fail / 21 pass | C2 a probe whose query was never recorded is an unrecorded gap row ... |
| C3 | kbGaps description -> `null` | 1 fail / 21 pass | C3 the report carries the KB gap rows next to the probes ... |
| C4 | zero-filled `totalsByDate` -> `{}` | 1 fail / 21 pass | C4 VC gap counts are read through the port once per requested date ... |
| C5 | markdown title gets `new Date().toISOString()` | 1 fail / 21 pass | C5 two runs of the CLI ... byte-identical |
| C6 | answered row gets `firstHit: JSON.stringify(raw[0])` | 1 fail / 21 pass | C6 a search hit that carries text or a port row ... leaks neither |
This replaces the maker's weak C2b (crash kill) with a bool flip that only the C2 unrecorded assertion can catch. The worktree stayed clean (`git status` empty before and after).

## Findings (none blocking)
- Low (cosmetic): `coverageMain` calls `parseCoverageArgs` outside the `.catch`, so `--real` or a bad flag prints an uncaught-exception stack trace (exit 1) instead of the one-line message. The refusal itself works and no report is written.
- Low: staleness arithmetic is duplicated from claims.ts (CORE-REQUEST in the manifest); parity is pinned by the 24/25-month boundary test and my C1 mutant.
- Limits confirmed as stated: synthetic fixture only, real breadth NOT PROVEN (Q-U11-2, G-KB); VC gap counts are overall totals not per country/theme (Q-U11-1); no live mode.
- Environment note: C: had 4.8 GB free at start; no OOM seen.
