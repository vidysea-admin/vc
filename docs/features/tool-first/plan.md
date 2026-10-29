# Plan — tool-first (DRAFT for Umesh, 2026-10-29)

Status: DRAFT. `qa/gates/plan-approved.md` is NOT written; only Umesh approves. Spec: `./spec.md`. Intent: `./intent.md`.
Authority: D-128, D-129 (plan gate first), D-122/D-123 (data boundary). Starts after the T-057 demo finishes (D-129 Result).
Edit in place: every unit names an existing file and function. No new module, no `_v2` file. Builders do not touch
`.claude/**`, `docs/DECISIONS.md`, `qa/contracts/**`, `ARCHITECTURE.md`. A new contract, if the checker wants one, goes through
`qa/feedback-inbox.md`, not the maker.

## Gates before any code
| Gate | What | Owner |
|---|---|---|
| G-plan | Umesh approves intent/spec/plan, answers the questions below, and the user types are confirmed in `/grill` user-type mode | Umesh |
| G-sync | Sync of `vidysea-frontend` (outward fetch of a private repo, GitHub token; writes only `virtual_counsellor`). The source already exists in `config/sources.json:18`; the audit found 0 `source_artifacts`, so P1 recipes need this sync to fire (`navigate.ts:197`) | Umesh |
| G-probe | A metadata-only, read-only probe of the new tables' columns and status literals (no row content), on the test student's ids only | maker, after G-plan |
| G-llm | Re-clearance of sending journey/application/visa facts to an LLM beyond the local demo (D-122 scope is local) | Umesh, before any deploy |
| G-host | Any change in the Vidysea frontend checkout (P2) is local, in an isolated checkout, never pushed upstream without a separate approval (as D-125) | Umesh |

## Work units (order and files)
Wave 1 is parallel on disjoint files. Wave 2 waits on wave 1. `graph.ts` is one file, so its units run in sequence with one owner.

### Wave 1 (P1, parallel)
| Unit | Spec | Edit in place | Tests (extend) | 
|---|---|---|---|
| T1 recipes + intents | S1-S4 | `packages/engine/src/tools/navigate.ts` (`TASK_RECIPES` `:38`, link composition near `:197`, `SAFE_ROUTE` stays `:56`); `packages/engine/src/student/classify.ts` (rules near `:143-181`); `skills/vc-navigation/SKILL.md`; the `navigate_steps` row of `skills/vc-capabilities/SKILL.md` | `packages/engine/tests/navigate.test.ts`, `student-classify.test.ts` (TF-1..TF-5) |
| T2 port reads | S7 | `mcp/pathlynks/src/port.ts` (`createVidyseaPort` `:361`, tables/required `:363`, owner `:377`, shortlist SQL `:389-395`); `config/sources.json` `vidysea-db.tables` (`:89`) | `mcp/pathlynks/tests/port.test.ts`, `fakes.ts`, `privileged-override.test.ts` (TF-7..TF-9) |
| T3 per-role models | (f), S10 | `packages/providers/src/index.ts` `loadProviderConfig` (`:206`), grounding config (`:1000-1014`); `.env.example` (names only) | existing provider test file (TF-13, grounding half of TF-14) |

### Wave 2 (P1, after wave 1)
| Unit | Spec | Edit in place | Tests |
|---|---|---|---|
| T4 engine wiring | S8 | `packages/engine/src/student/graph.ts` (`VidyseaToolName` `:225`, port interface `:218-224`, `PATHLYNKS_ALLOWED_COLUMNS` `:268-272`, `STUDENT_TOOLS` `:413`, branch `:1070-1081`, `navigateTool` `:1164-1181` unchanged in logic); `classify.ts` (`:179-181`); `skills/vc-capabilities/SKILL.md`; `apps/api/src/chat.ts` and `main.ts` only to pass the new port methods through | `student-graph.test.ts`, `pathlynks-tools.test.ts`, `capability-manifest.test.ts`, `apps/api/tests/chat-pathlynks.test.ts` (TF-6, TF-8, TF-10) |
| T5 summary + fact-check | S9 | same `graph.ts` (after T4; one owner): a `buildFacts` / `checkSummary` pair beside `listMessage` / `recordMessage`; summary call uses `VC_MODEL_SUMMARY`; `skills/` prompt text only if a summary prompt is needed (new SKILL.md is not allowed without naming it first) | fact-check unit cases in `student-graph.test.ts` (TF-11, TF-12, TF-14) |

### Wave 3 (P2, only after P1 passes and Umesh says go)
| Unit | Spec | Edit in place | Tests |
|---|---|---|---|
| T6 consent + hostAction | S5, S6 | `apps/api/src/chat.ts` (request flag, response field), `apps/api/src/openapi.ts`, `packages/engine/src/tools/navigate.ts` (search template, `hostAction` from recipe); `apps/widget/src/vc-widget.js` (checkbox, event/`postMessage`), `apps/widget/README.md` | `apps/api/tests/chat.test.ts`, `anonymous-route.test.ts`, `navigate.test.ts`, `apps/widget/tests/floater.test.js`, `config.test.js` (TF-15..TF-19) |
| T7 host receiver | S6 | Vidysea frontend isolated checkout only (local, G-host): a listener that accepts `vc:host-action`, validates path + section + origin, navigates | host-side check in the browser walk; not in this repo's suite |

### Wave 4 (P3, after P2)
| Unit | Spec | Edit in place | Tests |
|---|---|---|---|
| T8 knowledge graph | (d) | `packages/engine/src/ingest/types.ts` (`NavRoute`: optional `label`, `summary`, `sections`), `ingest/routes.ts` (second exported parser beside `parseNextAppRoutes` `:62`), `apps/api/src/admin-routes.ts` (`syncGithubSource` frontend branch `:722-740`, keep the "empty must not replace last good" guard); schema artifact reuse of `ingest/migrations.ts` | `packages/engine/tests/ingest-routes.test.ts`, `ingest-migrations.test.ts`, `navigate.test.ts` drift case, `apps/api/tests/admin-sync.test.ts` (TF-20..TF-22) |

## Delivery and checks
- Each unit is red-first: write or extend the failing test, run it red, then green. Builders run only the named test files
  (RAM is low); no full workspace suite from a builder.
- 6c = the full-suite pre-push check, run once by the integrator after the last unit of a phase, before the push gate, on a
  quiet machine. The push gate then asks Umesh. `qa/.6c-green` is never committed. The gate output is never piped.
- Reviews, run by fresh agents in one message after code, never by the writer: `senior-software-engineer` (all units),
  `data-engineer` (T2 queries, T8 ingest), `ai-engineer` (T3, T5: prompt, fact-check, grounding isolation).
  `/aios-config-auditor` is needed only if `skills/**` or config paths are judged config; `skills/vc-*` edits are text, so
  run it once on T1/T4 to be safe.
- Checker (`/checker`, fresh context): one feature manifest per phase. Dual check for P1 (student-data reads and tenancy,
  Tier L-like) and for P2 (consent and host action). The brief must demand outcome proof, not construction (memory: a past PASS
  missed a silent no-op), including hostile variants: student-typed section, injected country, spoofed `actOnBehalf`,
  cross-student ids, numbers the model invents, web-grounded call carrying student data.
- Live proof (after deterministic checks): run the real port read-only for the test student, then compare counts with the
  Vidysea UI. The test student has 0 relevant rows today (INV probe), so the student creates a few through the real UI first
  (writes made by the student, not VC; INV Q8). Evidence goes in `qa/evidence/`, with no private identifiers.
- Decisions-log entries (`scripts/append_decision.ps1`) are written at landplane, not by builders.

## Risks
- Recipe text drifts from the real UI: steps are INV-derived; mitigated by the browser walk and the P3 drift test.
- Catalogue empty: recipes never fire until G-sync runs (TF-3 makes this visible, not silent).
- Status literals or column names differ from INV: G-probe before T2.
- Fact-check too strict: every rejection falls back to the template, so the failure mode is plain text, not a wrong answer.
- Section keys change in the Vidysea frontend: the closed list is one const plus a test; update with the host.

## Open questions for Umesh
1. Deep links (D-129 item 1) are allowed from a fixed list. Is the draft list `SECTION_KEYS` (spec S1) the right one, and may I
   verify it against `STUDENT_SECTIONS` in the frontend before coding?
2. "Best universities in Canada": send a signed-in student to the in-portal Explorer (no filters, cannot be prefilled today) or to
   `/search` (filters, but the query box must be typed by the student, or opened with a VC-built template in P2)? May the steps echo
   a country from a closed list when the student named it?
3. Which countries go in the closed list (spec S2)? The default is the synced `/country/[slug]` set.
4. "Full journey" is one map per programme. Is "shortlist -> Generate Journey Map per programme; bulk needs counsellor
   verification" the right message? Should VC mention the premium / counsellor-assignment difference?
5. First-slice read tables: journey maps, applications, visa, favourites, saved scholarships (D-129 item 3). Confirm the
   held-back list (tool run input/output, scholarship `raw` and notes, document names, notification text, planner free text).
6. `service_enquiries` has no student id (only email/phone). Leave out of scope, or join on the student's own email?
7. Counselling session requests live in an external session service. Out of scope for reads?
8. `vidysea-db` is `enabled:false` in `config/sources.json`. Confirm it is enabled in the admin store for the demo and that the
   D-123 privileged role stays.
9. May the demo walk create rows (shortlist, journey, application) through the real Vidysea UI so the summary has data?
10. Summaries (D-129 item 6): AI-written from the first slice, with the code fact-check and template fallback as drafted? And is
    the D-122 local clearance enough, or do you want the G-llm gate recorded now?
11. Web grounding: on for general questions only, never on student data, labelled "general information". Default on or off?
12. Model: the exact id for "3.5 flash lite" (verified by a models-list probe), the default per role, and whether per-role
    models should be editable in the Admin Console (P1 is env only).
13. Act-on-behalf (P2): is it enough that VC opens the screen and the search URL, with the student pressing every writing
    button? Prefilling the in-portal Explorer needs a Vidysea frontend change; allowed as a local host patch under G-host?
14. Knowledge-graph storage (P3): a new `kind` in `source_artifacts`, or the `edges` collection of ARCHITECTURE H3?
15. User types: are U1-U6 right (spec table), and is "which rows exist" an acceptable way to tell them apart? Should the
    counsellor-assigned (premium) student be a separate type?
16. Pathlynks tools stay out of this slice and the legacy `/roadmap` API stays unlisted. Confirm.
