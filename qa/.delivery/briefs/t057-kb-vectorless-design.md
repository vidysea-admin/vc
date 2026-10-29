# t057-kb-vectorless-design

Read-only design study. Umesh says the VC KnowledgeBase (repo D:KnowledgeBase, live at the VC_KB_BASE_URL host) was supposed to be used as VECTORLESS RAG (PageIndex-style: an offline LLM-built JSON tree index of sections/topics with node summaries; at query time the LLM reads the compact tree, picks node ids, then answers from those nodes with citations). Today VC calls lexical /search (unindexed regex prefilter + per-candidate visibility checks; see qa/evidence/t057/kb-slowness-analysis.md) which takes 6-40+ s.

Answer with file:line evidence:
1. Does D:KnowledgeBase already contain a vectorless / tree / PageIndex / taxonomy / topic-index / summary-tree path (grep: tree, pageindex, node_id, toc, taxonomy, summary, index build, wiki, outline, /ask internals)? Is it built, populated, exposed by an endpoint, and why does VC not use it? Check its README/docs/ARCHITECTURE/DECISIONS for the intended retrieval design.
2. What is the corpus shape: collections (turns, sessions, sources, documents?), counts if a read-only count is cheap via an existing script or endpoint, and whether content has natural structure (country > topic > subtopic, source > section) suitable for a tree.
3. What does /ask do today (LLM? which model? does it already do tree/node selection?).
4. VC side: mcp/university-kb/src/kb-client.ts and packages/engine/src/student/graph.ts answerFromKb: which endpoints VC calls and where a tree-search path would plug in.
5. Proposed design (concrete, minimal): where the tree lives (KB Mongo collection vs VC virtual_counsellor), build job (offline, Gemini 3.5-flash-lite, node = {node_id,title,summary,children,turn/source refs}), query path (one fast LLM call over the compact tree -> node ids -> fetch node text by id with indexed lookups, visibility check only on the selected nodes), expected latency per stage, and how the visibility/permission rule is preserved. Say which edits are in the KB repo (sibling, needs Umesh approval, D-001) vs VC. Note the brain caveat: vectorless needs structured docs and costs one LLM call per query.

Write qa/evidence/t057/kb-vectorless-design.md. Return <= 30 lines.

