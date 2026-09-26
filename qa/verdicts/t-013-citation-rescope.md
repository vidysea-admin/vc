# Verdict — t-013-citation-rescope

**Cycle checked:** 0
**Date:** 2026-09-26
**Checker:** fresh Claude subagent (Mode A unit check), bound to `D:/vc/.worktrees/t-013-citation-rescope`
**Authority:** docs/DECISIONS.md D-020, qa/gates/citation-guarantee-scope.md, contract B2 (as amended 2026-09-26), B3, B15, B20
**Base commit for diff scope:** 6f32318 (merge-base main wave/t-013-citation-rescope); unit HEAD 30f3316

## What I re-ran myself

- `pnpm -r typecheck` / `pnpm -r test` — not re-run in the bound tree (read-only rule); instead re-ran the
  full `packages/db` (200/200) and the T-013 unit test file (16/16, 17/17 combined with the case-drift eval)
  in a **throwaway copy** (`robocopy` mirror of the worktree excluding `.git`, outside `D:/vc`, `pnpm install --offline`
  to relink). All green, matching the manifest.
- `pnpm --filter @vc/engine eval:scribe --provider={case-drift,perfect,fabricator,lazy}` — re-run myself in the
  copy. Numbers match the manifest exactly: case-drift and perfect both 24/24 kept (10 verified / 14 needsReview /
  0 reasoning), 0 fabricated-verified in every mode including fabricator (0 kept). **T-009 golden-set requirement
  confirmed independently.**
- All 4 manifest "Capability coverage" rows, reproduced myself in the throwaway copy (not the manifest's own
  in-worktree run — see FAILURES): every BEFORE/AFTER pass count and the exact reddened test names match the
  manifest byte-for-byte (17/17→13/4 isolating case-drift+smart-quotes+third-party tests; 16/16→15/1 isolating only
  'new britain'; 16/16→15/1 isolating only the standalone reasoning-bypass test; 50/50→48/2 isolating only the two
  'gets an explains edge' tests). Reverts confirmed byte-identical.
- A checker-authored `applyApprovedDiff` + erasure + export probe against the real `@vc/db/testing` driver-faithful
  fake (not in the manifest): confirmed the new `explains` KG edge (a) is **not duplicated on an identical replay**
  of the same decision+sessionId (LangGraph checkpoint-retry idempotency, extending the existing contentHash/
  deriveEdgeId discipline to this new edge kind), (b) is **hard-deleted with read-back zero** by
  `requestErasure`/`confirmErasure`/`executeErasure`, and (c) **is included in `exportStudent`'s facts+edges**
  before erasure. This exceeds the manifest's own coverage and PASSES.
- My own hostile-input suite against `verifyCandidateFact`/`assessFactForReview` (throwaway copy): "usability",
  "canadaville", "indiana", "new south wales", "UKG class", Devanagari यूके, "25" inside "2025", "1.5" vs "15",
  and a ₹-formatted amount all behaved correctly (stayed `needsReview`, none fabricated-dropped). **Negation did
  not** — see FAILURES.
- `git diff 6f32318..30f3316 --stat` + full diff — matches the manifest's "What changed" list; the two rewritten
  pre-existing tests (`score-case-drift.test.ts`, `scribe-per-fact.test.ts`) were explicitly anticipated by T-013 in
  their own prior comments/docstrings, confirmed by reading both diffs in full. No unlisted file touched, no
  existing export/function/test deleted without a matching contract reason.
- Diff confirms **no `apps/web` file changed** — Mode D not required; the manifest's "not UI-touching" claim holds.

## SCOREBOARD

7/9 contract items evidenced clean; 2 fail (B2 auto-verify precision on negation; the D-020 transcript-persistence
"already satisfied" claim). Every capability-coverage row and the T-009 recall requirement are independently
confirmed. Requirement 4 (KG edge) exceeds its own manifest with outcome-level idempotency/erasure/export proof.

## FAILURES

- **[B2 / D-020]** sev: **critical** · A negated country mention auto-verifies as if affirmed: `verifyCandidateFact`
  with `value:"UK"` cited to the turn `"UK nahi, Canada jaana hai."` returns `needsReview:false`; same for
  `value:"USA"` cited to `"Not united states, I want Canada."`. `assessFactForReview` (nodes.ts:268-320) checks only
  a fixed third-party-noun lexicon, never any negation cue. This is exactly the class of case the dispatch named
  ("my cousin is in the UK" negation-adjacent) and the contract's own bar ("Any wrong fact that ends up `verified`
  is a FAIL") — a wrong value reaches `verified` here. Fix direction: a bounded negation-cue check
  (no/not/never/nahi/mat), same shape as `hasThirdPartyMarker`, forcing `needsReview` on a hit. issue:
  ISS-t-013r-c0-1.
- **[B2 / D-020]** sev: high · The third-party "at minimum must not verify" guarantee is bypassed by (a) a bare
  pronoun with no lexicon noun present (`"He is in the UK, not me."` → `needsReview:false`) and (b) a Hindi/Hinglish
  kinship word absent from the English-only `THIRD_PARTY_MARKERS` set (`"Meri behen UK mein hai abhi."` →
  `needsReview:false`), in a product whose own golden set is full of Hinglish/Devanagari sessions. issue:
  ISS-t-013r-c0-2.
- **[D-020 requirement 5 / B15]** sev: high · The manifest's "confirmed already satisfied, no code changed" claim
  for full-transcript persistence does not hold on the READ/EXPORT side. `exportStudent`'s `checkpoints` field
  (erasure.ts:1213-1217, 1243-1247) is **count-only** (`{threads, checkpointDocs, writeDocs}`), never the turn text;
  `SessionDoc` carries no transcript field, only an LLM-generated `summary`; no code path anywhere decodes a
  LangGraph checkpoint back into readable turns for a counsellor or a DPDP subject-access request. Hard-delete +
  read-back zero for the checkpoint collections IS independently confirmed (erasure.test.ts, re-run green) — only
  "a counsellor can later read it" and "export includes it" (in a usable form) are unsupported as claimed. issue:
  ISS-t-013r-c0-3.
- **[process]** sev: medium · The manifest's own capability-coverage falsifications were run in the live bound
  worktree and reverted ("not a copy"), which the checker brief and protocol both flag as a violation, even though
  each revert was verified byte-identical. Conclusions are not in doubt (I independently reproduced all 4 rows in a
  proper throwaway copy with identical numbers) — this is a process finding, not a correctness one. issue:
  ISS-t-013r-c0-4.
- **[process]** sev: low · Manifest dated 2026-09-26 has no `Persona walk:` line (protocol 5bb). Not blocking — the
  unit is not UI-touching. issue: ISS-t-013r-c0-5.

## CAPABILITY-COVERAGE

4/4 rows reproduced by the checker in a throwaway copy (own reproduction, not a re-read of the manifest's):
citation-location normalised-tier recovery, the closed-vocabulary exclusion of bare "britain", the
reasoning-fact-always-needsReview bypass, and the `explains` KG edge — every BEFORE/AFTER count and isolated test
name matches the manifest exactly. Plus one checker-added row beyond the manifest's four (idempotent replay +
erasure/export of the `explains` edge), also green.

## LIVE-BROWSER

not-applicable (changed paths: `mcp/student-profile/src/index.ts`, `packages/{schemas,engine,db}/**`,
`skills/fact-extraction/SKILL.md`, `qa/**` — no `apps/web` path in `git diff 6f32318..30f3316 --stat`).

## ISSUES-WRITTEN

ISS-t-013r-c0-1 (critical), ISS-t-013r-c0-2 (high), ISS-t-013r-c0-3 (high), ISS-t-013r-c0-4 (medium, process),
ISS-t-013r-c0-5 (low, process). Also updated: ISS-t-007-rev-2 → `fixed` (verified as a genuine side effect of this
unit, T-009 case-drift recall independently re-measured at 24/24 / 0 false drops).

## EXECUTOR

claude-sonnet-subagent (manifest's own Executor: claude-sonnet-subagent — schema/db-write unit, never delegated;
self != executor holds trivially since I am not the tool that built this).

## VERDICT

**FAIL** — two contract-relevant correctness gaps reach a wrong `verified` state or an unsupported "satisfied"
claim (negation bypass, transcript-export completeness), even though the unit's own stated scope (T-009 recall,
the four claimed capabilities, the closed-vocabulary hostile negatives it did test) is fully and independently
confirmed. This is a rescope done well within the scope it chose to test — the gap is that the chosen auto-verify
mechanism (whole-word match + a narrow third-party noun lexicon) is not yet the full "at minimum" guarantee D-020
asked for, and requirement 5's "no code needed" claim overreaches what the export code actually does.

```
VERDICT: FAIL
SCOREBOARD: 7/9 criteria met, capability-coverage 4/4 (+1 checker-added) reproduced
FAILURES:
- [B2/D-020] sev: critical · negated country mention auto-verifies (needsReview:false) instead of staying flagged · add a bounded negation-cue check (no/not/never/nahi) forcing needsReview on a hit · issue: ISS-t-013r-c0-1
- [B2/D-020] sev: high · third-party guard bypassed by bare pronoun ("He is in the UK, not me") and by Hindi/Hinglish kinship terms ("meri behen") absent from the English-only lexicon · extend THIRD_PARTY_MARKERS with Hinglish kinship terms and reconsider a bounded pronoun signal · issue: ISS-t-013r-c0-2
- [D-020 req.5/B15] sev: high · "transcript persistence already satisfied" overreaches: export only counts checkpoint docs, no readback path exists for a counsellor or DPDP export · add a checkpoint->turns readback exposed via export/counsellor UI, or get explicit sign-off on a narrower reading · issue: ISS-t-013r-c0-3
- [process] sev: medium · capability-coverage falsifications run in-worktree-then-revert, not a throwaway copy (protocol violation; conclusions independently reproduced and confirmed correct) · issue: ISS-t-013r-c0-4
- [process] sev: low · manifest missing required Persona walk: line (not blocking, non-UI unit) · issue: ISS-t-013r-c0-5
CAPABILITY-COVERAGE: 4/4 rows reproduced (+1 checker-added: explains-edge idempotent replay + erasure/export)
LIVE-BROWSER: not-applicable (no apps/web path in the diff)
ISSUES-WRITTEN: ISS-t-013r-c0-1, ISS-t-013r-c0-2, ISS-t-013r-c0-3, ISS-t-013r-c0-4, ISS-t-013r-c0-5, ISS-t-007-rev-2 (updated to fixed)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: T-009 recall (24/24, 0 fabricated-verified), all 4 claimed capabilities, and the diff scope are independently confirmed exactly as claimed — this rescope genuinely fixed ISS-t-007-rev-2 and closed the specific hostile cases (new britain, bank of america, my cousin is in the UK) it set out to close. It FAILs because the auto-verify mechanism the brief asked me to attack (negation, pronoun/Hinglish third-party bypass) is not yet closed, and because requirement 5's "no code change needed" claim is stronger than what exportStudent actually returns (a count, not the transcript). Fix cycle 1 should add a bounded negation check and either a transcript readback or an explicit narrower re-scope of D-020's requirement 5, signed off by Umesh.
```
