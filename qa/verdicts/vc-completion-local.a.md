# Independent final local checker A — vc-completion

Cycle checked: 2
Recovery: S12 — preserved T-057 lineage; original cycle2 STALLED retained
Policy-Version: proportional-verification/2026-10-19.17
VERDICT: FAIL
Scope: complete local acceptance was requested; this is a local scoped rejection, not a whole-feature/live verdict or release approval.
Checker: completion-final-a; no implementation, helpers, peer-final verdict/checkpoint/evidence, paid call, production call, push or deployment.

## Blocking finding — Q21 / Q24

**F1 (high): an answer refused after a completed erase is nevertheless published into reopened history.**

I independently reproduced this through the current real chat handler and DB functions, using existing synthetic JWT/KB/ranking fixtures and the fake DB. Pause chat_turns.updateOne immediately before the user status=done write, complete erase of confirmed target-country Germany, then resume. The POST returns409 memory_changed with retryWithNewTurn=true, but GET of that owned thread returns200 and exposes the old ranked answer (#1 Munich fit1.00 / overall0.78). The stored assistant response still records the erased Germany fact. This was the first attempt: it never returned a successful answer before erase. Therefore this is not deletion of previously delivered, immutable history.

Source read in this check:
- packages/db/src/chat-threads.ts:387 declares the marker CAS to be publication's linearization point; lines402-412 subsequently publish the assistant and complete the user through separate awaited writes, with no final revision/policy guard or compensation after that point.
- apps/api/src/chat.ts:1057 awaits completion, then line1059 refuses the HTTP response after detecting the change, without retracting this newly refused answer.
- apps/api/src/chat.ts:1155 reads published rows directly for history; there is no freshness filter for this newly refused exchange.
- packages/db/src/chat-threads.ts:223 accepts that completed pair into history.
- apps/api/tests/chat-rank.test.ts:86-128 tests the same completion/usage interleaving but only asserts original response/Retry; it does not reopen history. Its green result does not cover this requirement.

Q21 explicitly requires correct/erase/admin-off completed before release to yield no obsolete content in original response, cached Retry, reopened history or voice events, and specifically requires the completion/usage pause. Calling an earlier metadata CAS the linearization point does not satisfy the reopened-history part when final HTTP release is refused. Preserve truly completed prior history; fix the owned newly refused attempt boundary under the existing recovery authorization.

Exact independent failing command (PowerShell-compatible equivalent: pipe this script to node --import tsx --input-type=module; execution here used node -e with this exact argument):

```javascript
import assert from 'node:assert/strict'; import {readFileSync} from 'node:fs'; import {chatWorld,studentToken,adult,newThread,call,turnsPath,threadsPath} from './apps/api/tests/chat-fixtures.ts'; import {COLLECTION_NAMES,proposeProfileFact,decideProfileFact} from './packages/db/src/index.ts'; const fixture=JSON.parse(readFileSync('./packages/engine/tests/fixtures/ranking-profiles.json','utf8')); const w=chatWorld({deps:{memoryPolicyForTenant:async()=>({shortTermEnabled:true,longTermEnabled:true,learningEnabled:true,contextMessages:12,maxFacts:20}),ranking:{port:{get:id=>fixture.options[id]},optionIds:()=>fixture.optionIds}}}); let release; try {const db=w.deps.dbForTenant('tenant-a'),token=await studentToken(adult()),thread=await newThread(w,token); const fact=await proposeProfileFact(db,{studentId:'stu-1',key:'target-country',value:'Germany'}); await decideProfileFact(db,{studentId:'stu-1',factId:fact.factId,action:'confirm'});const field=await proposeProfileFact(db,{studentId:'stu-1',key:'field-of-study',value:'engineering'});await decideProfileFact(db,{studentId:'stu-1',factId:field.factId,action:'confirm'});let entered; const pause=new Promise(r=>entered=r),resume=new Promise(r=>release=r);const col=w.fakeDb.collection(COLLECTION_NAMES.chat_turns),orig=col.updateOne.bind(col);let armed=true;col.updateOne=async(f,u,o)=>{if(armed&&u.$set?.status==='done'){armed=false;entered();await resume;}return orig(f,u,o);};const pending=call(w,'POST',turnsPath('stu-1',thread),{token,body:{text:'Please rank my shortlist for me',clientTurnId:'checker-a-publication'}});await pause;await decideProfileFact(db,{studentId:'stu-1',factId:fact.factId,action:'erase'});release();const response=await pending;const history=await call(w,'GET',threadsPath('stu-1')+'/'+thread,{token});const stale=history.json.turns.filter(t=>t.role==='assistant'&&(t.claims||[]).some(c=>c.text.includes('#1 Munich')));console.log(JSON.stringify({responseStatus:response.status,response:response.json,historyStatus:history.status,staleHistoryCount:stale.length,staleHistory:stale}));assert.equal(stale.length,0,'erase completed before response release must exclude obsolete unpublished answer from reopened history');}finally{release?.();w.cleanup();}
```

Output (node v24.13.1, exit1):
```text
responseStatus=409
response={error:"memory_changed",retryWithNewTurn:true}
historyStatus=200
staleHistoryCount=1
staleHistory[0].claims[0]="NOT PROVEN: #1 Munich engineering (synthetic): overall 0.78 (fit 1.00, cost 0.70, scholarship chance 0.40, visa ease 0.80)"
AssertionError [ERR_ASSERTION]: erase completed before response release must exclude obsolete unpublished answer from reopened history
1 !== 0
```

No source/test mutation was used. An initial diagnostic checking history.profileFactsUsed was vacuous because the public history DTO does not expose that field; I inspected full returned claims and stored response, corrected the probe to assert the actual visible ranking, and obtained the failure above. The vacuous probe is not counted as a pass.

## Checked state / source identity

CHECKED-STATE:
- checkout D:/vc/.worktrees/vc-completion; HEAD/base184b6a583eaf0ec11a8bf5b2295e84e90f8be15f; dirty candidate, not a committed build.
- freeze qa/evidence/completion-local-inputs.json SHA2563ef47eebf4067d5bb5efe3ff3b78b338912ec6e2e7575f0d1784f51930bc2584, frozenAt2026-10-27T16:30:27.472Z;292/292 recorded source/config/test/host/lock hashes verified at entry and again2026-10-27T16:46:28.000Z;0 mismatches.
- contract SHA256d4e1fa96a6427a22c5fdd88888f3d2930ca315311e23c85c0168767071b6e41e matches supplied handoff; manifest SHA256cfdbcbd1ad21c2ef49aa59ae1be2e75536043085d7e8e32bc3f3c4c3d394b9f9, ready-for-check with original cycle2/recovery allowance preserved. D-120 read from current decisions log.
- installed checker SHA256835d6a2764c50567b4573c7aa8f4f991430e2240a46107256b4a07d934799cf1 matches pinned protocol. No model or policy change.
- pnpm-lock.yaml SHA256b344f406e0b6c4beb3df693b1e67cfc7b867afd3970c580207e4203d13a1de4d; runtime Windows, Node24.13.1, TypeScript5.8.3. No dependency installation or environment configuration change completed.
- chat.ts SHA2568dd4f0ec39dd693b37fd7ee3817d09d23477709f4ab49b9fa1fb725b9d5428e8; all other exact relevant paths/hashes remain in the validated freeze document.
- retained original cutoff counterexample SHA256d3c8d494a5aad5a5c7aa53f85176a73708f95649099969b2af74d7acebf0f421 and ranking counterexample SHA256072ff0502b5efc451fc72ac0ba61e474686fa768f58d346987ffb515b7e01fb6 read unchanged. Original errors are preserved, not relabelled PASS.

## Independent checks actually run

CHECK-PLAN: Q18-Q20 -> existing student-store/chat-profile/voice-history consumers plus cutoff races; Q21 -> chat-rank/chat-threads publication and extra owned-history counterexample; Q22 -> stored Admin adapter/schema/native port/tenant HTTP and voice consumers; Q23/Q17 -> both host proxies, widget lifecycle and real Chromium mounted Guide; Q24 -> designated validator/workspace types/build evidence and missing integration boundary; Q25 -> explicit local/live separation. L auth/tenancy and concurrency risk; serial coordinator, max two test/type lanes, one browser lane. No helper acceptance.

All commands below ran on current validated sources. Results are execution results, not per-criterion acceptance PASSes. No full suite was run.

1. node --import tsx --test --test-name-pattern="S12|Q12|Q14" apps/api/tests/chat-profile.test.ts apps/api/tests/chat-rank.test.ts packages/db/tests/chat-threads.test.ts packages/db/tests/student-store.test.ts
   exit0;45 tests/pass45/fail0. Includes active/candidate/reject/correct/erase, alias/account field refusals, delayed extraction/decisions, monotonic stale-cleanup cutoff, pending/ambiguous failures, selected text context and current runtime tenant selection. The publication test's missing history assertion is F1 above.
2. node --import tsx --test --test-name-pattern=S12 mcp/pathlynks/tests/port.test.ts packages/schemas/tests/sources.test.ts apps/api/tests/admin-sync.test.ts apps/api/tests/chat-pathlynks.test.ts apps/widget/tests/floater.test.js apps/widget/tests/voice.test.js
   exit0;runner reports30/pass30/fail0. One no-matching-test file is a module-level runner success (chat-pathlynks); do not count that as a behavior assertion. Native port bounds, credential/retarget/cross-site canaries, persisted Admin adapter, runtime source disable, candidate controls, Retry and teardown were exercised.
3. node --import tsx --test --test-name-pattern="S12|Q14|Q12" apps/api/tests/voice-history.test.ts apps/api/tests/voice-wiring.test.ts
   exit0;13/pass13/fail0. Actual voice API/live-provider capture with synthetic provider: finalized yes/no versus partial/model/ambiguous speech, stale/reconnected choice, pending decision, erased context, learning-off, fresh policy, cross-platform native tools. This proves deterministic transport/policy behavior, not real speech quality.
4. In isolated Pathlynks frontend: node --test --test-name-pattern="Q12 cycle2 mounted|S10 Guide browser|Q15 mounted|S12 host" scripts/student-contract-browser.test.cjs
   exit0;11/pass11/fail0, including6 actual Chromium mounted DOM tests for displayed-value/stale refusal, drag/resize/mobile bounds, textarea grow/shrink/IME/Enter/ShiftEnter/focus, delayed responses/scope changes and restored session. Remaining5 are focused service/hook fixtures, not extra DOM walks.
5. In isolated Vidysea backend: python -m pytest tests/test_student_fixes.py -k vc_central -q -p no:cacheprovider --tb=short
   exit0;27 passed,2 deselected in8.44s. Mounted FastAPI dependency/SQL/upstream spies; actual app/ORM bootstrap remains outside this fixture.
6. In isolated Pathlynks backend: node --test --test-name-pattern="Quest (?:VC bridge|memory|selection|S12)" tests/parent-journey-regression.test.js
   exit0;24/pass24/fail0. Includes actual local HTTP router, role/eligibility/spoofing/ownership, concurrent mapping/history, multilingual selection, upstream403/404/409, strict candidate/prompt/thread forwarding and isolated ownership falsifier.
7. node --import tsx --test --test-name-pattern="Q9|Q2|Q1|Q4|Q5|Q6|anonymous|greeting|Germany|spoof|tenant|unconsented" apps/api/tests/anonymous-route.test.ts apps/api/tests/anonymous-zero-persistence.test.ts apps/api/tests/chat-privacy.test.ts packages/engine/tests/student-classify.test.ts packages/engine/tests/student-graph.test.ts
   exit0;runner reports62/pass62/fail0, including one no-matching-test module success (student-classify). Actual anonymous zero-persistence/personal gate/crisis/tenant/sourced/fallback regressions executed; this filter is not comprehensive Q1-Q9 acceptance.
8. python contracts/verify_contracts.py
   exit0;"verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity". Not product acceptance.
9. Existing workspace type commands executed directly without output files:
   node node_modules/typescript/bin/tsc --noEmit --incremental false -p <tsconfig>
   ALL12 exit0/no diagnostics: apps/api, apps/web, packages/db, packages/engine, packages/observability, packages/providers, packages/schemas, mcp/pathlynks, mcp/student-profile, mcp/university-kb, packages/engine/evals, packages/engine/scripts.
   Initial fallback pnpm typecheck attempt failed before compilation: ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY while trying an implicit install. I did not enable purge/CI, install or change dependencies. Direct commands above execute every existing typecheck script's compiler target with incremental writes disabled. Frozen hashes still match.
10. Independent Q21 extra assertion above: exit1,1 obsolete answer in owned reopened history. This blocks local acceptance despite green existing tests.

## Own browser evidence and its limits

LIVE-BROWSER: real Chromium execution, not maker screenshots counted as my evidence.

- Existing current-source Guide mounted test run above:6/6 Chromium DOM checks green; mocks at host-service seam, no claim of real host login/production backend.
- Independently reran the existing completion-browser-mic.cjs logic in memory (node -e); removed its evidence-file write and added unavailable as a third mode. Both localhost hosts, modes allow/deny/unavailable:6/6 true. Allow uses Chromium synthetic audio device and fake permission UI, then returns to Chat; deny explicitly rejects getUserMedia; unavailable removes mediaDevices. Returned notices preserve typing. No real human microphone or real-provider audio quality claimed.
- Separate headed private-context Vidysea walk on localhost5402: synthetic sign-in -> actual ChatWidget/shared widget -> New chat -> native shortlist response -> reload restores selected thread -> reopen older thread -> sign-out removes dialog. All observed. Existing confirmed Biology displayed. An initial7s response wait expired and a later manual send observed HTTP200/native reply; no automatic regeneration claim. This is not a latency PASS.
- Runtime composition inspected: completion-local-runtime.mts uses actual central API plus real localhost virtual_counsellor Mongo and current Guide/controller excerpts, with synthetic auth/native port/KB/model/audio; completion-vidysea-runtime.py mounts the actual router after replacing app/SQL imports. These do not prove native production login, Postgres driver/ORM, real consent, or a release build. I have no independent bundle-to-source deployment fingerprint for the running custom Vidysea browser harness; its walk is partial supporting evidence, not closure of all Q23/Q24.
- Full inspect/confirm/correct/forget plus same-session/new-session continuity and reconnect for BOTH full hosts, Admin role/settings UI persistence walk, all delayed decisions/account/logout cases, and the complete required final integration/collection/falsification matrix are not independently closed here.

## Disposition / exact remaining boundaries

SCOREBOARD:1 independently reproduced blocking Q21 defect; Q18-Q20/Q22-Q23 and original regressions have the targeted green executions above, but none is promoted to complete local criterion acceptance by omission. Q24 integrated conjunction is unmet. Q25 local/live separation preserved. Q6 remains UNVERIFIED, not locally waived.

FAILURES: F1 Q21 obsolete refused answer exposed on reopen; Q24 cannot be accepted while this persists. PROPOSED-ISSUE: local-A-F1 | high | Q21/Q24 | source/command/output above. ISSUES-WRITTEN: none; user permitted this verdict file only.

REMAINING:
- Repair F1 only under an explicit valid continuation of the preserved recovery allowance; this checker does not grant another cycle or edit code. Independent regression must reopen history and inspect ordinary prose/claims as well as metadata at both completion and usage awaits, correction/erase/admin-off, original response/cached Retry/voice/export, and retain immutable already-delivered history.
- Q24 affected host builds unresolved: current completion-pathlynks-build-isolated.txt ends EPERM/scandir of unrelated Temp tree; completion-vidysea-types.txt reports broad TypeScript failures (root records93) with unchanged-baseline attribution unproved. These are incomplete build/baseline evidence, not established new product bugs. A route-only compile is not an affected production build. I did not rerun costly builds after the concrete acceptance failure.
- Required same-input red/green/restored falsification per changed criterion, collection/integration/backstop/6c identity and full downstream coverage remain unclosed; builder narrative/green counts alone cannot supply missing identity. No isolated mutant series was run after F1 established failure; no bound tree mutation.
- The root-owned final blind auth/tenancy dual conjunction and scoped senior/data/AI reviews remain separate requirements; I have not read or relied on their final evidence. This file cannot certify their outcome.
- Team/live: real authorized account consent/read-only RDS CA/schema/count/browser proof, deployed KB inputs, vetted production crisis asset/voice configuration, real configured finalized speech/quality and deployment/live checks remain separately UNVERIFIED. No production/paid probe attempted. Existing mocked and bounded provider reports do not close them.

No product files, main D:/vc WIP, contracts, manifests, issues ledger, old verdicts, receipts or counters were changed by me. Only this scoped verdict is persisted. No commit/push/deploy/release approval.

Metrics: start=2026-10-27T16:34:50.492Z end=2026-10-27T16:46:28.000Z wall_min=11.63 agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=0 mutations=0 cycle=2 resumes=0 tokens=unavailable builder_min=unavailable check_min=11.63 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-10-19.17
Timing is the measured verification window from the first explicit UTC sample; initial instruction/source reads preceded it and their elapsed time is unavailable. One coordinator, no helpers; selected executions above are not full suites. Infrastructure shell launch failed twice before process creation; Node child-process fallback worked. No auto-approval rejection or permission bypass in this checker run.
