# DECISIONS — append-only history (Lab Protocol v1.1)
<!-- Write path after genesis: scripts/append_decision.ps1 ONLY. Schema: D:/ai_os/templates/lab-protocol/DECISIONS.schema.md -->

## D-000 | 2026-09-25 | type: decision | status: ACTIVE
**What:** Adopted Lab Protocol for D:/vc (the Vidysea AI Counselling Engine). Approver: Umesh. Tracking: TASKS.md.
The backfill interview is deferred as T-000.
**Why:** Standing auto-adopt policy (2026-07-11) for personal code dirs. The project spans 6 sibling repos and three
phases, so relitigation and drift are the main risk.
**Result:** Scaffolded ARCHITECTURE.md, docs/, contracts/ (empty), .claude/hooks, scripts/append_decision.ps1 and TASKS.md.
**Links:** T-000, genesis commit

## D-001 | 2026-09-25 | type: decision | status: ACTIVE
**What:** The counselling engine is BUILT in D:/vc, which is its own repo with its own maker-checker loop. Proven pieces
are ported in place from sibling repos (ikigai-counsellor x2, KnowledgeBase, counsellor_validation_judge, sop_mvp,
VirtualCounsellor_Avatar). Those repos are read and never written.
**Why:** Umesh, 2026-09-25: "we have to build here in this current directory". Ownership had been split three ways
(KnowledgeBase T-013, VirtualCounsellor_Avatar, the vc plan).
**Result:** —
**Links:** T-001

## D-002 | 2026-09-25 | type: decision | status: ACTIVE
**What:**
- Workflow framework: LangGraph.js 1.x (TypeScript). A thin StateGraph (Explore/Conclude/Execute plus a post-session
  graph) with a Mongo checkpointer; HITL via interrupt().
- Agents are typed Zod nodes, not a free multi-agent swarm. Deep Agents only later (P2 execution agent), and only with
  a measured gain.
- This overrides the compass report's "plain Node/TS state machine, avoid LangGraph/CrewAI in V1".
**Why:** The Vidysea agentic-architecture standard (brain patterns/agentic-architecture-standard.md, 2026-09-23) makes
LangGraph 1.x the default for product agents, and it matches KnowledgeBase T-050 (Umesh 2026-09-24).
- Checkpointing and interrupt give the counsellor-approval step for free.
- D:/vidysea/ikigai-counsellor already runs @langchain/langgraph 1.3 with the Mongo checkpointer in TS.
- The compass concern (abstraction cost for one developer) is kept by rule: the graph holds wiring only.
**Result:** —
**Links:** T-001

## D-003 | 2026-09-25 | type: decision | status: ACTIVE
**What:** The knowledge graph is a Mongo-native Student Knowledge Graph: typed collections plus an `edges` collection
(pattern from KnowledgeBase graph_edges and tenantScope), with vector search over summaries and courses.
No Neo4j, LightRAG or GraphRAG in V1.
**Why:** At this data size structured facts plus vectors are enough (compass §3). Mongo is already in the stack.
Every fact needs source, validity and purpose tags for DPDP. Revisit a graph DB only for the University KB if query
needs demand it.
**Result:** —
**Links:** T-001

## D-004 | 2026-09-25 | type: decision | status: ACTIVE
**What:** Observability: Langfuse self-hosted (OSS edition, no licence key, TELEMETRY_ENABLED=false, never Langfuse
Cloud), wired through @langfuse/langchain callbacks in graph config. Card metrics (shown/used/feedback/latency/cost)
are also stored in Mongo.
**Why:** Standard rule 5. Traces carry student transcripts, so a hosted tracer counts as an external service under the
hard boundary. Rejected: LangSmith cloud (external), LangSmith self-hosted (enterprise), and raw OTel (no UI).
**Result:** —
**Links:** T-001

## D-005 | 2026-09-25 | type: decision | status: ACTIVE
**What:** Portable core.
- Prompts and soft rules are skills/<name>/SKILL.md files, loaded on demand.
- Hard rules are deterministic code guards that run before any LLM call: no-script, citation-required,
  crisis/distress, consent/purpose.
- Tools are MCP servers: student-profile, university-kb, session-store, and portal-filler in P2.
- Model choice is made by config through a provider seam, ported from KnowledgeBase packages/ai.
**Why:** In the standard, SKILL.md, MCP, typed schemas and LiteLLM are the assets we own, so the framework stays
swappable. ikigai-counsellor's prompts/*.json pattern is migrated to that standard. Skills complement tools; they do
not replace them.
**Result:** —
**Links:** T-001
