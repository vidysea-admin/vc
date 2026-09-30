# Independent primary verdict — t-047-crisis-privacy
Date: 2026-10-01
Cycle checked: 0
Bound root: D:/vc/.worktrees/t047-crisis
Frozen checked HEAD: 36183f32a9e0a2aca45e1de70893de0f5a3adc0d
Source: ec48857b95c20a18faabe4aedd24ca61f0e354a3; base: 7100f62581c6897e1b8f82a4777985f40e5c218e

VERDICT: PASS
SCOREBOARD: 10/10 scoped acceptance items met, 5/5 scoped invariants hold
FAILURES: none
LIVE-BROWSER: qa/evidence/browser-t-047-crisis-privacy-2026-10-01-checker/report.json
ISSUES-WRITTEN: none
EXPLANATION: PASS certifies this bounded offline privacy/runtime wiring repair only. It does not certify full B16 recipient correctness/delivery, broad B17/B19 personas, the whole engine goal, live providers, or production readiness. Default records remain unrouted record_only; absent delivery is an explicitly retained product gap.

## Independently executed evidence
I re-read goal.md, ARCHITECTURE.md, counselling-engine contract and approved T047 plan refinements, inspected all source changes and actual inherited web interfaces. I did not read secondary checker evidence/verdicts or maker logs/screenshots. Manifest claims were not test evidence.

Executed under the trusted D:/vc/scripts/vc-testlock.sh (Git usr/bin PATH and elevated process visibility), one serial batch:
- packages/engine: node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/*.test.ts evals/*.test.ts
  Actual terminal EXIT0: 811 total, 766 pass, 0 fail, 0 cancelled, 45 existing skips.
- apps/api: node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/*.test.ts
  Actual terminal EXIT0: 51 total, 51 pass, 0 fail/cancelled/skipped.
- Root node node_modules/typescript/bin/tsc --noEmit -p <config> individually for all eleven manifest configs.
  All eleven named EXIT0 entries in qa/evidence/t047-primary/types.log.
- Own QA controls: node node_modules/tsx/dist/cli.mjs --test qa/evidence/t047-primary/own-controls.test.ts
  Actual 3/3 pass, zero failures/cancellations/skips. Initial module resolution harness failure was corrected by QA-only junction to this checkout's engine dependencies; that failure is not feature evidence.
- Own QA-copy mutant: strict minimal schema -> passthrough. node node_modules/tsx/dist/cli.mjs qa/evidence/t047-primary/mutation-oracle.ts reached expected EXIT1 AssertionError true !== false on injected synthetic personal text. Production source was unchanged.

Durable logs: qa/evidence/t047-primary/{engine.log,api.log,types.log,own-controls.log,mutation-red.log}. Thirteen final source/test SHA256 values independently match frozen manifest inventory, final-hashes.json. HEAD remained frozen before QA commit.

## Acceptance mapping and practical limits
1. All no-consent deterministic crises (original or translated text) return every detected turn ID with strict guard_only fixed flags. Fresh independent multi-turn translation oracle passes; hostile extra text/rationale/summary/classifier/recipient fields, duplicate/empty IDs and altered channel/reason are rejected. Mutation proves this oracle detects weakened strictness.
2. No-consent processing invokes no graph/checkpointer/tracing/model and touches no personal collections. Existing spy controls plus independent fresh raw-collection access spy prove only authority collections on the core minimal branch. Ordinary no-consent refusal has corresponding default zero-processing controls.
3. Runtime API setup validates classifier configuration/skill/JWT setup before Mongo connect, and trusted recipient factories bind the verified JWT tenant. Actual startup fake-client and signed JWT tests reach minimal records, replay and tenant separation, not merely configuration construction.
4. Classifier leaf typed authorization refusal is terminal: own refusing-provider oracle has current consent, exactly one model entry, retained flag, zero annotation and zero fallback notifications. Default explicit held-model cancellation/revocation controls also pass.
5. Classifier/review deadlines are captured before first review authority work and retained across leaf/retry/auth phases; publication shares the original reserved review expiry. Held preflight and annotation+recipient remaining-budget controls pass. Each selected turn owns its existing review allocation; no renewed budget inside publication.
6. Original E3 outage/E3b genuine timeout fail-open positives remain passing within authorized review budget; terminal refusal/cancel differs from ordinary unavailability. Flag visibility is retained.
7. Four existing ownership-qualified compensation paths (review insert, notification insert, classifier annotation, acknowledgement) preserve late original driver settlement and tokens. Default late/canonical postcheck tests pass, including actual newer-owner CAS and raw-free observable settlement/undo failures. Tenant-B preservation and no-session-anchor confirmed export/erasure controls pass.
8. D016 original fenced/unfenced oracle remains; initial consent deadline catches only FencedWriterDeadlineError, runs bounded canonical postcheck and fails safe held/unreadable. Held ten-second fence backstop, release and no-resurrection/zero-personal-work assertions pass.
9. Saved minimal result validation excludes legacy raw escalation data and binds its IDs to checkpoint identity; authenticated consented result authority remains. T045 authority and T046 exact actor/ALS/winner/recovery default controls all pass in the actual full suite.
10. Indirect reference UI was independently interacted with: initial real unavailable state -> Retry -> actual approval -> four approvals with summary withheld -> written/readback -> Reload stable. Own CUA warning/error logs empty. Same-server readback has exactly four expected active facts/citations, one claim, empty summary and explicit withholding reason. No fake response interception or source fixture alteration was used.

Scoped invariants: no external/prod/student-data access; no product artifact changes by checker; tenant/fence authority remains; B9 recall-only guard/underlying flags remain; T045/T046 authority unchanged and source hashes match.

## Browser scope disclosure
Initial visible=true was unsupported in subagent; hidden navigation timed out while Next compiled, then own existing tab recovered. Own browser screenshot was emitted after Resolved/Reload. The actual demo uses fixed consented synthetic input and exposes no editable no-consent crisis path. Existing NewSessionForm maps any done reply to generic error; this is an inherited reference UI limitation, not newly repaired crisis rendering. Minimal crisis behavior is certified at strict core and real loopback JWT API boundaries, not as a rendered crisis UI. Hindi/voice/international persona completion and broad scenario matrix are not claimed. No production client or notification delivery is proven by this check.
