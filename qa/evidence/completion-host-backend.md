# completion-host-backend — S12 bounded contribution

Status: LOCAL FOCUSED CHECKS GREEN / ready for root integration, no feature acceptance/checker PASS. Owner: completion-host-backend. Root owns integration/final checking. Historical T057 cycle2 STALLED/costs/receipts/counterexamples unchanged.

Installed protocols adopted at safe boundary: maker SHA256 236bc0e7c075f9729ef464dbd8aa2bdbec02754e95e228c936480c96d4c8fe39, checker SHA256 835d6a2764c50567b4573c7aa8f4f991430e2240a46107256b4a07d934799cf1; pinned proportional-verification/2026-10-19.17. Read current AGENTS/ARCHITECTURE, D120 and S12 allowance in manifest:107. No repin/counter reset/new feature acceptance.

## Exact owned existing seams, announced before edits
- Vidysea: D:/vc/.worktrees/vc-vidysea-backend/app/api/v1/student/ai_counsellor_router.py:45 ai_counsellor_chat; extend this router in place. Host AGENTS.md/ARCHITECTURE.md absent.
- Pathlynks actual controller: D:/vc/.worktrees/quest-pathlynks-backend/controllers/pathlynks_quest_controller.js:1110 vcQuestRequest, :1240 aiFactDecision. Actual router D:/vc/.worktrees/quest-pathlynks-backend/routes/pathlynks_quest_router.js:54 already mounts exact decision route with verifyToken; no router change needed.
- Existing focused tests: Pathlynks tests/parent-journey-regression.test.js:25 vcQuestFixture/:551 displayed-value test. Vidysea has no existing ai_counsellor test file; append offline mounted controls to existing tests/test_student_fixes.py (its legacy network test is excluded by exact -k selection).

## Stable proposed host seam for widget/integrator
Base /api/v1/student/ai-counsellor; explicit VC_STUDENT_CENTRAL_ENABLED=true; server VC_BASE_URL and VC_PARTNER_SERVER_KEY. Routes /vc/profile GET, /vc/threads GET+POST, /vc/threads/{threadId} GET, /vc/threads/{threadId}/turns POST, /vc/profile/facts/{factId}/decision POST, /vc/voice/session POST, /vc/runtime GET. Same-origin authenticated host transport; body identities/history/assertions never authority. JSON responses are central DTOs (no host wrapper), voice body {threadId}; turn body {text,clientTurnId,quest?}; decision body {action:confirm|correct|erase|reject,value?,candidateId?,expectedVersion?}. Candidate refs are paired opaque nonempty strings <=128, displayed value <=1000; reject requires refs+value; central owns CAS and returns409 memory_changed. Profile pendingChange passes through intact.

Trusted eligibility: get_current_user already verifies host token. Team must mint signed vc_eligibility claim {studentId:authenticated UUID,tenantId:server-key partner,age:integer0..120,guardianConsent:boolean,exp:future epoch seconds,purpose:virtual_counsellor}. No browser header/body proof, grade/DOB inference, signup data-sharing or fabricated production consent. Minor without explicit guardian consent is403. Active/nondisabled User joined to undeleted own Student checked with parameterized bounded SELECT. Missing/invalid proof403; staff delegation rejected on central endpoints. Existing legacy/staff /chat retained outside central student mode; selected central failures never fall through to agent.

No helper agents, new product/test modules or collections, provider/DB/external-network requests, main source/index changes, commit/push/deploy. See the loopback-test deviation below. Shell default failed before process creation; authorized escalation runner works, Node filesystem reads available.

## Final implementation and interface (authoritative over the early proposal)
- Vidysea current source ai_counsellor_chat:55 blocks legacy student /chat with409 central_session_required when VC_STUDENT_CENTRAL_ENABLED=true; legacy mode-off student route is exercised unchanged. vc_student_proxy:104 implements the fixed allowlisted GET/POST /vc resource surface above. Central failures never invoke legacy agent.chat.
- Every central route uses existing get_current_user, active/nondisabled user_obj and the parameterized one-row students/users join rooted at that same UUID. Staff cannot use central student endpoints. Team-issued signed host-token vc_eligibility claim is bound to exact authenticated UUID, configured key tenant, expiry and purpose; unknown eligibility fails403. No new claim issuer, consent provisioning or eligibility fallback is implemented.
- Config env NAMES: VC_STUDENT_CENTRAL_ENABLED, VC_BASE_URL, VC_PARTNER_SERVER_KEY. Existing Pathlynks retains VC_QUEST_ENABLED. HTTPS or explicit localhost HTTP only; server key never reaches browser/runtime metadata. Redirects and environment proxies disabled for Vidysea upstream. Connect timeout5s, HTTP I/O timeout120s, SQL await5s; incoming JSON16KiB and upstream256KiB bounded.
- Runtime GET /vc/runtime returns {mode:"central",apiBase:"/api/v1/student/ai-counsellor/vc"} after the same authentication/eligibility guard. No widget script URL is invented; host/widget owner supplies mounting config.
- Final settled central schema at packages/schemas/src/student-api.ts:75/:123 uses opaque STRING candidateId/expectedVersion <=128; current DB generates UUID strings. Both host validators now require paired bounded string refs plus displayed value for candidate decisions; numeric/boolean versions rejected400. reject requires refs+value; erase cannot carry candidate refs/value. Legacy nonreplacement confirm/correct/erase remains. No trimming/substitution of displayed value and no host-side CAS/approval manufacture.
- Pathlynks only vcQuestRequest:1110 and aiFactDecision:1250 changed relative to the captured pre-edit source. Before vcQuestRequest and after aiVoiceSession remain identical after CRLF normalization; all peer host routes/mapping/nav changes preserved. Existing router:54 already supplies verifyToken/decision mounting and was not edited here.
- Both proxies preserve upstream403/404/409;409 memory_changed is returned as {error:"memory_changed"} with no sensitive upstream payload. Other conflicts stay conflict; errors never fabricate a successful decision. Profile DTO including pendingChange passes through. Vidysea successful upstream status is preserved, including201. Input and clientTurnId are forwarded unchanged with no retry loop or hidden generation.
- Owned product/test mutations: four EXISTING files only (two isolated sources + their existing tests). Owned new artifact: this QA evidence file only. No central product edits, main D:/vc edits/index mutation, commits/push/deploy or helper agents.

## Commands and exact results
All commands run from the named isolated checkout; Python HTTP tests use FastAPI TestClient/ASGI in-process plus httpx.MockTransport, AST replacing only app/SQL imports. No application bootstrap or real DB/provider.

1. Vidysea initial RED:
   python -m pytest tests/test_student_fixes.py -k vc_central -q -p no:cacheprovider
   exit1;19 failed,1 deselected (2.35s). Concrete404 missing routes and central-enabled legacy agent reach were observed.
2. Pathlynks initial RED:
   node --test --test-name-pattern="Quest S12" tests/parent-journey-regression.test.js
   exit1;1pass/1fail. Valid candidate/version confirm returned400 instead of200.
3. Freshly settled string DTO RED:
   Vidysea -k vc_central_decision: exit1; numeric expectedVersion2 reached upstream409 instead of local400.
   Pathlynks --test-name-pattern="Quest S12 malformed": exit1; numeric version reached200 instead of400.
4. FINAL Vidysea:
   python -m pytest tests/test_student_fixes.py -k vc_central -q -p no:cacheprovider --tb=short
   exit0;24 passed,1 deselected in1.03s (wall2.85s).
   Controls: actual mounted fixed proxy routes; auth/logout denial; own UUID/SQL bounds; staff/inactive/disabled/deleted/missing proof/foreign owner+tenant/expired proof/minor denial; explicit eligible minor success; no browser identity/history/consent authority; paired/string refs+display value; reject and409;403/404/429/500/timeouts; no legacy fallback; mode-off legacy route; unchanged retry keys; pendingChange/201; invalid/duplicate query, oversized bodies/responses and redirect refusal.
5. FINAL Pathlynks (NO SOCKET TEST):
   node --test --test-name-pattern="Quest (?:VC bridge (?!actual HTTP)|memory|selection|S12)" tests/parent-journey-regression.test.js
   exit0;19pass/0fail/0cancel/0skip,436.15ms runner (wall0.61s).
   Retains existing identity, consent, selection/ownership, metadata races, displayed value, and the existing falsifier; new valid confirm/reject refs, numeric/malformed refusal,403/404/409 memory_changed safe forwarding.
6. Self-check:
   Vidysea python -c "import ast,pathlib; ast.parse(pathlib.Path('app/api/v1/student/ai_counsellor_router.py').read_text(encoding='utf8')); print('router syntax OK')"
   exit0;router syntax OK.
   Pathlynks node --check controllers/pathlynks_quest_controller.js: exit0.
   git diff --check in each isolated host: exit0 (only existing LF-to-CRLF advisory warnings).
   Read-only source-boundary comparison: prefix before vcQuestRequest and suffix after aiVoiceSession preserved=true.

## Deviations, limits and root integration items
- Two earlier affected Pathlynks selections inadvertently included the EXISTING "actual HTTP router" regression, which opens a synthetic127.0.0.1 socket and closes it in finally. The no-network task constraint was broader than that selection. It made no external/provider/DB calls, but this is a local-network execution deviation, not a claim of strictly no socket use. Final selection explicitly excludes it. No further network tests run.
- Early Vidysea GREEN attempt found fixture-only wrong dependency overrides (None db), then later lazy FastAPI route introspection in the logout control; both diagnosed and corrected without changing product logic or weakening assertions. An existing Pathlynks denied-fact assertion expected503; approved new status-preservation behavior correctly produces404, and the existing assertion now expects404 while retaining no-resource-leak checks.
- Python environment lacks sqlalchemy. Therefore full app/import startup, actual ORM/driver SQL execution, central integration, issuer token provisioning, real eligible login, mounted real frontend/browser/audio and deployment remain UNVERIFIED. AST/import-stub tests execute the actual router and SQL text/parameters but do not prove production DB permissions/types. Root retains final integration and independent checker responsibility.
- Team must provision truthful signed vc_eligibility claims into existing verified host access tokens (no browser/minted synthetic production proof). Absence fails403; no real host issuer change is owned/granted here. Root/widget owner must consume apiBase and raw central DTOs using current per-request host auth, mount one shared widget, refresh profile on409, preserve input/Retry/thread selection and stop private UI/mic on logout. KB/production audio/config remain team-owned external inputs.
- No independent checker/feature PASS, parent manifest closeout/counter reset, main source/index change, full suite, provider call, real DB access, commit/push/deploy. Historical T057 cycle2 STALLED remains. This is one local verified contribution under the named S12 allowance.

## Frozen owned source identities at handback
- vc-vidysea-backend/app/api/v1/student/ai_counsellor_router.py SHA256 bf28ccb1c7520c444bea7d8ec51fe2d9713f7ea067588b507720e50aa7cc850e
- vc-vidysea-backend/tests/test_student_fixes.py SHA256 b8b2d7912a8a50b357766bb01019d86c60bc831488741433c0a8dbe8d0082057
- quest-pathlynks-backend/controllers/pathlynks_quest_controller.js SHA256 e2ede2420588c1d2895d5e2652cee3ba167e0ad64f4890f65945a061501e8fb0
- quest-pathlynks-backend/tests/parent-journey-regression.test.js SHA256 909ac54686b24012c011184db9b17df50a0e0682b9abc4c42e6700f77f8017d2
