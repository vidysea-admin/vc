# HUMAN_GATE: how LK5 shows facts in a Hindi or Hinglish reply
**Opened:** 2026-10-19T22:40+05:30 (maker, after the cycle-2 senior review Block; see qa/evidence/p1-briefs/p1-lk5-repair2-review-result.md)
**Status:** OPEN

**Question:** the check that compares a translated fact against the English one keeps leaking (Hinglish units, mixed digits, unlisted words, invisible characters). How should LK5 handle facts?

**Options:**
- **(a) Recommended: facts stay in English, everything else is translated.**
  - The conversational reply and the follow-up question are shown in Hindi or Hinglish. Any sentence that carries a figure, a unit, a link or a country is shown in its English wording.
  - The rule is small and closes every class of hole, with no word lists. Indian students already read mixed Hinglish naturally.
- **(b) Strict fallback.**
  - A localized reply is shown only when neither the English text nor the translation contains any digit, number word, unit, link or country. Otherwise the whole reply is English.
  - Safer than today, but it still needs the word lists, and most replies about fees or durations fall back to English.
- **(c) Hold LK5.**
  - Ship without Hindi replies for now. The English replies (LK1/LK4/LK1w/LK6) are already live.

**Blocks:** LK5 only. Everything else is shipped.
**Answer format:** "a", "b" or "c", relayed by Umesh. The maker appends `Answered: <ISO> - <choice> - Umesh in chat` and then dispatches a rewritten brief (a or b) or closes LK5 as held (c).
