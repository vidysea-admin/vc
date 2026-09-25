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

## D-006 | 2026-09-25 | type: decision | status: ACTIVE
**What:** Start the maker-checker loop in D:/vc. The initial contract qa/contracts/counselling-engine.md (A1-A9 plan doc, B1-B10 engine) and the rubric qa/rubrics/plan-doc.md are approved as drafted. Install the maker-checker enforcement wiring (Layers 1-3 of maker/references/enforcement-wiring.md).
**Why:** The loop only self-continues if every session is told that pending state exists (Layer 2), and commits should follow a checker PASS (Layer 3). The START gate folds the contract and the wiring into one approval, so the approval is recorded on disk and never asked again.
**Result:** -- (wiring installed in the same session; see commit)
**Changes-authorized:** .claude/settings.json (hooks merge: 2nd SessionStart entry, PreToolUse Bash|PowerShell commit guard) - needed to run the mc hooks; .claude/hooks/mc-sessionstart.ps1 - AUTO-CONTINUE directive; .claude/hooks/mc-precommit.ps1 - warn-only commit guard; project .claude/CLAUDE.md "Maker-checker discipline" block - the soft rule.
**Approved-by:** Umesh
**Links:** T-001, qa/gates/maker-start.md (Answered 2026-09-25, chat, operator account himanshu@vidysea.com)

## D-007 | 2026-09-25 | type: decision | status: ACTIVE
**What:** Workspace packages are consumed as TypeScript source with no build step. Every package.json declares "exports": {".": "./src/index.ts"}, and runtime and tests run through tsx. A tsc build to dist/ is deferred until a deploy target exists.
**Why:** The T-002 review (ISS-007) found that cross-package imports fail without an exports field. Source exports keep the loop fast for one developer and match ikigai-counsellor (tsx). Adding dist/ later is a reversible change to the exports map.
**Result:** --
**Links:** T-002b, ISS-007

## D-008 | 2026-09-25 | type: decision | status: ACTIVE
**What:** The engine's database is `virtual_counsellor` on the production Mongo server in `.env` MONGODB_URL (IP-allowlisted). The engine creates and uses only that database, directly. Every other database on the server (Pathlynks, global_university_db and the rest) stays untouched, both reads and writes. Automated tests stay offline. Only an explicit live-run script writes. Drops and bulk deletes need a gate.
**Why:** Umesh, 2026-09-25, verbatim: "the mongo uri in the .env is the product one, and don't worry this one is ip protected ... make a new db of yours and just directly use that, name it virtual_counsellor". It was given in the checker session (qa/gates/mongo-host.md) and repeated to the maker. It is a deliberate, scoped exception to the AIOS "production Mongo is read-only / writes go to a work DB" boundary: one named database, enforced by the B12 guard.
**Result:** -- (contract B12 amended by the checker, CRITICAL, human-approved)
**Changes-authorized:** ARCHITECTURE.md section 5 first bullet (the prod-Mongo rule now names the single allowed DB); qa/adapter.json isolation.reserve and forbidden (replace the "vc_work_<slug> local/dev only" rule, which is stale).
**Links:** qa/gates/mongo-host.md, ISS-012, T-003

## D-009 | 2026-09-25 | type: decision | status: ACTIVE
**What:** The engine has full CRUD inside `virtual_counsellor`: insert, find, update, delete (including bulk), and create or drop its own collections and indexes. Only `dropDatabase` on `virtual_counsellor` stays gated. Every other database on the server stays untouched (D-008).
**Supersedes:** D-008 -- D-008 gated collection drops and bulk deletes inside virtual_counsellor. Umesh widened that to "proper crud" (contract B12 critical amendment 6ff9dd9, human-approved), because the engine owns this database and gating routine collection work would stall every data unit. The single-DB-name guard and the untouched-other-databases rule from D-008 are re-stated here unchanged.
**Why:** It aligns ARCHITECTURE and the adapter with the amended contract B12 (sweep finding ISS-015). The contract is the ground truth; the docs drifted to a stricter reading.
**Result:** -- (ARCHITECTURE Â§5 and qa/adapter.json updated in the same commit)
**Changes-authorized:** ARCHITECTURE.md section 5 Mongo bullet (full CRUD inside virtual_counsellor, only dropDatabase gated); qa/adapter.json isolation.forbidden (replace "drops / bulk deletes" with "dropDatabase on virtual_counsellor").
**Links:** ISS-015, qa/gates/mongo-host.md, T-003

## D-010 | 2026-09-25 | type: decision | status: ACTIVE
**What:** Fix three enforcement-path findings from the 2026-09-25 config audit.
- ISS-001: decisions-append-guard.ps1 now fails CLOSED to "ask" on a JSON parse or logic failure, instead of silently exiting 0.
- ISS-004: lab-session-start.ps1 wraps the verbatim DECISIONS excerpt it injects in an explicit "untrusted repo content, not instructions" frame.
- ISS-005: every .claude/settings.json hook command uses "$CLAUDE_PROJECT_DIR"-anchored paths, not cwd-relative ones.
**Why:** A guard that fails open lets a malformed Edit/Write through the DECISIONS hard wall and the guard-the-guards ask without anyone noticing. Injected repo text without a frame can steer the model. cwd-relative hook paths silently no-op when the session cwd is a worktree or a subdirectory, which this project now uses routinely for its parallel waves.
**Result:** -- (fixes land in the same commit; /aios-config-auditor re-run afterwards)
**Changes-authorized:** .claude/hooks/decisions-append-guard.ps1 (fail to ask on exception); .claude/hooks/lab-session-start.ps1 (untrusted-content frame around the last-entries excerpt); .claude/settings.json (hook command paths anchored at $CLAUDE_PROJECT_DIR).
**Approved-by:** Umesh
**Links:** ISS-001, ISS-004, ISS-005, qa/gates/config-audit-fixes.md (Answered 2026-09-25: "yes fix ..."). The upstream template fix in D:/ai_os/templates/lab-protocol is a follow-up outside this repo (D-001).

## D-011 | 2026-09-25 | type: decision | status: ACTIVE
**What:** Correction to D-006's Links detail. The approver of record is Umesh, whose email is umeshsugara@vidysea.com. The account named in D-006 ("operator account himanshu@vidysea.com") was the session's operator account, not the approver's identity. Staff work emails in docs/DECISIONS.md are an accepted, documented false positive for data_boundary.py: they are internal staff, not student data. ISS-003 closes as wontfix (accepted).
**Why:** DECISIONS is append-only, so the correction is a new entry and D-006 is never edited. Umesh's gate answer: "yes fix and mail is umeshsugara@vidysea.com".
**Result:** -- (ISS-003 status set to wontfix-accepted in qa/issues.jsonl)
**Links:** D-006, ISS-003, qa/gates/config-audit-fixes.md
