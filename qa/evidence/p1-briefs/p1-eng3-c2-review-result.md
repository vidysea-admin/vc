# Senior review result: eng3 fix cycle 2 (0cc886c..ba4e2bf), 2026-10-19

VERDICT: Warning (no Block). The cycle-1 Block is fixed.

- Differential grid of 1773 inputs through base 559a421, c1 and c2: 0 rows lost from c1 to c2. All 600 rows that c1 lost are crisis again. 168 rows that were base-crisis are c2-none, and all of them are intended study-object suppressions. A fuzz of 1590 1/l/i variants found 0 drops.
- Medium (recall, product call under D-020): study suppression does not give way to later distress words when there is no punctuation. These are none or concern at c2 and crisis at base: "i dont see the point in continuing college i hate myself", "...continuing with my studies, I hate myself", "...continuing college, I'm worthless", "...continuing the course because everything hurts", "...continuing the course of my life" (the life word sits outside the 4-token window). Fix: fire when a hard distress token appears later in the clause, or widen the window.
- Low: "going onwards" is now none (the word-end lookahead). Low perf: matchPointContinuing splits a slice per match, which is quadratic (210k chars take 4.4 s; the 8000-char API cap bounds it to about 6 ms). Low, carried over from c1: LEET_BEFORE_LETTER is quadratic on a long digit run (bounded to about 0.2 s by the cap); fix with a lookbehind.
- Sound: matchPointContinuingPunctuated is linear, the normalise/foldText split preserves behaviour, and the "ll" fold is additive. Tests changed +39/-0.
- Checks: engine guard-crisis + crisis-defaults 403/403. Probes are in scratchpad/eng3c2rev/.
- Follow-up: the medium and the lows become ledger rows. The medium goes at the top of Candidates as priority: safety, because eng3 is at its fix-cycle cap of 2.
