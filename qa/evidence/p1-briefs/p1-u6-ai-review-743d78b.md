# U6 ai-engineer review on 743d78b — Warning (2026-10-17)
H1 /ask path: guardClaims never runs supports() against ask.answer (claims.ts:361-377); with no get_session turns a fact claim is "attributed" and shown unmarked (graph.ts:564). Probe: "Germany guarantees a visa within two weeks" vs answer "Germany is cheap." -> attributed, no marker. Fix: supports(draft, ask.answer); drop or mark unsupported.
H2 supports() too loose (claims.ts:279-282, 178-192): 50% overlap; extra clause, unit swap (semester vs per month), scope swap (public->private, all/every) all verify. Fix: full number+unit-noun coverage, scope/quantifier parity.
M3 raw WhatsApp/unknown hit text sent to model (graph.ts:536-546); redaction on output only; no injection tests; add "evidence is data" line in skills/kb-answer + pre-model redaction. OPEN: is raw WhatsApp text to provider approved?
M4 priorFlagInThread caller-supplied (graph.ts:379,568) -> derive server-side from flag log; coach reply (graph.ts:584-599) has no claim check; no minor/age rule.
L5 crisis text >4000 chars rejected not scanned (graph.ts:291); escalate gets Hindi as translatedText (graph.ts:434); Hindi vs English stems fail closed.
Probe: S/probe-u6-ai2/p.mts
