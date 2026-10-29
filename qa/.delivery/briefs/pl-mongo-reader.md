# pl-mongo-reader

Maker lane under D-134 (Umesh approved a READ-ONLY reader for Pathlynks Career Quest data in Mongo database pathlynks_journey). Work TDD, edit in place in EXISTING files only (no new source modules; if one seems truly needed, stop and report the proposed target).

Step 0 (probe, read-only): find which env key names could reach the Pathlynks Mongo (worktree .env, D:/vc/.env, and the Pathlynks backend repo env referenced by pathlynksMongoDB.js in the inventory). Key NAMES only. Using the driver, list collection names and estimatedDocumentCount for pathlynks_quest_profiles, pathlynks_goals, pathlynks_activities, pathlynks_skill_activities, plus which field identifies the owner (student id / user id) and how it maps to the Postgres users id the port already binds to. Find the test student the walk uses and report counts only. Never print documents or values. If no credential can read it, write the evidence, skip steps 2-3, and report the exact DevOps ask.

Step 1: fix G2 in mcp/pathlynks/src/port.ts (~119-121): the saved-careers SQL lacks the save_type filter. Red test first.

Step 2: add owner-bound read-only Career Quest reads to the existing Pathlynks port (the same object that holds getJourneyMaps etc.): quest profile summary (island states, selected career title, picks count, target university name, XP/level), goals (title, status, due), activities and year-plan progress (counts by status, next item). Use projection allow-lists; NEVER return reflection, description, proof_*, shareToken, factualAnswers, persona graph or AI session content. Use readPreference secondary-preferred if available, maxTimeMS 3000, limit 51, and no write method anywhere (add a test that the reader exposes only find/aggregate/count). A Mongo outage means unavailable, not zero rows.

Step 3: wire into the engine the way T4 did for Vidysea (see t4.md): tools for the Pathlynks host (career quest progress, goals, year plan), classify rules (English + Hinglish), zero rows give guidance via the existing recipe path, and an outage gives the cannot-see message. Add a pathlynks-journey source to config/sources.json (enabled only if step 0 succeeded).

Tests: focused files + tsc for mcp/pathlynks, engine, api, schemas. Write qa/evidence/tool-first/pl-mongo.md with the commands and outputs.
