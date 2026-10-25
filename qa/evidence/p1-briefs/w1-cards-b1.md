# Build brief: w1-cards-b1 (/maker build subagent)

**Slug:** w1-cards-b1. Follow every rule in qa/evidence/p1-briefs/w1-common-rules.md. Read that file first.

- **Tier:** L (live cards guard).
- **Dual check:** no, unless your diff touches auth, tenancy or prod-write. Record the reason in the manifest either way.
- **Scope source:** D-029 (approved SPLIT). Integrate the passing scope of T-010 and open a fresh B1. Do not treat this as a fourth fix cycle.

## Read first
- The T-010 row in `qa/QUEUE.md`.
- D-029 in `docs/DECISIONS.md`.
- `qa/manifests/t-010-live-cards.md` and `qa/verdicts/t-010-live-cards*.md`, to see which 11 of the 13 criteria passed and which failed.
- `qa/issues.jsonl` row ISS-t-010-c0-1.
- Branch wave/t-010-live-cards: run `git log main..wave/t-010-live-cards`.
- Branches codex/b1-recovery and codex/b18-approved-history are reference only. Do not merge them.

## Acceptance

### K1: integrate the passing T-010 scope
- Put the passing T-010 scope (cards graph, verifier, relevance, and the rest of that scope) on your branch, on top of current main.
- Every criterion test that passed in the T-010 verdicts must be green again.
- Leave out the B18 relevance half (ISS-t-010-c0-2). It is a later unit.
- If integrating needs a conflict resolution in any file outside `packages/engine/src/cards/**` and its tests, stop. Return BLOCKED with the list of files.

### K2: B1 fix (ISS-t-010-c0-1)
- An imperative or script-like sentence that only ends in "?" is never shown as a question card.
- The QUESTION_TYPES checks are semantic, not punctuation-only.
- Tests:
  - At least 10 imperative phrasings that end in "?" are rejected, in English and Hinglish.
  - Genuine questions are accepted.

## Regression
- Every packages/engine test file under cards and guards.
- The cards eval.
- tsc for packages/engine.
