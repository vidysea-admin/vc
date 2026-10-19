# eng3 ai-engineer review result (2026-10-18): Warning, no Block
- **W1 [medium, false positive]** crisis.ts, about hunk line 141: the "see the point in continuing / going on" pattern fires on study talk. "I don't see the point in continuing with my IELTS prep" returns crisis. Fix: require life or living as the object, or drop continuing / going on.
- **W2 [medium, recall, C1 'kms']** DISTANCE_AFTER contains from, per, range and far, so "I wanna kms from all this stress" returns none. Fix: suppress only when a number or quantity word precedes kms.
- **I1 [low, recall]** LEET_MAP has no 1 -> l, so "ki11 myself" and "kil1 myself" return none. Fix: add a second fold.
- **W3 [low, wording]** the stress note does not invite the student to talk. This is a candidate, not a defect.
- **Info:**
  - claims.ts "starting 2027" vs "from 2027" gives a false reject;
  - Hindi numbers are not multiplied ("paanch hazaar" stays 5 and 1000, not 5000);
  - the stress note repeats on every stressed turn.
  All of these fail closed.
- **Sound:**
  - the ISS-126 bounded() catch;
  - the graph follow-up filter;
  - no-quote (+91);
  - no ReDoS;
  - Devanagari and leet recall confirmed for the probed phrases.
- **Probe scripts:** scratchpad/eng3probe.ts and eng3b.ts.
