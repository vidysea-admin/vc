# Manifest — p1-greal-bold
**Contract:** D-100 (paid real-model eval runs approved; Umesh chat 2026-10-19: "code fix krr", then run the paid GLM run); contract B24.9 (every REAL runner needs the per-use approval recorded in `qa/gates/g-real.md`); contract B13 (no live call, no paid call from tests). Source brief `qa/evidence/p1-briefs/p1-greal-bold.md`.
**Criteria:**
- C1 `assertGReal` (`packages/engine/evals/budget.ts`) accepts the approval line when the label starts the line as `Answered:`, `**Answered:**` or `**Answered**:`, each followed by non-empty content on the same line. A verbatim copy of the current `qa/gates/g-real.md` (whose only approval is the bold `**Answered:**` line) is accepted, with LF and with CRLF line endings.
- C2 It still refuses: `Answered:` / `**Answered:**` / `**Answered**:` with only whitespace after; a bold label with its content on the NEXT line; the label not at line start (the `Answer format` line that quotes `Answered: <ISO>` in backticks, an indented line, text before the label); `Not Answered:`, `**Not Answered:**`, `> Answered:`, `> **Answered:**`, a broken wrapper (`**Answered:`, `Answered** :`). The real gate text with its bold approval line removed is refused.
**Goal task:** none
**Date:** 2026-10-19
**Status:** checked-PASS
**Fix cycle:** 0 of max 2
**Policy-Version:** proportional-verification/2026-10-19.16
**Tier:** S (one regex and its comment in one file plus its test file; no auth, no production data, no network, no paid call)
**Dual check:** no (no security, auth, tenancy or production-write trigger: loosening which markdown form of the human approval line a REAL-run guard parses; the guard still requires the env flag, the gate file and a non-empty answered line, and the per-run USD 50 / per-month USD 200 caps are untouched)
**Persona walk:** skip (no human screen)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent (maker/builder p1-greal-bold)
**Executor rationale:** one regex line in one file plus its test file; splitting would only add merge work.

## What changed
Branch `p1/greal-bold`, base `c1027c9` (origin/main). Code and tests commit `7c50ed5`; the manifest is a later commit. Edited in place, no new file besides this manifest.
- `packages/engine/evals/budget.ts` `assertGReal` (line 60-61): `/^Answered:[ \t]*\S/m` -> `/^(?:Answered:|\*\*Answered:\*\*|\*\*Answered\*\*:)[ \t]*\S/m`, with a comment. The `^` anchor under `/m` is kept, so a label in the middle of a line (the backtick-quoted `Answered: <ISO>` on the `Answer format` line, `qa/gates/g-real.md:23`) still does not count; `[ \t]*\S` stays on the same line, so a bare label never borrows the next line's text.
- `packages/engine/evals/budget.test.ts`: two tests added (24 total in the file, 22 before): a real-file case (the whole current `qa/gates/g-real.md` text embedded as `G_REAL_FILE_COPY`, written to a temp gate file; accepted with LF and CRLF; the same text minus the bold approval line is refused) and a table test of 5 accepted and 16 refused line shapes, each run with LF and CRLF.
- Other readers of `Answered`: grep over `packages apps scripts`. `apps/api/src/go-live-gate.ts` reads `Answered:` for the g-publish / g-prod gates through its own `keyValues` parser (a different gate, last-line-counts rule); it is not a G-REAL reader and was left unchanged. Every other hit is a test fixture string, a coverage table header or a comment. `qa/gates/*` untouched.
- Line endings: touched files keep CRLF in the working tree.

## Verification scope
Round: 2 files, 2 criteria, est 10 min - TDD two tests, the three gate-file test importers, typecheck, one falsification (lock waits dominate)
Affected tests / full-suite trigger: engine evals/budget.test.ts plus the other test files that write a G-REAL gate file and call `assertGReal` through the runners (evals/p1-runners.test.ts, evals/real-bodies.test.ts, evals/run-live.test.ts) and the two eval tests that import budget (evals/citation.test.ts, evals/score-perfect.test.ts); no full-suite trigger (tier S, one guard regex, no shared runtime path).
Base / checked state: `p1/greal-bold` at `7c50ed5`.
Tests[C1]: engine evals/budget.test.ts "p1-greal-bold: a verbatim copy of the real g-real.md (bold **Answered:** line only) is accepted" and the accept half of "p1-greal-bold: assertGReal accepts Answered: and the bold wrapper forms, each with content; refuses ..." - assert the real-file copy passes (LF and CRLF) and the five accepted shapes pass (LF and CRLF).
Tests[C2]: engine evals/budget.test.ts the refuse half of "p1-greal-bold: assertGReal accepts Answered: ... refuses ..." and the removed-approval-line case in the real-file test - assert the 16 refused shapes throw `GRealRefusedError` (LF and CRLF) and the next-line-borrow case throws; the existing "fix4" test still covers the original shapes.
Pre-check[C1]: 7c50ed5 VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test evals/budget.test.ts -> green: 24 tests, 24 passed, 0 failed
Pre-check[C2]: 7c50ed5 same command as Pre-check[C1] -> green: 24 tests, 24 passed, 0 failed
Wide-set (importers, informational backstop): 7c50ed5 same lock, `pnpm -C packages/engine exec tsx --test evals/p1-runners.test.ts evals/real-bodies.test.ts evals/run-live.test.ts evals/citation.test.ts evals/score-perfect.test.ts` -> 113 tests, 113 passed, 0 failed.
Pre-check[typecheck]: 7c50ed5 same lock, `pnpm -r typecheck` -> exit 0 (all workspaces).
Falsification[C1]: golden red-before/green-after - before the fix (new tests, old regex) `evals/budget.test.ts` ran 24 tests, 22 passed, 2 FAILED (both new tests); after the fix 24/24 green.
Falsification[C2]: in a copy (`packages/engine/fals-copy`, budget.ts + budget.test.ts + budget-worker.ts, deleted afterwards; the bound tree was never edited) the line-start anchor was removed (`/^(?:Answered:...` -> `/(?:Answered:...`) -> `tsx --test fals-copy/budget.test.ts` -> 24 tests, 21 passed, 3 FAILED (the new table test, the new real-file test via the quoted `Answer format` line, and the old fix4 test); the C1 accept cases stay green under that mutant, as they should.
Metrics: start=2026-10-19T14:50:41+05:30 end=2026-10-19T14:57:17+05:30 builder_min=unavailable wall_min=unavailable agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=1 mutations=1 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.16 check_s=unavailable mutants=1 defects_unit=0 defects_6c=0

## Not determined / for the owner
- Not run: the paid GLM run itself (no network, no paid call here); the first real run after merge is the live check that the bold line is accepted from the repo's actual `qa/gates/g-real.md` path (`G_REAL_GATE_FILE`).
- The gate still reads only that the file has some qualifying line; like the old rule it does not parse the option letter or the ISO instant.
