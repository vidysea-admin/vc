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
  transcript quote + turn). **Citation scope (D-020, gate `citation-guarantee-scope`):** the full session transcript
  is persisted as ground truth (covered by DPDP erasure and export, B15). Only two kinds auto-verify at full
  confidence: typed numbers, and values matching a fixed country/alias vocabulary, matched as whole words. Every
  other text fact, and a new `reasoning` fact kind (a citable inference, not a literal quote), is **kept — never
  dropped** — cited to its span in the persisted transcript, and marked `needs-review` for the counsellor's approval
  (B3). Nothing is silently discarded; a test proves a non-auto-verified fact is marked `needs-review` rather than
  dropped, and that a number/vocabulary match is accepted without review.
  **Auto-verify property (D-026, gate `auto-verify-property`, answered 2026-09-26):** `needsReview:false` means
  exactly this: **the student** (the cited turn's speaker is the student) **said this value, for this key** (the
  matched template is one bound to this fact's key), **in their own words** (matched against the original-language
  text, not only `translatedText`), **in this one turn**. Context in other turns (an earlier hypothetical, a later
  retraction) is out of scope for auto-verify, since B3 still puts every fact in front of the counsellor. A case that
  breaks one of the four clauses is an auto-verify leak: severity **high** at most (never critical) and it Blocks the
  unit; a case that satisfies all four is not a leak, whatever other turns say. Tests prove each clause with a hostile
  row (wrong speaker, wrong key, translation-only match, and a quote that is not a whole single-turn clause).
  **Fail-safe + scope clarifications (folds T-013's implemented fail-safe and T-036 blind-oracle Q3/Q4/Q6/Q7/Q8,
  checker Mode B sweep 2026-09-27):** the auto-verify path additionally fails safe to needs-review, regardless of an
  exact digit match, whenever the cited turn carries: a negation before the value; a unit multiplier (lakh/crore/
  thousand/k) or a currency word adjacent to the number (the engine assumes INR for a bare number, which was itself
  unstated elsewhere and is recorded here); a value produced by unit conversion rather than one the student typed
  verbatim (e.g. "20 lakh" stored as 2000000 — the student did not say "2000000", so D-026's own-words clause keeps
  it needs-review even where the converted figure happens to match elsewhere); a hedge ("shayad", "not sure"), an
  in-turn negation, third-party attribution ("my father wants...", the value belongs to someone other than the
  student's own assertion), a within-turn conditional, or a same-turn compound/corrected value ("pehle Canada, but
  ab Germany"). None of this narrows or answers B2's open SUFFICIENT-vs-necessary question (gate `auto-verify-surface`,
  still open, unaffected) — it documents behaviour already safety-correct and unanimous between the blind oracle and
  the engine, so it is written down rather than left as an unstated reason several agreeing test rows depended on.
  The fixed country/alias vocabulary and the auto-verify template grammar are Latin-script only today; Devanagari-
  script aliases and Hindi/Hinglish spelled-out numbers (e.g. "बीस लाख") do not match and correctly stay needs-review
  — widening either is a future amendment, not a defect (the vocabulary's exact country list stays a separate, held
  question, gate `auto-verify-surface`). The keys D-026's "for this key" clause binds today are: `targetCountry`,
  `budget_inr_per_year` / `budget_inr_total` (bound per-year vs total from the clause's own wording), `ielts_overall`,
  `class10_percentage`, `class12_percentage`, `toefl_total`, `pte_overall`, `gre_total`, `gmat_total`, `sat_total`,
  `duolingo_score`.
  **Auto-verify surface: NECESSARY *and* the closed template grammar (gate `auto-verify-surface`,
  answered by Umesh 2026-09-27, option (c); written by the checker, which owns this file).** The gate asked
  whether the auto-verify list is necessary-only or also sufficient. The answer is **both**, and the grammar
  that decides sufficiency is stated here rather than left implicit. It was the absence of this paragraph
  that made 29 of 30 expected-auto-verify oracle rows unscoreable in either direction: 21 of them turned on
  a closed-template rule that existed in the code and nowhere in the contract, so neither the oracle nor a
  reviewer could say whether the engine was right. The grammar below is lifted from
  `packages/engine/src/scribe/nodes.ts` (T-030 / D-025, the frozen `AUTO_VERIFY_TEMPLATE_SOURCES`), not
  paraphrased; where the two ever disagree, **the code is the defect and this paragraph is the criterion.**
  - **NECESSARY.** A fact whose key is not in the bound-key list above can never auto-verify, whatever it
    matches. A value that is not a typed number or a fixed country/alias vocabulary hit can never
    auto-verify. This direction is unchanged and is the fail-safe one.
  - **SUFFICIENT, and the whole of it.** `needsReview:false` is set **only** when all five hold together:
    (1) the citation is a **single clause** of one turn, matched **anchored end to end** (`^...$`) — clauses
    are formed by NFC-normalising the turn, stripping invisible-format characters, and splitting at
    `! ? ？ ; : । ` newline, at `.` or `,` that is not inside a digit run, and at `because` / `kyunki` /
    `क्योंकि`; anything before or after the matched text in its own clause defeats the match, which is why a
    prefixed aside ("Honestly, Australia is the only country I'm seriously considering") does not
    auto-verify — it is a clause the grammar does not contain, not a bug;
    (2) the clause matches **one of the frozen templates**: 9 country templates (3 English, 3 Hinglish, 3
    Devanagari), plus the number templates — 7 budget templates and one instance of each of 9 score shapes
    per exam family;
    (3) that template **declares the fact's key** (`key-not-declared` otherwise): country templates declare
    only `targetCountry`; a budget template declares `budget_inr_per_year` **or** `budget_inr_total`
    according to the clause's own wording, and a clause mixing both ("my total budget is N per year")
    matches neither; each score template declares the one key of the exam its clause names, and the exam is
    named exactly once (an exam with no family — JEE, NEET, CAT, CUET, a board with no class — is
    `unrecognised-form`);
    (4) the value slot spells the stored value **exactly**: the slot is digits-only
    (`(?<n>\p{Nd}+(?:[.,]\p{Nd}+)*)`) and is pinned by string equality to `String(value)`, and for a
    country `{C}` expands to the aliases of that fact's canonical country only;
    (5) none of the fail-safe conditions in the paragraph above fires, and all four D-026 clauses hold.
  - **The slots are closed sets, not gaps.** The verb-to-destination slot of the first country template is a
    closed connector list (at most one connector: a fixed subject phrase, `abroad` / `further` /
    `further studies`, or optional `my/a/an` plus the closed degree set), not an open 0–4 word gap — the open
    gap was ISS-t-013r-rev-14, closed by T-030, and it had let a single-clause third-party attribution
    ("I want to study as landlord suggested in the UK") auto-verify. Modifier runs are bounded (`{0,3}`, not
    `*`). No template carries an open letter class or an unbounded repetition outside the digits-only value
    slot; `tests/scribe-auto-verify-property.test.ts` checks the accepted language against an independent
    spec and the audit test in `scribe-citation-rescope.test.ts` lints the sources.
  - **Everything else is `unrecognised-form`: kept, never dropped, `needsReview:true`.** A clause the grammar
    does not contain is not a failure of the student and not a lost fact — it goes to the counsellor (B3).
  - **What this does NOT do.** It does not widen the surface: the grammar is Latin-script-only for the
    vocabulary and spelled-out numbers exactly as recorded above, and this amendment adds no template,
    connector, alias or key. It does not settle the country vocabulary's exact membership, which stays a
    separate held question. Adding a template, a connector phrase, an alias or a key is a **future
    amendment with its own reason**, never a quiet code change — the whole point of writing the grammar down
    is that widening it now has to be argued for in this file first.
  **Edit provenance (gate `edit-provenance`, answered 2026-09-26):** a fact the counsellor edits on approval is
  stored with source `counsellor-edit` (counsellorId, time), and its original transcript quote is kept as
  `editedFrom`. The saved value is never shown with a quote that contradicts it. The same provenance goes out to
  the client (API response and the fact-approved event, B21), so both VC and the Pathlynks side hold it. A test proves
  an edited fact carries `counsellor-edit` + `editedFrom` and that an unedited fact keeps its transcript source.
- **B3 (human approves writes):** A profile change reaches the student graph only after the counsellor approves it,
  through LangGraph `interrupt`. A test proves no write happens before approval.
- **B4 (consent first):** Every fact carries purposeTags + sensitivity. A session without a recorded consent row cannot
  be processed. A test covers it. **Named exception (D-027, 2026-09-27):** a crisis turn (B9) escalates even without a
  recorded consent row; the escalation record carries identifiers and the flag only, never transcript text, and no
  other processing (facts, profile diff, KB) happens without consent. This is the only exception to consent-first.
- **B5 (typed boundaries):** Every graph node's input and output is a Zod schema. No free text passes between nodes.
- **B6 (portable core):** Prompts and soft rules live in `skills/*/SKILL.md`. Hard rules live in code guards that run
  before any LLM call. Tools are MCP servers. The model is chosen by config. **Provider independence (lead review, 2026-09-25):** no single AI vendor is load-bearing. At least two real providers sit behind the provider seam: Gemini, and LiteLLM gateway classes. A deterministic `rules` provider, which uses no model, lets the P1 flow scribe -> facts -> profile diff -> counsellor approval complete end to end, with its output clearly marked "AI unavailable". An e2e test passes with `VC_LLM_PROVIDER=rules`. **Runtime failover (D-020, gate `provider-fallback`):** independence extends from config-time to runtime. A
  provider failure mid-session fails over across a config-ordered chain of 3 models, within a total retry budget of
  about 10 attempts with backoff, and never auto-drops to the `rules` provider. If every model in the chain fails,
  the engine (a) raises a structured engineering alert (error log + Langfuse error trace) and (b) returns an
  apologetic error state to the user with a Retry action that preserves their input — no retype. A test proves the
  failover order, the retry budget, that `rules` is never substituted automatically, and the alert-plus-preserved-input
  path on all-fail.
- **B7 (tracing, no egress):** Graph runs emit Langfuse traces to a self-hosted endpoint only, with
  `TELEMETRY_ENABLED=false`. **Emit must be proven, not assumed:** a test captures at least one exported span through
  the real export path, using an in-process exporter or collector. A test that only constructs a handler or client does
  not count (ISS-017). Host guards are tested against hostile variants: trailing dot, mixed case, explicit port,
  userinfo, IDN/punycode (ISS-016).
- **B8 (data boundary):** Production Mongo writes only inside `virtual_counsellor` (B12). Nothing else on the
  production server is ever written. No real student data in the tree. Tests run offline with mock providers.
- **B9 (crisis):** A distress or self-harm signal routes to an escalation card before any generative call.
  **Recall-only guard (D-020, gate `crisis-guard-precision`):** the deterministic keyword guard matches for recall
  only. It may over-trigger — a false positive is the safe direction — but it must never suppress, filter or narrow
  a match in order to cut false alarms. Precision is a later layer's job (B16), never the guard's.
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
  partial-failure path that is reported, not silently swallowed (`qa/gates/dpdp-erase-design.md`). Fencing per D-015/D-016/D-017: a confirmed erasure fences the student's writes until completion plus the D-016 minimum fence hold. Any write that lands in the gap and survives the read-back is a **B15 violation, not an accepted residual** (ISS-t-017-rev-1 is open against this). The sweep that releases fences must not be able to crash its host process (ISS-t-017-rev-2).
  **Approver workflow (gate `erasure-fencing`, answered 2026-09-26):**
  - The requester confirms **twice** (two distinct recorded confirmations). A request with fewer purges nothing.
  - The request then goes to a configured approver (the admin or a concerned person) through an email **outbox**.
    In dev and tests the outbox is logged, never sent. Only that approver's recorded approval starts the purge.
  - `autoDelete` is a config flag that defaults to `false`. Only when an operator switches it on does a double-confirmed request purge without an approver.
  - The fence runs from the first confirmation until the purge completes, **plus 24 h**. Re-enrolment of the same person is allowed after that.
  - The audit pseudonym is an **HMAC** keyed by `VC_AUDIT_HMAC_KEY`, whose name only appears in `.env.example`. It replaces the salted sha256.
  - Tests prove: one confirmation purges nothing; two confirmations without approval purge nothing; approval purges + read-back = 0; `autoDelete=true` skips the approver; the HMAC is not recoverable from a candidate list without the key.
- **B16 (crisis escalation):** The keyword guard runs first, before any generative call (B9). An async Flash-Lite
  concern classifier, which never blocks the live turn, runs on concern-level turns plus a stratified sample of "none"
  turns. An escalation notifies **the admin and the concerned counsellor(s)** at the same moment. Crisis recall is
  measured on an offline golden set (indirect Hinglish, Devanagari, abuse, benign idioms) with a bar of **recall >= 0.95** before any real-student
  pilot (`qa/gates/crisis-safety-layers.md`; the response-time SLA is not yet set). **Downgrade, never hide (D-020, gate
  `crisis-guard-precision`):** this classifier, or any later layer, may re-mark a guard-flagged turn "reviewed, likely
  benign" for the counsellor's view. It may never hide, suppress or remove the underlying B9 flag itself — the
  counsellor always still sees it. Escalation severity rises through this same layer as a concern deepens (B20).

- **B17 (persona usability):** Every UI-touching unit, and every release, is judged by user personas, not only login roles. The declared personas (Umesh, 2026-09-26; the ids go into `qa/adapter.json` `personas`) are:
  - `sapna-expert`: Sapna ma'am, a top Indian counsellor (Mayo College, Ajmer). She is **the benchmark** (B22), not a walker who needs help.
  - `gaurav-pm`: Gaurav, IIT, a product manager with no counselling background.
  - `gaurav-bhaiya`: office staff, about 12th pass. He understands and speaks Hindi, but does not read English and cannot write. Every flow he walks must be finishable in **Hindi and by voice**, with no typing required.
  - `jaipur-counsellor`: a tier-2-city counsellor with 1-2 years' experience.
  - `school-counsellor`: a school counsellor.
  - `govt-teacher`: a government-school teacher opening a laptop for the first time, Hindi-first (the Haryana 160-school pilot).
  - `uk-counsellor`: GDPR, the UCAS flow, UKVI rules.
  - `us-counselor`: FERPA student-record privacy, the NACAC ethics code.
  - `au-agent`: ESOS, the PIER agent code, commission disclosure.
  - `ca-consultant`: Canada, where only licensed consultants may give visa advice, so VC must never give visa advice there (with B1 and B18).

  The international personas judge **policy compliance**: what VC shows or suggests must not breach that market's rule. The checker's browser run (Mode D / Mode C) walks each changed flow as each persona and records per-screen findings. A flow the persona cannot finish unaided is a finding, not a pass. A `high` persona finding blocks PASS the same way a failed criterion does.

- **B18 (context relevance):** The engine does not show or ask about what doesn't apply to this student, or what is already known.
  - A topic the student's own facts make irrelevant is suppressed in scribe output, the summary and (from T-010) live cards. For example, a student whose only destination is India gets no visa facts, questions or cards.
  - An approved fact is never asked again as if it were unknown.
  - Nothing on the student's do-not-ask list is raised.
  - Proof is an outcome test on synthetic transcripts. An India-only student produces zero visa items, and a student with a known fact gets no card or question asking for that fact. A test that only checks a filter function exists does not count (B14).

- **B19 (scenario matrix):** `qa/scenarios/counselling-engine.csv` holds at least 50 rows, covering the happy path and negative cases, and each row names a persona and an expected outcome. The file must include:
  - an India-only student;
  - a student leaving two years from now;
  - a Hinglish session;
  - a concern-level turn;
  - an erasure request mid-session;
  - the AI-down (`rules` provider) path.

  Every UI-touching unit check and every release runs every row. Each row is recorded as `pass | fail | skip(<reason>)`. An unrun row is a SKIP, never a PASS, and the verdict states `SCENARIOS: <passed>/<total>`. Until the file exists, a UI verdict records `SCENARIOS: n/a (matrix not yet authored, B19)` rather than blocking.

- **B20 (concern-level continuation, D-020, gate `scribe-concern-level`):** A concern-level turn (below crisis, e.g.
  "I feel hopeless", "bahut tension hai") never stops or withholds the scribe's output. The scribe still produces its
  facts, summary and profile diff for the counsellor to approve (B3) and additionally writes a concern node/edge into
  the knowledge graph, cited to its transcript span (B2), with a visible concern flag on the session. Any check-in
  offered to the student for a concern-level turn is a live-card **question** (T-010), never a scripted line to
  recite (B1). As severity rises, escalation to the counsellor and/or admin follows B16's classifier layer. Only a
  **crisis**-level signal (B9) stops generation and escalates immediately; concern never does. A test proves the
  scribe completes on a concern-level fixture and that the concern node carries a citation.

- **B21 (API-first headless engine; gate `counsellor-auth`, answered 2026-09-26):** VC is an intelligence
  service, and Pathlynks is its first client, not its host.
  - Every capability (scribe, approval, profile, cards, timeline, erasure, export) is reachable through a versioned
    HTTP API described by an OpenAPI document in the repo.
  - **Auth:** every request carries a JWT issued by the client backend (for Pathlynks, its backend). VC verifies
    signature, expiry and issuer, and reads the `tenant`, `counsellorId` and `role` claims. VC has no login screen
    and no password store. A missing, expired, wrong-issuer or tampered token gets 401, and nothing is read or written.
    Issuer and verification key come only from config (`.env`); until the Pathlynks team supplies theirs, a
    placeholder issuer owned by Umesh (`umesh`, local key pair) is used (Umesh, 2026-09-26). Moving to the real issuer
    is a config change plus a contract test, with no code change; no private key is ever committed.
  - **Tenancy:** the verified `tenantId` is stamped on every document and filters every query. A test proves tenant
    A can never read or change tenant B's student.
  - **Knowledge:** university and seminar knowledge comes from the KnowledgeBase over its API (`POST /ask`, Bearer
    key from `.env`, B11). Its citations are carried through (B2). A KB outage degrades to "knowledge unavailable";
    it never produces an uncited answer.
  - **Events:** approved facts (with provenance, B2), erasure requests and concern flags go out as signed webhooks,
    so the client keeps its own copy.
  - **UI:** production UI is built by the client's team. `apps/web` is VC's reference and test UI, the surface that
    persona walks (B17), scenario runs (B19) and the release video run on.
  - Tests use a locally signed test JWT and a fake KB. Nothing connects to the real Pathlynks backend until an
    integration unit is approved.

- **B22 (novice + VC ≈ expert; north-star metric, Umesh 2026-09-26):**
  - **Goal:** a person with no counselling background, working with VC, reaches **at least 90 %** of the expert
    benchmark (`sapna-expert`) on the same case. VC gets them there as a sounding board: questions, comparisons and
    evidence, never a script (B1). The human still decides.
  - **Measurement:**
    - the case set is the golden sessions (T-009), anonymised (B13);
    - the reference outcome is Sapna ma'am's judgement per case (what she would explore, conclude and recommend), captured once as a rubric;
    - an independent grader scores the `gaurav-pm` and `gaurav-bhaiya` walks with VC against that rubric.
  - **Before the reference exists:** until Sapna ma'am's reference rubric is recorded, B22 is reported as
    `NOT-YET-MEASURABLE`, never as a pass, and it does not block unit PASS.
  - **Once the reference exists:** B22 becomes a release gate.

## Non-goals (this contract)
- The avatar (P3) and the student-facing voice surface. (Counsellor-side **voice input**, such as dictating an edit in Hindi, is in scope: B17 `gaurav-bhaiya`.)
- Bulk student import (Excel with AI column mapping). Umesh 2026-09-26: out of this project's context; it belongs to the counselor portal.
- The production counsellor UI. It is built by the client's team (B21).
- Journey map, test tracker, commission and supplier onboarding, school subject grouping (these belong to the counselor portal or Pathlynks).
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
- 2026-09-25 · routine (tighten, inbox fold) · B16 crisis recall bar set to >= 0.95 on the offline golden set · qa/feedback-inbox.md 04:47:54 ai-engineer review of T-005.
- 2026-09-25 · routine (clarify, no weakening) · B15 now cites the D-015/D-016/D-017 fencing and states that a surviving write in the fence gap is a violation (ISS-t-017-rev-1) and that the fence sweep must not crash its host (ISS-t-017-rev-2) · sweep shard 1 found B15 stale against D-016/D-017.
- 2026-09-25 · routine (tighten, inbox fold) · B6 gains provider independence (2 real providers + a no-AI `rules` provider that completes the P1 flow, with an e2e in rules mode); new B17 persona usability (Jaipur counsellor + school counsellor walks; a high persona finding blocks PASS) · qa/feedback-inbox.md entries 5-6, the lead's counselor-portal review relayed by Umesh.
- 2026-09-26 · routine (tighten, inbox fold) · new B18 context relevance (suppress irrelevant and already-known items, e.g. no visa for India-only; outcome-tested) and new B19 scenario matrix (at least 50 persona-tagged rows, run on every UI check and release, an unrun row = SKIP) · the same counselor-portal review transcript Umesh shared on 2026-09-25 (lead: "irrelevant cheezein dikhni hi nahi chahiye", "~50 cases ki sheet"). These were planned in session ef98f055 and never applied. B17 persona-list changes wait on Umesh's answer.
- 2026-09-26 · routine (tighten, inbox fold, human-answered gates D-020) · four amendments from Umesh's answers to the
  T-005b/T-013/scribe/T-019 gates: B9 + B16 state the crisis guard is recall-only and never suppresses a match, and
  that any later layer (the B16 classifier) may downgrade a flag to "reviewed, likely benign" but can never hide it;
  B2 rescopes citation guarantee so only numbers and the fixed country/alias vocabulary auto-verify, every other text
  fact and a new `reasoning` fact kind are kept (never dropped) and cited to their transcript span as needs-review,
  and the full transcript's persistence is confirmed covered by B15 erasure/export; B6 gains runtime provider failover
  (3-model chain, ~10 total retries with backoff, no auto-drop to `rules`, engineering alert + apologetic
  input-preserving Retry on all-fail); new B20 concern-level continuation (a concern turn never stops the scribe, is
  written into the KG with a citation, escalates via B16 as severity rises, and any check-in is a question card, never
  a script) · qa/feedback-inbox.md 2026-09-26 entries (crisis-guard-precision, citation-guarantee-scope,
  scribe-concern-level, provider-fallback), D-020, qa/gates/{crisis-guard-precision,citation-guarantee-scope,
  scribe-concern-level,provider-fallback}.md.
- 2026-09-26 · routine (tighten, gate answers) · B2 edit provenance (`counsellor-edit` + `editedFrom`, held by both VC and the client) · B15 approver erasure (double confirm → email-outbox approver → purge; `autoDelete` default false; fence + 24 h; HMAC audit pseudonym) · B17 persona ladder (10 personas incl. Sapna ma'am as benchmark, Gaurav bhaiya Hindi + voice, 4 international policy personas) · non-goals: bulk import, production UI · gates counsellor-auth, edit-provenance, erasure-fencing answered by Umesh 2026-09-26.
- 2026-09-26 · **critical (human-approved)** · new B21 API-first headless engine (JWT from the client backend, tenant stamping, KB over `/ask`, webhooks, `apps/web` = reference UI) and new B22 north-star metric (novice + VC ≥ 90 % of the expert benchmark, NOT-YET-MEASURABLE until Sapna ma'am's reference rubric exists) · direction changes approved by Umesh in chat 2026-09-26 ("api based … ui vo log khud bnaa lenge"; "Sapna ji ka 90-95 % level"). The maker records them as D-021 and updates ARCHITECTURE through /landplane.
- 2026-09-26 · routine (human-answered gate, D-026) · B2 auto-verify property: `needsReview:false` = the student said this value, for this key, in their own words, in this one turn; cross-turn context out of scope; a leak is high at most and Blocks only when it breaks one of the four clauses · gate auto-verify-property answered by Umesh (option A), verbatim in qa/feedback-inbox.md 2026-09-26. Ledger: ISS-069 (key), ISS-070 (speaker), ISS-072 (own words) are breaches, owner T-030; ISS-071 (cross-turn) is outside the property, wontfix.
- 2026-09-26 · routine (human answer) · B21 auth: issuer + key from config only; placeholder issuer `umesh` until Pathlynks supplies its own (Umesh: "abhi umesh k naame se lee lee"); no private key committed.
- 2026-09-27 · routine (record what D-027 already decided, checker Mode B sweep consolidation) · B4 gains a named
  exception: a crisis turn (B9) escalates even without a recorded consent row, with the escalation record carrying
  identifiers and the flag only, never transcript text, and nothing else processed without consent · this is the
  criticality-gate's ordinary case ("record what D-027 already decided"), not a weakening — B4 consent-first stays the
  rule for every other path. B9 and B16 were checked against D-027 and found not in conflict as written: neither
  criterion conditions the guard match or the escalation notification on consent being present, so nothing in their
  text needed a corresponding edit · D-027, qa/gates/crisis-escalation-consent.md, ISS-t-012-rev-3.
- 2026-09-27 · routine (tighten, inbox fold, checker Mode B sweep consolidation) · B2 gains a fail-safe +
  scope clarification block: documents T-013's already-implemented negation/unit-multiplier/currency
  fail-safe (a value with an adjacent multiplier or currency word stays needs-review even on an exact
  digit match; bare numbers assume INR); states a unit-converted value is not "said" by the student
  (D-026 own-words); declares hedges, in-turn negation, third-party attribution, within-turn
  conditionals and same-turn compound/corrected values out of scope for auto-verify; states the
  vocabulary and template grammar are Latin-script only (Devanagari aliases/spelled-out numbers stay
  needs-review); names the 11 keys D-026's "for this key" clause currently binds. None of this touches
  the held necessary-vs-sufficient question (gate `auto-verify-surface`) or the country-vocabulary /
  exam-scope questions (Q1/Q2/Q5), which stay open pending Umesh · qa/feedback-inbox.md 2026-09-26
  (ai-engineer review of T-013) + 2026-09-27T00:00 (T-036 blind oracle Q3/Q4/Q6/Q7/Q8), issues ISS-082/
  ISS-083.

- **2026-09-27 · routine · B2: the auto-verify surface is NECESSARY *and* the closed template grammar is
  now stated in the contract.** Gate `auto-verify-surface` answered by Umesh directly, 2026-09-27
  (AskUserQuestion, option (c) of the gate's three; recorded the same turn in `qa/QUEUE.md` at `f7f5260`
  with its ledger rows). *Why:* the gate asked whether B2's auto-verify list is necessary-only or also
  sufficient, and the measurement that opened it was that 72/72 needs-review rows held correctly while 29 of
  30 expected-auto-verify rows did not — 21 of those turning on a closed-template-grammar rule that lived in
  `packages/engine/src/scribe/nodes.ts` and appeared nowhere in B2 or D-026. A criterion the oracle cannot
  read is a criterion that cannot fail, so those rows were unscoreable in either direction rather than
  passing or failing. The grammar is lifted verbatim from the frozen `AUTO_VERIFY_TEMPLATE_SOURCES` (T-030 /
  D-025): clause formation and anchoring, the 9 country templates, the 7 budget and 9-shapes-per-family
  score templates, per-template key declaration, the digits-only value slot pinned by string equality, and
  the closed connector/modifier sets. *Classified routine, not critical:* it adds no template, connector,
  alias or key and widens nothing — it writes down behaviour the engine already has, and it makes the
  necessary direction explicit, which is the fail-safe one. Where code and this paragraph ever disagree, the
  contract is the criterion and the code is the defect. Still NOT settled, deliberately: the country
  vocabulary's exact membership and the exam-scope questions (Q1/Q2/Q5 in `qa/feedback-inbox.md`) stay open
  pending Umesh, and Latin-script-only remains a recorded limit rather than a defect. *Provenance note:* the
  peer maker session's gate files record this answer as `Relayed (UNCONFIRMED)` because it reached that
  session only as a relay from this one; Umesh answered this session directly, which is the authority this
  amendment rests on. The gap is expected until he confirms in either session · issue ISS-t-036 family,
  gate `qa/gates/auto-verify-surface.md`.
