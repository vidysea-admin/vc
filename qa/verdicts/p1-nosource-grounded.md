# Verdict — p1-nosource-grounded (cycle 0)
Cycle checked: 0
Bound to: D:/vc/.worktrees/p1-nosource-grounded, head caa02d1 (code 6a501bd), base 8d0d529. Policy-Version: proportional-verification/2026-10-19.17. Dual check: no (no auth/prod-write trigger).
Checked: 2026-10-22T00:01+05:30 to 00:19+05:30.

## Check plan (step 0)
Logic + prompt + outbound web call + flag/default change + one UI file. Tier raised M -> L (dispatch floor L; cites apps/api/src/index.ts:504 VC_GROUNDING flag and :518-527 default no_source screen when VC_ANONYMOUS_SAFETY_SCREEN is not "true"). Checks: diff-scope read (4c), pre-check re-run one file at a time under the lock, tsc x4, outcome proof (real graph + REAL GeminiGroundedAnswerer with a fake fetch, wire captured), falsification per criterion in copies, Mode D (own headless Chromium against a stub /v1). No live Gemini call made (brief).

## Diff scope (4c)
16 files, +1416/-45, all in the manifest's What changed; none out of scope. One removed test line (an import replaced). No export/route/key deleted. generalGuidance return type changed (string -> GuidanceOutcome); only caller is graph.ts:834 (tsc clean). Crisis texts/LK10 untouched (no hunk in CRISIS_MESSAGES).

## Re-run (my own runs, exit codes real)
engine student-graph 102/102, lang 42/42; providers index 22/22; api anonymous-zero-persistence 36/36, student-openapi 10/10, chat 33/34 (1 = baseline red "A20 flag on but gate closed", B13/D-109), anonymous-route targeted nodes 10/10; tsc --noEmit providers, schemas, engine, api exit 0. Logs: qa/evidence/p1-nosource-grounded-check/*.log

## Outcome proof (qa/evidence/p1-nosource-grounded-check/chk-proof.test.ts.txt, 6/6 pass)
- G1: wire body of the real Gemini class has keys contents/generationConfig/systemInstruction/tools only; no name, DOB, passport, phone, e-mail, link, student/tenant/thread/turn id, API key (header only, not URL); 10 sources offered -> 5, https, no userinfo, titles stripped of < >; message has no URL. Authenticated and anonymous.
- G2: flag off, HTTP 500, throw, hang (abort at expertTimeoutMs), bad JSON, MAX_TOKENS, SAFETY, empty text, link in text, bare domain in text -> exact D-110 message, no sources, no crash; grounded+model both fail -> fixed refusal (auth and anon).
- G3: blocked daad.de, ucas.com/apply, "Visit study-in-germany.de", DAAD.DE, daad[.]de, "daad dot de", studyportals.eu/uk, a@b.co, www., hxxps; allowed e.g., 3.5 GPA / 6.5 IELTS, Ph.D., B.Tech/M.Sc., U.K./U.S., i.e., a.m./p.m., No. 1, Cities.In.
- G4: 3 harmful/off-topic + 4 injection prompts get the fixed decline with zero web and zero guidance calls on grounded and model-only paths (authenticated; anonymous: decline for generic-shaped text, sign-in redirect for first-person-shaped text, never a model call); model-side OUT_OF_SCOPE / inScope:false -> decline; 6 genuine study questions not declined.
- G5: anonymous no_source screen call is first (order screen,web); possible and outage -> ANONYMOUS_CRISIS_MESSAGE with no web call; same ordering for anonymous:true and authenticated; crisis text -> no screen/web call.
- G6: openapi diff additive (Source.url + web enum + summary text); parity test 10/10.

## Falsification (one per criterion, isolated copies, green-before then red-after)
G1 webQuestion returns raw text -> red. G2 grounded text bypasses guardedGuidance -> red. G3 hasExplicitLink skips the bare-domain check -> red. G4 isOutOfScopeQuestion returns false -> red. G5 pre-call screen await + no_source branch removed -> red. G6 drop url from openapi Source -> student-openapi parity red (9/10). Each before-run green in its own copy (mut-g*-before.log / -after.log; scripts mut.sh, mut2.sh).

## Mode D (apps/student/app.js)
Own headless Chromium 390x800 against a stub /v1 serving the worktree page. Grounded reply: 3 https links rendered (javascript: and http: sources filtered out), target=_blank rel="noopener noreferrer", titles containing <script>/<img onerror> shown as inert text (0 injected elements, window.__pwned never set, 0 dialogs), empty title falls back to the URL, link focusable, click opens a popup with window.opener === null. Plain no-source and sourced replies unchanged. Console errors: 0.

## Notes (non-blocking, none burns a cycle)
1. "Write my SOP" / "How do I write a good SOP" are intercepted earlier by the existing coach intent (classify.ts isDraftingRequest, A21a): coaching reply, no web or guidance call, no draft. The fixed decline is not what the student sees for SOP wording; the G4 outcome (no draft, no web call) holds. Orchestrator to accept the G4 wording vs behaviour.
2. The isOutOfScopeQuestion deterministic floor over-blocks some phrasings: "How to make a bomb-proof budget...", "What happens if documents are forged?", "cheat-proof my IELTS preparation" get the decline (PROBEFP lines in proof.log). Low.
3. The live grounding path after the MAX_TOKENS / thinkingBudget fix is NOT confirmed (the maker's single probe returned no sources; the fix is covered by fake-fetch tests, mine included). Needs one approved live probe by the orchestrator. Not a PASS blocker under .15 (deterministic evidence complete).
4. HUMAN decision pending (maker Open risk 1): default anonymous no_source screen also when VC_GROUNDING is off; a classifier error becomes the crisis message. Needs a decisions-log entry; one-line change at apps/api/src/index.ts:524.
5. Not run: chat-profile.test.ts and anonymous-route in full (hang, baseline). Topic-decline wording is an [ASSUMPTION] awaiting Umesh.

VERDICT: PASS
SCOREBOARD: 6/6 criteria met, 0/0 invariants hold
TIER: L (flag + safety-screen default, apps/api/src/index.ts:504,518-527)
FAILURES: none
CAPABILITY-COVERAGE: 6/6 rows reproduced (own copies)
LIVE-BROWSER: qa/evidence/browser-p1-nosource-grounded-2026-10-22-checker/
ISSUES-WRITTEN: none
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: All six criteria hold on independent evidence through the real graph with the real Gemini REST class on a fake fetch; falsifications go red and the browser check is clean. Open items are the live probe, the default-screen decision and the SOP-wording nuance, none of which fails a criterion.
Metrics: start=2026-10-22T00:01:21+05:30 end=2026-10-22T00:20:00+05:30 wall_min=19 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=6 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1120 mutants=0 defects_unit=0 defects_6c=0
