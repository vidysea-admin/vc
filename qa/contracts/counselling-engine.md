# Contract: Vidysea AI Counselling Engine
**Status:** DRAFT, awaiting Umesh's START approval (qa/gates/maker-start.md)
**Owner of this file:** /checker. The maker reads it and never edits it; feedback goes to qa/feedback-inbox.md.
**North star:** Explore → Conclude → Execute. AI assists, the human decides. Never a script.
**Sources:** goal.md · compass research report (repo root) · Google Doc "Virtual Counsellor" · DECISIONS D-001..D-005

## A. Plan document (T-001): `docs/plan.md`
Checked by /outcome-grader against `qa/rubrics/plan-doc.md`.
- **A1:** Contains the 7 sections in goal.md order (Why · Big picture · Phase 1 steps · Phase 2 steps · Tech map ·
  Milestones & metrics · Risks & FAQ). An audience guide says CEO = §1, 2, 7 · team = §2–6 · AI tool = §3, 4, 5.
- **A2:** Diagrams 1–3 are valid Mermaid. Each diagram:
  - answers one question
  - has ≤12 boxes
  - flows in one direction
  - uses 3 classDefs (human green, AI blue, data grey)
  - puts what happens on line 1 of each box and [technology] on line 2
  - uses numbered steps that match the section numbers
- **A3:** The tech map covers every step in goal.md's table and adds the 4 architecture layers from D-002..D-005:
  - workflow graph = LangGraph.js
  - agents = typed nodes
  - skills = SKILL.md
  - tools = MCP
  - plus the knowledge graph (Mongo), observability (Langfuse self-hosted) and the rule split (hard = code guards,
    soft = skills)
  Every row has "why".
- **A4:** Every module has one line: input → output (JSON shape).
- **A5:** Milestones reproduce the P1/P2/P3 exit gates exactly as in the compass (≥40% card use · 0 uncited facts /
  50 sessions · ≥4/5 · ≥80% light-edit notes; ≥90% field accuracy · 0 unintended submits; red-team + ≥100 shadow
  sessions).
- **A6:** The FAQ answers every cross-question in goal.md §7. The stop rule (login / 2FA / CAPTCHA / payment /
  declaration) appears under Diagram 3.
- **A7:** Every number or factual claim traces to the compass, goal.md or the Google Doc. No new, unsourced figures.
- **A8:** It names which sibling repo supplies which reused piece (D-001), with no claim that anything in D:/vc is
  already built.
- **A9:** The document content is in English.

## B. Engine (T-002+). Criteria each code unit must hold
- **B1 (no-script):** No card, prompt or skill output may be a full sentence for the counsellor to recite. Cards are
  question / comparison / evidence types only. A code guard enforces this and a test covers it.
- **B2 (cited facts):** Every fact shown or stored carries a source (KB record id + fetchedAt, profile fact id, or
  transcript quote + turn). Uncited facts are dropped or labelled `unverified`. A test proves an uncited card is
  dropped.
- **B3 (human approves writes):** A profile change reaches the student graph only after the counsellor approves it,
  through LangGraph `interrupt`. A test proves no write happens before approval.
- **B4 (consent first):** Every fact carries purposeTags + sensitivity. A session without a recorded consent row cannot
  be processed. A test covers it.
- **B5 (typed boundaries):** Every graph node's input and output is a Zod schema. No free text passes between nodes.
- **B6 (portable core):** Prompts and soft rules live in `skills/*/SKILL.md`. Hard rules live in code guards that run
  before any LLM call. Tools are MCP servers. The model is chosen by config.
- **B7 (tracing, no egress):** Graph runs emit Langfuse traces to a self-hosted endpoint only, with
  `TELEMETRY_ENABLED=false`. **Emit must be proven, not assumed:** a test captures at least one exported span through
  the real export path, using an in-process exporter or collector. A test that only constructs a handler or client does
  not count (ISS-017). Host guards are tested against hostile variants: trailing dot, mixed case, explicit port,
  userinfo, IDN/punycode (ISS-016).
- **B8 (data boundary):** Production Mongo writes only inside `virtual_counsellor` (B12). Nothing else on the
  production server is ever written. No real student data in the tree. Tests run offline with mock providers.
- **B9 (crisis):** A distress or self-harm signal routes to an escalation card before any generative call.
- **B10 (draft-only, P2):** The application filler never triggers submit, and it stops at login, 2FA, CAPTCHA, payment
  or the declaration.
- **B11 (secrets):** Keys are read only from `.env`, which git ignores. A tracked `.env.example` lists every key name
  and holds no values. No key value appears in the tree, git history, logs, traces, manifests or verdicts. The checker
  greps history for each key value on any unit that touches config.
- **B12 (single DB on the production server):** `MONGODB_URL` is the production server. The engine's only database
  there is `virtual_counsellor` (answer in `qa/gates/mongo-host.md`). Code never takes the database name from the
  URI default. One shared DB helper names `virtual_counsellor` explicitly and refuses any other database name. Tests
  prove that the helper rejects another name and that no module calls `client.db(` outside the helper. The engine
  never reads, writes, drops or indexes any other database on that server, including Pathlynks and
  `global_university_db`. Using another database needs a new gate. **Inside `virtual_counsellor` the engine has full
  CRUD**: insert, find, update, delete (including bulk), and creating or dropping its own collections and indexes.
  Only `dropDatabase` on `virtual_counsellor` needs a gate. Automated tests never connect to it (B8: offline, mocks or
  in-memory). Live CRUD runs through the app or an explicit script.
- **B13 (no student data to external models):** Only synthetic or anonymised text reaches Gemini or any other external
  API. Using real transcripts, even the ikigai fixtures, needs Umesh's per-use approval recorded in `qa/gates/`, and
  the approval names the files. Automated tests run offline with mock providers (B8); live-provider runs use synthetic
  fixtures only. **Approval on record** (`qa/gates/real-transcripts-gemini.md`): anonymise first by default. Raw
  `D:/ikigai_counsellor/transcripts/` files may go to Gemini as a fallback, with the files listed in the manifest.
  Raw transcripts are never committed.

- **B14 (outcome, not construction):** Every integration unit (tracing, Mongo, model provider, MCP, STT) proves its
  claimed effect end to end against a real or in-process fake: data written and read back, a span exported, a request
  refused. It must not stop at "the client was built" or "the config parsed". Any allow-list or deny-list guard has a
  hostile-variant test.
- **B15 (DPDP erasure: hard delete, confirmed, verified):** An erasure request hard-deletes every document for that
  student across all engine collections: facts, edges, sessions, decisions, consents, cards/feedback, audit payloads.
  It only runs after an explicit confirmation step recorded in the audit log (requester, confirmer, time). An
  unconfirmed call deletes nothing, and a test proves it. After the purge, a verification pass reads back every
  collection and proves zero documents remain for that student. It writes a receipt of counts and time only, with no
  personal data. Export is a per-student JSON bundle. Tests cover confirm-required, full purge (read-back = 0) and a
  partial-failure path that is reported, not silently swallowed (`qa/gates/dpdp-erase-design.md`).
- **B16 (crisis escalation):** The keyword guard runs first, before any generative call (B9). An async Flash-Lite
  concern classifier, which never blocks the live turn, runs on concern-level turns plus a stratified sample of "none"
  turns. An escalation notifies **the admin and the concerned counsellor(s)** at the same moment. Crisis recall is
  measured on an offline golden set (indirect Hinglish, Devanagari, abuse, benign idioms) before any real-student
  pilot (`qa/gates/crisis-safety-layers.md`; the response-time SLA is not yet set).

## Non-goals (this contract)
- The avatar (P3) and the student-facing voice surface.
- Production deploy.
- Joining real Pathlynks data (gated on the DPDP legal review, Q3).

## Amendment log
- 2026-09-25 · routine (tighten) · added B11 secrets, B12 explicit work-DB name + host gate, B13 no student data to
  external models · the keys and `MONGODB_URL` landed in `.env`, and the contract had no invariant covering them. The
  URI points to a remote host with no DB name and no credentials (ISS-012).
- 2026-09-25 · **critical (human-approved)** · B12 rewritten: the host is the production server, and the engine gets
  one database there, `virtual_counsellor`, with a refuse-any-other-name guard, no drops or bulk deletes without a gate,
  and tests kept offline. Replaces "`vc_work_<slug>` on local/dev only" · approved by the user's answer recorded in
  `qa/gates/mongo-host.md`.
- 2026-09-25 · **critical (human-approved)** · B12: removed the gate on bulk deletes and collection drops. The engine
  now has full CRUD inside `virtual_counsellor`, and only `dropDatabase` stays gated · the user said "it will be proper
  crud thing". The global CLAUDE.md and the AIOS lifecycle.md hard-boundary lines record the same exception.
- 2026-09-25 · routine (tighten) · B7 now requires a captured exported span and hostile-variant host tests; new B14,
  "outcome, not construction", for every integration unit · the t-004 cycle-0 checker PASSed a unit whose tracing was
  a silent no-op (ISS-017) and whose cloud block had a trailing-dot bypass (ISS-016), because the tests only asserted
  construction.
- 2026-09-25 · routine (consistency + tighten, from Umesh's gate answers) · B8 aligned with B12 (it said "no production
  writes", which contradicted the approved `virtual_counsellor` CRUD); B13 records the transcripts approval (anonymise
  by default, raw allowed as a fallback); new B15 DPDP hard delete with confirm and read-back verification; new B16
  crisis escalation to admin plus the concerned counsellors · answers in qa/gates/{dpdp-erase-design, crisis-safety-layers,
  real-transcripts-gemini}.md.
