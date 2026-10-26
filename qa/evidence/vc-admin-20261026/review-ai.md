# AI review - vc-admin-control (ai-engineer, read-only, HEAD 914a61d)
VERDICT: Warning (no Block: no isolation, G6 or crisis-ordering breach found; one routing-precision defect should be fixed before Pathlynks goes live)

Scope read: student/graph.ts, student/classify.ts, tools/navigate.ts, ingest/routes.ts, skills/vc-navigation + vc-capabilities, chat.ts:567 wiring, tests pathlynks-tools/navigate. Probe: classifyIntent run on 12 sample asks via node (no files written in repo).

## Holds (verified)
- Crisis-first: gate -> crisis -> route -> tool (graph.ts:839-846); crisis node returns before route. A model-screen "possible" is applied in finish (graph.ts:826-833) and replaces the reply.
- Student isolation: port only gets verified `input.auth.studentId` (graph.ts:858-875); anonymous refused twice (route graph.ts:803, tool). Tenant gate: pathlynks/navCatalogue handed only when tenantId === pathlynksTenantId (chat.ts:567-573). Timeout race, throw, non-ok, wrong shape all collapse to the fixed line, error reported text-free (graph.ts:858-912).
- G6: replies are built from an ALLOW-LIST (graph.ts:244-258 rowLine), scalar only, 120 chars; rows never reach a model (reply goes straight to finish; screen sees only the student's text). No LLM-side prompt injection surface from Pathlynks row content or repo-derived routes by construction.
- navigate.ts: output comes only from catalogue paths that pass SAFE_ROUTE; intent only scores (navigate.ts:28-38, 91-126). ingest/routes.ts strips groups, drops api/_private/@slots/intercepting.
- Manifest: STUDENT_TOOLS (19 rows) == vc-capabilities tables, both tables, and a drift test exists.

## Findings
1. WARNING (high confidence, probed): intent rules hijack ordinary KB questions into navigate_steps / pathlynks_assessment. classify.ts:120 (navigate_steps: `(where|how).{0,30}(i|we).{0,20}(find|see...).{0,60}(page|site|website|portal|app|link...)`; `(which|what) (page|section...)`) and classify.ts:123 (assessment ... score/results; `have I ... take ... test`). Probe results, all wrongly non-search_kb:
   - "Where can I find the official website of University of Toronto?" -> navigate_steps
   - "where can I find the application portal for TU Munich" -> navigate_steps
   - "How do I find scholarships on the DAAD website" -> navigate_steps
   - "what section should I highlight in my statement of purpose" -> navigate_steps
   - "which page lists the visa requirements for Australia" -> navigate_steps
   - "what is the IELTS assessment score needed for UK universities" -> pathlynks_assessment
   - "have I got to take a test for admission to Canada" -> pathlynks_assessment
   Effect: the student gets "I don't know that page yet" or "I don't see an assessment on your Pathlynks account" instead of a sourced KB answer; core study-abroad questions (university websites, application portals) are exactly the ones hit. It also fires for every authenticated tenant, not only Pathlynks: a non-Pathlynks tenant has no port/catalogue, so the same asks return "I can't see your Pathlynks data right now" / "I don't know that page yet" (graph.ts:858-865, 918-930). Existing negative tests are 3 cases only (pathlynks-tools.test.ts:111-113).
   Fix (simplest): (a) in navigateTool, when the catalogue gives no route, fall through to the KB answer path instead of the fixed text, or at least require a host-site cue (the tenant is Pathlynks or the message names a Pathlynks surface: "my", "pathlynks", "dashboard", "settings", "saved", "compare"); (b) do not register the five rules for tenants with no port/catalogue; (c) tighten rule 123 to `my`/`I` + assessment and drop bare "score|results" without "my"; (d) add the cases above as search_kb negatives.
2. WARNING (high confidence): `namesAnotherStudent` (graph.ts:223-236) lacks he / she / they, though the classifier itself routes on them (classify.ts:121 `careers.{0,30}(i|we|he|she|they|student ..)`). "what careers did she save" -> pathlynks_saved_careers -> the student's OWN list under "Your saved careers on Pathlynks:". Not a leak (own data only), but a wrong, misleading answer; the fail-closed comment overstates it. Add `\b(he|she|they)\b` or reword the answer ("I can only show your own").
3. LOW (probed): the same function over-refuses on the `student|user|child|kid + word` clause (graph.ts:231): "show my saved careers, I am a student interested in design" and "what careers did I save as a student like me" match and are refused with the other-student line. Fail-closed, so acceptable; narrow the clause to an id-shaped token (digits, `stu-`, uuid) once the id format is known. Also any 5+ digit number refuses (`\b\d{5,}\b`).
4. LOW: catalogue ignores `group` metadata, so admin/internal pages (e.g. a route in an `(admin)` group, or `/admin/...`) can be offered to a student ("where is the admin page"). Route names are client-visible, so low risk; filter `group` matching admin/internal or an `/admin` prefix in usableRoutes (navigate.ts:74) if the Pathlynks repo has them. Dynamic routes surface as literal `/careers/[id]` text (navigate.ts:120); suggest dropping dynamic leaf steps.
5. LOW: skills/vc-capabilities/SKILL.md:54 and vc-navigation SKILL.md:19 say "no tool is called" on distress. True for the offline guard; for a model-screen "possible" (LK5) the Pathlynks read has already run in parallel and only the reply is replaced (graph.ts:826-833). Data is not shown, but wording over-claims; also the port is hit once for a distressed student. Fix the wording or run the screen before the tool.
6. LOW: single visible column shows bare value ("Your Pathlynks profile: 11", graph.ts:262) - ambiguous; keep the label for records. Tool replies are English-only regardless of replyLang (same as existing TOOL_MESSAGES).
7. GAP (eval): no test pins the G6 allow-list (grep for phone/email/guardian in pathlynks-tools.test.ts: none). A column added to the allow-list set silently ships.

## Evaluation to add (frozen, execution-based, /outcome-grader rubric lines)
- Routing set, >= 60 asks (20 per intent group, >= 30 KB negatives incl. the 7 above, Hinglish variants): `classifyIntent` equals expected; PASS = 0 KB negatives routed to a Pathlynks/navigate tool.
- G6 fixture: rows with phone, email, dob, guardian_name, address, tenant_id, password_hash -> reply contains none; PASS = none of the fixture strings appear.
- Isolation: 2-student fake, 20 phrasings (he/she/they, names, ids, uuid) -> port never called with another id; "she/he/they" cases must not read "Your ...".
- Hostile catalogue/row text (instruction strings, markdown links, long values) -> output equals allow-listed bounded text only.
- Crisis x each of 5 tools, offline guard and screen "possible": reply is the fixed crisis message.

## Open questions
- Does the web/widget render message text as plain text (row values and route paths are untrusted strings)? Not in this review's scope; confirm no HTML/markdown injection.
- Spec S6 says unknown -> "I don't know that page yet"; is falling through to KB on an empty route match an acceptable spec change (decisions entry needed)?
