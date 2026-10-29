# integration-host-wire — S12 immediate host protocol integration

Owner/task: integration-host-wire. Recorded: 2026-10-27T15:30:56.185Z.
Status: LOCAL FOCUSED CHECKS GREEN; ready for root integration. No independent acceptance or feature PASS.
Lineage: existing T-057 / quest-successor / cycle2 / S12 preserved-lineage recovery. Prior STALLED verdicts, counterexamples, costs, four maker receipts and cumulative history remain unchanged. No manifest or checker-owned artifact changed.

## Authority and scope

Read installed maker/checker at this safe boundary, project AGENTS/ARCHITECTURE, S12 plan:119-140, independent approved plan:298 onward, D-120:1083-1095, existing manifest and previous completion-host-backend report. Installed protocol hashes match the existing pin: maker `236bc0e7c075f9729ef464dbd8aa2bdbec02754e95e228c936480c96d4c8fe39`; checker `835d6a2764c50567b4573c7aa8f4f991430e2240a46107256b4a07d934799cf1`; policy `proportional-verification/2026-10-19.17`. No repin, new policy-check success, scheduling, child dispatch or independent verdict is claimed. This bounded contribution inherits the existing approved plan; root owns readiness and final checking.

Announced existing product seams before editing:

- `D:/vc/.worktrees/vc-vidysea-backend/app/api/v1/student/ai_counsellor_router.py:104` — `vc_student_proxy`, validation branches now at199/224/231.
- `D:/vc/.worktrees/quest-pathlynks-backend/controllers/pathlynks_quest_controller.js:1250` — `aiFactDecision`; `aiChat` previously1299, now1301.
- Existing tests only: Vidysea `tests/test_student_fixes.py` (new cases365/391); Pathlynks `tests/parent-journey-regression.test.js` (existing mounted HTTP test162, ownership falsifier471; new cases640/666/686/696).

Two existing product files and their two existing tests edited in their isolated host checkouts. Only new artifact is this authorized QA report. No main D:/vc source/index, central runtime, UI/service/Guide/widget, model/config, collection, enforcement path, frozen contract, commit, push or deployment change. Existing Chat/Voice/Speak/geometry/focus/theme code was not edited. Root integration remains within the existing parent feature.

## Settled interfaces

1. Vidysea authenticated `POST /api/v1/student/ai-counsellor/vc/threads/{threadId}/turns` forwards optional `memoryConfirmation` with EXACT keys `{factId,candidateId,expectedVersion,value,promptId}`. Every field is a nonblank string; identifiers <=128 and displayed value <=1000. Missing/extra/numeric/boolean/null/oversized fields reject400. Values and retry keys pass unchanged; whitespace in a nonblank displayed value is preserved. Identity, consent and history fields cannot enter this reference.
2. Pathlynks authenticated `POST /ai/chat` accepts that same optional exact reference and forwards it on the central turn body alongside unchanged text/clientTurnId/quest. Existing authenticated principal and owned-thread GET verification remain; a browser selector/reference is never authorization. No retries or automatic regeneration were added.
3. Both decision endpoints additionally accept and forward optional bounded `threadId`. Existing strict action/value/candidate/version rules remain. These proxies do not invent a current candidate, prompt, decision or approval. Central must enforce current candidate/version/displayed value and selected owned origin thread; those central checks are outside this host-only execution evidence. Missing/foreign/stale references must be judged centrally, rather than treated as permission by the host.
4. Pathlynks chat now preserves central403/404/409, including sanitized `{error:"memory_changed"}` on409. Its existing decision preservation remains; Vidysea already preserved these statuses. Other failures remain input-preserving503 with no legacy fallback. Exact-owned Retry still uses the supplied clientTurnId.
5. Immediate response consumer: central `TurnResponseSchema.memoryConfirmation` is a server prompt containing required `{factId,key,candidateId,expectedVersion,value,promptId,threadId}` and optional `currentValue`. Pathlynks previously stripped it. `aiChat` now returns it as `memoryConfirmation`, validates bounded exact fields and requires its threadId to match the owned selected central thread. Invalid/cross-thread prompts fail503 without exposing the prompt or calling legacy generation. Vidysea already passes central response DTOs through unchanged.
6. Existing config seams unchanged: Vidysea `VC_STUDENT_CENTRAL_ENABLED`, `VC_BASE_URL`, `VC_PARTNER_SERVER_KEY`; Pathlynks `VC_QUEST_ENABLED` and existing server configuration. Existing current login, exact student role, active/disabled/deleted checks, real auth capture, team-signed `vc_eligibility` and central tenant/student headers remain. No guardian-consent inference/provisioning or browser identity authority was introduced.

## Commands and actual results

Default shell failed before process creation with `helper_unknown_error: setup refresh had errors`. The tool-approved elevated local runner succeeded; filesystem reads also used Node. No automatic approval rejection occurred.

Initial failing controls before product edits:

- Vidysea cwd `D:/vc/.worktrees/vc-vidysea-backend`: `python -m pytest tests/test_student_fixes.py -k vc_central_s12 -q -p no:cacheprovider --tb=short` -> exit1;1failed/1passed/25deselected,2.76s. Valid prompt reference returned400 instead of forwarded409 memory_changed.
- Pathlynks cwd `D:/vc/.worktrees/quest-pathlynks-backend`: `node --test --test-name-pattern="Quest S12 (?:prompt reference|strict prompt|chat preserves)" tests/parent-journey-regression.test.js` -> exit1;0pass/3fail. Observed dropped reference, malformed reference accepted200 and upstream403 hidden as503.
- Pathlynks additional immediate consumer RED: `node --test --test-name-pattern="Quest S12 server prompt" tests/parent-journey-regression.test.js` -> exit1;1failed. The server prompt was absent from the host response.

Final focused execution:

- Vidysea: `python -m pytest tests/test_student_fixes.py -k vc_central -q -p no:cacheprovider --tb=short` -> **exit0;26passed/1deselected in28.83s**. Retains all24 previous focused central tests and adds2 protocol cases. The deselected legacy network test was not run. Actual FastAPI routes execute with ASGI TestClient and MockTransport; app/SQL imports are AST-replaced. Boundary128/1000 succeeds; missing/unknown/malformed/oversized nested fields fail400 before upstream; valid decision thread and exact prompt reference survive409; explicit Retry keeps key without hidden extra calls. Existing auth/eligibility/isolation/limits/failure tests stay green.
- Pathlynks: `node --test --test-name-pattern="Quest (?:VC bridge|memory|selection|S12)" tests/parent-journey-regression.test.js` -> **exit0;24passed/0failed/0cancelled/0skipped;690.6201ms**. Retains19 prior focused tests plus the existing actual HTTP router test and4 new cases. Existing Express router is mounted on ephemeral127.0.0.1 HTTP with synthetic auth and stub dependencies; server closes in finally. That test now sends prompt references and decision thread through the real mount and rejects nested consent injection. Captures actual helper-generated central403/404/409 responses; no legacy calls/automatic second turn. Incoming bounds128/1000, strict fields, prompt response shape and cross-thread refusal covered.
- Pathlynks old-status alignment: first affected run was21pass/2fail because two exact assertions still expected503 for an upstream404. Updated the chat branch to404 under the approved status-preservation rule; voice's prior503 expectation remains. Retained/added zero-turn assertions. Existing Q15 isolated ownership falsifier still runs original-green -> ownership-bypass mutant assertion rejection -> restored-green within its test. No assertion was skipped or relaxed to a broad status range.

Self-check commands:

- Vidysea: `python -c "import ast,pathlib; ast.parse(pathlib.Path('app/api/v1/student/ai_counsellor_router.py').read_text(encoding='utf8')); ast.parse(pathlib.Path('tests/test_student_fixes.py').read_text(encoding='utf8')); print('router and test syntax OK')"` -> exit0;`router and test syntax OK`.
- Pathlynks: `node --check controllers/pathlynks_quest_controller.js` -> exit0, no output (rerun after final prompt addition).
- Vidysea: `git diff --check -- app/api/v1/student/ai_counsellor_router.py tests/test_student_fixes.py` -> exit0, no output.
- Pathlynks: `git diff --check -- controllers/pathlynks_quest_controller.js tests/parent-journey-regression.test.js` -> exit0, no output (final files).

Existing Express Promise-like-handler deprecation is printed by the mounted test; it does not fail the focused run. No whole suite, typecheck/build of unrelated work, provider call, production DB/RDS connection, external request or paid run was made. The synthetic fixture hostname is intercepted by MockTransport/fetch stubs; only the existing Pathlynks localhost HTTP server uses an actual socket. All launched runner sessions completed; no background service was left running.

## Frozen owned file SHA256

- Vidysea router: `d26fe1bde9b428c8e9f3dd9ece901ae8f739a720377c56399a555dd55d692d27`
- Vidysea existing tests: `6a340b098a13258d04909bf080f3531386bc0bba167436e36aac5372898df252`
- Pathlynks controller: `a272a1267b25cb394a154bd4af9bfbc2eee1ad5ee1a6114921aa50d4d1093744`
- Pathlynks existing tests: `28b5b80caf43bc4f8b24c6a4f4689c486e63f3de30e5b3d8ac681cc1c07a8eeb`

## Limits and root-owned acceptance

This proves the bounded host protocol behavior under synthetic local controls. It does not prove actual central candidate CAS/prompt consumption, selected-origin enforcement, DB->HTTP->graph/provider publication races, a real host issuer/account/SQL connection, full Python app bootstrap, UI mounted/browser/audio behavior, sourced answer quality, paid provider transport, deployed credentials or production readiness. The tests replace application/SQL imports; they are not ORM/driver/startup proof. Root owns integrated central/host evidence, final independent dual/security/SSE/data/AI checking, required integration gates, visible browser and separately authorized bounded real-provider proof. Host UI peer must consume returned memoryConfirmation, send the exact reference on fresh replies, include displayed owned thread on decisions, and refresh on409 without automatic generation. Missing live team assertions/KB/audio/config remain separately unverified. No feature PASS or release authorization follows from this contribution.
