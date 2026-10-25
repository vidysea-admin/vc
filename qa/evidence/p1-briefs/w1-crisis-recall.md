# Build brief: w1-crisis-recall (/maker build subagent)

**Slug:** w1-crisis-recall. Follow every rule in qa/evidence/p1-briefs/w1-common-rules.md, and read it first.

- **Tier:** L (student safety guard).
- **Dual check:** no. Record the reason in the manifest: this unit is a safety-recall change, not a security, auth, tenancy or prod-write change.
- **Authorized by:** D-112 (Umesh, 2026-10-25).
- **Scope:** crisisGuard keeps its fixed-message behaviour, and only its recall widens. Benign false positives must not rise.

## Read first
- `qa/issues.jsonl` rows ISS-t-012-rev-4, ISS-381, ISS-185 and ISS-194. Also read ISS-340: it is already fixed, and it shows the D-103 pattern to follow.
- `packages/engine/src/guards/crisis.ts`.
- `packages/engine/tests/guard-crisis.test.ts`, `crisis-eval.test.ts` and `qa/evals/crisis-eval-heldout.jsonl`.

## Acceptance

**R1 (ISS-t-012-rev-4): measure recall before and after.**
- Measure the heldout crisis recall on current main BEFORE you change anything. Record the exact number and the command.
- Measure it again after your changes, and record both numbers in the manifest.
- If recall is below 0.95, fix the misses that are Hindi, Hinglish or English variants, within R2/R3 scope.

**R2 (ISS-381): Tamil and Bengali script.**
- Crisis phrases written only in Tamil script or only in Bengali script are flagged. These are self-harm or suicide-intent phrases, at least 5 per script, written as test fixtures.
- At least 20 benign Tamil and Bengali sentences are not flagged.

**R3 (ISS-185, ISS-194): spelling variants.**
- The spelling variants named in those rows are flagged, along with common Hinglish misspellings of the same phrases.
- The existing benign grid keeps 0 false positives (today 0 of 71 benign Devanagari sentences are flagged).
- The 280-row recall grid has 0 drops.

## Regression
- `guard-crisis.test.ts` and `crisis-eval.test.ts`.
- Every engine test file that imports crisis.ts. Find them with `git grep -l guards/crisis packages apps`.
- The apps/api chat crisis tests.
