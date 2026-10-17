# P1 plan-gate drafts v3 - fresh read-only review

Reviewer: p1-v3-reviewer. Date: 2026-10-17. Scope: qa/evidence/p1-plan-draft-20261017/{intent,user-types,spec,plan}.md vs D-083/D-084/D-085 (docs/DECISIONS.md:759-799), qa/contracts/counselling-engine.md, ARCHITECTURE.md, code at HEAD, D:/KnowledgeBase (read only). Drafts not edited.

## VERDICT: REVISE

The D-084/D-085 answers are faithfully reflected. The drafts are not ready for the PLAN gate: several acceptance criteria cannot be proved the way they are written, three of them collide with existing contracts (B2, B6, B13, B21) without saying so, and A15 does not close its own privacy claim. Everything below is fixable in the drafts; none needs new research.

Checks run (all read-only): file/symbol existence for every path cited in plan.md section 1; grep of all four drafts for removed items; read of B1/B2/B6/B13/B21/B22 in qa/contracts/counselling-engine.md; read of KnowledgeBase routes, AGENTS.md, docs/DECISIONS.md presence; spot check of 14 oct15_3 line cites (all 14 correct). No tests were run (this is a document review).

## Check 1 - D-084/D-085 reflected, nothing removed survives: PASS with notes
- D-084 (Pathlynks first, API only, chat + live voice, Hindi labels out): intent.md:17-18,32,54; spec.md:6,17; user-types.md:52. Reflected.
- D-085 (Gemini Live, worldwide, anonymous pre-consent, KB in KnowledgeBase): intent.md:18-19,21-26,28-29; spec.md:6-8,36; plan.md rows U1-U3, U7, U9. Reflected.
- Grep for STT, TTS, speech-to-text, Whisper, LiveKit, WebRTC, avatar, pilot, Hindi label, chat page, login: no surviving requirement. Only negations (non-goals) and plan.md:12, which names LiveKit ideas as "not used".
- N1 (note) plan.md:31 U14 "tiny demo of both endpoints in apps/web" is new UI work. D-084 says apps/web gets no further investment. Not a contradiction, but it is the one place a UI creeps back. Fix: mark U14 optional and require a one-line Umesh yes, or delete it; it is correctly outside the DoD at plan.md:49.
- N2 (note) spec.md:23 and :42 test only Hindi/Hinglish as the non-English set. The CEO asks for "any language" (intent.md:11 premise; oct15_3:290-292). Fix: say plainly that A2/A10/head-to-head cover English + Hindi/Hinglish only, and which other languages are claimed untested.

## Check 2 - acceptance criteria testable with a named command/fixture: FAIL (fix needed)
Every "Check" cell names a kind of check, not a command or file. The project DoD (.claude/CLAUDE.md) requires "the exact command run". Findings:

F1 (BLOCK) spec.md:22 (A1) and spec.md:11 (scope 6) claim "100% of factual sentences carry a source key ... (citationGuard)". citationGuard (packages/engine/src/guards/citation.ts:23) checks that a CARD has a non-empty valid `sources[]`. It does not parse sentences. Contract B2 (D-020, gate citation-guarantee-scope) says only typed numbers and fixed country/alias vocabulary auto-verify; every other text fact is kept and flagged, not proved. A "factual sentence" detector does not exist, so A1 is not testable and over-claims versus B2. Fix: restate A1 at the level the guard can prove (structured answer = list of claims, each with a source id; 100% of claims have a resolvable source; numbers and country names verified against the page text), define the answer schema, and name the contract amendment if the umbrella "every sentence" claim is kept.

F2 (BLOCK) spec.md:11, spec.md:24 (A3), plan.md:23 U6, plan.md:18 U1: the no-quote rule depends on `quote_permission: granted`. Grep of packages/, apps/, mcp/ finds no `quote_permission` field anywhere, and U1's page schema does not list it. A3 ("0 responses name a counsellor ... 200 adversarial prompts") also needs a name list or speaker field to scan against, which is not specified, and a negative over a sample proves little. Fix: add `quote_permission` and `speakers[]` to the U1 page schema; A3 = deterministic guard test (any `speakers[]` name without permission is stripped, tested exhaustively on fixtures) plus the 200-prompt scan as secondary evidence; name the fixture file.

F3 (BLOCK) spec.md:25 (A4), :22, :24, :35 and the reuse in plan.md:23: every offline test must use the Mock provider (B8, spec.md:47). With a mock model, A1/A3/A4/A16 prove guard plumbing only, not model behaviour ("0 training-data answers in 30 probes" cannot fail with a mock). The real-model proof is the head-to-head run (U13), which needs paid provider calls, and no draft lists a paid-provider gate for it (plan.md:30 gates only partner exposure). Fix: label each criterion MOCK-PROVEN or REAL-PROVEN, and add an explicit Umesh gate for the real-model runs (cost ceiling, synthetic inputs only, B13).

F4 (WARN) spec.md:29 (A8) "skipped with reason if no provider" and spec.md:31 (A10) "skipped with an honest note if not approved", plus plan.md:49 DoD "A10 ... or reported as not run". A criterion that may be skipped is not an acceptance criterion, and the DoD lets P1 be "done" with no real voice validation. See F9.

F5 (WARN) spec.md:22,23,35,38 name no command. Fix: add a column "Command" with the real invocation (for example `pnpm --filter @vc/engine test`, `pnpm typecheck`, a named `packages/engine/evals/*.ts` runner) or `NEW: <path>` for scripts that must be written, so the checker can re-run them. The "Trace script", "Eval script", "Schema test" cells are placeholders.

F6 (WARN) spec.md:23 (A2) and plan.md:20 (U3): the 60-question golden set is written by the same team that writes the pages. Circular: hit@3 >= 0.95 then measures consistency, not coverage of real student questions. Also unspecified: which repo runs the eval (VC or KnowledgeBase), and whether against a live KB or a frozen fixture. A17 (spec.md:38) "reproducible from the KnowledgeBase data" needs the same answer. Fix: golden questions drawn from real Pathlynks/WhatsApp question logs (anonymised) or authored by someone other than the page author; state frozen-fixture vs live.

F7 (WARN) spec.md:35 (A14) and :44: threshold 85% is [ASSUMPTION] and there is no unit for the human work on the critical path: experts writing 60 answers, judges scoring. Fix: add a unit (owner, hours) or fold into U13 with a named owner; it is a release gate (D-083).

## Check 3 - units, dependencies, sibling edits (D-001): PARTIAL
F8 (BLOCK) plan.md:18 U1 and plan.md:23 U3 edit D:/KnowledgeBase, a read-only sibling under H6/D-001. The draft says "needs the owner's approval" (plan.md:11,41; user-types.md:64 Q10). Verified fact the draft misses: D:/KnowledgeBase is a Lab Protocol repo (AGENTS.md "Lab Protocol active", docs/DECISIONS.md exists) with Umesh as Approver. So Q10 "who approves" is already answered; what is missing is that the change needs a KnowledgeBase-side DECISIONS entry and that repo's maker-checker path, and that U1 must name the exact existing files it extends (routes/search.ts pattern is cited; no target files are named). Also, the draft claims "no curated-page store". KnowledgeBase does have `session_pages` (routes/brain.ts), and routes/pages.ts is only a browser UI, so the claim holds, but the plan should say why session_pages is not reused. Fix: rewrite Q10 as "approve KnowledgeBase change set X under its own protocol", list the target files, and note the cross-repo ordering.

F9 (BLOCK) plan.md:34 Wave 1 and plan.md:22 U5: "Partner developers can build against U5" while the contract is still open on Q1 (consent claim shape), Q4 (voice guards) and Q5 (WS audio format, limits). The WS event schema depends on those. Publishing it to partners is also partner exposure, which plan.md:46 and intent.md:51 say needs a gate. Fix: split U5 into an internal draft contract and a gated "publish to partners" step after Q1/Q4/Q5 are answered.

F10 (WARN) plan.md:34-36: Wave 1 starts U1/U4/U5 but all three depend on U0 (a human gate that is not in any wave). Add "Wave 0 = U0 (PLAN approval, Q1/Q10/Q14 minimum)" so the critical path is honest.

F11 (WARN) Missing dependencies/units:
- Where the student profile comes from. spec.md:9 (A16) ranks against "approved profile facts", but facts in packages/db/src/facts.ts are scribe output approved by a counsellor. A self-serve student has no counsellor to approve, and bulk student import is a non-goal (intent.md:55). Nothing in U1-U14 creates or approves profile facts for the P1 flow. This is a real design gap and also a missing grill question (see Check 6, new Q15).
- Who verifies the minor-consent claim (A7, spec.md:28). No unit owns it. Put it in U8 and list the dependency on Q1.
- Gap-count storage (spec.md:8,25,38; plan.md:28 U11). Writing "one gap count" per unanswered question is a write. Where (virtual_counsellor DB, or KnowledgeBase `gaps`, which would be a sibling write)? It also conflicts with anonymous mode (see F12).
- plan.md:6 names `packages/engine/src/scribe/*` as holding the guards. Wrong path: guards are in `packages/engine/src/guards/` (citation.ts, no-script.ts, crisis.ts, escalation.ts, concern-classifier.ts). Fix the path; spec.md:47 "student graph beside packages/engine/src/scribe/" should be checked against it too.
- plan.md:27 U10: a WebSocket needs a dependency (apps/api has no `ws` and a hand-rolled ROUTES server at server.ts:283/626). Say so; a new dependency needs the usual approval.

F12 (WARN) Contract collisions the drafts do not list. plan.md:17 U0 lists B22 -> head-to-head, "no quote", API contract, "anonymous stores nothing". Also needed (all critical-class edits, checker-owned):
- B21 "every request carries a JWT ... missing token gets 401" vs the public anonymous routes (user-types.md:9, plan.md:24).
- B13 "only synthetic or anonymised text reaches Gemini or any external API" vs a production product that sends real minors' text and voice to Gemini (see F14).
- B6 "hard rules live in code guards that run before any LLM call" vs voice (see F13).
- B21 "knowledge ... over POST /ask" vs new page/coverage tools (plan.md:19 U2).
- B1 scope for a student-facing VC (Q2 already asks).

## Check 4 - A15 proves zero persistence: NOT YET
spec.md:36 (A15) is a good start (write spy, count snapshot, 50 turns, log/trace capture) but does not close the claim.

F13a (BLOCK) Own requirements contradict A15. spec.md:25 (A4) and spec.md:8 require "one gap count" for an out-of-KB question; user-types.md:91 repeats it; plan.md:28 U11 counts unanswered questions. In anonymous mode that is a write, and A15 demands 0 writes in any collection. Q7 (user-types.md:61) asks about an aggregate counter but the spec already assumes one. Fix: A4 says gap count only in consented mode; anonymous either writes nothing or Umesh explicitly allows a text-free aggregate counter and A15 whitelists exactly that.

F13b (BLOCK) Rate limiting (plan.md:24 U7) for unauthenticated calls needs per-IP state, which is stored data (even in memory, and any store is a write). A15 does not mention it. Fix: define permitted ephemeral state (in-memory, no text, TTL) as an explicit, tested exception, or move limiting to the edge and say so.

F13c (WARN) "Stores nothing" is only about VC storage. Anonymous questions (and, for voice, minors' audio) still go to Gemini/LiteLLM, and the KnowledgeBase `POST /ask` call receives the user's text. Provider-side retention, KnowledgeBase-side logging, and server/proxy access logs are not covered by A15, which only inspects the test harness. The claim shown to partners/students must be "VC persists nothing", with the provider and KnowledgeBase handling stated and checked (KnowledgeBase ask path: verify no session/log write).

F13d (WARN) A15 strength. The spy proves only exercised paths. Stronger and cheap: construct the anonymous handler with no Db, checkpointer, outbox or tracer injected at all (undefined or a throwing proxy), so a hidden write path fails the build. Also run the 50 turns with the real compiled route, not only the graph, and include a user turn carrying PII (name, school) to show it is not echoed to logs/errors.

F13e (WARN) "Personal vs generic" classification (spec.md:36, user-types.md:10-12) is undefined. Misclassifying a personal question as generic is a privacy failure; the fixture set for A15 must include borderline cases and name the classifier (rule or model; if a model, it sees student text).

## Check 5 - Gemini Live post-hoc guard risk: stated, but not honestly gated
Good: plan.md:40, user-types.md:58 (Q4) and plan.md:26 U9 do say text guards cannot block native audio before it is spoken, and "needs Umesh's acceptance". Gaps:

F14 (BLOCK) The risk is stated as a question to Umesh (Q4) but nothing downstream is gated on the answer. plan.md:26 U9 lists Q4 as a dependency, yet spec.md:30-32 (A9-A11) and plan.md:49 DoD assume the mitigation is acceptable. A11 ("crisis phrases ... reach the existing escalation path") is only mock-tested (A9) or checked on one phrase in the gated A10. Missing: a latency bound (how much audio may play after the user says a crisis phrase; Hindi/Hinglish transcription is asynchronous and error-prone), a count of crisis fixtures run against real audio, and a statement that A1 (citations) and A3 (no counsellor named) are NOT enforced for voice, only audited after the fact (a spoken breach cannot be unsaid). The system instruction "forbids speech outside tool results" (plan.md:26) is a soft prompt rule; B6 (contract) says hard rules live in code guards before generation, so voice needs a contract amendment, not just a mitigation. Fix: (a) add to risks that voice cannot meet B2/B1/crisis hard rules pre-send; (b) require A10 to PASS (not "skipped") before the voice endpoint is enabled for any real student, with a crisis-set size and a max-audio-after-trigger number; (c) state in the DoD that voice may ship disabled if A10 is not run; (d) put the options to Umesh in Q4 with cost: native audio + monitoring (D-085, as drafted) versus delaying voice behind text.

F15 (BLOCK) Real student audio to Google is a production design fact, not just a test-run concern. intent.md:45 treats "real-audio runs" as the gated item. B13 (contract) bans real student text to any external model; production use of Gemini Live and Gemini text for minors is the whole product. Anonymous mode (D-085 item 3) processes minors' text/voice with no consent claim at all, in tension with "consent first" (oct15_3:8-10, which intent.md:29 cites in support). Fix: add a gate/question for the production data-processing basis (provider terms, retention, India DPDP minors' rules, who signs) and a contract B13 amendment, before any real-user exposure. The draft should not imply only the A10 test run is the external-data event.

## Check 6 - the 14 open grill questions
Real decisions only Umesh/CEO can make (keep): Q1 consent claim (with Pathlynks), Q2 B1 scope for student-facing, Q3 ranking objective and advice vs comparison, Q4 voice guards, Q5 voice limits/cost (partly engineering, cost ceiling is a decision), Q6 head-to-head experts/threshold/public challenge, Q7 anonymous crisis and counters, Q8 quote permission definition, Q9 content licence, Q11 crisis launch acceptability and whether wiring is a "crisis-behaviour change" (D-083).

Answerable or partly answerable from the docs - tighten or drop:
- Q10 (user-types.md:64): approver is already Umesh in both repos (KnowledgeBase AGENTS.md). The open item is the change set and KB-side process (F8). Reword.
- Q12 (user-types.md:66): "API keys or JWT only" is answered by B21 (JWT issued by client backend, no password store, tenantId stamped). Keep only: one tenant per partner? sandbox yes/no? (and the anonymous-route exception to B21, F12).
- Q13 (user-types.md:67): D-083 already says renamed Counsellor Assist, separate secondary track on the same engine. Residual: owner/roadmap only.
- Q14 (user-types.md:68): not a grill question; contract amendments are checker-owned with human approval for critical edits (see the 2026-09-26 critical B21/B22 entries). Move to U0 as a gate, plus the extra amendments in F12.
- Q11 first half: D-083 already says "current crisis notify-counsellor behaviour stays in force"; keep only the new-endpoint question and, importantly, what happens for a Pathlynks student with no connected counsellor, while delivery is record-only (H9, ARCHITECTURE.md line 49). That is a launch blocker for crisis, not just a wiring question.

Missing real decisions (add):
- Q15 Where do student profile facts come from, and who approves them, for a self-serve student with no counsellor (F11). Bulk import is a non-goal.
- Q16 Production data-processing basis for minors' text/voice with Gemini and any anonymous processing (F15).
- Q17 Who authors worldwide pages and who owns page quality per region at what capacity (plan.md:42 says most countries start as gaps); also who writes the 60 expert answers (Q6 only partly covers).
- Q18 Cost ceiling and budget for the real-model head-to-head and voice runs (F3).

## Smaller notes
- N3 intent.md:58 lists 7 open questions; user-types.md lists 14; spec.md refers to Q1, Q4, Q6, Q9, Q10 correctly. Fine, but after Q15-18 are added, keep intent.md:58-59 in sync.
- N4 spec.md:9 cites H2 for "numbers come from KB, not the LLM". H2 says this about FitScorer only; fine, but the P1 ranking is a new component, so cite it as a requirement, not as existing behaviour.
- N5 plan.md:30 U13 "sandbox ... to Pathlynks developers (outward-facing)" correctly gated; keep.
- N6 All 14 oct15_3 line cites I sampled match the transcript (for example :46-47, :51-61, :155-182, :290-292).

## Required to move to APPROVE
1. Resolve F1, F2, F3 (criteria testable and honest about mock vs real).
2. Resolve F8, F9, F14, F15 (sibling change set, partner exposure, voice gating, production data basis).
3. Resolve F13a-b (A15 consistent with A4/rate limits), add F13d.
4. Update Check 6 questions (add Q15-18, trim Q10/12/13/14).
5. List the contract amendments in F12 in U0.
