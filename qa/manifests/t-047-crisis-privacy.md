# Manifest — t-047-crisis-privacy

**Status:** checked-PASS (verdict qa/verdicts/t-047-crisis-privacy.md + t-047-crisis-privacy.b.md, cycle 0)
**Goal task:** T-047
**Contract:** qa/contracts/counselling-engine.md (B13/B16/B21), ARCHITECTURE.md, root docs/plan.md independently approved T047 reconciliation and budget/D016 refinements
**Fix cycle:** 0 of max 3
**Dual check:** required; root dispatches fresh independent completion checkers
**Base:** 7100f62581c6897e1b8f82a4777985f40e5c218e
**Source commit:** ec48857b95c20a18faabe4aedd24ca61f0e354a3
**Branch:** codex/t047-crisis
**Bound root:** D:/vc/.worktrees/t047-crisis

## What changed and contract mapping

Every deterministic crisis without consent takes a strict runtime-validated guard_only path containing identifiers and fixed flags only. Ordinary no-consent inputs return the fixed refusal. Both avoid personal session/transcript/history/checkpoint/model/tracing processing; necessary consent/fence authority reads remain. All detected crisis turn IDs are included. Consented behavior and T045 private history/snapshot authority and T046 exact actor/ALS/winner/recovery remain covered by defaults.

Existing functions changed in place: graph.ts startScribe:585, readOutcome:429, escalateSessionFlags:730, inspectScribe:1144; schemas.ts ScribeResultSchema:326; concern-classifier.ts ClassifyDeps/classifyConcern:277; escalation.ts EscalationDeps, fencedWrite:205, notifyAll:258, escalateTurns:318, runReview:438; API index.ts startup/options, server.ts start route/current verified tenant createTenantWiring:865, openapi.ts actual nested outcome projection. Five existing engine test files and existing API server test file carry controls/oracle corrections. No new source/helper/functions/schema files.

Classifier and review deadlines are captured once before first authority read. All leaf authorization/model retries share the classifier deadline. Review expiry includes the existing classifier allowance plus existing effective bounded writer allowance; annotation, recipient resolution, authority and fallback share its remaining budget. Genuine E3/E3b timeout/outage can fail open inside that original reserved review budget with current authority. Explicit cancel, typed leaf refusal, authority loss or review expiry cannot publish new output. Prior flags remain except actual erasure. Four ownership-qualified compensators preserve original driver settlement/token CAS and observable raw-free cleanup failures.

D016 repair catches only the initial consent-read FencedWriterDeadlineError. Existing fence postcheck is app bounded by its canonical backstop; held/unreadable fence is fail-safe minimal fenced; unfenced rethrows the original deadline. No new invoke/provider budget or checkpoint cleanup on this early path.

API startup validates classifier setup before connection and binds a trusted recipient factory only to verified JWT tenant identity. Body fields cannot grant authority. Default notifications are unrouted record_only records, not proof of transport delivery.

## Verification commands and environment

Offline synthetic fake DB/JWT/loopback only. No .env, installs, external providers, production, publishing or push. Cached individual third-party junctions; all @vc imports local to this checkout. Consumer loader proof ca951a resolved local db/providers/schemas/observability exports100/29/36/6. Shared D:/vc/scripts/vc-testlock.sh with trusted elevated process visibility and Git usr/bin PATH serializes heavy work.

Engine package cwd: node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/*.test.ts evals/*.test.ts
API package cwd: node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/*.test.ts
Each of eleven configs: node node_modules/typescript/bin/tsc --noEmit -p <config>, from checkout root. Configs: packages/engine/tsconfig.json; packages/engine/evals/tsconfig.json; packages/engine/scripts/tsconfig.json; packages/db/tsconfig.json; packages/providers/tsconfig.json; packages/schemas/tsconfig.json; packages/observability/tsconfig.json; apps/api/tsconfig.json; apps/web/tsconfig.json; mcp/student-profile/tsconfig.json; mcp/university-kb/tsconfig.json.

## Reached maker evidence

- Initial RED53871:5/0pass/5intended privacy failures, zero cancellations/skips. TEMP/t047-initial-red-72e10d6f83614c209e1544905173f6ed.log.
- Typed refusal/nonresurrection RED801f23:3/1pass/2 intended failures; ordinal final-fence control not credited as RED. TEMP/t047-repair-red-72aa73c50cc8440c95982ce2f966ae90.log.
- Real postwrite final-fence REDd19359:1/0/1 reached failure; TEMP/t047-final-postcheck-red-4cc5a48301e44da28ec7e0d5632d2008.log.
- Valid held-provider explicit cancel REDc96a04:1/0/1 reached failure. Earlier asynchronous MockProvider schema failure is not cancel proof. TEMP/t047-valid-cancel-red-3e1a0615bdec4ef991e8f87742198481.log.
- Focused53168 engine14/14, API9/9; three engine configs0. API type mismatch repaired inside approved callback types; a1a6e1 both API type and9controls0 despite wrapper typo exit1, not rerun-only credit.
- Broad83426:809/759pass/5fail/0cancel/45skip. Four independently approved exact test corrections; D016 retained as actual source regression, original oracle unchanged.
- Focused46848 terminal0:8/8/0fail/0cancel/0skip. Includes E6/E14, ownership-qualified actual canonical postcheck/read+undo failures, original D016 fenced/unfenced, unreadable and held10s backstop with release/no resurrection/zero personal work, and Mongo refusal actual export/erasure zero. TEMP/t047-d016-focused-5c42e9de5f8a4def93baf50073d2aaa1.log.
- FINAL22401 terminal0:engine811tests/766pass/0fail/0cancel/45skip; API51/51/0fail/0cancel/0skip; ALL11 type configs individually EXIT0. All13 source/test SHA256 hashes unchanged before/after. Full command/log/exit/hash index: C:/Users/Lenovo/AppData/Local/Temp/t047-final-aac57c36b76b48b5aea720c66d433ba6.index. Full logs t047-engine-default-aac57c36b76b48b5aea720c66d433ba6.log and t047-api-default-aac57c36b76b48b5aea720c66d433ba6.log in same TEMP; each type log listed in index.

## Independent acceptance required

Re-run commands independently and distinguish runtime assertions from harness failures. Verify all no-consent crisis identifiers/fixed flags and ordinary-refusal zero personal reads/writes/model/checkpoints/tracing; translated crises; strict schema injection; current tenant consent/fence JWT binding; held preflight zero executions, no retry/failover budget reset; terminal typed refusal cannot resurrect via later authority; E3/E3b legitimate fail-open positives; annotation consuming notification remaining budget; cancellation/auth loss no new publication; prior flags preserved; all four late-owned compensation paths, observable cleanup failure, erasure/released fence and newer-owner preservation. Verify saved minimal results cannot disclose legacy raw escalation fields and T045/T046 controls remain intact. Browser smoke is pending independent checker, not maker-verified.

## Scope limits

record_only/unrouted records do not establish recipient correctness, transport delivery, acknowledgements or live operational drain. Real recipient/delivery inputs remain open. No live/provider/production/UI claim. Existing45 engine skips preserved. No ledger/verdict by maker; no full goal completion claim.

## Frozen SHA256 inventory
- apps/api/src/index.ts SHA256=1B92FCC9E3D6B07383EF63B5D7C00F1D6061D634970FF5846FAD99C8EBB7D5C9
- apps/api/src/openapi.ts SHA256=84CB261870C27DC36DE85917A93A8F8EAE277B7B10DE2440740D4681D9380A2C
- apps/api/src/server.ts SHA256=09B5E6F246BAA02801062FE4F0F6B987E19FAD4144727952C85DB7D2175A40FA
- apps/api/tests/server.test.ts SHA256=CA8A4A3C3EC6BFBC69CF74D8CCFBD61B22E300AD9FCCA6D030F50FDD06F52022
- packages/engine/src/guards/concern-classifier.ts SHA256=F1C7185C91C15BB7058B8858AB4A7504EB26A682436114499D6F519EFA02245E
- packages/engine/src/guards/escalation.ts SHA256=3681BA02597EE93D7EDB1D0B000D4E43BBBBC6C6D5FE92019F39E6E49F536C85
- packages/engine/src/scribe/graph.ts SHA256=E5BB004B2FFCF8C176B4A6B1498BB46D541E60582E3C58E5C0CEC21F2E6DFC31
- packages/engine/src/scribe/schemas.ts SHA256=7D1B03C1285FDC5393013CE0E081F80F8887E4CD073DDFDA5E1288329A664DCC
- packages/engine/tests/concern-classifier.test.ts SHA256=D05B0DF6BB5E14BFCADB4F76B8E4AC941F20A49C38BF96BAEBE981E12CC19C58
- packages/engine/tests/crisis-escalation.test.ts SHA256=97E0A5565EE466B58F2AD57ECE520DD3A02D0280C859899C261533FAED20F1BA
- packages/engine/tests/scribe-erasure-fence.test.ts SHA256=7955AF7FDA4466DE0EDFE1A3E97EF88787C80864E44D7AAA4BD408E2D7558ED0
- packages/engine/tests/scribe-persistence.test.ts SHA256=746E5B6C7BDBBE69BD049E1A40F4B2BCFC27ACB31AB24F1C0D3550F7C3D3CB4C
- packages/engine/tests/scribe.test.ts SHA256=DEC42641BA77EBC30DBAFB8856A00841342BE9A8DC7EC4AB001EC28D47BA4FDF

## Closeout reconciliation — 2026-10-13
Historical cycle0 blind dual bounded PASS qa/verdicts/t-047-crisis-privacy.md and .b.md on ec48857; actual current git diff ec48857 c781019 across13 product paths returned0 differences, integratedc781019 is ancestorofHEAD. Later T052 changed consumers still require currentrelease acceptance; no actualtransport delivery or broadgoal claim.
Current full release remains FAIL under qa/verdicts/vc-release-t052-2026-10-13.md and .b.md; no push, deployment or additional acceptance claimed.
