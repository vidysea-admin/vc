# Verdict — t-002b-schema-hardening

**Cycle checked: 0**
**Date:** 2026-09-25
**Checker:** fresh Claude Sonnet subagent (no builder context), bound to
`D:\vc\.worktrees\t-002b-schema-hardening` (branch `wave/t-002b-schema-hardening`)

## What I re-ran myself

- `pnpm install` — exit 0, lockfile unchanged (already up to date).
- `pnpm -r typecheck` — exit 0, all 7 workspace packages "Done".
- `pnpm -r test` — exit 0, 49/49 pass (42 schemas + 2 engine + 5×1 stub), matching the manifest.
- `python contracts/verify_contracts.py` — exit 0, "PASS by vacuity".
- `git diff --stat 4290c6d a180142` (unit diff scope per dispatch) — 16 files, additions/edits
  only: 7 `package.json` files, `packages/engine/package.json` + its test, `packages/schemas/`
  src (guards.ts, schemas.ts) + 4 test files (1 new: `fact-source.test.ts`), `pnpm-lock.yaml`
  (+4 lines), the manifest. No deletions or renames of any existing function/export/test. Matches
  the manifest's claim exactly.
- `git diff --stat main -- pnpm-lock.yaml` — `1 file changed, 4 insertions(+)`, matches claim.
- Grepped the unit diff for key/secret-shaped strings (api key, mongodb+srv, sk-, AIza, etc.) —
  none found. Unit did not touch `.env` or any secret-bearing file, so B11 is not applicable here.
- Re-derived the exact reviewer strings for ISS-008 directly against `CardSchema` in
  `card.test.ts` (already present, all pass) and against `isScriptLike` itself.

## Capability coverage — 5/5 rows independently reproduced

Ran all 5 rows myself in my OWN throwaway copy (`%TEMP%\claude\d--vc\...\scratchpad\checker-copy`,
`tar` from the worktree excluding `.git`/`node_modules`, `pnpm install`), never in the worktree.
Confirmed green-before (full suite 49/49) before starting, applied each single-hunk edit named in
the manifest, confirmed red-after, reverted, confirmed diff-clean against the worktree before the
next row:

- ISS-007 (exports/types removed) → `packages/engine/tests/index.test.ts` reddens with
  `ERR_MODULE_NOT_FOUND` at tsx's resolver. Matches manifest.
- ISS-008 (refine call loses `card.type`) → exactly the 3 type-dependent rows redden
  (evidence-not-script, challenge-not-script, compare-statement-parses); the
  definitive-tag-question and widen/clarify rows stay green in the same run. Matches manifest.
- ISS-009 (`kb.fetchedAt` made optional) → exactly `kb: missing fetchedAt is rejected` reddens,
  the other 3 `kb:` rows stay green. Matches manifest.
- ISS-010 (`validFrom` relaxed to `min(1)`) → exactly the `'banana'` row reddens, the `validTo`
  rows stay green. Matches manifest.
- ISS-011 (`Card.id` removed) → exactly the two ISS-011 rows redden; the ISS-007 cross-package
  test (which happens to omit `id`) stays green as the manifest predicted (extra key stripped).
  Matches manifest.

All 5 rows are real isolating falsifications, not wrong-reason failures. Copy left diff-clean
against the worktree.

## New finding — B1 false negative beyond the reviewer's 3 strings

The dispatch asked for extra hostile `isScriptLike` strings and said a new false negative on an
obvious recital is FAIL-worthy under B1. I ran probes via `tsx` importing directly from the
**worktree's own** `packages/schemas/src/guards.ts` (read-only execution, no edit to the
worktree):

```
isScriptLike("Tell them LSE is the right choice.")                                  -> true   (control, correct)
isScriptLike("Say the international office deadline is March 1.", "evidence")       -> false  (expected true)
isScriptLike("You must tell the student their application is rejected.", "evidence")-> false  (expected true)
isScriptLike("tell the student to apply now.", "evidence")                          -> false  (expected true)
isScriptLike("This is DEFINITELY your best option, right?", "widen")                -> true   (control, correct)
```

Root cause: `compare`/`challenge`/`evidence` card types skip the "ends with `?`" check entirely
(by design, per ISS-008's fix — they're allowed to be statements), so a missed recital cue is
their **only remaining defense**. That defense is a fixed, case-sensitive substring list
(`RECITAL_CUES.some(cue => trimmed.includes(cue))`), which misses: (a) the cue appearing
lowercase mid-sentence ("Tell the student" the constant vs "tell the student" in the probe), and
(b) plain imperative recital forms that aren't the literal `"Say:"` / `"Say to"` substrings (e.g.
"Say the deadline is March 1."). This is a real gap in the B1 no-script guard for exactly the
three card types that ISS-008 widened to allow statements — filed as
`ISS-t-002b-schema-hardening-1`, severity high.

## Criteria judged (per dispatch: B1, B2, B4, B5, B8)

- **B1 (no-script): FAIL.** The guard and tests correctly cover everything the manifest claims
  (reviewer's 3 strings + definitive-tag-question), but the statement-type bypass has an
  unguarded gap demonstrated above — a script-like recital can pass as an evidence/challenge/
  compare card's prompt.
- **B2 (cited facts): met.** `FactSourceSchema` discriminated union enforces per-type required
  fields (quote+turnId / id+fetchedAt / id / id); `Card.sources` still `min(1)`. Verified via
  `fact-source.test.ts` (12/12) plus my own ISS-009 falsification.
- **B4 (consent first): met, unchanged.** `purposeTags.min(1)` and the minor/guardianConsent
  refine are untouched by this unit and still pass (`fact.test.ts`, `consent.test.ts` rows all
  green). No session-level enforcement exists yet at this schema-only stage — consistent with
  prior units, not a regression introduced here.
- **B5 (typed boundaries): met, unchanged.** Every shape in `schemas.ts` is a Zod schema; no
  free-text field was introduced or removed by this unit.
- **B8 (data boundary): met.** All new/changed tests are offline unit tests over Zod schemas —
  no Mongo, no network, no real student data. `data_class: synthetic` holds.
- **B11 (secrets):** not applicable — this unit touched no `.env`/secret-bearing file (confirmed
  by diff-scope + grep above).

## Issues ledger

Flipped `open → fixed`: ISS-007, ISS-008 (as originally scoped — the 3 reviewer strings),
ISS-009, ISS-010, ISS-011 — each verified by my own independent reproduction, not the maker's
pasted output. New: `ISS-t-002b-schema-hardening-1` (open, high, contract-B1).

## Live browser

Not applicable. Confirmed from diff scope (4290c6d..a180142): only `package.json` metadata, Zod
schema source, and `.test.ts` files under `packages/schemas/` and `packages/engine/` changed. No
`apps/web` or any browser-reachable surface touched.

---

```
VERDICT: FAIL
SCOREBOARD: 4/5 criteria met, 0/0 invariants hold (contract has no [I*] items)
FAILURES:
- [B1] sev: high · isScriptLike false-negatives on obvious recitals for compare/challenge/evidence
  card types (case-sensitive cue match misses lowercase mid-sentence recitals; fixed cue list
  misses plain imperative "Say the X is Y." forms) — these types have no "?" fallback, so this is
  their only defense and it is bypassable · fix: case-insensitive/normalized cue matching + widen
  cue coverage, or add a secondary signal for statement-type cards · issue: ISS-t-002b-schema-hardening-1
CAPABILITY-COVERAGE: 5/5 rows reproduced
LIVE-BROWSER: not-applicable (changed paths: package.json×7, packages/schemas/src/{schemas,guards}.ts, packages/schemas/tests/*, packages/engine/{package.json,tests/index.test.ts}, pnpm-lock.yaml)
ISSUES-WRITTEN: ISS-t-002b-schema-hardening-1 (new, open, high); ISS-007/008/009/010/011 flipped to fixed
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: All 5 claimed capabilities (ISS-007..011 as originally scoped) are real and independently
reproduced by the checker in its own throwaway copy — every verify command and every manifest claim
about them checks out exactly. The unit FAILs on B1 only because the checker's own hostile probing
(explicitly requested by the dispatch) found a related, previously-undiscovered false-negative gap
in the same isScriptLike function this unit modified: statement-type cards (compare/challenge/
evidence) have no "?" fallback and their sole remaining defense — a fixed, case-sensitive recital-cue
list — misses plainly obvious recitals. This is a new finding (ISS-t-002b-schema-hardening-1), not
a regression of anything the manifest claimed to fix.
```
