# Manifest — p1-nosource-grounded
**Contract:** qa/contracts/counselling-engine.md (student chat reply behaviour) criteria G1 G2 G3 G4 G5 G6 of the brief; decision D-110 (model-only expert answer) extended by Umesh's approval of Gemini grounding (B13 signed, Gemini is a listed processor); brief qa/evidence/p1-briefs/p1-nosource-grounded.md
**Goal task:** none
**Date:** 2026-10-21
**Fix cycle:** 0 of max 2
**Dual check:** no
**Persona walk:** skip (reply text, sources field and one link row on the existing student page; no screen, navigation or flow added; the page change is not browser-verified, see Live browser evidence)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** one build unit inside one worktree (D:/vc/.worktrees/p1-nosource-grounded, branch wave/p1-nosource-grounded, base 8d0d529), built to the orchestrator's brief.

## What changed
- packages/providers/src/index.ts — `GeminiGroundedAnswerer` (plain REST `fetch` to `models/{model}:generateContent` with the `google_search` tool: no SDK exists in this repo, `GeminiProvider` there is a not-wired stub and live.ts is compile-only, so adding one fetch call was the smaller change), `MockGroundedAnswerer`, `sanitizeGroundingSources` (https only, no userinfo, unique, max 5, cleaned titles), `loadGroundedAnswerer(env)` (`VC_GROUNDING` unset/off = off, exactly `gemini` needs `GEMINI_API_KEY`, anything else is a startup error). Key only in the `x-goog-api-key` header; own timeout kept armed until the body is read; only a `STOP` finish is accepted; flash models get `thinkingBudget: 0`; `maxOutputTokens` 2048.
- packages/schemas/src/student-api.ts — `Source` kind `web` with an optional https `url` (a `web` source must carry a url, others must not). apps/api/src/openapi.ts — `Source.url` and the turn summary text.
- packages/engine/src/student/lang.ts — G3 `hasExplicitLink` now also catches bare domains (`daad.de`, `ucas.com/apply`, `daad[.]de`, `daad dot de`, `daad . de`, `daad。de`, host plus path with any TLD), while `B.Tech`, `U.K.`, `Ph.D.`, `e.g.`, `6.5`, `cities.In Germany` stay allowed. G4 `isOutOfScopeQuestion` (deterministic screen for injection, extraction, harmful, adult, fraud, homework, creative writing, SOP/essay-writing requests; yes/no and wh- questions and how-to advice are exempt), fixed `topicDecline` text, `GENERAL_GUIDANCE_PROMPT` / `GROUNDED_GUIDANCE_PROMPT` with the scope line, `groundedGuidance()`.
- packages/engine/src/student/graph.ts — `noAnswer` now: count the gap (unchanged), G4 decline with no model call, G5 screen verdict first, then `expertGuidance` (grounded first, redacted question only, then the unchanged D-110 `generalGuidance`), every model-written text through `guardedGuidance`. Grounding links become `web:N` sources. `safetyScreen.anonymous` may be `"no_source"`.
- apps/api/src/{chat,anonymous,index}.ts — pass `grounding` through; `index.ts` builds it from `VC_GROUNDING` and gives the anonymous route a `no_source` screen by default (see Open risks 1). apps/student/app.js — renders `web` sources as links (DOM calls, https only, `noopener noreferrer`).
- Tests (fake providers only): added to engine student-graph and lang, providers index, api anonymous-zero-persistence, chat and anonymous-route.
- not changed on purpose: crisisGuard order, LK10 crisis wording (byte-identical, asserted), the A20 gate, `.claude/**`, contracts, DECISIONS, QUEUE.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Tier: M — multi-file behaviour, prompt text, an outbound web call and a safety-screen ordering change; ai-engineer and senior-software-engineer reviews ran (findings below).
Round: 15 source and test files, 6 criteria, est 120 min — one graph function (noAnswer) and one guard module carry all six criteria, so they cannot be split without leaving contradictory tests.
slow-plan: the round cannot be smaller; G1 to G5 all pass through noAnswer/expertGuidance in graph.ts and the guards in lang.ts.
Owners: engine-student (lang.ts, graph.ts, engine tests), providers (index.ts), api-surface (chat/anonymous/index/openapi, api tests), student-web (app.js)
SERIAL: every test file waits on the shared test lock (one file at a time; anonymous-route and chat-profile hang when run in full, so only targeted nodes of anonymous-route ran)
Base / checked state: base 8d0d529; code commit 6a501bd (clean tree when the Pre-check lines ran)
Gate answers: Umesh approved Gemini grounding and folding in review findings W1-W4 (brief). B13 signed, Gemini is a listed processor. A20 gate untouched.
Affected tests / full-suite trigger: all 43 engine test files, all 6 provider and 8 schema test files, 20 api test files and 10 targeted anonymous-route nodes were run one file at a time. chat-profile.test.ts was NOT run (brief: it hangs). No monorepo-wide single run.
Tests[G1]: packages/engine/tests/student-graph.test.ts::"G1: ..." (authenticated, anonymous, redacted wire contents, sources re-check) and "review F6", apps/api/tests/anonymous-zero-persistence.test.ts::"G1 (API)", apps/api/tests/chat.test.ts::"G1 (API)", packages/providers/tests/index.test.ts::"grounded Gemini: ..." (header key, sources, STOP-only, stalled body) — disclaimer plus grounded answer, only the redacted question on the wire, web sources structured and never inline
Tests[G2]: packages/engine/tests/student-graph.test.ts::"G2: ..." (flag unset, error, timeout, empty, guard-failing, both paths failing, flagged-thread wording), "review F4", "review F9", apps/api/tests/anonymous-zero-persistence.test.ts::"G2 (API)", apps/api/tests/anonymous-route.test.ts::"G1: VC_GROUNDING ... startup error" — fallback to D-110 unchanged, never a crash
Tests[G3]: packages/engine/tests/lang.test.ts::"G3: ..." (blocked list, allowed list) and "review F5" — bare domains and evasions blocked, degrees and abbreviations allowed
Tests[G4]: packages/engine/tests/lang.test.ts::"G4: ..." and "review F1-F3" (both directions), packages/engine/tests/student-graph.test.ts::"G4: ..." (3 off-topic/harmful and 3 injection on both the grounded and the model-only path)
Tests[G5]: packages/engine/tests/student-graph.test.ts::"G5: ..." (no_source scope, fail-closed, scope limits, crisis first) and "review G5 ordering" (anonymous: true and authenticated), apps/api/tests/anonymous-zero-persistence.test.ts::"G5 (API)", apps/api/tests/anonymous-route.test.ts::"G5: ..." (scope mapping and the default startApi screen)
Tests[G6]: all engine, providers, schemas and listed api test files; apps/api/tests/student-openapi.test.ts (openapi parity); tsc --noEmit in providers, schemas, engine, apps/api, apps/web
Sibling: apps/api/src/voice* (voice path reuses runStudentTurn) — voice.test, voice-wiring, voice-audit, voice-crisis-turn, voice-history, voice-limits all green
Falsification[G1]: graph.ts `if (false && deps.grounding)` -> student-graph "^G1" 4 fail (0 pass); restored, green
Falsification[G2]: graph.ts fallback skipped when grounding is set -> student-graph "^G2" 1 fail (3 pass); restored, green
Falsification[G3]: lang.ts `hasExplicitLink` ends with `return false` instead of the bare-domain check -> lang.test "G3" 1 fail; restored, green
Falsification[G4]: lang.ts `isOutOfScopeQuestion` returns false -> student-graph "G4" 2 fail (8 pass); restored, green
Falsification[G5]: graph.ts pre-call no_source screen disabled -> student-graph "^G5" 3 fail (2 pass); `index.ts` default no_source screen removed -> anonymous-route "G5: by default" 1 fail; the await of the in-flight screen removed in noAnswer -> student-graph "review G5 ordering" 1 fail; each restored, green
Falsification[G6]: G6 is the absence of regressions (suite and tsc runs below); no isolating mutation applies. A regression would show as a red node in the listed existing files, none did apart from the 4 baseline reds.
Live sample: 1 probe, see Live checks. Result: the call worked but was cut off at the token limit and returned no sources; fixed in code and covered by fake-fetch tests, NOT re-probed (the brief allows one).
Pre-check[G1]: 6a501bd `npx tsx --test tests/student-graph.test.ts` (packages/engine) -> exit 0, 102 passed, 0 failed blobs=packages/engine/tests/student-graph.test.ts:5ab26ff
Pre-check[G1]: 6a501bd `npx tsx --test tests/index.test.ts` (packages/providers) -> exit 0, 22 passed, 0 failed blobs=packages/providers/tests/index.test.ts:3c5c635
Pre-check[G1]: 6a501bd `npx tsx --test tests/anonymous-zero-persistence.test.ts` (apps/api) -> exit 0, 36 passed, 0 failed blobs=apps/api/tests/anonymous-zero-persistence.test.ts:5490fc9
Pre-check[G2]: 6a501bd `npx tsx --test tests/student-graph.test.ts` (packages/engine) -> exit 0, 102 passed, 0 failed blobs=packages/engine/tests/student-graph.test.ts:5ab26ff
Pre-check[G3]: 6a501bd `npx tsx --test tests/lang.test.ts` (packages/engine) -> exit 0, 42 passed, 0 failed blobs=packages/engine/tests/lang.test.ts:b2ca697
Pre-check[G4]: 6a501bd `npx tsx --test tests/student-graph.test.ts tests/lang.test.ts` (packages/engine) -> exit 0, 144 passed, 0 failed blobs=packages/engine/tests/student-graph.test.ts:5ab26ff,packages/engine/tests/lang.test.ts:b2ca697
Pre-check[G5]: 6a501bd `npx tsx --test --test-name-pattern "G5|G1 \(API\)|G2 \(API\)|G1: VC_GROUNDING|LK7|LK1w|LK5" tests/anonymous-route.test.ts` (apps/api) -> exit 0, 10 passed, 0 failed blobs=apps/api/tests/anonymous-route.test.ts:ef22f6e
Pre-check[G5]: 6a501bd `npx tsx --test tests/student-graph.test.ts` (packages/engine) -> exit 0, 102 passed, 0 failed blobs=packages/engine/tests/student-graph.test.ts:5ab26ff
Pre-check[G6]: 6a501bd `npx tsx --test tests/student-openapi.test.ts` (apps/api) -> exit 0, 10 passed, 0 failed blobs=apps/api/tests/student-openapi.test.ts:a103dd7
Pre-check[G6]: 6a501bd `npx tsx --test tests/chat.test.ts` (apps/api) -> exit 1, 33 passed, 1 failed (baseline red "A20 flag on but gate closed", B13 signed, not this change) blobs=apps/api/tests/chat.test.ts:fbca7f5
mutant-cap-raise: one isolated semantic mutation per criterion G1 to G5 plus two extra (default screen wiring, screen-await ordering), run in place with the byte-exact original restored after each run.
Metrics: start=2026-10-21T22:58:06+05:30 end=2026-10-21T23:59:01+05:30 wall_min=61 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=3 mutations=8 cycle=0 resumes=1 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=0 mutants=8 defects_unit=9 defects_6c=0

## How to verify (commands + expected)
- `npx tsx --test tests/student-graph.test.ts` then `tests/lang.test.ts` in packages/engine -> 102 pass, 42 pass
- `npx tsx --test tests/index.test.ts` in packages/providers -> 22 pass
- `npx tsx --test tests/anonymous-zero-persistence.test.ts` in apps/api -> 36 pass; `tests/student-openapi.test.ts` -> 10 pass; `tests/chat.test.ts` -> 33 pass, 1 baseline red
- `npx tsx --test --test-name-pattern "G5|G1 \(API\)|G2 \(API\)|G1: VC_GROUNDING|LK7|LK1w|LK5" tests/anonymous-route.test.ts` in apps/api -> 10 pass (do not run the file in full: it hangs)
- `npx tsc --noEmit` in packages/providers, schemas, engine and apps/api -> exit 0

## Actual outputs (maker's own runs, code commit 6a501bd)
- engine: all 43 test files, 0 failures (student-graph 102/102, lang 42/42, lk5 65/65, crisis-defaults 19/19, guard-crisis 618/618, b18-suppression-outcome 126 tests, 81 pass, 0 fail (rest skipped by the file)). providers: 6 files 0 failures (index 22/22). schemas: 8 files 0 failures.
- api: anonymous-zero-persistence 36/36, student-openapi 10/10, acceptance-student-journey 3/3, acceptance-trace 4/4, chat-privacy 39/39, chat-rank 13/13, index 8/8, main 10/10, server 34/34, alerts 14/14, voice-wiring 16/16, student-auth 11/11, go-live-gate 13 pass / 0 fail (1 skipped), voice 67/67, voice-audit 6/6, voice-crisis-turn 14/14, voice-history 8/8, voice-limits 10/10, auth 15/15, chat 33/34.
- Baseline reds (B13 signed, not this change): chat.test "A20 flag on but gate closed" (seen); anonymous-route (2) and chat-profile (1) were NOT run in full because the brief says they hang, so those three were not observed.
- tsc --noEmit: providers, schemas, engine, apps/api exit 0 (apps/web ran clean earlier, before the review fixes; no change since to anything it imports).
- `node --check apps/student/app.js` exit 0.

## Independent reviews run before this hand-off (fresh context, read-only)
- senior-software-engineer: Block on (1) G5 ordering when the screen is on for every cleared turn or for authenticated turns (the verdict was only awaited in `finish`, after the web call) — FIXED: `noAnswer` awaits the in-flight screen first, test "review G5 ordering", mutation caught; (2) default no_source screen even with grounding off — KEPT, see Open risks 1; (3) double 20 s timeout — FIXED: grounded call capped at 12 s; (4) body-read timer — FIXED: the timer stays armed until the body is parsed, stalled-body test.
- ai-engineer: Warning on over-blocking (rules/guidelines, "write an essay" questions, "you are now", degrees in explosives, drug test) — FIXED and tested in both directions; OUT_OF_SCOPE spelling variants — FIXED; bare-domain evasions — FIXED; PII in the web question — partly FIXED (self-introduced names, dates of birth, ID numbers; a deterministic floor only); citation marks — FIXED; non-STOP finish reasons — FIXED. Not done: a 30-prompt live injection eval and the 40-question false-positive eval (needs a live budget the brief does not give).

## Live checks (Gemini grounding, key read from D:/vc/.env, no value printed)
- 1 probe, synthetic question "What is the typical cost of a student hostel in Lisbon per month?", model gemini-2.5-flash, 6479 ms, HTTP ok. Result: 223 chars of plain prose without any link (the link guard said false), BUT the text stopped mid-sentence ("...with some options potentially") and `sources` was empty. Diagnosis: `maxOutputTokens` was 700 and thinking tokens count against it, so the reply hit MAX_TOKENS before it finished (the grounding metadata comes with the finished candidate). Fix: limit 2048, `thinkingBudget: 0` on flash models, and a non-STOP finish is now a failure that falls back to the model-only path. These fixes are covered by fake-fetch tests only; they were NOT re-probed because the brief allows one live probe. The checker or orchestrator should run one more probe (or approve one) to confirm that sources now arrive.

## Open risks for the checker
1. Default behaviour change: with the anonymous route on, a non-rules provider and `VC_ANONYMOUS_SAFETY_SCREEN` not `true`, a no-source anonymous turn is now safety-screened first (brief G5/W3). If the classifier errors, that turn becomes the fixed crisis message (fail closed), also when `VC_GROUNDING` is off. The senior review wanted this tied to grounding only. Needs Umesh's call (decisions-log entry); one-line change at apps/api/src/index.ts where `scope: "no_source"` is set.
2. The live grounding path is unconfirmed after the fix (see Live checks). Grounding links are Google redirect URLs (`vertexaisearch.cloud.google.com/grounding-api-redirect/...`); the link title is the source site name.
3. The topic decline wording is an [ASSUMPTION] awaiting Umesh's vetting; English only (Hindi turns get the English decline, like the disclaimer).
4. G4 deterministic rules are a floor, tuned on the review's examples; the false-positive and injection evals suggested by the ai-engineer review were not run. Web question redaction is deterministic and partial (free text can still hold a personal detail); on a Gemini failure the fallback sends the raw text to the model chain exactly as D-110 did.
5. Worst case without a grounded answer is about 32 s (12 s grounded cap plus the 20 s model-only fallback).
6. anonymous-route.test.ts and chat-profile.test.ts were not run in full (they hang); only targeted anonymous-route nodes ran. `isOutOfScopeQuestion` also applies when grounding is off (D-110 path), as G4 asks.
7. The working-tree files in this repo are CRLF; edits may show mixed endings in graph.ts and student-api.ts (harmless under autocrlf).

## Live browser evidence
UI-touching: apps/student/app.js now renders `web` sources as links under a no-source reply. Not exercised in a browser here (`node --check` only, and the DOM code is the same createElement/textContent pattern as the rest of the file). The checker should load the student page against a stubbed response with one `web` source.

## Status: ready-for-check
