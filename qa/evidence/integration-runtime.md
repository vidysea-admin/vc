# integration-runtime — S12 owned integration

Recorded-at: 2026-10-27T15:45:11.496Z
T-057 / cycle2 / named S12 preserved-lineage recovery. Maker implementation and self-check evidence only; no feature verdict, reset, checker PASS, commit, push or deploy.

## Outcome and open boundary

Owned runtime integration is implemented in existing files. Last complete affected run: 157 tests,157 pass,0 fail,0 skipped (2026-10-27T15:37:54.804Z). A later focused self-review added a new counterexample in the SAME existing test file and it FAILS on the current input: real preferences after 24 legacy authoritative account rows are unreachable. Do not describe current candidate as all-green or feature-ready.

Concrete external ownership blocker: packages/db/src/profile-facts.ts:listProfileFacts:198-215 applies limit at207 before filtering authoritative keys at211. With 24 legacy rows followed by a legitimate confirmed interest, it returns zero rows and loses the raw continuation position; apps/api/src/chat.ts:profileView receives neither the fact nor a usable next cursor. The new test accepts either a first-page result or advancing bounded pages; it does not prescribe implementation. DB source is outside this worker ownership and was left untouched. Root/DB owner must repair this exact boundary and rerun the named reproduction plus impacted consumers. This is a new measured S12 compatibility gap, not a reset of the old T057 failures.

## Interfaces and behavior

- apps/api/src/chat.ts:publicFactKey canonicalizes preference aliases while retaining public target-country and DB target_country. profileView/withRanking/loadStudentMemoryContext prioritize confirmed canonical preferences over older supplied aliases and exclude learned legacy authoritative account keys. Supplied grade remains read-only and usable. Existing currentMemoryPrompt, explicit yes/no, publication CAS, immutable completed history, Retry, crisis/fence/consent and detached extraction mechanisms were preserved.
- ChatApiDeps.platformForTenant(verifiedTenant) returns Pick<StudentGraphDeps, pathlynks|vidysea|navCatalogue|pathlynksTimeoutMs> or undefined. index.ts selects exactly one enabled postgresSourceForTenant, never bootstrap-falls back for a different tenant. Pathlynks legacy injection remains restricted to its trusted bootstrap fixture. Each platform has its own factory and navigation loader. Policy remains the existing fresh per-tenant resolveMemoryPolicy seam.
- Adopted peer createLiveVidyseaPort(store,{env,seeded,siteId}) native raw result methods getStudentProfile/getShortlistedProgrammes/getProfileAssessment, structurally consumed as VidyseaReadonlyPort. No programmes-to-careers or classifications-to-psychometric equivalence. Unsupported Pathlynks concepts on a Vidysea graph return unavailable, not empty success. Native allow-listed display labels carry programme/university names and profile classification.
- index.ts live profile maps actual Vidysea academic_level, field_of_interest, target_intake, budget_range_text and preferred_countries projections, with source=vidysea; name is used only by existing redaction, never learned. Source profile lookup stays tenant-selected and bounded. No browser secret or arbitrary env lookup added.
- createQuestVoiceTools(firstArg,graph,existing) remains compatible with the legacy string tenant argument and additionally accepts a verified-tenant graph resolver. Native tool declarations are vidysea_profile,vidysea_shortlisted_programmes,vidysea_profile_assessment. Identity arguments are refused; no graph is selected for another/unconfigured tenant. Existing voice consent/memory guards remain owned by the voice worker. Native resolver is tested directly; actual native end-to-end WS/host/browser acceptance remains root-owned.
- Existing classify.ts,graph.ts and skills/vc-capabilities/SKILL.md registry are extended together. InternalMemorySchema accepts truthful vidysea source. OpenAPI documents pendingChange, MemoryPrompt, current candidate/version/displayed-value binding, reject, text confirmation refs and voice event fields. Strict schema-parity tests retain all legacy fields and add the new fields.

## Scope and process

Bound root: D:/vc/.worktrees/vc-completion. No qa/adapter.json override was relied upon. Read project AGENTS/ARCHITECTURE, D-120, installed maker/checker and supplied approved S12 plan/independent plan review. Policy proportional-verification/2026-10-19.17 and pinned protocol hashes retained: maker236bc0e7c075f9729ef464dbd8aa2bdbec02754e95e228c936480c96d4c8fe39; checker835d6a2764c50567b4573c7aa8f4f991430e2240a46107256b4a07d934799cf1. No fresh feature, repin, policy-check success, feature counter or cost rewrite. No helper/checker dispatch during BUILDING; shared owner lanes were already assigned.

Round: 12 existing owned source/test/skill files; canonical memory, native runtime, compatibility/DTO consumers; approximately25min source-based local integration/self-check effort plus report reserve. Actual work also includes a focused DB counterexample; no new product/test module, helper or collection. Existing root/peer content was read live and edited in place. Main checkout/index unchanged. No edits to admin-routes.ts,voice.ts,schemas,DB,widget,host backend/UI or config by this worker. Blue/white widget controls and geometry were untouched.

exec_command failed before process creation: helper_unknown_error / setup refresh had errors. Node tool fs and child_process.execFile succeeded; exact executable C:/Program Files/nodejs/node.exe, runtime v24.13.1. Local loopback HTTP/WS and in-memory fake Mongo only. No real provider, RDS, production DB, external credentials or student data call. Token/cost telemetry unavailable; never reported zero.

The initial baseline command (before the results recorder was created) was node --import tsx --test --test-reporter=spec --test-concurrency=2 apps/api/tests/chat-profile.test.ts packages/engine/tests/pathlynks-tools.test.ts, exit1; reproduced the three handoff proposal-shape assertions. Its full tool output was displayed; later executions below preserve their recorded stdout. Fixes preserve/assert legacy fields and candidate metadata rather than remove safety checks.

## Executions (actual argv/results, failures retained)

### s12-red

Started: 2026-10-27T15:28:38.353Z; exit 1

```text
C:/Program Files/nodejs/node.exe --import tsx --test --test-reporter=spec "--test-name-pattern=^S12 runtime" --test-concurrency=2 apps/api/tests/chat-profile.test.ts packages/engine/tests/pathlynks-tools.test.ts
```

```text
✖ S12 runtime: canonical latest confirmed preference wins while authoritative supplied grade remains (732.4782ms)
✔ S12 runtime HTTP: exact old/new prompt, fresh owned yes/no, immutable history and intentional Retry (4875.8277ms)
✖ S12 runtime: Vidysea native programme/profile tools retain truthful labels, isolation and unsupported concepts (558.5524ms)
ℹ tests 3
ℹ suites 0
ℹ pass 1
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 48207.4824

✖ failing tests:

test at apps\api\tests\chat-profile.test.ts:1:71136
✖ S12 runtime: canonical latest confirmed preference wins while authoritative supplied grade remains (732.4782ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    [
      {
  +     key: 'preferred_country',
  +     source: 'vidysea',
  +     value: 'Old supplied Germany'
  +   },
  +   {
        key: 'grade',
        source: 'vidysea',
        value: '12'
      },
      {
  +     key: 'target_country',
  -     key: 'target-country',
        source: 'student-confirmed',
        value: 'Canada'
      }
    ]
  
      at TestContext.<anonymous> (D:\vc\.worktrees\vc-completion\apps\api\tests\chat-profile.test.ts:1402:9)
      at async Test.run (node:internal/test_runner/test:1110:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:358:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: [ { key: 'preferred_country', value: 'Old supplied Germany', source: 'vidysea' }, { key: 'grade', value: '12', source: 'vidysea' }, { key: 'target_country', value: 'Canada', source: 'student-confirmed' } ],
    expected: [ { key: 'grade', value: '12', source: 'vidysea' }, { key: 'target-country', value: 'Canada', source: 'student-confirmed' } ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at packages\engine\tests\pathlynks-tools.test.ts:1:17959
✖ S12 runtime: Vidysea native programme/profile tools retain truthful labels, isolation and unsupported concepts (558.5524ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + 'search_kb'
  - 'vidysea_profile'
  
      at TestContext.<anonymous> (D:\vc\.worktrees\vc-completion\packages\engine\tests\pathlynks-tools.test.ts:367:60)
      at async Test.run (node:internal/test_runner/test:1110:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:358:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'search_kb',
    expected: 'vidysea_profile',
    operator: 'strictEqual',
    diff: 'simple'
  }

```

### s12-green

Started: 2026-10-27T15:34:15.656Z; exit 1

```text
C:/Program Files/nodejs/node.exe --import tsx --test --test-reporter=spec "--test-name-pattern=^S12 runtime" --test-concurrency=2 apps/api/tests/chat-profile.test.ts packages/engine/tests/pathlynks-tools.test.ts
```

```text
✔ S12 runtime: canonical latest confirmed preference wins while authoritative supplied grade remains (110.7201ms)
✔ S12 runtime HTTP: exact old/new prompt, fresh owned yes/no, immutable history and intentional Retry (114.7946ms)
✖ S12 runtime: Vidysea native programme/profile tools retain truthful labels, isolation and unsupported concepts (104.7705ms)
ℹ tests 3
ℹ suites 0
ℹ pass 2
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2664.9526

✖ failing tests:

test at packages\engine\tests\pathlynks-tools.test.ts:1:17959
✖ S12 runtime: Vidysea native programme/profile tools retain truthful labels, isolation and unsupported concepts (104.7705ms)
  Error [StudentAuthRequiredError]: A verified student identity (role student, studentId, tenantId) is required on the student surface (B21, B24.5).
      at invalidInputError (D:\vc\.worktrees\vc-completion\packages\engine\src\student\graph.ts:557:10)
      at RunnableCallable.func (D:\vc\.worktrees\vc-completion\packages\engine\src\student\graph.ts:807:13)
      at <anonymous> (D:\vc\.worktrees\vc-completion\node_modules\.pnpm\@langchain+langgraph@1.4.17_cc76aed67886c5943c5b0155fd1b3ef7\node_modules\@langchain\langgraph\src\utils.ts:87:26)
      at AsyncLocalStorage.run (node:internal/async_local_storage/async_context_frame:63:14)
      at AsyncLocalStorageProvider.runWithConfig (D:\vc\.worktrees\vc-completion\node_modules\.pnpm\@langchain+core@1.2.12_@ope_a7924e81f62c5665ac9d8e70289c3697\node_modules\@langchain\core\src\singletons\async_local_storage\index.ts:88:20)
      at RunnableCallable.invoke (D:\vc\.worktrees\vc-completion\node_modules\.pnpm\@langchain+langgraph@1.4.17_cc76aed67886c5943c5b0155fd1b3ef7\node_modules\@langchain\langgraph\src\utils.ts:85:62)
      at RunnableSequence.invoke (D:\vc\.worktrees\vc-completion\node_modules\.pnpm\@langchain+core@1.2.12_@ope_a7924e81f62c5665ac9d8e70289c3697\node_modules\@langchain\core\src\runnables\base.ts:1980:30)
      at async _runWithRetry (D:\vc\.worktrees\vc-completion\node_modules\.pnpm\@langchain+langgraph@1.4.17_cc76aed67886c5943c5b0155fd1b3ef7\node_modules\@langchain\langgraph\src\pregel\retry.ts:123:18)
      at async PregelRunner._executeTasksWithRetry (D:\vc\.worktrees\vc-completion\node_modules\.pnpm\@langchain+langgraph@1.4.17_cc76aed67886c5943c5b0155fd1b3ef7\node_modules\@langchain\langgraph\src\pregel\runner.ts:354:27)
      at async PregelRunner.tick (D:\vc\.worktrees\vc-completion\node_modules\.pnpm\@langchain+langgraph@1.4.17_cc76aed67886c5943c5b0155fd1b3ef7\node_modules\@langchain\langgraph\src\pregel\runner.ts:150:37) {
    pregelTaskId: '2fd6f3cb-496e-5f2a-9263-815bf1ff569a'
  }

```

### api-typecheck

Started: 2026-10-27T15:34:26.282Z; exit 2

```text
C:/Program Files/nodejs/node.exe node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json
```

```text
packages/engine/src/student/graph.ts(171,7): error TS2739: Type '{ kb_source_detail: string; source_freshness: string; coverage: string; rank_options: string; profile_view: string; profile_confirm: string; profile_correct: string; data_export: string; data_erasure: string; channel_switch: string; }' is missing the following properties from type 'Record<"data_erasure" | "data_export" | "profile_correct" | "profile_confirm" | "profile_view" | "rank_options" | "source_freshness" | "kb_source_detail" | "coverage" | "channel_switch" | "vidysea_profile" | "vidysea_shortlisted_programmes" | "vidysea_profile_assessment", string>': vidysea_profile, vidysea_shortlisted_programmes, vidysea_profile_assessment
packages/engine/src/student/graph.ts(929,24): error TS2366: Function lacks ending return statement and return type does not include 'undefined'.
packages/engine/src/student/graph.ts(964,19): error TS2454: Variable 'message' is used before being assigned.

```

### engine-typecheck

Started: 2026-10-27T15:34:36.693Z; exit 2

```text
C:/Program Files/nodejs/node.exe node_modules/typescript/bin/tsc --noEmit -p packages/engine/tsconfig.json
```

```text
packages/engine/src/student/graph.ts(171,7): error TS2739: Type '{ kb_source_detail: string; source_freshness: string; coverage: string; rank_options: string; profile_view: string; profile_confirm: string; profile_correct: string; data_export: string; data_erasure: string; channel_switch: string; }' is missing the following properties from type 'Record<"data_erasure" | "data_export" | "profile_correct" | "profile_confirm" | "profile_view" | "rank_options" | "source_freshness" | "kb_source_detail" | "coverage" | "channel_switch" | "vidysea_profile" | "vidysea_shortlisted_programmes" | "vidysea_profile_assessment", string>': vidysea_profile, vidysea_shortlisted_programmes, vidysea_profile_assessment
packages/engine/src/student/graph.ts(929,24): error TS2366: Function lacks ending return statement and return type does not include 'undefined'.
packages/engine/src/student/graph.ts(964,19): error TS2454: Variable 'message' is used before being assigned.

```

### s12-green-correct-fixture

Started: 2026-10-27T15:35:07.542Z; exit 0

```text
C:/Program Files/nodejs/node.exe --import tsx --test --test-reporter=spec "--test-name-pattern=^S12 runtime" --test-concurrency=2 apps/api/tests/chat-profile.test.ts packages/engine/tests/pathlynks-tools.test.ts
```

```text
ℹ tests 3
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 2126.3927
```

### s12-runtime-boot-voice

Started: 2026-10-27T15:36:18.004Z; exit 0

```text
C:/Program Files/nodejs/node.exe --import tsx --test --test-reporter=spec "--test-name-pattern=^S12 runtime" --test-concurrency=2 apps/api/tests/chat-profile.test.ts packages/engine/tests/pathlynks-tools.test.ts apps/api/tests/voice-wiring.test.ts
```

```text
ℹ tests 5
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 3190.2112
```

### affected-runtime

Started: 2026-10-27T15:36:45.210Z; exit 1

```text
C:/Program Files/nodejs/node.exe --import tsx --test --test-reporter=spec --test-concurrency=2 apps/api/tests/chat-profile.test.ts apps/api/tests/chat-rank.test.ts apps/api/tests/chat-pathlynks.test.ts apps/api/tests/voice-wiring.test.ts apps/api/tests/student-openapi.test.ts apps/api/tests/partner-openapi.test.ts packages/engine/tests/pathlynks-tools.test.ts
```

```text
guards are not installed","ts":"2026-10-27T15:36:58.083Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:36:58.175Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:36:58.297Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:36:58.357Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:36:58.417Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:36:58.512Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:36:58.609Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:36:58.653Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:36:58.694Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:36:58.740Z"}
✔ W6: flag on -> startApi fails closed BEFORE connecting to Mongo or listening, for each of: no go-live gate, tracing on, no live provider, no crisis message, short secret, bad base URL, bad flag value (961.73ms)
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:36:58.869Z"}
✔ W7: flag on and gates open -> in a started process the session route mints a token, the WebSocket upgrades, a start reaches the provider, and a wrong token is refused (131.9369ms)
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:36:58.970Z"}
✔ W7: the WebSocket secret and base URL default to VC_VOICE_WS_SECRET and VC_VOICE_WS_BASE_URL when the options are not supplied (97.2362ms)
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:36:59.173Z"}
✔ W8: stop() finalizes a live voice session before the database client closes, and its usage is recorded (198.967ms)
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:36:59.445Z"}
✔ W9: a voice crisis in a started process reaches the SAME escalateForTenant port the text chat uses (one flag, one escalation) (277.4465ms)
{"event":"escalation_unrouted","escalationId":"th-w:v66e52353000001","sessionId":"th-w"}
✔ W9: with chat off, a voice crisis goes through the engine's escalateTurns exactly like the text path default (notification records are written) (119.7637ms)
✔ S12 runtime voice tools: verified tenant selects native data and navigation without cross-platform fallback (86.3781ms)
[student-graph] pathlynks write failed (Error)
[student-graph] pathlynks write failed (Error)
[student-graph] pathlynks write failed (Error)
[student-graph] pathlynks write failed (Error)
✔ VA13/VA15: the five new tools are registered with the right executedBy and anonymous flags (1.1934ms)
✔ VA15: STUDENT_TOOLS equals the vc-capabilities tables exactly (name, executedBy, anonymous flag), both directions (3.3752ms)
✔ classifyIntent routes the Pathlynks and navigation asks to the new tools, and leaves KB questions alone (5.8779ms)
✔ VA13: each tool answers from the verified student's own rows, calling the port with that student id only (80.5245ms)
✔ VA13: student A asking about student B (id in the text) gets only A's data or a refusal; the port is never called with B (103.1247ms)
✔ VA13: B's turn gets B's rows (the two-student fake is real), and a partner srv key context uses the partner id as tenant and the verified student id (5.8283ms)
✔ VA13: the anonymous (Vidysea visitor) route can call none of the four Pathlynks tools (33.2832ms)
✔ VA13: the fixed unavailable line is exact (0.0768ms)
[student-graph] nav_catalogue write failed (Error)
✔ VA13: a port that returns unavailable, throws, hangs, returns garbage or is not configured still answers with the fixed line and leaks nothing (193.549ms)
✔ VA13: a throwing port reports a text-free write error (the kind only), never the message (5.3982ms)
✔ VA14: navigate_steps in the graph returns text steps from the catalogue; unknown / failing / absent catalogue is the unknown text (20.199ms)
✔ VA15: a crisis message that also asks for saved careers or navigation gets the fixed crisis reply and no tool is called (call count 0) (14.7028ms)
✔ E2: a third-person pronoun (she / he / they) is refused, never answered with the signed-in student's own saved careers (28.171ms)
✔ E3 (G6): a Pathlynks row carrying phone, email, dob, guardian_name, address, tenant_id and password_hash replies with none of those values (19.1217ms)
✔ Q9: public greetings and service-directed study questions are generic (0.2931ms)
✔ Q9: exact small-talk helper rejects mixed requests, private data and PII (0.1839ms)
✔ Q9: service-directed me never removes own-case/account/PII guards (0.5172ms)
✔ Q4: actual authenticated graph consumes multilingual task recipes without private reads (34.9768ms)
✔ S12 runtime: Vidysea native programme/profile tools retain truthful labels, isolation and unsupported concepts (24.0801ms)
ℹ tests 156
ℹ suites 0
ℹ pass 154
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 14554.8361

✖ failing tests:

test at apps\api\tests\partner-openapi.test.ts:1:11784
✖ D1: component schemas match the Zod shapes (names, required, strictness) and are the very objects of the student draft (3.9581ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    [
      'AnonymousError',
      'AnonymousTurnRequest',
      'AnonymousTurnResponse',
      'Claim',
      'Error',
      'FactDecisionRequest',
  +   'MemoryConfirmation',
      'MemoryGraph',
      'MemoryItem',
  +   'MemoryPrompt',
  +   'PendingProfileChange',
      'ProfileFact',
      'ProfileResponse',
      'ProposedFact',
      'QuestContext',
      'Source',
  
      at TestContext.<anonymous> (D:\vc\.worktrees\vc-completion\apps\api\tests\partner-openapi.test.ts:273:10)
      at Test.runInAsyncScope (node:async_hooks:214:14)
      at Test.run (node:internal/test_runner/test:1103:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:785:18)
      at Test.postRun (node:internal/test_runner/test:1232:19)
      at Test.run (node:internal/test_runner/test:1160:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:785:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: [
      'AnonymousError',        'AnonymousTurnRequest',
      'AnonymousTurnResponse', 'Claim',
      'Error',                 'FactDecisionRequest',
      'MemoryConfirmation',    'MemoryGraph',
      'MemoryItem',            'MemoryPrompt',
      'PendingProfileChange',  'ProfileFact',
      'ProfileResponse',       'ProposedFact',
      'QuestContext',          'Source',
      'Thread',                'ThreadCreateRequest',
      'ThreadCreated',         'ThreadList',
      'ThreadMetadata',        'ThreadTurn',
      'TurnRequest',           'TurnResponse'
    ],
    expected: [
      'AnonymousError',        'AnonymousTurnRequest',
      'AnonymousTurnResponse', 'Claim',
      'Error',                 'FactDecisionRequest',
      'MemoryGraph',           'MemoryItem',
      'ProfileFact',           'ProfileResponse',
      'ProposedFact',          'QuestContext',
      'Source',                'Thread',
      'ThreadCreateRequest',   'ThreadCreated',
      'ThreadList',            'ThreadMetadata',
      'ThreadTurn',            'TurnRequest',
      'TurnResponse'
    ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at apps\api\tests\student-openapi.test.ts:1:5492
✖ WebSocket events: every Zod event type is documented with matching fields, client and server (0.2604ms)
  TypeError: options is not iterable
      at check (D:\vc\.worktrees\vc-completion\apps\api\tests\student-openapi.test.ts:137:23)
      at TestContext.<anonymous> (D:\vc\.worktrees\vc-completion\apps\api\tests\student-openapi.test.ts:145:3)
      at Test.runInAsyncScope (node:async_hooks:214:14)
      at Test.run (node:internal/test_runner/test:1103:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:785:18)
      at Test.postRun (node:internal/test_runner/test:1232:19)
      at Test.run (node:internal/test_runner/test:1160:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:785:7)

```

### affected-runtime-repaired

Started: 2026-10-27T15:37:54.804Z; exit 0

```text
C:/Program Files/nodejs/node.exe --import tsx --test --test-reporter=spec --test-concurrency=2 apps/api/tests/chat-profile.test.ts apps/api/tests/chat-rank.test.ts apps/api/tests/chat-pathlynks.test.ts apps/api/tests/voice-wiring.test.ts apps/api/tests/student-openapi.test.ts apps/api/tests/partner-openapi.test.ts packages/engine/tests/pathlynks-tools.test.ts
```

```text
✔ VA13 via chat: a Pathlynks-tenant student asking for saved careers, compare list, assessment and profile gets their OWN rows, the port sees only the verified id (119.7992ms)
✔ G6: phone, email, address, parent and date-of-birth columns never reach the reply, the stored turn or the model input, whatever the table returns (44.6694ms)
✔ G6: a column that is not on the allow-list is dropped even when its name looks harmless or the table gains a new one tomorrow (21.0021ms)
✔ VA13 via chat: student A asking about student B (by id, by relation) gets a refusal or A's own data; B's rows never appear and the port never sees B (75.0001ms)
✔ VA13 via chat: a student of ANOTHER tenant is never looked up in the Pathlynks database, even with an id that exists there (port calls 0) (17.1604ms)
✔ VA13 via chat: no port configured, an unavailable port and a port that throws all answer the one fixed line and leak no host, SQL or secret (59.9572ms)
✔ VA15 via chat: a crisis message that also asks for saved careers gets the helpline, with the Pathlynks port called 0 times (17.2424ms)
✔ VA13 via chat: the anonymous route cannot reach the Pathlynks tools: 'show my saved careers' asks the visitor to sign in and no port exists to call (13.0565ms)
✔ VA12/VA13: the adapter maps mcp rows to the engine port (one row or none for profile and assessment, many for lists) and every failure to plain unavailable (0.3606ms)
✔ Q1/Q7 cycle1: 51+ saved/compare records retain a truthful lower bound through live adapter -> HTTP/graph (89.2476ms)
✔ VA12: the live port is built from the stored postgres source: no source, no password or a missing table is unavailable; with a stored secret it connects through the fake driver, read-only (1.7646ms)
✔ VA14: the navigation catalogue loader returns the newest nav_catalogue artifact of the site's GitHub sources, caches for 60 s, and is undefined when there is none (0.9905ms)
✔ Q7 actual live-port adapter -> HTTP/engine with same-schema populated and empty fixtures (50.4279ms)
✔ A16b: the profile shows the Pathlynks-supplied facts as in use and nothing else when the student has said nothing storable (28.1233ms)
✔ A16b: a fact heard in chat is proposed back, is NOT in the facts in use, and only becomes one after the student confirms it (93.744ms)
✔ A16b: a student corrects a wrongly heard fact (the corrected value is redacted and confirmed) and erases another (27.5584ms)
✔ A16b: a decision on a fact that does not exist, or on another student's fact, is 404; a bad decision body is 400 (23.4962ms)
✔ D-093 4A: for an under-18 student without consent nothing is extracted or proposed, so no fact row is created (10.765ms)
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:57.005Z"}
{"level":"info","event":"admin_sources_seeded","created":0,"existing":0,"ts":"2026-10-27T15:37:57.014Z"}
✔ a Pathlynks profile outage is a 503 profile_unavailable (never an empty profile that hides what is in use), with no cause in the body (9.1964ms)
{"level":"error","event":"chat_fact_extraction_failed","ts":"2026-10-27T15:37:57.054Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:57.066Z"}
✔ Q1/Q14: default live profile grounds ordinary guidance, projects grade only and never looks up an unconsented student (63.3714ms)
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:57.084Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:57.091Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:57.098Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:57.103Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:57.111Z"}
✔ startApi: flag off -> a chat path answers exactly like an unknown /v1 path over real HTTP, and no gate file is read (14.178ms)
✔ startApi: flag on with a temp copy of the real repo gates (B13 set back to pending) refuses to start, BEFORE connecting to Mongo (11.1276ms)
✔ startApi: chat flag on, NO gatesDir and VC_GATE_APPROVER unset -> the default gates dir (the real repo qa/gates) refuses to start, BEFORE connecting to Mongo (4.739ms)
✔ startApi: flag on with the gate open but no student JWT configuration is a config error before connecting (no silent fall-back to the counsellor key) (13.105ms)
{"level":"error","event":"chat_fact_extraction_failed","ts":"2026-10-27T15:37:57.136Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:57.147Z"}
✔ startApi: flag on and gate open -> a student creates a thread and asks a question over real HTTP; the rows land in virtual_counsellor under the student's tenant; a counsellor-key token is refused (34.8363ms)
{"event":"provider_failover_exhausted","models":["glm-5.3-flash","deepseek-v4.1-flash"],"attempts":2,"lastErrorName":"ModelOutputSchemaError"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:57.187Z"}
✔ LK1w: VC_TEXT_CHAIN set -> a student chat turn is answered by the chain (Ollama hop on the wire) and the injected scribe/classifier provider is not called (40.8846ms)
{"event":"provider_failover_exhausted","models":["glm-5.3-flash","deepseek-v4.1-flash"],"attempts":2,"lastErrorName":"ModelOutputSchemaError"}
{"level":"error","event":"chat_fact_extraction_failed","ts":"2026-10-27T15:37:57.195Z"}
{"level":"error","event":"chat_fact_extraction_failed","ts":"2026-10-27T15:37:57.215Z"}
✔ LK1w: VC_TEXT_CHAIN unset -> the student chat turn uses the current provider and nothing is sent to Ollama (34.0367ms)
✔ LK1w: VC_TEXT_CHAIN does not replace the scribe provider config: with no injected provider, no VC_LLM_PROVIDER and the classifier injected (so only the scribe base is read), startApi still refuses before connecting (0.4599ms)
✔ LK1w: a bad chain (no OLLAMA_API_KEY) is a startup config error before connecting, and its message never carries a key (0.1877ms)
✔ p1-lk6: a Devanagari chat turn is stored as written, and the proposed fact is English with the Devanagari quote kept as its source (62.4106ms)
✔ p1-lk6: a fact whose quote is not in the student's words is never proposed (18.2099ms)
✔ p1-lk6: an under-18 student without guardian consent makes no extraction call (9.6455ms)
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:57.331Z"}
✔ p1-lk6: extraction failure never fails the turn; the log has the event name, no student words or quote (19.1952ms)
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:57.360Z"}
✔ p1-lk6: startApi wires the default extractor for chat when none is injected, over the default text provider (29.2629ms)
✔ p1-lk6: an injected extractFacts still wins over the default (27.3078ms)
✔ p1-lk6: a crisis turn is answered with the fixed helpline text and is never sent to the fact extractor model (15.4651ms)
✔ p1-lk9 C2: an extractor that never resolves does not block the reply, and the reply is complete (14.8767ms)
✔ p1-lk9 C2: an extractor that rejects is logged text-free and is never an unhandled rejection; the turn is unaffected (16.4331ms)
✔ p1-lk9 C2: a throwing logger and a synchronous extractor throw are also never an unhandled rejection (17.9411ms)
✔ p1-lk9 C2: an erasure that starts after the reply but before extraction resolves still prevents the fact write (StudentFencedError on the detached path) (16.3311ms)
✔ p1-lk9 C2: proposed facts are absent from GET chat/profile while extraction is pending and appear once it resolves (17.3977ms)
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:57.507Z"}
✔ p1-lk9 C2: extraction still happens only in the stores-text branch (a replay and an unconsented minor never start it) (19.4569ms)
{"event":"provider_failover_exhausted","models":["glm-5.3-flash","deepseek-v4.1-flash"],"attempts":2,"lastErrorName":"ModelOutputSchemaError"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:57.545Z"}
✔ LK7 L1: with VC_TEXT_CHAIN set, an authenticated turn's language comes from the MODEL detector (on the chain wire), and the answer call is told that reply language (39.2527ms)
{"event":"provider_failover_exhausted","models":["glm-5.3-flash","deepseek-v4.1-flash"],"attempts":2,"lastErrorName":"ModelOutputSchemaError"}
{"level":"error","event":"chat_fact_extraction_failed","ts":"2026-10-27T15:37:57.553Z"}
{"level":"error","event":"chat_fact_extraction_failed","ts":"2026-10-27T15:37:57.565Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:57.571Z"}
✔ LK7 L2: VC_TEXT_CHAIN unset -> no model detector call exists anywhere (offline script test only) and nothing is sent to Ollama (25.7709ms)
{"event":"escalation_unrouted","escalationId":"aea5767f-2c69-4fc1-ba76-bcabe228f0f2:lk7-1","sessionId":"aea5767f-2c69-4fc1-ba76-bcabe228f0f2"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:57.597Z"}
✔ LK7 C1: crisisGuard still runs FIRST on the original text: a crisis turn makes no detector, screen or chain call and gets the fixed message (26.4542ms)
{"level":"error","event":"chat_fact_extraction_failed","ts":"2026-10-27T15:37:57.622Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:57.628Z"}
✔ LK7 S1: the safety screen is on for authenticated turns by default: 'possible' returns the fixed crisis message with no answer; the screen saw the original text (30.3842ms)
{"level":"error","event":"chat_fact_extraction_failed","ts":"2026-10-27T15:37:57.651Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:57.668Z"}
{"level":"error","event":"chat_write_failed","ts":"2026-10-27T15:37:57.685Z","write":"safety_screen"}
{"level":"error","event":"alert_safety_screen_outage","write":"safety_screen"}
{"level":"error","event":"chat_fact_extraction_failed","ts":"2026-10-27T15:37:57.687Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:57.694Z"}
✔ LK7 S2: a clear screen releases the normal answer; a screen outage fails closed to the fixed crisis message (D-105) (65.1911ms)
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:57.720Z"}
✔ LK7 S3: with the chain set, the screen still runs on the classifier's base provider (D-105 Q4: a task moves to the chain only after its own eval), never on the chain (26.8156ms)
{"event":"provider_failover_exhausted","models":["glm-5.3-flash","deepseek-v4.1-flash"],"attempts":2,"lastErrorName":"ModelOutputSchemaError"}
{"level":"error","event":"chat_fact_extraction_failed","ts":"2026-10-27T15:37:57.728Z"}
{"level":"error","event":"chat_fact_extraction_failed","ts":"2026-10-27T15:37:57.740Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:57.745Z"}
{"level":"error","event":"chat_fact_extraction_failed","ts":"2026-10-27T15:37:57.765Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:57.769Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:57.771Z"}
✔ LK7 S4: chat.safetyScreen = false turns the authenticated screen off (no classifier call); a supplied screen provider is the one used (50.2525ms)
{"level":"error","event":"alert_chain_cap_80pct","month":"2026-11","capUsd":1,"spentUsd":1}
{"level":"error","event":"alert_chain_cap_exhausted","month":"2026-11","capUsd":1,"spentUsd":1}
{"level":"error","event":"alert_chain_cap_80pct","month":"2026-11","capUsd":1,"spentUsd":0.9}
{"level":"error","event":"alert_chain_cap_exhausted","month":"2026-11","capUsd":1,"spentUsd":0.9}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:57.777Z"}
✔ LK7 P1: VC_TEXT_CHAIN set and the cap missing or invalid -> startApi refuses (fail closed) BEFORE connecting, naming the variable and never a key (0.8331ms)
✔ LK7 P2: a valid cap starts the chain; with VC_TEXT_CHAIN unset the cap is not required (4.1791ms)
✔ LK7 G1: the guard reserves the estimate before a request, refuses one that would pass the cap with a NON-retryable error, and settles a reported usage to the actual figure (0.5057ms)
✔ LK7 G2: the cap is per UTC calendar month: a new month starts at zero, and a usage settled after the month turned does not touch the new month (0.4769ms)
{"level":"error","event":"alert_chain_cap_exhausted","month":"2026-10","capUsd":0.03,"spentUsd":0.020284}
{"level":"error","event":"chat_fact_extraction_failed","ts":"2026-10-27T15:37:57.798Z"}
{"level":"error","event":"alert_chain_cap_80pct","month":"2026-10","capUsd":0.03,"spentUsd":0.028972}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:57.832Z"}
✔ LK7 E1: when the cap runs out mid-month, student turns get the existing degraded reply over real HTTP (200, never a 500), no request leaves after the stop, and spend never passes the cap (55.1737ms)
{"event":"provider_failover_exhausted","models":["glm-5.3-flash","deepseek-v4.1-flash"],"attempts":2,"lastErrorName":"ModelOutputSchemaError"}
{"level":"error","event":"chat_fact_extraction_failed","ts":"2026-10-27T15:37:57.854Z"}
{"event":"provider_failover_exhausted","models":["glm-5.3-flash","deepseek-v4.1-flash"],"attempts":2,"lastErrorName":"ModelOutputSchemaError"}
{"event":"provider_failover_exhausted","models":["glm-5.3-flash","deepseek-v4.1-flash"],"attempts":2,"lastErrorName":"ModelOutputSchemaError"}
{"level":"error","event":"chat_fact_extraction_failed","ts":"2026-10-27T15:37:57.870Z"}
{"event":"provider_failover_exhausted","models":["glm-5.3-flash","deepseek-v4.1-flash"],"attempts":2,"lastErrorName":"ModelOutputSchemaError"}
{"event":"provider_failover_exhausted","models":["glm-5.3-flash","deepseek-v4.1-flash"],"attempts":2,"lastErrorName":"ModelOutputSchemaError"}
{"level":"error","event":"chat_fact_extraction_failed","ts":"2026-10-27T15:37:57.890Z"}
{"event":"provider_failover_exhausted","models":["glm-5.3-flash","deepseek-v4.1-flash"],"attempts":2,"lastErrorName":"ModelOutputSchemaError"}
{"event":"provider_failover_exhausted","models":["glm-5.3-flash","deepseek-v4.1-flash"],"attempts":2,"lastErrorName":"ModelOutputSchemaError"}
{"level":"error","event":"chat_fact_extraction_failed","ts":"2026-10-27T15:37:57.918Z"}
{"event":"provider_failover_exhausted","models":["glm-5.3-flash","deepseek-v4.1-flash"],"attempts":2,"lastErrorName":"ModelOutputSchemaError"}
✔ LK7 E2: reported token usage settles the spend to the actual figure, so the same cap serves more turns than the reservation alone would (166.8282ms)
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:58.157Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:58.198Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:58.249Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:58.311Z"}
✔ LK7 X1: when every hop of the chain fails (the whole chain is exhausted) the turn is the degraded reply, the failover alert still fires, and the exhaustion is counted (142.4264ms)
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:58.361Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:58.458Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:58.515Z"}
✔ LK7 C1-fix R1: chat on + screen on + a rules base provider (no concern-classifier) -> startApi REFUSES with a named error, before connecting, naming no key (87.4759ms)
✔ LK7 C1-fix R2: the same rules base with the screen switched off in code (chat.safetyScreen = false) starts; so does chat off (110.3807ms)
✔ LK7 C1-fix R3: a rules base is fine when the screen has its own classifier-capable provider (the screen's provider is what counts), and a refusal names the screen provider (151.6436ms)
{"level":"error","event":"chat_fact_extraction_failed","ts":"2026-10-27T15:37:58.601Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:58.696Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:58.741Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:58.783Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:58.831Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:58.885Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:58.958Z"}
✔ LK7 C1-fix R4: a classifier-capable base starts and an ordinary question is ANSWERED (not escalated, no crisis message) (185.5283ms)
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:37:59.017Z"}
{"level":"warn","event":"reserved_tenant_ids_empty","message":"VC_RESERVED_TENANT_IDS is empty or unset: only the built-in reserved names, this repo's own tenants and the sandbox tenant are protected, so the real student-JWT tenants are unprotected (a partner id equal to one of them would be accepted and its server key would reach that tenant's students). List every \"tenant\" your student JWTs carry in VC_RESERVED_TENANT_IDS.","ts":"2026-10-27T15:37:59.088Z"}
✔ H2: chat + VC_GROUNDING=gemini + chat.safetyScreen=false, or a rules screen provider, refuses to start with a named GroundingConfigError before connecting (186.7023ms)
✔ H2: chat + grounding starts when the screen is on over a classifier-capable provider (default, or its own screen provider); without grounding safetyScreen=false still starts (204.5318ms)
{"level":"warn","event":"reserved_tenant_ids_empty","message":"VC_RESERVED_TENANT_IDS is empty or unset: only the built-in reserved names, this repo's own tenants and the sandbox tenant are protected, so the real student-JWT tenants are unprotected (a partner id equal to one of them would be accepted and its server key would reach that tenant's students). List every \"tenant\" your student JWTs carry in VC_RESERVED_TENANT_IDS.","ts":"2026-10-27T15:37:59.180Z"}
{"level":"warn","event":"reserved_tenant_ids_empty","message":"VC_RESERVED_TENANT_IDS is empty or unset: only the built-in reserved names, this repo's own tenants and the sandbox tenant are protected, so the real student-JWT tenants are unprotected (a partner id equal to one of them would be accepted and its server key would reach that tenant's students). List every \"tenant\" your student JWTs carry in VC_RESERVED_TENANT_IDS.","ts":"2026-10-27T15:37:59.297Z"}
{"level":"warn","event":"reserved_tenant_ids_empty","message":"VC_RESERVED_TENANT_IDS is empty or unset: only the built-in reserved names, this repo's own tenants and the sandbox tenant are protected, so the real student-JWT tenants are unprotected (a partner id equal to one of them would be accepted and its server key would reach that tenant's students). List every \"tenant\" your student JWTs carry in VC_RESERVED_TENANT_IDS.","ts":"2026-10-27T15:37:59.386Z"}
{"level":"warn","event":"reserved_tenant_ids_empty","message":"VC_RESERVED_TENANT_IDS is empty or unset: only the built-in reserved names, this repo's own tenants and the sandbox tenant are protected, so the real student-JWT tenants are unprotected (a partner id equal to one of them would be accepted and its server key would reach that tenant's students). List every \"tenant\" your student JWTs carry in VC_RESERVED_TENANT_IDS.","ts":"2026-10-27T15:37:59.455Z"}
✔ K1 (pc-hardening-3) startApi: with partners on, a student JWT whose tenant is (a case variant of) an existing partner id gets the uniform 401 on chat, thread and profile routes; the partner's bound tenant and an unrelated tenant pass (384.9358ms)
{"level":"warn","event":"reserved_tenant_ids_empty","message":"VC_RESERVED_TENANT_IDS is empty or unset: only the built-in reserved names, this repo's own tenants and the sandbox tenant are protected, so the real student-JWT tenants are unprotected (a partner id equal to one of them would be accepted and its server key would reach that tenant's students). List every \"tenant\" your student JWTs carry in VC_RESERVED_TENANT_IDS.","ts":"2026-10-27T15:37:59.637Z"}
{"level":"warn","event":"reserved_tenant_ids_empty","message":"VC_RESERVED_TENANT_IDS is empty or unset: only the built-in reserved names, this repo's own tenants and the sandbox tenant are protected, so the real student-JWT tenants are unprotected (a partner id equal to one of them would be accepted and its server key would reach that tenant's students). List every \"tenant\" your student JWTs carry in VC_RESERVED_TENANT_IDS.","ts":"2026-10-27T15:37:59.814Z"}
{"level":"warn","event":"reserved_tenant_ids_empty","message":"VC_RESERVED_TENANT_IDS is empty or unset: only the built-in reserved names, this repo's own tenants and the sandbox tenant are protected, so the real student-JWT tenants are unprotected (a partner id equal to one of them would be accepted and its server key would reach that tenant's students). List every \"tenant\" your student JWTs carry in VC_RESERVED_TENANT_IDS.","ts":"2026-10-27T15:37:59.990Z"}
{"level":"warn","event":"reserved_tenant_ids_empty","message":"VC_RESERVED_TENANT_IDS is empty or unset: only the built-in reserved names, this repo's own tenants and the sandbox tenant are protected, so the real student-JWT tenants are unprotected (a partner id equal to one of them would be accepted and its server key would reach that tenant's students). List every \"tenant\" your student JWTs carry in VC_RESERVED_TENANT_IDS.","ts":"2026-10-27T15:38:00.158Z"}
{"level":"warn","event":"reserved_tenant_ids_empty","message":"VC_RESERVED_TENANT_IDS is empty or unset: only the built-in reserved names, this repo's own tenants and the sandbox tenant are protected, so the real student-JWT tenants are unprotected (a partner id equal to one of them would be accepted and its server key would reach that tenant's students). List every \"tenant\" your student JWTs carry in VC_RESERVED_TENANT_IDS.","ts":"2026-10-27T15:38:00.308Z"}
{"level":"warn","event":"reserved_tenant_ids_empty","message":"VC_RESERVED_TENANT_IDS is empty or unset: only the built-in reserved names, this repo's own tenants and the sandbox tenant are protected, so the real student-JWT tenants are unprotected (a partner id equal to one of them would be accepted and its server key would reach that tenant's students). List every \"tenant\" your student JWTs carry in VC_RESERVED_TENANT_IDS.","ts":"2026-10-27T15:38:00.434Z"}
{"level":"warn","event":"reserved_tenant_ids_empty","message":"VC_RESERVED_TENANT_IDS is empty or unset: only the built-in reserved names, this repo's own tenants and the sandbox tenant are protected, so the real student-JWT tenants are unprotected (a partner id equal to one of them would be accepted and its server key would reach that tenant's students). List every \"tenant\" your student JWTs carry in VC_RESERVED_TENANT_IDS.","ts":"2026-10-27T15:38:00.628Z"}
✔ w1-counsellor-tenant-guard T1 startApi: with partners on, a counsellor/admin/approver JWT whose tenant is (a case or width variant of) an existing partner id gets the uniform 401 on EVERY non-public route family; the partner's bound tenant and an unrelated tenant are not refused (1173.7599ms)
✔ w1-counsellor-tenant-guard T1: a partner-store failure while checking the tenant claim fails closed (uniform 401), like the student path (39.8591ms)
✔ w1-counsellor-tenant-guard T2 startApi: with the partner registry off (pepper unset) a counsellor JWT whose tenant looks like a partner id is NOT blocked, the one guard-off note names both guards, and no extra Mongo connection is opened (42.2493ms)
✔ Q10-Q14: actual handler passes only owned completed context and confirmed memory; missing/off policy stops retrieval and extraction (233.7385ms)
✔ Q12/Q14: queued extraction is discarded after erase or policy disable (105.8804ms)
✔ Q12/Q14: correction clears stale history, proposed memories never personalize, and missing policy fails off (217.2378ms)
✔ Q12/I1: confirmed sensitive field labels are never included in answer-provider memory (168.8418ms)
✔ Q14: a policy disabled during a memory-bearing answer prevents release of the stale model result (74.0955ms)
✔ I1 repair2: memory fallback never swallows an erasure fence (45.5579ms)
✔ Q12 repair2: displayed confirmation value must match the current proposal (53.0582ms)
✔ I1 repair2: pending or uncertain memory never suppresses a deterministic crisis response (129.1135ms)
✔ Q12/Q14 repair1: text opened during a paused correction or erase cannot consume the former memory (243.2383ms)
✔ Q12: more than twenty stored memories remain inspectable through bounded owner-bound pages (193.5552ms)
✔ S12 runtime: canonical latest confirmed preference wins while authoritative supplied grade remains (99.0391ms)
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:38:02.559Z"}
{"level":"info","event":"admin_sources_seeded","created":3,"existing":0,"ts":"2026-10-27T15:38:02.585Z"}
✔ S12 runtime HTTP: exact old/new prompt, fresh owned yes/no, immutable history and intentional Retry (263.649ms)
✔ S12 runtime boot: exact enabled tenant selects its native text/profile adapter and never the bootstrap platform (344.0491ms)
✔ S12: a completed memory decision during turn completion or usage never releases or replays the obsolete answer (275.4912ms)
✔ Q12/Q14 repair2: delayed ranking discards facts after correction erase or policy disable (81.9167ms)
✔ U6w item 1 ISS-163: facts the student confirmed in chat (db label source 'chat') change the ranking, and two students with different facts get different orders (78.5868ms)
✔ U6w item 1: a fact the student has NOT confirmed (still proposed) never changes the ranking: every option is insufficient_data and no profile fact is reported as used (23.6018ms)
✔ U6w item 1: the one mapping turns exactly {source 'chat', status 'confirmed'} into student-confirmed; a proposed row, a 'chat-extracted' label or an unknown label stay unmapped and the ranker ignores them (0.4453ms)
✔ U6w item 2 ISS-167: every number the student is shown carries a visible NOT PROVEN label, in the reply, in each number claim, and in the stored thread (32.9356ms)
✔ U6w item 3 tenancy: the same student id in tenant B with other facts never moves tenant A's ranking, and only tenant A's id reaches the profile and option-list ports (66.8077ms)
✔ U6w item 4: a throwing option port, option-list callback or weights callback still returns the reply (200), names the failure in the server log, and logs no profile text (84.5549ms)
✔ U6w item 4: an ordinary (non-ranking) question never touches the ranking port, and a rank question with no ranking wired behaves as before (36.9334ms)
✔ U6w item 5: an anonymous visitor asking to rank gets sign_in_required with no ranking, and the option-data port is never asked (13.6221ms)
✔ U6w cycle 1 C6 (senior review MEDIUM): a NOT PROVEN number never carries an attributed status: every ranked claim is unverified, live and stored, and keeps the label (26.5613ms)
✔ U6w cycle 1 C7 (checker A P1): a turn that stores no text (an unconsented minor) never reaches the ranking port, the option list or the weights callback (25.3048ms)
✔ U6w cycle 1 C8 (checker A P4): a profile fact value holding a phone number never reaches the stored thread through profileFactsUsed (14.9361ms)
✔ U6w cycle 1 C10 (checker B P2): weightsForTenant receives the asking tenant's id, and tenant A's weights never apply to tenant B (75.9068ms)
✔ U6w cycle 1 C11 (checker B P3 / A note): non-vacuous C5: an anonymous route handed live ranking, profile and Db spies never calls them, and the same spy wiring is called by the authenticated route (36.6233ms)
✔ S12 runtime ranking: confirmed canonical preference supersedes supplied alias without two countries (27.9705ms)
✔ D1: PARTNER_OPENAPI is its own OpenAPI 3.1 document, not the student draft and not the JWT document (0.8558ms)
✔ D1: valid 3.1 shape: unique operationIds, every operation has a 2xx, path templates are declared, no 3.0-only keywords, plain JSON (1.9501ms)
✔ D1: every $ref resolves, and every document component is used (0.4953ms)
✔ D1: every partner route in the partner, anonymous and chat code is documented, and nothing else is (no voice, no JWT routes) (0.2276ms)
✔ D1: the served route returns this document (GET), and refuses other methods (1.2099ms)
✔ D1: two security schemes, one per key kind; the page key is the X-VC-Key header, the server key is a bearer (0.1696ms)
✔ D1: scope rule: the page key opens only the public turn; the server key opens only the five student routes; the openapi route needs no key (0.2154ms)
✔ D1: every student route documents the three student headers exactly as the code reads them (age and consent optional, id required) (0.2436ms)
✔ D1: the public turn and every student route document 400, 401, 429 (with a required Retry-After) and 5xx; student routes also 404 (0.2856ms)
✔ D1: error bodies: the public route's errors carry the static Tele-MANAS line (AnonymousError); student errors are {error} (0.2544ms)
✔ D1: published limits are the D-088 defaults in the code (anonymous 10/min per partner+client, student 30/min), 60 s windows (0.2119ms)
✔ D1: component schemas match the Zod shapes (names, required, strictness) and are the very objects of the student draft (1.4519ms)
✔ D1: enums and bounds are the exact Zod values (0.1246ms)
✔ D1: the request/response schemas wired to each operation are the right ones (0.1881ms)
✔ D1: no request body carries a tenant, student, partner or role (identity is the key and the headers) (0.1054ms)
✔ the draft is a separate OpenAPI 3.1 document marked not enabled (0.6731ms)
✔ U5a: no draft path is in the served document or the route table (routes are not implemented or enabled) (0.1865ms)
✔ the draft covers chat, voice-session, anonymous, profile and fact-confirm with the expected roles (0.5955ms)
✔ turn and voice-session and anonymous routes document 429 with Retry-After (A23) (0.1092ms)
✔ component schemas match the Zod shapes (names, required, strictness) (1.7344ms)
✔ enums in the draft are the exact Zod values (claim status, kind, state, source kind, fact source) (0.1277ms)
✔ limits and audio defaults are published as the D-088 numbers (0.0875ms)
✔ WebSocket events: every Zod event type is documented with matching fields, client and server (0.544ms)
✔ every $ref in the draft resolves and the document is plain JSON (1.0347ms)
✔ the draft carries no tenant or student identity in any request body (identity is the JWT) (0.1989ms)
✔ Q5: Quest voice tools use the verified tenant/student, redact columns and reject identity arguments (67.3805ms)
✔ W1: a crisis flag write that dies with FencedWriterDeadlineError (student NOT fenced) is retried, the crisis is still escalated once, the student is not ejected, and the log names the deadline, not a fence (74.4092ms)
✔ W1: a flag write that hits the deadline once and then succeeds stores the flag once and escalates once, logging nothing (52.2326ms)
✔ W1: an escalation port that dies with FencedWriterDeadlineError once is retried and delivered; the student is not ejected (46.198ms)
✔ W2: an escalation still running after the drain timeout is awaited by voice.close(), so a shutdown does not lose it (726.0103ms)
✔ W2: the wait for late work at shutdown is bounded: a write that never settles delays close() by at most drainTimeoutMs and is logged (288.5045ms)
✔ W3: a start superseded while its provider connect is still in flight is closed before the newer start opens its own provider session (never two paid sessions at once) (348.8872ms)
✔ W3: if the superseded connect never returns, the newer start waits at most connectOverlapWaitMs, the overlap is logged, and it still becomes the live session (281.6222ms)
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:38:07.099Z"}
✔ W4: the retry after a delivered-then-thrown escalation reuses the same session and turn id, and the real escalateTurns port writes each recipient record once (166.5741ms)
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:38:07.256Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:38:07.356Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:38:07.456Z"}
✔ W5: VC_VOICE_ENABLED unset, empty or 'false' -> no voice route, an upgrade is refused, no gate is read, nothing voice-related is built or connected (357.0858ms)
✔ W5: voiceEnabledFromEnv - exactly 'true' is on; unset, empty and 'false' are off; padded, cased or other values throw VoiceConfigError (never on) (3.71ms)
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:38:07.550Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:38:07.611Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:38:07.683Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:38:07.740Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:38:07.819Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:38:07.874Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:38:07.915Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:38:07.957Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:38:07.999Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:38:08.040Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:38:08.079Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:38:08.123Z"}
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:38:08.185Z"}
✔ W6: flag on -> startApi fails closed BEFORE connecting to Mongo or listening, for each of: no go-live gate, tracing on, no live provider, no crisis message, short secret, bad base URL, bad flag value (723.9891ms)
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:38:08.349Z"}
✔ W7: flag on and gates open -> in a started process the session route mints a token, the WebSocket upgrades, a start reaches the provider, and a wrong token is refused (175.0511ms)
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:38:08.458Z"}
✔ W7: the WebSocket secret and base URL default to VC_VOICE_WS_SECRET and VC_VOICE_WS_BASE_URL when the options are not supplied (109.6872ms)
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:38:08.626Z"}
✔ W8: stop() finalizes a live voice session before the database client closes, and its usage is recorded (166.7723ms)
{"level":"warn","event":"partner_tenant_guard_off","message":"VC_PARTNER_KEY_PEPPER is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed","ts":"2026-10-27T15:38:08.902Z"}
✔ W9: a voice crisis in a started process reaches the SAME escalateForTenant port the text chat uses (one flag, one escalation) (278.4935ms)
{"event":"escalation_unrouted","escalationId":"th-w:v3e84d507000001","sessionId":"th-w"}
✔ W9: with chat off, a voice crisis goes through the engine's escalateTurns exactly like the text path default (notification records are written) (139.4313ms)
✔ S12 runtime voice tools: verified tenant selects native data and navigation without cross-platform fallback (90.2626ms)
[student-graph] pathlynks write failed (Error)
[student-graph] pathlynks write failed (Error)
[student-graph] pathlynks write failed (Error)
[student-graph] pathlynks write failed (Error)
✔ VA13/VA15: the five new tools are registered with the right executedBy and anonymous flags (1.0462ms)
✔ VA15: STUDENT_TOOLS equals the vc-capabilities tables exactly (name, executedBy, anonymous flag), both directions (0.4952ms)
✔ classifyIntent routes the Pathlynks and navigation asks to the new tools, and leaves KB questions alone (6.1161ms)
✔ VA13: each tool answers from the verified student's own rows, calling the port with that student id only (75.1389ms)
✔ VA13: student A asking about student B (id in the text) gets only A's data or a refusal; the port is never called with B (101.3812ms)
✔ VA13: B's turn gets B's rows (the two-student fake is real), and a partner srv key context uses the partner id as tenant and the verified student id (5.2915ms)
✔ VA13: the anonymous (Vidysea visitor) route can call none of the four Pathlynks tools (30.18ms)
✔ VA13: the fixed unavailable line is exact (0.0668ms)
[student-graph] nav_catalogue write failed (Error)
✔ VA13: a port that returns unavailable, throws, hangs, returns garbage or is not configured still answers with the fixed line and leaks nothing (185.4061ms)
✔ VA13: a throwing port reports a text-free write error (the kind only), never the message (6.1416ms)
✔ VA14: navigate_steps in the graph returns text steps from the catalogue; unknown / failing / absent catalogue is the unknown text (21.0438ms)
✔ VA15: a crisis message that also asks for saved careers or navigation gets the fixed crisis reply and no tool is called (call count 0) (14.1723ms)
✔ E2: a third-person pronoun (she / he / they) is refused, never answered with the signed-in student's own saved careers (30.4392ms)
✔ E3 (G6): a Pathlynks row carrying phone, email, dob, guardian_name, address, tenant_id and password_hash replies with none of those values (20.1645ms)
✔ Q9: public greetings and service-directed study questions are generic (0.3044ms)
✔ Q9: exact small-talk helper rejects mixed requests, private data and PII (0.175ms)
✔ Q9: service-directed me never removes own-case/account/PII guards (0.4943ms)
✔ Q4: actual authenticated graph consumes multilingual task recipes without private reads (35.073ms)
✔ S12 runtime: Vidysea native programme/profile tools retain truthful labels, isolation and unsupported concepts (22.7888ms)
ℹ tests 157
ℹ suites 0
ℹ pass 157
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 14364.3516

```

### api-typecheck-final

Started: 2026-10-27T15:38:09.258Z; exit 0

```text
C:/Program Files/nodejs/node.exe node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json
```

```text
(no stdout)
```

### engine-typecheck-final

Started: 2026-10-27T15:38:18.138Z; exit 0

```text
C:/Program Files/nodejs/node.exe node_modules/typescript/bin/tsc --noEmit -p packages/engine/tsconfig.json
```

```text
(no stdout)
```

### authoritative-pagination-red

Started: 2026-10-27T15:41:24.722Z; exit 1

```text
C:/Program Files/nodejs/node.exe --import tsx --test --test-reporter=spec "--test-name-pattern=^S12 runtime: legacy authoritative" apps/api/tests/chat-profile.test.ts
```

```text
✖ S12 runtime: legacy authoritative rows stay excluded and empty visible pages still advance (35.2052ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2036.1443

✖ failing tests:

test at apps\api\tests\chat-profile.test.ts:1:80876
✖ S12 runtime: legacy authoritative rows stay excluded and empty visible pages still advance (35.2052ms)
  AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:
  
    assert.ok(first.json.memory.nextCursor)
  
      at TestContext.<anonymous> (D:\vc\.worktrees\vc-completion\apps\api\tests\chat-profile.test.ts:1480:184)
      at async Test.run (node:internal/test_runner/test:1110:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:358:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: true,
    operator: '==',
    diff: 'simple'
  }

```

### authoritative-pagination-real-preference

Started: 2026-10-27T15:42:41.939Z; exit 1

```text
C:/Program Files/nodejs/node.exe --import tsx --test --test-reporter=spec "--test-name-pattern=^S12 runtime: legacy authoritative" apps/api/tests/chat-profile.test.ts
```

```text
✖ S12 runtime: legacy authoritative rows stay excluded and empty visible pages still advance (36.3369ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2206.5722

✖ failing tests:

test at apps\api\tests\chat-profile.test.ts:1:80876
✖ S12 runtime: legacy authoritative rows stay excluded and empty visible pages still advance (36.3369ms)
  AssertionError [ERR_ASSERTION]: a real preference beyond legacy account rows must remain reachable
      at TestContext.<anonymous> (D:\vc\.worktrees\vc-completion\apps\api\tests\chat-profile.test.ts:1481:184)
      at async Test.run (node:internal/test_runner/test:1110:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:358:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: true,
    operator: '==',
    diff: 'simple'
  }

```

### authoritative-pagination-final-counterexample

Started: 2026-10-27T15:43:08.842Z; exit 1

```text
C:/Program Files/nodejs/node.exe --import tsx --test --test-reporter=spec "--test-name-pattern=^S12 runtime: real preferences" apps/api/tests/chat-profile.test.ts
```

```text
✖ S12 runtime: real preferences remain reachable past excluded legacy account rows (25.1857ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2299.2861

✖ failing tests:

test at apps\api\tests\chat-profile.test.ts:1:80876
✖ S12 runtime: real preferences remain reachable past excluded legacy account rows (25.1857ms)
  AssertionError [ERR_ASSERTION]: a real preference beyond legacy account rows must remain reachable
      at TestContext.<anonymous> (D:\vc\.worktrees\vc-completion\apps\api\tests\chat-profile.test.ts:1484:50)
      at async Test.run (node:internal/test_runner/test:1110:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:358:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: true,
    operator: '==',
    diff: 'simple'
  }

```

### api-typecheck-current-with-counterexample

Started: 2026-10-27T15:43:42.103Z; exit 0

```text
C:/Program Files/nodejs/node.exe node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json
```

```text
(no stdout)
```

## Self-review and evidence identity

Read-only git --no-optional-locks diff --no-ext-diff --check -- <owned files> exited0,stdout empty; Git emitted existing mixed LF/CRLF conversion warnings only. No git index mutation/commit/stash/reset/stage was performed. Read-only source diff includes inherited root work and is not represented as this worker sole delta. Owned read-baseline hashes and selected current runtime/test/dependency hashes below distinguish that inherited state. These are selected hashes, not a claimed complete transitive test-input manifest; root must validate/re-run its final frozen acceptance inputs.

Owned baseline at first edit:
```json
{
  "apps/api/tests/chat-profile.test.ts": "b110c0fc0e8c35e2d2850be783a47af1a6f64d11a1200029133d872d1932fe31",
  "packages/engine/tests/pathlynks-tools.test.ts": "a30c20aca3096e007758f927d785d11699768d08cf40241171e76abe239cf68a",
  "apps/api/src/chat.ts": "06bc108ad35fe3cec71aeb44eb8ebcdf227515d84f615300e794ffe8982cee88",
  "packages/engine/src/student/classify.ts": "86200f21e17572104c98712213f50df5bb422e30dd3aa21a2361d396f8acf243",
  "packages/engine/src/student/graph.ts": "d0434340ecf7dc13deb4af011afa39ceeee3010e1447b76d7d1187a14273be77",
  "skills/vc-capabilities/SKILL.md": "9d128cd71abb99a5405e26933513467b701ad8a7512c5048d816799fb0532413",
  "apps/api/src/index.ts": "ffc0cf150dcaf3effedc9c29c56746b1184578c7a223b2fe816e4c5494940b5c",
  "apps/api/src/openapi.ts": "1fab01f499dc60392d255c95ef0b3ebd8944355bf342247f5d31147c2bb66929",
  "apps/api/tests/voice-wiring.test.ts": "a255ee7a8956cb024070818abd36051c45f4f11ead57b7865d0932a14cf62023",
  "apps/api/tests/student-openapi.test.ts": "63c2110b305ffd8ff471872ef0bba21a93b048469ca523285738ffbc629313e9",
  "apps/api/tests/partner-openapi.test.ts": "d14b6ee39c0db9127076b15c2477d221b0c7ef9fc99058b18a89cb002000cb9c",
  "apps/api/tests/chat-rank.test.ts": "195ec6a89a1badf5413e695502d0803bb9c5d83830653c541187a29707b7a14a"
}
```

Current selected input identity after current API typecheck and focused failure:
```json
{
  "apps/api/src/chat.ts": "9681c4a11ae2d4e90feb2ac5789996e6fb3e3af08c92e74fb19ffdb9b513f882",
  "apps/api/src/index.ts": "b5fb0282b1bd79bbebc74b3115d9672a8092258448c9ffdd66d3584db904c1d3",
  "apps/api/src/openapi.ts": "22f8ce2359fd883abf2b54a6c35f2d9a701dda02939a22e69b90b434ada8f5e7",
  "apps/api/src/admin-routes.ts": "3fcd64084febb20335e0297914f377cd60005c0dab290e54a862d256001a5c4c",
  "apps/api/src/voice.ts": "b58850bc599a9a0ce2d119757a4404ca1a3efff93687802aa91d2a71408a7cca",
  "packages/engine/src/student/graph.ts": "6b1de88469ada2750c2a7a4b6a4be7e68eecc8e67ee1edb62f8b3b716f1cae7b",
  "packages/engine/src/student/classify.ts": "c5f4ad22147de55be2da00c04a17564a713e23545180ad9dbe9b9108c5e9296e",
  "packages/engine/src/student/rank.ts": "2c7c0bd8a6064fec4d687e23f355259c02069931b905d8dd20a09d6e71546cfb",
  "packages/db/src/profile-facts.ts": "32a9e3618b6192ab08548d26269c41669ec397156d48cc11b1fcc3264c53cabb",
  "packages/db/src/chat-threads.ts": "98dfc0a78e970edc4c5bd437bc8aae9b1dc6b76aa4b8e6da2077e5397868b49c",
  "packages/schemas/src/student-api.ts": "7c6a549e449b739b645a75ce9d6f72eba910692048aae920a435b46fdddc176c",
  "packages/schemas/src/sources.ts": "27b43176d63219d5650c03b22aee7454c408075ba7b63329644a4f8715bc07ce",
  "mcp/pathlynks/src/port.ts": "11ec9e67572b9f65dd11341675d7952c078ee277bd6a894aac71ffbde8f0b4a8",
  "config/sources.json": "c4bb1a3ed6df93335608253d4efa8b210605b54427a2712a9622e527f51d8c4c",
  "skills/vc-capabilities/SKILL.md": "c06156bbc809e22dfb1c50198a967dfbbffb5e550b485aa7ae0d2550ba6fdd84",
  "pnpm-lock.yaml": "b344f406e0b6c4beb3df693b1e67cfc7b867afd3970c580207e4203d13a1de4d",
  "apps/api/tests/chat-profile.test.ts": "c9ebb19ede9008c2e63b9cd66f8165fd2e316933ca1d17fd3fe889dd8bca1f1d",
  "apps/api/tests/chat-rank.test.ts": "c04f5ad9c123c664067a09a3d9b13eb31d4d058ca79496e414903087410eaf0a",
  "apps/api/tests/chat-pathlynks.test.ts": "deea89f1bae54e5a511ee6ab7ef00a387d002d5fc22cf4f408d14bae3b024d34",
  "apps/api/tests/voice-wiring.test.ts": "320174fcf71a1eb1e25c5a14518578d3bfa07dc21f3d6bf41d61913c363ee5a3",
  "apps/api/tests/student-openapi.test.ts": "6e7ad26fee29fa54cc7dd8f7785a578b24cc0fbbb8673107f5096f0e84d49db1",
  "apps/api/tests/partner-openapi.test.ts": "8b0bd12a16c36e95dcfba994a99e93b2c32dd0126e3ba3fae3609652946a34dd",
  "packages/engine/tests/pathlynks-tools.test.ts": "6e34e57c9eb4290b092d44b5902ddcf27ae3da1dae83a4224b469167d24a1755"
}
```

## Remaining root acceptance / limits

Repair and verify the DB pre-filter pagination counterexample first. Root retains independent final auth/tenancy dual checker, SSE/data/AI reviews, final criteria falsification, retained exact S11 counterexamples, required 6c/collection/backstop, workspace typechecks/affected builds, host mounted journeys, visible browser/Admin role walks, actual native voice/host/provider wiring, and any separately authorized bounded synthetic real-provider probe/proof. No helper test is a substitute for those. Checked-in Vidysea source provisioning/KB URL+key/eligible real-account assertions/production audio config remain team inputs, not guessed or promoted by this work. Source-provider fake correctness and transport tests do not prove factual live output or production acceptance.

Current handoff state: implementation integrated; local affected157/157 evidence retained; current API and engine typechecks exit0; additional current focused DB-boundary regression FAIL1. Root must not mark feature PASS or ready-for-check from this receipt.
