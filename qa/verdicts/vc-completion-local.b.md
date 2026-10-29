# Independent local final checker B — T-057

Cycle checked: 2
Recovery: S12 (D-120; preserved original STALLED lineage)
Policy-Version: proportional-verification/2026-10-19.17
VERDICT: FAIL
Scope: complete local S12 acceptance plus affected original local regressions. This is not a whole-feature, Q6, live, release or deployment verdict.

CHECK-PLAN: Q18/Q19 -> owned candidate/CAS HTTP and finalized-speech controls; Q20 -> retained successful-cleanup cutoff falsifier and current DB consumers; Q21 -> independently pause final completion, erase, inspect publication/history and Retry; Q22 -> native port/config/tenant HTTP and Admin checks; Q23/Q17 -> shared-widget ownership/Retry and mounted Chromium geometry/IME/focus; Q24 -> validator, input identity and required build/integration/browser evidence; Q25 -> preserve separate live/release gates. Tier L: auth/tenancy and concurrency. No helpers or model changes. No peer final-checker verdict/checkpoint/evidence was read or reused.

## Checked state

- HEAD/base: 184b6a583eaf0ec11a8bf5b2295e84e90f8be15f (dirty isolated candidate; HEAD alone does not identify candidate).
- Frozen map: qa/evidence/completion-local-inputs.json SHA256 3ef47eebf4067d5bb5efe3ff3b78b338912ec6e2e7575f0d1784f51930bc2584; frozenAt 2026-10-27T16:30:27.472Z. Independently hashed ALL 292 entries before and after checks: 292 matched, 0 missing/mismatched. Post-check 2026-10-27T16:40:11.967Z.
- Contract: qa/contracts/quest-successor.md SHA256 d4e1fa96a6427a22c5fdd88888f3d2930ca315311e23c85c0168767071b6e41e; supplied contract identity matches current file.
- Manifest: qa/manifests/quest-successor.md SHA256 cfdbcbd1ad21c2ef49aa59ae1be2e75536043085d7e8e32bc3f3c4c3d394b9f9; phase/status ready-for-check, cycle2; S12 readiness lines111-119 read. Earlier STALLED disposition and counters remain intact.
- Root evidence refreshed after bookkeeping changed: qa/evidence/completion-root-integration.md SHA256 86cbdb952ddbacc746a4c09566384d025669bce043510461d109b21c1a4ec4d0 (source inputs remained unchanged). Root claims are not independent checker evidence.
- Installed checker SKILL SHA256 835d6a2764c50567b4573c7aa8f4f991430e2240a46107256b4a07d934799cf1 matches manifest protocol pin. ARCHITECTURE, D-120, TASKS and installed project instructions read. No new-feature repin.
- Dispatch brief was found at D:/vc/qa/.delivery/requests/completion-final-b.brief.md (not inside this worktree), hash5624da79b47af5bfa22bcc157e19fae151bb9a713ef0e3a5a055ead23fa23539 matching supplied identity. Only this worktree verdict is written.
- Defective source identities: apps/api/src/chat.ts 8dd4f0ec39dd693b37fd7ee3817d09d23477709f4ab49b9fa1fb725b9d5428e8; packages/db/src/chat-threads.ts identity bound by the validated frozen map.

## Failure — Q21 / affected Q12,Q14 closure (high)

An answer refused by the final HTTP freshness guard is already committed as published history. At packages/db/src/chat-threads.ts:387-410, the memory-marker CAS occurs BEFORE two asynchronous publication/user-completion writes. Pause the final user status=done update, complete erase, then resume. The completion proceeds without revalidation; apps/api/src/chat.ts:1059 returns409 but leaves the obsolete assistant published. listChatTurns at packages/db/src/chat-threads.ts:222-225 returns it; the authenticated getChatThread consumer at apps/api/src/chat.ts:1155-1165 also reopens that answer's text/claims. This failed attempt has never been successfully returned to its caller, so preserving it is not preservation of an already delivered immutable exchange.

Independent execution on the exact frozen candidate:

~~~text
{"httpStatus":409,"historyRows":2,"obsoleteAssistantRows":1,"published":["published"],"oldRankingFactsReleased":true}
AssertionError: Q21: erase before final completion/release must not expose obsolete answer in reopened history
1 !== 0
exit=1
~~~

A downstream extension of the reproduction additionally called actual authenticated GET /v1/students/stu-1/chat/threads/{ownedThread}. It returned200. That public history DTO omits profileFactsUsed, so its literal JSON did NOT contain Germany (reopenedContainsErasedValue=false); the stored published response DOES retain the forgotten preference and old ranking envelope. The finding is obsolete publication/history after a refused answer, not a claim that this GET directly returns profileFactsUsed or a literal Germany string. Current history projection has no memory-snapshot freshness check. Existing apps/api/tests/chat-rank.test.ts:86-129 pauses this same boundary but asserts only409 and Retry, not obsolete history exclusion.

The marker CAS is documented as a publication linearization point, but Q21 explicitly requires erase/correct/admin-off completed during completion/before release to leave no obsolete answer in reopened history. A marker write before the pending status=done await does not satisfy that contract; no network delivery acknowledgement is claimed or required here.

Reproduction command (cwd D:/vc/.worktrees/vc-completion): node --import tsx --input-type=module -e <following source>. Uses current existing API/DB consumers and offline synthetic fixtures only; no product edits.

~~~javascript
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COLLECTION_NAMES,proposeProfileFact,decideProfileFact,listChatTurns} from './packages/db/src/index.ts';
import {adult,call,chatWorld,newThread,studentToken,turnsPath} from './apps/api/tests/chat-fixtures.ts';
const FIX=JSON.parse(readFileSync('./packages/engine/tests/fixtures/ranking-profiles.json','utf8'));
let enabled=true,release,entered; const pause=new Promise(r=>entered=r),resume=new Promise(r=>release=r);
const w=chatWorld({deps:{memoryPolicyForTenant:async()=>({shortTermEnabled:enabled,longTermEnabled:enabled,learningEnabled:enabled,contextMessages:12,maxFacts:20}),ranking:{port:{get:id=>FIX.options[id]},optionIds:()=>FIX.optionIds}}});
try { const db=w.deps.dbForTenant('tenant-a'), token=await studentToken(adult()),thread=await newThread(w,token);
const fact=await proposeProfileFact(db,{studentId:'stu-1',key:'target-country',value:'Germany'});await decideProfileFact(db,{studentId:'stu-1',factId:fact.factId,action:'confirm'});
const field=await proposeProfileFact(db,{studentId:'stu-1',key:'field-of-study',value:'engineering'});await decideProfileFact(db,{studentId:'stu-1',factId:field.factId,action:'confirm'});
const turns=w.fakeDb.collection(COLLECTION_NAMES.chat_turns),orig=turns.updateOne.bind(turns);let armed=true;
turns.updateOne=async(f,u,o)=>{if(armed&&u.$set?.status==='done'){armed=false;entered();await resume;}return orig(f,u,o)};
const answer=call(w,'POST',turnsPath('stu-1',thread),{token,body:{text:'Please rank my shortlist for me',clientTurnId:'checker-b-independent-history'}});
await pause;await decideProfileFact(db,{studentId:'stu-1',factId:fact.factId,action:'erase'});release();const response=await answer;
const reopened=await call(w,'GET','/v1/students/stu-1/chat/threads/'+thread,{token}); console.log(JSON.stringify({reopenedHttpStatus:reopened.status,reopenedContainsErasedValue:JSON.stringify(reopened.json).includes('Germany')})); const history=await listChatTurns(db,{studentId:'stu-1',threadId:thread}); const stale=history.filter(x=>x.role==='assistant'&&JSON.stringify(x).includes('Germany'));
console.log(JSON.stringify({httpStatus:response.status,historyRows:history.length,obsoleteAssistantRows:stale.length,published:stale.map(x=>x.publication),oldRankingFactsReleased:stale.some(x=>x.response?.profileFactsUsed?.some(f=>f.value==='Germany'))}));
assert.equal(stale.length,0,'Q21: erase before final completion/release must not expose obsolete answer in reopened history');
} finally{release?.();w.cleanup();}
~~~

PROPOSED-ISSUE: T057-S12-B-Q21 | high | refused stale completion remains published/reopenable | packages/db/src/chat-threads.ts:387; apps/api/src/chat.ts:1059 | existing cycle2 RecoveryS12, no cycle reset or new repair allowance inferred.

## Independent commands and observed results

All commands below ran in the isolated candidate unless a host cwd is stated. Tests exercised current product source. Runner pass counts include file-level empty-selection entries where Node reports them; do not treat counts as distinct contract criteria.

1. node --import tsx --test --test-concurrency=2 --test-name-pattern="S12|Q18|Q19|Q20|Q21|Q22|Q23|Q24" packages/db/tests/student-store.test.ts packages/db/tests/chat-threads.test.ts apps/api/tests/chat-profile.test.ts apps/api/tests/chat-rank.test.ts apps/api/tests/voice-history.test.ts apps/api/tests/chat-pathlynks.test.ts apps/api/tests/admin-routes.test.ts packages/schemas/tests/sources.test.ts mcp/pathlynks/tests/port.test.ts
   -> exit0; tests33/pass33/fail0/cancelled0/skipped0,7744.9435ms. Includes actual local HTTP exact old/new confirmation, independent tenant native adapter selection, final-speech controls, active/candidate provenance and stale-cleanup cutoff, publication refusal/Retry, Admin viewer denial and source credential binding. chat-pathlynks file had no selected named S12 case; its file marker is not extra pathlynks acceptance.
2. node --test --test-name-pattern="S12|VA18 no storage|Q5:" apps/widget/tests/floater.test.js apps/widget/tests/voice.test.js apps/widget/tests/request.test.js
   -> exit0; tests21/pass21/fail0/cancelled0/skipped0,469.7407ms. Covers shared authenticated transport, owned session/memory controls, stale409/manual Retry, destruction/delayed mic and credentials/storage exclusions. These mocked tests alone are not visible-browser proof.
3. Host cwd D:/vc/.worktrees/quest-pathlynks-frontend: node --test --test-name-pattern="S10 Guide browser|Q15 mounted|Q12 cycle2 mounted" scripts/student-contract-browser.test.cjs
   -> exit0; tests6/pass6/fail0/cancelled0/skipped0,17685.036ms. Independently executed real mounted React in Chromium: header-only drag/resize/viewport clamp, textarea/ShiftEnter/IME/Enter/send focus, failure/Retry/intervening focus and account/session fences. This is actual DOM/layout regression automation; it is not a visible signed-in both-host/Admin role walk.
4. python contracts/verify_contracts.py
   -> exit0; "verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity". No product acceptance follows.
5. node --import tsx --input-type=module -e <Q21 source above>
   -> exit1; concrete stale published-history assertion above, not import/setup failure.
6. git rev-parse HEAD ->184b6a583eaf0ec11a8bf5b2295e84e90f8be15f; git diff --stat read to establish changed auth/config/concurrency/UI scope. No git mutation.

Retained exact historical files read unchanged: quest-closeout-cycle2-cutoff-counterexample.txt (cutoff10:00:02 ->10:00:00; history0 ->2; forgottenPreferenceRestored=true) and quest-closeout-cycle2-ranking-counterexample.txt (HTTP200 old facts after erase). Current selected Q20 successful-cleanup test passes. Current existing HTTP ranking test passes, but the independently extended Q21 history falsifier still fails. Neither prior failure history nor costs/receipts/counters were rewritten.

## Other mandatory boundaries still unverified

- Q23/Q24: no independent visible login-to-chat/sidebar/new/reopen/reload/memory/ChatVoiceChat/mic allow-deny-unavailable/reconnect walk for BOTH hosts, nor current full Admin role/settings/metrics walk. Native CUA createBrowserTab(iab, local synthetic preview) returned "Browser is not available: iab"; cua.listBrowsers() returned []. LIVE-BROWSER: unavailable in this checker; independent headless mounted Guide regression6/6 is separately evidenced above. Do not relabel maker screenshots or fake-device reports as this checker's visible walk.
- Q24 builds/types: current completion-pathlynks-build-isolated.txt still ends with Next15.5.9 webpack EPERM scandir of unrelated Temp tree; full host build not green. completion-vidysea-types.txt contains93 TS diagnostics; latest root evidence now reports exact HEAD-overlay baseline93/added0, but full host tsc remainsFAIL and affected-route compile is not a generated full production build. No independent baseline identity adjudication performed here. Admin/core build/type success claimed by root does not close both host build gates.
- Q24 integration: read qa/.6c-green=550d14f4b6cef6a4a26201f33f44f0f431155e5b; latest qa/.last-sweep is2026-10-25 on25fa9c6, not this292-input candidate. No current identity-bound required6c/collection/integration/backstop conclusion was established in this check. Do not run a replacement full suite merely to mask the concrete failure.
- Complete per-criterion independent falsification floor and all original local regressions were not finished after the decisive Q21 failure. The33/21/6 focused passes are scoped evidence, never acceptance of the conjunction. Specialist reviews and other blind coordinator remain root-owned; no claim about their verdicts and no reuse of their evidence.
- Q6 and team-owned deployed KB URL/key, real-account consent, production audio/config, actual deployment and live endpoint verification remain separately UNVERIFIED. These external inputs are not the reason for this local FAIL. No paid/provider/production operation was performed by this checker.

SCOREBOARD: Q20 selected retained-cutoff regression green; Q18/Q19/Q22 selected offline/HTTP/voice assertions green; Q17/Q15 mounted Guide6 green; Q21 FAIL; Q23/Q24 complete acceptance unverified; Q25 state separation preserved. Original Q1-Q17/I1-I5 are not all independently accepted by this partial result.
FAILURES: Q21 stale refused answer remains published/history-readable at completion race.
REMAINING: root disposition within existing D-120 allowance; independent repair/recheck authority is not supplied by this verdict. Required browser/build/integration/falsification closure above remains. No push/deploy/whole-feature PASS.
ISSUES-WRITTEN: none (dispatch restricts writes to this verdict; proposal above only).
Metrics: start=unavailable end=2026-10-27T16:41:51.358Z wall_min=unavailable agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=0 mutations=0 cycle=2 recovery=S12 resumes=0 tokens=unavailable builder_min=unavailable check_min=unavailable maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-10-19.17

Only this verdict was written. Product/model/settings, other verdicts, QA counters, main D:/vc WIP and production were not edited; no commit/push/deploy. Local FAIL does not reset historical STALLED lineage or authorize another repair epoch.
