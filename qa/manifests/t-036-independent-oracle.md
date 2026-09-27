# Manifest — t-036-independent-oracle

**Contract:** qa/contracts/counselling-engine.md, B2 as amended by D-026 (the auto-verify property:
`needsReview:false` = (i) the cited turn's speaker is the student, (ii) the matched template is bound to
this fact's key, (iii) the match is on the original-language text, not `translatedText` alone, (iv) within
one turn).
**Goal task:** T-036 (ISS-t-030-rev-1, raised by a senior-software-engineer review of T-030: "replace the
golden-copy oracle claim with a real independent check").
**Date:** 2026-09-27
**Fix cycle:** 0 of max 3
**Dual check:** no
**Persona walk:** skip (test-only, no UI surface)
**Issues addressed:** ISS-t-030-rev-1
**Executor:** claude-sonnet-subagent
**Executor rationale:** a bounded, well-specified test-wiring + prose-rewording unit; no architecture
decision or heavy multi-file reasoning involved.

## What changed

- `packages/engine/tests/fixtures/auto-verify-oracle.jsonl` — **inherited, not authored by this unit**
  (committed `d4d2e49` by a previous session, before this unit started). 102 rows: 30 hand-written
  SHOULD-verify sentences and 72 MUST-need-review sentences, one per auto-verify template family
  (country, budget, score), each carrying `id`, `category`, `text`, optional `translatedText`/`quote`, `key`,
  `value`, `speaker`, `expect` and a `why`. Read and judged complete for this unit's purpose: it already
  covers hedges, negation, third-party, questions, conditionals, ranges, compounds, wrong-key-for-value,
  counsellor speaker, translation-only match, multi-clause and Hinglish/Devanagari variants — one fixture row
  per B2/D-026 clause being tested, not derived from the SPEC_* grammar or `nodes.ts`. Left unchanged.
- `packages/engine/tests/scribe-auto-verify-property.test.ts`:
  - Header doc-comment (top of file): reworded the "INDEPENDENT spec" claim. It now states plainly that the
    SPEC_* grammar is transcribed from the same templates `nodes.ts` encodes (mechanically independent of
    the JS `RegExp` engine, but NOT independent of the production grammar's content), names the
    senior-software-engineer finding (ISS-t-030-rev-1), and points at the new T-036 block as the real
    independent check.
  - Inline comment above `SPEC_DEGREE` (was "The independent spec…"): reworded to "the closure-check
    grammar… NOT independent of the production regex".
  - Inline comment above `COUNTRY_SLOTS` (was "written out independently"): reworded to "transcribed from
    the engine's own alias list (not independent…)".
  - **New test block appended at the end of the file** (after the existing T-030 (d) test): loads
    `tests/fixtures/auto-verify-oracle.jsonl`, runs every row through the same `run()` helper the T-030
    tests already use (which calls the real `verifyCandidateFact`), and asserts the engine's
    verify/needs-review outcome matches the fixture's hand-authored `expect` for every row. Also asserts the
    fixture is non-empty and has exactly 30 positive / 72 negative rows (guards against a silently-emptied
    fixture making the check vacuous).
- `qa/manifests/t-030-template-gap.md`: reworded the two places that overclaimed independence (the "Scope"
  bullet for the new test file, and the acceptance-table row for (a)) to say the grammar is transcribed from
  the templates and point at T-036/ISS-t-030-rev-1. The close-out line (which already correctly *reports*
  the senior-software-engineer's "golden copy, not an independent spec" finding) was left as-is — it is the
  accurate historical record of the finding, not the overclaim.
- `qa/manifests/t-036-independent-oracle.md` — this manifest.
- **No change to `packages/engine/src/scribe/nodes.ts`.** Every one of the 102 fixture rows agreed with the
  engine on the first run (see Actual outputs). No auto-verify leak was found.

**Not touched:** `qa/contracts/**`, `docs/DECISIONS.md`, `ARCHITECTURE.md`, `TASKS.md`, `.claude/**`, any
other package.

## How to verify (commands + expected)

- `pnpm -C packages/engine exec tsx --test tests/scribe-auto-verify-property.test.ts` → expected: exit 0, all
  tests pass including `T-036 independent oracle: …`.
- `pnpm -C packages/engine test` → expected: exit 0, full suite green.
- `pnpm -r typecheck` → expected: exit 0, no diagnostics.

## Actual outputs (from maker's own run)

Targeted file (`tsx --test tests/scribe-auto-verify-property.test.ts`), the new test's own line:
```
[t036-oracle] independent oracle rows=102 positive=30 negative=72 failures=0
✔ T-030 property oracle: the spec parses in the closed subset, is finite, and rejects an open gap (4.7941ms)
✔ T-036 independent oracle: hand-authored positive/negative sentences (written from B2/D-026, not the regex) agree with the engine (7.5768ms)
```

Full engine suite (`pnpm -C packages/engine test`), tail:
```
ℹ tests 595
ℹ suites 0
ℹ pass 595
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 32584.4893
```

Typecheck (`pnpm -r typecheck`):
```
Scope: 9 of 10 workspace projects
packages/observability typecheck$ tsc --noEmit
packages/schemas typecheck$ tsc --noEmit
packages/schemas typecheck: Done
packages/observability typecheck: Done
packages/db typecheck$ tsc --noEmit
packages/providers typecheck$ tsc --noEmit
packages/providers typecheck: Done
packages/db typecheck: Done
mcp/student-profile typecheck$ tsc --noEmit
packages/engine typecheck$ tsc --noEmit && tsc --noEmit -p evals/tsconfig.json && tsc --noEmit -p scripts/tsconfig.json
mcp/university-kb typecheck$ tsc --noEmit
mcp/student-profile typecheck: Done
mcp/university-kb typecheck: Done
packages/engine typecheck: Done
apps/api typecheck$ tsc --noEmit
apps/web typecheck$ tsc --noEmit
apps/api typecheck: Done
apps/web typecheck: Done
```

Post-falsification revert, full suite re-run green again (see Capability coverage row below for the
falsification itself):
```
ℹ tests 595
ℹ pass 595
ℹ fail 0
ℹ duration_ms 41752.9941
```

## Capability coverage (each new claim -> its isolating falsification)

| capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| the T-036 oracle is a REAL check wired to the engine, not a vacuous pass-through — a genuine auto-verify leak (here: dropping the speaker guard) turns it red, naming the exact disagreeing rows | `T-036 independent oracle: …` (scribe-auto-verify-property.test.ts) | in a throwaway edit of `packages/engine/src/scribe/nodes.ts:923`, replaced `if (provenance?.speaker !== "student") guards.push(REVIEW_REASONS.speaker);` with a no-op comment (removing the speaker guard), then reverted via `git checkout --` before committing | GREEN before: `✔ T-036 independent oracle: hand-authored positive/negative sentences (written from B2/D-026, not the regex) agree with the engine (7.5768ms)` / `[t036-oracle] independent oracle rows=102 positive=30 negative=72 failures=0`. RED after: `✖ T-036 independent oracle: … (15.4369ms)` / `AssertionError [ERR_ASSERTION]: 6 of 102 independent-oracle rows disagree with the engine` naming exactly the 6 counsellor-speaker rows (`neg-speaker-01`..`neg-speaker-06`), each `expected "review", engine said "verify"`. Reverted; full suite re-confirmed green (595/595, pasted above). |
| the fixture itself cannot be silently emptied or truncated without the test noticing | the same test's row-count assertions (`assert.equal(positives.length, 30, …)`, `assert.equal(negatives.length, 72, …)`) | N/A — this is a static shape guard on the fixture, not a behavioral leak; verified by inspection (the assertions are unconditional on every run, and this run's own `[t036-oracle] … positive=30 negative=72` line shows them passing at the real counts) | `[t036-oracle] independent oracle rows=102 positive=30 negative=72 failures=0` (pasted above) |

**No leak found.** All 102 hand-authored rows agreed with `nodes.ts` as it stands on this branch — the unit
found no case where B2/D-026's stated property and the engine's actual behavior diverge, so no fix to
`nodes.ts` was needed or made.

## Live browser evidence

Not UI-touching — no surface changed. Changed paths: `packages/engine/tests/scribe-auto-verify-property.test.ts`,
`qa/manifests/t-030-template-gap.md`, `qa/manifests/t-036-independent-oracle.md` (this unit's own commit;
the fixture `packages/engine/tests/fixtures/auto-verify-oracle.jsonl` was committed by the inherited prior
session, `d4d2e49`).

## Status: ready-for-check
