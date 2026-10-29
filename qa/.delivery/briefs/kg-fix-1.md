# kg-fix-1

Fix round 1 for the T8 knowledge graph, limited to packages/engine/src/ingest/**. Do not touch admin-routes.ts, graph.ts, classify.ts, navigate.ts or port.ts, because another lane owns them. TDD, edit in place.
1. ReDoS (senior finding 1): COLUMN_STMT in migrations.ts:681 used at :840 is cubic on whitespace. Skip lines over 400 chars before exec, or rewrite the regex to be linear. Add hostile-length tests for COLUMN_STMT and ROUTER_PREFIX (5000+ spaces, under 50 ms).
2. Edge verification (data finding 3):
   - writerFound (migrations.ts:1014) only checks router handlers. Also verify model-file seeds against the parsed model class and its table, and service-file seeds via a bounded scan of the service file for the table or model name. Anything still unverifiable gets an explicit reason tag (e.g. verifiedBy:"none", reason).
   - Investigate and fix the false negative shortlist_router.py:50 -> student_shortlisted_courses.
   - Record verifiedBy (router|model|service) on each edge.
   - Use the fixtures already in the tests. You may read the live schema_map in Mongo virtual_counsellor.source_artifacts read-only to recount verified edges with the new logic, offline, counts only. Do not write to Mongo.
3. Add an exported pure helper in ingest (e.g. shouldKeepLastGood(prev, next) for a >30% shrink in tools or tables, an empty graph, or skipped>0) with tests. Another lane will call it from admin-routes later.
Run: cd packages/engine && npx tsx --test tests/ingest-routes.test.ts tests/ingest-migrations.test.ts ; npx tsc --noEmit. Write qa/evidence/tool-first/kg-fix-1.md with the before and after verified counts.
