# tool-first T2 live verification (tf-t2-live-verify)

Date: 2026-10-29. No commit, no push, no service restarted, no code changed (no column/literal was wrong, so port.ts and its tests are untouched). Output below is column NAMES, enum values, ok flags and row counts only; no row content, no secrets.

## Method
- Probe scripts (scratchpad, not in repo): `t2live.mts` and `t2store.mts`, run as `npx tsx <script>` from the repo root, env from `.env` (key names only: VIDYSEA_DB_PASSWORD, VIDYSEA_DB_CA_FILE, VC_TEST_VIDYSEA_USER_ID, MONGODB_URL).
- Connection built with `buildPgConfig` + `defaultConnect` (`mcp/pathlynks/src/connect.ts`), the `vidysea-db` entry of `config/sources.json`, session `SET default_transaction_read_only = on`. Reads 3 use the real `createVidyseaPort` (`mcp/pathlynks/src/port.ts:385`), so the shipped SQL (`port.ts:450-489`) is what ran, including the per-table privilege probe.

## 1. information_schema.columns (public schema, the 7 new tables)
Every column referenced by the SQL at `port.ts:450-489` exists in all 7 tables: `missing_used_cols=[]` for user_course_journey_map (15 cols), journey_phases (4), milestones (30), applications (35), visa_applications (19), user_favourites (9), saved_scholarships (23). No table missing.

## 2. SELECT DISTINCT status (enum values only)
- milestones.status: `Completed`, `In Progress`, `Not Started`, `Pending`
- applications.application_status: `accepted`, `application_created`, `deposit_paid`, `draft`, `new`, `sample_questions_shared`, `visa_service_initiated`
- visa_applications.status: `pending`
- saved_scholarships.status: `interested`
- user_course_journey_map.offer_status: `accepted`, NULL

Finding for T4 (not a wrong literal): `port.ts:458-460` counts 'Completed' / 'In Progress' / 'Not Started' (all three confirmed). A fourth live value `Pending` exists, so `milestones_total` can exceed completed + in_progress + not_started; T4 must not assume the three buckets sum to total. `next_due_date` (`port.ts:461`) uses `IS DISTINCT FROM 'Completed'`, which correctly includes Pending. Application statuses are lowercase snake_case; T4 should not assume title case.

## 3. Live reads for the test student (VC_TEST_VIDYSEA_USER_ID)
- getStudentProfile: ok rows=1 (control: the id resolves to a live student)
- getJourneyMaps: ok rows=0 truncated=false
- getApplications: ok rows=0 truncated=false
- getVisaApplications: ok rows=0 truncated=false
- getFavourites: ok rows=0 truncated=false
- getSavedScholarships: ok rows=0 truncated=false
- getShortlistedProgrammes: ok rows=0 truncated=false

All SQL executes without error against the live schema (join columns, LATERAL aggregate, privilege probe over the 7 new tables all pass). Caveat: the test student has no rows in any of these tables, so row-shape (non-empty) output was not exercised live; syntax, column names and join keys were.

## 4. Stored vidysea-db source doc (virtual_counsellor.sources)
Via `createAdminStore(db).sources.upsert` (`packages/db/src/admin-store.ts:328`), changing only `config.tables`:
- before: users, students, student_shortlisted_courses, ai_profile_assessments, pathlynks_student_snapshot (5)
- after: those 5 + user_course_journey_map, journey_phases, milestones, applications, visa_applications, user_favourites, saved_scholarships (12), identical (array order included) to `config/sources.json` vidysea-db.tables.
- Other config keys unchanged (siteId, platform, enabled, host, port, database, user, sslmode, passwordRef); hasSecret=false before and after. Written only to db `virtual_counsellor`. The running API caches the port by config identity, so it adopts the new list at its next cache refresh without a restart.
