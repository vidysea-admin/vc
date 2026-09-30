# T049 retained main additions — awaiting explicit authorization

Status: pending-user-answer
Asked once: 2026-10-01, current chat asynchronous question.
Authority: C:/Users/Lenovo/.codex/AGENTS.md:57 requires explicit creation authorization; routine quality-plan approval is already satisfied.

Concrete artifact: D:/vc/.worktrees/b1-recovery/node_modules/.b1-verification/frozen-candidate-cycle1.patch
SHA256: BB859974CCC1496433C0B8FC08797990C4B4108BDF19475204EC2F6900800C92
Primary bounded PASS: refs/qa/t049-checker-cycle1 -> 5326b199e2f4acfec537e20ac2b3c03010294515
Secondary bounded PASS: refs/qa/t049-checker-b-cycle1 -> 52ac236e5f744e12722cb16ecaf932592cd34cdc
Current-main git apply --check: actual exit0; patch has not been applied.

Exactly twelve absent paths:
- packages/engine/src/cards/graph.ts
- packages/engine/src/cards/index.ts
- packages/engine/src/cards/nodes.ts
- packages/engine/src/cards/relevance.ts
- packages/engine/src/cards/schemas.ts
- packages/engine/src/cards/verifier.ts
- packages/engine/tests/cards-eval.test.ts
- packages/engine/tests/cards-fixtures.ts
- packages/engine/tests/cards-graph.test.ts
- packages/engine/tests/cards-verifier.test.ts
- qa/evals/cards-eval.jsonl
- skills/exploration-planner/SKILL.md

Scope: restore/create these exact reviewed files, plus the seven already reviewed existing-file seams in the nineteen-path patch. No whole failed branch merge, production write, deployment or provider call. Live delivery, model efficacy and T050 actual feedback remain open.

Answer pending; do not infer authorization from elapsed time. Continue T047 and other independently available goal work. Do not ask this gate again.
