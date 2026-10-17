# p1-u2-kb-tools independent check

Cycle checked: 1
Policy-Version: proportional-verification/2026-10-15.12
VERDICT: PASS

CHECK-PLAN: whole-unit diff 38e751d..61dabdc (plus manifest/evidence commit 4f04409); every criterion in the manifest (A4/G6 serve rule, A15c anonymous profile, A18, A22 tagger, plus the six cycle-1 repairs) proved at the MCP tool boundary with an independent test file (inline stub-fetch bodies, not the builder fixtures), then one falsification per criterion in a copy.
Risk floor: M (single package `mcp/university-kb`, no auth/tenancy/production-write path). No contract file exists for P1 yet (U0 amendments pending), so criteria are the spec v8 rows (A4, A15c, A18, A22, G1, G6) cited in the manifest.
Lane: normal.
CHECKED-STATE: worktree p1/u2 HEAD 4f04409 (clean before this verdict); code identical to 61dabdc. Independent work was done in a copy `scratchpad/u2chk` (node_modules linked); the worktree source was never mutated.

SCOREBOARD:
- Package suite (builder claim re-run by checker): `bash D:/vc/scripts/vc-testlock.sh pnpm -C <S>/p1-u2/mcp/university-kb test` -> 72 tests, 72 pass, 0 fail (twice). `... typecheck` -> exit 0.
- Independent tool-boundary suite `qa/evidence/p1-u2-kb-tools/checker-cycle1/chk.test.ts` (27 tests): 26 pass, 1 fail. The one failure is the latent edge described in PROPOSED-ISSUE 1 (not reachable through the real client). Output: `checker-cycle1/chk-run.txt`.

CRITERIA:
- A4/G6 serve rule: PASS. Called `ask_knowledge_base` through the registered MCP tool. Served only for verdict=="correct" && !insufficient_coverage && !web_used && >=1 internal. Withheld (status no_sourced_answer, fixed text, citations {internal:[],web:[]}, reason "", no answer/reason text anywhere in the serialized result) for: "Correct", "correct " (trailing space), "CORRECT", "incorrect", insufficient_coverage true, web_used true, internal [] with web-only, web_used true plus stray web. Realistic no-coverage body (incorrect, insufficient true, internal [], web []) -> no_sourced_answer, not unavailable. Correct with zero citations -> unavailable.
- A4/A18 outage and malformed: PASS. 503, 401, non-JSON body, JSON null, array body, network throw, missing `web_used`, missing `insufficient_coverage`, `web_used:"false"` (string), `insufficient_coverage:null` -> status unavailable, fixed text, empty citations, no answer/reason leak, `isError` not set. (Missing flags become `unavailable`/invalid_schema rather than `no_sourced_answer`; both are the fixed text with nothing leaked, so the intent holds.)
- A18 web never leaves: PASS. Served answer with stray `sources.web` -> `citations.web == []`.
- Served /ask sourceKind: PASS. Served output carries `sourceKind:"unknown"`.
- Ask query cap: PASS. 1001 chars rejected by the tool before any fetch (wire log empty); 1000 accepted.
- U2 speakerLabel: PASS. Both profiles (full, anonymous): label present for internal-seminar and toc hits only; absent for whatsapp, unlisted-recording (unknown), source missing from /sources, and for every hit when /sources returns 500 (all `unknown`, label text absent from the whole serialized result). `get_session`: label kept for seminar, dropped when config is empty (unknown) and when /sources is down. A WhatsApp source listed in the seminar config stays `whatsapp` with no label.
- U2 id cross-check: PASS. Of 7 hits (matching; turn._id mismatch; session._id mismatch; turn with no _id; turn null; session null; empty turnId) only the matching one is returned, `dropped == 6`. `get_session` with a returned session id different from the requested one -> unavailable; 404 -> unavailableReason not_found.
- A15c anonymous profile: PASS. With a FULL client handed in, `tools/list` is exactly [kb_sources, search_kb]; calls to ask_knowledge_base, get_session, kb_gaps, search_courses and get_course all fail. Recorded wire: only `GET /search?q=...` and `GET /sources`, headers exactly {accept, authorization}, no body, no tenant/student/thread id. `loadAnonymousKbConfigFromEnv` throws without `VC_KB_ANON_API_KEY` (also on blank) and never uses `VC_KB_API_KEY`. Anonymous client object has keys [search, sources] only. Network failure detail does not echo the query or the underlying error text.
- A22 tagger: PASS. `kb_sources` returns only {id, kind} (path/hash/consent absent). whatsapp-batch wins over any config listing; unlisted/undeterminable -> unknown.
- A18 no KB content copies: PASS (scoped as the manifest states). Fixtures under `kb-fixture/` carry `_fixture` markers and synthetic names; diff touches only `mcp/university-kb/**`, `.env.example` (one NAME, no value) and `qa/`. Not a whole-repo scan.

FALSIFICATION (one single-edit mutant per criterion, applied in the copy, restored byte-identical (`diff -r` clean), independent suite RED then):
Falsify[A4 web_used]: delete the web_used withhold -> RED `withheld: web_used`, `withheld: webUsedStray`.
Falsify[A4 verdict]: delete the verdict check -> RED `withheld: Correct` and 4 more.
Falsify[A4 coverage]: delete the insufficient_coverage withhold -> RED `withheld: insufficient`.
Falsify[A4 internal]: delete the no-internal withhold -> RED `withheld: noInternal`.
Falsify[A18 web leak]: return `result.citations` unfiltered -> RED `serve: correct served; web[] stripped`.
Falsify[sourceKind]: drop `sourceKind` from the answered variant -> RED `serve: correct served`.
Falsify[G6 no-coverage]: apply the uncited check to every verdict -> RED `realistic no coverage -> no_sourced_answer not unavailable`.
Falsify[U2-label]: `labelAllowed` always true -> RED 7; and allow whatsapp -> RED 4 (full and anonymous).
Falsify[U2-askcap]: remove `.max(1000)` on the ask query -> RED `ask query cap`.
Falsify[U2-xcheck]: remove the turn clause -> RED `mismatched ids dropped`; remove the session clause -> RED same.
Falsify[A15c ask/session]: drop `profile === "full"` on ask, and on get_session -> RED `anonymous: only 2 tools even with full client`.
Falsify[A15c key]: fall back to VC_KB_API_KEY -> RED same test.
Falsify[A15c redact]: stop redacting the network message on GET -> RED `anonymous network error does not echo query`.
Falsify[A22 whatsapp]: delete the whatsapp-batch branch -> RED 4 (labels tests).
Falsify[A22 fail-closed]: null kind map -> internal-seminar -> RED `labels absent when /sources down` (both profiles).

PROPOSED-ISSUE 1 (low, non-blocking, source-kind.ts `createSourceKindResolver.load`, around line 87-100): if `deps.client.sources()` throws SYNCHRONOUSLY (not a rejected promise), the async IIFE runs its `finally { inflight = null }` before `inflight ??=` assigns, so `inflight` is left pointing at a resolved-null promise forever and a later successful `/sources` is never used (failure cached permanently, contrary to the "failure not cached" claim). Fails closed (everything `unknown`, no label), and the real client's `sources()` is async and returns typed results, so it is unreachable today. Reproducer: `checker-cycle1/chk.test.ts` last test. Fix: assign `inflight` after creating the promise and clear it in a `.finally`, or `await` a wrapped call.
PROPOSED-ISSUE 2 (info, spec/contract amendment, not a defect): the 4th serve clause (>=1 internal source) is stricter than spec G6 as written, which the maker disclosed. A correct, full-coverage, no-web answer carrying only web sources is withheld. Checker accepts it as the safe reading of A18 (web sources never leave) and recommends the spec/contract (U0) say so in one line, so U6 expectations match.

LIMITS (stated, not failures):
- Fixtures are derived from KB route code and types, not recorded from the live KB (no key, KB never started). The same tests must be re-pointed at recorded responses once the scoped key exists (G4). My suite uses stubbed `fetch`, so it also is not live evidence.
- A4 gap-count writes, the claims guard, search-insufficient threshold and A13 staleness belong to U6, not U2.
- No full-repo suite (M tier). `apps/api` T-025 `.env.example` test was not run (deps not installed in this worktree); the change is one added NAME.
- No KB call, paid provider, production DB or push happened in this check. `src/bin.ts` still builds the full profile only (anonymous route is U7).

ISSUES-WRITTEN: none (checker ledger not touched in this dispatch; PROPOSED-ISSUE lines above are for the orchestrator).
Metrics: start=2026-10-17T14:34:37+05:30 end=2026-10-17T14:38:35+05:30 cycle=1 suite_runs=2 independent_tests=27 mutants=17 policy=proportional-verification/2026-10-15.12 lane=normal
