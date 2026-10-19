# U6b: does the KnowledgeBase repo hold structured cost / scholarship / visa data?

Gate answer: D-097 item 3 (Umesh): the ranking data source is https://github.com/vidysea-admin/KnowledgeBase, read-only (D-001).
Checked 2026-10-19T00:2x+05:30. Nothing was committed, pushed or fetched into that repo; no student data was sent anywhere.

## What was read
- Local clone `D:/KnowledgeBase` (remote `origin` = https://github.com/vidysea-admin/KnowledgeBase.git, branch `master`, working tree has local changes): read only with grep/cat.
- Remote `origin/master` tree listing (11,983 paths) via `gh api repos/vidysea-admin/KnowledgeBase/git/trees/master?recursive=1`, and a raw read of all 47 `schema/*.json` files plus `apps/api/src/knowledge/catalog-router.ts` and `packages/core/src/generated/programs.ts`, copied into the scratchpad only (`.../scratchpad/kb-origin`, `kb-tree.txt`).
- Consumer side in this repo: `mcp/university-kb/src/index.ts` lines 50-63 (`CourseDocSchema`).

## Findings (file paths)
- `schema/programs.schema.json` (local clone and origin/master): `programs` = webinar cohorts. Fields: `_id`, `tenantId`, `name`, `orgRef`, `sessionRefs` (+ `additionalProperties: true`). No cost, scholarship or visa field. Fixture `schema/fixtures/programs/valid.json`: `{"name":"MBA Abroad Cohort 2026"}`.
- `schema/orgs.schema.json`, `schema/topics.schema.json`, `schema/sources.schema.json`: no such fields (keyword grep over all 47 origin schema files for tuition|scholarship|visa|fee|cost|currency|funding|annual matched only `schema/answer_runs.schema.json` (`costUsd`, `costStatus` = LLM spend) and `schema/jobs.schema.json` (`maxCost`, `costUsd`, `costStatus` = job spend). Neither is tuition or study cost.
- `schema/claims.schema.json`: a claim is free text (`text`, `status`, `evidence[turnId, sessionId]`, `confidence`). Example `data/toc-migrated/2026-05-22-uniaccess-xavier-university/claims.json` c01/c02: "11:1 student-to-faculty ratio", "$2.8 million grant from the NIH". Prose, no typed numeric field, and not per option.
- `apps/api/src/knowledge/catalog-router.ts`, `packages/core/src/generated/programs.ts`: no tuition / scholarship / visa field.
- API route files under `apps/api/src/routes/` and `apps/api/src/*/router.ts` (ask, search, graph, pages, citations, compete, knowledge/catalog, knowledge-outputs, grounded-content...): counselling-session retrieval and admin routes; no route that returns per-university cost, scholarship or visa values.
- Non-test source under `apps/`, `packages/`, `schema/`, `migrations/` (local clone): the only matches for tuition|scholarship|visa|cost are a placeholder question in `apps/api/src/routes/compete-page.ts:83` and code comments in `packages/index/src/graph/build-graph.ts:96`, `packages/index/src/graph/types.ts:10`, `packages/index/src/vector/cosine.ts:11`. Everything else is under `data/`, `raw/`, `qa/` transcripts and corpus dumps (prose).
- `mcp/university-kb/src/index.ts:54-63` `CourseDocSchema`: `courseId, universityId, name, country?, level?, sourceUrl, fetchedAt`. No cost / scholarship / visa.

## Conclusion
No structured cost, scholarship or visa field exists in the KnowledgeBase repo (checked at origin/master and the local clone). The only place those topics appear is session transcript prose and free-text claims. Therefore NO adapter is added. The typed `OptionDataPort` stays; the real source for `cost`, `scholarshipChance`, `visaEase` (and option attributes for fit) is NOT PROVEN. Extracting numbers from prose would be the model/guesswork route that B24.8 rules out ("numbers come from KB data, not the LLM").

Open for Umesh: which structured source supplies per-option numbers (a new KB collection with typed fields, or another system)? Branches of origin not read in full: `codex/*`, `lane/*`, `wave/*` heads exist; a structured collection on an unmerged branch would not be visible from master.
