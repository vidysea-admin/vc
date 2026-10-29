# wire-fix-1

Fix and wiring round 1, under D-134. TDD, edit in place. Another lane owns packages/engine/src/** (except reading it), mcp/pathlynks/src/port.ts and engine tests. Do not touch them.
1. Pathlynks Career Quest live wiring (pl-mongo.md blockers):
   - Add kind "mongo" to packages/schemas/src/sources.ts (database name + allowed collections allow-list, enabled flag; secrets only via env key name, same pattern as postgres).
   - Add a pathlynks-journey source to config/sources.json (enabled, database pathlynks_journey, collections pathlynks_quest_profiles, pathlynks_goals, pathlynks_activities, pathlynks_skill_activities).
   - Update the sources count tests (they currently fail 6 !== 5): pin the exact set, not just a count.
   - In packages/db/src/client.ts (contract B12, qa/gates/mongo-host.md), add a read-only opener for a NON-virtual_counsellor database. It must expose only find/aggregate/countDocuments with readPreference secondaryPreferred, and must refuse any database not on an allow-list that contains only pathlynks_journey. Add a test that it has no write methods and refuses other database names.
   - Pass it as questDb in apps/api/src/index.ts so admin-routes passes the quest methods through, and re-export the quest types from mcp/pathlynks/src/index.ts.
2. Voice: expose the vidysea_* and pathlynks_* progress tools through createQuestVoiceTools in apps/api/src/index.ts, using the same owner binding as chat. Add a test.
3. GitHub sync (data findings 1-2), apps/api/src/admin-routes.ts:
   - :779-795 and :824-825: keep the last good artifact when the hub or nav file is missing, on a >30% shrink in tools or tables, or when skipped>0. Use the shouldKeepLastGood helper the kg-fix-1 lane is adding to packages/engine/src/ingest; if it is not exported yet, wait (re-check every few minutes; long waits are normal) and do the other items first.
   - :948-951: make listTree return the commit sha (commits API for the branch) and the tree sha, and store them in every artifact. Add tests.
4. Add the new env key names (if any) to .env.example.
Run the schemas, db, api (admin-sync, admin-routes, chat-pathlynks, voice-*) and mcp/pathlynks tests, plus tsc for each. Do not restart the API. Write qa/evidence/tool-first/wire-fix-1.md.
