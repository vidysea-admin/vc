# Manifest — p1-grounding-hardening
**Contract:** qa/contracts/counselling-engine.md (student chat reply behaviour) criteria H1 H2 H3 H4 H5 H6 H7 of the brief; brief qa/evidence/p1-briefs/p1-grounding-hardening.md; sources of the findings: qa/evidence/p1-briefs/p1-nosource-grounded-ai-review-result.md (W1-W4, W6, W7) and qa/verdicts/p1-nosource-grounded.md. W5 (Search Suggestions / searchEntryPoint) is out of scope.
**Goal task:** none
**Date:** 2026-10-22
**Fix cycle:** 0 of max 2
**Dual check:** no
**Persona walk:** skip (no screen, navigation or flow added; reply text and startup/config behaviour only)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** one build unit inside one worktree (D:/vc/.worktrees/p1-grounding-hardening, branch wave/p1-grounding-hardening, base 3772f4a), built to the orchestrator's brief.

## What changed
- packages/engine/src/student/lang.ts — H1 new exported `redactStudentDetails` (self-introduced names in "I am X / my name is X / main X hoon" in any case, ages, school/college/Vidyalaya/DPS names, street addresses, 6-digit PINs, DOB in numeric and "4 March 2008" forms, ids). H4 `isOutOfScopeQuestion`: injection rule needs an instruction noun (so "credit transfer rules" and "override" survive), Devanagari and Hinglish injection and creative requests added, `bomb-proof` allowed, "break into" split from hack/crack with a career-vocabulary lookahead, the fake-document rule replaced by `isFraudRequest` (create/forge requests decline; awareness, consequence and spotting questions pass). H5 `hasBareDomain`: "daad. de" is caught (dot, spaces, known TLD); "cities.it depends" and "etc.in Germany" are not (abbreviation labels and prose followers).
- packages/engine/src/student/graph.ts — `webQuestion` calls `redactStudentDetails` (the `/iu` name regex, which let `\p{Lu}` match lowercase words, is gone; link, e-mail, phone and speaker redaction unchanged). H3: `noAnswer` replies carry an internal `noSourceReply` marker; `finish` keeps the plain refusal (or topic decline) when the screen verdict is `basis: "unavailable"` and still reports `safety_screen`; the inline anonymous `no_source` branch does the same with no grounded or guidance call. A classified "possible" is the crisis message exactly as before; crisisGuard hits untouched; the marker is stripped before the result leaves.
- packages/providers/src/index.ts — H6 `GroundingBudget` (+ `GroundingBudgetError`, `loadGroundingBudget`): per caller key and per UTC day caps, `VC_GROUNDING_MAX_PER_SESSION` (default 5) and `VC_GROUNDING_MAX_PER_DAY` (default 500), optional spend hook, bounded key map, malformed value is a `GroundingConfigError`. `loadGroundedAnswerer` rejects a non-flash `VC_GROUNDING_MODEL` (thinkingBudget 0 is only set and proven for flash models).
- apps/api/src/index.ts — H2: with grounding on, `startApi` throws `GroundingConfigError` (before connecting) when the anonymous route's screen provider is the rules provider, when `chat.safetyScreen` is false, or when the chat screen provider is the rules provider. H6: builds one `GroundingBudget` from env, spend wired to the existing `chainGuard.beforeRequest` (notional USD 0.035 per grounded call) when a text chain exists, passed to the anonymous route and chat. apps/api/src/anonymous.ts and chat.ts — optional `groundingBudget` dep; the key (anonymous client key, chat tenant|student|thread) travels in an AsyncLocalStorage so the shared graph deps stay shared; the `GroundedAnswerRequest` shape is unchanged (the G1 key-set test still holds).
- Tests (fake providers only, no network): engine lang (H1 helper, H4, H5) and student-graph (H1 wire, H3, H4 both paths incl. frozen Devanagari/Hinglish), providers index (model rejection, budget, loader), api anonymous-route (H2 combos, H6 caps, spend refusal, malformed env), chat-profile (H2 chat combos), chat (H6 per thread). One existing test updated in place: student-graph "G5: a screen that errors on an anonymous no-source turn" now expects the plain refusal (H3 supersedes the old crisis wording for that case; the authenticated/sourced fail-closed tests are unchanged).
- not changed on purpose: crisisGuard order, LK10 crisis wording (byte-identical), the openapi spec (diff empty), the A20 gate, `.claude/**`, contracts, DECISIONS, QUEUE, W5.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Tier: L — privacy (outbound redaction, screen outage behaviour) plus config/flags (startup refusal, caps); ai-engineer and senior-software-engineer reviews were NOT run by the maker (writer never reviews own output); the orchestrator dispatches them.
Round: 12 source and test files, 7 criteria, est 90 min — the criteria share graph.ts/lang.ts and the grounding wiring, so they ship as one round.
slow-plan: the round cannot be smaller; H1, H3 and H4 all pass through noAnswer/webQuestion in graph.ts and the guards in lang.ts, and H2/H6 share the startApi grounding wiring.
Owners: engine-student (lang.ts, graph.ts, engine tests), providers (index.ts), api-surface (index/anonymous/chat, api tests)
SERIAL: every test file waits on the shared test lock (one file at a time; anonymous-route and chat-profile hang when run in full, so each ran once to the hang point and again as targeted nodes)
Base / checked state: base 3772f4a; code commit 00a671a (clean tree when the Pre-check lines ran)
Gate answers: H3 (plain refusal on a screen outage) is an [ASSUMPTION] in the brief that Umesh may override. No gate file touched.
Affected tests / full-suite trigger: all 43 engine, 6 providers and 8 schemas test files and 15 api test files (plus chat, anonymous-route, chat-profile, student-openapi, anonymous-zero-persistence, index, server) were run one file at a time: 72 files, 2061 tests, 0 failures in the sweep; no monorepo-wide single run.
Tests[H1]: packages/engine/tests/student-graph.test.ts::"H1: the outbound body of the grounded call ..." (minor-style introduction incl. phone, e-mail, roll no) and "H1: 'my name is riya and i want to study in germany' ...", packages/engine/tests/lang.test.ts::"H1: ..." (3 tests), "review F6" unchanged and green — the wire body of the grounded call is the only outbound seam; the helper tests pin each detail form and the lowercase-word over-redaction
Tests[H2]: apps/api/tests/anonymous-route.test.ts::"H2: ..." (rules provider with and without VC_ANONYMOUS_SAFETY_SCREEN and with a text chain refuses; no grounding still starts; classifier provider starts), apps/api/tests/chat-profile.test.ts::"H2: ..." (safetyScreen false over model and rules, rules base, rules screen provider refuse; own classifier screen starts) — each unscreened combination must fail at startApi before connecting, and the screened ones must still start
Tests[H3]: packages/engine/tests/student-graph.test.ts::"H3: ..." (anonymous no_source, anonymous: true, authenticated outage keep the refusal with no grounded/guidance call and safety_screen reported; topic decline kept on outage; KB-answered turn still crisis on outage; classified possible and crisisGuard hits unchanged) and the updated "G5 ..." test — the outage branch exists on three screen configurations and the crisis paths must stay unchanged
Tests[H4]: packages/engine/tests/lang.test.ts::"H4: ..." (2 tests), packages/engine/tests/student-graph.test.ts::"H4 (grounded path)", "H4 (model-only path)" (7 genuine questions answered, anonymous not declined) and the two "frozen" tests (Devanagari injection and Hinglish "mujhe poem likh do" declined with no model call even when the fake model would answer) — both directions of the floor on both answer paths, plus the frozen non-English abuse cases
Tests[H5]: packages/engine/tests/lang.test.ts::"H5: the bare-domain guard catches 'daad. de' ..." and the existing G3 tests — the guard change is lexical and lives wholly in hasBareDomain
Tests[H6]: packages/providers/tests/index.test.ts::"H6: ..." (4 tests: non-flash model refused, session/day caps, UTC rollover and spend refusal, env defaults and malformed values), apps/api/tests/anonymous-route.test.ts::"H6: ..." (per client cap, per day cap, spend refusal, startApi malformed env and non-flash model), apps/api/tests/chat.test.ts::"H6 (API): ..." (per thread cap, new thread grounded again) — caps are enforced by the budget class and wired in three places (startApi, anonymous, chat)
Tests[H7]: all existing engine, providers, schemas and api files listed above; apps/api/tests/student-openapi.test.ts (10/10, the openapi parity test; the spec file has no diff); tsc --noEmit in providers, schemas, engine, apps/api, apps/web — regression guard: every existing file that imports the changed modules, plus the openapi parity test
Sibling: apps/api/src/voice* (reuses runStudentTurn) — voice, voice-wiring, voice-audit, voice-crisis-turn, voice-history, voice-limits all green
Falsification[H1]: graph.ts `webQuestion` redactStudentDetails replaced by identity (in place on the committed tree, restored with git checkout) -> student-graph 3 fail (both new H1 tests and review F6), 108 pass; restored, green
Falsification[H2]: index.ts H2 block disabled (`false && grounding`) -> anonymous-route "H2" 1 fail and chat-profile "H2" 1 fail; restored, green
Falsification[H3]: graph.ts `finish` outage exception forced on (`if (true)`) -> student-graph 2 fail (H3 outage tests), 109 pass; restored, green
Falsification[H4]: lang.ts `isOutOfScopeQuestion` also declines /fake|backlog|forged|credit transfer/ -> lang.test 1 fail (H4 genuine) and student-graph 2 fail (H4 grounded and model-only); restored, green
Falsification[H5]: lang.ts `hasBareDomain` without the `DOT_THEN_SPACE_RE` replace -> lang.test "H5" 1 fail; restored, green
Falsification[H6]: providers per-session cap disabled -> index.test "H6: GroundingBudget caps" 1 fail; non-flash model check disabled -> index.test "H6: a non-flash ..." 1 fail; each restored, green
Falsification[H7]: graph.ts `finish` crisis replacement disabled (`if (false)`) -> student-graph 4 fail (D-110 C1 screen gate, review G5 ordering, H3 x2) and lk5 6 fail (R3 crisis tests); restored, green. H7 is otherwise the absence of regressions (sweep below).
Live sample: none (brief: no live LLM or Gemini calls)
Pre-check[H1]: 00a671a `npx tsx --test tests/student-graph.test.ts` (packages/engine) -> exit 0, 111 passed, 0 failed blobs=packages/engine/tests/student-graph.test.ts:6ba7b43
Pre-check[H1]: 00a671a `npx tsx --test tests/lang.test.ts` (packages/engine) -> exit 0, 48 passed, 0 failed blobs=packages/engine/tests/lang.test.ts:829eea4
Pre-check[H2]: 00a671a `npx tsx --test --test-name-pattern=H2 tests/anonymous-route.test.ts` (apps/api) -> exit 0, 2 passed, 0 failed blobs=apps/api/tests/anonymous-route.test.ts:fca7302
Pre-check[H2]: 00a671a `npx tsx --test --test-name-pattern="H2|LK7 C1-fix" tests/chat-profile.test.ts` (apps/api) -> exit 0, 6 passed, 0 failed blobs=apps/api/tests/chat-profile.test.ts:05c1bd5
Pre-check[H3]: 00a671a `npx tsx --test tests/student-graph.test.ts` (packages/engine) -> exit 0, 111 passed, 0 failed blobs=packages/engine/tests/student-graph.test.ts:6ba7b43
Pre-check[H3]: 00a671a `npx tsx --test tests/lk5.test.ts` (packages/engine) -> exit 0, 65 passed, 0 failed blobs=packages/engine/tests/lk5.test.ts:734ebf6
Pre-check[H4]: 00a671a `npx tsx --test tests/student-graph.test.ts` (packages/engine) -> exit 0, 111 passed, 0 failed blobs=packages/engine/tests/student-graph.test.ts:6ba7b43
Pre-check[H4]: 00a671a `npx tsx --test tests/lang.test.ts` (packages/engine) -> exit 0, 48 passed, 0 failed blobs=packages/engine/tests/lang.test.ts:829eea4
Pre-check[H5]: 00a671a `npx tsx --test tests/lang.test.ts` (packages/engine) -> exit 0, 48 passed, 0 failed blobs=packages/engine/tests/lang.test.ts:829eea4
Pre-check[H6]: 00a671a `npx tsx --test tests/index.test.ts` (packages/providers) -> exit 0, 26 passed, 0 failed blobs=packages/providers/tests/index.test.ts:8b64194
Pre-check[H6]: 00a671a `npx tsx --test --test-name-pattern=H6 tests/anonymous-route.test.ts` (apps/api) -> exit 0, 3 passed, 0 failed blobs=apps/api/tests/anonymous-route.test.ts:fca7302
Pre-check[H6]: 00a671a `npx tsx --test tests/chat.test.ts` (apps/api) -> exit 1, 34 passed, 1 failed (baseline red "A20 flag on but gate closed", not this change; the new "H6 (API)" test is among the 34) blobs=apps/api/tests/chat.test.ts:a462a2b
Pre-check[H7]: 00a671a `npx tsx --test tests/student-openapi.test.ts` (apps/api) -> exit 0, 10 passed, 0 failed blobs=apps/api/tests/student-openapi.test.ts:a103dd7
Pre-check[H7]: 00a671a regression sweep, one file at a time, 43 engine + 6 providers + 8 schemas + 15 api files -> every file exit 0, 2061 passed, 0 failed (72 files)
mutant-cap-raise: one isolated semantic mutation per criterion H1 to H7 plus a second for H6 (model check), run in place on the committed tree with `git checkout` restoring the byte-exact original after each run (script outside the repo).
Metrics: start=2026-10-22T00:21:19+05:30 end=2026-10-22T01:10:19+05:30 wall_min=49 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=3 mutations=9 cycle=0 resumes=1 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=0 mutants=9 defects_unit=4 defects_6c=0

## How to verify (commands + expected)
- packages/engine: `npx tsx --test tests/student-graph.test.ts` -> 111 pass; `tests/lang.test.ts` -> 48 pass; `tests/lk5.test.ts` -> 65 pass
- packages/providers: `npx tsx --test tests/index.test.ts` -> 26 pass
- apps/api: `tests/anonymous-zero-persistence.test.ts` -> 36 pass; `tests/student-openapi.test.ts` -> 10 pass; `tests/index.test.ts` -> 8 pass; `tests/server.test.ts` -> 34 pass; `tests/chat.test.ts` -> 34 pass, 1 baseline red
- apps/api targeted (these two files hang in full): `--test-name-pattern="H2|H6" tests/anonymous-route.test.ts` -> 5 pass; `--test-name-pattern="H2|LK7 C1-fix" tests/chat-profile.test.ts` -> 6 pass
- `npx tsc --noEmit` in packages/providers, schemas, engine, apps/api and apps/web -> exit 0
- run every file as `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 npx tsx --test <file>`

## Actual outputs (maker's own runs, code commit 00a671a)
- Red first: before the graph.ts edits the new student-graph tests failed 4 (H1 x2, H3 x2) and the H4 tests failed until the lang.ts changes; lang.test failed on the missing export; the providers budget tests were written after the code (budget class landed first) and are proven by the falsification runs instead.
- Sweep (72 files): engine 43, providers 6, schemas 8, api 15 (acceptance-student-journey, acceptance-trace, chat-privacy, chat-rank, alerts, voice-wiring, student-auth, go-live-gate, voice, voice-audit, voice-crisis-turn, voice-history, voice-limits, auth, main) -> all exit 0, 2061 passed, 0 failed.
- Also run: student-graph 111/111, lang 48/48, lk5 65/65, providers index 26/26, anonymous-zero-persistence 36/36, student-openapi 10/10, api index 8/8, server 34/34, chat 34/35.
- Baseline reds (real repo qa/gates are open, so the "gate closed" tests fail; none of this change touches qa/gates): chat.test "A20 flag on but gate closed" (1); anonymous-route "A20 state ON but gate closed ..." and "startApi: flag on with the real repo gates refuses to start, BEFORE connecting to Mongo" (2, seen in the file run that hangs after 31 tests, 29 pass); chat-profile "startApi: flag on with the real repo gates refuses to start, BEFORE connecting to Mongo" (1, 46 of 47 pass before the hang).
- tsc --noEmit: providers, schemas, engine, apps/api, apps/web exit 0.

## Independent reviews
Not run by the maker. The orchestrator should dispatch senior-software-engineer (all code) and ai-engineer (redaction, floor and screen behaviour).

## Open risks for the checker
1. H3 is an [ASSUMPTION] (brief): on a screen outage a no-source turn shows the plain fixed refusal, not the crisis message. A real crisis phrase is still caught by crisisGuard (first, unchanged) and a classified "possible" is still the crisis message. A student in distress whose message the offline guard misses and whose classifier call fails sees an ordinary refusal; Umesh may override.
2. H2 is enforced at the startApi composition root only, not inside the graph (existing graph tests use `grounding` without a screen). Code that builds the graph directly can still run grounding with no screen.
3. H6 "per session": the anonymous route is stateless with no session id, so its key is the client key (IP based, the same as the rate limiter); behind a shared NAT many students share five calls. Caps and the per-key map live in memory per process (reset on restart and per replica). The spend charge is a notional USD 0.035 per grounded call reserved against the chain monthly cap (no refund, no usage report for the grounded request), and only exists when VC_TEXT_CHAIN is set.
4. Redaction is a deterministic floor: unusual name forms, schools without a school word, or addresses without a street word can still pass; ordinary text is preserved on purpose. The degree-year heuristic redacts 4-digit birth years 1970-2019 only with a born/dob context or a full date.
5. H4 rules remain regex; "break into" and fraud wording were tuned on the review's examples and the brief's list; the false-positive/injection eval set suggested by the AI review beyond those is not run. An anonymous turn whose wording the sign-in classifier treats as personal ("my backlogs", "how do I ...") is redirected to sign in before the floor is reached, so those questions are exercised authenticated.
6. A topic-declined anonymous no-source turn still skips the screen (unchanged). W5 searchEntryPoint is out of scope. Worktree files are CRLF; mixed endings in edited files are harmless.
7. The old G5 test (anonymous screen error -> crisis message) was changed in place to the H3 behaviour; the checker should confirm that intent.

## Live browser evidence
None: no UI change.

## Status: ready-for-check
