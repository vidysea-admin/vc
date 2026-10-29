# Tool-first re-review, fix round 1: data-engineer (2026-10-29)

**Verdict: Warning**

## Prior findings
1. **Keep-last-good: fixed** (admin-routes.ts:816-822, :870-871; hostile cases pass).
   - [medium] There is no force or acceptShrink path. A legitimate refactor, or a file that stays oversize, blocks the catalogue forever.
   - [low] skippedServices does not gate the sync.
2. **Provenance: fixed.** The commit and tree sha are in data.source, and a moved branch triggers a re-read.
3. **Edge verification: partly fixed.**
   - [medium] verified is true for model-only edges. The honest count is 40, not 56.
4. **next_due: fixed.** end_date is a date column, compared with an IST date. All-overdue gives NULL (disclosed).
5. **Quest owner mapping: correct.** studentId is a string, and the test student has profile 1, goals 0, activities 0.

## Tests
| Suite | Result |
|---|---|
| admin-sync | 48/48 |
| ingest | 62/62 |
| port | 73 pass, 1 skip |
