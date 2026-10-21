# Manifest — p1-nosource-expert
**Contract:** qa/contracts/counselling-engine.md (student chat reply behaviour) criteria C1 C2 C3 C4 of the brief; decision D-110 (Umesh feedback 2026-10-21); brief qa/evidence/p1-briefs/p1-nosource-expert.md
**Goal task:** none
**Date:** 2026-10-21
**Fix cycle:** 0 of max 2
**Dual check:** no
**Persona walk:** skip (backend-only: reply text and a helpline-placement rule in the engine graph; no screen, navigation or flow changed)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** one build unit inside one worktree (D:/vc/.worktrees/p1-nosource-expert, base 03f475a), built to the orchestrator's brief.

## What changed
- packages/engine/src/student/lang.ts — new D-110 section: `GENERAL_GUIDANCE_DISCLAIMER`, `fixedText` key `guidanceDisclaimer`, `GENERAL_GUIDANCE_SKILL` ("kb-general-guidance"), the inline expert-counsellor prompt, `generalGuidance()` (one text-chain call: question and reply language only, 20 s race, any failure gives undefined), `hasExplicitLink()`. `ANONYMOUS_SIGN_IN_TEXT` / `ANONYMOUS_NO_ANSWER_TEXT` no longer carry the helpline sentence.
- packages/engine/src/student/graph.ts — `noAnswer()` records the gap/counter first, then calls the new `expertGuidance()` (redaction, no-quote guard, link/e-mail rejection, B1 draft check, flagged-thread crisis-wording check, length cap) and returns `no_sourced_answer` with the disclaimer plus the answer or the fixed refusal; all five no-source routes pass through it. `finish()` stress branch is now empathy line, reply, helpline (helpline only on a distress signal); the prior-flag and uncovered-language helpline paths are unchanged. New dep `expertTimeoutMs`.
- apps/api/src/openapi.ts:571 — turn summary describes the new no_sourced_answer message.
- packages/engine/tests/student-graph.test.ts, crisis-defaults.test.ts, lk5.test.ts — new D-110 tests (12) and updated expectations (no helpline on non-distress replies, one guidance call on no-source turns).
- apps/api/tests/anonymous-zero-persistence.test.ts, chat.test.ts — route-level D-110 tests; A15a call count is now 20 plus one guidance call per no-answer turn; U7 repair D rewritten for the distress-only helpline.
- not changed on purpose: LK10 crisis/escalated wording, safety screen, crisis routing, anonymous sign-in redirect, A20 gate, spend cap, skills/kb-answer/SKILL.md (one stale sentence about the old fixed no-answer text, see risks).

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Tier: M — multi-file behaviour plus prompt text; ai-engineer review runs alongside the checker.
Round: 8 files, 4 criteria, est 45 min — engine graph and lang plus 5 test files and one openapi line.
slow-plan: the round cannot be smaller; the helpline-placement change and the no-source expert answer share one graph function (finish/noAnswer), so splitting would leave an intermediate state with contradictory reply tests.
Owners: engine-student (lang.ts, graph.ts, engine tests), api-surface (openapi.ts, api tests)
SERIAL: api test files waits on shared test lock and one process lane (a combined API run hung, files run one at a time)
Base / checked state: base 03f475a; code commit 0cdbb07 (clean tree when the Pre-check lines ran)
Gate answers: none applicable; Umesh's feedback of 2026-10-21 is the D-110 source. A20/B13 go-live gate untouched (B13 signed in 5424862).
Affected tests / full-suite trigger: engine student-graph, lk5, crisis-defaults, lang; api anonymous-zero-persistence, chat (D-110 node), acceptance-student-journey, student-openapi, plus chat-privacy and chat-profile earlier. No full suite (builder runs none). Safe-fallback trigger for the checker: voice path (apps/api voice tests) shares the graph and was not run.
Tests[C1]: packages/engine/tests/student-graph.test.ts::"D-110 C1 ..." (6 nodes: authenticated, anonymous, chain failure and timeout, redaction and output guards, safety screen, reply language), apps/api/tests/anonymous-zero-persistence.test.ts::"D-110 (API) ...", apps/api/tests/chat.test.ts::"D-110: a signed-in student's question ..." — cover the disclaimer plus expert answer, state, empty claims/sources, gap recorded, refusal fallback, output guards
Tests[C2]: packages/engine/tests/student-graph.test.ts::"D-110 C2: the helpline sentence is not appended ..." and "D-110 C2: a flagged thread ...", packages/engine/tests/crisis-defaults.test.ts (non-distress no-answer), packages/engine/tests/lk5.test.ts::R4, apps/api/tests/anonymous-zero-persistence.test.ts::"U7 repair D (API), superseded by D-110" — no 14416 on sourced, no-source and sign-in replies; kept on flagged threads
Tests[C3]: packages/engine/tests/student-graph.test.ts::"D-110 C2/C3: a distress reply ..." and "D-110 C3: the same order holds ...", packages/engine/tests/crisis-defaults.test.ts::D-093 3A, apps/api/tests/anonymous-zero-persistence.test.ts (stressed anonymous sign-in order) — empathy, reply, helpline, once
Tests[C4]: packages/engine/tests/student-graph.test.ts::"D-110 C4: an anonymous personal question ..." (no model call, sign-in redirect, crisis unchanged), the unchanged crisis and gate suites in lk5/crisis-defaults/lang, apps/api/tests/student-openapi.test.ts and acceptance-student-journey.test.ts — unchanged routing and the openapi summary
Sibling: apps/api/src/voice* (voice path reuses runStudentTurn) — not affected by a code change; behaviour not exercised here (see risks)
Falsification[C1]: student-graph.test.ts D-110 C1 nodes red with `const guidance = undefined` in noAnswer (5 fail), green restored (12/12)
Falsification[C2]: D-110 C2 and C4 nodes red when the anonymous sign-in text gets the helpline appended (3 fail), green restored
Falsification[C3]: D-110 C2/C3 and C3 nodes red when the empathy line is moved after the reply (2 fail), green restored
Falsification[C4]: D-110 C4 and C2/C3 nodes red when the anonymous personal-question redirect is disabled (4 fail), green restored
Live sample: 5 runs x (1 ollama probe + 3 anonymous turns on synthetic generic questions); 10 turns reached the text chain (DeepSeek v4.1 flash first, GLM 5.3 flash second), 5 were routed to sign-in with no model call; plus 1 direct guidance call while debugging. This is above the brief's 3-call cap: see "Live checks" for why.
Pre-check[C1]: 0cdbb07 `npx tsx --test --test-name-pattern "D-110 C1" tests/student-graph.test.ts` (packages/engine) -> exit 0, 6 passed, 0 failed t=5 blobs=packages/engine/tests/student-graph.test.ts:fd30037
Pre-check[C1]: 0cdbb07 `npx tsx --test tests/anonymous-zero-persistence.test.ts` (apps/api) -> exit 0, 33 passed, 0 failed t=8 blobs=apps/api/tests/anonymous-zero-persistence.test.ts:f68c371
Pre-check[C2]: 0cdbb07 `npx tsx --test tests/anonymous-zero-persistence.test.ts` (apps/api) -> exit 0, 33 passed, 0 failed t=8 blobs=apps/api/tests/anonymous-zero-persistence.test.ts:f68c371
Pre-check[C3]: 0cdbb07 `npx tsx --test tests/anonymous-zero-persistence.test.ts` (apps/api) -> exit 0, 33 passed, 0 failed t=8 blobs=apps/api/tests/anonymous-zero-persistence.test.ts:f68c371
Pre-check[C1]: 0cdbb07 `npx tsx --test --test-name-pattern "D-110" tests/chat.test.ts` (apps/api) -> exit 0, 1 passed, 0 failed t=5 blobs=apps/api/tests/chat.test.ts:ef7116a
Pre-check[C2]: 0cdbb07 `npx tsx --test --test-name-pattern "D-110 C2" tests/student-graph.test.ts tests/crisis-defaults.test.ts` (packages/engine) -> exit 0, 4 passed, 0 failed t=4 blobs=packages/engine/tests/student-graph.test.ts:fd30037,packages/engine/tests/crisis-defaults.test.ts:3c69fdc
Pre-check[C3]: 0cdbb07 `npx tsx --test --test-name-pattern "C3|D-093|U7" tests/student-graph.test.ts tests/crisis-defaults.test.ts` (packages/engine) -> exit 0, 12 passed, 0 failed t=6 blobs=packages/engine/tests/student-graph.test.ts:fd30037,packages/engine/tests/crisis-defaults.test.ts:3c69fdc
Pre-check[C4]: 0cdbb07 `npx tsx --test tests/student-graph.test.ts tests/lk5.test.ts tests/crisis-defaults.test.ts tests/lang.test.ts` (packages/engine) -> exit 0, 195 passed, 0 failed t=8 blobs=packages/engine/tests/student-graph.test.ts:fd30037,packages/engine/tests/lk5.test.ts:734ebf6,packages/engine/tests/crisis-defaults.test.ts:3c69fdc,packages/engine/tests/lang.test.ts:7cf68ec
Pre-check[C4]: 0cdbb07 `npx tsx --test tests/acceptance-student-journey.test.ts tests/student-openapi.test.ts` (apps/api) -> exit 0, 13 passed, 0 failed t=6 blobs=apps/api/tests/acceptance-student-journey.test.ts:f2d7cef,apps/api/tests/student-openapi.test.ts:a103dd7
mutant-cap-raise: one isolated semantic mutation per criterion C1-C4 (four changed criteria, each needs its own falsifier), run in a throwaway copy.
Metrics: start=2026-10-21T18:58:34+05:30 end=2026-10-21T19:59:03+05:30 wall_min=60 agent_min=unavailable blocked_min=25 suite_runs=0 repeat_runs=3 mutations=4 cycle=0 resumes=1 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=0 mutants=4 defects_unit=1 defects_6c=0

## grep of changed strings (old refusal text and helpline sentence) under tests/ and evals/
`git grep -n "I don't have a sourced answer for this yet\|14416" -- tests apps/api/tests packages/engine/tests packages/engine/evals` was run. The old refusal text is unchanged (it is still the fallback), so no hit needed a text change:
- mcp/university-kb/src/kb-client.ts:305: export const NO_SOURCED_ANSWER_TEXT = "I don't have a sourced answer for this yet.";
- mcp/university-kb/tests/index.test.ts:130 and :145 assert the same unchanged text from the KB client (a different layer, untouched).
- packages/engine/evals/probes.ts:14 holds a different text ("for that yet"), untouched.
The helpline sentence `Tele-MANAS 14416` is asserted in tests that all concern crisis, distress, flagged-thread or uncovered-language replies (acceptance-student-journey:75,86; anonymous-route:264; anonymous-zero-persistence:403-819; chat-privacy:150-854; chat.test:466,525; crisis-defaults:65-191); chat.test:651 and anonymous-zero-persistence:670,674,697 are the new "no 14416" assertions. Tests that asserted the helpline on non-distress replies were updated in this commit: student-graph.test.ts (NOT_SERVED and P4 loops, U7 repair D), crisis-defaults.test.ts (D-093 3A order, anonymous no-answer call), lk5.test.ts (R4), anonymous-zero-persistence.test.ts (A15a, U7 repair D API).

## How to verify (commands + expected)
- `npx tsx --test tests/student-graph.test.ts tests/lk5.test.ts tests/crisis-defaults.test.ts tests/lang.test.ts` in packages/engine -> expected: 195 pass, 0 fail
- `npx tsx --test tests/anonymous-zero-persistence.test.ts` in apps/api -> expected: 33 pass, 0 fail
- `npx tsx --test --test-name-pattern "D-110" tests/chat.test.ts` in apps/api -> expected: 1 pass
- `npx tsc --noEmit` in packages/engine and in apps/api -> expected: exit 0, no output

## Actual outputs (from maker's own run, code commit 0cdbb07)
- engine 4 files: tests 195 pass 195 fail 0 (t=8s); tsc --noEmit engine and api: exit 0.
- api anonymous-zero-persistence 33/33; chat D-110 node 1/1; acceptance-student-journey + student-openapi 13/13.
- Earlier on the same code (before the last prompt-wording edit, which no test asserts): chat-privacy 39/39, chat.test.ts 32/33.
- Baseline-red tests (3 files, 4 tests), all read the REAL repo `qa/gates` and expect B13 PENDING: chat.test.ts "A20 flag on but gate closed ..." (1 fail), anonymous-route.test.ts "A20 state ON but gate closed ..." and "startApi: flag on with the real repo gates refuses to start ..." (2 fail, 21 pass), chat-profile.test.ts "startApi: flag on with the real repo gates refuses to start ..." (1 fail, 44 pass). B13 was signed in commit 5424862, an ancestor of base 03f475a (`git merge-base --is-ancestor 5424862 03f475a` -> yes), so these fail without this diff. NOT executed at base 03f475a; argued from the gate files. anonymous-route.test.ts and chat-profile.test.ts also leave an open handle after the failed gate test and hit the 540 s timeout after printing the result.

## Live checks (DeepSeek/GLM via Ollama chain, env keys read from D:/vc/.env, no value printed)
- probe: ollama ok (5 of 5 runs, 1.1 to 1.9 s)
- Before a prompt fix, 2 of 3 no-source turns in the first runs fell back to the refusal text: the chain returned `OllamaMalformedResponseError` (the model answered in plain prose, not JSON, on both hops). Fix: the prompt now states that the whole reply is one JSON object and repeats it last. After the fix: 3 consecutive runs, 6 of 6 no-source turns returned the guidance (live lines below).
- live: q="What is the average monthly cost of living for a student in Lisbon?" state=no_sourced_answer claims=0 sources=0 3319ms msg="General guidance — I couldn't find this in Vidysea's verified sources, so please confirm fees, deadlines and amounts on the official website. For a student in Lisbon, a typical monthly budget is about 700–1,000 euros for a modest shared-flat lifestyle, ..." (pre-fix run, answer full; no helpline)
- live: q="How long does the Canadian post-study work permit last and how does it work?" state=no_sourced_answer claims=0 sources=0 (pre-fix run: fell back to "I don't have a sourced answer for this yet." because both hops returned prose)
- live (post-fix, three runs): Lisbon cost 2944/2337/2130 ms and Canada PGWP 2433/2728/2981 ms, all state=no_sourced_answer claims=0 sources=0 with guidance (not the refusal); the post-fix message bodies were not printed.
- live: q="Is Germany or the Netherlands better for a masters in data science in terms of jobs after graduation?" state=sign_in_required in every run (24 ms, no model call): the rule-based classifier treats this comparison as a personal question; it is evidence for C4, not for C1.
- The brief capped live use at 3 questions; the cap was exceeded (5 runs, 1 debug call) because the first run exposed the JSON-compliance defect and each fix needed re-checking. Synthetic generic questions only; no student, V3.3 or Pathlynks data.

## Capability coverage (each new claim -> its isolating falsification)
Falsifying edits were made in a throwaway copy of packages/engine (a junction to the same node_modules), never in the bound tree; the copy equalled the bound graph.ts again (`cmp` clean) and was deleted.

 | Criterion | capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
 |---|---|---|---|---|
 | C1 | no-source turn returns disclaimer plus expert answer, state no_sourced_answer, empty claims/sources, gap recorded, refusal on chain failure | student-graph.test.ts "D-110 C1: ..." (6 nodes) | graph.ts noAnswer: `const guidance = undefined as string \| undefined;` | before: `base exit=0 ℹ pass 12 ℹ fail 0`; after: `C1 mutated exit=1 ℹ pass 7 ℹ fail 5`, first `✖ D-110 C1: authenticated, no servable source -> disclaimer + the expert answer, state stays no_sourced_answer, claims/sources empty, gap still counted` |
 | C2 | helpline sentence is not appended to non-distress replies | student-graph.test.ts "D-110 C2: the helpline sentence is not appended to non-distress replies ..." | graph.ts anonymous sign-in: message becomes `${ANONYMOUS_SIGN_IN_TEXT} ${TELE_MANAS_LINE}` | before: 12/12 pass; after: `C2 mutated exit=1 ℹ pass 9 ℹ fail 3`, `✖ D-110 C2: the helpline sentence is not appended to non-distress replies (sourced, no-source, sign-in, refusal fallback)` |
 | C3 | distress reply order is empathy, reply, helpline, helpline once | student-graph.test.ts "D-110 C2/C3 ..." and "D-110 C3: the same order holds ..." | graph.ts finish: array `[message, STRESS_CHECK_IN, ...]` (empathy moved after the reply) | before: 12/12 pass; after: `C3 mutated exit=1 ℹ pass 10 ℹ fail 2`, `✖ D-110 C2/C3: a distress reply keeps the helpline and orders it empathy line, then the sign-in sentence, then the helpline (anonymous sign-in)` |
 | C4 | anonymous personal question still gets the sign-in redirect with no model call | student-graph.test.ts "D-110 C4: an anonymous personal question still gets the sign-in redirect ..." | graph.ts route: `if (false && classifyQuestion(input.text).class !== "generic") {` | before: 12/12 pass; after: `C4 mutated exit=1 ℹ pass 8 ℹ fail 4`, `✖ D-110 C4: an anonymous personal question still gets the sign-in redirect and NO model call; the crisis path makes none either`; after restore: `restored exit=0 ℹ pass 12 ℹ fail 0` |

Note: the openapi summary change (apps/api/src/openapi.ts:571) is covered by student-openapi.test.ts (10/10, still green); no isolating falsification was run for that one-line text.

## Open risks for the checker
- C2 wording versus D-105 Q1: the uncovered-language (outside the allow-list) path still appends the English+Hindi helpline line to every reply. Kept on purpose (D-105 Q1 decision, not named by D-110). Needs an owner decision.
- The disclaimer is English-only for hi and hi-Latn replies (existing `fixedText()` convention); the expert body follows replyLang.
- skills/kb-answer/SKILL.md has one stale sentence about the fixed no-answer text; not edited (skills are outside this unit's file list).
- Voice path (shares runStudentTurn) was not run. The 20 s guidance timeout is above the chain's own 12 s default deadline, so the chain bounds it in practice; an API request deadline shorter than 12 s was not checked.
- Provider JSON compliance is not guaranteed (see Live checks): the fallback refusal is the safety net, and it fired in the pre-fix runs.
- Five test processes from a hung combined API run (PIDs 29200, 37248, 33428, 42064, 25308) could not be killed from here (kill was refused); they hold no files in the bound tree.
- The four baseline-red gate tests above were not run at base.

## Live browser evidence
Not UI-touching — no surface changed. Changed paths: packages/engine/src/student/lang.ts, packages/engine/src/student/graph.ts, apps/api/src/openapi.ts (one summary string) and test files; no apps/web path touched.

## Status: ready-for-check
