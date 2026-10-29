# Spec — tool-first (DRAFT for Umesh, 2026-10-29)

Status: DRAFT. Serves `intent.md` outcomes 1-5. Facts: `qa/evidence/t057/tool-first-inventory.md` (called INV below),
`qa/evidence/t057/services-knowledge-audit.md`, D-122..D-129. Audience: external-ui (widget) + internal engine.
Items marked [ASSUMPTION] are unstated inputs; they are listed again in plan.md as questions.

## Phases
| Phase | Scope | Exit |
|---|---|---|
| P1 | Deep links + steps (a), tracking reads (c), summaries with fact-check (e), fast model per role (f) | TF-1..TF-14 green |
| P2 | Act-on-behalf consent and host navigation / read-only search (b) | TF-15..TF-19 green |
| P3 | Full product + DB knowledge graph (d) generated from synced sources | TF-20..TF-22 green |

P1 ships a hand-curated tool table (constants, reviewed). P3 replaces hand-maintenance with a graph built from the synced
sources, with a drift test against the curated table.

## User types and navigation (g)
Drafted from INV; to be confirmed with Umesh in `/grill` user-type mode before plan approval (lifecycle gate).
Signed-in types are told apart by which owner-bound rows exist, not by asking.

| # | User type | State (how VC knows) | Typical ask | Navigation VC gives | Steps |
|---|---|---|---|---|---|
| U1 | Anonymous visitor | no token | "best universities in Canada", "do you help with loans?" | Public `/search` (needs a query box first), `/country/<slug>`, `/services/<slug>`, `/ai-university-finder-study-abroad`; no reads; no act-on-behalf | 2-3 |
| U2 | New explorer | signed in, 0 shortlist, 0 journey rows (the T-057 test student today, INV probe) | "where do I start", "find me universities" | AI University Finder or University Explorer (`?section=market`), then heart / shortlist | 3-5 |
| U3 | Shortlister / comparer | shortlist rows, 0 journey maps | "compare these", "make my full journey" | Compare (`?section=compare`), Shortlisted (`?section=shortlisted`); bulk journey needs counsellor verification, otherwise Generate per programme | 4-6 |
| U4 | Applicant | journey maps and/or applications rows | "what's next", "where do I stand" | Journey Map (`?section=journey`), Application Status (`?section=applications`), Documents; reads + summary | 2-4 |
| U5 | Visa-stage student | `visa_applications` row | "visa checklist", "interview date" | Visa (`?section=visa`), Documents, Test Requirements; reads + summary | 2-4 |
| U6 | Pathlynks-linked, undecided | Pathlynks snapshot present (`vidysea_pathlynks_snapshot`), no Vidysea activity | "which course suits my careers" | AI Recommendations (`/student/recommendation`), then Explorer. Pathlynks tool-first itself is out of scope (INV Q10) | 3-4 |

Negative paths: signed-in-only tool asked while signed out -> "sign in first" plus the public alternative; section not in the
closed list -> no link, steps in words only; catalogue lacks the page -> existing "I don't know that page yet"
(`NAVIGATE_UNKNOWN_TEXT`); crisis text -> fixed reply, no tool, no LLM.

## (a) Routing a need to a tool: fixed interfaces

### S1 Tool table — `packages/engine/src/tools/navigate.ts`
```ts
export const SECTION_KEYS = ["dashboard","market","journey","shortlisted","compare","comparisons","favourites",
  "scholarships","schpipeline","applications","visa","tools","documents","docchecklist","testreq"] as const;
  // [ASSUMPTION] verify against FE:src/lib/student/navigation.ts:5 STUDENT_SECTIONS before coding
type ToolRecipe = { id: string; pattern: RegExp; label: string; purpose: string;
                    path: string;                         // base route
                    section?: typeof SECTION_KEYS[number];
                    auth: "public" | "student";
                    steps: readonly string[];             // 3-6 reviewed constants
                    searchTemplate?: "country" }          // P2 only
```
- Steps, label and purpose are reviewed constants taken from INV section 1; never built from the student's text.
- Link = `path` + (`?section=` + `section`). `isSafeRoute(path)` still applies to the base path; the section comes only from
  `SECTION_KEYS`. A recipe fires only if `path` is in the synced catalogue (as `navigate.ts:197` does today).
- Initial recipes (P1): `university_search` (market), `ai_finder`, `shortlist` (shortlisted), `compare`, `journey_map` (journey),
  `applications`, `visa`, `favourites`, `scholarships`, `documents`, `test_requirements`, `tools_library`.
- Required wording facts (INV 2b): "full journey" is one map per programme. Message: shortlist a programme, press Generate
  Journey Map on the programme card, confirm nationality and tests, wait 60-120 s; the bulk Generate on Shortlisted covers
  counsellor-verified items only. Never claim a single "full journey" object.
- "best universities in Canada": P1 gives Explorer steps (signed in) or `/search` (public; the student types the query).
  The country is echoed only if it matches the closed country list (S2); otherwise the steps stay generic.

### S2 Country list
Closed list = country slugs present in the synced catalogue (`/country/[slug]`) intersected with a reviewed display-name table.
[ASSUMPTION] the exact destinations are confirmed by Umesh. Free-text countries never reach a link or a query.

### S3 Intent routing — `packages/engine/src/student/classify.ts`
Anchored, tight-match rules added before the KB route (style of `INTENT_RULES`, `:143-181`): "best/top universities in X", "find
or shortlist universities", "make / create / generate my (full) journey / roadmap / plan", "compare universities", "my
scholarships", "upload documents", plus Hindi and Hinglish equivalents. KB questions must still route to `search_kb`. The result
is the existing `navigate_steps` tool; no new tool name, so `STUDENT_TOOLS` and the capability drift test stay equal.

### S4 Answer shape
The reply is tool name + one-line purpose + numbered steps + relative link, rendered from the recipe (like `serviceLine`,
`navigate.ts:180`). The model adds no claims about the tool. The existing link guard still strips absolute URLs; relative
in-product links come from the recipe's structured field, not from model text (services audit section 3).

## (b) Act on my behalf (P2)

### S5 Consent
- Widget (`apps/widget/src/vc-widget.js`): checkbox "Let VC open screens and run searches for me", default off, held in memory
  only (the widget stores nothing). Hidden for anonymous visitors and when the host registers no handler.
- The request carries `actOnBehalf: boolean` (a student assertion, not an identity or tenant claim). The server ignores it unless
  the verified principal is a signed-in student. It is recorded per turn as a boolean in turn metadata (no text) for audit.

### S6 Host action
- The response gains an optional `hostAction` `{ type: "open"; path; section?; query? }`, produced only from a `ToolRecipe` and
  only when `actOnBehalf` is true. Unticked: no `hostAction`, steps only.
- `query` exists only for search recipes and is composed server-side from a closed template, `best universities in <country
  from S2>` (optionally a level from a closed list). It is never the student's text.
- Transport: the widget raises a DOM event `vc:host-action` (script-tag mode) and, in pop-out or iframe mode, `postMessage` to
  a pinned origin from site config (never `*`). The host decides whether to act. Same-origin relative paths only. Opening
  `/search?q=<template>` is itself the read-only search. Prefilling the in-portal Explorer needs a host change in the Vidysea
  frontend checkout; until then VC opens the screen and shows the steps.
- Hard exclusions, enforced in code and tested: no form submit, no payment, no click on a writing control (Generate Journey Map,
  Add to shortlist, Move to shortlist, Start application, Save comparison). VC opens the screen; the student presses the button.
  Platform DBs are never written by VC (D-123).

## (c) Owner-bound read-only tracking

### S7 Vidysea port — `mcp/pathlynks/src/port.ts` `createVidyseaPort`
New read methods sit next to `getShortlistedProgrammes` (`:389`). Each uses the existing owner predicate (`:377`: `u.id=$1 AND
s.deleted_at IS NULL AND u.is_active IS TRUE AND u.disabled_at IS NULL`), `LIMIT` with a `truncated` flag, `statement_timeout`,
and parameterised SELECT inside the read-only transaction. Tables are added to `VidyseaPortConfig.tables` / `required` (`:363`)
and to `config/sources.json` `vidysea-db.tables`; any table outside the list is refused, as today.

| Method | Tables | Columns (allow-list; verified by a metadata-only probe first) |
|---|---|---|
| `getJourneyMaps` | `user_course_journey_map` (archived_at IS NULL), `journey_phases`, `milestones` (removed_at IS NULL) | programme, university, per-phase milestone counts by status, earliest open `end_date`. Status literals checked against live values before coding |
| `getApplications` | `applications` (deleted_at IS NULL) | university_name, program_name, application_status, application_deadline, submission_date |
| `getVisaApplications` | `visa_applications` | visa_type, status, interview_date, biometrics_status, visa_fee_status, country |
| `getFavourites` | `user_favourites` (owner `user_id`; still joined to `users` for is_active) | item_type, item_name, university_name, created_at |
| `getSavedScholarships` | `saved_scholarships` | name, provider, country, amount, deadline, status, applied_at, result_at |
| shortlist (extend) | `student_shortlisted_courses` | add `application_started`, `is_finalized` (already selected at `port.ts:392-393`, hidden by the graph allow-list) |

Never read: `student_tool_results` input/output, `saved_scholarships.raw`, `link`, `status_notes`, document file names or paths,
notification bodies, planner free text, `service_enquiries` (no student id), counselling sessions (external service).

### S8 Engine wiring — `packages/engine/src/student/graph.ts`
Add the names to `VidyseaToolName` (`:225`), the `VidyseaReadonlyPort` interface (`:218-224`), `PATHLYNKS_ALLOWED_COLUMNS`
(`:268-272`), `STUDENT_TOOLS` (`:413`) and the execution branch (`:1070-1081`). Output stays deterministic templates
(`listMessage` / `recordMessage`) unless the summary of (e) passes its check. Intents "my journey / my applications / my
progress / what next" are added in `classify.ts` (`:179-181`). `skills/vc-capabilities/SKILL.md` is updated to match.
"Nothing yet" (empty list) is told apart from "can't see it right now" (unavailable), as the quest-successor contract does.

## (d) Product + DB knowledge graph (P3; P1 uses the curated table)
- Reuse the existing ingest: `parseNextAppRoutes` (`packages/engine/src/ingest/routes.ts:62`) for routes, the labelled catalogue
  of services-audit fix 2 (`NavRoute` in `ingest/types.ts` gains optional `label`, `summary`, `sections`), and
  `parseSequelizeMigrations` for the schema map, from the registered `vidysea-frontend` and backend sources
  (`config/sources.json`, branch `prod`).
- Nodes: `need`, `tool` (label, route, section), `table` (columns, owner column). Edges: `serves` (tool->need), `writes`
  (tool->table, from INV; informational, VC never writes) and `reads` (VC tool->table, only allow-listed). Stored as a new
  `kind` in `source_artifacts` or in the `edges` collection of ARCHITECTURE H3 (open question). Nothing from GitHub is read at
  chat time. Sync stays gated (GitHub token, outward fetch of a private repo).
- Selection: classify -> graph lookup -> tool recipe. If the graph and the curated table disagree, the curated constant wins and
  the drift test fails the build.

## (e) AI-written progress summaries and fact-check

### S9 Flow (P1)
rows (S7, allow-listed) -> `facts[]` built by code -> LLM writes `{ sentences: [{ text, factIds[] }] }` with the configured
summary model -> deterministic checker -> send, or fall back to the existing template.
- `fact` = `{ id, kind: count|status|date|name|days, value }`. Derived values (days to a deadline, totals) are computed by code
  and are facts themselves; the model never does arithmetic.
- Checker rules, all must hold:
  1. Every number, date and count in a sentence equals a value in that sentence's `factIds`.
  2. Every word from a closed status vocabulary (per table, from the allow-listed values) equals the referenced fact's status.
  3. Every programme or university name is an exact row value.
  4. Any capitalised token outside rows, tool labels and a fixed vocabulary fails.
  5. No URL, no absolute link.
  6. The next step comes from a fixed state->next-step table (for example "no journey map yet" -> Generate Journey Map from a
     shortlisted programme); the model may only phrase it.
  7. The no-script guard still runs.
  Any failure -> deterministic template and a counter (no text logged).
- Data sent to the LLM is only the allow-listed fact list. D-122 clears the send for the local demo; [ASSUMPTION] it needs a
  fresh clearance before production (a gate in plan.md).

### S10 Data grounding vs web grounding (plain words)
- Data grounding: the model is handed the student's own rows (or KB passages) and may say only what they contain. Our code
  checks the reply against those rows. This is what protects "you have 2 applications, one is Submitted".
- Web grounding (Gemini `google_search`, already in `packages/providers/src/index.ts:930`, gated by `VC_GROUNDING` and
  `VC_GROUNDING_MODEL`, a flash model, `:1000-1014`): Gemini itself searches the public web while answering and cites pages. It
  suits general facts ("what is the IELTS test format"), can be stale or wrong, and cannot be checked against our rows.
- Rule: web grounding is a separate call for general questions only. It receives the general question and never the student's
  rows, name, ids or summary. A reply never mixes the two; web-grounded text is labelled as general information.

## (f) Configurable fast model per role
Existing config: `VC_LLM_MODEL` (answers), `VC_CONCERN_MODEL`, `VC_GROUNDING_MODEL`, `VC_VOICE_MODEL`. Add, in
`packages/providers/src/index.ts` `loadProviderConfig`, optional per-role overrides `VC_MODEL_SUMMARY`, `VC_MODEL_ANSWER`
and `VC_MODEL_ROUTER` (any LLM routing step), each falling back to `VC_LLM_MODEL`. Names only in `.env.example`.
Umesh named "3.5 flash lite" (D-129 item 5): the exact model id is [ASSUMPTION] and is verified by a read-only models-list probe
before it becomes any default; until then the value is whatever the env sets. The fact-check (e) is code, not a model.
Per-role override in the Admin Console is a later option (open question).

## Acceptance criteria (each has one runnable test)
| # | Phase | Criterion | Test |
|---|---|---|---|
| TF-1 | P1 | "best universities in Canada" returns tool label, purpose, 3-6 constant steps and `/student/journey-details?section=market` (signed in) | `packages/engine/tests/navigate.test.ts` |
| TF-2 | P1 | A link is `path?section=<key>` with `key` in `SECTION_KEYS`; a hostile intent or student-typed section cannot change it | `navigate.test.ts` (hostile cases) |
| TF-3 | P1 | A recipe fires only when its path is in the catalogue; otherwise `NAVIGATE_UNKNOWN_TEXT` | `navigate.test.ts` |
| TF-4 | P1 | "make my full journey" says per-programme, shortlist first, 60-120 s, bulk needs counsellor verification; never a single "full journey" | `navigate.test.ts`, `student-graph.test.ts` |
| TF-5 | P1 | New phrases (EN, Hindi, Hinglish) route to `navigate_steps`; KB phrases still route to `search_kb`; crisis first | `student-classify.test.ts` |
| TF-6 | P1 | `STUDENT_TOOLS`, `vc-capabilities` and `vc-navigation` stay equal (drift test) | `capability-manifest.test.ts` |
| TF-7 | P1 | Every new port method binds `users.id=$1`, has `LIMIT` and timeout, and is SELECT-only in a read-only transaction | `mcp/pathlynks/tests/port.test.ts` |
| TF-8 | P1 | Cross-student: A's token never reads B's rows; no token, nothing read | `port.test.ts`, `apps/api/tests/chat-pathlynks.test.ts` |
| TF-9 | P1 | A table or column outside the allow-list is refused; free-text columns never appear in a tool result | `port.test.ts`, `pathlynks-tools.test.ts` |
| TF-10 | P1 | Empty list says "nothing yet"; missing table or outage says "can't see it now" | `student-graph.test.ts` |
| TF-11 | P1 | Summary: a sentence whose number, date, status or name is not in its facts is rejected and replaced by the template | new cases in `student-graph.test.ts` (fact-check unit) |
| TF-12 | P1 | Summary: a valid summary passes; model arithmetic and invented next steps are rejected | same file |
| TF-13 | P1 | Per-role model env resolves with fallback to `VC_LLM_MODEL`; a bad value is a config error | existing provider test file for `loadProviderConfig` |
| TF-14 | P1 | The web-grounding call carries no student data (spy on the request body) and its output is labelled general | provider tests + `student-graph.test.ts` |
| TF-15 | P2 | Unticked: no `hostAction`; ticked and signed in: `hostAction` from a recipe | `apps/api/tests/chat.test.ts`, `apps/widget/tests/floater.test.js` |
| TF-16 | P2 | `actOnBehalf` from an anonymous or unverified caller is ignored | `chat.test.ts`, `anonymous-route.test.ts` |
| TF-17 | P2 | `query` is built only from the closed template and country list; free text never reaches it | `navigate.test.ts` |
| TF-18 | P2 | Writing controls never appear in any `hostAction`; no form-submit or payment action type exists | `navigate.test.ts` (type-level + table test) |
| TF-19 | P2 | Widget event / `postMessage` use a pinned origin and a relative path only; checkbox default off and not persisted | `floater.test.js`, `config.test.js` |
| TF-20 | P3 | A graph built from fixture routes + schema map links need -> tool -> route -> table | `packages/engine/tests/ingest-routes.test.ts`, `ingest-migrations.test.ts` |
| TF-21 | P3 | Curated table and graph disagree -> the drift test fails | `navigate.test.ts` drift case |
| TF-22 | P3 | An empty or failed sync never replaces the last good graph | `apps/api/tests/admin-sync.test.ts` |

Tier A throughout: no platform write, Mongo writes only to `virtual_counsellor`, no secrets or student rows in git or logs,
crisis path with zero LLM calls, no-script.

## Non-goals
See intent.md. Live proof of the P1 reads needs the test student to create rows through the real Vidysea UI (INV Q8): the
student writes them, not VC.
