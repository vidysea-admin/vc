# gl-a-t059-promise-residuals

TASKS.md T-059. The promise floor (promisesOutcome, graph.ts ~:723-830) still misses these residual classes (qa/verdicts/s13-checker-final-5.md):
(1) idioms without punctuation: "Not only is admission guaranteed, it is fast", "Don't miss out guaranteed seats", "No risk guaranteed admission", "No hassle guaranteed visa", "No fees guaranteed admission", "No stress, no fuss guaranteed seat";
(2) generic negation of an unrelated verb: "We do not hide that admission is guaranteed", "I am not shy to say guaranteed admission";
(3) Hindi particle/idioms: "Aao na admission pakka hai", "Koi bhi aaye seat pakki hai", "Koi baat nahi guaranteed admission", "Koi fikar nahi admission pakka".
Also a decimal point must not count as a clause break ("There is no 99.9 percent guarantee" style; use a dot not followed by a digit).
TDD: append failing tests for all of the above, then fix IN PLACE: extend IDIOMATIC_NEGATION (not only, not just, don't miss, no risk/hassle/fees/stress/fuss/cost/tension/worry); a negator that governs an unrelated verb (hide, shy, hesitate, deny, doubt ... that) does not negate the guarantee; bare Hindi "na" is not a negator; "koi (baat|fikar|dikkat|chinta|tension) nahi" and "koi bhi" are not negations.
Every existing PROMISES, OBFUSCATED_PROMISES, C4A_IDIOM_PROMISES case must stay flagged and every NEUTRAL / OBFUSCATION_NEUTRAL case must stay neutral (list any that changes). Linear time: 20k hostile input < 50 ms.
Run engine student-graph + claims-guard + tsc via bash scripts/vc-testlock.sh. Report before/after and any changed neutral cases.
