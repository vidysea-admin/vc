# p1-lk5 senior review (read-only reviewer; saved by maker) — VERDICT: Warning
Diff d057b13..090b558. lk5.test.ts 34/34.
Sound: screen ordering (finish awaits screen graph.ts:656; screen never rejects concern-classifier.ts:411-417); lang.ts fallbacks; crisisGuard first.
Findings:
- M1 medium lang.ts:238-246 + graph.ts:714-735: localized claim not run through English claim guards; spelled-out numbers, swapped country, English-as-hi-Latn all accepted (probe true x4).
- M2 medium graph.ts:811-814: violatesCrisisRules checks English message before localized swap; priorFlag student's shipped localized reply unchecked.
- M3 medium graph.ts:731: localized follow-up skips noScriptGuard, countriesIn, findPersonalIdentifiers that safeFollowUp applies (699-705).
- L1 low graph.ts:640,815,681 vs 656: counters/gap record written before screen; "possible" leaves "answered" + "crisis" both counted.
- L2 low graph.ts:747: rewrite uses deps.provider (answer-grade) not cheap chain.
Open: apps/api not wired (inert in prod); fail-closed on classifier outage = every authed turn shows crisis message (no breaker); anonymous screen OFF pending Umesh.
Test gaps: spelled numbers/country in localized; no "answered" on possible; priorFlag localized; localized follow-up with country/PII.
