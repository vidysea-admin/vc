# P1 U11 coverage report (slug p1-u11-coverage-report), tier S, no dual check
Follow D:/vc/qa/evidence/p1-briefs/p1-w3-common.md first (S = the scratchpad path defined there). Policy proportional-verification/2026-10-17.14. Mock only: frozen fixtures, no network, no Mongo connection, no paid call.

**Setup**
- Worktree S/p1-u11, new branch p1/u11. Base = p1/u8 (it holds `listGapCounts` in packages/db/src/student-logs.ts) PLUS main (the U4 eval harness lives only on main: evals/dataset.ts `loadKbFixture`/`fixtureSearch`, evals/run-eval.ts `p1Main`/`writeP1Report`). Steps: `git worktree add S/p1-u11 -b p1/u11 p1/u8` then `git -C S/p1-u11 merge --no-edit main`. Checked 2026-10-18: `git merge-tree main p1/u8` is conflict-free. If the merge conflicts, stop and return blocked.
- Integration order: U8 merges first; this branch merges after it.

**Contract (verbatim, spec v8 sha e183ee9a)**
- **A17** Coverage script lists per country/theme probe hit count, stale count, unanswered count (gap counts) and KB `/gaps`; a no-answer country shows as a gap; reproducible from the frozen fixture. MOCK, NEW `pnpm --filter @vc/engine coverage`.
- Scope item 6: authenticated-mode gap counts stored in `virtual_counsellor`, plus a country-by-theme probe of KB `/search` and KB `/gaps` (knowledge-health gaps). VC computes coverage itself; no KB endpoint is added.
- Stale = session date older than the staleness threshold (default `DEFAULT_STALE_AFTER_MONTHS` = 24, packages/engine/src/student/claims.ts:144; P-7 placeholder). A session with no date counts as `date_unknown`, not stale (A13).
- Gate answers: P-7 (24 months, configurable) in `qa/gates/p1-u0-amendment-signatures.md`; G-KB and the KB key (D-093 12) are still open, so there is no live mode.

**Criteria to split into the manifest (C1..C6)**
- C1 for every (country, theme) probe: hit count, stale count, date_unknown count, unanswered flag (no hit with score >= `DEFAULT_SEARCH_SCORE_THRESHOLD`, packages/engine/src/student/graph.ts:211).
- C2 an unrecorded or zero-hit country shows as a gap row, never silently missing.
- C3 KB `/gaps` rows are listed (id, kind, status, description) beside the probes.
- C4 VC gap counts (`listGapCounts`) are read through an injected port and shown as totals by kind and date.
- C5 reproducible: two runs on the same fixture produce a byte-identical report (no clock in the output; take `--as-of` as an input).
- C6 text-free: no student, thread or question text is ever read or printed.

**Files you OWN**
1. packages/engine/evals/coverage.ts (new): pure report builder.
2. packages/engine/evals/run-coverage.ts (new): CLI in the `run-kb.ts` pattern (`p1Main`).
3. packages/engine/evals/coverage.test.ts (new; picked up by the existing `evals/*.test.ts` glob).
4. packages/engine/evals/fixtures/coverage-probes.sample.json (new, synthetic: >= 10 countries x >= 5 themes) and, only if the existing kb-fixture.sample.json cannot serve, a small recorded-shape search fixture beside it.
5. packages/engine/package.json: ONE added script, `"coverage": "tsx evals/run-coverage.ts"` (U6b does not touch this file).
6. qa/manifests/p1-u11-coverage-report.md, qa/evidence/p1-u11/**.
Read-only inputs: mcp/university-kb/kb-fixture/gaps.json (load by path, no copy), packages/db/src/student-logs.ts (`listGapCounts`, import only).

**Must NOT touch**: apps/api/** (incl. chat.ts, where the U8 repair owns M1/M2), packages/db/**, packages/schemas/**, packages/engine/src/** (U6b adds a line to src/index.ts), mcp/**.

**Tests (TDD, one falsification per criterion in a throwaway copy)**
- `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C S/p1-u11/packages/engine exec tsx --test evals/coverage.test.ts`
- `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C S/p1-u11/packages/engine coverage -- --out <tmp>` (A17 command; paste the report head into the manifest)
- `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C S/p1-u11 -r typecheck`

**HUMAN_GATE (list only)**
- Q-U11-1: the VC gap store is text-free and keyed by date and kind only (`GapCountDoc` = date, kind, count; kinds `no_sourced_answer`, `unverified_claim`). It has no country or theme, so spec A17's "unanswered count (gap counts)" cannot be per country/theme from VC data. Proposed default, which you implement and mark [ASSUMPTION]: per-probe `unanswered` is derived from the probe itself; VC gap counts appear as overall totals. Adding a country/theme dimension would be a schema and privacy change in U8's packages/db: do not do it.
- Q-U11-2: who supplies the real country x theme probe list (counsellor team)? Ship the synthetic list; real-KB breadth stays NOT PROVEN.

**Finish**
- Manifest per p1-w3-common.md (Pre-check per C1..C6, Capability coverage table, Live browser = "not applicable, script", Metrics, `Round: est <n> min`). Lint: `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --lint-manifest qa/manifests/p1-u11-coverage-report.md` exit 0. Narrow-pathspec commit. No push/merge/checker. ONE-line return: `p1-u11-coverage-report <sha> ready` or `... blocked <reason>`.
