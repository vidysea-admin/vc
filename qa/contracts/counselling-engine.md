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
  `TELEMETRY_ENABLED=false`.
- **B8 (data boundary):** No production Mongo writes. No real student data in the tree. Tests run offline with mock
  providers.
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
  `global_university_db`. Using another database needs a new gate. Automated tests never connect to it (B8: offline,
  mocks or in-memory). Only an explicit live-run script writes to it. Collection drops and bulk deletes need a gate.
- **B13 (no student data to external models):** Only synthetic or anonymised text reaches Gemini or any other external
  API. Using real transcripts, even the ikigai fixtures, needs Umesh's per-use approval recorded in `qa/gates/`, and
  the approval names the files. Automated tests run offline with mock providers (B8); live-provider runs use synthetic
  fixtures only.

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
