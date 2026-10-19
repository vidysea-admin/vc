# Read-only summary — legal sign-off (B13) + every pending human sign-off in D:/vc. No edits.
Read: qa/gates/g-publish.md, nights.md, crisis-escalation-consent.md, p1-u0-amendment-signatures.md, g-real.md, g-prod.md, real-transcripts-gemini.md, plus the B13 legal-review document(s) (find them: git -C D:/vc grep -il "B13" -- docs qa/contracts | head; and the go-live checklist docs/go-live-checklist.md). Also qa/issues.jsonl rows ISS-279 and ISS-300.
Return, in plain short English for a non-lawyer owner:
1. B13: what exactly the legal reviewer must sign (each clause/claim in one line), what is already drafted, who must sign (lawyer vs owner), and where.
2. A table of every OPEN sign-off/gate: file, the question, the recommended default written in the file, whether the thing it signs is already validated (cite the checker PASS verdict path in qa/verdicts/ if one exists, else "not validated"), and whether an owner (non-lawyer) can legally sign it.
3. For nights.md: what the "minimal liability" option is among the listed options.
Final message only, at most ~70 lines.
