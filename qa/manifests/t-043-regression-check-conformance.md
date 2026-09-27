# Manifest — t-043-regression-check-conformance
**Contract:** qa/adapter.json `verify` (the whole-verify contract + the new `verify.narrowing` convention this unit adds); qa/issues.jsonl (the append-only ledger)
**Goal task:** T-043 (ISS-076, severity high)
**Date:** 2026-09-27
**Fix cycle:** 2 of max 3
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

## Fix cycle 1 (2026-09-27) — what cycle 0 got wrong and what changed

**Checker verdict on cycle 0: FAIL.** Cycle 0 correctly diagnosed the root cause (no per-package/
per-file narrowing convention existed) and 5 of 6 new shapes hold up (`package-filter`, `package-dir`,
`direct-tsx`, `doc-grep`, `null_bucket`). But the majority shape, **`repo-file-arg`**
(`pnpm -r (test|typecheck) -- <path>`), was **functionally inert** — filed as **ISS-092** (high). The
checker proved this three ways (byte-identical output with/without the path argument; the root cause,
every workspace's own `"test"`/`"typecheck"` script is a shell glob that has already matched its full
file set before pnpm appends the trailing path; and a synthetic `pnpm -r test -- ARCHITECTURE.md` row
— a doc, not a test — was reported "conforming" by cycle 0's own script). 69 of 125 (55.2%) rows used
this shape, so cycle 0's headline "125/125 (100.0%)" overstated what was actually achieved for the
majority of the ledger. Full verdict: `qa/verdicts/t-043-regression-check-conformance.md`.

### 1. Resolving `repo-file-arg` — retired, not repaired

I looked for a genuinely-narrowing repo-level form before accepting the checker's retirement
recommendation, per the brief's instruction not to retire on recommendation alone. There isn't one:
`pnpm -r <script> -- <path>` and `pnpm -C <dir> <script> -- <path>` both invoke the workspace's own
`"test"` script unmodified, and that script's glob (`tsx --test tests/*.test.ts[ evals/*.test.ts]`)
has already expanded to the full file set before pnpm appends the extra argument — node:test then
dedupes the already-matched path, so nothing narrows (verified this dedup behaviour directly: Test 20
below). The only way to reach a single file in isolation is to **bypass pnpm's script layer entirely**
and invoke `tsx`/`node:test` directly on that one path — which is exactly what the already-existing,
already-legitimate `direct-tsx` shape does. So **`repo-file-arg` is retired** (moved to
`qa/adapter.json` `verify.narrowing.retired_shapes`, with the reasoning and empirical evidence
recorded there), not replaced with a new invented syntax.

One real wrinkle surfaced while remapping: `direct-tsx`'s bare form (`npx tsx --test <path>`, run from
repo root per the adapter's own convention) **fails** for a JSX test file whose workspace declares
`"jsx": "react-jsx"` (only `apps/web` in this ledger) — `ReferenceError: React is not defined`,
because tsx/esbuild resolves the nearest tsconfig relative to the process cwd (repo root), not the
test file's own workspace, and the root has no tsconfig.json setting `jsx`. Empirically confirmed
(2026-09-27): `npx tsx --test apps/web/tests/ui.test.tsx` from repo root fails;
`npx tsx --tsconfig apps/web/tsconfig.json --test apps/web/tests/ui.test.tsx` passes 18/18 and
narrows against the apps/web package baseline (38). So `direct-tsx` gained an **optional**
`--tsconfig <path>` flag, gated to require the tsconfig be the **same workspace** as the test file
(`_workspace_dir_of` prefix match) — otherwise the flag could point at an unrelated tsconfig to
launder an unrelated result into the check. This is the only new syntax this cycle adds; every other
of the 69 rows needed the existing bare `direct-tsx` form.

### 2. Re-mapping the 69 affected rows

Mechanical, not guessed: every one of the 69 rows already names a specific test-file path (the exact
narrowing target the maker/checker intended); the fix wraps that same, unchanged path in the working
vehicle (`direct-tsx`) instead of the inert one (`repo-file-arg`), never substituting a different file.
68 rows (`.test.ts`) → `npx tsx --test <same path>`; the 1 row whose path is a JSX file
(`ISS-t-020-c0-1`, `apps/web/tests/ui.test.tsx`) → `npx tsx --tsconfig apps/web/tsconfig.json --test
apps/web/tests/ui.test.tsx`. Verified every one of the 69 paths exists on disk and matches
`direct-tsx`'s file-extension grammar before applying the remap (no exceptions found).

**Undetermined set: empty, and I checked hard for a reason not to say that a second time.** Cycle 0's
own "no undetermined set" was flagged by the checker as one half of a suspiciously-clean-looking
result, and the OTHER half (repo-file-arg) did not survive contact. So for this remap I independently
spot-checked narrowing across every affected package, not just trusted the mechanical translation:
ran the actual `direct-tsx` command for one representative file per package —
`packages/engine/tests/index.test.ts` (2 vs 689 package baseline), `packages/db/tests/erasure.test.ts`
(68 vs 248), `packages/schemas/tests/guards.test.ts` (19 vs 61), `packages/observability/tests/config.test.ts`
(29 vs 59), `mcp/student-profile/tests/index.test.ts` (12, package total is also 12 — this package has
only one test file, so this row does not narrow further than the existing `package-dir`/`package-filter`
shapes already would; still strictly correct and re-runnable, just not a case where file-level beats
package-level), and `apps/web/tests/ui.test.tsx` (18 vs 38, via the tsconfig-qualified form). All ran
clean, all strictly ≤ their package baseline with 5 of 6 strictly <. Nothing in the 69 needed
quarantining — every path is real, matches the grammar, and the shape it now lives in is empirically
narrowing (or, for the one single-file package, at least no worse than the package-level shapes the
checker already accepted).

Also appended (append-only, `"update": true"`, ledger untouched otherwise): the checker's own
`ISS-092` and its `ISS-076` cycle-0 status update (copied verbatim from `D:/vc/qa/issues.jsonl`, since
the checker appended them to the main-tree ledger rather than this branch — this branch's ledger now
carries them too, so the branch's history is complete); an `ISS-092` status row (`fixed`, pending
checker verification — the shape is retired and the 69 rows remapped, but only `/checker` can verify);
and an `ISS-076` status row explaining this cycle's state (see item 5 below — NOT claiming closed).

### 3. Closing the outcome gap — execution-based tests, not just regex/path-exists

Cycle 0's own 19-case/30-assertion suite never executed a candidate command — Tests 3/15 asserted only
`conforms_one()`'s *return value* against a regex, which is exactly how `repo-file-arg`'s inertness
escaped detection (the B14 construction-not-outcome gap ISS-092 named). The suite is now 24 blocks /
48 assertions; the durable additions:

- **Test 3 / 3b** — `repo-file-arg` is now explicitly rejected (not silently "matches no allowed
  shape" — the checker names the retirement and ISS-092 in the reason string), including the exact
  ISS-092 falsification (`pnpm -r test -- ARCHITECTURE.md`, a doc that EXISTS, wrapped in the retired
  grammar) — proving rejection is because the shape is retired, not because some path happens to be
  missing.
- **Test 15 / 15b / 15c / 15d** — the new `direct-tsx --tsconfig` form: conforms when the tsconfig is
  the test file's own workspace, is rejected when pointed at a *different* workspace's tsconfig
  (guards the exact laundering risk named above), and is rejected when the tsconfig path doesn't
  exist.
- **Test 20** — EXECUTION PROOF, generic (not tied to the real repo): builds an isolated `mktemp -d`
  fixture with two real `node:test` files, actually **runs** `node --test tests/*.test.js` (baseline,
  3 tests) and `node --test tests/*.test.js tests/a.test.js` (the repo-file-arg *class* of command —
  glob already expanded, path appended after), and asserts the counts are **identical** — the generic,
  executing reproduction of the exact bug ISS-092 found, so a future shape with this same structural
  flaw fails this test automatically instead of passing a path-exists check.
- **Test 21** — same fixture, actually runs `node --test tests/a.test.js` alone and asserts strictly
  fewer tests than the baseline — the positive counterpart proving a glob-bypassing shape genuinely
  narrows.
- **Test 22** — EXECUTION PROOF against the **real** repo (read-only, no ledger/mutation involved):
  runs the actual `apps/web/tests/ui.test.tsx` case both ways (bare fails with the exact
  `React is not defined` symptom; `--tsconfig`-qualified passes and narrows 18 vs 38) — ties the
  abstract fixture proof back to the one concrete row this cycle needed the new flag for.
- **Test 23** — the static conformance script certifies the exact remap command from Test 22 as
  conforming, connecting the execution proof back to the thing that actually gates the ledger.

I deliberately did not make the conformance script re-execute every one of the 126 ledger rows'
commands on every invocation (which would mean running large chunks of the monorepo suite, sometimes
repeatedly, on every conformance check) — that would make the fast structural gate slow and
non-deterministic (load-dependent flakes, per ISS-089/ISS-091). Instead the durable guarantee lives in
the test suite: any new or edited shape's *definition* must pass an execution-based test proving it
narrows before it can be added to `verify.narrowing.shapes`, the same way Tests 20-23 gate this cycle's
change.

### 4. Honest re-derived numbers

```
$ bash scripts/vc-regression-check-conformance.sh
vc-regression-check-conformance: 548 ledger lines, 269 distinct ids (field-level merge), 126 fixed/verified rows
conforming: 126/126 (100.0%)

vc-regression-check-conformance: PASS -- every fixed/verified row conforms
EXIT: 0
```

This is **not** the same reading as either of the checker's two ISS-076 historical reproductions
(115/125, strict verbatim-3-commands; 46/125, charitable including the now-retired repo-file-arg).
It is the reading this cycle's corrected instrument implements: every fixed/verified row's
`regression_check` must match one of the 6 remaining shapes (or a conjunction of them), each of which
is now either (a) empirically demonstrated to narrow at file level (`direct-tsx`, with or without
`--tsconfig`) or (b) checker-validated as a legitimate package-level narrowing
(`package-filter`/`package-dir` — genuinely re-runnable against real `package.json` scripts, narrower
than the previous whole-monorepo baseline even though not file-level) or (c) a narrow, correctly-scoped
non-code check (`doc-grep`, `scenario-ref`, `rubric-ref`) or (d) the explicit, note-justified
`null_bucket` for no-code-change fixes. 100.0% is the honest number **under this now execution-tested
convention** — it is higher than cycle 0's own before-number (87.2%/109-125) mainly because
cycle 0's convention-plus-backfill work was itself sound for 5 of 6 shapes; this cycle's own
contribution is closing the one shape that was fake, not inflating the rate further.

**One re-verification worth flagging plainly:** cycle 0's manifest and the checker's cycle-0 verdict
both describe 4 pre-existing `null` rows (`ISS-t-013r-c0-4`, `ISS-t-013r-c0-5`, `ISS-059`, `ISS-083`)
as still printing **WEAK** in the instrument's own output. Re-running the current script against the
current ledger, none of the 4 print WEAK — `note_looks_like_null_class()` matches each of their
existing `class`/`note`/`checker_note` text against the keyword list (`"process"`, `"reconciled"`,
`"fold"` respectively) and correctly treats them as already explained. I checked this directly
(imported the module, called the function on each merged row) rather than repeating the prior claim
unverified; I cannot explain the discrepancy with the prior cycle's stated observation, but I can say
what the script actually does right now, on this ledger, which is print 0 WEAK rows, not 4. Not a
change I made — these 4 rows are untouched by any of this cycle's or cycle 0's edits.

### 5. Is ISS-076 closed?

**No.** This unit narrows ISS-076 further (the shape doing the false-conforming for 55% of rows is
gone, and the instrument that would let a similar shape back in without proof now has execution-based
tests) but does not close it:

- `scenario-ref`/`rubric-ref` remain existence-only checks (the checker's own "worth tightening, not
  blocking" note from cycle 0) — untouched this cycle, out of scope for what ISS-092 required.
- `package-filter`/`package-dir` narrow to package level, not file level — checker-accepted as
  legitimate, but still coarser than what a per-fix regression check ideally proves.
- The 4 WEAK-eligible-by-design null rows from cycle 0 remain unbackfilled by the same reasoning cycle
  0 gave (outside ISS-076's named scope).
- `fixed -> verified` transitions for the 69 remapped rows are now structurally possible (the
  regression_check conforms and is real) but this unit did not itself attempt any, per the brief's
  scope (this cycle is about the instrument and the remap, not re-running historical verifications).

Only `/checker` can move ISS-076 to verified/closed.

## Fix cycle 2 (2026-09-27) — what cycle 1 got wrong and what changed

**Checker verdict on cycle 1: FAIL.** Cycle 1's own work held up: `repo-file-arg` genuinely
retired (not repaired), the `--tsconfig` addition empirically justified and correctly gated,
`mcp/student-profile` 12/12 legitimate (not a repo-file-arg-style side door), the ledger append-only
(89 insertions/0 deletions across e4bfa5b..HEAD at the time), the merge hazard empirically absent,
the instrument's 48 assertions genuinely executing commands, and the cycle-0 "4 WEAK" claim
confirmed mistaken (0 WEAK is correct). But cycle 1 still failed on **ISS-093** (high, blocking):
the one row the checker's own 3-row sample dug into content-level (not just shape-level), `ISS-
t-013-rev-1`'s regression_check (`packages/engine/tests/scribe-citation-rescope.test.ts`), does
**not** fail when the actual fix (`containsNumberToken` boundary anchoring, `nodes.ts:799`) is
reverted — its only fixture ("115 students applied from that batch", value 15, key `siblingCount`)
has no first-person marker, so `verifyCandidateFact`'s `noFirstPerson` guard already forces
`needsReview: true` regardless of `containsNumberToken`'s return value: "the assertion is right for
the wrong reason, a confounded guard." Plus **ISS-094** (low): a `.test.ts` file with zero `test()`
calls passes both the static conformance check and real `node:test` execution (which counts an
empty file as "1 test, 1 pass"). Full verdict: `qa/verdicts/t-043-regression-check-conformance.md`.

### 1. ISS-093 — root cause, fix, and the revert/restore proof required by the brief

Before writing a fixture-only patch (adding a first-person marker to the same row, which the
checker's own remedy suggestion implied), I checked whether that would actually work — it would
not, for any declared number key, not just this one. `declaredKeysForClause`'s own template slot
(`NUM`, a greedy `\p{Nd}+` run inside an anchored `^…$` template) already requires the captured
digit run to equal `String(value)` exactly before `guards.length === 0` is even reachable, for
`budget_inr_per_year` and the score-exam family (the only currently-declared number keys). That
makes `containsNumberToken`'s return value structurally unable to change `assessFactForReview`'s
outcome through the public API for any declared key — confirmed by two experiments: reverting it to
a plain substring match left the whole file's 42/42 tests green, AND all 9 of
`scribe-auto-verify-property.test.ts`'s property suites (including the randomized/mutation ones)
green. `siblingCount` (the failing row's key) is not declared at all, so it fails for a second,
independent reason (`unrecognised-form`) on top of `noFirstPerson`. A fixture-only fix therefore
cannot make this property load-bearing through the existing surface; only a direct unit test on the
exported function closes the gap honestly.

**Fix:** exported `containsNumberToken` (it was previously unexported — same pattern already used
for `AUTO_VERIFY_TEMPLATE_SOURCES`, nothing else at runtime reads the export) with a comment block
explaining the structural-unreachability finding above; added a direct new test, `"containsNumberToken:
a value embedded inside a LARGER digit run is never a whole-token match (ISS-093 direct unit proof,
e.g. 15 inside 115)"`, with 5 assertions covering the boundary property directly (embedded-in-larger-
run, standalone match, thousands-separator false positive, decimal true positive, decimal
false-positive-on-the-integer-part). The original confounded test (line 140) is kept — deleting it
would lose real coverage of the `noFirstPerson`-guarded path — but its comment and assertion message
were corrected to say plainly that it does NOT prove the boundary property and points at the new
test.

**Revert-and-restore proof, run twice now (once before this compaction, once fresh just now to
re-confirm nothing regressed in between):**

Earlier in this cycle (2026-09-27):
```
$ npx tsx --test packages/engine/tests/scribe-citation-rescope.test.ts   # baseline, 22:50:33+05:30
tests 43, pass 43, fail 0
$ # reverted containsNumberToken (nodes.ts:799-804) to a plain text.includes(String(value)) match
$ npx tsx --test packages/engine/tests/scribe-citation-rescope.test.ts   # reverted, 22:50:50+05:30
✖ containsNumberToken: a value embedded inside a LARGER digit run is never a whole-token match ...
  AssertionError [ERR_ASSERTION]: 15 must not match as a token inside the larger digit run 115, true !== false
tests 43, pass 42, fail 1
$ # restored the anchored-regex form
$ npx tsx --test packages/engine/tests/scribe-citation-rescope.test.ts   # restored, 22:51:09+05:30
tests 43, pass 43, fail 0
```

Fresh re-confirmation just now (post-reconciliation, post-sampling, before the final full suite run):
```
$ npx tsx --test packages/engine/tests/scribe-citation-rescope.test.ts   # 23:33:31+05:30
tests 43, pass 43, fail 0
```
`git diff --stat -- packages/engine/src/scribe/nodes.ts` shows only the intended change (18
insertions / 1 deletion: the `export` keyword + the comment block) — no revert residue.

### 2. ISS-094 — fix and its own regression test

**Fix:** `scripts/vc-regression-check-conformance.py` gained `RE_TEST_DECL` (a comment-stripped scan
for `test(`/`it(`/`describe(` calls) and a `has_real_test_declaration()` method; the `direct-tsx`
conformance branch now rejects a path with zero real test declarations, naming ISS-094 in the reason
string, instead of certifying it on file-existence alone. Verified this adds no false positives: the
real 126-row ledger still reports 126/126 conforming after the change. `scripts/
vc-regression-check-conformance.test.sh` gained **Test 24**: builds a genuinely content-free
`.test.ts` fixture, asserts the static checker rejects it (exit 1, reason names ISS-094), and
separately asserts `node:test` itself would silently pass it (exit 0, "tests 1, pass 1") — the
positive control proving the hazard is real. Full instrument suite is now **52 passed, 0 failed**
(up from 48 in cycle 1).

### 3. The scale question — a mechanical heuristic, a systematic sample, and an honest successor unit

Per the brief, I did NOT attempt to hand-verify all 69 remapped rows' test CONTENT this cycle. Three
things instead, exactly as asked:

**(a) A mechanical confounded-guard detector — `scripts/vc-confounded-guard-heuristic.py` (new).**
Flags a `test()` block that calls `verifyCandidateFact`/`assessFactForReview`, asserts
`needsReview === true`, and never pins a *specific* `reviewReasons` value/prefix — exactly the
ISS-093 shape. Self-tested (`vc-confounded-guard-heuristic.test.sh`, 4/4 pass: flags a synthetic
confounded fixture, does not flag a well-formed one that pins a reason, does not flag an unrelated
test) and smoke-run against the real repo: **7 candidates**, all in
`packages/engine/tests/scribe-citation-rescope.test.ts` (lines 140, 181, 211, 221, 229, 239, 258;
line 140 is the already-confirmed ISS-093 row, now with a corrected comment — the other 6 are
**unconfirmed candidates**, not verified defects, flagged for human/checker review), and **0**
elsewhere (`scribe-per-fact.test.ts`, `scribe-auto-verify-property.test.ts`, `scribe.test.ts`,
`guard-crisis.test.ts`). **What it can catch:** exactly the ISS-093 shape, in this one codebase
convention. **What it explicitly cannot catch (stated in its own docstring, not oversold):** it is
not a general confounded-guard detector — a different function with a different multi-cause `true`
branch and no `reviewReasons`-style convention is invisible to it; it cannot tell whether a present
`reviewReasons` check pins the *right* reason, only that some specific-reason check exists at all;
and — directly relevant to finding (b) below — **it cannot catch a claim with NO test block at
all**, which is a coverage-absence problem, not a confounded-assertion problem, and needs a
different check entirely (cross-referencing ledger claims against test titles). Brace-matching over
raw text (not a real parser) is also named as a real, if unobserved, limitation.

**(b) A systematic (not cherry-picked) 8-row sample of the 66 remaining rows, each with a real
revert-and-restore.** Rule, stated up front: take the 69 rows T-043 remapped from `repo-file-arg` to
`direct-tsx`/`direct-tsx+tsconfig` (extracted from the cycle-1 commit's own ledger diff, in the
order they appear there — a stable, inspectable ordering, not chosen by me), remove the 3 the
checker's own cycle-1 sample already tested (`ISS-009`, `ISS-t-020-c0-1`, `ISS-t-013-rev-1`),
leaving 66, then take `remaining[3::8]` — a fixed, deterministic slice (start at index 3, every
8th element), yielding exactly 8 ids. No row was chosen because it looked interesting; the rule was
fixed before I looked at what it would select.

The 8 sampled ids, the file reverted, and the outcome:

| id | reverted | regression_check | outcome |
|---|---|---|---|
| ISS-010 | `packages/schemas/src/schemas.ts`: `validFrom`/`validTo` back to `z.string().min(1)` | `packages/schemas/tests/fact.test.ts` | **PASS** — baseline 12/12 (23:19:13) -> reverted 10/12, 2 named failures (23:19:30) -> restored 12/12 (23:19:45) |
| ISS-019 | `packages/db/tests/fakes.ts`: `assertNoUniqueConflict` short-circuited to a no-op | `packages/db/tests/facts.test.ts` | **PASS** — baseline 58/58 (23:20:13) -> reverted 54/58, 4 named failures incl. the ISS-019 test itself (23:20:32) -> restored 58/58 (23:20:47) |
| ISS-027 | `packages/db/scripts/db-init.ts`: removed 4 of 5 `INDEX_PLAN` plain `studentId` entries | `packages/db/tests/db-init.test.ts` | **PASS** — baseline 25/25 (23:20:55) -> reverted 24/25, the named ISS-027 test fails (23:21:15) -> restored 25/25 (23:21:32) |
| ISS-t-007-rev-1 | `packages/engine/src/scribe/nodes.ts`: `generateWithRetry` collapsed to a single un-retried call | `packages/engine/tests/scribe.test.ts` | **PASS** — baseline 32/32 (23:21:51) -> reverted 29/32, exactly the 3 named ISS-t-007-rev-1 tests fail (23:22:11) -> restored 32/32 (23:22:32) |
| ISS-t-011-rev-1 | `packages/db/src/erasure.ts`: checked-CAS filter `{_id, status, attempts}` narrowed back to bare `{_id}` | `packages/db/tests/erasure.test.ts` | **PASS** — baseline 68/68 (23:23:05) -> reverted 65/68, 3 named failures (23:23:30) -> restored 68/68 (23:23:45) |
| ISS-t-011-c2-rev-1 | `packages/db/src/erasure.ts`: `fenceReleaseTime` formula dropped its `created + MINIMUM_FENCE_HOLD_MS` floor | `packages/db/tests/erasure.test.ts` | **PASS** — baseline 68/68 (23:24:04) -> reverted 64/68, 4 named failures incl. the D-016 KEY PROBE (23:24:22) -> restored 68/68 (23:24:38) |
| ISS-t-008-c0-1 | `packages/engine/src/scribe/nodes.ts`: `perFactDecision`'s scalar-type-match check removed | `packages/engine/tests/scribe-per-fact.test.ts` | **PASS, and notable** — see below |
| ISS-t-013-c2-rev-3 | *(no revert possible)* | `packages/engine/tests/scribe-citation-rescope.test.ts` | **FAIL — a third species, coverage-absence, not confounded-assertion or inert-shape** |

**ISS-t-008-c0-1 is worth a note, not a defect.** This row looked, on first read, like it might be
another defense-in-depth confound: the fact-type-match check lives in BOTH `schemas.ts`
(`EditedValueSchema`, scalar-only refine) and `nodes.ts` (`perFactDecision`'s `scalarTypeOf`
comparison), so a naive test using only an object/array fixture (lines 331, 355 in the test file)
would stay green under a `nodes.ts`-only revert, because the schema layer catches it first — exactly
the same shape of problem as ISS-093. But the test file also has a genuinely isolating fixture at
line 371 (a STRING value for a NUMERIC fact — schema-valid on its own, since a string is an
allowed scalar, but a cross-type mismatch only `perFactDecision` can catch) and another at line 398
(boolean vs numeric). Reverting `perFactDecision`'s check in isolation turned exactly those two named
tests red (`24 -> 22 pass`, 23:18:08) while (confirmed by inspection, not a separate revert this
cycle) the schema-level tests do not depend on this code path at all; restoring returned the file to
24/24 (23:18:36). This is a real instance of the SAME class of risk ISS-093 exposed (defense-in-depth
can silently collapse to single-layer coverage) turning out, on inspection, to be correctly guarded
here — the row conforms genuinely, not by luck.

**Sample-size rationale:** 8 is small deliberately — the brief asked for a documented, non-cherry-
picked sample, not a full hand-verification of the remaining 66 (that is the successor unit, below).
8 rows across 6 different files/packages (schemas, db x4, engine x2) gives some spread across the
codebase's different subsystems without claiming more coverage than was actually done.

**(c) Successor unit — the 58 rows still not content-verified.** Combined with the checker's own
3-row cycle-1 sample, **11 of the 69** remapped rows now have a real revert-and-restore result: 9
PASS, 2 FAIL (`ISS-093`, `ISS-t-013-c2-rev-3`). That is an **observed failure rate of 2/11 ≈ 18%**,
stated explicitly as an estimate from a sample of 11, not a census — with a small-n confidence
interval wide enough that the true rate could plausibly be anywhere from roughly 5% to 45%; nothing
about this cycle's work narrows that interval further than the arithmetic already shown. The
remaining **58 rows** (69 − 11) are structurally conforming (`direct-tsx`, file exists, shape valid)
but their test CONTENT has not been individually revert-verified. A successor unit should: run the
same revert-and-restore method (or the mechanical heuristic as a first-pass triage, given its stated
scope) across some or all of the 58, prioritizing the 6 unconfirmed heuristic candidates in
`scribe-citation-rescope.test.ts` first (already flagged, cheapest to check next) and then a further
systematic slice of the rest; and separately build the coverage-absence check the heuristic
explicitly cannot do (cross-referencing every `fixed`/`verified` row's own title/fix text against
its regression_check file's actual test titles, to catch more `ISS-t-013-c2-rev-3`-shaped rows —
this cycle found one by manual probing, not by any mechanical check, so there is no reason to believe
it is the only one).

### 4. Is ISS-076 closed? Still no — narrower than before, not resolved

**No 100%-style headline this cycle.** Two consecutive such headlines (cycle 0's 125/125, cycle 1's
126/126) each preceded a FAIL, both times because a shape- or row-level Goodhart problem was hiding
under an otherwise-honest number. This cycle's own honest numbers: instrument re-run still reports
`126/126 (100.0%)` **shape-conformance** (unchanged by this cycle, since no row's regression_check
value was itself edited) — that number measures what the instrument checks, not what ISS-076 cares
about, and cycle 1's own FAIL is the reason that gap now has to be stated on every cycle, not just
implied. What actually changed this cycle is content-level: 8 more rows revert-verified (up from the
checker's 3), one of which is a NEW, differently-shaped defect (ISS-t-013-c2-rev-3) that neither
ISS-092's shape check nor ISS-093's own fix would have caught.

- `ISS-093` is fixed and proven (revert/restore pair above).
- `ISS-094` is fixed and has its own regression test (Test 24).
- 9 of 11 sampled rows (82%) are genuinely regression-tested; 2 are not, for two different reasons
  (a confounded assertion, and a complete coverage absence).
- 58 of the 69 remapped rows remain content-unverified — named as a successor unit, not hidden.
- `ISS-076` remains **open**. Only `/checker` can move it toward verified/closed, and per the
  brief's own instruction this unit does not claim to have done that work.

### 5. Ledger reconciliation and full-suite verification (own runs)

The checker had appended `ISS-093`, `ISS-094` and an `ISS-076` cycle-1 status update to the ledger
in the **main tree** (`D:/vc/qa/issues.jsonl`), not this branch. Reconciled by extracting those
exact 3 lines from main's committed history (they had since been committed there, alongside
unrelated `ISS-095`/`ISS-096` maker-checker-infrastructure entries that do NOT belong to this unit
and were left untouched) and appending them, byte-for-byte, to this branch's `qa/issues.jsonl`,
matching its CRLF convention. Verified append-only: `git diff -U0 -- qa/issues.jsonl` shows exactly
3 added lines and 0 removed; all 551 lines parse as valid JSON; `ISS-093`/`ISS-094` each appear
exactly once; the pre-existing `ISS-092` rows (from cycle 1) are untouched.

```
$ bash scripts/vc-testlock.sh pnpm -r typecheck        # 23:28:37+05:30
Scope: 9 of 10 workspace projects — all 9 Done, 0 errors
EXIT: 0

$ bash scripts/vc-testlock.sh pnpm -r test             # 23:29:17+05:30
packages/schemas test:       tests 61   pass 61   fail 0   skipped 0
packages/observability test: tests 59   pass 59   fail 0   skipped 0
packages/db test:            tests 248  pass 248  fail 0   skipped 0
packages/providers test:     tests 54   pass 54   fail 0   skipped 0
mcp/student-profile test:    tests 12   pass 12   fail 0   skipped 0
mcp/university-kb test:      tests 29   pass 29   fail 0   skipped 0
packages/engine test:        tests 690  pass 645  fail 0   skipped 45
apps/web test:                tests 38   pass 38   fail 0   skipped 0
apps/api test:                tests 46   pass 46   fail 0   skipped 0
Grand total: 1237 / 1192 / 0 / 45
EXIT: 0

$ python contracts/verify_contracts.py                 # 23:33:19+05:30
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
EXIT: 0
```

**Grand total is 1237/1192/0/45, not the documented baseline 1236/1191/0/45 — a +1/+1 difference,
fully accounted for:** `packages/engine` moved from 689 to 690 tests (644 to 645 pass), which is
exactly the one new `containsNumberToken` direct-unit test this cycle added to
`scribe-citation-rescope.test.ts` (43 tests in that file now vs. 42 before). No other package's
count moved. No flake of the known ISS-089/ISS-091 class was observed (0 fail everywhere, one clean
run, no isolation re-run needed).

No revert/restore residue anywhere: `git status --short` (checked repeatedly through this cycle and
again just before commit) never showed an uncommitted change to `packages/schemas/src/schemas.ts`,
`packages/db/tests/fakes.ts`, `packages/db/scripts/db-init.ts`, or `packages/db/src/erasure.ts` after
each restore step above.

## Status: checked-PASS

**Cycle checked:** 2 · verdict `qa/verdicts/t-043-regression-check-conformance.md` (commit `66bad91`)
**Verdict:** PASS (with recorded issues — not closed). Closed out 2026-09-28T00:18:35+05:30.
**Merged:** `ee95e0c` (--no-ff from `wave/t-043-regression-check-conformance`).
**Merge gate ISS-100 satisfied:** 5 byte-identical ledger lines (ISS-092, ISS-093, ISS-094, two
ISS-076 update rows) deduped at `e95c204`; 578 -> 573 rows, all parse.
**Main verify after merge:** `pnpm -r typecheck` 9/9 Done, 0 errors · `bash scripts/vc-testlock.sh
pnpm -r test` **1237 tests / 1192 pass / 0 fail / 45 skipped** · `bash
scripts/vc-regression-check-conformance.test.sh` **52 passed, 0 failed**.
**Left open by this PASS, deliberately:** ISS-076 stays open/high — only ISS-092 closed. ISS-093,
ISS-094, ISS-099 (coverage-absence species), ISS-100 are open. A successor unit owns the 58
content-unverified remapped rows and a shape for repo-level shell test scripts.
