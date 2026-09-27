# Verdict — t-036-independent-oracle

**Date:** 2026-09-27
**Cycle checked:** 0
**Checker:** fresh Claude subagent (Mode A unit check), bound to `D:/vc/.worktrees/t-036-independent-oracle`
**Base commit:** `19f75e2c3fb1a9378b5131a005500d3509e7f75d` (confirmed via `git merge-base main wave/t-036-independent-oracle`, matches the dispatch's expected value)
**Head commit:** `2448a1578fcf80bded2d3e0d7d0eeb9514ce2279` (matches dispatch)

## What I re-ran myself

- `pnpm -C packages/engine exec tsx --test tests/scribe-auto-verify-property.test.ts` in the bound tree
  — exit 0, 8/8 pass, including the new `T-036 independent oracle: …` test
  (`[t036-oracle] independent oracle rows=102 positive=30 negative=72 failures=0`). Matches the manifest.
- Read `packages/engine/tests/fixtures/auto-verify-oracle.jsonl` in full (all 102 rows) and
  `packages/engine/src/scribe/nodes.ts` (the `assessFactForReview` function and the template/comment
  sections around lines 483-960).
- Diffed `19f75e2..HEAD --stat` and the full diff: exactly the 4 files the manifest's "What changed"
  names (`auto-verify-oracle.jsonl` new, `scribe-auto-verify-property.test.ts` modified,
  `t-030-template-gap.md` modified, this unit's own manifest new). No deletions, no untouched-file
  surprises, no scope creep. `nodes.ts` has zero diff against base, confirmed.
- **Independence-of-fixture check (the point of this unit).** Extracted the base-commit (`19f75e2`)
  content of `nodes.ts`, `scribe-auto-verify-property.test.ts` and `scribe-citation-rescope.test.ts` and
  compared every fixture row's `text` for exact string containment. **23 of 102 rows are byte-for-byte
  identical** to sentences that already existed, verbatim, in those files before this unit (and before
  the fixture's own commit `d4d2e49`) — including **all six `neg-speaker-01..06` rows**, which are exact
  copies of the pre-existing `T-030 (d)` probes `S1`/`S2` ("I prefer Canada" / "I chose Canada",
  speaker=counsellor -> review) and four more already-known-positive sentences ("My budget is 1500000",
  "I scored 92 in my class 12 boards", "I want to study in the UK", "My IELTS score is 7.5", "My total
  budget is 4000000") with only the `speaker` field flipped to `"counsellor"`. Full match list kept in
  `qa/issues.jsonl` `ISS-t-036-1`.
- **Falsification, reproduced in a throwaway copy** (never in the bound tree): copied the working tree
  (excluding `.git`/`node_modules`) to a scratch dir outside the bound root, ran `pnpm install --offline`
  (all 177 packages reused from the local pnpm store, zero downloads — genuinely offline), confirmed
  **GREEN** in the copy first (`tests 8 / pass 8`, including the T-036 test at 17ms), *then* applied the
  manifest's named single-hunk edit to `packages/engine/src/scribe/nodes.ts:923` (removed the speaker
  guard line), and re-ran: **RED**, and the assertion that fired is the named one — `T-030 (d)` and
  `T-036 independent oracle` both failed, the latter naming exactly
  `neg-speaker-01..06` disagreeing, `expected "review", engine said "verify"`, matching the manifest's
  pasted output exactly. Not an import/parse-error red. Also tested the non-vacuity guard directly: with
  the fixture emptied, the test fails on `"the fixture must not be empty (a vacuous oracle proves
  nothing)"` before ever running a row. Both capability-coverage rows are real.

## Judgment

**The wiring claim is true; the independence claim — the entire stated purpose of this unit
(ISS-t-030-rev-1) — is false, and the falsifying evidence is itself made of duplicated rows.**

ISS-t-030-rev-1 exists because a senior-software-engineer review found the T-030 property test's oracle
was "a transcription of the same regexes it tests… can only prove the code equals itself." This unit's
whole job was to replace that with rows judged only against B2/D-026's prose, never against what the
regex/code already accepts. Instead:

- The fixture (inherited from a prior session, `d4d2e49`, but the manifest asks me to judge whether it
  satisfies *this* unit's purpose, and the maker explicitly reviewed and kept it "unchanged" as "judged
  complete for this unit's purpose") reuses, byte-for-byte, sentences straight out of `nodes.ts`'s own
  doc comments (`"I scored 92 in my class 12 boards"`, `"I want to study in the UK"` at nodes.ts:515-517)
  and out of the *same test file's* pre-existing `T-030 (d)` probes and controls (`S1`, `S2`, `K1-K4`,
  the "controls" block) — the exact artifact this new block is supposed to be independent of.
- Worse, the six rows that carry this unit's entire falsification proof
  (`neg-speaker-01..06`, capability-coverage row 1) are not independently reasoned "spoken by the
  counsellor" sentences — they are the pre-existing golden `S1`/`S2` controls and four more
  already-known-positive strings, with only the speaker flag changed. That is precisely the failure mode
  named in ISS-t-030-rev-1: picking material already known to interact with the code a certain way, not
  authoring from the contract's prose. A leak in the *real* independent sense (a sentence an author who
  had never read `nodes.ts` would write) was never actually tested for these six rows, because they
  were not written that way.
- The new prose is not merely stale — it is a **new, specific, false claim**: the file header
  (lines 12-14) and the T-036 test block's own header (lines 638-642) both now say the fixture was
  "written from B2/D-026 wording… BEFORE reading the SPEC_* grammar above or the engine's templates in
  nodes.ts." That temporal/independence claim is directly contradicted by the duplicate text — whoever
  or whatever produced these 23 rows had, at minimum, already seen `nodes.ts`'s comments or the existing
  test file. This is not decoration; it is the load-bearing sentence a future reader (or the next
  checker) would rely on to trust T-036's verdicts. Per the checker brief's framing, this is exactly the
  "back-derived from what nodes.ts DOES" trap, not a shared-blind-spot coincidence — 23/102 exact string
  matches, all clustering around the unit's own headline capability, rules out coincidence.
- The two genuinely reworded passages the manifest also claims credit for (the `SPEC_DEGREE`/closure-check
  header and the `COUNTRY_SLOTS`/"transcribed from" comment, and the `t-030-template-gap.md` corrections)
  **are** accurate and no longer overclaim — verified in the diff. That partial correctness does not
  offset the new block's own overclaim, which is the unit's actual deliverable.

This is a FAIL of the unit's stated purpose, not a partial credit situation: "no leak found" and "102/102
agree" are not evidence of a sound oracle when a meaningful fraction of the oracle's rows — including
100% of the rows used to demonstrate it works — are the same golden material the prior oracle was
faulted for being.

I could not evaluate this at >80% confidence as a contract-invariant breach (B2 itself, and the
`assessFactForReview` guards, are unchanged and still correct on their own terms), so I am not filing it
as a B2 violation. It is a FAIL against this unit's own manifest claims and against ISS-t-030-rev-1,
which stays **open**.

## Capability coverage

| row | verdict |
|---|---|
| T-036 oracle is REAL and wired (falsifying edit at nodes.ts:923 turns it red naming the 6 speaker rows) | **Reproduced, TRUE** — green-before/red-after confirmed in an independently-installed throwaway copy; correct assertion fired. |
| Fixture cannot be silently emptied (row-count guard) | **Reproduced, TRUE** — emptied fixture fails on the explicit non-empty assertion before reaching any row. |

CAPABILITY-COVERAGE: 2/2 rows reproduced (both true as claimed) — but see EXPLANATION: the mechanism
being real does not make the fixture independent, and the row-2 "no leak found" conclusion is exactly
what a code-derived fixture would also show.

## Diff scope (step 4c)

Clean. Only the 4 files the manifest names; `nodes.ts` has zero diff; no deletions/renames of any
existing function, test, export or config key.

## Live browser

Not applicable — no UI surface touched (tests, a fixture, and manifest prose only). Confirmed against
the diff, not just the manifest's claim.

## Persona walk

Skip is correct — test-only unit, no UI surface, confirmed against the diff.

---

```
VERDICT: FAIL
SCOREBOARD: 0/1 criteria met (this unit's stated purpose — an oracle independent of nodes.ts, closing
ISS-t-030-rev-1 — not achieved), 2/2 invariants hold (the check is really wired; it cannot go vacuous)
FAILURES (if any):
- [ISS-t-030-rev-1 not closed] sev: high · 23/102 fixture rows, including all 6 neg-speaker rows used as
  the unit's own falsification proof, are byte-for-byte copies of sentences already in nodes.ts's
  comments and this test file's pre-existing T-030 probes/controls (base commit 19f75e2) · re-author the
  duplicated rows from B2/D-026 prose without looking at nodes.ts or the existing test file, or have an
  independent (non-authoring) reviewer confirm no row was picked because it was already known to pass ·
  issue: ISS-t-036-1
- [overclaim not fixed, contra manifest "What changed"] sev: high · the new file header (lines 12-14) and
  the new T-036 test block's own header (lines 638-642) both claim the fixture was written "BEFORE
  reading the SPEC_* grammar above or the engine's templates in nodes.ts" -- contradicted by the 23
  duplicate rows · reword to drop the false temporal/blind-authorship claim once the fixture itself is
  fixed · issue: ISS-t-036-1 (same root cause)
CAPABILITY-COVERAGE: 2/2 rows reproduced (mechanism real; see EXPLANATION for why this doesn't establish
independence)
LIVE-BROWSER: not-applicable (no UI surface; changed paths: packages/engine/tests/scribe-auto-verify-property.test.ts, packages/engine/tests/fixtures/auto-verify-oracle.jsonl, qa/manifests/t-030-template-gap.md, qa/manifests/t-036-independent-oracle.md)
ISSUES-WRITTEN: ISS-t-036-1
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: The new test is genuinely wired to the engine and cannot go vacuous -- both capability-coverage
rows reproduced clean in an independently pnpm-installed throwaway copy. But the unit's actual job was
independence, not wiring, and just under a quarter of the fixture (and 100% of the rows that make the
demonstration work) turn out to be the same golden sentences already sitting in nodes.ts's comments and
the pre-existing property test, with only the speaker attribute changed for the six that matter most. The
new prose doubles down with a specific, false "authored before reading the code" claim. ISS-t-030-rev-1
stays open; this unit does not close it.
```
