# t057-c6-sensitivity - C6 memory: keep facts Gemini labels sensitivity "normal"

Status: ready-for-check
Fix cycle: 0
Policy-Version: proportional-verification/2026-10-19.17
Tier: M (shared engine schema + LLM skill prompt)
Round: 1 (est 15 min; 3 files)
Dual check: no (no security/auth/tenancy/prod-write trigger: schema validation of model output only)
Base: 6651819d  Candidate: dfb0f8cc
Authority: docs/demo-contract.md C6 (D-124); found by the local browser walk run 7 (2026-11-01)

## Defect
Walk run 7b step08 c6-confirm FAIL ("no proposed fact appeared in the widget memory panel"); API log
`fact_extraction_all_dropped` x2. Live Gemini repro (scripted walk sentence, no student data) 3/3 runs: every
candidate dropped, zod issue `sensitivity invalid_enum_value`; the model's label was "normal" 4/4.

## What changed (in place)
- packages/engine/src/scribe/schemas.ts `CandidateFactSchema.sensitivity`: z.preprocess trims/lowercases strings
  and maps "normal" -> "medium" (never "low": only low facts feed the external KB query, cards/nodes.ts:135,
  per ai-engineer review). Other labels still fail the enum -> dropped as malformed.
- skills/fact-extraction/SKILL.md: output shape now states `sensitivity` is exactly "low"|"medium"|"high".
- packages/engine/tests/student-fact-extractor.test.ts: new test "t057 run7 c6 ...".

## Tests
Tests[C6]: packages/engine/tests/student-fact-extractor.test.ts "t057 run7 c6" + tests/scribe*.test.ts (importers of CandidateFactSchema).
Pre-check[C6]: dfb0f8cc `cd packages/engine && node --import tsx --test tests/student-fact-extractor.test.ts tests/scribe*.test.ts` -> 211 pass, 0 fail; `pnpm -r --filter @vc/engine exec tsc --noEmit -p .` -> 0
Other affected: engine loader/b18/evals providers 109 pass 0 fail (45 live skips); providers rules 11/11; api chat-profile+voice 140/140.
Falsification[C6]: the new test ran RED before the schema edit ("sensitivity \"normal\" must not drop the fact"), GREEN after.

## Browser evidence (local, not committed: qa/evidence/t057 is gitignored)
Run 7c (normal->low interim version): 10/11 OK, c6-confirm OK, c6-new-thread-recall OK; only C5 FAIL (KB, external).
Run 7d (final normal->medium version): see qa/evidence/t057-demo.md once written.

## Reviews
senior-software-engineer: Approve (gap: assert kept label -> added). ai-engineer: Warning -> addressed by mapping to
"medium" not "low"; residual: no deterministic sensitive-topic floor and no labelled-sensitivity eval (Candidates).
