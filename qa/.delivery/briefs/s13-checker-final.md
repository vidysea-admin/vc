# s13-checker-final

Independent final check of S13 fix rounds A and B (uncommitted worktree, D-136). Prove the outcome, not the construction, with your own hostile tests:
- crisis: the helpline is always returned with 200 under memory_changed, lease lost and consent withdrawn mid-turn, and nothing is stored when consent is gone
- erase vs the marker race leaves no residue
- retry and replay never double-count usage or gaps
- the partial index definition
- the discardProposal historyAfter $max never lowers a real cutoff
- voice consent armed only after the readout's turn_complete, so an early yes is ignored
- the promisesOutcome floor: try 30+ English/Hinglish promise phrasings incl. obfuscations (g u a r a n t e e d, 100 %, pakka), and 20 neutral or negated phrasings for false positives; 5000-char linear time
- Gemini usageMetadata reaches onUsage, and unset role keys change nothing
- isServedAsk malformed input
- canonicalPreferenceKey in voice
- the 1 s frame TTL never lets a decision or output boundary skip revalidation
Run: packages/db (chat-threads, student-store, erasure, facts, db-init), apps/api (the six chat files, the voice* files, main, index, partner-voice, anonymous-route), packages/engine (student-graph, claims-guard, lang, routing-probe), packages/providers; tsc for each. Use the vc-testlock; long waits are normal (a full-suite run may hold it). End with VERDICT: PASS or VERDICT: FAIL.
