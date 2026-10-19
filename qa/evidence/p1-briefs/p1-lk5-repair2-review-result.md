# p1-lk5 repair-2 senior review result (diff e71c8f4..983c773). Saved by the maker; the reviewer is read-only.

VERDICT: Block. The lk5 tests pass 58/0, but direct probes of `localizedClaimOk` show the localized text even when it states a fact that differs from the English claim.

- **[high] Hinglish has no unit, currency or period check.** lang.ts:464-474.
  - "5 saal" shown for "5 months"; "300 rupaye" for "300 euros"; "20 pratishat" for "20 euros"; "3 karod" for "3 lakh".
- **[high] Unit swap goes unseen when the figure is in non-ASCII digits.** lang.ts:226-229, claims.ts:339.
  - Shown: "५०० dollars" for "500 euros"; "€५००"; "5०० euros"; "५०%".
- **[medium] Unmapped number words are dropped, so the leftover can equal the English figure.**
  - Shown: साढ़े तीन लाख (3.5 lakh) for 300000; आधा लाख for 100000; "saade teen lakh"; "pachhis hazaar".
  - Plural magnitudes (हज़ारों/लाखों) get through; "एक यूरो" gets through.
- **[medium] Country check gaps.**
  - Countries outside the list: तुर्की, ग्रीस.
  - Hinglish names: amrika, jarmani.
  - Invisible characters inside a name: "Ger\u200Bmany"; fullwidth Latin letters.
- **[medium] Link check gaps.**
  - Invisible characters inside a host: ZWSP or a soft hyphen ("evil\u200B.test").
  - A path added to a host the English names: "example.com/phish-login".
- **[low-medium] Quadratic regex cost.** About 1-2 s of CPU per claim at the 2000-char cap. Not exponential.
- **[low] Vulgar fractions and superscripts are not read as figures:** "10½", "10³".

Maker assessment: this is a whack-a-mole parity design. Every cycle closes one class of holes and the next review finds another. The fix-cycle cap is used up, so the next step is a brief rewrite with a simpler design, or a hold. HUMAN_GATE: qa/gates/lk5-localized-claims.md.
