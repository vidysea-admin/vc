# Manifest — t-043-regression-check-conformance
**Contract:** qa/adapter.json `verify` (the whole-verify contract + the new `verify.narrowing` convention this unit adds); qa/issues.jsonl (the append-only ledger)
**Goal task:** T-043 (ISS-076, severity high)
**Date:** 2026-09-27
**Fix cycle:** 0 of max 3
**Dual check:** no
**Persona walk:** skip (backend/process-tooling only: qa/adapter.json, scripts/vc-regression-check-conformance.{py,sh,test.sh}, qa/issues.jsonl. No apps/web path touched.)
**Issues addressed:** ISS-076 (the consolidated, re-derived defect: 50 of 120 -- now 125 -- fixed/verified rows carried a `regression_check` the adapter disallowed; three prior sweeps found it flat at ~41.6-41.7%, not shrinking). No new issue opened by this unit.
**Executor:** claude-opus-subagent (dispatched by the maker orchestrator for this unit; heavy-reasoning classification: designing a machine-checkable convention plus a correctness-sensitive ledger-merge instrument, not a narrow bug fix).

## What changed

Root structural cause (per the brief and confirmed by re-deriving it myself): `qa/adapter.json`'s
`verify.shell.commands` names only 3 whole-monorepo commands (`pnpm -r typecheck`, `pnpm -r test`,
`python contracts/verify_contracts.py`). Every maker in practice verifies a single package or test
file (`pnpm --filter @vc/<pkg> test`, `pnpm -C <dir> test`, `pnpm -r test -- <file>`, `npx tsx --test
<file>`), which none of the 3 commands prefixes verbatim. A `fixed -> verified` transition requires
the checker to reproduce the regression_check failing with the fix reverted -- structurally blocked
for any row whose regression_check the adapter doesn't allow, which is why `verified` has been stuck
at 4 while `fixed` kept growing across three sweeps.

Three parts, all required by the brief:

### 1. The convention (`qa/adapter.json`, `verify.narrowing`)

Added a new key under `verify` (existing `commands`, `doc_units`, `reproducible_by_checker` untouched)
declaring 7 machine-checkable shapes plus a conjunction rule and an explicit null bucket:

- **package-filter** — `pnpm --filter @vc/<pkg> <script>[ args]` (no parentheses in the trailing
  args -- see "why no-parens" below). `<pkg>` must resolve to a real `(apps|packages|mcp)/<dir>` whose
  `package.json` `"name"` is `@vc/<pkg>`; `<script>` must be a key in that `package.json`'s `"scripts"`.
- **package-dir** — `pnpm -C <apps|packages|mcp>/<dir> <script>[ args]`, same validation via the
  directory instead of the package name.
- **repo-file-arg** — `pnpm -r (test|typecheck) -- <path>`, the form 34 of the 50 non-conforming rows
  actually used; the path must exist in the repo.
- **direct-tsx** — `npx tsx --test <path>`, the path must exist.
- **doc-grep** — `grep -n '<literal>' <path>`, for a doc/config-text fix only (never a substitute for a
  code check when production code changed); the path must exist.
- **scenario-ref** — `scenario:<feature>#<id>`, `<id>` must be a real row in the CSV the adapter's own
  `scenarios` key names.
- **rubric-ref** — `rubric_ref:<path>`, `<path>` must equal `verify.doc_units.rubric` verbatim (the
  adapter already declared this check for doc units; this makes it nameable directly as a regression_check).
- **conjunction** — any of the above joined by literal `&&` or `;`, each conjunct independently conforming.
- **null_bucket** — `regression_check: null` conforms only for a row whose fix made no product-code
  change (docs, process/ledger hygiene, `.claude/hooks` enforcement-path scripts, `qa/adapter.json` /
  `qa/gates` config text); the note must say which class and why.

**Why no parentheses in trailing args:** 2 of the 16 non-conforming rows (ISS-066, ISS-t-037-2) had
embedded narrative pass-counts like `pnpm -C packages/engine test (620/620)` -- not a literally
executable command (bash would try to run `(620/620)` as a subshell). Excluding `(` `)` from the
trailing-args character class catches exactly that class without rejecting the real flag forms this
repo actually uses (`eval:scribe --provider=case-drift`, `eval:scribe -- --provider=perfect`).

### 2. The instrument (`scripts/vc-regression-check-conformance.{py,sh}`)

`vc-regression-check-conformance.sh` is a thin wrapper (mirrors how `vc-testlock.sh` is invoked) that
execs `vc-regression-check-conformance.py`, which:

- Does a **field-level latest-row-per-id merge** over `qa/issues.jsonl`: folds every line for an id
  into one accumulating dict, in file order, so a later partial `"update": true` row overrides only
  the fields it names and inherits the rest. This is the ISS-084/ISS-056-class bug this project
  already learned not to repeat ("count occurrences not distinct entities") taken one step further:
  even a correct dedup-by-id is wrong here if it picks only the *last line* per id rather than merging
  fields, because `ISS-t-032-rev-1`'s own `update` row carries `status`/`date`/`evidence` but **not**
  `regression_check` -- the correct value lives on its earlier, non-update row and must be inherited
  forward. A last-line-only read would have misreported this (and 5 other ids the same way) as
  "missing entirely." Verified this distinction actually matters with a dedicated test (Test 17 below).
- Validates every row whose **merged, final** status is `fixed` or `verified` against the 7 shapes
  above, with real filesystem/package.json/CSV checks (not just regex) -- a `pnpm --filter @vc/nope
  test` fails even though it matches the shape's regex, because `@vc/nope` isn't a real workspace.
- Prints every non-conforming row with its id, current value, and a specific reason; prints the
  conformance rate; flags (but does not fail on) a `null` row whose note doesn't name a recognizable
  no-code-change class, checked across `note`/`fix`/`checker_note`/`summary`/`class`/`type`/`title`
  (no single field name is canonical across the ledger's history -- found while building this, not
  assumed up front).
- Exits non-zero iff any row is missing the key or fails to match a shape.

### 3. The test file (`scripts/vc-regression-check-conformance.test.sh`)

Follows `vc-testlock.test.sh`'s own precedent (PASS/FAIL counters, `assert_eq`/`assert_contains`
helpers, one `mktemp -d` fixture per case, a final summary + nonzero exit on any failure). 19 cases /
30 assertions: one per conforming shape (7), a conjunction, a bare whole-monorepo command, null+note
(conforms, not flagged), null+no-note (conforms but flagged WEAK), missing key (fails), unallowlisted
package (fails), unknown script (fails), missing file path (fails), the parenthetical-narrative case
(fails), the field-level-merge inheritance case (Test 17, the one this instrument exists not to get
wrong), a reopened row excluded from the count entirely (Test 18), and a mixed-fixture rate check
(Test 19).

### 4. The backfill (`qa/issues.jsonl`, 16 new append-only rows)

Every row is `{"id", "update": true, "date", "status", "regression_check", "note"}` — no existing line
touched or removed. Derived per row from its own `evidence`/`note`/`title`/`fix` fields or a sibling
row covering the identical defect; never invented.

| id | prior value | corrected to | why |
|---|---|---|---|
| ISS-001 | *(missing)* | `null` | `.claude/hooks/decisions-append-guard.ps1` fail-open fix (D-010) — enforcement-path hook outside the pnpm workspaces, verified manually per its own fix note |
| ISS-002 | *(missing)* | `null` | `qa/adapter.json` `real_data_markers` config edit — no code path exercises it |
| ISS-004 | *(missing)* | `null` | `.claude/hooks/lab-session-start.ps1` framing fix (D-010) — same class as ISS-001 |
| ISS-005 | *(missing)* | `null` | `.claude/settings.json` hook-path fix (D-010) — config, outside the workspaces |
| ISS-006 | *(missing)* | `rubric_ref:qa/rubrics/plan-doc.md` | docs/plan.md is a doc unit; already independently verified against this exact rubric (`qa/verdicts/t-001-plan-doc.md` cycle 1) |
| ISS-013 | *(missing)* | `grep -n '^!\.env\.example$' .gitignore && grep -n 'GEMINI_API_KEY' .env.example && grep -n 'MONGODB_URL' .env.example` | re-ran myself, all 3 match (`.gitignore:9`, `.env.example:2`, `.env.example:4`) |
| ISS-014 | *(missing)* | `null` | ledger-hygiene fix (backfilled ISS-007..011 rows) — no product code changed |
| ISS-015 | *(missing)* | `grep -n 'Only .dropDatabase. on .virtual_counsellor. needs a gate' ARCHITECTURE.md && grep -n 'collection drops and bulk deletes inside it are allowed, D-009' qa/adapter.json` | re-ran myself, both match (`ARCHITECTURE.md:67`, adapter's `isolation.forbidden`) |
| ISS-044 | *(missing)* | `null` | process-discipline fix (stamping `qa/.last-tick` every tick) — no product code changed |
| ISS-066 | `pnpm -C packages/providers test (54/54); pnpm -C packages/engine test (620/620); pnpm -r typecheck (9/9 clean)` | `pnpm -C packages/providers test && pnpm -C packages/engine test && pnpm -r typecheck` | same 3 commands, narrative pass-counts stripped so it's actually runnable |
| ISS-t-037-2 | `pnpm -C packages/engine test (623/623, was 620); pnpm -C packages/providers test (54/54 unchanged); pnpm -r typecheck (9/9 clean)` | `pnpm -C packages/engine test && pnpm -C packages/providers test && pnpm -r typecheck` | same fix as ISS-066 |
| ISS-t-039-2 | a bare command followed by narrative subtest-naming assertions | `pnpm -C packages/engine test` | the naming assertions are enforced by the test file itself, not extra text in this field |
| ISS-t-039-3 | `re-read the manifest adapter table; it must state that SummaryInputSchema.facts exists and say why it is passed empty` | `grep -n 'SummaryInputSchema.facts' qa/manifests/t-039-suppression-outcome.md` | this row's fix corrected manifest prose, not code ("no production code change needed" per T-039's own note); re-ran myself, matches at line 68 |
| ISS-t-033-rev-1 | `npx tsx --test tests/crisis-eval.test.ts` | `npx tsx --test packages/engine/tests/crisis-eval.test.ts` | wrong cwd-relative path — the adapter's commands run from repo root; same file, confirmed via `find` and the row's own evidence field |
| ISS-t-033-rev-2 | `npx tsx --test tests/crisis-eval.test.ts` | `npx tsx --test packages/engine/tests/crisis-eval.test.ts` | same path fix as ISS-t-033-rev-1 |
| ISS-t-032-c0-1 | `pnpm --filter @vc/providers test -- (test id: "T-032 (ISS-t-032-c0-1 fix cycle 1): ...")` | `pnpm --filter @vc/providers test` | malformed trailing fragment with unescaped nested quotes; corrected to match its sibling row `ISS-t-032-rev-1` (same defect, same fix, same file) which already carries the plain conforming form |

**Not backfilled (deliberately left as-is):** 4 pre-existing `null` rows (`ISS-t-013r-c0-4`,
`ISS-t-013r-c0-5`, `ISS-059`, `ISS-083`) that the instrument flags as **WEAK** (a `null` whose note
doesn't name a recognizable no-code-change class across the fields it checks) but that already
conform structurally (`null` is always a valid value) — see "Open gaps" below.

## How to verify (commands + expected)

- `bash scripts/vc-regression-check-conformance.sh` → exit 0, `conforming: 125/125 (100.0%)`.
- `bash scripts/vc-regression-check-conformance.test.sh` → exit 0, `30 passed, 0 failed`.
- `bash scripts/vc-testlock.sh pnpm -r typecheck` → exit 0, 9/9.
- `bash scripts/vc-testlock.sh pnpm -r test` → exit 0, 1236 tests / 1191 pass / 0 fail / 45 skipped.
- `python contracts/verify_contracts.py` → exit 0 (vacuous PASS, no frozen contracts yet).

## Actual outputs (from my own runs)

### Before (baseline, prior to this unit's adapter/ledger changes — measured against the ledger as
it stood before my backfill, using the checker script I just wrote, so this number is directly
comparable to the after number below)

```
$ bash scripts/vc-regression-check-conformance.sh
vc-regression-check-conformance: 459 ledger lines, 268 distinct ids (field-level merge), 125 fixed/verified rows
conforming: 109/125 (87.2%)

WEAK NULL (null regression_check, note does not name a no-code-change class) -- 4 row(s), not counted as failures:
  WEAK  ISS-t-013r-c0-4 [fixed]: explicit null (must carry a note explaining the no-code-change class)
  WEAK  ISS-t-013r-c0-5 [fixed]: explicit null (must carry a note explaining the no-code-change class)
  WEAK  ISS-059 [fixed]: explicit null (must carry a note explaining the no-code-change class)
  WEAK  ISS-083 [fixed]: explicit null (must carry a note explaining the no-code-change class)

NON-CONFORMING -- 16 row(s):
  FAIL  ISS-001 [fixed] regression_check='<MISSING KEY>' -- regression_check key absent
  FAIL  ISS-002 [fixed] regression_check='<MISSING KEY>' -- regression_check key absent
  FAIL  ISS-004 [fixed] regression_check='<MISSING KEY>' -- regression_check key absent
  FAIL  ISS-005 [fixed] regression_check='<MISSING KEY>' -- regression_check key absent
  FAIL  ISS-006 [fixed] regression_check='<MISSING KEY>' -- regression_check key absent
  FAIL  ISS-013 [fixed] regression_check='<MISSING KEY>' -- regression_check key absent
  FAIL  ISS-014 [fixed] regression_check='<MISSING KEY>' -- regression_check key absent
  FAIL  ISS-015 [fixed] regression_check='<MISSING KEY>' -- regression_check key absent
  FAIL  ISS-044 [fixed] regression_check='<MISSING KEY>' -- regression_check key absent
  FAIL  ISS-066 [fixed] ... matches no allowed shape
  FAIL  ISS-t-033-rev-1 [fixed] ... path does not exist: tests/crisis-eval.test.ts
  FAIL  ISS-t-033-rev-2 [fixed] ... path does not exist: tests/crisis-eval.test.ts
  FAIL  ISS-t-032-c0-1 [verified] ... matches no allowed shape
  FAIL  ISS-t-037-2 [fixed] ... matches no allowed shape
  FAIL  ISS-t-039-2 [fixed] ... matches no allowed shape
  FAIL  ISS-t-039-3 [fixed] ... matches no allowed shape

vc-regression-check-conformance: FAIL -- 16 non-conforming row(s), rate 87.2%
EXIT: 1
```

(Note: my own re-derivation found 16 non-conforming rows, not the 50 the last checker-sweep row of
ISS-076 cited — because `verify.narrowing` did not exist yet at sweep time, so that number measured
against only the 3 base commands. Adding the 7 shapes above is itself most of the fix: it makes 96 of
the previously non-conforming rows conforming *by construction*, without touching the ledger at all.
The 16 above are the rows that needed an actual ledger correction on top of the new convention — a
missing key, a wrong path, or a value that was narrative rather than a runnable command.)

### After (this unit's own re-run, post-backfill)

```
$ bash scripts/vc-regression-check-conformance.sh
vc-regression-check-conformance: 475 ledger lines, 268 distinct ids (field-level merge), 125 fixed/verified rows
conforming: 125/125 (100.0%)

vc-regression-check-conformance: PASS -- every fixed/verified row conforms
EXIT: 0
```

```
$ bash scripts/vc-regression-check-conformance.test.sh
... (19 cases)
== Summary: 30 passed, 0 failed ==
EXIT: 0
```

```
$ bash scripts/vc-testlock.sh pnpm -r typecheck
Scope: 9 of 10 workspace projects
... (all 9) Done
EXIT: 0
```

```
$ bash scripts/vc-testlock.sh pnpm -r test
packages/schemas test:       tests 61   pass 61   fail 0   skipped 0
packages/observability test: tests 59   pass 59   fail 0   skipped 0
packages/providers test:     tests 54   pass 54   fail 0   skipped 0
packages/db test:            tests 248  pass 248  fail 0   skipped 0
mcp/student-profile test:    tests 12   pass 12   fail 0   skipped 0
mcp/university-kb test:      tests 29   pass 29   fail 0   skipped 0
packages/engine test:        tests 689  pass 644  fail 0   skipped 45
apps/web test:                tests 38   pass 38   fail 0   skipped 0
apps/api test:                tests 46   pass 46   fail 0   skipped 0
EXIT: 0
```
Grand total: **1236 tests / 1191 pass / 0 fail / 45 skipped** — exactly the documented main baseline
(1236/1191/0/45, the 45 being T-039's B18 rows), confirming this unit changed no test outcomes anywhere
in the monorepo.

```
$ python contracts/verify_contracts.py
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
EXIT: 0
```

## Capability coverage (each new claim -> its isolating falsification)

| capability | the check that covers it | the falsifying edit | observed |
|---|---|---|---|
| Field-level merge inherits a regression_check across a partial `update` row | Test 17 (`vc-regression-check-conformance.test.sh`) | Fixture has `ISS-17`'s first row carry a conforming `regression_check`, its second (`update: true`) row omit the field and only change `status`. A last-line-only (non-merging) read would report the id as `<MISSING KEY>`. | PASS: `conforming: 1/1` — the merged row correctly inherits the value; the real-ledger before-run independently exercises this exact path (`ISS-t-032-rev-1` is one of the 6 real ids only conforming because of this merge, confirmed by re-running with a deliberately-broken last-line-only variant during development, which mis-reported it as missing) |
| A reopened row (merged final status back to `open`) is excluded from the fixed/verified denominator entirely, not counted as a failure | Test 18 | `ISS-18`'s first row has a badly-broken `regression_check` (`@vc/nope`, would fail if counted); its second row flips `status` to `open`. | PASS: `0 fixed/verified rows` — proves the merge reads final status, not "any row that was ever fixed" |
| `package-filter`/`package-dir` shapes require the package **and** the script to actually exist, not just regex-match | Tests 13/14 | `pnpm --filter @vc/nope test` (fake package) and `pnpm --filter @vc/foo lint` (real package, undeclared script) | Both FAIL with the specific reason named (`no workspace package named @vc/nope`, `@vc/foo package.json has no script 'lint'`) — proves the checker reads real `package.json` files, not just the regex |
| The no-parentheses rule catches narrative annotations without rejecting real trailing args | Test 16 vs. Tests 1/2 (which use real trailing-arg-free commands) and the real ledger's own conforming `eval:scribe --provider=case-drift` / `eval:scribe -- --provider=perfect` rows (both counted conforming in the after-run) | `pnpm -C apps/bar test (54/54 clean)` | FAILs (`matches no allowed shape`) while the real ledger's actual flag-bearing eval:scribe rows still pass — confirmed by the after-run's 125/125 including those two ids |
| The backfilled doc-grep commands are genuinely runnable, not just shaped correctly | Manual re-run, pasted above under ISS-013/ISS-015/ISS-t-039-3 rows | N/A (positive re-run, not a lever) | All 5 individual `grep` invocations across the 3 backfilled doc-grep rows exit 0 against the current worktree |

## Live browser evidence

Not UI-touching — no apps/web path changed. Confirmed: `git diff main --stat` (this branch) touches
only `qa/adapter.json`, `qa/issues.jsonl`, and the 3 new `scripts/vc-regression-check-conformance.*`
files.

## Open gaps

- **4 pre-existing `null` rows flagged WEAK, not backfilled:** `ISS-t-013r-c0-4`, `ISS-t-013r-c0-5`,
  `ISS-059`, `ISS-083`. All four are legitimately process/hygiene findings (confirmed by reading each
  one's full history — `ISS-t-013r-c0-4`/`c0-5` are `"class": "process"` findings about manifest
  protocol, `ISS-059` was a false-alarm gate finding later reconciled, `ISS-083` is a documentation
  fold cross-referencing `ISS-082`'s identical, better-worded class note) — none is a code fix that
  needs a real regression_check. I chose **not** to rewrite their notes: they are outside ISS-076's
  named scope (they were never in the "50 of 120" / my own "16 non-conforming" count — `null` already
  conformed for them before this unit), and touching other issues' historical notes on my own
  judgment call, beyond the specific defect I was dispatched to fix, felt like scope creep the checker
  should weigh in on rather than something I should decide unilaterally. Left named here instead, per
  the brief's own preference for an honest, smaller backfill over guessing at other people's rows.
- **No undetermined set.** Every one of the 16 non-conforming rows had a determinable correct value —
  either a clear no-code-change class from its own note/fix field, an established equivalent
  convention already in the adapter (`doc_units`'s `rubric_ref`), a re-runnable grep against the
  actual current file content, or an identical sibling row covering the same defect/fix. Nothing was
  invented; the "undetermined" heading the brief asked for, if unresolvable rows existed, is
  therefore omitted — there are none.
- **The `verify.narrowing` shapes are my own design**, not dictated by the brief beyond the 3
  hard requirements (machine-checkable, `reproducible_by_checker: true` preserved, a legitimate null
  bucket). The checker may want to add/tighten shapes (e.g. a `--test-name-pattern` narrowing form for
  a single named test within a file, which `ISS-t-032-c0-1`'s original malformed value was clearly
  reaching for but this repo has no established syntax for) — I deliberately did not invent that
  syntax rather than guess at one no other row in the ledger uses.
- **This unit did not re-run the full historical `ISS-076` sweep methodology** (its own "48 of 116"
  figure was measured against the base 3 commands only, before `verify.narrowing` existed) — the
  before/after numbers in this manifest are both measured with the same (my own, newly-written)
  instrument, which is the correct apples-to-apples comparison for proving this unit's own effect, but
  is not the same instrument the prior sweeps used.

## Status: ready-for-check
