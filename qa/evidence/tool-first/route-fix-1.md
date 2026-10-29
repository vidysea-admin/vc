# route-fix-1: routing and reply fixes (2026-10-29)

Lane: route-fix-1 (ai-engineer findings 1-4 and 6, senior findings 3-4, data finding 5, nits). TDD, edited in place. No secret value or student row appears here.

## Results per item (red then green)

| # | Fix | Where | Red | Green |
|---|---|---|---|---|
| 1 | Bounded budget slot (`with/under/within/in/below/upto <1-3 digits>[.dd] lakh(s)/lac(s)/crore(s)/cr/k [budget]`) and up to two `for/in <subject/place>` slots; the budget is matched, never captured, never echoed | `packages/engine/src/tools/navigate.ts:103-105` (V_SLOT, V_BUDGET, V_PLACE) | `RF1-1` route test failed | 3 tests: routing + no echo, KB near-misses stay KB, 5000-char hostile (< 100 ms) |
| 2 | Hinglish and colloquial progress asks: `kahan tak pahuncha/pahunchi`, `mere X dikhao/batao`, bare `next step(s)`, `did/have I apply/applied to any(thing)`, `track my X` | `packages/engine/src/student/classify.ts` (T_VIEW +track, 2 topic rules after `:200`, applications rule, `(?:my )?next steps?`) | `RF1-2` failed | "my/mera" still required; `mera visa reject ho gaya ab kya karu` stays KB; 5000-char hostile test |
| 3 | `ToolRecipe.auth: "public"` wired: `isPublicRecipeAsk` + `navigateSteps(..., {publicOnly})` (`navigate.ts:525,536`); `publicNavigate` / `readNavCatalogue` (`graph.ts:~1537-1556`), route node anonymous branch (`graph.ts:1238`), `navigateTool` anonymous branch (`graph.ts:1563`) | an anonymous "which country should I choose" gets `AI University Finder: ... (/ai-university-finder-study-abroad)` plus steps, counted `answered`; student-auth recipes keep the sign-in / KB path; page missing or catalogue failing falls through | `RF1-3` x3 failed | 3 tests |
| 4 | Fixture `packages/engine/tests/fixtures/student-sections.json` = 40 section keys from the latest `nav_catalogue` for `vidysea-frontend` (Mongo `virtual_counsellor.source_artifacts`, read-only, builtAt 2026-10-29T04:53:40Z). All 15 `SECTION_KEYS` exist, so the `[ASSUMPTION]` tag is dropped (`navigate.ts:70`) | `RF1-4` (also checks every recipe `section`) | failed on the tag | green |
| 5 | `TF-5 (ReDoS)` in `student-classify.test.ts`: absolute 100 ms bound replaced by best-of-3 timing at 200 vs 600 repeats, `long <= 6 * max(short, 2 ms)` (linear ~3x, quadratic ~9x) | n/a (flake fix, cannot be forced red) | green |
| 6 | Filter chosen: `next_due_date` now `MIN(m.end_date) FILTER (WHERE status IS DISTINCT FROM 'Completed' AND m.end_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date)` (IST day, fixes the UTC shift) | `mcp/pathlynks/src/port.ts:620` | `RF1-6` failed with the filter removed, passes restored | "next due" label is now accurate. Separate overdue count NOT added (needs a new column in port, allowed-columns and message; not simple) |
| 7 | Raw newline in template literal replaced by `\n` | `packages/engine/src/scribe/nodes.ts:1339` | `RF1-7` failed | green |
| 8 | Probe frozen: `packages/engine/tests/routing-probe.test.ts` (39 tool asks, 22 KB near-misses), `qa/evidence/tool-first/routing-probe.ts` updated (relative imports, same table) | | | see below |

## Hit rate (frozen probe)

- Review baseline (48 phrasings): 23/30 tool asks routed, 0/12 near-misses stolen.
- Now: **39/39 tool asks routed (100.0%)**, **0/22 KB near-misses stolen**. Pass line (0 stolen, >= 90%) met. `what next` after a KB answer routes to `vidysea_progress` (stateless by design, finding 6).
- Known gap, outside this brief: "I want to see my journey" still reaches `search_kb` ("show my journey" routes).

## Changed expectation (flag)

`student-classify.test.ts:163` expected `best universities for MBA in the UK` to be `search_kb`. Finding 1 / brief item 1 requires `top universities for MBA in Germany` to route, so the bare form now routes; that row now uses the longer KB form (`... with scholarships and a GRE of 320`), which still goes to the KB.

## Commands and results (worktree root `D:\vc\.worktrees\vc-completion`)

| Command | Result |
|---|---|
| `cd packages/engine && npx tsx --test tests/navigate.test.ts tests/student-classify.test.ts tests/pathlynks-tools.test.ts tests/capability-manifest.test.ts tests/student-graph.test.ts tests/student-fact-extractor.test.ts tests/routing-probe.test.ts tests/coach-first.test.ts` | tests 257, pass 257, fail 0 |
| `cd packages/engine && npx tsx --test tests/guard-no-script.test.ts tests/lang.test.ts tests/concern-classifier.test.ts tests/crisis-eval.test.ts tests/index.test.ts` | tests 97, pass 97 |
| `cd mcp/pathlynks && npx tsx --test tests/*.test.ts` | tests 82, pass 81, fail 0, skipped 1 |
| `npx tsc --noEmit` in `packages/engine`, `packages/engine -p evals/tsconfig.json`, `mcp/pathlynks` | clean, no output |
| `npx tsx qa/evidence/tool-first/routing-probe.ts` | `tool asks routed 39/39 (100.0%); KB near-misses stolen 0/22` |

## Open items for the coordinator (outside this lane's edit list)

1. **Manifest flag for item 3.** `STUDENT_TOOLS` `navigate_steps` stays `anonymous: false` (`graph.ts:674`, with a comment) because VA15 (`pathlynks-tools.test.ts`) compares it to the `skills/vc-capabilities/SKILL.md` table (`| navigate_steps | graph | no |`, line ~110) and that file is not in this lane's edit list. To make the manifest reflect the behavior: flip `anonymous` to `true` in `graph.ts`, `no` -> `yes` in SKILL.md, update the row-61 text ("authenticated only" -> "anonymous: AI University Finder only"), and change the `VA13/VA15` and `VA13 anonymous` assertions that pin `navigate_steps` to `false` (`pathlynks-tools.test.ts` ~lines 76 and 391). Needs `/aios-config-auditor` since a skill file changes.
2. `COUNTRIES` slugs (`navigate.ts`, finding 4's second half) are not verified: country pages are dynamic (`/country/[slug]`), so the synced route list cannot confirm the slugs. Only SECTION_KEYS was in the brief.
3. Overdue-milestone count (item 6 optional half) not done.
