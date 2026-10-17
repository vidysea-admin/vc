# T049 exact additions — approved; restoration pending

Status: answered — exact restoration authorized by current-chat approved plan, D-079
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

Answered: 2026-10-16 — Umesh explicitly approved the combined plan, including creation/restoration of these exact twelve reviewed paths and their reviewed existing-file seams, and instructed goal execution. Authority: current chat01a13e75-26ed-7893-ad85-abc47efe2502, D-079. Validate current patch/base identity and complete independent acceptance before integration; full failed-branch merge, production writes and deployment are not authorized by this gate.
