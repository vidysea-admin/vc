# Senior review result — p1/u13b-wire @ 8f5395b: WARNING (no Block)
Clean: charge hook (no escape), Gemini refuses, refusals before ledger, cost bound, ISS-270..274, A14 NOT PROVEN honesty, no prod/student data access.
Must fix before push (repair cycle 1):
- M1 probes.ts scoreProbes / run-probes.ts realProbesBody: synthetic probe set (fixtures/probes.sample.json, 30 cases) can print A4 PASS. Return NOT PROVEN when set.source !== "recorded"; test with 30 synthetic cases.
- M2 run-probes.ts ~56: passage text = recorded /ask answer (`c.ask.answer ?? ""`), not KB text; empty passage citable. Use fixture retrieved-hit text; refuse the probe ("no passage text") when absent; drop dead `c.ask === "unavailable"` ternary.
- G1 (B13/D-100 guard): refuse --fixture/--cases/--experts with source "recorded" unless an explicit anonymised flag is set.
Lows: L1 run-kb.ts nearestRecordedSearch is a rewrite-fidelity proxy — label it so; Devanagari \p{M} split in words(). L2 run-latency A8 = model hop only — label verdict "model-hop only". L3 A14 blinding leaks via fixed texts/placeholder. Open: num_predict honoured by Ollama Cloud thinking models (needs one tiny real call).

## Repair cycle 1 review @ df77893: APPROVE
M1 (probes.ts:108-139, run-probes.ts:61-80), M2 (run-probes.ts:55-58), G1 (run-eval.ts:103, all 4 factories, before executeReal) fixed; no new false-PASS, no charge-hook escape, mock mode unchanged. 82/82 + tsc clean.
Residual lows: --golden JSONL has no source field so is unguarded by G1; bare-array --experts treated synthetic; excluded probes shrink total (recorded set >30 could PASS on scored subset, disclosed); num_predict on Ollama Cloud thinking models unverified; L3 A14 blinding leaks open.
