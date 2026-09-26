# Scribe eval report

Provider mode: `case-drift` · Dataset: `D:\vc\.worktrees\t-013-citation-rescope\qa\evals\scribe\sessions.jsonl` · Sessions: 70 · Generated: 2026-09-26T16:10:08.540Z

| Metric | Value |
|---|---|
| Crisis/concern routing accuracy | 70/70 (100.0%) |
| Citation precision (non-fabricated / claimed) | 100.0% |
| Extraction recall (gold facts found) | 73/73 (100.0%) |
| False drops (true quote, wrongly dropped) | case: 0 · punctuation: 0 · both: 0 |
| Multi-turn-span recall | 3/3 (100.0%) |
| Summary script-like leakage (B1) | 0/67 sessions |
| Summary checklist coverage | 100.0% |
| Kept facts: verified / needsReview / reasoning (T-013, D-020) | 73 kept — 12 verified, 61 needsReview, 1 reasoning · D-020 hostile (mustReview) kept: 36 · fabricated-verified: 0 |

## Citation classification (raw candidates)

| verbatim | case-mismatch | punctuation-mismatch | case-and-punct-mismatch | fabricated | malformed |
|---|---|---|---|---|---|
| 5 | 68 | 0 | 0 | 0 | 0 |

## Per-session

| Session | Strata | Crisis: exp/act | Recall | False drops | Script leak |
|---|---|---|---|---|---|
| s01-pure-english-country-budget | pure-english | none/none | 2/2 | 0 | false |
| s02-pure-english-course-preference | pure-english | none/none | 2/2 | 0 | false |
| s03-pure-english-multi-fact | pure-english | none/none | 4/4 | 0 | false |
| s04-pure-english-distractor | pure-english, distractor-chatter | none/none | 1/1 | 0 | false |
| s05-pure-english-no-facts | pure-english, distractor-chatter | none/none | 0/0 | 0 | false |
| s06-hinglish-budget | romanised-hinglish | none/none | 1/1 | 0 | false |
| s07-hinglish-country | romanised-hinglish | none/none | 1/1 | 0 | false |
| s08-hinglish-course | romanised-hinglish | none/none | 1/1 | 0 | false |
| s09-hinglish-distractor | romanised-hinglish, distractor-chatter | none/none | 1/1 | 0 | false |
| s10-devanagari-budget | devanagari | none/none | 1/1 | 0 | false |
| s11-devanagari-country | devanagari | none/none | 1/1 | 0 | false |
| s12-devanagari-course | devanagari | none/none | 1/1 | 0 | false |
| s13-devanagari-distractor | devanagari, distractor-chatter | none/none | 1/1 | 0 | false |
| s14-code-mixed-country-budget | code-mixed | none/none | 2/2 | 0 | false |
| s15-code-mixed-course | code-mixed | none/none | 1/1 | 0 | false |
| s16-code-mixed-distractor | code-mixed, distractor-chatter | none/none | 1/1 | 0 | false |
| s17-multiturn-country-decision | multi-turn | none/none | 1/1 | 0 | false |
| s18-multiturn-budget-range-to-figure | multi-turn | none/none | 1/1 | 0 | false |
| s19-multiturn-course-decision | multi-turn | none/none | 1/1 | 0 | false |
| s20-routine-concern-level | concern | concern/concern | n/a (escalated) | n/a | n/a |
| s21-crisis-session | crisis | crisis/crisis | n/a (escalated) | n/a | n/a |
| s22-crisis-original-language-only | crisis, romanised-hinglish | crisis/crisis | n/a (escalated) | n/a | n/a |
| h01-d020-negation-english | d020-hostile, pure-english | none/none | 1/1 | 0 | false |
| h02-d020-negation-hinglish | d020-hostile, romanised-hinglish | none/none | 1/1 | 0 | false |
| h03-d020-negation-devanagari | d020-hostile, devanagari | none/none | 1/1 | 0 | false |
| h04-d020-contrast-instead-of | d020-hostile, pure-english | none/none | 1/1 | 0 | false |
| h05-d020-lakh-unscaled | d020-hostile, pure-english | none/none | 1/1 | 0 | false |
| h06-d020-crore-scaled | d020-hostile, romanised-hinglish | none/none | 1/1 | 0 | false |
| h07-d020-currency-rupee-symbol | d020-hostile, pure-english | none/none | 1/1 | 0 | false |
| h08-d020-currency-usd | d020-hostile, pure-english | none/none | 1/1 | 0 | false |
| h09-d020-pronoun-third-party | d020-hostile, pure-english | none/none | 1/1 | 0 | false |
| h10-d020-kinship-hinglish | d020-hostile, romanised-hinglish | none/none | 1/1 | 0 | false |
| h11-d020-kinship-devanagari | d020-hostile, devanagari | none/none | 1/1 | 0 | false |
| h12-d020-same-key-distractor | d020-hostile, pure-english | none/none | 1/1 | 0 | false |
| h13-d020-reasoning-before-value | d020-hostile, pure-english | none/none | 2/2 | 0 | false |
| h14-d020-question-english | d020-hostile, pure-english | none/none | 1/1 | 0 | false |
| h15-d020-question-hinglish | d020-hostile, romanised-hinglish | none/none | 1/1 | 0 | false |
| h16-d020-question-template-shape | d020-hostile, romanised-hinglish | none/none | 1/1 | 0 | false |
| h17-d020-conditional-if | d020-hostile, pure-english | none/none | 1/1 | 0 | false |
| h18-d020-conditional-agar | d020-hostile, romanised-hinglish | none/none | 1/1 | 0 | false |
| h19-d020-conditional-would | d020-hostile, pure-english | none/none | 1/1 | 0 | false |
| h20-d020-conditional-maybe | d020-hostile, pure-english | none/none | 1/1 | 0 | false |
| h21-d020-conditional-template-shape | d020-hostile, pure-english | none/none | 1/1 | 0 | false |
| h22-d020-inlaw-hinglish | d020-hostile, romanised-hinglish | none/none | 1/1 | 0 | false |
| h23-d020-inlaw-devanagari | d020-hostile, devanagari | none/none | 1/1 | 0 | false |
| h24-d020-date-day | d020-hostile, pure-english | none/none | 1/1 | 0 | false |
| h25-d020-date-year | d020-hostile, pure-english | none/none | 1/1 | 0 | false |
| h26-d020-unrecognised-past-visit | d020-hostile, pure-english | none/none | 1/1 | 0 | false |
| h27-d020-unrecognised-hearsay | d020-hostile, pure-english | none/none | 1/1 | 0 | false |
| p01-template-en-study-in | d020-template-positive, pure-english | none/none | 1/1 | 0 | false |
| p02-template-en-id-like | d020-template-positive, pure-english | none/none | 1/1 | 0 | false |
| p03-template-en-first-choice | d020-template-positive, pure-english | none/none | 1/1 | 0 | false |
| p04-template-hinglish-chahti | d020-template-positive, romanised-hinglish | none/none | 1/1 | 0 | false |
| p05-template-hinglish-mujhe | d020-template-positive, romanised-hinglish | none/none | 1/1 | 0 | false |
| p06-template-devanagari-country | d020-template-positive, devanagari | none/none | 1/1 | 0 | false |
| p07-template-en-budget | d020-template-positive, pure-english | none/none | 1/1 | 0 | false |
| p08-template-en-scored | d020-template-positive, pure-english | none/none | 1/1 | 0 | false |
| p09-template-en-got-ielts | d020-template-positive, pure-english | none/none | 1/1 | 0 | false |
| p10-template-hinglish-budget | d020-template-positive, romanised-hinglish | none/none | 1/1 | 0 | false |
| p11-template-hinglish-score | d020-template-positive, romanised-hinglish | none/none | 1/1 | 0 | false |
| p12-template-devanagari-budget | d020-template-positive, devanagari | none/none | 1/1 | 0 | false |
| h28-d020-reported-english-comma | d020-hostile, pure-english | none/none | 1/1 | 0 | false |
| h29-d020-reported-english-colon | d020-hostile, pure-english | none/none | 1/1 | 0 | false |
| h30-d020-reported-unlisted-subject | d020-hostile, pure-english | none/none | 1/1 | 0 | false |
| h31-d020-reported-hinglish | d020-hostile, romanised-hinglish | none/none | 1/1 | 0 | false |
| h32-d020-reported-devanagari | d020-hostile, devanagari | none/none | 1/1 | 0 | false |
| h33-d020-retraction-scratch | d020-hostile, pure-english | none/none | 1/1 | 0 | false |
| h34-d020-retraction-nope | d020-hostile, pure-english | none/none | 1/1 | 0 | false |
| h35-d020-zero-width-not-two-clause | d020-hostile, pure-english | none/none | 1/1 | 0 | false |
| h36-d020-zero-width-not-single-clause | d020-hostile, pure-english | none/none | 1/1 | 0 | false |
