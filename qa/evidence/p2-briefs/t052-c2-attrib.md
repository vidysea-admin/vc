# Addendum 5: t-052 cycle 2, attribute every remaining RED before the next review (same rules as every earlier t052-c2 addendum)
Your E7 attribution (decisions rows 5-7 follow from plan-v2 3.9) is accepted as evidence. To stop one review round per newly found red, this task attributes every row that is still RED, so that a single fresh review can rule on all of them together.

## Task
Make no source or test edits. Work only in throwaway copies under the scratchpad, using vc-testlock.
1. For every still-RED row, record the mechanism, the source file:line and the plan hunk it comes from. Then classify it as one of:
   - (i) expected under the approved plan, turning green after a later approved packet (name the packet);
   - (ii) caused by 3.9's op-vs-timer identity, like rows 5-7;
   - (iii) another plan conflict;
   - (iv) environmental.
   The rows are 128-controls 5-7, 43/45/47/49, 64-66, 104-109, 119/120 and 127, plus decisions rows 5-7 and the T046/D055 pin rows.
2. For class (ii), show for each row whether option 1 (revise 3.9: op throws a fresh E while the timer keeps its own) would turn it green. Use a copy-only probe, and say what it does to AR-4/M39 and the A-b rows.
3. Write qa/evidence/t052-plan-20261016/attrib-c2.md: one table row per test row, followed by a short options section covering options 1, 2 and 3 from your last report. Commit it on main by pathspec. Put the logs under qa/evidence/t052-c2-p0/ with SHA256SUMS.

## Return
`ATTRIB t-052 <sha>` plus at most 6 lines: counts per class, and what option 1 would fix and break.
