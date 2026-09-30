# Vidysea AI Counselling Engine — Plan

**Audience guide:** CEO reads §1, §2, §7. Team reads §2–6. AI coding tool reads §3, §4, §5 (plus the
Mermaid blocks and JSON I/O shapes inline).

---

## 1. Why

North star: **Explore → Conclude → Execute. AI assists, the human decides.** One AI engine turns every
counselling conversation into a structured, cited, longitudinal Student Knowledge Graph, and uses it to
help the counsellor widen and challenge the student's thinking until a decision is reached, then
pre-fills the resulting application for the student to submit. It is not a script — cards carry
questions, comparisons and evidence, never sentences for the counsellor to recite, so this is not a
cheating platform. The bar is decision quality, not just speed: research on 5,179 support agents found
an AI assistant raised issues resolved per hour by 14% on average and by 34% for novice and low-skilled
workers, while the most experienced performers saw small drops in quality when over-assisted — exactly
the profile we want, lifting less-experienced counsellors while giving seniors a "quiet mode." The
moat is not the AI model (any vendor can rent one) — it is the longitudinal student model built up over
years of sessions, plus the counsellor judgement captured and reused through the feedback loop.

---

## 2. Big picture

One engine, three surfaces, phased rollout: Counsellor Copilot (Phase 1) ships first because it is
safest and builds the student model; Application Filler (Phase 2) drafts only, the student always
submits; Student AI Counsellor (Phase 3) comes last, once the engine is proven with a human in the
loop.

```mermaid
flowchart LR
    classDef human fill:#d4edda,stroke:#28a745
    classDef ai fill:#d6e4ff,stroke:#2f54eb
    classDef data fill:#eeeeee,stroke:#888

    C[Counsellor Copilot<br/>Phase 1]:::human
    A[Application Filler<br/>Phase 2]:::human
    S[Student AI Counsellor<br/>Phase 3]:::human

    E[ONE AI ENGINE<br/>Explore → Conclude → Execute<br/>Gemini]:::ai

    P[(Student Profile<br/>MongoDB)]:::data
    K[(University Knowledge Base<br/>MongoDB + Vector Search)]:::data

    C <--> E
    A <--> E
    S <--> E
    E <--> P
    E <--> K
```

One-line message: the engine is one system; only the screen changes. Counsellor screen first (safe),
then application filling, then a student-facing screen.

---

## 3. Phase 1 step-by-step (counsellor session)

```mermaid
flowchart TD
    classDef human fill:#d4edda,stroke:#28a745
    classDef ai fill:#d6e4ff,stroke:#2f54eb
    classDef data fill:#eeeeee,stroke:#888

    S1[1. Before session: load student profile<br/>make pre-brief card<br/>MongoDB + Gemini Flash]:::ai
    S2[2. Session starts, student speaks<br/>any language<br/>Browser mic / LiveKit room]:::human
    S3[3. Speech to text + translate to English<br/>Gemini Live transcription<br/>fallback: Sarvam]:::ai
    S4[4. SignalExtractor: goals, country,<br/>budget, constraints<br/>Gemini Flash, typed JSON]:::ai
    S5[5. ExplorationPlanner: cards Widen /<br/>Challenge / Compare / Evidence<br/>Gemini Flash + Knowledge Base]:::ai
    S6[6. Verifier: every fact needs a source,<br/>else drop or label unverified<br/>Gemini Flash-Lite]:::ai
    S7[7. Counsellor sees max 3 cards<br/>uses or ignores, thumbs up/down<br/>Next.js side-panel]:::human
    S8[8. ProfileSynthesizer: post-session<br/>summary + profile diff<br/>Gemini Flash]:::ai
    S9[9. Counsellor approves changes<br/>LangGraph interrupt, Next.js]:::human
    DB[(Student Profile<br/>+ Counsellor feedback<br/>MongoDB)]:::data

    S1 --> S2 --> S3 --> S4 --> S5 --> S6 --> S7
    S7 -->|next topic| S3
    S7 -->|session ends| S8 --> S9 --> DB
    DB --> S1
    S7 -.feedback.-> DB
```

Numbered steps:
1. Before the session, the engine loads the student's existing profile and builds a pre-brief card
   (what we already know, what not to re-ask).
2. The session starts; the student speaks in any language, online (LiveKit room) or in person
   (counsellor laptop mic).
3. Speech is transcribed and translated to English; the original-language transcript is kept alongside.
4. SignalExtractor pulls facts (goals, target country, budget, constraints) into typed JSON.
5. ExplorationPlanner turns facts into cards: Widen, Challenge, Clarify, Compare, Evidence — questions
   and comparisons, never scripted sentences.
6. Verifier checks every card has a cited source; uncited cards are dropped or labelled `unverified`.
7. The counsellor sees at most 3 cards at a time in the side-panel, uses or ignores them, and gives
   one-tap feedback; this loops back to step 3 for the next topic.
8. When the session ends, ProfileSynthesizer writes a summary and a proposed profile diff.
9. The counsellor approves the diff (a LangGraph `interrupt()` gate) before anything is written to the
   Student Profile.

**Module I/O (input → output, JSON shape):**
- **Pre-brief (step 1):** `StudentProfile` (Mongo doc) → `PreBriefCard {knownFacts: Fact[], openQuestions: string[], doNotAsk: string[]}`
- **Session start / audio capture (step 2):** `{sessionId, studentId, consentId, mode: "online"|"in-person"}` → `AudioChunk {sessionId, seq, pcm16k, ts}` stream (LiveKit room or laptop mic); no processing without a recorded `consentId`
- **Transcription (step 3):** `AudioChunk` (stream) → `TranscriptTurn {text, lang, translatedText, ts, speaker}`
- **SignalExtractor (step 4):** `TranscriptTurn[]` → `Fact[] {key, value, source:{type:"transcript", quote, turnId}, confidence, validFrom, purposeTags, sensitivity}`
- **ExplorationPlanner / card generator (step 5):** `Fact[] + KBQuery` → `Card[] {type: "widen"|"challenge"|"clarify"|"compare"|"evidence", prompt, sources:[{type, id, quote}], confidence}`
- **Verifier (step 6):** `Card[]` → `Card[]` (uncited cards removed) `+ droppedCount`
- **Side-panel feedback (step 7):** `Card + CounsellorAction {vote: "up"|"down", note?}` → `FeedbackEvent {cardId, action, ts}`
- **ProfileSynthesizer / post-session summary (step 8):** `Session (facts + transcript)` → `{summary: string, profileDiff: FactChange[], citedFactIds: string[]}`
- **Counsellor approval (step 9):** `profileDiff` + `CounsellorDecision {approve: bool, edits?}` → committed `Fact[]` in MongoDB (no write before approval)

---

## 4. Phase 2 step-by-step (application filling)

```mermaid
flowchart TD
    classDef human fill:#d4edda,stroke:#28a745
    classDef ai fill:#d6e4ff,stroke:#2f54eb
    classDef data fill:#eeeeee,stroke:#888

    A1[1. Decision final: university + course]:::human
    A2[2. List required fields + documents<br/>Gemini Flash + Knowledge Base]:::ai
    A3[3. Compare with student profile<br/>find missing items<br/>MongoDB]:::ai
    A4[4. Ask student the 7-8 missing items<br/>voice or text]:::human
    A5[5. Student logs in to portal<br/>in own browser<br/>Chrome extension]:::human
    A6{6. Known portal?}
    A7[7a. Fill with fixed script<br/>Playwright / Stagehand]:::ai
    A8[7b. Fill by looking at screenshots<br/>Gemini Computer Use]:::ai
    A9[8. Re-read every field, compare<br/>save as DRAFT + screenshot report]:::ai
    A10[9. Student reviews + clicks Submit]:::human
    L[(Audit log<br/>MongoDB)]:::data

    A1 --> A2 --> A3 --> A4 --> A5 --> A6
    A6 -->|Yes: top 5-10 portals| A7 --> A9
    A6 -->|No: long tail| A8 --> A9
    A9 --> A10 --> L
```

**Stop rule:** the agent stops at login, 2FA, CAPTCHA, payment and the declaration. The student always
does these steps themselves.

Numbered steps:
1. The decision is final — university and course chosen in Phase 1.
2. The requirements builder reads the portal and course to produce a field map and document list.
3. The engine compares the required fields against the Student Profile and finds gaps.
4. The student is asked only the 7–8 missing items, by voice or text, in any language.
5. The student logs in to the portal themselves, in their own browser (Chrome extension), so
   credentials and 2FA never touch Vidysea's servers.
6. The engine checks whether this is a known top-volume portal.
7. Known portals use a deterministic Playwright/Stagehand script (7a); long-tail portals use Gemini
   Computer Use, which looks at screenshots and acts (7b).
8. Every filled field is re-read from the page and diffed against the packet; the result is saved as a
   DRAFT with a field-by-field screenshot report, never submitted.
9. The student reviews the draft and clicks Submit themselves; the action is written to the audit log.

**Module I/O (input → output, JSON shape):**
- **Decision final (step 1):** approved Phase 1 `Decision {studentId, universityId, courseId, rationale, alternativesConsidered[]}` → `{portalId, courseId}` (starts Phase 2)
- **Requirements builder (step 2):** `{portalId, courseId}` → `RequirementSpec {fields: FieldSpec[], documents: DocSpec[]}`
- **Gap check (step 3):** `RequirementSpec + StudentProfile` → `GapList {missingFields: string[]}`
- **Gap questions (step 4):** `GapList` → `AnswerSet {field, value, source:"student-direct"}[]`
- **Application Packet (assembly):** `StudentProfile + AnswerSet + documents` → `ApplicationPacket {fields: {}, documents: [], lang:"en"}`
- **Student login (step 5):** `ApplicationPacket` + student's own browser session (extension) → `PortalSession {portalId, tabId, loggedIn: bool}`; credentials and 2FA never leave the student's browser
- **Portal router (step 6):** `PortalSession {portalId}` + `KnownPortalRegistry` → `{route: "scripted"|"computer-use", scriptId?}`
- **Portal fill, scripted (7a):** `ApplicationPacket + portal script` → `FillResult {filledFields, failedFields, screenshots[]}`
- **Portal fill, Computer Use (7b):** `ApplicationPacket + screenshot loop` → `FillResult {filledFields, failedFields, screenshots[], actionsLog[]}`
- **Verification (step 8):** `FillResult + live DOM read` → `DraftReport {field, expected, actual, match: bool}[]` saved as `status:"draft"`
- **Submit (step 9):** `DraftReport + StudentAction {submit: bool}` → `AuditEvent {who:"student", ts, portalId, result}` in the Audit log

---

## 5. Tech map

| Step | Job | Technology | Why |
|---|---|---|---|
| Voice input | Student's voice | Browser mic / LiveKit | Works online and in-person; the same room later serves Phase 3 |
| Speech to text | Any language to English | Gemini Live transcription (fallback: Sarvam) | Already the chosen stack, covers 70+ languages |
| Reasoning | Extract facts, build cards | Gemini Flash (structured JSON) | Cheap and fast |
| Fact check | Drop any fact without a source | Gemini Flash-Lite | Cheapest tier, runs on every card |
| Memory | Student profile, feedback, audit | MongoDB Atlas | Already in the stack |
| University data | Courses, fees, deadlines | MongoDB Atlas Vector Search | Facts come from here, not model memory |
| UI | Counsellor side-panel | Next.js | Same stack as the Ikigai prototype |
| Backend | Orchestrator (Explore → Conclude → Execute) | **LangGraph.js 1.x** (see note below) | Typed StateGraph with a Mongo checkpointer and `interrupt()` for counsellor approval |
| Form filling | Known portals | Playwright + Stagehand | Reliable, open source (MIT/Apache) |
| Form filling | Unknown portals | Gemini Computer Use | Reads screenshots and acts when there is no script |
| Avatar (Phase 3) | Face | Simli / HeyGen LiveAvatar (rent) | Building it is expensive; Resso's quote was also expensive |
| Workflow graph | Wires the engine's nodes together | LangGraph.js 1.x, thin `StateGraph`, Mongo checkpointer | Checkpointing and `interrupt()` give counsellor-approval for free (D-002); the graph holds wiring only, logic stays in functions |
| Agents | SignalExtractor, ExplorationPlanner, FitScorer, Verifier, ProfileSynthesizer | Typed Zod nodes inside the graph | Not a free multi-agent swarm — each node has a typed input/output boundary (D-002) |
| Skills | Prompts and soft rules | `skills/<name>/SKILL.md`, loaded on demand | Keeps prompts portable and swappable across model providers (D-005) |
| Tools | External capabilities the graph calls | MCP servers: student-profile, university-kb, session-store, portal-filler (P2) | Standard tool boundary, model-agnostic (D-005) |
| Hard rules | Rules that must never be skipped | Deterministic code guards before any LLM call: no-script, citation-required, crisis, consent | Rules that matter for safety/compliance cannot depend on a prompt being followed (D-005) |
| Knowledge graph | Student Knowledge Graph | Mongo-native: typed collections + an `edges` collection, vector search over summaries/courses | Structured facts plus vectors are enough at this data size; no Neo4j/GraphRAG in V1 (D-003) |
| Observability | Trace every graph run | Langfuse, self-hosted, `TELEMETRY_ENABLED=false` | Traces carry student transcripts, so a hosted tracer would be an external service under the data-boundary rule (D-004) |

**Note on the orchestrator row:** goal.md's original plan and the compass report both specify a plain
Node/TypeScript state machine to keep abstraction cost low for one developer. D-002 overrides this: the
orchestrator is **LangGraph.js 1.x** instead, because it matches the Vidysea agentic-architecture
standard and gives Mongo-backed checkpointing plus `interrupt()` for the counsellor-approval step for
free, while the graph is kept thin (wiring only) to preserve the compass's "fewer abstractions" concern.

**Reuse, don't rebuild** (from ARCHITECTURE.md H6 / D-001 — read-only, never written):

| Sibling repo | Piece reused |
|---|---|
| `D:/vidysea/ikigai-counsellor` | LangGraph template, prompts/rules, crisis-guard, student-memory, grader |
| `D:/ikigai_counsellor` | Gemini Live proxy |
| `D:/KnowledgeBase` | Provider seam, Gemini diarised STT, tenantScope, citation model, recall@k eval |
| `D:/counsellor_validation_judge` | Contradiction detection, mirror-student evidence |
| `D:/sop_mvp` | ContextObject profile, ApplicationConstraints |
| `D:/VirtualCounsellor_Avatar` | Phase 3 avatar |

Nothing described above is built yet in `D:/vc` — this section names what will be ported in, not what
exists today.

---

## 6. Milestones and success metrics

Roadmap timing (compass §6, indicative, one developer with AI coding tools):
- **Phase 0 — Foundations:** Student Knowledge Model + consent schema (2 weeks); University KB v0,
  top 150 universities/courses (3 weeks).
- **Phase 1 — Copilot, ~10–12 weeks total.** Start with the post-session scribe, not live cards — it
  is the lowest-risk, highest-ROI feature and it builds the student model and eval data live cards will
  need. Then live transcription + signal extraction (2 weeks), cards (explore/challenge/compare +
  visuals, 3 weeks), then an eval set + feedback loop + a 5-counsellor pilot (3 weeks).
- **Phase 2 — Execution.** Packet builder + gap questions (2 weeks), top-5 portal scripts draft-only +
  report (4 weeks), Computer Use long-tail + extension (4 weeks).
- **Phase 3 — Student surface.** Voice counsellor, Gemini Live, guardrailed (4 weeks); avatar
  integration + parent view (3 weeks).

**Exit gates (verbatim from the compass §6):**
- **P1 exit:** ≥40% card acceptance; zero uncited facts shown in 50 audited sessions; counsellors rate
  ≥4/5; post-session notes approved with light edits ≥80%.
- **P2 exit:** ≥90% field accuracy on draft fills across the top 5 portals; 0 unintended submissions;
  logged parental/student authorisation per application.
- **P3 exit:** red-team pass on distress, manipulation and prompt injection; human escalation working
  within minutes; ≥100 shadow-mode sessions (AI runs silently next to a counsellor) with acceptable
  agreement.

---

## 7. Risks and FAQ

**"Isn't this just a cheating platform?"**
No. Cards contain only questions, comparisons and evidence — never ready-made sentences for the
counsellor to recite. At most 3 cards are visible at once. A senior counsellor can switch on "quiet
mode" and get only the post-session summary.

**"What if the AI states a wrong fact?"**
Every fact must be sourced from the Knowledge Base or the student profile. The Verifier drops any card
that lacks a source. Nothing is written to the student profile without the counsellor's explicit
approval.

**"Will the application really be done in 15 minutes?"**
The data-entry portion, yes, when the profile already holds the answers. SOP, references, transcripts
and fee payment are not included. The honest promise is: "In 15 minutes we pre-fill everything we
already know, and hand you a checklist for the rest."

**"Why doesn't the AI just click Submit?"**
The student must read the declaration themselves — UCAS explicitly requires the applicant to have
"sufficient time to read, understand and accept the applicant declaration." Many portals prohibit
automated submission outright, and a wrong submission cannot be undone. So the agent always stops
before login, 2FA, CAPTCHA, payment and the declaration.

**"Why no avatar yet?"**
The engine has to be proven safe alongside a human counsellor first. Avatars are a rented commodity
(roughly $0.01–0.10 per minute) — Resso's quote for a custom build was far more expensive and it still
isn't the moat. The moat is the student's longitudinal profile and the counsellors' accumulated
judgement.

**"What does this cost to run?"**
A 45-minute counsellor session costs roughly $1.0–1.5 today, rising to about $2–2.5 after Gemini
Flash's rate doubles on 1 January 2027. At 1,000 sessions plus 300 application drafts a month, that is
roughly $1.8–3k per month. Caching and routing more calls to Flash-Lite will bring this down later.

**"How much time for one developer?"**
Phase 1 is about 10–12 weeks. It starts with the post-session summary feature because that is the
safest piece to ship and it is also what builds the student data the later, live-card features depend
on.

**"What about Hindi and regional languages?"**
The outer layer speaks to the student in their own language. Internally, everything is processed in
English. The original-language transcript is kept alongside the English version, so nothing is lost.

**"What if Gemini goes down or gets expensive?"**
Speech-to-text, text-to-speech and the LLM all sit behind one interface, so switching providers is a
configuration change, not a rewrite. Sarvam is the Indic-language fallback.

**"What's the legal risk with minors' data?"**
India's DPDP Act requires verifiable parental consent for under-18 users; child-data obligations become
enforceable on 13 May 2027. Consent and purpose-tagging are built into the data model from day one, and
a legal review is still required before any real Pathlynks data is joined (see Q3 in
ARCHITECTURE.md — this is not yet resolved).

**"How will we know it's actually working?"**
Phase 1 is judged passed only when: at least 40% of cards get used by counsellors, zero uncited facts
appear across 50 audited sessions, counsellors rate the tool at least 4/5, and at least 80% of
post-session notes are approved with only light edits. Phase 2 and Phase 3 have their own gates (§6).

**Risk table (compass §9):**

| Risk | Severity | Mitigation |
|---|---|---|
| Counsellors ignore cards (noise, latency) | High | Fewer, slower, better cards; event-triggered; acceptance metrics; quiet mode |
| Wrong facts shown to counsellor | High | KB-only facts, citations, verifier pass, "unverified" labels |
| Application agent mis-fills or auto-submits | Very high | Draft-only, DOM re-read diff, student submits, audit log |
| Portal ToS/blocks, CAPTCHAs, 2FA | High | Student-side extension + student login; scripted top portals; accept ~50% autonomous success on the long tail |
| DPDP non-compliance with minors' data | Very high (fines up to ₹200 crore / ₹250 crore per instance, can stack) | Consent layer in Phase 0; legal review before Pathlynks data is joined |
| Solo-developer bus factor and scope creep | High | Strict phase gates; thin code; buy avatar, transport and STT |
| Price shocks (Flash doubling Jan 2027) | Medium | Budget at 2027 rates; caching; Flash-Lite routing |
| Student disengagement with a Socratic AI (Phase 3) | Medium | Balance questions with concrete answers and visuals (Khanmigo lesson) |

## Recovery execution appendix — 2026-09-30 (D-029)

The full Explore -> Conclude -> Execute goal remains active. Application drafting is in the first pilot, per the directly recorded Umesh decision. Pilot exceptions do not constitute full-goal completion. Existing work will be integrated with its original history and independently checked; no new product module is proposed in this unit.

### Next product unit: T-035 safety-data lifecycle (independent plan APPROVED, 2026-09-30)

**Outcome:** crisis notification/review records are tenant-scoped, discoverable in the student's export, fully erased with independent read-back-zero, and cannot be recreated by a delayed or replayed writer. Registration, export/erasure and fencing ship together; a registration-only or fencing-only slice leaves a known privacy hole.

**Existing files/functions to edit in place:**
- `packages/db/src/collections.ts:24` — `COLLECTION_NAMES`: register `escalation_notifications` and `crisis_flag_reviews`.
- `packages/db/scripts/db-init.ts:82` — `INDEX_PLAN`: tenant-leading student/session lookup indexes for both collections, without any other database access.
- `packages/db/src/erasure.ts:1417` — `ERASURE_PLAN`: phase-1 `byStudent` purge and independent residue checks; `StudentExport:1800` / `exportStudent:1840`: add projected `escalations` and `crisisReviews` arrays, empty for students without records.
- `packages/engine/src/guards/escalation.ts:203` — `notifyAll`, `escalateTurns:254`, `runReview:326`, `acknowledgeEscalation:397`: bounded writer precheck/postcheck and ownership-qualified compensation on every mutating path, using existing `WriterDeadline`, `assertStudentNotFenced` and `compensateIfFenced`.
- `packages/db/tests/db-init.test.ts` — verify both index definitions are tenant-led.
- `packages/db/tests/erasure.test.ts:100` / `:332` — extend existing fixtures and lifecycle/export outcomes.
- `packages/db/tests/db-scope.test.ts:194` / `:257` / `:285` — register both student-data names in the scanner and require actual fenced-writer coverage; no blanket exemption.
- `packages/engine/tests/crisis-escalation.test.ts:328` — replace the stale assertion that the collection is absent; add writer/replay/acknowledgement race coverage in the existing test file.
- `apps/api/src/openapi.ts:250` — describe the additive projected safety export and its staff/provider-field exclusions.

**Export interface:** `escalations` projects escalation/session/student/turn identifiers, guard level and matched flags, student-related severity/reason, existing channel/status, flagged/notified timestamps and nullable acknowledgement timestamp. `crisisReviews` projects session/student/turn identifiers, guard level/matched flags, flagged timestamp, and the classified severity/likelyBenign/rationale/time or the existing unavailable status/reason/time. Use the actual existing enum literals. Omit internal Mongo IDs, staff recipient/acknowledger identities, model/provider/error/debug fields, sampling fields and write-ownership tokens. Preserve one entry per stored notification in deterministic ID order; do not invent aggregation. Keep the export types in existing db code to avoid a db-to-engine dependency cycle.

**Writer protocol:** each bounded write phase observes the student's fence before and after mutation. Insert ownership is recorded atomically through an invocation token on insertion; ambiguous timeouts get a compensator when the operation eventually settles. Compensation may delete only that invocation's inserted records, never a pre-existing deterministic ID. Classifier and acknowledgement annotations use compare-and-set with ownership-qualified rollback; acknowledgement never compensates by deleting the underlying notification. Recheck the fence after classification before any new write, and do not hold one writer deadline across an arbitrarily long classifier run. Dispose deadlines in `finally`.

**Test-first sequence and acceptance:**
1. Establish red tests in the existing test files for both missing lifecycle collections, then implement the combined behavior.
2. Seed tenants A/B with identical student/session/turn IDs. A's export includes only A's projected safety information; A's completed erasure has zero independent full-scan residue; B's raw records remain byte-identical.
3. Hold each writer across fencing: initial review insertion, notification upsert, classifier annotation and acknowledgement. Releasing it cannot recreate erased data; a replay/timeout compensator preserves a previous invocation's legitimate records.
4. Exercise records with no session anchor, unavailable classifier, already-acknowledged notification and ambiguous Mongo outcomes. Assert raw database state and public export JSON, not only helper return values.
5. Independent isolated mutations remove either purge-plan entry, writer precheck or ownership qualification and must make the appropriate outcome assertion fail. The checker owns mutation evidence; no shared-tree mutation is permitted.
6. Run existing db and engine test entrypoints, repository typecheck and the contract validator. Run one post-integration full suite when this unit lands. Tests are offline with fake Mongo and synthetic data.

This unit does not establish actual notification delivery, the no-consent API path, or live Pathlynks integration. Those remain required follow-up units. D-027 still requires identifiers plus a crisis flag only without consent and zero classifier/KB/summary/profile processing in that exception.

### Remaining full-goal tracks

- Resolve and independently test live-card B1/B18 leaks; integrate only with an honest criterion mapping.
- Implement approved-fact/do-not-ask personalization, then complete destination relevance for the full goal.
- Wire safety recipient resolution and real delivery; prove the no-consent crisis exception end to end.
- Establish authenticated Pathlynks integration with real issuer/rotation and webhook-consumer evidence.
- Obtain Sapna ma'am's reference rubric, then measure novice + VC >=90% on matching cases.
- Specify the first application target, implement cited draft/review/checklist behavior, and prove the available-data entry timing and zero unintended submits.
- Build and verify student voice/avatar through the shared engine and the declared Hindi/voice personas.

No application target, expert reference, new source file, external connection, publication or production action is assumed approved by this appendix.
### Source reuse evidence (read-only audit, 2026-09-30)

These are source-inspection findings, not live/provider verification:
- `D:/sop_mvp/backend/app/models/context.py:58` has real ApplicationConstraints/ContextObject; `services/draft_service.py:41` and `services/sop_weaver_service.py:19` provide section/SOP generation. They are SOP context/prose components, not UCAS/Common App field schemas. Reuse approved-fact mapping and prompt flow through VC's provider interface; do not import sibling persistence. Prompt-only word limits and fallback concatenation need deterministic validation and honest labelling.
- `D:/VirtualCounsellor_Avatar/apps/agent/src/deepinterview_agent/worker.py:95/218/647` provides transcript capture, STT selection and LiveKit AgentSession assembly. It is interview-specific and its language map currently omits Hindi; unknown languages fall back to English. Transport may be reused, but counselling output must remain under VC's authenticated graph and guards.
- The avatar repo's `apps/web/components/interview/live-room.tsx:636` has connection/reconnect UI; `components/avatar/avatar-stage.tsx` renders idle/speaking states but video-loop URLs are placeholders/404 with gradient fallback. `components/counsellor/counsellor-avatar-preview.tsx:67` resolves stored GLB models. None is proof of an available live avatar service or media asset.
- `D:/ikigai_counsellor/server/geminiLiveService.ts:129/165` is a real server-side Gemini Live audio/text bridge. Its direct Gemini reply generation bypasses VC's graph/guards; do not reuse that reasoning path unchanged.

External dependencies remain unverified: real client identity and recipients, LiveKit/microphone and STT/TTS configuration, Hindi speech, avatar media/model availability, and the selected application form. No vendor service or real student data was contacted during this audit. The exact application-target question remains pending; SOP generation alone does not satisfy the fifteen-minute application-draft outcome.

### Independent T-035 preimplementation plan decision — 2026-09-30

**PLAN DECISION: APPROVE.** Reviewer: fresh independent quality/checker agent `t035_plan_gate`, bound to `D:/vc`. This approves implementation of the combined nine-existing-file safety-data lifecycle plan above. It is preimplementation approval only: no Mode A PASS, issue closure, live-delivery certification, release approval or full Explore -> Conclude -> Execute completion is granted.

**Evidence reviewed:** the complete user goal attachment, current ARCHITECTURE.md (H8/H9/H10 and cross-cutting boundaries), recent D-027/D-028/D-029 decisions, counselling contract B4/B8/B9/B12/B14/B15/B16/B21/B22, the recovery plan and existing source. `escalation.ts:247`, `:296`, `:344` and `:404` currently mutate safety records without the erasure writer protocol. `collections.ts:24` and `erasure.ts:1417/1840` omit these collections from registration, purge and export; the scanner's student-data list at `db-scope.test.ts:194` also omits them. These records carry studentId directly, so phase-1 byStudent selectors repair the session-anchor-free case. The plan addresses the privacy defect as one unit without disguising actual notification delivery or the consent exception as completed.

**Mandatory implementation/checker acceptance within this approval:**
- Preserve the plan's projected export, empty arrays, deterministic order, tenant isolation and raw-record preservation for the other tenant. Verify both new collections independently of ERASURE_PLAN using full raw collection scans, including records with no session anchor. Exercise purge/read-back failures and retain the existing double-confirmation, approver/default-autoDelete and 24-hour fence behavior.
- Cover all four mutation paths separately: initial review insertion, notification upsert, classifier annotation and acknowledgement. Construct deadlines immediately before each bounded precheck/write phase, pass operation timeouts, run a finally postcheck even on rejection, and dispose the deadline. `WriterDeadline.run` at erasure.ts:617 races a promise; it does not cancel the underlying operation. A timeout therefore needs an observed late-settlement compensator, with a test awaiting eventual raw-state stabilization. A postcheck read error must fail safe and undo this invocation's changes, as compensateIfFenced at :698 already specifies; compensation failure must remain visible.
- Insert ownership must be set atomically with $setOnInsert, not inferred from a possibly missing Mongo result. An upsert replay must never claim or delete an earlier invocation's legitimate record. Classifier/acknowledgement rollback must compare the invocation's mutation token and restore only its own prior annotation fields; it must never delete the notification, resurrect a purged row or overwrite a newer invocation. Include already-acknowledged and unavailable-classifier cases. Resolve acknowledgement's studentId from the tenant-scoped stored row before guarding its mutation; never trust an unrelated caller-supplied student identity.
- Keep the classifier outside the writer deadline and recheck the fence after it returns before starting any write. No raw transcript text may be added to notification/review records, export, logs or compensation tokens. This unit does not authorize no-consent classification; the D-027 follow-up must prove identifiers plus crisis flag only and zero classifier/KB/summary/profile processing without consent.
- Register the two names in the existing scanner and support any fence-aware allowlist entry with actual behavioral tests for every mutation path; no blanket safety exemption. Independently mutate isolated copies to remove each purge entry, a writer precheck and ownership qualification. Each mutation must reach and fail the appropriate raw-state outcome assertion. Do not mutate the shared working tree.
- Before a completion verdict, a new independent checker must rerun the db/engine tests, repository typecheck and contract validator, then the post-integration full suite. Preserve existing B9 immediate-before-classifier and B16 guard-visibility behavior. This plan review executes no product tests and certifies no implementation.

**Authority and separation:** verified the updated user-level rule in `C:/Users/Lenovo/.codex/AGENTS.md:59`: routine reversible multi-file goal work receives explicit fresh quality/checker approval before implementation, followed by a separate independent PASS/FAIL check. The maker cannot approve its own plan or certify completion. Approval is limited to the nine existing files already named; new files, contracts/enforcement edits, production operations, external sending/publishing, unresolved product scope and named HUMAN_GATEs retain their existing authorization requirements. No additional manual plan confirmation is required for this approved offline repair.
### T-035 measured baseline — 2026-09-30

An independent standalone fake-backed runtime probe (`node --import tsx --input-type=module`, exit 0), without session anchors, verified that student export omits safety records and approved erasure reports `completed` while `escalation_notifications=1` and `crisis_flag_reviews=1` remain for the erased tenant. A second tenant using identical student/session/turn IDs retained both records, with raw-document JSON serialization byte-identical before/after. Assertions verified these outcomes using the existing testing, tenant and erasure helpers. This proves the fake-backed baseline defect, not real-Mongo or live deployment behavior. At the time of this baseline probe, plan approval was pending; the subsequent independent t035_plan_gate APPROVE supersedes that historical blocker.

### Safety integration source trace — 2026-09-30

Current main `apps/api/src/server.ts:855` createTenantWiring compiles the scribe graph at lines 872-875 with db/provider/skillsDir only; no escalation dependency or recipient resolver is supplied. `packages/engine/src/scribe/graph.ts:626` escalateSessionFlags returns on refused consent at line 632, contrary to the D-027 identifiers-plus-crisis-flag exception. Its existing comment also treats safety records as exempt from fence compensation; this cannot satisfy student erasure. The unmerged live-card graph `.worktrees/t-010-live-cards/packages/engine/src/cards/graph.ts:84` routes refused consent directly to END before its crisis node. Finally, `packages/engine/src/guards/escalation.ts:234` persists channel `record_only`; a queued database record is not actual notification delivery. These are source-confirmed missing paths, not live-service measurements. Follow-up must preserve zero classifier/KB/summary/profile processing without consent while implementing the minimal crisis exception, authenticated recipient resolution and durable delivery. No source changes were made during this trace.

### Pathlynks report-backend integration audit — 2026-09-30

Read-only source audit of `D:/pathlynks-combined-report` found no VC connection in the searched Python/JS/TS/HTML source. `src/api/main.py:169-174` registers health/recommend/recommend_stream/pdf/status/users routers; `src/api/dependencies.py:51` uses encrypted X-Auth-Key, not an established VC JWT issuer. `src/api/routes/users.py:23` and `src/db/user_profile_manager.py:104` provide a user-id profile path but do not establish tenant mapping. This repo has not been verified as the actual production Pathlynks integration owner. VC `apps/api/src/index.ts:128/165` provides opt-in HTTP and destination-controlled emission wiring; `packages/engine/src/webhooks/delivery.ts:163` defines drainWebhookOutbox, but no running drain-worker call was identified. Signed header machinery exists at `packages/engine/src/webhooks/signing.ts:9-11`. Existing components do not prove a connected client, issuer, webhook consumer or running delivery process. Verify the actual client owner and tenant identity before implementing the cross-repo plan; do not connect via inferred credentials or map user_id to tenant silently.

### Next personalization unit: B18 source baseline — 2026-09-30

Current `packages/engine/src/scribe/schemas.ts:118` ExtractInputSchema contains only turns/sessionEndedAt and SummaryInputSchema:133 contains turns/facts. `nodes.ts:1124` extractFacts sends only turns to the provider; `nodes.ts:1165` summarizeSession sends turns and newly extracted facts, with a B1 script gate but no approved-history/do-not-ask suppression. Existing `packages/engine/tests/b18-suppression-outcome.test.ts` documents and measures those missing input channels; its known-gap assertions are baseline instrumentation, not implemented personalization. The graph must carry authoritative approved facts into these existing paths before the engine can suppress a repeated known question. Pending/rejected proposals must not become a permanent do-not-ask source; a genuine newly stated changed value must remain reviewable. The next unit needs an independent goal-aligned plan with actual input/projection/filter and end-to-end graph tests, preserving changed-value handling and factual historical summaries. No personalization code was changed by this source audit.

### Independent T-035 rationale/consent clarification — 2026-09-30

**PLAN DECISION: APPROVE WITH EXPLICIT CLARIFICATION.** The original nine-file lifecycle plan remains approved; this corrects my over-broad plan wording, not the critical contract. My preceding sentence, "No raw transcript text may be added to notification/review records, export, logs or compensation tokens," must be read with the following authoritative distinctions; no blanket transcript-free guarantee is certified for a consented classifier rationale.

**Source evidence:** `ConcernClassifierOutputSchema` in `packages/engine/src/guards/concern-classifier.ts:94-100` accepts any nonempty string of at most 500 characters as rationale. Its parse at :295 and classified return at :296 do not compare that string with the input turn. Current `escalation.ts:390-404` persists that annotation, and `erasure.ts:1899-1901` exports its rationale. A schema-valid rationale can therefore quote an actual turn; projection alone cannot make it transcript-free. One tiny synthetic schema probe was attempted but failed on shell quoting before module execution (exit 1), so this finding rests on inspected source, not claimed runtime proof.

**Authoritative requirements:** B4 says the no-consent escalation carries "identifiers and the flag only, never transcript text" and allows no other processing. D-027 repeats that exact exception. Those prohibitions apply to all fields in a no-consent record, including indirectly copied text in a rationale, not merely to fields named transcript. No-consent therefore must never call the classifier, persist a classified rationale, log the turn or construct a summary/profile/KB result. That end-to-end path remains a required follow-up and is not certified by this lifecycle unit. Conversely, B2 explicitly requires the consented full transcript to be persisted and exported, while B15 requires a per-student access bundle and full erasure. B16 allows classifier annotations and does not require removing consented explanatory text. None of these contracts imposes a universal ban on the student's own text in an authenticated consented access export.

**Bounded behavior and validation acceptance:**
- Keep the approved rationale field for consented classified reviews. Treat it as untrusted, potentially transcript-bearing student personal data, not a validated fact or safe boilerplate. It remains tenant-scoped and covered by the complete purge/read-back/fencing obligations. Notification payloads retain identifiers/flags/structured severity and reason only; do not add rationale or transcript payloads there, to logs, or to ownership/compensation metadata.
- Keep schema validation at the classifier boundary. An invalid shape, unknown severity, wrong likelyBenign type, extra field, empty rationale or rationale over 500 characters is rejected rather than persisted as classified; the existing unavailable/error path records no provider message or raw output. Verify this with synthetic offline provider outputs and raw stored/exported state. A schema-valid consented quotation is not falsely labelled as having passed a no-raw-text check; prove its exact rationale survives access export and is erased with the review.
- Preserve safety independently of rationale validity: crisis remains immediately critical before classifier execution; every guard flag remains visible; effective severity is never below its guard floor (concern moderate, crisis critical); invalid/unavailable review on a guard concern follows the existing fail-open escalation. A valid high/critical classifier outcome on a sampled unflagged turn must not be discarded merely because its explanation quotes the consented input.
- Preserve actual no-consent validation separately: when its follow-up is submitted, assert zero classifier calls and no rationale/transcript-bearing fields anywhere in raw records, export or captured logs, while the identifiers-plus-crisis-flag notification remains present. Consent must come from authoritative tenant-scoped state, never a model assertion.

This clarification changes no B4/B15/B16 threshold, contract, model schema, source file, production behavior or full-goal scope. It does not approve blanket omission of rationale, a semantic sanitizer claim, or a consent bypass. A stronger policy forbidding all free-form personal text even in consented safety reviews would need its own explicit product/contract decision; it is not inferred here. Maker/checker separation, independent completion verification and all existing human gates remain in force.

### B18 approved-history implementation plan — DRAFT, awaiting independent plan approval

Goal mapping: make the existing scribe consume authoritative cross-session student history and prevent already-known-as-unknown requests without hiding legitimate changed values or historical session evidence. This is a necessary part of the full B18 obligation; destination relevance, live-card integration and a durable do-not-ask list remain required and cannot be credited by history plumbing alone.

Confirmed source: packages/db/src/facts.ts:984 readActiveProfile(db, studentId, SCRIBE_PURPOSE) supplies consent-gated, active, purpose-scoped persisted facts. Persistence through applyApprovedDiff is approval authority; needsReview:true is not proof a persisted fact is unapproved. Existing scribe proposeDiff at nodes.ts:1204 currently reads active facts without purpose filtering. PreBriefCardSchema at packages/schemas/src/schemas.ts:143 has doNotAsk, but no inspected DB/API/scribe source owns or persists that list. Pending/rejected proposals and caller/model/fixture prebrief assertions are not authoritative history.

Existing-file/function targets, to be refined before approval:
- packages/engine/src/scribe/graph.ts ScribeState:86 and buildScribeGraph:109 — load validated authoritative history on the continuing consent/crisis-approved path before extraction; propagate the same snapshot to extraction and summary. No public caller authority in ScribeInputSchema.
- packages/engine/src/scribe/schemas.ts ExtractInputSchema:118 and SummaryInputSchema:133 — typed projected approved context with durable identity/provenance, separate from current extracted facts; validate persisted facts before projection.
- packages/engine/src/scribe/nodes.ts extractFacts:1124, summarizeSession:1165 and proposeDiff:1204 — consume context, preserve current quote/review checks and genuine changes, use the same consent/purpose-scoped comparison, and enforce known-as-unknown suppression while keeping factual summaries. A prompt, captured payload or provider-authored semantic label alone does not establish that last outcome. The concrete bounded semantic verification design and existing provider compatibility must be specified before approval; a generic lexical blacklist is not accepted as full semantic proof.
- Existing skills/fact-extraction/SKILL.md and skills/session-summary/SKILL.md — document approved context and changed-value/historical evidence boundaries in place.
- Existing tests b18-suppression-outcome.test.ts, scribe.test.ts, scribe-persistence.test.ts, scribe-checkpointer.test.ts and scribe-per-fact.test.ts — independently derived graph-to-interrupt/raw-readback cases, not a parallel test module. Only genuinely repaired known-gap rows move to contract expectations; unresolved quarantined policy rows remain explicit.

Required acceptance: approved score across a fresh session produces no known-as-unknown ask; structurally changed values remain reviewable and unwritten before approval; pending/rejected/retired/wrong-purpose facts cannot drive false suppression; identical IDs in other tenants/students never disclose context; consent loss/fence fails closed before provider exposure; edited provenance is not relabelled as a new transcript quote; historical discussion remains faithful while fabricated future re-asks, including paraphrases/Hinglish and a context-ignoring synthetic provider, are prevented. Unknown fields remain available. Checkpoint replay creates no duplicate writes. Each claimed guard needs an isolated runtime mutant reaching and failing its independent outcome assertion.

[UNRESOLVED PRODUCT INPUT] Durable do-not-ask owner, approval/revocation and exact-key versus topic semantics are not established by the current schema. Human policy clarification was requested asynchronously on 2026-09-30; no answer is assumed. This does not block approved-history planning. The read-only AI engineering review is refining semantic guards; this draft grants no implementation approval or product PASS. T035 independent verification currently owns the test mutex and its nine-file candidate remains frozen.

### B18 approved-history plan refinement — proposed maker plan, awaiting fresh quality approval

This refines the preceding draft to include an actual fail-closed semantic guard, not merely prompt/input propagation. Existing source targets: graph.ts ScribeState/buildScribeGraph; scribe/schemas.ts ExtractInputSchema/SummaryInputSchema and adjacent existing summary schemas; nodes.ts extractFacts/summarizeSession/proposeDiff; providers/src/index.ts rulesSummarizeSession:926 and RulesProvider.generate:950; existing fact-extraction and session-summary skill bodies. Existing test targets only: engine/tests/scribe-fixtures.ts mockProvider:82/makeHarness:122; scribe.test.ts, scribe-persistence.test.ts, scribe-checkpointer.test.ts, scribe-per-fact.test.ts, scribe-rules-e2e.test.ts, b18-suppression-outcome.test.ts; providers/tests/rules.test.ts and index.test.ts. No new source, skill or test files. Additional existing targets need explicitly recorded fresh quality approval before mutation.

Retrieve and schema-validate active, consent/purpose/tenant/student-scoped persisted facts only on the continuing post-consent/crisis graph path. Carry durable fact IDs and original provenance in a projected read-only context, separate from current-session facts. Never accept authoritative context through public ScribeInput. Use readActiveProfile with SCRIBE_PURPOSE for proposeDiff as well; reuse its existing canonical value comparison and write-time conflict protection. Do not blacklist known keys: changed values and historical mentions remain available for review, pending/rejected proposals never become permanent suppression context.

Generate summary with explicit task='generate' and approved context. Preserve existing B1 recital withholding first. For a nonempty candidate summary with nonempty approved context, make exactly one additional top-level provider.generate request using the existing session-summary prompt and explicit task='verify-approved-history'. It reads the exact candidate text plus approved context/current evidence independently of the writer's claimed intent. Add a distinct Zod verification envelope adjacent to the existing summary schemas: verdict clear/violation/uncertain; confidence in [0,1]; exact offending spans with approved fact IDs; completeness covering supplied context. Validate IDs, exact substrings and verdict/evidence consistency in code. Clear requires complete validation, no offending spans, and confidence >=0.95; this is a conservative release gate, NOT a calibrated 95% accuracy claim. Fresh quality review must approve or revise the exact envelope/completeness proof before code.

No semantic-verdict regeneration loop or same-provider schema retry: issue the one verification request directly rather than generateWithRetry, whose current schema-error handler permits a second request. Existing configured provider deadline/cancellation/failover remains in force; a failover provider may spend its existing ten-attempt budget inside that top-level request. Any schema-invalid/incomplete/uncertain/low-confidence/violation response withholds candidate summary using a stable raw-free reason while keeping extracted facts/diff approval available. Provider unavailability follows the existing input-preserving unavailable/Retry path, never a false clear or implicit rules fallback. Recheck authoritative consent/fencing before context disclosure to each provider stage; a read error cannot masquerade as an empty authorized profile. Do not log profile values, candidate prose, spans or raw provider errors.

RulesProvider handles the verification task in its existing session-summary dispatch: reconstruct the exact deterministic generation rendering from validated current facts; accept only that exact candidate, otherwise uncertain. This is an explicitly narrow rules grammar, not a general semantic claim. MockProvider already supports skill-keyed response functions and cloned recorded inputs; existing fixture mockProvider supplies task-dependent generation/verification responses instead of response-order hacks. No changes to production model/provider selection or installed skills are implied.

Independent behavioral acceptance must cover real graph -> approval interrupt -> approved write/read-back for fresh sessions, structurally changed values, edited provenance, pending/rejected/retired/wrong-purpose history and identical IDs in other tenants/students. Include English/Hinglish/indirect known-fact reasks, writer instructions/injected false historical labels, faithful historical reports, unrelated unknown-field positive controls, consent/fence transitions before either provider stage, all verifier malformed/evidence/uncertain/low-confidence/unavailable outcomes, deterministic rules acceptance/rejection and checkpoint replay. Separate verification response mocks are independently authored expected verdicts; they prove orchestration/fail-closed behavior, not real-model semantic recall. A separate synthetic provider evaluation is mandatory before any live semantic-quality claim. Preserve existing 55 asserted/11 unsettled fixture coverage, moving only genuinely repaired known-gap rows to contract assertions.

Fresh checker must independently mutate isolated context wiring, verification invocation, fail-closed handling, purpose/tenant scope and changed-value preservation and reach the corresponding failing outcome assertion. Run affected existing provider/engine suites and nine-project typecheck under the shared test mutex after T035 releases it, then required broader checks. Full B18 remains incomplete until durable do-not-ask policy/persistence, destination relevance and live-card integration are separately implemented and verified. This proposed plan is NOT APPROVED and grants no source implementation authority yet.

### Independent B18 approved-history plan approval — 2026-09-30

**PLAN DECISION: APPROVE WITH MANDATORY BOUNDED CONDITIONS.** Bound to D:/vc. This is independent implementation-plan approval under D-030 and the user-level edit-in-place rule, not a product PASS, semantic-quality certification or complete B18/full-goal verdict. I read the full checker skill, ARCHITECTURE, complete counselling-engine contract, D-029/D-030, both B18 plan sections and the existing scribe/profile/provider/test seams. No tests were run; T-035 owns that mutex. No source, contract, manifest or ledger was edited by this review.

**Approved existing targets:** the refinement's scribe graph.ts, schemas.ts, nodes.ts; providers/src/index.ts; two existing skills; existing engine tests scribe-fixtures.ts, scribe.test.ts, scribe-persistence.test.ts, scribe-checkpointer.test.ts, scribe-per-fact.test.ts, scribe-rules-e2e.test.ts, b18-suppression-outcome.test.ts; and existing providers tests rules.test.ts and index.test.ts. Explicit additional functions within those existing approved source files are nodes.ts generateWithRetry/ScribeDeps and providers/src/index.ts GenerateRequest, MockProvider.generate, GeminiProvider.generate, LiteLlmProvider.generate and FailoverProvider.generate, besides rulesSummarizeSession/RulesProvider.generate. They may carry and enforce the authorization hook described below. No new source, skill or test file is approved. Build in an isolated existing or managed worktree is permitted to preserve the frozen T-035 main candidate; main integration waits for a separate independent B18 completion verdict and the shared verification mutex.

**Authority and scope evidence:** D-029 at docs/DECISIONS.md:323-336 preserves Explore -> Conclude -> Execute, the scribe personalization pilot split and destination/live-card/full-goal gaps; D-030:338-343 authorizes fresh plan approval without another manual plan gate. B18 at qa/contracts/counselling-engine.md requires output-level suppression, while B2/B3 retain citation, changed-value review and counsellor write authority. graph.ts:109-143 currently passes turns/current facts alone; nodes.ts:1204 reads active history without purpose filtering; db/facts.ts:984-989 offers the consent-first purpose-scoped helper. FactSchema at schemas/src/schemas.ts:72 onward includes provenance and needsReview. Persisted approved facts can retain needsReview:true; do not mistake that flag for approval status. Durable do-not-ask ownership/revocation/topic semantics remain unanswered product input; caller/prebrief/model assertions, rejected proposals and temporary fixtures cannot become that authority.

**Required context boundary:** schema-validate every persisted fact plus its durable nonempty ID, matching student and verified tenant binding, active state and SCRIBE_PURPOSE before projection. Reject malformed stored context rather than silently reducing it to an empty profile. Preserve FactSchema source and editedFrom provenance without relabelling it as a fresh transcript quote. Context is server-loaded only, separate from newly extracted facts and not a public ScribeInput authority. Snapshot extraction/summary use the same validated context; proposeDiff re-reads through readActiveProfile for its purpose-scoped comparison. Preserve existing canonical structural value comparison and write-time conflict protection. Changed values remain citable review proposals and produce no graph write before approval; no generic blacklist of known keys is permitted.

**Exact verification envelope approved:** add a strict Zod object adjacent to existing summary schemas with verdict clear|violation|uncertain, confidence finite [0,1], reviewedFactIds:string[], reviewedRanges:{start:integer>=0,end:integer>start}[], and offendingSpans:{factId:nonempty string,start:integer>=0,end:integer>start,text:nonempty string}[]. All objects reject unknown keys. On a nonempty summary with nonempty approved context, generate one distinct verification request for the exact candidate, approved context and current evidence. Locally validate that reviewedFactIds equals the supplied unique fact-ID set with no duplicates/unknown/missing IDs; reviewedRanges are sorted contiguous nonoverlapping UTF-16 code-unit intervals from 0 through candidate.length, with no gap; every offending span has a supplied factId, valid bounds and text exactly equal to candidate.slice(start,end). Clear requires confidence >=0.95, complete structural coverage and zero offending spans. Violation requires at least one validated offending span; uncertain never releases a candidate. Contradictions, malformed IDs/ranges/evidence, invalid shape, low confidence or incomplete coverage withhold the whole summary under one stable raw-free reason while allowing facts/diff approval. This proves response completeness structurally, not that a model actually read or understood every span/fact. The writer cannot supply its own trusted clear verdict; the verifier judges candidate meaning, including indirect/Hinglish future re-asks, against the approved context and actual session evidence. The 0.95 threshold is conservative policy, never calibrated 95% correctness.

**Disclosure authorization and retries:** nodes.ts:1105-1121 currently repeats single-model schema failures and providers/index.ts:794-836 may disclose on each failover attempt. Recheck authoritative consent, SCRIBE_PURPOSE, verified tenant/student binding and fence immediately before every extraction/generation/verification provider execution, including generation schema retries and each underlying failover disclosure. Approve an optional asynchronous preflight on GenerateRequest, wired from the private db/student closure. Every leaf provider invokes it once before execution; FailoverProvider must pass it through to each leaf rather than double-invoke it. Authorization rejection propagates as a typed nonretryable raw-free refusal, not schema-error retry or AiUnavailableError; a read failure stops disclosure rather than masquerading as authorization. Checkpoint resume cannot reuse a stale granted boolean. Keep cancellation, real HTTP attempt timeout, ten-attempt budget, ordering and total wall-clock deadline unchanged. The preflight must be inside the existing deadline/cancellation accounting, and an expired/aborted attempt cannot start a new request after its hook completes. This is a bounded preflight guarantee; it does not claim atomic consent revocation with an already in-flight network request. No new attempt budget or automatic rules fallback is approved.

**One verification request and raw-free failures:** verification calls provider.generate directly, never generateWithRetry; there is no verification schema-retry/regeneration loop. Configured failover may consume only its existing bounded attempt chain within that one request. Invalid semantic output withholds; real provider unavailability retains the existing input-preserving unavailable/Retry behavior. Do not put candidate/profile/span/raw model output/provider error messages into failure reasons, logs, traces or schema-error retry feedback. Existing extraction citation checks and B1 recital withholding stay first; this unit neither widens B2 grammar nor changes B9/B16 safety handling.

**Rules and compatibility:** RulesProvider reconstructs the exact fixed rendering from validated current facts and clears only an exact candidate match, with mechanically generated complete reviewed IDs/ranges. Any changed candidate is uncertain. This covers that closed deterministic grammar only. Existing mockProvider responses become task-aware generation versus verification responses; explicit per-test response overrides must not silently return a generation shape for verification. Preserve no-context legacy behavior and justified call counts, but update assertions whose provider-stage count legitimately increases. No fixture expectation is erased or replaced merely to hide a failure.

**Mandatory independent acceptance before any implementation completion:** graph -> interrupt -> approved raw write/read-back across fresh sessions; known score asks withheld even when writer ignores context; English/Hinglish/indirect/injected future re-asks; faithful historical report and unknown-field positive controls retained; structurally changed scalar/object values survive as unwritten review proposals; edited provenance survives; pending/rejected/retired/wrong-purpose and other tenant/student facts cannot suppress or disclose; consent/fence changes before each leaf/retry prevent its execution; malformed/incomplete/unknown-ID/false-span/conflicting-verdict/uncertain/low-confidence outputs fail closed; unavailable and cancellation preserve bounded behavior; deterministic rules exact-match/rejection; checkpoint replay produces no duplicate writes. Independent checker must reach failing outcome assertions under isolated mutants removing context wiring, verifier invocation, fail-closed handling, purpose/tenant scope and change preservation. Retain 55 asserted/11 unsettled fixture coverage and report unrepaired destination/do-not-ask/live-card rows explicitly. Run affected existing suites, repository nine-project typecheck and required broader checks after the mutex is free. Hand-authored verifier mocks prove orchestration and fail-closed handling only; a separately scored synthetic real-provider evaluation is mandatory before any live semantic-quality claim and cannot be replaced by the model's own confidence/clear label. Full B18, live cards, durable do-not-ask, destination relevance, expert benchmark, application drafting and voice/avatar remain separately measured obligations.

These conditions are concrete implementation details within the authorized reversible scope and grant implementation authority now. They create no new human approval gate. The maker must preserve this written approval and submit independently checkable outcomes; plan approval cannot close a task or certify the product.

### Independent B18 provenance and scoped-fixture clarification — 2026-09-30

**PLAN DECISION: APPROVE the bounded clarification and exact fixture amendment below.** This corrects an unsupported premise in my preceding approval; it does not weaken B2 or certify its implementation. Source review only, no runtime tests under the T-035 mutex, and no source/contracts/ledger writes.

**Actual edit representation and full-goal gap:** canonical packages/schemas/src/schemas.ts:25-46 FactSourceSchema has transcript/kb/profile/student-direct only; FactSchema:72-101 has no editedFrom. packages/db/src/collections.ts:146 defines FactDoc from that canonical Fact. nodes.ts:1291 perFactDecision edits spread the proposed fact and replace value/purposeTags while retaining its source; decisionFromResponse:1319 accepts whole-batch canonical facts without generating counsellor-edit. db/facts.ts:521-527 persists that fact unchanged plus identity/student/hash/active fields. apps/api/src/server.ts:341-357 reads those actual stored facts and forwards them to buildFactApprovedEvent; webhooks/schemas.ts:134-142 forwards source unchanged. The webhook-only superset at webhooks/schemas.ts:31-39 can parse counsellor-edit/editedAt/editedFrom, but its own :13-22 explicitly says no engine fact produces that representation. A hand-built envelope test is not end-to-end provenance proof. D-021 at DECISIONS.md:210-229 and B2 at counselling-engine.md:123-127 require the real stored/API/client representation. Therefore canonical counsellor-edit + editedFrom remains an explicit existing B2 full-goal gap (also identified by existing ISS-t-027-rev-2), not an implemented capability.

**Bounded B18 preservation requirement approved:** preserve the actual canonical persisted source and approved current value byte-for-byte through validated read-only context projection; do not rewrite that source as fresh-session evidence, invent edit history/counsellor identity/time, or describe its retained original quote as proof the edited value was spoken. A persisted edited value is still approval-authoritative for already-known suppression even though its missing edit provenance is a separate defect. Tests may drive the actual existing edit->write->fresh-session path and prove approved current-value propagation/suppression; label original-source retention honestly and retain the B2 gap. They cannot claim counsellor-edit/editedFrom preservation until a separate canonical implementation actually exists. Unknown unsupported provenance must not be silently stripped and treated as valid context; fail closed rather than use an adjacent projection-only union to bypass canonical validation. No new counsellor-edit union in scribe schemas, source metadata shim or blanket additional canonical/API edit targets is authorized by this clarification. A future B2 repair needs its own concrete existing-file plan across canonical schema, authenticated approval/write and actual API/webhook outcomes; it does not require inventing a new human gate for routine authorized work.

**Maker's exact scoped-fixture amendment:** migrate only graph/harness callers and corresponding raw seeding/identity assertions in existing engine/tests/crisis-escalation.test.ts, scribe-concern.test.ts, scribe-erasure-fence.test.ts and scribe-tracing.test.ts to explicitly supplied trusted test tenant via makeHarness({tenantId}) or existing tenantScopedDb. These four additional existing test targets are independently APPROVED. Source evidence: tracing:37, concern:72 onward and erasure-fence:61 onward call the previously unscoped makeHarness; crisis-escalation:360/:409 builds the graph directly, while its :402 negative unscoped construction must stay a rejection test. Existing previously approved scribe-rules-e2e:62-92 and scribe-checkpointer:79-94 also build graphs from raw fake db/client and require correct scoped setup. Existing scribe-fixtures.ts makeHarness:122 gains an explicit tenantId option; callers that expect valid graph execution pass it deliberately. Seed raw collections with the actual stored tenantId and actual tenant-prefixed internal IDs where the existing tenant wrapper requires them; inspect raw outcomes with those actual identities. Existing tenantScopedDb at db/tenant.ts:345 and tenantIdOf:73 are the authority, not fixture input presented as public history.

**Safety and assertion limits:** graph verifies its private db tenant binding before every history query, including the empty-profile case. No unscoped product history exception, monkey-patched raw-ID masking/read adapter, automatic tenant inferred from student ID, or malformed-history-as-empty fallback is permitted. A negative unscoped test remains negative. Fixture migration may update actual stored ID expectations and tenant-qualified collection accesses, but cannot delete assertions, relax thresholds, hide raw residue, weaken B9/B16/B15 behavior or reinterpret a provider leak as passing. Preserve checkpoint client scoping as well as graph db scoping so replay is tested in the same tenant. These migrations occur only in the isolated B18 candidate; T-035's frozen main source remains untouched until its independent check finishes. Independently rerun all affected safety/concern/fencing/tracing suites alongside the prior required suites when the mutex is released.

The original APPROVE remains in force with this explicit correction: B18 current canonical context/provenance preservation is authorized, canonical B2 edit-provenance completion is not claimed. This is implementation-plan authority only; durable do-not-ask policy and all full-goal obligations remain unchanged.

### Independent B18 evaluation-runner amendment — 2026-09-30

Maker proposal: migrate only existing packages/engine/evals/score.ts seedConsent (line 26) and scoreSession (line 135) to a fixed explicit synthetic evaluation tenant. Import tenantScopedDb, retain raw fake DB for index declaration and raw consent seeding, stamp the actual tenantId and tenant-prefixed consent _id, and pass the scoped DB to graph compilation and concern reads. No gold data, scoring formulas, thresholds, provider selection, crisis checks, or product unscoped exception changes.

Independent quality agent /root/b18_quality_gate reviewed the actual source and approved plan and returned APPROVE this exact amendment. Required acceptance: existing evaluation suites and unchanged case counts/metrics, missing/wrong-tenant consent negative controls, and independently reached mutation failures when graph scope or seed tenancy is removed. No raw-ID masking adapter. This is plan authority only, not test completion or product PASS. The separate B2 canonical provenance proposal remains unapproved.

### B2 canonical edit-provenance recovery proposal — 2026-09-30

Status: PROPOSED, requires fresh independent quality approval before implementation. Existing authority: D-021 and answered B2 edit-provenance gate; ISS-051 and ISS-t-027-rev-2 remain open. No contract/architecture relaxation, legacy-record rewriting, production writes, or new source/test files proposed. Implementation must wait for the overlapping B18 candidate to freeze and coordinate isolation.

Exact existing targets: packages/schemas/src/schemas.ts FactSourceSchema:25 adds canonical counsellor-edit with authenticated counsellorId, ISO editedAt, original-citation editedFrom, preserving legacy variants and a bounded original citation across repeated edits. packages/engine/src/scribe/nodes.ts perFactDecision:1254 and decisionFromResponse:1302 compare approved changes against actual proposals; changed values use server-created provenance, unchanged approvals retain exact source, caller replacement citations/identity are refused. packages/engine/src/scribe/graph.ts ScribeRunOptions:279, runnableConfig:357, approval node:152, claim/resume:808 and recoverUnder:900 carry private trusted actor metadata; winning claim captures edit time once and recovery reuses its actor/time, never the recovery caller. Missing trusted metadata on an edit refuses before claim/write; ordinary unchanged approvals remain compatible. packages/db/src/collections.ts ScribeResolutionDoc:166 stores winning approval metadata with existing tenant/erasure/lease handling. apps/api/src/server.ts scribeOpts:269 and decideApproval:327 supply verified JWT counsellor identity, never body identity; actual stored-fact readback/event forwarding:341-357 remains authoritative. packages/db/src/facts.ts sourceEdgeRef:348 and applyApprovedDiff:384 handle the canonical variant, preserve original citation linkage without treating edited value as spoken, and retain validation, content identity, consent, purpose, scope, conflict and fence compensation. packages/engine/src/webhooks/schemas.ts WebhookFactSourceSchema:30 and buildFactApprovedEvent:134 use shared canonical schema and forward actual persisted provenance unchanged.

Guardrails: trusted provenance stays outside public ApprovalResponseSchema. Extraction remains transcript-evidence-only; canonical schema expansion must not allow model-manufactured counsellor edits. Existing legacy facts cannot acquire invented actors/timestamps/history. Their contradictory-source defect remains identified until separately authorized remediation. UI rendering targets require their own concrete approval if necessary to satisfy the saved-value display requirement; API/event proof alone must not claim UI completion.

Existing tests only: packages/schemas/tests/fact-source.test.ts and fact.test.ts; engine/tests/scribe-per-fact.test.ts, scribe.test.ts, scribe-persistence.test.ts, scribe-checkpointer.test.ts, webhooks-envelope.test.ts and b18-suppression-outcome.test.ts; db/tests/facts.test.ts; apps/api/tests/server.test.ts. Before edits confirm all named files exist and approve any necessary existing-target correction.

Independent acceptance: transcript September 2027 edited by verified counsellor to January 2028 reaches actual storage/API/event as January with counsellor-edit and exact original September citation in editedFrom; unchanged approvals preserve source byte-for-byte and rejection writes nothing. Forged body actor/time/source cannot override JWT/proposal. Competing counsellors, checkpoint replay and crash-after-claim recovery preserve winner actor/time without duplicate writes. Repeated edits retain original citation with latest actual actor/time. Wrong tenant, no consent, fence transitions and conflicts retain refusal/compensation. New canonical edited history remains authoritative in B18 without using editedFrom as evidence for the current value. Independently reached mutants retaining old source, trusting body identity, regenerating replay timestamps or rebuilding webhook provenance must fail matching outcome assertions. Run appropriate affected suites and full typecheck under the shared test mutex; retain every broader failure and skip. Offline local JWT/fake DB tests do not establish live Pathlynks integration.

This proposal was prepared from read-only engineering analysis, not independently approved by its author. No implementation or completion verdict is claimed.

### Independent B2 recovery quality decision — 2026-09-30

PLAN DECISION: APPROVE WITH MANDATORY BOUNDED CONDITIONS, reviewed independently by /root/b18_red_test_review against actual B2/D-021, source paths and existing test inventory. Implementation waits until the overlapping B18 candidate freezes. This approval is not completion or issue closure.

Both per-fact and whole-batch edit paths must structurally compare against the actual proposal, rejecting unknown/duplicate keys and replacement citations/actor/time. Trusted server actor/time is atomically persisted in the winning resolution claim and reused unchanged for replay/recovery; missing trusted metadata on a changed value refuses before claim/write. Repeated edits retain bounded original-citation editedFrom with latest actual approver/time. Do not inherit misleading needsReview:false/citation-match claims that the edited value was spoken; retain B2's closed auto-verification meaning. Preserve verifyCandidateFact's transcript-only guard (nodes.ts:1019), with an outcome test proving model-authored counsellor-edit cannot become an extracted fact. Keep tenant, consent/purpose, conflict, lease deadlines and fence compensation; claim metadata remains covered by student erasure. Actual persisted canonical source must be used in API readback/events, replacing the webhook-only schema superset.

All proposed existing test files were independently confirmed present. Replay/competition/forgery/fence mutants must reach intended outcome assertions; affected suites and typecheck remain required. Saved-value UI display and live Pathlynks integration are separately unverified obligations; API/event checks cannot certify either. No source edits or tests were performed by this plan reviewer. Existing ISS-051 and ISS-t-027-rev-2 remain open.

### T035 API / no-consent crisis recovery proposal — 2026-09-30

Status: PROPOSED, requires fresh independent quality approval before implementation; overlap with T045 graph waits for its freeze. Existing authority D027 plus B4/B9/B16, with B15/B21 privacy/fencing and checked lifecycle c971eb9 preserved. Actual transport delivery remains separately incomplete; record_only is never called delivered.

Exact existing targets: apps/api/src/index.ts StartApiHttpOptions:47/startApi:128 inject tenant-specific escalation dependency/resolver factory, validate configuration before connection, reuse existing classifier/provider config and skill loader, and handle alerts without raw text. apps/api/src/server.ts TenantWiringDeps:830/createTenantWiring:855 passes same verified tenant-scoped escalation dependencies into compileScribeGraph:872; body recipients/tenant assertions have no authority. Missing trusted recipient directory produces explicit existing unrouted records/alerts rather than invented addresses. engine/src/scribe/graph.ts startScribe:511/escalateSessionFlags:626 checks authoritative consent before any session/transcript/concern/checkpoint work; absent consent runs deterministic crisis detection only, ordinary/concern input refuses without writes, crisis uses guard-only escalation and typed outcome without raw-turn checkpoint. engine/src/guards/escalation.ts EscalationDeps:121/escalateTurns:298/notifyAll:245 adds internal authoritative-consent-selected guard-only path for every crisis turn through existing fenced writers, with no sampling, reviews, classifier, or rationale. runReview:386 rechecks authoritative consent and fence before classifier disclosure/annotations while preserving guard visibility, cancellation and floors. apps/api/src/openapi.ts existing scribe operation:83 documents actual refusal/escalated outcomes and record-only status accurately. Lines refer to current root baseline; reconcile after T045 freeze.

Existing tests only: apps/api/tests/index.test.ts/server.test.ts; engine/tests/crisis-escalation.test.ts, scribe.test.ts, scribe-persistence.test.ts, scribe-concern.test.ts, scribe-erasure-fence.test.ts; existing DB erasure tests. Required actual signed-JWT HTTP-to-raw-record proof, missing/tampered JWT zero reads/writes, same IDs across tenants, private recipient factory authority; no-consent crisis IDs+structured flag/status/timestamps only, ZERO classifier/extraction/summary/KB/profile/diff/concern/transcript/checkpoint work, multiple crisis turns/retry idempotence, non-crisis refusal. Preserve fence transitions/ambiguous-write ownership/CAS compensation and no-session-anchor export/erasure. Consented concern and immediate crisis remain intact, delayed classifier cannot hide/downgrade guard. Independent mutants restoring pre-consent persistence, guard-only classification, missing tenant factory wiring or removed compensation must reach matching assertions. No new collection, email module, contract relaxation or production writes.

Missing external integration facts: trusted tenant admin directory and concerned counsellor/session assignment lookup; actual transport owner/destination/auth/ack semantics; durable drain/retry/dead-letter monitoring owner. JWT actor alone does not establish all concerned counsellors. Existing erasure-approval email_outbox has no sender and cannot prove crisis delivery. Offline injection/record tests are useful implementation proof, not B16 delivery or pilot-readiness evidence. These missing facts do not block the authorized no-consent/privacy/API wiring repair.

### Independent B18 raw schema-error amendment — 2026-09-30

Maker proposal: existing providers/src/index.ts ModelOutputSchemaError constructor/parseModelOutput and FailoverProvider.generate schema-error exhaustion branch must stop exposing model-derived raw Zod issues/messages through verifier failures and logging. Existing providers/tests/index.test.ts and engine/tests/b18-suppression-outcome.test.ts provide malicious-invalid-verifier outcome controls. No new files or unrelated functions.

Independent /root/b18_red_test_review inspected constructor:272, parseModelOutput:285 and failover callback:870-871 and returned APPROVE. Mandatory conditions: expose a fixed synthetic schema-failure issue with no original messages, paths, unknown keys, enum values, nested issues, input or cause; sanitizing message alone is insufficient. Preserve instanceof ZodError and ModelOutputSchemaError, strict validation, schema retry eligibility, attempt order/count, deadlines/cancellation and nonretryable unrelated internal Zod errors. For schema errors only, the exhausted callback receives a fixed raw-free lastErrorMessage while callback count and AiUnavailableError remain unchanged. Actual invalid verifier output must be rejected and withheld; inspect message, String(error), serialization, issues and captured exhaustion callback/logs for hostile markers. Implementation waits for the current worker-owned test handle to become terminal. Prior graph-owned cancellation and source-order findings remain unresolved until separately verified; this approval is not completion PASS.

### Independent B18 snapshot-consistency amendment and review state — 2026-09-30

Maker proposal: existing graph.ts extraction/summary private preflight closures compare freshly validated server-loaded history to the exact payload snapshot before every leaf execution. Independent /root/b18_red_test_review inspected graph.ts:127/:134 and returned APPROVE. Durable IDs and structural content comparison ignores fact/object-key ordering but preserves meaningful value-array order; include key/value/source/purpose/sensitivity, binding and every projected payload field. Any addition/removal/change, including empty history becoming populated, throws typed raw-free nonretryable authorization refusal before execution. No silently replaced context, regeneration loop, DB writes, new fields/files or public authority. Existing cancellation/deadline accounting encloses the read/comparison and must prevent late execution. Existing B18 test controls add/retire/change between writer and verifier -> zero verifier execution/no released summary, while order-only changes permit valid verification. Fresh invocation may reload; no atomicity claim after the final check.

Observed maker progress: initial regression RED session77163 terminal1, 20/20 reached intended assertion failures; first targeted GREEN session35693 terminal0, 20/20 pass, 330949ms. These are maker outcomes, not independent completion PASS. Independent SSE and AI source reviews both found missing graph-run AbortSignal propagation through extraction/generation/verification, requiring graph-owned held-preflight late-release regression controls and repair in already approved graph/nodes/provider-request targets. SSE also found source comparison incorrectly depends on JSON object-key order; valid reordered source must remain usable and unknown provenance must fail closed. All findings and remaining semantic/authority/readback/mutation acceptance remain unresolved until independently verified. Real model recall, durable do-not-ask, destination relevance, live cards and full B18 are not certified.

### Independent B18 final-release authorization refinement — 2026-09-30

Maker refinement: initially empty history skips semantic verification, so before-leaf checks alone miss history populated while summary generation is in flight. Independent /root/b18_red_test_review returned APPROVE exact existing graph.ts extraction/summary authorization closures and nodes.ts ScribeDeps/summarizeSession for a separate release gate. After generation, including empty snapshots, and immediately before returning a candidate (after verification if used), recheck authoritative consent/fence/binding and structurally compare the exact payload snapshot. Same invocation signal/deadline encloses the read; check cancellation after late completion. Lost authorization or changed/added/removed history propagates typed raw-free nonretryable refusal, order-only differences remain valid. Do not double-invoke leaf preflight, add provider calls/retries/budgets/writes or silently replace context. Existing B18 controls must prove empty->populated during generation, consent revocation after provider return and abort during release read prevent any released summary. No completion PASS.

Maker regression evidence: session67082 terminal1, three tests all reached intended assertions (no import/compile error): graph-owned abort still produced one provider execution; valid reordered source refused; typed provider schema error exposed malicious raw marker. Approved repairs proceed within recorded targets; independent rerun remains required.

### T035 privacy-outcome proposal amendment — 2026-09-30

Status: PROPOSED for independent re-review; the prior quality WARNING must be resolved before implementation. Add exact existing packages/engine/src/scribe/schemas.ts ScribeEscalationSchema:60/ScribeResultSchema:308 and graph.ts ScribeOutcome:315 to the preceding API/no-consent proposal. Preserve the legacy consented escalation representation. For no-consent only, define a strict distinguishable guard_only outcome with status escalated, identifiers (student/session plus every unique crisis turn), fixed literal crisis/guard_crisis flags, operation timestamps and explicit record_only status. No message/matched strings, transcript, quotations or rationale; return all crisis turns rather than the existing single turn. The validated type, not caller assertion, determines this minimal branch. Reconcile API result validation/OpenAPI/tests against that actual shape. Persisted no-consent notifications retain only identity/structured crisis fields and lifecycle metadata; matched must be empty and reason/severity fixed structured enums, with no review documents/classifier/concern rows. Validate uniqueness/representation rather than silently losing turns. No consented schema downgrade or delivery claim.

Authoritative consent must precede ensureScribeSessionRow, transcript/concern writes, graph invocation, checkpoints AND tracing. Guard-only must bypass all sampling/review creation/classifier scheduling. Consent/fence authorization belongs before EVERY actual classifier retry/failover disclosure and before annotation publication, under original cancellation deadlines, not only function entry. Preserve all four existing writer pre/post fencing, ownership/CAS and late compensation. Correct the stale graph.ts:621 compensation-exemption comment. Required signed-JWT startup-to-raw-record outcomes, multi-turn privacy, zero forbidden processing/persistence, tenant A/B no-session-anchor scans, revocation/erasure races and reached mutants remain unchanged. Implementation still waits for overlapping T045 freeze and independent amended-plan approval.

### Independent amended T035 API/privacy plan decision — 2026-09-30

PLAN DECISION: APPROVE WITH MANDATORY CONDITIONS by /root/t035_checker_final for06e247f plusb670c12, resolving the prior privacy/missing-target warning. Implementation waits for T045 graph freeze and reconciles actual signatures/authorization hooks. This is plan approval only, not artifact PASS or delivery completion.

Preserve the existing ScribeResultSchema outer status discriminator: do not create competing escalated members. Distinguish strict guard_only inside the escalated representation or existing ScribeOutcome envelope. Runtime-validate the minimal outcome before the existing API route serializes it; types alone cannot exclude raw fields. Existing server.ts scribe route/result handling and openapi.ts ScribeOutcome component (not only operation prose) are explicit targets. Existing schemas.ts input validation must reject duplicate turn IDs; the minimal nonempty unique crisis-turn list must exactly match deterministic detection over all valid input turns, surviving replay without omissions or duplicates. Existing consented compatibility remains intact.

Retain all recorded consent-before-persistence/tracing, guard-only zero reviews/sampling/classifier, fixed identifier/flag-only payload, every classifier retry/failover/release authorization and all four ownership-qualified fenced writer constraints. Missing trusted recipients remain visibly unrouted. Actual signed-JWT startup-to-raw-record, two-tenant/no-anchor privacy scans, revocation/erasure races and reached mutants are required before independent verification. No tests or edits were performed by the reviewer. Record-only evidence cannot certify actual recipient delivery or pilot readiness.

### Independent B18 new-approval interrupt release approval — 2026-09-30

PLAN DECISION: APPROVE by /root/b18_red_test_review for existing graph.ts buildScribeGraph approval callback. Extend its runtime parameter with the current signal; immediately before interrupt(request), invoke the existing private snapshot authority under the current cancellation/deadline, checking consent/fence/binding and exact structural history including empty context. Reauthorize every callback execution/resume/replay; closures/signals and granted booleans must not become checkpoint capabilities. Read failure, cancellation or changed authority refuses typed/raw-free/nonretryably with no approval payload. Preserve claims/conflict/writes/fencing and all provider budgets; no additional provider calls/retries/writes/files. Existing B18 controls require post-diff revocation/fencing/history change/read cancellation to prevent new interrupt, unchanged/order-only positives. This approval does not certify readOutcome/inspectScribe saved-interrupt retrieval; those extra functions require the pending concrete deadline-lifecycle review.

Actual maker consolidated session96457 terminal0:40tests/40pass/0fail/0cancelled/0skip,266849ms; includes20initial,3review-regressions,4snapshot and13semantic/authority/changed-object/rawretirement/replay/revocation controls. This is not independent artifact PASS, full-unit completion, full-repository green or live semantic accuracy. Remaining acceptance and affected suites/typecheck/mutation evidence stay required.

### B18 saved-outcome deadline-lifecycle proposal refinement — 2026-09-30

Status PROPOSED, requires independent approval. Current invokeFenceAware:462 disposes WriterDeadline:493 before outcome retrieval; startScribe owns deadline:529/finally574 but readOutcome:576 occurs after disposal; resumeScribe:810 owns its deadline/finally814, with recovery/lease paths inside. Extend the existing invokeFenceAware, startScribe, resumeScribe/resumeInternal, recoverUnder, readOutcome, inspectScribe and compileScribeGraph private binding targets: remove premature inner disposal without changing compensation/error logic; move start outcome read inside its existing try/finally; pass the same active invocation deadline through every resume/recovery outcome read and keep caller-only final disposal. Bound checkpoint and private authority reads under that remaining signal/time, never a disposed signal.

Inspection genuinely needs a new bounded read operation using existing WriterDeadline and its canonical maximum (optional shorter caller budget/cancellation, no extended maximum); explicitly own/dispose it in inspectScribe finally and bound checkpoint/claim/consent/history together. Do not call this a previously existing inspection budget. Reuse/relocate the existing private snapshot authorization rather than duplicate it or accept public history. Pending approvals require current authority and exact snapshot consistency; approved completed results check current consent/fence/binding without rejecting their own legitimate new profile writes. Preserve minimal refused/D027 outcomes. Additional read budgets do not alter provider attempt budgets or add provider calls/retries/writes. Existing B18/checkpoint/persistence/API tests must reach late-held-read cancellation/timeouts, pending stored-output refusal, replay and successful own-write positive outcomes. No implementation of this refinement until approval.
