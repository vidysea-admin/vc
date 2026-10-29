# S13 final checker, cycle 3: re-check of fix round C (2026-10-29)

A fresh read-only senior-software-engineer ran this check; it did not write either fix. The main session saved the verdict.

**VERDICT: WARNING.** Fixes C1 and C2 work as written, with no defect above medium.

## Suites
- engine student-graph + claims-guard: 172/172
- api voice-history, voice-wiring, voice-audit and partner-voice: 88/88
- `tsc --noEmit` exits 0 for both engine and api.

## C1: promise filter (`graph.ts:723-797`)
- **Hostile lists:** the checker's own lists had 79 promises and 45 neutral or negated phrasings. Every variant from the cycle-1 FAIL is now caught.
- **Initials and abbreviations:** 0 false positives on initials, lists or grades ("A. P. J. Abdul Kalam", "I I T", "I E L T S", "a, b, c").
- **False negatives (low, out of scope):**
  - fragmented chunks (`gu aran tee d`)
  - `/` and `,` separators
  - leetspeak and typos (`gu4rantee`, `guaranty`)
- **False positives (low, fail closed):** "nobody can guarantee", "none can guarantee this", "anyone claiming 'guaranteed visa' is a scam" and "assured by the office" are flagged. `NEGATION_BEFORE` at `:736` lacks nobody, none and anyone claiming.
- **Speed:** linear, at most 7.8 ms. Input is sliced at 20k characters (`:756`).
- **Display:** the text shown to the student is unchanged; the filter returns only a boolean.

## C2: voice readout attribution (`readoutOutputSeen`, `voice.ts`)
- A bare earlier `turn_complete` no longer arms the answer. The real readout still arms it, and the early-yes and S12 tests pass.
- No path leaves the flag stuck true or stuck false.
- **Residual (medium-low): reproduced in a scratch test.**
  - The sequence: earlier-turn assistant output arrives after the readout is dispatched, then that turn's `turn_complete`.
  - Together these arm the answer early; the fact was decided before the readout was spoken.
  - The window is narrow, because `sendText` normally interrupts generation.
  - There is no repo test for this sequence yet.
