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

## D-019 | 2026-09-25 | type: decision | status: ACTIVE
**What:** The provider seam (B6) has four kinds, chosen by `VC_LLM_PROVIDER`, which still has no default.
- **mock:** used in tests.
- **gemini:** still a stub.
- **litellm:** an OpenAI-compatible chat-completions client for the LiteLLM gateway.
  - Config: `VC_LLM_BASE_URL`, `VC_LLM_MODEL` (a gateway class or model), and an optional `VC_LLM_API_KEY`.
  - Behaviour: JSON mode, one attempt per call, typed key-free errors, and a 30 s timeout.
- **rules:** deterministic, with no model.
  - Fact extraction reads `key: value` lines at the start of a transcript turn, and each fact is cited to that exact turn and line (B2).
  - The session summary is a fixed template (B1).

This input contract is provisional until a structured intake form exists. Runtime failover and the live-gateway smoke run are gated separately, in qa/gates/provider-fallback.md.
**Why:** The lead's review, relayed by Umesh on 2026-09-25 (qa/feedback-inbox.md), set two requirements:
- the counsellor tool must not depend on one AI vendor
- the core flow must finish with no AI

The rules e2e proves that scribe â†’ facts â†’ profile diff â†’ approve completes with zero network.
**Result:** -- (T-019 cycle 0, checked-PASS; ai-engineer review Approve)
**Links:** T-019, ISS-t-019-rev-1, ISS-t-019-rev-2, ISS-t-019-rev-3, ISS-t-019-c0-1, ISS-t-019-c0-2, D-005

## D-020 | 2026-09-26 | type: decision | status: ACTIVE
**What:** Umesh answered four gates. Each answer is recorded verbatim in its qa/gates file.
- **Crisis guard (crisis-guard-precision):** the keyword guard matches for recall only and suppresses nothing. A later layer (the T-012 classifier) may mark a flag "likely benign" but can never hide it. Unit T-005c supersedes the stalled T-005b.
- **Citations (citation-guarantee-scope):** the full transcript is persisted as ground truth. Only numbers and the fixed country/alias vocabulary auto-verify. Every other text fact, and a new `reasoning` fact kind, is kept and cited to its transcript span as needs-review for the counsellor (B3). Nothing is dropped. T-013 is rescoped to this.
- **Concern (scribe-concern-level):** a concern-level turn no longer stops the scribe. The concern is written into the KG with its citation. A gentle check-in becomes a live-card question (T-010), never a script. Escalation to counsellor/admin on rising severity goes through T-012. New unit T-022.
- **Provider failover (provider-fallback):** a 3-model chain with a total retry budget of about 10 and backoff, with no drop to the rules provider. When every model fails, engineering is alerted and the user gets an apology plus a Retry that keeps their input. One live LiteLLM smoke run on synthetic transcripts is approved. New unit T-021.
**Why:** T-005b and T-013 each stalled after 3 fix cycles, because rule-only precision kept opening new holes. The North star is "AI assists, the human decides", so uncertain facts go to the counsellor instead of being auto-trusted or dropped. The lead's B6 concern is extended from config-time to runtime.
**Result:** --
**Links:** T-005c, T-013, T-021, T-022, T-010, T-012, D-019, qa/gates/crisis-guard-precision.md, qa/gates/citation-guarantee-scope.md, qa/gates/scribe-concern-level.md, qa/gates/provider-fallback.md

## D-021 | 2026-09-26 | type: decision | status: ACTIVE
**What:** Umesh answered the last three gates and the lead-review scope in chat on 2026-09-26. The answers are recorded verbatim in qa/gates/counsellor-auth.md, edit-provenance.md and erasure-fencing.md, and the checker folded them into the contract as B21, B22, B17, B2 and B15.
- **API-first headless engine (B21, gate counsellor-auth):** VC is an intelligence service, and Pathlynks is its first client, not its host.
  - Every capability is reachable through a versioned HTTP API (apps/api) with an OpenAPI document.
  - Auth is a JWT issued by the client backend. VC checks signature, expiry and issuer, and reads the tenant, counsellorId and role claims. VC has no login screen.
  - The verified tenantId is stamped on every document and filters every query.
  - Knowledge comes from the KnowledgeBase over `POST /ask`, with its citations carried through. A KB outage shows "knowledge unavailable" and never produces an uncited answer.
  - Approved facts, erasure requests and concern flags go out as signed webhooks.
  - The production UI is the client's; apps/web stays VC's reference and test UI.
  - Tests use a locally signed JWT and a fake KB. Nothing connects to real Pathlynks until an integration unit is approved.
- **North-star metric (B22):** a novice working with VC reaches at least 90 % of the expert benchmark (Sapna ma'am) on the same anonymised case. Until her reference rubric is recorded, it is reported as NOT-YET-MEASURABLE and blocks nothing; after that, it is a release gate.
- **Persona ladder (B17):** 10 declared personas, including gaurav-bhaiya (Hindi and voice only, no typing) and the UK/US/AU/CA policy-compliance personas.
- **Edit provenance (B2):** `counsellor-edit` plus `editedFrom`, held by both VC and the client.
- **Erasure (B15):** double confirm, then an email-outbox approver, then the purge. `autoDelete` defaults to false. Fence plus 24 h, and an HMAC audit pseudonym.
- **Non-goal:** bulk student import (it belongs to the counsellor portal).
- **Human-only:** the release video goes to Sapna ma'am and Gaurav bhaiya with a Hindi voice-over. Umesh sends it (outward-facing).
**Why:** this is a direction change that Umesh approved. The Pathlynks backend team integrates over the API, and "UI vo log khud bnaa lenge", so VC must not build auth or a production UI of its own. The CEO north star ("AI assists, the human decides") is made measurable as novice+VC â‰ˆ expert.
**Changes-authorized:** ARCHITECTURE.md Â§3 (hypothesis rows: H-API-first headless engine, JWT/tenant) and Â§6 (open questions: the JWT issuer/key-rotation details from the Pathlynks backend team; the KB `/ask` contract version), at the next /landplane.
**Result:** --
**Links:** T-025, T-026, T-027, T-028, qa/gates/counsellor-auth.md, qa/gates/edit-provenance.md, qa/gates/erasure-fencing.md, qa/contracts/counselling-engine.md (B2, B15, B17, B21, B22), D-020

## D-022 | 2026-09-26 | type: decision | status: ACTIVE
**What:** T-028 adds the B17 persona ladder and the B19 scenario matrix to the maker-checker adapter.
- `qa/adapter.json` gains a `personas` array with the 10 ids approved in D-021 (sapna-expert, gaurav-pm, gaurav-bhaiya, jaipur-counsellor, school-counsellor, govt-teacher, uk-counsellor, us-counselor, au-agent, ca-consultant), and a `scenarios` pointer.
- A new `qa/scenarios/counselling-engine.csv` holds at least 50 rows (id,persona,type,preconditions,steps,expected), with happy and negative paths per flow.
- Nothing else in the adapter changes: verify commands, data_class and isolation stay as they are.
**Why:** B17 and B19 require checker Mode C/D persona walks and scenario runs, and those read the personas and scenarios from the adapter. The QUEUE sweep flagged this groundwork as not started (top-3 #3). The persona set itself was approved by Umesh on 2026-09-26 (D-021).
**Changes-authorized:** qa/adapter.json (add `personas` + `scenarios` keys only) Â· qa/scenarios/counselling-engine.csv (new)
**Result:** --
**Links:** T-028, D-021, qa/contracts/counselling-engine.md (B17, B19)

## D-023 | 2026-09-26 | type: decision | status: ACTIVE
**What:** T-013 (citation rescope) gets ONE fix cycle beyond the max-3 bound: cycle 3, scoped strictly to ISS-t-013r-rev-9 (a retraction or attribution in another clause of the cited turn), ISS-t-013r-rev-10 (zero-width characters) and any finding from the cycle-2 checker and data-engineer review. The auto-verify template list is NOT widened: ISS-t-013r-rev-11 stays parked as a product question.
**Why:** cycle 2 cut fabricated auto-verified facts from 14 to 0, and the remaining Block is small and structural (auto-verify only single-clause turns; strip invisible format characters). Four units (T-025, T-029, T-012, T-022) wait on T-013, so re-planning costs more than one bounded cycle. B3 per-fact approval bounds the risk meanwhile. On the templates, Umesh answered "no idea regarding this", so the fail-safe default (review, not auto-verify) stands.
**Changes-authorized:** none (process exception for one unit; no ARCHITECTURE or contract change).
**Approved-by:** Umesh (chat, 2026-09-26, AskUserQuestion "Allow cycle 3")
**Result:** --
**Links:** T-013, qa/gates/t013-extra-cycle.md, ISS-t-013r-rev-9, ISS-t-013r-rev-10, ISS-t-013r-rev-11

## D-024 | 2026-09-26 | type: decision | status: ACTIVE
**What:** T-013 (citation rescope) merges to main at checker cycle-3 PASS (6736ee2) even though the AI-engineer review Blocks it on ISS-t-013r-rev-14. That issue is an open 0 to 4 word gap in COUNTRY_TEMPLATES[0] (nodes.ts:464): "I want to study as agent advised in Australia" still auto-verifies. rev-14 stays open. T-030 fixes it and merges as soon as its own checker passes. This is a one-off human override of the rule that "a review Block overrides a checker PASS", scoped to this one issue on this one unit.
**Why:** the cycle-3 checker PASSed with 34 hostile variants and no new finding, and the data-engineer review Approved. The Block covers one narrow template gap, and the counsellor still approves every fact (B3), so an auto-verified country is never final. The downstream units (T-025, T-022, T-029, T-012) are built on T-013, so a held merge would stall them. T-030 already carries the fix in parallel.
**Changes-authorized:** none (process exception for one unit; no ARCHITECTURE or contract change).
**Approved-by:** Umesh (chat, 2026-09-26, AskUserQuestion "Merge now, T-030 follows")
**Result:** --
**Links:** T-013, T-030, ISS-t-013r-rev-14, D-023

## D-025 | 2026-09-26 | type: decision | status: ACTIVE
**What:** T-030 is widened beyond ISS-t-013r-rev-14 (the COUNTRY_TEMPLATES[0] word gap) to three structural, fail-safe checks on auto-verify (`needsReview:false`): (1) the cited turn's speaker must be the student, so a counsellor turn always needs review; (2) each template declares the fact keys it may verify, and any other key needs review (no more `nationality: UK` from "I want to study in the UK"); (3) the template must match the original text, not only the machine translation. Acceptance adds a property test: single and two-token edits of the finite template language must flip to needsReview unless they are still in the language, random off-grammar sentences need review, and flipping one input at a time (speaker, key, translation-only) flips the result.
**Why:** the T-013 stall diagnosis (qa/debug/t-013-citation-rescope-cycle3.md) found that at the merged code (7b14a55), 8 probes on 4 dimensions T-030 did not touch still return needsReview:false. The root cause is that B2 names a mechanism and not the property ("the student affirmed this value, for this key, in their own words"). Every added check only moves facts toward review, which matches the fail-safe default Umesh set in D-023, so no new product decision is needed for it. Cross-turn context (a hypothetical framed in an earlier turn, a retraction in a later one) stays OUT of T-030 and goes to Umesh as the gate qa/gates/auto-verify-property.md.
**Changes-authorized:** none (unit scope change; no ARCHITECTURE or contract change).
**Result:** --
**Links:** T-030, T-013, D-023, D-024, ISS-t-013r-rev-14, ISS-t-013r-rev-15, qa/debug/t-013-citation-rescope-cycle3.md

## D-026 | 2026-09-26 | type: decision | status: ACTIVE
**What:** "Auto-verified" (`needsReview:false`) now has a written property: the student said this value, for this fact type (key), in their own words, in this one turn. Context from other turns (a hypothetical framed earlier, a retraction later) is out of scope for auto-verify. An auto-verify leak is capped at high severity and Blocks only when it breaks this property. B3 still requires the counsellor's approve click on every fact.
**Why:** the T-013 stall diagnosis (qa/debug/t-013-citation-rescope-cycle3.md) showed that each fix cycle found a new leak class because B2 named a mechanism, not a property. Umesh chose option A of gate auto-verify-property.
**Changes-authorized:** qa/contracts/counselling-engine.md B2 wording, via /checker only (the maker never edits contracts).
**Approved-by:** Umesh (chat, 2026-09-26, AskUserQuestion "Write the rule down (Recommended)")
**Result:** --
**Links:** T-030, T-013, D-024, D-025, qa/gates/auto-verify-property.md, ISS-069, ISS-070, ISS-071, ISS-072

## D-027 | 2026-09-27 | type: decision | status: ACTIVE
**What:** Umesh answered the gate crisis-escalation-consent with option (a), escalate always. A session with no recorded consent that contains a crisis turn (self-harm or abuse disclosure) now produces an escalation anyway.
- The crisis flag notifies the tenant admin and the concerned counsellors even when no consent is on record.
- The escalation record carries identifiers and the flag only. It never carries transcript text.
- Nothing else is processed without consent: no facts, no profile diff, no KB call, no summary.
- B4 consent-first stays the rule for every other path. This is a named exception for a life-safety signal, not a weakening of B4.
- T-035 implements it directly rather than behind a config flag, and closes ISS-t-012-rev-3.
**Why:** DPDP Act 2023 s.7 lists responding to a medical emergency involving a threat to the life of the Data Principal as a legitimate use that needs no consent. The student is a minor, so a missed crisis is the worse harm, and option (b) left no record and no notification at all. Option (c) was rejected because without a stored record the escalation SLA cannot be measured and there is no audit trail of who was told what, which is the accountability the counsellor and the tenant admin need.
**Result:** --
**Links:** T-035, T-012, ISS-t-012-rev-3, ISS-t-012-rev-1, qa/gates/crisis-escalation-consent.md, qa/contracts/counselling-engine.md (B4, B9, B16), D-020

## D-028 | 2026-09-27 | type: decision | status: ACTIVE

**What:** Any fixture used as an ORACLE -- a test whose job is to judge whether the engine's own
judgement is correct -- must be authored blind: by an agent structurally forbidden to open the
implementation, the existing tests, or an earlier fixture, from the contract text alone. Blindness
is verified mechanically (byte-containment of every row against the source and the prior fixtures)
before the fixture is trusted, and the check is part of the unit's evidence, not a claim in its
manifest. Rows the contract does not settle are QUARANTINED into a sibling `*-unsettled.jsonl` with
`unsettled: true` and an `open_question`, reported but not asserted, and each one is also appended
verbatim to `qa/feedback-inbox.md`. A large honest quarantine is a good outcome: it is the contract
gap made visible. This does NOT apply to ordinary unit tests that assert a specified behaviour --
only to fixtures that grade the engine's discretion.

**Why:** T-036 was raised because T-030's "independent oracle" was nothing of the kind, and the
first attempt to fix it FAILED its own check for exactly the same reason: the author had read
`nodes.ts` first, and 23 of 102 rows came back byte-identical to its doc comments. Asking an author
to be more careful does not work; the author cannot unsee the implementation. Only structural
blindness does. The cycle-1 rebuild under this rule measured 0 of 102 rows contained in the source,
and immediately paid for itself: on first contact the blind rows agreed with the engine on only 73
of 102, every disagreement in the stricter direction, and 21 of the 29 hinged on a closed template
grammar that appears nowhere in B2 or D-026 -- a large, entirely undocumented gap between what the
contract promises and what the engine does, which the self-graded 62/62 and 102/102 fixtures had
scored as perfect. The same defect class is open against T-010's cards eval (ISS-t-010-c0-7), where
a checker authoring rows from the contract before reading `verifier.ts` found 2 B1 escapes and 1 B18
escape behind a 62/62 score.

**Result:** T-036 merged at `d80c2a5` with checker Mode A cycle 1 PASS (`f4f0a7c`), after a cycle-0
FAIL (`715e836`) under the old approach. Main verify green: `pnpm -r typecheck` 0 errors across 9
projects, 1158 tests pass, 0 skipped. ISS-t-030-rev-1 and ISS-t-036-1 closed. The rule is now
applied prospectively: T-039's stage-1 brief forbids the fixture author from opening the scribe, the
cards module, any existing test and any existing fixture, and stage 2 wires it separately.

**Changes-authorized:** none. This entry authorizes no edit to ARCHITECTURE.md or contracts/; it
records a build-practice decision. The contract-side questions this practice surfaced (Q1-Q8 in
`qa/feedback-inbox.md`, plus ISS-t-036-3 on B2's sufficiency-sounding sentence) are the checker's to
fold in, not the maker's.

**Links:** T-030, T-036, T-039, T-010 Â· ISS-t-030-rev-1, ISS-t-036-1, ISS-t-036-2, ISS-t-036-3,
ISS-t-010-c0-7, ISS-081 Â· contract B2, B18 Â· D-026 Â· gate `qa/gates/auto-verify-surface.md`

## D-029 | 2026-09-30 | type: session | status: ACTIVE
**What:** Resume the full Explore -> Conclude -> Execute goal from the user's direct goal-objective.md instruction, preserved verbatim in qa/feedback-inbox.md. Completion includes live counselling, consistent personalization, safety integration, real client integration, expert-quality measurement, application drafting, student voice/avatar, and verified QA/document reconciliation. A passing foundation or infrastructure unit does not complete this goal.
Reconcile the six direct Umesh answers recorded by the checker in qa/QUEUE.md (2026-09-27, commit f7f5260), rather than asking the same scope decisions again:
- B18 pilot split: build the scribe already-approved/do-not-ask half; destination relevance remains a documented pilot gap. The full active goal still requires consistent personalization, and the B18 proof clause is not satisfied by a gap test.
- B2 auto-verification: necessary rules plus the explicit closed grammar; the checker has already incorporated the grammar in B2. This records the existing decision and authorizes no grammar widening.
- T-010 recovery: retain the three-cycle stall history; integrate passing scope only with an honest criterion mapping and track separate B1/B18 recovery units. No instruction leak or repeated-question leak is represented as a PASS.
- T-038 application drafting is IN the first pilot. Detailed form, field, review-artifact and client-submission specification remains necessary; VC never submits. The application-target question was raised this turn.
- A counsellor-present pilot may proceed while crisis recognition is improved; B9/B16's 0.95 recall requirement stays unchanged. This is not permission for an unattended student release.
- apps/web remains an internal localhost-only reference demo. A pilot counsellor using it or network exposure reopens the authentication blocker; real Pathlynks integration must use verified client identity.
The first independent product plan is T-035 safety-data lifecycle, followed by actual escalation wiring. Privacy registration must include erasure/export, tenant isolation and writer fencing; a scanner exemption is not a substitute. Its concrete multi-file edit plan is pending under the user's edit-in-place rule. Historical T-044 has a pending checker close-out and must preserve main's later ledger history on integration.
**Why:** The earlier summary reported scope questions as unanswered even though direct human answers were already recorded. Gate files and task rows drifted from those answers, and T-044's matching PASS was untracked. Carrying forward authoritative human evidence prevents re-asking and preserves the original end state without claiming unfinished capabilities are complete.
**Result:** Read the complete user objective, current QA/contracts/tasks/decisions and branch state; preserved the objective verbatim in the existing feedback inbox; dispatched independent recovery, issue-ledger and safety-plan audits. T-044 independent verification is in progress. No product-code edits, production connections, deployment, external delivery or contract relaxation occurred in this recovery step.
**Changes-authorized:** Existing qa/gates answer records and TASKS.md may be reconciled to the six recorded decisions, with explicit provenance and no fabricated current approval. ARCHITECTURE.md sections 3, 4 and 6 may be reconciled to already approved D-019/D-020/D-021/D-027 and observed directory structure during landplane. No enforcement path or contracts/ change is authorized; checker-owned QA criteria remain unchanged.
**Links:** qa/feedback-inbox.md; qa/QUEUE.md; qa/gates/auto-verify-surface.md; qa/gates/b18-unimplemented.md; qa/gates/t-010-b1-b18-unsatisfiable.md; qa/gates/p2-application-drafting-scope.md; TASKS.md T-010, T-035, T-038, T-044; D-019, D-020, D-021, D-027, D-028; attachments/9681bd8f-2038-44f7-8045-5f36a3045f1a/goal-objective.md

## D-030 | 2026-09-30 | type: decision | status: ACTIVE
**What:** Routine reversible multi-file work within the full authorized counselling goal uses independent quality-agent plan approval and maker/checker implementation verification instead of manual human plan approval.
**Why:** Umesh explicitly requested that the quality agent aligned to the goal approve routine plans, then supplied replacement AGENTS.md instructions confirming that policy. Repeated manual approval blocking was preventing the full Explore -> Conclude -> Execute goal from advancing.
**Result:** The user-level rule was updated in place at C:/Users/Lenovo/.codex/AGENTS.md:59 with all other text unchanged. A fresh independent t035_plan_gate reviewed the contract, full goal, existing source and helper semantics, then recorded APPROVE for the combined nine-existing-file safety-data lifecycle repair in docs/plan.md:366-380. T035 maker implementation is dispatched; plan approval is not product PASS or full-goal completion. Production/promotion, publishing/sending, destructive actions, unresolved product decisions and explicit HUMAN_GATE/Approved-by requirements remain human-gated. No contract threshold or full goal scope is reduced.
**Links:** T-035; docs/plan.md; qa/feedback-inbox.md; direct Umesh rule-change request and replacement AGENTS.md in this chat.
**Approved-by:** Umesh (direct rule-change instruction, 2026-09-30).

## D-031 | 2026-09-30 | type: session | status: ACTIVE
**What:** Freeze the independently plan-approved T-035 safety-data lifecycle candidate and dispatch a fresh completion checker under D-030.
**Why:** The measured baseline omitted safety records from access export and returned completed erasure while tenant-A notifications/reviews survived. Routine reversible lifecycle repair is authorized through independent goal-aligned plan approval; it must still receive an independently produced outcome verdict.
**Result:** Candidate 5a543e31 changes nine existing product/test files in place and carries qa/manifests/t-035-safety-lifecycle.md at ready-for-check cycle 0. Maker measured DB108/108, crisis28/28 before final two appends plus each appended test1/1, repository typecheck9/9 and contract-validator exit0 by vacuity. Fresh t035_checker_final is dispatched and running offline checks; no completion PASS, deployment, delivery or no-consent end-to-end compliance is claimed. T-035 stays in_progress; full Explore -> Conclude -> Execute goal remains active. Consented rationale remains untrusted personal data included in export and erasure under the explicit independent clarification. API/recipient/delivery and identifiers-only no-consent crisis integration remain mandatory follow-ups. B18 next-unit analysis is read-only while this candidate is verified.
**Links:** docs/plan.md independent T-035 approval and rationale clarification; qa/manifests/t-035-safety-lifecycle.md; TASKS.md T-035; D-030; candidate 5a543e31af278825a9fb68244f7c9049560dca7b.

## D-032 | 2026-10-01 | type: decision | status: ACTIVE
**What:** Authorize a routine independently quality-reviewed authenticated session lifecycle prerequisite for actual counselling feedback, using existing source files and collections.
**Why:** Transcript discovery rows do not establish live authority; generation alone cannot prevent erased old opening requests from recreating sessions. Consent IDs are not immutable grant incarnations and released erasure fences cannot act as durable replay authority. Fresh session_lifecycle_quality_plan requires two-step prepare/open, erased capabilities, captured grant incarnation and exact ownership compensation.
**Result:** Record the reviewed contract before implementation: authenticated prepare issues nonactivating opaque authority in kind-discriminated existing decisions rows; open requires the present exact capability and never reconstructs it; close never upserts. Bind verified actor/tenant/student/session plus server generation and captured internal consent incarnation, original deadline and current authority. Every late write/cleanup uses exact creation attempt and generation; graph session compensation must preserve recreated winners. Actual export projections hide capabilities and internal grant/generation/ownership material. Erasure purges capabilities and consent incarnation. External supplied internal authority fields must be rejected; production consent reconstruction integrity remains unproved until the actual writer is verified. Fresh complete plan approval and independent maker/checker evidence remain required; no runtime feedback expiry policy assumed, no full goal completion, production writes, deployment or new source files authorized.
**Links:** T-050; docs/plan.md lifecycle quality/replay reviews; D-030; packages/db/src/consent.ts; packages/db/src/erasure.ts.
**Changes-authorized:** Existing packages/db/src/collections.ts SessionDoc/ConsentDoc/DecisionDoc; packages/db/src/facts.ts ScribeSessionRowInput/ensureScribeSessionRow; packages/engine/src/scribe/graph.ts CreatedByCall/invokeFenceAware/startScribe; apps/api/src/server.ts existing context/session guard/routes/handler; packages/db/src/erasure.ts StudentExport/exportStudent; existing apps/api/src/openapi.ts and existing API/DB/engine test files. Checker-owned qa/contracts/counselling-engine.md may record independent lifecycle acceptance under this entry. No root ARCHITECTURE.md, canonical contracts/, enforcement paths, new helper functions or source files authorized.

## D-033 | 2026-10-01 | type: decision | status: ACTIVE
**What:** Extend D-032 lifecycle authorization to the existing external consent validator and its existing tests.
**Why:** Fresh session_lifecycle_quality_plan explicitly APPROVE requires rejecting supplied internal lifecycle authority before schema parsing. ConsentSchema currently strips unknown fields, so silent removal is not an explicit authority rejection. D-032 named stored types but omitted the validator function.
**Result:** Authorize in-place validateConsentForWrite to reject own-property internal lifecycle authority including lifecycleIncarnation even when undefined, with fixed raw-free errors; retain valid external consent behavior. Internal initialization remains server-only CAS in existing ensureScribeSessionRow. Full D-032 stale-open/capability erasure/late ownership/consent generation/deadline/export criteria remain mandatory. Production consent writer use remains unverified and no full-goal completion is implied.
**Links:** D-032; docs/plan.md; fresh session_lifecycle_quality_plan explicit final APPROVE; packages/db/src/collections.ts:225.
**Changes-authorized:** Existing packages/db/src/collections.ts validateConsentForWrite and packages/db/tests/consent.test.ts. No new source file/helper, schema contract relaxation, ARCHITECTURE or enforcement edits.

## D-034 | 2026-10-01 | type: decision | status: ACTIVE
**What:** Replace unsafe lifecycle lazy consent-incarnation initialization with read-only authority from an already persisted server-issued grant.
**Why:** Maker identified a concrete delayed first CAS that can initialize a replacement consent after erasure/regrant using identical IDs/public fields. The operation can then falsely adopt authority it created on the wrong grant. Fresh session_lifecycle_quality_plan explicitly approved the corrected prerequisite with all original replay and ownership outcomes retained.
**Result:** Prepare/open/close require an already persisted valid server-issued incarnation and never initialize, repair or refresh it. Capture it once per invocation; missing/malformed/legacy authority refuses. Held old prepare across replacement refuses; a new authorized invocation may use the new grant. Existing decisions capability prepare is nonactivating; open requires present exact capability, close never upserts. Preserve original deadline/current consent/fence/final capability/readback, exact generation/creation-attempt driver-settled cleanup, concurrent winner preservation, actual capability purge and projected exports. Properly issued test grants prove prerequisite mechanics only. Actual Pathlynks grant writer/immutable-incarnation creation contract remains mandatory full-goal integration, already pending; no guardian attestation or feedback-expiry policy invented.
**Links:** D-032; D-033; B23; docs/plan.md; fresh session_lifecycle_quality_plan revised APPROVE; maker observed delayed initialization race.
**Supersedes:** D-032 -- Replace only lazy-init interpretation after demonstrated delayed CAS grant-replacement race; retain authenticated lifecycle, full replay outcomes, ownership, export and integration scope.
**Changes-authorized:** Same existing lifecycle types/helper/API/scribe/export/OpenAPI/test targets in D-032 and external validator rejection in D-033. Checker-owned existing B23 may replace initialization acceptance with persisted-server-grant refusal and document real writer gap. No validator metadata issuance, consent creation route, guardian attestation, lazy initialization, new helper/source files, ARCHITECTURE/canonical contracts/enforcement changes.

## D-035 | 2026-10-01 | type: decision | status: ACTIVE
**What:** Authorize the independently refined checkpoint ownership adapter needed by T052 lifecycle erasure/recreated-winner guarantees.
**Why:** Fresh source preflight found graph cleanup deletes whole threads and relies on current fence after late settlement. Installed MongoDBSaver mutates logical keys with unconditional sets and its logical indexes are nonunique, so owner-filter upsert alone can duplicate records rather than refuse stale writes. Injected MemorySaver also needs equivalent protection at the actual mutation.
**Result:** Fresh lifecycle_source_preflight explicitly APPROVE requires graph-bound private ALS attempt/original grant/session/deadline, isolated saver adapter used by graph and compensation. Mongo existing row captures actual _id/expected owner before awaits, uses owner CAS upsert:false and zero-match refusal; absent row uses deterministic internal _id from complete logical key with unique identity conflict refusal. Legacy random-_id rows readable through existing-row CAS. Checkpoint and ordinary/special pending writes capture each operation and original driver promise including partial failures. Memory preserves exact tuples/write-index semantics and checks captured tuple reference plus private owner after awaits immediately before synchronous mutation. Cleanup exact original attempt/keys only; stable public thread/namespace/parent/resume/setup preserved. Current issued-grant/session invalidation governs settlement; existing legacy consent behavior retains bounded protections with durable replay gap explicitly unproved. All independent Mongo/Memory held operations, erasure/regrant, recreated same-key winner and successful resume oracles remain mandatory; plan approval is not PASS.
**Links:** T-052; B23; D-034; docs/plan.md; fresh lifecycle_source_preflight refined explicit plan APPROVE; installed MongoDBSaver checkpoint.cjs55-67/199/231/245.
**Changes-authorized:** Existing packages/engine/src/scribe/checkpointer.ts createScribeCheckpointer/initScribeCheckpointer; existing graph.ts compileScribeGraph/private bindings/runnableConfig/invokeFenceAware/start/resume; existing facts.ts ensureScribeSessionRow; existing engine/DB test files. No new helper/source files, shared saver mutation, broad compensating deleteThread, public namespace change, ARCHITECTURE/canonical contracts/enforcement edit or production/provider/deployment authority.

## D-036 | 2026-10-01 | type: decision | status: ACTIVE
**What:** Authorize tenant-aware unique logical checkpoint indexes and faithful offline index acceptance for T052.
**Why:** Actual held Mongo controls exposed duplicate logical rows when a random-ID saver winner races the adapter's captured absence. D035 deterministic identity protects cooperating writers but its upstream nonunique indexes do not constrain independently inserting raw savers. Independent quality review recommends enforcing uniqueness at startup rather than weakening winner oracles or deleting legacy records.
**Result:** Add separately named unique indexes over tenantId/thread_id/checkpoint_ns/checkpoint_id and tenantId/thread_id/checkpoint_ns/checkpoint_id/task_id/idx. Retain upstream nonunique indexes and setup. Await unique builds before serving; existing duplicates or index errors refuse startup without repair, deletion, dropping or backfill. Preserve cross-tenant coexistence, legacy random-ID reads/resume, exact-owned CAS/cleanup and positive checkpoint/pending writes. Offline fake index creation must reject seeded duplicate builds without modifying records and enforce later writes. Require independent duplicate startup refusal, no factory/serve on setup failure, cross-tenant, raw-versus-adapter race, ordinary/special pending and successful resume controls. Fake evidence does not establish live Mongo behavior; production migration/release remains separately human-approved.
**Links:** T-052; B23; D-035; docs/plan.md; lifecycle_capture_review checkpoint uniqueness engineering plan.
**Changes-authorized:** Existing packages/engine/src/scribe/checkpointer.ts initScribeCheckpointer/createScribeCheckpointer; packages/db/scripts/db-init.ts INDEX_PLAN; packages/db/tests/fakes.ts createIndex/declareUniqueIndex; existing packages/engine/tests/scribe-checkpointer.test.ts, scribe-fixtures.ts, scribe-persistence.test.ts and existing DB index tests. Existing graph ownership targets remain under D035. No new helper/source files, upstream index removal, record deletion/backfill, public namespace change, ARCHITECTURE/canonical contracts/enforcement edit, production index commands, provider calls or deployment.

## D-037 | 2026-10-01 | type: decision | status: ACTIVE
**What:** Extend D036 offline unique-index fidelity to the existing fake key comparator.
**Why:** Independent D036 source review found assertNoUniqueConflict distinguishes missing and explicit null keys, whereas Mongo non-sparse unique indexes encode both as null. This permits false passing legacy-collision startup evidence.
**Result:** Normalize only nullish indexed key values in the existing comparator; preserve distinct strings/numbers and partial-filter behavior. Add existing-test seeded missing-versus-null index-build refusal with unchanged records and later-insert rejection, and assert unique:true for exact startup/planned indexes. Independent regression and mutation proof remain mandatory; offline fake behavior is not live Mongo evidence.
**Links:** D-036; T-052; lifecycle_capture_review source review; https://www.mongodb.com/docs/manual/tutorial/unique-indexes-schema-validation/
**Changes-authorized:** Existing packages/db/tests/fakes.ts assertNoUniqueConflict in place, alongside D036 declareUniqueIndex/createIndex; existing packages/engine/tests/scribe-checkpointer.test.ts and existing DB index tests. No new helper/source files, production commands, deletion/backfill, canonical contract/ARCHITECTURE/enforcement changes.
