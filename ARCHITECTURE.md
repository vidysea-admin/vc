# ARCHITECTURE — current ground truth (as of: 2026-09-30, last reconciliation: D-029)

<!-- Lab Protocol STATE file. Only sections named in an authorizing DECISIONS entry's
     Changes-authorized field may change, and only during /landplane.
     The session-start hook injects sections 1-3 + 6. -->

## 1. System in one paragraph
**Vidysea AI Counselling Engine.** North star (CEO): **Explore → Conclude → Execute; AI assists, the human decides.**
One engine turns every counselling conversation (any language, processed in English) into a structured, cited,
longitudinal **Student Knowledge Graph**, and uses it to help the counsellor explore and challenge the student's
thinking and reach a decision. It then pre-fills the application as a draft for the student to submit.

The engine serves three surfaces in gated phases:
- **P1 Counsellor Copilot.** The post-session scribe comes first: transcript → facts → summary → profile diff, which the
  counsellor approves. Live cards come after (Widen / Challenge / Compare / Evidence, at most 3 on screen, each cited
  and verified).
- **P2 Draft-only Application Filler.** The student logs in and the student submits.
- **P3 Student voice/avatar counsellor.**

It is **never a script ("cheating platform")**: cards carry questions, comparisons and evidence, not sentences for the
counsellor to read out. Source material: `goal.md` and the compass research report in the repo root, plus the Google Doc
"Virtual Counsellor" (id 11PEkFEyI9L67Y1tkTClxUNrDZBIpstVExlAgZqfADh4).

## 2. FROZEN CONTRACTS (machine-checked — do not edit here)
None yet. This is the research phase; `contracts/contracts.json` is empty.

## 3. WORKING HYPOTHESES (current best understanding; may change via /landplane)
- **H1 (D-002), workflow graph:** LangGraph.js 1.x (TypeScript) `StateGraph` with a Mongo checkpointer. The graph is
  thin and only does wiring; the logic lives in functions, skills and tools. Counsellor approval is
  `interrupt(response_schema)`.
- **H2 (D-002), agents:** typed LLM nodes inside the graph, not a free multi-agent swarm. P1 nodes are SignalExtractor,
  ExplorationPlanner, FitScorer (numbers come from the KB, not the LLM), Verifier (Flash-Lite) and ProfileSynthesizer.
  Zod schemas sit between all nodes. Voice runs as a fast front agent with an async graph behind it.
- **H3 (D-003), knowledge graph:** Mongo-native Student Knowledge Graph.
  - Collections: students, facts, sessions, decisions, universities, courses, consents, plus an `edges` collection.
  - Each fact records source, quote, confidence, validFrom/To, purposeTags and sensitivity. University/course records
    carry sourceUrl and fetchedAt.
  - No Neo4j or GraphRAG in V1. Vector search runs over summaries and courses.
- **H4 (D-004), observability:** Langfuse self-hosted with TELEMETRY_ENABLED=false, the OSS edition and no licence key,
  wired through `@langfuse/langchain` callbacks. Card metrics and cost are recorded in Mongo.
- **H5 (D-005), portable core:**
  - Prompts and soft rules are `skills/<name>/SKILL.md` files, loaded on demand.
  - Hard rules are deterministic code guards that run before any LLM call: no-script, citation-required,
    crisis/distress, consent/purpose.
  - Tools are MCP servers: student-profile, university-kb, session-store, and portal-filler in P2.
  - Model choice goes through config (a provider seam).
- **H6 (D-001), reuse, not rebuild:** proven pieces are ported in place from the sibling repos. They are read, never
  written.
  - `D:/vidysea/ikigai-counsellor`: LangGraph template, prompts/rules, crisis-guard, student-memory, grader.
  - `D:/ikigai_counsellor`: Gemini Live proxy.
  - `D:/KnowledgeBase`: provider seam, Gemini diarised STT, tenantScope, citation model, recall@k eval.
  - `D:/counsellor_validation_judge`: contradiction detection, mirror-student evidence.
  - `D:/sop_mvp`: ContextObject profile, ApplicationConstraints.
  - `D:/VirtualCounsellor_Avatar`: P3 avatar.

- **H7 (D-019, D-020), provider runtime:** Gemini and the LiteLLM gateway sit behind the provider interface. A configured three-model runtime failover shares ten total attempts; all-fail returns an alert and input-preserving Retry. Rules mode is explicit, never an automatic runtime fallback.
- **H8 (D-021), API-first service:** VC is a headless intelligence service; Pathlynks is the first client. Versioned HTTP APIs verify client-issued JWTs and stamp the verified tenant on reads/writes. KnowledgeBase is consumed over cited POST /ask; signed events leave through a durable outbox. apps/web is an internal localhost-only reference/test UI, not the production client.
- **H9 (D-020, D-027), crisis and concern:** concern flags preserve the conversation; crisis escalation must carry identifiers plus a flag even without consent, with no other processing without consent. Core escalation exists, but T-035 lifecycle/fencing and real delivery wiring remain incomplete. A record_only notification is not delivered notification evidence.
- **H10 (D-029), recovery status:** T-010 remains unmerged after its three-cycle stall; the recorded human split requires separate B1/B18 recovery units and honest criterion mapping. Application drafting is in first-pilot scope and remains unimplemented/spec-pending. The full goal includes personalization and voice/avatar beyond documented pilot gaps.
## 4. Directory map & file responsibilities
| Path | Owns | Must NOT contain |
|---|---|---|
| `goal.md` | CEO/team/AI-tool doc brief (source input) | code |
| `compass_artifact_…md` | Research + build plan (source input) | edits; it is a frozen reference |
| `docs/` | Plan doc (unit 1), ADR-style notes; `DECISIONS.md` (append-only) | code |
| `contracts/` | Frozen machine-checked contracts (empty) | hypotheses |
| `qa/` | Active maker-checker contracts, issue ledger, manifests, verdicts and gates | product code |
| `apps/api` · `apps/web` · `packages/*` · `skills/` · `mcp/` | Implemented TS pnpm monorepo: API, reference UI, engine/db/providers/schemas/observability, skills and student-profile/university-kb tools; completion is tracked in TASKS/QA | Production client UI or claims that unmerged live-card/application/voice behavior is complete |

## 5. Cross-cutting rules
- **Mongo (D-008, D-009):** the engine uses only the database `virtual_counsellor` on the production server in `.env`, with full CRUD inside it (documents, bulk ops, its own collections and indexes). Every other database there is off-limits for both reading and writing. One DB helper names it and refuses any other name (B12). Tests run offline. Only `dropDatabase` on `virtual_counsellor` needs a gate.
- **Student data never goes to an external service** without per-use approval. That includes tracing, so Langfuse stays
  self-hosted.
- **Every fact shown or stored carries a source.** Uncited facts are dropped or labelled "unverified".
- **Nothing enters the student model without counsellor approval (P1).** The application filler never submits (P2).
- **DPDP:** all Pathlynks users are minors, so consent and purpose tags are in the data model from day one.

## 6. OPEN QUESTIONS (deliberately undecided — resolve only through /checkpoint verdicts)
- **Q1 (D-021 resolved direction):** Consume the existing KnowledgeBase over POST /ask. Remaining integration details: deployed contract version, tenant binding and the approved live client connection. No other production Mongo database is accessed.
- **Q2:** Is live audio Gemini Live transcription or file-based diarised STT (the KB pipeline)? For live cards the
  compass recommends transcription-only streaming plus separate text reasoning calls.
- **Q3:** DPDP legal review: does psychometric profiling of minors fall under the tracking restriction?
- **Q4:** Does Langfuse self-hosting (4 backing services) run locally for dev only at first, or on shared infra?

- **Q5:** Pathlynks JWT issuer/key rotation, authenticated client UI and tenant-specific escalation recipient/delivery sources require integration evidence.
- **Q6:** Sapna ma'am's expert reference rubric is absent; B22 stays NOT-YET-MEASURABLE until supplied, then the >=90% test is required.
- **Q7:** First application destination/form, field mapping and review artifact are pending specification. Pilot inclusion is already answered by D-029; VC never submits.
