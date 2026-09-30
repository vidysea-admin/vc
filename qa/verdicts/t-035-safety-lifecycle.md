# Independent checker verdict — t-035-safety-lifecycle

Date: 2026-09-30
Bound project: D:/vc
Candidate: 5a543e31af278825a9fb68244f7c9049560dca7b
Contract: qa/contracts/counselling-engine.md
Manifest: qa/manifests/t-035-safety-lifecycle.md
Cycle checked: 0

VERDICT: PASS
SCOREBOARD: 7/7 in-scope lifecycle acceptance checks met, 5/5 preserved invariants hold
FAILURES (if any): none in the submitted lifecycle subunit
LIVE-BROWSER: not-applicable (backend collection/index/erasure/escalation code and tests; OpenAPI export-description text only)
ISSUES-WRITTEN: ISS-t-012-rev-1 (open -> fixed); ISS-117; ISS-118; ISS-091 (additional evidence, remains open)
EXPLANATION: The combined nine-file safety-data lifecycle repair is independently evidenced, including raw two-tenant erasure/export outcomes, all four writer paths, late settlement and ownership/CAS compensation. This PASS certifies only the approved lifecycle subunit; the broader nine-entrypoint pipeline remains RED at 1255 total / 1207 pass / 3 fail / 45 skipped. Delivery, no-consent API compliance, recall >=0.95, real Mongo/live deployment, full T-035 and the full counselling goal are not certified.

## Scope and evidence discipline

The checker independently read the full contract, adapter, approved nine-file plan and authoritative consented-rationale clarification, then the ready cycle-0 manifest and frozen candidate diff. Product paths still match the candidate at the final comparison; later root commits/working changes concern documentation only. No maker test outputs, reviews or screenshots were credited. No production DB, external provider, real student data or delivery service was contacted. No shared source was mutated.

This scoreboard describes the approved plan's bounded acceptance, not a PASS of every B1-B22 clause. In particular, existing crisis-escalation E13 tests still describe the outstanding no-consent defect; their passing result is not evidence that D-027 is implemented. B16 recipient delivery and held-out recall are likewise not satisfied by queued records. Unchanged UI and broader goal tracks remain outside this repair's credit.

## Acceptance checks

| Check | Result | Independent evidence |
|---|---|---|
| L1: register, tenant-led indexes, scanner coverage | PASS | DB db-init/db-scope tests and frozen diff; both safety collections registered, indexed by tenant+student/session and scanned as student data; writer allowlisting backed by behavior for all four mutations. |
| L2: projected access, deterministic order, empty arrays, consented rationale | PASS | DB outcomes plus checker-owned raw probe: exact allowed notification/review key sets; consented schema-valid quotation retained exactly in access export; staff/provider/ownership fields excluded; empty and ID ordering tests. |
| L3: authorized hard purge, independent raw-zero, tenant isolation, failures | PASS | Seed A/B identical student/session/turn IDs without session anchors, then export and approved purge A; explicitly named raw collection scans prove A zero and B byte-identical. Both purge/read-back failures are observable. Quoted rationale disappears with its review. |
| L4: four bounded fence phases | PASS | Complete crisis file exercises review insertion, notification upsert, classifier annotation and acknowledgement separately; precheck prevents dispatch, finally-postcheck compensates even after applied-write-then-reject and fence-read error; classifier has no writer deadline across its run and a fresh phase follows it. Source passes remaining driver timeouts and disposes deadlines. |
| L5: ownership, replay, CAS, late settlement | PASS | Insert tokens are atomic $setOnInsert fields; replay preserves prior raw bytes; annotation/ack rollback is token-qualified and neither deletes the notification nor upserts/resurrects an erased row. Deadline settlement is awaited, newer owners survive, public/background compensation failures remain observable. |
| L6: classifier schema and conserved safety | PASS | Independent provider outputs test null shape, unknown severity, wrong likelyBenign type, extra field, empty rationale and >500 rationale, on concern/crisis. All become unavailable/error with no raw output/rationale persisted; concern moderate and crisis critical floors and guard visibility remain. Valid quoted high/critical sampled-none outcomes still escalate. 15 independent schema/floor cases, plus exact quote lifecycle. |
| L7: required checks and honest broad regression accounting | PASS | DB108/108 and complete crisis30/30; all nine typecheck scripts exit0; validator exit0 explicitly by vacuity; whitespace exit0. One default -r test plus only its five omitted scripts covers all nine actual entrypoints. Red global results are retained below, not replaced by control passes. |

Preserved invariants: offline synthetic/test-only data boundary (B8/B12/B13); tenant stamping/filtering and raw other-tenant preservation (B21); existing double-confirmation/approver/default-autoDelete/HMAC/24-hour fence behavior (B15); guard before classifier and visible severity floors (B9/B16); notification/alert/ownership metadata contains no turn or consented free-form rationale payload (B4 distinction). The separate no-consent identifiers-plus-flag path is not tested or approved here.

## Commands re-run by this checker

All test/typecheck instruments ran serially through scripts/vc-testlock.sh with PATH containing Git usr/bin and nodejs. No dependency installation. Runtime pnpm path: C:/Users/Lenovo/AppData/Roaming/npm/node_modules/pnpm/bin/pnpm.cjs; invocation uses `node <path> --config.verifyDepsBeforeRun=false`.

1. `--filter @vc/db exec tsx --test tests/db-init.test.ts tests/db-scope.test.ts tests/erasure.test.ts`: session90972 terminal0, 108 tests / 108 pass / 0 fail / 0 skip.
2. `--filter @vc/engine exec tsx --test tests/crisis-escalation.test.ts`: session17269 terminal0, 30 tests / 30 pass / 0 fail / 0 skip, including the final two cases.
3. `-r typecheck`: session51186 terminal0, all nine scripts Done (production/eval/scripts as existing tsconfigs declare; not static test-file typechecking).
4. `python contracts/verify_contracts.py`: terminal0, `no frozen contracts yet ... PASS by vacuity`; no substantive product guarantee inferred.
5. `git diff --check`: terminal0. `git diff 5a543e31 -- packages/db packages/engine apps/api/src/openapi.ts`: empty at final check.
6. `node --import tsx qa/evidence/t035-checker-cycle0/isolated/packages/engine/checker-probe.ts all`: session93367 terminal0; exact quotation access/purge, raw A-zero/B-preserved, 15 schema/floor cases, already-fenced dispatch and replay ownership outcomes PASS.
7. `python qa/evidence/t035-checker-cycle0/mutations.py`: session57874 terminal0; four mutant child processes each terminal1 at their intended reached outcome assertion. Source copies restored in finally.
8. Default `-r test`: session99175 terminal1, stopped at providers. Only omitted scripts then ran through sequential per-package mutex acquisitions: engine, mcp-student-profile, mcp-university-kb, api, web. Aggregate runner75088 terminal1; each entrypoint's actual result is below.
9. Prechange provider control: isolated parent archive, `node D:/vc/node_modules/tsx/dist/cli.mjs --test tests/*.test.ts`, session97351 terminal0, 54/54.
10. Prechange scribe control: `node --import tsx --test --test-name-pattern 'recordRejectReasons.*short' qa/evidence/t035-checker-cycle0/scribe-parent/packages/engine/tests/scribe-per-fact.test.ts`, session93358 terminal0, 1/1. This control and its skips/counts are not substituted into the broad pipeline totals.

All checker verification handles are terminal. Independent final mutex read reported `CHECKER MUTEX RELEASED: owner absent` before ownership returned to root for the next unit.

## Default pipeline remains RED

| Actual script | Tests | Pass | Fail | Skip |
|---|---:|---:|---:|---:|
| schemas | 61 | 61 | 0 | 0 |
| observability | 59 | 59 | 0 | 0 |
| db | 252 | 252 | 0 | 0 |
| providers, default run | 54 | 53 | 1 | 0 |
| engine, omitted default entrypoint | 704 | 657 | 2 | 45 |
| mcp-student-profile | 12 | 12 | 0 | 0 |
| mcp-university-kb | 29 | 29 | 0 | 0 |
| api | 46 | 46 | 0 | 0 |
| web | 38 | 38 | 0 | 0 |
| **Total** | **1255** | **1207** | **3** | **45** |

The 18 added lifecycle tests all pass, including all 14 new engine cases in the full engine entrypoint. The observed total is baseline1237 +18, but current failure identities were independently inspected rather than assumed baseline-equivalent:

- **providers/tests/litellm.test.ts:209**, T-037 MID-FLIGHT AbortSignal cancellation: assertion at :237, `the stub must have received the request before we abort it`, actual false. Later async activity produced `expected LiteLlmAbortedError, got LiteLlmNetworkError` after cleanup. This is additional to the prior baseline failure. ISS-117 records it.
- **engine/tests/concern-classifier.test.ts:210**, T-041 real in-flight cancellation: assertion at :230, `the stub must have received the request before the timeout fires`, actual false. This exact identity already has ISS-t-041-1/ISS-091; updated evidence only, not a duplicate new issue.
- **engine/tests/scribe-per-fact.test.ts:554**, ISS-t-018-rev-2 short outer writer deadline: at :570 resumeScribe fails with FencedWriterDeadlineError; stack reaches recordApprovedSessionSummary and WriterDeadline.op. SHORT_MS=200. This is an additional observed default failure, ISS-118, not presumed inherited from the one-failure baseline.

Controls show the additional cases pass in isolation on unchanged prechange code; they do not prove a green default pipeline or erase those observations. Provider source index blobs both `567dae446d0a58981ce62a436757ca14eeda5db2`; litellm test blobs both `c8033e3c2fbfe094518f2578dc4cf8f4ae215f89`. Scribe test blobs both `eeeac0a40e323a94342223f1dfa47896fca09320`; facts blobs both `cb111200596e319a455b7d408f33b11ecf4927e5`; nodes both `08876c0a8bf0cedb993a9043cb0ca9375fe671e5`; graph both `f293ac5cb195b9b68b2d0ad065c105b2dce17e2e`. Erasure's entire writer-infrastructure prefix before ERASURE_PLAN is byte-identical across parent/candidate: 72,596 bytes, SHA256 `6df468806e3ab65c5885cb82e3da252c3b750fe6949b1709486de510782d589b`. Dependency junctions in controls can resolve shared @vc/db, so this infrastructure equality is explicitly established rather than pretending every dependency was copied.

## Independent mutation evidence

Archive was produced from the frozen candidate, with package/root dependency junctions only. Probe imports isolated `packages/db/src/erasure.js` and `packages/engine/src/guards/escalation.js` directly; unchanged @vc dependencies can remain shared. Each mutant uses the exact probe that passed baseline, mutates one uniquely asserted source occurrence, launches a fresh process, requires the named raw assertion in its runtime failure, then restores the isolated module. Compilation/module-load failure is not accepted. Results/logs: qa/evidence/t035-checker-cycle0/mutation-results.json and individual *.log files.

| Isolated mutation | Reached runtime outcome |
|---|---|
| Remove escalation_notifications purge entry | `RAW ZERO escalation_notifications` fails with A notification documents remaining. |
| Remove crisis_flag_reviews purge entry | `RAW ZERO crisis_flag_reviews` fails with A review and exact quoted rationale remaining. |
| Remove fencedWrite precheck | `RAW PRECHECK forbids driver dispatch` fails: 1 dispatch vs 0, despite final compensation. |
| Remove notification compensation insert ownership qualifier | `RAW OWNERSHIP replay preserves prior notification bytes` fails: prior two notifications become empty. |

## Ledger and remaining work

ISS-t-012-rev-1 moves open -> fixed based on this first independent repair check; fixed -> verified requires the protocol's later re-check. ISS-t-012-rev-2 (API recipients/delivery), ISS-t-012-rev-3 (D-027 no-consent path) and crisis recall remain outstanding. New ISS-117/ISS-118 concern broader load-sensitive test instruments, not an observed failing safety-lifecycle outcome, and stay open. This is no release/deploy/pilot/whole-goal approval.
