# HUMAN_GATE batch: plan 2026-10-25 decisions (asked once, maker recommended defaults)
Opened: 2026-10-25T06:48:16+05:30
Source: plan in chat 2026-10-25 (fact passes qa/evidence/plan-20261025/fact-{A,B,C}.md)
Q3 data_boundary pass@ false positives: (a) regex exclusion / (b) widen D-011 note
Q6 delegation: Claude-only / external delegation allowed (ISS-058)
Q7 counsellor Hindi voice-input STT (B17): (a) browser SpeechRecognition / (b) server STT
Q8 B18 destination relevance: in pilot / after pilot
Q9 erasure vs undelivered webhook_outbox (ISS-t-034-de-2): (a) fix: deliver or hold before delete / (b) keep VC_ERASURE_AUTO_DELETE off, document gap
Answered: 2026-10-25T06:48:16+05:30 — Q3 (a) regex exclusion for the pass@ URL fragment — Umesh chat 2026-10-25 "go with the recomemended ones"
Answered: 2026-10-25T06:48:16+05:30 — Q6 Claude-only; no qa/delegation-ledger.jsonl — Umesh chat 2026-10-25 "go with the recomemended ones"
Answered: 2026-10-25T06:48:16+05:30 — Q7 (a) browser SpeechRecognition for the pilot — Umesh chat 2026-10-25 "go with the recomemended ones"
Answered: 2026-10-25T06:48:16+05:30 — Q8 after pilot; destination-relevance gap stays documented — Umesh chat 2026-10-25 "go with the recomemended ones"
Answered: 2026-10-25T06:48:16+05:30 — Q9 (a) fix: erasure must not drop undelivered outbox events (deliver or hold, then delete) — Umesh chat 2026-10-25 "go with the recomemended ones"
