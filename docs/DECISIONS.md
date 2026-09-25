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

## D-012 | 2026-09-25 | type: decision | status: ACTIVE
**What:** A fact document's identity is separate from its content. Every fact write gets a fresh `_id`: a driver ObjectId or a ULID, never derived from content. A separate `contentHash` field (sha256 of the JSON array [studentId, key, canonical value, sessionId]) detects idempotent replays: the write is skipped when the active fact's contentHash equals the candidate's. Supersession keeps retire-then-insert with a CAS on {_id, validTo unset}. On a CAS or 11000 failure the writer re-reads the active fact and treats a matching contentHash as its own already-landed write.
**Why:** T-003b cycle-1 reviews (data-engineer Block, senior Block, 2026-09-25) reproduced two failures. First, a content-addressed `_id` collides with the retired historical document when a student reverts a value (A to B to A), leaving the key permanently at zero open facts. Second, a concurrent replay of the identical decision throws a spurious FactConflictError. Separating identity from content fixes both and keeps the ISS-020 idempotency guarantee.
**Result:** -- (implemented in T-003b fix cycle 2)
**Links:** T-003b, ISS-026, ISS-020, T-011 (edges have no studentId; B15 erasure resolves them in two hops via the student's fact and session ids)

## D-013 | 2026-09-25 | type: decision | status: ACTIVE
**What:** An open fact carries an explicit `active: true` field. Retiring a fact sets validTo and unsets `active` in the same CAS update. The unique partial index is `{studentId:1, key:1}` with `partialFilterExpression: {active: true}`. Every "open fact" query filters on `{active: true}`, with validTo kept for history.
**Why:** MongoDB partialFilterExpression accepts equality, `$exists: true`, range, $type, $and, $or and $in, but NOT `$exists: false` (docs: mongodb.com/docs/manual/core/index-partial, checked 2026-09-25). The T-003b index `{validTo: {$exists: false}}` would therefore fail to create at db:init on the live server, leaving the concurrency guarantees (ISS-019, D-012 11000 handling) with no index in production. The offline fake accepted it. The T-003b cycle-2 builder flagged this and the docs confirm it. A live probe on a scratch collection was not run (classifier-denied).
**Result:** -- (implemented inside T-003b cycle 2 before the checker; the fake must now reject unsupported partial filters)
**Links:** T-003b, D-012, ISS-019

## D-014 | 2026-09-25 | type: decision | status: ACTIVE
**What:** Add a `scribe_resolutions` collection to packages/db. Each document is `_id = threadId`, with a unique `{threadId:1}` index and a `{studentId:1}` index. It is the atomic, cross-process claim for resuming a paused scribe thread: exactly one counsellor decision per thread; every other caller gets already_resolved with the winner's decision. Claims are never deleted in normal operation. They hold decision and fact values, so T-011 erasure MUST purge them by studentId, together with scribe_checkpoints and scribe_checkpoint_writes.
**Why:** The T-007 cycle-1 senior review reproduced a TOCTOU race. Two concurrent resumes of one thread both reported "written" while only one decision persisted, so a counsellor's reject or edit was silently dropped (ISS-t-007-rev-8, high). A read-then-invoke check cannot close that race. A single-document insertOne on _id can, and it is atomic server-side. This authorizes T-007 cycle 2's edits to packages/db/src (collections.ts, db-init INDEX_PLAN), which the T-007 manifest had listed as untouched.
**Result:** -- (T-007 cycle 2, 087ffa0)
**Links:** T-007, T-011, ISS-t-007-rev-8, ISS-t-007-c1-2, D-012

## D-015 | 2026-09-25 | type: decision | status: ACTIVE
**What:** Erasure uses fence-plus-compensation, because there are no multi-document transactions.
- confirmErasure sets an erasure fence for the studentId BEFORE executeErasure resolves any selector. The fence is a single document with a unique studentId.
- Every student-data writer (applyApprovedDiff, the scribe claim, and scribe start/resume, whose checkpoints come from graph.invoke) checks the fence AFTER its own writes. If the fence is set, the writer deletes what it just wrote and returns a refused/fenced result.
- The fence lives from confirm until the request completes. Whether it lingers afterwards (re-enrolment policy) is left to gate erasure-fencing Q1.
**Why:** The T-011 cycle-1 checker (FAIL, ISS-t-011-c1-1) and data-engineer review (ISS-t-011-c1-rev-1) reproduced a write landing after a collection's read-back count, or between the final read-back and the completion CAS. It survived while the receipt said verified. Another read-back pass only narrows that window. Fence plus post-write compensation closes it with single-document linearizable operations:
- a write that completes before the fence is visible to the purge, which resolves after the fence
- a write that starts after the fence sees it in its own post-check and removes itself
**Result:** -- (T-011 fix cycle 2)
**Links:** T-011, ISS-t-011-c1-1, ISS-t-011-c1-rev-1, qa/gates/erasure-fencing.md, D-012, D-014

## D-016 | 2026-09-25 | type: decision | status: ACTIVE
**What:** An erasure fence must outlive every writer that could have passed its pre-check before the fence existed.
- **Writer deadline:** every fence-aware writer runs under an enforced deadline `FENCED_WRITER_DEADLINE_MS`. It uses the driver-level operation timeout (mongodb@6 `timeoutMS` or maxTimeMS) plus an application deadline. Its post-write fence check (compensation) ALWAYS runs, including after a timeout or an error.
- **Minimum hold:** the fence is not removed before `fence.createdAt + FENCED_WRITER_DEADLINE_MS + margin`, whatever the completion time. This technical minimum hold is separate from, and at most as long as, the re-enrolment grace in gate erasure-fencing Q1.
- **One open request per student:** a unique partial index on the studentKey of open requests (pending/confirmed/failed). The fence is released only when no open request remains.
- **Scanner test:** a test in the style of the B12 scanner fails if any module outside the fence-aware allowlist writes to a student-data collection.
**Supersedes:** D-015 -- D-015 said fence plus compensation "closes" the race. That holds only if every writer's post-check runs while the fence exists, which the shipped grace of 0 does not guarantee: the T-011 cycle-2 checker (ISS-t-011-c2-1) reproduced a completed, verified receipt with a surviving fact. The fence and compensation design is kept, and the missing liveness bound is added.
**Why:** A writer whose pre-check passed just before the fence existed finishes, at the latest, within the enforced deadline from that moment. A fence held for at least that long after its creation is therefore always visible to that writer's post-check, and the writer removes its own writes. Every other writer either sees the fence in its pre-check or wrote before the fence existed, and is caught by the purge.
**Result:** -- (T-011 fix cycle 3)
**Links:** T-011, ISS-t-011-c2-1, ISS-t-011-c2-rev-1, ISS-t-011-c2-rev-2, ISS-t-011-c2-rev-4, D-015, qa/gates/erasure-fencing.md

## D-017 | 2026-09-25 | type: decision | status: ACTIVE
**What:** The scribe owns the start of a `sessions` row, and the D-014 claim carries a run lease.
- **Session row:** startScribe upserts {_id: sessionId, studentId} with scribeThreadIds ($addToSet) BEFORE the first checkpoint. consentId and startedAt are optional until the session writer (T-008) fills them.
- **Approved summary:** it lives on that row (summary, summaryWithheldReason, summaryApprovedAt). It is written only on approval and never by upsert.
- **Erasure/export:** they resolve scribe threads from scribeThreadIds, as well as from scribe:<sessionId> and claims.
- **Run lease:** the D-014 claim doc carries a lease (lease.token, and lease.expiresAt = writer deadline + FENCE_MARGIN_MS). A resumeScribe(null) recovery takes it atomically; the loser gets `in_progress`.
- **Not decided:** moving the lease to the session row, which would also cover a recovery before any claim exists (T-016 residual 1). That needs its own entry.
**Why:** Three gaps from earlier reviews:
- ISS-t-011-rev-5: a run that ended without an interrupt had no anchor that erasure could discover.
- ISS-t-007-rev-7: the approved summary had no durable home.
- ISS-t-007-rev-10: recovery could invoke concurrently with an in-flight winner.
Consent is still enforced by requireConsent against the consents collection (B4), not by SessionDoc.consentId.
**Result:** -- (T-016 cycle 0, checked-PASS; the follow-ups ISS-t-016-rev-1 and ISS-t-016-c0-1 are in T-017)
**Links:** T-016, T-017, T-008, ISS-t-007-rev-6, ISS-t-007-rev-7, ISS-t-007-rev-9, ISS-t-007-rev-10, ISS-t-011-rev-5, D-014, D-016

## D-018 | 2026-09-25 | type: decision | status: ACTIVE
**What:** Counsellor approval is decided per fact, and the web approval API is demo-safe by default.
- **Per-fact response:** `ApprovalResponse` gains `per_fact`. The response decides every proposed key exactly once (approve, edit or reject), and approves or withholds the summary. A response that does not do this is refused before any claim, so nothing is written. The whole-batch approve/edit/reject responses are unchanged.
- **Edits:** an edit replaces only the value; the fact keeps its original transcript source. Rejecting every fact and withholding the summary makes the run `rejected`.
- **Web approval API:** Next.js route handlers in apps/web. They run in `demo` mode (the in-process fake) unless `VC_WEB_MODE` is exactly `live`.
- **Build:** apps/web builds with webpack (`--webpack`) until Turbopack resolves the workspace packages' NodeNext `.js` specifiers.
**Why:** Whole-batch approval could not hold back a flagged fact (ISS-t-013-rev-5), and B3 needs a per-fact human decision. Defaulting to demo mode keeps a misconfigured web server from writing to the production server (B8/B12).
**Open:** the provenance of an edited value is gated separately. The edited value keeps the original quote, which can contradict it. See qa/gates/edit-provenance.md.
**Result:** -- (T-008 cycle 0, checked-PASS; senior review Approve)
**Links:** T-008, ISS-t-013-rev-5, ISS-t-008-c0-1, T-013, D-014, D-017
