# HUMAN_GATE: U10 voice WebSocket, fix-cycle cap reached (opened 2026-10-19T06:03:39+05:30)
Question: U10 cycle 2 FAILed on checker B (C18). Allow one more fix round?
- C18: when the crisis utterance has no words of its own, the escalation carries an earlier UNANSWERED student turn (for example "what are the tuition fees in Germany") instead of the fixed marker (voice.ts ~683, seq adjacency). Probes P1 and P1c fail 3 of 3. Everything else passes: C1-C17 and C19, apps/api 146/146, db 88/88, providers 70/70, typecheck OK, 33 of 34 mutants killed.
- Also open (senior review medium plus checker B PROPOSED-ISSUE): a flag write that hits the 60 s deadline is treated as fenced, so there is no escalation and the student is ejected.
Options:
1. Allow cycle 3, folded into U10w (recommended). U10w already edits voice.ts for the review medium, on top of p1/u10. It adds the C18 fix (test first, from probe P1). The merged U10+U10w branch then gets ONE fresh blind dual check over U10 C1-C19 plus U10w's criteria. Voice stays off (VC_VOICE_ENABLED unset) until it passes.
2. Stall U10. Voice is not shipped in P1; U10w is stopped.
Blocks: U10, U10w (voice go-live).
Evidence: qa/verdicts/p1-u10-voice-ws.B.md on p1/u10, and D:/vc/qa/evidence/p1-briefs/p1-u10-c2-review-result.md.
