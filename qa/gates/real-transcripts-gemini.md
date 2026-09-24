# Gate: real-transcripts-gemini (contract B13)
**Opened:** 2026-09-25 (checker, ahead of T-009)
**Question:** Can the real counselling transcripts in `D:/ikigai_counsellor/transcripts/` be sent to Gemini as eval
fixtures?
**Blocks:** T-009 (golden-session eval set).

Answered: 2026-09-25, Umesh in the checker session, verbatim: "yes anonymise is better but okay with second also".
Resolution:
- **Default:** anonymise first. Remove names, schools, cities, phone numbers and emails before any transcript is
  copied into the repo or sent to Gemini.
- **Fallback, approved by Umesh:** unanonymised transcripts from `D:/ikigai_counsellor/transcripts/` may go to Gemini
  when anonymisation would destroy the signal an eval needs. Each such use must list the exact files in the unit's
  manifest.
- Raw transcripts are never committed to the repo in either case.
