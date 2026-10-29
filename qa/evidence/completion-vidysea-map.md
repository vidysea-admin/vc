# completion-vidysea-map — static source handback

Task: completion-vidysea-map. Owner: completion-vidysea-map. Date: 2026-10-27.
Status: bounded source map produced; no product acceptance / checker PASS claimed.
Only written artifact: qa/evidence/completion-vidysea-map.md in D:/vc/.worktrees/vc-completion.

## Scope and lineage

- Backend source root B = D:/vc/.worktrees/vc-vidysea-backend.
- Frontend source root F = D:/vc/.worktrees/vc-vidysea-frontend.
- All B:/F: citations below are exact checkout-relative file:line references, never main D:/vc.
- Read project AGENTS.md and ARCHITECTURE.md, current T-057 TASKS row, D-120 authorization, delivery record and pinned maker/checker entrypoints. Host checkout root AGENTS.md / ARCHITECTURE.md are absent (ENOENT); neither host was edited or initialized.
- Parent remains T-057 S12 preserved-lineage recovery; original cycle2 STALLED, receipts, costs and counterexamples remain unchanged. This mapping task does not reset, repair or close them.
- Delivery policy hash 236bc0e7c075f9729ef464dbd8aa2bdbec02754e95e228c936480c96d4c8fe39 and protocol hash 835d6a2764c50567b4573c7aa8f4f991430e2240a46107256b4a07d934799cf1 match current maker/checker file SHA256 values read in this task. BUILDING has no helper checker or full suite.
- No DB connection, HTTP/provider/network calls, application imports, dependency changes, code edits, git index mutation, commit/push/deploy or secrets read/printed. Query shapes below are proposals for existing adapter seams, not executed SQL or verified deployment contracts.

## 1. Exact authenticated owner mapping

| Meaning | Actual source | Consequence |
|---|---|---|
| Authentication token subject | B:app/deps.py:220-240 decodes JWT, reads sub or user_id, parses UUID, selects users.id | Request body/student-id hints are not authentication. |
| JWT verification function | B:app/core/security.py:62-74 decode_and_validate / decode_jwt calls jwt.decode with configured secret and allowed algorithm | Reuse installed auth; do not create browser-signed identity or assume a separate tenant claim was verified here. |
| Selected browser credential | B:app/deps.py:104-140 _request_access_token: explicit bearer first; generic access_token cookie; student route fallback student_access_token; conflicting same-name cookie subjects fail401 | Preserve selected-session identity; do not prefer the most privileged cookie. |
| Authenticated DTO | B:app/deps.py:322-331 returns id = str(user.id), user_type, effective roles, claims, user_obj | Host bridge derives owner from this server result. |
| SQL owner identity | B:app/models/user.py:19-21 users.id UUID PK; B:app/models/student.py:22-24 students.id UUID PK AND FK users.id ON DELETE CASCADE | For this host, Student.id == User.id. No students.user_id column. The model docstring at student.py:20 is stale prose. |
| Current-user target | B:app/api/v1/journey_map/utils.py:157-211 get_target_student_id returns current_user.id when no target is supplied | Own UUID is the normal student target. This branch itself does not prove a Student row exists. |
| On-behalf target | Same function:183-208 accepts operator roles, loads target Student, requires assigned_counsellor_id unless roles includes admin | Preserve staff flow separately. Do not infer the student path may choose another UUID. |
| Existing counsellor chat hard-self scope | B:app/api/v1/student/ai_counsellor_router.py:67-78 ignores client student_id for user_type == student; actor_id is current_user.id | Multi-role student retains self scope on this existing route; comments claiming query rejection differ from actual ignore behaviour. |
| Browser session user | B:app/api/v1/session_router.py:12-40,73-98 returns user.id = users.id and looks up Student.id == user.id | F UserType.id is the users/student UUID, not a Pathlynks student id. |

Normalized mapping (existing facts, not a newly installed DTO):

~~~json
{
  "authenticatedActorId": "current_user.id / users.id UUID",
  "ownStudentId": "students.id == authenticatedActorId, only if a live eligible student row exists",
  "staffTargetStudentId": "explicit target validated by existing assignment/role policy",
  "shortlistOwner": "student_shortlisted_courses.student_id == ownStudentId",
  "assessmentOwner": "ai_profile_assessments.student_id == ownStudentId",
  "importedSnapshotOwner": "pathlynks_student_snapshot.vidysea_user_id == authenticatedActorId",
  "tenant": "server adapter/site configuration; no tenant column proven in these owner tables"
}
~~~

### Active / deleted / eligibility facts

- users.is_active is Boolean at B:app/models/user.py:43; disabled_at nullable timestamp at :62. Authentication explicitly permits inactive users at B:app/deps.py:245-249. Therefore authentication alone is insufficient eligibility for personalized central calls.
- students.deleted_at / deleted_by are at B:app/models/student.py:140-143; default query intent says deleted_at IS NULL. lifecycle_state at :96-99 and status at :116-119 are separate business states; do not invent a universal lifecycle allow-list.
- get_target_student_id target query at B:app/api/v1/journey_map/utils.py:198 has no deleted filter; own branch has no Student lookup. Bridge/readonly adapter must resolve the existing owner row with active/not-disabled/not-deleted bounds.
- students.date_of_birth exists at B:app/models/student.py:27; users.date_of_birth also exists at B:app/models/user.py:65. No precedence/age-verification attestation is established by their presence.
- students.data_sharing_consent, _at, _text at B:app/models/student.py:124-130 record broad signup data sharing with Vidysea/partners. These fields are not proven central-AI purpose, guardian/age verification or per-use consent. Personalized central eligibility remains a team-provisioned server assertion under S12; do not synthesize it from user_type, age inference or is_verified.

## 2. SQL tables / finite profile and shortlist projections

| Table / PK / ownership | Useful existing columns | Source |
|---|---|---|
| users; id UUID PK | first_name,last_name,user_type,is_active,disabled_at | B:app/models/user.py:19-43,62 |
| students; id UUID PK/FK users.id | academic_level,field_of_interest,target_intake; budget_min/max DECIMAL(12,2),budget_currency,budget_range_text; preferred_countries/preferred_courses JSON; nationality; updated_at,deleted_at | B:app/models/student.py:22-46,137-143 |
| student_academic_history; id UUID PK; student_id UUID FK students.id | degree_type,institution_name,field_of_study,dates,gpa,percentage,country,is_current; level,board,grading_scheme,score_value,score_max,normalized_pct,is_latest,is_active,source | B:app/models/student.py:388-429 |
| student_test_scores; id UUID PK; student_id UUID FK students.id | test_name,total_score,date_taken,is_official,status,score_unit; scale,score_max,normalized_pct,is_active,source | B:app/models/student.py:165-205 |
| student_work_experience; id UUID PK; student_id UUID FK students.id | company_name,job_title,start_date,end_date,is_current,description | B:app/models/student.py:214-232 |
| student_shortlisted_courses; id UUID PK; student_id UUID FK students.id | programme_id,university_id String(255) external IDs; programme_name,university_name snapshots; is_verified,verification_status,application_started; added_by,programme_priority; student_decision,is_finalized,fit_score/category; deleted_at | B:app/models/student_shortlist.py:13-57,79-94 |

Profile safe minimum: existing canonical scalar columns above, preferred country/course arrays with bounded string items, source table/field and updated_at. Do not include whole User/Student ORM rows, contact details, passport, documents, intake_form_json, information_form_json or raw assessment payloads. Budget currency is explicit; never infer a currency from a numeric budget.

Existing richer canonical reader is B:app/api/v1/university_suggestion/router.py:2048-2052 _build_profile -> app/services/recommend_profile.py:186-208 recommendation_input. PREFERENCES maps canonical columns then named intake/info fallbacks (:13-21,:46-56). Prefer structured fields; empty field is unavailable unless the particular existing fallback is deliberately reused with provenance. These existing readers are not finite adapter wrappers: snapshot at :175-183 and work query at :190-191 load all owned rows.

Important historical/score semantics:

- B:app/services/recommend_profile.py:75-125 skips inactive academic rows and refuses JSON resurrection when relational rows exist; :126-141 fallback is only when no relational rows exist. A new bounded read must not turn a filtered zero-active result into stale JSON facts.
- Same file :150-172 lets relational tests override old snapshots and inactive rows remove matching legacy facts.
- B:app/services/canonical_scores.py:7-17 marks legacy scores legacy_unverified; :60-73 loads owned attempts plus effective score_selection reviews and derives evidence verification. :20-27 accepts only one unambiguous verified selection for a given programme. :54-58 limits eligibility input to that programme. Raw student_test_scores/is_official is not equivalent to this verification policy.
- The minimal proposed adapter projection can omit detailed test/assessment scoring. If implemented later, carry source and verification explicitly; do not label raw totals verified, choose a maximum, or silently collapse conflicting attempts. Exact attempt/review table schema was not requested/read here; it is not guessed.

### Parameterized, bounded SQL shapes (not executed)

Caps below are concrete candidate read limits, not changes to the parent contract: one profile, twenty shortlist rows, twenty academic rows. Bind :owner_id as the UUID obtained from server auth. Numeric LIMIT constants and fixed identifiers are code-owned; interpolate no caller table/column/order/WHERE strings.

~~~sql
-- Own profile, safe scalar projection; no SELECT *.
SELECT s.id AS student_id,
       u.first_name, u.last_name,
       s.academic_level, s.field_of_interest, s.target_intake,
       s.budget_min, s.budget_max, s.budget_currency, s.budget_range_text,
       s.nationality, s.updated_at,
       ARRAY(SELECT left(v.value, 160)
             FROM json_array_elements_text(
               CASE WHEN json_typeof(s.preferred_countries) = 'array'
                    THEN s.preferred_countries ELSE '[]'::json END
             ) WITH ORDINALITY AS v(value, n)
             ORDER BY v.n LIMIT 20) AS preferred_countries,
       ARRAY(SELECT left(v.value, 200)
             FROM json_array_elements_text(
               CASE WHEN json_typeof(s.preferred_courses) = 'array'
                    THEN s.preferred_courses ELSE '[]'::json END
             ) WITH ORDINALITY AS v(value, n)
             ORDER BY v.n LIMIT 20) AS preferred_courses
FROM students s JOIN users u ON u.id = s.id
WHERE s.id = :owner_id
  AND s.deleted_at IS NULL AND u.is_active IS TRUE AND u.disabled_at IS NULL
LIMIT 1;

-- Owned shortlist. External programme/university strings remain their own namespaces.
SELECT q.id AS item_id, q.student_id, q.programme_id, q.university_id,
       q.programme_name, q.university_name, q.verification_status, q.is_verified,
       q.added_by, q.programme_priority, q.student_decision, q.is_finalized,
       q.application_started, q.created_at, q.updated_at
FROM student_shortlisted_courses q
JOIN students s ON s.id = q.student_id JOIN users u ON u.id = s.id
WHERE q.student_id = :owner_id AND q.deleted_at IS NULL
  AND s.deleted_at IS NULL AND u.is_active IS TRUE AND u.disabled_at IS NULL
ORDER BY q.created_at DESC, q.id DESC
LIMIT 20;

-- Optional active academic history, explicitly labelled incomplete if capped.
SELECT a.id, a.level, a.degree_type, a.institution_name, a.field_of_study,
       a.board, a.grading_scheme, a.score_value, a.score_max, a.normalized_pct,
       a.gpa, a.percentage, a.start_date, a.end_date, a.is_current, a.is_latest,
       a.source, a.updated_at
FROM student_academic_history a
JOIN students s ON s.id = a.student_id JOIN users u ON u.id = s.id
WHERE a.student_id = :owner_id AND a.is_active IS TRUE
  AND s.deleted_at IS NULL AND u.is_active IS TRUE AND u.disabled_at IS NULL
ORDER BY a.is_latest DESC, a.created_at DESC, a.id DESC
LIMIT 20;
~~~

Treat malformed/non-string array members as unavailable at the adapter schema boundary; truncated items are display excerpts, not exact preference identity or confirmation tokens. SQL JSON type/cast assumptions follow the SQLAlchemy JSON declarations, not an inspected live migration/database. A real adapter must use its installed query library parameter binding and verify its own DTO/tests. Return finite row and per-field bounds; no free-text notes in the minimal projection.

### Existing shortlist GET is not a pure read seam

- B:app/api/v1/student/shortlist_router.py:95-108 get_shortlist calls _requeue_stuck_ai_rows before reading rows. :34-44 queues unresolved AI programmes through _queue_enrich_for_rows with limit25. Do not invoke this route/service composition from a readonly adapter.
- B:app/services/student_shortlist_service.py:122-128 get_student_shortlist itself only selects owner rows, but has no deleted filter or limit. Direct reuse alone is insufficient.
- B:app/services/student_ai_counsellor.py:292-304 _t_get_shortlist is a concrete prior pure SELECT with owner/deleted predicates and limit30; its output is only item_id / display names / verified flag. Reuse the pattern in the approved adapter seam, not the legacy action-writing agent.
- B:app/api/v1/student/shortlist_router.py:109-119 overlays response-only active round decisions. Raw q.student_decision is the stored column, not guaranteed identical to current-round UI decision. Do not claim round equivalence without reading/implementing those existing round semantics.
- B:app/api/v1/student/shortlist_router.py:121-137 verified GET filters status in verified/safe, but omits deleted_at and row cap. is_verified and verification_status are distinct fields; no arbitrary equivalence.
- Programme/university IDs are external String(255), not SQL FKs to a career catalogue. Existing unresolved ai: placeholders are explicitly documented at shortlist_router.py:25-29. A placeholder cannot become a cited detail destination or career id by string reuse.

## 3. Assessment / comparison: what actually exists

| Capability | Proven seam | Availability boundary |
|---|---|---|
| Saved AI profile assessment | B:app/models/ai.py:14-36 ai_profile_assessments, unique student_id FK; academic_strength,english_proficiency,work_experience,financial_capability,previous_visa_history,preferred_intake plus assessment_data_json | An owned profile classification row may exist. It is not proof of completed psychometrics, career ranking, a report result or central eligibility. |
| Assessment read/write endpoints | B:app/api/v1/ai/router.py:20-44 GET /api/v1/ai/assessments scopes get_current_student(current_user.id), returns404 if absent; POST upserts. B:app/services/ai_service.py:12-35 implements actual upsert/read | A readonly adapter can project the finite scalar fields from the owned row (LIMIT1, same owner/status joins), never call POST; raw JSON omitted. Runtime row presence unverified. |
| Imported Pathlynks career snapshot | B:app/models/pathlynks_snapshot.py:37-82 pathlynks_student_snapshot has unique vidysea_user_id UUID, pathlynks_student_id Text; grade/board, selected_career_name/category_id, career_picks_json and resolved university/programme strings, synced_at | Owner fields are SOFT references, explicitly no FK (:11-13); imported optional snapshot, not native Vidysea career facts. A programme id does not equal a selected_career_category_id. No transparent other-DB lookup authorized. |
| Snapshot HTTP GET | B:app/api/v1/student/pathlynks_snapshot_router.py:124-173 | It can discover a cross-platform link, sync and resolve a snapshot on read; therefore not a pure local read endpoint. Do not reuse for readonly adapter fetching. |
| Public career-interest attempt | B:app/models/career_interest_attempt.py:17-37 career_interest_attempts contains assessment id/version, answers/scores, claim hash and optional pathlynks_user_id | No students.id/vidysea_user_id FK or column in this model. No owned student assessment join proven. Never match by guessed ID/email or expose claim material. |
| Stored programme gap | B:app/models/programme_gap.py:22-61 programme_gap_analysis links student_id FK and shortlisted_course_id FK, unique shortlist row; shared_with_student,is_stale,profile_signature,generated_at,scalar eligibility/fit/gap_count | Stored AI assessment output requires source/staleness/sharing labels; do not expose unshared results as student facts. |
| Shared gap read | B:app/api/v1/university_suggestion/router.py:2267-2282 GET /api/v1/student/shortlist/{row_id}/gaps filters owner and shared flag | Does not join live/deleted shortlist row in this read. Proposed adapter must add q.student_id = owner and q.deleted_at IS NULL plus owner status checks; retain stale flag. Generation at :2103-2148 calls AIML and writes; excluded. |
| Compare selections | F:src/app/student/store/coursecomparestore.ts:27-56,71-75 and collegecomparestore.ts:13-32,44-49 | Browser localStorage keys selectedCourseIds/selectedCollegeIds and display metadata, not account-scoped server records. Do not use this as trusted cross-session or cross-account memory. |
| Compare workspace | F:src/app/(public-student)/(main)/course-compare/_components/CompareWorkspace.tsx:84-118 | Uses local stores; URL ?view=course/college/both only selects view. It fetches getCourses({ids:selectedCourseIds}); no supported URL ids= list ingestion proven here. |

No native Pathlynks-like career shortlist / career ranking / psychometric completion projection is proven in the inspected Vidysea profile/shortlist seams. Report unavailable or explicitly sourced optional imported snapshot; never fabricate equivalent scores or map programme strings into career identifiers.

## 4. Existing frontend auth, navigation, sessions and bridge targets

- F:src/context/student/auth-provider.tsx:15-49 UserType.id is string; :66-78 AuthProvider gets user from data?.data?.user; :80-94 logout clears mirrors, auth query and broadcasts; :117-144 publishes current user/auth flags and mounts existing gates. AuthContext.tsx:3 reexports provider/useAuth.
- F:src/hooks/student/use-auth.ts:38-45 uses getUserSessionQueryFn with refetch on mount/reconnect/focus. F:src/lib/student/api.ts:43-62 owns login/logout; :77 reads /session/. Authenticated state in browser is display state, not permission to claim arbitrary owner/tenant.
- F:src/lib/student/axios-client.ts:12-24 appends /api/v1 to configured public API base and uses withCredentials; :35-50 captures current session around requests/responses. Preserve existing refresh/account-switch guards instead of adding a parallel login.
- F:src/app/student/layout.tsx:15-25 mounts QueryProvider/AuthProvider. F:src/app/student/(main)/layout.tsx:15-34 mounts the existing student shell, MessagingDock and DemoResetWidget. ChatWidget.tsx is a one-line //test stub at F:src/components/student/ChatWidget.tsx:1; it is not mounted in these inspected layouts. Integration must deliberately mount the shared VC widget in an existing host seam; no claim it currently exists.

| Existing browser destination | Concrete existing source |
|---|---|
| /student/ai-counsellor | F:src/app/student/(main)/ai-counsellor/page.tsx:1-10 renders VideoCounsellor |
| /student/shortlisted-programmes | F:src/app/student/(main)/shortlisted-programmes/page.tsx:11-18 uses existing useShortlist, shared gaps and auth |
| /student/universities/shortlist | F:src/app/student/(main)/universities/shortlist/page.tsx:14-15 uses auth/student service; a separate existing shortlist surface |
| /course-compare and /college-compare | F:src/app/(public-student)/(main)/course-compare/page.tsx:15-23 and college-compare/page.tsx:18-37 mount shared CompareWorkspace |
| /student/u/profile | F:src/app/student/(main)/u/profile/page.tsx:5-12 checks auth then redirects to /student/journey-details?section=basic-details |
| /student/session-recordings | F:src/app/student/(main)/session-recordings/page.tsx:7 uses getSessionRecordingsQueryFn; F:src/lib/student/api.ts:101-105 reads /student/session-recordings |

Existing counsellor transport is legacy, not an already completed central bridge: B:app/api/v1/student/ai_counsellor_router.py:31,39-41,44-78 exposes POST /api/v1/student/ai-counsellor/chat with message/history, then calls student_ai_counsellor.chat; app/main.py:597 registers this router under /api/v1. Error response at router :79-86 is degraded reply/cards/actions. There are no session/history/memory/central voice endpoints in this 87-line router snapshot.

F:src/app/student/(main)/ai-counsellor/_components/VideoCounsellor.tsx:192-221 sends message plus the last10 locally held messages to that route, clears input and reads reply/cards/actions. Its header at :11-14 identifies browser SpeechRecognition / SpeechSynthesis, not central Gemini Live. Existing backend agent describes action-writing account tools at router.py:6-8; it must never be invoked as a silent fallback on central-mode failure.

Human counselling session recordings are not established VC chat-thread history. A central host bridge must forward owned central session/thread DTOs and retain Retry; no existing router DTO for that is asserted by this map. Central API exact DTO/route names remain the root integration owner's source of truth.

## 5. Open inputs / interface impact

1. Root/builders own installing the central DTO, proxy, adapter config and authenticated tenant/site binding; this task changed no interfaces.
2. Team supplies verified central-AI purpose/consent/eligibility assertions, deployed KB URL/key and production audio/config. Signup consent alone is not a replacement. No secret or configuration value was inspected.
3. Live schema/migrations, row existence, eligibility and provider/data quality are unverified. This artifact proves only local source relationships. Missing fields remain absent/unavailable.
4. SQL caps shown above are static candidate query shapes. Adapter implementation must settle its own existing schema DTO, truncation/provenance handling and relevant tests. Detailed canonical attempt/review schema is intentionally not invented.
5. Product implementation, deterministic tests, final independent dual checking and host journeys belong to the parent goal. Nothing here is checker-PASS, pushed, deployed or live-verified.

## 6. Actual checks / tool outcomes

- Initial tools.exec_command requests for PowerShell Get-Content/rg and a minimal pwd both failed before process creation: helper_unknown_error: setup refresh had errors. No shell command was executed by that tool.
- Fallback used node_repl local fs.readFile / fs.readdir, numbered line slicing, and node:child_process execFile('rg', argv, {cwd:B or F}) for static searches only. No repo code was imported or run.
- Representative successful static commands: rg --files src -g *Auth* -g *auth* -g *counsellor* -g *compare* (frontend); rg -n 'AiProfileAssessment|ai_profile_assessments' app/api app/services (backend); rg -n 'async def get_student_shortlist|deleted_at|db.commit|db.flush|_sync|reconcil' app/services/student_shortlist_service.py (backend).
- Missing guessed paths (shortlist_service.py, session/router.py, services/student.py) returned ENOENT/rg exit2; resolved exact shortlist/session paths from imports/files. A few regex patterns containing an unescaped opening parenthesis failed parse; narrower successful searches and source reads supplied the cited facts. No successful lookup was inferred from those failures.
- SHA256 of pinned maker/checker file bytes: MATCH, values listed under Scope. Evidence file read-back and source identity list follow. No tests/typecheck/build/DB/provider checks requested or run.

### Source identity at evidence closeout

- B:/app/api/v1/student/ai_counsellor_router.py — 391340fc3882532e30a88b8e3e19af31221dd0461782b490c4fa19f681f3afcd
- B:/app/models/user.py — 0bd57fcfbed9f1f846841a51fdc9891afc309b27324a1d4152cfdc4cb17836d9
- B:/app/models/student.py — 31e9a0e47f1043c937d03076e20c0dd808ebcaa5e17b0969d8f761054603d6b8
- B:/app/models/student_shortlist.py — 94f276a4f01da2faae9c294971b258f55a000171c7c16c3576fb4356665fb76d
- B:/app/api/v1/journey_map/utils.py — 7a78f1f01539e416e95301eaf7bcb4ee4f352902a217953464731a91f7ae7612
- B:/app/deps.py — cf1568bb427115809fc0709746b66e1d6e7b32e43613eda7a3a470f89abe9723
- F:/src/components/student/ChatWidget.tsx — 38b16727ec737db66d9c71e621cf8134d5f867ccd3f184600733894c2a453821
- B:/app/api/v1/student/shortlist_router.py — 6c091ba19e983be8948e48ea682a46734432dcd9d9cc050f444ce23dc9183182
- F:/src/context/student/auth-provider.tsx — be67e1ac6441761daf7288ce2611c2de9ff5af00f1b8c531ba94f3b2bfe14631
- B:/app/services/student_ai_counsellor.py — bec3a6fd7586afcae3e50aa1006e17cefe960280f058c4382001fc74038ad951
- B:/app/models/pathlynks_snapshot.py — 1085ab74b136613af9b004ee37690392c4b03e3c16606868efbc6e4bb1daa8b2
- B:/app/models/career_interest_attempt.py — 735da7f97809dc2d5bbba5bebf3f078f1ebad784fe13739a2d6c11fdb92c202b
- F:/src/lib/student/api.ts — 65865f80b6a67ba36d69dd291a1cb3db1a9da18bfd047d6bab75264940354ce4
- F:/src/app/student/(main)/layout.tsx — 887ef9fdd15534763d64957c29be5a029e982a2b3713d8188353cc3d96db9c5b
- B:/app/api/v1/university_suggestion/router.py — f0808675ed4d9980c7cb7fa8afd3c2cddb607d35cc6a96454d2e0e32da43355e
- B:/app/services/student_shortlist_service.py — 6c64af8ac4be387db322dd8562645d4d861b5fddfd2f83a44f0ef511e8c8d15c
- F:/src/app/student/(main)/ai-counsellor/page.tsx — 0d2d7c980117587d2efed24b5b4f36183aff1a7d547d7e849b05f37d24a889d1
- F:/src/app/student/layout.tsx — f4289a7a3a2e0cec67edadc7f25cdc4944eb996376dffbdd8526f983ff1eef4c
- F:/src/lib/student/axios-client.ts — a47f12255cf87ad1f9f4d846c3a62a620face22e942fe63bcd3f3f83623612bd
- B:/app/services/recommend_profile.py — a614fe0cf5a0bf41ebf4685e9c66eb1a9f6ce18d79c2bcfe01b3e7c1d66fc258
- F:/src/app/student/store/coursecomparestore.ts — 6384d00de097964ba137666dd75f4f03eaafe085e57df0fb4849c1da11ef2e77
- F:/src/app/student/store/collegecomparestore.ts — 8aca34f6555d7c62f3914ce246f3de9905eb4fd4cc59bd6b6fc2e0b16dff3a25
- F:/src/app/(public-student)/(main)/course-compare/page.tsx — c879261689ddf39b27d4ce9f83c04c888cac669a1d67bb659d8af4cb65c29cda
- F:/src/app/(public-student)/(main)/college-compare/page.tsx — 7f0c680773328854d22b78979f4d26ff7aa7e2362e2dbe06b512ed9710e23455
- F:/src/app/student/(main)/ai-counsellor/_components/VideoCounsellor.tsx — a5aa8bf4f7302b86d05ef02b91cea8e5b3eef2e5ca7e73dd21f3273aebebc9a8
- B:/app/models/ai.py — 8b1f027d832f74f425da7e03adf009725f849825fcbb7fdfc75514f4577c21c0
- B:/app/core/security.py — 8328812fa382e6cdbd7b404b8034812c81acea01b8ea87d54436145c0a87fed4
- B:/app/api/v1/session_router.py — ac4287e0521b8db76e5639101b6e16b9cc688f5627e08c5b9456cab4dc1e9a52
- F:/src/app/(public-student)/(main)/course-compare/_components/CompareWorkspace.tsx — 910ab652cb3d70d1d107f86b30e50339ebb7237ab8c41d882c9a51764cc3d87f
- F:/src/app/student/(main)/shortlisted-programmes/page.tsx — 10fcdd84c7dbee6a07a2719beb0933f97f5c3a8a4188a732c575d76d4e199382
- F:/src/app/student/(main)/u/profile/page.tsx — 1be4320f3d1abd84efc2809975a4e5c9397973a95a2af80f8ad152fab59e464e
- F:/src/app/student/(main)/session-recordings/page.tsx — a3f23fc1b9a30a8ff6d97f85bd9af047b33f90d12c71ebd68f87aea5096c6a69
- F:/src/app/student/(main)/universities/shortlist/page.tsx — 8e5b44910b6635f3947de10d74f357c2cff4a773973faadb0b18174ef1e158a2
- B:/app/models/programme_gap.py — 8f696d68524b10aad665fb01d87da1058cf8a8ae9954aec5389a0a1e56dcce5d
- B:/app/api/v1/ai/router.py — 94011621d45af0bc2988a6075a8d9e68afafc2dce822cf9f6d9ef409ce65bbe9
- B:/app/services/ai_service.py — ec95420686ea21b881ffd9e9fe6f3e97c1467a0ee5c0bcc61ab2979720632fcd
- B:/app/services/canonical_scores.py — 108670772c58e568b0bd5c65310be140c1af5f6c66826ae9cdd1b1d4a4def1ea
- B:/app/api/v1/student/pathlynks_snapshot_router.py — 8f5290b2cbf05770da8305fa0ceeb2fb2c0951f5994d4b7a456a6991a7c938ff
- B:/app/main.py — e6a3185767886baed2c82e3a97487a69851481d910577bc22038ba2fd895d8e7
- F:/src/hooks/student/use-auth.ts — 9395cf30156af613a1784359f36f74b4100bc875bca6815a18607562d970b879
- F:/src/context/student/AuthContext.tsx — 2cfdd50545d88f221362934b88fb6ff39f4655d10b7eac13884be29ba9a97f87

Source files first read through numbered-file helper and re-read at closeout: 37; changed between those reads: 0. Regex-only source hashes were captured at closeout, with no earlier baseline asserted.
