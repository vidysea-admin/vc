# s13-fix-c1-promise-obfuscation

The S13 final checker FAILED one check (qa/verdicts/s13-checker-final.md). promisesOutcome at packages/engine/src/student/graph.ts:743 (normaliser near :744) lets obfuscated guarantees through: "g u a r a n t e e d", "g-u-a-r-a-n-t-e-e-d", "gua­ranteed" (soft hyphen), "ɢuaranteed" (small-cap G, U+0262), "1 0 0 %  sure", "Visa is 100 percent".
TDD: first append a failing test with these 6 plus the variants "g.u.a.r.a.n.t.e.e.d", "g_u_a_r_a_n_t_e_e_d", "g*u*a*r*a*n*t*e*e*d", "gua⁠ranteed". Then fix IN PLACE in promisesOutcome:
- strip U+00AD, U+2060, U+180E in addition to the existing zero-width set; NFKC-normalise and fold common confusables (at least U+0262 -> g, plus any small-cap/fullwidth letters NFKC does not fold that appear in the guarantee/pakka/sure patterns).
- collapse runs of >= 3 single letters/digits separated by space . - _ * into one token; also collapse spaced digits before % ("1 0 0 %" -> "100%"). Match patterns against both the collapsed and the plain text.
- treat "100 percent" like "100%" in the existing 100% pattern.
Keep zero false positives: append a test that these stay FALSE: "admission is not guaranteed", "guarantee nahi hai", "Rest assured, I will help", "Absolutely, you can apply", "I am not sure", "a b c d", "Class 1 0 results", "100 percent of the fee is refundable only per policy - check the site" (if this last one trips the existing 100% rule today, leave it out and say so). Keep matching linear: append a 20,000-char hostile input test (e.g. "g u ".repeat) that finishes under 50 ms.
Run: the engine student-graph test file + claims-guard test file, and tsc --noEmit for packages/engine, through scripts/vc-testlock.sh if it exists. Report before/after results with file:line.
