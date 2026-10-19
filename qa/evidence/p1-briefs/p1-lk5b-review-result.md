# senior-software-engineer review result: p1-lk5b (15a7bdc), saved by the maker from the read-only report
VERDICT: Warning. lk5.test.ts 65/0. B1 word boundaries, case, hyphen forms, ordinals, "per cent" verified; B2 NFC compare correct; B3 gates keep dot variants, IDN hosts, e-mails; crisisGuard untouched.
- [medium] lang.ts ~223/~247 DOMAIN_RE: still quadratic whenever the text contains "." (sentences keep their terminal dot). Unbroken Devanagari + ".": 1999 chars 58 ms, 6001 437 ms, 18001 3.7 s, 36001 14.9 s. B3 test is dot-free so misses the hot path. Fix: start anchor (?<![\p{L}\p{M}\p{N}-]) on DOMAIN_RE + a test with a 2000-char and ~20k-char run ending in ".". Bounded today by the 2000-char claim cap.
- [low] not factual: "MAY deadline", "Half of applicants", "A dozen places", "a quarter of students", "Sept", "sterling", "decade".
- [info] over-matching ("one", "second", "won", "march", sentence-start "May") makes some encouragement lines English; safe by D-106.
