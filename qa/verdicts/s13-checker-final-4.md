# S13 final checker, cycle 4: re-check of fix round C3 (2026-10-29)

A fresh read-only senior-software-engineer ran this check. The main session saved the verdict.

**VERDICT: WARNING.** C3b holds. C3a regressed: its warning-context suppression causes medium false negatives.

## Suites
- engine student-graph + claims-guard: 174/174
- api voice (4 files): 91/91
- `tsc --noEmit` exits 0 for both.

## C3a (`graph.ts:748-750`): medium, regression
`WARNING_SENTENCE`, `CALLED_SCAM_AFTER` and `INDEFINITE_NEG_CLAUSE` suppress real promises. Examples that are no longer flagged:
- "Avoid other agents, we offer guaranteed admission"
- "Scam alert: we sell guaranteed admission"
- "Guaranteed admission - the rest are fake"
- "Nobody can stop you and your admission is guaranteed"

Of the checker's 35 promises, 20 were missed: 14 because of C3a and 6 that predate it.

**Decision (main):** revert C3a in place, back to the cycle-3 fail-closed behaviour. Over-flagging a warning is safer than missing a promise.

## Pre-existing `NEGATION_BEFORE` (`:736`): medium-low
Idioms such as "No worries", "Don't worry", "No scam", "Not a scam" and "Koi tension nahi" cancel a real promise. Fix: exempt these idioms.

## C3b (voice): holds
- The cycle-3 repro no longer decides.
- `interrupted` closes the earlier turn.
- No state leak across repeat, extraction, confirm or close.
- **Residual (low-medium):** a reply whose first output arrives after dispatch is indistinguishable from the readout. Fixing it needs a provider turn id.
- **Residual (low, fail closed):** with merged turns the readout stays disarmed until the next model turn.
- **Open:** fixed crisis audio sets `assistantTurnOpen` (`voice.ts:1181`). It is unverified whether a `turn_complete` follows; if none does, the next readout's own `turn_complete` is consumed without arming.
