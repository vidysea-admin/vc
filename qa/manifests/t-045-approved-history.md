# Manifest — t-045-approved-history

**Contract:** qa/contracts/counselling-engine.md; contracts/counsellingcontract.md and ARCHITECTURE.md
**Goal task:** T-045
**Date:** 2026-09-30
**Fix cycle:** 0 of max 3 (new recovery unit, distinct from historical stalled cycle)
**Dual check:** required for privacy/authority; root orchestrator dispatches independent checkers
**Issues addressed:** approved-history authority, semantic summary withholding, leaf authorization/cancellation, saved disclosure gates and late-claim ownership compensation; no ledger closure claimed
**Base:** 60db37c
**Branch:** codex/b18-approved-history
**Bound root:** D:/vc/.worktrees/b18-approved-history

## What changed

- packages/engine/src/scribe/graph.ts: private invocation authorization, exact history snapshot/release/interrupt/saved-output gates; caller-owned deadline; bounded lease cleanup; original late claim promise/checkpoint continuity and own hash/token CAS compensation.
- packages/engine/src/scribe/nodes.ts: tenant-bound canonical approved-history loading; extraction/summary context; separate semantic verification with strict complete IDs/UTF-16 coverage; fail-closed withholding and private leaf/release authorization.
- packages/engine/src/scribe/schemas.ts: canonical approved context and strict semantic-verification envelope.
- packages/providers/src/index.ts: optional leaf preflight before actual execution; abort/deadline/failover preservation; typed nonretryable raw-free refusal; sanitized schema errors; deterministic controlled rules verifier.
- skills/fact-extraction/SKILL.md and skills/session-summary/SKILL.md: approved-history preservation and separate verification instructions.
- Existing engine/provider tests and evals/score.ts: explicit real tenant namespace fixtures, task-aware mocks, reached privacy/snapshot/semantic/deadline/late-erasure controls, preserved raw durable readback and retry oracles.
- apps/api/tests/server.test.ts: inject existing webhook fence failure at actual post-write readback, retaining durable-write/event/alert/gap assertions.
- apps/web/demo/seed.ts: one explicit synthetic tenant across both graphs and real Mongo saver; raw prefixed seeds; tenant+student readback; stored session identity; controlled canned verifier. No live/provider accuracy claim.
- packages/providers/tests/litellm.test.ts: preserve typed schema rejection while asserting sanitized issue envelope.

## How to verify

All heavy commands use the shared absolute mutex D:/vc/scripts/vc-testlock.sh. Installed third-party dependencies are immutable individual junctions; every @vc workspace import resolves to this checkout, never root workspace sources. No install or external provider operation.

From this root, use local node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 with every *.test.ts file in packages/engine/tests AND packages/engine/evals (36 files). Run each sibling's declared test file glob from its package cwd with ../../node_modules/tsx/dist/cli.mjs, including web *.test.tsx. Do not use root JSX config for web.

Run node node_modules/typescript/bin/tsc --noEmit -p each of: packages/db/tsconfig.json; packages/engine/tsconfig.json; packages/engine/evals/tsconfig.json; packages/engine/scripts/tsconfig.json; packages/observability/tsconfig.json; packages/providers/tsconfig.json; packages/schemas/tsconfig.json; apps/api/tsconfig.json; apps/web/tsconfig.json; mcp/student-profile/tsconfig.json; mcp/university-kb/tsconfig.json. Each must exit0.

Run python contracts/verify_contracts.py; interpret current vacuous research-phase result honestly.

Independently re-derive controls/mutants for tenant/student/purpose/consent, snapshot addition/removal/change/order, schema/range/ID completeness, multilingual/rephrased/injection summary questions, changed values and approval/raw history, abort at all graph-owned leaf gates, released-fence completed erasure, recreated checkpoint, own/newer-token CAS and observable read/undo failure. Maker examples are not model recall evidence.

## Actual outputs (maker only)

- Initial red77163:20 intended assertion failures. Cancellation/key order/raw marker red67082:3 failures. Snapshot red7450:4 failures. Saved disclosure reds10884/19253/50043 reached; early fence81831:4 failures; heldclaim6702:1 failure; lease28387:4 failures plus1 positive. Lost20316 UNKNOWN, never credited.
- Late erasure RED4c7d95:3/0pass/3fail/0cancel; strengthened7f4f57:7/0/7/0. Consolidated2036:72/66/6/0; fixed source classification + symmetric BSON snapshot artifact.
- Consolidated79936 terminal0:72/72pass/0fail/0cancel/0skip,17498.5979ms. Full log C:/Users/Lenovo/AppData/Local/Temp/b18-consolidated-20e924cf22864a95a27fbd179ad1c239.log.
- Full engine79385 terminal0:771 tests/726pass/0fail/0cancel/45skip,77524.1022ms. New separate consent collection read-failure control reached PASS. Full log C:/Users/Lenovo/AppData/Local/Temp/b18-engine-default-bc58675ea6f1452f8b8ffbe95af5f8d5.log.
- All11 configs19996 actual compiler exit0 individually; diagnostic-copy helper emitted null-path warnings, not compiler errors. Status log C:/Users/Lenovo/AppData/Local/Temp/b18-typechecks-f0d72aabaef5422e97935e4ec0cbc4df.log.
- Sibling95161: db252/252; schemas61/61; observability59/59; student MCP12/12; university MCP29/29, all exit0/no cancel/skip. Index C:/Users/Lenovo/AppData/Local/Temp/b18-sibling-index-d2e8c3b262b84c31b9901ce355706cf0.log. Provider/API/web failures subsequently repaired under independent bounded approval. Root-config web JSX failures were harness errors, uncredited.
- Correct-package-cwd affected62730: providers60/60/0; API46/46/0; web38/38/0, no cancel/skip. Index C:/Users/Lenovo/AppData/Local/Temp/b18-affected-index-90816a8aaab1405e98b24c7394ffcf88.log. Web type exit2 only three raw seed tenant annotations; existing intersection type-only repair.
- Affected web type97866f terminal0 after annotation repair; log C:/Users/Lenovo/AppData/Local/Temp/b18-web-type-40206662082b450cbe3603ce87259e5e.log.
- Contract verifier67c5d1 exit0: verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity. This certifies no runtime contract semantics.
- Loader isolation26847 exit0: @vc/db/provider/schema/observability actual local source exports; root-installed third-party sources only. No wholesale root node_modules workspace junction.

## Live browser evidence

SKIP — no browser/server/audio/live-model operation was run in this bounded offline maker unit. Package-local demo/UI tests verify synthetic persisted approval/rejection/fence/crashed-winner/Retry bindings; they do not certify live student delivery. Independent checker must assess this UI-touching demo fixture and remaining browser requirement explicitly.

## Scope limits

No dedicated doNotAsk/destination policy/live cards/voice/avatar/application completion. Historical T03955 asserted/11 quarantined fixture truth and skips preserved. Canonical approved values/source retained; absent counsellor-edit provenance remains separate B2 work. No production DB/provider/network/push/deploy/env operations. No semantic model accuracy/full goal PASS claimed. Source-only reviews are not independent runtime verdicts.

## Frozen SHA256 file inventory
- apps/api/tests/server.test.ts SHA256=ed6510dbbe93e7c1fb62a1c174d1cf4884d520ede67560bd1b7f158a9b59d7cf
- apps/web/demo/seed.ts SHA256=4f99abcb97ca33057bc17b04bdb56fc0f8f3e3b14ea17f867df62ccffad0ea2c
- packages/engine/evals/score.ts SHA256=8e2120ee1535d883aa03a45ae215f98b7dfe2064be4c5c490957fea5b5d8788c
- packages/engine/src/scribe/graph.ts SHA256=b90ce562dd4345b082f1afa2ae6a32b04b1de6182ec9083b1656144b028a8009
- packages/engine/src/scribe/nodes.ts SHA256=cd60c386737d9de7006aa9b4b154137871d9478cd50a041638a458f8a852db9d
- packages/engine/src/scribe/schemas.ts SHA256=a6f1c96acad886091ee0e6fe373b486e1d654d005c6ed5008da7b55ff38d9178
- packages/engine/tests/b18-suppression-outcome.test.ts SHA256=104b06c42408ee8b65714a335d92c3ab30010b453dc83d9a6573194f2343d6a4
- packages/engine/tests/scribe-checkpointer.test.ts SHA256=8558b7bab1555be126eec608ca55bfc0456953cfcdc150ed0421db463d551251
- packages/engine/tests/scribe-concern.test.ts SHA256=f40aa68780450591546d6f5f744c61f3da64442e5e91ef207963a7e09c18a2f7
- packages/engine/tests/scribe-erasure-fence.test.ts SHA256=033891a9ac8c873920febc453c12adb496339abbbb82039a30d881bc5a5d12e6
- packages/engine/tests/scribe-fixtures.ts SHA256=1e8042d90e2521fe3936f244892e152d81cc1e3d5ecd6ed65040ae54b5c60706
- packages/engine/tests/scribe-per-fact.test.ts SHA256=185e004abb5c5c16ca780302b7e40c821a92395a1d238f713ae25ba266fbc32a
- packages/engine/tests/scribe-persistence.test.ts SHA256=fd9b2c00171234e2319f3de34b1131c86f08d0502eb497ba6bb0d54ad2b1e99a
- packages/engine/tests/scribe-rules-e2e.test.ts SHA256=db078958895be84accf6c874fa2a0e7f2c7197cd1e0c6f9c42016038b23474f4
- packages/engine/tests/scribe-tracing.test.ts SHA256=f442bbc248836318ba12f101e204ffc5b0f41a57520a53ecffea0f0418f6b419
- packages/engine/tests/scribe.test.ts SHA256=c61cf9264fa2d7604aeb9be91d69775006266b8164e45c4dd8e0ceb8eac0ac90
- packages/providers/src/index.ts SHA256=61384b211e8cd02bc85fa5164cfe4bd325862071945ea0de91ebf04cfbde078b
- packages/providers/tests/index.test.ts SHA256=fa3514e5bfd3b3cf691b50eadba82c0ce14b2031f45201c63f5c0124819fa320
- packages/providers/tests/litellm.test.ts SHA256=fee7d8adce99e65b30ccc5d086a0625fe8d8cfdc6c8b19d6322da4826e57fbff
- packages/providers/tests/rules.test.ts SHA256=ec0ef663eca9385a5f48307d4a93248bec8f11dea71c20a403a66a785ad4f6f7
- skills/fact-extraction/SKILL.md SHA256=226ac150452ec061b8efa296eae02d09c0a3bc7db83ac059e9c5d9d8502481ba
- skills/session-summary/SKILL.md SHA256=d75ca9005ce8e1581b94fbb3ce79b26fc50737ba2610b1149b19d9f4d7b7e257

## Status: ready-for-check
